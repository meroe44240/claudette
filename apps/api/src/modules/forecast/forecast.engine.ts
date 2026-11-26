/**
 * Moteur de calcul du forecast (fonctions pures, sans accès base).
 *
 * Le deal = le poste, pas le candidat :
 *  - chaque candidature côté client (Sent to client et après) reçoit une proba selon son avancement ;
 *  - un mandat de N postes : les N meilleurs candidats mènent chacun un poste ;
 *  - chaque autre candidat côté client ajoute un bonus (bonus % × sa proba) au poste le moins couvert ;
 *  - plafond = proba Offer, sauf si le candidat qui mène le poste est réellement en Offer ;
 *  - un override (proba, fee, mois) posé sur la candidature qui mène le poste remplace la valeur calculée.
 */

export type Stage =
  | 'SOURCING' | 'CONTACTE' | 'ENTRETIEN_1' | 'ENVOYE_CLIENT' | 'ENTRETIEN_CLIENT'
  | 'PROCESS' | 'OFFRE' | 'PLACE' | 'REFUSE';

export interface ForecastSettingsInput {
  probaEnvoyeClient: number;   // %
  probaPremiereEtape: number;  // %
  probaDerniereEtape: number;  // %
  probaSansProcess: number;    // %
  probaOffre: number;          // %
  bonusAutresCandidats: number; // % de la proba de chaque autre candidat
}

export const DEFAULT_SETTINGS: ForecastSettingsInput = {
  probaEnvoyeClient: 10,
  probaPremiereEtape: 15,
  probaDerniereEtape: 60,
  probaSansProcess: 15,
  probaOffre: 85,
  bonusAutresCandidats: 10,
};

export type FeeType = 'POURCENTAGE_PACKAGE' | 'POURCENTAGE_FIXE' | 'MONTANT_FIXE';

export interface CandidatureInput {
  id: string;
  candidatNom: string;
  stage: Stage;
  processEtape: number | null;
  dateProchainEntretien: Date | null;
  retourAttenteDepuis: Date | null;
  packageFixe: number | null;
  packageVariable: number | null;
  salaireCandidat: number | null; // dans la devise du mandat
  dateDemarrage: Date | null;
  probaOverride: number | null;   // %
  feeOverrideEur: number | null;
  moisFacturationOverride: Date | null;
}

export interface PersonRef { id: string; nom: string }

export interface MandatInput {
  id: string;
  titrePoste: string;
  entrepriseNom: string;
  nbPostes: number;
  feeType: FeeType;
  feePourcentage: number;
  feeMontantFixe: number | null;
  feeMontantEstime: number | null; // € (repli quand rien d'autre n'est connu)
  devise: string;
  salaireMin: number | null;
  salaireMax: number | null;
  sourceDeal: string | null;
  paraformNbVersements: number;
  splitSalesPct: number;
  processEtapes: string[];      // libellés ordonnés ; [] = process non saisi
  paymentTerms: string | null;  // code du mandat (prioritaire)
  delaiPaiementClientJours: number; // défaut du client
  sales: PersonRef | null;
  recruteur: PersonRef | null;
  candidatures: CandidatureInput[];
}

/** 1 unité de devise = taux € */
export type FxRates = Record<string, number>;

export const CLIENT_SIDE_STAGES: Stage[] = ['ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'PROCESS', 'OFFRE'];
const ACTIVE_STAGES: Stage[] = ['SOURCING', 'CONTACTE', 'ENTRETIEN_1', ...CLIENT_SIDE_STAGES];

const round2 = (x: number) => Math.round(x * 100) / 100;

// ─── Proba d'une candidature ───────────────────────────

/** Proba calculée (%) d'une candidature selon son avancement. */
export function candidateProba(
  stage: Stage,
  processEtape: number | null,
  nbEtapes: number,
  s: ForecastSettingsInput = DEFAULT_SETTINGS,
): number {
  switch (stage) {
    case 'PLACE': return 100;
    case 'REFUSE': return 0;
    case 'OFFRE': return s.probaOffre;
    case 'ENVOYE_CLIENT': return s.probaEnvoyeClient;
    case 'ENTRETIEN_CLIENT':
    case 'PROCESS': {
      if (nbEtapes <= 0) return s.probaSansProcess;
      const k = Math.min(Math.max(processEtape ?? 1, 1), nbEtapes);
      if (nbEtapes === 1) return s.probaDerniereEtape;
      return round2(s.probaPremiereEtape + ((s.probaDerniereEtape - s.probaPremiereEtape) * (k - 1)) / (nbEtapes - 1));
    }
    default: return 0; // pas encore côté client
  }
}

/** Libellé court de l'avancement, ex. « Product interview with PM (3/5) ». */
export function stepLabel(c: Pick<CandidatureInput, 'stage' | 'processEtape'>, etapes: string[]): string {
  const base: Record<Stage, string> = {
    SOURCING: 'Sourcing', CONTACTE: 'Qualification', ENTRETIEN_1: 'Internal interview',
    ENVOYE_CLIENT: 'Sent to client', ENTRETIEN_CLIENT: 'Client interview', PROCESS: 'Process',
    OFFRE: 'Offer', PLACE: 'Won', REFUSE: 'Lost',
  };
  if ((c.stage === 'ENTRETIEN_CLIENT' || c.stage === 'PROCESS') && etapes.length > 0) {
    const k = Math.min(Math.max(c.processEtape ?? 1, 1), etapes.length);
    return `${etapes[k - 1]} (${k}/${etapes.length})`;
  }
  return base[c.stage];
}

// ─── Fee ──────────────────────────────────────────────

export function toEur(amount: number, devise: string, fx: FxRates): number {
  const d = (devise || 'EUR').toUpperCase();
  if (d === 'EUR') return amount;
  const rate = fx[d];
  if (!rate) throw new Error(`Missing FX rate for ${d}`);
  return amount * rate;
}

export interface FeeResult {
  feeEur: number;
  base: 'override' | 'fixed_amount' | 'candidate_package' | 'candidate_salary' | 'salary_range_mid' | 'mandate_estimate' | 'unknown';
}

/** Fee calculé (€) pour un poste mené par `lead` (ou sans candidat). */
export function computeFee(m: MandatInput, lead: CandidatureInput | null, fx: FxRates): FeeResult {
  if (lead?.feeOverrideEur != null) return { feeEur: lead.feeOverrideEur, base: 'override' };
  if (m.feeType === 'MONTANT_FIXE' && m.feeMontantFixe != null) {
    return { feeEur: Math.round(toEur(m.feeMontantFixe, m.devise, fx)), base: 'fixed_amount' };
  }
  const pct = Number(m.feePourcentage) / 100;
  let base: number | null = null;
  let kind: FeeResult['base'] = 'unknown';
  if (lead) {
    const pkg = m.feeType === 'POURCENTAGE_FIXE'
      ? lead.packageFixe
      : (lead.packageFixe != null || lead.packageVariable != null)
        ? (lead.packageFixe ?? 0) + (lead.packageVariable ?? 0)
        : null;
    if (pkg != null && pkg > 0) { base = pkg; kind = 'candidate_package'; }
    else if (lead.salaireCandidat != null && lead.salaireCandidat > 0) { base = lead.salaireCandidat; kind = 'candidate_salary'; }
  }
  if (base == null && (m.salaireMin != null || m.salaireMax != null)) {
    const lo = m.salaireMin ?? m.salaireMax!;
    const hi = m.salaireMax ?? m.salaireMin!;
    base = (lo + hi) / 2; kind = 'salary_range_mid';
  }
  if (base != null) return { feeEur: Math.round(toEur(base * pct, m.devise, fx)), base: kind };
  if (m.feeMontantEstime != null) return { feeEur: m.feeMontantEstime, base: 'mandate_estimate' };
  return { feeEur: 0, base: 'unknown' };
}

// ─── Mois de facturation / encaissement ───────────────

export function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
export function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function monthEnd(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

/** Mois de facturation prévu selon l'étape du candidat qui mène le poste. */
export function estimateBillingMonth(lead: CandidatureInput | null, nbEtapes: number, today: Date): Date {
  const m0 = monthStart(today);
  if (lead?.moisFacturationOverride) return monthStart(lead.moisFacturationOverride);
  if (!lead) return addMonths(m0, 2);
  switch (lead.stage) {
    case 'OFFRE':
    case 'PLACE':
      return m0;
    case 'ENTRETIEN_CLIENT':
    case 'PROCESS': {
      if (nbEtapes <= 0) return addMonths(m0, 2);
      const k = Math.min(Math.max(lead.processEtape ?? 1, 1), nbEtapes);
      if (k === 1 && nbEtapes > 1) return addMonths(m0, 2);
      return addMonths(m0, 1); // étapes intermédiaires et dernière étape
    }
    default:
      return addMonths(m0, 2); // Sent to client et avant
  }
}

/** Délai de paiement en jours + fin de mois, depuis le code du mandat ou le défaut client. */
export function paymentDelay(paymentTerms: string | null, clientDefaultDays: number): { days: number; endOfMonth: boolean } {
  const t = (paymentTerms || '').trim().toLowerCase();
  if (t === 'reception' || t === 'signature') return { days: 0, endOfMonth: false };
  const m = t.match(/^(\d+)\s*j(_fdm)?$/);
  if (m) return { days: Number(m[1]), endOfMonth: !!m[2] };
  return { days: clientDefaultDays, endOfMonth: false };
}

export interface CashInstallment { month: string; amountEur: number }

/**
 * Échéancier d'encaissement d'un deal facturé au mois `billingMonth`.
 * Hypothèse : la facture est émise en fin de mois de facturation.
 * Paraform : n versements égaux mensuels à partir de 30 jours après la prise de poste
 * (prise de poste inconnue → mois suivant la facturation).
 */
export function cashSchedule(
  m: Pick<MandatInput, 'sourceDeal' | 'paraformNbVersements' | 'paymentTerms' | 'delaiPaiementClientJours'>,
  feeEur: number,
  billingMonth: Date,
  dateDemarrage: Date | null,
): CashInstallment[] {
  if ((m.sourceDeal || '').toUpperCase() === 'PARAFORM') {
    const n = Math.max(1, m.paraformNbVersements || 1);
    const start = dateDemarrage ?? addMonths(billingMonth, 1);
    const first = new Date(start.getTime() + 30 * 86400000);
    const each = feeEur / n;
    return Array.from({ length: n }, (_, i) => ({ month: monthKey(addMonths(monthStart(first), i)), amountEur: round2(each) }));
  }
  const { days, endOfMonth } = paymentDelay(m.paymentTerms, m.delaiPaiementClientJours);
  let due = new Date(monthEnd(billingMonth).getTime() + days * 86400000);
  if (endOfMonth) due = monthEnd(due);
  return [{ month: monthKey(due), amountEur: feeEur }];
}

// ─── Postes d'un mandat ───────────────────────────────

export interface DealLine {
  deal_id: string;           // `${mandatId}#${index}`
  mandate_id: string;
  mandate_title: string;
  company: string;
  position_index: number;    // 1..nbPostes
  positions_total: number;
  lead_candidature_id: string | null;
  lead_candidate: string | null;
  step_label: string;        // « Sans candidat » si aucun candidat
  next_interview_at: string | null;
  waiting_since: string | null;
  other_candidates: number;  // candidats côté client qui renforcent ce poste
  proba_computed: number;    // %
  proba: number;             // % (override si forcé)
  proba_overridden: boolean;
  fee_eur: number;
  fee_base: FeeResult['base'];
  fee_overridden: boolean;
  weighted_eur: number;
  expected_placements: number;
  billing_month: string;
  billing_month_overridden: boolean;
  cash: CashInstallment[];
  source: string | null;
  process_missing: boolean;  // process d'entretien à saisir
  sales: PersonRef | null;
  recruiter: PersonRef | null;
  split_sales_pct: number;
}

export function computeMandatDeals(
  m: MandatInput,
  fx: FxRates,
  today: Date,
  s: ForecastSettingsInput = DEFAULT_SETTINGS,
): DealLine[] {
  const n = m.processEtapes.length;
  const nbPostes = Math.max(1, m.nbPostes || 1);
  const placed = m.candidatures.filter((c) => c.stage === 'PLACE').length;
  const openPostes = Math.max(0, nbPostes - placed);
  if (openPostes === 0) return [];

  const active = m.candidatures.filter((c) => ACTIVE_STAGES.includes(c.stage));
  const clientSide = m.candidatures
    .filter((c) => CLIENT_SIDE_STAGES.includes(c.stage))
    .map((c) => ({ c, p: c.probaOverride ?? candidateProba(c.stage, c.processEtape, n, s) }))
    .sort((a, b) => b.p - a.p);

  const leads = clientSide.slice(0, openPostes);
  const others = clientSide.slice(openPostes);

  // Postes : lead éventuel + bonus cumulé
  const postes = Array.from({ length: openPostes }, (_, i) => {
    const l = leads[i];
    return {
      lead: l?.c ?? null,
      base: l ? candidateProba(l.c.stage, l.c.processEtape, n, s) : 0,
      bonus: 0,
      others: 0,
    };
  });
  const cap = (p: (typeof postes)[number]) => (p.lead?.stage === 'OFFRE' ? 100 : s.probaOffre);
  const value = (p: (typeof postes)[number]) => Math.min(cap(p), p.base + p.bonus);

  // Bonus : chaque autre candidat côté client renforce le poste le moins couvert (parmi ceux qui ont un lead)
  for (const o of others) {
    const pool = postes.filter((p) => p.lead);
    if (pool.length === 0) break;
    const target = pool.reduce((min, p) => (value(p) < value(min) ? p : min), pool[0]);
    target.bonus += (s.bonusAutresCandidats / 100) * o.p;
    target.others += 1;
  }

  const hasActive = active.length > 0;
  return postes.map((p, i) => {
    const computed = round2(value(p));
    const overridden = p.lead?.probaOverride != null;
    const proba = overridden ? Number(p.lead!.probaOverride) : computed;
    const fee = computeFee(m, p.lead, fx);
    const billing = estimateBillingMonth(p.lead, n, today);
    return {
      deal_id: `${m.id}#${i + 1}`,
      mandate_id: m.id,
      mandate_title: m.titrePoste,
      company: m.entrepriseNom,
      position_index: i + 1,
      positions_total: openPostes,
      lead_candidature_id: p.lead?.id ?? null,
      lead_candidate: p.lead?.candidatNom ?? null,
      step_label: p.lead ? stepLabel(p.lead, m.processEtapes) : hasActive ? 'Pas encore présenté' : 'Sans candidat',
      next_interview_at: p.lead?.dateProchainEntretien?.toISOString() ?? null,
      waiting_since: p.lead?.retourAttenteDepuis?.toISOString().slice(0, 10) ?? null,
      other_candidates: p.others,
      proba_computed: computed,
      proba,
      proba_overridden: overridden,
      fee_eur: fee.feeEur,
      fee_base: fee.base,
      fee_overridden: fee.base === 'override',
      weighted_eur: round2((fee.feeEur * proba) / 100),
      expected_placements: round2(proba / 100),
      billing_month: monthKey(billing),
      billing_month_overridden: !!p.lead?.moisFacturationOverride,
      cash: cashSchedule(m, fee.feeEur, billing, p.lead?.dateDemarrage ?? null),
      source: m.sourceDeal,
      process_missing: n === 0 && clientSide.some((x) => x.c.stage === 'ENTRETIEN_CLIENT' || x.c.stage === 'PROCESS'),
      sales: m.sales,
      recruiter: m.recruteur,
      split_sales_pct: m.splitSalesPct,
    };
  });
}

// ─── Récaps ───────────────────────────────────────────

export interface RecapRow { person_id: string | null; person: string; fee_eur: number; weighted_eur: number; expected_placements: number }

const UNASSIGNED = 'Non attribué';

function addTo(map: Map<string, RecapRow>, person: PersonRef | null, share: number, d: DealLine) {
  const key = person?.id ?? '__none__';
  const row = map.get(key) ?? { person_id: person?.id ?? null, person: person?.nom ?? UNASSIGNED, fee_eur: 0, weighted_eur: 0, expected_placements: 0 };
  row.fee_eur += d.fee_eur * share;
  row.weighted_eur += d.weighted_eur * share;
  row.expected_placements += d.expected_placements * share;
  map.set(key, row);
}

function finish(map: Map<string, RecapRow>): RecapRow[] {
  return [...map.values()]
    .map((r) => ({ ...r, fee_eur: Math.round(r.fee_eur), weighted_eur: Math.round(r.weighted_eur), expected_placements: round2(r.expected_placements) }))
    .sort((a, b) => b.weighted_eur - a.weighted_eur);
}

/**
 * Récap « Pipe partagé » : chaque deal est réparti entre sales (splitSalesPct) et recruteur (le reste).
 * Vue par sales = part sales ; vue par recruteur = part recruteur. Quand la même personne tient les deux
 * rôles, elle reçoit 100 % dans la vue combinée.
 */
export function recaps(deals: DealLine[]) {
  const bySales = new Map<string, RecapRow>();
  const byRecruiter = new Map<string, RecapRow>();
  const combined = new Map<string, RecapRow>();
  for (const d of deals) {
    const sp = Math.min(100, Math.max(0, d.split_sales_pct)) / 100;
    addTo(bySales, d.sales, sp, d);
    addTo(byRecruiter, d.recruiter, 1 - sp, d);
    if (d.sales?.id && d.sales.id === d.recruiter?.id) addTo(combined, d.sales, 1, d);
    else { addTo(combined, d.sales, sp, d); addTo(combined, d.recruiter, 1 - sp, d); }
  }
  return { by_sales: finish(bySales), by_recruiter: finish(byRecruiter), by_person: finish(combined) };
}

export function totals(deals: DealLine[]) {
  const fee = deals.reduce((a, d) => a + d.fee_eur, 0);
  const weighted = deals.reduce((a, d) => a + d.weighted_eur, 0);
  const placements = deals.reduce((a, d) => a + d.expected_placements, 0);
  const forced = deals.filter((d) => d.proba_overridden).length;
  return {
    positions: deals.length,
    fee_eur: Math.round(fee),
    weighted_eur: Math.round(weighted),
    expected_placements: round2(placements),
    average_proba: fee > 0 ? round2((weighted / fee) * 100) : 0,
    forced_probas: forced,
    forced_probas_rate: deals.length ? round2((forced / deals.length) * 100) : 0,
  };
}
