import { FastifyInstance } from 'fastify';
import * as adminDashboardService from './admin-dashboard.service.js';
import { authenticate, requireRole } from '../../middleware/auth.js';

export default async function adminDashboardRouter(fastify: FastifyInstance) {
  // GET / - Full admin dashboard data (KPIs, team, forecast, comparisons)
  fastify.get('/', {
    schema: {
      description: 'Dashboard admin complet: KPIs globaux, stats equipe, forecast, comparaisons recruteurs',
      tags: ['Dashboard'],
    },
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: async (request, reply) => {
      return adminDashboardService.getAdminDashboard();
    },
  });
}
