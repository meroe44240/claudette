import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as sdrService from './sdr.service.js';
import { authenticate } from '../../middleware/auth.js';

const attributeSchema = z.object({
  contactIds: z.array(z.string().uuid()),
  assignedToId: z.string().uuid(),
  sequenceId: z.string().uuid().optional(),
});

const callResultSchema = z.object({
  callResult: z.enum(['answered', 'no_answer', 'voicemail', 'wrong_number', 'not_interested', 'callback']),
  notes: z.string().optional(),
});

export default async function sdrRouter(fastify: FastifyInstance) {
  // POST /upload — Upload and parse CSV
  fastify.post('/upload', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const data = await request.file();
      if (!data) {
        reply.status(400);
        return { error: 'Aucun fichier fourni' };
      }

      const buffer = await data.toBuffer();
      const fileName = data.filename;
      const nameField = data.fields?.name as any;
      const listName = nameField?.value || fileName.replace(/\.(csv|xlsx?)$/i, '');

      const result = await sdrService.uploadAndParse(buffer, fileName, listName, request.userId);
      reply.status(201);
      return result;
    },
  });

  // GET /lists — Get all SDR lists
  fastify.get('/lists', {
    preHandler: [authenticate],
    handler: async () => {
      const lists = await sdrService.getLists();
      return { data: lists };
    },
  });

  // GET /lists/:id — Get a specific list with contacts
  fastify.get('/lists/:id', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return sdrService.getListById(id);
    },
  });

  // DELETE /lists/:id — Delete a list
  fastify.delete('/lists/:id', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return sdrService.deleteList(id);
    },
  });

  // POST /lists/:id/attribute — Attribute contacts to a recruiter
  fastify.post('/lists/:id/attribute', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = attributeSchema.parse(request.body);
      const result = await sdrService.attributeContacts(id, input);
      reply.status(200);
      return result;
    },
  });

  // POST /lists/:id/start-session — Start a call session
  fastify.post('/lists/:id/start-session', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return sdrService.startSession(id);
    },
  });

  // GET /lists/:id/next — Get next contact in session
  fastify.get('/lists/:id/next', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return sdrService.getNextContact(id);
    },
  });

  // PUT /contacts/:id/result — Record call result
  fastify.put('/contacts/:id/result', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const input = callResultSchema.parse(request.body);
      return sdrService.recordCallResult(id, input);
    },
  });

  // PUT /contacts/:id/notes — Update contact notes
  fastify.put('/contacts/:id/notes', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const { notes } = request.body as { notes: string };
      return sdrService.updateContactNotes(id, notes);
    },
  });

  // GET /dashboard — SDR KPIs dashboard
  fastify.get('/dashboard', {
    preHandler: [authenticate],
    handler: async () => {
      return sdrService.getDashboard();
    },
  });
}
