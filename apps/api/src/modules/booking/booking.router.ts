import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import * as service from './booking.service.js';

const windowSchema = z.object({ day: z.number().int().min(0).max(6), start: z.string(), end: z.string() });
const settingsSchema = z.object({
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
  fastify.get('/settings', {
    schema: { tags: ['Booking'] }, preHandler: [authenticate],
    handler: (request) => service.getSettings(request.userId),
  });
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
      const body = z.object({ name: z.string().min(1), email: z.string().email(), note: z.string().optional(), slotStart: z.string() }).parse(request.body);
      reply.code(201);
      return service.createBooking(slug, body);
    },
  });
}
