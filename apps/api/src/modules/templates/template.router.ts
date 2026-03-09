import { FastifyInstance } from 'fastify';
import {
  createTemplateSchema,
  updateTemplateSchema,
  renderTemplateSchema,
} from './template.schema.js';
import * as templateService from './template.service.js';
import { authenticate } from '../../middleware/auth.js';
import { parsePagination } from '../../lib/pagination.js';

export default async function templateRouter(fastify: FastifyInstance) {
  // GET / - List templates
  fastify.get('/', {
    schema: {
      description: 'Lister les templates',
      tags: ['Templates'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const query = request.query as any;
      const params = { ...parsePagination(query), type: query.type as string | undefined };
      return templateService.list(request.userId, params);
    },
  });

  // GET /:id - Get single template
  fastify.get('/:id', {
    schema: {
      description: 'Récupérer un template par ID',
      tags: ['Templates'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      return templateService.getById(id);
    },
  });

  // POST / - Create template
  fastify.post('/', {
    schema: {
      description: 'Creer un template',
      tags: ['Templates'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = createTemplateSchema.parse(request.body);
      const template = await templateService.create(input, request.userId, request.userRole);
      reply.status(201);
      return template;
    },
  });

  // PUT /:id - Update template
  fastify.put('/:id', {
    schema: {
      description: 'Mettre a jour un template',
      tags: ['Templates'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = updateTemplateSchema.parse(request.body);
      return templateService.update(id, input);
    },
  });

  // DELETE /:id - Delete template
  fastify.delete('/:id', {
    schema: {
      description: 'Supprimer un template',
      tags: ['Templates'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      await templateService.remove(id);
      return { message: 'Template supprime' };
    },
  });

  // POST /:id/render - Render template with context
  fastify.post('/:id/render', {
    schema: {
      description: 'Rendre un template avec les variables contextuelles',
      tags: ['Templates'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = renderTemplateSchema.parse(request.body);
      return templateService.render(id, {
        ...input,
        userId: request.userId,
      });
    },
  });
}
