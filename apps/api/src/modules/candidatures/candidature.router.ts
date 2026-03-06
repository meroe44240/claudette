import { FastifyInstance } from 'fastify';
import { createCandidatureSchema, updateCandidatureSchema } from './candidature.schema.js';
import * as candidatureService from './candidature.service.js';
import { authenticate } from '../../middleware/auth.js';

export default async function candidatureRouter(fastify: FastifyInstance) {
  // POST / - Create candidature
  fastify.post('/', {
    schema: {
      description: 'Creer une candidature (associer un candidat a un mandat)',
      tags: ['Candidatures'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = createCandidatureSchema.parse(request.body);
      const candidature = await candidatureService.create(input, request.userId);
      reply.status(201);
      return candidature;
    },
  });

  // PUT /:id - Update candidature (stage, notes, motifRefus)
  fastify.put('/:id', {
    schema: {
      description: 'Mettre a jour une candidature (stage, notes, motif de refus)',
      tags: ['Candidatures'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = updateCandidatureSchema.parse(request.body);
      return candidatureService.update(id, input, request.userId);
    },
  });

  // DELETE /:id - Delete candidature
  fastify.delete('/:id', {
    schema: {
      description: 'Supprimer une candidature',
      tags: ['Candidatures'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      await candidatureService.remove(id);
      return { message: 'Candidature supprimee' };
    },
  });

  // GET /:id/history - Get stage history
  fastify.get('/:id/history', {
    schema: {
      description: 'Recuperer l\'historique des changements de stage d\'une candidature',
      tags: ['Candidatures'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      return candidatureService.getHistory(id);
    },
  });
}
