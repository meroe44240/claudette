import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import * as service from './agents.service.js';

/** Page Agents : réservée aux administrateurs. */
export default async function agentsRouter(fastify: FastifyInstance) {
  const admin = { preHandler: [authenticate, requireRole('ADMIN')] };
  const idParam = (r: any) => z.object({ id: z.string().uuid() }).parse(r.params).id;

  fastify.get('/', admin, async () => ({ data: await service.listAgents(), defaults: service.DEFAULT_AGENTS }));
  fastify.post('/', admin, async (r) => service.createAgent(z.object({ name: z.string().min(1).max(60) }).parse(r.body).name));
  fastify.post('/create-missing', admin, async () => service.createMissingAgents());
  fastify.put('/:id', admin, async (r) => service.updateAgent(idParam(r), z.object({
    name: z.string().min(1).max(60).optional(),
    rate_limit_per_minute: z.number().int().min(1).max(10_000).optional(),
  }).parse(r.body)));
  fastify.post('/:id/key', admin, async (r) => service.rotateKey(idParam(r)));
  fastify.delete('/:id/key', admin, async (r) => service.revokeKey(idParam(r)));
  fastify.post('/:id/suspend', admin, async (r) => service.setStatus(idParam(r), true));
  fastify.post('/:id/reactivate', admin, async (r) => service.setStatus(idParam(r), false));
}
