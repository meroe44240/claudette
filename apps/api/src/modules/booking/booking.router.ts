import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as bookingService from './booking.service.js';
import { authenticate } from '../../middleware/auth.js';
import { parsePagination } from '../../lib/pagination.js';

// ─── ZOD SCHEMAS ────────────────────────────────────

const createBookingSchema = z.object({
  firstName: z.string().min(1, 'Le prenom est requis'),
  lastName: z.string().min(1, 'Le nom est requis'),
  email: z.string().email('Email invalide'),
  phone: z.string().min(5, 'Numero de telephone invalide'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (YYYY-MM-DD)'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Format d\'heure invalide (HH:MM)'),
  entityType: z.enum(['candidat', 'client']),
  salary: z.string().optional(),
  currentCompany: z.string().optional(),
  availability: z.string().optional(),
  competingProcesses: z.string().optional(),
  message: z.string().optional(),
  mandatSlug: z.string().optional(),
});

const cancelBookingSchema = z.object({
  token: z.string().min(1, 'Token d\'annulation requis'),
  reason: z.string().optional(),
});

const saveSettingsSchema = z.object({
  slug: z.string().min(3, 'Le slug doit contenir au moins 3 caracteres'),
  isActive: z.boolean().optional(),
  workingDays: z.array(z.number().min(0).max(6)).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  slotDuration: z.number().min(10).max(120).optional(),
  bufferMinutes: z.number().min(0).max(60).optional(),
  minNoticeHours: z.number().min(0).max(72).optional(),
  maxAdvanceDays: z.number().min(1).max(90).optional(),
  welcomeMessage: z.string().optional(),
  reminderEmail: z.boolean().optional(),
  reminderBefore: z.boolean().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['completed', 'no_show', 'confirmed', 'cancelled']),
});

// ─── PUBLIC ROUTES (no auth) ────────────────────────

export async function bookingPublicRouter(fastify: FastifyInstance) {
  // GET /:slug — Get recruiter public info
  fastify.get('/:slug', {
    handler: async (request) => {
      const { slug } = request.params as { slug: string };
      return bookingService.getRecruiterPublicInfo(slug);
    },
  });

  // GET /:slug/slots — Get available slots for a date
  fastify.get('/:slug/slots', {
    handler: async (request) => {
      const { slug } = request.params as { slug: string };
      const { date } = request.query as { date: string };

      if (!date) {
        return { error: 'Le parametre "date" est requis (format: YYYY-MM-DD)' };
      }

      const slots = await bookingService.getAvailableSlots(slug, date);
      return { data: slots };
    },
  });

  // POST /:slug/book — Create a booking
  fastify.post('/:slug/book', {
    handler: async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const input = createBookingSchema.parse(request.body);
      const result = await bookingService.createBooking(slug, input);
      reply.status(201);
      return result;
    },
  });

  // GET /:slug/:mandatSlug — Get recruiter info with mandat context
  fastify.get('/:slug/:mandatSlug', {
    handler: async (request) => {
      const { slug, mandatSlug } = request.params as { slug: string; mandatSlug: string };
      return bookingService.getRecruiterPublicInfo(slug, mandatSlug);
    },
  });

  // GET /cancel/:id — Get cancel info (display cancel page)
  fastify.get('/cancel/:id', {
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return bookingService.getCancelInfo(id);
    },
  });

  // POST /cancel/:id — Cancel a booking
  fastify.post('/cancel/:id', {
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const input = cancelBookingSchema.parse(request.body);
      return bookingService.cancelBooking(id, input.token, input.reason);
    },
  });
}

// ─── AUTHENTICATED ROUTES ───────────────────────────

export default async function bookingRouter(fastify: FastifyInstance) {
  // GET /settings — Get booking settings
  fastify.get('/settings', {
    preHandler: [authenticate],
    handler: async (request) => {
      const settings = await bookingService.getBookingSettings(request.userId);
      return { data: settings };
    },
  });

  // PUT /settings — Save booking settings
  fastify.put('/settings', {
    preHandler: [authenticate],
    handler: async (request) => {
      const input = saveSettingsSchema.parse(request.body);
      const settings = await bookingService.saveBookingSettings(request.userId, input);
      return { data: settings };
    },
  });

  // GET /list — List bookings
  fastify.get('/list', {
    preHandler: [authenticate],
    handler: async (request) => {
      const query = request.query as { page?: string; perPage?: string; status?: string };
      const pagination = parsePagination(query);
      return bookingService.listBookings(request.userId, pagination, query.status);
    },
  });

  // PUT /:id/status — Update booking status
  fastify.put('/:id/status', {
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const input = updateStatusSchema.parse(request.body);
      const booking = await bookingService.updateBookingStatus(id, request.userId, input.status);
      return { data: booking };
    },
  });

  // GET /mandat-links — Get mandat booking links
  fastify.get('/mandat-links', {
    preHandler: [authenticate],
    handler: async (request) => {
      return bookingService.getMandatBookingLinks(request.userId);
    },
  });
}
