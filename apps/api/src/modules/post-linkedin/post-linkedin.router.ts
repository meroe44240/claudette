import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';
import * as service from './post-linkedin.service.js';

const createSchema = z.object({
  datePost: z.string().min(1),
  texte: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  statut: z.string().optional(),
});

const updateSchema = z.object({
  datePost: z.string().optional(),
  texte: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  statut: z.string().optional(),
});

// /api/v1/posts-linkedin — calendrier editorial (authentifie ; toute l'equipe voit tout)
export default async function postLinkedinRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/', {
    schema: { tags: ['PostsLinkedin'] },
    handler: (request) => {
      const q = request.query as { from?: string; to?: string };
      return service.list({ from: q.from, to: q.to });
    },
  });

  fastify.get('/:id', {
    schema: { tags: ['PostsLinkedin'] },
    handler: (request) => service.getById((request.params as { id: string }).id),
  });

  fastify.post('/', {
    schema: { tags: ['PostsLinkedin'] },
    handler: (request, reply) => {
      reply.code(201);
      return service.create(request.userId, createSchema.parse(request.body));
    },
  });

  fastify.patch('/:id', {
    schema: { tags: ['PostsLinkedin'] },
    handler: (request) =>
      service.update(
        request.userId,
        request.userRole,
        (request.params as { id: string }).id,
        updateSchema.parse(request.body),
      ),
  });

  fastify.delete('/:id', {
    schema: { tags: ['PostsLinkedin'] },
    handler: (request) =>
      service.remove(request.userId, request.userRole, (request.params as { id: string }).id),
  });

  // ── Commentaires ──
  fastify.post('/:id/comments', {
    schema: { tags: ['PostsLinkedin'] },
    handler: (request) => {
      const { texte } = z.object({ texte: z.string() }).parse(request.body);
      return service.addComment(request.userId, (request.params as { id: string }).id, texte);
    },
  });

  fastify.delete('/comments/:commentId', {
    schema: { tags: ['PostsLinkedin'] },
    handler: (request) =>
      service.removeComment(
        request.userId,
        request.userRole,
        (request.params as { commentId: string }).commentId,
      ),
  });

  // ── Upload image ──
  fastify.post('/upload-image', {
    schema: { tags: ['PostsLinkedin'], consumes: ['multipart/form-data'] },
    handler: async (request, reply) => {
      const data = await request.file();
      if (!data) throw new ValidationError('Aucun fichier envoyé');
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) chunks.push(chunk);
      const result = await service.saveImage(Buffer.concat(chunks), data.filename, data.mimetype);
      reply.code(201);
      return result;
    },
  });
}
