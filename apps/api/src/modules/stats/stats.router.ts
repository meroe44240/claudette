import { FastifyInstance } from 'fastify';
import * as statsService from './stats.service.js';
import { authenticate } from '../../middleware/auth.js';

export default async function statsRouter(fastify: FastifyInstance) {
  fastify.get('/', {
    schema: {
      description: 'Stats visuelles complètes',
      tags: ['Stats'],
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['week', 'month', 'quarter', 'year'] },
          userId: { type: 'string', format: 'uuid' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const query = request.query as { period?: string; userId?: string };
      const period = (query.period || 'month') as 'week' | 'month' | 'quarter' | 'year';
      const data = await statsService.getStatsData(request.userId, period, query.userId);
      return { data };
    },
  });
}
