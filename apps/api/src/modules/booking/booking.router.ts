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

// Réponses du formulaire des pages /careers (recrutement interne HumanUp).
const careersSchema = z.object({
  role: z.enum(['LEAD', 'TAM']),
  english: z.enum(['Yes', 'No']),
  tech: z.enum(['Yes', 'No']),
  techDetail: z.string().max(200).optional(),
  ambition: z.string().trim().min(1).max(600),
  why: z.string().trim().min(1).max(600),
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
  // Annulation par le client (token en query/body — routes statiques prioritaires sur /:slug)
  fastify.get('/cancel', {
    schema: { tags: ['Public'] },
    handler: (request) => service.getCancelContext(String((request.query as { token?: string }).token || '')),
  });
  fastify.post('/cancel', {
    schema: { tags: ['Public'] },
    handler: (request) => service.cancelBooking(String(((request.body ?? {}) as { token?: string }).token || '')),
  });
  // Candidature aux postes HumanUp (pages /careers du site), sans réservation.
  fastify.post('/careers/apply', {
    schema: { tags: ['Public'] },
    handler: async (request, reply) => {
      const body = z.object({ name: z.string().trim().min(2).max(120), email: z.string().email().max(254), careers: careersSchema }).parse(request.body);
      const { candidatId } = await service.recordCareersApplication(body);
      reply.code(201);
      return { ok: true, candidatId };
    },
  });
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
        careers: careersSchema.optional(),
      }).parse(request.body);
      reply.code(201);
      return service.createBooking(slug, body);
    },
  });
}
