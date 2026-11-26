import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../index.js';
import { rawPrisma } from '../../../lib/db.js';
import { hashPassword } from '../../../lib/password.js';
import { createAgent } from '../../agents/agents.service.js';

// Outils MCP de pilotage : RDV pris / effectués / à confirmer, statut d'un RDV, Analytics.

let app: FastifyInstance;
let baseUrl = '';
const P = 'MS9';
const RECRUTEUR = 'ms9-recruteur@humanup.io';
let agentKey = '';
let agentSession = '';
let recruteurId = '';
let meetingId = '';
let n = 10;

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
const call = async (name: string, args: Record<string, unknown>) =>
  parse((await mcpPost(agentKey, { jsonrpc: '2.0', id: n++, method: 'tools/call', params: { name, arguments: args } }, agentSession)).text);

beforeAll(async () => {
  app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;

  const old = await rawPrisma.user.findMany({ where: { estAgent: true, prenom: `${P}agent` }, select: { id: true } });
  for (const o of old) { await rawPrisma.mcpActionLog.deleteMany({ where: { userId: o.id } }); await rawPrisma.user.delete({ where: { id: o.id } }); }
  const a = await createAgent(`${P}agent`);
  agentKey = a.key;
  agentSession = (await mcpPost(agentKey, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).headers.get('mcp-session-id')!;

  const u = await rawPrisma.user.upsert({
    where: { email: RECRUTEUR }, update: { status: 'ACTIVE' },
    create: { email: RECRUTEUR, passwordHash: await hashPassword('TestPass1'), nom: `${P}Recruteur`, prenom: 'Test', role: 'RECRUTEUR', mustChangePassword: false },
  });
  recruteurId = u.id;
  const candidat = await rawPrisma.candidat.create({ data: { nom: `${P}Candidat`, prenom: 'Paul' } });

  // Un RDV d'hier, visio créée par le client : à confirmer.
  const start = new Date(Date.now() - 26 * 3600 * 1000);
  const m = await rawPrisma.activite.create({
    data: {
      type: 'MEETING', source: 'CALENDAR', entiteType: 'CANDIDAT', entiteId: candidat.id, userId: recruteurId,
      titre: `${P} entretien`, createdAt: new Date(start.getTime() - 2 * 86400000),
      metadata: {
        googleEventId: `${P}-evt`, calendarEventType: 'INTERVIEW', summary: `${P} entretien`,
        startTime: start.toISOString(), endTime: new Date(start.getTime() + 3600000).toISOString(),
        attendees: [{ email: 'paul@example.com', role: 'candidat', entityId: candidat.id }],
        rdvStatut: 'A_CONFIRMER', meetCheck: { at: new Date().toISOString(), reason: 'not_organizer' },
        googleCreated: new Date(start.getTime() - 2 * 86400000).toISOString(),
      },
    },
  });
  meetingId = m.id;
});

afterAll(async () => {
  await rawPrisma.activite.deleteMany({ where: { metadata: { path: ['googleEventId'], equals: `${P}-evt` } } });
  await rawPrisma.candidat.deleteMany({ where: { nom: `${P}Candidat` } });
  const agents = await rawPrisma.user.findMany({ where: { estAgent: true, prenom: `${P}agent` }, select: { id: true } });
  for (const o of agents) { await rawPrisma.mcpActionLog.deleteMany({ where: { userId: o.id } }); await rawPrisma.user.delete({ where: { id: o.id } }); }
  await rawPrisma.mcpActionLog.deleteMany({ where: { userId: recruteurId } });
  await rawPrisma.user.deleteMany({ where: { email: RECRUTEUR } });
  await app.close();
});

describe('outils MCP RDV et chiffres', () => {
  it('un agent liste les RDV à confirmer d\'un membre de l\'équipe', async () => {
    const r = await call('list_meetings_to_confirm', { user_id: recruteurId });
    expect(r.count).toBe(1);
    expect(r.meetings[0]).toMatchObject({ meeting_id: meetingId, reason: 'Meet link created by the client' });
  });

  it('un agent marque le RDV effectué et les compteurs suivent', async () => {
    const before = await call('get_meeting_cv_stats', { user_id: recruteurId, period: 'this_quarter' });
    expect(before.people[0].meetings_to_confirm).toBeGreaterThanOrEqual(1);

    expect(await call('set_meeting_status', { meeting_id: meetingId, status: 'HELD' })).toMatchObject({ ok: true });

    const after = await call('get_meeting_cv_stats', { user_id: recruteurId, period: 'this_quarter' });
    expect(after.people[0].meetings_held).toBe(before.people[0].meetings_held + 1);
    expect(after.people[0].meetings_held_by_type.candidate_interviews).toBeGreaterThanOrEqual(1);
    expect((await call('list_meetings_to_confirm', { user_id: recruteurId })).count).toBe(0);
  });

  it('get_analytics renvoie les chiffres de la page Analytics et le classement', async () => {
    const r = await call('get_analytics', { user_id: recruteurId, period: 'this_month' });
    expect(r.scorecards).toHaveProperty('calls');
    expect(Array.isArray(r.pipeline_funnel)).toBe(true);
    expect(Array.isArray(r.leaderboard)).toBe(true);
  });
});
