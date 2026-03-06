import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as tacheService from './tache.service.js';
import { authenticate } from '../../middleware/auth.js';
import { parsePagination } from '../../lib/pagination.js';

const createTacheSchema = z.object({
  titre: z.string().min(1, 'Le titre est requis'),
  contenu: z.string().optional(),
  entiteType: z.enum(['CANDIDAT', 'CLIENT', 'ENTREPRISE', 'MANDAT']),
  entiteId: z.string().uuid(),
  tacheDueDate: z.string().datetime().optional(),
});

export default async function tacheRouter(fastify: FastifyInstance) {
  // GET / - List taches with status filter
  fastify.get('/', {
    schema: {
      description: 'Lister les taches avec filtres et pagination',
      tags: ['Taches'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          perPage: { type: 'string' },
          status: { type: 'string', enum: ['todo', 'overdue', 'done', 'all'] },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const query = request.query as any;
      const params = parsePagination(query);
      const status = query.status || 'all';

      return tacheService.list(params, { status, userId: query.userId });
    },
  });

  // POST / - Create tache
  fastify.post('/', {
    schema: {
      description: 'Creer une tache',
      tags: ['Taches'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = createTacheSchema.parse(request.body);
      const tache = await tacheService.create({
        ...input,
        userId: request.userId,
      });
      reply.status(201);
      return tache;
    },
  });

  // PUT /:id/complete - Mark tache as done
  fastify.put('/:id/complete', {
    schema: {
      description: 'Marquer une tache comme terminee',
      tags: ['Taches'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      return tacheService.complete(id);
    },
  });
}
