import { FastifyInstance } from 'fastify';
import { createMandatSchema, updateMandatSchema, updateFeeSchema } from './mandat.schema.js';
import * as mandatService from './mandat.service.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { parsePagination } from '../../lib/pagination.js';

export default async function mandatRouter(fastify: FastifyInstance) {
  // GET / - List mandats with filters
  fastify.get('/', {
    schema: {
      description: 'Lister les mandats avec filtres et pagination',
      tags: ['Mandats'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          perPage: { type: 'string' },
          search: { type: 'string' },
          statut: { type: 'string' },
          priorite: { type: 'string' },
          entrepriseId: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const query = request.query as any;
      const params = parsePagination(query);

      return mandatService.list(
        params,
        query.search,
        query.statut,
        query.priorite,
        query.entrepriseId,
      );
    },
  });

  // POST / - Create mandat
  fastify.post('/', {
    schema: {
      description: 'Creer un mandat',
      tags: ['Mandats'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = createMandatSchema.parse(request.body);
      const mandat = await mandatService.create(input, request.userId);
      reply.status(201);
      return mandat;
    },
  });

  // GET /:id - Get mandat by id
  fastify.get('/:id', {
    schema: {
      description: 'Recuperer un mandat par son ID',
      tags: ['Mandats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      return mandatService.getById(id);
    },
  });

  // PUT /:id - Update mandat
  fastify.put('/:id', {
    schema: {
      description: 'Mettre a jour un mandat',
      tags: ['Mandats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = updateMandatSchema.parse(request.body);
      return mandatService.update(id, input);
    },
  });

  // DELETE /:id - Delete mandat (admin only)
  fastify.delete('/:id', {
    schema: {
      description: 'Supprimer un mandat',
      tags: ['Mandats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      await mandatService.remove(id);
      return { message: 'Mandat supprime' };
    },
  });

  // POST /:id/clone - Clone mandat
  fastify.post('/:id/clone', {
    schema: {
      description: 'Dupliquer un mandat',
      tags: ['Mandats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const mandat = await mandatService.clone(id);
      reply.status(201);
      return mandat;
    },
  });

  // GET /:id/kanban - Get candidatures grouped by stage
  fastify.get('/:id/kanban', {
    schema: {
      description: 'Recuperer les candidatures du mandat groupees par stage (vue Kanban)',
      tags: ['Mandats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      return mandatService.getKanban(id);
    },
  });

  // PUT /:id/fee - Update fee information
  fastify.put('/:id/fee', {
    schema: {
      description: 'Mettre a jour les informations de facturation du mandat',
      tags: ['Mandats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = updateFeeSchema.parse(request.body);
      return mandatService.updateFee(id, input);
    },
  });
}
