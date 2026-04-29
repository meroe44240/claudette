import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';
import { paginatedResult, paginationToSkipTake } from '../../lib/pagination.js';
import type { PaginationParams } from '../../lib/pagination.js';
import type { CreateMandatInput, UpdateMandatInput, UpdateFeeInput } from './mandat.schema.js';
import { scoreCandidature } from '../candidatures/scoring.service.js';
import { notifyNouvelleOpportunite, notifyCloseWon } from '../slack/slack.service.js';

function calculateFeeMontantEstime(salaireMin?: number | null, salaireMax?: number | null, feePourcentage?: number | null): number | undefined {
  if (salaireMin != null && salaireMax != null && feePourcentage != null) {
    return Math.round(((salaireMin + salaireMax) / 2) * feePourcentage / 100);
  }
  return undefined;
}

/**
 * Recalculate typeClient for a client based on their mandats.
 * - 2+ mandats total → RECURRENT
 * - 1+ active mandat (OUVERT/EN_COURS) → CLIENT_ACTIF
 * - Otherwise → keep manual value (don't override)
 */
async function recalculateTypeClient(clientId: string) {
  const mandats = await prisma.mandat.findMany({
    where: { clientId },
    select: { id: true, statut: true },
  });

  const total = mandats.length;
  const activeCount = mandats.filter((m) => m.statut === 'OUVERT' || m.statut === 'EN_COURS').length;

  let newType: string | null = null;
  if (total >= 2) {
    newType = 'RECURRENT';
  } else if (activeCount >= 1) {
    newType = 'CLIENT_ACTIF';
  }

  // Only update if we need to set an auto-type
  if (newType) {
    await prisma.client.update({
      where: { id: clientId },
      data: { typeClient: newType as any },
    });
  }
}

export async function list(
  params: PaginationParams,
  search?: string,
  statut?: string,
  priorite?: string,
  entrepriseId?: string,
  assignedToId?: string,
) {
  const where: any = {};

  if (search) {
    where.OR = [
      { titrePoste: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { entreprise: { nom: { contains: search, mode: 'insensitive' } } },
    ];
  }

  if (statut) {
    where.statut = statut;
  }

  if (priorite) {
    where.priorite = priorite;
  }

  if (entrepriseId) {
    where.entrepriseId = entrepriseId;
  }

  if (assignedToId) {
    where.assignedToId = assignedToId;
  }

  const { skip, take } = paginationToSkipTake(params);

  const [data, total] = await Promise.all([
    prisma.mandat.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        entreprise: { select: { id: true, nom: true } },
        client: { select: { id: true, nom: true, prenom: true } },
        assignedTo: { select: { id: true, nom: true, prenom: true } },
        _count: { select: { candidatures: true } },
      },
    }),
    prisma.mandat.count({ where }),
  ]);

  return paginatedResult(data, total, params);
}

export async function getById(id: string) {
  const mandat = await prisma.mandat.findUnique({
    where: { id },
    include: {
      entreprise: true,
      client: true,
      assignedTo: { select: { id: true, nom: true, prenom: true } },
      candidatures: {
        include: {
          candidat: {
            select: {
              id: true,
              nom: true,
              prenom: true,
              email: true,
              telephone: true,
              posteActuel: true,
              entrepriseActuelle: true,
              localisation: true,
              linkedinUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!mandat) throw new NotFoundError('Mandat', id);
  return mandat;
}

export async function create(data: CreateMandatInput, createdById: string) {
  // Verify entreprise exists
  const entreprise = await prisma.entreprise.findUnique({ where: { id: data.entrepriseId } });
  if (!entreprise) throw new NotFoundError('Entreprise', data.entrepriseId);

  // Verify client exists
  const client = await prisma.client.findUnique({ where: { id: data.clientId } });
  if (!client) throw new NotFoundError('Client', data.clientId);

  const feeMontantEstime = calculateFeeMontantEstime(data.salaireMin, data.salaireMax, data.feePourcentage);

  const mandat = await prisma.mandat.create({
    data: {
      ...data,
      feeMontantEstime,
      createdById,
      assignedToId: data.assignedToId ?? createdById,
    },
  });

  // Recalculate client typeClient after mandat creation
  await recalculateTypeClient(data.clientId);

  // Fire-and-forget Slack notification for new opportunity
  (async () => {
    const fullMandat = await prisma.mandat.findUnique({
      where: { id: mandat.id },
      include: {
        entreprise: { select: { nom: true } },
        assignedTo: { select: { prenom: true } },
      },
    });
    if (fullMandat) {
      await notifyNouvelleOpportunite({
        mandatTitre: fullMandat.titrePoste,
        entrepriseNom: fullMandat.entreprise?.nom || 'N/A',
        recruteurPrenom: fullMandat.assignedTo?.prenom || null,
        feeMontantEstime: fullMandat.feeMontantEstime,
      });
    }
  })().catch(() => {});

  return mandat;
}

export async function update(id: string, data: UpdateMandatInput) {
  const existing = await prisma.mandat.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Mandat', id);

  // Determine values for fee recalculation
  const salaireMin = data.salaireMin !== undefined ? data.salaireMin : existing.salaireMin;
  const salaireMax = data.salaireMax !== undefined ? data.salaireMax : existing.salaireMax;
  const feePourcentage = data.feePourcentage !== undefined ? data.feePourcentage : Number(existing.feePourcentage);

  const updateData: any = { ...data };

  // Recalculate feeMontantEstime if salary or fee% changes
  if (data.salaireMin !== undefined || data.salaireMax !== undefined || data.feePourcentage !== undefined) {
    const estimated = calculateFeeMontantEstime(salaireMin, salaireMax, feePourcentage);
    if (estimated !== undefined) {
      updateData.feeMontantEstime = estimated;
    }
  }

  const updated = await prisma.mandat.update({
    where: { id },
    data: updateData,
  });

  // Recalculate client typeClient if mandat statut changed
  if (data.statut !== undefined) {
    await recalculateTypeClient(existing.clientId);
  }

  // Fire-and-forget Slack notification when mandat is won
  if (data.statut === 'GAGNE' && existing.statut !== 'GAGNE') {
    (async () => {
      // Find the placed candidat (if any) for this mandat
      const placedCandidature = await prisma.candidature.findFirst({
        where: { mandatId: id, stage: 'PLACE' },
        include: { candidat: { select: { nom: true, prenom: true } } },
      });
      const fullMandat = await prisma.mandat.findUnique({
        where: { id },
        include: {
          entreprise: { select: { nom: true } },
          assignedTo: { select: { prenom: true } },
        },
      });
      if (fullMandat) {
        await notifyCloseWon({
          candidatPrenom: placedCandidature?.candidat?.prenom || null,
          candidatNom: placedCandidature?.candidat?.nom || 'Candidat non identifié',
          entrepriseNom: fullMandat.entreprise?.nom || 'N/A',
          mandatTitre: fullMandat.titrePoste,
          feeMontant: fullMandat.feeMontantFacture || fullMandat.feeMontantEstime || null,
          recruteurPrenom: fullMandat.assignedTo?.prenom || null,
        });
      }
    })().catch(() => {});
  }

  return updated;
}

export async function remove(id: string) {
  const existing = await prisma.mandat.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Mandat', id);

  // Delete candidatures and their stage history
  const candidatures = await prisma.candidature.findMany({
    where: { mandatId: id },
    select: { id: true },
  });

  if (candidatures.length > 0) {
    await prisma.stageHistory.deleteMany({
      where: { candidatureId: { in: candidatures.map((c) => c.id) } },
    });
    await prisma.candidature.deleteMany({ where: { mandatId: id } });
  }

  // Delete mandat-related activites
  const activites = await prisma.activite.findMany({
    where: { entiteType: 'MANDAT', entiteId: id },
    select: { id: true },
  });

  if (activites.length > 0) {
    await prisma.fichierActivite.deleteMany({
      where: { activiteId: { in: activites.map((a) => a.id) } },
    });
    await prisma.activite.deleteMany({
      where: { entiteType: 'MANDAT', entiteId: id },
    });
  }

  return prisma.mandat.delete({ where: { id } });
}

export async function clone(id: string) {
  const existing = await prisma.mandat.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Mandat', id);

  return prisma.mandat.create({
    data: {
      titrePoste: `${existing.titrePoste} (copie)`,
      entrepriseId: existing.entrepriseId,
      clientId: existing.clientId,
      description: existing.description,
      localisation: existing.localisation,
      salaireMin: existing.salaireMin,
      salaireMax: existing.salaireMax,
      feePourcentage: existing.feePourcentage,
      feeMontantEstime: existing.feeMontantEstime,
      statut: 'OUVERT',
      priorite: existing.priorite,
      notes: existing.notes,
      createdById: existing.createdById,
    },
  });
}

export async function getKanban(id: string) {
  const existing = await prisma.mandat.findUnique({
    where: { id },
    select: {
      id: true,
      salaireMin: true,
      salaireMax: true,
      localisation: true,
      scorecard: true,
    },
  });
  if (!existing) throw new NotFoundError('Mandat', id);

  const candidatures = await prisma.candidature.findMany({
    where: { mandatId: id },
    include: {
      candidat: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          email: true,
          telephone: true,
          posteActuel: true,
          entrepriseActuelle: true,
          localisation: true,
          salaireSouhaite: true,
          anneesExperience: true,
          disponibilite: true,
          tags: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Extract tags from scorecard if available
  const mandatTags: string[] = [];
  if (existing.scorecard && typeof existing.scorecard === 'object') {
    const sc = existing.scorecard as any;
    if (Array.isArray(sc.tags)) mandatTags.push(...sc.tags);
    if (Array.isArray(sc.competences)) mandatTags.push(...sc.competences);
  }

  // Compute compatibility score for each candidature
  const mandatForScoring = { ...existing, tags: mandatTags };
  const scoredCandidatures = candidatures.map((c) => ({
    ...c,
    score: scoreCandidature(c.candidat, mandatForScoring),
  }));

  // Group candidatures by stage
  const stages = ['SOURCING', 'CONTACTE', 'ENTRETIEN_1', 'ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE', 'REFUSE'] as const;
  const kanban: Record<string, typeof scoredCandidatures> = {};

  for (const stage of stages) {
    kanban[stage] = scoredCandidatures.filter((c) => c.stage === stage);
  }

  return kanban;
}

// ─── TIMELINE: full history of a mandat ──────────────
//
// Aggregates, for a given mandat, all activity sources into a single
// chronological feed:
//   • Stage transitions  (StageHistory for all candidatures of the mandat)
//   • Candidatures created/removed
//   • Activities (notes, emails, calls, meetings) linked directly to the mandat
//   • Activities linked to the candidats of the mandat (filtered to entities
//     belonging to this pipeline)
//   • Mandate status changes (fee events, etc.) from Activite source = SYSTEM
//
// Returns items sorted by date desc, ready to be displayed as a timeline.

export type TimelineItem =
  | {
      kind: 'stage_change';
      id: string;
      date: string;
      fromStage: string | null;
      toStage: string;
      candidat: { id: string; nom: string; prenom: string | null };
      user: { nom: string; prenom: string | null } | null;
    }
  | {
      kind: 'candidature_created';
      id: string;
      date: string;
      stage: string;
      candidat: { id: string; nom: string; prenom: string | null };
    }
  | {
      kind: 'activite';
      id: string;
      date: string;
      type: string;
      direction: string | null;
      titre: string | null;
      contenu: string | null;
      source: string;
      entiteType: string | null;
      entiteId: string | null;
      candidat: { id: string; nom: string; prenom: string | null } | null;
      user: { nom: string; prenom: string | null } | null;
    };

export async function getTimeline(id: string): Promise<TimelineItem[]> {
  const mandat = await prisma.mandat.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!mandat) throw new NotFoundError('Mandat', id);

  // 1. All candidatures (ids + linked candidats) for this mandat
  const candidatures = await prisma.candidature.findMany({
    where: { mandatId: id },
    select: {
      id: true,
      stage: true,
      createdAt: true,
      candidat: { select: { id: true, nom: true, prenom: true } },
    },
  });
  const candidatureIds = candidatures.map((c) => c.id);
  const candidatIds = candidatures.map((c) => c.candidat.id);
  const candidatureByCandidatId = new Map(
    candidatures.map((c) => [c.candidat.id, c]),
  );

  // 2. Stage transitions for those candidatures
  const stageHistory = candidatureIds.length > 0
    ? await prisma.stageHistory.findMany({
        where: { candidatureId: { in: candidatureIds } },
        select: {
          id: true,
          fromStage: true,
          toStage: true,
          changedAt: true,
          changedById: true,
          candidatureId: true,
        },
        orderBy: { changedAt: 'desc' },
      })
    : [];

  // Resolve users for stage transitions in one query
  const userIds = Array.from(
    new Set(stageHistory.map((h) => h.changedById).filter((x): x is string => !!x)),
  );
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, nom: true, prenom: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  // Map candidatureId -> candidat
  const candidatByCandidatureId = new Map(
    candidatures.map((c) => [c.id, c.candidat]),
  );

  // 3. Activities attached directly to the mandat
  const mandatActivites = await prisma.activite.findMany({
    where: { entiteType: 'MANDAT', entiteId: id },
    select: {
      id: true,
      type: true,
      direction: true,
      titre: true,
      contenu: true,
      source: true,
      entiteType: true,
      entiteId: true,
      createdAt: true,
      user: { select: { nom: true, prenom: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // 4. Activities on the candidats of the mandat (so we see calls/emails
  //    with the candidats as part of this mandat's history)
  const candidatActivites = candidatIds.length > 0
    ? await prisma.activite.findMany({
        where: { entiteType: 'CANDIDAT', entiteId: { in: candidatIds } },
        select: {
          id: true,
          type: true,
          direction: true,
          titre: true,
          contenu: true,
          source: true,
          entiteType: true,
          entiteId: true,
          createdAt: true,
          user: { select: { nom: true, prenom: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    : [];

  // ─── Build unified timeline ───
  const items: TimelineItem[] = [];

  for (const h of stageHistory) {
    const candidat = candidatByCandidatureId.get(h.candidatureId);
    if (!candidat) continue;
    items.push({
      kind: 'stage_change',
      id: h.id,
      date: h.changedAt.toISOString(),
      fromStage: h.fromStage,
      toStage: h.toStage,
      candidat,
      user: h.changedById ? userById.get(h.changedById) || null : null,
    });
  }

  for (const c of candidatures) {
    items.push({
      kind: 'candidature_created',
      id: c.id,
      date: c.createdAt.toISOString(),
      stage: c.stage,
      candidat: c.candidat,
    });
  }

  for (const a of mandatActivites) {
    items.push({
      kind: 'activite',
      id: a.id,
      date: a.createdAt.toISOString(),
      type: a.type,
      direction: a.direction,
      titre: a.titre,
      contenu: a.contenu,
      source: a.source,
      entiteType: a.entiteType,
      entiteId: a.entiteId,
      candidat: null,
      user: a.user,
    });
  }

  for (const a of candidatActivites) {
    const cand = a.entiteId ? candidatureByCandidatId.get(a.entiteId)?.candidat : null;
    items.push({
      kind: 'activite',
      id: a.id,
      date: a.createdAt.toISOString(),
      type: a.type,
      direction: a.direction,
      titre: a.titre,
      contenu: a.contenu,
      source: a.source,
      entiteType: a.entiteType,
      entiteId: a.entiteId,
      candidat: cand || null,
      user: a.user,
    });
  }

  // Sort desc by date
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return items;
}

export async function updateFee(id: string, data: UpdateFeeInput) {
  const existing = await prisma.mandat.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Mandat', id);

  return prisma.mandat.update({
    where: { id },
    data: {
      ...(data.feeMontantFacture !== undefined && { feeMontantFacture: data.feeMontantFacture }),
      ...(data.feeStatut !== undefined && { feeStatut: data.feeStatut }),
    },
  });
}
