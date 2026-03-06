import { FastifyInstance } from 'fastify';
import * as auditService from './audit.service.js';
import { authenticate } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorize.js';
import { parsePagination } from '../../lib/pagination.js';

export default async function auditRouter(fastify: FastifyInstance) {
  // GET / — List all audit entries (admin only, paginated)
  fastify.get('/', {
    schema: {
      description: 'Lister toutes les entrées d\'audit (admin uniquement)',
      tags: ['Audit'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          perPage: { type: 'string' },
          entityType: { type: 'string' },
          entityId: { type: 'string' },
          userId: { type: 'string' },
          action: { type: 'string', enum: ['CREATE', 'UPDATE', 'DELETE'] },
        },
      },
    },
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const query = request.query as Record<string, string | undefined>;
      const pagination = parsePagination(query as { page?: string; perPage?: string });

      return auditService.getAuditLog(
        {
          entityType: query.entityType,
          entityId: query.entityId,
          userId: query.userId,
          action: query.action as 'CREATE' | 'UPDATE' | 'DELETE' | undefined,
        },
        pagination,
      );
    },
  });

  // GET /entity/:type/:id — Get history for a specific entity
  fastify.get('/entity/:type/:id', {
    schema: {
      description: 'Obtenir l\'historique des modifications d\'une entité',
      tags: ['Audit'],
      params: {
        type: 'object',
        required: ['type', 'id'],
        properties: {
          type: { type: 'string' },
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { type, id } = request.params as { type: string; id: string };
      return auditService.getEntityHistory(type, id);
    },
  });
}
