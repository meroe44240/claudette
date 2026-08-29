import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import * as service from './confirmation.service.js';

// ── Authentifié : /api/v1/confirmation ──
export default async function confirmationRouter(fastify: FastifyInstance) {
  fastify.post('/request/:candidatId', {
    schema: { tags: ['Confirmation'], params: { type: 'object', required: ['candidatId'], properties: { candidatId: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: async (request) => {
      const { candidatId } = request.params as { candidatId: string };
      return service.requestConfirmation(candidatId);
    },
  });
}

// ── Public (aucune auth) : /api/v1/public/confirmation ──
export async function confirmationPublicRouter(fastify: FastifyInstance) {
  fastify.get('/:token', {
    schema: { tags: ['Public'], params: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } } },
    handler: async (request) => {
      const { token } = request.params as { token: string };
      return service.getContext(token);
    },
  });
  fastify.post('/:token', {
    schema: { tags: ['Public'], params: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } } },
    handler: async (request) => {
      const { token } = request.params as { token: string };
      return service.confirm(token);
    },
  });
}
