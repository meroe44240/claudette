import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import * as svc from './forecast.service.js';
import * as cash from './cash.service.js';

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
  objectifScenarioEur: z.number().int().nonnegative().nullable().optional(),
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

  // ─── Trésorerie (lot b) ───────────────────────────────
  const ids = (v?: string) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined);

  fastify.get('/cash', { preHandler: admin }, async (request) => {
    const q = request.query as Record<string, string | undefined>;
    return cash.getCashflowProjection({
      targetMonth: q.targetMonth || undefined,
      delayInvoiceIds: ids(q.delay),
      forceDealIds: ids(q.force),
      objectiveEur: q.objective === undefined || q.objective === '' ? undefined : Number(q.objective),
    });
  });

  fastify.get('/receivables', { preHandler: admin }, async (request) => {
    const q = request.query as Record<string, string | undefined>;
    return cash.getReceivables({ companyId: q.companyId || undefined, overdueOnly: q.overdueOnly === 'true' });
  });

  const dateStr = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/);
  const invoiceSchema = z.object({
    numero: z.string().max(50).nullable().optional(),
    libelle: z.string().max(255).nullable().optional(),
    entrepriseId: z.string().uuid().nullable().optional(),
    mandatId: z.string().uuid().nullable().optional(),
    candidatureId: z.string().uuid().nullable().optional(),
    entite: z.enum(['COURTSIDE_CAPITAL_HK', 'HUMANUP_LONDON', 'HUMANUP_VIET']).nullable().optional(),
    statut: z.enum(['A_FACTURER', 'EMISE', 'PAYEE_PARTIEL', 'PAYEE', 'ANNULEE']).optional(),
    montant: z.number().nonnegative().optional(),
    devise: z.string().regex(/^[A-Za-z]{3}$/).optional(),
    montantEur: z.number().nonnegative().nullable().optional(),
    montantPayeEur: z.number().nonnegative().nullable().optional(),
    moisFacturationPrevu: dateStr.nullable().optional(),
    dateEmission: dateStr.nullable().optional(),
    dateEcheance: dateStr.nullable().optional(),
    datePaiement: dateStr.nullable().optional(),
    moisEncaissementPrevu: dateStr.nullable().optional(),
    aRisque: z.boolean().optional(),
    notes: z.string().max(5000).nullable().optional(),
  });

  fastify.get('/invoices', { preHandler: admin }, async (request) => {
    const q = request.query as Record<string, string | undefined>;
    return cash.listInvoices({ status: q.status || undefined, companyId: q.companyId || undefined, mandateId: q.mandateId || undefined, from: q.from || undefined, to: q.to || undefined });
  });
  fastify.get('/invoices/suggestions', { preHandler: admin }, async () => cash.billingSuggestions());
  fastify.post('/invoices', { preHandler: admin }, async (request) => cash.upsertInvoice(null, invoiceSchema.parse(request.body ?? {}), request.userId));
  fastify.post('/invoices/from-candidature/:candidatureId', { preHandler: admin }, async (request) => {
    const { candidatureId } = request.params as { candidatureId: string };
    return cash.createInvoiceFromCandidature(candidatureId, request.userId, invoiceSchema.partial().parse(request.body ?? {}));
  });
  fastify.patch('/invoices/:id', { preHandler: admin }, async (request) => {
    const { id } = request.params as { id: string };
    return cash.upsertInvoice(id, invoiceSchema.parse(request.body ?? {}), request.userId);
  });
  fastify.delete('/invoices/:id', { preHandler: admin }, async (request) => {
    const { id } = request.params as { id: string };
    await cash.deleteInvoice(id);
    return { ok: true };
  });

  const kindSchema = z.enum(['recurring_revenue', 'cash_account', 'expense', 'owner_draw']);
  const itemSchema = z.object({
    label: z.string().min(1).max(255).optional(),
    name: z.string().min(1).max(100).optional(),
    category: z.string().max(50).nullable().optional(),
    entity: z.enum(['COURTSIDE_CAPITAL_HK', 'HUMANUP_LONDON', 'HUMANUP_VIET']).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    active: z.boolean().optional(),
    monthly_eur: z.number().optional(),
    amount_eur: z.number().optional(),
    balance_eur: z.number().optional(),
    start_month: dateStr.optional(),
    end_month: dateStr.nullable().optional(),
    month: dateStr.optional(),
    balance_date: dateStr.optional(),
  });
  fastify.get('/finance/:kind', { preHandler: admin }, async (request) => cash.listFinanceItems(kindSchema.parse((request.params as any).kind)));
  fastify.post('/finance/:kind', { preHandler: admin }, async (request) =>
    cash.upsertFinanceItem(kindSchema.parse((request.params as any).kind), null, itemSchema.parse(request.body ?? {})));
  fastify.patch('/finance/:kind/:id', { preHandler: admin }, async (request) => {
    const p = request.params as { kind: string; id: string };
    return cash.upsertFinanceItem(kindSchema.parse(p.kind), p.id, itemSchema.parse(request.body ?? {}));
  });
  fastify.delete('/finance/:kind/:id', { preHandler: admin }, async (request) => {
    const p = request.params as { kind: string; id: string };
    await cash.deleteFinanceItem(kindSchema.parse(p.kind), p.id);
    return { ok: true };
  });
}
