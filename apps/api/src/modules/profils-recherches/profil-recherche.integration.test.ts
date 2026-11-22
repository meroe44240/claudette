import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../index.js';
import prisma from '../../lib/db.js';
import { hashPassword } from '../../lib/password.js';
import { hashKey } from '../agents/agent-keys.js';

let app: FastifyInstance;
const tokens: Record<string, string> = {};
let entrepriseId: string;
let candidatId: string;
let engId: string;

const USERS = [
  { email: 'tp-admin@humanup.io', role: 'ADMIN' as const, estAgent: false },
  { email: 'tp-agent@humanup.io', role: 'RECRUTEUR' as const, estAgent: true },
  { email: 'tp-recruteur@humanup.io', role: 'RECRUTEUR' as const, estAgent: false },
];

// Un compte agent ne se connecte pas : il travaille avec sa clé.
const AGENT_KEY = 'pk_agent_test_profils_recherches_0123456789';
const auth = (who: string) => (who === 'tp-agent' ? { 'x-api-key': AGENT_KEY } : { authorization: `Bearer ${tokens[who]}` });

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { estAgent: u.estAgent, role: u.role },
      create: { email: u.email, passwordHash: await hashPassword('TestPass1'), nom: u.email.split('@')[0], role: u.role, estAgent: u.estAgent, mustChangePassword: false },
    });
    if (u.estAgent) {
      await prisma.user.update({ where: { email: u.email }, data: { apiKeyHash: hashKey(AGENT_KEY) } });
      continue;
    }
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: u.email, password: 'TestPass1' } });
    tokens[u.email.split('@')[0]] = res.json().accessToken;
  }
  const e = await prisma.entreprise.create({ data: { nom: 'TP Test Scaleup' } });
  entrepriseId = e.id;
  const c = await prisma.candidat.create({
    data: { nom: 'TPCandidat', prenom: 'Alex', aPlayer: true, posteActuel: 'Senior Backend Engineer', anneesExperience: 7, localisation: 'Paris', tags: ['Go', 'Kubernetes', 'PostgreSQL'] },
  });
  candidatId = c.id;
});

afterAll(async () => {
  await prisma.profilRecherche.deleteMany({ where: { entrepriseId } });
  await prisma.candidat.deleteMany({ where: { nom: 'TPCandidat' } });
  await prisma.entreprise.deleteMany({ where: { nom: 'TP Test Scaleup' } });
  await prisma.user.deleteMany({ where: { email: { in: USERS.map((u) => u.email) } } });
  await app.close();
  await prisma.$disconnect();
});

const engPayload = () => ({
  company_id: entrepriseId,
  fonction: 'ENGINEERING',
  intitule_type: 'Backend senior Go',
  seniorite: 'SENIOR',
  pays: 'France',
  ville: 'Paris',
  remote: 'HYBRID',
  marche: 'FRANCE',
  technos: ['Go', 'Kubernetes', 'GCP'],
  perimetre: 'Plateforme de paiement, équipe de 6',
  projets: 'Migration vers des microservices',
  offres_sources: [{ titre: 'Senior Backend Engineer (Paraform)', url: 'https://www.paraform.com/jobs/abc', date_vue: '2026-11-20' }],
  analyse_par: 'Yanis',
});

describe('Profils recherchés', () => {
  it('refuse l’écriture à un recruteur qui n’est pas un compte agent', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/v1/profils-recherches', headers: auth('tp-recruteur'), payload: engPayload() });
    expect(res.statusCode).toBe(403);
  });

  it('crée un profil Engineering (admin) visible dans l’onglet société et la page globale', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/v1/profils-recherches', headers: auth('tp-admin'), payload: engPayload() });
    expect(res.statusCode).toBe(200);
    expect(res.json().replaced).toBe(false);
    engId = res.json().id;

    const tab = (await app.inject({ method: 'GET', url: `/api/v1/profils-recherches/entreprise/${entrepriseId}`, headers: auth('tp-recruteur') })).json();
    expect(tab.engineering.map((p: any) => p.id)).toEqual([engId]);
    expect(tab.sales).toHaveLength(0);
    expect(tab.engineering[0].technos).toEqual(['Go', 'Kubernetes', 'GCP']);

    const list = (await app.inject({ method: 'GET', url: `/api/v1/profils-recherches?company_id=${entrepriseId}`, headers: auth('tp-recruteur') })).json();
    expect(list.meta.total).toBe(1);
  });

  it('ne laisse jamais apparaître le nom de la plateforme source', async () => {
    const tab = (await app.inject({ method: 'GET', url: `/api/v1/profils-recherches/entreprise/${entrepriseId}`, headers: auth('tp-admin') })).json();
    const offre = tab.engineering[0].offres_sources[0];
    expect(offre.source).toBe('plateforme partenaire');
    expect(offre.titre).not.toMatch(/paraform/i);
    const { url, ...visible } = offre;
    expect(JSON.stringify({ ...tab, engineering: [{ ...tab.engineering[0], offres_sources: [visible] }] })).not.toMatch(/paraform/i);
  });

  it('une seconde analyse du même profil remplace la première (agent)', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/profils-recherches', headers: auth('tp-agent'),
      payload: { company_id: entrepriseId, fonction: 'ENGINEERING', intitule_type: '  backend SENIOR go ', technos: ['Go', 'Rust'], seniorite: 'LEAD' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: engId, replaced: true });
    const tab = (await app.inject({ method: 'GET', url: `/api/v1/profils-recherches/entreprise/${entrepriseId}`, headers: auth('tp-admin') })).json();
    expect(tab.engineering).toHaveLength(1);
    expect(tab.engineering[0].technos).toEqual(['Go', 'Rust']);
    expect(tab.engineering[0].seniorite).toBe('LEAD');
    expect(tab.engineering[0].perimetre).toBeNull(); // non fourni = vide, pas conservé
    // remet la première version pour la suite
    await app.inject({ method: 'PUT', url: '/api/v1/profils-recherches', headers: auth('tp-admin'), payload: engPayload() });
  });

  it('crée un profil Sales et filtre par technos, type de clients, motion et cycle', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/profils-recherches', headers: auth('tp-agent'),
      payload: {
        company_id: entrepriseId, fonction: 'SALES', intitule_type: 'AE mid-market', seniorite: 'CONFIRME',
        segments: ['MID_MARKET', 'ENTERPRISE'], secteurs: ['Industrie'], acheteur_type: 'DAF', cycle_de_vente: '3 à 6 mois',
        motion: ['OUTBOUND'], outils_methodo: ['HubSpot', 'MEDDIC'], technos: ['ignored'],
      },
    });
    expect(res.statusCode).toBe(200);
    const salesId = res.json().id;
    const tab = (await app.inject({ method: 'GET', url: `/api/v1/profils-recherches/entreprise/${entrepriseId}`, headers: auth('tp-admin') })).json();
    expect(tab.sales.map((p: any) => p.id)).toEqual([salesId]);
    expect(tab.sales[0].technos).toBeUndefined();

    const q = async (qs: string) => (await app.inject({ method: 'GET', url: `/api/v1/profils-recherches?company_id=${entrepriseId}&${qs}`, headers: auth('tp-recruteur') })).json().data.map((p: any) => p.id);
    expect(await q('technos=go')).toEqual([engId]); // insensible à la casse
    expect(await q('technos=java')).toEqual([]);
    expect(await q('segments=MID_MARKET')).toEqual([salesId]);
    expect(await q('segments=SMB')).toEqual([]);
    expect(await q('motion=OUTBOUND')).toEqual([salesId]);
    expect(await q('motion=PLG')).toEqual([]);
    expect(await q('cycle_de_vente=6%20mois')).toEqual([salesId]);
    expect(await q('fonction=ENGINEERING')).toEqual([engId]);
    expect(await q('secteurs=industrie')).toEqual([salesId]);
    expect(await q('q=microservices')).toEqual([engId]);
  });

  it('enregistre le résumé de la société', async () => {
    const res = await app.inject({ method: 'PUT', url: `/api/v1/profils-recherches/entreprise/${entrepriseId}/resume`, headers: auth('tp-agent'), payload: { resume_profils: 'Cherche : backend Go senior\nPour : migration microservices' } });
    expect(res.statusCode).toBe(200);
    const tab = (await app.inject({ method: 'GET', url: `/api/v1/profils-recherches/entreprise/${entrepriseId}`, headers: auth('tp-admin') })).json();
    expect(tab.resume_profils).toContain('Cherche');
    expect(tab.resume_profils_date).toBeTruthy();
  });

  it('exporte en CSV', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/profils-recherches/export?company_id=${entrepriseId}`, headers: auth('tp-recruteur') });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body).toContain('Backend senior Go');
    expect(res.body).toContain('AE mid-market');
    expect(res.body).not.toMatch(/paraform(?!\.com)/i);
  });

  it('rapproche un candidat A-Player des profils Engineering avec les raisons', async () => {
    const res = (await app.inject({ method: 'GET', url: `/api/v1/profils-recherches/match/${candidatId}`, headers: auth('tp-recruteur') })).json();
    expect(res.candidate.eligible).toBe(true);
    const m = res.matches.find((x: any) => x.profile.id === engId);
    expect(m).toBeTruthy();
    expect(m.reasons.find((r: any) => r.code === 'technos')?.items).toContain('Go');
    expect(res.matches.every((x: any) => x.profile.fonction === 'ENGINEERING')).toBe(true);
  });

  it('ne fait pas de rapprochement pour un candidat hors S/A/A-Player', async () => {
    await prisma.candidat.update({ where: { id: candidatId }, data: { aPlayer: false, tier: 'B' } });
    const res = (await app.inject({ method: 'GET', url: `/api/v1/profils-recherches/match/${candidatId}`, headers: auth('tp-recruteur') })).json();
    expect(res.candidate.eligible).toBe(false);
    expect(res.matches).toEqual([]);
  });

  it('rien dans le job board public', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/job-offers' });
    expect(res.body).not.toContain('Backend senior Go');
  });
});
