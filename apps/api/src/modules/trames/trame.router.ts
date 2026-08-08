import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import * as service from './trame.service.js';

const questionSchema = z.object({ id: z.string(), text: z.string() });

export default async function trameRouter(fastify: FastifyInstance) {
  // Bibliothèque de trames (système + perso)
  fastify.get('/templates', { schema: { tags: ['Trames'] }, preHandler: [authenticate], handler: () => service.listTemplates() });

  fastify.post('/templates', {
    schema: { tags: ['Trames'] }, preHandler: [authenticate],
    handler: (request) => service.createTemplate(
      z.object({ name: z.string().min(1), description: z.string().optional(), category: z.string().optional(), questions: z.array(questionSchema) }).parse(request.body),
      request.userId,
    ),
  });

  // Trame d'un mandat (lecture)
  fastify.get('/mandat/:mandatId', {
    schema: { tags: ['Trames'], params: { type: 'object', required: ['mandatId'], properties: { mandatId: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: (request) => service.getMandatTrame((request.params as { mandatId: string }).mandatId),
  });

  // Réponses (trame remplie) d'une candidature
  fastify.get('/answers/:candidatureId', {
    schema: { tags: ['Trames'], params: { type: 'object', required: ['candidatureId'], properties: { candidatureId: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: (request) => service.getAnswers((request.params as { candidatureId: string }).candidatureId),
  });

  // Définir la trame d'un mandat
  fastify.put('/mandat/:mandatId', {
    schema: { tags: ['Trames'], params: { type: 'object', required: ['mandatId'], properties: { mandatId: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: (request) => service.setMandatTrame((request.params as { mandatId: string }).mandatId, z.object({ questions: z.array(questionSchema) }).parse(request.body).questions),
  });

  // Auto-remplissage IA d'une candidature depuis ses transcripts
  fastify.post('/fill/:candidatureId', {
    schema: { tags: ['Trames'], params: { type: 'object', required: ['candidatureId'], properties: { candidatureId: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: (request) => service.fillTrame((request.params as { candidatureId: string }).candidatureId, request.userId),
  });
}
