import { createHmac, randomBytes, randomUUID } from 'crypto';
import { rawPrisma } from '../../lib/db.js';
import { ValidationError, NotFoundError } from '../../lib/errors.js';
import { EVENT_TYPES, eventsFromAudit, type EventType } from '../../lib/events.js';

/**
 * Webhooks sortants : chaque événement (lib/events.ts) et chaque annonce (ANNOUNCEMENT_TYPES) est envoyé
 * en POST JSON aux abonnements actifs qui l'ont demandé, signé HMAC-SHA256 (X-Propium-Signature: sha256=<hex>).
 * Chaque envoi est journalisé (webhook_deliveries) ; en cas d'échec il est repris à 1 min, 5 min, 30 min,
 * 2 h puis 12 h (retryDueDeliveries, appelé chaque minute par le cron), puis marqué failed.
 * Un abonnement est désactivé après 20 échecs d'affilée.
 * Tout passe par rawPrisma : la gestion des webhooks n'est ni journalisée ni mise en corbeille.
 */

const MAX_FAILURES = 20;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
const TIMEOUT_MS = 5_000;
const KEEP_DAYS = 30;

/**
 * Annonces : événements construits par le code métier (pas déduits du journal), pour l'équipe.
 * Humanup Chat les publie dans #news.
 */
export const ANNOUNCEMENT_TYPES = {
  'announcement.client_meeting': 'A client or prospect meeting was booked (typed as client meeting, dated, with interlocutors)',
  'announcement.presentation': 'A candidate is presented to a client (client interview, dated, with an interlocutor)',
  'announcement.closed_won': 'Closed won: a candidate was placed (application moved to Won)',
} as const;
export type AnnouncementType = keyof typeof ANNOUNCEMENT_TYPES;

type Hook = { id: string; url: string; eventTypes: string[]; secret: string };
let cache: { at: number; hooks: Hook[] } | null = null;
const CACHE_MS = 30_000;
export function invalidateWebhookCache() { cache = null; }

async function activeHooks(): Promise<Hook[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.hooks;
  const hooks = await rawPrisma.webhook.findMany({ where: { active: true }, select: { id: true, url: true, eventTypes: true, secret: true } });
  cache = { at: Date.now(), hooks };
  return hooks;
}

// ─── Validation ───
/** Hôtes internes autorisés malgré tout (ex. "humanup-chat-hub" sur le réseau Docker), séparés par des virgules. */
function allowedInternalHosts() {
  return (process.env.WEBHOOK_ALLOWED_INTERNAL_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
}

function checkUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new ValidationError(`URL invalide : ${raw}`); }
  if (allowedInternalHosts().includes(u.hostname.toLowerCase())) {
    if (!['https:', 'http:'].includes(u.protocol)) throw new ValidationError('Le webhook doit être en http(s).');
    return u.toString();
  }
  const local = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|0\.0\.0\.0)/.test(u.hostname);
  if (process.env.NODE_ENV === 'production') {
    if (u.protocol !== 'https:') throw new ValidationError('Le webhook doit être en https.');
    if (local) throw new ValidationError('Adresse interne refusée pour un webhook.');
  } else if (!['https:', 'http:'].includes(u.protocol)) {
    throw new ValidationError('Le webhook doit être en http(s).');
  }
  return u.toString();
}

function checkTypes(types?: string[]) {
  const all = [...Object.keys(EVENT_TYPES), ...Object.keys(ANNOUNCEMENT_TYPES)];
  const bad = (types ?? []).filter((t) => !all.includes(t));
  if (bad.length) throw new ValidationError(`Type(s) d'événement inconnu(s) : ${bad.join(', ')}. Types : ${all.join(', ')}.`);
  return [...new Set(types ?? [])];
}

const view = (w: any) => ({
  id: w.id, url: w.url, event_types: w.eventTypes.length ? w.eventTypes : ['*'], description: w.description, active: w.active,
  last_delivery_at: w.lastDeliveryAt, last_status: w.lastStatus, last_error: w.lastError, consecutive_failures: w.consecutiveFailures,
  created_at: w.createdAt,
});

// ─── Gestion ───
export async function list() {
  const rows = await rawPrisma.webhook.findMany({ orderBy: { createdAt: 'desc' } });
  return { data: rows.map(view), event_types: { ...EVENT_TYPES, ...ANNOUNCEMENT_TYPES } };
}

export async function create(input: { url: string; eventTypes?: string[]; description?: string | null }, userId?: string) {
  const w = await rawPrisma.webhook.create({
    data: {
      url: checkUrl(input.url), eventTypes: checkTypes(input.eventTypes), description: input.description ?? null,
      secret: `whsec_${randomBytes(24).toString('base64url')}`, createdById: userId ?? null,
    },
  });
  invalidateWebhookCache();
  // Le secret n'est donné qu'à la création : il sert à vérifier la signature côté récepteur.
  return { ...view(w), secret: w.secret };
}

export async function update(id: string, input: { url?: string; eventTypes?: string[]; description?: string | null; active?: boolean }) {
  const w = await rawPrisma.webhook.findUnique({ where: { id } });
  if (!w) throw new NotFoundError('Webhook', id);
  const u = await rawPrisma.webhook.update({
    where: { id },
    data: {
      ...(input.url !== undefined ? { url: checkUrl(input.url) } : {}),
      ...(input.eventTypes !== undefined ? { eventTypes: checkTypes(input.eventTypes) } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.active !== undefined ? { active: input.active, ...(input.active ? { consecutiveFailures: 0 } : {}) } : {}),
    },
  });
  invalidateWebhookCache();
  return view(u);
}

export async function remove(id: string) {
  const w = await rawPrisma.webhook.findUnique({ where: { id } });
  if (!w) throw new NotFoundError('Webhook', id);
  await rawPrisma.webhook.delete({ where: { id } });
  invalidateWebhookCache();
  return { id, deleted: true };
}

/** Journal des envois d'un abonnement, du plus récent au plus ancien. */
export async function deliveries(id: string, opts: { status?: string; limit?: number } = {}) {
  const w = await rawPrisma.webhook.findUnique({ where: { id } });
  if (!w) throw new NotFoundError('Webhook', id);
  const rows = await rawPrisma.webhookDelivery.findMany({
    where: { webhookId: id, ...(opts.status ? { status: opts.status } : {}) },
    orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(opts.limit ?? 100, 1), 500),
  });
  return {
    data: rows.map((d) => ({
      id: d.id, event_id: d.eventId, event_type: d.eventType, status: d.status, attempts: d.attempts,
      next_attempt_at: d.nextAttemptAt, last_status: d.lastStatus, last_error: d.lastError,
      created_at: d.createdAt, delivered_at: d.deliveredAt, payload: d.payload,
    })),
  };
}

// ─── Envoi ───
export function sign(secret: string, body: string) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

async function post(hook: Hook, payload: Record<string, unknown>): Promise<{ status: number | null; error: string | null }> {
  const body = JSON.stringify(payload);
  try {
    const res = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json', 'user-agent': 'Propium-Webhooks/1',
        'x-propium-event': String(payload.type), 'x-propium-delivery': String(payload.id), 'x-propium-signature': sign(hook.secret, body),
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { status: null, error: (err as Error).message.slice(0, 480) };
  }
}

/** One attempt for one journal row; updates the row and the subscription's health. */
async function attempt(hook: Hook, deliveryId: string, payload: Record<string, unknown>, attemptsBefore: number) {
  const { status, error } = await post(hook, payload);
  const ok = !error;
  const attempts = attemptsBefore + 1;
  const delay = RETRY_DELAYS_MS[attempts - 1];
  await rawPrisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: ok
      ? { status: 'delivered', attempts, deliveredAt: new Date(), lastStatus: status, lastError: null, nextAttemptAt: null }
      : { status: delay === undefined ? 'failed' : 'pending', attempts, lastStatus: status, lastError: error,
          nextAttemptAt: delay === undefined ? null : new Date(Date.now() + delay) },
  }).catch(() => null);
  const w = await rawPrisma.webhook.update({
    where: { id: hook.id },
    data: { lastDeliveryAt: new Date(), lastStatus: status, lastError: error, consecutiveFailures: ok ? 0 : { increment: 1 } },
  }).catch(() => null);
  if (!ok && w && w.consecutiveFailures >= MAX_FAILURES) {
    await rawPrisma.webhook.update({ where: { id: hook.id }, data: { active: false } }).catch(() => {});
    invalidateWebhookCache();
  }
  return { status, error };
}

/** Journalise puis envoie. Avec dedupKey, la même annonce n'est envoyée qu'une fois par abonnement. */
async function deliver(hook: Hook, payload: Record<string, unknown>, dedupKey?: string | null) {
  let row;
  try {
    row = await rawPrisma.webhookDelivery.create({
      data: { webhookId: hook.id, eventId: String(payload.id), eventType: String(payload.type), dedupKey: dedupKey ?? null, payload: payload as any },
    });
  } catch (err: any) {
    if (err?.code === 'P2002') return { status: null, error: 'duplicate', skipped: true }; // déjà envoyé
    throw err;
  }
  return attempt(hook, row.id, payload, 0);
}

/** Reprend les envois dus (cron, chaque minute) et purge le journal au-delà de 30 jours. */
export async function retryDueDeliveries() {
  const due = await rawPrisma.webhookDelivery.findMany({
    where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
    include: { webhook: { select: { id: true, url: true, eventTypes: true, secret: true, active: true } } },
    orderBy: { nextAttemptAt: 'asc' }, take: 50,
  });
  for (const d of due) {
    if (!d.webhook.active) {
      await rawPrisma.webhookDelivery.update({ where: { id: d.id }, data: { status: 'failed', nextAttemptAt: null, lastError: 'Webhook disabled' } });
      continue;
    }
    await attempt(d.webhook, d.id, d.payload as Record<string, unknown>, d.attempts);
  }
  await rawPrisma.webhookDelivery.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) } } });
  return { retried: due.length };
}

const userNames = new Map<string, { id: string; name: string; is_agent: boolean }>();
async function actor(userId: string | null) {
  if (!userId) return null;
  if (userNames.has(userId)) return userNames.get(userId)!;
  const u = await rawPrisma.user.findUnique({ where: { id: userId }, select: { id: true, prenom: true, nom: true, estAgent: true } });
  const v = u ? { id: u.id, name: [u.prenom, u.nom].filter(Boolean).join(' '), is_agent: u.estAgent } : null;
  if (v) userNames.set(userId, v);
  return v;
}

type AuditEntryWithMeta = {
  action: string; model: string; entityId?: string | null; label?: string | null; after?: unknown; changes?: unknown; metadata?: unknown;
  userId: string | null; source: string; toolName: string | null;
};

/** Appelé après chaque écriture du journal : envoie les événements aux abonnés. */
export async function dispatchFromAudit(entries: AuditEntryWithMeta[]) {
  const hooks = await activeHooks();
  if (!hooks.length) return;
  for (const e of entries) {
    const events = eventsFromAudit({ action: e.action, entityType: e.model.toUpperCase(), entityId: e.entityId ?? null, entityLabel: e.label ?? null, after: e.after, changes: e.changes, metadata: e.metadata });
    if (!events.length) continue;
    const by = await actor(e.userId);
    for (const ev of events) {
      const targets = hooks.filter((h) => !h.eventTypes.length || h.eventTypes.includes(ev.type));
      if (!targets.length) continue;
      const payload = { id: randomUUID(), type: ev.type, at: new Date().toISOString(), entity: ev.entity, by, source: e.source, tool: e.toolName, details: ev.details ?? {} };
      for (const h of targets) void deliver(h, JSON.parse(JSON.stringify(payload))).catch((err) => console.error('[webhooks]', err));
    }
  }
}

/**
 * Envoie une annonce aux abonnements qui l'ont demandée explicitement (pas aux abonnements "tous les événements",
 * qui suivent le journal). dedupKey : même clé = un seul envoi (ex. "meeting:<activité>").
 */
export async function dispatchAnnouncement(
  type: AnnouncementType,
  entity: { type: string; id: string | null; label: string | null },
  details: Record<string, unknown>,
  opts: { userId?: string | null; dedupKey?: string | null } = {},
) {
  const hooks = (await activeHooks()).filter((h) => h.eventTypes.includes(type));
  if (!hooks.length) return { sent: 0 };
  const by = await actor(opts.userId ?? null);
  const payload = { id: randomUUID(), type, at: new Date().toISOString(), entity, by, source: 'SYSTEM', tool: null, details };
  const results = await Promise.all(hooks.map((h) => deliver(h, JSON.parse(JSON.stringify(payload)), opts.dedupKey).catch((err) => {
    console.error('[webhooks] announcement', err);
    return { status: null, error: String(err) };
  })));
  return { sent: results.filter((r) => !r.error).length };
}

/** Envoi d'un événement de test, attendu (pour vérifier l'URL et la signature). */
export async function test(id: string) {
  const w = await rawPrisma.webhook.findUnique({ where: { id } });
  if (!w) throw new NotFoundError('Webhook', id);
  const payload = { id: randomUUID(), type: 'webhook.test' as EventType | 'webhook.test', at: new Date().toISOString(), entity: { type: 'webhook', id: w.id, label: w.description }, by: null, source: 'SYSTEM', tool: null, details: { message: 'Test delivery from Propium' } };
  const r = await deliver({ id: w.id, url: w.url, eventTypes: w.eventTypes, secret: w.secret }, payload);
  return { delivered: !r.error, status: r.status, error: r.error };
}
