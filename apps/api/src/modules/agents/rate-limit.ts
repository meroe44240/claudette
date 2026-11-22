import { rawPrisma } from '../../lib/db.js';

/**
 * Limite de débit par utilisateur sur les appels d'outils MCP (fenêtre glissante d'une minute).
 * La limite vient de users.limite_par_minute, réglable par agent depuis la page Agents.
 */
const calls = new Map<string, number[]>();
const limits = new Map<string, { value: number; at: number }>();

export function invalidateAgentLimit(userId: string) {
  limits.delete(userId);
}

async function limitFor(userId: string) {
  const cached = limits.get(userId);
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  const u = await rawPrisma.user.findUnique({ where: { id: userId }, select: { limiteParMinute: true } });
  const value = u?.limiteParMinute ?? 120;
  limits.set(userId, { value, at: Date.now() });
  return value;
}

/** Compte n appels ; renvoie null si c'est permis, sinon le message d'erreur à renvoyer. */
export async function checkRateLimit(userId: string, n = 1): Promise<{ message: string; retryAfter: number } | null> {
  if (n <= 0) return null;
  const limit = await limitFor(userId);
  const now = Date.now();
  const recent = (calls.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length + n > limit) {
    calls.set(userId, recent);
    const retryAfter = Math.max(1, Math.ceil((60_000 - (now - recent[0])) / 1000));
    return {
      message: `Rate limit reached: ${limit} tool calls per minute for this account. Retry in ${retryAfter} seconds, or ask an admin to raise the limit on the Agents page.`,
      retryAfter,
    };
  }
  for (let i = 0; i < n; i++) recent.push(now);
  calls.set(userId, recent);
  return null;
}
