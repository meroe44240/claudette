import { createHash, randomBytes } from 'crypto';
import { rawPrisma } from '../../lib/db.js';

/** Clé MCP d'agent : « pk_agent_ » + 40 caractères. Seule l'empreinte SHA-256 est stockée. */
export function generateAgentKey() {
  const key = `pk_agent_${randomBytes(30).toString('base64url')}`;
  return { key, hash: hashKey(key), prefix: key.slice(0, 14) };
}

export function hashKey(key: string) {
  return createHash('sha256').update(key.trim()).digest('hex');
}

const userSelect = { id: true, email: true, role: true, status: true, estAgent: true, accesFinance: true, prenom: true, nom: true, limiteParMinute: true } as const;

/** Retrouve l'utilisateur d'une clé : clé d'agent (empreinte) ou ancienne clé API en clair. */
export async function findUserByApiKey(token: string) {
  const t = token.trim();
  if (t.length < 24) return null;
  const byHash = await rawPrisma.user.findUnique({ where: { apiKeyHash: hashKey(t) }, select: userSelect });
  if (byHash) return byHash;
  return rawPrisma.user.findUnique({ where: { apiKey: t }, select: userSelect });
}
