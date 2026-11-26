/**
 * Trésorerie et scénarios (forecast lot b) : fonctions pures, sans accès base.
 *
 * Règles (alignées sur l'onglet Trésorerie du Sheet) :
 * - Point de départ = somme des soldes des comptes, à la date de solde la plus récente.
 * - Les charges du mois du solde sont supposées déjà payées : on compte les charges des mois suivants.
 * - Les revenus récurrents sont encaissés en fin de mois : on compte ceux des mois qui finissent après la date du solde.
 * - Une facture non payée est attendue au mois forcé à la main, sinon à son échéance (émise) ou en fin de mois
 *   de facturation + délai (à facturer). Une facture en retard est attendue dans le mois en cours.
 * - Une facture payée après la date du solde compte au mois du paiement ; payée avant, elle est déjà dans le solde.
 * - Le facturé (objectif annuel) et l'encaissé sont toujours calculés séparément.
 */
import { addMonths, monthKey, monthStart, type DealLine } from './forecast.engine.js';

export type InvoiceStatus = 'A_FACTURER' | 'EMISE' | 'PAYEE_PARTIEL' | 'PAYEE' | 'ANNULEE';

export interface InvoiceInput {
  id: string;
  number: string | null;
  label: string;              // client ou libellé
  status: InvoiceStatus;
  amountEur: number;
  paidEur: number;
  plannedBillingMonth: Date | null;
  issuedAt: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
  plannedCashMonth: Date | null; // forcé à la main
  atRisk: boolean;
  paymentDelayDays: number;      // délai du mandat, sinon du client (30 j par défaut)
}

export interface RecurringInput { id: string; label: string; monthlyEur: number; start: Date; end: Date | null }
export interface AccountInput { id: string; name: string; balanceEur: number; balanceDate: Date; active: boolean }
export interface ExpenseInput { id: string; label: string; category: string | null; monthlyEur: number; start: Date; end: Date | null }
export interface OwnerDrawInput { id: string; label: string; amountEur: number; month: Date }

export interface CashInputs {
  today: Date;
  accounts: AccountInput[];
  invoices: InvoiceInput[];
  recurring: RecurringInput[];
  expenses: ExpenseInput[];
  ownerDraws: OwnerDrawInput[];
  deals: DealLine[];
  annualBilledTarget: number | null;
}

export interface ScenarioOptions {
  targetMonth: Date;              // fin de ce mois
  delayInvoiceIds?: string[];     // « si un client paie en retard » : sorties de l'encaissé
  forceDealIds?: string[];        // « avec tel deal signé » : comptés à 100 %
  objectiveEur?: number | null;   // scénario « Objectif »
}

const DAY = 86400000;
const r = (n: number) => Math.round(n);
const monthEnd = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
const sameOrBefore = (a: Date, b: Date) => monthStart(a).getTime() <= monthStart(b).getTime();
const between = (m: Date, from: Date, to: Date) => monthStart(m) >= monthStart(from) && monthStart(m) <= monthStart(to);

function monthsActive(start: Date, end: Date | null, from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let m = monthStart(from); m <= monthStart(to); m = addMonths(m, 1)) {
    if (monthStart(m) >= monthStart(start) && (!end || monthStart(m) <= monthStart(end))) out.push(m);
  }
  return out;
}

/** Date de référence (solde le plus récent) et total des comptes actifs. */
export function balanceOf(accounts: AccountInput[], today: Date): { totalEur: number; date: Date } {
  const act = accounts.filter((a) => a.active);
  if (!act.length) return { totalEur: 0, date: today };
  const date = new Date(Math.max(...act.map((a) => a.balanceDate.getTime())));
  return { totalEur: act.reduce((s, a) => s + a.balanceEur, 0), date };
}

/** Mois de facturation d'une facture (émise : mois d'émission ; à facturer : mois prévu). */
export function invoiceBillingMonth(inv: InvoiceInput, today: Date): Date | null {
  if (inv.status === 'ANNULEE') return null;
  if (inv.issuedAt) return monthStart(inv.issuedAt);
  if (inv.plannedBillingMonth) return monthStart(inv.plannedBillingMonth);
  return inv.status === 'A_FACTURER' ? monthStart(today) : null;
}

export interface ExpectedCash { invoiceId: string; month: Date; amountEur: number; late: boolean; alreadyInBalance: boolean }

/** Quand et combien une facture rapporte en trésorerie, vu depuis la date du solde. */
export function invoiceExpectedCash(inv: InvoiceInput, balanceDate: Date, today: Date): ExpectedCash[] {
  if (inv.status === 'ANNULEE') return [];
  const out: ExpectedCash[] = [];
  const paid = Math.min(inv.paidEur, inv.amountEur);
  if (paid > 0 && inv.paidAt) {
    out.push({ invoiceId: inv.id, month: monthStart(inv.paidAt), amountEur: paid, late: false, alreadyInBalance: inv.paidAt <= balanceDate });
  }
  const remaining = inv.status === 'PAYEE' ? 0 : inv.amountEur - paid;
  if (remaining <= 0) return out;
  let due: Date;
  if (inv.plannedCashMonth) {
    due = monthStart(inv.plannedCashMonth);
  } else if (inv.status === 'A_FACTURER') {
    const bm = invoiceBillingMonth(inv, today) ?? monthStart(today);
    due = monthStart(new Date(monthEnd(bm).getTime() + inv.paymentDelayDays * DAY));
  } else {
    const d = inv.dueAt ?? (inv.issuedAt ? new Date(inv.issuedAt.getTime() + inv.paymentDelayDays * DAY) : today);
    due = monthStart(d);
  }
  const late = !inv.plannedCashMonth && monthStart(due) < monthStart(today);
  out.push({ invoiceId: inv.id, month: late ? monthStart(today) : due, amountEur: remaining, late, alreadyInBalance: false });
  return out;
}

/** Facture en retard : émise, pas entièrement payée, échéance dépassée. */
export function daysLate(inv: InvoiceInput, today: Date): number {
  if (!['EMISE', 'PAYEE_PARTIEL'].includes(inv.status)) return 0;
  const due = inv.dueAt ?? (inv.issuedAt ? new Date(inv.issuedAt.getTime() + inv.paymentDelayDays * DAY) : null);
  if (!due) return 0;
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / DAY));
}

export interface MonthRow {
  month: string;
  billed_invoices_eur: number;  // factures émises ou à facturer ce mois
  billed_recurring_eur: number;
  billed_total_eur: number;
  cash_in_eur: number;          // encaissements attendus (hors ce qui est déjà dans le solde)
  expenses_eur: number;
  owner_draws_eur: number;
  net_eur: number;
}

/** Tableau mois par mois du mois du solde jusqu'à `to` (facturé et encaissé séparés). */
export function monthlyTable(inp: CashInputs, from: Date, to: Date): MonthRow[] {
  const { date: balanceDate } = balanceOf(inp.accounts, inp.today);
  const rows: MonthRow[] = [];
  const cash = inp.invoices.flatMap((i) => invoiceExpectedCash(i, balanceDate, inp.today)).filter((c) => !c.alreadyInBalance);
  for (let m = monthStart(from); m <= monthStart(to); m = addMonths(m, 1)) {
    const key = monthKey(m);
    const billedInv = inp.invoices.reduce((s, i) => {
      const bm = invoiceBillingMonth(i, inp.today);
      return bm && monthKey(bm) === key ? s + i.amountEur : s;
    }, 0);
    const rec = inp.recurring.reduce((s, x) => s + (monthsActive(x.start, x.end, m, m).length ? x.monthlyEur : 0), 0);
    const afterBalance = monthEnd(m) > balanceDate;
    const recCash = afterBalance ? rec : 0;
    const cashInv = cash.filter((c) => monthKey(c.month) === key).reduce((s, c) => s + c.amountEur, 0);
    const chargesCounted = monthStart(m) > monthStart(balanceDate);
    const exp = chargesCounted ? inp.expenses.reduce((s, x) => s + (monthsActive(x.start, x.end, m, m).length ? x.monthlyEur : 0), 0) : 0;
    const draws = sameOrBefore(balanceDate, m) ? inp.ownerDraws.filter((d) => monthKey(d.month) === key).reduce((s, d) => s + d.amountEur, 0) : 0;
    const cashIn = cashInv + recCash;
    rows.push({
      month: key,
      billed_invoices_eur: r(billedInv),
      billed_recurring_eur: r(rec),
      billed_total_eur: r(billedInv + rec),
      cash_in_eur: r(cashIn),
      expenses_eur: r(exp),
      owner_draws_eur: r(draws),
      net_eur: r(cashIn - exp - draws),
    });
  }
  return rows;
}

export interface CountedItem { label: string; amount_eur: number; kind: 'balance' | 'invoice' | 'recurring' | 'expense' | 'owner_draws' | 'deal' | 'pipe' }
export interface Scenario {
  key: 'normal' | 'late_payment' | 'at_risk_excluded' | 'with_deals' | 'objective' | 'horizon';
  label: string;
  cash_eur: number;
  billed_added_eur?: number;
  gap_to_normal_eur?: number;
  counted: string;            // « ce qui est compté », comme dans le Sheet
  items: CountedItem[];
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « décembre 2026 » */
export const frMonth = (d: Date) => `${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ')} €`;

/** Éléments comptés dans la trésorerie de fin de `target` (scénario normal). */
function normalItems(inp: CashInputs, target: Date, excludeInvoiceIds: Set<string>): CountedItem[] {
  const bal = balanceOf(inp.accounts, inp.today);
  const items: CountedItem[] = [{ label: `Trésorerie au ${bal.date.toISOString().slice(0, 10).split('-').reverse().join('/')}`, amount_eur: bal.totalEur, kind: 'balance' }];
  for (const inv of inp.invoices) {
    if (excludeInvoiceIds.has(inv.id)) continue;
    const amt = invoiceExpectedCash(inv, bal.date, inp.today)
      .filter((c) => !c.alreadyInBalance && sameOrBefore(c.month, target))
      .reduce((s, c) => s + c.amountEur, 0);
    if (amt) items.push({ label: inv.number ? `${inv.label} (${inv.number})` : inv.label, amount_eur: r(amt), kind: 'invoice' });
  }
  for (const x of inp.recurring) {
    const n = monthsActive(x.start, x.end, bal.date, target).filter((m) => monthEnd(m) > bal.date).length;
    if (n) items.push({ label: `${x.label} (${n} mois)`, amount_eur: r(n * x.monthlyEur), kind: 'recurring' });
  }
  const firstChargeMonth = addMonths(monthStart(bal.date), 1);
  for (const x of inp.expenses) {
    const n = monthsActive(x.start, x.end, firstChargeMonth, target).length;
    if (n) items.push({ label: `${x.label} (${n} mois)`, amount_eur: -r(n * x.monthlyEur), kind: 'expense' });
  }
  const draws = inp.ownerDraws.filter((d) => between(d.month, bal.date, target)).reduce((s, d) => s + d.amountEur, 0);
  if (draws) items.push({ label: 'Prélèvements dirigeant', amount_eur: -r(draws), kind: 'owner_draws' });
  return items;
}

const sum = (items: CountedItem[]) => r(items.reduce((s, i) => s + i.amount_eur, 0));

function countedText(items: CountedItem[]): string {
  const pos = items.filter((i) => i.kind === 'invoice' || i.kind === 'recurring' || i.kind === 'deal').map((i) => i.label);
  const neg = items.filter((i) => i.kind === 'expense').length;
  const draws = items.some((i) => i.kind === 'owner_draws');
  const parts = [items[0]?.label ?? 'Trésorerie'];
  if (pos.length) parts.push(`plus ${pos.join(', ')}`);
  if (neg) parts.push('moins les charges');
  if (draws) parts.push(neg ? 'et les prélèvements dirigeant' : 'moins les prélèvements dirigeant');
  return parts.join(', ');
}

/** Encaissement d'un deal du pipe compté à 100 % avant la fin de `target`. */
function dealCashBy(d: DealLine, target: Date): number {
  return d.cash.filter((c) => c.month <= monthKey(target)).reduce((s, c) => s + c.amountEur, 0);
}

export function scenarios(inp: CashInputs, opt: ScenarioOptions): Scenario[] {
  const target = monthStart(opt.targetMonth);
  const tLabel = monthKey(target);
  const out: Scenario[] = [];
  const normal = normalItems(inp, target, new Set());
  const normalCash = sum(normal);
  out.push({ key: 'normal', label: 'Normal', cash_eur: normalCash, counted: countedText(normal), items: normal });

  if (opt.delayInvoiceIds?.length) {
    const ids = new Set(opt.delayInvoiceIds);
    const items = normalItems(inp, target, ids);
    const names = inp.invoices.filter((i) => ids.has(i.id)).map((i) => i.number ? `${i.label} (${i.number})` : i.label);
    out.push({
      key: 'late_payment', label: `${names.join(', ')} ${names.length > 1 ? 'paient' : 'paie'} après fin ${frMonth(target)}`, cash_eur: sum(items), gap_to_normal_eur: sum(items) - normalCash,
      counted: `Scénario normal sans ${names.join(', ')}. Ne change rien côté facturé : ne compte que pour le cash en banque`, items,
    });
  }

  const risky = inp.invoices.filter((i) => i.atRisk && i.status !== 'ANNULEE' && i.status !== 'PAYEE');
  if (risky.length) {
    const items = normalItems(inp, target, new Set(risky.map((i) => i.id)));
    out.push({
      key: 'at_risk_excluded', label: 'Sans les factures à risque', cash_eur: sum(items), gap_to_normal_eur: sum(items) - normalCash,
      counted: `Scénario normal sans ${risky.map((i) => i.label).join(', ')}`, items,
    });
  }

  if (opt.forceDealIds?.length) {
    const ids = new Set(opt.forceDealIds);
    const picked = inp.deals.filter((d) => ids.has(d.deal_id));
    const items = [...normal];
    let billed = 0;
    for (const d of picked) {
      const c = dealCashBy(d, target);
      billed += d.billing_month <= tLabel ? d.fee_eur : 0;
      items.push({ label: `${d.company} · ${d.mandate_title}`, amount_eur: r(c), kind: 'deal' });
    }
    out.push({
      key: 'with_deals', label: `Avec ${picked.map((d) => d.company).join(', ')} ${picked.length > 1 ? 'signés' : 'signé'}`, cash_eur: sum(items), billed_added_eur: r(billed),
      gap_to_normal_eur: sum(items) - normalCash,
      counted: `Scénario normal plus ${picked.map((d) => `${d.company} (${fmt(d.fee_eur)} facturé en ${frMonth(new Date(`${d.billing_month}-01T00:00:00Z`))}, encaissé selon le délai de paiement)`).join(', ')}`,
      items,
    });
  }

  if (opt.objectiveEur != null) {
    out.push({
      key: 'objective', label: 'Objectif', cash_eur: r(opt.objectiveEur), gap_to_normal_eur: r(opt.objectiveEur) - normalCash,
      counted: `Montant cible saisi ; écart au scénario normal : ${fmt(r(opt.objectiveEur) - normalCash)}`, items: [],
    });
  }

  // Horizon M+1 : normal + récurrent du mois suivant + tout le pipe pondéré - charges (et prélèvements) du mois suivant.
  const next = addMonths(target, 1);
  const recNext = inp.recurring.reduce((s, x) => s + (monthsActive(x.start, x.end, next, next).length ? x.monthlyEur : 0), 0);
  const expNext = inp.expenses.reduce((s, x) => s + (monthsActive(x.start, x.end, next, next).length ? x.monthlyEur : 0), 0);
  const drawsNext = inp.ownerDraws.filter((d) => monthKey(d.month) === monthKey(next)).reduce((s, d) => s + d.amountEur, 0);
  const weighted = inp.deals.reduce((s, d) => s + d.weighted_eur, 0);
  const hItems: CountedItem[] = [
    { label: `Scénario normal fin ${frMonth(target)}`, amount_eur: normalCash, kind: 'balance' },
    ...(recNext ? [{ label: `Récurrent de ${frMonth(next)}`, amount_eur: r(recNext), kind: 'recurring' as const }] : []),
    { label: 'Pipe pondéré', amount_eur: r(weighted), kind: 'pipe' },
    ...(expNext ? [{ label: `Charges de ${frMonth(next)}`, amount_eur: -r(expNext), kind: 'expense' as const }] : []),
    ...(drawsNext ? [{ label: 'Prélèvements dirigeant', amount_eur: -r(drawsNext), kind: 'owner_draws' as const }] : []),
  ];
  out.push({
    key: 'horizon', label: `Horizon fin ${frMonth(next)}`, cash_eur: sum(hItems),
    counted: `Scénario normal plus le récurrent de ${frMonth(next)} et le pipe pondéré, moins les charges de ${frMonth(next)}`,
    items: hItems,
  });
  return out;
}

/** Facturé de l'année (objectif annuel) jusqu'à la fin de `target`, émis / à facturer / récurrent séparés. */
export function billedYearToDate(inp: CashInputs, target: Date) {
  const year = target.getUTCFullYear();
  const from = new Date(Date.UTC(year, 0, 1));
  let issued = 0, toBill = 0, rec = 0;
  for (const inv of inp.invoices) {
    const bm = invoiceBillingMonth(inv, inp.today);
    if (!bm || !between(bm, from, target)) continue;
    if (inv.status === 'A_FACTURER') toBill += inv.amountEur; else issued += inv.amountEur;
  }
  for (const x of inp.recurring) rec += monthsActive(x.start, x.end, from, target).length * x.monthlyEur;
  const total = issued + toBill + rec;
  return {
    year,
    to_month: monthKey(target),
    issued_eur: r(issued),
    to_bill_eur: r(toBill),
    recurring_eur: r(rec),
    total_eur: r(total),
    target_eur: inp.annualBilledTarget,
    gap_to_target_eur: inp.annualBilledTarget != null ? r(inp.annualBilledTarget - total) : null,
  };
}

export interface ReceivableRow {
  invoice_id: string; number: string | null; client: string; status: InvoiceStatus;
  amount_eur: number; remaining_eur: number; issued_at: string | null; due_at: string | null; days_late: number;
}

/** Créances : factures émises pas encore entièrement payées, et délai moyen réel de paiement par client. */
export function receivables(invoices: (InvoiceInput & { clientKey: string })[], today: Date) {
  const open: ReceivableRow[] = invoices
    .filter((i) => i.status === 'EMISE' || i.status === 'PAYEE_PARTIEL')
    .map((i) => {
      const due = i.dueAt ?? (i.issuedAt ? new Date(i.issuedAt.getTime() + i.paymentDelayDays * DAY) : null);
      return {
        invoice_id: i.id, number: i.number, client: i.label, status: i.status,
        amount_eur: i.amountEur, remaining_eur: i.amountEur - Math.min(i.paidEur, i.amountEur),
        issued_at: i.issuedAt?.toISOString().slice(0, 10) ?? null, due_at: due?.toISOString().slice(0, 10) ?? null,
        days_late: daysLate(i, today),
      };
    })
    .sort((a, b) => b.days_late - a.days_late);
  const byClient = new Map<string, { client: string; delays: number[]; open_eur: number; overdue_eur: number }>();
  for (const i of invoices) {
    const e = byClient.get(i.clientKey) ?? { client: i.label, delays: [], open_eur: 0, overdue_eur: 0 };
    if (i.status === 'PAYEE' && i.issuedAt && i.paidAt) e.delays.push(Math.round((i.paidAt.getTime() - i.issuedAt.getTime()) / DAY));
    byClient.set(i.clientKey, e);
  }
  for (const o of open) {
    const key = invoices.find((i) => i.id === o.invoice_id)!.clientKey;
    const e = byClient.get(key)!;
    e.open_eur += o.remaining_eur;
    if (o.days_late > 0) e.overdue_eur += o.remaining_eur;
  }
  const clients = [...byClient.values()]
    .filter((c) => c.delays.length || c.open_eur)
    .map((c) => ({
      client: c.client,
      paid_invoices: c.delays.length,
      avg_payment_days: c.delays.length ? Math.round(c.delays.reduce((s, d) => s + d, 0) / c.delays.length) : null,
      open_eur: r(c.open_eur),
      overdue_eur: r(c.overdue_eur),
    }))
    .sort((a, b) => b.overdue_eur - a.overdue_eur || b.open_eur - a.open_eur);
  const overdue = open.filter((o) => o.days_late > 0);
  return {
    open_invoices: open,
    totals: { open_eur: r(open.reduce((s, o) => s + o.remaining_eur, 0)), overdue_eur: r(overdue.reduce((s, o) => s + o.remaining_eur, 0)), overdue_count: overdue.length },
    by_client: clients,
  };
}

// ─── Entité qui facture par défaut ────────────────────

const EUROPE = [
  'france', 'paris', 'lyon', 'marseille', 'lille', 'nantes', 'bordeaux', 'toulouse', 'royaume-uni', 'united kingdom', 'uk', 'london', 'londres',
  'england', 'angleterre', 'belgique', 'belgium', 'bruxelles', 'brussels', 'suisse', 'switzerland', 'genève', 'geneva', 'zurich', 'luxembourg',
  'allemagne', 'germany', 'berlin', 'munich', 'espagne', 'spain', 'madrid', 'barcelone', 'barcelona', 'italie', 'italy', 'milan', 'rome',
  'pays-bas', 'netherlands', 'amsterdam', 'portugal', 'lisbonne', 'lisbon', 'irlande', 'ireland', 'dublin', 'suède', 'sweden', 'stockholm',
  'danemark', 'denmark', 'copenhague', 'norvège', 'norway', 'finlande', 'finland', 'autriche', 'austria', 'vienne', 'pologne', 'poland',
  'europe', 'monaco', 'grèce', 'greece', 'tchéquie', 'prague', 'estonie', 'estonia',
];

export type Entity = 'COURTSIDE_CAPITAL_HK' | 'HUMANUP_LONDON' | 'HUMANUP_VIET';

/** Humanup Executive Search Ltd (Londres) pour les clients européens et Paraform, Courtside Capital pour le reste. */
export function defaultEntity(client: { entiteFacturation?: Entity | null; localisation?: string | null }, sourceDeal?: string | null): Entity {
  if (client.entiteFacturation) return client.entiteFacturation;
  if ((sourceDeal || '').toUpperCase() === 'PARAFORM') return 'HUMANUP_LONDON';
  const loc = (client.localisation || '').toLowerCase();
  if (!loc) return 'HUMANUP_LONDON';
  const words = loc.split(/[^a-zà-ÿ-]+/).filter(Boolean);
  return EUROPE.some((e) => (e.includes(' ') ? loc.includes(e) : words.includes(e))) ? 'HUMANUP_LONDON' : 'COURTSIDE_CAPITAL_HK';
}

export const ENTITY_LABEL: Record<Entity, string> = {
  COURTSIDE_CAPITAL_HK: 'Courtside Capital (HK)',
  HUMANUP_LONDON: 'Humanup Executive Search Ltd (Londres)',
  HUMANUP_VIET: 'Humanup Viet',
};
