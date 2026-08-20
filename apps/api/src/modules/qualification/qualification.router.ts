import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import * as service from './qualification.service.js';

export default async function qualificationRouter(fastify: FastifyInstance) {
  // Liste des champs du socle (labels/hints) — pour le front
  fastify.get('/fields', { schema: { tags: ['Qualification'] }, preHandler: [authenticate], handler: () => service.getFields() });

  // Carte de qualification d'un candidat (lecture)
  fastify.get('/candidat/:candidatId', {
    schema: { tags: ['Qualification'], params: { type: 'object', required: ['candidatId'], properties: { candidatId: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: (request) => service.getQualification((request.params as { candidatId: string }).candidatId),
  });

  // Édition manuelle (champs marqués « manuel », protégés de l'IA)
  fastify.put('/candidat/:candidatId', {
    schema: { tags: ['Qualification'], params: { type: 'object', required: ['candidatId'], properties: { candidatId: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: (request) => service.updateQualification(
      (request.params as { candidatId: string }).candidatId,
      z.record(z.string(), z.string().nullable()).parse(request.body),
    ),
  });

  // Auto-remplissage IA du socle depuis les transcripts du candidat
  fastify.post('/fill/:candidatId', {
    schema: { tags: ['Qualification'], params: { type: 'object', required: ['candidatId'], properties: { candidatId: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: (request) => service.fillFromTranscripts((request.params as { candidatId: string }).candidatId, request.userId),
  });

  // ── Fit par candidature ──
  fastify.get('/fit-fields', { schema: { tags: ['Qualification'] }, preHandler: [authenticate], handler: () => service.getFitFields() });

  fastify.get('/candidature/:candidatureId', {
    schema: { tags: ['Qualification'], params: { type: 'object', required: ['candidatureId'], properties: { candidatureId: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: (request) => service.getFit((request.params as { candidatureId: string }).candidatureId),
  });

  fastify.put('/candidature/:candidatureId', {
    schema: { tags: ['Qualification'], params: { type: 'object', required: ['candidatureId'], properties: { candidatureId: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: (request) => service.updateFit(
      (request.params as { candidatureId: string }).candidatureId,
      z.record(z.string(), z.string().nullable()).parse(request.body),
    ),
  });

  fastify.post('/fit-fill/:candidatureId', {
    schema: { tags: ['Qualification'], params: { type: 'object', required: ['candidatureId'], properties: { candidatureId: { type: 'string', format: 'uuid' } } } },
    preHandler: [authenticate],
    handler: (request) => service.fillFit((request.params as { candidatureId: string }).candidatureId, request.userId),
  });
}
