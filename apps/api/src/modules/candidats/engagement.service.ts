import prisma from '../../lib/db.js';

type EngagementLevel = 'HOT' | 'WARM' | 'COLD' | 'INACTIVE';

interface BatchEngagementScore {
  candidatId: string;
  nom: string;
  prenom: string | null;
  level: EngagementLevel;
  score: number; // 0-100
  lastContactDays: number;
  signals: string[];
}

export async function getEngagementScores(limit = 50): Promise<{ candidats: BatchEngagementScore[] }> {
  const candidats = await prisma.candidat.findMany({
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      nom: true,
      prenom: true,
      email: true,
      updatedAt: true,
      createdAt: true,
      candidatures: {
        select: { id: true, stage: true, updatedAt: true },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      },
    },
  });

  const now = new Date();
  const results: BatchEngagementScore[] = [];

  for (const candidat of candidats) {
    const signals: string[] = [];
    let score = 50; // baseline

    // Last activity
    const lastUpdate = candidat.updatedAt;
    const daysSinceUpdate = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));

    // Active candidatures boost
    const activeCandidatures = candidat.candidatures.filter(c => !['REFUSE', 'ARCHIVE'].includes(c.stage));
    if (activeCandidatures.length > 0) {
      score += 20;
      signals.push(`${activeCandidatures.length} candidature(s) active(s)`);
    }

    // Recent candidature activity
    const recentCandidature = candidat.candidatures[0];
    if (recentCandidature) {
      const daysSinceCandidature = Math.floor((now.getTime() - new Date(recentCandidature.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceCandidature < 7) {
        score += 15;
        signals.push('Activite candidature < 7 jours');
      } else if (daysSinceCandidature < 30) {
        score += 5;
        signals.push('Activite candidature < 30 jours');
      }
    }

    // Decay based on inactivity
    if (daysSinceUpdate > 90) {
      score -= 30;
      signals.push('Aucun contact depuis > 90 jours');
    } else if (daysSinceUpdate > 30) {
      score -= 15;
      signals.push(`Dernier contact il y a ${daysSinceUpdate} jours`);
    } else if (daysSinceUpdate < 7) {
      score += 10;
      signals.push('Contact recent < 7 jours');
    }

    // Advanced stages boost
    const advancedStages = ['ENTRETIEN', 'ENTRETIEN_CLIENT', 'SHORTLIST', 'OFFRE'];
    const hasAdvanced = candidat.candidatures.some(c => advancedStages.includes(c.stage));
    if (hasAdvanced) {
      score += 10;
      signals.push('Candidature en etape avancee');
    }

    score = Math.max(0, Math.min(100, score));

    let level: EngagementLevel;
    if (score >= 70) level = 'HOT';
    else if (score >= 45) level = 'WARM';
    else if (score >= 20) level = 'COLD';
    else level = 'INACTIVE';

    results.push({
      candidatId: candidat.id,
      nom: candidat.nom,
      prenom: candidat.prenom,
      level,
      score,
      lastContactDays: daysSinceUpdate,
      signals,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return { candidats: results };
}

interface EngagementScore {
  candidatId: string;
  score: number; // 0-100
  level: 'HOT' | 'WARM' | 'COLD' | 'INACTIVE';
  factors: {
    responseSpeed: number;
    callsAnswered: number;
    recentActivity: number;
    interviewParticipation: number;
  };
}

export async function calculateEngagement(candidatId: string): Promise<EngagementScore> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const activities = await prisma.activite.findMany({
    where: {
      entiteType: 'CANDIDAT',
      entiteId: candidatId,
      createdAt: { gte: thirtyDaysAgo },
    },
    orderBy: { createdAt: 'desc' },
  });

  const candidatures = await prisma.candidature.findMany({
    where: { candidatId },
    select: { stage: true, updatedAt: true },
  });

  // Factor 1: Response speed (based on email/call activities)
  const communications = activities.filter(a => ['APPEL', 'EMAIL'].includes(a.type));
  const responseSpeed = Math.min(30, communications.length * 5);

  // Factor 2: Calls answered
  const calls = activities.filter(a => a.type === 'APPEL');
  const callsAnswered = Math.min(25, calls.length * 8);

  // Factor 3: Recent activity
  const recentDays = activities.length > 0
    ? Math.floor((new Date().getTime() - activities[0].createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : 30;
  const recentActivity = Math.max(0, 25 - recentDays);

  // Factor 4: Interview participation
  const interviews = candidatures.filter(c =>
    ['ENTRETIEN_1', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE'].includes(c.stage)
  );
  const interviewParticipation = Math.min(20, interviews.length * 10);

  const score = Math.min(100, responseSpeed + callsAnswered + recentActivity + interviewParticipation);

  let level: 'HOT' | 'WARM' | 'COLD' | 'INACTIVE';
  if (score >= 70) level = 'HOT';
  else if (score >= 40) level = 'WARM';
  else if (score >= 15) level = 'COLD';
  else level = 'INACTIVE';

  return {
    candidatId,
    score,
    level,
    factors: { responseSpeed, callsAnswered, recentActivity, interviewParticipation },
  };
}

export async function bulkCalculateEngagement(candidatIds: string[]): Promise<EngagementScore[]> {
  return Promise.all(candidatIds.map(id => calculateEngagement(id)));
}
