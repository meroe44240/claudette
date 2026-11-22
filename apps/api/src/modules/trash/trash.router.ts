import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import * as service from './trash.service.js';

/** Corbeille : tout le monde voit et restaure ; seul un admin humain la vide. */
export default async function trashRouter(fastify: FastifyInstance) {
  const auth = { preHandler: [authenticate] };
  fastify.get('/', auth, async (r) => service.listTrash(z.object({
    model: z.string().max(60).optional(),
    q: z.string().max(200).optional(),
    deleted_by: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }).parse(r.query)));
  fastify.post('/:id/restore', auth, async (r) => service.restore(z.object({ id: z.string().uuid() }).parse(r.params).id));
  fastify.delete('/', auth, async (r) => service.emptyTrash(r.userId));
}
