import { FastifyInstance } from 'fastify';
import { createMandatSchema, updateMandatSchema, updateFeeSchema } from './mandat.schema.js';
import * as mandatService from './mandat.service.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { parsePagination } from '../../lib/pagination.js';

export default async function mandatRouter(fastify: FastifyInstance) {
  // GET / - List mandats with filters
  fastify.get('/', {
    schema: {
      description: 'Lister les mandats avec filtres et pagination',
      tags: ['Mandats'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          perPage: { type: 'string' },
          search: { type: 'string' },
          statut: { type: 'string' },
          priorite: { type: 'string' },
          entrepriseId: { type: 'string' },
          userId: { type: 'string' },
          assignedToId: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const query = request.query as any;
      const params = parsePagination(query);

      // ── Perimetre par role (impose cote API, pas seulement en UI) ──
      // Un mandat a deux proprietaires : le SALES (commercial) et le RECRUTEUR.
      //  • Non-admin : voit UNIQUEMENT ses mandats (salesId=moi OU recruteurId=moi).
      //    Demander les mandats d'un autre => 403 (le masquage visuel ne suffit pas).
      //  • Admin : voit tout, ou filtre par personne (userId) => OU sur les 2 colonnes.
      //  • scope=all : bypass d'isolation pour les usages transverses (dropdown "ajouter au mandat").
      const isAdmin = request.userRole === 'ADMIN';
      const wanted = query.userId ?? query.assignedToId; // 'userId' (pack) ou legacy 'assignedToId'
      let userInvolvedId: string | undefined;
      if (query.scope === 'all') {
        // No isolation
      } else if (!isAdmin) {
        if (wanted && wanted !== 'all' && wanted !== request.userId) {
          return reply.code(403).send({
            error: 'FORBIDDEN',
            message: 'Vous ne pouvez consulter que vos propres mandats.',
          });
        }
        userInvolvedId = request.userId;
      } else if (wanted && wanted !== 'all') {
        userInvolvedId = wanted;
      }

      return mandatService.list(
        params,
        query.search,
        query.statut,
        query.priorite,
        query.entrepriseId,
        undefined,
        userInvolvedId,
      );
    },
  });

  // GET /mine - Les mandats du user courant, split en ouverts vs fermes
  fastify.get('/mine', {
    schema: {
      description: 'Lister mes mandats (ceux ou je suis assignedTo, sourceur, sales ou recruteur)',
      tags: ['Mandats'],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['open', 'closed'] },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const { status } = request.query as { status?: 'open' | 'closed' };
      const scope = status === 'closed' ? 'closed' : 'open';
      return mandatService.listMine(request.userId, scope);
    },
  });

  // POST / - Create mandat
  fastify.post('/', {
    schema: {
      description: 'Creer un mandat',
      tags: ['Mandats'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = createMandatSchema.parse(request.body);
      const mandat = await mandatService.create(input, request.userId);
      reply.status(201);
      return mandat;
    },
  });

  // GET /:id - Get mandat by id
  fastify.get('/:id', {
    schema: {
      description: 'Recuperer un mandat par son ID',
      tags: ['Mandats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      return mandatService.getById(id);
    },
  });

  // PUT /:id - Update mandat
  fastify.put('/:id', {
    schema: {
      description: 'Mettre a jour un mandat',
      tags: ['Mandats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = updateMandatSchema.parse(request.body);
      return mandatService.update(id, input);
    },
  });

  // DELETE /:id - Delete mandat (admin only)
  fastify.delete('/:id', {
    schema: {
      description: 'Supprimer un mandat',
      tags: ['Mandats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      await mandatService.remove(id);
      return { message: 'Mandat supprime' };
    },
  });

  // POST /:id/clone - Clone mandat
  fastify.post('/:id/clone', {
    schema: {
      description: 'Dupliquer un mandat',
      tags: ['Mandats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const mandat = await mandatService.clone(id);
      reply.status(201);
      return mandat;
    },
  });

  // GET /:id/timeline - Full chronological history of the mandat
  fastify.get('/:id/timeline', {
    schema: {
      description: 'Historique complet du mandat : transitions de stage, candidatures, activites lies au mandat et aux candidats',
      tags: ['Mandats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return mandatService.getTimeline(id);
    },
  });

  // GET /:id/kanban - Get candidatures grouped by stage
  fastify.get('/:id/kanban', {
    schema: {
      description: 'Recuperer les candidatures du mandat groupees par stage (vue Kanban)',
      tags: ['Mandats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      return mandatService.getKanban(id);
    },
  });

  // PUT /:id/fee - Update fee information
  fastify.put('/:id/fee', {
    schema: {
      description: 'Mettre a jour les informations de facturation du mandat',
      tags: ['Mandats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = updateFeeSchema.parse(request.body);
      return mandatService.updateFee(id, input);
    },
  });
}
