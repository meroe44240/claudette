import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import * as service from './job-offer.service.js';

const offerSchema = z.object({
  titre: z.string().min(1),
  description: z.string().min(1),
  localisation: z.string().nullable().optional(),
  contractType: z.string().nullable().optional(),
  remote: z.string().nullable().optional(),
  salaireMin: z.number().int().nullable().optional(),
  salaireMax: z.number().int().nullable().optional(),
  secteur: z.string().nullable().optional(),
  entrepriseNom: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  published: z.boolean().optional(),
  mandatId: z.string().uuid().nullable().optional(),
});

// ── Routeur ATS (authentifié) : /api/v1/job-offers ──
export default async function jobOfferRouter(fastify: FastifyInstance) {
  fastify.get('/', { schema: { tags: ['JobOffers'] }, preHandler: [authenticate], handler: () => service.list() });

  fastify.post('/', {
    schema: { tags: ['JobOffers'] }, preHandler: [authenticate],
    handler: async (request, reply) => { const input = offerSchema.parse(request.body); const o = await service.create(input, request.userId); reply.code(201); return o; },
  });

  fastify.put('/:id', {
    schema: { tags: ['JobOffers'], params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: async (request) => { const { id } = request.params as { id: string }; const input = offerSchema.partial({ titre: true, description: true }).parse(request.body); return service.update(id, input as service.JobOfferInput); },
  });

  fastify.patch('/:id/publish', {
    schema: { tags: ['JobOffers'], params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: async (request) => { const { id } = request.params as { id: string }; const { published } = z.object({ published: z.boolean() }).parse(request.body); return service.setPublished(id, published); },
  });

  fastify.delete('/:id', {
    schema: { tags: ['JobOffers'], params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: async (request) => { const { id } = request.params as { id: string }; return service.remove(id); },
  });
}

// ── Routeur PUBLIC (aucune auth) : /api/v1/public/job-offers ──
// C'est ce que la landing / job board vient consommer.
export async function jobOfferPublicRouter(fastify: FastifyInstance) {
  fastify.get('/', { schema: { tags: ['Public'] }, handler: () => service.listPublic() });
  fastify.get('/:slug', {
    schema: { tags: ['Public'], params: { type: 'object', required: ['slug'], properties: { slug: { type: 'string' } } } },
    handler: async (request) => { const { slug } = request.params as { slug: string }; return service.getPublicBySlug(slug); },
  });
}
