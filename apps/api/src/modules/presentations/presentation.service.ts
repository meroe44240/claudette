import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';

/**
 * Présentations : un candidat présenté (poussé) à une société.
 * Sources : à la main (interface, MCP), le pipeline (passage en « Envoi client »), List Push.
 */

export const CANAUX = ['EMAIL', 'LINKEDIN', 'TELEPHONE', 'PORTAIL', 'RDV', 'AUTRE'] as const;
export const STATUTS = ['ENVOYEE', 'SANS_REPONSE', 'INTERESSE', 'ENTRETIEN', 'REFUSEE', 'EMBAUCHE'] as const;
export type Canal = typeof CANAUX[number];
export type Statut = typeof STATUTS[number];

const APP_URL = (process.env.APP_URL || process.env.FRONTEND_URL || 'https://ats.propium.co').replace(/\/$/, '');

/** Lien vers le one-pager anonymisé du candidat (outil CV & Dossier, format push). */
export const anonymizedCvLink = (candidatId: string) => `${APP_URL}/outils?outil=cv&candidat=${candidatId}`;

const include = {
  candidat: { select: { id: true, prenom: true, nom: true, posteActuel: true } },
  entreprise: { select: { id: true, nom: true } },
  presentedBy: { select: { id: true, prenom: true, nom: true, estAgent: true } },
} as const;

function present(p: any) {
  return {
    id: p.id,
    candidate: p.candidat ? { id: p.candidat.id, name: [p.candidat.prenom, p.candidat.nom].filter(Boolean).join(' '), title: p.candidat.posteActuel } : { id: p.candidatId },
    company: p.entreprise ? { id: p.entreprise.id, name: p.entreprise.nom } : { id: p.entrepriseId },
    client_id: p.clientId, mandate_id: p.mandatId, application_id: p.candidatureId, lead_id: p.leadId,
    channel: p.canal, status: p.statut,
    candidate_consent: p.accordCandidat, consent_at: p.accordDate,
    anonymous: p.anonyme, cv_url: p.cvUrl, note: p.note, source: p.source,
    presented_by: p.presentedBy ? { id: p.presentedBy.id, name: [p.presentedBy.prenom, p.presentedBy.nom].filter(Boolean).join(' '), is_agent: p.presentedBy.estAgent } : null,
    presented_at: p.presentedAt, updated_at: p.updatedAt,
  };
}

function check<T extends readonly string[]>(list: T, v: unknown, name: string): T[number] | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const s = String(v).toUpperCase();
  if (!(list as readonly string[]).includes(s)) throw new ValidationError(`${name} invalide : ${v}. Valeurs : ${list.join(', ')}.`);
  return s as T[number];
}

export interface PresentationInput {
  candidatId: string;
  entrepriseId: string;
  clientId?: string | null;
  mandatId?: string | null;
  leadId?: string | null;
  canal?: string;
  statut?: string;
  accordCandidat?: boolean;
  anonyme?: boolean;
  cvUrl?: string | null;
  note?: string | null;
  presentedAt?: string | Date;
}

export async function create(input: PresentationInput, userId?: string, source = 'MANUEL') {
  const [cand, ent] = await Promise.all([
    prisma.candidat.findUnique({ where: { id: input.candidatId }, select: { id: true } }),
    prisma.entreprise.findUnique({ where: { id: input.entrepriseId }, select: { id: true } }),
  ]);
  if (!cand) throw new NotFoundError('Candidat', input.candidatId);
  if (!ent) throw new NotFoundError('Entreprise', input.entrepriseId);
  const p = await prisma.presentation.create({
    data: {
      candidatId: input.candidatId,
      entrepriseId: input.entrepriseId,
      clientId: input.clientId ?? null,
      mandatId: input.mandatId ?? null,
      leadId: input.leadId ?? null,
      canal: check(CANAUX, input.canal, 'Canal') ?? 'EMAIL',
      statut: check(STATUTS, input.statut, 'Statut') ?? 'ENVOYEE',
      accordCandidat: !!input.accordCandidat,
      accordDate: input.accordCandidat ? new Date() : null,
      anonyme: input.anonyme ?? true,
      cvUrl: input.cvUrl ?? null,
      note: input.note ?? null,
      source,
      presentedById: userId ?? null,
      presentedAt: input.presentedAt ? new Date(input.presentedAt) : new Date(),
    },
    include,
  });
  return present(p);
}

export async function update(id: string, data: { canal?: string; statut?: string; accordCandidat?: boolean; anonyme?: boolean; cvUrl?: string | null; note?: string | null; clientId?: string | null }) {
  const existing = await prisma.presentation.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Présentation', id);
  const p = await prisma.presentation.update({
    where: { id },
    data: {
      ...(data.canal !== undefined ? { canal: check(CANAUX, data.canal, 'Canal') } : {}),
      ...(data.statut !== undefined ? { statut: check(STATUTS, data.statut, 'Statut') } : {}),
      ...(data.accordCandidat !== undefined ? { accordCandidat: data.accordCandidat, accordDate: data.accordCandidat ? (existing.accordDate ?? new Date()) : null } : {}),
      ...(data.anonyme !== undefined ? { anonyme: data.anonyme } : {}),
      ...(data.cvUrl !== undefined ? { cvUrl: data.cvUrl } : {}),
      ...(data.note !== undefined ? { note: data.note } : {}),
      ...(data.clientId !== undefined ? { clientId: data.clientId } : {}),
    },
    include,
  });
  return present(p);
}

export async function remove(id: string) {
  const existing = await prisma.presentation.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError('Présentation', id);
  await prisma.presentation.delete({ where: { id } });
  return { id, deleted: true };
}

export async function list(filters: { candidatId?: string; entrepriseId?: string; leadId?: string; mandatId?: string; statut?: string; since?: string; limit?: number }) {
  const where: Record<string, unknown> = {};
  if (filters.candidatId) where.candidatId = filters.candidatId;
  if (filters.entrepriseId) where.entrepriseId = filters.entrepriseId;
  if (filters.leadId) where.leadId = filters.leadId;
  if (filters.mandatId) where.mandatId = filters.mandatId;
  if (filters.statut) where.statut = check(STATUTS, filters.statut, 'Statut');
  if (filters.since) where.presentedAt = { gte: new Date(filters.since) };
  const [rows, total] = await Promise.all([
    prisma.presentation.findMany({ where, include, orderBy: { presentedAt: 'desc' }, take: Math.min(filters.limit ?? 100, 500) }),
    prisma.presentation.count({ where }),
  ]);
  return { total, data: rows.map(present) };
}

/**
 * Le candidat a-t-il déjà été présenté à cette société ? Par id de société, ou par nom
 * (comparaison sans casse) quand l'agent n'a qu'un nom.
 */
export async function isPresented(candidatId: string, company: { entrepriseId?: string; name?: string }) {
  let entrepriseIds: string[] = [];
  if (company.entrepriseId) entrepriseIds = [company.entrepriseId];
  else if (company.name) {
    const ents = await prisma.entreprise.findMany({ where: { nom: { equals: company.name.trim(), mode: 'insensitive' } }, select: { id: true } });
    entrepriseIds = ents.map((e) => e.id);
  } else throw new ValidationError('Passe entrepriseId ou un nom de société.');
  const rows = entrepriseIds.length
    ? await prisma.presentation.findMany({ where: { candidatId, entrepriseId: { in: entrepriseIds } }, include, orderBy: { presentedAt: 'desc' } })
    : [];
  return {
    presented: rows.length > 0,
    count: rows.length,
    last_presented_at: rows[0]?.presentedAt ?? null,
    company_found: entrepriseIds.length > 0,
    presentations: rows.map(present),
  };
}

/** Statut de push du candidat : prêt ou non à être poussé, et où il l'a déjà été. */
export async function pushStatus(candidatId: string) {
  const c = await prisma.candidat.findUnique({
    where: { id: candidatId },
    select: { id: true, prenom: true, nom: true, cvUrl: true, cvTexte: true, cvConsent: true, cvConsentDate: true, aiAnonymizedProfile: true, candidatures: { select: { stage: true } } },
  });
  if (!c) throw new NotFoundError('Candidat', candidatId);
  const pres = await prisma.presentation.findMany({ where: { candidatId }, include, orderBy: { presentedAt: 'desc' } });
  const missing: string[] = [];
  if (!c.cvUrl && !c.cvTexte) missing.push('cv');
  if (!c.cvConsent) missing.push('cv_consent');
  const placed = c.candidatures.some((x) => x.stage === 'PLACE');
  const status = placed ? 'placed' : missing.length ? 'not_ready' : pres.length ? 'pushed' : 'ready';
  const byStatus = pres.reduce<Record<string, number>>((acc, p) => { acc[p.statut] = (acc[p.statut] ?? 0) + 1; return acc; }, {});
  return {
    candidate_id: c.id,
    name: [c.prenom, c.nom].filter(Boolean).join(' '),
    status,
    missing,
    cv_consent: c.cvConsent,
    cv_consent_at: c.cvConsentDate,
    has_anonymized_profile: !!c.aiAnonymizedProfile,
    anonymized_cv_url: anonymizedCvLink(c.id),
    presentations: {
      count: pres.length,
      by_status: byStatus,
      last_presented_at: pres[0]?.presentedAt ?? null,
      companies: [...new Map(pres.map((p) => [p.entrepriseId, { id: p.entrepriseId, name: p.entreprise?.nom }])).values()],
    },
  };
}

// ─── Synchronisation automatique ───

const STAGE_TO_STATUT: Record<string, Statut> = {
  ENVOYE_CLIENT: 'ENVOYEE', ENTRETIEN_CLIENT: 'ENTRETIEN', PROCESS: 'ENTRETIEN', OFFRE: 'ENTRETIEN', PLACE: 'EMBAUCHE', REFUSE: 'REFUSEE',
};

/**
 * Appelé à chaque changement d'étape d'une candidature. À partir de « Envoi client », la
 * présentation à la société du mandat est créée si elle n'existe pas, et son statut suit
 * l'étape. Ne fait jamais échouer le changement d'étape.
 */
export async function syncFromStage(candidatureId: string, toStage: string, userId?: string | null, source = 'PIPELINE') {
  try {
    const statut = STAGE_TO_STATUT[toStage];
    if (!statut) return;
    const existing = await prisma.presentation.findUnique({ where: { candidatureId } });
    if (existing) {
      if (existing.statut !== statut) await prisma.presentation.update({ where: { id: existing.id }, data: { statut } });
      return;
    }
    if (toStage === 'REFUSE') return; // refusé sans avoir été présenté : pas de présentation
    const c = await prisma.candidature.findUnique({
      where: { id: candidatureId },
      select: { candidatId: true, mandatId: true, interetConfirme: true, interetConfirmeDate: true, mandat: { select: { entrepriseId: true, clientId: true } } },
    });
    if (!c) return;
    await prisma.presentation.create({
      data: {
        candidatId: c.candidatId, entrepriseId: c.mandat.entrepriseId, clientId: c.mandat.clientId, mandatId: c.mandatId, candidatureId,
        canal: 'EMAIL', statut, accordCandidat: c.interetConfirme, accordDate: c.interetConfirmeDate, anonyme: false,
        source, presentedById: userId ?? null,
      },
    }).catch((e: any) => { if (e?.code !== 'P2002') throw e; });
  } catch (err) {
    console.warn('[Présentations] synchro étape impossible :', (err as Error).message);
  }
}
