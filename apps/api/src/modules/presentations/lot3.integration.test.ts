import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../index.js';
import prisma, { rawPrisma } from '../../lib/db.js';
import { hashPassword } from '../../lib/password.js';
import { createAgent } from '../agents/agents.service.js';
import * as candidatureService from '../candidatures/candidature.service.js';
import { expireOwnerships } from '../ownership/ownership.service.js';
import { opportunityValue } from '../leads/lead.service.js';

// Lot 3 : propriété, présentations, statut de push, valeur d'opportunité.

let app: FastifyInstance;
let baseUrl = '';
const P = 'L3T';
const keys: Record<string, string> = {};
const ids: Record<string, string> = {};
const sessions: Record<string, string> = {};
let recruteurToken = '';
let recruteurId = '';
const RECRUTEUR = 'l3-recruteur@humanup.io';

async function mcpPost(key: string, body: unknown, session?: string) {
  const r = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json', ...(session ? { 'mcp-session-id': session } : {}) },
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
async function call(who: 'tom' | 'ines', name: string, args: Record<string, unknown>) {
  return parse((await mcpPost(keys[who], { jsonrpc: '2.0', id: n++, method: 'tools/call', params: { name, arguments: args } }, sessions[who])).text);
}
const bearer = () => ({ authorization: `Bearer ${recruteurToken}` });

beforeAll(async () => {
  app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  const old = await rawPrisma.user.findMany({ where: { estAgent: true, prenom: { in: [`${P}tom`, `${P}ines`] } }, select: { id: true } });
  for (const o of old) {
    await rawPrisma.mcpActionLog.deleteMany({ where: { userId: o.id } });
    await rawPrisma.user.delete({ where: { id: o.id } });
  }
  for (const who of ['tom', 'ines'] as const) {
    const a = await createAgent(`${P}${who}`);
    keys[who] = a.key; ids[who] = a.agent.id;
    const r = await mcpPost(a.key, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    sessions[who] = r.headers.get('mcp-session-id')!;
  }
  const rec = await prisma.user.upsert({
    where: { email: RECRUTEUR }, update: { status: 'ACTIVE' },
    create: { email: RECRUTEUR, passwordHash: await hashPassword('TestPass1'), nom: 'l3', role: 'RECRUTEUR', mustChangePassword: false },
  });
  recruteurId = rec.id;
  recruteurToken = (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: RECRUTEUR, password: 'TestPass1' } })).json().accessToken;
  const ent = await prisma.entreprise.create({ data: { nom: `${P} Acme` } });
  ids.ent = ent.id;
  const ent2 = await prisma.entreprise.create({ data: { nom: `${P} Beta` } });
  ids.ent2 = ent2.id;
  const cli = await prisma.client.create({ data: { nom: `${P}Client`, entrepriseId: ent.id } });
  ids.cli = cli.id;
  const m = await prisma.mandat.create({ data: { titrePoste: `${P} AE`, entrepriseId: ent.id, clientId: cli.id } });
  ids.mandat = m.id;
  const c = await prisma.candidat.create({ data: { nom: `${P}Martin`, prenom: 'Léa', cvTexte: 'CV', cvConsent: true } });
  ids.cand = c.id;
  const c2 = await prisma.candidat.create({ data: { nom: `${P}Durand`, prenom: 'Paul' } });
  ids.cand2 = c2.id;
});

afterAll(async () => {
  await prisma.presentation.deleteMany({ where: { OR: [{ entrepriseId: { in: [ids.ent, ids.ent2] } }] } });
  await prisma.ownership.deleteMany({ where: { entiteId: { in: [ids.ent, ids.ent2, ids.lead, ids.cli].filter(Boolean) } } });
  await prisma.stageHistory.deleteMany({ where: { candidature: { mandatId: ids.mandat } } });
  await prisma.candidature.deleteMany({ where: { mandatId: ids.mandat } });
  await prisma.activite.deleteMany({ where: { entiteId: { in: [ids.cand, ids.cand2, ids.cli].filter(Boolean) } } });
  await prisma.lead.deleteMany({ where: { company: { startsWith: P } } });
  await prisma.mandat.deleteMany({ where: { id: ids.mandat } });
  await prisma.client.deleteMany({ where: { id: ids.cli } });
  await prisma.candidat.deleteMany({ where: { nom: { startsWith: P } } });
  await prisma.entreprise.deleteMany({ where: { nom: { startsWith: P } } });
  const users = [ids.tom, ids.ines, recruteurId];
  await rawPrisma.auditLog.deleteMany({ where: { userId: { in: users } } });
  await rawPrisma.mcpActionLog.deleteMany({ where: { userId: { in: users } } });
  await rawPrisma.mcpIdempotencyKey.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await app.close();
  await rawPrisma.$disconnect();
});

describe('Propriété', () => {
  it('claim : libre → pris ; déjà pris par un autre → conflit avec le propriétaire, rien ne change', async () => {
    const a = await call('tom', 'claim_owner', { entity: 'company', id: ids.ent, reason: 'Campagne fintech' });
    expect(a.claimed).toBe(true);
    expect(a.owner.name).toBe(`${P}tom (agent)`);
    expect(new Date(a.expires_at).getTime()).toBeGreaterThan(Date.now() + 59 * 86400_000);
    const b = await call('ines', 'claim_owner', { entity: 'company', id: ids.ent });
    expect(b.claimed).toBe(false);
    expect(b.conflict).toBe(true);
    expect(b.current.owner.id).toBe(ids.tom);
    expect(b.current.reason).toBe('Campagne fintech');
    expect((await prisma.entreprise.findUnique({ where: { id: ids.ent } }))?.ownerId).toBe(ids.tom);
  });

  it('get_owner, prolongation, release réservé au propriétaire', async () => {
    const g = await call('ines', 'get_owner', { entity: 'company', id: ids.ent });
    expect(g.owned).toBe(true);
    expect(g.current.owner.is_agent).toBe(true);
    const ext = await call('tom', 'claim_owner', { entity: 'company', id: ids.ent, duration_days: 90 });
    expect(ext.extended).toBe(true);
    const r1 = await call('ines', 'release_owner', { entity: 'company', id: ids.ent });
    expect(r1.released).toBe(false);
    const r2 = await call('tom', 'release_owner', { entity: 'company', id: ids.ent, reason: 'Fin de campagne' });
    expect(r2.released).toBe(true);
    const g2 = await call('ines', 'get_owner', { entity: 'company', id: ids.ent });
    expect(g2.owned).toBe(false);
    expect(g2.history[0].release_reason).toBe('Fin de campagne');
    expect((await prisma.entreprise.findUnique({ where: { id: ids.ent } }))?.ownerId).toBeNull();
  });

  it("le champ ownerId n'est pas modifiable par update_record", async () => {
    const r = await call('tom', 'update_record', { entity: 'company', id: ids.ent, data: { ownerId: ids.tom } });
    expect(r.error).toContain('claim_owner');
  });

  it("une réassignation faite dans l'interface est reconnue et tracée", async () => {
    const lead = await prisma.lead.create({ data: { company: `${P} LeadCo`, contact: 'Anne' } });
    ids.lead = lead.id;
    const res = await app.inject({ method: 'PUT', url: `/api/v1/leads/${lead.id}`, headers: bearer(), payload: { ownerId: recruteurId } });
    expect(res.statusCode).toBe(200);
    const g = await call('tom', 'get_owner', { entity: 'lead', id: lead.id });
    expect(g.current.owner.id).toBe(recruteurId);
    expect(g.current.reason).toBe("Assigné dans l'interface");
    const c = await call('tom', 'claim_owner', { entity: 'lead', id: lead.id });
    expect(c.conflict).toBe(true);
  });

  it('une propriété échue est libérée', async () => {
    await call('ines', 'claim_owner', { entity: 'company', id: ids.ent2, duration_days: 1 });
    await prisma.ownership.updateMany({ where: { entiteId: ids.ent2, releasedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await expireOwnerships()).toBeGreaterThanOrEqual(1);
    expect((await prisma.entreprise.findUnique({ where: { id: ids.ent2 } }))?.ownerId).toBeNull();
    const c = await call('tom', 'claim_owner', { entity: 'company', id: ids.ent2 });
    expect(c.claimed).toBe(true);
  });
});

describe('Présentations et push', () => {
  it('le passage en Envoi client crée la présentation, son statut suit le pipeline', async () => {
    const ca = await candidatureService.create({ mandatId: ids.mandat, candidatId: ids.cand, stage: 'SOURCING' } as any, recruteurId);
    expect(await prisma.presentation.count({ where: { candidatureId: ca.id } })).toBe(0);
    await candidatureService.update(ca.id, { stage: 'ENVOYE_CLIENT' } as any, recruteurId);
    const p = await prisma.presentation.findUnique({ where: { candidatureId: ca.id } });
    expect(p).toMatchObject({ entrepriseId: ids.ent, statut: 'ENVOYEE', source: 'PIPELINE', clientId: ids.cli });
    await candidatureService.update(ca.id, { stage: 'ENTRETIEN_CLIENT', dateEntretienClient: new Date().toISOString(), interlocuteurClient: 'Claire RH' } as any, recruteurId);
    expect((await prisma.presentation.findUnique({ where: { candidatureId: ca.id } }))?.statut).toBe('ENTRETIEN');
  });

  it('is_candidate_presented par id ou par nom', async () => {
    const byId = await call('tom', 'is_candidate_presented', { candidat_id: ids.cand, entreprise_id: ids.ent });
    expect(byId.presented).toBe(true);
    const byName = await call('tom', 'is_candidate_presented', { candidat_id: ids.cand, company_name: `${P.toLowerCase()} acme` });
    expect(byName.presented).toBe(true);
    const no = await call('tom', 'is_candidate_presented', { candidat_id: ids.cand, entreprise_id: ids.ent2 });
    expect(no.presented).toBe(false);
    const unknown = await call('tom', 'is_candidate_presented', { candidat_id: ids.cand, company_name: 'Nope SA' });
    expect(unknown).toMatchObject({ presented: false, company_found: false });
  });

  it('create_presentation signale une présentation antérieure, update_presentation change le statut', async () => {
    const c = await call('tom', 'create_presentation', { candidat_id: ids.cand, entreprise_id: ids.ent, channel: 'linkedin', candidate_consent: true });
    expect(c.already_presented_before).toBe(1);
    expect(c.channel).toBe('LINKEDIN');
    expect(c.presented_by.is_agent).toBe(true);
    expect(c.batch_id).toBeTruthy();
    const bad = await call('tom', 'create_presentation', { candidat_id: ids.cand, entreprise_id: ids.ent, channel: 'pigeon' });
    expect(bad.error).toContain('Canal');
    const u = await call('tom', 'update_presentation', { id: c.id, status: 'INTERESSE' });
    expect(u.status).toBe('INTERESSE');
    const list = await call('ines', 'list_presentations', { entreprise_id: ids.ent });
    expect(list.total).toBe(2);
  });

  it('statut de push : pas prêt sans accord, poussé avec, lien vers le one-pager', async () => {
    const notReady = await call('tom', 'get_candidate_push_status', { candidat_id: ids.cand2 });
    expect(notReady.status).toBe('not_ready');
    expect(notReady.missing).toEqual(['cv', 'cv_consent']);
    const pushed = await call('tom', 'get_candidate_push_status', { candidat_id: ids.cand });
    expect(pushed.status).toBe('pushed');
    expect(pushed.presentations.count).toBe(2);
    expect(pushed.anonymized_cv_url).toContain(`/outils?outil=cv&candidat=${ids.cand}`);
  });

  it('get_record candidate include presentations', async () => {
    const r = await call('tom', 'get_record', { entity: 'candidate', id: ids.cand, include: ['presentations'], fields: ['nom'] });
    expect(r.presentations).toHaveLength(2);
  });

  it('routes de l’interface : liste par société et statut de push', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/presentations?entrepriseId=${ids.ent}`, headers: bearer() });
    expect(res.json().total).toBe(2);
    const ps = await app.inject({ method: 'GET', url: `/api/v1/presentations/push-status/${ids.cand}`, headers: bearer() });
    expect(ps.json().status).toBe('pushed');
  });
});

describe("Valeur d'opportunité", () => {
  it('postes × package × 22 %, null si une donnée manque', () => {
    expect(opportunityValue({ nbPostes: 2, packageMoyen: 70000 })).toBe(30800);
    expect(opportunityValue({ nbPostes: 2, packageMoyen: null })).toBeNull();
  });

  it('update_lead pose les données, get_lead et list_leads renvoient la valeur', async () => {
    const lead2 = await prisma.lead.create({ data: { company: `${P} SmallCo`, contact: 'Bob', nbPostes: 1, packageMoyen: 50000 } });
    const u = await call('tom', 'update_lead', { id: ids.lead, data: { nbPostes: 3, packageMoyen: 80000 } });
    expect(u.changes.nbPostes.new).toBe(3);
    const g = await call('tom', 'get_lead', { id: ids.lead });
    expect(g.valeurOpportunite).toBe(52800);
    const l = await call('tom', 'list_leads', { query: P, sort: 'value' });
    expect(l.leads.map((x: any) => x.company)).toEqual([`${P} LeadCo`, `${P} SmallCo`]);
    expect(l.total_opportunity_value).toBe(52800 + 11000);
    const api = await app.inject({ method: 'GET', url: `/api/v1/leads/${lead2.id}`, headers: bearer() });
    expect(api.json().valeurOpportunite).toBe(11000);
  });
});
