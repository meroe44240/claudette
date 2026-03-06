import prisma from '../../lib/db.js';

// ─── CONSTANTS ──────────────────────────────────────

const PARIS_TZ = 'Europe/Paris';

const STAGE_ORDER = [
  'SOURCING',
  'CONTACTE',
  'ENTRETIEN_1',
  'ENTRETIEN_CLIENT',
  'OFFRE',
  'PLACE',
] as const;

const RDV_COLORS: Record<string, string> = {
  MEETING: '#6366f1',
  APPEL: '#f59e0b',
  EMAIL: '#10b981',
};

// Reasonable daily/weekly/monthly objectives for radar normalisation
const RADAR_OBJECTIVES = {
  appelsParJour: 30,
  rdvParSemaine: 10,
  candidatsParMois: 20,
  mandatsActifs: 8,
  caAnnuel: 200_000,
  tauxPresentation: 50, // %
};

// ─── DATE UTILITIES ─────────────────────────────────

/** Current instant in Europe/Paris */
function nowParis(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: PARIS_TZ }));
}

/** Format a Date to 'YYYY-MM-DD' in Paris timezone */
function toParisDateStr(d: Date): string {
  const p = new Date(d.toLocaleString('en-US', { timeZone: PARIS_TZ }));
  return [
    p.getFullYear(),
    String(p.getMonth() + 1).padStart(2, '0'),
    String(p.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Format month label in French */
function toFrenchMonth(d: Date): string {
  const label = d.toLocaleString('fr-FR', { month: 'short' }).replace('.', '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Compute period start/end and previous period start/end.
 * All dates are in Europe/Paris.
 */
function getPeriodBounds(period: 'week' | 'month' | 'quarter' | 'year') {
  const np = nowParis();

  if (period === 'week') {
    const dayOfWeek = np.getDay(); // 0=Sun
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const start = new Date(np);
    start.setDate(start.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevEnd = new Date(start.getTime() - 1);
    return { start, end, prevStart, prevEnd };
  }

  if (period === 'month') {
    const start = new Date(np.getFullYear(), np.getMonth(), 1);
    const end = new Date(np.getFullYear(), np.getMonth() + 1, 0, 23, 59, 59, 999);
    const prevStart = new Date(np.getFullYear(), np.getMonth() - 1, 1);
    const prevEnd = new Date(np.getFullYear(), np.getMonth(), 0, 23, 59, 59, 999);
    return { start, end, prevStart, prevEnd };
  }

  if (period === 'quarter') {
    const q = Math.floor(np.getMonth() / 3);
    const start = new Date(np.getFullYear(), q * 3, 1);
    const end = new Date(np.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
    const prevQ = q === 0 ? 3 : q - 1;
    const prevYear = q === 0 ? np.getFullYear() - 1 : np.getFullYear();
    const prevStart = new Date(prevYear, prevQ * 3, 1);
    const prevEnd = new Date(prevYear, prevQ * 3 + 3, 0, 23, 59, 59, 999);
    return { start, end, prevStart, prevEnd };
  }

  // year
  const start = new Date(np.getFullYear(), 0, 1);
  const end = new Date(np.getFullYear(), 11, 31, 23, 59, 59, 999);
  const prevStart = new Date(np.getFullYear() - 1, 0, 1);
  const prevEnd = new Date(np.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
  return { start, end, prevStart, prevEnd };
}

/** Build an array of 7 dates (last 7 days ending today in Paris) */
function getLast7Days(): Date[] {
  const np = nowParis();
  const days: Date[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(np);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  return days;
}

/** Calculate percentage trend; returns 0 when no previous data */
function calcTrend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

/** Normalise a value to 0-100 based on an objective */
function normalise(value: number, objective: number): number {
  return Math.min(100, Math.round((value / objective) * 100));
}

// ─── MAIN FUNCTION ──────────────────────────────────

export async function getStatsData(
  userId: string,
  period: 'week' | 'month' | 'quarter' | 'year',
  targetUserId?: string,
) {
  const effectiveUserId = targetUserId || userId;
  const { start, end, prevStart, prevEnd } = getPeriodBounds(period);
  const np = nowParis();
  const todayStr = toParisDateStr(np);
  const last7 = getLast7Days();
  const last7Start = last7[0];
  const last7End = new Date(last7[6]);
  last7End.setHours(23, 59, 59, 999);

  // Year bounds for YTD calculations
  const yearStart = new Date(np.getFullYear(), 0, 1);
  const yearEnd = new Date(np.getFullYear(), 11, 31, 23, 59, 59, 999);

  // Check if requesting user is admin
  const requestingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  const isAdmin = requestingUser?.role === 'ADMIN';

  // User filter helpers
  const userActivityWhere = { userId: effectiveUserId };
  const userCandidatureWhere = { createdById: effectiveUserId };

  // ─────────────────────────────────────────────────────
  // PARALLEL BATCH 1: Core counts for current + previous period + sparkline
  // ─────────────────────────────────────────────────────

  const [
    // Current period counts
    appelsCount,
    rdvCount,
    candidatsCount,
    mandatsCount,
    // Previous period counts
    prevAppelsCount,
    prevRdvCount,
    prevCandidatsCount,
    prevMandatsCount,
    // Sparkline raw data (last 7 days)
    sparkAppelsRaw,
    sparkRdvRaw,
    sparkCandidatsRaw,
    sparkMandatsRaw,
    // CA aggregates
    caCurrentPeriod,
    caPrevPeriod,
    sparkCaRaw,
    // Presentations for taux
    presentationsCount,
    prevPresentationsCount,
    candidaturesEnvoyes,
    prevCandidaturesEnvoyes,
    // Calls by day (current week)
    callsByDayRaw,
    // RDV by type
    rdvByTypeRaw,
    // Funnel: candidatures grouped by stage
    funnelRaw,
    // Mandats actifs with details
    mandatsActifsRaw,
    // Revenue by month (last 12 months)
    // -- done in a loop below --
    // CA YTD
    caYtdAgg,
    // Objectif annuel (we use a placeholder; could come from user settings)
    // Pipe commercial
    pipeCommercialAgg,
    // Impayes
    impayesAgg,
    // Time to fill (placed candidatures)
    placedHistories,
    // Team placed histories (for team average)
    teamPlacedHistories,
    // Stage history for time-per-stage
    stageHistoryForUser,
    teamStageHistory,
    // All users for team comparison
    allUsers,
  ] = await Promise.all([
    // ── Current period appels ──
    prisma.activite.count({
      where: { ...userActivityWhere, type: 'APPEL', createdAt: { gte: start, lte: end } },
    }),
    // ── Current period RDV (meetings) ──
    prisma.activite.count({
      where: { ...userActivityWhere, type: 'MEETING', createdAt: { gte: start, lte: end } },
    }),
    // ── Current period candidats created ──
    prisma.candidature.count({
      where: { ...userCandidatureWhere, createdAt: { gte: start, lte: end } },
    }),
    // ── Current period mandats won ──
    prisma.mandat.count({
      where: {
        statut: 'GAGNE',
        updatedAt: { gte: start, lte: end },
        OR: [{ createdById: effectiveUserId }, { assignedToId: effectiveUserId }],
      },
    }),
    // ── Previous period appels ──
    prisma.activite.count({
      where: { ...userActivityWhere, type: 'APPEL', createdAt: { gte: prevStart, lte: prevEnd } },
    }),
    // ── Previous period RDV ──
    prisma.activite.count({
      where: { ...userActivityWhere, type: 'MEETING', createdAt: { gte: prevStart, lte: prevEnd } },
    }),
    // ── Previous period candidats ──
    prisma.candidature.count({
      where: { ...userCandidatureWhere, createdAt: { gte: prevStart, lte: prevEnd } },
    }),
    // ── Previous period mandats won ──
    prisma.mandat.count({
      where: {
        statut: 'GAGNE',
        updatedAt: { gte: prevStart, lte: prevEnd },
        OR: [{ createdById: effectiveUserId }, { assignedToId: effectiveUserId }],
      },
    }),
    // ── Sparkline appels (last 7 days) ──
    prisma.activite.findMany({
      where: { ...userActivityWhere, type: 'APPEL', createdAt: { gte: last7Start, lte: last7End } },
      select: { createdAt: true },
    }),
    // ── Sparkline RDV (last 7 days) ──
    prisma.activite.findMany({
      where: { ...userActivityWhere, type: 'MEETING', createdAt: { gte: last7Start, lte: last7End } },
      select: { createdAt: true },
    }),
    // ── Sparkline candidats (last 7 days) ──
    prisma.candidature.findMany({
      where: { ...userCandidatureWhere, createdAt: { gte: last7Start, lte: last7End } },
      select: { createdAt: true },
    }),
    // ── Sparkline mandats (last 7 days) ──
    prisma.mandat.findMany({
      where: {
        statut: 'GAGNE',
        updatedAt: { gte: last7Start, lte: last7End },
        OR: [{ createdById: effectiveUserId }, { assignedToId: effectiveUserId }],
      },
      select: { updatedAt: true },
    }),
    // ── CA current period ──
    prisma.mandat.aggregate({
      where: {
        feeStatut: { in: ['FACTURE', 'PAYE'] },
        updatedAt: { gte: start, lte: end },
        OR: [{ createdById: effectiveUserId }, { assignedToId: effectiveUserId }],
      },
      _sum: { feeMontantFacture: true },
    }),
    // ── CA previous period ──
    prisma.mandat.aggregate({
      where: {
        feeStatut: { in: ['FACTURE', 'PAYE'] },
        updatedAt: { gte: prevStart, lte: prevEnd },
        OR: [{ createdById: effectiveUserId }, { assignedToId: effectiveUserId }],
      },
      _sum: { feeMontantFacture: true },
    }),
    // ── Sparkline CA (last 7 days, fee facture/paye) ──
    prisma.mandat.findMany({
      where: {
        feeStatut: { in: ['FACTURE', 'PAYE'] },
        updatedAt: { gte: last7Start, lte: last7End },
        OR: [{ createdById: effectiveUserId }, { assignedToId: effectiveUserId }],
      },
      select: { feeMontantFacture: true, updatedAt: true },
    }),
    // ── Presentations current period (stage change to ENTRETIEN_CLIENT) ──
    prisma.stageHistory.count({
      where: {
        toStage: 'ENTRETIEN_CLIENT',
        changedAt: { gte: start, lte: end },
        candidature: { createdById: effectiveUserId },
      },
    }),
    // ── Presentations previous period ──
    prisma.stageHistory.count({
      where: {
        toStage: 'ENTRETIEN_CLIENT',
        changedAt: { gte: prevStart, lte: prevEnd },
        candidature: { createdById: effectiveUserId },
      },
    }),
    // ── Candidatures sent (to CONTACTE+) current period ──
    prisma.stageHistory.count({
      where: {
        toStage: { in: ['CONTACTE', 'ENTRETIEN_1', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE'] },
        changedAt: { gte: start, lte: end },
        candidature: { createdById: effectiveUserId },
      },
    }),
    // ── Candidatures sent previous period ──
    prisma.stageHistory.count({
      where: {
        toStage: { in: ['CONTACTE', 'ENTRETIEN_1', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE'] },
        changedAt: { gte: prevStart, lte: prevEnd },
        candidature: { createdById: effectiveUserId },
      },
    }),
    // ── Calls by day (this week Mon-Sun) ──
    (async () => {
      const weekNp = nowParis();
      const dayOfWeek = weekNp.getDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(weekNp);
      monday.setDate(monday.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      return prisma.activite.findMany({
        where: {
          ...userActivityWhere,
          type: 'APPEL',
          createdAt: { gte: monday, lte: sunday },
        },
        select: { createdAt: true },
      });
    })(),
    // ── RDV by type (current period) ──
    prisma.activite.groupBy({
      by: ['type'],
      where: {
        ...userActivityWhere,
        type: { in: ['MEETING', 'APPEL', 'EMAIL'] },
        createdAt: { gte: start, lte: end },
      },
      _count: { id: true },
    }),
    // ── Funnel ──
    prisma.candidature.groupBy({
      by: ['stage'],
      where: {
        ...userCandidatureWhere,
        stage: { notIn: ['REFUSE'] },
      },
      _count: { id: true },
    }),
    // ── Mandats actifs with enterprise + candidature counts ──
    prisma.mandat.findMany({
      where: {
        statut: { in: ['OUVERT', 'EN_COURS'] },
        OR: [
          { createdById: effectiveUserId },
          { assignedToId: effectiveUserId },
          { candidatures: { some: { createdById: effectiveUserId } } },
        ],
      },
      select: {
        id: true,
        titrePoste: true,
        feeMontantEstime: true,
        createdAt: true,
        entreprise: { select: { nom: true } },
        candidatures: {
          where: { stage: { notIn: ['REFUSE'] } },
          select: { id: true, stage: true },
        },
        _count: { select: { candidatures: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    // ── CA YTD ──
    prisma.mandat.aggregate({
      where: {
        feeStatut: { in: ['FACTURE', 'PAYE'] },
        updatedAt: { gte: yearStart, lte: yearEnd },
        OR: [{ createdById: effectiveUserId }, { assignedToId: effectiveUserId }],
      },
      _sum: { feeMontantFacture: true },
    }),
    // ── Pipe commercial (fee estime for OUVERT/EN_COURS) ──
    prisma.mandat.aggregate({
      where: {
        statut: { in: ['OUVERT', 'EN_COURS'] },
        OR: [{ createdById: effectiveUserId }, { assignedToId: effectiveUserId }],
      },
      _sum: { feeMontantEstime: true },
    }),
    // ── Impayes (FACTURE but not PAYE) ──
    prisma.mandat.aggregate({
      where: {
        feeStatut: 'FACTURE',
        OR: [{ createdById: effectiveUserId }, { assignedToId: effectiveUserId }],
      },
      _sum: { feeMontantFacture: true },
    }),
    // ── Time to fill (user's placed candidatures) ──
    prisma.stageHistory.findMany({
      where: {
        toStage: 'PLACE',
        candidature: { createdById: effectiveUserId },
      },
      select: {
        changedAt: true,
        candidature: { select: { createdAt: true } },
      },
    }),
    // ── Team time to fill (all users) ──
    prisma.stageHistory.findMany({
      where: { toStage: 'PLACE' },
      select: {
        changedAt: true,
        candidature: { select: { createdAt: true } },
      },
    }),
    // ── Stage history for user (time-per-stage) ──
    prisma.stageHistory.findMany({
      where: { candidature: { createdById: effectiveUserId } },
      orderBy: { changedAt: 'asc' },
      select: {
        candidatureId: true,
        fromStage: true,
        toStage: true,
        changedAt: true,
      },
    }),
    // ── Team stage history (for team averages) ──
    prisma.stageHistory.findMany({
      orderBy: { changedAt: 'asc' },
      select: {
        candidatureId: true,
        fromStage: true,
        toStage: true,
        changedAt: true,
      },
    }),
    // ── All users for team comparison ──
    prisma.user.findMany({
      select: { id: true, nom: true, prenom: true, role: true },
    }),
  ]);

  // ─────────────────────────────────────────────────────
  // POST-PROCESSING
  // ─────────────────────────────────────────────────────

  // ── Sparklines ──

  function buildSparkline(items: { createdAt?: Date; updatedAt?: Date }[], dateField: 'createdAt' | 'updatedAt' = 'createdAt'): number[] {
    const countMap = new Map<string, number>();
    for (const item of items) {
      const d = (item as any)[dateField] as Date;
      const ds = toParisDateStr(d);
      countMap.set(ds, (countMap.get(ds) ?? 0) + 1);
    }
    return last7.map((d) => countMap.get(toParisDateStr(d)) ?? 0);
  }

  function buildCaSparkline(mandats: { feeMontantFacture: number | null; updatedAt: Date }[]): number[] {
    const sumMap = new Map<string, number>();
    for (const m of mandats) {
      const ds = toParisDateStr(m.updatedAt);
      sumMap.set(ds, (sumMap.get(ds) ?? 0) + (m.feeMontantFacture ?? 0));
    }
    return last7.map((d) => sumMap.get(toParisDateStr(d)) ?? 0);
  }

  // Taux de presentation sparkline: daily presentations / daily candidatures sent (last 7 days)
  // We approximate using the sparkline raw data
  const sparkPresentations = buildSparkline(
    await prisma.stageHistory.findMany({
      where: {
        toStage: 'ENTRETIEN_CLIENT',
        changedAt: { gte: last7Start, lte: last7End },
        candidature: { createdById: effectiveUserId },
      },
      select: { changedAt: true },
    }).then((rows) => rows.map((r) => ({ createdAt: r.changedAt }))),
  );

  const sparkCandidaturesEnvoyes = buildSparkline(
    await prisma.stageHistory.findMany({
      where: {
        toStage: { in: ['CONTACTE', 'ENTRETIEN_1', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE'] },
        changedAt: { gte: last7Start, lte: last7End },
        candidature: { createdById: effectiveUserId },
      },
      select: { changedAt: true },
    }).then((rows) => rows.map((r) => ({ createdAt: r.changedAt }))),
  );

  const tauxPresentationValue = candidaturesEnvoyes > 0
    ? Math.round((presentationsCount / candidaturesEnvoyes) * 100)
    : 0;
  const prevTauxPresentation = prevCandidaturesEnvoyes > 0
    ? Math.round((prevPresentationsCount / prevCandidaturesEnvoyes) * 100)
    : 0;

  const tauxPresentationSparkline = sparkCandidaturesEnvoyes.map((sent, i) =>
    sent > 0 ? Math.round((sparkPresentations[i] / sent) * 100) : 0,
  );

  const caCurrentVal = caCurrentPeriod._sum.feeMontantFacture ?? 0;
  const caPrevVal = caPrevPeriod._sum.feeMontantFacture ?? 0;

  const scorecards = {
    appels: {
      value: appelsCount,
      trend: calcTrend(appelsCount, prevAppelsCount),
      sparkline: buildSparkline(sparkAppelsRaw),
    },
    rdv: {
      value: rdvCount,
      trend: calcTrend(rdvCount, prevRdvCount),
      sparkline: buildSparkline(sparkRdvRaw),
    },
    candidats: {
      value: candidatsCount,
      trend: calcTrend(candidatsCount, prevCandidatsCount),
      sparkline: buildSparkline(sparkCandidatsRaw),
    },
    mandats: {
      value: mandatsCount,
      trend: calcTrend(mandatsCount, prevMandatsCount),
      sparkline: buildSparkline(sparkMandatsRaw.map((m) => ({ createdAt: m.updatedAt })) as any),
    },
    ca: {
      value: caCurrentVal,
      trend: calcTrend(caCurrentVal, caPrevVal),
      sparkline: buildCaSparkline(sparkCaRaw),
    },
    tauxPresentation: {
      value: tauxPresentationValue,
      trend: calcTrend(tauxPresentationValue, prevTauxPresentation),
      sparkline: tauxPresentationSparkline,
    },
  };

  // ── Calls by day (Mon-Sun) ──

  const JOURS_SEMAINE = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const weekNp = nowParis();
  const dayOfWeek = weekNp.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(weekNp);
  monday.setDate(monday.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const callsDayMap = new Map<string, number>();
  for (const a of callsByDayRaw) {
    const ds = toParisDateStr(a.createdAt);
    callsDayMap.set(ds, (callsDayMap.get(ds) ?? 0) + 1);
  }

  const callsByDay: { day: string; count: number; isToday: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const dateStr = toParisDateStr(d);
    callsByDay.push({
      day: JOURS_SEMAINE[i],
      count: callsDayMap.get(dateStr) ?? 0,
      isToday: dateStr === todayStr,
    });
  }

  // ── RDV by type ──

  const rdvByType = rdvByTypeRaw.map((g) => ({
    type: g.type,
    count: g._count.id,
    color: RDV_COLORS[g.type] ?? '#94a3b8',
  }));

  // ── Funnel ──

  const funnelMap = new Map<string, number>();
  for (const g of funnelRaw) {
    funnelMap.set(g.stage, g._count.id);
  }
  const funnel = STAGE_ORDER.map((stage) => ({
    stage,
    count: funnelMap.get(stage) ?? 0,
  }));

  // ── Mandats actifs ──

  // Get last activity dates for mandats
  const mandatIds = mandatsActifsRaw.map((m) => m.id);
  const allCandIdsForMandats = mandatsActifsRaw.flatMap((m) => m.candidatures.map((c) => c.id));

  const [directActs, candActs] = await Promise.all([
    mandatIds.length > 0
      ? prisma.activite.findMany({
          where: { entiteType: 'MANDAT', entiteId: { in: mandatIds } },
          orderBy: { createdAt: 'desc' },
          select: { entiteId: true, createdAt: true },
        })
      : [],
    allCandIdsForMandats.length > 0
      ? prisma.activite.findMany({
          where: { entiteType: 'CANDIDAT', entiteId: { in: allCandIdsForMandats } },
          orderBy: { createdAt: 'desc' },
          select: { entiteId: true, createdAt: true },
        })
      : [],
  ]);

  const candToMandatMap = new Map<string, string>();
  for (const m of mandatsActifsRaw) {
    for (const c of m.candidatures) {
      candToMandatMap.set(c.id, m.id);
    }
  }

  const lastActivityMap = new Map<string, Date>();
  for (const a of directActs) {
    const existing = lastActivityMap.get(a.entiteId);
    if (!existing || a.createdAt > existing) lastActivityMap.set(a.entiteId, a.createdAt);
  }
  for (const a of candActs) {
    const mId = candToMandatMap.get(a.entiteId);
    if (!mId) continue;
    const existing = lastActivityMap.get(mId);
    if (!existing || a.createdAt > existing) lastActivityMap.set(mId, a.createdAt);
  }

  const nowMs = Date.now();

  const mandatsActifs = mandatsActifsRaw.map((m) => {
    const activeCands = m.candidatures.filter((c) => !['REFUSE'].includes(c.stage));
    const stageIndexes = activeCands.map((c) => STAGE_ORDER.indexOf(c.stage as any)).filter((i) => i >= 0);
    const highestStageIdx = stageIndexes.length > 0 ? Math.max(...stageIndexes) : 0;
    const progress = Math.round((highestStageIdx / (STAGE_ORDER.length - 1)) * 100);

    const lastAct = lastActivityMap.get(m.id) ?? null;
    const dormantDays = lastAct
      ? Math.floor((nowMs - lastAct.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      id: m.id,
      titre: m.titrePoste,
      entreprise: m.entreprise.nom,
      candidats: m._count.candidatures,
      fee: m.feeMontantEstime ?? 0,
      dormantDays,
      progress,
    };
  });

  // ── Revenue by month (last 12 months) ──

  const revenueByMonth: { month: string; facture: number; encaisse: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const mStart = new Date(np.getFullYear(), np.getMonth() - i, 1);
    const mEnd = new Date(np.getFullYear(), np.getMonth() - i + 1, 0, 23, 59, 59, 999);

    const [factureAgg, encaisseAgg] = await Promise.all([
      prisma.mandat.aggregate({
        where: {
          feeStatut: { in: ['FACTURE', 'PAYE'] },
          updatedAt: { gte: mStart, lte: mEnd },
          OR: [{ createdById: effectiveUserId }, { assignedToId: effectiveUserId }],
        },
        _sum: { feeMontantFacture: true },
      }),
      prisma.mandat.aggregate({
        where: {
          feeStatut: 'PAYE',
          updatedAt: { gte: mStart, lte: mEnd },
          OR: [{ createdById: effectiveUserId }, { assignedToId: effectiveUserId }],
        },
        _sum: { feeMontantFacture: true },
      }),
    ]);

    revenueByMonth.push({
      month: toFrenchMonth(mStart),
      facture: factureAgg._sum.feeMontantFacture ?? 0,
      encaisse: encaisseAgg._sum.feeMontantFacture ?? 0,
    });
  }

  const caYtd = caYtdAgg._sum.feeMontantFacture ?? 0;
  const objectifAnnuel = RADAR_OBJECTIVES.caAnnuel; // Could be pulled from user settings
  const pipeCommercial = pipeCommercialAgg._sum.feeMontantEstime ?? 0;
  const impayes = impayesAgg._sum.feeMontantFacture ?? 0;

  // ── Time to fill ──

  function computeAvgTimeToFill(histories: { changedAt: Date; candidature: { createdAt: Date } }[]): number | null {
    if (histories.length === 0) return null;
    const totalDays = histories.reduce((sum, h) => {
      const diffMs = h.changedAt.getTime() - h.candidature.createdAt.getTime();
      return sum + diffMs / (1000 * 60 * 60 * 24);
    }, 0);
    return Math.round(totalDays / histories.length);
  }

  const timeToFill = computeAvgTimeToFill(placedHistories);
  const teamTimeToFill = computeAvgTimeToFill(teamPlacedHistories);

  // ── Time per stage ──

  function computeTimePerStage(
    history: { candidatureId: string; fromStage: string | null; toStage: string; changedAt: Date }[],
  ): Map<string, number[]> {
    // Group by candidatureId, sorted by changedAt
    const grouped = new Map<string, typeof history>();
    for (const h of history) {
      if (!grouped.has(h.candidatureId)) grouped.set(h.candidatureId, []);
      grouped.get(h.candidatureId)!.push(h);
    }

    // For each consecutive pair, compute days
    const transitionDays = new Map<string, number[]>(); // "FROM->TO" -> days[]

    grouped.forEach((entries) => {
      for (let i = 1; i < entries.length; i++) {
        const prev = entries[i - 1];
        const curr = entries[i];
        if (!prev.toStage || !curr.toStage) continue;
        const key = `${prev.toStage}->${curr.toStage}`;
        const days = (curr.changedAt.getTime() - prev.changedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (!transitionDays.has(key)) transitionDays.set(key, []);
        transitionDays.get(key)!.push(days);
      }
    });

    return transitionDays;
  }

  const userTransitions = computeTimePerStage(stageHistoryForUser);
  const teamTransitions = computeTimePerStage(teamStageHistory);

  const timePerStage: { from: string; to: string; days: number; teamAvg: number }[] = [];
  for (let i = 0; i < STAGE_ORDER.length - 1; i++) {
    const from = STAGE_ORDER[i];
    const to = STAGE_ORDER[i + 1];
    const key = `${from}->${to}`;

    const userDays = userTransitions.get(key);
    const teamDays = teamTransitions.get(key);

    const userAvg = userDays && userDays.length > 0
      ? Math.round(userDays.reduce((a, b) => a + b, 0) / userDays.length)
      : 0;
    const teamAvg = teamDays && teamDays.length > 0
      ? Math.round(teamDays.reduce((a, b) => a + b, 0) / teamDays.length)
      : 0;

    timePerStage.push({ from, to, days: userAvg, teamAvg });
  }

  // ── Radar (performance normalised to 0-100) ──

  // Compute daily averages based on period length
  const periodDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  const periodWeeks = Math.max(1, periodDays / 7);

  // Team averages for radar
  const teamUserCount = Math.max(1, allUsers.length);

  // Count team-wide stats for the same period
  const [teamAppels, teamRdv, teamCandidats, teamMandatsActifsCount, teamCaAgg] = await Promise.all([
    prisma.activite.count({
      where: { type: 'APPEL', createdAt: { gte: start, lte: end } },
    }),
    prisma.activite.count({
      where: { type: 'MEETING', createdAt: { gte: start, lte: end } },
    }),
    prisma.candidature.count({
      where: { createdAt: { gte: start, lte: end } },
    }),
    prisma.mandat.count({
      where: { statut: { in: ['OUVERT', 'EN_COURS'] } },
    }),
    prisma.mandat.aggregate({
      where: {
        feeStatut: { in: ['FACTURE', 'PAYE'] },
        updatedAt: { gte: yearStart, lte: yearEnd },
      },
      _sum: { feeMontantFacture: true },
    }),
  ]);

  const teamCaYtd = teamCaAgg._sum.feeMontantFacture ?? 0;

  const radar = [
    {
      metric: 'Appels/jour',
      value: normalise(appelsCount / periodDays, RADAR_OBJECTIVES.appelsParJour),
      teamAvg: normalise((teamAppels / teamUserCount) / periodDays, RADAR_OBJECTIVES.appelsParJour),
    },
    {
      metric: 'RDV/semaine',
      value: normalise(rdvCount / periodWeeks, RADAR_OBJECTIVES.rdvParSemaine),
      teamAvg: normalise((teamRdv / teamUserCount) / periodWeeks, RADAR_OBJECTIVES.rdvParSemaine),
    },
    {
      metric: 'Candidats/mois',
      value: normalise(candidatsCount / (periodDays / 30), RADAR_OBJECTIVES.candidatsParMois),
      teamAvg: normalise((teamCandidats / teamUserCount) / (periodDays / 30), RADAR_OBJECTIVES.candidatsParMois),
    },
    {
      metric: 'Mandats actifs',
      value: normalise(mandatsActifs.length, RADAR_OBJECTIVES.mandatsActifs),
      teamAvg: normalise(teamMandatsActifsCount / teamUserCount, RADAR_OBJECTIVES.mandatsActifs),
    },
    {
      metric: 'CA annuel',
      value: normalise(caYtd, RADAR_OBJECTIVES.caAnnuel),
      teamAvg: normalise(teamCaYtd / teamUserCount, RADAR_OBJECTIVES.caAnnuel),
    },
    {
      metric: 'Taux presentation',
      value: normalise(tauxPresentationValue, RADAR_OBJECTIVES.tauxPresentation),
      teamAvg: normalise(RADAR_OBJECTIVES.tauxPresentation / 2, RADAR_OBJECTIVES.tauxPresentation), // approximate team avg
    },
  ];

  // ── Team comparison (admin only) ──

  let teamComparison: { userId: string; nom: string; prenom: string; appels: number; rdv: number; candidats: number; ca: number }[] | null = null;

  if (isAdmin) {
    const teamMembers = allUsers.filter((u) => u.role !== 'ADMIN' || u.id === effectiveUserId);

    const teamData = await Promise.all(
      teamMembers.map(async (member) => {
        const [memberAppels, memberRdv, memberCandidats, memberCa] = await Promise.all([
          prisma.activite.count({
            where: { userId: member.id, type: 'APPEL', createdAt: { gte: start, lte: end } },
          }),
          prisma.activite.count({
            where: { userId: member.id, type: 'MEETING', createdAt: { gte: start, lte: end } },
          }),
          prisma.candidature.count({
            where: { createdById: member.id, createdAt: { gte: start, lte: end } },
          }),
          prisma.mandat.aggregate({
            where: {
              feeStatut: { in: ['FACTURE', 'PAYE'] },
              updatedAt: { gte: start, lte: end },
              OR: [{ createdById: member.id }, { assignedToId: member.id }],
            },
            _sum: { feeMontantFacture: true },
          }),
        ]);

        return {
          userId: member.id,
          nom: member.nom,
          prenom: member.prenom ?? '',
          appels: memberAppels,
          rdv: memberRdv,
          candidats: memberCandidats,
          ca: memberCa._sum.feeMontantFacture ?? 0,
        };
      }),
    );

    teamComparison = teamData;
  }

  // ─────────────────────────────────────────────────────
  // RETURN
  // ─────────────────────────────────────────────────────

  return {
    scorecards,
    callsByDay,
    rdvByType,
    funnel,
    mandatsActifs,
    revenueByMonth,
    caYtd,
    objectifAnnuel,
    pipeCommercial,
    impayes,
    radar,
    timePerStage,
    timeToFill,
    teamTimeToFill,
    teamComparison,
  };
}
