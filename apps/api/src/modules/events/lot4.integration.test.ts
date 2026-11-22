import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer, type Server } from 'http';
import { readFileSync } from 'fs';
import path from 'path';
import { buildApp } from '../../index.js';
import prisma, { rawPrisma } from '../../lib/db.js';
import { hashPassword } from '../../lib/password.js';
import { createAgent } from '../agents/agents.service.js';
import { sign } from '../webhooks/webhook.service.js';
import { buildAgentsMd, collectTools } from '../mcp/agents-md.js';
import { TOOL_PERMISSIONS } from '../mcp/mcp.permissions.js';
import * as documentService from '../documents/document.service.js';
import { runWithContext } from '../../lib/request-context.js';

// Lot 4 : événements, webhooks, describe_schema, AGENTS.md, scénario de bout en bout.

let app: FastifyInstance;
let baseUrl = '';
const P = 'L4T';
let agentKey = '';
let agentId = '';
let session = '';
let recruteurToken = '';
let recruteurSession = '';
let recruteurId = '';
const RECRUTEUR = 'l4-recruteur@humanup.io';
const t0 = new Date(Date.now() - 1000).toISOString();

// Récepteur de webhooks local.
let hookServer: Server;
let hookUrl = '';
const received: Array<{ headers: Record<string, string | string[] | undefined>; body: string }> = [];

async function mcpPost(key: string, body: unknown, s?: string) {
  const r = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json', ...(s ? { 'mcp-session-id': s } : {}) },
    body: JSON.stringify(body),
  });
  return { headers: r.headers, text: await r.text() };
}
function parse(text: string): any {
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  const msg = JSON.parse(line ? line.slice(6) : text);
  const t = msg.result?.content?.[0]?.text;
  return t ? JSON.parse(t) : msg;
}
let n = 10;
const call = async (name: string, args: Record<string, unknown>, who: 'agent' | 'recruteur' = 'agent') =>
  parse((await mcpPost(who === 'agent' ? agentKey : recruteurToken, { jsonrpc: '2.0', id: n++, method: 'tools/call', params: { name, arguments: args } }, who === 'agent' ? session : recruteurSession)).text);
const openSession = async (key: string) => (await mcpPost(key, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).headers.get('mcp-session-id')!;
const waitFor = async (cond: () => boolean, ms = 4000) => { const end = Date.now() + ms; while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 50)); return cond(); };

/** Tous les événements depuis t0, en suivant le curseur. */
async function allEvents(extra: Record<string, unknown> = {}) {
  const out: any[] = [];
  let r = await call('get_events', { since: t0, limit: 500, ...extra });
  out.push(...r.events);
  while (r.has_more) { r = await call('get_events', { cursor: r.next_cursor, limit: 500, ...extra }); out.push(...r.events); }
  return out;
}

const ids: Record<string, string> = {};

beforeAll(async () => {
  hookServer = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { received.push({ headers: req.headers, body }); res.writeHead(req.url === '/fail' ? 500 : 200).end('ok'); });
  });
  await new Promise<void>((r) => hookServer.listen(0, '127.0.0.1', r));
  const ha = hookServer.address();
  hookUrl = `http://127.0.0.1:${typeof ha === 'object' && ha ? ha.port : 0}`;

  app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  const old = await rawPrisma.user.findMany({ where: { estAgent: true, prenom: `${P}agent` }, select: { id: true } });
  for (const o of old) { await rawPrisma.mcpActionLog.deleteMany({ where: { userId: o.id } }); await rawPrisma.user.delete({ where: { id: o.id } }); }
  const a = await createAgent(`${P}agent`);
  agentKey = a.key; agentId = a.agent.id;
  session = await openSession(agentKey);
  const rec = await prisma.user.upsert({
    where: { email: RECRUTEUR }, update: { status: 'ACTIVE' },
    create: { email: RECRUTEUR, passwordHash: await hashPassword('TestPass1'), nom: 'l4', role: 'RECRUTEUR', mustChangePassword: false },
  });
  recruteurId = rec.id;
  recruteurToken = (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: RECRUTEUR, password: 'TestPass1' } })).json().accessToken;
  recruteurSession = await openSession(recruteurToken);
});

afterAll(async () => {
  await rawPrisma.webhook.deleteMany({ where: { createdById: agentId } });
  const cands = await prisma.candidat.findMany({ where: { nom: { startsWith: P } }, select: { id: true } });
  const candIds = cands.map((c) => c.id);
  await prisma.presentation.deleteMany({ where: { candidatId: { in: candIds } } });
  const mandats = await prisma.mandat.findMany({ where: { titrePoste: { startsWith: P } }, select: { id: true } });
  await prisma.stageHistory.deleteMany({ where: { candidature: { mandatId: { in: mandats.map((m) => m.id) } } } });
  await prisma.candidature.deleteMany({ where: { OR: [{ mandatId: { in: mandats.map((m) => m.id) } }, { candidatId: { in: candIds } }] } });
  await prisma.activite.deleteMany({ where: { OR: [{ entiteId: { in: [...candIds, ...mandats.map((m) => m.id)] } }, { titre: { startsWith: P } }] } });
  await prisma.booking.deleteMany({ where: { inviteeName: { startsWith: P } } });
  await prisma.lead.deleteMany({ where: { company: { startsWith: P } } });
  await prisma.mandat.deleteMany({ where: { id: { in: mandats.map((m) => m.id) } } });
  await prisma.client.deleteMany({ where: { nom: { startsWith: P } } });
  await prisma.candidat.deleteMany({ where: { id: { in: candIds } } });
  await prisma.ownership.deleteMany({ where: { ownerId: { in: [agentId, recruteurId] } } });
  await prisma.entreprise.deleteMany({ where: { nom: { startsWith: P } } });
  await rawPrisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: [agentId, recruteurId] } }, { entityLabel: { startsWith: P } }] } });
  await rawPrisma.mcpActionLog.deleteMany({ where: { userId: { in: [agentId, recruteurId] } } });
  await rawPrisma.mcpIdempotencyKey.deleteMany({ where: { userId: { in: [agentId, recruteurId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [agentId, recruteurId] } } });
  await app.close();
  hookServer.close();
  await rawPrisma.$disconnect();
});

describe('AGENTS.md et permissions', () => {
  it('chaque outil enregistré a une entrée de permission', () => {
    const missing = collectTools().map((t) => t.name).filter((t) => !TOOL_PERMISSIONS[t]);
    expect(missing).toEqual([]);
  });

  it('AGENTS.md est à jour (sinon : pnpm --filter @humanup/api gen:agents-md)', () => {
    const file = readFileSync(path.resolve(process.cwd(), '../../AGENTS.md'), 'utf-8').replace(/\r\n/g, '\n');
    expect(file).toBe(buildAgentsMd());
  });
});

describe('describe_schema', () => {
  it('sans entité : liste des entités et codes métier', async () => {
    const r = await call('describe_schema', {});
    expect(r.entities.map((e: any) => e.name)).toContain('presentation');
    expect(r.codes.pipeline_stages).toContainEqual({ code: 'PLACE', label: 'Won' });
    expect(Object.keys(r.codes.event_types)).toContain('stage.changed');
  });

  it('avec entité : champs, valeurs, liens, champs verrouillés', async () => {
    const lead = await call('describe_schema', { entity: 'lead' });
    const stage = lead.fields.find((f: any) => f.name === 'stage');
    expect(stage.values).toContain('rdv');
    expect(stage.writable).toBe(false);
    expect(stage.how_to_change).toContain('move_lead_stage');
    expect(lead.computed[0].name).toBe('valeurOpportunite');
    const client = await call('describe_schema', { entity: 'client' });
    const ent = client.fields.find((f: any) => f.name === 'entrepriseId');
    expect(ent).toMatchObject({ required: true, links_to: 'company' });
    expect(client.fields.find((f: any) => f.name === 'statutClient').values).toContain('MANDAT_SIGNE');
    const bad = await call('describe_schema', { entity: 'candidat_x' });
    expect(bad.error).toContain('Unknown entity');
  });
});

describe('Webhooks', () => {
  it('un recruteur ne gère pas les webhooks', async () => {
    const r = await call('list_webhooks', {}, 'recruteur');
    expect(r.error).toBeTruthy();
  });

  it('création (secret donné une fois), type inconnu refusé, test, envoi signé du bon événement seulement', async () => {
    const bad = await call('create_webhook', { url: `${hookUrl}/hook`, event_types: ['lead.creatd'] });
    expect(bad.error).toContain('lead.creatd');
    const w = await call('create_webhook', { url: `${hookUrl}/hook`, event_types: ['lead.created'], description: `${P} hook` });
    expect(w.secret).toMatch(/^whsec_/);
    ids.hook = w.id;
    const list = await call('list_webhooks', {});
    expect(JSON.stringify(list)).not.toContain(w.secret);
    const t = await call('test_webhook', { id: w.id });
    expect(t).toMatchObject({ delivered: true, status: 200 });

    // D'autres fichiers de tests tournent en parallèle sur la même base : on ne regarde que nos envois.
    const mine = (pred: (p: any) => boolean) => received.filter((r) => { try { return pred(JSON.parse(r.body)); } catch { return false; } });
    const co = await call('create_company', { nom: `${P} NoHookCo` }); // company.created : pas abonné
    const lead = await call('create_lead', { company: `${P} HookCo`, contact: 'Jean' });
    expect(await waitFor(() => mine((p) => p.entity?.id === lead.lead_id).length >= 1)).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    expect(mine((p) => p.entity?.id === lead.lead_id)).toHaveLength(1);
    expect(mine((p) => p.entity?.id === co.company_id)).toHaveLength(0);
    const { headers, body } = mine((p) => p.entity?.id === lead.lead_id)[0];
    expect(headers['x-propium-event']).toBe('lead.created');
    expect(headers['x-propium-signature']).toBe(sign(w.secret, body));
    const payload = JSON.parse(body);
    expect(payload).toMatchObject({ type: 'lead.created', entity: { type: 'lead', id: lead.lead_id }, by: { id: agentId, is_agent: true } });
  });

  it('en pause, plus rien n’est envoyé ; un échec est compté', async () => {
    await call('update_webhook', { id: ids.hook, active: false });
    const paused = await call('create_lead', { company: `${P} PausedCo`, contact: 'Paul' });
    await new Promise((r) => setTimeout(r, 400));
    expect(received.filter((r) => r.body.includes(paused.lead_id))).toHaveLength(0);
    const f = await call('create_webhook', { url: `${hookUrl}/fail`, event_types: [] });
    const r = await call('test_webhook', { id: f.id });
    expect(r).toMatchObject({ delivered: false, status: 500 });
    const row = await rawPrisma.webhook.findUnique({ where: { id: f.id } });
    expect(row?.consecutiveFailures).toBe(1);
    await call('delete_webhook', { id: f.id });
  });
});

describe('get_events', () => {
  it('erreurs claires : date manquante, type inconnu', async () => {
    expect((await call('get_events', {})).error).toContain('since');
    expect((await call('get_events', { since: t0, types: ['nope'] })).error).toContain('nope');
  });

  it('les automatismes produisent aussi des événements (auteur null)', async () => {
    await prisma.booking.create({ data: { userId: recruteurId, slotStart: new Date(), slotEnd: new Date(Date.now() + 1800_000), inviteeName: `${P} Invité`, inviteeEmail: 'x@l4.test' } });
    const evs = await allEvents({ types: ['meeting.created'] });
    const ev = evs.find((e) => e.entity.label === `${P} Invité`);
    expect(ev).toBeTruthy();
    expect(ev.by).toBeNull();
    expect(ev.source).toBe('SYSTEM');
  });

  it('document ajouté (pièce jointe) et curseur sans doublon', async () => {
    const c = await prisma.candidat.create({ data: { nom: `${P}Doc` } });
    await runWithContext({ source: 'WEB', userId: recruteurId }, () => documentService.upload('candidat', c.id, Buffer.from('%PDF-1.4 test'), `${P}-cv.pdf`, 'application/pdf'));
    const evs = await allEvents({ types: ['document.added'] });
    const ev = evs.find((e) => e.details?.filename === `${P}-cv.pdf`);
    expect(ev.details.attached_to).toEqual({ type: 'candidate', id: c.id });
    expect(ev.by.id).toBe(recruteurId);
    const first = await call('get_events', { since: t0, limit: 2 });
    const second = await call('get_events', { cursor: first.next_cursor, limit: 2 });
    const firstIds = new Set(first.events.map((e: any) => e.id));
    expect(second.events.every((e: any) => !firstIds.has(e.id))).toBe(true);
  });
});

describe('Scénario de bout en bout (compte agent)', () => {
  it('société, propriété, candidat avec CV et A-Player, présentation, lead, interactions, étapes jusqu’à Won, événements, puis annulation et restauration', async () => {
    const since = new Date().toISOString();
    // 1. Société + propriété
    const co = await call('create_company', { nom: `${P} Scenario SA`, secteur: 'SaaS' });
    expect(co.success).toBe(true);
    const claim = await call('claim_owner', { entity: 'company', id: co.company_id, reason: 'Scénario de test' });
    expect(claim.claimed).toBe(true);
    // 2. Candidat avec CV, tagué A-Player
    const cand = await call('create_candidate', { nom: `${P}Scenario`, prenom: 'Léa', email: 'lea.scenario@l4.test', tags: ['SaaS'] });
    expect(cand.candidate_id).toBeTruthy();
    const cv = await call('update_record', { entity: 'candidate', id: cand.candidate_id, data: { cvUrl: 'https://files.l4.test/cv.pdf', cvTexte: 'Account Executive, 5 ans SaaS', cvConsent: true } });
    expect(cv.changes.cvUrl.new).toBe('https://files.l4.test/cv.pdf');
    const tag = await call('update_record', { entity: 'candidate', id: cand.candidate_id, data: { aPlayer: true, tags: ['SaaS', 'A-Player'] } });
    expect(tag.changes.aPlayer.new).toBe(true);
    // 3. Mandat + présentation + pipeline jusqu'à Won
    const cli = await call('create_client', { nom: `${P}Client`, prenom: 'Claire', entrepriseId: co.company_id });
    const m = await call('create_mandate', { titrePoste: `${P} Account Executive`, entrepriseId: co.company_id, clientId: cli.client_id, salaireMin: 60000, salaireMax: 70000 });
    expect(m.success).toBe(true);
    const add = await call('add_candidate_to_mandate', { candidate_id: cand.candidate_id, mandate_id: m.mandate_id, stage: 'SOURCING' });
    const ca = add.candidature_id;
    const pres = await call('create_presentation', { candidat_id: cand.candidate_id, entreprise_id: co.company_id, channel: 'LINKEDIN', candidate_consent: true });
    expect(pres.already_presented_before).toBe(0);
    for (const stage of ['CONTACTE', 'ENTRETIEN_1', 'ENVOYE_CLIENT']) {
      expect((await call('move_candidate_stage', { candidature_id: ca, new_stage: stage })).success).toBe(true);
    }
    const noContact = await call('move_candidate_stage', { candidature_id: ca, new_stage: 'ENTRETIEN_CLIENT', date_entretien_client: '2026-12-01T10:00:00' });
    expect(noContact.error).toBe('interlocuteur_client_required');
    expect((await call('move_candidate_stage', { candidature_id: ca, new_stage: 'ENTRETIEN_CLIENT', date_entretien_client: '2026-12-01T10:00:00', interlocuteur_client: 'Claire, HR' })).success).toBe(true);
    expect((await call('move_candidate_stage', { candidature_id: ca, new_stage: 'OFFRE' })).success).toBe(true);
    const won = await call('move_candidate_stage', { candidature_id: ca, new_stage: 'PLACE', fee_montant_facture: 13200, date_demarrage: '2027-01-05', source_placement: 'Chasse', source_lead: 'Outbound' });
    expect(won.stage_label).toBe('Won');
    // Placer le candidat passe le mandat en Gagné (règle de l'interface) : événement mandate.closed.
    expect((await prisma.mandat.findUnique({ where: { id: m.mandate_id } }))?.statut).toBe('GAGNE');
    // 4. Lead + interactions
    const lead = await call('create_lead', { company: `${P} Scenario Lead`, contact: 'Marc' });
    for (const text of ['Premier appel', 'Relance email']) expect((await call('add_lead_interaction', { lead_id: lead.lead_id, text, type: 'appel' })).success).toBe(true);
    expect((await call('move_lead_stage', { lead_id: lead.lead_id, stage: 'r1' })).success).toBe(true);

    // 5. Les événements racontent le scénario
    const evs = await allEvents({ since });
    const types = new Set(evs.map((e: any) => e.type));
    for (const t of ['company.created', 'owner.changed', 'candidate.created', 'candidate.tag_added', 'document.added', 'mandate.created', 'presentation.created', 'stage.changed', 'mandate.closed', 'lead.created']) {
      expect(types.has(t)).toBe(true);
    }
    expect(evs.filter((e: any) => e.type === 'candidate.tag_added').map((e: any) => e.details.tag)).toEqual(expect.arrayContaining(['SaaS', 'A-Player']));
    const toWon = evs.find((e: any) => e.type === 'stage.changed' && e.details?.to === 'PLACE');
    expect(toWon.details.to_label).toBe('Won');
    expect(evs.every((e: any) => e.by?.id === agentId || e.by === null)).toBe(true);

    // 6. Tout annuler ou supprimer, puis restaurer
    const undoPres = await call('undo', { batch_id: pres.batch_id });
    expect(undoPres.summary.reverted).toBeGreaterThanOrEqual(1);
    expect(await prisma.presentation.count({ where: { id: pres.id } })).toBe(0);
    const delLead = await call('delete_lead', { id: lead.lead_id });
    expect(delLead.deleted).toBe(true);
    // Un candidat en process ne se supprime pas (garde-fou métier) : message clair.
    const delCand = await call('delete_candidate', { candidate_id: cand.candidate_id });
    expect(delCand.error).toContain('active');
    // Supprimer la société emporte mandat, candidatures et contacts ; une restauration remet tout.
    const delCo = await call('delete_company', { id: co.company_id });
    expect(delCo.deleted).toBe(true);
    expect(await prisma.mandat.count({ where: { id: m.mandate_id } })).toBe(0);
    expect(await prisma.candidature.count({ where: { id: ca } })).toBe(0);
    const resCo = await call('restore_record', { id: co.company_id });
    expect(resCo.restored.map((r: any) => r.id)).toEqual(expect.arrayContaining([co.company_id, m.mandate_id, ca]));
    const ent = await prisma.entreprise.findUnique({ where: { id: co.company_id } });
    expect(ent?.ownerId).toBe(agentId);
    expect((await prisma.candidature.findUnique({ where: { id: ca } }))?.stage).toBe('PLACE');
    expect((await prisma.candidat.findUnique({ where: { id: cand.candidate_id } }))?.aPlayer).toBe(true);
    const undoDel = await call('undo', { batch_id: delLead.batch_id });
    expect(undoDel.summary.reverted).toBeGreaterThanOrEqual(1);
    const back = await prisma.lead.findUnique({ where: { id: lead.lead_id }, include: { interactions: true } });
    expect(back?.interactions).toHaveLength(2);
  });
});
