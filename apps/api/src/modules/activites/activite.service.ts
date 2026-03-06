import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';
import { paginatedResult, paginationToSkipTake } from '../../lib/pagination.js';
import type { PaginationParams } from '../../lib/pagination.js';
import type { CreateActiviteInput, UpdateActiviteInput } from './activite.schema.js';

interface ListFilters {
  entiteType?: string;
  entiteId?: string;
  type?: string;
  source?: string;
  bookmarked?: boolean;
  isTache?: boolean;
  tacheCompleted?: boolean;
  userId?: string;
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
