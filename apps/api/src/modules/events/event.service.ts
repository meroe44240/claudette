import { rawPrisma } from '../../lib/db.js';
import { ValidationError } from '../../lib/errors.js';
import { EVENT_SOURCES, EVENT_TYPES, eventsFromAudit, type EventType } from '../../lib/events.js';

/**
 * get_events : les événements depuis une date, lus dans le journal d'audit (ordre chronologique).
 * Curseur = position dans le journal ; next_cursor permet de reprendre sans rien rater.
 */

const SCAN = 1000; // lignes du journal lues au plus par appel

function decode(cursor: string): { t: Date; id: string } {
  try {
    const o = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    return { t: new Date(o.t), id: String(o.id) };
  } catch { throw new ValidationError('Curseur invalide : repasse next_cursor tel quel.'); }
}
const encode = (t: Date, id: string) => Buffer.from(JSON.stringify({ t: t.toISOString(), id })).toString('base64url');

export async function getEvents(input: { since?: string; types?: string[]; cursor?: string; limit?: number; entity_id?: string }) {
  const all = Object.keys(EVENT_TYPES);
  const types = input.types?.length ? input.types : all;
  const bad = types.filter((t) => !all.includes(t));
  if (bad.length) throw new ValidationError(`Type(s) inconnu(s) : ${bad.join(', ')}. Types : ${all.join(', ')}.`);
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);

  let after: { t: Date; id: string } | null = null;
  if (input.cursor) after = decode(input.cursor);
  else {
    if (!input.since) throw new ValidationError('Passe since (date ISO, par exemple 2026-11-22T08:00:00Z) ou cursor.');
    const d = new Date(input.since);
    if (Number.isNaN(d.getTime())) throw new ValidationError(`Date invalide : ${input.since}`);
    after = { t: d, id: '00000000-0000-0000-0000-000000000000' };
  }

  const where: any = {
    OR: EVENT_SOURCES.map((s) => ({ action: s.action, entityType: s.entityType })),
    AND: [{ OR: [{ createdAt: { gt: after.t } }, { createdAt: after.t, id: { gt: after.id } }] }],
  };
  if (input.entity_id) where.entityId = input.entity_id;

  const rows = await rawPrisma.auditLog.findMany({
    where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: SCAN,
    include: { user: { select: { id: true, prenom: true, nom: true, estAgent: true } } },
  });

  const events: any[] = [];
  let last: { t: Date; id: string } | null = null;
  for (const r of rows) {
    const evs = eventsFromAudit(r).filter((e) => types.includes(e.type));
    if (events.length + evs.length > limit && events.length > 0) break;
    evs.forEach((e, i) => events.push({
      id: `${r.id}:${i}`,
      type: e.type as EventType,
      at: r.createdAt,
      entity: e.entity,
      by: r.user ? { id: r.user.id, name: [r.user.prenom, r.user.nom].filter(Boolean).join(' '), is_agent: r.user.estAgent } : null,
      source: r.source,
      tool: r.toolName,
      batch_id: r.batchId,
      ...(e.details ? { details: e.details } : {}),
    }));
    last = { t: r.createdAt, id: r.id };
  }
  const more = !!last && (rows.length === SCAN || last.id !== rows[rows.length - 1]?.id);
  return {
    events,
    count: events.length,
    // Toujours un curseur : sans nouvel événement, on repart du même point au prochain appel.
    next_cursor: encode((last ?? after).t, (last ?? after).id),
    has_more: more,
  };
}
