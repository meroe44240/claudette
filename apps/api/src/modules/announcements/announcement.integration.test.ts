import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer, type Server } from 'http';
import { buildApp } from '../../index.js';
import { rawPrisma } from '../../lib/db.js';
import * as webhooks from '../webhooks/webhook.service.js';
import { notifyNewMeeting, notifyPresentation, notifyCloseWon } from './announcement.service.js';

// Annonces #news (Humanup Chat) : trois types seulement, signés, journalisés, repris, dédoublonnés. Slack retiré.

const P = 'ANNT';
let app: FastifyInstance;
let hookServer: Server;
let hookUrl = '';
let failNext = false;
const received: Array<{ headers: Record<string, string | string[] | undefined>; body: string }> = [];
const hookIds: string[] = [];
let entrepriseId = '';
let prospectId = '';
let clientSigneId = '';

const waitFor = async (cond: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  return cond();
};
const of = (type: string) => received.filter((r) => r.headers['x-propium-event'] === type).map((r) => JSON.parse(r.body));

beforeAll(async () => {
  hookServer = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (failNext) { failNext = false; res.writeHead(500).end('nope'); return; }
      received.push({ headers: req.headers, body });
      res.writeHead(200).end('ok');
    });
  });
  await new Promise<void>((r) => hookServer.listen(0, '127.0.0.1', r));
  const ha = hookServer.address();
  hookUrl = `http://127.0.0.1:${typeof ha === 'object' && ha ? ha.port : 0}`;
  app = await buildApp();

  const news = await webhooks.create({ url: `${hookUrl}/news`, eventTypes: Object.keys(webhooks.ANNOUNCEMENT_TYPES), description: `${P} news` });
  const all = await webhooks.create({ url: `${hookUrl}/all`, eventTypes: [], description: `${P} all events` });
  hookIds.push(news.id, all.id);
  (globalThis as any).__newsSecret = news.secret;

  const e = await rawPrisma.entreprise.create({ data: { nom: `${P} Acme` } });
  entrepriseId = e.id;
  prospectId = (await rawPrisma.client.create({ data: { nom: `${P} Lee`, prenom: 'Sarah', entrepriseId, statutClient: 'LEAD' } })).id;
  const e2 = await rawPrisma.entreprise.create({ data: { nom: `${P} Signed Co` } });
  clientSigneId = (await rawPrisma.client.create({ data: { nom: `${P} Martin`, entrepriseId: e2.id, statutClient: 'MANDAT_SIGNE' } })).id;
});

afterAll(async () => {
  await rawPrisma.webhook.deleteMany({ where: { id: { in: hookIds } } });
  await rawPrisma.client.deleteMany({ where: { nom: { startsWith: P } } });
  await rawPrisma.entreprise.deleteMany({ where: { nom: { startsWith: P } } });
  await app.close();
  hookServer.close();
});

describe('announcements → webhooks', () => {
  it('client meeting: signed, typed client or prospect, sent only to subscribers of announcements', async () => {
    await notifyNewMeeting({ titre: `${P} RDV`, recruteurPrenom: 'Valentin', clientNom: 'Sarah Lee', entrepriseNom: 'Acme',
      date: '2026-11-27T03:00:00Z', lieu: 'Meet' }, { key: `${P}-m1`, clientId: prospectId });
    await notifyNewMeeting({ titre: `${P} RDV 2`, recruteurPrenom: 'Valentin', clientNom: 'Paul Martin', entrepriseNom: 'Signed Co',
      date: '2026-11-28T03:00:00Z', lieu: null }, { key: `${P}-m2`, clientId: clientSigneId });
    expect(await waitFor(() => of('announcement.client_meeting').length >= 2)).toBe(true);
    const [m1, m2] = of('announcement.client_meeting');
    expect(m1.details.relationship).toBe('prospect');
    expect(m2.details.relationship).toBe('client');
    expect(m1.details.url).toContain(`/clients/${prospectId}`);
    const r = received.find((x) => x.headers['x-propium-event'] === 'announcement.client_meeting')!;
    expect(r.headers['x-propium-signature']).toBe(webhooks.sign((globalThis as any).__newsSecret, r.body));
    // The "all events" subscription follows the audit log, not announcements.
    expect(received.filter((x) => x.headers['x-propium-event']?.toString().startsWith('announcement.')).length).toBe(of('announcement.client_meeting').length);
  });

  it('closed won: the same placement announced twice is sent once', async () => {
    const data = { candidatPrenom: 'Anh', candidatNom: 'Tran', entrepriseNom: 'Acme', mandatTitre: `${P} CFO`, feeMontant: 18000, recruteurPrenom: 'Vicky' };
    await notifyCloseWon(data, { key: `${P}-c1` });
    await notifyCloseWon(data, { key: `${P}-c1` });
    await waitFor(() => of('announcement.closed_won').length >= 1);
    await new Promise((r) => setTimeout(r, 300));
    expect(of('announcement.closed_won').length).toBe(1);
    expect(of('announcement.closed_won')[0].details.fee).toBe(18000);
  });

  it('a failed delivery is logged and retried until it goes through', async () => {
    failNext = true;
    await notifyPresentation({ candidatPrenom: 'Anh', candidatNom: 'Tran', entrepriseNom: 'Acme', contactNom: 'Sarah Lee',
      mandatTitre: `${P} CFO`, recruteurPrenom: 'Léa', date: new Date('2026-11-27T08:00:00Z') }, { key: `${P}-p1` });
    const row = await rawPrisma.webhookDelivery.findFirst({ where: { webhookId: hookIds[0], eventType: 'announcement.presentation' }, orderBy: { createdAt: 'desc' } });
    expect(row?.status).toBe('pending');
    expect(row?.attempts).toBe(1);
    expect(row?.lastStatus).toBe(500);
    expect(row?.nextAttemptAt).toBeTruthy();
    await rawPrisma.webhookDelivery.update({ where: { id: row!.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    await webhooks.retryDueDeliveries();
    const after = await rawPrisma.webhookDelivery.findUnique({ where: { id: row!.id } });
    expect(after?.status).toBe('delivered');
    expect(after?.attempts).toBe(2);
    expect(of('announcement.presentation').length).toBe(1);
    const log = await webhooks.deliveries(hookIds[0]);
    expect(log.data.some((d) => d.event_type === 'announcement.presentation' && d.status === 'delivered')).toBe(true);
  });

  it('an internal address is allowed only when listed', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(webhooks.create({ url: 'http://humanup-chat-hub:3100/v1/propium/events' })).rejects.toThrow();
      process.env.WEBHOOK_ALLOWED_INTERNAL_HOSTS = 'humanup-chat-hub';
      const w = await webhooks.create({ url: 'http://humanup-chat-hub:3100/v1/propium/events', eventTypes: ['announcement.closed_won'] });
      hookIds.push(w.id);
      await webhooks.update(w.id, { active: false });
    } finally {
      process.env.NODE_ENV = prev;
      delete process.env.WEBHOOK_ALLOWED_INTERNAL_HOSTS;
    }
  });

  it('Slack is gone from the API', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/slack/config' });
    expect(r.statusCode).toBe(404);
  });
});
