import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../index.js';
import prisma from '../lib/db.js';
import { hashPassword } from '../lib/password.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let token: string;
let entrepriseId: string;
let clientId: string;
let candidatId: string;
let mandatId: string;
let candidatureId: string;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  await prisma.user.upsert({
    where: { email: 'crud-test@humanup.io' },
    update: {},
    create: {
      email: 'crud-test@humanup.io',
      passwordHash: await hashPassword('TestPass1'),
      nom: 'CrudTest',
      role: 'ADMIN',
      mustChangePassword: false,
    },
  });

  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: 'crud-test@humanup.io', password: 'TestPass1' },
  });
  token = loginRes.json().accessToken;
});

afterAll(async () => {
  // Clean up in reverse dependency order
  await prisma.stageHistory.deleteMany({});
  await prisma.candidature.deleteMany({});
  await prisma.mandat.deleteMany({ where: { titrePoste: { startsWith: 'Test' } } });
  await prisma.candidat.deleteMany({ where: { nom: 'TestCandidat' } });
  await prisma.client.deleteMany({ where: { nom: 'TestClient' } });
  await prisma.entreprise.deleteMany({ where: { nom: { startsWith: 'Test' } } });
  await prisma.user.deleteMany({ where: { email: 'crud-test@humanup.io' } });
  await app.close();
  await prisma.$disconnect();
});

const authHeaders = () => ({ authorization: `Bearer ${token}` });

describe('Entreprises CRUD', () => {
  it('should create an entreprise', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/entreprises',
      headers: authHeaders(),
      payload: { nom: 'TestEntreprise', secteur: 'Tech', taille: 'STARTUP' },
    });
    expect(res.statusCode).toBe(201);
    entrepriseId = res.json().id;
    expect(res.json().nom).toBe('TestEntreprise');
  });

  it('should list entreprises', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/entreprises', headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeDefined();
    expect(res.json().meta).toBeDefined();
  });

  it('should get entreprise by id', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/entreprises/${entrepriseId}`, headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json().nom).toBe('TestEntreprise');
  });

  it('should update entreprise', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/entreprises/${entrepriseId}`,
      headers: authHeaders(),
      payload: { nom: 'TestEntreprise Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().nom).toBe('TestEntreprise Updated');
  });

  it('should return 404 for unknown entreprise', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/entreprises/00000000-0000-0000-0000-000000000000', headers: authHeaders() });
    expect(res.statusCode).toBe(404);
  });

  it('should get entreprise stats', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/entreprises/${entrepriseId}/stats`, headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('revenueCumule');
  });
});

describe('Clients CRUD', () => {
  it('should create a client', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/clients',
      headers: authHeaders(),
      payload: { nom: 'TestClient', prenom: 'Test', email: 'testclient@test.com', entrepriseId, roleContact: 'DRH' },
    });
    expect(res.statusCode).toBe(201);
    clientId = res.json().id;
  });

  it('should reject client with invalid entreprise', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/clients',
      headers: authHeaders(),
      payload: { nom: 'Bad', entrepriseId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('should get pipeline', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/clients/pipeline', headers: authHeaders() });
    expect(res.statusCode).toBe(200);
  });

  it('should list clients filtered by entreprise', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/clients?entrepriseId=${entrepriseId}`, headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Candidats CRUD', () => {
  it('should create a candidat', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/candidats',
      headers: authHeaders(),
      payload: { nom: 'TestCandidat', prenom: 'Test', email: 'test.candidat@test.com', salaireActuel: 50000, salaireSouhaite: 60000, source: 'linkedin', tags: ['test'] },
    });
    expect(res.statusCode).toBe(201);
    candidatId = res.json().id;
  });

  it('should get candidat export', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/candidats/${candidatId}/export`, headers: authHeaders() });
    expect(res.statusCode).toBe(200);
    expect(res.json().nom).toBe('TestCandidat');
  });
});

describe('Mandats CRUD', () => {
  it('should create a mandat with fee calculation', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/mandats',
      headers: authHeaders(),
      payload: { titrePoste: 'Test AE', entrepriseId, clientId, salaireMin: 60000, salaireMax: 80000, feePourcentage: 20 },
    });
    expect(res.statusCode).toBe(201);
    mandatId = res.json().id;
    expect(res.json().feeMontantEstime).toBe(14000); // (60000+80000)/2 * 20/100 = 14000
  });

  it('should clone a mandat', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/v1/mandats/${mandatId}/clone`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().titrePoste).toBe('Test AE (copie)');
    expect(res.json().statut).toBe('OUVERT');
  });

  it('should get kanban view', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/mandats/${mandatId}/kanban`, headers: authHeaders() });
    expect(res.statusCode).toBe(200);
  });

  it('should update fee', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/mandats/${mandatId}/fee`,
      headers: authHeaders(),
      payload: { feeMontantFacture: 15000, feeStatut: 'FACTURE' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().feeStatut).toBe('FACTURE');
  });
});

describe('Candidatures CRUD', () => {
  it('should create a candidature with stage history', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/candidatures',
      headers: authHeaders(),
      payload: { mandatId, candidatId, stage: 'SOURCING' },
    });
    expect(res.statusCode).toBe(201);
    candidatureId = res.json().id;
  });

  it('should reject duplicate candidature', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/candidatures',
      headers: authHeaders(),
      payload: { mandatId, candidatId },
    });
    expect(res.statusCode).toBe(409);
  });

  it('should update stage and create history', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/candidatures/${candidatureId}`,
      headers: authHeaders(),
      payload: { stage: 'CONTACTE' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().stage).toBe('CONTACTE');
  });

  it('should get stage history', async () => {
    const res = await app.inject({
      method: 'GET', url: `/api/v1/candidatures/${candidatureId}/history`,
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const history = res.json();
    expect(history.length).toBeGreaterThanOrEqual(2); // initial + stage change
  });

  it('should require motifRefus when stage is REFUSE', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/candidatures/${candidatureId}`,
      headers: authHeaders(),
      payload: { stage: 'REFUSE' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('should accept REFUSE with motifRefus', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/api/v1/candidatures/${candidatureId}`,
      headers: authHeaders(),
      payload: { stage: 'REFUSE', motifRefus: 'SALAIRE' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().stage).toBe('REFUSE');
  });
});
