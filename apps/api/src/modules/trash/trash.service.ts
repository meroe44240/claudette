import { rawPrisma } from '../../lib/db.js';
import { restoreBatch, RestoreError } from '../../lib/audit-trash.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';

export const RETENTION_DAYS = 30;
const cutoff = () => new Date(Date.now() - RETENTION_DAYS * 86_400_000);

export interface TrashFilters { model?: string; q?: string; deleted_by?: string; page?: number; limit?: number }

/** Corbeille regroupée par suppression (lot) : ce qui a été supprimé, par qui, et ce qui a suivi. */
export async function listTrash(f: TrashFilters = {}) {
  const page = Math.max(1, f.page ?? 1);
  const limit = Math.min(100, Math.max(1, f.limit ?? 25));
  const where: any = { isRoot: true, restoredAt: null, deletedAt: { gte: cutoff() } };
  if (f.model) where.model = f.model;
  if (f.deleted_by) where.deletedById = f.deleted_by;
  if (f.q) where.label = { contains: f.q, mode: 'insensitive' };
  const batches = await rawPrisma.trashEntry.groupBy({ by: ['batchId'], where, _max: { deletedAt: true }, orderBy: { _max: { deletedAt: 'desc' } } });
  const total = batches.length;
  const pageIds = batches.slice((page - 1) * limit, page * limit).map((b) => b.batchId);
  const entries = await rawPrisma.trashEntry.findMany({
    where: { batchId: { in: pageIds }, restoredAt: null },
    select: { id: true, batchId: true, model: true, recordId: true, label: true, isRoot: true, deletedAt: true, deletedById: true, deletedByLabel: true, source: true, toolName: true },
  });
  const agentIds = new Set((await rawPrisma.user.findMany({ where: { estAgent: true }, select: { id: true } })).map((u) => u.id));
  const data = pageIds.map((batchId) => {
    const rows = entries.filter((e) => e.batchId === batchId);
    const roots = rows.filter((e) => e.isRoot);
    const first = roots[0] ?? rows[0];
    const cascaded: Record<string, number> = {};
    for (const r of rows.filter((e) => !e.isRoot)) cascaded[r.model] = (cascaded[r.model] ?? 0) + 1;
    return {
      batch_id: batchId,
      deleted_at: first?.deletedAt,
      expires_at: first ? new Date(first.deletedAt.getTime() + RETENTION_DAYS * 86_400_000) : null,
      deleted_by: first?.deletedById ? { id: first.deletedById, name: first.deletedByLabel, is_agent: agentIds.has(first.deletedById) } : null,
      source: first?.source,
      tool: first?.toolName,
      items: roots.map((r) => ({ entry_id: r.id, entity: r.model, id: r.recordId, label: r.label })),
      also_removed: cascaded,
    };
  });
  return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/**
 * Restaure une suppression. Accepte l'identifiant du lot, d'une entrée de corbeille,
 * ou de la fiche supprimée elle-même (dernière suppression de cette fiche).
 */
export async function restore(id: string) {
  let batchId: string | null = null;
  const asBatch = await rawPrisma.trashEntry.findFirst({ where: { batchId: id }, select: { batchId: true } });
  if (asBatch) batchId = asBatch.batchId;
  if (!batchId) {
    const asEntry = await rawPrisma.trashEntry.findUnique({ where: { id }, select: { batchId: true } });
    if (asEntry) batchId = asEntry.batchId;
  }
  if (!batchId) {
    const asRecord = await rawPrisma.trashEntry.findFirst({ where: { recordId: id, restoredAt: null }, orderBy: { deletedAt: 'desc' }, select: { batchId: true } });
    if (asRecord) batchId = asRecord.batchId;
  }
  if (!batchId) throw new NotFoundError('Élément de corbeille', id);
  try {
    return await restoreBatch(rawPrisma, batchId);
  } catch (err) {
    if (err instanceof RestoreError) throw new ValidationError(err.message);
    throw err;
  }
}

/** Vider la corbeille : administrateurs humains uniquement. */
export async function emptyTrash(userId: string) {
  const u = await rawPrisma.user.findUnique({ where: { id: userId }, select: { role: true, estAgent: true } });
  if (!u || u.role !== 'ADMIN' || u.estAgent) throw new ForbiddenError('Seul un administrateur humain peut vider la corbeille.');
  const r = await rawPrisma.trashEntry.deleteMany({});
  return { deleted: r.count };
}

/** Purge quotidienne : ce qui a plus de 30 jours disparaît pour de bon. */
export async function purgeExpired() {
  const r = await rawPrisma.trashEntry.deleteMany({ where: { deletedAt: { lt: cutoff() } } });
  return r.count;
}

