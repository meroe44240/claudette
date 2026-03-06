import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';
import { paginatedResult, paginationToSkipTake } from '../../lib/pagination.js';
import type { PaginationParams } from '../../lib/pagination.js';
import type { TypeNotification, EntiteType } from '@prisma/client';

export async function list(userId: string, params: PaginationParams, lue?: boolean) {
  const where: any = { userId };

  if (lue !== undefined) {
    where.lue = lue;
  }

  const { skip, take } = paginationToSkipTake(params);

  const [data, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
  ]);

  return paginatedResult(data, total, params);
}

export async function markAsRead(id: string, userId: string) {
  const notification = await prisma.notification.findUnique({ where: { id } });

  if (!notification || notification.userId !== userId) {
    throw new NotFoundError('Notification', id);
  }

  return prisma.notification.update({
    where: { id },
    data: { lue: true },
  });
}

export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, lue: false },
    data: { lue: true },
  });
}

export async function getUnreadCount(userId: string) {
  const count = await prisma.notification.count({
    where: { userId, lue: false },
  });

  return { count };
}

export async function create(data: {
  userId: string;
  type: TypeNotification;
  titre: string;
  contenu?: string;
  entiteType?: EntiteType;
  entiteId?: string;
}) {
  return prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      titre: data.titre,
      contenu: data.contenu,
      entiteType: data.entiteType,
      entiteId: data.entiteId,
    },
  });
}
