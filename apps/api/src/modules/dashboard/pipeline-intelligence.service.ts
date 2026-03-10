import prisma from '../../lib/db.js';

interface MandatHealth {
  mandatId: string;
  titrePoste: string;
  entreprise: string | null;
  status: 'GREEN' | 'AMBER' | 'RED';
  score: number; // 0-100
  reasons: string[];
  recommendation: string;
  stats: {
    totalCandidats: number;
    activeCandidats: number;
    daysSinceLastActivity: number;
    daysSinceCreation: number;
    conversionRate: number;
  };
}

export async function getPipelineIntelligence(userId?: string): Promise<{ mandats: MandatHealth[] }> {
  const where: any = { statut: { in: ['OUVERT', 'EN_COURS'] } };
  if (userId) where.assignedToId = userId;

  const mandats = await prisma.mandat.findMany({
    where,
    include: {
      entreprise: { select: { nom: true } },
      candidatures: {
        select: {
          id: true,
          stage: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  const now = new Date();
  const results: MandatHealth[] = [];

  for (const mandat of mandats) {
    const reasons: string[] = [];
    let score = 100;

    // Stats calculations
    const totalCandidats = mandat.candidatures.length;
    const activeCandidats = mandat.candidatures.filter(c => !['REFUSE', 'PLACE'].includes(c.stage)).length;
    const daysSinceCreation = Math.floor((now.getTime() - mandat.createdAt.getTime()) / (1000 * 60 * 60 * 24));

    // Last activity on any candidature
    const lastActivity = mandat.candidatures.reduce((max, c) => {
      const d = new Date(c.updatedAt);
      return d > max ? d : max;
    }, mandat.createdAt);
    const daysSinceLastActivity = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));

    // Conversion: how many got past SOURCING
    const pastSourcing = mandat.candidatures.filter(c => !['SOURCING', 'REFUSE'].includes(c.stage)).length;
    const conversionRate = totalCandidats > 0 ? (pastSourcing / totalCandidats) * 100 : 0;

    // Scoring rules
    if (totalCandidats === 0) {
      score -= 40;
      reasons.push('Aucun candidat en process');
    } else if (activeCandidats === 0) {
      score -= 30;
      reasons.push('Tous les candidats sont refuses ou places');
    } else if (activeCandidats < 3) {
      score -= 15;
      reasons.push(`Seulement ${activeCandidats} candidat(s) actif(s)`);
    }

    if (daysSinceLastActivity > 14) {
      score -= 30;
      reasons.push(`Aucune activite depuis ${daysSinceLastActivity} jours`);
    } else if (daysSinceLastActivity > 7) {
      score -= 15;
      reasons.push(`Derniere activite il y a ${daysSinceLastActivity} jours`);
    }

    if (daysSinceCreation > 60 && !mandat.candidatures.some(c => ['OFFRE', 'PLACE'].includes(c.stage))) {
      score -= 20;
      reasons.push('Mandat ouvert depuis > 60 jours sans offre');
    }

    if (conversionRate < 10 && totalCandidats > 5) {
      score -= 10;
      reasons.push(`Taux de conversion faible (${conversionRate.toFixed(0)}%)`);
    }

    score = Math.max(0, Math.min(100, score));

    let status: 'GREEN' | 'AMBER' | 'RED';
    let recommendation: string;

    if (score >= 70) {
      status = 'GREEN';
      recommendation = 'Pipeline sain — continuer le process';
    } else if (score >= 40) {
      status = 'AMBER';
      recommendation = reasons[0] || 'Attention requise — verifier le pipeline';
    } else {
      status = 'RED';
      recommendation = 'Action urgente — risque de perte du mandat';
    }

    results.push({
      mandatId: mandat.id,
      titrePoste: mandat.titrePoste,
      entreprise: mandat.entreprise?.nom || null,
      status,
      score,
      reasons,
      recommendation,
      stats: {
        totalCandidats,
        activeCandidats,
        daysSinceLastActivity,
        daysSinceCreation,
        conversionRate: Math.round(conversionRate),
      },
    });
  }

  // Sort by score ascending (worst first)
  results.sort((a, b) => a.score - b.score);

  return { mandats: results };
}
