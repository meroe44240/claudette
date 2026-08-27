import prisma from '../../lib/db.js';

// ── Objectif financier (CA) — trimestriel ────────────────────────────────
// Le CA est compté DÈS QU'UN MANDAT PASSE EN « GAGNÉ » (décision produit) :
// montant = feeMontantFacture s'il existe, sinon feeMontantEstime. La date de
// rattachement au trimestre = dateCloture (posée à la clôture) sinon updatedAt.

export interface Quarter {
  start: Date;
  end: Date;
  label: string; // ex. « T3 2026 »
  q: number; // 1..4
  year: number;
}

export function currentQuarter(now: Date = new Date()): Quarter {
  const year = now.getFullYear();
  const qIndex = Math.floor(now.getMonth() / 3); // 0..3
  const start = new Date(year, qIndex * 3, 1, 0, 0, 0, 0);
  const end = new Date(year, qIndex * 3 + 3, 1, 0, 0, 0, 0);
  return { start, end, label: `T${qIndex + 1} ${year}`, q: qIndex + 1, year };
}

const feeOf = (m: { feeMontantFacture: number | null; feeMontantEstime: number | null }): number =>
  m.feeMontantFacture ?? m.feeMontantEstime ?? 0;

/**
 * CA « gagné » sur une période (mandats GAGNE). Si `userId` fourni, ne compte
 * que les mandats où la personne est sales / recruteur / assigné / créateur.
 */
export async function wonCa(
  range: { start: Date; end: Date },
  userId?: string,
): Promise<number> {
  const mandats = await prisma.mandat.findMany({
    where: {
      statut: 'GAGNE',
      ...(userId
        ? {
            OR: [
              { salesId: userId },
              { recruteurId: userId },
              { assignedToId: userId },
              { createdById: userId },
            ],
          }
        : {}),
    },
    select: { feeMontantFacture: true, feeMontantEstime: true, dateCloture: true, updatedAt: true },
  });
  let total = 0;
  for (const m of mandats) {
    const d = (m.dateCloture ?? m.updatedAt) as Date;
    if (d >= range.start && d < range.end) total += feeOf(m);
  }
  return total;
}

/** Objectif CA trimestriel d'une personne (RecruiterObjective), ou null. */
export async function userQuarterlyCaObjective(userId: string): Promise<number | null> {
  const o = await prisma.recruiterObjective.findFirst({
    where: { userId, period: 'quarterly', metric: 'ca' },
    select: { target: true },
  });
  return o?.target ?? null;
}

/**
 * Objectif CA trimestriel de l'agence : réglage global explicite (posé par un
 * admin dans les paramètres généraux), sinon somme des objectifs individuels.
 */
export async function agencyQuarterlyCaObjective(): Promise<number | null> {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (admin) {
    const cfg = await prisma.integrationConfig.findUnique({
      where: { userId_provider: { userId: admin.id, provider: 'general_settings' } },
    });
    const v = (cfg?.config as Record<string, unknown> | undefined)?.objectifCaAgenceTrimestre;
    if (typeof v === 'number' && v > 0) return v;
  }
  const objs = await prisma.recruiterObjective.findMany({
    where: { period: 'quarterly', metric: 'ca' },
    select: { target: true },
  });
  const sum = objs.reduce((s, o) => s + (o.target || 0), 0);
  return sum > 0 ? sum : null;
}

const pct = (ca: number, cible: number | null): number | null =>
  cible && cible > 0 ? Math.round((ca / cible) * 100) : null;

export interface ObjectifBlock {
  periode: string;
  perso: { ca: number; cible: number | null; pct: number | null };
  agence: { ca: number; cible: number | null; pct: number | null };
}

/** Bloc « objectif financier » (perso + agence) pour le trimestre en cours. */
export async function getObjectifFinancier(userId: string): Promise<ObjectifBlock> {
  const quarter = currentQuarter();
  const [caPerso, ciblePerso, caAgence, cibleAgence] = await Promise.all([
    wonCa(quarter, userId),
    userQuarterlyCaObjective(userId),
    wonCa(quarter),
    agencyQuarterlyCaObjective(),
  ]);
  return {
    periode: quarter.label,
    perso: { ca: caPerso, cible: ciblePerso, pct: pct(caPerso, ciblePerso) },
    agence: { ca: caAgence, cible: cibleAgence, pct: pct(caAgence, cibleAgence) },
  };
}
