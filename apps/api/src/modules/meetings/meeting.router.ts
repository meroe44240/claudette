import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import * as meetingService from './meeting.service.js';

const classerSchema = z.object({
  kind: z.enum(['RDV_CLIENT', 'PRESENTATION', 'INTERVIEW', 'AUTRE']),
  date: z.string().optional(),
  interlocuteurs: z.string().max(500).optional(),
  clientId: z.string().uuid().optional(),
  candidatureId: z.string().uuid().optional(),
});

export default async function meetingRouter(fastify: FastifyInstance) {
  // GET /a-classer - Meetings d'agenda en attente de classement (utilisateur courant)
  fastify.get('/a-classer', {
    schema: { description: "Meetings d'agenda à classer (RDV client / présentation)", tags: ['Meetings'] },
    preHandler: [authenticate],
    handler: async (request) => ({ data: await meetingService.listAClasser(request.userId) }),
  });

  // GET /candidatures?q= - Recherche de candidatures actives par nom de candidat
  fastify.get('/candidatures', {
    schema: { description: 'Rechercher une candidature active par nom de candidat', tags: ['Meetings'] },
    preHandler: [authenticate],
    handler: async (request) => {
      const { q } = request.query as { q?: string };
      return { data: await meetingService.searchCandidatures(q ?? '') };
    },
  });

  // GET /:id - Détail d'un meeting à classer + candidatures suggérées
  fastify.get('/:id', {
    schema: { description: "Détail d'un meeting à classer", tags: ['Meetings'] },
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return meetingService.getPourClassement(id, request.userId);
    },
  });

  // POST /:id/classer - Valider la nature du meeting (RDV client / présentation / autre)
  fastify.post('/:id/classer', {
    schema: { description: "Classer un meeting d'agenda", tags: ['Meetings'] },
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const input = classerSchema.parse(request.body);
      return meetingService.classer(id, request.userId, input);
    },
  });
}
