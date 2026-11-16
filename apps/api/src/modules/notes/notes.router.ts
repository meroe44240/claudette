import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import prisma from '../../lib/db.js';
import { ValidationError } from '../../lib/errors.js';
import { authenticate } from '../../middleware/auth.js';
import { appendSegments } from './notes.live.js';
import { applyBotStatus, runEveningRecap, syncUserCalendar, scheduleBots } from './notes.scheduler.js';
import * as service from './notes.service.js';
import * as recall from './recall.client.js';

const who = (r: FastifyRequest) => ({ userId: r.userId, userRole: r.userRole as string });
const idParam = (r: FastifyRequest) => (r.params as { id: string }).id;
const tags = ['Humanup Notes'];

/** Routes de l'app (membre connecté). */
export default async function notesRouter(fastify: FastifyInstance) {
  const opts = { schema: { tags }, preHandler: [authenticate] };

  fastify.get('/calls', { ...opts, handler: (r) => {
    const q = r.query as { range?: string; all?: string };
    return service.listCalls(who(r), q.range === 'past' ? 'past' : 'upcoming', q.all === '1');
  } });

  fastify.post('/calls', { ...opts, handler: (r) => service.createManualCall(who(r), z.object({
    titre: z.string().min(1), meetingUrl: z.string().min(1), startAt: z.string(), durationMin: z.number().int().min(5).max(480).optional(), callType: z.string().optional(),
  }).parse(r.body)) });

  fastify.get('/calls/:id', { ...opts, handler: (r) => service.getCall(idParam(r), who(r)) });
  fastify.get('/calls/:id/live', { ...opts, config: { rateLimit: false }, handler: (r) => service.getLive(idParam(r), who(r)) });
  fastify.get('/calls/:id/transcript', { ...opts, handler: (r) => service.getTranscript(idParam(r), who(r)) });

  fastify.patch('/calls/:id', { ...opts, handler: (r) => service.updateCall(idParam(r), who(r), z.object({
    callType: z.string().optional(),
    candidatId: z.string().uuid().nullable().optional(),
    clientId: z.string().uuid().nullable().optional(),
    mandatId: z.string().uuid().nullable().optional(),
    leadId: z.string().uuid().nullable().optional(),
    brief: z.string().nullable().optional(),
    excluded: z.boolean().optional(),
  }).parse(r.body)) });

  fastify.post('/calls/:id/documents', {
    schema: { tags, consumes: ['multipart/form-data'] },
    preHandler: [authenticate],
    handler: async (r) => {
      const file = await r.file();
      if (!file) throw new ValidationError('Aucun fichier envoyé');
      const chunks: Buffer[] = [];
      for await (const c of file.file) chunks.push(c);
      return service.addBriefDocument(idParam(r), who(r), Buffer.concat(chunks), file.filename, file.mimetype);
    },
  });

  fastify.post('/calls/:id/questions/prepare', { ...opts, handler: (r) => service.regenerateQuestions(idParam(r), who(r)) });
  fastify.put('/calls/:id/questions', { ...opts, handler: (r) => service.saveQuestions(idParam(r), who(r), z.object({
    questions: z.array(z.object({ id: z.string().optional(), text: z.string(), dealbreaker: z.boolean().optional() })),
  }).parse(r.body).questions) });
  fastify.post('/calls/:id/questions/:qid/status', { ...opts, handler: (r) => {
    const body = z.object({ status: z.enum(['todo', 'partial', 'covered']), answer: z.string().nullable().optional() }).parse(r.body);
    return service.setQuestionStatus(idParam(r), who(r), (r.params as { qid: string }).qid, body.status, body.answer);
  } });
  fastify.delete('/calls/:id/alerts/:alertId', { ...opts, handler: (r) => service.dismissAlert(idParam(r), who(r), (r.params as { alertId: string }).alertId) });

  fastify.post('/calls/:id/remove-bot', { ...opts, handler: (r) => service.removeBot(idParam(r), who(r)) });
  fastify.post('/calls/:id/end', { ...opts, handler: (r) => service.endCall(idParam(r), who(r)) });
  fastify.post('/calls/:id/demo', { ...opts, handler: (r) => service.runDemo(idParam(r), who(r)) });

  fastify.post('/sync', { ...opts, handler: async (r) => {
    const u = await prisma.user.findUnique({ where: { id: r.userId }, select: { email: true } });
    const count = await syncUserCalendar(r.userId, u!.email);
    await scheduleBots();
    return { count };
  } });

  fastify.get('/settings', { ...opts, handler: (r) => service.getSettings(r.userId) });
  fastify.put('/settings', { ...opts, handler: (r) => service.updateSettings(r.userId, z.object({ enabled: z.boolean().optional(), timezone: z.string().optional() }).parse(r.body)) });

  // Envoie tout de suite l'email du soir au membre connecté (pour vérifier le rendu).
  fastify.post('/recap/test', { ...opts, handler: async (r) => ({ sent: await runEveningRecap({ userId: r.userId }) }) });
}

/** Webhooks Recall.ai (publics, sans session). */
export async function notesRecallRouter(fastify: FastifyInstance) {
  // Transcript temps réel d'un call : l'URL porte le secret propre au call.
  fastify.post('/realtime/:id', {
    schema: { tags },
    config: { rateLimit: false },
    handler: async (r, reply) => {
      const id = idParam(r);
      const secret = (r.query as { secret?: string }).secret;
      const call = await prisma.noteCall.findUnique({ where: { id }, select: { webhookSecret: true, status: true } });
      if (!call || !secret || secret !== call.webhookSecret) return reply.code(404).send({ ok: false });
      reply.code(200).send({ ok: true });

      const body = r.body as any;
      if (body?.event !== 'transcript.data' || ['DONE', 'CANCELLED', 'PROCESSING'].includes(call.status)) return;
      const d = body?.data?.data;
      const words: any[] = d?.words || [];
      const text = words.map((w) => w.text).join(' ').replace(/\s+([,.!?;:])/g, '$1').trim();
      if (!text) return;
      const segment = { speaker: d?.participant?.name || 'Participant', text, t: Number(words[0]?.start_timestamp?.relative ?? 0) };
      appendSegments(id, [segment]).catch((err) => console.error('[Notes] Transcript temps réel:', (err as Error).message));
    },
  });

  // Webhook de statut des bots (à déclarer dans le tableau de bord Recall). Le contenu
  // n'est pas cru sur parole : on relit le bot auprès de l'API Recall.
  fastify.post('/status', {
    schema: { tags },
    config: { rateLimit: false },
    handler: async (r, reply) => {
      reply.code(200).send({ ok: true });
      const body = r.body as any;
      const botId = body?.data?.bot?.id || body?.data?.bot_id;
      if (!botId || !recall.isRecallConfigured()) return;
      const call = await prisma.noteCall.findFirst({ where: { recallBotId: String(botId) }, select: { id: true } });
      if (!call) return;
      try {
        const bot = await recall.getBot(String(botId));
        await applyBotStatus(call.id, recall.lastStatusCode(bot), bot);
      } catch (err) {
        console.error('[Notes] Webhook statut:', (err as Error).message);
      }
    },
  });
}
