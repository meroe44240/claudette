import { FastifyInstance } from 'fastify';
import * as pipelineService from './pipeline.service.js';
import { authenticate } from '../../middleware/auth.js';
import type { StatutClient } from '@prisma/client';

export default async function pipelineRouter(fastify: FastifyInstance) {
  // GET / - Enhanced pipeline data with revenue and days-in-stage
  fastify.get('/', {
    schema: {
      description: 'Pipeline enrichi des clients avec revenus potentiels et jours en stage',
      tags: ['Pipeline'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      return pipelineService.getClientPipeline();
    },
  });

  // GET /stats - Pipeline statistics (conversion rates, avg time per stage, revenue)
  fastify.get('/stats', {
    schema: {
      description: 'Statistiques du pipeline client (taux de conversion, temps moyen, revenue par stage)',
      tags: ['Pipeline'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      return pipelineService.getPipelineStats();
    },
  });

  // PUT /move/:clientId - Move client to a new stage
  fastify.put('/move/:clientId', {
    schema: {
      description: 'Deplacer un client vers un nouveau stage du pipeline',
      tags: ['Pipeline'],
      params: {
        type: 'object',
        required: ['clientId'],
        properties: {
          clientId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        required: ['statutClient'],
        properties: {
          statutClient: {
            type: 'string',
            enum: [
              'LEAD',
              'PREMIER_CONTACT',
              'BESOIN_QUALIFIE',
              'PROPOSITION_ENVOYEE',
              'MANDAT_SIGNE',
              'RECURRENT',
              'INACTIF',
            ],
          },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { clientId } = request.params as { clientId: string };
      const { statutClient } = request.body as { statutClient: StatutClient };
      return pipelineService.moveClientStage(clientId, statutClient, request.userId);
    },
  });
}
