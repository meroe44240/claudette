import prisma from '../../lib/db.js';

// ─── TYPES ──────────────────────────────────────────

interface TeamMemberStats {
  userId: string;
  nom: string;
  prenom: string | null;
  role: string;
  mandatsActifs: number;
  candidatsEnProcess: number;
  appels: number;
  rdv: number;
  placements: number;
  caFacture: number;
  caEncaisse: number;
  objectifCA: number;
  progressCA: number;
}

interface GlobalKpis {
  caTotal: number;
  caObjectif: number;
  progressCA: number;
  mandatsOuverts: number;
  mandatsClos: number;
  placementsTotal: number;
  tempsMoyenPlacement: number | null;
  tauxConversion: number;
}

interface ForecastData {
  pipeWeighted: number;
  projectedCA: number;
  monthlyRevenue: Array<{
    month: string;
    actual: number | null;
    projected: number | null;
  }>;
}

interface RecruteurComparison {
  appelsParJour: Array<{ userId: string; nom: string; avg: number }>;
  rdvParSemaine: Array<{ userId: string; nom: string; avg: number }>;
  placementsParMois: Array<{ userId: string; nom: string; count: number }>;
  caGenere: Array<{ userId: string; nom: string; amount: number }>;
}

export interface AdminDashboardData {
  teamStats: TeamMemberStats[];
  globalKpis: GlobalKpis;
  forecast: ForecastData;
  recruteurComparison: RecruteurComparison;
}

// ─── STAGE PROBABILITY FOR WEIGHTED PIPE ─────────────

const STAGE_PROBABILITY: Record<string, number> = {
  SOURCING: 0.10,
  CONTACTE: 0.20,
  ENTRETIEN_1: 0.40,
  ENTRETIEN_CLIENT: 0.60,
  OFFRE: 0.80,
  PLACE: 1.0,
};

// ─── MAIN FUNCTION ──────────────────────────────────

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // Get start of the week (Monday)
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  // Fetch all users
  const users = await prisma.user.findMany({
    select: {
      id: true,
      nom: true,
      prenom: true,
      role: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // ── Team Stats ──────────────────────────────────────

  const teamStats: TeamMemberStats[] = [];

  for (const user of users) {
    const [
      mandatsActifs,
      candidatsEnProcess,
      appels,
      rdv,
      placementsCount,
      caFactureResult,
      caEncaisseResult,
    ] = await Promise.all([
      // Active mandats assigned to user
      prisma.mandat.count({
        where: {
          assignedToId: user.id,
          statut: { in: ['OUVERT', 'EN_COURS'] },
        },
      }),
      // Candidatures in process (not REFUSE/PLACE) created by user
      prisma.candidature.count({
        where: {
          createdById: user.id,
          stage: { notIn: ['REFUSE', 'PLACE'] },
        },
      }),
      // Calls this month
      prisma.activite.count({
        where: {
          userId: user.id,
          type: 'APPEL',
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
      }),
      // Meetings this month
      prisma.activite.count({
        where: {
          userId: user.id,
          type: 'MEETING',
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
      }),
      // Placements (candidature moved to PLACE) by user
      prisma.stageHistory.count({
        where: {
          toStage: 'PLACE',
          changedAt: { gte: startOfMonth, lte: endOfMonth },
          candidature: { createdById: user.id },
        },
      }),
      // CA Facture
      prisma.mandat.aggregate({
        where: {
          assignedToId: user.id,
          feeStatut: { in: ['FACTURE', 'PAYE'] },
        },
        _sum: { feeMontantFacture: true },
      }),
      // CA Encaisse
      prisma.mandat.aggregate({
        where: {
          assignedToId: user.id,
          feeStatut: 'PAYE',
        },
        _sum: { feeMontantFacture: true },
      }),
    ]);

    const caFacture = caFactureResult._sum.feeMontantFacture ?? 0;
    const caEncaisse = caEncaisseResult._sum.feeMontantFacture ?? 0;
    // Default objective: 200k per user per year (simplification)
    const objectifCA = 200000;
    const progressCA = objectifCA > 0 ? Math.round((caFacture / objectifCA) * 100) : 0;

    teamStats.push({
      userId: user.id,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role,
      mandatsActifs,
      candidatsEnProcess,
      appels,
      rdv,
      placements: placementsCount,
      caFacture,
      caEncaisse,
      objectifCA,
      progressCA,
    });
  }

  // ── Global KPIs ─────────────────────────────────────

  const [
    mandatsOuverts,
    mandatsClos,
    totalFacture,
    placementsAll,
  ] = await Promise.all([
    prisma.mandat.count({
      where: { statut: { in: ['OUVERT', 'EN_COURS'] } },
    }),
    prisma.mandat.count({
      where: { statut: { in: ['GAGNE', 'CLOTURE'] } },
    }),
    prisma.mandat.aggregate({
      where: { feeStatut: { in: ['FACTURE', 'PAYE'] } },
      _sum: { feeMontantFacture: true },
    }),
    prisma.stageHistory.count({
      where: { toStage: 'PLACE' },
    }),
  ]);

  // Time to placement: average days between candidature creation and PLACE
  const placedHistories = await prisma.stageHistory.findMany({
    where: { toStage: 'PLACE' },
    select: {
      changedAt: true,
      candidature: { select: { createdAt: true } },
    },
    take: 200,
    orderBy: { changedAt: 'desc' },
  });

  let tempsMoyenPlacement: number | null = null;
  if (placedHistories.length > 0) {
    const totalDays = placedHistories.reduce((sum, h) => {
      const diffMs = h.changedAt.getTime() - h.candidature.createdAt.getTime();
      return sum + diffMs / (1000 * 60 * 60 * 24);
    }, 0);
    tempsMoyenPlacement = Math.round(totalDays / placedHistories.length);
  }

  // Taux de conversion: total placements / total candidatures
  const totalCandidatures = await prisma.candidature.count();
  const tauxConversion =
    totalCandidatures > 0
      ? Math.round((placementsAll / totalCandidatures) * 100)
      : 0;

  const caTotal = totalFacture._sum.feeMontantFacture ?? 0;
  const caObjectif = users.length * 200000; // 200k per user
  const progressCA = caObjectif > 0 ? Math.round((caTotal / caObjectif) * 100) : 0;

  const globalKpis: GlobalKpis = {
    caTotal,
    caObjectif,
    progressCA,
    mandatsOuverts,
    mandatsClos,
    placementsTotal: placementsAll,
    tempsMoyenPlacement,
    tauxConversion,
  };

  // ── Forecasting ─────────────────────────────────────

  // Weighted pipe: sum of feeMontantEstime * stage probability for active mandats
  const activeMandats = await prisma.mandat.findMany({
    where: { statut: { in: ['OUVERT', 'EN_COURS'] } },
    select: {
      feeMontantEstime: true,
      candidatures: {
        select: { stage: true },
        where: { stage: { notIn: ['REFUSE'] } },
      },
    },
  });

  const pipeWeighted = activeMandats.reduce((sum, m) => {
    if (!m.feeMontantEstime) return sum;
    const stages = m.candidatures.map((c) => c.stage);
    // Use highest stage probability
    const maxProb = stages.reduce((max, s) => {
      return Math.max(max, STAGE_PROBABILITY[s] ?? 0.1);
    }, 0.1);
    return sum + m.feeMontantEstime * maxProb;
  }, 0);

  // Projected CA: caTotal + weighted pipe
  const projectedCA = caTotal + Math.round(pipeWeighted);

  // Monthly revenue: 6 months actual + 3 months projected
  const monthlyRevenue: ForecastData['monthlyRevenue'] = [];

  for (let i = 8; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(
      now.getFullYear(),
      now.getMonth() - i + 1,
      0,
      23, 59, 59, 999,
    );
    const monthLabel = monthStart.toLocaleString('fr-FR', { month: 'short' });
    const capLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1).replace('.', '');

    const isFuture = monthStart > now;

    if (isFuture) {
      // Projected: average of last 3 months
      const lastMonths = monthlyRevenue.filter((m) => m.actual !== null);
      const recentActual = lastMonths.slice(-3);
      const avgRevenue =
        recentActual.length > 0
          ? Math.round(
              recentActual.reduce((s, m) => s + (m.actual ?? 0), 0) /
                recentActual.length,
            )
          : 0;
      monthlyRevenue.push({
        month: capLabel,
        actual: null,
        projected: avgRevenue,
      });
    } else {
      const result = await prisma.mandat.aggregate({
        where: {
          feeStatut: { in: ['FACTURE', 'PAYE'] },
          updatedAt: { gte: monthStart, lte: monthEnd },
        },
        _sum: { feeMontantFacture: true },
      });

      monthlyRevenue.push({
        month: capLabel,
        actual: result._sum.feeMontantFacture ?? 0,
        projected: null,
      });
    }
  }

  const forecast: ForecastData = {
    pipeWeighted: Math.round(pipeWeighted),
    projectedCA,
    monthlyRevenue,
  };

  // ── Recruteur Comparison ────────────────────────────

  // Calculate working days in current month
  const daysInMonth = Math.ceil(
    (Math.min(now.getTime(), endOfMonth.getTime()) - startOfMonth.getTime()) /
      (1000 * 60 * 60 * 24),
  );
  const workingDaysMonth = Math.max(Math.round(daysInMonth * 5 / 7), 1);

  // Calculate weeks in current month
  const weeksInMonth = Math.max(Math.round(daysInMonth / 7), 1);

  const appelsParJour: RecruteurComparison['appelsParJour'] = [];
  const rdvParSemaine: RecruteurComparison['rdvParSemaine'] = [];
  const placementsParMois: RecruteurComparison['placementsParMois'] = [];
  const caGenere: RecruteurComparison['caGenere'] = [];

  for (const member of teamStats) {
    const fullName = `${member.prenom ?? ''} ${member.nom}`.trim();

    appelsParJour.push({
      userId: member.userId,
      nom: fullName,
      avg: Math.round((member.appels / workingDaysMonth) * 10) / 10,
    });

    rdvParSemaine.push({
      userId: member.userId,
      nom: fullName,
      avg: Math.round((member.rdv / weeksInMonth) * 10) / 10,
    });

    placementsParMois.push({
      userId: member.userId,
      nom: fullName,
      count: member.placements,
    });

    caGenere.push({
      userId: member.userId,
      nom: fullName,
      amount: member.caFacture,
    });
  }

  // Sort each comparison (descending)
  appelsParJour.sort((a, b) => b.avg - a.avg);
  rdvParSemaine.sort((a, b) => b.avg - a.avg);
  placementsParMois.sort((a, b) => b.count - a.count);
  caGenere.sort((a, b) => b.amount - a.amount);

  const recruteurComparison: RecruteurComparison = {
    appelsParJour,
    rdvParSemaine,
    placementsParMois,
    caGenere,
  };

  return {
    teamStats,
    globalKpis,
    forecast,
    recruteurComparison,
  };
}
