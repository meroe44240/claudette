import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import * as service from './audit.service.js';

const bool = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean().optional());

export const auditFiltersSchema = z.object({
  user_id: z.string().uuid().optional(),
  agents_only: bool,
  entity_type: z.string().max(50).optional(),
  entity_id: z.string().uuid().optional(),
  action: z.string().max(20).optional(),
  source: z.string().max(10).optional(),
  externe: bool,
  tool: z.string().max(100).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** Journal d'audit : la page Journal est réservée aux admins, l'historique d'une fiche est ouvert à tous. */
export default async function auditRouter(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: [authenticate, requireRole('ADMIN')] }, async (r) => service.listAudit(auditFiltersSchema.parse(r.query)));
  fastify.get('/facets', { preHandler: [authenticate, requireRole('ADMIN')] }, async () => service.facets());
  fastify.get('/history/:entity/:id', { preHandler: [authenticate] }, async (r) => {
    const p = z.object({ entity: z.string().max(50), id: z.string().uuid() }).parse(r.params);
    return service.history(p.entity, p.id);
  });
}
