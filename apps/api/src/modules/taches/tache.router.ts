import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as tacheService from './tache.service.js';
import { authenticate } from '../../middleware/auth.js';
import { parsePagination } from '../../lib/pagination.js';

const createTacheSchema = z.object({
  titre: z.string().min(1, 'Le titre est requis'),
  contenu: z.string().optional(),
  entiteType: z.enum(['CANDIDAT', 'CLIENT', 'ENTREPRISE', 'MANDAT']).default('CANDIDAT'),
  entiteId: z.string().uuid().default('00000000-0000-0000-0000-000000000000'),
  tacheDueDate: z.string().datetime().optional(),
  tachePriority: z.enum(['HAUTE', 'MOYENNE', 'BASSE']).optional(),
});

const updateTacheSchema = z.object({
  titre: z.string().min(1).optional(),
  contenu: z.string().optional(),
  tacheDueDate: z.string().datetime().nullable().optional(),
  tachePriority: z.enum(['HAUTE', 'MOYENNE', 'BASSE']).optional(),
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

  // PUT /:id - Update tache
  fastify.put('/:id', {
    schema: {
      description: 'Mettre a jour une tache',
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
      const input = updateTacheSchema.parse(request.body);
      return tacheService.update(id, input);
    },
  });

  // PUT /:id/uncomplete - Reopen tache
  fastify.put('/:id/uncomplete', {
    schema: {
      description: 'Reouvrir une tache',
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
      return tacheService.uncomplete(id);
    },
  });

  // PUT /:id/snooze - Snooze tache
  fastify.put('/:id/snooze', {
    schema: {
      description: 'Reporter une tache de X jours',
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
      const { days } = z.object({ days: z.number().int().min(1).max(90) }).parse(request.body);
      return tacheService.snooze(id, days);
    },
  });

  // DELETE /:id - Delete tache
  fastify.delete('/:id', {
    schema: {
      description: 'Supprimer une tache',
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
      await tacheService.remove(id);
      return { message: 'Tache supprimee' };
    },
  });
}
