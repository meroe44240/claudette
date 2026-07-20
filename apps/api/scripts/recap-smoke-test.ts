/**
 * Smoke test end-to-end du recap simplifie.
 *
 * Seed un mini-jeu (3 mandats, 5 candidats a differents stades, 2 prez
 * prevues via MEETING + 1 via dateEntretienClient), appelle buildRecap
 * sur 7 jours, print + assert + genere HTML/txt dans /tmp.
 */

import { PrismaClient } from '@prisma/client';
import { buildRecap } from '../src/modules/recap/recap.service.js';
import {
  renderRecapHtml,
  renderRecapSubject,
  renderRecapText,
} from '../src/modules/recap/recap.template.js';
import { writeFileSync } from 'node:fs';

const prisma = new PrismaClient();

async function reset() {
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

async function seed() {
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 3600 * 1000);
  const daysAhead = (n: number) => new Date(now.getTime() + n * 24 * 3600 * 1000);

  const [meroe, valentin, vicky] = await Promise.all([
    prisma.user.create({
      data: {
        email: 'meroe@test.io',
        nom: 'Chaumont',
        prenom: 'Meroe',
        passwordHash: 'x',
        role: 'ADMIN',
        fonction: 'LES_DEUX',
        excludeFromTeamStats: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'valentin@test.io',
        nom: 'Dupont',
        prenom: 'Valentin',
        passwordHash: 'x',
        role: 'RECRUTEUR',
        fonction: 'SALES',
      },
    }),
    prisma.user.create({
      data: {
        email: 'vicky@test.io',
        nom: 'Deletang',
        prenom: 'Vicky',
        passwordHash: 'x',
        role: 'RECRUTEUR',
        fonction: 'RECRUTEUR',
      },
    }),
  ]);

  const acme = await prisma.entreprise.create({ data: { nom: 'ACME Corp' } });
  const globex = await prisma.entreprise.create({ data: { nom: 'Globex' } });
  const initech = await prisma.entreprise.create({ data: { nom: 'Initech' } });

  const clientAcme = await prisma.client.create({
    data: { nom: 'Martin', prenom: 'Alice', email: 'alice@acme.com', entrepriseId: acme.id },
  });
  const clientGlobex = await prisma.client.create({
    data: { nom: 'Wong', prenom: 'Bob', email: 'bob@globex.com', entrepriseId: globex.id },
  });
  const clientInitech = await prisma.client.create({
    data: { nom: 'Papan', prenom: 'Sam', email: 'sam@initech.com', entrepriseId: initech.id },
  });

  // Mandat 1 — Head of Sales chez ACME (charge)
  const mandatHead = await prisma.mandat.create({
    data: {
      titrePoste: 'Head of Sales',
      entrepriseId: acme.id,
      clientId: clientAcme.id,
      salesId: valentin.id,
      recruteurId: vicky.id,
      createdAt: daysAgo(20),
    },
  });

  // Mandat 2 — PM chez Globex (pas encore de candidat en process, sales seul)
  const mandatPm = await prisma.mandat.create({
    data: {
      titrePoste: 'Product Manager',
      entrepriseId: globex.id,
      clientId: clientGlobex.id,
      salesId: valentin.id,
      recruteurId: vicky.id,
      createdAt: daysAgo(6),
    },
  });

  // Mandat 3 — CTO chez Initech (petit pipeline, prez prevue)
  const mandatCto = await prisma.mandat.create({
    data: {
      titrePoste: 'CTO',
      entrepriseId: initech.id,
      clientId: clientInitech.id,
      salesId: meroe.id,
      recruteurId: vicky.id,
      createdAt: daysAgo(30),
    },
  });

  const cands = await Promise.all(
    [
      ['Renaud', 'Julien'],
      ['Bourdier', 'Sophie'],
      ['Kowalski', 'Marc'],
      ['Elizalde', 'Paula'],
      ['Nguyen', 'Trang'],
    ].map(([nom, prenom]) =>
      prisma.candidat.create({ data: { nom, prenom } }),
    ),
  );

  // Head of Sales pipeline : 1 SOURCING, 1 CONTACTE, 1 ENVOYE_CLIENT, 1 ENTRETIEN_CLIENT (prez passee)
  await prisma.candidature.create({
    data: { mandatId: mandatHead.id, candidatId: cands[0].id, stage: 'SOURCING', createdById: vicky.id, createdAt: daysAgo(2) },
  });
  await prisma.candidature.create({
    data: { mandatId: mandatHead.id, candidatId: cands[1].id, stage: 'CONTACTE', createdById: vicky.id, createdAt: daysAgo(4) },
  });
  const candEnvoye = await prisma.candidature.create({
    data: {
      mandatId: mandatHead.id,
      candidatId: cands[2].id,
      stage: 'ENVOYE_CLIENT',
      createdById: vicky.id,
      createdAt: daysAgo(6),
      dateEntretienClient: daysAhead(3), // Prez prevue dans 3 jours
    },
  });
  await prisma.candidature.create({
    data: {
      mandatId: mandatHead.id,
      candidatId: cands[3].id,
      stage: 'ENTRETIEN_CLIENT',
      createdById: vicky.id,
      createdAt: daysAgo(15),
      dateEntretienClient: daysAgo(4), // prez passee (n'apparait pas)
    },
  });

  // CTO Initech : 1 SOURCING
  await prisma.candidature.create({
    data: { mandatId: mandatCto.id, candidatId: cands[4].id, stage: 'SOURCING', createdById: vicky.id, createdAt: daysAgo(3) },
  });

  // StageHistory (fenetre 7j) — transitions pour compter par personne
  await prisma.stageHistory.createMany({
    data: [
      { candidatureId: candEnvoye.id, fromStage: 'ENTRETIEN_1', toStage: 'ENVOYE_CLIENT', changedById: vicky.id, changedAt: daysAgo(2) },
    ],
  });

  // Activites : appels + RDV
  await prisma.activite.createMany({
    data: [
      { type: 'APPEL', userId: vicky.id, entiteType: 'CANDIDAT', entiteId: cands[0].id, createdAt: daysAgo(2) },
      { type: 'APPEL', userId: vicky.id, entiteType: 'CANDIDAT', entiteId: cands[1].id, createdAt: daysAgo(1) },
      { type: 'APPEL', userId: valentin.id, entiteType: 'MANDAT', entiteId: mandatHead.id, createdAt: daysAgo(3) },
      { type: 'MEETING', userId: valentin.id, entiteType: 'MANDAT', entiteId: mandatHead.id, createdAt: daysAgo(2), titre: 'Kickoff ACME' },
      { type: 'APPEL', userId: meroe.id, entiteType: 'CANDIDAT', entiteId: cands[4].id, createdAt: daysAgo(1) },
    ],
  });

  // Prez prevue via MEETING Google Calendar (dans le futur)
  await prisma.activite.create({
    data: {
      type: 'MEETING',
      userId: valentin.id,
      entiteType: 'CANDIDAT',
      entiteId: cands[2].id, // Marc Kowalski
      titre: 'Prez Marc chez ACME',
      metadata: { startTime: new Date(now.getTime() + 2 * 24 * 3600 * 1000).toISOString() },
      createdAt: daysAgo(1),
    },
  });
  await prisma.activite.create({
    data: {
      type: 'MEETING',
      userId: meroe.id,
      entiteType: 'CANDIDAT',
      entiteId: cands[4].id, // Trang Nguyen (mandat CTO)
      titre: 'Debrief Trang',
      metadata: { startTime: new Date(now.getTime() + 5 * 24 * 3600 * 1000).toISOString() },
      createdAt: daysAgo(1),
    },
  });

  return { meroe, valentin, vicky, mandatHead, mandatPm, mandatCto };
}

async function main() {
  console.log('🧹 Reset DB…');
  await reset();

  console.log('🌱 Seed…');
  await seed();

  const now = new Date();
  const windowStart = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  console.log(`\n⚙  buildRecap(${windowStart.toISOString()} → ${now.toISOString()})\n`);
  const payload = await buildRecap(windowStart, now);

  console.log('─── ETAT PAR MANDAT ───');
  for (const m of payload.mandats) {
    console.log(`  ${m.entreprise} / ${m.titrePoste} (${m.ageJours}j)`);
    console.log(`    sales=${m.sales?.label ?? '—'} · recruteur=${m.recruteur?.label ?? '—'}`);
    const buckets = m.pipeline.filter((b) => b.count > 0).map((b) => `${b.stage}:${b.count}${b.oldestDays !== null ? `/${b.oldestDays}j` : ''}`).join(' · ');
    console.log(`    ${m.totalActifs} en process — ${buckets || '(vide)'}`);
    if (m.presentationsPrevues.length === 0) {
      console.log(`    prez prevues: aucune`);
    } else {
      console.log(`    prez prevues (${m.presentationsPrevues.length}) :`);
      for (const p of m.presentationsPrevues) {
        console.log(`      · ${p.candidatLabel} — ${p.at.toISOString()} · [${p.source}${p.label ? ` — ${p.label}` : ''}]`);
      }
    }
  }

  console.log('\n─── PAR PERSONNE ───');
  console.log('  Sales:');
  for (const s of payload.parPersonne.sales) {
    console.log(`    ${s.user.label}${s.user.excludeFromTeamStats ? ' (hors totaux)' : ''} — rdv:${s.nouveauxRdv} mandats:${s.nouveauxMandats} appels:${s.appels} envoyes:${s.candidaturesEnvoyeesClient}`);
  }
  console.log('  Recruteurs:');
  for (const r of payload.parPersonne.recruteurs) {
    console.log(`    ${r.user.label}${r.user.excludeFromTeamStats ? ' (hors totaux)' : ''} — appels:${r.appels} entr:${r.entretiensRecruteur} present:${r.presentations}`);
  }
  const t = payload.parPersonne.totaux;
  console.log(`  Totaux equipe: ${t.appelsEquipe} appels · ${t.rdvEquipe} RDV · ${t.entretiensRecruteurEquipe} entr.rec · ${t.presentationsEquipe} pres · ${t.entretiensClientEquipe} entr.cli · ${t.placementsEquipe} placements · ${t.nouveauxMandatsEquipe} mandats`);
  console.log(`  Grand total : ${t.appelsGrandTotal} appels · ${t.rdvGrandTotal} RDV`);

  console.log('\n─── RENDU ───');
  const subject = renderRecapSubject(payload);
  const html = renderRecapHtml(payload);
  const text = renderRecapText(payload);
  console.log(`  subject: ${subject}`);
  console.log(`  html   : ${html.length} chars`);
  console.log(`  text   : ${text.length} chars`);
  writeFileSync('/tmp/recap-preview.html', html);
  writeFileSync('/tmp/recap-preview.txt', text);
  console.log('\n✅ Preview ecrit : /tmp/recap-preview.html + /tmp/recap-preview.txt');

  // Assertions
  const errs: string[] = [];
  if (payload.mandats.length !== 3) errs.push(`mandats attendu=3 obtenu=${payload.mandats.length}`);

  const head = payload.mandats.find((m) => m.titrePoste === 'Head of Sales');
  if (!head) errs.push('mandat Head introuvable');
  else {
    if (head.totalActifs !== 4) errs.push(`Head totalActifs attendu=4 obtenu=${head.totalActifs}`);
    // Prez prevues attendues : Marc via MEETING + Marc via dateEntretienClient (memes candidat, 2 sources)
    if (head.presentationsPrevues.length !== 2)
      errs.push(`Head presentationsPrevues attendu=2 obtenu=${head.presentationsPrevues.length}`);
  }

  const cto = payload.mandats.find((m) => m.titrePoste === 'CTO');
  if (!cto) errs.push('mandat CTO introuvable');
  else {
    if (cto.totalActifs !== 1) errs.push(`CTO totalActifs attendu=1 obtenu=${cto.totalActifs}`);
    if (cto.presentationsPrevues.length !== 1)
      errs.push(`CTO presentationsPrevues attendu=1 obtenu=${cto.presentationsPrevues.length}`);
  }

  const pm = payload.mandats.find((m) => m.titrePoste === 'Product Manager');
  if (!pm) errs.push('mandat PM introuvable');
  else {
    if (pm.totalActifs !== 0) errs.push(`PM totalActifs attendu=0 obtenu=${pm.totalActifs}`);
    if (pm.presentationsPrevues.length !== 0)
      errs.push(`PM presentationsPrevues attendu=0 obtenu=${pm.presentationsPrevues.length}`);
  }

  if (t.appelsEquipe !== 3) errs.push(`appelsEquipe attendu=3 (2 vicky+1 valentin, meroe exclue) obtenu=${t.appelsEquipe}`);
  if (t.appelsGrandTotal !== 4) errs.push(`appelsGrandTotal attendu=4 obtenu=${t.appelsGrandTotal}`);
  if (t.presentationsEquipe !== 1) errs.push(`presentationsEquipe attendu=1 (Vicky recruteur du ENVOYE_CLIENT) obtenu=${t.presentationsEquipe}`);

  console.log('\n─── ASSERTIONS ───');
  if (errs.length === 0) console.log('  ✅ Toutes les assertions passent');
  else {
    console.log('  ❌ Echecs :');
    for (const e of errs) console.log(`     - ${e}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
