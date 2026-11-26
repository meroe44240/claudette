/**
 * Forecast : chargement des données + persistance (process d'entretien, overrides, deals perdus, photos).
 * Le calcul lui-même est dans forecast.engine.ts (fonctions pures, testées).
 */
import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import {
  computeMandatDeals, recaps, totals, DEFAULT_SETTINGS, monthStart,
  type DealLine, type ForecastSettingsInput, type FxRates, type MandatInput, type Stage,
} from './forecast.engine.js';

const LOSS_STATUTS = ['PERDU', 'ANNULE', 'CLOTURE'];

export const MOTIF_LABEL_FR: Record<string, string> = {
  SALAIRE: 'Salaire',
  PROFIL_PAS_ALIGNE: 'Profil pas aligné',
  CANDIDAT_DECLINE: 'Le candidat a décliné',
  CLIENT_REFUSE: 'Refusé par le client',
  TIMING: 'Timing',
  POSTE_POURVU: 'Poste pourvu',
  AUTRE: 'Autre',
};

// ─── Réglages et taux ─────────────────────────────────

export async function getSettings() {
  return prisma.forecastSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
}

function settingsInput(s: Awaited<ReturnType<typeof getSettings>>): ForecastSettingsInput {
  return {
    probaEnvoyeClient: Number(s.probaEnvoyeClient),
    probaPremiereEtape: Number(s.probaPremiereEtape),
    probaDerniereEtape: Number(s.probaDerniereEtape),
    probaSansProcess: Number(s.probaSansProcess),
    probaOffre: Number(s.probaOffre),
    bonusAutresCandidats: Number(s.bonusAutresCandidats),
  };
}

export async function updateSettings(data: Partial<ForecastSettingsInput & { objectifFactureAnnuel: number | null; objectifScenarioEur: number | null }>) {
  for (const [k, v] of Object.entries(data)) {
    if (k === 'objectifFactureAnnuel' || k === 'objectifScenarioEur') continue;
    if (typeof v !== 'number' || v < 0 || v > 100) throw new ValidationError(`${k} must be a percentage between 0 and 100`);
  }
  await getSettings();
  return prisma.forecastSettings.update({ where: { id: 'default' }, data });
}

/** Taux le plus récent par devise, en vigueur à la date `at` (aujourd'hui par défaut). */
export async function getFxRates(at: Date = new Date()): Promise<FxRates> {
  const rows = await prisma.tauxChange.findMany({ where: { dateEffet: { lte: at } }, orderBy: { dateEffet: 'desc' } });
  const fx: FxRates = {};
  for (const r of rows) if (fx[r.devise] === undefined) fx[r.devise] = Number(r.tauxVersEur);
  return fx;
}

export async function listFxRates() {
  return prisma.tauxChange.findMany({ orderBy: [{ devise: 'asc' }, { dateEffet: 'desc' }] });
}

export async function upsertFxRate(devise: string, tauxVersEur: number, dateEffet: Date) {
  const d = devise.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(d)) throw new ValidationError('Currency must be a 3-letter ISO code');
  if (d === 'EUR') throw new ValidationError('EUR is the reference currency');
  if (!(tauxVersEur > 0)) throw new ValidationError('Rate must be positive');
  return prisma.tauxChange.upsert({
    where: { devise_dateEffet: { devise: d, dateEffet } },
    create: { devise: d, tauxVersEur, dateEffet },
    update: { tauxVersEur },
  });
}

// ─── Chargement des mandats ───────────────────────────

const mandatInclude = {
  entreprise: { select: { nom: true, delaiPaiementJours: true } },
  sales: { select: { id: true, nom: true, prenom: true } },
  recruteur: { select: { id: true, nom: true, prenom: true } },
  candidatures: {
    include: { candidat: { select: { nom: true, prenom: true, salaireSouhaite: true, salaireActuel: true } } },
  },
} as const;

type MandatRow = NonNullable<Awaited<ReturnType<typeof loadMandatRow>>>;
function loadMandatRow(id: string) {
  return prisma.mandat.findUnique({ where: { id }, include: mandatInclude });
}

const personName = (u: { id: string; nom: string; prenom: string | null } | null) =>
  u ? { id: u.id, nom: (u.prenom || u.nom || '').trim() || u.nom } : null;

export function processSteps(raw: unknown): { id: string; label: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s: any, i) => ({ id: String(s?.id ?? i + 1), label: String(s?.label ?? s ?? '').trim() }))
    .filter((s) => s.label);
}

export function toMandatInput(m: MandatRow): MandatInput {
  return {
    id: m.id,
    titrePoste: m.titrePoste,
    entrepriseNom: m.entreprise?.nom ?? '',
    nbPostes: m.nbPostes,
    feeType: m.feeType,
    feePourcentage: Number(m.feePourcentage),
    feeMontantFixe: m.feeMontantFixe,
    feeMontantEstime: m.feeMontantEstime,
    devise: m.devise,
    salaireMin: m.salaireMin,
    salaireMax: m.salaireMax,
    sourceDeal: m.sourceDeal,
    paraformNbVersements: m.paraformNbVersements,
    splitSalesPct: m.splitSalesPct,
    processEtapes: processSteps(m.processEntretien).map((s) => s.label),
    paymentTerms: m.paymentTerms,
    delaiPaiementClientJours: m.entreprise?.delaiPaiementJours ?? 30,
    sales: personName(m.sales),
    recruteur: personName(m.recruteur),
    candidatures: m.candidatures.map((c) => ({
      id: c.id,
      candidatNom: `${c.candidat?.prenom ?? ''} ${c.candidat?.nom ?? ''}`.trim(),
      stage: c.stage as Stage,
      processEtape: c.processEtape,
      dateProchainEntretien: c.dateProchainEntretien,
      retourAttenteDepuis: c.retourAttenteDepuis,
      packageFixe: c.packageFixe,
      packageVariable: c.packageVariable,
      salaireCandidat: c.candidat?.salaireSouhaite ?? c.candidat?.salaireActuel ?? null,
      dateDemarrage: c.dateDemarrage,
      probaOverride: c.probaOverride != null ? Number(c.probaOverride) : null,
      feeOverrideEur: c.feeOverrideEur,
      moisFacturationOverride: c.moisFacturationOverride,
    })),
  };
}

export interface ForecastFilters {
  personId?: string;       // sales ou recruteur
  source?: string;         // sourceDeal, ex. PARAFORM ; "DIRECT" = sans source
  billingFrom?: string;    // YYYY-MM
  billingTo?: string;      // YYYY-MM
  lostSince?: string;      // YYYY-MM-DD
  today?: Date;
}

/** Postes ouverts de tous les mandats clients actifs (VIVIER exclus). */
export async function computeDeals(today = new Date()): Promise<{ deals: DealLine[]; warnings: string[]; settings: ForecastSettingsInput }> {
  const [s, fx, mandats] = await Promise.all([
    getSettings(),
    getFxRates(today),
    prisma.mandat.findMany({
      // GAGNE n'est gardé que pour les mandats à plusieurs postes (des postes peuvent rester ouverts) :
      // les anciens mandats gagnés sans candidature placée ne doivent pas revenir dans le pipe.
      where: {
        type: 'CLIENT',
        OR: [{ statut: { in: ['OUVERT', 'EN_COURS'] } }, { statut: 'GAGNE', nbPostes: { gt: 1 } }],
      },
      include: mandatInclude,
    }),
  ]);
  const settings = settingsInput(s);
  const warnings: string[] = [];
  const deals: DealLine[] = [];
  for (const m of mandats) {
    try {
      deals.push(...computeMandatDeals(toMandatInput(m), fx, today, settings));
    } catch (err) {
      warnings.push(`${m.titrePoste} (${m.entreprise?.nom ?? ''}): ${(err as Error).message}`);
    }
  }
  return { deals, warnings, settings };
}

export async function getForecast(f: ForecastFilters = {}) {
  const today = f.today ?? new Date();
  const { deals: all, warnings, settings } = await computeDeals(today);
  let deals = all;
  if (f.personId) deals = deals.filter((d) => d.sales?.id === f.personId || d.recruiter?.id === f.personId);
  if (f.source) {
    const src = f.source.toUpperCase();
    deals = deals.filter((d) => (src === 'DIRECT' ? !d.source : (d.source || '').toUpperCase() === src));
  }
  if (f.billingFrom) deals = deals.filter((d) => d.billing_month >= f.billingFrom!);
  if (f.billingTo) deals = deals.filter((d) => d.billing_month <= f.billingTo!);
  deals = [...deals].sort((a, b) => b.weighted_eur - a.weighted_eur || b.fee_eur - a.fee_eur);

  const lostSince = f.lostSince ? new Date(f.lostSince) : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const lost = await listLostDeals(lostSince, f.personId);
  const processMissing = [...new Map(deals.filter((d) => d.process_missing).map((d) => [d.mandate_id, { mandate_id: d.mandate_id, title: d.mandate_title, company: d.company }])).values()];

  return {
    label: 'Pipe partagé',
    generated_at: today.toISOString(),
    settings,
    totals: totals(deals),
    deals,
    recaps: recaps(deals),
    lost,
    process_missing: processMissing,
    warnings,
  };
}

// ─── Process d'entretien ──────────────────────────────

export async function setInterviewProcess(mandatId: string, labels: string[]) {
  const m = await prisma.mandat.findUnique({ where: { id: mandatId }, select: { id: true } });
  if (!m) throw new NotFoundError('Mandat', mandatId);
  const steps = labels.map((l) => String(l).trim()).filter(Boolean).map((label, i) => ({ id: String(i + 1), label }));
  if (steps.length > 20) throw new ValidationError('An interview process has at most 20 steps');
  await prisma.$transaction([
    prisma.mandat.update({ where: { id: mandatId }, data: { processEntretien: steps } }),
    // Une étape courante au-delà du nouveau process est ramenée à la dernière étape
    ...(steps.length
      ? [prisma.candidature.updateMany({ where: { mandatId, processEtape: { gt: steps.length } }, data: { processEtape: steps.length } })]
      : [prisma.candidature.updateMany({ where: { mandatId }, data: { processEtape: null } })]),
  ]);
  return steps;
}

export interface ProcessStepInput {
  step?: number | null;                 // k (1..n) ; null = efface
  nextInterviewAt?: string | null;      // ISO
  waitingSince?: string | null;         // YYYY-MM-DD ; null = plus en attente
}

export async function setCandidateProcessStep(candidatureId: string, input: ProcessStepInput) {
  const c = await prisma.candidature.findUnique({ where: { id: candidatureId }, include: { mandat: { select: { processEntretien: true } } } });
  if (!c) throw new NotFoundError('Candidature', candidatureId);
  const steps = processSteps(c.mandat.processEntretien);
  const data: Record<string, unknown> = {};
  if (input.step !== undefined) {
    if (input.step !== null) {
      if (steps.length === 0) throw new ValidationError('This mandate has no interview process yet: set it first (set_mandate_interview_process).');
      if (!Number.isInteger(input.step) || input.step < 1 || input.step > steps.length) {
        throw new ValidationError(`Step must be between 1 and ${steps.length}`);
      }
    }
    data.processEtape = input.step;
  }
  if (input.nextInterviewAt !== undefined) data.dateProchainEntretien = input.nextInterviewAt ? new Date(input.nextInterviewAt) : null;
  if (input.waitingSince !== undefined) data.retourAttenteDepuis = input.waitingSince ? new Date(input.waitingSince) : null;
  const updated = await prisma.candidature.update({ where: { id: candidatureId }, data });
  return { ...updated, process_steps: steps };
}

// ─── Overrides ────────────────────────────────────────

export interface OverrideInput {
  proba?: number | null;        // %, null = revient au calcul
  feeEur?: number | null;
  billingMonth?: string | null; // YYYY-MM
}

export async function overrideDeal(candidatureId: string, input: OverrideInput, userId: string) {
  const c = await prisma.candidature.findUnique({ where: { id: candidatureId }, select: { id: true } });
  if (!c) throw new NotFoundError('Candidature', candidatureId);
  const data: Record<string, unknown> = { overrideAt: new Date(), overrideById: userId };
  if (input.proba !== undefined) {
    if (input.proba !== null && (input.proba < 0 || input.proba > 100)) throw new ValidationError('Probability must be between 0 and 100');
    data.probaOverride = input.proba;
  }
  if (input.feeEur !== undefined) {
    if (input.feeEur !== null && (!Number.isFinite(input.feeEur) || input.feeEur < 0)) throw new ValidationError('Fee must be a positive amount');
    data.feeOverrideEur = input.feeEur === null ? null : Math.round(input.feeEur);
  }
  if (input.billingMonth !== undefined) {
    if (input.billingMonth !== null && !/^\d{4}-\d{2}$/.test(input.billingMonth)) throw new ValidationError('Billing month must be YYYY-MM');
    data.moisFacturationOverride = input.billingMonth ? new Date(`${input.billingMonth}-01T00:00:00Z`) : null;
  }
  return prisma.candidature.update({ where: { id: candidatureId }, data });
}

// ─── Deals perdus ─────────────────────────────────────

export async function listLostDeals(since: Date, personId?: string) {
  const rows = await prisma.dealPerdu.findMany({
    where: {
      datePerte: { gte: since },
      ...(personId ? { mandat: { OR: [{ salesId: personId }, { recruteurId: personId }] } } : {}),
    },
    include: {
      mandat: { select: { titrePoste: true, entreprise: { select: { nom: true } } } },
      candidature: { select: { candidat: { select: { nom: true, prenom: true } } } },
    },
    orderBy: { datePerte: 'desc' },
  });
  const items = rows.map((r) => ({
    id: r.id,
    mandate_id: r.mandatId,
    deal: `${r.mandat.entreprise?.nom ?? ''}, ${r.mandat.titrePoste}`.replace(/^, /, ''),
    candidate: r.candidature?.candidat ? `${r.candidature.candidat.prenom ?? ''} ${r.candidature.candidat.nom}`.trim() : null,
    fee_eur: r.feePerduEur,
    reason: r.raison,
    lost_on: r.datePerte.toISOString().slice(0, 10),
  }));
  return { since: since.toISOString().slice(0, 10), items, total_fee_eur: items.reduce((a, x) => a + x.fee_eur, 0) };
}

export async function addLostDeal(input: { mandatId: string; candidatureId?: string | null; feeEur: number; reason: string; date?: string }, userId?: string) {
  if (!input.reason?.trim()) throw new ValidationError('A reason is required for a lost deal');
  return prisma.dealPerdu.create({
    data: {
      mandatId: input.mandatId,
      candidatureId: input.candidatureId ?? null,
      feePerduEur: Math.round(input.feeEur),
      raison: input.reason.trim(),
      datePerte: input.date ? new Date(input.date) : new Date(),
      createdById: userId ?? null,
    },
  });
}

export async function updateLostDeal(id: string, input: { reason?: string; feeEur?: number }) {
  const data: Record<string, unknown> = {};
  if (input.reason !== undefined) {
    if (!input.reason.trim()) throw new ValidationError('A reason is required for a lost deal');
    data.raison = input.reason.trim();
  }
  if (input.feeEur !== undefined) data.feePerduEur = Math.round(input.feeEur);
  return prisma.dealPerdu.update({ where: { id }, data });
}

/** Postes ouverts d'un mandat, calculés à l'instant (avant ou après un changement). */
async function mandatDeals(mandatId: string, today = new Date()): Promise<DealLine[]> {
  const [m, s, fx] = await Promise.all([loadMandatRow(mandatId), getSettings(), getFxRates(today)]);
  if (!m || m.type !== 'CLIENT') return [];
  try {
    return computeMandatDeals(toMandatInput(m), fx, today, settingsInput(s));
  } catch {
    return [];
  }
}

/** À appeler AVANT un passage en Lost : photo des postes du mandat. */
export async function snapshotBeforeLoss(mandatId: string) {
  return mandatDeals(mandatId);
}

/**
 * Après le passage d'une candidature en Lost : si elle menait un poste et qu'aucun autre candidat
 * côté client ne reprend ce poste, on enregistre un deal perdu (fee du poste, raison = motif de refus).
 */
export async function recordCandidatureLoss(
  before: DealLine[],
  candidatureId: string,
  motif: string | null | undefined,
  detail: string | null | undefined,
  userId: string,
) {
  const led = before.find((d) => d.lead_candidature_id === candidatureId);
  if (!led) return null;
  const after = await mandatDeals(led.mandate_id);
  const ledBefore = before.filter((d) => d.lead_candidature_id).length;
  const ledAfter = after.filter((d) => d.lead_candidature_id).length;
  if (ledAfter >= ledBefore) return null; // un autre candidat reprend le poste : pas de deal perdu
  const reason = [motif ? MOTIF_LABEL_FR[motif] ?? motif : null, detail?.trim() || null].filter(Boolean).join(' : ');
  return addLostDeal({ mandatId: led.mandate_id, candidatureId, feeEur: led.fee_eur, reason: reason || 'Autre' }, userId);
}

/**
 * Mandat fermé sans placement : un deal perdu par poste encore ouvert.
 * La raison est obligatoire sur les nouveaux parcours (dashboard, MCP) ; depuis les écrans existants qui
 * ne la demandent pas encore, la perte est enregistrée avec « Raison à saisir », à compléter depuis le dashboard.
 */
export async function recordMandatClosure(mandatId: string, before: DealLine[], newStatut: string, reason: string | null | undefined, userId?: string) {
  if (!LOSS_STATUTS.includes(newStatut) || before.length === 0) return [];
  const r = reason?.trim() || 'Raison à saisir';
  const created = [];
  for (const d of before) {
    created.push(await addLostDeal({ mandatId, candidatureId: d.lead_candidature_id, feeEur: d.fee_eur, reason: r }, userId));
  }
  return created;
}

// ─── Photo hebdomadaire ───────────────────────────────

export async function takeWeeklySnapshot(today = new Date()) {
  const { deals } = await computeDeals(today);
  const t = totals(deals);
  const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const cash = await import('./cash.service.js').then((m) => m.snapshotCashFigures(today, deals)).catch(() => null);
  const data = {
    ...(cash ?? {}),
    feeTotalEur: t.fee_eur,
    pondereEur: t.weighted_eur,
    placementsAttendus: t.expected_placements,
    nbPostes: t.positions,
    nbProbasForcees: t.forced_probas,
    details: deals.map((d) => ({
      deal_id: d.deal_id, mandate: d.mandate_title, company: d.company, step: d.step_label,
      proba: d.proba, proba_overridden: d.proba_overridden, fee_eur: d.fee_eur, weighted_eur: d.weighted_eur, billing_month: d.billing_month,
    })),
  };
  return prisma.forecastSnapshot.upsert({ where: { dateSnapshot: day }, create: { dateSnapshot: day, ...data }, update: data });
}

export async function listSnapshots(limit = 26) {
  const rows = await prisma.forecastSnapshot.findMany({ orderBy: { dateSnapshot: 'desc' }, take: limit, select: {
    dateSnapshot: true, feeTotalEur: true, pondereEur: true, placementsAttendus: true, facturePrevuEur: true,
    scenarioNormalEur: true, nbPostes: true, nbProbasForcees: true,
  } });
  return rows.map((r) => ({
    date: r.dateSnapshot.toISOString().slice(0, 10),
    fee_eur: r.feeTotalEur,
    weighted_eur: r.pondereEur,
    expected_placements: Number(r.placementsAttendus),
    billed_forecast_eur: r.facturePrevuEur,
    normal_scenario_eur: r.scenarioNormalEur,
    positions: r.nbPostes,
    forced_probas: r.nbProbasForcees,
  }));
}

export { monthStart, DEFAULT_SETTINGS };
