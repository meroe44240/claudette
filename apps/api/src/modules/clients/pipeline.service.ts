import prisma from '../../lib/db.js';
import type { StatutClient } from '@prisma/client';

// ─── TYPES ──────────────────────────────────────────

export interface PipelineStageData {
  statut: StatutClient;
  label: string;
  count: number;
  revenuePotentiel: number;
  clients: Array<{
    id: string;
    nom: string;
    prenom: string | null;
    email: string | null;
    telephone: string | null;
    poste: string | null;
    statutClient: StatutClient;
    entreprise: { id: string; nom: string };
    joursEnStage: number;
    lastActivityDate: string | null;
    revenuePotentiel: number;
    mandatsActifs: number;
  }>;
}

export interface PipelineStats {
  totalClients: number;
  totalPipeValue: number;
  conversionRates: Array<{
    fromStatut: StatutClient;
    toStatut: StatutClient;
    rate: number;
  }>;
  avgDaysPerStage: Array<{
    statut: StatutClient;
    avgDays: number;
  }>;
  revenueByStage: Array<{
    statut: StatutClient;
    revenue: number;
  }>;
}

// ─── CONSTANTS ──────────────────────────────────────

const ALL_STATUTS: StatutClient[] = [
  'LEAD',
  'PREMIER_CONTACT',
  'BESOIN_QUALIFIE',
  'PROPOSITION_ENVOYEE',
  'MANDAT_SIGNE',
  'RECURRENT',
  'INACTIF',
];

const STATUT_LABELS: Record<StatutClient, string> = {
  LEAD: 'Lead',
  PREMIER_CONTACT: 'Premier contact',
  BESOIN_QUALIFIE: 'Besoin qualifie',
  PROPOSITION_ENVOYEE: 'Proposition envoyee',
  MANDAT_SIGNE: 'Mandat signe',
  RECURRENT: 'Recurrent',
  INACTIF: 'Inactif',
};

// ─── GET CLIENT PIPELINE (enhanced) ────────────────

export async function getClientPipeline() {
  // Fetch all clients with their enterprises and mandats
  const clients = await prisma.client.findMany({
    include: {
      entreprise: { select: { id: true, nom: true } },
      mandats: {
        where: { statut: { in: ['OUVERT', 'EN_COURS'] } },
        select: {
          id: true,
          feeMontantEstime: true,
          feeMontantFacture: true,
          feeStatut: true,
          statut: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch last activity for each client
  const clientIds = clients.map((c) => c.id);
  const lastActivities = clientIds.length > 0
    ? await prisma.activite.findMany({
        where: { entiteType: 'CLIENT', entiteId: { in: clientIds } },
        orderBy: { createdAt: 'desc' },
        select: { entiteId: true, createdAt: true },
      })
    : [];

  const lastActivityMap = new Map<string, Date>();
  for (const a of lastActivities) {
    if (a.entiteId && !lastActivityMap.has(a.entiteId)) {
      lastActivityMap.set(a.entiteId, a.createdAt);
    }
  }

  const now = Date.now();

  // Build pipeline stages
  const pipeline: PipelineStageData[] = ALL_STATUTS.map((statut) => {
    const stageClients = clients.filter((c) => c.statutClient === statut);

    const enrichedClients = stageClients.map((c) => {
      const lastAct = lastActivityMap.get(c.id) ?? null;
      const joursEnStage = Math.floor(
        (now - c.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      const revenuePotentiel = c.mandats.reduce(
        (sum, m) => sum + (m.feeMontantEstime ?? 0),
        0,
      );

      return {
        id: c.id,
        nom: c.nom,
        prenom: c.prenom,
        email: c.email,
        telephone: c.telephone,
        poste: c.poste,
        statutClient: c.statutClient,
        entreprise: c.entreprise,
        joursEnStage,
        lastActivityDate: lastAct ? lastAct.toISOString() : null,
        revenuePotentiel,
        mandatsActifs: c.mandats.length,
      };
    });

    const totalRevenue = enrichedClients.reduce(
      (sum, c) => sum + c.revenuePotentiel,
      0,
    );

    return {
      statut,
      label: STATUT_LABELS[statut],
      count: stageClients.length,
      revenuePotentiel: totalRevenue,
      clients: enrichedClients,
    };
  });

  return pipeline;
}

// ─── MOVE CLIENT STAGE ──────────────────────────────

export async function moveClientStage(
  clientId: string,
  newStatut: StatutClient,
  userId?: string,
) {
  const existing = await prisma.client.findUnique({ where: { id: clientId } });
  if (!existing) throw new Error('Client introuvable');

  const oldStatut = existing.statutClient;

  // Update client status
  const updated = await prisma.client.update({
    where: { id: clientId },
    data: { statutClient: newStatut },
    include: {
      entreprise: { select: { id: true, nom: true } },
    },
  });

  // Log activity for stage change
  if (userId) {
    await prisma.activite.create({
      data: {
        type: 'NOTE',
        entiteType: 'CLIENT',
        entiteId: clientId,
        userId,
        titre: `Statut change: ${oldStatut} -> ${newStatut}`,
        contenu: `Le statut du client a ete modifie de ${STATUT_LABELS[oldStatut]} a ${STATUT_LABELS[newStatut]}`,
        source: 'SYSTEME',
      },
    });
  }

  return updated;
}

// ─── GET PIPELINE STATS ─────────────────────────────

export async function getPipelineStats(): Promise<PipelineStats> {
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      statutClient: true,
      createdAt: true,
      updatedAt: true,
      mandats: {
        select: {
          feeMontantEstime: true,
          feeMontantFacture: true,
          feeStatut: true,
          statut: true,
        },
      },
    },
  });

  const totalClients = clients.length;

  // Count clients per stage
  const countByStage = new Map<StatutClient, number>();
  for (const statut of ALL_STATUTS) {
    countByStage.set(statut, 0);
  }
  for (const c of clients) {
    countByStage.set(c.statutClient, (countByStage.get(c.statutClient) ?? 0) + 1);
  }

  // Total pipe value (sum of estimated fees for active mandats)
  const totalPipeValue = clients.reduce((sum, c) => {
    return (
      sum +
      c.mandats.reduce(
        (mSum, m) => mSum + (m.feeMontantEstime ?? 0),
        0,
      )
    );
  }, 0);

  // Conversion rates between consecutive stages
  // A "conversion" is a client that advanced from one stage to the next
  // We approximate by looking at how many clients are in each stage or later
  const conversionRates: PipelineStats['conversionRates'] = [];
  const progressStages: StatutClient[] = [
    'LEAD',
    'PREMIER_CONTACT',
    'BESOIN_QUALIFIE',
    'PROPOSITION_ENVOYEE',
    'MANDAT_SIGNE',
    'RECURRENT',
  ];

  for (let i = 0; i < progressStages.length - 1; i++) {
    const fromStatut = progressStages[i];
    const toStatut = progressStages[i + 1];
    const fromIndex = i;
    const toIndex = i + 1;

    // Clients that reached at least fromStatut (are at fromStatut or beyond)
    const reachedFrom = clients.filter((c) => {
      const idx = progressStages.indexOf(c.statutClient);
      return idx >= fromIndex || c.statutClient === 'INACTIF';
    }).length;

    // Clients that reached at least toStatut
    const reachedTo = clients.filter((c) => {
      const idx = progressStages.indexOf(c.statutClient);
      return idx >= toIndex;
    }).length;

    const rate = reachedFrom > 0 ? Math.round((reachedTo / reachedFrom) * 100) : 0;

    conversionRates.push({ fromStatut, toStatut, rate });
  }

  // Average days in each stage (approximated by updatedAt - createdAt for current stage)
  const avgDaysPerStage: PipelineStats['avgDaysPerStage'] = [];
  const now = Date.now();

  for (const statut of ALL_STATUTS) {
    const stageClients = clients.filter((c) => c.statutClient === statut);
    if (stageClients.length === 0) {
      avgDaysPerStage.push({ statut, avgDays: 0 });
      continue;
    }

    const totalDays = stageClients.reduce((sum, c) => {
      return sum + (now - c.updatedAt.getTime()) / (1000 * 60 * 60 * 24);
    }, 0);

    avgDaysPerStage.push({
      statut,
      avgDays: Math.round(totalDays / stageClients.length),
    });
  }

  // Revenue by stage
  const revenueByStage: PipelineStats['revenueByStage'] = ALL_STATUTS.map((statut) => {
    const stageClients = clients.filter((c) => c.statutClient === statut);
    const revenue = stageClients.reduce((sum, c) => {
      return (
        sum +
        c.mandats.reduce(
          (mSum, m) => mSum + (m.feeMontantFacture ?? m.feeMontantEstime ?? 0),
          0,
        )
      );
    }, 0);
    return { statut, revenue };
  });

  return {
    totalClients,
    totalPipeValue,
    conversionRates,
    avgDaysPerStage,
    revenueByStage,
  };
}
