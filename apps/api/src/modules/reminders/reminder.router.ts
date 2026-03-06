import { FastifyInstance } from 'fastify';
import * as reminderService from './reminder.service.js';
import { authenticate } from '../../middleware/auth.js';
import { parsePagination } from '../../lib/pagination.js';

export default async function reminderRouter(fastify: FastifyInstance) {
  // GET / — List user's reminders
  fastify.get('/', {
    schema: {
      description: 'Lister les rappels de l\'utilisateur connecté',
      tags: ['Reminders'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          perPage: { type: 'string' },
          fired: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const query = request.query as Record<string, string | undefined>;
      const pagination = parsePagination(query as { page?: string; perPage?: string });

      let fired: boolean | undefined;
      if (query.fired === 'true') fired = true;
      if (query.fired === 'false') fired = false;

      return reminderService.getUserReminders(request.userId, pagination, fired);
    },
  });

  // POST / — Create a manual reminder
  fastify.post('/', {
    schema: {
      description: 'Créer un rappel manuel',
      tags: ['Reminders'],
      body: {
        type: 'object',
        required: ['titre', 'triggerAt'],
        properties: {
          type: { type: 'string', default: 'CUSTOM' },
          entityType: { type: 'string' },
          entityId: { type: 'string', format: 'uuid' },
          titre: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          triggerAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const body = request.body as {
        type?: string;
        entityType?: string;
        entityId?: string;
        titre: string;
        description?: string;
        triggerAt: string;
      };

      const reminder = await reminderService.createReminder({
        userId: request.userId,
        type: body.type || 'CUSTOM',
        entityType: body.entityType,
        entityId: body.entityId,
        titre: body.titre,
        description: body.description,
        triggerAt: new Date(body.triggerAt),
      });

      return reply.status(201).send(reminder);
    },
  });

  // PUT /:id — Update/dismiss a reminder
  fastify.put('/:id', {
    schema: {
      description: 'Mettre à jour ou clôturer un rappel',
      tags: ['Reminders'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        properties: {
          titre: { type: 'string' },
          description: { type: 'string' },
          triggerAt: { type: 'string', format: 'date-time' },
          fired: { type: 'boolean' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        titre?: string;
        description?: string;
        triggerAt?: string;
        fired?: boolean;
      };

      return reminderService.updateReminder(id, request.userId, {
        ...body,
        triggerAt: body.triggerAt ? new Date(body.triggerAt) : undefined,
      });
    },
  });

  // DELETE /:id — Delete a reminder
  fastify.delete('/:id', {
    schema: {
      description: 'Supprimer un rappel',
      tags: ['Reminders'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      await reminderService.deleteReminder(id, request.userId);
      return reply.status(204).send();
    },
  });

  // POST /generate — Trigger automatic reminder generation scan
  fastify.post('/generate', {
    schema: {
      description: 'Scanner et générer les rappels automatiques (mandats dormants, tâches en retard, relances clients)',
      tags: ['Reminders'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const result = await reminderService.generateAutoReminders(request.userId);
      return result;
    },
  });

  // POST /fire — Check and fire pending reminders (typically called by a cron job)
  fastify.post('/fire', {
    schema: {
      description: 'Vérifier et déclencher les rappels en attente',
      tags: ['Reminders'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const result = await reminderService.checkAndFireReminders();
      return result;
    },
  });
}
