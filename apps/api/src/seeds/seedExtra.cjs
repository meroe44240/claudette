/**
 * seedExtra.cjs — Seed templates, sequences, sequenceRuns, sdrLists, sdrContacts,
 * adchaseCampaigns, adchaseProspects, reminders
 */

const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');

const prisma = new PrismaClient();

// ─── EXISTING IDS ───────────────────────────────────────
const MEROE_ID = 'e8d757cd-5891-4f26-a716-d873af779bb0';
const GUILLERMO_ID = '89c405e5-7dc3-44b6-af0a-1495a0770616';
const VALENTIN_ID = '4543e84b-c88e-4b72-a27a-55ec9a647a84';
const MARIE_ID = 'f1a2b3c4-d5e6-4f78-9a0b-1c2d3e4f5a6b';

// Candidats
const CANDIDAT_PIERRE_DUBOIS = '5b1a6091-d4f4-4b7d-a1a7-bd9625b8da66';
const CANDIDAT_CAMILLE_BENOIT = '1c44d100-5e03-4ec6-960c-e646ef5f219c';
const CANDIDAT_EMILY_THOMPSON = '50ed8b55-1f74-4d16-84d0-cd3fcf89d7be';
const CANDIDAT_LUCAS_FERREIRA = '5de67620-f917-4b28-baca-10031074769d';
const CANDIDAT_CARLOS_GARCIA = 'bafc873b-6693-4834-a512-ecf5cfd7f6a2';
const CANDIDAT_ROMAIN_LEGAY = '8513c336-4653-4ca1-a6c9-e7e4d05a3112';
const CANDIDAT_MARINE_DUPONT = '762daa81-9dba-4b10-8d71-6b914865926d';
const CANDIDAT_FELIX_SCHNEIDER = '53426851-cf48-40d2-8745-b9745b2fb275';
const CANDIDAT_REBECCA_SMITH = 'aac09450-cfe7-4ac8-85e1-469726d9f948';
const CANDIDAT_BAPTISTE_LEMOINE = 'a29ba709-25ad-4841-87e5-a653454c3674';

// Clients
const CLIENT_JULIEN_MARTIN = '3eed2d56-7f8a-4240-a0f7-3635c83de318'; // Contentsquare
const CLIENT_SOPHIE_MOREAU = '9bb3798a-a0de-4423-909f-3b4c197baa0d'; // TechVision SAS
const CLIENT_DAVID_CHEN = '018c1feb-b1cd-43a8-a74c-4b127965778e'; // TechVision SAS
const CLIENT_RAJ_PATEL = '22f33297-5364-4179-a41d-f1e35601008b'; // CloudSecure
const CLIENT_ELENA_GARCIA = 'fa0589f8-f7c5-4acd-8435-53bb271aa1ae'; // Oracle
const CLIENT_THOMAS_BROWN = '49aeef69-df71-4aa5-87f1-1b42b47a52d2'; // Revolut
const CLIENT_SARAH_JOHNSON = '81d4a5d6-99a6-4a51-bf71-4ea36c829869'; // Revolut
const CLIENT_ANNA_SCHMIDT = '179107c3-e1b1-46d9-a4b2-27e3b5f59b71'; // FinEdge
const CLIENT_PATRICK_OBRIEN = '77dde997-bd59-489b-9dd4-62188925c12e'; // FinEdge
const CLIENT_KLAUS_WEBER = '3b2356e5-a102-4605-833a-1f85a27b74f8'; // GreenLogistics
const CLIENT_RASHID_ALMAKTOUM = 'a3c96283-42b8-48fc-bb71-55021efd9230'; // Hilton
const CLIENT_PIERRE_LEROY = '2c582b70-8b28-419f-ad9e-2368bc0cd174'; // Joy/Privateaser
const CLIENT_ANTOINE_BERGER = '5f63d964-260a-4964-8387-b555eff99e5e'; // Contentsquare
const CLIENT_OMAR_AHMED = 'f5e96449-aafd-43f2-9682-fd3004f3fe37'; // Marriott

// Entreprises
const ENT_CONTENTSQUARE = '07fbb0be-1ef4-4ab5-ac53-42a69d0d789d';
const ENT_TECHVISION = '9ccf1b4c-bd71-474d-baec-a4df3faf29e9';
const ENT_ORACLE = '7817df06-47d0-47d1-92af-aef938a56695';
const ENT_REVOLUT = '9c1eba13-1c03-4008-9614-5eb222ca00c9';
const ENT_FINEDGE = 'fc880af3-03c4-4a6f-8f80-b8a1fe5e17fe';
const ENT_HILTON = '977ed411-d536-4b18-aa0f-20e68fa5c52c';
const ENT_N26 = 'eb7dddd0-90b6-4ccc-90a9-a72429835dba';
const ENT_PALOALTO = 'e758ddc3-912e-4b93-8e35-1bed27f971b0';

// Mandats
const MANDAT_HEAD_SALES = 'bdaf3940-152e-4268-833e-105bc0689f6b';
const MANDAT_ENTERPRISE_AE = '62a7fb3a-263b-4782-a61b-7e0624725862';
const MANDAT_FOUNDING_AE = '289f2eda-8c07-43d6-9b84-3ca2fc26db48';
const MANDAT_HEAD_AM = '97cb4592-e40a-401e-9069-3e5c155cc174';
const MANDAT_HEAD_PARTNERSHIPS = 'ff27cf2a-bce3-4e8e-955b-92d616b23621';

// ─── FIXED IDs FOR NEW DATA ─────────────────────────────
// Templates
const TMPL_PRISE_CONTACT_CANDIDAT = randomUUID();
const TMPL_RELANCE_CANDIDAT = randomUUID();
const TMPL_PRES_CLIENT = randomUUID();
const TMPL_BRIEF_POSTE = randomUUID();
const TMPL_COMPTE_RENDU = randomUUID();
const TMPL_PRISE_CONTACT_CANDIDAT_2 = randomUUID();
const TMPL_RELANCE_CLIENT = randomUUID();
const TMPL_APPROCHE_LINKEDIN = randomUUID();

// Sequences
const SEQ_CANDIDAT_PASSIF = randomUUID();
const SEQ_RELANCE_CLIENT = randomUUID();
const SEQ_SOURCING_TECH = randomUUID();
const SEQ_ONBOARDING_CANDIDAT = randomUUID();

// SequenceRuns
const RUN_1 = randomUUID();
const RUN_2 = randomUUID();
const RUN_3 = randomUUID();
const RUN_4 = randomUUID();
const RUN_5 = randomUUID();
const RUN_6 = randomUUID();

// SdrLists
const SDR_LIST_1 = randomUUID();
const SDR_LIST_2 = randomUUID();
const SDR_LIST_3 = randomUUID();

// AdchaseCampaigns
const ADCHASE_1 = randomUUID();
const ADCHASE_2 = randomUUID();

async function main() {
  console.log('=== SEEDING EXTRA DATA ===\n');

  // ──────────────────────────────────────────────────────
  // 1. TEMPLATES (8)
  // ──────────────────────────────────────────────────────
  console.log('1. Creating templates...');

  await prisma.template.createMany({
    data: [
      {
        id: TMPL_PRISE_CONTACT_CANDIDAT,
        nom: 'Prise de contact candidat - Sales',
        type: 'EMAIL_PRISE_CONTACT',
        sujet: 'Opportunite {poste} - {entreprise}',
        contenu: `Bonjour {candidat.prenom},

Je suis {user.prenom} {user.nom}, consultant chez HumanUp, cabinet specialise dans le recrutement de profils commerciaux.

Je travaille actuellement sur un poste de {poste} pour le compte de {entreprise}, un acteur majeur de son secteur.

Le poste propose :
- Une remuneration attractive (fixe + variable)
- Un environnement stimulant et en forte croissance
- De belles perspectives d'evolution

Seriez-vous ouvert(e) a en discuter lors d'un echange de 15 minutes ?

Cordialement,
{user.prenom} {user.nom}
HumanUp`,
        variables: ['candidat.prenom', 'user.prenom', 'user.nom', 'poste', 'entreprise'],
        isGlobal: true,
        createdById: MEROE_ID,
      },
      {
        id: TMPL_RELANCE_CANDIDAT,
        nom: 'Relance candidat J+3',
        type: 'EMAIL_RELANCE',
        sujet: 'Re: Opportunite {poste} - Suite a mon message',
        contenu: `Bonjour {candidat.prenom},

Je me permets de revenir vers vous suite a mon precedent message concernant le poste de {poste}.

Je comprends que votre emploi du temps est charge, mais je suis convaincu(e) que cette opportunite pourrait reellement correspondre a vos ambitions.

Seriez-vous disponible pour un rapide echange cette semaine ?

Bien a vous,
{user.prenom} {user.nom}`,
        variables: ['candidat.prenom', 'user.prenom', 'user.nom', 'poste'],
        isGlobal: true,
        createdById: MEROE_ID,
      },
      {
        id: TMPL_PRES_CLIENT,
        nom: 'Presentation candidat au client',
        type: 'EMAIL_PRESENTATION_CLIENT',
        sujet: 'Profil qualifie pour votre poste {poste}',
        contenu: `Bonjour {client.prenom},

Suite a notre echange, j'ai le plaisir de vous presenter un profil que j'ai qualifie pour le poste de {poste}.

PROFIL ANONYMISE :
- Experience : {experience} ans dans le secteur
- Poste actuel : {posteActuel}
- Points forts : {sellingPoints}
- Disponibilite : {disponibilite}
- Pretentions : {salaire}

Je vous propose un point telephonique pour vous detailler ce profil. Quand seriez-vous disponible ?

Cordialement,
{user.prenom} {user.nom}`,
        variables: ['client.prenom', 'poste', 'experience', 'posteActuel', 'sellingPoints', 'disponibilite', 'salaire', 'user.prenom', 'user.nom'],
        isGlobal: true,
        createdById: MEROE_ID,
      },
      {
        id: TMPL_BRIEF_POSTE,
        nom: 'Brief de poste standard',
        type: 'NOTE_BRIEF_POSTE',
        contenu: `BRIEF DE POSTE - {poste}

CLIENT : {entreprise}
CONTACT : {client.prenom} {client.nom}
DATE : {date}

1. CONTEXTE DU RECRUTEMENT
- Raison du recrutement :
- Urgence :
- Budget valide :

2. DESCRIPTION DU POSTE
- Missions principales :
- Perimetre (territoire, CA, equipe) :
- Rattachement hierarchique :

3. PROFIL RECHERCHE
- Formation :
- Experience minimum :
- Competences cles :
- Soft skills :

4. PACKAGE
- Fixe :
- Variable :
- Avantages :

5. PROCESS DE RECRUTEMENT
- Etapes :
- Decision-makers :
- Timeline :`,
        variables: ['poste', 'entreprise', 'client.prenom', 'client.nom', 'date'],
        isGlobal: true,
        createdById: MEROE_ID,
      },
      {
        id: TMPL_COMPTE_RENDU,
        nom: 'Compte-rendu entretien candidat',
        type: 'NOTE_COMPTE_RENDU',
        contenu: `COMPTE-RENDU D'ENTRETIEN

Candidat : {candidat.prenom} {candidat.nom}
Date : {date}
Consultant : {user.prenom} {user.nom}

1. SITUATION ACTUELLE
- Poste :
- Entreprise :
- Anciennete :

2. MOTIVATION / PROJET
- Raisons du changement :
- Projet professionnel :

3. COMPETENCES EVALUEES
- Techniques :
- Commerciales :
- Management :

4. PRETENTIONS
- Salaire actuel :
- Salaire souhaite :
- Preavis :

5. EVALUATION GLOBALE
- Note /5 :
- Points forts :
- Points de vigilance :
- Mandats potentiels :`,
        variables: ['candidat.prenom', 'candidat.nom', 'date', 'user.prenom', 'user.nom'],
        isGlobal: true,
        createdById: MEROE_ID,
      },
      {
        id: TMPL_PRISE_CONTACT_CANDIDAT_2,
        nom: 'Approche candidat - Fintech',
        type: 'EMAIL_PRISE_CONTACT',
        sujet: '{entreprise} recrute - votre profil nous interesse',
        contenu: `{candidat.prenom}, bonjour,

Votre parcours dans la vente B2B a retenu notre attention. Mon client, {entreprise}, acteur fintech en forte croissance, recherche un(e) {poste} pour accompagner son expansion.

Ce qui rend cette opportunite unique :
- Scale-up en hyper-croissance (+200% YoY)
- Package attractif (OTE 120k+ selon experience)
- Remote-friendly, equipe internationale

Un echange de 10 min vous interesse ?

{user.prenom} {user.nom} | HumanUp`,
        variables: ['candidat.prenom', 'entreprise', 'poste', 'user.prenom', 'user.nom'],
        isGlobal: false,
        createdById: GUILLERMO_ID,
      },
      {
        id: TMPL_RELANCE_CLIENT,
        nom: 'Relance client - Point mandat',
        type: 'EMAIL_RELANCE',
        sujet: 'Point d\'avancement - Recrutement {poste}',
        contenu: `Bonjour {client.prenom},

Je souhaitais faire un point sur l'avancement du recrutement pour le poste de {poste}.

Depuis notre dernier echange :
- {nbCandidats} profils identifies
- {nbQualifies} candidats qualifies et en process
- {nbShortlist} profils en shortlist

Pouvons-nous planifier un point cette semaine pour avancer ?

Bien cordialement,
{user.prenom} {user.nom}`,
        variables: ['client.prenom', 'poste', 'nbCandidats', 'nbQualifies', 'nbShortlist', 'user.prenom', 'user.nom'],
        isGlobal: false,
        createdById: VALENTIN_ID,
      },
      {
        id: TMPL_APPROCHE_LINKEDIN,
        nom: 'Message LinkedIn - Approche directe',
        type: 'AUTRE',
        contenu: `{candidat.prenom}, bonjour !

Votre expertise en {domaine} m'a interpelle. Je recrute actuellement pour {entreprise} un profil {poste} - je pense que ca pourrait vous correspondre.

Ouvert(e) a un echange rapide ?

{user.prenom} | HumanUp`,
        variables: ['candidat.prenom', 'domaine', 'entreprise', 'poste', 'user.prenom'],
        isGlobal: false,
        createdById: MARIE_ID,
      },
    ],
  });
  console.log('  -> 8 templates created');

  // ──────────────────────────────────────────────────────
  // 2. SEQUENCES (4)
  // ──────────────────────────────────────────────────────
  console.log('2. Creating sequences...');

  await prisma.sequence.createMany({
    data: [
      {
        id: SEQ_CANDIDAT_PASSIF,
        nom: 'Relance candidat passif - 4 etapes',
        description: 'Sequence multicanal pour engager les candidats passifs identifies sur LinkedIn ou en base. Email > Call > Relance > WhatsApp.',
        persona: 'Candidat passif Tech/Sales',
        targetType: 'candidate',
        stopOnReply: true,
        isActive: true,
        steps: [
          {
            order: 1,
            delay_days: 0,
            delay_hours: 0,
            channel: 'email',
            action: 'send',
            template: {
              subject: 'Opportunite interessante pour vous',
              body: 'Bonjour, votre profil a retenu notre attention pour un poste passionnant...',
            },
            task_title: 'Envoyer email de prise de contact',
            instructions: 'Personnaliser selon le profil du candidat',
          },
          {
            order: 2,
            delay_days: 2,
            delay_hours: 0,
            channel: 'call',
            action: 'call',
            template: {},
            task_title: 'Appel de suivi - candidat passif',
            instructions: 'Si pas de reponse email, appeler. Pitch: 30 sec max, proposer un creneau.',
          },
          {
            order: 3,
            delay_days: 5,
            delay_hours: 0,
            channel: 'email',
            action: 'send',
            template: {
              subject: 'Relance - Une opportunite sur mesure',
              body: 'Bonjour, je me permets de revenir vers vous...',
            },
            task_title: 'Email de relance J+5',
            instructions: 'Ajouter un element de valeur (news entreprise, temoignage)',
          },
          {
            order: 4,
            delay_days: 8,
            delay_hours: 0,
            channel: 'whatsapp',
            action: 'message',
            template: {
              whatsapp_message: 'Bonjour {prenom}, je suis {user} de HumanUp. Je vous ai ecrit pour une opportunite en Sales, avez-vous pu voir mon message ? Bonne journee !',
            },
            task_title: 'WhatsApp de relance finale',
            instructions: 'Dernier point de contact, ton leger et pro.',
          },
        ],
        createdById: GUILLERMO_ID,
      },
      {
        id: SEQ_RELANCE_CLIENT,
        nom: 'Suivi client actif - 3 etapes',
        description: 'Sequence pour maintenir le contact avec un client en process actif. Point hebdo + relance.',
        persona: 'DRH / Hiring Manager',
        targetType: 'client',
        stopOnReply: true,
        isActive: true,
        steps: [
          {
            order: 1,
            delay_days: 0,
            delay_hours: 0,
            channel: 'email',
            action: 'send',
            template: {
              subject: 'Point hebdomadaire - Recrutement en cours',
              body: 'Bonjour, voici le point sur les candidatures en cours...',
            },
            task_title: 'Envoyer point hebdo client',
            instructions: 'Inclure les metrics du pipeline',
          },
          {
            order: 2,
            delay_days: 3,
            delay_hours: 0,
            channel: 'call',
            action: 'call',
            template: {},
            task_title: 'Appel suivi client',
            instructions: 'Verifier retour sur les profils envoyes, recueillir feedback',
          },
          {
            order: 3,
            delay_days: 7,
            delay_hours: 0,
            channel: 'email',
            action: 'send',
            template: {
              subject: 'Nouveaux profils qualifies',
              body: 'Bonjour, j\'ai de nouveaux profils a vous presenter...',
            },
            task_title: 'Email nouveaux profils',
            instructions: 'Joindre les fiches candidats anonymisees',
          },
        ],
        createdById: VALENTIN_ID,
      },
      {
        id: SEQ_SOURCING_TECH,
        nom: 'Sourcing Sales SaaS - 5 touchpoints',
        description: 'Sequence intensive pour sourcer des profils sales SaaS seniors. Multi-canal avec LinkedIn InMail.',
        persona: 'Sales SaaS Senior (AE/Sales Manager)',
        targetType: 'candidate',
        stopOnReply: true,
        isActive: true,
        steps: [
          {
            order: 1,
            delay_days: 0,
            delay_hours: 0,
            channel: 'email',
            action: 'send',
            template: {
              subject: 'Scale-up SaaS en croissance cherche son futur leader commercial',
              body: 'Bonjour, votre parcours dans le SaaS m\'a interpelle...',
            },
            task_title: 'Premier email personnalise',
            instructions: 'Rechercher le candidat sur LinkedIn avant pour personnaliser',
          },
          {
            order: 2,
            delay_days: 1,
            delay_hours: 4,
            channel: 'call',
            action: 'call',
            template: {},
            task_title: 'Appel decouverte rapide',
            instructions: 'Max 5 min, qualifier l\'interet et la dispo',
          },
          {
            order: 3,
            delay_days: 3,
            delay_hours: 0,
            channel: 'email',
            action: 'send',
            template: {
              subject: 'Re: Scale-up SaaS - Plus de details',
              body: 'Bonjour, je souhaitais vous donner plus de contexte sur cette opportunite...',
            },
            task_title: 'Email details poste + entreprise',
          },
          {
            order: 4,
            delay_days: 6,
            delay_hours: 0,
            channel: 'whatsapp',
            action: 'message',
            template: {
              whatsapp_message: 'Bonjour {prenom}, avez-vous pu considerer l\'opportunite SaaS dont je vous ai parle ? Je reste dispo pour en discuter.',
            },
            task_title: 'WhatsApp relance amicale',
          },
          {
            order: 5,
            delay_days: 10,
            delay_hours: 0,
            channel: 'email',
            action: 'send',
            template: {
              subject: 'Derniere relance - Opportunite Sales SaaS',
              body: 'Bonjour, c\'est ma derniere relance. Si le timing n\'est pas bon, je comprends...',
            },
            task_title: 'Email cloture sequence',
            instructions: 'Ton empathique, laisser la porte ouverte',
          },
        ],
        createdById: MARIE_ID,
      },
      {
        id: SEQ_ONBOARDING_CANDIDAT,
        nom: 'Onboarding candidat en process',
        description: 'Accompagnement du candidat engage dans un process client : prep entretien, suivi, debrief.',
        persona: 'Candidat en shortlist',
        targetType: 'candidate',
        stopOnReply: false,
        isActive: true,
        steps: [
          {
            order: 1,
            delay_days: 0,
            delay_hours: 0,
            channel: 'email',
            action: 'send',
            template: {
              subject: 'Preparation entretien {entreprise}',
              body: 'Bonjour, voici le brief pour votre entretien...',
            },
            task_title: 'Envoyer brief preparation entretien',
            instructions: 'Joindre infos entreprise + profil intervieweur',
          },
          {
            order: 2,
            delay_days: 1,
            delay_hours: 0,
            channel: 'call',
            action: 'call',
            template: {},
            task_title: 'Appel prep entretien (coaching)',
            instructions: 'Simuler questions types, preparer le pitch',
          },
          {
            order: 3,
            delay_days: 0,
            delay_hours: 2,
            channel: 'call',
            action: 'call',
            template: {},
            task_title: 'Debrief post-entretien',
            instructions: 'Appeler dans les 2h apres l\'entretien pour debrief a chaud',
          },
        ],
        createdById: GUILLERMO_ID,
      },
    ],
  });
  console.log('  -> 4 sequences created');

  // ──────────────────────────────────────────────────────
  // 3. SEQUENCE RUNS (6)
  // ──────────────────────────────────────────────────────
  console.log('3. Creating sequence runs...');

  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  const daysLater = (n) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

  await prisma.sequenceRun.createMany({
    data: [
      // Run 1: Pierre Dubois in "Candidat passif" sequence — step 2 running
      {
        id: RUN_1,
        sequenceId: SEQ_CANDIDAT_PASSIF,
        targetType: 'candidate',
        targetId: CANDIDAT_PIERRE_DUBOIS,
        mandatId: MANDAT_ENTERPRISE_AE,
        assignedToId: GUILLERMO_ID,
        currentStep: 2,
        status: 'running',
        startedAt: daysAgo(3),
        nextActionAt: daysLater(1),
        metadata: { source: 'linkedin_import' },
      },
      // Run 2: Emily Thompson — paused (she replied)
      {
        id: RUN_2,
        sequenceId: SEQ_CANDIDAT_PASSIF,
        targetType: 'candidate',
        targetId: CANDIDAT_EMILY_THOMPSON,
        mandatId: MANDAT_HEAD_SALES,
        assignedToId: GUILLERMO_ID,
        currentStep: 1,
        status: 'paused_reply',
        startedAt: daysAgo(5),
        nextActionAt: null,
        metadata: { replyDetectedAt: daysAgo(3).toISOString() },
      },
      // Run 3: Julien Martin (client) in client suivi sequence
      {
        id: RUN_3,
        sequenceId: SEQ_RELANCE_CLIENT,
        targetType: 'client',
        targetId: CLIENT_JULIEN_MARTIN,
        mandatId: MANDAT_HEAD_PARTNERSHIPS,
        assignedToId: VALENTIN_ID,
        currentStep: 1,
        status: 'running',
        startedAt: daysAgo(2),
        nextActionAt: daysLater(1),
        metadata: {},
      },
      // Run 4: Carlos Garcia in sourcing SaaS — completed
      {
        id: RUN_4,
        sequenceId: SEQ_SOURCING_TECH,
        targetType: 'candidate',
        targetId: CANDIDAT_CARLOS_GARCIA,
        mandatId: MANDAT_FOUNDING_AE,
        assignedToId: MARIE_ID,
        currentStep: 5,
        status: 'completed',
        startedAt: daysAgo(15),
        nextActionAt: null,
        metadata: { completedReason: 'all_steps_done' },
      },
      // Run 5: Romain Legay in sourcing SaaS — running step 3
      {
        id: RUN_5,
        sequenceId: SEQ_SOURCING_TECH,
        targetType: 'candidate',
        targetId: CANDIDAT_ROMAIN_LEGAY,
        mandatId: MANDAT_FOUNDING_AE,
        assignedToId: MARIE_ID,
        currentStep: 3,
        status: 'running',
        startedAt: daysAgo(4),
        nextActionAt: daysLater(2),
        metadata: {},
      },
      // Run 6: Marine Dupont in onboarding — running step 2
      {
        id: RUN_6,
        sequenceId: SEQ_ONBOARDING_CANDIDAT,
        targetType: 'candidate',
        targetId: CANDIDAT_MARINE_DUPONT,
        mandatId: MANDAT_HEAD_AM,
        assignedToId: GUILLERMO_ID,
        currentStep: 2,
        status: 'running',
        startedAt: daysAgo(1),
        nextActionAt: daysLater(0),
        metadata: { interviewDate: daysLater(1).toISOString() },
      },
    ],
  });
  console.log('  -> 6 sequence runs created');

  // ──────────────────────────────────────────────────────
  // 3b. SEQUENCE STEP LOGS
  // ──────────────────────────────────────────────────────
  console.log('3b. Creating sequence step logs...');

  await prisma.sequenceStepLog.createMany({
    data: [
      // Run 1 (Pierre Dubois) — step 1 done, step 2 pending
      {
        sequenceRunId: RUN_1,
        stepOrder: 1,
        actionType: 'send',
        channel: 'email',
        status: 'validated',
        executedAt: daysAgo(3),
        result: { emailSent: true },
      },
      {
        sequenceRunId: RUN_1,
        stepOrder: 2,
        actionType: 'call',
        channel: 'call',
        status: 'task_created',
        executedAt: null,
      },
      // Run 2 (Emily Thompson) — step 1 done, reply detected
      {
        sequenceRunId: RUN_2,
        stepOrder: 1,
        actionType: 'send',
        channel: 'email',
        status: 'reply_detected',
        executedAt: daysAgo(5),
        result: { replyAt: daysAgo(3).toISOString() },
      },
      // Run 3 (Julien Martin) — step 1 done
      {
        sequenceRunId: RUN_3,
        stepOrder: 1,
        actionType: 'send',
        channel: 'email',
        status: 'validated',
        executedAt: daysAgo(2),
        result: { emailSent: true },
      },
      // Run 4 (Carlos Garcia) — all 5 steps done
      {
        sequenceRunId: RUN_4,
        stepOrder: 1,
        actionType: 'send',
        channel: 'email',
        status: 'validated',
        executedAt: daysAgo(15),
      },
      {
        sequenceRunId: RUN_4,
        stepOrder: 2,
        actionType: 'call',
        channel: 'call',
        status: 'validated',
        executedAt: daysAgo(13),
        result: { callResult: 'no_answer' },
      },
      {
        sequenceRunId: RUN_4,
        stepOrder: 3,
        actionType: 'send',
        channel: 'email',
        status: 'validated',
        executedAt: daysAgo(12),
      },
      {
        sequenceRunId: RUN_4,
        stepOrder: 4,
        actionType: 'message',
        channel: 'whatsapp',
        status: 'validated',
        executedAt: daysAgo(9),
      },
      {
        sequenceRunId: RUN_4,
        stepOrder: 5,
        actionType: 'send',
        channel: 'email',
        status: 'validated',
        executedAt: daysAgo(5),
      },
      // Run 5 (Romain Legay) — steps 1-2 done, step 3 task created
      {
        sequenceRunId: RUN_5,
        stepOrder: 1,
        actionType: 'send',
        channel: 'email',
        status: 'validated',
        executedAt: daysAgo(4),
      },
      {
        sequenceRunId: RUN_5,
        stepOrder: 2,
        actionType: 'call',
        channel: 'call',
        status: 'validated',
        executedAt: daysAgo(2),
        result: { callResult: 'answered', duration: '4min' },
      },
      {
        sequenceRunId: RUN_5,
        stepOrder: 3,
        actionType: 'send',
        channel: 'email',
        status: 'task_created',
      },
      // Run 6 (Marine Dupont) — step 1 done, step 2 pending
      {
        sequenceRunId: RUN_6,
        stepOrder: 1,
        actionType: 'send',
        channel: 'email',
        status: 'validated',
        executedAt: daysAgo(1),
      },
      {
        sequenceRunId: RUN_6,
        stepOrder: 2,
        actionType: 'call',
        channel: 'call',
        status: 'task_created',
      },
    ],
  });
  console.log('  -> 14 sequence step logs created');

  // ──────────────────────────────────────────────────────
  // 4. SDR LISTS (3) + SDR CONTACTS (30)
  // ──────────────────────────────────────────────────────
  console.log('4. Creating SDR lists...');

  await prisma.sdrList.createMany({
    data: [
      {
        id: SDR_LIST_1,
        name: 'LinkedIn Export - Sales Directors Paris',
        fileName: 'linkedin_sales_directors_paris_mars2026.csv',
        totalContacts: 12,
        processedContacts: 8,
        status: 'in_progress',
        assignedToId: GUILLERMO_ID,
        createdById: GUILLERMO_ID,
        metadata: {
          headers: ['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Title'],
          importedAt: daysAgo(5).toISOString(),
          source: 'LinkedIn Sales Navigator',
        },
      },
      {
        id: SDR_LIST_2,
        name: 'Salon E-Commerce Paris 2026',
        fileName: 'salon_ecommerce_visiteurs_2026.csv',
        totalContacts: 10,
        processedContacts: 10,
        status: 'completed',
        assignedToId: VALENTIN_ID,
        createdById: VALENTIN_ID,
        metadata: {
          headers: ['Nom', 'Prenom', 'Email', 'Societe', 'Fonction'],
          importedAt: daysAgo(14).toISOString(),
          source: 'Badge scan salon',
        },
      },
      {
        id: SDR_LIST_3,
        name: 'Fintech France - DRH & VP Sales',
        fileName: 'fintech_france_drh_vp_sales.csv',
        totalContacts: 8,
        processedContacts: 3,
        status: 'in_progress',
        assignedToId: MARIE_ID,
        createdById: MARIE_ID,
        metadata: {
          headers: ['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Title', 'LinkedIn'],
          importedAt: daysAgo(3).toISOString(),
          source: 'Scraping + enrichissement Kaspr',
        },
      },
    ],
  });
  console.log('  -> 3 SDR lists created');

  console.log('4b. Creating SDR contacts...');

  // SDR List 1 contacts (12 contacts)
  const sdrList1Contacts = [
    { firstName: 'Alexandre', lastName: 'Moreau', email: 'a.moreau@salesforce-competitor.com', phone: '+33612340001', company: 'Salesforce', jobTitle: 'Sales Director EMEA', callResult: 'answered', notes: 'Tres interesse, en veille active. Dispo semaine prochaine.', processedAt: daysAgo(4) },
    { firstName: 'Claire', lastName: 'Dumont', email: 'c.dumont@sapfrance.com', phone: '+33612340002', company: 'SAP France', jobTitle: 'VP Sales France', callResult: 'no_answer', notes: null, processedAt: daysAgo(4) },
    { firstName: 'Marc', lastName: 'Lefevre', email: 'm.lefevre@hubspot.com', phone: '+33612340003', company: 'HubSpot', jobTitle: 'Regional Director', callResult: 'answered', notes: 'Pas en recherche mais connait des gens. Demander referrals.', processedAt: daysAgo(3) },
    { firstName: 'Sophie', lastName: 'Bernard', email: 's.bernard@datadog.com', phone: '+33612340004', company: 'Datadog', jobTitle: 'Enterprise Sales Director', callResult: 'voicemail', notes: null, processedAt: daysAgo(3) },
    { firstName: 'Thomas', lastName: 'Giraud', email: 't.giraud@mongodb.com', phone: '+33612340005', company: 'MongoDB', jobTitle: 'Head of Sales Southern Europe', callResult: 'answered', notes: 'En process ailleurs. Pas le bon timing. Recontacter dans 3 mois.', processedAt: daysAgo(2) },
    { firstName: 'Julie', lastName: 'Roche', email: 'j.roche@stripe.com', phone: '+33612340006', company: 'Stripe', jobTitle: 'Sales Lead France', callResult: 'not_interested', notes: 'Vient d\'etre promue, pas en mouvement.', processedAt: daysAgo(2) },
    { firstName: 'Nicolas', lastName: 'Blanc', email: 'n.blanc@algolia.com', phone: '+33612340007', company: 'Algolia', jobTitle: 'VP Sales', callResult: 'callback', notes: 'Rappeler jeudi 14h. Interesse par Fintech.', processedAt: daysAgo(1) },
    { firstName: 'Isabelle', lastName: 'Fournier', email: 'i.fournier@doctolib.com', phone: '+33612340008', company: 'Doctolib', jobTitle: 'Directrice Commerciale', callResult: 'answered', notes: 'Super profil. Meeting programme semaine pro. A presenter sur mandat Revolut.', processedAt: daysAgo(1) },
    { firstName: 'Pierre', lastName: 'Morel', email: 'p.morel@criteo.com', phone: '+33612340009', company: 'Criteo', jobTitle: 'Sales Director', callResult: 'pending', notes: null, processedAt: null },
    { firstName: 'Laure', lastName: 'Petit', email: 'l.petit@mirakl.com', phone: '+33612340010', company: 'Mirakl', jobTitle: 'Head of Enterprise Sales', callResult: 'pending', notes: null, processedAt: null },
    { firstName: 'Jean-Baptiste', lastName: 'Roy', email: 'jb.roy@contentful.com', phone: '+33612340011', company: 'Contentful', jobTitle: 'Regional Sales Manager', callResult: 'pending', notes: null, processedAt: null },
    { firstName: 'Camille', lastName: 'Simon', email: 'c.simon@brevo.com', phone: '+33612340012', company: 'Brevo', jobTitle: 'VP Sales Europe', callResult: 'pending', notes: null, processedAt: null },
  ];

  // SDR List 2 contacts (10 contacts - all processed)
  const sdrList2Contacts = [
    { firstName: 'Vincent', lastName: 'Dupuis', email: 'v.dupuis@fnac.com', phone: '+33620340001', company: 'Fnac Darty', jobTitle: 'Directeur E-Commerce', callResult: 'answered', notes: 'Recrute 2 sales managers e-commerce. Meeting fixe.' },
    { firstName: 'Marie', lastName: 'Lambert', email: 'm.lambert@cdiscount.com', phone: '+33620340002', company: 'Cdiscount', jobTitle: 'DRH', callResult: 'answered', notes: 'Budget recrutement confirme Q2. Envoyer notre plaquette.' },
    { firstName: 'Laurent', lastName: 'Mercier', email: 'l.mercier@backmarket.com', phone: '+33620340003', company: 'Back Market', jobTitle: 'VP Revenue', callResult: 'no_answer', notes: null },
    { firstName: 'Emilie', lastName: 'Rousseau', email: 'e.rousseau@vestiairecollective.com', phone: '+33620340004', company: 'Vestiaire Collective', jobTitle: 'Head of Sales', callResult: 'not_interested', notes: 'Gel des recrutements en cours.' },
    { firstName: 'Frederic', lastName: 'Bonnet', email: 'f.bonnet@showroomprive.com', phone: '+33620340005', company: 'Showroomprive', jobTitle: 'Country Manager', callResult: 'answered', notes: 'Interesse pour un profil Head of BD. Rappeler debut avril.' },
    { firstName: 'Nathalie', lastName: 'Gauthier', email: 'n.gauthier@mano.com', phone: '+33620340006', company: 'ManoMano', jobTitle: 'DRH France', callResult: 'voicemail', notes: null },
    { firstName: 'Christophe', lastName: 'Perrin', email: 'c.perrin@ankorstore.com', phone: '+33620340007', company: 'Ankorstore', jobTitle: 'Chief Revenue Officer', callResult: 'answered', notes: 'Tres bon contact. 3 postes sales ouverts. Mandat en vue!' },
    { firstName: 'Anne', lastName: 'Andre', email: 'a.andre@vinted.fr', phone: '+33620340008', company: 'Vinted', jobTitle: 'Talent Acquisition Lead', callResult: 'callback', notes: 'Rappeler lundi. Recherche Team Lead Sales.' },
    { firstName: 'David', lastName: 'Faure', email: 'd.faure@sezane.com', phone: '+33620340009', company: 'Sezane', jobTitle: 'VP Business Dev', callResult: 'wrong_number', notes: 'Mauvais numero. Trouver le bon via LinkedIn.' },
    { firstName: 'Stephanie', lastName: 'Leroy', email: 's.leroy@leboncoin.fr', phone: '+33620340010', company: 'Leboncoin', jobTitle: 'Head of Partnerships', callResult: 'answered', notes: 'Pas de besoin imminent mais veille. Recontacter Q3.' },
  ];

  // SDR List 3 contacts (8 contacts)
  const sdrList3Contacts = [
    { firstName: 'Antoine', lastName: 'Martin', email: 'a.martin@qonto.com', phone: '+33630340001', company: 'Qonto', jobTitle: 'VP Sales', callResult: 'answered', notes: 'Recherche AE senior. Bon fit avec notre expertise.', processedAt: daysAgo(2) },
    { firstName: 'Caroline', lastName: 'Dubois', email: 'c.dubois@lydia.com', phone: '+33630340002', company: 'Lydia', jobTitle: 'DRH', callResult: 'no_answer', notes: null, processedAt: daysAgo(2) },
    { firstName: 'Pierre', lastName: 'Fontaine', email: 'p.fontaine@spendesk.com', phone: '+33630340003', company: 'Spendesk', jobTitle: 'Head of Sales France', callResult: 'answered', notes: 'Recrutement interne pour le moment. Check dans 2 mois.', processedAt: daysAgo(1) },
    { firstName: 'Sarah', lastName: 'Cohen', email: 's.cohen@swile.co', phone: '+33630340004', company: 'Swile', jobTitle: 'VP Revenue', callResult: 'pending', notes: null, processedAt: null },
    { firstName: 'Nicolas', lastName: 'Meyer', email: 'n.meyer@alma.eu', phone: '+33630340005', company: 'Alma', jobTitle: 'Country Manager France', callResult: 'pending', notes: null, processedAt: null },
    { firstName: 'Lea', lastName: 'Garnier', email: 'l.garnier@pennylane.com', phone: '+33630340006', company: 'Pennylane', jobTitle: 'Sales Director', callResult: 'pending', notes: null, processedAt: null },
    { firstName: 'Maxime', lastName: 'Robert', email: 'm.robert@agicap.com', phone: '+33630340007', company: 'Agicap', jobTitle: 'VP Sales Europe', callResult: 'pending', notes: null, processedAt: null },
    { firstName: 'Julie', lastName: 'Morin', email: 'j.morin@payfit.com', phone: '+33630340008', company: 'PayFit', jobTitle: 'DRH', callResult: 'pending', notes: null, processedAt: null },
  ];

  // Insert all SDR contacts
  const allSdrContacts = [];

  sdrList1Contacts.forEach((c, i) => {
    allSdrContacts.push({
      sdrListId: SDR_LIST_1,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      company: c.company,
      jobTitle: c.jobTitle,
      callResult: c.callResult,
      notes: c.notes,
      orderInList: i + 1,
      processedAt: c.processedAt || null,
      rawData: { 'First Name': c.firstName, 'Last Name': c.lastName, 'Email': c.email, 'Phone': c.phone, 'Company': c.company, 'Title': c.jobTitle },
    });
  });

  sdrList2Contacts.forEach((c, i) => {
    allSdrContacts.push({
      sdrListId: SDR_LIST_2,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      company: c.company,
      jobTitle: c.jobTitle,
      callResult: c.callResult,
      notes: c.notes,
      orderInList: i + 1,
      processedAt: daysAgo(14 - i),
      rawData: { Nom: c.lastName, Prenom: c.firstName, Email: c.email, Societe: c.company, Fonction: c.jobTitle },
    });
  });

  sdrList3Contacts.forEach((c, i) => {
    allSdrContacts.push({
      sdrListId: SDR_LIST_3,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      company: c.company,
      jobTitle: c.jobTitle,
      callResult: c.callResult,
      notes: c.notes,
      orderInList: i + 1,
      processedAt: c.processedAt || null,
      rawData: { 'First Name': c.firstName, 'Last Name': c.lastName, 'Email': c.email, 'Phone': c.phone, 'Company': c.company, 'Title': c.jobTitle },
    });
  });

  await prisma.sdrContact.createMany({ data: allSdrContacts });
  console.log(`  -> ${allSdrContacts.length} SDR contacts created`);

  // ──────────────────────────────────────────────────────
  // 5. ADCHASE CAMPAIGNS (2) + PROSPECTS (15)
  // ──────────────────────────────────────────────────────
  console.log('5. Creating Adchase campaigns...');

  await prisma.adchaseCampaign.createMany({
    data: [
      {
        id: ADCHASE_1,
        candidatId: CANDIDAT_CAMILLE_BENOIT,
        anonymizedProfile: {
          titre: 'Head of Sales France - SaaS B2B',
          experience_years: 12,
          skills: ['Management equipe 15+', 'SaaS B2B', 'Enterprise Sales', 'Revenue 5M+', 'France & Benelux'],
          ville: 'Paris',
          secteur: 'SaaS / Tech',
          key_points: [
            'Track record : equipe de 0 a 15 commerciaux en 3 ans',
            'CA genere : 5.2M€ ARR sur le marche francais',
            'Experience scale-up + grand groupe',
            'Bilingue FR/EN, notions DE',
          ],
        },
        emailSubject: 'Profil Head of Sales disponible - 12 ans SaaS B2B',
        emailBody: `Bonjour,

Je me permets de vous contacter car je represente un profil exceptionnel de Head of Sales, actuellement en veille active.

PROFIL ANONYMISE :
- 12 ans d'experience en vente SaaS B2B
- Track record : equipe scalee de 0 a 15, CA 5.2M€ ARR
- Expertise : Enterprise Sales, management, expansion France/Benelux
- Disponible sous 2 mois de preavis

Ce profil pourrait-il correspondre a un besoin actuel ou a venir dans votre organisation ?

Je reste disponible pour un echange.

Cordialement,
Guillermo Solis Gomez
HumanUp`,
        totalProspects: 8,
        status: 'active',
        scheduledAt: daysAgo(3),
        sentAt: daysAgo(3),
        createdById: GUILLERMO_ID,
      },
      {
        id: ADCHASE_2,
        candidatId: CANDIDAT_FELIX_SCHNEIDER,
        anonymizedProfile: {
          titre: 'Partnership Manager - Tech / SaaS',
          experience_years: 7,
          skills: ['Channel Sales', 'Partner Management', 'SaaS Integration', 'DACH + France'],
          ville: 'Paris / Remote',
          secteur: 'Tech / SaaS',
          key_points: [
            'Reseau de 50+ partenaires technologiques actifs',
            'Revenue indirect genere : 2.1M€',
            'Experience DACH + France',
            'Trilingual DE/FR/EN',
          ],
        },
        emailSubject: 'Partnership Manager trilingual disponible - Tech/SaaS',
        emailBody: `Bonjour,

Un profil Partnership Manager avec 7 ans d'experience en ecosysteme SaaS est actuellement disponible.

Points cles :
- Reseau de 50+ partenaires actifs
- 2.1M€ de revenue indirect genere
- Experience marche DACH + France
- Trilingue DE/FR/EN

Interesse(e) pour en savoir plus ?

Cordialement,
Marie Le Ret
HumanUp`,
        totalProspects: 7,
        status: 'draft',
        createdById: MARIE_ID,
      },
    ],
  });
  console.log('  -> 2 Adchase campaigns created');

  console.log('5b. Creating Adchase prospects...');

  // Campaign 1 prospects (8 — targeting various clients)
  const campaign1Prospects = [
    { clientId: CLIENT_JULIEN_MARTIN, emailStatus: 'replied', sentAt: daysAgo(3), openedAt: daysAgo(3), repliedAt: daysAgo(2), replySentiment: 'interested', notes: 'Souhaite voir le CV complet. Fixer un call.' },
    { clientId: CLIENT_SOPHIE_MOREAU, emailStatus: 'opened', sentAt: daysAgo(3), openedAt: daysAgo(2), repliedAt: null, replySentiment: null, notes: 'Email ouvert 3 fois.' },
    { clientId: CLIENT_RAJ_PATEL, emailStatus: 'sent', sentAt: daysAgo(3), openedAt: null, repliedAt: null, replySentiment: null, notes: null },
    { clientId: CLIENT_ELENA_GARCIA, emailStatus: 'replied', sentAt: daysAgo(3), openedAt: daysAgo(3), repliedAt: daysAgo(1), replySentiment: 'not_now', notes: 'Pas de besoin imminent, mais garde le CV en reserve.' },
    { clientId: CLIENT_THOMAS_BROWN, emailStatus: 'opened', sentAt: daysAgo(3), openedAt: daysAgo(1), repliedAt: null, replySentiment: null, notes: null },
    { clientId: CLIENT_ANNA_SCHMIDT, emailStatus: 'bounced', sentAt: daysAgo(3), openedAt: null, repliedAt: null, replySentiment: null, notes: 'Email bounce — adresse obsolete. Trouver nouveau contact.' },
    { clientId: CLIENT_KLAUS_WEBER, emailStatus: 'sent', sentAt: daysAgo(3), openedAt: null, repliedAt: null, replySentiment: null, notes: null },
    { clientId: CLIENT_RASHID_ALMAKTOUM, emailStatus: 'replied', sentAt: daysAgo(3), openedAt: daysAgo(2), repliedAt: daysAgo(1), replySentiment: 'interested', notes: 'Tres interesse! Veut organiser un entretien. Top priorite.' },
  ];

  // Campaign 2 prospects (7)
  const campaign2Prospects = [
    { clientId: CLIENT_DAVID_CHEN, emailStatus: 'pending', sentAt: null, openedAt: null, repliedAt: null, replySentiment: null, notes: null },
    { clientId: CLIENT_PIERRE_LEROY, emailStatus: 'pending', sentAt: null, openedAt: null, repliedAt: null, replySentiment: null, notes: null },
    { clientId: CLIENT_ANTOINE_BERGER, emailStatus: 'pending', sentAt: null, openedAt: null, repliedAt: null, replySentiment: null, notes: null },
    { clientId: CLIENT_SARAH_JOHNSON, emailStatus: 'pending', sentAt: null, openedAt: null, repliedAt: null, replySentiment: null, notes: null },
    { clientId: CLIENT_PATRICK_OBRIEN, emailStatus: 'pending', sentAt: null, openedAt: null, repliedAt: null, replySentiment: null, notes: null },
    { clientId: CLIENT_OMAR_AHMED, emailStatus: 'pending', sentAt: null, openedAt: null, repliedAt: null, replySentiment: null, notes: null },
    { clientId: CLIENT_JULIEN_MARTIN, emailStatus: 'pending', sentAt: null, openedAt: null, repliedAt: null, replySentiment: null, notes: null },
  ];

  const allProspects = [];
  campaign1Prospects.forEach(p => {
    allProspects.push({ campaignId: ADCHASE_1, ...p });
  });
  campaign2Prospects.forEach(p => {
    allProspects.push({ campaignId: ADCHASE_2, ...p });
  });

  await prisma.adchaseProspect.createMany({ data: allProspects });
  console.log(`  -> ${allProspects.length} Adchase prospects created`);

  // ──────────────────────────────────────────────────────
  // 6. REMINDERS (10)
  // ──────────────────────────────────────────────────────
  console.log('6. Creating reminders...');

  await prisma.reminder.createMany({
    data: [
      // Guillermo reminders
      {
        userId: GUILLERMO_ID,
        type: 'RELANCE_CLIENT',
        entityType: 'CLIENT',
        entityId: CLIENT_JULIEN_MARTIN,
        titre: 'Relancer Julien Martin (Contentsquare)',
        description: 'Pas de retour depuis 5 jours sur les profils envoyes. Relancer pour avoir du feedback.',
        triggerAt: daysLater(1),
        fired: false,
      },
      {
        userId: GUILLERMO_ID,
        type: 'TACHE_RETARD',
        entityType: 'CANDIDAT',
        entityId: CANDIDAT_PIERRE_DUBOIS,
        titre: 'Debrief Pierre Dubois en retard',
        description: 'Le debrief post-entretien avec Pierre Dubois devait etre fait hier.',
        triggerAt: daysAgo(1),
        fired: true,
        firedAt: daysAgo(1),
      },
      {
        userId: GUILLERMO_ID,
        type: 'CUSTOM',
        titre: 'Appeler Nicolas Blanc (Algolia)',
        description: 'Callback programme jeudi 14h - interesse par opportunite Fintech.',
        triggerAt: daysLater(2),
        fired: false,
      },
      // Valentin reminders
      {
        userId: VALENTIN_ID,
        type: 'MANDAT_DORMANT',
        entityType: 'MANDAT',
        entityId: MANDAT_HEAD_PARTNERSHIPS,
        titre: 'Mandat dormant - Head of Partnerships',
        description: 'Aucune nouvelle candidature depuis 2 semaines. Revoir la strategie de sourcing ou relancer le client.',
        triggerAt: daysLater(0),
        fired: false,
      },
      {
        userId: VALENTIN_ID,
        type: 'RELANCE_CLIENT',
        entityType: 'CLIENT',
        entityId: CLIENT_RAJ_PATEL,
        titre: 'Point mensuel Raj Patel (CloudSecure)',
        description: 'Point mensuel programme avec Raj pour discuter des besoins en recrutement Q2.',
        triggerAt: daysLater(3),
        fired: false,
      },
      // Marie reminders
      {
        userId: MARIE_ID,
        type: 'TACHE_RETARD',
        entityType: 'CANDIDAT',
        entityId: CANDIDAT_ROMAIN_LEGAY,
        titre: 'Relance Romain Legay - pas de reponse',
        description: 'Romain n\'a pas repondu au dernier email. Envoyer le step 3 de la sequence ou escalader.',
        triggerAt: daysAgo(0),
        fired: false,
      },
      {
        userId: MARIE_ID,
        type: 'CUSTOM',
        titre: 'Preparer campagne Adchase Felix Schneider',
        description: 'Finaliser le profil anonymise et la liste de prospects avant envoi.',
        triggerAt: daysLater(2),
        fired: false,
      },
      {
        userId: MARIE_ID,
        type: 'RELANCE_CLIENT',
        entityType: 'CLIENT',
        entityId: CLIENT_THOMAS_BROWN,
        titre: 'Follow-up Thomas Brown (Revolut)',
        description: 'Thomas a ouvert l\'email Adchase mais pas repondu. Le relancer par telephone.',
        triggerAt: daysLater(1),
        fired: false,
      },
      // Meroe (admin) reminders
      {
        userId: MEROE_ID,
        type: 'CUSTOM',
        titre: 'Review mensuel equipe',
        description: 'Faire le point sur les KPIs de l\'equipe : CA, placements, pipeline, taux de conversion.',
        triggerAt: daysLater(5),
        fired: false,
      },
      {
        userId: MEROE_ID,
        type: 'MANDAT_DORMANT',
        entityType: 'MANDAT',
        entityId: MANDAT_ENTERPRISE_AE,
        titre: 'Mandat Enterprise AE - Pipeline faible',
        description: 'Le pipeline sur ce mandat est faible. Organiser un brainstorming sourcing avec l\'equipe.',
        triggerAt: daysLater(1),
        fired: false,
      },
    ],
  });
  console.log('  -> 10 reminders created');

  // ──────────────────────────────────────────────────────
  // DONE
  // ──────────────────────────────────────────────────────
  console.log('\n=== EXTRA SEED COMPLETE ===');

  // Print final counts
  const counts = {
    templates: await prisma.template.count(),
    sequences: await prisma.sequence.count(),
    sequenceRuns: await prisma.sequenceRun.count(),
    sequenceStepLogs: await prisma.sequenceStepLog.count(),
    sdrLists: await prisma.sdrList.count(),
    sdrContacts: await prisma.sdrContact.count(),
    adchaseCampaigns: await prisma.adchaseCampaign.count(),
    adchaseProspects: await prisma.adchaseProspect.count(),
    reminders: await prisma.reminder.count(),
  };
  console.log('\nFinal counts:');
  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
