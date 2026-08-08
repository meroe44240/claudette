import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import * as service from './booking.service.js';

const windowSchema = z.object({ day: z.number().int().min(0).max(6), start: z.string(), end: z.string() });
const settingsSchema = z.object({
  kind: z.enum(['GENERIC', 'DISCOVERY', 'QUALIFICATION']).optional(),
  mandatId: z.string().uuid().nullable().optional(),
  slug: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  durationMin: z.number().int().min(5).max(480).optional(),
  timezone: z.string().optional(),
  availability: z.array(windowSchema).optional(),
  bufferMin: z.number().int().min(0).max(240).optional(),
  advanceDays: z.number().int().min(1).max(90).optional(),
  isActive: z.boolean().optional(),
});

// ── ATS (authentifié) : /api/v1/booking ──
export default async function bookingRouter(fastify: FastifyInstance) {
  // Liste des types de page de réservation
  fastify.get('/settings', {
    schema: { tags: ['Booking'] }, preHandler: [authenticate],
    handler: (request) => service.listSettings(request.userId),
  });
  // Créer un type
  fastify.post('/settings', {
    schema: { tags: ['Booking'] }, preHandler: [authenticate],
    handler: (request) => service.saveType(request.userId, settingsSchema.parse(request.body)),
  });
  // Mettre à jour un type
  fastify.put('/settings/:id', {
    schema: { tags: ['Booking'], params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } }, preHandler: [authenticate],
    handler: (request) => service.saveType(request.userId, { ...settingsSchema.parse(request.body), id: (request.params as { id: string }).id }),
  });
  // Supprimer un type
  fastify.delete('/settings/:id', {
    schema: { tags: ['Booking'], params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } }, preHandler: [authenticate],
    handler: (request) => service.deleteType(request.userId, (request.params as { id: string }).id),
  });
  // Rétro-compat : ancien PUT /settings (met à jour le 1er type)
  fastify.put('/settings', {
    schema: { tags: ['Booking'] }, preHandler: [authenticate],
    handler: (request) => service.upsertSettings(request.userId, settingsSchema.parse(request.body)),
  });
  fastify.get('/my-bookings', {
    schema: { tags: ['Booking'] }, preHandler: [authenticate],
    handler: (request) => service.listMyBookings(request.userId),
  });
}

// ── PUBLIC (aucune auth) : /api/v1/public/booking ──
export async function bookingPublicRouter(fastify: FastifyInstance) {
  fastify.get('/:slug', {
    schema: { tags: ['Public'], params: { type: 'object', required: ['slug'], properties: { slug: { type: 'string' } } } },
    handler: (request) => service.getPublicPage((request.params as { slug: string }).slug),
  });
  fastify.post('/:slug', {
    schema: { tags: ['Public'], params: { type: 'object', required: ['slug'], properties: { slug: { type: 'string' } } } },
    handler: (request, reply) => {
      const { slug } = request.params as { slug: string };
      const body = z.object({
        name: z.string().min(1),
        email: z.string().email(),
        note: z.string().optional(),
        slotStart: z.string(),
        poste: z.string().optional(),
        societe: z.string().optional(),
        phone: z.string().optional(),
        roleHiring: z.string().optional(),
        timeline: z.string().optional(),
      }).parse(request.body);
      reply.code(201);
      return service.createBooking(slug, body);
    },
  });
}
