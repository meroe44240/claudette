import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';
import * as transcriptService from './transcript.service.js';

// ─── ZOD SCHEMAS ────────────────────────────────────

const processTranscriptSchema = z.object({
  googleDocId: z.string().min(1, 'googleDocId est requis'),
  title: z.string().min(1, 'title est requis'),
  content: z.string().min(1, 'content est requis'),
});

const watchFolderSchema = z.object({
  folderId: z.string().min(1, 'folderId est requis'),
});

// ─── ROUTER ─────────────────────────────────────────

export default async function transcriptRouter(fastify: FastifyInstance) {
  // POST /process - Manually process a transcript
  fastify.post('/process', {
    schema: {
      description: 'Traiter manuellement un transcript Google Docs',
      tags: ['Transcripts'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = processTranscriptSchema.parse(request.body);
      const result = await transcriptService.processTranscript(request.userId, input);
      reply.status(201);
      return result;
    },
  });

  // POST /drive-webhook - Receive Google Drive push notification (no auth)
  fastify.post('/drive-webhook', {
    schema: {
      description: 'Recevoir une notification push Google Drive',
      tags: ['Transcripts'],
    },
    handler: async (request, reply) => {
      const payload = request.body as Record<string, unknown>;

      if (!payload || typeof payload !== 'object') {
        throw new ValidationError('Payload webhook invalide');
      }

      const result = await transcriptService.handleDriveWebhook(payload);
      return result;
    },
  });

  // PUT /watch - Configure drive folder to watch
  fastify.put('/watch', {
    schema: {
      description: 'Configurer un dossier Google Drive a surveiller',
      tags: ['Transcripts'],
    },
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: async (request, reply) => {
      const input = watchFolderSchema.parse(request.body);
      const result = await transcriptService.watchDriveFolder(request.userId, input.folderId);
      return result;
    },
  });
}
