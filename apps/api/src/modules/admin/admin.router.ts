import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as adminService from './admin.service.js';
import { getAiUsageStats, isAiConfigured } from '../../services/claudeAI.js';
import { authenticate } from '../../middleware/auth.js';
import prisma from '../../lib/db.js';

// Admin middleware — only ADMIN users can access
async function requireAdmin(request: any, reply: any) {
  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    select: { role: true },
  });

  if (!user || user.role !== 'ADMIN') {
    reply.status(403);
    return reply.send({ error: 'Accès réservé aux administrateurs' });
  }
}

const compensationSchema = z.object({
  monthlySalary: z.number().nullable().optional(),
  variableRate: z.number().min(0).max(100).nullable().optional(),
  startDate: z.string().nullable().optional(),
});

export default async function adminRouter(fastify: FastifyInstance) {
  // GET /team-stats — Get team performance stats
  fastify.get('/team-stats', {
    schema: {
      description: 'Stats de performance par recruteur (admin uniquement)',
      tags: ['Admin'],
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['day', 'week', 'month', 'quarter', 'year'] },
          date: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const query = request.query as { period?: string; date?: string };
      const result = await adminService.getTeamStats(
        query.period ?? 'month',
        query.date,
      );
      return result;
    },
  });

  // GET /ai-usage — Get AI usage statistics (admin only)
  fastify.get('/ai-usage', {
    schema: {
      description: 'Statistiques d\'utilisation IA (admin uniquement)',
      tags: ['Admin'],
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['week', 'month', 'all'] },
        },
      },
    },
    preHandler: [authenticate, requireAdmin],
    handler: async (request, reply) => {
      const query = request.query as { period?: 'week' | 'month' | 'all' };
      const stats = await getAiUsageStats(query.period ?? 'month');
      return {
        data: stats,
        configured: isAiConfigured(),
      };
    },
  });

  // PUT /compensation/:userId — Update a user's compensation (admin only)
  fastify.put('/compensation/:userId', {
    schema: {
      description: 'Mettre à jour la rémunération d\'un membre (admin uniquement)',
      tags: ['Admin'],
      params: {
        type: 'object',
        required: ['userId'],
        properties: { userId: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate, requireAdmin],
    handler: async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const body = compensationSchema.parse(request.body);
      const result = await adminService.updateCompensation(userId, body);
      return { success: true, data: result };
    },
  });
}
