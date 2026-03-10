import prisma from '../../lib/db.js';

interface LeaderboardEntry {
  userId: string;
  nom: string;
  prenom: string | null;
  stats: {
    placements: number;
    revenue: number;
    calls: number;
    emails: number;
    meetings: number;
    activeCandidatures: number;
  };
  rank: number;
}

export async function getLeaderboard(period: 'week' | 'month' | 'quarter' | 'year' = 'month'): Promise<{ leaderboard: LeaderboardEntry[] }> {
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'week':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      startDate = new Date(now.getFullYear(), qMonth, 1);
      break;
    }
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
  }

  const users = await prisma.user.findMany({
    select: { id: true, nom: true, prenom: true },
    where: { role: { in: ['ADMIN', 'RECRUTEUR'] } },
  });

  const entries: LeaderboardEntry[] = [];

  for (const user of users) {
    // Count placements
    const placements = await prisma.candidature.count({
      where: {
        stage: 'PLACE',
        updatedAt: { gte: startDate },
        mandat: { assignedToId: user.id },
      },
    });

    // Revenue from placed mandats
    const placedMandats = await prisma.mandat.findMany({
      where: {
        assignedToId: user.id,
        candidatures: { some: { stage: 'PLACE', updatedAt: { gte: startDate } } },
      },
      select: { feeMontantFacture: true, salaireMax: true, feePourcentage: true },
    });
    const revenue = placedMandats.reduce((sum, m) => sum + (m.feeMontantFacture || 0), 0);

    // Activity counts
    const activities = await prisma.activite.groupBy({
      by: ['type'],
      where: { userId: user.id, createdAt: { gte: startDate } },
      _count: true,
    });

    const actMap = Object.fromEntries(activities.map(a => [a.type, a._count]));

    entries.push({
      userId: user.id,
      nom: user.nom,
      prenom: user.prenom,
      stats: {
        placements,
        revenue,
        calls: actMap['APPEL'] || 0,
        emails: actMap['EMAIL'] || 0,
        meetings: actMap['MEETING'] || 0,
        activeCandidatures: await prisma.candidature.count({
          where: {
            mandat: { assignedToId: user.id },
            stage: { notIn: ['REFUSE', 'PLACE'] },
          },
        }),
      },
      rank: 0,
    });
  }

  // Sort by placements, then revenue, then calls
  entries.sort((a, b) => {
    if (b.stats.placements !== a.stats.placements) return b.stats.placements - a.stats.placements;
    if (b.stats.revenue !== a.stats.revenue) return b.stats.revenue - a.stats.revenue;
    return b.stats.calls - a.stats.calls;
  });

  entries.forEach((e, i) => e.rank = i + 1);

  return { leaderboard: entries };
}
