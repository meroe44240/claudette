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
    portal?: portalService.PortalScope;
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
    // Accès révoqué depuis l'émission du jeton : on coupe.
    const scope = await portalService.resolveScope(payload);
    if (!scope) {
      reply.code(401).send({ error: 'PORTAL_UNAUTHORIZED', message: 'Accès révoqué' });
      return reply;
    }
    request.portal = scope;
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
      description: 'Login portail client (email + mot de passe ; offre du lien facultative)',
      tags: ['Portal'],
    },
    handler: async (request, reply) => {
      const input = z.object({
        mandatId: z.string().uuid().optional(),
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

  // GET /portal/public/mandat/:id — contexte de la page de connexion (poste, consultant)
  fastify.get('/public/mandat/:id', {
    schema: {
      description: 'Infos publiques du lien portail (titre du poste, entreprise, consultant)',
      tags: ['Portal'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return portalService.publicMandatInfo(id);
    },
  });

  // POST /portal/password-reset — mot de passe oublié (réponse identique dans tous les cas)
  fastify.post('/password-reset', {
    schema: { description: 'Envoie un nouveau mot de passe à l’adresse de l’accès', tags: ['Portal'] },
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    handler: async (request) => {
      const input = z.object({ mandatId: z.string().uuid().optional(), email: z.string().email() }).parse(request.body);
      try { await portalService.resetPassword(input.mandatId, input.email); } catch (e) { request.log.error(e, '[Portal] reset password'); }
      return { ok: true };
    },
  });

  // GET /portal/kanban — kanban filtré par visibleStages
  fastify.get('/kanban', {
    schema: { description: 'Kanban en lecture (colonnes = mandat.visibleStages)', tags: ['Portal'] },
    preHandler: [portalAuthenticate],
    handler: async (request) => {
      const { mandatId } = request.query as { mandatId?: string };
      const id = mandatId && /^[0-9a-f-]{36}$/i.test(mandatId) ? mandatId : request.portal!.mandatId;
      await portalService.assertMandat(request.portal!, id);
      return portalService.getKanban(id, request.portal!.portalAccessId);
    },
  });

  // GET /portal/me — contact connecté + entreprise
  fastify.get('/me', {
    schema: { description: 'Contact connecté', tags: ['Portal'] },
    preHandler: [portalAuthenticate],
    handler: async (request) => portalService.getMe(request.portal!),
  });

  // GET /portal/offres — toutes les offres de l'entreprise suivies par HumanUp
  fastify.get('/offres', {
    schema: { description: 'Offres d’emploi du client (compteurs par colonne)', tags: ['Portal'] },
    preHandler: [portalAuthenticate],
    handler: async (request) => portalService.listOffres(request.portal!),
  });

  // GET /portal/candidats — tous les candidats présentés, toutes offres confondues
  fastify.get('/candidats', {
    schema: { description: 'Candidats présentés au client (toutes offres)', tags: ['Portal'] },
    preHandler: [portalAuthenticate],
    handler: async (request) => portalService.listCandidats(request.portal!),
  });

  // GET /portal/notifications — cloche
  fastify.get('/notifications', {
    schema: { description: 'Notifications du client (nouveaux profils, étapes, commentaires)', tags: ['Portal'] },
    preHandler: [portalAuthenticate],
    handler: async (request) => portalService.listNotifications(request.portal!),
  });

  // POST /portal/notifications/seen — tout marquer comme lu
  fastify.post('/notifications/seen', {
    schema: { description: 'Marque les notifications comme lues', tags: ['Portal'] },
    preHandler: [portalAuthenticate],
    handler: async (request) => portalService.markNotificationsSeen(request.portal!),
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
        mandatId: await portalService.scopeCandidature(request.portal!, id),
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
      const input = z.object({
        content: z.string().min(1).max(4000),
        mentions: z.array(z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('internal'), id: z.string().uuid() }),
          z.object({ kind: z.literal('external'), email: z.string().email(), name: z.string().max(200).optional() }),
        ])).max(10).optional(),
      }).parse(request.body);
      return portalService.recordComment({
        portalAccessId: request.portal!.portalAccessId,
        mandatId: await portalService.scopeCandidature(request.portal!, id),
        candidatureId: id,
        content: input.content,
        mentions: input.mentions,
      });
    },
  });

  // GET /portal/candidatures/:id/comments — fil de commentaires du candidat
  fastify.get('/candidatures/:id/comments', {
    schema: {
      description: 'Fil de commentaires client sur un candidat',
      tags: ['Portal'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [portalAuthenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return portalService.listComments(await portalService.scopeCandidature(request.portal!, id), id);
    },
  });

  // GET /portal/candidatures/:id/activity — fil d'activité du candidat
  fastify.get('/candidatures/:id/activity', {
    schema: {
      description: 'Fil d\'activité (présentation, mouvements, avis, commentaires, entretien)',
      tags: ['Portal'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [portalAuthenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return portalService.listActivity(await portalService.scopeCandidature(request.portal!, id), id);
    },
  });

  // GET /portal/mentionables — personnes que le client peut mentionner (@)
  fastify.get('/mentionables', {
    schema: { description: 'Équipe HumanUp du mandat + contacts côté client', tags: ['Portal'] },
    preHandler: [portalAuthenticate],
    handler: async (request) => {
      const { mandatId } = request.query as { mandatId?: string };
      const id = mandatId && /^[0-9a-f-]{36}$/i.test(mandatId) ? mandatId : request.portal!.mandatId;
      await portalService.assertMandat(request.portal!, id);
      const { internal, external } = await portalService.getMentionables(id);
      // Pas d'emails de l'équipe HumanUp exposés au client.
      return { internal: internal.map(({ id, name, role, avatarUrl }) => ({ id, name, role, avatarUrl })), external };
    },
  });

  // POST /portal/candidatures/:id/move — le client déplace une carte
  fastify.post('/candidatures/:id/move', {
    schema: {
      description: 'Déplacement d\'une carte par le client (Engagé = signalé au consultant)',
      tags: ['Portal'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [portalAuthenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const input = z.object({
        column: z.enum(portalService.PORTAL_COLUMNS),
        reason: z.string().max(2000).optional(),
        dateEntretienClient: z.string().datetime({ offset: true }).optional(),
        interlocuteurClient: z.string().max(255).optional(),
      }).parse(request.body);
      return portalService.moveCandidature({
        portalAccessId: request.portal!.portalAccessId,
        mandatId: await portalService.scopeCandidature(request.portal!, id),
        candidatureId: id,
        ...input,
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
        mandatId: await portalService.scopeCandidature(request.portal!, id),
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
        sendInvite: z.boolean().optional(),
        contactName: z.string().optional(),
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
