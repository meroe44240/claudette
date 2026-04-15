import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';
import { paginatedResult, paginationToSkipTake } from '../../lib/pagination.js';
import type { PaginationParams } from '../../lib/pagination.js';
import type { CreateActiviteInput, UpdateActiviteInput } from './activite.schema.js';
import { notifyNewMeeting } from '../slack/slack.service.js';

interface ListFilters {
  entiteType?: string;
  entiteId?: string;
  type?: string;
  source?: string;
  bookmarked?: boolean;
  isTache?: boolean;
  tacheCompleted?: boolean;
  userId?: string;
  search?: string;
}

export async function list(params: PaginationParams, filters: ListFilters) {
  const where: any = {};

  if (filters.entiteType) where.entiteType = filters.entiteType;
  if (filters.entiteId) where.entiteId = filters.entiteId;
  if (filters.type) where.type = filters.type;
  if (filters.source) where.source = filters.source;
  if (filters.bookmarked !== undefined) where.bookmarked = filters.bookmarked;
  if (filters.isTache !== undefined) where.isTache = filters.isTache;
  if (filters.tacheCompleted !== undefined) where.tacheCompleted = filters.tacheCompleted;
  if (filters.userId) where.userId = filters.userId;

  if (filters.search) {
    where.OR = [
      { titre: { contains: filters.search, mode: 'insensitive' } },
      { contenu: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const { skip, take } = paginationToSkipTake(params);

  const [data, total] = await Promise.all([
    prisma.activite.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { nom: true, prenom: true } },
        fichiers: true,
      },
    }),
    prisma.activite.count({ where }),
  ]);

  return paginatedResult(data, total, params);
}

export async function getById(id: string) {
  const activite = await prisma.activite.findUnique({
    where: { id },
    include: {
      user: { select: { nom: true, prenom: true } },
      fichiers: true,
    },
  });

  if (!activite) throw new NotFoundError('Activite', id);
  return activite;
}

export async function create(data: CreateActiviteInput, userId: string) {
  const result = await prisma.activite.create({
    data: {
      type: data.type,
      direction: data.direction,
      entiteType: data.entiteType,
      entiteId: data.entiteId,
      titre: data.titre,
      contenu: data.contenu,
      metadata: data.metadata ?? {},
      source: data.source,
      bookmarked: data.bookmarked ?? false,
      isTache: data.isTache ?? false,
      tacheDueDate: data.tacheDueDate ? new Date(data.tacheDueDate) : undefined,
      userId,
    },
    include: {
      user: { select: { nom: true, prenom: true } },
      fichiers: true,
    },
  });

  // Schedule feedback reminder for meetings
  if (data.type === 'MEETING') {
    import('../../jobs/feedback-reminder.job.js').then(({ scheduleFeedbackReminder }) => {
      scheduleFeedbackReminder({
        activiteId: result.id,
        userId,
        entiteType: data.entiteType,
        entiteId: data.entiteId,
        meetingTitle: data.titre || 'Meeting',
      }).catch(err => console.error('Failed to schedule feedback reminder:', err));
    }).catch(() => {});

    // Fire-and-forget Slack notification for new meetings
    (async () => {
      try {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { prenom: true } });
        let clientNom: string | null = null;
        let entrepriseNom: string | null = null;
        if (data.entiteId && data.entiteType === 'CLIENT') {
          const client = await prisma.client.findUnique({
            where: { id: data.entiteId },
            select: { nom: true, prenom: true, entreprise: { select: { nom: true } } },
          });
          if (client) {
            clientNom = [client.prenom, client.nom].filter(Boolean).join(' ');
            entrepriseNom = client.entreprise?.nom || null;
          }
        }
        const meta = (data.metadata || {}) as Record<string, unknown>;
        await notifyNewMeeting({
          titre: data.titre || 'RDV',
          recruteurPrenom: user?.prenom || null,
          clientNom,
          entrepriseNom,
          date: (meta.startTime as string) || null,
          lieu: (meta.location as string) || null,
        });
      } catch (err) {
        console.error('[Slack] Failed to send new meeting notification:', err);
      }
    })();
  }

  return result;
}

export async function update(id: string, data: UpdateActiviteInput) {
  const existing = await prisma.activite.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Activite', id);

  const updateData: any = {};

  if (data.titre !== undefined) updateData.titre = data.titre;
  if (data.contenu !== undefined) updateData.contenu = data.contenu;
  if (data.bookmarked !== undefined) updateData.bookmarked = data.bookmarked;
  if (data.tacheCompleted !== undefined) updateData.tacheCompleted = data.tacheCompleted;
  if (data.tacheDueDate !== undefined) updateData.tacheDueDate = new Date(data.tacheDueDate);

  return prisma.activite.update({
    where: { id },
    data: updateData,
    include: {
      user: { select: { nom: true, prenom: true } },
      fichiers: true,
    },
  });
}

export async function remove(id: string) {
  const existing = await prisma.activite.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Activite', id);

  // Delete fichiers first (cascade should handle it, but being explicit)
  await prisma.fichierActivite.deleteMany({ where: { activiteId: id } });

  return prisma.activite.delete({ where: { id } });
}

export async function addFichier(
  activiteId: string,
  data: { nom: string; url: string; mimeType?: string; taille?: number },
) {
  const existing = await prisma.activite.findUnique({ where: { id: activiteId } });
  if (!existing) throw new NotFoundError('Activite', activiteId);

  return prisma.fichierActivite.create({
    data: {
      activiteId,
      nom: data.nom,
      url: data.url,
      mimeType: data.mimeType,
      taille: data.taille,
    },
  });
}

export async function listByEntite(
  entiteType: string,
  entiteId: string,
  params: PaginationParams,
) {
  const where = { entiteType: entiteType as any, entiteId };
  const { skip, take } = paginationToSkipTake(params);

  const [data, total] = await Promise.all([
    prisma.activite.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { nom: true, prenom: true } },
        fichiers: true,
      },
    }),
    prisma.activite.count({ where }),
  ]);

  return paginatedResult(data, total, params);
}
