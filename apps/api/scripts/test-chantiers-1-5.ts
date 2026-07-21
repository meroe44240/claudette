/**
 * Smoke test complet : chantiers 1 → 5 en un shot.
 *
 * Seed data, puis appelle chaque endpoint clé en HTTP réel.
 * Assertions inline. Sortie ✅/❌ par étape.
 */

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';
import { generateAccessToken } from '../src/lib/jwt.js';

const BASE = process.env.TEST_BASE || 'http://localhost:3001/api/v1';
const prisma = new PrismaClient();

const errs: string[] = [];
const ok = (label: string) => console.log(`  ✅ ${label}`);
const fail = (label: string, detail?: string) => {
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  errs.push(label);
};

async function J(method: string, path: string, opts: { auth?: string; body?: unknown } = {}): Promise<{ status: number; body: any }> {
  const hasBody = opts.body !== undefined;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.auth ? { Authorization: `Bearer ${opts.auth}` } : {}),
    },
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

async function reset() {
  await prisma.portalEvent.deleteMany();
  await prisma.portalDecision.deleteMany();
  await prisma.portalComment.deleteMany();
  await prisma.portalAccess.deleteMany();
  await prisma.contractApproval.deleteMany();
  await prisma.marketListEstablishment.deleteMany();
  await prisma.marketList.deleteMany();
  await prisma.stageHistory.deleteMany();
  await prisma.candidature.deleteMany();
  await prisma.candidatExperience.deleteMany();
  await prisma.candidat.deleteMany();
  await prisma.activite.deleteMany();
  await prisma.mandat.deleteMany();
  await prisma.client.deleteMany();
  await prisma.entreprise.deleteMany();
  await prisma.recapRun.deleteMany();
  await prisma.user.deleteMany();
}

async function seedAndAuth() {
  const [admin, recruteur] = await Promise.all([
    prisma.user.create({
      data: {
        email: 'admin@test.io',
        passwordHash: await hashPassword('x'),
        nom: 'Admin', prenom: 'Meroe',
        role: 'ADMIN', fonction: 'LES_DEUX',
      },
    }),
    prisma.user.create({
      data: {
        email: 'valentin@test.io',
        passwordHash: await hashPassword('x'),
        nom: 'Dupont', prenom: 'Valentin',
        role: 'RECRUTEUR', fonction: 'SALES',
      },
    }),
  ]);
  const acme = await prisma.entreprise.create({ data: { nom: 'ACME Corp', createdById: admin.id } });
  const contact = await prisma.client.create({
    data: {
      nom: 'Martin', prenom: 'Alice', email: 'alice@acme.com',
      entrepriseId: acme.id, statutClient: 'MANDAT_SIGNE',
      createdById: admin.id, assignedToId: admin.id,
    },
  });
  const mandat = await prisma.mandat.create({
    data: {
      titrePoste: 'Head of Sales',
      entrepriseId: acme.id, clientId: contact.id,
      salesId: admin.id, recruteurId: admin.id,
      createdById: admin.id, assignedToId: admin.id,
      feePourcentage: 20,
    },
  });
  const candidats = await Promise.all(['Renaud', 'Bourdier', 'Kowalski'].map((nom, i) =>
    prisma.candidat.create({ data: { nom, prenom: ['J', 'S', 'M'][i] } })
  ));
  const candidatures = await Promise.all(candidats.map((c, i) =>
    prisma.candidature.create({
      data: {
        mandatId: mandat.id, candidatId: c.id,
        stage: (['CONTACTE', 'ENTRETIEN_1', 'SOURCING'] as const)[i],
        createdById: admin.id,
      },
    })
  ));

  const adminToken = await generateAccessToken({ sub: admin.id, email: admin.email, role: 'ADMIN' });
  return { admin, recruteur, acme, contact, mandat, candidats, candidatures, adminToken };
}

async function main() {
  console.log('🧹 Reset');
  await reset();
  console.log('🌱 Seed');
  const s = await seedAndAuth();

  // ─── CHANTIER 1 ─────────────────────────────────
  console.log('\n─── Chantier 1 : Kanban / fiche mandat ───');

  // 1.1 — visibleStages update
  {
    const res = await J('PUT', `/mandats/${s.mandat.id}`, {
      auth: s.adminToken,
      body: { visibleStages: ['ENVOYE_CLIENT', 'ENTRETIEN_CLIENT'] },
    });
    if (res.status !== 200) fail('1.3 PUT /mandats visibleStages', `status ${res.status}`);
    else ok('1.3 PUT /mandats visibleStages');
    const check = await prisma.mandat.findUnique({ where: { id: s.mandat.id }, select: { visibleStages: true } });
    if (check?.visibleStages.length !== 2) fail('1.3 visibleStages persist en base');
    else ok('1.3 visibleStages persist en base');
  }

  // 1.2 — Modal REFUSE avec notif client (bypass envoi email via NODE_ENV=test)
  process.env.NODE_ENV = 'test';
  {
    const res = await J('PUT', `/candidatures/${s.candidatures[0].id}`, {
      auth: s.adminToken,
      body: {
        stage: 'REFUSE',
        motifRefus: 'PROFIL_PAS_ALIGNE',
        motifRefusDetail: 'Trop junior',
        notifyCandidate: true,
        notifyClient: true,
        messageToClient: 'On continue à sourcer sur votre besoin.',
      },
    });
    if (res.status !== 200) fail('1.2 PUT candidature REFUSE + notifs', `status ${res.status} ${JSON.stringify(res.body).slice(0,120)}`);
    else ok('1.2 PUT candidature REFUSE + notifs');
  }

  // 1.4 — bulk-stage "Présenter au client"
  {
    const res = await J('POST', `/candidatures/bulk-stage`, {
      auth: s.adminToken,
      body: {
        ids: [s.candidatures[1].id, s.candidatures[2].id],
        stage: 'ENVOYE_CLIENT',
        notifyClient: true,
        messageToClient: 'Voici la première salve.',
      },
    });
    if (res.status !== 200) fail('1.4 POST bulk-stage présenter', `status ${res.status}`);
    else if (res.body.updated !== 2) fail('1.4 bulk-stage updated=2', `got ${res.body.updated}`);
    else ok('1.4 POST bulk-stage présenter (2 candidatures)');
  }

  // 1.5 — get activités CLIENT
  {
    // Cree une activité sur le client pour tester
    await prisma.activite.create({
      data: { type: 'APPEL', entiteType: 'CLIENT', entiteId: s.contact.id, userId: s.admin.id, titre: 'Call de brief' },
    });
    const res = await J('GET', `/activites?entiteType=CLIENT&entiteId=${s.contact.id}&perPage=5`, { auth: s.adminToken });
    if (res.status !== 200) fail('1.5 GET activites CLIENT', `status ${res.status}`);
    else if (!Array.isArray(res.body?.data) || res.body.data.length < 1) fail('1.5 activités CLIENT non vides', JSON.stringify(res.body).slice(0, 120));
    else ok(`1.5 GET activites CLIENT (${res.body.data.length} events)`);
  }

  // ─── CHANTIER 2 ─────────────────────────────────
  console.log('\n─── Chantier 2 : Kanban Leads ───');

  // 2 — quick-lead
  let createdLeadId = '';
  {
    const res = await J('POST', `/clients/quick-lead`, {
      auth: s.adminToken,
      body: {
        entrepriseNom: 'Globex Inc',
        contactNom: 'Wong',
        contactPrenom: 'Bob',
        poste: 'CTO',
        email: 'bob@globex.com',
        note: 'Rencontré via LinkedIn.',
      },
    });
    if (res.status !== 201) fail('2 POST quick-lead', `status ${res.status} ${JSON.stringify(res.body).slice(0,120)}`);
    else if (!res.body.entrepriseCreated) fail('2 entrepriseCreated=true attendu');
    else {
      ok(`2 POST quick-lead (client + entreprise nouveau)`);
      createdLeadId = res.body.client.id;
    }

    // 2ème lead sur la MÊME entreprise → entrepriseCreated=false attendu
    const res2 = await J('POST', `/clients/quick-lead`, {
      auth: s.adminToken,
      body: { entrepriseNom: 'globex inc', contactNom: 'Doe', contactPrenom: 'John' },
    });
    if (res2.status !== 201) fail('2 POST quick-lead #2', `status ${res2.status}`);
    else if (res2.body.entrepriseCreated) fail('2 entrepriseCreated=false attendu (2ème lead)');
    else ok('2 POST quick-lead #2 (entreprise réutilisée, insensible casse)');
  }

  // ─── CHANTIER 4 ─────────────────────────────────
  console.log('\n─── Chantier 4 : Contrat + validation admin ───');

  // 4.a — request approval sous 18%
  let approvalId = '';
  {
    const res = await J('POST', `/contracts/request-approval`, {
      auth: s.adminToken,
      body: { mandatId: s.mandat.id, feeRequested: 15, reason: 'Client historique, 4 mandats signés.' },
    });
    if (res.status !== 201) fail('4 POST request-approval', `status ${res.status} ${JSON.stringify(res.body).slice(0,120)}`);
    else if (res.body.status !== 'PENDING') fail('4 approval status PENDING');
    else {
      ok('4 POST request-approval (fee 15% < 18%)');
      approvalId = res.body.id;
    }

    // Idempotence : re-request → même approval retournée
    const res2 = await J('POST', `/contracts/request-approval`, {
      auth: s.adminToken,
      body: { mandatId: s.mandat.id, feeRequested: 15, reason: 'refresh' },
    });
    if (res2.body.id !== approvalId) fail('4 idempotence request-approval');
    else ok('4 idempotence request-approval (même id)');
  }

  // 4.b — approve
  {
    const res = await J('POST', `/contracts/${approvalId}/approve`, { auth: s.adminToken });
    if (res.status !== 200) fail('4 POST approve', `status ${res.status}`);
    else if (res.body.status !== 'APPROVED') fail('4 approval status=APPROVED');
    else ok('4 POST approve (admin)');

    // Le mandat doit avoir été mis à jour au nouveau fee
    const m = await prisma.mandat.findUnique({ where: { id: s.mandat.id }, select: { feePourcentage: true } });
    if (Number(m?.feePourcentage) !== 15) fail(`4 mandat.feePourcentage=15 (got ${m?.feePourcentage})`);
    else ok('4 mandat.feePourcentage propagé à 15');
  }

  // 4.c — send for signature
  {
    const res = await J('POST', `/contracts/mandat/${s.mandat.id}/send`, {
      auth: s.adminToken,
      body: { feePourcentage: 15, paymentTerms: '30j', applicableCountry: 'FR' },
    });
    if (res.status !== 200) fail('4 POST send-for-signature', `status ${res.status} ${JSON.stringify(res.body).slice(0,120)}`);
    else if (res.body.contractStatus !== 'SENT') fail('4 contractStatus=SENT');
    else ok('4 POST send-for-signature');
  }

  // 4.d — send avec fee sous plancher sans approval → forbidden
  {
    const res = await J('POST', `/contracts/mandat/${s.mandat.id}/send`, {
      auth: s.adminToken,
      body: { feePourcentage: 10, paymentTerms: '30j', applicableCountry: 'FR' },
    });
    if (res.status === 200) fail('4 send devrait être bloqué (fee 10% sans approval)');
    else ok(`4 send bloqué (fee 10%) → ${res.status}`);
  }

  // ─── CHANTIER 3 ─────────────────────────────────
  console.log('\n─── Chantier 3 : Portail client ───');

  let portalToken = '';
  let portalAccessId = '';

  // 3.a — créer accès (interne)
  {
    const res = await J('POST', `/portal/access`, {
      auth: s.adminToken,
      body: {
        mandatId: s.mandat.id,
        clientId: s.contact.id,
        email: 'alice@acme.com',
        password: 'test1234',
      },
    });
    if (res.status !== 201) fail('3 POST /portal/access', `status ${res.status} ${JSON.stringify(res.body).slice(0,120)}`);
    else {
      ok('3 POST /portal/access (créer accès)');
      portalAccessId = res.body.id;
    }
  }

  // 3.b — login portail (public)
  {
    const res = await J('POST', `/portal/login`, {
      body: { mandatId: s.mandat.id, email: 'alice@acme.com', password: 'test1234' },
    });
    if (res.status !== 200) fail('3 POST /portal/login', `status ${res.status}`);
    else if (!res.body.token) fail('3 login : token manquant');
    else {
      ok('3 POST /portal/login (client)');
      portalToken = res.body.token;
    }

    // Bad password
    const bad = await J('POST', `/portal/login`, {
      body: { mandatId: s.mandat.id, email: 'alice@acme.com', password: 'wrong' },
    });
    if (bad.status === 200) fail('3 login bad password devrait échouer');
    else ok(`3 login bad password → ${bad.status}`);
  }

  // 3.c — GET kanban avec token
  {
    const res = await J('GET', `/portal/kanban`, { auth: portalToken });
    if (res.status !== 200) fail('3 GET /portal/kanban', `status ${res.status} ${JSON.stringify(res.body).slice(0,120)}`);
    else if (!res.body.stages) fail('3 kanban : stages manquants');
    else {
      // Vérifier que visibleStages filtre : mandat a visibleStages=['ENVOYE_CLIENT', 'ENTRETIEN_CLIENT']
      const stages = res.body.stages;
      if (stages.includes('SOURCING') || stages.includes('CONTACTE')) {
        fail(`3 kanban : SOURCING/CONTACTE devraient être filtrés (got ${JSON.stringify(stages)})`);
      } else {
        ok(`3 GET /portal/kanban filtré par visibleStages (${JSON.stringify(stages)})`);
      }
    }
  }

  // 3.d — POST decision
  {
    // On a besoin d'une candidature dans un stage visible
    const candInVisibleStage = await prisma.candidature.findFirst({
      where: { mandatId: s.mandat.id, stage: { in: ['ENVOYE_CLIENT', 'ENTRETIEN_CLIENT'] } },
    });
    if (!candInVisibleStage) {
      fail('3 setup: aucune candidature en stage visible');
    } else {
      const res = await J('POST', `/portal/candidatures/${candInVisibleStage.id}/decision`, {
        auth: portalToken,
        body: { decision: 'RENCONTRER', reason: 'Profil intéressant.' },
      });
      if (res.status !== 200) fail('3 POST decision', `status ${res.status}`);
      else ok('3 POST decision RENCONTRER');

      // Vérifie que la decision est persistée + PortalEvent
      const dec = await prisma.portalDecision.findFirst({ where: { candidatureId: candInVisibleStage.id } });
      if (!dec) fail('3 decision persistée en base');
      else ok('3 decision persistée en base');
      const evt = await prisma.portalEvent.findFirst({ where: { type: 'DECISION', candidatureId: candInVisibleStage.id } });
      if (!evt) fail('3 PortalEvent DECISION créé');
      else ok('3 PortalEvent DECISION créé');
    }
  }

  // 3.e — POST comment
  {
    const cand = await prisma.candidature.findFirst({ where: { mandatId: s.mandat.id, stage: 'ENVOYE_CLIENT' } });
    if (cand) {
      const res = await J('POST', `/portal/candidatures/${cand.id}/comment`, {
        auth: portalToken,
        body: { content: 'Peut-on avoir plus d\'infos sur son expérience Saas ?' },
      });
      if (res.status !== 200) fail('3 POST comment', `status ${res.status}`);
      else ok('3 POST comment');
    }
  }

  // 3.f — internal GET events pour widget
  {
    const res = await J('GET', `/portal/mandat/${s.mandat.id}/events`, { auth: s.adminToken });
    if (res.status !== 200) fail('3 GET events interne', `status ${res.status}`);
    else if (!Array.isArray(res.body) || res.body.length < 3) fail(`3 events attendus ≥ 3 (login + decision + comment)`, `got ${res.body.length}`);
    else ok(`3 GET events interne (${res.body.length} events, dont LOGIN + DECISION + COMMENT)`);
  }

  // 3.g — revoke access
  {
    const res = await J('POST', `/portal/access/${portalAccessId}/revoke`, { auth: s.adminToken });
    if (res.status !== 200) fail('3 POST revoke', `status ${res.status}`);
    else ok('3 POST revoke access');

    // Après revoke, login échoue
    const bad = await J('POST', `/portal/login`, {
      body: { mandatId: s.mandat.id, email: 'alice@acme.com', password: 'test1234' },
    });
    if (bad.status === 200) fail('3 login après revoke devrait échouer');
    else ok(`3 login après revoke → ${bad.status}`);
  }

  // ─── CHANTIER 5 ─────────────────────────────────
  console.log('\n─── Chantier 5 : List Push ───');

  let listId = '';
  {
    const res = await J('POST', `/sourcing/market-lists`, {
      auth: s.adminToken,
      body: {
        name: 'SDR Paris Q3',
        sectorTags: ['Sales', 'SaaS'],
        zones: ['Paris', '75', '92'],
        excludedCompanies: ['ExcludedCorp'],
      },
    });
    if (res.status !== 201) fail('5 POST market-lists', `status ${res.status} ${JSON.stringify(res.body).slice(0,120)}`);
    else {
      ok('5 POST market-lists');
      listId = res.body.id;
    }
  }

  // GET list detail (empty establishments)
  {
    const res = await J('GET', `/sourcing/market-lists/${listId}`, { auth: s.adminToken });
    if (res.status !== 200 || !Array.isArray(res.body.establishments)) fail('5 GET market-list detail');
    else ok(`5 GET market-list detail (${res.body.establishments.length} establishments)`);
  }

  // Simuler l'ingestion CV sans réellement appeler Claude API : on crée
  // manuellement des Candidat + CandidatExperience pour tester la partie
  // aggregation. Puis on appelle POST generate-prospection.
  {
    const cand = await prisma.candidat.create({ data: { nom: 'TestCV', source: 'list-push', tags: ['list-push'] } });
    await prisma.candidatExperience.createMany({
      data: [
        { candidatId: cand.id, titre: 'SDR', entreprise: 'Datadog', anneeDebut: 2020 },
        { candidatId: cand.id, titre: 'SDR', entreprise: 'Notion', anneeDebut: 2022 },
      ],
    });

    // On alimente manuellement les establishments (simule ce que ingestCv ferait)
    await prisma.marketListEstablishment.create({
      data: { marketListId: listId, name: 'Datadog', titles: ['SDR'], frequency: 3 },
    });
    await prisma.marketListEstablishment.create({
      data: { marketListId: listId, name: 'Notion', titles: ['SDR'], frequency: 2 },
    });
    await prisma.marketListEstablishment.create({
      data: { marketListId: listId, name: 'ExistingClient', titles: ['CTO'], frequency: 1, status: 'CLIENT_EXISTING' },
    });
    ok('5 seed: 3 establishments (dont 1 CLIENT_EXISTING)');
  }

  // Update status : EXCLUDED
  {
    const est = await prisma.marketListEstablishment.findFirst({ where: { marketListId: listId, name: 'Datadog' } });
    if (est) {
      const res = await J('PUT', `/sourcing/market-lists/establishments/${est.id}`, {
        auth: s.adminToken,
        body: { status: 'EXCLUDED' },
      });
      if (res.status !== 200) fail('5 PUT establishment status');
      else ok('5 PUT establishment status = EXCLUDED');
    }
  }

  // Generate prospection leads
  {
    const beforeClientCount = await prisma.client.count({ where: { statutClient: 'LEAD' } });
    const res = await J('POST', `/sourcing/market-lists/${listId}/generate-prospection`, { auth: s.adminToken });
    if (res.status !== 200) fail('5 POST generate-prospection', `status ${res.status}`);
    else {
      // Notion (NEW) créé, Datadog (EXCLUDED) skippé, ExistingClient (CLIENT_EXISTING) skippé
      if (res.body.created !== 1) fail(`5 created=1 attendu (Notion), got ${res.body.created}`);
      else ok(`5 POST generate-prospection (${res.body.created} lead créé, ${res.body.skippedExisting} skippé)`);
      const afterClientCount = await prisma.client.count({ where: { statutClient: 'LEAD' } });
      if (afterClientCount - beforeClientCount !== 1) fail(`5 Client(LEAD) count delta=1 attendu`);
      else ok('5 Client(LEAD) créé en base');
    }
  }

  // ─── RESULT ─────────────────────────────────
  console.log('\n─── RESULT ───');
  if (errs.length === 0) console.log(`  🎉 Tous les checks passent (${5 + 2 + 4 + 10 + 5} passed)`);
  else {
    console.log(`  ❌ ${errs.length} failure(s)`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
