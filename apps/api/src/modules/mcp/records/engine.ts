import { Prisma } from '@prisma/client';
import prisma from '../../../lib/db.js';
import { previewDelete } from '../../../lib/audit-trash.js';
import { runDry } from '../../../lib/request-context.js';
import { getEntity, RecordError, type EntityDef } from './registry.js';

/**
 * Moteur des outils génériques : validation des champs d'après le schéma Prisma, filtres,
 * tri, curseur, sélection de champs, relations, écritures unitaires et en masse, mode essai.
 */

type Field = Prisma.DMMF.Field;
const MODELS = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
const ENUMS = new Map(Prisma.dmmf.datamodel.enums.map((e) => [e.name, e.values.map((v) => v.name)]));
const SENSITIVE = /password|token|secret|apikey|hash|refresh/i;
const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);
const lc = (s: string) => s[0].toLowerCase() + s.slice(1);

export const MAX_BULK = 500;
export const MAX_LIMIT = 200;

export function delegateOf(client: any, model: string) { return client[lc(model)]; }

function modelOf(def: EntityDef) {
  const m = MODELS.get(def.model);
  if (!m) throw new RecordError(`Model ${def.model} not found.`);
  return m;
}

/** Champs scalaires visibles (hors secrets). */
export function scalarFields(def: EntityDef): Field[] {
  return modelOf(def).fields.filter((f) => f.kind !== 'object' && !SENSITIVE.test(f.name));
}

function relationFields(def: EntityDef): Map<string, Field> {
  return new Map(modelOf(def).fields.filter((f) => f.kind === 'object').map((f) => [f.name, f]));
}

// ─── Suggestions sur les noms inconnus ───
function distance(a: string, b: string) {
  a = a.toLowerCase(); b = b.toLowerCase();
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}
export function closest(name: string, options: string[]): string | null {
  let best: string | null = null; let score = Infinity;
  for (const o of options) {
    const s = o.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(o.toLowerCase()) ? 1 : distance(name, o);
    if (s < score) { score = s; best = o; }
  }
  return score <= Math.max(2, Math.floor(name.length / 3)) ? best : null;
}

function fieldMap(def: EntityDef) { return new Map(scalarFields(def).map((f) => [f.name, f])); }

function unknownField(def: EntityDef, name: string): never {
  const names = scalarFields(def).map((f) => f.name);
  const hint = closest(name, names);
  throw new RecordError(`Unknown field "${name}" on ${def.name}.${hint ? ` Did you mean "${hint}"?` : ''} Fields: ${names.join(', ')}.`, { field: name, suggestion: hint });
}

// ─── Conversion des valeurs ───
const TRUE = new Set(['true', '1', 'yes', 'oui', 'y', 'o']);
const FALSE = new Set(['false', '0', 'no', 'non', 'n']);

function coerceOne(def: EntityDef, f: Field, v: unknown, fromText: boolean): unknown {
  const bad = (expected: string): never => {
    throw new RecordError(`Invalid value for ${def.name}.${f.name}: expected ${expected}, got ${JSON.stringify(v)}.`, { field: f.name });
  };
  if (f.kind === 'enum') {
    const values = ENUMS.get(f.type) ?? [];
    const s = String(v).trim().toUpperCase();
    if (!values.includes(s)) bad(`one of ${values.join(', ')}`);
    return s;
  }
  switch (f.type) {
    case 'String': return typeof v === 'string' ? v : (typeof v === 'number' || typeof v === 'boolean') ? String(v) : bad('a string');
    case 'Int': {
      const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, ''));
      return Number.isInteger(n) ? n : bad('an integer');
    }
    case 'Float': case 'Decimal': {
      const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : bad('a number');
    }
    case 'BigInt': { try { return BigInt(v as any); } catch { return bad('an integer'); } }
    case 'Boolean': {
      if (typeof v === 'boolean') return v;
      const s = String(v).trim().toLowerCase();
      return TRUE.has(s) ? true : FALSE.has(s) ? false : bad('true or false');
    }
    case 'DateTime': {
      const d = v instanceof Date ? v : new Date(String(v));
      return Number.isNaN(d.getTime()) ? bad('an ISO 8601 date, e.g. 2026-11-23 or 2026-11-23T14:30:00Z') : d;
    }
    case 'Json': {
      if (fromText && typeof v === 'string') { try { return JSON.parse(v); } catch { return v; } }
      return v;
    }
    default: return v;
  }
}

export function coerceValue(def: EntityDef, f: Field, v: unknown, fromText = false): unknown {
  if (v === null || (fromText && v === '')) {
    if (f.isList) return [];
    if (f.isRequired && !fromText) throw new RecordError(`${def.name}.${f.name} cannot be empty.`, { field: f.name });
    return f.isRequired ? undefined : (f.type === 'Json' ? Prisma.DbNull : null);
  }
  if (f.isList) {
    const arr = Array.isArray(v) ? v : String(v).split(/[;|]/).map((x) => x.trim()).filter(Boolean);
    return arr.map((x) => coerceOne(def, f, x, fromText));
  }
  return coerceOne(def, f, v, fromText);
}

/** Valide et convertit des données d'écriture. */
export function prepareData(def: EntityDef, data: Record<string, unknown>, mode: 'create' | 'update', userId?: string, fromText = false) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new RecordError('data must be an object of field: value.');
  const fields = fieldMap(def);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const f = fields.get(k);
    if (!f) unknownField(def, k);
    if (SYSTEM_FIELDS.has(k) || f.isUpdatedAt) throw new RecordError(`${def.name}.${k} is set by the system and cannot be written.`, { field: k });
    if (def.lockedFields?.[k]) throw new RecordError(`${def.name}.${k} cannot be changed with this tool. ${def.lockedFields[k]}`, { field: k });
    const value = coerceValue(def, f, v, fromText);
    if (value !== undefined) out[k] = value;
  }
  if (mode === 'create') {
    if (def.authorField && out[def.authorField] === undefined && userId && fields.has(def.authorField)) out[def.authorField] = userId;
    const missing = [...fields.values()].filter((f) => f.isRequired && !f.hasDefaultValue && !f.isUpdatedAt && !SYSTEM_FIELDS.has(f.name) && out[f.name] === undefined).map((f) => f.name);
    if (missing.length) throw new RecordError(`Missing required field(s) for ${def.name}: ${missing.join(', ')}.`, { missing });
  }
  if (mode === 'update' && Object.keys(out).length === 0) throw new RecordError('Nothing to update: data is empty.');
  return out;
}

// ─── Filtres ───
const OPS: Record<string, string> = {
  eq: 'equals', ne: 'not', in: 'in', not_in: 'notIn', contains: 'contains', starts_with: 'startsWith', ends_with: 'endsWith',
  gt: 'gt', gte: 'gte', lt: 'lt', lte: 'lte', has: 'has', has_some: 'hasSome', has_every: 'hasEvery',
};
export const FILTER_DOC = 'where: {field: value} for equality, or {field: {op: value}} with op in ' +
  'eq, ne, in, not_in, contains, starts_with, ends_with, gt, gte, lt, lte, is_null (true/false), has / has_some / has_every (list fields like tags). ' +
  'Text ops ignore case. Several fields = AND. Example: {"localisation":{"contains":"Paris"},"tier":{"in":["A","B"]},"createdAt":{"gte":"2026-11-01"}}';

export function buildWhere(def: EntityDef, where?: Record<string, unknown> | null, q?: string) {
  const fields = fieldMap(def);
  const and: Record<string, unknown>[] = [];
  for (const [k, raw] of Object.entries(where ?? {})) {
    const f = fields.get(k);
    if (!f) unknownField(def, k);
    const isText = f.type === 'String' && f.kind !== 'enum' && !f.isList;
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || raw instanceof Date) {
      if (Array.isArray(raw)) { and.push({ [k]: f.isList ? { hasSome: coerceValue(def, f, raw) } : { in: raw.map((x) => coerceValue(def, { ...f, isList: false } as Field, x)) } }); continue; }
      and.push({ [k]: raw === null ? null : (f.isList ? { has: coerceValue(def, { ...f, isList: false } as Field, raw) } : coerceValue(def, f, raw)) });
      continue;
    }
    const cond: Record<string, unknown> = {};
    for (const [op, v] of Object.entries(raw as Record<string, unknown>)) {
      if (op === 'is_null') { and.push(v ? { [k]: null } : { NOT: { [k]: null } }); continue; }
      const pop = OPS[op];
      if (!pop) throw new RecordError(`Unknown filter operator "${op}" on ${k}. ${FILTER_DOC}`);
      const one = { ...f, isList: false } as Field;
      if (['in', 'notIn', 'hasSome', 'hasEvery'].includes(pop)) {
        if (!Array.isArray(v)) throw new RecordError(`Operator ${op} on ${k} needs a list.`);
        cond[pop] = v.map((x) => coerceValue(def, one, x));
      } else cond[pop] = coerceValue(def, one, v);
      if (isText && ['equals', 'contains', 'startsWith', 'endsWith', 'in', 'notIn'].includes(pop)) cond.mode = 'insensitive';
    }
    if (Object.keys(cond).length) and.push({ [k]: cond });
  }
  if (q && q.trim()) {
    const words = q.trim().split(/\s+/).slice(0, 5);
    const text = def.searchFields.filter((s) => fields.has(s));
    if (text.length) for (const w of words) and.push({ OR: text.map((s) => ({ [s]: { contains: w, mode: 'insensitive' } })) });
  }
  return and.length ? { AND: and } : {};
}

export function buildOrder(def: EntityDef, sort?: string) {
  const fields = fieldMap(def);
  const order: Record<string, 'asc' | 'desc'>[] = [];
  for (const part of (sort || (fields.has('updatedAt') ? '-updatedAt' : '-createdAt')).split(',').map((s) => s.trim()).filter(Boolean)) {
    const desc = part.startsWith('-');
    const name = part.replace(/^[-+]/, '').split(':')[0];
    const dir = part.endsWith(':desc') ? 'desc' : part.endsWith(':asc') ? 'asc' : desc ? 'desc' : 'asc';
    if (!fields.has(name)) unknownField(def, name);
    order.push({ [name]: dir });
  }
  if (!order.some((o) => 'id' in o)) order.push({ id: 'asc' });
  return order;
}

// ─── Sélection ───
function buildSelect(def: EntityDef, fields?: string[], include?: string[], full = false) {
  const all = scalarFields(def).map((f) => f.name);
  const chosen = fields?.length ? fields : full ? all : def.listFields.filter((x) => all.includes(x));
  const select: Record<string, unknown> = { id: true };
  for (const name of chosen) {
    if (!all.includes(name)) unknownField(def, name);
    select[name] = true;
  }
  const rels = relationFields(def);
  let activities = false;
  for (const inc of include ?? []) {
    const idef = def.includes?.[inc];
    if (!idef) {
      const opts = Object.keys(def.includes ?? {});
      const hint = closest(inc, opts);
      throw new RecordError(`Unknown include "${inc}" on ${def.name}.${hint ? ` Did you mean "${hint}"?` : ''} Available: ${opts.join(', ') || 'none'}.`);
    }
    if (idef.relation === 'activities') { activities = true; continue; }
    const rf = rels.get(idef.relation);
    if (!rf) continue;
    const sub: Record<string, unknown> = {};
    if (idef.select) sub.select = idef.select;
    if (rf.isList) { sub.take = 50; if (idef.orderBy) sub.orderBy = idef.orderBy; }
    select[idef.relation] = Object.keys(sub).length ? sub : true;
  }
  return { select, activities };
}

/** Prêt pour JSON : décimaux en nombres, relations renommées avec leur nom d'include, textes longs tronqués en liste. */
function present(def: EntityDef, row: Record<string, any>, truncate: boolean) {
  const out: Record<string, unknown> = {};
  const relToInclude = new Map(Object.entries(def.includes ?? {}).map(([k, v]) => [v.relation, k]));
  for (const [k, v] of Object.entries(row)) {
    const key = relToInclude.get(k) ?? k;
    if (v instanceof Prisma.Decimal) out[key] = v.toNumber();
    else if (typeof v === 'bigint') out[key] = v.toString();
    else if (truncate && typeof v === 'string' && v.length > 1000) out[key] = v.slice(0, 1000) + `… [${v.length} characters, use get_record for the full text]`;
    else out[key] = v;
  }
  if (def.computed) Object.assign(out, def.computed(row));
  return out;
}

async function attachActivities(def: EntityDef, rows: Record<string, any>[]) {
  if (!def.activityType || !rows.length) return;
  const acts = await prisma.activite.findMany({
    where: { entiteType: def.activityType, entiteId: { in: rows.map((r) => r.id) } },
    orderBy: { createdAt: 'desc' }, take: 50 * rows.length,
    select: { id: true, entiteId: true, type: true, titre: true, contenu: true, isTache: true, tacheCompleted: true, tacheDueDate: true, userId: true, source: true, createdAt: true },
  });
  for (const r of rows) {
    r.activities = acts.filter((a) => a.entiteId === r.id).slice(0, 50)
      .map(({ entiteId: _e, ...a }) => ({ ...a, contenu: a.contenu && a.contenu.length > 600 ? a.contenu.slice(0, 600) + '…' : a.contenu }));
  }
}

// ─── Lecture ───
export interface ListInput {
  entity: string; where?: Record<string, unknown>; q?: string; sort?: string; fields?: string[]; include?: string[];
  cursor?: string; limit?: number;
}

export function encodeCursor(id: string) { return Buffer.from(JSON.stringify({ id })).toString('base64url'); }
function decodeCursor(c: string): string {
  try { const id = JSON.parse(Buffer.from(c, 'base64url').toString()).id; if (typeof id === 'string') return id; } catch { /* ignore */ }
  throw new RecordError('Invalid cursor. Pass the next_cursor value from the previous call unchanged.');
}

export async function listRecords(input: ListInput) {
  const def = getEntity(input.entity);
  const limit = Math.min(Math.max(input.limit ?? 25, 1), MAX_LIMIT);
  const where = buildWhere(def, input.where, input.q);
  const { select, activities } = buildSelect(def, input.fields, input.include);
  const d = delegateOf(prisma, def.model);
  const args: Record<string, unknown> = { where, orderBy: buildOrder(def, input.sort), take: limit + 1, select };
  if (input.cursor) { args.cursor = { id: decodeCursor(input.cursor) }; args.skip = 1; }
  const [rows, total] = await Promise.all([d.findMany(args), d.count({ where })]);
  const page = rows.slice(0, limit);
  if (activities) await attachActivities(def, page);
  return {
    entity: def.name,
    total,
    data: page.map((r: any) => present(def, r, true)),
    next_cursor: rows.length > limit ? encodeCursor(page[page.length - 1].id) : null,
  };
}

export async function getRecord(entity: string, id: string, fields?: string[], include?: string[]) {
  const def = getEntity(entity);
  const { select, activities } = buildSelect(def, fields, include, true);
  const row = await delegateOf(prisma, def.model).findUnique({ where: { id }, select });
  if (!row) throw new RecordError(`No ${def.name} with id ${id}. It may be in the trash (list_trash) or you can search with list_records q.`);
  if (activities) await attachActivities(def, [row]);
  return present(def, row, false);
}

// ─── Écriture ───
export function friendlyError(def: EntityDef, err: any): string {
  if (err instanceof RecordError) return err.message;
  const code = err?.code;
  if (code === 'P2002') return `Another ${def.name} already uses the same ${[].concat(err.meta?.target ?? []).join(', ')}.`;
  if (code === 'P2003') return `A linked record does not exist (${err.meta?.field_name ?? 'foreign key'}). Check the id you passed, or delete the records that depend on this one first.`;
  if (code === 'P2025') return `${def.name} not found.`;
  if (code === 'P2014' || code === 'P2011') return err.message.split('\n').pop();
  const msg = String(err?.message ?? err);
  return msg.includes('\n') ? msg.split('\n').filter(Boolean).pop()! : msg;
}

async function doCreate(client: any, def: EntityDef, data: Record<string, unknown>, userId?: string, fromText = false) {
  if (def.readOnly) throw new RecordError(`${def.name} is read only over MCP.`);
  const prepared = prepareData(def, data, 'create', userId, fromText);
  const row = await delegateOf(client, def.model).create({ data: prepared });
  return present(def, row, false);
}

async function doUpdate(client: any, def: EntityDef, id: string, data: Record<string, unknown>, fromText = false) {
  if (def.readOnly) throw new RecordError(`${def.name} is read only over MCP.`);
  const prepared = prepareData(def, data, 'update', undefined, fromText);
  const d = delegateOf(client, def.model);
  const before = await d.findUnique({ where: { id } });
  if (!before) throw new RecordError(`No ${def.name} with id ${id}.`);
  const after = await d.update({ where: { id }, data: prepared });
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const k of Object.keys(prepared)) {
    const o = before[k] instanceof Prisma.Decimal ? before[k].toNumber() : before[k];
    const n = after[k] instanceof Prisma.Decimal ? after[k].toNumber() : after[k];
    if (JSON.stringify(o) !== JSON.stringify(n)) changes[k] = { old: o, new: n };
  }
  return { id, changes };
}

async function doDelete(def: EntityDef, id: string) {
  if (def.readOnly) throw new RecordError(`${def.name} is read only over MCP.`);
  const d = delegateOf(prisma, def.model);
  const row = await d.findUnique({ where: { id } });
  if (!row) throw new RecordError(`No ${def.name} with id ${id}.`);
  if (def.remove) await def.remove(id);
  else await d.delete({ where: { id } });
  return { id, deleted: true };
}

class DryRunRollback extends Error { constructor(public result: unknown) { super('dry run'); } }

/** Exécute fn dans une transaction annulée à la fin : vraie validation par la base, rien n'est gardé. */
async function inDryTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  try {
    await runDry(() => prisma.$transaction(async (tx) => { throw new DryRunRollback(await fn(tx)); }, { timeout: 120_000 }));
  } catch (err) {
    if (err instanceof DryRunRollback) return err.result as T;
    throw err;
  }
  throw new Error('unreachable');
}

export async function createRecord(entity: string, data: Record<string, unknown>, userId: string, dryRun = false) {
  const def = getEntity(entity);
  try {
    if (dryRun) return { dry_run: true, would_create: await inDryTransaction((tx) => doCreate(tx, def, data, userId)) };
    return await doCreate(prisma, def, data, userId);
  } catch (err) { throw new RecordError(friendlyError(def, err)); }
}

export async function updateRecord(entity: string, id: string, data: Record<string, unknown>, dryRun = false) {
  const def = getEntity(entity);
  try {
    if (dryRun) return { dry_run: true, ...(await inDryTransaction((tx) => doUpdate(tx, def, id, data))) };
    return await doUpdate(prisma, def, id, data);
  } catch (err) { throw new RecordError(friendlyError(def, err)); }
}

export async function deleteRecord(entity: string, id: string, dryRun = false) {
  const def = getEntity(entity);
  if (def.readOnly) throw new RecordError(`${def.name} is read only over MCP.`);
  if (dryRun) {
    const p = await previewDelete(prisma, def.model, [id]);
    if (!p.found) throw new RecordError(`No ${def.name} with id ${id}.`);
    return { dry_run: true, would_delete: { entity: def.name, id }, also_removed: p.cascade, unlinked: p.detached, restorable_for_days: 30 };
  }
  try {
    return { ...(await doDelete(def, id)), restorable_for_days: 30, hint: 'Undo with restore_record {"id": "<this id>"} or undo {"batch_id": "<batch_id>"}.' };
  } catch (err) { throw new RecordError(friendlyError(def, err)); }
}

// ─── Masse ───
export type BulkItem = { index: number; ok: boolean; id?: string; error?: string; result?: unknown };

export async function runBulk(
  count: number,
  dryRun: boolean,
  stopOnError: boolean,
  op: (i: number, client: any) => Promise<{ id?: string; result?: unknown }>,
) {
  if (count === 0) throw new RecordError('Nothing to do: the list is empty.');
  if (count > MAX_BULK) throw new RecordError(`Too many items: ${count}. The maximum is ${MAX_BULK} per call; split the work.`);
  const items: BulkItem[] = [];
  const loop = async (client: any, savepoints: boolean) => {
    for (let i = 0; i < count; i++) {
      try {
        if (savepoints) await client.$executeRawUnsafe('SAVEPOINT bulk_row');
        const r = await op(i, client);
        if (savepoints) await client.$executeRawUnsafe('RELEASE SAVEPOINT bulk_row');
        items.push({ index: i, ok: true, ...r });
      } catch (err: any) {
        if (savepoints) await client.$executeRawUnsafe('ROLLBACK TO SAVEPOINT bulk_row');
        items.push({ index: i, ok: false, error: err?.message ?? String(err) });
        if (stopOnError) break;
      }
    }
  };
  if (dryRun) await inDryTransaction((tx) => loop(tx, true));
  else await loop(prisma, false);
  const failed = items.filter((x) => !x.ok).length;
  return {
    dry_run: dryRun || undefined,
    summary: { total: count, processed: items.length, succeeded: items.length - failed, failed },
    items,
  };
}

export async function bulkCreate(entity: string, rows: Record<string, unknown>[], userId: string, dryRun = false, stopOnError = false, fromText = false) {
  const def = getEntity(entity);
  return runBulk(rows.length, dryRun, stopOnError, async (i, client) => {
    try {
      const r = await doCreate(client, def, rows[i], userId, fromText);
      return { id: r.id as string };
    } catch (err) { throw new RecordError(friendlyError(def, err)); }
  });
}

export async function bulkUpdate(entity: string, items: Array<{ id: string; data: Record<string, unknown> }>, dryRun = false, stopOnError = false, fromText = false) {
  const def = getEntity(entity);
  return runBulk(items.length, dryRun, stopOnError, async (i, client) => {
    try {
      const r = await doUpdate(client, def, items[i].id, items[i].data, fromText);
      return { id: items[i].id, result: r.changes };
    } catch (err) { throw new RecordError(friendlyError(def, err)); }
  });
}

export async function bulkDelete(entity: string, ids: string[], dryRun = false, stopOnError = false) {
  const def = getEntity(entity);
  if (dryRun) {
    if (ids.length > MAX_BULK) throw new RecordError(`Too many items: ${ids.length}. The maximum is ${MAX_BULK} per call.`);
    const p = await previewDelete(prisma, def.model, ids);
    return { dry_run: true, summary: { total: ids.length, found: p.found, missing: ids.length - p.found }, also_removed: p.cascade, unlinked: p.detached };
  }
  return runBulk(ids.length, false, stopOnError, async (i) => {
    try { await doDelete(def, ids[i]); return { id: ids[i] }; } catch (err) { throw new RecordError(friendlyError(def, err)); }
  });
}

/** Ids correspondant à un filtre, pour les actions en masse par filtre (au plus MAX_BULK). */
export async function idsMatching(entity: string, where?: Record<string, unknown>, q?: string) {
  const def = getEntity(entity);
  const w = buildWhere(def, where, q);
  if (!Object.keys(w).length) throw new RecordError('A filter (where or q) is required for a bulk action by filter.');
  const d = delegateOf(prisma, def.model);
  const total = await d.count({ where: w });
  if (total > MAX_BULK) throw new RecordError(`The filter matches ${total} ${def.name} records; the maximum is ${MAX_BULK}. Narrow the filter.`);
  const rows: Array<{ id: string }> = await d.findMany({ where: w, select: { id: true } });
  return rows.map((r) => r.id);
}
