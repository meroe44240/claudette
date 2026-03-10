import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';
import { paginatedResult, paginationToSkipTake } from '../../lib/pagination.js';
import type { PaginationParams } from '../../lib/pagination.js';
import { checkClientOwnershipExpiry } from '../clients/client-ownership.service.js';

// ─── Types ──────────────────────────────────────────────

interface CreateReminderParams {
  userId: string;
  type: string;
  entityType?: string;
  entityId?: string;
  titre: string;
  description?: string;
  triggerAt: Date;
}

// ─── Core CRUD ──────────────────────────────────────────

/**
 * Create a manual or automatic reminder.
 */
export async function createReminder(params: CreateReminderParams) {
  return prisma.reminder.create({
    data: {
      userId: params.userId,
      type: params.type,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      titre: params.titre,
      description: params.description ?? null,
      triggerAt: params.triggerAt,
    },
  });
}

/**
 * List a user's reminders with pagination. Optionally filter by fired status.
 */
export async function getUserReminders(
  userId: string,
  pagination: PaginationParams,
  fired?: boolean,
) {
  const where: Record<string, unknown> = { userId };
  if (fired !== undefined) where.fired = fired;

  const { skip, take } = paginationToSkipTake(pagination);

  const [data, total] = await Promise.all([
    prisma.reminder.findMany({
      where,
      skip,
      take,
      orderBy: { triggerAt: 'asc' },
    }),
    prisma.reminder.count({ where }),
  ]);

  return paginatedResult(data, total, pagination);
}

/**
 * Update a reminder (e.g. dismiss it by setting fired = true).
 */
export async function updateReminder(
  id: string,
  userId: string,
  data: { titre?: string; description?: string; triggerAt?: Date; fired?: boolean },
) {
  const reminder = await prisma.reminder.findUnique({ where: { id } });
  if (!reminder || reminder.userId !== userId) {
    throw new NotFoundError('Reminder', id);
  }

  return prisma.reminder.update({
    where: { id },
    data: {
      ...data,
      firedAt: data.fired ? new Date() : undefined,
    },
  });
}

/**
 * Delete a reminder.
 */
export async function deleteReminder(id: string, userId: string) {
  const reminder = await prisma.reminder.findUnique({ where: { id } });
  if (!reminder || reminder.userId !== userId) {
    throw new NotFoundError('Reminder', id);
  }

  return prisma.reminder.delete({ where: { id } });
}

// ─── Automatic firing ───────────────────────────────────

/**
 * Check for unfired reminders whose triggerAt has passed and fire them
 * by creating notifications. Called periodically (e.g. via cron/job).
 */
export async function checkAndFireReminders() {
  const now = new Date();

  const pendingReminders = await prisma.reminder.findMany({
    where: {
      fired: false,
      triggerAt: { lte: now },
    },
    take: 100, // process in batches
  });

  if (pendingReminders.length === 0) return { fired: 0 };

  let firedCount = 0;

  for (const reminder of pendingReminders) {
    await prisma.$transaction([
      prisma.reminder.update({
        where: { id: reminder.id },
        data: { fired: true, firedAt: now },
      }),
      prisma.notification.create({
        data: {
          userId: reminder.userId,
          type: 'SYSTEME',
          titre: reminder.titre,
          contenu: reminder.description,
          entiteType: reminder.entityType as any ?? undefined,
          entiteId: reminder.entityId ?? undefined,
        },
      }),
    ]);
    firedCount++;
  }

  return { fired: firedCount };
}

// ─── Auto-generation scan ───────────────────────────────

/**
 * Scan the database for conditions that warrant automatic reminders:
 *   - Mandats with no activity in 5+ days  → MANDAT_DORMANT
 *   - Tasks overdue by 2+ days             → TACHE_RETARD
 *   - Clients with no contact in 30+ days  → RELANCE_CLIENT
 *
 * Skips creating duplicates (checks for existing unfired reminder of same type+entity).
 */
export async function generateAutoReminders(userId: string) {
  const now = new Date();
  let created = 0;

  // ─── 1. MANDAT_DORMANT: mandats with no activite in 5+ days ───
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

  const dormantMandats = await prisma.mandat.findMany({
    where: {
      statut: { in: ['OUVERT', 'EN_COURS'] },
      OR: [
        { assignedToId: userId },
        { createdById: userId },
      ],
    },
    select: { id: true, titrePoste: true },
  });

  for (const mandat of dormantMandats) {
    // Check if there's recent activity for this mandat
    const recentActivity = await prisma.activite.findFirst({
      where: {
        entiteType: 'MANDAT',
        entiteId: mandat.id,
        createdAt: { gte: fiveDaysAgo },
      },
    });

    if (!recentActivity) {
      // Check if there's already an unfired reminder for this
      const existing = await prisma.reminder.findFirst({
        where: {
          userId,
          type: 'MANDAT_DORMANT',
          entityId: mandat.id,
          fired: false,
        },
      });

      if (!existing) {
        await createReminder({
          userId,
          type: 'MANDAT_DORMANT',
          entityType: 'MANDAT',
          entityId: mandat.id,
          titre: `Mandat dormant : ${mandat.titrePoste}`,
          description: `Aucune activité depuis 5+ jours sur le mandat "${mandat.titrePoste}".`,
          triggerAt: now,
        });
        created++;
      }
    }
  }

  // ─── 2. TACHE_RETARD: tasks overdue by 2+ days ───
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const overdueTasks = await prisma.activite.findMany({
    where: {
      isTache: true,
      tacheCompleted: false,
      tacheDueDate: { lte: twoDaysAgo },
      userId,
    },
    select: { id: true, titre: true, entiteType: true, entiteId: true },
  });

  for (const task of overdueTasks) {
    const existing = await prisma.reminder.findFirst({
      where: {
        userId,
        type: 'TACHE_RETARD',
        entityId: task.id,
        fired: false,
      },
    });

    if (!existing) {
      await createReminder({
        userId,
        type: 'TACHE_RETARD',
        entityType: task.entiteType ?? 'CANDIDAT',
        entityId: task.id,
        titre: `Tâche en retard : ${task.titre || 'Sans titre'}`,
        description: `La tâche "${task.titre || 'Sans titre'}" est en retard de plus de 2 jours.`,
        triggerAt: now,
      });
      created++;
    }
  }

  // ─── 3. RELANCE_CLIENT: clients with no contact in 30+ days ───
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const staleClients = await prisma.client.findMany({
    where: {
      OR: [
        { assignedToId: userId },
        { createdById: userId },
      ],
      statutClient: { notIn: ['INACTIF'] },
    },
    select: { id: true, nom: true, prenom: true },
  });

  for (const client of staleClients) {
    const recentActivity = await prisma.activite.findFirst({
      where: {
        entiteType: 'CLIENT',
        entiteId: client.id,
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    if (!recentActivity) {
      const existing = await prisma.reminder.findFirst({
        where: {
          userId,
          type: 'RELANCE_CLIENT',
          entityId: client.id,
          fired: false,
        },
      });

      if (!existing) {
        const clientLabel = [client.prenom, client.nom].filter(Boolean).join(' ');
        await createReminder({
          userId,
          type: 'RELANCE_CLIENT',
          entityType: 'CLIENT',
          entityId: client.id,
          titre: `Relance client : ${clientLabel}`,
          description: `Aucun contact avec ${clientLabel} depuis 30+ jours.`,
          triggerAt: now,
        });
        created++;
      }
    }
  }

  // ─── 4. CLIENT OWNERSHIP EXPIRY: auto-release inactive assignments ───
  const ownershipResult = await checkClientOwnershipExpiry();

  return { created, ownershipExpiry: ownershipResult };
}
