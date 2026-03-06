import { FastifyInstance } from 'fastify';
import * as notificationService from './notification.service.js';
import { authenticate } from '../../middleware/auth.js';
import { parsePagination } from '../../lib/pagination.js';

export default async function notificationRouter(fastify: FastifyInstance) {
  // GET / - List user's notifications
  fastify.get('/', {
    schema: {
      description: 'Lister les notifications de l\'utilisateur connecte',
      tags: ['Notifications'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          perPage: { type: 'string' },
          lue: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const query = request.query as any;
      const params = parsePagination(query);

      let lue: boolean | undefined;
      if (query.lue === 'true') lue = true;
      if (query.lue === 'false') lue = false;

      return notificationService.list(request.userId, params, lue);
    },
  });

  // GET /unread-count - Get unread notification count
  fastify.get('/unread-count', {
    schema: {
      description: 'Obtenir le nombre de notifications non lues',
      tags: ['Notifications'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      return notificationService.getUnreadCount(request.userId);
    },
  });

  // PUT /read-all - Mark all notifications as read (MUST be registered BEFORE /:id/read)
  fastify.put('/read-all', {
    schema: {
      description: 'Marquer toutes les notifications comme lues',
      tags: ['Notifications'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      return notificationService.markAllAsRead(request.userId);
    },
  });

  // PUT /:id/read - Mark a single notification as read
  fastify.put('/:id/read', {
    schema: {
      description: 'Marquer une notification comme lue',
      tags: ['Notifications'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      return notificationService.markAsRead(id, request.userId);
    },
  });
}
