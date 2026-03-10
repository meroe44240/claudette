import prisma from '../../lib/db.js';

interface PlacementFollowUp {
  candidatureId: string;
  candidatNom: string;
  mandatTitre: string;
  entrepriseNom: string | null;
  placedAt: Date;
  daysSincePlacement: number;
  nextFollowUp: string; // description of what to do
  followUpDue: boolean;
  checks: {
    oneWeek: boolean;
    oneMonth: boolean;
    threeMonths: boolean;
    sixMonths: boolean;
  };
}

export async function getPlacementFollowUps(): Promise<{ placements: PlacementFollowUp[] }> {
  // Find all candidatures with stage PLACE
  const placements = await prisma.candidature.findMany({
    where: { stage: 'PLACE' },
    include: {
      candidat: { select: { id: true, nom: true, prenom: true } },
      mandat: {
        select: {
          titrePoste: true,
          entreprise: { select: { nom: true } },
        },
      },
      stageHistory: {
        where: { toStage: 'PLACE' },
        select: { changedAt: true },
        take: 1,
        orderBy: { changedAt: 'desc' },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const now = new Date();
  const results: PlacementFollowUp[] = [];

  for (const p of placements) {
    const placedAt = p.stageHistory[0]?.changedAt || p.updatedAt;
    const daysSincePlacement = Math.floor((now.getTime() - placedAt.getTime()) / (1000 * 60 * 60 * 24));

    // Check existing follow-up activities on the candidat (EntiteType only has CANDIDAT, not CANDIDATURE)
    const followUpActivities = await prisma.activite.findMany({
      where: {
        entiteType: 'CANDIDAT',
        entiteId: p.candidat.id,
        type: { in: ['NOTE', 'APPEL'] },
        createdAt: { gte: placedAt },
      },
      select: { createdAt: true },
    });

    const hasFollowUpAfter = (days: number) => {
      const afterDate = new Date(placedAt);
      afterDate.setDate(afterDate.getDate() + days - 3); // 3 day grace period
      return followUpActivities.some(a => a.createdAt >= afterDate);
    };

    const checks = {
      oneWeek: daysSincePlacement >= 7 ? hasFollowUpAfter(7) : daysSincePlacement < 7,
      oneMonth: daysSincePlacement >= 30 ? hasFollowUpAfter(30) : daysSincePlacement < 30,
      threeMonths: daysSincePlacement >= 90 ? hasFollowUpAfter(90) : daysSincePlacement < 90,
      sixMonths: daysSincePlacement >= 180 ? hasFollowUpAfter(180) : daysSincePlacement < 180,
    };

    let nextFollowUp = 'Aucun suivi a prevoir';
    let followUpDue = false;

    if (daysSincePlacement >= 7 && !checks.oneWeek) {
      nextFollowUp = 'Check-in 1 semaine en retard';
      followUpDue = true;
    } else if (daysSincePlacement >= 30 && !checks.oneMonth) {
      nextFollowUp = 'Check-in 1 mois en retard';
      followUpDue = true;
    } else if (daysSincePlacement >= 90 && !checks.threeMonths) {
      nextFollowUp = 'Check-in 3 mois en retard';
      followUpDue = true;
    } else if (daysSincePlacement >= 180 && !checks.sixMonths) {
      nextFollowUp = 'Check-in 6 mois en retard';
      followUpDue = true;
    } else if (daysSincePlacement < 7) {
      nextFollowUp = `Check-in 1 semaine dans ${7 - daysSincePlacement} jours`;
    } else if (daysSincePlacement < 30) {
      nextFollowUp = `Check-in 1 mois dans ${30 - daysSincePlacement} jours`;
    } else if (daysSincePlacement < 90) {
      nextFollowUp = `Check-in 3 mois dans ${90 - daysSincePlacement} jours`;
    }

    results.push({
      candidatureId: p.id,
      candidatNom: `${p.candidat.prenom || ''} ${p.candidat.nom}`.trim(),
      mandatTitre: p.mandat.titrePoste,
      entrepriseNom: p.mandat.entreprise?.nom || null,
      placedAt,
      daysSincePlacement,
      nextFollowUp,
      followUpDue,
      checks,
    });
  }

  // Sort: follow-ups due first, then by days since placement desc
  results.sort((a, b) => {
    if (a.followUpDue !== b.followUpDue) return a.followUpDue ? -1 : 1;
    return b.daysSincePlacement - a.daysSincePlacement;
  });

  return { placements: results };
}
