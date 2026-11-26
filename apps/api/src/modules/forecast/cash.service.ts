/**
 * Trésorerie (forecast lot b) : factures suivies (jamais émises par Propium), revenus récurrents,
 * comptes, charges, prélèvements dirigeant, projection et créances. Calculs dans cash.engine.ts.
 */
import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError, ConflictError } from '../../lib/errors.js';
import { computeDeals, getFxRates, getSettings, toMandatInput } from './forecast.service.js';
import { computeFee, monthKey, monthStart, paymentDelay, addMonths, type DealLine } from './forecast.engine.js';
import {
  billedYearToDate, monthlyTable, receivables, scenarios, defaultEntity, balanceOf, invoiceExpectedCash, daysLate,
  ENTITY_LABEL, type CashInputs, type Entity, type InvoiceInput, type InvoiceStatus,
} from './cash.engine.js';

const DAY = 86400000;
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const ym = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 7) : null);

/** "YYYY-MM" ou "YYYY-MM-DD" → Date UTC (1er du mois pour YYYY-MM). */
export function parseDay(s: string | null | undefined): Date | null {
  if (s == null || s === '') return null;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  if (!m) throw new ValidationError(`Invalid date "${s}" (expected YYYY-MM-DD or YYYY-MM)`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1));
}
const todayUtc = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

// ─── Factures ─────────────────────────────────────────

const invoiceInclude = {
  entreprise: { select: { id: true, nom: true, delaiPaiementJours: true, localisation: true, entiteFacturation: true } },
  mandat: { select: { id: true, titrePoste: true, paymentTerms: true, sourceDeal: true, salesId: true } },
  candidature: { select: { id: true, candidat: { select: { nom: true, prenom: true } } } },
} as const;

type InvoiceRow = NonNullable<Awaited<ReturnType<typeof loadInvoice>>>;
function loadInvoice(id: string) {
  return prisma.facture.findUnique({ where: { id }, include: invoiceInclude });
}

function delayDaysOf(row: Pick<InvoiceRow, 'entreprise' | 'mandat'>): number {
  const { days, endOfMonth } = paymentDelay(row.mandat?.paymentTerms ?? null, row.entreprise?.delaiPaiementJours ?? 30);
  return days + (endOfMonth ? 15 : 0); // fin de mois ≈ +15 j en moyenne
}

function toInvoiceInput(row: InvoiceRow): InvoiceInput & { clientKey: string } {
  const client = row.entreprise?.nom ?? row.libelle ?? 'Sans client';
  return {
    id: row.id,
    number: row.numero,
    label: client,
    status: row.statut as InvoiceStatus,
    amountEur: row.montantEur,
    paidEur: row.montantPayeEur,
    plannedBillingMonth: row.moisFacturationPrevu,
    issuedAt: row.dateEmission,
    dueAt: row.dateEcheance,
    paidAt: row.datePaiement,
    plannedCashMonth: row.moisEncaissementPrevu,
    atRisk: row.aRisque,
    paymentDelayDays: delayDaysOf(row),
    clientKey: row.entrepriseId ?? `label:${client.toLowerCase()}`,
  };
}

function invoiceView(row: InvoiceRow, today = todayUtc()) {
  const inp = toInvoiceInput(row);
  return {
    id: row.id,
    number: row.numero,
    label: row.libelle,
    company: row.entreprise ? { id: row.entreprise.id, name: row.entreprise.nom } : null,
    mandate: row.mandat ? { id: row.mandat.id, title: row.mandat.titrePoste } : null,
    candidature_id: row.candidatureId,
    candidate: row.candidature?.candidat ? `${row.candidature.candidat.prenom ?? ''} ${row.candidature.candidat.nom ?? ''}`.trim() : null,
    entity: row.entite,
    entity_label: ENTITY_LABEL[row.entite as Entity],
    status: row.statut,
    amount: Number(row.montant),
    currency: row.devise,
    fx_rate: row.tauxVersEur != null ? Number(row.tauxVersEur) : null,
    amount_eur: row.montantEur,
    paid_eur: row.montantPayeEur,
    planned_billing_month: ym(row.moisFacturationPrevu),
    issued_at: ymd(row.dateEmission),
    due_at: ymd(row.dateEcheance),
    paid_at: ymd(row.datePaiement),
    planned_cash_month: ym(row.moisEncaissementPrevu),
    expected_cash_month: ym(invoiceExpectedCash(inp, new Date(0), today).filter((c) => c.amountEur > 0).at(-1)?.month),
    days_late: daysLate(inp, today),
    at_risk: row.aRisque,
    notes: row.notes,
  };
}

export interface InvoiceFilters { status?: string; companyId?: string; mandateId?: string; from?: string; to?: string }

export async function listInvoices(f: InvoiceFilters = {}) {
  const from = parseDay(f.from ?? null);
  const to = f.to ? addMonths(monthStart(parseDay(f.to)!), f.to.length === 7 ? 1 : 0) : null;
  const rows = await prisma.facture.findMany({
    where: {
      ...(f.status && { statut: f.status as InvoiceStatus }),
      ...(f.companyId && { entrepriseId: f.companyId }),
      ...(f.mandateId && { mandatId: f.mandateId }),
    },
    include: invoiceInclude,
    orderBy: [{ dateEmission: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
  });
  const today = todayUtc();
  return rows
    .map((r) => invoiceView(r, today))
    .filter((v) => {
      const m = v.issued_at ?? v.planned_billing_month;
      if (!m) return !from && !to;
      const dm = parseDay(m.slice(0, 7))!;
      return (!from || dm >= monthStart(from)) && (!to || dm < to);
    });
}

export interface InvoiceInputData {
  numero?: string | null;
  libelle?: string | null;
  entrepriseId?: string | null;
  mandatId?: string | null;
  candidatureId?: string | null;
  entite?: Entity | null;
  statut?: InvoiceStatus;
  montant?: number;
  devise?: string;
  montantEur?: number | null;      // forcé (ex. taux réellement obtenu)
  montantPayeEur?: number | null;
  moisFacturationPrevu?: string | null;
  dateEmission?: string | null;
  dateEcheance?: string | null;
  datePaiement?: string | null;
  moisEncaissementPrevu?: string | null;
  aRisque?: boolean;
  notes?: string | null;
}

const has = <K extends keyof InvoiceInputData>(o: InvoiceInputData, k: K) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;

export async function upsertInvoice(id: string | null, input: InvoiceInputData, userId?: string) {
  const prev = id ? await loadInvoice(id) : null;
  if (id && !prev) throw new NotFoundError('Invoice', id);

  // Liens : candidature → mandat → client
  let candidatureId = has(input, 'candidatureId') ? input.candidatureId ?? null : prev?.candidatureId ?? null;
  let mandatId = has(input, 'mandatId') ? input.mandatId ?? null : prev?.mandatId ?? null;
  let entrepriseId = has(input, 'entrepriseId') ? input.entrepriseId ?? null : prev?.entrepriseId ?? null;
  if (candidatureId) {
    const c = await prisma.candidature.findUnique({ where: { id: candidatureId }, select: { mandatId: true } });
    if (!c) throw new NotFoundError('Candidature', candidatureId);
    mandatId = mandatId ?? c.mandatId;
  }
  const mandat = mandatId ? await prisma.mandat.findUnique({ where: { id: mandatId }, select: { entrepriseId: true, sourceDeal: true, paymentTerms: true, devise: true } }) : null;
  if (mandatId && !mandat) throw new NotFoundError('Mandate', mandatId);
  entrepriseId = entrepriseId ?? mandat?.entrepriseId ?? null;
  const entreprise = entrepriseId ? await prisma.entreprise.findUnique({ where: { id: entrepriseId }, select: { localisation: true, entiteFacturation: true, delaiPaiementJours: true } }) : null;
  if (entrepriseId && !entreprise) throw new NotFoundError('Company', entrepriseId);
  const libelle = has(input, 'libelle') ? input.libelle ?? null : prev?.libelle ?? null;
  if (!entrepriseId && !libelle) throw new ValidationError('An invoice needs a client (company) or a label');

  const statut: InvoiceStatus = input.statut ?? (prev?.statut as InvoiceStatus) ?? (input.dateEmission ? 'EMISE' : 'A_FACTURER');
  const montant = input.montant ?? (prev ? Number(prev.montant) : undefined);
  if (montant == null || !(montant >= 0)) throw new ValidationError('Amount is required');
  const devise = (input.devise ?? prev?.devise ?? mandat?.devise ?? 'EUR').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(devise)) throw new ValidationError('Currency must be a 3-letter ISO code');

  const dateEmission = has(input, 'dateEmission') ? parseDay(input.dateEmission) : prev?.dateEmission ?? null;
  if ((statut === 'EMISE' || statut === 'PAYEE_PARTIEL' || statut === 'PAYEE') && !dateEmission) {
    throw new ValidationError('An issued invoice needs its issue date (dateEmission)');
  }
  const moisFacturationPrevu = has(input, 'moisFacturationPrevu') ? parseDay(input.moisFacturationPrevu) : prev?.moisFacturationPrevu ?? null;

  // Montant en € : taux du jour d'émission (à défaut, le plus récent), sauf montant € forcé
  let montantEur: number;
  let tauxVersEur: number | null = null;
  const forcedEur = has(input, 'montantEur') ? input.montantEur ?? null : null;
  const amountOrRateChanged = has(input, 'montant') || has(input, 'devise') || has(input, 'dateEmission');
  if (devise === 'EUR') {
    montantEur = Math.round(montant);
  } else if (forcedEur != null) {
    montantEur = Math.round(forcedEur);
    tauxVersEur = montant > 0 ? forcedEur / montant : null;
  } else if (prev && !amountOrRateChanged) {
    montantEur = prev.montantEur;
    tauxVersEur = prev.tauxVersEur != null ? Number(prev.tauxVersEur) : null;
  } else {
    const fx = await getFxRates(dateEmission ?? new Date());
    const rate = fx[devise];
    if (!rate) throw new ValidationError(`No ${devise} → EUR rate on ${ymd(dateEmission ?? todayUtc())}: add it in the forecast settings, or pass montantEur`);
    tauxVersEur = rate;
    montantEur = Math.round(montant * rate);
  }

  let dateEcheance = has(input, 'dateEcheance') ? parseDay(input.dateEcheance) : prev?.dateEcheance ?? null;
  if (!dateEcheance && dateEmission) {
    const { days, endOfMonth } = paymentDelay(mandat?.paymentTerms ?? null, entreprise?.delaiPaiementJours ?? 30);
    dateEcheance = new Date(dateEmission.getTime() + days * DAY);
    if (endOfMonth) dateEcheance = new Date(Date.UTC(dateEcheance.getUTCFullYear(), dateEcheance.getUTCMonth() + 1, 0));
  }
  let datePaiement = has(input, 'datePaiement') ? parseDay(input.datePaiement) : prev?.datePaiement ?? null;
  let montantPayeEur = has(input, 'montantPayeEur') ? input.montantPayeEur ?? 0 : prev?.montantPayeEur ?? 0;
  if (statut === 'PAYEE') {
    if (!has(input, 'montantPayeEur')) montantPayeEur = montantEur;
    datePaiement = datePaiement ?? todayUtc();
  }
  if (statut === 'PAYEE_PARTIEL' && !(montantPayeEur > 0)) throw new ValidationError('A partly paid invoice needs the amount paid (montantPayeEur)');
  if (statut === 'A_FACTURER' || statut === 'EMISE') { if (!has(input, 'montantPayeEur')) montantPayeEur = 0; }

  const entite = (has(input, 'entite') && input.entite) || (prev?.entite as Entity | undefined)
    || defaultEntity({ localisation: entreprise?.localisation, entiteFacturation: entreprise?.entiteFacturation as Entity | null }, mandat?.sourceDeal);

  const numero = has(input, 'numero') ? (input.numero?.trim() || null) : prev?.numero ?? null;
  if (numero) {
    const dup = await prisma.facture.findUnique({ where: { numero }, select: { id: true } });
    if (dup && dup.id !== id) throw new ConflictError(`Invoice number ${numero} already exists`);
  }

  const data = {
    numero, libelle, entrepriseId, mandatId, candidatureId, entite, statut,
    montant, devise, tauxVersEur, montantEur, montantPayeEur,
    moisFacturationPrevu: moisFacturationPrevu ? monthStart(moisFacturationPrevu) : (statut === 'A_FACTURER' ? monthStart(todayUtc()) : null),
    dateEmission, dateEcheance, datePaiement,
    moisEncaissementPrevu: has(input, 'moisEncaissementPrevu')
      ? (input.moisEncaissementPrevu ? monthStart(parseDay(input.moisEncaissementPrevu)!) : null)
      : prev?.moisEncaissementPrevu ?? null,
    aRisque: input.aRisque ?? prev?.aRisque ?? false,
    notes: has(input, 'notes') ? input.notes ?? null : prev?.notes ?? null,
  };
  const row = id
    ? await prisma.facture.update({ where: { id }, data, include: invoiceInclude })
    : await prisma.facture.create({ data: { ...data, createdById: userId ?? null }, include: invoiceInclude });
  return invoiceView(row);
}

export async function deleteInvoice(id: string) {
  const row = await prisma.facture.findUnique({ where: { id }, select: { id: true } });
  if (!row) throw new NotFoundError('Invoice', id);
  await prisma.facture.delete({ where: { id } });
}

/** Placements (Won) sans facture : proposés pour créer la facture « à facturer ». */
export async function billingSuggestions() {
  const since = new Date(Date.now() - 365 * DAY);
  const cands = await prisma.candidature.findMany({
    where: { stage: 'PLACE', updatedAt: { gte: since }, factures: { none: {} }, mandat: { type: 'CLIENT' } },
    select: { id: true, mandatId: true, updatedAt: true, dateDemarrage: true, candidat: { select: { nom: true, prenom: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
  if (!cands.length) return [];
  const fx = await getFxRates();
  const out = [];
  for (const c of cands) {
    const est = await estimateInvoice(c.id, fx).catch(() => null);
    if (!est) continue;
    out.push({
      candidature_id: c.id,
      candidate: `${c.candidat?.prenom ?? ''} ${c.candidat?.nom ?? ''}`.trim(),
      mandate: { id: c.mandatId, title: est.mandatTitle },
      company: est.company,
      won_at: ymd(c.updatedAt),
      start_date: ymd(c.dateDemarrage),
      fee_eur: est.feeEur,
      fee_base: est.base,
      entity: est.entite,
      billing_month: est.billingMonth,
    });
  }
  return out;
}

async function estimateInvoice(candidatureId: string, fx?: Record<string, number>) {
  const cand = await prisma.candidature.findUnique({ where: { id: candidatureId }, select: { mandatId: true, moisFacturationOverride: true } });
  if (!cand) throw new NotFoundError('Candidature', candidatureId);
  const m = await prisma.mandat.findUnique({
    where: { id: cand.mandatId },
    include: {
      entreprise: { select: { id: true, nom: true, delaiPaiementJours: true, localisation: true, entiteFacturation: true } },
      sales: { select: { id: true, nom: true, prenom: true } },
      recruteur: { select: { id: true, nom: true, prenom: true } },
      candidatures: { where: { id: candidatureId }, include: { candidat: { select: { nom: true, prenom: true, salaireSouhaite: true, salaireActuel: true } } } },
    },
  });
  if (!m) throw new NotFoundError('Mandate', cand.mandatId);
  const input = toMandatInput(m as any);
  const lead = input.candidatures[0] ?? null;
  const fee = m.feeMontantFacture != null ? { feeEur: m.feeMontantFacture, base: 'mandate_billed' as const } : computeFee(input, lead, fx ?? await getFxRates());
  return {
    mandatId: m.id,
    mandatTitle: m.titrePoste,
    entrepriseId: m.entrepriseId,
    company: m.entreprise ? { id: m.entreprise.id, name: m.entreprise.nom } : null,
    feeEur: fee.feeEur,
    base: fee.base,
    entite: defaultEntity({ localisation: m.entreprise?.localisation, entiteFacturation: m.entreprise?.entiteFacturation as Entity | null }, m.sourceDeal),
    billingMonth: monthKey(cand.moisFacturationOverride ? monthStart(cand.moisFacturationOverride) : monthStart(new Date())),
  };
}

/** Crée la facture « à facturer » d'un placement (fee et mois prévu repris du deal). */
export async function createInvoiceFromCandidature(candidatureId: string, userId?: string, overrides: InvoiceInputData = {}) {
  const existing = await prisma.facture.findFirst({ where: { candidatureId, statut: { not: 'ANNULEE' } }, select: { id: true, numero: true } });
  if (existing) throw new ConflictError(`This placement already has an invoice${existing.numero ? ` (${existing.numero})` : ''}`);
  const est = await estimateInvoice(candidatureId);
  return upsertInvoice(null, {
    candidatureId, mandatId: est.mandatId, entrepriseId: est.entrepriseId, entite: est.entite,
    statut: 'A_FACTURER', montant: est.feeEur, devise: 'EUR', moisFacturationPrevu: est.billingMonth,
    ...overrides,
  }, userId);
}

// ─── Récurrent, comptes, charges, prélèvements ────────

export type FinanceKind = 'recurring_revenue' | 'cash_account' | 'expense' | 'owner_draw';

const recurringView = (r: any) => ({ id: r.id, label: r.libelle, monthly_eur: r.montantMensuelEur, start_month: ym(r.dateDebut), end_month: ym(r.dateFin), entity: r.entite, notes: r.notes });
const accountView = (r: any) => ({ id: r.id, name: r.nom, entity: r.entite, balance_eur: r.soldeEur, balance_date: ymd(r.dateSolde), active: r.actif, notes: r.notes });
const expenseView = (r: any) => ({ id: r.id, label: r.libelle, category: r.categorie, monthly_eur: r.montantEur, start_month: ym(r.dateDebut), end_month: ym(r.dateFin), notes: r.notes });
const drawView = (r: any) => ({ id: r.id, label: r.libelle, amount_eur: r.montantEur, month: ym(r.mois), notes: r.notes });

export async function listFinanceItems(kind: FinanceKind) {
  switch (kind) {
    case 'recurring_revenue': return (await prisma.revenuRecurrent.findMany({ orderBy: { dateDebut: 'asc' } })).map(recurringView);
    case 'cash_account': return (await prisma.compteTresorerie.findMany({ orderBy: { nom: 'asc' } })).map(accountView);
    case 'expense': return (await prisma.chargeMensuelle.findMany({ orderBy: [{ categorie: 'asc' }, { libelle: 'asc' }] })).map(expenseView);
    case 'owner_draw': return (await prisma.prelevementDirigeant.findMany({ orderBy: { mois: 'asc' } })).map(drawView);
  }
}

export interface FinanceItemInput {
  label?: string; name?: string; category?: string | null; entity?: Entity | null; notes?: string | null; active?: boolean;
  monthly_eur?: number; amount_eur?: number; balance_eur?: number;
  start_month?: string; end_month?: string | null; month?: string; balance_date?: string;
}

function req<T>(v: T | undefined | null, field: string): T {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) throw new ValidationError(`${field} is required`);
  return v;
}
const money = (v: number | undefined, field: string) => {
  if (v === undefined) return undefined;
  if (!Number.isFinite(v)) throw new ValidationError(`${field} must be a number`);
  return Math.round(v);
};
const monthOpt = (v: string | null | undefined) => (v === undefined ? undefined : v === null || v === '' ? null : monthStart(parseDay(v)!));

async function financeItemExists(kind: FinanceKind, id: string): Promise<boolean> {
  const where = { where: { id }, select: { id: true } };
  switch (kind) {
    case 'recurring_revenue': return !!(await prisma.revenuRecurrent.findUnique(where));
    case 'cash_account': return !!(await prisma.compteTresorerie.findUnique(where));
    case 'expense': return !!(await prisma.chargeMensuelle.findUnique(where));
    case 'owner_draw': return !!(await prisma.prelevementDirigeant.findUnique(where));
  }
}

export async function upsertFinanceItem(kind: FinanceKind, id: string | null, i: FinanceItemInput) {
  const create = !id;
  if (id && !(await financeItemExists(kind, id))) throw new NotFoundError(kind, id);
  switch (kind) {
    case 'recurring_revenue': {
      const data: any = {
        ...(i.label !== undefined && { libelle: i.label }),
        ...(i.monthly_eur !== undefined && { montantMensuelEur: money(i.monthly_eur, 'monthly_eur') }),
        ...(i.start_month !== undefined && { dateDebut: monthOpt(i.start_month) }),
        ...(i.end_month !== undefined && { dateFin: monthOpt(i.end_month) }),
        ...(i.entity !== undefined && { entite: i.entity }),
        ...(i.notes !== undefined && { notes: i.notes }),
      };
      if (create) { req(i.label, 'label'); req(i.monthly_eur, 'monthly_eur'); req(i.start_month, 'start_month'); }
      return recurringView(create ? await prisma.revenuRecurrent.create({ data }) : await prisma.revenuRecurrent.update({ where: { id: id! }, data }));
    }
    case 'cash_account': {
      const data: any = {
        ...(i.name !== undefined && { nom: i.name }),
        ...(i.balance_eur !== undefined && { soldeEur: money(i.balance_eur, 'balance_eur') }),
        ...(i.balance_date !== undefined && { dateSolde: parseDay(i.balance_date) }),
        ...(i.entity !== undefined && { entite: i.entity }),
        ...(i.active !== undefined && { actif: i.active }),
        ...(i.notes !== undefined && { notes: i.notes }),
      };
      if (i.balance_eur !== undefined && i.balance_date === undefined) data.dateSolde = todayUtc();
      if (create) { req(i.name, 'name'); req(i.balance_eur, 'balance_eur'); }
      return accountView(create ? await prisma.compteTresorerie.create({ data }) : await prisma.compteTresorerie.update({ where: { id: id! }, data }));
    }
    case 'expense': {
      const data: any = {
        ...(i.label !== undefined && { libelle: i.label }),
        ...(i.category !== undefined && { categorie: i.category }),
        ...(i.monthly_eur !== undefined && { montantEur: money(i.monthly_eur, 'monthly_eur') }),
        ...(i.start_month !== undefined && { dateDebut: monthOpt(i.start_month) }),
        ...(i.end_month !== undefined && { dateFin: monthOpt(i.end_month) }),
        ...(i.notes !== undefined && { notes: i.notes }),
      };
      if (create) { req(i.label, 'label'); req(i.monthly_eur, 'monthly_eur'); data.dateDebut = data.dateDebut ?? monthStart(todayUtc()); }
      return expenseView(create ? await prisma.chargeMensuelle.create({ data }) : await prisma.chargeMensuelle.update({ where: { id: id! }, data }));
    }
    case 'owner_draw': {
      const data: any = {
        ...(i.label !== undefined && { libelle: i.label }),
        ...(i.amount_eur !== undefined && { montantEur: money(i.amount_eur, 'amount_eur') }),
        ...(i.month !== undefined && { mois: monthOpt(i.month) }),
        ...(i.notes !== undefined && { notes: i.notes }),
      };
      if (create) { req(i.label, 'label'); req(i.amount_eur, 'amount_eur'); req(i.month, 'month'); }
      return drawView(create ? await prisma.prelevementDirigeant.create({ data }) : await prisma.prelevementDirigeant.update({ where: { id: id! }, data }));
    }
  }
}

export async function deleteFinanceItem(kind: FinanceKind, id: string) {
  const del = {
    recurring_revenue: () => prisma.revenuRecurrent.delete({ where: { id } }),
    cash_account: () => prisma.compteTresorerie.delete({ where: { id } }),
    expense: () => prisma.chargeMensuelle.delete({ where: { id } }),
    owner_draw: () => prisma.prelevementDirigeant.delete({ where: { id } }),
  }[kind];
  if (!(await financeItemExists(kind, id))) throw new NotFoundError(kind, id);
  await del();
}

// ─── Projection ───────────────────────────────────────

async function loadCashInputs(today: Date, deals?: DealLine[]): Promise<CashInputs & { invoiceRows: InvoiceRow[] }> {
  const [settings, accounts, invoiceRows, recurring, expenses, draws, dealsRes] = await Promise.all([
    getSettings(),
    prisma.compteTresorerie.findMany(),
    prisma.facture.findMany({ include: invoiceInclude }),
    prisma.revenuRecurrent.findMany(),
    prisma.chargeMensuelle.findMany(),
    prisma.prelevementDirigeant.findMany(),
    deals ? Promise.resolve({ deals }) : computeDeals(today),
  ]);
  return {
    today,
    invoiceRows,
    accounts: accounts.map((a) => ({ id: a.id, name: a.nom, balanceEur: a.soldeEur, balanceDate: a.dateSolde, active: a.actif })),
    invoices: invoiceRows.map(toInvoiceInput),
    recurring: recurring.map((x) => ({ id: x.id, label: x.libelle, monthlyEur: x.montantMensuelEur, start: x.dateDebut, end: x.dateFin })),
    expenses: expenses.map((x) => ({ id: x.id, label: x.libelle, category: x.categorie, monthlyEur: x.montantEur, start: x.dateDebut, end: x.dateFin })),
    ownerDraws: draws.map((x) => ({ id: x.id, label: x.libelle, amountEur: x.montantEur, month: x.mois })),
    deals: dealsRes.deals,
    annualBilledTarget: settings.objectifFactureAnnuel,
  };
}

export interface CashflowOptions {
  targetMonth?: string;          // YYYY-MM, défaut : décembre de l'année en cours
  delayInvoiceIds?: string[];
  forceDealIds?: string[];
  objectiveEur?: number | null;  // défaut : réglage « objectif du scénario »
  hideOwnerDrawDetails?: boolean; // agents : total seulement
  today?: Date;
}

export async function getCashflowProjection(o: CashflowOptions = {}) {
  const today = todayUtc(o.today);
  const target = o.targetMonth ? monthStart(parseDay(o.targetMonth)!) : new Date(Date.UTC(today.getUTCFullYear(), 11, 1));
  const inp = await loadCashInputs(today);
  const settings = await getSettings();
  const objective = o.objectiveEur !== undefined ? o.objectiveEur : settings.objectifScenarioEur;
  const bal = balanceOf(inp.accounts, today);
  const warnings: string[] = [];
  if (!inp.accounts.some((a) => a.active)) warnings.push('No cash account: enter the balances to get a cash projection');
  const unknownDeals = (o.forceDealIds ?? []).filter((id) => !inp.deals.some((d) => d.deal_id === id));
  if (unknownDeals.length) warnings.push(`Unknown deal ids ignored: ${unknownDeals.join(', ')}`);
  const unknownInv = (o.delayInvoiceIds ?? []).filter((id) => !inp.invoices.some((i) => i.id === id));
  if (unknownInv.length) warnings.push(`Unknown invoice ids ignored: ${unknownInv.join(', ')}`);
  const sc = scenarios(inp, { targetMonth: target, delayInvoiceIds: o.delayInvoiceIds, forceDealIds: o.forceDealIds, objectiveEur: objective ?? null });

  const draws = inp.ownerDraws.filter((d) => monthStart(d.month) >= monthStart(bal.date) && monthStart(d.month) <= addMonths(target, 1));
  return {
    as_of: ymd(today),
    target_month: monthKey(target),
    balance: {
      total_eur: bal.totalEur,
      date: ymd(bal.date),
      accounts: inp.accounts.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name, balance_eur: a.balanceEur, balance_date: ymd(a.balanceDate) })),
    },
    billed_ytd: billedYearToDate(inp, target),
    months: monthlyTable(inp, monthStart(bal.date), addMonths(target, 1)),
    scenarios: sc,
    owner_draws: o.hideOwnerDrawDetails
      ? { total_eur: draws.reduce((s, d) => s + d.amountEur, 0) }
      : { total_eur: draws.reduce((s, d) => s + d.amountEur, 0), items: draws.map((d) => ({ label: d.label, amount_eur: d.amountEur, month: monthKey(d.month) })) },
    pipe: { weighted_eur: Math.round(inp.deals.reduce((s, d) => s + d.weighted_eur, 0)), deals: inp.deals.length },
    warnings,
  };
}

export async function getReceivables(f: { companyId?: string; overdueOnly?: boolean } = {}) {
  const today = todayUtc();
  const rows = await prisma.facture.findMany({ where: f.companyId ? { entrepriseId: f.companyId } : {}, include: invoiceInclude });
  const r = receivables(rows.map(toInvoiceInput), today);
  if (f.overdueOnly) r.open_invoices = r.open_invoices.filter((o) => o.days_late > 0);
  return { as_of: ymd(today), ...r };
}

/** Facturé (CA attribué) sur une période : factures émises ou payées, rattachées au sales du mandat. */
export async function billedCa(range: { start: Date; end: Date }, mandatWhere?: Record<string, unknown>): Promise<number> {
  const agg = await prisma.facture.aggregate({
    _sum: { montantEur: true },
    where: {
      statut: { in: ['EMISE', 'PAYEE_PARTIEL', 'PAYEE'] },
      dateEmission: { gte: range.start, lt: range.end },
      ...(mandatWhere ? { mandat: mandatWhere } : {}),
    },
  });
  return agg._sum.montantEur ?? 0;
}

/** Valeurs de la photo hebdo : facturé prévu de l'année et scénario normal de fin d'année. */
export async function snapshotCashFigures(today: Date, deals: DealLine[]) {
  const inp = await loadCashInputs(todayUtc(today), deals);
  const dec = new Date(Date.UTC(today.getUTCFullYear(), 11, 1));
  const normal = scenarios(inp, { targetMonth: dec })[0];
  return { facturePrevuEur: billedYearToDate(inp, dec).total_eur, scenarioNormalEur: inp.accounts.length ? normal.cash_eur : null };
}
