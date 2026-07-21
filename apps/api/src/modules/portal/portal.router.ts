/**
 * Portail client — router HTTP.
 *
 * Deux blocs :
 * 1. Endpoints publics (préfixe `/api/v1/portal`) — utilisés par les
 *    pages `/portail/*` : login, kanban, decision, comment.
 * 2. Endpoints internes admin (aussi `/api/v1/portal`) qui gèrent la
 *    création/révocation des accès, protégés par le middleware
 *    `authenticate` interne.
 *
 * L'auth portail utilise un JWT séparé (`type=portal`) signé avec la
 * même clé mais audience différente. Vérifié par `portalAuthenticate`.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as portalService from './portal.service.js';
import { authenticate, requireRole } from '../../middleware/auth.js';

// Extend request to carry portalAccess payload
declare module 'fastify' {
  interface FastifyRequest {
    portal?: {
      portalAccessId: string;
      mandatId: string;
      clientId: string;
      email: string;
    };
  }
}

async function portalAuthenticate(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'PORTAL_UNAUTHORIZED', message: 'Token manquant' });
    return reply;
  }
  const token = auth.slice(7);
  try {
    const payload = await portalService.verifyPortalToken(token);
    request.portal = {
      portalAccessId: payload.sub,
      mandatId: payload.mandatId,
      clientId: payload.clientId,
      email: payload.email,
    };
  } catch {
    reply.code(401).send({ error: 'PORTAL_UNAUTHORIZED', message: 'Token invalide' });
    return reply;
  }
}

export default async function portalRouter(fastify: FastifyInstance) {
  // ── Public portal endpoints ────────────────────────

  // POST /portal/login — auth portail
  fastify.post('/login', {
    schema: {
      description: 'Login portail client (public — auth par mandatId + email + password)',
      tags: ['Portal'],
    },
    handler: async (request, reply) => {
      const input = z.object({
        mandatId: z.string().uuid(),
        email: z.string().email(),
        password: z.string().min(1),
      }).parse(request.body);
      try {
        return await portalService.login(input.email, input.password, input.mandatId);
      } catch (err: any) {
        reply.code(401).send({ error: 'PORTAL_LOGIN_FAILED', message: err.message });
      }
    },
  });

  // GET /portal/kanban — kanban filtré par visibleStages
  fastify.get('/kanban', {
    schema: { description: 'Kanban en lecture (colonnes = mandat.visibleStages)', tags: ['Portal'] },
    preHandler: [portalAuthenticate],
    handler: async (request) => {
      return portalService.getKanban(request.portal!.mandatId);
    },
  });

  // POST /portal/candidatures/:id/decision
  fastify.post('/candidatures/:id/decision', {
    schema: {
      description: 'Décision client (RENCONTRER, A_DISCUTER, ECARTER) avec raison',
      tags: ['Portal'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [portalAuthenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const input = z.object({
        decision: z.enum(['RENCONTRER', 'A_DISCUTER', 'ECARTER']),
        reason: z.string().max(2000).optional(),
      }).parse(request.body);
      return portalService.recordDecision({
        portalAccessId: request.portal!.portalAccessId,
        mandatId: request.portal!.mandatId,
        candidatureId: id,
        decision: input.decision,
        reason: input.reason,
      });
    },
  });

  // POST /portal/candidatures/:id/comment
  fastify.post('/candidatures/:id/comment', {
    schema: {
      description: 'Commentaire client sur un candidat',
      tags: ['Portal'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [portalAuthenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const input = z.object({ content: z.string().min(1).max(4000) }).parse(request.body);
      return portalService.recordComment({
        portalAccessId: request.portal!.portalAccessId,
        mandatId: request.portal!.mandatId,
        candidatureId: id,
        content: input.content,
      });
    },
  });

  // POST /portal/candidatures/:id/view — log un VIEW_PROFILE
  fastify.post('/candidatures/:id/view', {
    schema: {
      description: 'Log lecture profil (analytics)',
      tags: ['Portal'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [portalAuthenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return portalService.recordViewProfile({
        portalAccessId: request.portal!.portalAccessId,
        mandatId: request.portal!.mandatId,
        candidatureId: id,
      });
    },
  });

  // ── Internal admin endpoints ───────────────────────

  // GET /portal/mandat/:mandatId/accesses — lister les accès pour un mandat
  fastify.get('/mandat/:mandatId/accesses', {
    schema: {
      description: 'Lister les accès portail pour un mandat (interne)',
      tags: ['Portal'],
      params: { type: 'object', required: ['mandatId'], properties: { mandatId: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const { mandatId } = request.params as { mandatId: string };
      return portalService.listAccessesForMandat(mandatId);
    },
  });

  // POST /portal/access — créer un accès portail (interne)
  fastify.post('/access', {
    schema: {
      description: 'Créer un accès portail (interne)',
      tags: ['Portal'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = z.object({
        mandatId: z.string().uuid(),
        clientId: z.string().uuid(),
        email: z.string().email(),
        password: z.string().min(6),
      }).parse(request.body);
      const created = await portalService.createAccess(input);
      reply.code(201);
      return created;
    },
  });

  // POST /portal/access/:id/revoke — révoquer (interne, admin)
  fastify.post('/access/:id/revoke', {
    schema: {
      description: 'Révoquer un accès portail (admin only)',
      tags: ['Portal'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return portalService.revokeAccess(id);
    },
  });

  // GET /portal/mandat/:mandatId/events — les portal events récents (interne)
  fastify.get('/mandat/:mandatId/events', {
    schema: {
      description: 'Portal events récents pour un mandat (alimente le widget "Activité client")',
      tags: ['Portal'],
      params: { type: 'object', required: ['mandatId'], properties: { mandatId: { type: 'string', format: 'uuid' } } },
      querystring: { type: 'object', properties: { limit: { type: 'number' } } },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const { mandatId } = request.params as { mandatId: string };
      const { limit } = request.query as { limit?: number };
      return portalService.listRecentEventsForMandat(mandatId, Math.min(limit ?? 20, 100));
    },
  });
}
