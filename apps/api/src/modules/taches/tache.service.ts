import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';
import { paginatedResult, paginationToSkipTake } from '../../lib/pagination.js';
import type { PaginationParams } from '../../lib/pagination.js';
import * as gmailService from '../integrations/gmail.service.js';

interface TacheFilters {
  status?: 'todo' | 'overdue' | 'done' | 'all';
  userId?: string;
}

export async function list(params: PaginationParams, filters: TacheFilters) {
  const where: any = { isTache: true };

  if (filters.userId) where.userId = filters.userId;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filters.status) {
    case 'todo':
      where.tacheCompleted = false;
      where.OR = [
        { tacheDueDate: null },
        { tacheDueDate: { gte: startOfToday } },
      ];
      break;
    case 'overdue':
      where.tacheCompleted = false;
      where.tacheDueDate = { lt: startOfToday };
      break;
    case 'done':
      where.tacheCompleted = true;
      break;
    case 'all':
    default:
      // isTache=true is already set
      break;
  }

  const { skip, take } = paginationToSkipTake(params);

  const [data, total] = await Promise.all([
    prisma.activite.findMany({
      where,
      skip,
      take,
      orderBy: {
        tacheDueDate: { sort: 'asc', nulls: 'last' },
      },
      include: {
        user: { select: { nom: true, prenom: true } },
        fichiers: true,
      },
    }),
    prisma.activite.count({ where }),
  ]);

  return paginatedResult(data, total, params);
}

export async function create(data: {
  titre: string;
  contenu?: string;
  entiteType: string;
  entiteId: string;
  tacheDueDate?: string;
  userId: string;
}) {
  return prisma.activite.create({
    data: {
      type: 'TACHE',
      isTache: true,
      tacheCompleted: false,
      entiteType: data.entiteType as any,
      entiteId: data.entiteId,
      titre: data.titre,
      contenu: data.contenu,
      tacheDueDate: data.tacheDueDate ? new Date(data.tacheDueDate) : undefined,
      userId: data.userId,
      source: 'MANUEL',
    },
    include: {
      user: { select: { nom: true, prenom: true } },
      fichiers: true,
    },
  });
}

export async function complete(id: string) {
  const existing = await prisma.activite.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Tache', id);

  const metadata = (existing.metadata as Record<string, any>) || {};

  // If this is an Adchase task, send the email before completing
  let emailSent = false;
  if (metadata.adchaseCampaignId && metadata.emailSubject && !existing.tacheCompleted) {
    try {
      // Find the client email from the prospect → clientId
      const prospect = metadata.adchaseProspectId
        ? await prisma.adchaseProspect.findUnique({
            where: { id: metadata.adchaseProspectId },
          })
        : null;

      const client = prospect?.clientId
        ? await prisma.client.findUnique({
            where: { id: prospect.clientId },
            select: { email: true, nom: true, prenom: true },
          })
        : null;

      const clientEmail = client?.email;
      if (clientEmail && existing.userId) {
        await gmailService.sendEmail(existing.userId, {
          to: clientEmail,
          subject: metadata.emailSubject,
          body: metadata.emailBody || '',
        });

        // Mark prospect as sent
        if (metadata.adchaseProspectId) {
          await prisma.adchaseProspect.update({
            where: { id: metadata.adchaseProspectId },
            data: { emailStatus: 'sent', sentAt: new Date() },
          });
        }

        emailSent = true;
      }
    } catch (err) {
      console.error(`[Tache] Erreur envoi email Adchase pour tâche ${id}:`, err);
      // Don't block task completion — store the error in metadata
      metadata.emailError = err instanceof Error ? err.message : 'Erreur inconnue';
    }
  }

  // Update metadata with send result
  if (metadata.adchaseCampaignId) {
    metadata.emailSent = emailSent;
    metadata.completedAt = new Date().toISOString();
  }

  return prisma.activite.update({
    where: { id },
    data: {
      tacheCompleted: true,
      metadata,
    },
    include: {
      user: { select: { nom: true, prenom: true } },
      fichiers: true,
    },
  });
}
