import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import * as sourcingService from './sourcing.service.js';

export default async function sourcingRouter(fastify: FastifyInstance) {
  // GET /market-lists — liste
  fastify.get('/market-lists', {
    schema: { description: 'Liste des market-lists (List Push)', tags: ['Sourcing'] },
    preHandler: [authenticate],
    handler: async () => sourcingService.listLists(),
  });

  // POST /market-lists — create
  fastify.post('/market-lists', {
    schema: { description: 'Créer une market-list', tags: ['Sourcing'] },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = z.object({
        name: z.string().min(1),
        sectorTags: z.array(z.string()).optional(),
        zones: z.array(z.string()).optional(),
        excludedCompanies: z.array(z.string()).optional(),
      }).parse(request.body);
      const list = await sourcingService.createList(input, request.userId);
      reply.code(201);
      return list;
    },
  });

  // GET /market-lists/:id — detail + establishments
  fastify.get('/market-lists/:id', {
    schema: {
      description: 'Détail d\'une market-list + ses établissements',
      tags: ['Sourcing'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [authenticate],
    handler: async (request) => sourcingService.getList((request.params as { id: string }).id),
  });

  // PUT /market-lists/establishments/:id — update statut
  fastify.put('/market-lists/establishments/:id', {
    schema: {
      description: 'Mettre à jour le statut d\'un établissement',
      tags: ['Sourcing'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const input = z.object({
        status: z.enum(['NEW', 'EXCLUDED', 'PROSPECTION', 'CLIENT_EXISTING']),
      }).parse(request.body);
      return sourcingService.updateEstablishmentStatus(id, input.status);
    },
  });

  // POST /market-lists/:id/ingest-cv — upload un CV, parse, alimente les establishments
  fastify.post('/market-lists/:id/ingest-cv', {
    schema: {
      description: 'Ingest un CV (multipart) : parse + alimente établissements',
      tags: ['Sourcing'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = await request.file();
      if (!data) {
        reply.code(400);
        return { error: 'FILE_REQUIRED', message: 'Un fichier CV est requis' };
      }
      const buffer = await data.toBuffer();
      const filename = data.filename || 'cv.pdf';
      return sourcingService.ingestCvIntoList(id, buffer, filename, request.userId);
    },
  });

  // POST /market-lists/:id/generate-prospection — bulk-create Entreprise + Client(LEAD)
  fastify.post('/market-lists/:id/generate-prospection', {
    schema: {
      description: 'Générer les leads de prospection depuis les establishments non exclus',
      tags: ['Sourcing'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return sourcingService.generateProspectionLeads(id, request.userId);
    },
  });
}
