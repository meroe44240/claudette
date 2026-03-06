import { FastifyInstance } from 'fastify';
import * as dashboardService from './dashboard.service.js';
import { authenticate } from '../../middleware/auth.js';

export default async function dashboardRouter(fastify: FastifyInstance) {
  // GET /activite - Activity stats
  fastify.get('/activite', {
    schema: {
      description: 'Statistiques d\'activite (appels, emails, meetings, presentations, offres)',
      tags: ['Dashboard'],
      querystring: {
        type: 'object',
        properties: {
          dateFrom: { type: 'string', format: 'date' },
          dateTo: { type: 'string', format: 'date' },
          userId: { type: 'string', format: 'uuid' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const query = request.query as { dateFrom?: string; dateTo?: string; userId?: string };

      const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
      const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;

      return dashboardService.getActiviteStats(dateFrom, dateTo, query.userId);
    },
  });

  // GET /pipeline - Pipeline stats
  fastify.get('/pipeline', {
    schema: {
      description: 'Statistiques du pipeline de recrutement',
      tags: ['Dashboard'],
      querystring: {
        type: 'object',
        properties: {
          userId: { type: 'string', format: 'uuid' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const query = request.query as { userId?: string };
      return dashboardService.getPipelineStats(query.userId);
    },
  });

  // GET /revenue - Revenue stats
  fastify.get('/revenue', {
    schema: {
      description: 'Statistiques de revenus (fees estimes, factures, encaisses)',
      tags: ['Dashboard'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      return dashboardService.getRevenueStats();
    },
  });

  // GET /cockpit - Aggregated dashboard data in a single call
  fastify.get('/cockpit', {
    schema: {
      description: 'Dashboard cockpit — KPIs, pipeline, emails, focus du jour, revenue history',
      tags: ['Dashboard'],
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['today', 'week', 'month'] },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const query = request.query as { period?: 'today' | 'week' | 'month' };
      return dashboardService.getCockpitData(request.userId, query.period ?? 'week');
    },
  });

  // GET /spa - SPA 360 single-call dashboard data
  fastify.get('/spa', {
    schema: {
      description: 'SPA 360 dashboard — all data in one call (bandeau, KPIs, mandats, taches, emails, activity, calendar)',
      tags: ['Dashboard'],
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['today', 'week', 'month'] },
          team: { type: 'string', enum: ['true', 'false'] },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const query = request.query as { period?: 'today' | 'week' | 'month'; team?: string };
      const isTeam = query.team === 'true';
      return dashboardService.getSpaData(request.userId, query.period ?? 'week', isTeam);
    },
  });

  // GET /recruteur - Personal stats for connected user
  fastify.get('/recruteur', {
    schema: {
      description: 'Statistiques personnelles du recruteur connecte',
      tags: ['Dashboard'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      return dashboardService.getRecruteurStats(request.userId);
    },
  });
}
