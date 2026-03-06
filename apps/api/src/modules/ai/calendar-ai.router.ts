import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as calendarAiService from './calendar-ai.service.js';
import { authenticate } from '../../middleware/auth.js';

/** Convert AI errors to user-friendly 503 responses instead of generic 500 */
function handleAiError(err: any, reply: FastifyReply) {
  const msg = err.message || '';
  let message: string;
  if (msg.includes('overloaded') || msg.includes('529')) {
    message = 'Le service IA est temporairement surchargé. Réessayez dans quelques secondes.';
  } else if (msg.includes('429')) {
    message = 'Trop de requêtes IA. Réessayez dans quelques secondes.';
  } else if (msg.includes('Calendar non configurée') || msg.includes('Token')) {
    message = msg;
  } else if (msg.includes('Configuration IA non trouvée')) {
    message = msg;
  } else {
    message = `Erreur IA Calendar : ${msg.substring(0, 200)}`;
  }
  console.error('[CalendarAI Router] Error:', msg);
  const statusCode = err.statusCode || 503;
  reply.status(statusCode);
  return { error: 'CALENDAR_AI_ERROR', message };
}

const acceptSuggestionSchema = z.object({
  modifications: z
    .record(z.string(), z.any())
    .optional(),
});

export default async function calendarAiRouter(fastify: FastifyInstance) {
  // POST /analyze — Trigger calendar analysis
  fastify.post('/analyze', {
    schema: {
      description: 'Analyser les événements Google Calendar et suggérer des créations de candidats/clients/entreprises',
      tags: ['AI', 'Calendar'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      try {
        const result = await calendarAiService.analyzeCalendarEvents(request.userId);
        return {
          data: result.suggestions,
          analyzed: result.analyzed,
          count: result.suggestions.length,
          message: result.message,
        };
      } catch (err: any) {
        if (err.name === 'ZodError') throw err;
        return handleAiError(err, reply);
      }
    },
  });

  // GET /suggestions — Get pending suggestions
  fastify.get('/suggestions', {
    schema: {
      description: 'Obtenir les suggestions IA Calendar en attente',
      tags: ['AI', 'Calendar'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const suggestions = await calendarAiService.getSuggestions(request.userId);
      return { data: suggestions, count: suggestions.length };
    },
  });

  // PUT /suggestions/:id/accept — Accept a suggestion
  fastify.put('/suggestions/:id/accept', {
    schema: {
      description: 'Accepter une suggestion IA Calendar et créer l\'entité correspondante',
      tags: ['AI', 'Calendar'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = acceptSuggestionSchema.parse(request.body ?? {});
        const result = await calendarAiService.acceptSuggestion(
          id,
          request.userId,
          body.modifications,
        );
        return {
          success: true,
          data: result,
          message: `Suggestion acceptée. Entité créée avec l'id ${result.createdEntityId}.`,
        };
      } catch (err: any) {
        if (err.name === 'ZodError') throw err;
        if (err.name === 'NotFoundError' || err.name === 'AppError') throw err;
        return handleAiError(err, reply);
      }
    },
  });

  // PUT /suggestions/:id/dismiss — Dismiss a suggestion
  fastify.put('/suggestions/:id/dismiss', {
    schema: {
      description: 'Ignorer une suggestion IA Calendar',
      tags: ['AI', 'Calendar'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      await calendarAiService.dismissSuggestion(id, request.userId);
      return { success: true, message: 'Suggestion ignorée.' };
    },
  });
}
