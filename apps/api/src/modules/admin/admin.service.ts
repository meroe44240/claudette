import prisma from '../../lib/db.js';

// ─── TYPES ──────────────────────────────────────────

interface PeriodRange {
  start: Date;
  end: Date;
}

export interface RecruiterStats {
  userId: string;
  nom: string;
  prenom: string | null;
  avatarUrl: string | null;
  role: string;
  email: string;
  startDate: string | null;
  // Finance
  revenue: number;
  cost: number;
  margin: number;
  roi: number | null; // null = infinity (cost = 0)
  monthlySalary: number | null;
  variableRate: number | null;
  // Activity
  nbAppels: number;
  nbRdvTotal: number;
  nbRdvPresentation: number;
  nbRdvCommercial: number;
  nbRdvAutre: number;
  nbCandidatsRencontres: number;
  nbMandatsActifs: number;
}

export interface TeamFinancials {
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  overallRoi: number | null;
  monthlyPnL: Array<{
    month: string;
    revenue: number;
    cost: number;
    margin: number;
  }>;
}

// ─── PERIOD HELPERS ─────────────────────────────────

function getPeriodRange(period: string, dateStr?: string): PeriodRange {
  const refDate = dateStr ? new Date(dateStr) : new Date();

  switch (period) {
    case 'day': {
      const start = new Date(refDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(refDate);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'week': {
      const start = new Date(refDate);
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday start
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'month': {
      const start = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
      const end = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'quarter': {
      const q = Math.floor(refDate.getMonth() / 3);
      const start = new Date(refDate.getFullYear(), q * 3, 1);
      const end = new Date(refDate.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'year': {
      const start = new Date(refDate.getFullYear(), 0, 1);
      const end = new Date(refDate.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start, end };
    }
    default:
      return getPeriodRange('month', dateStr);
  }
}

function monthsInRange(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  return Math.max(diffMs / (30.44 * 24 * 60 * 60 * 1000), 1);
}

// ─── TEAM STATS ─────────────────────────────────────

export async function getTeamStats(period: string, dateStr?: string): Promise<{
  recruiters: RecruiterStats[];
  financials: TeamFinancials;
  period: PeriodRange;
}> {
  const range = getPeriodRange(period, dateStr);

  // Get all users
  const users = await prisma.user.findMany({
    select: {
      id: true,
      nom: true,
      prenom: true,
      avatarUrl: true,
      role: true,
      email: true,
      startDate: true,
      monthlySalary: true,
      variableRate: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const recruiterStats: RecruiterStats[] = [];

  for (const user of users) {
    // 1. Count appels (activites of type APPEL by this user in period)
    const nbAppels = await prisma.activite.count({
      where: {
        userId: user.id,
        type: 'APPEL',
        createdAt: { gte: range.start, lte: range.end },
      },
    });

    // 2. Count RDVs (meetings)
    const meetings = await prisma.activite.count({
      where: {
        userId: user.id,
        type: 'MEETING',
        createdAt: { gte: range.start, lte: range.end },
      },
    });

    // 3. Count meeting subtypes from metadata
    const meetingActivites = await prisma.activite.findMany({
      where: {
        userId: user.id,
        type: 'MEETING',
        createdAt: { gte: range.start, lte: range.end },
      },
      select: { metadata: true },
    });

    let nbRdvPresentation = 0;
    let nbRdvCommercial = 0;
    let nbRdvAutre = 0;
    for (const m of meetingActivites) {
      const meta = m.metadata as any;
      const meetingType = meta?.meetingType ?? 'other';
      if (meetingType === 'presentation' || meetingType === 'entretien') nbRdvPresentation++;
      else if (meetingType === 'commercial' || meetingType === 'weekly_client' || meetingType === 'nouveau_client') nbRdvCommercial++;
      else nbRdvAutre++;
    }

    // 4. Candidats rencontrés (unique candidats with meetings)
    const candidatsMet = await prisma.activite.findMany({
      where: {
        userId: user.id,
        type: 'MEETING',
        entiteType: 'CANDIDAT',
        createdAt: { gte: range.start, lte: range.end },
      },
      select: { entiteId: true },
      distinct: ['entiteId'],
    });
    const nbCandidatsRencontres = candidatsMet.length;

    // 5. Mandats actifs assignés
    const nbMandatsActifs = await prisma.mandat.count({
      where: {
        assignedToId: user.id,
        statut: { in: ['OUVERT', 'EN_COURS'] },
      },
    });

    // 6. Revenue: fees facturés des mandats du recruteur
    const mandatsWithFees = await prisma.mandat.findMany({
      where: {
        assignedToId: user.id,
        feeStatut: { in: ['FACTURE', 'PAYE'] },
      },
      select: { feeMontantFacture: true, feeMontantEstime: true },
    });
    const revenue = mandatsWithFees.reduce((sum, m) => sum + (m.feeMontantFacture ?? m.feeMontantEstime ?? 0), 0);

    // 7. Cost calculation
    const nbMonths = monthsInRange(range.start, range.end);
    const salary = user.monthlySalary ?? 0;
    // Prorata if startDate is after period start
    let effectiveMonths = nbMonths;
    const effectiveStart = user.startDate ?? user.createdAt;
    if (effectiveStart > range.start) {
      const remainingMs = range.end.getTime() - effectiveStart.getTime();
      effectiveMonths = Math.max(remainingMs / (30.44 * 24 * 60 * 60 * 1000), 0);
    }
    const baseCost = salary * effectiveMonths;
    const variableCost = (user.variableRate ?? 0) > 0 ? revenue * ((user.variableRate ?? 0) / 100) : 0;
    const cost = baseCost + variableCost;

    const margin = revenue - cost;
    const roi = cost > 0 ? revenue / cost : (revenue > 0 ? null : 0); // null = infinity

    recruiterStats.push({
      userId: user.id,
      nom: user.nom,
      prenom: user.prenom,
      avatarUrl: user.avatarUrl,
      role: user.role,
      email: user.email,
      startDate: (user.startDate ?? user.createdAt).toISOString(),
      revenue,
      cost: Math.round(cost),
      margin: Math.round(margin),
      roi,
      monthlySalary: user.monthlySalary,
      variableRate: user.variableRate,
      nbAppels,
      nbRdvTotal: meetings,
      nbRdvPresentation,
      nbRdvCommercial,
      nbRdvAutre,
      nbCandidatsRencontres,
      nbMandatsActifs,
    });
  }

  // Build team financials
  const totalRevenue = recruiterStats.reduce((s, r) => s + r.revenue, 0);
  const totalCost = recruiterStats.reduce((s, r) => s + r.cost, 0);
  const totalMargin = totalRevenue - totalCost;
  const overallRoi = totalCost > 0 ? totalRevenue / totalCost : (totalRevenue > 0 ? null : 0);

  // Monthly P&L (last 6 months)
  const monthlyPnL: TeamFinancials['monthlyPnL'] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const monthLabel = monthStart.toLocaleString('fr-FR', { month: 'short' });

    // Revenue for this month — use mandats with fee status FACTURE or PAYE
    const monthMandats = await prisma.mandat.findMany({
      where: {
        feeStatut: { in: ['FACTURE', 'PAYE'] },
        dateCloture: { gte: monthStart, lte: monthEnd },
      },
      select: { feeMontantFacture: true, feeMontantEstime: true },
    });
    const monthRevenue = monthMandats.reduce((s, m) => s + (m.feeMontantFacture ?? m.feeMontantEstime ?? 0), 0);

    // Cost for this month (all user salaries)
    const monthCost = users.reduce((s, u) => s + (u.monthlySalary ?? 0), 0);

    monthlyPnL.push({
      month: monthLabel,
      revenue: monthRevenue,
      cost: monthCost,
      margin: monthRevenue - monthCost,
    });
  }

  return {
    recruiters: recruiterStats,
    financials: {
      totalRevenue,
      totalCost,
      totalMargin,
      overallRoi,
      monthlyPnL,
    },
    period: range,
  };
}

// ─── UPDATE COMPENSATION ────────────────────────────

export async function updateCompensation(userId: string, data: {
  monthlySalary?: number | null;
  variableRate?: number | null;
  startDate?: string | null;
}) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      monthlySalary: data.monthlySalary,
      variableRate: data.variableRate,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      monthlySalary: true,
      variableRate: true,
      startDate: true,
    },
  });
}
