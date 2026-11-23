import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../index.js';
import prisma, { rawPrisma } from '../../../lib/db.js';
import { hashPassword } from '../../../lib/password.js';
import { runWithContext } from '../../../lib/request-context.js';
import { createAgent } from '../../agents/agents.service.js';
import { wonCa, caOwnerWhere } from '../../stats/ca-objectif.helper.js';

// Correctifs de suivi : journal différé dans les transactions, garde-fou suppression candidat,
// événements des créations en masse, dépôt de CV par MCP, création de mandat ouverte à tous,
// CA attribué au sales.

let app: FastifyInstance;
let baseUrl = '';
const P = 'FX8';
let agentKey = '';
let agentId = '';
let agentSession = '';
let recruteurToken = '';
let recruteurSession = '';
let recruteurId = '';
let salesId = '';
const RECRUTEUR = 'fx8-recruteur@humanup.io';
const SALES = 'fx8-sales@humanup.io';

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
  parse((await mcpPost(who === 'agent' ? agentKey : recruteurToken, { jsonrpc: '2.0', id: n++, method: 'tools/call', params: { name, arguments: args } }, who === 'agent' ? agentSession : recruteurSession)).text);
const openSession = async (key: string) => (await mcpPost(key, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).headers.get('mcp-session-id')!;
const asRecruteur = <T>(fn: () => Promise<T>) => runWithContext({ source: "WEB", userId: recruteurId }, async () => await fn());

beforeAll(async () => {
  app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  const old = await rawPrisma.user.findMany({ where: { estAgent: true, prenom: `${P}agent` }, select: { id: true } });
  for (const o of old) { await rawPrisma.mcpActionLog.deleteMany({ where: { userId: o.id } }); await rawPrisma.user.delete({ where: { id: o.id } }); }
  const a = await createAgent(`${P}agent`);
  agentKey = a.key; agentId = a.agent.id;
  agentSession = await openSession(agentKey);
  for (const [email, set] of [[RECRUTEUR, (id: string) => { recruteurId = id; }], [SALES, (id: string) => { salesId = id; }]] as const) {
    const u = await prisma.user.upsert({
      where: { email }, update: { status: 'ACTIVE' },
      create: { email, passwordHash: await hashPassword('TestPass1'), nom: email.split('@')[0], role: 'RECRUTEUR', mustChangePassword: false },
    });
    set(u.id);
  }
  recruteurToken = (await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: RECRUTEUR, password: 'TestPass1' } })).json().accessToken;
  recruteurSession = await openSession(recruteurToken);
});

afterAll(async () => {
  const cands = await prisma.candidat.findMany({ where: { nom: { startsWith: P } }, select: { id: true } });
  const mandats = await prisma.mandat.findMany({ where: { titrePoste: { startsWith: P } }, select: { id: true } });
  await prisma.stageHistory.deleteMany({ where: { candidature: { mandatId: { in: mandats.map((m) => m.id) } } } });
  await prisma.candidature.deleteMany({ where: { mandatId: { in: mandats.map((m) => m.id) } } });
  await prisma.activite.deleteMany({ where: { entiteId: { in: [...cands.map((c) => c.id), ...mandats.map((m) => m.id)] } } });
  await prisma.mandat.deleteMany({ where: { id: { in: mandats.map((m) => m.id) } } });
  await prisma.candidat.deleteMany({ where: { id: { in: cands.map((c) => c.id) } } });
  await prisma.lead.deleteMany({ where: { company: { startsWith: P } } });
  await prisma.entreprise.deleteMany({ where: { nom: { startsWith: P } } });
  const users = [agentId, recruteurId, salesId];
  await rawPrisma.auditLog.deleteMany({ where: { OR: [{ userId: { in: users } }, { entityLabel: { startsWith: P } }] } });
  await rawPrisma.trashEntry.deleteMany({ where: { label: { startsWith: P } } });
  await rawPrisma.mcpActionLog.deleteMany({ where: { userId: { in: users } } });
  await rawPrisma.mcpIdempotencyKey.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await app.close();
  await rawPrisma.$disconnect();
});

describe('Journal différé dans les transactions', () => {
  it("une transaction annulée ne laisse ni journal ni corbeille ; une transaction validée journalise", async () => {
    const keep = await prisma.entreprise.create({ data: { nom: `${P} ToDelete` } });
    await expect(asRecruteur(() => prisma.$transaction(async (tx) => {
      await tx.entreprise.create({ data: { nom: `${P} Rolled back` } });
      await tx.entreprise.delete({ where: { id: keep.id } });
      throw new Error('boom');
    }))).rejects.toThrow('boom');
    expect(await prisma.entreprise.count({ where: { nom: `${P} Rolled back` } })).toBe(0);
    expect(await prisma.entreprise.count({ where: { id: keep.id } })).toBe(1);
    expect(await rawPrisma.auditLog.count({ where: { entityLabel: `${P} Rolled back` } })).toBe(0);
    expect(await rawPrisma.trashEntry.count({ where: { recordId: keep.id } })).toBe(0);

    await asRecruteur(() => prisma.$transaction(async (tx) => {
      await tx.entreprise.create({ data: { nom: `${P} Committed` } });
    }));
    const logged = await rawPrisma.auditLog.findFirst({ where: { entityLabel: `${P} Committed` } });
    expect(logged).toMatchObject({ action: 'CREATE', userId: recruteurId });
  });
});

describe('Garde-fou de suppression des candidats', () => {
  it('delete_record et bulk_delete_records refusent un candidat en process, acceptent un candidat sorti', async () => {
    const ent = await prisma.entreprise.create({ data: { nom: `${P} Guard SA` } });
    const m = await prisma.mandat.create({ data: { titrePoste: `${P} Guard`, entrepriseId: ent.id } });
    const c = await prisma.candidat.create({ data: { nom: `${P}Guard` } });
    const ca = await prisma.candidature.create({ data: { mandatId: m.id, candidatId: c.id, stage: 'ENTRETIEN_1' } });
    const r = await call('delete_record', { entity: 'candidate', id: c.id });
    expect(r.error).toContain('still in process');
    const b = await call('bulk_delete_records', { entity: 'candidate', ids: [c.id] });
    expect(b.items[0].error).toContain('still in process');
    expect(await prisma.candidat.count({ where: { id: c.id } })).toBe(1);
    await prisma.candidature.update({ where: { id: ca.id }, data: { stage: 'REFUSE' } });
    const ok = await call('delete_record', { entity: 'candidate', id: c.id });
    expect(ok.deleted).toBe(true);
  });
});

describe('Créations en masse', () => {
  it('une insertion groupée de leads donne un événement par lead', async () => {
    const since = new Date(Date.now() - 1000).toISOString();
    await asRecruteur(() => prisma.lead.createMany({ data: [{ company: `${P} Bulk A`, contact: 'a' }, { company: `${P} Bulk B`, contact: 'b' }] }));
    const ids = (await prisma.lead.findMany({ where: { company: { startsWith: `${P} Bulk` } }, select: { id: true } })).map((l) => l.id);
    const ev = await call('get_events', { since, types: ['lead.created'], limit: 500 });
    const mine = ev.events.filter((e: any) => ids.includes(e.entity.id));
    expect(mine).toHaveLength(2);
    expect(mine[0].by.id).toBe(recruteurId);
  });
});

describe('Dépôt de CV par MCP', () => {
  it('upload_candidate_cv attache le PDF et produit document.added ; get_cv_upload_link donne un lien', async () => {
    const since = new Date(Date.now() - 1000).toISOString();
    const c = await prisma.candidat.create({ data: { nom: `${P}Cv`, prenom: 'Léa' } });
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF').toString('base64');
    const r = await call('upload_candidate_cv', { candidate_id: c.id, file_base64: pdf, filename: 'CV Lea.pdf' });
    expect(r.success).toBe(true);
    expect(r.cv_url).toBeTruthy();
    expect((await prisma.candidat.findUnique({ where: { id: c.id } }))?.cvUrl).toBe(r.cv_url);
    const ev = await call('get_events', { since, types: ['document.added'], entity_id: c.id });
    expect(ev.events[0]?.details?.kind).toBe('cv');
    const bad = await call('upload_candidate_cv', { candidate_id: c.id, file_base64: Buffer.from('not a pdf').toString('base64') });
    expect(bad.error).toBeTruthy();
    const link = await call('get_cv_upload_link', { candidate_id: c.id });
    expect(link.upload_page_url).toContain('/depot-cv?token=');
  });
});

describe('Création de mandat', () => {
  it('un recruteur crée un mandat par MCP', async () => {
    const ent = await prisma.entreprise.create({ data: { nom: `${P} Mandate SA` } });
    const r = await call('create_mandate', { titrePoste: `${P} By recruiter`, entrepriseId: ent.id }, 'recruteur');
    expect(r.success).toBe(true);
  });
});

describe('CA attribué au sales', () => {
  it('le sales a le CA, pas le recruteur ; sans sales, l’assigné', async () => {
    const ent = await prisma.entreprise.create({ data: { nom: `${P} CA SA` } });
    const now = new Date();
    await prisma.mandat.create({ data: { titrePoste: `${P} Binome`, entrepriseId: ent.id, statut: 'GAGNE', feeMontantFacture: 10000, salesId, recruteurId, assignedToId: recruteurId, dateCloture: now } });
    await prisma.mandat.create({ data: { titrePoste: `${P} Solo`, entrepriseId: ent.id, statut: 'GAGNE', feeMontantFacture: 5000, assignedToId: recruteurId, dateCloture: now } });
    const range = { start: new Date(now.getTime() - 86400_000), end: new Date(now.getTime() + 86400_000) };
    expect(await wonCa(range, salesId)).toBe(10000);
    expect(await wonCa(range, recruteurId)).toBe(5000);
    const team = await prisma.mandat.count({ where: { titrePoste: { startsWith: P }, statut: 'GAGNE', ...caOwnerWhere(recruteurId) } });
    expect(team).toBe(1);
  });
});
