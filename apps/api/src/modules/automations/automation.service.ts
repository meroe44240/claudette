import prisma from '../../lib/db.js';

/**
 * Automation service — background checks and alert generation
 * Designed to be called via a cron endpoint or scheduled task
 */

interface AlertItem {
  type: 'stagnant_candidature' | 'dormant_mandat' | 'overdue_task' | 'placement_followup' | 'cold_candidat';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  entityType: string;
  entityId: string;
  actionUrl?: string;
}

/**
 * Run all automation checks and return generated alerts.
 * Optionally creates tasks for critical items.
 */
export async function runAutomationChecks(userId?: string): Promise<{ alerts: AlertItem[]; tasksCreated: number }> {
  const alerts: AlertItem[] = [];
  let tasksCreated = 0;
  const now = new Date();

  // 1. Stagnant candidatures — no activity for 14+ days in active stages
  const stagnantDays = 14;
  const stagnantDate = new Date(now);
  stagnantDate.setDate(stagnantDate.getDate() - stagnantDays);

  const stagnantCandidatures = await prisma.candidature.findMany({
    where: {
      stage: { notIn: ['REFUSE', 'PLACE'] },
      updatedAt: { lt: stagnantDate },
      ...(userId ? { mandat: { assignedToId: userId } } : {}),
    },
    take: 30,
    include: {
      candidat: { select: { nom: true, prenom: true } },
      mandat: { select: { titrePoste: true } },
    },
  });

  for (const c of stagnantCandidatures) {
    const days = Math.floor((now.getTime() - c.updatedAt.getTime()) / (1000 * 60 * 60 * 24));
    alerts.push({
      type: 'stagnant_candidature',
      severity: days > 30 ? 'critical' : 'warning',
      title: `Candidature stagnante: ${c.candidat.prenom || ''} ${c.candidat.nom}`.trim(),
      description: `Aucune activite depuis ${days} jours sur ${c.mandat.titrePoste} (stage: ${c.stage})`,
      entityType: 'CANDIDAT',
      entityId: c.candidatId,
    });
  }

  // 2. Dormant mandats — open mandats with no activity for 7+ days
  const dormantDays = 7;
  const dormantDate = new Date(now);
  dormantDate.setDate(dormantDate.getDate() - dormantDays);

  const activeMandats = await prisma.mandat.findMany({
    where: {
      statut: { in: ['OUVERT', 'EN_COURS'] },
      ...(userId ? { assignedToId: userId } : {}),
    },
    include: {
      entreprise: { select: { nom: true } },
      candidatures: {
        select: { updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 1,
      },
    },
  });

  for (const m of activeMandats) {
    const lastActivity = m.candidatures[0]?.updatedAt || m.updatedAt;
    const days = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
    if (days >= dormantDays) {
      alerts.push({
        type: 'dormant_mandat',
        severity: days > 21 ? 'critical' : 'warning',
        title: `Mandat dormant: ${m.titrePoste}`,
        description: `${m.entreprise?.nom || 'Entreprise inconnue'} — aucune activite depuis ${days} jours`,
        entityType: 'MANDAT',
        entityId: m.id,
      });
    }
  }

  // 3. Overdue tasks
  const overdueTasks = await prisma.activite.findMany({
    where: {
      isTache: true,
      tacheCompleted: false,
      tacheDueDate: { lt: now },
      ...(userId ? { userId } : {}),
    },
    take: 20,
    orderBy: { tacheDueDate: 'asc' },
    select: { id: true, titre: true, tacheDueDate: true, entiteType: true, entiteId: true },
  });

  for (const t of overdueTasks) {
    const days = t.tacheDueDate
      ? Math.floor((now.getTime() - t.tacheDueDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    alerts.push({
      type: 'overdue_task',
      severity: days > 7 ? 'critical' : 'warning',
      title: `Tache en retard: ${t.titre}`,
      description: `En retard de ${days} jour(s)`,
      entityType: t.entiteType || 'TACHE',
      entityId: t.id,
    });
  }

  // 4. Placement follow-ups due
  const placements = await prisma.candidature.findMany({
    where: { stage: 'PLACE' },
    include: {
      candidat: { select: { nom: true, prenom: true } },
      mandat: { select: { titrePoste: true } },
      stageHistory: {
        where: { toStage: 'PLACE' },
        select: { changedAt: true },
        take: 1,
        orderBy: { changedAt: 'desc' },
      },
    },
  });

  for (const p of placements) {
    const placedAt = p.stageHistory[0]?.changedAt || p.updatedAt;
    const daysSincePlacement = Math.floor((now.getTime() - placedAt.getTime()) / (1000 * 60 * 60 * 24));

    // Check if follow-up is due (7d, 30d, 90d milestones)
    const milestones = [
      { days: 7, label: '1 semaine' },
      { days: 30, label: '1 mois' },
      { days: 90, label: '3 mois' },
    ];

    for (const milestone of milestones) {
      if (daysSincePlacement >= milestone.days && daysSincePlacement < milestone.days + 7) {
        // Check if a follow-up activity exists after the milestone date
        const milestoneDate = new Date(placedAt);
        milestoneDate.setDate(milestoneDate.getDate() + milestone.days - 3);

        const followUp = await prisma.activite.findFirst({
          where: {
            entiteType: 'CANDIDAT',
            entiteId: p.candidatId,
            createdAt: { gte: milestoneDate },
          },
        });

        if (!followUp) {
          alerts.push({
            type: 'placement_followup',
            severity: 'info',
            title: `Follow-up ${milestone.label}: ${p.candidat.prenom || ''} ${p.candidat.nom}`.trim(),
            description: `Place sur ${p.mandat.titrePoste} — check-in ${milestone.label} a faire`,
            entityType: 'CANDIDAT',
            entityId: p.candidatId,
          });
        }
      }
    }
  }

  // Sort by severity
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  return { alerts, tasksCreated };
}

/**
 * Auto-create tasks for critical alerts that don't already have one
 */
export async function createTasksFromAlerts(userId: string, alerts: AlertItem[]): Promise<number> {
  let created = 0;
  const criticalAlerts = alerts.filter(a => a.severity === 'critical');

  for (const alert of criticalAlerts) {
    // Check if a similar task already exists
    const existingTask = await prisma.activite.findFirst({
      where: {
        isTache: true,
        tacheCompleted: false,
        entiteType: alert.entityType as any,
        entiteId: alert.entityId,
        source: 'SYSTEME',
        titre: { contains: alert.type === 'stagnant_candidature' ? 'stagnant' : alert.type === 'dormant_mandat' ? 'dormant' : 'retard' },
      },
    });

    if (!existingTask) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1); // Due tomorrow

      await prisma.activite.create({
        data: {
          type: 'TACHE',
          isTache: true,
          tacheCompleted: false,
          titre: alert.title,
          contenu: alert.description,
          entiteType: alert.entityType as any,
          entiteId: alert.entityId,
          userId,
          source: 'SYSTEME',
          tacheDueDate: dueDate,
          metadata: { automationType: alert.type, autoCreated: true },
        },
      });
      created++;
    }
  }

  return created;
}
