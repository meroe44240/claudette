import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import * as contractService from './contract.service.js';

export default async function contractRouter(fastify: FastifyInstance) {
  // POST /request-approval — demander validation admin (fee < 18%)
  fastify.post('/request-approval', {
    schema: {
      description: 'Demander une validation admin pour un fee sous le plancher 18%',
      tags: ['Contracts'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = z.object({
        mandatId: z.string().uuid(),
        feeRequested: z.number().min(0).max(100),
        reason: z.string().min(1).max(2000),
      }).parse(request.body);
      const result = await contractService.requestApproval(input, request.userId);
      reply.status(201);
      return result;
    },
  });

  // GET /pending — liste des demandes pending (admin only)
  fastify.get('/pending', {
    schema: {
      description: 'Liste des demandes de validation contract en attente (admin uniquement)',
      tags: ['Contracts'],
    },
    preHandler: [authenticate],
    handler: async (request) => {
      return contractService.listPending(request.userRole);
    },
  });

  // POST /:id/approve — approuver une demande (admin only)
  fastify.post('/:id/approve', {
    schema: {
      description: 'Approuver une demande de contrat (admin uniquement)',
      tags: ['Contracts'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return contractService.approve(id, request.userId, request.userRole);
    },
  });

  // POST /:id/reject — rejeter une demande (admin only)
  fastify.post('/:id/reject', {
    schema: {
      description: 'Rejeter une demande de contrat (admin uniquement)',
      tags: ['Contracts'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const input = z.object({ note: z.string().max(2000).optional() }).parse(request.body ?? {});
      return contractService.reject(id, request.userId, request.userRole, input.note);
    },
  });

  // POST /mandat/:mandatId/send — envoyer contrat pour signature (placeholder)
  fastify.post('/mandat/:mandatId/send', {
    schema: {
      description: 'Envoyer le contrat pour signature (placeholder — aucun provider branche)',
      tags: ['Contracts'],
      params: {
        type: 'object',
        required: ['mandatId'],
        properties: { mandatId: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const { mandatId } = request.params as { mandatId: string };
      const input = z.object({
        feePourcentage: z.number().min(0).max(100),
        paymentTerms: z.enum(['reception', '30j', '45j_fdm', '60j', 'signature']),
        applicableCountry: z.string().length(2),
      }).parse(request.body);
      return contractService.sendForSignature(mandatId, input, request.userId);
    },
  });
}
