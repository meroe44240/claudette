import type { FastifyInstance } from 'fastify';
import { authenticate, requireRole } from '../../middleware/auth.js';

/**
 * /api/v1/admin/chat : registre des questions posées par les agents sur Humanup Chat (qui, quoi, à qui, quand,
 * réponse, délai, action faite dans Propium) et état des agents. Lu dans l'Agent Hub avec son jeton admin :
 * l'admin voit tout, y compris les échanges RH et primes.
 */

const hubUrl = () => (process.env.CHAT_HUB_URL || 'http://humanup-chat-hub:3100').replace(/\/$/, '');

async function hub(path: string) {
  const token = process.env.CHAT_HUB_ADMIN_TOKEN;
  if (!token) return { status: 503, body: { error: 'Humanup Chat is not connected (CHAT_HUB_ADMIN_TOKEN missing).' } };
  try {
    const res = await fetch(`${hubUrl()}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  } catch (err) {
    return { status: 502, body: { error: `Humanup Chat unreachable: ${(err as Error).message}` } };
  }
}

export default async function chatRegistryRouter(fastify: FastifyInstance) {
  const admin = [authenticate, requireRole('ADMIN')];
  fastify.get('/registry', { preHandler: admin }, async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const qs = new URLSearchParams();
    for (const k of ['agent', 'human', 'status', 'since', 'until']) if (q[k]) qs.set(k, q[k]!);
    const r = await hub(`/v1/registry?${qs}`);
    return reply.code(r.status).send(r.body);
  });
  fastify.get('/agents', { preHandler: admin }, async (_request, reply) => {
    const r = await hub('/v1/admin/agents');
    return reply.code(r.status).send(r.body);
  });
}
