import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import { globalSearch } from './search.service.js';

export default async function searchRouter(fastify: FastifyInstance) {
  fastify.get('/', {
    schema: { description: 'Recherche globale', tags: ['Recherche'] },
    preHandler: [authenticate],
    handler: async (request) => {
      const { q } = request.query as { q?: string };
      return globalSearch(q || '');
    },
  });
}
