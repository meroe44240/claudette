import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import * as service from './presentation.service.js';
import * as ownership from '../ownership/ownership.service.js';

const createSchema = z.object({
  candidatId: z.string().uuid(),
  entrepriseId: z.string().uuid(),
  clientId: z.string().uuid().nullable().optional(),
  mandatId: z.string().uuid().nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
  canal: z.string().optional(),
  statut: z.string().optional(),
  accordCandidat: z.boolean().optional(),
  anonyme: z.boolean().optional(),
  cvUrl: z.string().max(1000).nullable().optional(),
  note: z.string().nullable().optional(),
  presentedAt: z.string().optional(),
});
const updateSchema = createSchema.pick({ canal: true, statut: true, accordCandidat: true, anonyme: true, cvUrl: true, note: true, clientId: true }).partial();

/** /api/v1/presentations : présentations de candidats aux sociétés. */
export async function presentationRouter(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [authenticate] }, async (request) => {
    const q = request.query as Record<string, string | undefined>;
    return service.list({ candidatId: q.candidatId, entrepriseId: q.entrepriseId, leadId: q.leadId, mandatId: q.mandatId, statut: q.statut, since: q.since, limit: q.limit ? Number(q.limit) : undefined });
  });
  fastify.get('/push-status/:candidatId', { preHandler: [authenticate] }, async (request) => service.pushStatus((request.params as { candidatId: string }).candidatId));
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    reply.code(201);
    return service.create(body, request.userId, 'MANUEL');
  });
  fastify.put('/:id', { preHandler: [authenticate] }, async (request) => service.update((request.params as { id: string }).id, updateSchema.parse(request.body)));
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request) => service.remove((request.params as { id: string }).id));
}

/** /api/v1/ownership/:type/:id : propriétaire d'une société, d'un lead ou d'un contact. */
export async function ownershipRouter(fastify: FastifyInstance) {
  const params = (r: any) => r.params as { type: string; id: string };
  fastify.get('/:type/:id', { preHandler: [authenticate] }, async (request) => ownership.getOwner(params(request).type, params(request).id));
  fastify.post('/:type/:id/claim', { preHandler: [authenticate] }, async (request) => {
    const b = z.object({ reason: z.string().max(500).optional(), days: z.number().int().min(1).max(365).optional(), ownerId: z.string().uuid().optional(), force: z.boolean().optional() }).parse(request.body ?? {});
    return ownership.claim(params(request).type, params(request).id, request.userId, { ...b, isAdmin: request.userRole === 'ADMIN' });
  });
  fastify.post('/:type/:id/release', { preHandler: [authenticate] }, async (request) => {
    const b = z.object({ reason: z.string().max(500).optional() }).parse(request.body ?? {});
    return ownership.release(params(request).type, params(request).id, request.userId, { ...b, isAdmin: request.userRole === 'ADMIN' });
  });
}
