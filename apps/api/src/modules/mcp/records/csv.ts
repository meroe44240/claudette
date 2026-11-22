import prisma from '../../../lib/db.js';
import { getEntity, RecordError } from './registry.js';
import { buildOrder, buildWhere, bulkCreate, bulkUpdate, closest, delegateOf, MAX_BULK, scalarFields } from './engine.js';

/** CSV : séparateur virgule ou point-virgule (Excel français), guillemets RFC 4180. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : (firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',');
  const rows: string[][] = [];
  let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

function toCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (Array.isArray(v)) s = v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join('; ');
  else if (typeof v === 'object') s = typeof (v as any).toNumber === 'function' ? String((v as any).toNumber()) : JSON.stringify(v);
  else s = String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const MAX_EXPORT = 5000;

export async function exportCsv(input: { entity: string; where?: Record<string, unknown>; q?: string; sort?: string; fields?: string[]; limit?: number }) {
  const def = getEntity(input.entity);
  const all = scalarFields(def).map((f) => f.name);
  const fields = input.fields?.length ? input.fields : def.listFields.filter((f) => all.includes(f));
  for (const f of fields) {
    if (!all.includes(f)) {
      const hint = closest(f, all);
      throw new RecordError(`Unknown field "${f}" on ${def.name}.${hint ? ` Did you mean "${hint}"?` : ''}`);
    }
  }
  const limit = Math.min(input.limit ?? MAX_EXPORT, MAX_EXPORT);
  const where = buildWhere(def, input.where, input.q);
  const d = delegateOf(prisma, def.model);
  const [rows, total] = await Promise.all([
    d.findMany({ where, orderBy: buildOrder(def, input.sort), take: limit, select: Object.fromEntries(fields.map((f) => [f, true])) }),
    d.count({ where }),
  ]);
  const lines = [fields.join(','), ...rows.map((r: any) => fields.map((f) => toCell(r[f])).join(','))];
  return { entity: def.name, rows: rows.length, total, truncated: total > rows.length, columns: fields, csv: lines.join('\n') };
}

/**
 * Import : la première ligne nomme les champs (nom Prisma, sans tenir compte de la casse),
 * ou mapping {"En-tête": "champ"}. Une colonne id (ou match_on) met à jour au lieu de créer.
 */
export async function importCsv(input: {
  entity: string; csv: string; mapping?: Record<string, string>; match_on?: string; dry_run?: boolean; stop_on_error?: boolean; userId: string;
}) {
  const def = getEntity(input.entity);
  const table = parseCsv(input.csv);
  if (table.length < 2) throw new RecordError('The CSV needs a header row and at least one data row.');
  const [header, ...data] = table;
  if (data.length > MAX_BULK) throw new RecordError(`${data.length} rows: the maximum is ${MAX_BULK} per import. Split the file.`);
  const fields = scalarFields(def).map((f) => f.name);
  const byLower = new Map(fields.map((f) => [f.toLowerCase(), f]));
  const columns = header.map((h) => {
    const name = h.trim();
    const mapped = input.mapping?.[name] ?? input.mapping?.[name.toLowerCase()];
    if (mapped === '' || mapped === null) return null; // colonne ignorée
    const f = mapped ? (byLower.get(mapped.toLowerCase()) ?? null) : (byLower.get(name.toLowerCase()) ?? null);
    if (!f) {
      const hint = closest(mapped ?? name, fields);
      throw new RecordError(`Column "${name}" does not match a ${def.name} field.${hint ? ` Did you mean "${hint}"?` : ''} Rename it, map it with mapping {"${name}": "<field>"}, or ignore it with mapping {"${name}": ""}.`);
    }
    return f;
  });
  const matchOn = input.match_on ?? (columns.includes('id') ? 'id' : undefined);
  if (matchOn && !columns.includes(matchOn)) throw new RecordError(`match_on "${matchOn}" is not one of the columns.`);
  const records = data.map((cells) => {
    const o: Record<string, string> = {};
    columns.forEach((c, i) => { if (c) o[c] = (cells[i] ?? '').trim(); });
    return o;
  });

  if (!matchOn) {
    const r = await bulkCreate(def.name, records, input.userId, !!input.dry_run, !!input.stop_on_error, true);
    return { mode: 'create', ...r, items: r.items.map((x) => ({ ...x, row: x.index + 2 })) };
  }

  // Mise à jour : on retrouve chaque ligne par match_on.
  const keys = records.map((r) => r[matchOn]).filter(Boolean);
  const d = delegateOf(prisma, def.model);
  const found: Array<Record<string, any>> = await d.findMany({ where: { [matchOn]: { in: keys } }, select: { id: true, [matchOn]: true } });
  const idByKey = new Map<string, string[]>();
  for (const f of found) idByKey.set(String(f[matchOn]), [...(idByKey.get(String(f[matchOn])) ?? []), f.id]);
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const errors: Array<{ index: number; row: number; ok: false; error: string }> = [];
  records.forEach((r, i) => {
    const ids = idByKey.get(r[matchOn]) ?? [];
    if (!r[matchOn]) errors.push({ index: i, row: i + 2, ok: false, error: `Empty ${matchOn}.` });
    else if (ids.length === 0) errors.push({ index: i, row: i + 2, ok: false, error: `No ${def.name} with ${matchOn} = ${r[matchOn]}.` });
    else if (ids.length > 1) errors.push({ index: i, row: i + 2, ok: false, error: `${ids.length} ${def.name} records have ${matchOn} = ${r[matchOn]}; use the id column instead.` });
    else {
      const { [matchOn]: _k, ...rest } = r;
      if (matchOn !== 'id') delete (rest as any).id;
      updates.push({ id: ids[0], data: rest });
    }
  });
  const positions = records.map((_r, i) => i).filter((i) => !errors.some((e) => e.index === i));
  const r = updates.length
    ? await bulkUpdate(def.name, updates, !!input.dry_run, !!input.stop_on_error, true)
    : { dry_run: input.dry_run || undefined, summary: { total: 0, processed: 0, succeeded: 0, failed: 0 }, items: [] as any[] };
  const items = [
    ...r.items.map((x: any) => ({ ...x, index: positions[x.index], row: positions[x.index] + 2 })),
    ...errors,
  ].sort((a, b) => a.index - b.index);
  const failed = items.filter((x) => !x.ok).length;
  return { mode: 'update', dry_run: r.dry_run, summary: { total: records.length, succeeded: items.length - failed, failed }, items };
}
