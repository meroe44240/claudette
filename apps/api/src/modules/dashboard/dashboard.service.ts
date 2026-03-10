import prisma from '../../lib/db.js';

export async function getActiviteStats(dateFrom?: Date, dateTo?: Date, userId?: string) {
  const where: any = {};

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = dateFrom;
    if (dateTo) where.createdAt.lte = dateTo;
  }

  if (userId) where.userId = userId;

  const [appels, emails, meetings] = await Promise.all([
    prisma.activite.count({ where: { ...where, type: 'APPEL' } }),
    prisma.activite.count({ where: { ...where, type: 'EMAIL' } }),
    prisma.activite.count({ where: { ...where, type: 'MEETING' } }),
  ]);

  // Presentations: candidatures with stage change to ENTRETIEN_CLIENT in period
  const stageHistoryWhere: any = { toStage: 'ENTRETIEN_CLIENT' };
  if (dateFrom || dateTo) {
    stageHistoryWhere.changedAt = {};
    if (dateFrom) stageHistoryWhere.changedAt.gte = dateFrom;
    if (dateTo) stageHistoryWhere.changedAt.lte = dateTo;
  }
  if (userId) {
    stageHistoryWhere.candidature = { createdById: userId };
  }

  const presentations = await prisma.stageHistory.count({ where: stageHistoryWhere });

  // Offres: stage changes to OFFRE in period
  const offreHistoryWhere: any = { toStage: 'OFFRE' };
  if (dateFrom || dateTo) {
    offreHistoryWhere.changedAt = {};
    if (dateFrom) offreHistoryWhere.changedAt.gte = dateFrom;
    if (dateTo) offreHistoryWhere.changedAt.lte = dateTo;
  }
  if (userId) {
    offreHistoryWhere.candidature = { createdById: userId };
  }

  const offres = await prisma.stageHistory.count({ where: offreHistoryWhere });

  return { appels, emails, meetings, presentations, offres };
}

export async function getPipelineStats(userId?: string) {
  const mandatWhere: any = {};
  if (userId) {
    mandatWhere.candidatures = { some: { createdById: userId } };
  }

  const [mandatsOuverts, mandatsGagnes, mandatsPerdu] = await Promise.all([
    prisma.mandat.count({
      where: { ...mandatWhere, statut: { in: ['OUVERT', 'EN_COURS'] } },
    }),
    prisma.mandat.count({
      where: { ...mandatWhere, statut: 'GAGNE' },
    }),
    prisma.mandat.count({
      where: { ...mandatWhere, statut: 'PERDU' },
    }),
  ]);

  // Candidats en process: grouped by stage, excluding REFUSE and PLACE
  const candidatureWhere: any = {
    stage: { notIn: ['REFUSE', 'PLACE'] },
  };
  if (userId) candidatureWhere.createdById = userId;

  const candidatsEnProcess = await prisma.candidature.groupBy({
    by: ['stage'],
    where: candidatureWhere,
    _count: { id: true },
  });

  const candidatsParStage = candidatsEnProcess.map((g) => ({
    stage: g.stage,
    count: g._count.id,
  }));

  // Time to fill: average days between candidature creation and stage PLACE
  const placedHistories = await prisma.stageHistory.findMany({
    where: { toStage: 'PLACE' },
    select: {
      changedAt: true,
      candidature: { select: { createdAt: true } },
    },
  });

  let timeToFillMoyen: number | null = null;
  if (placedHistories.length > 0) {
    const totalDays = placedHistories.reduce((sum, h) => {
      const diffMs = h.changedAt.getTime() - h.candidature.createdAt.getTime();
      return sum + diffMs / (1000 * 60 * 60 * 24);
    }, 0);
    timeToFillMoyen = Math.round(totalDays / placedHistories.length);
  }

  return {
    mandatsOuverts,
    candidatsEnProcess: candidatsParStage,
    mandatsGagnes,
    mandatsPerdu,
    timeToFillMoyen,
  };
}

export async function getRevenueStats() {
  // Fee estime total for OUVERT/EN_COURS mandats
  const feeEstimeResult = await prisma.mandat.aggregate({
    where: { statut: { in: ['OUVERT', 'EN_COURS'] } },
    _sum: { feeMontantEstime: true },
  });
  const feeEstimeTotal = feeEstimeResult._sum.feeMontantEstime ?? 0;

  // Fee facture total for mandats with feeStatut FACTURE or PAYE
  const feeFactureResult = await prisma.mandat.aggregate({
    where: { feeStatut: { in: ['FACTURE', 'PAYE'] } },
    _sum: { feeMontantFacture: true },
  });
  const feeFactureTotal = feeFactureResult._sum.feeMontantFacture ?? 0;

  // Fee encaisse total for PAYE mandats
  const feeEncaisseResult = await prisma.mandat.aggregate({
    where: { feeStatut: 'PAYE' },
    _sum: { feeMontantFacture: true },
  });
  const feeEncaisseTotal = feeEncaisseResult._sum.feeMontantFacture ?? 0;

  // Pipe commercial: same as feeEstimeTotal (OUVERT + EN_COURS)
  const pipeCommercial = feeEstimeTotal;

  // Top 5 entreprises by total fee facture
  const topEntreprisesRaw = await prisma.mandat.groupBy({
    by: ['entrepriseId'],
    where: { feeStatut: { in: ['FACTURE', 'PAYE'] } },
    _sum: { feeMontantFacture: true },
    orderBy: { _sum: { feeMontantFacture: 'desc' } },
    take: 5,
  });

  const entrepriseIds = topEntreprisesRaw.map((e) => e.entrepriseId);
  const entreprises = await prisma.entreprise.findMany({
    where: { id: { in: entrepriseIds } },
    select: { id: true, nom: true },
  });

  const entrepriseMap = new Map(entreprises.map((e) => [e.id, e.nom]));

  const topEntreprises = topEntreprisesRaw.map((e) => ({
    entrepriseId: e.entrepriseId,
    nom: entrepriseMap.get(e.entrepriseId) ?? 'Inconnu',
    totalFeeFacture: e._sum.feeMontantFacture ?? 0,
  }));

  return {
    feeEstimeTotal,
    feeFactureTotal,
    feeEncaisseTotal,
    pipeCommercial,
    topEntreprises,
  };
}

// ─── COCKPIT (single-call dashboard) ────────────────

const PARIS_TZ = 'Europe/Paris';
const JOURS_SEMAINE = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;

/** Return start-of-week (Monday 00:00) and end-of-week (Sunday 23:59:59.999) in Europe/Paris */
function getWeekBoundsParis(): { startOfWeek: Date; endOfWeek: Date; todayDateStr: string } {
  // Current instant in Paris
  const nowParis = new Date(
    new Date().toLocaleString('en-US', { timeZone: PARIS_TZ }),
  );
  const dayOfWeek = nowParis.getDay(); // 0=Sun … 6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(nowParis);
  monday.setDate(monday.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const todayDateStr = [
    nowParis.getFullYear(),
    String(nowParis.getMonth() + 1).padStart(2, '0'),
    String(nowParis.getDate()).padStart(2, '0'),
  ].join('-');

  return { startOfWeek: monday, endOfWeek: sunday, todayDateStr };
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

/** Get date bounds for a period with previous period for trend comparison */
function getPeriodBounds(period: 'today' | 'week' | 'month') {
  const nowParis = new Date(new Date().toLocaleString('en-US', { timeZone: PARIS_TZ }));

  if (period === 'today') {
    const start = new Date(nowParis);
    start.setHours(0, 0, 0, 0);
    const end = new Date(nowParis);
    end.setHours(23, 59, 59, 999);
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 1);
    const prevEnd = new Date(prevStart);
    prevEnd.setHours(23, 59, 59, 999);
    return { start, end, prevStart, prevEnd };
  }

  if (period === 'month') {
    const start = new Date(nowParis.getFullYear(), nowParis.getMonth(), 1);
    const end = new Date(nowParis.getFullYear(), nowParis.getMonth() + 1, 0, 23, 59, 59, 999);
    const prevStart = new Date(nowParis.getFullYear(), nowParis.getMonth() - 1, 1);
    const prevEnd = new Date(nowParis.getFullYear(), nowParis.getMonth(), 0, 23, 59, 59, 999);
    return { start, end, prevStart, prevEnd };
  }

  // week (default)
  const { startOfWeek: start, endOfWeek: end } = getWeekBoundsParis();
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - 7);
  const prevEnd = new Date(start.getTime() - 1);
  return { start, end, prevStart, prevEnd };
}

// ── a) Calls by day this week ──────────────────────

async function getCallsByDayThisWeek() {
  const { startOfWeek, endOfWeek, todayDateStr } = getWeekBoundsParis();

  const appels = await prisma.activite.findMany({
    where: {
      type: 'APPEL',
      createdAt: { gte: startOfWeek, lte: endOfWeek },
    },
    select: { createdAt: true },
  });

  // Build a map: dateStr -> count
  const countMap = new Map<string, number>();
  for (const a of appels) {
    const ds = toParisDateStr(a.createdAt);
    countMap.set(ds, (countMap.get(ds) ?? 0) + 1);
  }

  // Generate the 7-day array Mon-Sun
  const result: Array<{
    day: string;
    count: number;
    date: string;
    isToday: boolean;
    isFuture: boolean;
  }> = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    const dateStr = toParisDateStr(d);
    result.push({
      day: JOURS_SEMAINE[i],
      count: countMap.get(dateStr) ?? 0,
      date: dateStr,
      isToday: dateStr === todayDateStr,
      isFuture: dateStr > todayDateStr,
    });
  }

  return result;
}

// ── a-bis) Calls with period + trend ────────────────

async function getCallsData(period: 'today' | 'week' | 'month') {
  const { start, end, prevStart, prevEnd } = getPeriodBounds(period);

  const [currentCount, prevCount, callsByDay] = await Promise.all([
    prisma.activite.count({
      where: { type: 'APPEL', createdAt: { gte: start, lte: end } },
    }),
    prisma.activite.count({
      where: { type: 'APPEL', createdAt: { gte: prevStart, lte: prevEnd } },
    }),
    getCallsByDayThisWeek(),
  ]);

  const trend = prevCount > 0
    ? Math.round(((currentCount - prevCount) / prevCount) * 100)
    : currentCount > 0 ? 100 : null;

  return { currentCount, prevCount, trend, callsByDay };
}

// ── b) Mandats en cours (mini kanban) ──────────────

async function getMandatsEnCours() {
  const mandats = await prisma.mandat.findMany({
    where: { statut: { in: ['OUVERT', 'EN_COURS'] } },
    select: {
      id: true,
      titrePoste: true,
      statut: true,
      priorite: true,
      feeMontantEstime: true,
      createdAt: true,
      entreprise: { select: { id: true, nom: true } },
      candidatures: {
        select: {
          id: true,
          stage: true,
          createdAt: true,
          candidat: {
            select: { id: true, nom: true, prenom: true, photoUrl: true },
          },
        },
      },
      _count: { select: { candidatures: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Batch-query StageHistory for stage durations
  const allCandIds = mandats.flatMap(m => m.candidatures.map(c => c.id));
  const stageDurationMap = new Map<string, number>();

  if (allCandIds.length > 0) {
    const histories = await prisma.stageHistory.findMany({
      where: { candidatureId: { in: allCandIds } },
      orderBy: { changedAt: 'desc' },
      select: { candidatureId: true, changedAt: true },
    });

    const latestMap = new Map<string, Date>();
    for (const h of histories) {
      if (!latestMap.has(h.candidatureId)) {
        latestMap.set(h.candidatureId, h.changedAt);
      }
    }

    const now = Date.now();
    for (const [candId, changedAt] of latestMap) {
      stageDurationMap.set(candId, Math.floor((now - changedAt.getTime()) / (1000 * 60 * 60 * 24)));
    }
  }

  return mandats.map((m) => {
    const parStage: Record<string, Array<{
      id: string;
      candidatId: string;
      nom: string;
      prenom: string | null;
      photoUrl: string | null;
      joursDansStage: number;
    }>> = {};

    for (const c of m.candidatures) {
      if (!parStage[c.stage]) parStage[c.stage] = [];
      parStage[c.stage].push({
        id: c.id,
        candidatId: c.candidat.id,
        nom: c.candidat.nom,
        prenom: c.candidat.prenom,
        photoUrl: c.candidat.photoUrl,
        joursDansStage: stageDurationMap.get(c.id) ??
          Math.floor((Date.now() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
      });
    }

    return {
      id: m.id,
      titrePoste: m.titrePoste,
      statut: m.statut,
      priorite: m.priorite,
      entreprise: m.entreprise,
      feeMontantEstime: m.feeMontantEstime ?? null,
      totalCandidatures: m._count.candidatures,
      candidaturesParStage: parStage,
    };
  });
}

// ── c) Mandats dormants (no activity > 3 days) ────

async function getMandatsDormants() {
  const THREE_DAYS_AGO = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  // All active mandats
  const mandats = await prisma.mandat.findMany({
    where: { statut: { in: ['OUVERT', 'EN_COURS'] } },
    select: {
      id: true,
      titrePoste: true,
      statut: true,
      priorite: true,
      entrepriseId: true,
      entreprise: { select: { id: true, nom: true } },
      createdAt: true,
      candidatures: { select: { id: true } },
    },
  });

  if (mandats.length === 0) return [];

  // For each mandat, find the most recent activity directly linked (entiteType=MANDAT)
  // or linked through one of its candidatures (entiteType=CANDIDAT matched via candidatureId)
  const mandatIds = mandats.map((m) => m.id);
  const candidatureIds = mandats.flatMap((m) => m.candidatures.map((c) => c.id));

  // Most recent activity per mandat (direct link)
  const directActivites = await prisma.activite.findMany({
    where: { entiteType: 'MANDAT', entiteId: { in: mandatIds } },
    orderBy: { createdAt: 'desc' },
    select: { entiteId: true, createdAt: true },
  });

  // Most recent activity per candidature (linked to mandat candidatures)
  const candidatureActivites = candidatureIds.length > 0
    ? await prisma.activite.findMany({
        where: { entiteType: 'CANDIDAT', entiteId: { in: candidatureIds } },
        orderBy: { createdAt: 'desc' },
        select: { entiteId: true, createdAt: true },
      })
    : [];

  // Map candidatureId -> mandatId
  const candToMandat = new Map<string, string>();
  for (const m of mandats) {
    for (const c of m.candidatures) {
      candToMandat.set(c.id, m.id);
    }
  }

  // Compute latest activity date per mandat
  const latestPerMandat = new Map<string, Date>();

  for (const a of directActivites) {
    const existing = latestPerMandat.get(a.entiteId);
    if (!existing || a.createdAt > existing) {
      latestPerMandat.set(a.entiteId, a.createdAt);
    }
  }

  for (const a of candidatureActivites) {
    const mandatId = candToMandat.get(a.entiteId);
    if (!mandatId) continue;
    const existing = latestPerMandat.get(mandatId);
    if (!existing || a.createdAt > existing) {
      latestPerMandat.set(mandatId, a.createdAt);
    }
  }

  // Filter mandats whose latest activity is > 3 days ago (or no activity at all)
  const dormants = mandats
    .map((m) => {
      const lastActivity = latestPerMandat.get(m.id) ?? null;
      const isDormant = !lastActivity || lastActivity < THREE_DAYS_AGO;
      if (!isDormant) return null;

      const daysSinceActivity = lastActivity
        ? Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        id: m.id,
        titrePoste: m.titrePoste,
        statut: m.statut,
        priorite: m.priorite,
        entreprise: m.entreprise,
        lastActivityAt: lastActivity,
        daysSinceActivity,
        createdAt: m.createdAt,
      };
    })
    .filter(Boolean) as Array<{
      id: string;
      titrePoste: string;
      statut: string;
      priorite: string;
      entreprise: { id: string; nom: string };
      lastActivityAt: Date | null;
      daysSinceActivity: number | null;
      createdAt: Date;
    }>;

  // Sort by staleness: nulls first (never touched), then longest dormant
  dormants.sort((a, b) => {
    if (a.daysSinceActivity === null && b.daysSinceActivity === null) return 0;
    if (a.daysSinceActivity === null) return -1;
    if (b.daysSinceActivity === null) return 1;
    return b.daysSinceActivity - a.daysSinceActivity;
  });

  return dormants;
}

// ── d) Recent emails (via Gmail API) ────────────────

async function getRecentEmails(userId: string) {
  try {
    // Check if Gmail integration is connected
    const gmailConfig = await prisma.integrationConfig.findUnique({
      where: { userId_provider: { userId, provider: 'gmail' } },
    });

    if (!gmailConfig || !gmailConfig.enabled || !gmailConfig.accessToken) {
      return { connected: false, messages: [], unreadCount: 0 };
    }

    // Fetch from Gmail API
    const { getRecentInboxMessages, getUnreadCount } = await import('../integrations/gmail.service.js');

    const [messages, unreadCount] = await Promise.all([
      getRecentInboxMessages(userId, 6),
      getUnreadCount(userId),
    ]);

    return { connected: true, messages, unreadCount };
  } catch (error) {
    console.warn('[Dashboard] Failed to fetch Gmail messages:', error);
    // Fallback: return connected but empty
    return { connected: true, messages: [], unreadCount: 0 };
  }
}

// ── e) Focus du jour ────────────────────────────────

async function getFocusDuJour(userId: string) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setHours(23, 59, 59, 999);

  const THREE_DAYS_AGO = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const [tachesEnRetard, relancesDuJour, candidatsSansReponse] = await Promise.all([
    // Overdue tasks (due before today, not completed)
    prisma.activite.count({
      where: {
        userId,
        isTache: true,
        tacheCompleted: false,
        tacheDueDate: { lt: startOfToday },
      },
    }),
    // Tasks due today
    prisma.activite.count({
      where: {
        userId,
        isTache: true,
        tacheCompleted: false,
        tacheDueDate: { gte: startOfToday, lte: endOfToday },
      },
    }),
    // Candidates in CONTACTE stage with no update for 3+ days
    prisma.candidature.count({
      where: {
        createdById: userId,
        stage: 'CONTACTE',
        updatedAt: { lt: THREE_DAYS_AGO },
      },
    }),
  ]);

  return { tachesEnRetard, relancesDuJour, candidatsSansReponse };
}

// ── f) Revenue by month (last 6 months, real data) ──

async function getRevenueByMonth() {
  const now = new Date();
  const months: Array<{ month: string; value: number }> = [];

  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);

    const result = await prisma.mandat.aggregate({
      where: {
        feeStatut: { in: ['FACTURE', 'PAYE'] },
        updatedAt: { gte: start, lte: end },
      },
      _sum: { feeMontantFacture: true },
    });

    const monthLabel = start.toLocaleString('fr-FR', { month: 'short' }).replace('.', '');
    months.push({
      month: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
      value: result._sum.feeMontantFacture ?? 0,
    });
  }

  return months;
}

// ── Aggregated cockpit endpoint ────────────────────

export async function getCockpitData(userId: string, period: 'today' | 'week' | 'month' = 'week') {
  const [callsData, mandatsEnCours, recentEmails, focusDuJour, revenueByMonth] =
    await Promise.all([
      getCallsData(period),
      getMandatsEnCours(),
      getRecentEmails(userId),
      getFocusDuJour(userId),
      getRevenueByMonth(),
    ]);

  return {
    callsByDay: callsData.callsByDay,
    callsTrend: callsData.trend,
    callsCurrentPeriod: callsData.currentCount,
    callsPreviousPeriod: callsData.prevCount,
    mandatsEnCours,
    recentEmails,
    focusDuJour,
    revenueByMonth,
  };
}

export async function getRecruteurStats(userId: string) {
  // Mes mandats: mandats where user has candidatures, with candidature stage info
  const mesMandatsRaw = await prisma.mandat.findMany({
    where: {
      statut: { in: ['OUVERT', 'EN_COURS'] },
      OR: [
        { createdById: userId },
        { assignedToId: userId },
        { candidatures: { some: { createdById: userId } } },
      ],
    },
    select: {
      id: true,
      titrePoste: true,
      statut: true,
      entreprise: { select: { nom: true } },
      candidatures: {
        select: { id: true, stage: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Build mandats with stageCounts and totalCandidatures
  const mandats = mesMandatsRaw.map((m) => {
    const stageCounts: Record<string, number> = {};
    for (const c of m.candidatures) {
      stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1;
    }
    return {
      id: m.id,
      titrePoste: m.titrePoste,
      entreprise: m.entreprise,
      stageCounts,
      totalCandidatures: m.candidatures.length,
    };
  });

  // Mon activite recente: last 10 activites by user
  const activitesRecentes = await prisma.activite.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      type: true,
      titre: true,
      contenu: true,
      source: true,
      entiteType: true,
      entiteId: true,
      createdAt: true,
    },
  });

  return {
    mandats,
    activitesRecentes,
  };
}

// ═══════════════════════════════════════════════════════
// SPA — Single-call dashboard for the new SPA 360 layout
// ═══════════════════════════════════════════════════════

const STAGE_PROBABILITY: Record<string, number> = {
  SOURCING: 0.10,
  CONTACTE: 0.20,
  ENTRETIEN_1: 0.40,
  ENTRETIEN_CLIENT: 0.60,
  OFFRE: 0.80,
  PLACE: 1.0,
};

const STAGE_ORDER = ['SOURCING', 'CONTACTE', 'ENTRETIEN_1', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE'];

function highestStageAmong(stages: string[]): string {
  let best = -1;
  let bestStage = 'SOURCING';
  for (const s of stages) {
    const idx = STAGE_ORDER.indexOf(s);
    if (idx > best) { best = idx; bestStage = s; }
  }
  return bestStage;
}

export async function getSpaData(
  userId: string,
  period: 'today' | 'week' | 'month' = 'week',
  isTeam = false,
) {
  const nowParis = new Date(new Date().toLocaleString('en-US', { timeZone: PARIS_TZ }));
  const startOfToday = new Date(nowParis);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(nowParis);
  endOfToday.setHours(23, 59, 59, 999);

  const { startOfWeek, endOfWeek } = getWeekBoundsParis();

  // Month bounds
  const startOfMonth = new Date(nowParis.getFullYear(), nowParis.getMonth(), 1);
  const endOfMonth = new Date(nowParis.getFullYear(), nowParis.getMonth() + 1, 0, 23, 59, 59, 999);
  const prevMonthStart = new Date(nowParis.getFullYear(), nowParis.getMonth() - 1, 1);
  const prevMonthEnd = new Date(nowParis.getFullYear(), nowParis.getMonth(), 0, 23, 59, 59, 999);

  // User filter (if not team mode, scope to user)
  const userFilter = isTeam ? {} : { userId };
  const createdByFilter = isTeam ? {} : { createdById: userId };

  // ── Parallel batch 1: counts and aggregates ──
  const [
    emailsNonLus,
    tachesEnRetard,
    sequenceReplies,
    caThisMonth,
    caPrevMonth,
    appelsToday,
    appelsWeek,
    rdvTodayCount,
    rdvWeekCount,
    candidatsEnProcessCount,
    recentEmailsData,
    tachesRaw,
  ] = await Promise.all([
    // Unread emails count (capped at 999 for reasonable display)
    (async () => {
      try {
        const gmailConfig = await prisma.integrationConfig.findUnique({
          where: { userId_provider: { userId, provider: 'gmail' } },
        });
        if (!gmailConfig?.enabled || !gmailConfig.accessToken) return 0;
        const { getUnreadCount } = await import('../integrations/gmail.service.js');
        const count = await getUnreadCount(userId);
        if (typeof count !== 'number' || !isFinite(count) || count < 0) return 0;
        return Math.min(count, 999);
      } catch { return 0; }
    })(),

    // Overdue tasks
    prisma.activite.count({
      where: {
        ...userFilter,
        isTache: true,
        tacheCompleted: false,
        tacheDueDate: { lt: startOfToday },
      },
    }),

    // Sequence replies (paused_reply)
    prisma.sequenceRun.count({
      where: {
        status: 'paused_reply',
        ...(isTeam ? {} : { assignedToId: userId }),
      },
    }),

    // CA this month (fee facturé/payé)
    prisma.mandat.aggregate({
      where: {
        feeStatut: { in: ['FACTURE', 'PAYE'] },
        updatedAt: { gte: startOfMonth, lte: endOfMonth },
        ...(isTeam ? {} : { OR: [{ createdById: userId }, { assignedToId: userId }] }),
      },
      _sum: { feeMontantFacture: true },
    }),

    // CA prev month
    prisma.mandat.aggregate({
      where: {
        feeStatut: { in: ['FACTURE', 'PAYE'] },
        updatedAt: { gte: prevMonthStart, lte: prevMonthEnd },
        ...(isTeam ? {} : { OR: [{ createdById: userId }, { assignedToId: userId }] }),
      },
      _sum: { feeMontantFacture: true },
    }),

    // Appels today
    prisma.activite.count({
      where: { ...userFilter, type: 'APPEL', createdAt: { gte: startOfToday, lte: endOfToday } },
    }),

    // Appels this week
    prisma.activite.count({
      where: { ...userFilter, type: 'APPEL', createdAt: { gte: startOfWeek, lte: endOfWeek } },
    }),

    // RDV today (meetings)
    prisma.activite.count({
      where: { ...userFilter, type: 'MEETING', createdAt: { gte: startOfToday, lte: endOfToday } },
    }),

    // RDV this week
    prisma.activite.count({
      where: { ...userFilter, type: 'MEETING', createdAt: { gte: startOfWeek, lte: endOfWeek } },
    }),

    // Candidats en process
    prisma.candidature.count({
      where: {
        ...createdByFilter,
        stage: { notIn: ['REFUSE', 'PLACE'] },
      },
    }),

    // Recent emails
    getRecentEmails(userId),

    // Tasks (incomplete, sorted by due date)
    prisma.activite.findMany({
      where: {
        ...userFilter,
        isTache: true,
        tacheCompleted: false,
      },
      orderBy: [{ tacheDueDate: 'asc' }, { createdAt: 'desc' }],
      take: 10,
      select: {
        id: true,
        titre: true,
        tacheDueDate: true,
        tacheCompleted: true,
        metadata: true,
      },
    }),
  ]);

  // ── Mandats en cours with activity info ──
  const mandatsRaw = await prisma.mandat.findMany({
    where: {
      statut: { in: ['OUVERT', 'EN_COURS'] },
      ...(isTeam ? {} : { OR: [{ createdById: userId }, { assignedToId: userId }, { candidatures: { some: { createdById: userId } } }] }),
    },
    select: {
      id: true,
      titrePoste: true,
      feeMontantEstime: true,
      entreprise: { select: { id: true, nom: true } },
      candidatures: {
        select: { id: true, stage: true },
      },
      _count: { select: { candidatures: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Get activity dates for mandats
  const mandatIds = mandatsRaw.map(m => m.id);
  const allCandIdsForMandats = mandatsRaw.flatMap(m => m.candidatures.map(c => c.id));

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

  // Build candId -> mandatId map
  const candToMandatMap = new Map<string, string>();
  for (const m of mandatsRaw) {
    for (const c of m.candidatures) {
      candToMandatMap.set(c.id, m.id);
    }
  }

  // Compute last activity per mandat
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

  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();

  const mandats = mandatsRaw.map(m => {
    const stages = m.candidatures.map(c => c.stage);
    const hs = stages.length > 0 ? highestStageAmong(stages) : 'SOURCING';
    const lastAct = lastActivityMap.get(m.id) ?? null;
    const daysSince = lastAct ? Math.floor((nowMs - lastAct.getTime()) / (1000 * 60 * 60 * 24)) : null;
    return {
      id: m.id,
      titrePoste: m.titrePoste,
      entreprise: m.entreprise,
      feeMontantEstime: m.feeMontantEstime ?? null,
      highestStage: hs,
      totalCandidats: m._count.candidatures,
      daysSinceActivity: daysSince,
      isDormant: daysSince === null ? false : daysSince > 7,
    };
  });

  // Find worst dormant mandat
  const dormants = mandats.filter(m => m.isDormant || m.daysSinceActivity === null);
  dormants.sort((a, b) => {
    if (a.daysSinceActivity === null && b.daysSinceActivity === null) return 0;
    if (a.daysSinceActivity === null) return -1;
    if (b.daysSinceActivity === null) return 1;
    return b.daysSinceActivity - a.daysSinceActivity;
  });
  const worstDormant = dormants.length > 0 && dormants[0].daysSinceActivity !== null
    ? { titre: dormants[0].titrePoste, jours: dormants[0].daysSinceActivity! }
    : null;

  // ── Pipe pondéré ──
  const pipeThisMonth = mandats.reduce((sum, m) => {
    if (!m.feeMontantEstime) return sum;
    const prob = STAGE_PROBABILITY[m.highestStage] ?? 0.10;
    return sum + m.feeMontantEstime * prob;
  }, 0);

  // For delta, we need last month's pipe (simplified: use current data since we can't snapshot)
  const pipeDelta: number | null = null;

  // ── CA delta ──
  const caThisVal = caThisMonth._sum.feeMontantFacture ?? 0;
  const caPrevVal = caPrevMonth._sum.feeMontantFacture ?? 0;
  const caDelta = caPrevVal > 0
    ? Math.round(((caThisVal - caPrevVal) / caPrevVal) * 100)
    : caThisVal > 0 ? 100 : null;

  // ── Appels average per day (this week, past days only) ──
  const dayOfWeek = nowParis.getDay(); // 0=Sun, 1=Mon...
  const pastDaysThisWeek = dayOfWeek === 0 ? 7 : dayOfWeek; // Mon=1 → 1 day, etc.
  const moyAppelsJour = pastDaysThisWeek > 0 ? Math.round((appelsWeek / pastDaysThisWeek) * 10) / 10 : 0;

  // ── Weekly activity (last 4 weeks) ──
  const fourWeeksAgo = new Date(startOfWeek);
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 21); // 3 weeks before current week start

  const [callsLast4, meetingsLast4] = await Promise.all([
    prisma.activite.findMany({
      where: { ...userFilter, type: 'APPEL', createdAt: { gte: fourWeeksAgo, lte: endOfWeek } },
      select: { createdAt: true },
    }),
    prisma.activite.findMany({
      where: { ...userFilter, type: 'MEETING', createdAt: { gte: fourWeeksAgo, lte: endOfWeek } },
      select: { createdAt: true },
    }),
  ]);

  // Group by week
  const weeklyActivity: Array<{ week: string; calls: number; rdv: number }> = [];
  for (let w = 0; w < 4; w++) {
    const wStart = new Date(startOfWeek);
    wStart.setDate(wStart.getDate() - (3 - w) * 7);
    const wEnd = new Date(wStart);
    wEnd.setDate(wEnd.getDate() + 6);
    wEnd.setHours(23, 59, 59, 999);

    const calls = callsLast4.filter(a => a.createdAt >= wStart && a.createdAt <= wEnd).length;
    const rdv = meetingsLast4.filter(a => a.createdAt >= wStart && a.createdAt <= wEnd).length;
    weeklyActivity.push({ week: `S${w + 1}`, calls, rdv });
  }

  // ── Calendar dots (events per day for current month) ──
  // We'll return empty if no calendar integration; the frontend fetches calendar events separately
  const calendarDots: Record<string, number> = {};

  // ── Revenue by month (reuse existing function) ──
  const revenueByMonth = await getRevenueByMonth();

  // ── RDV confirmés / en attente (approximate from calendar integration) ──
  // We don't have status in Activity, so just return total as confirmés
  const rdvConfirmes = rdvWeekCount;
  const rdvEnAttente = 0;

  // ── Structure KPIs (global, no user filter) ──
  // Only compute when NOT in team mode (recruteurs need these alongside personal data)
  let structureKpis = null;
  if (!isTeam) {
    const [structCaThis, structMandatsActifs, structCandidatsProcess, structPipeMandats] = await Promise.all([
      prisma.mandat.aggregate({
        where: {
          feeStatut: { in: ['FACTURE', 'PAYE'] },
          updatedAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { feeMontantFacture: true },
      }),
      prisma.mandat.count({
        where: { statut: { in: ['OUVERT', 'EN_COURS'] } },
      }),
      prisma.candidature.count({
        where: { stage: { notIn: ['REFUSE', 'PLACE'] } },
      }),
      prisma.mandat.findMany({
        where: { statut: { in: ['OUVERT', 'EN_COURS'] } },
        select: {
          feeMontantEstime: true,
          candidatures: { select: { stage: true } },
        },
      }),
    ]);

    const structPipe = structPipeMandats.reduce((sum, m) => {
      if (!m.feeMontantEstime) return sum;
      const stages = m.candidatures.map(c => c.stage);
      const hs = stages.length > 0 ? highestStageAmong(stages) : 'SOURCING';
      const prob = STAGE_PROBABILITY[hs] ?? 0.10;
      return sum + m.feeMontantEstime * prob;
    }, 0);

    structureKpis = {
      caStructure: structCaThis._sum.feeMontantFacture ?? 0,
      mandatsActifs: structMandatsActifs,
      candidatsEnProcess: structCandidatsProcess,
      pipeStructure: Math.round(structPipe),
    };
  }

  // ── Build final response ──
  return {
    bandeau: {
      emailsNonLus: emailsNonLus as number,
      mandatsDormants: { count: dormants.length, worst: worstDormant },
      tachesEnRetard,
      sequenceReplies,
      rdvAujourdhui: rdvTodayCount,
    },
    kpis: {
      caMois: { value: caThisVal, delta: caDelta },
      appels: { today: appelsToday, week: appelsWeek, moyJour: moyAppelsJour },
      rdv: { today: rdvTodayCount, week: rdvWeekCount, confirmes: rdvConfirmes, enAttente: rdvEnAttente },
      candidatsEnProcess: candidatsEnProcessCount,
      pipePondere: { value: Math.round(pipeThisMonth), delta: pipeDelta },
    },
    structureKpis,
    mandats,
    taches: tachesRaw,
    recentEmails: recentEmailsData,
    weeklyActivity,
    calendarDots,
    revenueByMonth,
  };
}
