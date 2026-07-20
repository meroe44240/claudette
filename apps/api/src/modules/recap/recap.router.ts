/**
 * Router `/api/v1/recap` — admin-only.
 *
 * - POST /preview  : calcule le payload + rend HTML/texte + sujet (dry-run).
 * - POST /send-now : execute buildRecap + envoie l'email via mailer,
 *                    ecrit un `RecapRun` (SENT ou FAILED), idempotent sur
 *                    la journee ICT courante.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import prisma from '../../lib/db.js';
import { sendEmail } from '../../lib/mailer.js';
import { buildRecap } from './recap.service.js';
import {
  renderRecapHtml,
  renderRecapSubject,
  renderRecapText,
} from './recap.template.js';
import { alreadySentToday, getDefaultWindow } from './recap.window.js';

async function requireAdmin(request: any, reply: any) {
  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    select: { role: true },
  });
  if (!user || user.role !== 'ADMIN') {
    reply.status(403);
    return reply.send({ error: 'Acces reserve aux administrateurs' });
  }
}

const previewSchema = z.object({
  windowStart: z.string().datetime().optional(),
  windowEnd: z.string().datetime().optional(),
});

const sendNowSchema = z.object({
  to: z.string().email().or(z.array(z.string().email())),
  windowStart: z.string().datetime().optional(),
  windowEnd: z.string().datetime().optional(),
  force: z.boolean().optional(), // bypass idempotence
});

export default async function recapRouter(fastify: FastifyInstance) {
  // POST /preview
  fastify.post('/preview', {
    schema: {
      description:
        'Genere le payload recap + rendu HTML/texte + sujet, sans envoi (admin uniquement)',
      tags: ['Recap'],
    },
    preHandler: [authenticate, requireAdmin],
    handler: async (request, reply) => {
      const body = previewSchema.parse(request.body ?? {});
      const window = body.windowStart && body.windowEnd
        ? { start: new Date(body.windowStart), end: new Date(body.windowEnd) }
        : await getDefaultWindow();

      const payload = await buildRecap(window.start, window.end);
      const html = renderRecapHtml(payload);
      const text = renderRecapText(payload);
      const subject = renderRecapSubject(payload);

      return { subject, html, text, payload };
    },
  });

  // POST /send-now
  fastify.post('/send-now', {
    schema: {
      description:
        'Envoie immediatement le recap au(x) destinataire(s), avec ecriture d\'un RecapRun (admin uniquement)',
      tags: ['Recap'],
    },
    preHandler: [authenticate, requireAdmin],
    handler: async (request, reply) => {
      const body = sendNowSchema.parse(request.body);

      if (!body.force && (await alreadySentToday())) {
        reply.status(409);
        return reply.send({
          error: 'Un recap a deja ete envoye aujourd\'hui (ICT). Passe force=true pour outrepasser.',
        });
      }

      const window = body.windowStart && body.windowEnd
        ? { start: new Date(body.windowStart), end: new Date(body.windowEnd) }
        : await getDefaultWindow();

      const to = Array.isArray(body.to) ? body.to.join(',') : body.to;

      try {
        const payload = await buildRecap(window.start, window.end);
        const html = renderRecapHtml(payload);
        const text = renderRecapText(payload);
        const subject = renderRecapSubject(payload);

        await sendEmail(to, subject, html, text);

        const run = await prisma.recapRun.create({
          data: {
            sentAt: new Date(),
            windowStart: window.start,
            windowEnd: window.end,
            status: 'SENT',
          },
        });

        return {
          success: true,
          runId: run.id,
          subject,
          to,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.recapRun.create({
          data: {
            sentAt: new Date(),
            windowStart: window.start,
            windowEnd: window.end,
            status: 'FAILED',
            error: message.slice(0, 5000),
          },
        });
        reply.status(500);
        return reply.send({ error: 'Envoi echoue', detail: message });
      }
    },
  });

  // GET /runs — historique des envois (pour debug)
  fastify.get('/runs', {
    schema: {
      description: 'Historique des envois recap (admin uniquement)',
      tags: ['Recap'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number' },
        },
      },
    },
    preHandler: [authenticate, requireAdmin],
    handler: async (request) => {
      const query = request.query as { limit?: number };
      const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
      const runs = await prisma.recapRun.findMany({
        orderBy: { sentAt: 'desc' },
        take: limit,
      });
      return { runs };
    },
  });
}
