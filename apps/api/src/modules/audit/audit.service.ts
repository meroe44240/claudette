import { rawPrisma } from '../../lib/db.js';

export interface AuditFilters {
  user_id?: string;
  agents_only?: boolean;
  entity_type?: string;
  entity_id?: string;
  action?: string;
  source?: string;
  externe?: boolean;
  tool?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  limit?: number;
}

function buildWhere(f: AuditFilters) {
  const where: any = {};
  if (f.user_id) where.userId = f.user_id;
  if (f.agents_only) where.user = { estAgent: true };
  if (f.entity_type) where.entityType = f.entity_type.toUpperCase();
  if (f.entity_id) where.entityId = f.entity_id;
  if (f.action) where.action = f.action.toUpperCase();
  if (f.source) where.source = f.source.toUpperCase();
  if (f.externe !== undefined) where.externe = f.externe;
  if (f.tool) where.toolName = f.tool;
  if (f.q) where.entityLabel = { contains: f.q, mode: 'insensitive' };
  if (f.from || f.to) where.createdAt = { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lte: new Date(`${f.to.length === 10 ? f.to + 'T23:59:59.999' : f.to}`) } : {}) };
  return where;
}

const serialize = (e: any) => ({
  id: e.id,
  at: e.createdAt,
  action: e.action,
  entity: e.entityType,
  entity_id: e.entityId,
  label: e.entityLabel,
  by: e.user ? { id: e.user.id, name: [e.user.prenom, e.user.nom].filter(Boolean).join(' '), is_agent: e.user.estAgent } : null,
  source: e.source,
  tool: e.toolName,
  externe: e.externe,
  batch_id: e.batchId,
  changes: e.changes,
  before: e.before,
  after: e.after,
  metadata: e.metadata,
});

export async function listAudit(f: AuditFilters = {}) {
  const page = Math.max(1, f.page ?? 1);
  const limit = Math.min(200, Math.max(1, f.limit ?? 50));
  const where = buildWhere(f);
  const [rows, total] = await Promise.all([
    rawPrisma.auditLog.findMany({
      where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      include: { user: { select: { id: true, prenom: true, nom: true, estAgent: true } } },
    }),
    rawPrisma.auditLog.count({ where }),
  ]);
  return { data: rows.map(serialize), meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/** Historique d'une fiche, du plus récent au plus ancien. */
export async function history(entityType: string, entityId: string, limit = 100) {
  return listAudit({ entity_type: entityType, entity_id: entityId, limit });
}

/** Valeurs proposées dans les filtres de la page Journal. */
export async function facets() {
  const [entities, tools, users] = await Promise.all([
    rawPrisma.auditLog.groupBy({ by: ['entityType'], _count: { _all: true }, orderBy: { entityType: 'asc' } }),
    rawPrisma.auditLog.groupBy({ by: ['toolName'], where: { toolName: { not: null } }, _count: { _all: true }, orderBy: { toolName: 'asc' } }),
    rawPrisma.user.findMany({ where: { auditLogs: { some: {} } }, select: { id: true, prenom: true, nom: true, estAgent: true }, orderBy: { prenom: 'asc' } }),
  ]);
  return {
    entities: entities.map((e) => e.entityType),
    tools: tools.map((t) => t.toolName),
    users: users.map((u) => ({ id: u.id, name: [u.prenom, u.nom].filter(Boolean).join(' '), is_agent: u.estAgent })),
  };
}
