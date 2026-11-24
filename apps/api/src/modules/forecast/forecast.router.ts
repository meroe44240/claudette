import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import * as svc from './forecast.service.js';

const admin = [authenticate, requireRole('ADMIN')];
// Process d'entretien et étape des candidats : toute l'équipe (même règle que le MCP)
const team = [authenticate];

const overrideSchema = z.object({
  proba: z.number().min(0).max(100).nullable().optional(),
  feeEur: z.number().nonnegative().nullable().optional(),
  billingMonth: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional(),
});

const settingsSchema = z.object({
  probaEnvoyeClient: z.number().min(0).max(100).optional(),
  probaPremiereEtape: z.number().min(0).max(100).optional(),
  probaDerniereEtape: z.number().min(0).max(100).optional(),
  probaSansProcess: z.number().min(0).max(100).optional(),
  probaOffre: z.number().min(0).max(100).optional(),
  bonusAutresCandidats: z.number().min(0).max(100).optional(),
  objectifFactureAnnuel: z.number().int().nonnegative().nullable().optional(),
});

/** Forecast « Pipe partagé » : réservé à l'admin, sauf le process d'entretien (le MCP a ses propres règles d'accès). */
export default async function forecastRouter(fastify: FastifyInstance) {
  fastify.get('/', { preHandler: admin }, async (request) => {
    const q = request.query as Record<string, string | undefined>;
    return svc.getForecast({
      personId: q.personId || undefined,
      source: q.source || undefined,
      billingFrom: q.billingFrom || undefined,
      billingTo: q.billingTo || undefined,
      lostSince: q.lostSince || undefined,
    });
  });

  fastify.get('/snapshots', { preHandler: admin }, async () => svc.listSnapshots());

  fastify.patch('/deals/:candidatureId', { preHandler: admin }, async (request) => {
    const { candidatureId } = request.params as { candidatureId: string };
    const body = overrideSchema.parse(request.body ?? {});
    await svc.overrideDeal(candidatureId, body, request.userId);
    return { ok: true };
  });

  fastify.put('/mandats/:mandatId/process', { preHandler: team }, async (request) => {
    const { mandatId } = request.params as { mandatId: string };
    const { steps } = z.object({ steps: z.array(z.string().max(200)).max(20) }).parse(request.body ?? {});
    return { steps: await svc.setInterviewProcess(mandatId, steps) };
  });

  fastify.patch('/candidatures/:candidatureId/process-step', { preHandler: team }, async (request) => {
    const { candidatureId } = request.params as { candidatureId: string };
    const body = z.object({
      step: z.number().int().min(1).nullable().optional(),
      nextInterviewAt: z.string().datetime().nullable().optional(),
      waitingSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    }).parse(request.body ?? {});
    return svc.setCandidateProcessStep(candidatureId, body);
  });

  fastify.post('/lost', { preHandler: admin }, async (request) => {
    const body = z.object({
      mandatId: z.string().uuid(),
      candidatureId: z.string().uuid().nullable().optional(),
      feeEur: z.number().nonnegative(),
      reason: z.string().min(1).max(2000),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(request.body ?? {});
    return svc.addLostDeal(body, request.userId);
  });

  fastify.patch('/lost/:id', { preHandler: admin }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z.object({ reason: z.string().min(1).max(2000).optional(), feeEur: z.number().nonnegative().optional() }).parse(request.body ?? {});
    return svc.updateLostDeal(id, body);
  });

  fastify.get('/settings', { preHandler: admin }, async () => {
    const [settings, fx] = await Promise.all([svc.getSettings(), svc.listFxRates()]);
    return { settings, fx_rates: fx };
  });

  fastify.patch('/settings', { preHandler: admin }, async (request) => svc.updateSettings(settingsSchema.parse(request.body ?? {}) as any));

  fastify.put('/fx-rates', { preHandler: admin }, async (request) => {
    const body = z.object({
      devise: z.string().regex(/^[A-Za-z]{3}$/),
      tauxVersEur: z.number().positive(),
      dateEffet: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(request.body ?? {});
    return svc.upsertFxRate(body.devise, body.tauxVersEur, new Date(`${body.dateEffet}T00:00:00Z`));
  });
}
