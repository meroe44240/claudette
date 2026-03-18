import { FastifyInstance } from 'fastify';
import { createClientSchema, updateClientSchema } from './client.schema.js';
import * as clientService from './client.service.js';
import { checkClientOwnershipExpiry } from './client-ownership.service.js';
import * as activiteService from '../activites/activite.service.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { parsePagination } from '../../lib/pagination.js';

export default async function clientRouter(fastify: FastifyInstance) {
  // GET / - Liste paginee des clients
  fastify.get('/', {
    schema: {
      description: 'Lister les clients avec pagination, recherche et filtres',
      tags: ['Clients'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          perPage: { type: 'string' },
          search: { type: 'string' },
          entrepriseId: { type: 'string', format: 'uuid' },
          statutClient: { type: 'string', description: 'Single or comma-separated statut values' },
          sector: { type: 'string', description: 'Comma-separated sectors' },
          city: { type: 'string', description: 'Comma-separated cities' },
          role: { type: 'string', description: 'Comma-separated roles' },
          assignedToId: { type: 'string' },
          typeClient: { type: 'string', description: 'Single or comma-separated type values' },
          sortBy: { type: 'string', description: 'Field to sort by' },
          sortDir: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const query = request.query as {
        page?: string;
        perPage?: string;
        search?: string;
        entrepriseId?: string;
        statutClient?: string;
        sector?: string;
        city?: string;
        role?: string;
        assignedToId?: string;
        typeClient?: string;
        sortBy?: string;
        sortDir?: 'asc' | 'desc';
      };
      const pagination = parsePagination(query);
      const sectors = query.sector ? query.sector.split(',').map((s) => s.trim()) : undefined;
      const cities = query.city ? query.city.split(',').map((c) => c.trim()) : undefined;
      const roles = query.role ? query.role.split(',').map((r) => r.trim()) : undefined;

      // Non-admin: auto-filter by own userId
      let assignedToId: string | undefined;
      if (request.userRole !== 'ADMIN') {
        assignedToId = request.userId;
      } else if (query.assignedToId && query.assignedToId !== 'all') {
        assignedToId = query.assignedToId;
      }

      return clientService.list(
        pagination,
        query.search,
        query.entrepriseId,
        query.statutClient,
        sectors,
        cities,
        roles,
        assignedToId,
        query.typeClient,
        query.sortBy,
        query.sortDir,
      );
    },
  });

  // POST / - Creer un client
  fastify.post('/', {
    schema: {
      description: 'Creer un nouveau client (contact entreprise)',
      tags: ['Clients'],
      body: {
        type: 'object',
        required: ['nom', 'entrepriseId'],
        properties: {
          nom: { type: 'string' },
          prenom: { type: 'string' },
          email: { type: 'string', format: 'email' },
          telephone: { type: 'string' },
          poste: { type: 'string' },
          roleContact: {
            type: 'string',
            enum: ['HIRING_MANAGER', 'DRH', 'PROCUREMENT', 'CEO', 'AUTRE'],
          },
          linkedinUrl: { type: 'string' },
          entrepriseId: { type: 'string', format: 'uuid' },
          statutClient: {
            type: 'string',
            enum: [
              'LEAD',
              'PREMIER_CONTACT',
              'BESOIN_QUALIFIE',
              'PROPOSITION_ENVOYEE',
              'MANDAT_SIGNE',
              'RECURRENT',
              'INACTIF',
            ],
          },
          notes: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const data = createClientSchema.parse(request.body);
      const client = await clientService.create(data, request.userId);
      reply.status(201);
      return client;
    },
  });

  // GET /check-duplicate - Check for duplicate client by email
  fastify.get('/check-duplicate', {
    schema: {
      description: 'Verifier si un client avec cet email existe deja',
      tags: ['Clients'],
      querystring: {
        type: 'object',
        properties: {
          email: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { email } = request.query as { email?: string };
      if (!email) return { exists: false };
      return clientService.checkDuplicate(email);
    },
  });

  // GET /pipeline - Vue pipeline des clients par statut
  fastify.get('/pipeline', {
    schema: {
      description: 'Vue pipeline des clients groupes par statut',
      tags: ['Clients'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      return clientService.getPipeline();
    },
  });

  // GET /:id - Obtenir un client par id
  fastify.get('/:id', {
    schema: {
      description: 'Obtenir un client par son identifiant',
      tags: ['Clients'],
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
      return clientService.getById(id);
    },
  });

  // PUT /:id - Mettre a jour un client
  fastify.put('/:id', {
    schema: {
      description: 'Mettre a jour un client',
      tags: ['Clients'],
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
          prenom: { type: 'string' },
          email: { type: 'string', format: 'email' },
          telephone: { type: 'string' },
          poste: { type: 'string' },
          roleContact: {
            type: 'string',
            enum: ['HIRING_MANAGER', 'DRH', 'PROCUREMENT', 'CEO', 'AUTRE'],
          },
          linkedinUrl: { type: 'string' },
          entrepriseId: { type: 'string', format: 'uuid' },
          statutClient: {
            type: 'string',
            enum: [
              'LEAD',
              'PREMIER_CONTACT',
              'BESOIN_QUALIFIE',
              'PROPOSITION_ENVOYEE',
              'MANDAT_SIGNE',
              'RECURRENT',
              'INACTIF',
            ],
          },
          notes: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = updateClientSchema.parse(request.body);
      return clientService.update(id, data);
    },
  });

  // DELETE /:id - Supprimer un client (ADMIN only)
  fastify.delete('/:id', {
    schema: {
      description: 'Supprimer un client (ADMIN uniquement)',
      tags: ['Clients'],
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
      await clientService.remove(id);
      return { message: 'Client supprime' };
    },
  });

  // GET /:id/activites - Activites d'un client
  fastify.get('/:id/activites', {
    schema: {
      description: 'Lister les activites d\'un client',
      tags: ['Clients'],
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
      const query = request.query as any;
      const params = parsePagination(query);
      return activiteService.listByEntite('CLIENT', id, params);
    },
  });

  // PUT /:id/assign - Assigner/liberer un client (ownership)
  fastify.put('/:id/assign', {
    schema: {
      description: 'Assigner un recruteur a un client ou liberer l\'assignation',
      tags: ['Clients'],
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
          assignedToId: { type: 'string', format: 'uuid', nullable: true },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { assignedToId?: string | null };
      const assignedToId = body.assignedToId ?? null;
      return clientService.assignClient(id, assignedToId, request.userId, request.userRole);
    },
  });

  // POST /check-ownership-expiry - Verifier et traiter les expirations de prise en charge
  fastify.post('/check-ownership-expiry', {
    schema: {
      description: 'Verifier les clients dont la prise en charge expire (inactivite > 60 jours) et envoyer les avertissements (53 jours)',
      tags: ['Clients'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const result = await checkClientOwnershipExpiry();
      return result;
    },
  });
}
