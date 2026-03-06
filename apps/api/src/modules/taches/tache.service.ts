import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';
import { paginatedResult, paginationToSkipTake } from '../../lib/pagination.js';
import type { PaginationParams } from '../../lib/pagination.js';

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

  return prisma.activite.update({
    where: { id },
    data: { tacheCompleted: true },
    include: {
      user: { select: { nom: true, prenom: true } },
      fichiers: true,
    },
  });
}
