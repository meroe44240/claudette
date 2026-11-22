import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../index.js';
import prisma, { rawPrisma } from '../../lib/db.js';
import { hashPassword } from '../../lib/password.js';

// Lot 1 : comptes agents, journal d'audit, corbeille et restauration.

let app: FastifyInstance;
let adminToken = '';
let recruteurToken = '';
let agentId = '';
let agentKey = '';
let mandatId = '';

const ADMIN = 'l1-admin@humanup.io';
const RECRUTEUR = 'l1-recruteur@humanup.io';
const bearer = (tok: string) => ({ authorization: `Bearer ${tok}` });
const asAgent = () => ({ 'x-api-key': agentKey });

async function login(email: string) {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: 'TestPass1' } });
  return res;
}

/** Ouvre une session MCP et renvoie l'en-tête de session. */
async function mcpInit(key: string) {
  const res = await app.inject({
    method: 'POST', url: '/mcp',
    headers: { authorization: `Bearer ${key}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json' },
    payload: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
  });
  return { res, session: res.headers['mcp-session-id'] as string | undefined };
}

async function mcpCall(key: string, session: string, name: string, args: Record<string, unknown>, id = 2) {
  return app.inject({
    method: 'POST', url: '/mcp',
    headers: { authorization: `Bearer ${key}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json', 'mcp-session-id': session },
    payload: { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } },
  });
}

/** Le transport MCP répond en SSE : on extrait le JSON du message. */
function mcpResult(body: string): any {
  const line = body.split('\n').find((l) => l.startsWith('data: '));
  const msg = JSON.parse(line ? line.slice(6) : body);
  const text = msg.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : msg;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  for (const [email, role] of [[ADMIN, 'ADMIN'], [RECRUTEUR, 'RECRUTEUR']] as const) {
    await prisma.user.upsert({
      where: { email },
      update: { role, status: 'ACTIVE' },
      create: { email, passwordHash: await hashPassword('TestPass1'), nom: email.split('@')[0], role, mustChangePassword: false },
    });
  }
  adminToken = (await login(ADMIN)).json().accessToken;
  recruteurToken = (await login(RECRUTEUR)).json().accessToken;
  const ent = await prisma.entreprise.create({ data: { nom: 'L1 Test SA' } });
  const cli = await prisma.client.create({ data: { nom: 'L1Client', entrepriseId: ent.id } });
  const m = await prisma.mandat.create({ data: { titrePoste: 'L1 Poste test', entrepriseId: ent.id, clientId: cli.id } });
  mandatId = m.id;
});

afterAll(async () => {
  await prisma.candidature.deleteMany({ where: { mandatId } });
  await prisma.mandat.deleteMany({ where: { id: mandatId } });
  await prisma.client.deleteMany({ where: { nom: 'L1Client' } });
  await prisma.entreprise.deleteMany({ where: { nom: 'L1 Test SA' } });
  await prisma.candidat.deleteMany({ where: { nom: { startsWith: 'L1Cand' } } });
  await rawPrisma.auditLog.deleteMany({ where: { user: { email: { in: [ADMIN, RECRUTEUR] } } } });
  await rawPrisma.auditLog.deleteMany({ where: { userId: agentId } });
  await rawPrisma.mcpActionLog.deleteMany({ where: { userId: agentId } });
  await prisma.user.deleteMany({ where: { OR: [{ email: { in: [ADMIN, RECRUTEUR] } }, { id: agentId }] } });
  await app.close();
  await rawPrisma.$disconnect();
});

describe('Comptes agents', () => {
  it('seul un admin gère les agents', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/agents', headers: bearer(recruteurToken) });
    expect(res.statusCode).toBe(403);
  });

  it('un admin crée un agent et reçoit sa clé une seule fois', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/agents', headers: bearer(adminToken), payload: { name: 'L1Testagent' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    agentId = body.agent.id;
    agentKey = body.key;
    expect(agentKey).toMatch(/^pk_agent_/);
    const stored = await rawPrisma.user.findUnique({ where: { id: agentId } });
    expect(stored?.estAgent).toBe(true);
    expect(stored?.nom).toBe('(agent)');
    expect(stored?.apiKeyHash).toBeTruthy();
    expect(stored?.apiKey).toBeNull(); // la clé en clair n'est pas gardée
    const list = await app.inject({ method: 'GET', url: '/api/v1/agents', headers: bearer(adminToken) });
    const row = list.json().data.find((a: any) => a.id === agentId);
    expect(row.key.prefix).toBe(agentKey.slice(0, 14));
    expect(JSON.stringify(list.json())).not.toContain(agentKey);
  });

  it("un agent ne peut pas se connecter à l'interface", async () => {
    await rawPrisma.user.update({ where: { id: agentId }, data: { passwordHash: await hashPassword('TestPass1') } });
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: (await rawPrisma.user.findUnique({ where: { id: agentId } }))!.email, password: 'TestPass1' } });
    expect(res.statusCode).toBe(401);
  });

  it("les agents n'apparaissent pas dans la liste des utilisateurs de Paramètres", async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/settings/users', headers: bearer(adminToken) });
    expect(JSON.stringify(res.json())).not.toContain(agentId);
  });
});

describe("Journal d'audit", () => {
  let candidatId = '';

  it("une création et une modification par l'agent sont attribuées à l'agent, avec l'avant et l'après", async () => {
    const created = await app.inject({ method: 'POST', url: '/api/v1/candidats', headers: asAgent(), payload: { nom: 'L1Cand', prenom: 'Sam', email: 'l1cand@example.com' } });
    expect(created.statusCode).toBe(201);
    candidatId = created.json().id;
    const upd = await app.inject({ method: 'PUT', url: `/api/v1/candidats/${candidatId}`, headers: asAgent(), payload: { posteActuel: 'Account Executive' } });
    expect(upd.statusCode).toBe(200);

    const res = await app.inject({ method: 'GET', url: `/api/v1/audit?user_id=${agentId}&entity_type=CANDIDAT&entity_id=${candidatId}`, headers: bearer(adminToken) });
    const rows = res.json().data;
    const update = rows.find((r: any) => r.action === 'UPDATE');
    expect(rows.some((r: any) => r.action === 'CREATE')).toBe(true);
    expect(update.by.name).toBe('L1Testagent (agent)');
    expect(update.by.is_agent).toBe(true);
    expect(update.changes.posteActuel).toEqual({ old: null, new: 'Account Executive' });
    expect(update.before.posteActuel).toBeNull();
    expect(update.after.posteActuel).toBe('Account Executive');
  });

  it("l'historique d'une fiche est lisible par tous", async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/audit/history/CANDIDAT/${candidatId}`, headers: bearer(recruteurToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBeGreaterThanOrEqual(2);
  });

  it('la page Journal est réservée aux admins', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/audit', headers: bearer(recruteurToken) });
    expect(res.statusCode).toBe(403);
  });
});

describe('Corbeille', () => {
  let candidatId = '';
  let candidatureId = '';

  it('une suppression part en corbeille avec ce qu’elle emporte, et se restaure en un appel', async () => {
    const c = await prisma.candidat.create({ data: { nom: 'L1CandTrash', prenom: 'Alex', email: 'l1trash@example.com', tags: ['A-Player'] } });
    candidatId = c.id;
    const cand = await prisma.candidature.create({ data: { candidatId, mandatId, stage: 'CONTACTE' } });
    candidatureId = cand.id;
    await prisma.stageHistory.create({ data: { candidatureId, fromStage: 'SOURCING', toStage: 'CONTACTE' } });

    // Suppression depuis l'interface (réservée aux admins sur cette route).
    const del = await app.inject({ method: 'DELETE', url: `/api/v1/candidats/${candidatId}`, headers: bearer(adminToken) });
    expect(del.statusCode).toBeLessThan(300);
    expect(await rawPrisma.candidat.findUnique({ where: { id: candidatId } })).toBeNull();
    expect(await rawPrisma.candidature.findUnique({ where: { id: candidatureId } })).toBeNull();

    const list = await app.inject({ method: 'GET', url: '/api/v1/corbeille?q=L1CandTrash', headers: bearer(recruteurToken) });
    const row = list.json().data[0];
    expect(row.deleted_by.name).toBe('l1-admin');
    expect(row.deleted_by.is_agent).toBe(false);
    expect(row.source).toBe('WEB');
    // La candidature (supprimée par le service avant la fiche) est dans le même lot.
    const entries = await rawPrisma.trashEntry.findMany({ where: { batchId: row.batch_id } });
    expect(entries.map((e) => e.model).sort()).toEqual(['Candidat', 'Candidature', 'StageHistory']);

    // Restauration en un appel, par l'identifiant de la fiche supprimée.
    const res = await app.inject({ method: 'POST', url: `/api/v1/corbeille/${candidatId}/restore`, headers: bearer(recruteurToken) });
    expect(res.statusCode).toBe(200);
    const back = await rawPrisma.candidat.findUnique({ where: { id: candidatId } });
    expect(back?.email).toBe('l1trash@example.com');
    expect(back?.tags).toEqual(['A-Player']);
    expect(back?.createdAt.toISOString()).toBe(c.createdAt.toISOString());
    expect((await rawPrisma.candidature.findUnique({ where: { id: candidatureId } }))?.stage).toBe('CONTACTE');
    expect(await rawPrisma.stageHistory.count({ where: { candidatureId } })).toBe(1);

    // Une seconde restauration du même lot est refusée clairement.
    const again = await app.inject({ method: 'POST', url: `/api/v1/corbeille/${row.batch_id}/restore`, headers: bearer(recruteurToken) });
    expect(again.statusCode).toBe(400);
    expect(again.json().error?.message ?? again.json().message).toMatch(/already restored/);
  });

  it('la restauration échoue proprement si une autre fiche a pris la même valeur unique', async () => {
    // Un profil recherché est unique par (société, fonction, intitulé).
    const ent = await prisma.entreprise.create({ data: { nom: 'L1 Unique SA' } });
    const data = { entrepriseId: ent.id, fonction: 'SALES' as const, intituleType: 'AE', intituleCle: 'ae' };
    const p = await prisma.profilRecherche.create({ data });
    await prisma.profilRecherche.delete({ where: { id: p.id } });
    await prisma.profilRecherche.create({ data });
    const res = await app.inject({ method: 'POST', url: `/api/v1/corbeille/${p.id}/restore`, headers: bearer(adminToken) });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).toMatch(/another record already uses the same/);
    await prisma.entreprise.deleteMany({ where: { id: ent.id } });
  });

  it("l'effacement RGPD ne laisse rien en corbeille", async () => {
    const c = await prisma.candidat.create({ data: { nom: 'L1CandRgpd', prenom: 'Lou' } });
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/candidats/${c.id}/gdpr-delete`, headers: bearer(adminToken) });
    expect(res.statusCode).toBeLessThan(300);
    expect(await rawPrisma.trashEntry.count({ where: { recordId: c.id } })).toBe(0);
    expect(await rawPrisma.candidat.findUnique({ where: { id: c.id } })).toBeNull();
  });

  it('seul un administrateur humain vide la corbeille', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/corbeille', headers: bearer(recruteurToken) });
    expect(res.statusCode).toBe(403);
    const asAgentRes = await app.inject({ method: 'DELETE', url: '/api/v1/corbeille', headers: asAgent() });
    expect(asAgentRes.statusCode).toBe(403);
  });
});

describe('MCP : clé, suspension, limite de débit, attribution', () => {
  it("un appel d'outil MCP de l'agent est journalisé à son nom avec le nom de l'outil", async () => {
    const { res, session } = await mcpInit(agentKey);
    expect(res.statusCode).toBe(200);
    expect(session).toBeTruthy();
    const c = await prisma.candidat.create({ data: { nom: 'L1CandMcp', prenom: 'Mo' } });
    const call = await mcpCall(agentKey, session!, 'delete_candidate', { candidate_id: c.id });
    expect(call.statusCode).toBe(200);
    const trash = await rawPrisma.trashEntry.findFirst({ where: { recordId: c.id } });
    expect(trash?.toolName).toBe('delete_candidate');
    expect(trash?.source).toBe('MCP');
    expect(trash?.deletedById).toBe(agentId);
    const restore = await mcpCall(agentKey, session!, 'restore_record', { id: c.id }, 3);
    expect(mcpResult(restore.body).restored.some((r: any) => r.id === c.id)).toBe(true);
    const log = await rawPrisma.auditLog.findFirst({ where: { entityId: c.id, action: 'DELETE' } });
    expect(log?.toolName).toBe('delete_candidate');
    expect(log?.userId).toBe(agentId);
  });

  it('un outil externe est marqué « externe »', async () => {
    const { session } = await mcpInit(agentKey);
    // send_email échoue sans Gmail branché, mais l'appel reste tracé comme externe.
    await mcpCall(agentKey, session!, 'send_email', { to_email: 'nobody@example.com', subject: 'Test', body: 'Test' });
    const log = await rawPrisma.mcpActionLog.findFirst({ where: { userId: agentId, toolName: 'send_email' }, orderBy: { createdAt: 'desc' } });
    expect(log?.externe).toBe(true);
  });

  it('la limite de débit par agent renvoie un message clair', async () => {
    await app.inject({ method: 'PUT', url: `/api/v1/agents/${agentId}`, headers: bearer(adminToken), payload: { rate_limit_per_minute: 2 } });
    const { session } = await mcpInit(agentKey);
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await mcpCall(agentKey, session!, 'list_trash', {}, 10 + i)).statusCode);
    expect(codes).toContain(429);
    const last = await mcpCall(agentKey, session!, 'list_trash', {}, 20);
    expect(last.json().error.message).toMatch(/Rate limit reached: 2 tool calls per minute/);
    await app.inject({ method: 'PUT', url: `/api/v1/agents/${agentId}`, headers: bearer(adminToken), payload: { rate_limit_per_minute: 120 } });
  });

  it("suspendre un agent coupe son accès immédiatement, réactiver le rend", async () => {
    await app.inject({ method: 'POST', url: `/api/v1/agents/${agentId}/suspend`, headers: bearer(adminToken) });
    expect((await mcpInit(agentKey)).res.statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/candidats', headers: asAgent() })).statusCode).toBe(401);
    await app.inject({ method: 'POST', url: `/api/v1/agents/${agentId}/reactivate`, headers: bearer(adminToken) });
    expect((await mcpInit(agentKey)).res.statusCode).toBe(200);
  });

  it("une nouvelle clé remplace l'ancienne, une clé révoquée ne marche plus", async () => {
    const old = agentKey;
    const rot = await app.inject({ method: 'POST', url: `/api/v1/agents/${agentId}/key`, headers: bearer(adminToken) });
    agentKey = rot.json().key;
    expect((await mcpInit(old)).res.statusCode).toBe(401);
    expect((await mcpInit(agentKey)).res.statusCode).toBe(200);
    await app.inject({ method: 'DELETE', url: `/api/v1/agents/${agentId}/key`, headers: bearer(adminToken) });
    expect((await mcpInit(agentKey)).res.statusCode).toBe(401);
  });
});
