import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import { authorize } from '../../middleware/authorize.js';
import prisma from '../../lib/db.js';

export default async function mcpLogsRouter(fastify: FastifyInstance) {
  // GET / — List MCP action logs (admin only, paginated with filters)
  fastify.get('/', {
    schema: {
      description: 'Lister les logs d\'actions MCP (admin uniquement)',
      tags: ['MCP Logs'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          limit: { type: 'string' },
          tool_name: { type: 'string' },
          user_id: { type: 'string' },
          success: { type: 'string' },
          level: { type: 'string', enum: ['free', 'confirm', 'blocked'] },
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
        },
      },
    },
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const query = request.query as Record<string, string | undefined>;

      const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10) || 50));
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = {};

      if (query.tool_name) {
        where.toolName = query.tool_name;
      }
      if (query.user_id) {
        where.userId = query.user_id;
      }
      if (query.success !== undefined) {
        where.success = query.success === 'true';
      }
      if (query.level) {
        where.level = query.level;
      }
      if (query.from || query.to) {
        where.createdAt = {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        };
      }

      const [data, total] = await Promise.all([
        prisma.mcpActionLog.findMany({
          where,
          include: {
            user: {
              select: { nom: true, prenom: true, email: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.mcpActionLog.count({ where }),
      ]);

      return {
        data,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      };
    },
  });

  // GET /stats — Aggregated stats over a date range
  fastify.get('/stats', {
    schema: {
      description: 'Statistiques agrégées des actions MCP',
      tags: ['MCP Logs'],
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
        },
      },
    },
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const query = request.query as Record<string, string | undefined>;

      const now = new Date();
      const from = query.from ? new Date(query.from) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const to = query.to ? new Date(query.to) : now;

      const where = {
        createdAt: { gte: from, lte: to },
      };

      const [totalCalls, successCount, errorCount, avgDuration, byTool, byUser, levelCounts] =
        await Promise.all([
          prisma.mcpActionLog.count({ where }),
          prisma.mcpActionLog.count({ where: { ...where, success: true } }),
          prisma.mcpActionLog.count({ where: { ...where, success: false } }),
          prisma.mcpActionLog.aggregate({
            where,
            _avg: { durationMs: true },
          }),
          prisma.mcpActionLog.groupBy({
            by: ['toolName'],
            where,
            _count: { _all: true },
            _avg: { durationMs: true },
            orderBy: { _count: { toolName: 'desc' } },
          }),
          prisma.mcpActionLog.groupBy({
            by: ['userId'],
            where,
            _count: { _all: true },
            orderBy: { _count: { userId: 'desc' } },
          }),
          prisma.mcpActionLog.groupBy({
            by: ['level'],
            where,
            _count: { _all: true },
          }),
        ]);

      // Fetch user names for by_user
      const userIds = byUser.map((u) => u.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, nom: true, prenom: true },
      });
      const userMap = new Map(users.map((u) => [u.id, `${u.prenom} ${u.nom}`]));

      // Build level breakdown
      const levelMap: Record<string, number> = { free: 0, confirm: 0, blocked: 0 };
      for (const entry of levelCounts) {
        levelMap[entry.level] = entry._count._all;
      }

      return {
        total_calls: totalCalls,
        success_count: successCount,
        error_count: errorCount,
        avg_duration_ms: Math.round(avgDuration._avg.durationMs ?? 0),
        by_tool: byTool.map((t) => ({
          tool: t.toolName,
          count: t._count._all,
          avg_ms: Math.round(t._avg.durationMs ?? 0),
        })),
        by_user: byUser.map((u) => ({
          user_id: u.userId,
          user_name: userMap.get(u.userId) ?? 'Inconnu',
          count: u._count._all,
        })),
        by_level: levelMap,
      };
    },
  });

  // GET /tools — List distinct tool names (for filter dropdown)
  fastify.get('/tools', {
    schema: {
      description: 'Liste des noms d\'outils MCP distincts',
      tags: ['MCP Logs'],
    },
    preHandler: [authenticate, authorize('ADMIN')],
    handler: async (request, reply) => {
      const result = await prisma.mcpActionLog.findMany({
        distinct: ['toolName'],
        select: { toolName: true },
        orderBy: { toolName: 'asc' },
      });

      return {
        tools: result.map((r) => r.toolName),
      };
    },
  });
}
