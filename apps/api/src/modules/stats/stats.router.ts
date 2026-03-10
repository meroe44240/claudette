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

  // GET /placements - Placement follow-up tracking
  fastify.get('/placements', {
    schema: { description: 'Suivi des placements post-embauche', tags: ['Stats'] },
    preHandler: [authenticate],
    handler: async () => {
      const { getPlacementFollowUps } = await import('../placements/placement.service.js');
      return getPlacementFollowUps();
    },
  });

  // GET /revenue-forecast - Revenue forecasting
  fastify.get('/revenue-forecast', {
    schema: {
      description: 'Previsions de revenus',
      tags: ['Stats'],
      querystring: {
        type: 'object',
        properties: { months: { type: 'string' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const { getRevenueForecast } = await import('./revenue-forecast.service.js');
      const query = request.query as { months?: string };
      return getRevenueForecast(query.months ? parseInt(query.months) : 6);
    },
  });

  // GET /leaderboard - Team leaderboard
  fastify.get('/leaderboard', {
    schema: {
      description: 'Team leaderboard',
      tags: ['Stats'],
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['week', 'month', 'quarter', 'year'] },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const { period } = request.query as { period?: string };
      const { getLeaderboard } = await import('./leaderboard.service.js');
      return getLeaderboard((period as any) || 'month');
    },
  });
}
