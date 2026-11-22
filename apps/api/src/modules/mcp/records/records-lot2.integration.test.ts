import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../index.js';
import prisma, { rawPrisma } from '../../../lib/db.js';
import { hashPassword } from '../../../lib/password.js';
import { createAgent } from '../../agents/agents.service.js';
import { parseCsv } from './csv.js';

// Lot 2 : outils génériques, masse, dry_run, idempotence, undo, recherche, CSV, outils nommés.

let app: FastifyInstance;
let baseUrl = '';
let agentKey = '';
let agentId = '';
let recruteurToken = '';
let agentSession = '';
let recruteurSession = '';
let entrepriseId = '';
let mandatId = '';

const RECRUTEUR = 'l2-recruteur@humanup.io';
const P = 'L2T'; // préfixe des données de test

async function mcpPost(key: string, body: unknown, session?: string) {
  const r = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json',
      ...(session ? { 'mcp-session-id': session } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, headers: r.headers, text: await r.text() };
}

async function openSession(key: string) {
  const r = await mcpPost(key, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
  return r.headers.get('mcp-session-id')!;
}

function parse(text: string): any {
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  const msg = JSON.parse(line ? line.slice(6) : text);
  const t = msg.result?.content?.[0]?.text;
  return t ? JSON.parse(t) : msg;
}

let callId = 10;
async function call(name: string, args: Record<string, unknown>, who: 'agent' | 'recruteur' = 'agent') {
  const r = who === 'agent'
    ? await mcpPost(agentKey, { jsonrpc: '2.0', id: callId++, method: 'tools/call', params: { name, arguments: args } }, agentSession)
    : await mcpPost(recruteurToken, { jsonrpc: '2.0', id: callId++, method: 'tools/call', params: { name, arguments: args } }, recruteurSession);
  return parse(r.text);
}

beforeAll(async () => {
  app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  await prisma.user.upsert({
    where: { email: RECRUTEUR },
    update: { role: 'RECRUTEUR', status: 'ACTIVE' },
    create: { email: RECRUTEUR, passwordHash: await hashPassword('TestPass1'), nom: 'l2', role: 'RECRUTEUR', mustChangePassword: false },
  });
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: RECRUTEUR, password: 'TestPass1' } });
  recruteurToken = login.json().accessToken;
  // Reste d'un essai précédent interrompu : on repart propre.
  const old = await rawPrisma.user.findMany({ where: { estAgent: true, prenom: `${P}agent` }, select: { id: true } });
  for (const o of old) {
    await rawPrisma.mcpActionLog.deleteMany({ where: { userId: o.id } });
    await rawPrisma.mcpIdempotencyKey.deleteMany({ where: { userId: o.id } });
    await rawPrisma.user.delete({ where: { id: o.id } });
  }
  const a = await createAgent(`${P}agent`);
  agentKey = a.key; agentId = a.agent.id;
  agentSession = await openSession(agentKey);
  recruteurSession = await openSession(recruteurToken);
  const ent = await prisma.entreprise.create({ data: { nom: `${P} Acme` } });
  entrepriseId = ent.id;
  const m = await prisma.mandat.create({ data: { titrePoste: `${P} Head of Sales`, entrepriseId, salaireMin: 60000, salaireMax: 80000 } });
  mandatId = m.id;
  for (const [nom, tier] of [['Alpha', 'A'], ['Bravo', 'B'], ['Charlie', 'A']]) {
    await prisma.candidat.create({ data: { nom: `${P}${nom}`, prenom: 'Test', tier, email: `${nom.toLowerCase()}@l2.test`, localisation: 'Paris' } });
  }
});

afterAll(async () => {
  const cands = await prisma.candidat.findMany({ where: { nom: { startsWith: P } }, select: { id: true } });
  await prisma.candidature.deleteMany({ where: { OR: [{ mandatId }, { candidatId: { in: cands.map((c) => c.id) } }] } });
  await prisma.activite.deleteMany({ where: { titre: { startsWith: P } } });
  await prisma.candidat.deleteMany({ where: { nom: { startsWith: P } } });
  await prisma.lead.deleteMany({ where: { company: { startsWith: P } } });
  await prisma.mandat.deleteMany({ where: { titrePoste: { startsWith: P } } });
  await prisma.client.deleteMany({ where: { nom: { startsWith: P } } });
  await prisma.entreprise.deleteMany({ where: { nom: { startsWith: P } } });
  await rawPrisma.mcpIdempotencyKey.deleteMany({ where: { userId: agentId } });
  const rec = await prisma.user.findUnique({ where: { email: RECRUTEUR }, select: { id: true } });
  const ids = [agentId, rec?.id].filter(Boolean) as string[];
  await rawPrisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
  await rawPrisma.mcpActionLog.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { OR: [{ email: RECRUTEUR }, { id: agentId }] } });
  await app.close();
  await rawPrisma.$disconnect();
});

describe('Lecture générique', () => {
  it('list_records : filtre, tri, champs choisis et curseur', async () => {
    const args = { entity: 'candidate', where: { nom: { starts_with: P } }, sort: 'nom', fields: ['nom', 'tier'], limit: 2 };
    const p1 = await call('list_records', args);
    expect(p1.total).toBe(3);
    expect(p1.data.map((r: any) => r.nom)).toEqual([`${P}Alpha`, `${P}Bravo`]);
    expect(Object.keys(p1.data[0]).sort()).toEqual(['id', 'nom', 'tier']);
    expect(p1.next_cursor).toBeTruthy();
    const p2 = await call('list_records', { ...args, cursor: p1.next_cursor });
    expect(p2.data.map((r: any) => r.nom)).toEqual([`${P}Charlie`]);
    expect(p2.next_cursor).toBeNull();
  });

  it('list_records : opérateurs in et texte libre', async () => {
    const r = await call('list_records', { entity: 'candidats', where: { tier: { in: ['A'] } }, q: `${P}alpha` });
    expect(r.data).toHaveLength(1);
    expect(r.data[0].nom).toBe(`${P}Alpha`);
  });

  it('un champ inconnu propose le bon nom', async () => {
    const r = await call('list_records', { entity: 'candidate', where: { nomm: 'x' } });
    expect(r.error).toContain('Did you mean "nom"');
    expect(r.suggestion).toBe('nom');
    const e = await call('list_records', { entity: 'candidat_x' });
    expect(e.error).toContain('Unknown entity');
  });

  it('get_record avec include', async () => {
    const c = await prisma.candidat.findFirst({ where: { nom: `${P}Alpha` } });
    await prisma.candidatExperience.create({ data: { candidatId: c!.id, titre: 'AE', entreprise: 'Acme', anneeDebut: 2020 } });
    await prisma.activite.create({ data: { type: 'NOTE', titre: `${P} note`, entiteType: 'CANDIDAT', entiteId: c!.id } });
    const r = await call('get_record', { entity: 'candidate', id: c!.id, include: ['experiences', 'activities'] });
    expect(r.experiences).toHaveLength(1);
    expect(r.activities[0].titre).toBe(`${P} note`);
    const bad = await call('get_record', { entity: 'candidate', id: c!.id, include: ['experience'] });
    expect(bad.error).toContain('Did you mean "experiences"');
  });

  it('search_all cherche dans tous les types', async () => {
    const r = await call('search_all', { q: `${P} Acme` });
    expect(r.results.company.results[0].label).toBe(`${P} Acme`);
    expect(r.results.candidate.total).toBe(0);
  });
});

describe('Écriture, dry_run, idempotence, undo', () => {
  it('create_record : dry_run ne crée rien, champs obligatoires contrôlés', async () => {
    const dry = await call('create_record', { entity: 'lead', data: { company: `${P} DryCo`, contact: 'X' }, dry_run: true });
    expect(dry.dry_run).toBe(true);
    expect(dry.would_create.company).toBe(`${P} DryCo`);
    expect(await prisma.lead.count({ where: { company: `${P} DryCo` } })).toBe(0);
    expect(dry.batch_id).toBeUndefined();
    const missing = await call('create_record', { entity: 'lead', data: { company: `${P} NoContact` } });
    expect(missing.error).toContain('contact');
  });

  it("idempotency_key : un second appel rejoue la réponse sans recréer", async () => {
    const args = { entity: 'lead', data: { company: `${P} IdemCo`, contact: 'Jean' }, idempotency_key: 'l2-idem-1' };
    const a = await call('create_record', args);
    const b = await call('create_record', args);
    expect(b.id).toBe(a.id);
    expect(b.idempotent_replay).toBe(true);
    expect(await prisma.lead.count({ where: { company: `${P} IdemCo` } })).toBe(1);
    const other = await call('create_record', { ...args, data: { company: `${P} Other`, contact: 'Z' } });
    expect(other.error).toContain('already used');
  });

  it('update_record renvoie avant / après, undo remet la valeur, un second undo est refusé', async () => {
    const u = await call('update_record', { entity: 'company', id: entrepriseId, data: { secteur: 'Fintech', taille: 'pme' } });
    expect(u.changes.secteur).toEqual({ old: null, new: 'Fintech' });
    expect(u.changes.taille.new).toBe('PME');
    expect(u.batch_id).toBeTruthy();
    const undo = await call('undo', { batch_id: u.batch_id });
    expect(undo.summary.reverted).toBe(1);
    const e = await prisma.entreprise.findUnique({ where: { id: entrepriseId } });
    expect(e?.secteur).toBeNull();
    expect(e?.taille).toBeNull();
    const again = await call('undo', { batch_id: u.batch_id });
    expect(again.error).toContain('already undone');
  });

  it("undo garde un champ modifié entre-temps par quelqu'un d'autre", async () => {
    const u = await call('update_record', { entity: 'company', id: entrepriseId, data: { localisation: 'Lyon', siteWeb: 'https://acme.test' } });
    await rawPrisma.entreprise.update({ where: { id: entrepriseId }, data: { localisation: 'Nantes' } });
    const undo = await call('undo', { batch_id: u.batch_id });
    const e = await prisma.entreprise.findUnique({ where: { id: entrepriseId } });
    expect(e?.siteWeb).toBeNull();
    expect(e?.localisation).toBe('Nantes');
    expect(undo.skipped[0].reason).toContain('localisation');
  });

  it("un champ verrouillé renvoie vers l'outil métier", async () => {
    const c = await prisma.candidat.findFirst({ where: { nom: `${P}Bravo` } });
    const ca = await prisma.candidature.create({ data: { mandatId, candidatId: c!.id } });
    const r = await call('update_record', { entity: 'application', id: ca.id, data: { stage: 'OFFRE' } });
    expect(r.error).toContain('move_candidate_stage');
    const m = await call('update_record', { entity: 'mandate', id: mandatId, data: { statut: 'GAGNE' } });
    expect(m.error).toContain('update_mandate');
  });

  it('undo d’une création supprime (vers la corbeille)', async () => {
    const c = await call('create_record', { entity: 'lead', data: { company: `${P} UndoCo`, contact: 'Paul' } });
    const undo = await call('undo', { batch_id: c.batch_id });
    expect(undo.summary.reverted).toBe(1);
    expect(await prisma.lead.count({ where: { id: c.id } })).toBe(0);
    expect(await rawPrisma.trashEntry.count({ where: { recordId: c.id } })).toBe(1);
  });

  it("un recruteur ne peut pas annuler l'action d'un autre", async () => {
    const u = await call('update_record', { entity: 'company', id: entrepriseId, data: { notes: 'agent note' } });
    const r = await call('undo', { batch_id: u.batch_id }, 'recruteur');
    expect(r.error).toContain('only undo your own');
  });
});

describe('Actions en masse', () => {
  it('bulk_create_records : dry_run avec rapport ligne par ligne, puis vrai, puis undo de tout le lot', async () => {
    const rows = [{ company: `${P} Bulk1`, contact: 'A' }, { company: `${P} Bulk2` }, { company: `${P} Bulk3`, contact: 'C' }];
    const dry = await call('bulk_create_records', { entity: 'lead', rows, dry_run: true });
    expect(dry.summary).toMatchObject({ total: 3, succeeded: 2, failed: 1 });
    expect(dry.items[1].error).toContain('contact');
    expect(await prisma.lead.count({ where: { company: { startsWith: `${P} Bulk` } } })).toBe(0);
    const real = await call('bulk_create_records', { entity: 'lead', rows });
    expect(real.summary.succeeded).toBe(2);
    expect(await prisma.lead.count({ where: { company: { startsWith: `${P} Bulk` } } })).toBe(2);
    const undo = await call('undo', { batch_id: real.batch_id });
    expect(undo.summary.reverted).toBe(2);
    expect(await prisma.lead.count({ where: { company: { startsWith: `${P} Bulk` } } })).toBe(0);
  });

  it('bulk_update_records par filtre', async () => {
    const r = await call('bulk_update_records', { entity: 'candidate', where: { nom: { starts_with: P }, tier: 'A' }, data: { aPlayer: true } });
    expect(r.summary).toMatchObject({ total: 2, succeeded: 2, failed: 0 });
    expect(await prisma.candidat.count({ where: { nom: { startsWith: P }, aPlayer: true } })).toBe(2);
  });

  it('bulk_delete_records : dry_run compte, la suppression part en corbeille, undo restaure', async () => {
    await prisma.lead.createMany({ data: [{ company: `${P} Del1`, contact: 'a' }, { company: `${P} Del2`, contact: 'b' }] });
    const dry = await call('bulk_delete_records', { entity: 'lead', where: { company: { starts_with: `${P} Del` } }, dry_run: true });
    expect(dry.summary.found).toBe(2);
    const del = await call('bulk_delete_records', { entity: 'lead', where: { company: { starts_with: `${P} Del` } } });
    expect(del.summary.succeeded).toBe(2);
    expect(await prisma.lead.count({ where: { company: { startsWith: `${P} Del` } } })).toBe(0);
    const undo = await call('undo', { batch_id: del.batch_id });
    expect(undo.summary.reverted).toBe(2);
    expect(await prisma.lead.count({ where: { company: { startsWith: `${P} Del` } } })).toBe(2);
  });

  it('plus de 500 éléments est refusé', async () => {
    const r = await call('bulk_create_records', { entity: 'lead', rows: Array.from({ length: 501 }, () => ({ company: 'x', contact: 'y' })) });
    expect(r.error).toContain('maximum is 500');
  });
});

describe('CSV', () => {
  it('parseCsv gère le point-virgule et les guillemets', () => {
    expect(parseCsv('a;b\n"x;1";"dit ""oui"""\n')).toEqual([['a', 'b'], ['x;1', 'dit "oui"']]);
  });

  it('import : création puis mise à jour par email, export de la vue filtrée', async () => {
    const csv = `Prenom;Nom;Email;Tags\nLéa;${P}Import1;import1@l2.test;CSM|SaaS\nMarc;${P}Import2;import2@l2.test;`;
    const dry = await call('import_records_csv', { entity: 'candidate', csv, dry_run: true });
    expect(dry.summary).toMatchObject({ total: 2, succeeded: 2 });
    expect(await prisma.candidat.count({ where: { nom: { startsWith: `${P}Import` } } })).toBe(0);
    const real = await call('import_records_csv', { entity: 'candidate', csv });
    expect(real.summary.succeeded).toBe(2);
    const lea = await prisma.candidat.findFirst({ where: { nom: `${P}Import1` } });
    expect(lea?.tags).toEqual(['CSM', 'SaaS']);
    const upd = await call('import_records_csv', { entity: 'candidate', csv: `email,tier\nimport1@l2.test,A\nnobody@l2.test,B`, match_on: 'email' });
    expect(upd.summary).toMatchObject({ total: 2, succeeded: 1, failed: 1 });
    expect(upd.items[1].error).toContain('nobody@l2.test');
    const bad = await call('import_records_csv', { entity: 'candidate', csv: 'nomm\nx' });
    expect(bad.error).toContain('Did you mean "nom"');
    const exp = await call('export_records_csv', { entity: 'candidate', where: { nom: { starts_with: `${P}Import` } }, fields: ['nom', 'email', 'tier'], sort: 'nom' });
    expect(exp.rows).toBe(2);
    expect(exp.csv.split('\n')[0]).toBe('nom,email,tier');
    expect(exp.csv.split('\n')[1]).toBe(`${P}Import1,import1@l2.test,A`);
  });
});

describe('Outils nommés', () => {
  it('update_mandate recalcule et refuse Gagné sans placement', async () => {
    const r = await call('update_mandate', { id: mandatId, data: { priorite: 'HAUTE' } });
    expect(r.changes.priorite).toEqual({ old: 'NORMALE', new: 'HAUTE' });
    const won = await call('update_mandate', { id: mandatId, data: { statut: 'GAGNE' } });
    expect(won.error).toBeTruthy();
    const bad = await call('update_mandate', { id: mandatId, data: { titre: 'x' } });
    expect(bad.error).toContain('Invalid data');
  });

  it('duplicate_mandate puis delete_mandate en corbeille et restore_record', async () => {
    const d = await call('duplicate_mandate', { id: mandatId });
    expect(d.titrePoste).toBe(`${P} Head of Sales (copie)`);
    const dry = await call('delete_mandate', { id: d.id, dry_run: true });
    expect(dry.dry_run).toBe(true);
    const del = await call('delete_mandate', { id: d.id });
    expect(del.deleted).toBe(true);
    expect(await prisma.mandat.count({ where: { id: d.id } })).toBe(0);
    const res = await call('restore_record', { id: d.id });
    expect(res.restored[0].id).toBe(d.id);
  });

  it('get_lead et update_lead', async () => {
    const l = await prisma.lead.create({ data: { company: `${P} LeadCo`, contact: 'Anne' } });
    await prisma.leadInteraction.create({ data: { leadId: l.id, type: 'note', text: 'premier contact' } });
    const g = await call('get_lead', { id: l.id });
    expect(g.interactions).toHaveLength(1);
    const u = await call('update_lead', { id: l.id, data: { phone: '+33600000000' } });
    expect(u.changes.phone.new).toBe('+33600000000');
    const s = await call('update_lead', { id: l.id, data: { stage: 'gagne' } });
    expect(s.error).toContain('move_lead_stage');
  });

  it('bulk_move_candidate_stage et list_tasks', async () => {
    const c = await prisma.candidat.findFirst({ where: { nom: `${P}Charlie` } });
    const ca = await prisma.candidature.create({ data: { mandatId, candidatId: c!.id } });
    const r = await call('bulk_move_candidate_stage', { candidature_ids: [ca.id], new_stage: 'CONTACTE' });
    expect(r.summary.moved).toBe(1);
    expect((await prisma.candidature.findUnique({ where: { id: ca.id } }))?.stage).toBe('CONTACTE');
    await prisma.activite.create({ data: { type: 'TACHE', isTache: true, titre: `${P} relancer`, userId: agentId, tacheDueDate: new Date(Date.now() - 3 * 86400000) } });
    const t = await call('list_tasks', { status: 'overdue', assignee_id: agentId });
    expect(t.data.map((x: any) => x.titre)).toContain(`${P} relancer`);
  });

  it('les suppressions débloquées restent réservées aux admins pour les humains', async () => {
    const r = await call('delete_company', { id: entrepriseId, dry_run: true }, 'recruteur');
    expect(r.error).toContain('not available');
    const ok = await call('delete_company', { id: entrepriseId, dry_run: true });
    expect(ok.dry_run).toBe(true);
    expect(ok.also_removed).toBeTruthy();
  });

  it("les outils d'écriture acceptent idempotency_key dans leur schéma", async () => {
    const r = await mcpPost(agentKey, { jsonrpc: '2.0', id: 999, method: 'tools/list', params: {} }, agentSession);
    const tools = parse(r.text).result.tools as Array<{ name: string; inputSchema: any }>;
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect(byName.get('create_candidate')?.inputSchema.properties.idempotency_key).toBeTruthy();
    expect(byName.get('send_email')?.inputSchema.properties.idempotency_key).toBeTruthy();
    expect(byName.get('list_records')?.inputSchema.properties.idempotency_key).toBeUndefined();
  });
});
