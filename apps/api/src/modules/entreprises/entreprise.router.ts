import { FastifyInstance } from 'fastify';
import { createEntrepriseSchema, updateEntrepriseSchema } from './entreprise.schema.js';
import * as entrepriseService from './entreprise.service.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { parsePagination } from '../../lib/pagination.js';

export default async function entrepriseRouter(fastify: FastifyInstance) {
  // GET / - Liste paginee des entreprises
  fastify.get('/', {
    schema: {
      description: 'Lister les entreprises avec pagination et recherche optionnelle',
      tags: ['Entreprises'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          perPage: { type: 'string' },
          search: { type: 'string' },
          secteur: { type: 'string', description: 'Comma-separated sectors' },
          localisation: { type: 'string', description: 'Comma-separated cities' },
          taille: { type: 'string', enum: ['STARTUP', 'PME', 'ETI', 'GRAND_GROUPE'] },
          enriched: { type: 'string', enum: ['true', 'false'], description: 'Filter by Pappers enrichment status' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const query = request.query as {
        page?: string;
        perPage?: string;
        search?: string;
        secteur?: string;
        localisation?: string;
        taille?: string;
        enriched?: string;
      };
      const pagination = parsePagination(query);
      const sectors = query.secteur ? query.secteur.split(',').map((s) => s.trim()) : undefined;
      const cities = query.localisation ? query.localisation.split(',').map((c) => c.trim()) : undefined;
      const enriched = query.enriched === 'true' ? true : query.enriched === 'false' ? false : undefined;

      return entrepriseService.list(pagination, query.search, sectors, cities, query.taille, enriched);
    },
  });

  // POST / - Creer une entreprise
  fastify.post('/', {
    schema: {
      description: 'Creer une nouvelle entreprise',
      tags: ['Entreprises'],
      body: {
        type: 'object',
        required: ['nom'],
        properties: {
          nom: { type: 'string' },
          secteur: { type: 'string' },
          siteWeb: { type: 'string' },
          taille: { type: 'string', enum: ['STARTUP', 'PME', 'ETI', 'GRAND_GROUPE'] },
          localisation: { type: 'string' },
          linkedinUrl: { type: 'string' },
          logoUrl: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const data = createEntrepriseSchema.parse(request.body);
      const entreprise = await entrepriseService.create(data, request.userId);
      reply.status(201);
      return entreprise;
    },
  });

  // GET /check-duplicate - Check for duplicate entreprise by nom
  fastify.get('/check-duplicate', {
    schema: {
      description: 'Verifier si une entreprise avec ce nom existe deja',
      tags: ['Entreprises'],
      querystring: {
        type: 'object',
        properties: {
          nom: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { nom } = request.query as { nom?: string };
      if (!nom) return { exists: false };
      return entrepriseService.checkDuplicate(nom);
    },
  });

  // GET /stats/pappers - Statistiques d'enrichissement Pappers
  fastify.get('/stats/pappers', {
    schema: {
      description: 'Obtenir les statistiques d\'enrichissement Pappers des entreprises',
      tags: ['Entreprises'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      return entrepriseService.getPappersStats();
    },
  });

  // GET /:id - Obtenir une entreprise par id
  fastify.get('/:id', {
    schema: {
      description: 'Obtenir une entreprise par son identifiant',
      tags: ['Entreprises'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      return entrepriseService.getById(id);
    },
  });

  // PUT /:id - Mettre a jour une entreprise
  fastify.put('/:id', {
    schema: {
      description: 'Mettre a jour une entreprise',
      tags: ['Entreprises'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        properties: {
          nom: { type: 'string' },
          secteur: { type: 'string' },
          siteWeb: { type: 'string' },
          taille: { type: 'string', enum: ['STARTUP', 'PME', 'ETI', 'GRAND_GROUPE'] },
          localisation: { type: 'string' },
          linkedinUrl: { type: 'string' },
          logoUrl: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = updateEntrepriseSchema.parse(request.body);
      return entrepriseService.update(id, data);
    },
  });

  // DELETE /:id - Supprimer une entreprise (ADMIN only)
  fastify.delete('/:id', {
    schema: {
      description: 'Supprimer une entreprise (ADMIN uniquement)',
      tags: ['Entreprises'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      await entrepriseService.remove(id);
      return { message: 'Entreprise supprimee' };
    },
  });

  // POST /backfill-logos - Remplir les logos manquants (one-shot)
  fastify.post('/backfill-logos', {
    schema: {
      description: 'Backfill logos pour les entreprises ayant un siteWeb mais pas de logoUrl',
      tags: ['Entreprises'],
    },
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: async (request, reply) => {
      const count = await entrepriseService.backfillLogos();
      return { message: `${count} logos mis a jour` };
    },
  });

  // GET /:id/stats - Statistiques d'une entreprise
  fastify.get('/:id/stats', {
    schema: {
      description: 'Obtenir les statistiques de revenue d\'une entreprise',
      tags: ['Entreprises'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      return entrepriseService.getStats(id);
    },
  });
}
