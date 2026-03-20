import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as adchaseService from './adchase.service.js';
import { authenticate } from '../../middleware/auth.js';

const createCampaignSchema = z.object({
  candidatId: z.string().uuid().optional().nullable(),
  anonymizedProfile: z.record(z.string(), z.unknown()).default({}),
  anonymizedCvUrl: z.string().optional(),
  emailSubject: z.string().min(1),
  emailBody: z.string().min(1),
  prospectClientIds: z.array(z.string().uuid()).min(1),
  sequenceId: z.string().uuid().optional(),
});

const updateCampaignSchema = z.object({
  anonymizedProfile: z.record(z.string(), z.unknown()).optional(),
  anonymizedCvUrl: z.string().optional(),
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
  sequenceId: z.string().uuid().optional(),
  scheduledAt: z.string().optional(),
});

export default async function adchaseRouter(fastify: FastifyInstance) {
  // POST / — Create campaign
  fastify.post('/', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = createCampaignSchema.parse(request.body);
      const result = await adchaseService.createCampaign({
        ...input,
        userId: request.userId,
      });
      reply.status(201);
      return result;
    },
  });

  // GET / — List campaigns
  fastify.get('/', {
    preHandler: [authenticate],
    handler: async (request) => {
      return adchaseService.getCampaigns(request.userId);
    },
  });

  // GET /:id — Campaign detail with prospects
  fastify.get('/:id', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return adchaseService.getCampaignById(id);
    },
  });

  // PUT /:id — Update draft
  fastify.put('/:id', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const input = updateCampaignSchema.parse(request.body);
      return adchaseService.updateCampaign(id, input);
    },
  });

  // POST /:id/launch — Launch campaign
  fastify.post('/:id/launch', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return adchaseService.launchCampaign(id, request.userId);
    },
  });

  // GET /candidat/:id/profile — Get candidat profile for anonymization
  fastify.get('/candidat/:id/profile', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return adchaseService.getCandidatForAdchase(id);
    },
  });
}
