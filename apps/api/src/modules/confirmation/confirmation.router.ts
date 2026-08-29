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
// Le token (JWT ~125 car.) passe en query/body, pas dans le path : find-my-way
// plafonne les params de path à 100 car. (maxParamLength) → 404 silencieux sinon.
export async function confirmationPublicRouter(fastify: FastifyInstance) {
  fastify.get('/', {
    schema: { tags: ['Public'] },
    handler: async (request) => {
      const { token } = request.query as { token?: string };
      return service.getContext(String(token || ''));
    },
  });
  fastify.post('/', {
    schema: { tags: ['Public'] },
    handler: async (request) => {
      const { token } = (request.body ?? {}) as { token?: string };
      return service.confirm(String(token || ''));
    },
  });
}
