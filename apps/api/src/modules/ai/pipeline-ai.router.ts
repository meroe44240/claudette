import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as pipelineAiService from './pipeline-ai.service.js';
import { authenticate } from '../../middleware/auth.js';

/** Convert AI errors to user-friendly responses */
function handleAiError(err: any, reply: FastifyReply) {
  const msg = err.message || '';
  let message: string;
  if (msg.includes('overloaded') || msg.includes('529')) {
    message = 'Le service IA est temporairement surcharge. Reessayez dans quelques secondes.';
  } else if (msg.includes('429')) {
    message = 'Trop de requetes IA. Reessayez dans quelques secondes.';
  } else if (msg.includes('Configuration IA non trouvee')) {
    message = msg;
  } else {
    message = `Erreur IA Pipeline : ${msg.substring(0, 200)}`;
  }
  console.error('[PipelineAI Router] Error:', msg);
  const statusCode = err.statusCode || 503;
  reply.status(statusCode);
  return { error: 'PIPELINE_AI_ERROR', message };
}

const applySuggestionSchema = z.object({
  stage: z.string().optional(),
});

export default async function pipelineAiRouter(fastify: FastifyInstance) {
  // POST /analyze — Trigger pipeline analysis
  fastify.post('/analyze', {
    schema: {
      description: 'Analyser les candidatures actives et suggerer des mouvements pipeline',
      tags: ['AI', 'Pipeline'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      try {
        const result = await pipelineAiService.analyzePipelineMoves(request.userId);
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

  // GET /suggestions — Get pending pipeline suggestions
  fastify.get('/suggestions', {
    schema: {
      description: 'Obtenir les suggestions de mouvements pipeline en attente',
      tags: ['AI', 'Pipeline'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const suggestions = await pipelineAiService.getSuggestions(request.userId);
      return { data: suggestions, count: suggestions.length };
    },
  });

  // PUT /suggestions/:id/apply — Apply a suggestion
  fastify.put('/suggestions/:id/apply', {
    schema: {
      description: 'Appliquer une suggestion de mouvement pipeline',
      tags: ['AI', 'Pipeline'],
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
        const body = applySuggestionSchema.parse(request.body ?? {});
        const result = await pipelineAiService.applySuggestion(
          id,
          request.userId,
          body.stage,
        );
        return {
          success: true,
          data: result,
          message: `Suggestion appliquee. Candidature deplacee vers ${result.appliedStage}.`,
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
      description: 'Ignorer une suggestion de mouvement pipeline',
      tags: ['AI', 'Pipeline'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      await pipelineAiService.dismissSuggestion(id, request.userId);
      return { success: true, message: 'Suggestion ignoree.' };
    },
  });
}
