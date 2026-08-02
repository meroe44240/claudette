import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import * as leadService from './lead.service.js';

const createSchema = z.object({
  company: z.string().min(1),
  contact: z.string().min(1),
  role: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  headcount: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  src: z.enum(['push', 'cold', 'call', 'csv']).optional(),
  stage: z.enum(leadService.LEAD_STAGES).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  entrepriseId: z.string().uuid().nullable().optional(),
  pushedCandidat: z.any().optional(),
});

const updateSchema = z.object({
  stage: z.enum(leadService.LEAD_STAGES).optional(),
  company: z.string().min(1).optional(),
  contact: z.string().min(1).optional(),
  role: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
});

export default async function leadRouter(fastify: FastifyInstance) {
  // GET / — liste des leads (board)
  fastify.get('/', {
    schema: { description: 'Liste des leads (pipeline prospection)', tags: ['Leads'] },
    preHandler: [authenticate],
    handler: async () => leadService.listLeads(),
  });

  // POST / — créer un lead
  fastify.post('/', {
    schema: { description: 'Créer un lead', tags: ['Leads'] },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = createSchema.parse(request.body);
      const lead = await leadService.createLead(input, request.userId);
      reply.code(201);
      return lead;
    },
  });

  // GET /:id
  fastify.get('/:id', {
    schema: { description: 'Détail d\'un lead', tags: ['Leads'], params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: async (request) => leadService.getLead((request.params as { id: string }).id),
  });

  // PUT /:id — update / move stage
  fastify.put('/:id', {
    schema: { description: 'Mettre à jour un lead (étape, champs)', tags: ['Leads'], params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const input = updateSchema.parse(request.body);
      return leadService.updateLead(id, input);
    },
  });

  // POST /:id/lose — marquer perdu (motif liste fermée)
  fastify.post('/:id/lose', {
    schema: { description: 'Marquer un lead perdu', tags: ['Leads'], params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const input = z.object({ lostReason: z.string().min(1), lostNote: z.string().optional() }).parse(request.body);
      return leadService.loseLead(id, input.lostReason, input.lostNote);
    },
  });

  // POST /:id/convert — convertir en Client (funnel)
  fastify.post('/:id/convert', {
    schema: { description: 'Convertir un lead en client', tags: ['Leads'], params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return leadService.convertLead(id, request.userId);
    },
  });

  // POST /:id/interactions — log une interaction
  fastify.post('/:id/interactions', {
    schema: { description: 'Logger une interaction (appel/sms/email/note)', tags: ['Leads'], params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = z.object({ type: z.enum(['appel', 'sms', 'email', 'note']).nullable().optional(), text: z.string().min(1) }).parse(request.body);
      const it = await leadService.addInteraction(id, input.type ?? null, input.text, request.userId);
      reply.code(201);
      return it;
    },
  });

  // DELETE /:id
  fastify.delete('/:id', {
    schema: { description: 'Supprimer un lead', tags: ['Leads'], params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: async (request) => leadService.removeLead((request.params as { id: string }).id),
  });
}
