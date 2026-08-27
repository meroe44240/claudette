import prisma from '../../lib/db.js';
import { wonCa } from './ca-objectif.helper.js';

interface LeaderboardEntry {
  userId: string;
  nom: string;
  prenom: string | null;
  fonction: string;
  stats: {
    placements: number;
    revenue: number; // CA « gagné » (cohérent avec l'objectif financier)
    presentations: number;
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
    select: { id: true, nom: true, prenom: true, fonction: true } as any,
    where: { role: { in: ['ADMIN', 'RECRUTEUR'] }, status: 'ACTIVE' } as any,
  });

  // Fin de période = maintenant (large borne pour capter tout ce qui est ≥ startDate).
  const end = new Date(now.getFullYear() + 1, 0, 1);
  // Un mandat est attribué à la personne si elle en est le sales, le recruteur,
  // l'assigné ou le créateur (binôme). Sert à toutes les stats basées mandat.
  const attrib = (uid: string) => ({
    OR: [{ salesId: uid }, { recruteurId: uid }, { assignedToId: uid }, { createdById: uid }],
  });

  const entries: LeaderboardEntry[] = [];

  for (const user of users as any[]) {
    const [placements, presentations, activeCandidatures, activities, revenue] = await Promise.all([
      prisma.candidature.count({
        where: { stage: 'PLACE', updatedAt: { gte: startDate }, mandat: attrib(user.id) },
      }),
      prisma.candidature.count({
        where: {
          stage: { in: ['ENTRETIEN_CLIENT', 'OFFRE', 'PLACE'] },
          updatedAt: { gte: startDate },
          mandat: attrib(user.id),
        },
      }),
      prisma.candidature.count({
        where: { mandat: attrib(user.id), stage: { notIn: ['REFUSE', 'PLACE'] } },
      }),
      prisma.activite.groupBy({
        by: ['type'],
        where: { userId: user.id, createdAt: { gte: startDate } },
        _count: true,
      }),
      // CA « gagné » (cohérent avec l'objectif : mandats GAGNE, fee facturé sinon estimé).
      wonCa({ start: startDate, end }, user.id),
    ]);

    const actMap = Object.fromEntries(activities.map((a: any) => [a.type, a._count]));

    entries.push({
      userId: user.id,
      nom: user.nom,
      prenom: user.prenom,
      fonction: user.fonction ?? 'RECRUTEUR',
      stats: {
        placements,
        revenue,
        presentations,
        calls: actMap['APPEL'] || 0,
        emails: actMap['EMAIL'] || 0,
        meetings: actMap['MEETING'] || 0,
        activeCandidatures,
      },
      rank: 0,
    });
  }

  // Rang par défaut = CA gagné, puis placements, puis présentations.
  entries.sort((a, b) => {
    if (b.stats.revenue !== a.stats.revenue) return b.stats.revenue - a.stats.revenue;
    if (b.stats.placements !== a.stats.placements) return b.stats.placements - a.stats.placements;
    return b.stats.presentations - a.stats.presentations;
  });

  entries.forEach((e, i) => e.rank = i + 1);

  return { leaderboard: entries };
}
