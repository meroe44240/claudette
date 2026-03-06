import prisma from '../../lib/db.js';
import { paginatedResult, paginationToSkipTake } from '../../lib/pagination.js';
import type { PaginationParams } from '../../lib/pagination.js';
import type { Prisma } from '@prisma/client';

// ─── Types ──────────────────────────────────────────────

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

interface LogActionParams {
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: unknown;
}

interface GetAuditLogParams {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: AuditAction;
}

// ─── Service functions ──────────────────────────────────

/**
 * Create a new audit log entry.
 * Call this from other services whenever an entity is created, updated, or deleted.
 */
export async function logAction(params: LogActionParams) {
  return prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      entityLabel: params.entityLabel ?? null,
      changes: (params.changes as Prisma.InputJsonValue) ?? undefined,
      metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

/**
 * List audit log entries with optional filters and pagination.
 */
export async function getAuditLog(
  filters: GetAuditLogParams,
  pagination: PaginationParams,
) {
  const where: Record<string, unknown> = {};

  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.userId) where.userId = filters.userId;
  if (filters.action) where.action = filters.action;

  const { skip, take } = paginationToSkipTake(pagination);

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, nom: true, prenom: true, email: true },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return paginatedResult(data, total, pagination);
}

/**
 * Get the full change history for a specific entity.
 */
export async function getEntityHistory(entityType: string, entityId: string) {
  return prisma.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: { id: true, nom: true, prenom: true, email: true },
      },
    },
  });
}
