import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as settingsService from './settings.service.js';
import { authenticate, requireRole } from '../../middleware/auth.js';

const createUserSchema = z.object({
  email: z.string().email(),
  nom: z.string().min(1),
  prenom: z.string().optional(),
  role: z.enum(['ADMIN', 'RECRUTEUR']),
  password: z.string().min(8),
});

const updateUserSchema = z.object({
  nom: z.string().min(1).optional(),
  prenom: z.string().optional(),
  role: z.enum(['ADMIN', 'RECRUTEUR']).optional(),
});

export default async function settingsRouter(fastify: FastifyInstance) {
  // GET /team - List team members (minimal info, any authenticated user)
  fastify.get('/team', {
    schema: {
      description: 'Lister les membres de l\'équipe (id, nom, prenom)',
      tags: ['Settings'],
    },
    preHandler: [authenticate],
    handler: async () => {
      return settingsService.listTeamMembers();
    },
  });

  // GET /users - List all users
  fastify.get('/users', {
    schema: {
      description: 'Lister tous les utilisateurs',
      tags: ['Settings'],
    },
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: async (request, reply) => {
      return settingsService.listUsers();
    },
  });

  // POST /users - Create a user
  fastify.post('/users', {
    schema: {
      description: 'Creer un utilisateur',
      tags: ['Settings'],
    },
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: async (request, reply) => {
      const input = createUserSchema.parse(request.body);
      const user = await settingsService.createUser(input);
      reply.status(201);
      return user;
    },
  });

  // PUT /users/:id - Update a user
  fastify.put('/users/:id', {
    schema: {
      description: 'Mettre a jour un utilisateur',
      tags: ['Settings'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = updateUserSchema.parse(request.body);
      return settingsService.updateUser(id, input);
    },
  });

  // DELETE /users/:id - Delete a user
  fastify.delete('/users/:id', {
    schema: {
      description: 'Supprimer un utilisateur',
      tags: ['Settings'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      return settingsService.deleteUser(id);
    },
  });
}
