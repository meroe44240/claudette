import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

/**
 * Qui fait l'action en cours : utilisé par le journal d'audit et la corbeille (lib/db.ts).
 * Une requête web ou un appel d'outil MCP = un contexte, avec un batchId commun à toutes
 * les écritures qu'il déclenche (c'est l'unité d'annulation et de restauration).
 */
export interface RequestContext {
  userId?: string;
  userLabel?: string;
  source: 'WEB' | 'API' | 'MCP' | 'SYSTEM';
  toolName?: string;
  batchId: string;
  externe?: boolean;
  /** Effacement définitif voulu (RGPD) : la corbeille ne garde rien. */
  skipTrash?: boolean;
  /** Mode essai : les écritures sont annulées à la fin, rien n'est journalisé ni mis en corbeille. */
  dryRun?: boolean;
  /**
   * Dans une transaction : écritures du journal et de la corbeille mises en attente, faites
   * seulement si la transaction aboutit (sinon le journal et les webhooks mentiraient).
   */
  pending?: Array<() => Promise<void>>;
}

const store = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: Partial<RequestContext> & { source: RequestContext['source'] }, fn: () => T): T {
  return store.run({ batchId: randomUUID(), ...ctx }, fn);
}

export function getContext(): RequestContext | undefined {
  return store.getStore();
}

/** Complète le contexte courant (ex. : l'authentification connaît l'utilisateur après coup). */
export function setContextUser(userId: string, source?: RequestContext['source']) {
  const ctx = store.getStore();
  if (!ctx) return;
  ctx.userId = userId;
  if (source) ctx.source = source;
}

/** Exécute fn sans passer par la corbeille (effacement RGPD). */
export function runWithoutTrash<T>(fn: () => T): T {
  const ctx = store.getStore();
  return store.run({ ...(ctx ?? { source: 'SYSTEM', batchId: randomUUID() }), skipTrash: true }, fn);
}

/** Exécute fn en mode essai (voir RequestContext.dryRun). */
export function runDry<T>(fn: () => T): T {
  const ctx = store.getStore();
  return store.run({ ...(ctx ?? { source: 'SYSTEM', batchId: randomUUID() }), dryRun: true }, fn);
}

/**
 * Exécute fn (une transaction) en différant le journal et la corbeille : ils ne sont écrits
 * qu'une fois fn terminée sans erreur. Si fn échoue, tout ce qui était en attente est oublié.
 */
export async function runDeferred<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = store.getStore();
  if (ctx?.pending) return fn(); // déjà différé par une transaction englobante
  const pending: Array<() => Promise<void>> = [];
  const result = await store.run({ ...(ctx ?? { source: 'SYSTEM', batchId: randomUUID() }), pending }, fn);
  for (const job of pending) {
    try { await job(); } catch (err) { console.error('[audit] écriture différée impossible :', (err as Error).message); }
  }
  return result;
}
