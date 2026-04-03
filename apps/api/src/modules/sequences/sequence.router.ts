import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as sequenceService from './sequence.service.js';
import { authenticate } from '../../middleware/auth.js';

const stepSchema = z.object({
  order: z.number(),
  delay_days: z.number().min(0),
  delay_hours: z.number().min(0).default(0),
  channel: z.enum(['email', 'call', 'whatsapp']),
  action: z.enum(['send', 'call', 'message']),
  template: z.object({
    subject: z.string().optional(),
    body: z.string().optional(),
    whatsapp_message: z.string().optional(),
  }).default({}),
  task_title: z.string(),
  instructions: z.string().optional(),
});

const createSequenceSchema = z.object({
  nom: z.string().min(1),
  description: z.string().optional(),
  persona: z.string().optional(),
  targetType: z.enum(['candidate', 'client']),
  steps: z.array(stepSchema),
  stopOnReply: z.boolean().optional(),
});

const updateSequenceSchema = z.object({
  nom: z.string().min(1).optional(),
  description: z.string().optional(),
  persona: z.string().optional(),
  targetType: z.enum(['candidate', 'client']).optional(),
  steps: z.array(stepSchema).optional(),
  stopOnReply: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const startRunSchema = z.object({
  sequenceId: z.string().uuid(),
  targetType: z.enum(['candidate', 'client']),
  targetId: z.string().uuid(),
  mandatId: z.string().uuid().optional(),
});

export default async function sequenceRouter(fastify: FastifyInstance) {
  // GET / — List all sequences
  fastify.get('/', {
    preHandler: [authenticate],
    handler: async (request) => {
      const sequences = await sequenceService.list(request.userId);
      return { data: sequences };
    },
  });

  // GET /:id — Get a sequence with its runs
  fastify.get('/:id', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return sequenceService.getById(id);
    },
  });

  // POST / — Create a sequence
  fastify.post('/', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = createSequenceSchema.parse(request.body);
      const sequence = await sequenceService.create({ ...input, userId: request.userId });
      reply.status(201);
      return sequence;
    },
  });

  // PUT /:id — Update a sequence
  fastify.put('/:id', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const input = updateSequenceSchema.parse(request.body);
      return sequenceService.update(id, input);
    },
  });

  // DELETE /:id — Delete a sequence
  fastify.delete('/:id', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return sequenceService.remove(id);
    },
  });

  // POST /runs — Start a sequence run
  fastify.post('/runs', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = startRunSchema.parse(request.body);
      const run = await sequenceService.startRun({ ...input, assignedToId: request.userId });
      reply.status(201);
      return run;
    },
  });

  // GET /runs/active — Get active runs
  fastify.get('/runs/active', {
    preHandler: [authenticate],
    handler: async () => {
      const runs = await sequenceService.getActiveRuns();
      return { data: runs };
    },
  });

  // GET /runs/completed — Get completed runs
  fastify.get('/runs/completed', {
    preHandler: [authenticate],
    handler: async () => {
      const runs = await sequenceService.getCompletedRuns();
      return { data: runs };
    },
  });

  // GET /runs/:id — Get run details
  fastify.get('/runs/:id', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return sequenceService.getRunDetails(id);
    },
  });

  // PUT /runs/:id/pause — Pause a run
  fastify.put('/runs/:id/pause', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return sequenceService.pauseRun(id);
    },
  });

  // PUT /runs/:id/resume — Resume a run
  fastify.put('/runs/:id/resume', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return sequenceService.resumeRun(id);
    },
  });

  // PUT /runs/:id/cancel — Cancel a run
  fastify.put('/runs/:id/cancel', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return sequenceService.cancelRun(id);
    },
  });

  // PUT /step-logs/:id/validate — Recruiter validates a step
  fastify.put('/step-logs/:id/validate', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return sequenceService.validateStep(id);
    },
  });

  // POST /detect-reply — Check if an email reply pauses a sequence
  fastify.post('/detect-reply', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { email } = request.body as { email: string };
      return sequenceService.detectReply(email);
    },
  });

  // GET /stats — Sequence stats
  fastify.get('/stats', {
    preHandler: [authenticate],
    handler: async () => {
      return sequenceService.getSequenceStats();
    },
  });

  // POST /seed — Seed default sequences
  fastify.post('/seed', {
    preHandler: [authenticate],
    handler: async (request) => {
      return sequenceService.seedDefaultSequences(request.userId);
    },
  });

  // POST /process — Process due runs (for cron/manual trigger)
  fastify.post('/process', {
    preHandler: [authenticate],
    handler: async () => {
      const results = await sequenceService.processDueRuns();
      return { processed: results.length, results };
    },
  });
}
