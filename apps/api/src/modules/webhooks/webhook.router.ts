import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import * as service from './webhook.service.js';
import { getEvents } from '../events/event.service.js';

const body = z.object({
  url: z.string().url().optional(),
  eventTypes: z.array(z.string()).optional(),
  description: z.string().max(255).nullable().optional(),
  active: z.boolean().optional(),
});

/** /api/v1/webhooks : gestion des webhooks sortants (admins). */
export default async function webhookRouter(fastify: FastifyInstance) {
  const admin = [authenticate, requireRole('ADMIN')];
  fastify.get('/', { preHandler: admin }, async () => service.list());
  fastify.post('/', { preHandler: admin }, async (request, reply) => {
    const b = body.extend({ url: z.string().url() }).parse(request.body);
    reply.code(201);
    return service.create({ url: b.url, eventTypes: b.eventTypes, description: b.description ?? null }, request.userId);
  });
  fastify.put('/:id', { preHandler: admin }, async (request) => service.update((request.params as { id: string }).id, body.parse(request.body)));
  fastify.delete('/:id', { preHandler: admin }, async (request) => service.remove((request.params as { id: string }).id));
  fastify.post('/:id/test', { preHandler: admin }, async (request) => service.test((request.params as { id: string }).id));
  // Flux d'événements (même contenu que l'outil MCP get_events).
  fastify.get('/events', { preHandler: admin }, async (request) => {
    const q = request.query as Record<string, string | undefined>;
    return getEvents({ since: q.since, cursor: q.cursor, types: q.types ? q.types.split(',') : undefined, limit: q.limit ? Number(q.limit) : undefined });
  });
}
