import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/db.js';
import { authenticate } from '../../middleware/auth.js';
import { AppError, ValidationError } from '../../lib/errors.js';
import type { Prisma } from '@prisma/client';
import * as alloService from './allo.service.js';
import * as gmailService from './gmail.service.js';
import * as calendarService from './calendar.service.js';
import * as emailAutoCreateService from './email-auto-create.service.js';

// ─── ZOD SCHEMAS ────────────────────────────────────

const updateConfigSchema = z.object({
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  tokenExpiry: z.string().datetime().optional(),
  config: z.record(z.string(), z.any()).optional(),
  enabled: z.boolean().optional(),
});

const providerParamSchema = z.object({
  provider: z.enum(['allo', 'gmail', 'calendar']),
});

const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  htmlBody: z.string().optional(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  inReplyTo: z.string().optional(),
  entiteType: z.string().optional(),
  entiteId: z.string().optional(),
});

// Accept both API format and frontend ScheduleMeeting format
const createCalendarEventSchema = z.object({
  summary: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  location: z.string().optional(),
  startTime: z.string(),
  endTime: z.string().optional(),
  date: z.string().optional(),
  duration: z.number().optional(),
  attendees: z.array(z.string().email()).optional(),
  participants: z.array(z.string()).optional(),
  entiteType: z.string().optional(),
  entiteId: z.string().optional(),
});

// ─── ROUTER ─────────────────────────────────────────

export default async function integrationRouter(fastify: FastifyInstance) {
  // ═══════════════════════════════════════════════════
  // STATUS ROUTE
  // ═══════════════════════════════════════════════════

  // GET /status - Get integration connection status
  fastify.get('/status', {
    schema: {
      description: 'Obtenir le statut de connexion des intégrations',
      tags: ['Integrations'],
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const configs = await prisma.integrationConfig.findMany({
        where: { userId: request.userId },
      });
      const gmail = configs.find(c => c.provider === 'gmail');
      const calendar = configs.find(c => c.provider === 'calendar');
      const allo = configs.find(c => c.provider === 'allo');
      return {
        gmail: { connected: !!gmail?.enabled, email: (gmail?.config as any)?.email || null },
        calendar: { connected: !!calendar?.enabled },
        allo: { connected: !!allo?.enabled, apiKeyConfigured: !!allo?.accessToken },
      };
    },
  });

  // ═══════════════════════════════════════════════════
  // CONFIG ROUTES
  // ═══════════════════════════════════════════════════

  // GET /config - List user's integration configs
  fastify.get('/config', {
    schema: {
      description: "Lister les configurations d'intégration de l'utilisateur",
      tags: ['Integrations'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const configs = await prisma.integrationConfig.findMany({
        where: { userId: request.userId },
        select: {
          id: true,
          provider: true,
          enabled: true,
          tokenExpiry: true,
          config: true,
          createdAt: true,
          updatedAt: true,
          // Exclude accessToken and refreshToken for security
        },
      });

      return configs;
    },
  });

  // PUT /config/:provider - Update config for a provider
  fastify.put('/config/:provider', {
    schema: {
      description: "Mettre à jour la configuration d'une intégration",
      tags: ['Integrations'],
      params: {
        type: 'object',
        required: ['provider'],
        properties: {
          provider: { type: 'string', enum: ['allo', 'gmail', 'calendar'] },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { provider } = providerParamSchema.parse(request.params);
      const input = updateConfigSchema.parse(request.body);

      const configValue = input.config as Prisma.InputJsonValue | undefined;

      const config = await prisma.integrationConfig.upsert({
        where: {
          userId_provider: { userId: request.userId, provider },
        },
        update: {
          ...(input.accessToken !== undefined && { accessToken: input.accessToken }),
          ...(input.refreshToken !== undefined && { refreshToken: input.refreshToken }),
          ...(input.tokenExpiry !== undefined && { tokenExpiry: new Date(input.tokenExpiry) }),
          ...(configValue !== undefined && { config: configValue }),
          ...(input.enabled !== undefined && { enabled: input.enabled }),
        },
        create: {
          userId: request.userId,
          provider,
          accessToken: input.accessToken,
          refreshToken: input.refreshToken,
          tokenExpiry: input.tokenExpiry ? new Date(input.tokenExpiry) : undefined,
          config: (configValue ?? {}) as Prisma.InputJsonValue,
          enabled: input.enabled ?? true,
        },
        select: {
          id: true,
          provider: true,
          enabled: true,
          tokenExpiry: true,
          config: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return config;
    },
  });

  // ═══════════════════════════════════════════════════
  // ALLO ROUTES
  // ═══════════════════════════════════════════════════

  // POST /allo/webhook - Receive Allo webhook (no auth)
  fastify.post('/allo/webhook', {
    schema: {
      description: 'Recevoir un webhook Allo (appel terminé)',
      tags: ['Integrations - Allo'],
    },
    handler: async (request, reply) => {
      // Validate webhook signature
      const signature = request.headers['x-allo-signature'] as string | undefined;
      const rawBody = JSON.stringify(request.body);

      if (!alloService.validateWebhookSignature(rawBody, signature)) {
        throw new AppError(401, 'Signature webhook Allo invalide');
      }

      const payload = request.body as any;

      // Normalize Allo payload field names
      const event = payload.event || payload.type || payload.eventType;
      const callId = payload.callId || payload.call_id || payload.id;

      if (!event) {
        throw new ValidationError('Payload webhook invalide: event requis');
      }

      const normalizedPayload = {
        ...payload,
        event,
        callId: callId || 'unknown',
        from: payload.from || payload.caller || payload.fromNumber || '',
        to: payload.to || payload.callee || payload.toNumber || '',
        direction: payload.direction || (payload.type === 'inbound' ? 'inbound' : 'outbound'),
        duration: payload.duration || payload.call_duration || 0,
      };

      console.log('[Allo Webhook] Received:', JSON.stringify(normalizedPayload).substring(0, 500));

      const result = await alloService.processAlloWebhook(normalizedPayload);
      return result;
    },
  });

  // POST /allo/sync - Trigger Allo sync job (authenticated)
  fastify.post('/allo/sync', {
    schema: {
      description: 'Déclencher la synchronisation des appels Allo',
      tags: ['Integrations - Allo'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const result = await alloService.syncCalls(request.userId);
      return result;
    },
  });

  // ═══════════════════════════════════════════════════
  // GMAIL ROUTES
  // ═══════════════════════════════════════════════════

  // GET /gmail/auth-url - Get OAuth URL (authenticated)
  fastify.get('/gmail/auth-url', {
    schema: {
      description: "Obtenir l'URL OAuth Google pour Gmail",
      tags: ['Integrations - Gmail'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const url = gmailService.getOAuthUrl(request.userId);
      return { url };
    },
  });

  // GET /gmail/callback - OAuth callback (special handling)
  fastify.get('/gmail/callback', {
    schema: {
      description: 'Callback OAuth Google pour Gmail',
      tags: ['Integrations - Gmail'],
      querystring: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          state: { type: 'string' },
          error: { type: 'string' },
        },
      },
    },
    handler: async (request, reply) => {
      const query = request.query as { code?: string; state?: string; error?: string };

      if (query.error) {
        // Redirect to frontend with error
        const frontendUrl = process.env.APP_URL || 'http://localhost:5173';
        reply.redirect(`${frontendUrl}/settings/integrations?error=${encodeURIComponent(query.error)}`);
        return;
      }

      if (!query.code || !query.state) {
        throw new ValidationError('Paramètres OAuth manquants: code et state requis');
      }

      const userId = query.state; // userId was passed as state parameter
      const result = await gmailService.handleOAuthCallback(userId, query.code);

      // Redirect to frontend settings page on success
      const frontendUrl = process.env.APP_URL || 'http://localhost:5173';
      reply.redirect(`${frontendUrl}/settings/integrations?provider=gmail&status=connected`);
    },
  });

  // POST /gmail/send - Send email via Gmail (authenticated)
  fastify.post('/gmail/send', {
    schema: {
      description: 'Envoyer un email via Gmail',
      tags: ['Integrations - Gmail'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = sendEmailSchema.parse(request.body);
      const result = await gmailService.sendEmail(request.userId, input);
      reply.status(201);
      return result;
    },
  });

  // POST /gmail/disconnect - Disconnect Gmail (authenticated)
  fastify.post('/gmail/disconnect', {
    schema: {
      description: 'Déconnecter Gmail',
      tags: ['Integrations - Gmail'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      await prisma.integrationConfig.deleteMany({
        where: { userId: request.userId, provider: 'gmail' },
      });
      return { success: true };
    },
  });

  // POST /gmail/webhook - Receive Gmail push notification (no auth)
  fastify.post('/gmail/webhook', {
    schema: {
      description: 'Recevoir une notification push Gmail (Pub/Sub)',
      tags: ['Integrations - Gmail'],
    },
    handler: async (request, reply) => {
      const payload = request.body as any;

      if (!payload.message?.data) {
        throw new ValidationError('Payload webhook Gmail invalide: message.data requis');
      }

      const result = await gmailService.processGmailWebhook(payload);
      // Google Pub/Sub expects 200 to acknowledge
      return result;
    },
  });

  // ═══════════════════════════════════════════════════
  // CALENDAR ROUTES
  // ═══════════════════════════════════════════════════

  // POST /calendar/disconnect - Disconnect Calendar (authenticated)
  fastify.post('/calendar/disconnect', {
    schema: {
      description: 'Déconnecter Google Calendar',
      tags: ['Integrations - Calendar'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      await prisma.integrationConfig.deleteMany({
        where: { userId: request.userId, provider: 'calendar' },
      });
      return { success: true };
    },
  });

  // GET /calendar/auth-url - Get OAuth URL for Calendar (reuses Gmail OAuth with calendar scopes)
  fastify.get('/calendar/auth-url', {
    schema: {
      description: "Obtenir l'URL OAuth Google pour Calendar",
      tags: ['Integrations - Calendar'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      // Reuse Gmail OAuth URL since it includes calendar scopes
      const url = gmailService.getOAuthUrl(request.userId);
      return { url };
    },
  });

  // POST /calendar/events - Create a calendar event (authenticated)
  fastify.post('/calendar/events', {
    schema: {
      description: 'Créer un événement Google Calendar',
      tags: ['Integrations - Calendar'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = createCalendarEventSchema.parse(request.body);

      // Normalize: transform frontend format to service format
      const eventSummary = input.summary || input.title || 'Événement';
      const eventDescription = input.description || input.notes || undefined;
      const eventAttendees = input.attendees || (input.participants || []).filter(p => p.includes('@'));

      // Normalize entiteType to uppercase
      const entiteType = input.entiteType?.toUpperCase() as 'CANDIDAT' | 'CLIENT' | 'ENTREPRISE' | 'MANDAT' | undefined;

      // Build ISO start/end times
      let startTimeISO: string;
      let endTimeISO: string;

      if (input.date && input.startTime.length <= 5) {
        // Frontend format: date="2026-03-03", startTime="09:00", duration=60
        startTimeISO = `${input.date}T${input.startTime}:00`;
        const durationMs = (input.duration || 60) * 60 * 1000;
        endTimeISO = new Date(new Date(startTimeISO).getTime() + durationMs).toISOString();
        startTimeISO = new Date(startTimeISO).toISOString();
      } else if (input.endTime) {
        // API format: ISO datetimes
        startTimeISO = input.startTime;
        endTimeISO = input.endTime;
      } else {
        // Fallback: 1 hour duration
        startTimeISO = input.startTime.includes('T') ? input.startTime : new Date(input.startTime).toISOString();
        endTimeISO = new Date(new Date(startTimeISO).getTime() + 60 * 60 * 1000).toISOString();
      }

      const result = await calendarService.createEvent(request.userId, {
        summary: eventSummary,
        description: eventDescription,
        location: input.location,
        startTime: startTimeISO,
        endTime: endTimeISO,
        attendees: eventAttendees.length > 0 ? eventAttendees : undefined,
        entiteType,
        entiteId: input.entiteId,
      });
      reply.status(201);
      return result;
    },
  });

  // GET /calendar/events - List upcoming events (authenticated)
  fastify.get('/calendar/events', {
    schema: {
      description: 'Lister les événements à venir',
      tags: ['Integrations - Calendar'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const result = await calendarService.getUpcomingEvents(request.userId);
      // Normalize response to match frontend AgendaWidget expected format
      const normalizedEvents = (result.events || []).map((e: any) => ({
        id: e.id || e.googleEventId || Math.random().toString(36),
        title: e.titre || e.summary || e.title || '(Sans titre)',
        startTime: e.startTime || e.start?.dateTime || (e.metadata as any)?.startTime || e.createdAt,
        endTime: e.endTime || e.end?.dateTime || (e.metadata as any)?.endTime || null,
        participants: e.attendees || (e.metadata as any)?.attendees || [],
        date: e.startTime || e.start?.dateTime || (e.metadata as any)?.startTime || e.createdAt,
        location: e.location || null,
        htmlLink: e.htmlLink || null,
        description: e.description || e.contenu || null,
        status: e.status || 'confirmed',
        attendeeAnalysis: e.attendeeAnalysis || null,
      }));
      return { data: normalizedEvents, source: result.source };
    },
  });

  // POST /calendar/sync-calendly - Sync and enrich from Calendly events (authenticated)
  fastify.post('/calendar/sync-calendly', {
    schema: {
      description: 'Synchroniser et enrichir les candidats depuis les événements Calendly',
      tags: ['Integrations - Calendar'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const result = await calendarService.syncCalendlyEvents(request.userId);
      return result;
    },
  });

  // POST /calendar/webhook - Receive Calendar webhook (no auth)
  fastify.post('/calendar/webhook', {
    schema: {
      description: 'Recevoir une notification webhook Google Calendar',
      tags: ['Integrations - Calendar'],
    },
    handler: async (request, reply) => {
      // Google Calendar sends specific headers for webhooks
      const channelId = request.headers['x-goog-channel-id'] as string | undefined;
      const resourceState = request.headers['x-goog-resource-state'] as string | undefined;

      if (!calendarService.validateWebhookHeaders(channelId, resourceState)) {
        throw new ValidationError('Headers webhook Calendar invalides');
      }

      // For 'sync' state, just acknowledge
      if (resourceState === 'sync') {
        return { status: 'sync_acknowledged' };
      }

      const payload = {
        kind: 'calendar#notification',
        id: channelId!,
        resourceId: (request.headers['x-goog-resource-id'] as string) ?? '',
        resourceUri: (request.headers['x-goog-resource-uri'] as string) ?? '',
        token: (request.headers['x-goog-channel-token'] as string) ?? undefined,
        ...(typeof request.body === 'object' && request.body !== null ? request.body as object : {}),
      };

      const result = await calendarService.processCalendarWebhook(payload);
      return result;
    },
  });

  // ═══════════════════════════════════════════════════
  // EMAIL AUTO-CREATE ROUTES
  // ═══════════════════════════════════════════════════

  // POST /email/sync - Manually trigger email auto-create (authenticated)
  fastify.post('/email/sync', {
    schema: {
      description: 'Déclencher la création automatique depuis les emails Gmail',
      tags: ['Integrations - Email'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const result = await emailAutoCreateService.processIncomingEmailsForUser(request.userId);
      return {
        status: 'completed',
        ...result,
        message: `${result.candidats} candidats, ${result.clients} clients, ${result.entreprises} entreprises créés. ${result.activities} activités loggées.`,
      };
    },
  });
}
