import { FastifyInstance } from 'fastify';
import { createActiviteSchema, updateActiviteSchema } from './activite.schema.js';
import * as activiteService from './activite.service.js';
import { authenticate } from '../../middleware/auth.js';
import { parsePagination } from '../../lib/pagination.js';
import prisma from '../../lib/db.js';

export default async function activiteRouter(fastify: FastifyInstance) {
  // GET / - List activites with filters
  fastify.get('/', {
    schema: {
      description: 'Lister les activites avec filtres et pagination',
      tags: ['Activites'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          perPage: { type: 'string' },
          entiteType: { type: 'string' },
          entiteId: { type: 'string' },
          type: { type: 'string' },
          source: { type: 'string' },
          bookmarked: { type: 'string' },
          search: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const query = request.query as any;
      const params = parsePagination(query);

      const filters: any = {};
      if (query.entiteType) filters.entiteType = query.entiteType;
      if (query.entiteId) filters.entiteId = query.entiteId;
      if (query.type) filters.type = query.type;
      if (query.source) filters.source = query.source;
      if (query.bookmarked !== undefined) filters.bookmarked = query.bookmarked === 'true';
      if (query.search) filters.search = query.search;

      // Non-admins only see their own activities when browsing globally (no entiteId)
      if (!query.entiteId) {
        const user = await prisma.user.findUnique({ where: { id: request.userId }, select: { role: true } });
        if (user?.role !== 'ADMIN') {
          filters.userId = request.userId;
        }
      }

      return activiteService.list(params, filters);
    },
  });

  // POST / - Create activite
  fastify.post('/', {
    schema: {
      description: 'Creer une activite',
      tags: ['Activites'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = createActiviteSchema.parse(request.body);
      const activite = await activiteService.create(input, request.userId);
      reply.status(201);
      return activite;
    },
  });

  // PUT /:id - Update activite
  fastify.put('/:id', {
    schema: {
      description: 'Mettre a jour une activite',
      tags: ['Activites'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = updateActiviteSchema.parse(request.body);
      return activiteService.update(id, input);
    },
  });

  // DELETE /:id - Delete activite
  fastify.delete('/:id', {
    schema: {
      description: 'Supprimer une activite',
      tags: ['Activites'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      await activiteService.remove(id);
      return { message: 'Activite supprimee' };
    },
  });

  // POST /:id/identifier-contact - Link an unidentified call to a candidat/client
  fastify.post('/:id/identifier-contact', {
    schema: {
      description: 'Identifier le contact d\'un appel non-identifié',
      tags: ['Activites'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['entiteType', 'entiteId'],
        properties: {
          entiteType: { type: 'string', enum: ['CANDIDAT', 'CLIENT'] },
          entiteId: { type: 'string', format: 'uuid' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const { entiteType, entiteId } = request.body as { entiteType: 'CANDIDAT' | 'CLIENT'; entiteId: string };
      return activiteService.identifierContact(id, entiteType, entiteId);
    },
  });

  // POST /:id/fichiers - Add fichier to activite
  fastify.post('/:id/fichiers', {
    schema: {
      description: 'Ajouter un fichier a une activite',
      tags: ['Activites'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { nom: string; url: string; mimeType?: string; taille?: number };
      const fichier = await activiteService.addFichier(id, body);
      reply.status(201);
      return fichier;
    },
  });
}
