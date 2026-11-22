import { createHmac, randomBytes, randomUUID } from 'crypto';
import { rawPrisma } from '../../lib/db.js';
import { ValidationError, NotFoundError } from '../../lib/errors.js';
import { EVENT_TYPES, eventsFromAudit, type EventType } from '../../lib/events.js';

/**
 * Webhooks sortants : chaque événement (lib/events.ts) est envoyé en POST JSON aux abonnements
 * actifs qui l'ont demandé, signé HMAC-SHA256 (en-tête X-Propium-Signature: sha256=<hex>).
 * Trois essais (1 s, 10 s, 60 s), désactivation après 20 échecs d'affilée.
 * Tout passe par rawPrisma : la gestion des webhooks n'est ni journalisée ni mise en corbeille.
 */

const MAX_FAILURES = 20;
const RETRIES_MS = [1_000, 10_000, 60_000];
const TIMEOUT_MS = 5_000;

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
function checkUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new ValidationError(`URL invalide : ${raw}`); }
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
  const all = Object.keys(EVENT_TYPES);
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
  return { data: rows.map(view), event_types: EVENT_TYPES };
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

// ─── Envoi ───
export function sign(secret: string, body: string) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

async function deliver(hook: Hook, payload: Record<string, unknown>, attempt = 0): Promise<{ status: number | null; error: string | null }> {
  const body = JSON.stringify(payload);
  let status: number | null = null; let error: string | null = null;
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
    status = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = (err as Error).message.slice(0, 480);
  }
  const ok = !error;
  const w = await rawPrisma.webhook.update({
    where: { id: hook.id },
    data: { lastDeliveryAt: new Date(), lastStatus: status, lastError: error, consecutiveFailures: ok ? 0 : { increment: 1 } },
  }).catch(() => null);
  if (!ok && w) {
    if (w.consecutiveFailures >= MAX_FAILURES) {
      await rawPrisma.webhook.update({ where: { id: hook.id }, data: { active: false } }).catch(() => {});
      invalidateWebhookCache();
    } else if (attempt < RETRIES_MS.length) {
      setTimeout(() => { void deliver(hook, payload, attempt + 1); }, RETRIES_MS[attempt]).unref?.();
    }
  }
  return { status, error };
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
      for (const h of targets) void deliver(h, JSON.parse(JSON.stringify(payload)));
    }
  }
}

/** Envoi d'un événement de test, attendu (pour vérifier l'URL et la signature). */
export async function test(id: string) {
  const w = await rawPrisma.webhook.findUnique({ where: { id } });
  if (!w) throw new NotFoundError('Webhook', id);
  const payload = { id: randomUUID(), type: 'webhook.test' as EventType | 'webhook.test', at: new Date().toISOString(), entity: { type: 'webhook', id: w.id, label: w.description }, by: null, source: 'SYSTEM', tool: null, details: { message: 'Test delivery from Propium' } };
  const r = await deliver({ id: w.id, url: w.url, eventTypes: w.eventTypes, secret: w.secret }, payload, RETRIES_MS.length);
  return { delivered: !r.error, status: r.status, error: r.error };
}
