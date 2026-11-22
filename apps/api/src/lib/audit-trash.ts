import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { getContext } from './request-context.js';

/**
 * Journal d'audit + corbeille, posés au niveau du client Prisma pour couvrir toutes les
 * écritures (interface web, MCP, imports) sans toucher aux services.
 *
 * - Journal : chaque création / modification / suppression d'une donnée métier faite par un
 *   utilisateur identifié (humain ou agent) est écrite dans audit_logs avec l'avant et l'après.
 *   Les tâches automatiques sans auteur ne sont pas journalisées.
 * - Corbeille : avant toute suppression d'une donnée métier, la ligne et tout ce que la base
 *   va effacer en cascade (ou détacher) avec elle sont copiés dans trash_entries. La restauration
 *   remet le lot entier. Seul l'effacement RGPD (runWithoutTrash) passe outre.
 */

/** Données métier suivies. Les tables techniques (jetons, journaux, réglages) n'y sont pas. */
export const TRACKED_MODELS = new Set([
  'Entreprise', 'Client', 'Candidat', 'CandidatExperience', 'Mandat', 'Candidature',
  'Activite', 'FichierActivite', 'Lead', 'LeadInteraction', 'JobOffer', 'PostLinkedin',
  'PostLinkedinComment', 'NoteCall', 'ProfilRecherche', 'MarketList', 'MarketListEstablishment',
  'QuestionTemplate', 'Booking', 'ContractApproval', 'PortalAccess', 'PortalComment', 'StageHistory',
]);

/** Libellé lisible d'une ligne, pour le journal et la corbeille. */
export function recordLabel(row: Record<string, any> | null | undefined): string | null {
  if (!row) return null;
  const person = [row.prenom, row.nom].filter(Boolean).join(' ');
  const v = person || row.titrePoste || row.titre || row.title || row.name || row.intituleType || row.company || row.contact
    || row.raisonSociale || row.email || row.objet || row.nom;
  return v ? String(v).slice(0, 480) : null;
}

const MODELS = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
const lc = (s: string) => s[0].toLowerCase() + s.slice(1);
const delegate = (client: PrismaClient, model: string) => (client as any)[lc(model)];
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Règles de clés étrangères, lues dans la base (le DMMF d'exécution ne les donne pas) ───
type FkRule = { child: string; fk: string; ref: string; rule: 'CASCADE' | 'SET_NULL' | 'OTHER' };
let fkRules: Map<string, FkRule[]> | null = null;

async function loadFkRules(client: PrismaClient): Promise<Map<string, FkRule[]>> {
  if (fkRules) return fkRules;
  const tableToModel = new Map<string, string>();
  const colToField = new Map<string, string>();
  for (const m of MODELS.values()) {
    tableToModel.set(m.dbName ?? m.name, m.name);
    for (const f of m.fields) if (f.kind === 'scalar') colToField.set(`${m.name}.${f.dbName ?? f.name}`, f.name);
  }
  const rows = await client.$queryRaw<Array<{ child_table: string; child_col: string; parent_table: string; parent_col: string; rule: string }>>`
    SELECT cl.relname AS child_table, att.attname AS child_col, pcl.relname AS parent_table,
           patt.attname AS parent_col, con.confdeltype::text AS rule
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_class pcl ON pcl.oid = con.confrelid
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    JOIN pg_attribute patt ON patt.attrelid = con.confrelid AND patt.attnum = con.confkey[1]
    WHERE con.contype = 'f' AND array_length(con.conkey, 1) = 1
      AND cl.relnamespace = current_schema()::regnamespace`;
  const map = new Map<string, FkRule[]>();
  for (const r of rows) {
    const parent = tableToModel.get(r.parent_table);
    const child = tableToModel.get(r.child_table);
    if (!parent || !child) continue;
    const fk = colToField.get(`${child}.${r.child_col}`) ?? r.child_col;
    const ref = colToField.get(`${parent}.${r.parent_col}`) ?? r.parent_col;
    const rule = r.rule === 'c' ? 'CASCADE' : r.rule === 'n' ? 'SET_NULL' : 'OTHER';
    if (!map.has(parent)) map.set(parent, []);
    map.get(parent)!.push({ child, fk, ref, rule });
  }
  fkRules = map;
  return map;
}

// ─── Sérialisation sûre en JSON (dates, décimaux, BigInt, octets) ───
function toJson(row: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(row, (_k, v) => {
    if (typeof v === 'bigint') return { __bigint: v.toString() };
    if (v && typeof v === 'object' && v.type === 'Buffer' && Array.isArray(v.data)) return { __bytes: Buffer.from(v.data).toString('base64') };
    if (v instanceof Uint8Array) return { __bytes: Buffer.from(v).toString('base64') };
    return v;
  }));
}

/** Inverse de toJson, guidé par les types du modèle, pour réinsérer la ligne telle quelle. */
function reviveRow(model: string, data: Record<string, any>): Record<string, any> {
  const m = MODELS.get(model);
  const out: Record<string, any> = {};
  if (!m) return data;
  for (const f of m.fields) {
    if (f.kind === 'object' || !(f.name in data)) continue;
    const v = data[f.name];
    if (v === null) { out[f.name] = f.type === 'Json' ? Prisma.DbNull : null; continue; }
    switch (f.type) {
      case 'DateTime': out[f.name] = f.isList ? v.map((x: string) => new Date(x)) : new Date(v); break;
      case 'BigInt': out[f.name] = BigInt(v.__bigint ?? v); break;
      case 'Bytes': out[f.name] = Buffer.from(v.__bytes ?? '', 'base64'); break;
      default: out[f.name] = v;
    }
  }
  return out;
}

/** Version allégée pour le journal : pas de longs textes ni d'images en base64. */
function slim(row: Record<string, any> | null | undefined): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'string' && v.length > 2000) out[k] = `[${v.length} caractères]`;
    else out[k] = v;
  }
  return toJson(out) as Record<string, unknown>;
}

function diff(before: Record<string, any> | null, after: Record<string, any> | null) {
  if (!before || !after) return null;
  const b = toJson(before) as Record<string, unknown>;
  const a = toJson(after) as Record<string, unknown>;
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const k of Object.keys(a)) {
    if (k === 'updatedAt' || !(k in b)) continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changes[k] = { old: b[k], new: a[k] };
  }
  return changes;
}

// ─── Auteur ───
const userLabels = new Map<string, string>();
async function actorLabel(client: PrismaClient, userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  if (userLabels.has(userId)) return userLabels.get(userId)!;
  const u = await client.user.findUnique({ where: { id: userId }, select: { prenom: true, nom: true } });
  const label = u ? [u.prenom, u.nom].filter(Boolean).join(' ') : null;
  if (label) userLabels.set(userId, label);
  return label;
}
/** À appeler quand un nom d'utilisateur change (cache des libellés). */
export function forgetUserLabel(userId: string) { userLabels.delete(userId); }

// ─── Journal ───
type AuditInput = {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'EXTERNAL' | 'UNDO';
  model: string;
  entityId?: string | null;
  label?: string | null;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  changes?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
};

export async function writeAudit(client: PrismaClient, entries: AuditInput[]) {
  const ctx = getContext();
  if (!ctx?.userId || ctx.dryRun || entries.length === 0) return;
  try {
    await client.auditLog.createMany({
      data: entries.map((e) => ({
        userId: ctx.userId!,
        action: e.action,
        entityType: e.model.toUpperCase(),
        entityId: e.entityId && uuidRe.test(e.entityId) ? e.entityId : null,
        entityLabel: e.label ?? null,
        changes: (e.changes ?? undefined) as Prisma.InputJsonValue | undefined,
        metadata: (e.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        before: (slim(e.before) ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (slim(e.after) ?? undefined) as Prisma.InputJsonValue | undefined,
        source: ctx.source,
        toolName: ctx.toolName ?? null,
        externe: !!ctx.externe || e.action === 'EXTERNAL',
        batchId: ctx.batchId,
      })),
    });
  } catch (err) {
    // Le journal ne doit jamais faire échouer l'action elle-même.
    console.error('[audit] écriture impossible :', (err as Error).message);
  }
}

// ─── Corbeille : capture de ce qu'une suppression va emporter ───
type Captured = { model: string; row: Record<string, any>; depth: number; isRoot: boolean };
type Detached = { model: string; id: string; field: string; value: unknown };

async function captureCascade(client: PrismaClient, model: string, roots: Record<string, any>[]) {
  const rules = await loadFkRules(client);
  const captured: Captured[] = roots.map((row) => ({ model, row, depth: 0, isRoot: true }));
  const detached: Detached[] = [];
  const seen = new Set(roots.map((r) => `${model}:${r.id}`));
  let frontier: Array<{ model: string; rows: Record<string, any>[]; depth: number }> = [{ model, rows: roots, depth: 0 }];
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const level of frontier) {
      for (const rule of rules.get(level.model) ?? []) {
        if (rule.rule === 'OTHER') continue;
        const values = level.rows.map((r) => r[rule.ref]).filter((v) => v !== null && v !== undefined);
        if (!values.length) continue;
        const d = delegate(client, rule.child);
        if (!d) continue;
        if (rule.rule === 'CASCADE') {
          const rows: Record<string, any>[] = await d.findMany({ where: { [rule.fk]: { in: values } } });
          const fresh = rows.filter((r) => r.id && !seen.has(`${rule.child}:${r.id}`));
          fresh.forEach((r) => seen.add(`${rule.child}:${r.id}`));
          if (fresh.length) {
            captured.push(...fresh.map((row) => ({ model: rule.child, row, depth: level.depth + 1, isRoot: false })));
            next.push({ model: rule.child, rows: fresh, depth: level.depth + 1 });
          }
        } else {
          const rows: Record<string, any>[] = await d.findMany({ where: { [rule.fk]: { in: values } }, select: { id: true, [rule.fk]: true } });
          for (const r of rows) if (r.id) detached.push({ model: rule.child, id: r.id, field: rule.fk, value: r[rule.fk] });
        }
      }
    }
    frontier = next;
  }
  return { captured, detached };
}

async function storeInTrash(client: PrismaClient, captured: Captured[], detached: Detached[]) {
  const ctx = getContext();
  if (!captured.length || ctx?.dryRun) return;
  const batchId = ctx?.batchId ?? randomUUID();
  const byLabel = await actorLabel(client, ctx?.userId);
  // Les lignes détachées sont rattachées à la première racine du lot.
  const rootIndex = captured.findIndex((c) => c.isRoot);
  await client.trashEntry.createMany({
    data: captured.map((c, i) => ({
      batchId,
      model: c.model,
      recordId: c.row.id,
      isRoot: c.isRoot,
      depth: c.depth,
      label: recordLabel(c.row),
      data: toJson(c.row),
      detached: i === rootIndex && detached.length ? (toJson(detached) as Prisma.InputJsonValue) : undefined,
      deletedById: ctx?.userId ?? null,
      deletedByLabel: byLabel,
      source: ctx?.source ?? 'SYSTEM',
      toolName: ctx?.toolName ?? null,
    })),
  });
}

// ─── Restauration d'un lot ───
export class RestoreError extends Error {}

export async function restoreBatch(client: PrismaClient, batchId: string) {
  const entries = await client.trashEntry.findMany({ where: { batchId }, orderBy: [{ depth: 'asc' }, { deletedAt: 'asc' }] });
  if (!entries.length) throw new RestoreError(`Nothing in the trash for batch ${batchId}.`);
  const pending = entries.filter((e) => !e.restoredAt);
  if (!pending.length) throw new RestoreError('This deletion was already restored.');
  const ctx = getContext();
  const restored: Array<{ model: string; id: string; label: string | null }> = [];
  const skipped: Array<{ model: string; id: string; reason: string }> = [];
  try {
    await client.$transaction(async (tx) => {
      // Profondeur croissante : les parents avant les enfants. Parmi les racines d'un même lot,
      // une ligne peut dépendre d'une autre : on réessaie celles qui échouent sur une clé.
      let queue = [...pending];
      for (let pass = 0; pass < 4 && queue.length; pass++) {
        const retry: typeof queue = [];
        for (const e of queue) {
          const d = (tx as any)[lc(e.model)];
          const exists = await d.findUnique({ where: { id: e.recordId }, select: { id: true } });
          if (exists) { skipped.push({ model: e.model, id: e.recordId, reason: 'already exists' }); continue; }
          try {
            await tx.$executeRawUnsafe('SAVEPOINT restore_row');
            await d.create({ data: reviveRow(e.model, e.data as Record<string, any>) });
            await tx.$executeRawUnsafe('RELEASE SAVEPOINT restore_row');
            restored.push({ model: e.model, id: e.recordId, label: e.label });
          } catch (err: any) {
            await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT restore_row');
            if (err?.code === 'P2003' && pass < 3) { retry.push(e); continue; }
            if (err?.code === 'P2002') {
              const fields = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : String(err.meta?.target ?? '');
              throw new RestoreError(`Cannot restore ${e.model} "${e.label ?? e.recordId}": another record already uses the same ${fields}.`);
            }
            if (err?.code === 'P2003') {
              throw new RestoreError(`Cannot restore ${e.model} "${e.label ?? e.recordId}": a record it points to no longer exists.`);
            }
            throw err;
          }
        }
        queue = retry;
      }
      for (const e of pending) {
        for (const det of ((e.detached as Detached[] | null) ?? [])) {
          const d = (tx as any)[lc(det.model)];
          await d.updateMany({ where: { id: det.id, [det.field]: null }, data: { [det.field]: det.value } });
        }
      }
      await tx.trashEntry.updateMany({ where: { batchId, restoredAt: null }, data: { restoredAt: new Date(), restoredById: ctx?.userId ?? null } });
    }, { timeout: 60_000 });
  } catch (err) {
    if (err instanceof RestoreError) throw err;
    throw new RestoreError(`Restore failed: ${(err as Error).message}`);
  }
  await writeAudit(client, restored.filter((r) => TRACKED_MODELS.has(r.model)).map((r) => ({
    action: 'RESTORE' as const, model: r.model, entityId: r.id, label: r.label, metadata: { trashBatchId: batchId },
  })));
  return { batch_id: batchId, restored, skipped };
}

/**
 * Ligne après écriture. Le résultat de Prisma suffit quand il est complet (pas de select) :
 * on évite une relecture, qui hors transaction verrait encore l'ancienne valeur.
 */
async function afterRow(client: PrismaClient, model: string, args: any, result: any) {
  if (result && typeof result === 'object' && !args?.select) {
    const m = MODELS.get(model);
    if (!m) return result;
    const out: Record<string, any> = {};
    for (const f of m.fields) if (f.kind !== 'object' && f.name in result) out[f.name] = result[f.name];
    return out;
  }
  return result?.id ? delegate(client, model).findUnique({ where: { id: result.id } }) : result;
}

/** Ce qu'une suppression emporterait, sans rien supprimer (mode essai). */
export async function previewDelete(client: PrismaClient, model: string, ids: string[]) {
  const roots: Record<string, any>[] = await delegate(client, model).findMany({ where: { id: { in: ids } } });
  if (!roots.length) return { found: 0, cascade: {}, detached: {} };
  const { captured, detached } = await captureCascade(client, model, roots);
  const count = (xs: Array<{ model: string }>) => xs.reduce<Record<string, number>>((acc, x) => { acc[x.model] = (acc[x.model] ?? 0) + 1; return acc; }, {});
  return { found: roots.length, cascade: count(captured.filter((c) => !c.isRoot)), detached: count(detached) };
}

// ─── Extension ───
export function installAuditAndTrash(client: PrismaClient) {
  return client.$extends({
    name: 'audit-trash',
    query: {
      $allModels: {
        async create({ model, args, query }) {
          const result: any = await query(args);
          if (TRACKED_MODELS.has(model)) {
            await writeAudit(client, [{ action: 'CREATE', model, entityId: result?.id, label: recordLabel(result), after: result }]);
          }
          return result;
        },
        async createMany({ model, args, query }) {
          const result: any = await query(args);
          if (TRACKED_MODELS.has(model) && result?.count) {
            await writeAudit(client, [{ action: 'CREATE', model, metadata: { count: result.count, bulk: true } }]);
          }
          return result;
        },
        async update({ model, args, query }) {
          if (!TRACKED_MODELS.has(model) || !getContext()?.userId) return query(args);
          const before = await delegate(client, model).findUnique({ where: args.where });
          const result: any = await query(args);
          const after = await afterRow(client, model, args, result);
          const changes = diff(before, after);
          if (changes && Object.keys(changes).length) {
            await writeAudit(client, [{ action: 'UPDATE', model, entityId: after?.id, label: recordLabel(after), before, after, changes }]);
          }
          return result;
        },
        async upsert({ model, args, query }) {
          if (!TRACKED_MODELS.has(model) || !getContext()?.userId) return query(args);
          const before = await delegate(client, model).findUnique({ where: args.where });
          const result: any = await query(args);
          const after = await afterRow(client, model, args, result);
          if (!before) await writeAudit(client, [{ action: 'CREATE', model, entityId: after?.id, label: recordLabel(after), after }]);
          else {
            const changes = diff(before, after);
            if (changes && Object.keys(changes).length) {
              await writeAudit(client, [{ action: 'UPDATE', model, entityId: after?.id, label: recordLabel(after), before, after, changes }]);
            }
          }
          return result;
        },
        async updateMany({ model, args, query }) {
          if (!TRACKED_MODELS.has(model) || !getContext()?.userId) return query(args);
          const before: any[] = await delegate(client, model).findMany({ where: args.where, take: 500 });
          const result = await query(args);
          if (before.length) {
            const afterRows: any[] = await delegate(client, model).findMany({ where: { id: { in: before.map((b) => b.id) } } });
            const byId = new Map(afterRows.map((r) => [r.id, r]));
            const entries: AuditInput[] = [];
            for (const b of before) {
              const a = byId.get(b.id);
              const changes = diff(b, a);
              if (changes && Object.keys(changes).length) entries.push({ action: 'UPDATE', model, entityId: b.id, label: recordLabel(a), before: b, after: a, changes });
            }
            await writeAudit(client, entries);
          }
          return result;
        },
        async delete({ model, args, query }) {
          if (!TRACKED_MODELS.has(model)) return query(args);
          const root = await delegate(client, model).findUnique({ where: args.where });
          if (!root) return query(args); // laisse Prisma renvoyer son erreur « introuvable »
          const skip = !!getContext()?.skipTrash;
          const { captured, detached } = skip ? { captured: [], detached: [] } : await captureCascade(client, model, [root]);
          const result = await query(args);
          if (!skip) await storeInTrash(client, captured, detached);
          await writeAudit(client, [{ action: 'DELETE', model, entityId: root.id, label: recordLabel(root), before: root, metadata: skip ? { definitive: true } : { trash: true, cascaded: captured.length - 1 } }]);
          return result;
        },
        async deleteMany({ model, args, query }) {
          if (!TRACKED_MODELS.has(model)) return query(args);
          const roots: any[] = await delegate(client, model).findMany({ where: args.where });
          if (!roots.length) return query(args);
          const skip = !!getContext()?.skipTrash;
          const { captured, detached } = skip ? { captured: [], detached: [] } : await captureCascade(client, model, roots);
          const result = await query(args);
          if (!skip) await storeInTrash(client, captured, detached);
          await writeAudit(client, roots.slice(0, 500).map((r) => ({ action: 'DELETE' as const, model, entityId: r.id, label: recordLabel(r), before: r, metadata: skip ? { definitive: true } : { trash: true } })));
          return result;
        },
      },
    },
  });
}
