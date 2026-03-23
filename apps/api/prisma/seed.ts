import {
  PrismaClient, Role, TailleEntreprise, RoleContact, StatutClient,
  StageCandidature, StatutMandat, Priorite, FeeStatut, MotifRefus,
  TypeActivite, Direction, EntiteType, SourceActivite, TypeNotification,
} from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ─── DATE HELPERS ──────────────────────────────────────
const now = new Date();
function daysAgo(d: number): Date { return new Date(now.getTime() - d * 86400000); }
function hoursAgo(h: number): Date { return new Date(now.getTime() - h * 3600000); }
function dateOnly(d: Date): Date { return new Date(d.toISOString().split('T')[0] + 'T00:00:00.000Z'); }

async function main() {
  console.log('🌱 Seeding HumanUp ATS with realistic recruitment data...\n');

  // ═══════════════════════════════════════════════════════
  // 1. CLEAN DATABASE (preserve IntegrationConfig / OAuth)
  // ═══════════════════════════════════════════════════════
  console.log('  Cleaning existing data...');
  await prisma.bookingReminder.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.bookingType.deleteMany();
  await prisma.bookingSetting.deleteMany();
  await prisma.jobApplication.deleteMany();
  await prisma.jobPosting.deleteMany();
  await prisma.aiPipelineSuggestion.deleteMany();
  await prisma.aiCalendarSuggestion.deleteMany();
  await prisma.aiProspectSearch.deleteMany();
  await prisma.aiCallBrief.deleteMany();
  await prisma.aiCallSummary.deleteMany();
  await prisma.aiUsageLog.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.adchaseProspect.deleteMany();
  await prisma.adchaseCampaign.deleteMany();
  await prisma.sdrContact.deleteMany();
  await prisma.sdrList.deleteMany();
  await prisma.sequenceStepLog.deleteMany();
  await prisma.sequenceRun.deleteMany();
  await prisma.sequence.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.fichierActivite.deleteMany();
  await prisma.activite.deleteMany();
  await prisma.stageHistory.deleteMany();
  await prisma.candidature.deleteMany();
  await prisma.candidat.deleteMany();
  await prisma.mandat.deleteMany();
  await prisma.client.deleteMany();
  await prisma.entreprise.deleteMany();
  await prisma.template.deleteMany();
  // Delete extra users (keep only our 3)
  await prisma.user.deleteMany({
    where: { email: { notIn: ['meroe@humanup.io', 'guillermo@humanup.io', 'valentin@humanup.io'] } },
  });

  // ═══════════════════════════════════════════════════════
  // 2. USERS (3 — upsert with compensation)
  // ═══════════════════════════════════════════════════════
  console.log('  Creating users...');
  const pwd = await bcrypt.hash('Humanup2026!', 12);

  const meroe = await prisma.user.upsert({
    where: { email: 'meroe@humanup.io' },
    update: { nom: 'Nguimbi', prenom: 'Méroë', role: Role.ADMIN, monthlySalary: 0, variableRate: 0, startDate: new Date('2024-01-01'), mustChangePassword: false },
    create: { email: 'meroe@humanup.io', passwordHash: pwd, nom: 'Nguimbi', prenom: 'Méroë', role: Role.ADMIN, monthlySalary: 0, variableRate: 0, startDate: new Date('2024-01-01'), mustChangePassword: false },
  });

  const guillermo = await prisma.user.upsert({
    where: { email: 'guillermo@humanup.io' },
    update: { nom: 'Martinez', prenom: 'Guillermo', role: Role.MANAGER, monthlySalary: 4500, variableRate: 10, startDate: new Date('2024-06-01'), mustChangePassword: true },
    create: { email: 'guillermo@humanup.io', passwordHash: pwd, nom: 'Martinez', prenom: 'Guillermo', role: Role.MANAGER, monthlySalary: 4500, variableRate: 10, startDate: new Date('2024-06-01'), mustChangePassword: true },
  });

  const valentin = await prisma.user.upsert({
    where: { email: 'valentin@humanup.io' },
    update: { nom: 'Dupuis', prenom: 'Valentin', role: Role.RECRUTEUR, monthlySalary: 3200, variableRate: 8, startDate: new Date('2025-01-15'), mustChangePassword: true },
    create: { email: 'valentin@humanup.io', passwordHash: pwd, nom: 'Dupuis', prenom: 'Valentin', role: Role.RECRUTEUR, monthlySalary: 3200, variableRate: 8, startDate: new Date('2025-01-15'), mustChangePassword: true },
  });

  // ═══════════════════════════════════════════════════════
  // 3. ENTREPRISES (15)
  // ═══════════════════════════════════════════════════════
  console.log('  Creating 15 entreprises...');
  const entreprises = await Promise.all([
    /* 0 */ prisma.entreprise.create({ data: { nom: 'SENEF', secteur: 'SaaS / Tech', siteWeb: 'https://senef.fr', taille: TailleEntreprise.PME, localisation: 'Paris, France', notes: 'Éditeur SaaS B2B, 200 employés. Solutions de gestion pour collectivités.', createdById: meroe.id, createdAt: daysAgo(90) } }),
    /* 1 */ prisma.entreprise.create({ data: { nom: 'Joy / Privateaser', secteur: 'Hospitality / Events', siteWeb: 'https://joy-privateaser.com', taille: TailleEntreprise.PME, localisation: 'Paris, France', notes: 'Plateforme de réservation événementielle. 150 employés. Croissance forte.', createdById: meroe.id, createdAt: daysAgo(85) } }),
    /* 2 */ prisma.entreprise.create({ data: { nom: 'Temelion', secteur: 'AI / Deep Tech', siteWeb: 'https://temelion.ai', taille: TailleEntreprise.STARTUP, localisation: 'Lyon, France', notes: 'Startup IA/Deep Tech, 30 employés. Série A en cours. Premier recrutement commercial.', createdById: meroe.id, createdAt: daysAgo(60) } }),
    /* 3 */ prisma.entreprise.create({ data: { nom: 'Luxe Hospitality Group', secteur: 'Hospitality', siteWeb: 'https://luxehospitality.com', taille: TailleEntreprise.GRAND_GROUPE, localisation: 'Dubai, UAE', notes: 'Chaîne hôtelière 5 étoiles, 2000 employés, 12 propriétés Moyen-Orient.', createdById: meroe.id, createdAt: daysAgo(120) } }),
    /* 4 */ prisma.entreprise.create({ data: { nom: 'CloudSecure', secteur: 'Cybersecurity SaaS', siteWeb: 'https://cloudsecure.io', taille: TailleEntreprise.STARTUP, localisation: 'Singapore', notes: 'Startup cybersécurité cloud, 80 employés. Seed 5M$. Lancement APAC.', createdById: meroe.id, createdAt: daysAgo(45) } }),
    /* 5 */ prisma.entreprise.create({ data: { nom: 'GreenLogistics', secteur: 'Supply Chain', siteWeb: 'https://greenlogistics.eu', taille: TailleEntreprise.ETI, localisation: 'Amsterdam, Netherlands', notes: 'Leader européen logistique durable, 500 employés. Expansion DACH.', createdById: guillermo.id, createdAt: daysAgo(100) } }),
    /* 6 */ prisma.entreprise.create({ data: { nom: 'FinEdge Capital', secteur: 'Finance', siteWeb: 'https://finedgecapital.com', taille: TailleEntreprise.PME, localisation: 'London, UK', notes: 'Fonds PE mid-cap, 120 employés. Cherche profils sales senior pour portfolio.', createdById: meroe.id, createdAt: daysAgo(150) } }),
    /* 7 */ prisma.entreprise.create({ data: { nom: 'TechVision SAS', secteur: 'IT Services', siteWeb: 'https://techvision.fr', taille: TailleEntreprise.ETI, localisation: 'Paris, France', notes: 'Scale-up B2B SaaS en hyper-croissance, 300 employés. Série C 50M€.', createdById: guillermo.id, createdAt: daysAgo(80) } }),
    /* 8 */ prisma.entreprise.create({ data: { nom: 'Revolut', secteur: 'FinTech', siteWeb: 'https://revolut.com', taille: TailleEntreprise.GRAND_GROUPE, localisation: 'London, UK', notes: 'Néobanque mondiale, 8000+ employés. Recrutement commercial Europe.', createdById: valentin.id, createdAt: daysAgo(40) } }),
    /* 9 */ prisma.entreprise.create({ data: { nom: 'Marriott International', secteur: 'Hospitality', siteWeb: 'https://marriott.com', taille: TailleEntreprise.GRAND_GROUPE, localisation: 'Dubai, UAE', notes: 'Leader mondial hôtellerie, 180 000 employés. Hub régional MEA.', createdById: valentin.id, createdAt: daysAgo(130) } }),
    /* 10 */ prisma.entreprise.create({ data: { nom: 'Palo Alto Networks', secteur: 'Cybersecurity', siteWeb: 'https://paloaltonetworks.com', taille: TailleEntreprise.GRAND_GROUPE, localisation: 'Singapore', notes: 'Leader cybersécurité, 15 000 employés. Bureau APAC.', createdById: meroe.id, createdAt: daysAgo(70) } }),
    /* 11 */ prisma.entreprise.create({ data: { nom: 'N26', secteur: 'FinTech', siteWeb: 'https://n26.com', taille: TailleEntreprise.ETI, localisation: 'Berlin, Germany', notes: 'Néobanque européenne, 1500 employés. Expansion partenariats.', createdById: guillermo.id, createdAt: daysAgo(50) } }),
    /* 12 */ prisma.entreprise.create({ data: { nom: 'Contentsquare', secteur: 'SaaS / Analytics', siteWeb: 'https://contentsquare.com', taille: TailleEntreprise.ETI, localisation: 'Paris, France', notes: 'Licorne française analytics UX, 1800 employés. Forte croissance.', createdById: meroe.id, createdAt: daysAgo(140) } }),
    /* 13 */ prisma.entreprise.create({ data: { nom: 'Hilton', secteur: 'Hospitality', siteWeb: 'https://hilton.com', taille: TailleEntreprise.GRAND_GROUPE, localisation: 'Dubai, UAE', notes: 'Groupe hôtelier mondial, 160 000 employés. Opérations MEA.', createdById: valentin.id, createdAt: daysAgo(110) } }),
    /* 14 */ prisma.entreprise.create({ data: { nom: 'Oracle', secteur: 'Tech', siteWeb: 'https://oracle.com', taille: TailleEntreprise.GRAND_GROUPE, localisation: 'Madrid, Spain', notes: 'Géant tech, 150 000 employés. Bureau Iberia pour Europe du Sud.', createdById: meroe.id, createdAt: daysAgo(160) } }),
  ]);

  // ═══════════════════════════════════════════════════════
  // 4. CLIENTS / CONTACTS (25)
  // ═══════════════════════════════════════════════════════
  console.log('  Creating 25 clients...');
  const clients = await Promise.all([
    /* 0  */ prisma.client.create({ data: { nom: 'Mbaye', prenom: 'Aminata', email: 'a.mbaye@senef.fr', telephone: '+33145678901', poste: 'Head of Sales', roleContact: RoleContact.HIRING_MANAGER, entrepriseId: entreprises[0].id, statutClient: StatutClient.MANDAT_SIGNE, assignedToId: meroe.id, createdById: meroe.id } }),
    /* 1  */ prisma.client.create({ data: { nom: 'Lambert', prenom: 'Julien', email: 'j.lambert@senef.fr', telephone: '+33145678902', poste: 'CTO', roleContact: RoleContact.HIRING_MANAGER, entrepriseId: entreprises[0].id, statutClient: StatutClient.MANDAT_SIGNE, assignedToId: meroe.id, createdById: meroe.id } }),
    /* 2  */ prisma.client.create({ data: { nom: 'Leroy', prenom: 'Pierre', email: 'p.leroy@joy-privateaser.com', telephone: '+33156789012', poste: 'DRH', roleContact: RoleContact.DRH, entrepriseId: entreprises[1].id, statutClient: StatutClient.MANDAT_SIGNE, assignedToId: meroe.id, createdById: meroe.id } }),
    /* 3  */ prisma.client.create({ data: { nom: 'Gilles', prenom: 'Sébastien', email: 's.gilles@temelion.ai', telephone: '+33478901234', poste: 'CEO & Co-Founder', roleContact: RoleContact.CEO, entrepriseId: entreprises[2].id, statutClient: StatutClient.MANDAT_SIGNE, assignedToId: meroe.id, createdById: meroe.id } }),
    /* 4  */ prisma.client.create({ data: { nom: 'Al-Rashid', prenom: 'Fatima', email: 'f.alrashid@luxehospitality.com', telephone: '+97142345678', poste: 'Group HR Director', roleContact: RoleContact.DRH, entrepriseId: entreprises[3].id, statutClient: StatutClient.PROPOSITION_ENVOYEE, assignedToId: meroe.id, createdById: meroe.id } }),
    /* 5  */ prisma.client.create({ data: { nom: 'Tanaka', prenom: 'Kenji', email: 'k.tanaka@luxehospitality.com', telephone: '+97143456789', poste: 'CEO EMEA', roleContact: RoleContact.CEO, entrepriseId: entreprises[3].id, statutClient: StatutClient.PREMIER_CONTACT, assignedToId: meroe.id, createdById: meroe.id } }),
    /* 6  */ prisma.client.create({ data: { nom: 'Lim', prenom: 'Wei Lin', email: 'wl.lim@cloudsecure.io', telephone: '+6591234567', poste: 'CEO & Co-Founder', roleContact: RoleContact.CEO, entrepriseId: entreprises[4].id, statutClient: StatutClient.LEAD, assignedToId: meroe.id, createdById: meroe.id } }),
    /* 7  */ prisma.client.create({ data: { nom: 'Patel', prenom: 'Raj', email: 'r.patel@cloudsecure.io', telephone: '+6598765432', poste: 'VP Sales APAC', roleContact: RoleContact.HIRING_MANAGER, entrepriseId: entreprises[4].id, statutClient: StatutClient.PREMIER_CONTACT, assignedToId: valentin.id, createdById: meroe.id } }),
    /* 8  */ prisma.client.create({ data: { nom: 'Dubois', prenom: 'François', email: 'f.dubois@greenlogistics.eu', telephone: '+31201234567', poste: 'Procurement Director', roleContact: RoleContact.PROCUREMENT, entrepriseId: entreprises[5].id, statutClient: StatutClient.BESOIN_QUALIFIE, assignedToId: guillermo.id, createdById: guillermo.id } }),
    /* 9  */ prisma.client.create({ data: { nom: 'Weber', prenom: 'Klaus', email: 'k.weber@greenlogistics.eu', telephone: '+31209876543', poste: 'Chief Revenue Officer', roleContact: RoleContact.HIRING_MANAGER, entrepriseId: entreprises[5].id, statutClient: StatutClient.BESOIN_QUALIFIE, assignedToId: guillermo.id, createdById: guillermo.id } }),
    /* 10 */ prisma.client.create({ data: { nom: 'Schmidt', prenom: 'Anna', email: 'a.schmidt@finedgecapital.com', telephone: '+442071234567', poste: 'Head of Talent', roleContact: RoleContact.DRH, entrepriseId: entreprises[6].id, statutClient: StatutClient.MANDAT_SIGNE, assignedToId: meroe.id, createdById: meroe.id } }),
    /* 11 */ prisma.client.create({ data: { nom: 'Williams', prenom: 'James', email: 'j.williams@finedgecapital.com', telephone: '+442079876543', poste: 'Managing Director', roleContact: RoleContact.CEO, entrepriseId: entreprises[6].id, statutClient: StatutClient.RECURRENT, assignedToId: meroe.id, createdById: meroe.id } }),
    /* 12 */ prisma.client.create({ data: { nom: 'Chen', prenom: 'David', email: 'david.chen@techvision.fr', telephone: '+33698765432', poste: 'DRH', roleContact: RoleContact.DRH, entrepriseId: entreprises[7].id, statutClient: StatutClient.MANDAT_SIGNE, assignedToId: guillermo.id, createdById: guillermo.id } }),
    /* 13 */ prisma.client.create({ data: { nom: 'Moreau', prenom: 'Sophie', email: 'sophie.moreau@techvision.fr', telephone: '+33612345678', poste: 'VP Sales', roleContact: RoleContact.HIRING_MANAGER, entrepriseId: entreprises[7].id, statutClient: StatutClient.MANDAT_SIGNE, assignedToId: guillermo.id, createdById: guillermo.id } }),
    /* 14 */ prisma.client.create({ data: { nom: 'Thompson', prenom: 'Mark', email: 'm.thompson@revolut.com', telephone: '+442080001234', poste: 'VP People', roleContact: RoleContact.DRH, entrepriseId: entreprises[8].id, statutClient: StatutClient.MANDAT_SIGNE, assignedToId: valentin.id, createdById: valentin.id } }),
    /* 15 */ prisma.client.create({ data: { nom: 'Vasquez', prenom: 'Elena', email: 'e.vasquez@revolut.com', telephone: '+442080005678', poste: 'Head of Commercial', roleContact: RoleContact.HIRING_MANAGER, entrepriseId: entreprises[8].id, statutClient: StatutClient.MANDAT_SIGNE, assignedToId: valentin.id, createdById: valentin.id } }),
    /* 16 */ prisma.client.create({ data: { nom: 'Al-Zaabi', prenom: 'Ahmed', email: 'a.alzaabi@marriott.com', telephone: '+97144567890', poste: 'Regional VP HR', roleContact: RoleContact.DRH, entrepriseId: entreprises[9].id, statutClient: StatutClient.RECURRENT, assignedToId: valentin.id, createdById: valentin.id } }),
    /* 17 */ prisma.client.create({ data: { nom: 'Chang', prenom: 'Linda', email: 'l.chang@paloaltonetworks.com', telephone: '+6562345678', poste: 'Talent Director APAC', roleContact: RoleContact.DRH, entrepriseId: entreprises[10].id, statutClient: StatutClient.LEAD, assignedToId: meroe.id, createdById: meroe.id } }),
    /* 18 */ prisma.client.create({ data: { nom: 'Braun', prenom: 'Markus', email: 'm.braun@n26.com', telephone: '+49301234567', poste: 'Head of Partnerships', roleContact: RoleContact.HIRING_MANAGER, entrepriseId: entreprises[11].id, statutClient: StatutClient.MANDAT_SIGNE, assignedToId: guillermo.id, createdById: guillermo.id } }),
    /* 19 */ prisma.client.create({ data: { nom: 'Koch', prenom: 'Sandra', email: 's.koch@n26.com', telephone: '+49309876543', poste: 'HR Business Partner', roleContact: RoleContact.DRH, entrepriseId: entreprises[11].id, statutClient: StatutClient.LEAD, assignedToId: guillermo.id, createdById: guillermo.id } }),
    /* 20 */ prisma.client.create({ data: { nom: 'Girard', prenom: 'Thomas', email: 't.girard@contentsquare.com', telephone: '+33145001234', poste: 'VP Sales', roleContact: RoleContact.HIRING_MANAGER, entrepriseId: entreprises[12].id, statutClient: StatutClient.RECURRENT, assignedToId: guillermo.id, createdById: meroe.id } }),
    /* 21 */ prisma.client.create({ data: { nom: 'Deschamps', prenom: 'Marie', email: 'm.deschamps@contentsquare.com', telephone: '+33145005678', poste: 'DRH', roleContact: RoleContact.DRH, entrepriseId: entreprises[12].id, statutClient: StatutClient.MANDAT_SIGNE, assignedToId: meroe.id, createdById: meroe.id } }),
    /* 22 */ prisma.client.create({ data: { nom: 'Al-Maktoum', prenom: 'Sarah', email: 's.almaktoum@hilton.com', telephone: '+97145678901', poste: 'Director People & Culture', roleContact: RoleContact.DRH, entrepriseId: entreprises[13].id, statutClient: StatutClient.PREMIER_CONTACT, assignedToId: valentin.id, createdById: valentin.id } }),
    /* 23 */ prisma.client.create({ data: { nom: 'Rodriguez', prenom: 'Miguel', email: 'm.rodriguez@oracle.com', telephone: '+34911234567', poste: 'HR Director Iberia', roleContact: RoleContact.DRH, entrepriseId: entreprises[14].id, statutClient: StatutClient.MANDAT_SIGNE, assignedToId: meroe.id, createdById: meroe.id } }),
    /* 24 */ prisma.client.create({ data: { nom: 'Fernandez', prenom: 'Isabel', email: 'i.fernandez@oracle.com', telephone: '+34919876543', poste: 'VP Sales Southern Europe', roleContact: RoleContact.HIRING_MANAGER, entrepriseId: entreprises[14].id, statutClient: StatutClient.LEAD, assignedToId: meroe.id, createdById: meroe.id } }),
  ]);

  // ═══════════════════════════════════════════════════════
  // 5. MANDATS (10 active + 3 past for revenue = 13)
  // ═══════════════════════════════════════════════════════
  console.log('  Creating 13 mandats...');
  const mandats = await Promise.all([
    /* 0 — Head of Sales SENEF */
    prisma.mandat.create({ data: {
      titrePoste: 'Head of Sales', entrepriseId: entreprises[0].id, clientId: clients[0].id,
      description: 'Recruter un Head of Sales pour structurer et scaler l\'équipe commerciale. Profil senior, 8+ ans XP, background SaaS B2B.', localisation: 'Paris, France',
      salaireMin: 90000, salaireMax: 120000, feePourcentage: 20, feeMontantEstime: 25000,
      statut: StatutMandat.EN_COURS, priorite: Priorite.HAUTE,
      assignedToId: meroe.id, createdById: meroe.id, dateOuverture: dateOnly(daysAgo(21)), createdAt: daysAgo(21),
    } }),
    /* 1 — Head of Account Management Joy */
    prisma.mandat.create({ data: {
      titrePoste: 'Head of Account Management', entrepriseId: entreprises[1].id, clientId: clients[2].id,
      description: 'Responsable Account Management pour piloter la fidélisation et l\'upsell. Expérience events/hospitality souhaitée.', localisation: 'Paris, France',
      salaireMin: 75000, salaireMax: 95000, feePourcentage: 20, feeMontantEstime: 20000,
      statut: StatutMandat.OUVERT, priorite: Priorite.NORMALE,
      assignedToId: meroe.id, createdById: meroe.id, dateOuverture: dateOnly(daysAgo(14)), createdAt: daysAgo(14),
    } }),
    /* 2 — Founding AE Temelion */
    prisma.mandat.create({ data: {
      titrePoste: 'Founding Account Executive', entrepriseId: entreprises[2].id, clientId: clients[3].id,
      description: 'Premier commercial de Temelion. Profil entrepreneur, capable de closer en autonomie. Deep Tech / IA.', localisation: 'Lyon, France',
      salaireMin: 60000, salaireMax: 80000, feePourcentage: 20, feeMontantEstime: 18000,
      statut: StatutMandat.EN_COURS, priorite: Priorite.HAUTE,
      assignedToId: meroe.id, createdById: meroe.id, dateOuverture: dateOnly(daysAgo(30)), createdAt: daysAgo(30),
    } }),
    /* 3 — BDM GreenLogistics */
    prisma.mandat.create({ data: {
      titrePoste: 'Business Development Manager', entrepriseId: entreprises[5].id, clientId: clients[9].id,
      description: 'BDM pour développer le marché DACH. Allemand courant requis. Supply chain / logistics.', localisation: 'Amsterdam, Netherlands',
      salaireMin: 65000, salaireMax: 80000, feePourcentage: 20, feeMontantEstime: 15000,
      statut: StatutMandat.OUVERT, priorite: Priorite.NORMALE,
      assignedToId: guillermo.id, createdById: guillermo.id, dateOuverture: dateOnly(daysAgo(7)), createdAt: daysAgo(7),
    } }),
    /* 4 — Director of Sales Luxe Hospitality */
    prisma.mandat.create({ data: {
      titrePoste: 'Director of Sales - Luxury Hotels', entrepriseId: entreprises[3].id, clientId: clients[4].id,
      description: 'Directeur commercial division hôtels de luxe. Gestion P&L, développement réseau, expérience hospitality premium.', localisation: 'Dubai, UAE',
      salaireMin: 100000, salaireMax: 130000, feePourcentage: 20, feeMontantEstime: 23000,
      statut: StatutMandat.EN_COURS, priorite: Priorite.HAUTE,
      assignedToId: valentin.id, createdById: meroe.id, dateOuverture: dateOnly(daysAgo(21)), createdAt: daysAgo(21),
    } }),
    /* 5 — Enterprise AE TechVision */
    prisma.mandat.create({ data: {
      titrePoste: 'Enterprise Account Executive', entrepriseId: entreprises[7].id, clientId: clients[13].id,
      description: 'AE Enterprise pour accélérer la conquête grands comptes France. Background SaaS B2B, cycle long.', localisation: 'Paris, France',
      salaireMin: 70000, salaireMax: 90000, feePourcentage: 20, feeMontantEstime: 16000,
      statut: StatutMandat.OUVERT, priorite: Priorite.NORMALE,
      assignedToId: guillermo.id, createdById: guillermo.id, dateOuverture: dateOnly(daysAgo(5)), createdAt: daysAgo(5),
    } }),
    /* 6 — VP Sales APAC CloudSecure */
    prisma.mandat.create({ data: {
      titrePoste: 'VP Sales APAC', entrepriseId: entreprises[4].id, clientId: clients[6].id,
      description: 'VP Sales pour lancer le go-to-market APAC. Expérience cybersécurité, management, enterprise sales.', localisation: 'Singapore',
      salaireMin: 120000, salaireMax: 160000, feePourcentage: 20, feeMontantEstime: 30000,
      statut: StatutMandat.OUVERT, priorite: Priorite.URGENTE,
      assignedToId: meroe.id, createdById: meroe.id, dateOuverture: dateOnly(daysAgo(2)), createdAt: daysAgo(2),
    } }),
    /* 7 — Senior Sales Manager Revolut */
    prisma.mandat.create({ data: {
      titrePoste: 'Senior Sales Manager', entrepriseId: entreprises[8].id, clientId: clients[15].id,
      description: 'Sales Manager senior pour l\'équipe commercial enterprise. FinTech, vente complexe, B2B.', localisation: 'London, UK',
      salaireMin: 85000, salaireMax: 110000, feePourcentage: 20, feeMontantEstime: 22000,
      statut: StatutMandat.EN_COURS, priorite: Priorite.HAUTE,
      assignedToId: valentin.id, createdById: valentin.id, dateOuverture: dateOnly(daysAgo(30)), createdAt: daysAgo(30),
    } }),
    /* 8 — Head of Partnerships N26 */
    prisma.mandat.create({ data: {
      titrePoste: 'Head of Partnerships', entrepriseId: entreprises[11].id, clientId: clients[18].id,
      description: 'Head of Partnerships pour développer l\'écosystème partenaires B2B et B2B2C.', localisation: 'Berlin, Germany',
      salaireMin: 90000, salaireMax: 115000, feePourcentage: 20, feeMontantEstime: 20000,
      statut: StatutMandat.OUVERT, priorite: Priorite.NORMALE,
      assignedToId: guillermo.id, createdById: guillermo.id, dateOuverture: dateOnly(daysAgo(10)), createdAt: daysAgo(10),
    } }),
    /* 9 — Country Manager Iberia Oracle (PLACED!) */
    prisma.mandat.create({ data: {
      titrePoste: 'Country Manager Iberia', entrepriseId: entreprises[14].id, clientId: clients[23].id,
      description: 'Country Manager pour piloter les opérations Oracle en Espagne et au Portugal.', localisation: 'Madrid, Spain',
      salaireMin: 110000, salaireMax: 140000, feePourcentage: 20, feeMontantEstime: 28000,
      feeMontantFacture: 28000, feeStatut: FeeStatut.PAYE,
      statut: StatutMandat.GAGNE, priorite: Priorite.HAUTE,
      assignedToId: meroe.id, createdById: meroe.id, dateOuverture: dateOnly(daysAgo(60)), dateCloture: dateOnly(daysAgo(7)), createdAt: daysAgo(60),
    } }),
    // ─── PAST MANDATS (for revenue history) ────────
    /* 10 — Past: Head of Sales UK — FinEdge (Méroë, 22k€, PAYE) */
    prisma.mandat.create({ data: {
      titrePoste: 'Head of Sales UK', entrepriseId: entreprises[6].id, clientId: clients[11].id,
      description: 'Head of Sales UK pour le fonds FinEdge Capital. Placé avec succès.', localisation: 'London, UK',
      salaireMin: 100000, salaireMax: 130000, feePourcentage: 20, feeMontantEstime: 22000,
      feeMontantFacture: 22000, feeStatut: FeeStatut.PAYE,
      statut: StatutMandat.GAGNE, priorite: Priorite.HAUTE,
      assignedToId: meroe.id, createdById: meroe.id, dateOuverture: dateOnly(daysAgo(120)), dateCloture: dateOnly(daysAgo(60)), createdAt: daysAgo(120),
    } }),
    /* 11 — Past: Senior AE Enterprise — Contentsquare (Guillermo, 18k€, PAYE) */
    prisma.mandat.create({ data: {
      titrePoste: 'Senior Account Executive Enterprise', entrepriseId: entreprises[12].id, clientId: clients[20].id,
      description: 'AE Enterprise pour Contentsquare. Mandat clos, candidat placé.', localisation: 'Paris, France',
      salaireMin: 70000, salaireMax: 90000, feePourcentage: 20, feeMontantEstime: 18000,
      feeMontantFacture: 18000, feeStatut: FeeStatut.PAYE,
      statut: StatutMandat.GAGNE, priorite: Priorite.NORMALE,
      assignedToId: guillermo.id, createdById: guillermo.id, dateOuverture: dateOnly(daysAgo(90)), dateCloture: dateOnly(daysAgo(30)), createdAt: daysAgo(90),
    } }),
    /* 12 — Past: Revenue Manager MEA — Marriott (Valentin, 15k€, FACTURE non payé) */
    prisma.mandat.create({ data: {
      titrePoste: 'Revenue Manager MEA', entrepriseId: entreprises[9].id, clientId: clients[16].id,
      description: 'Revenue Manager Moyen-Orient et Afrique pour Marriott. Facturé mais non encaissé.', localisation: 'Dubai, UAE',
      salaireMin: 60000, salaireMax: 80000, feePourcentage: 20, feeMontantEstime: 15000,
      feeMontantFacture: 15000, feeStatut: FeeStatut.FACTURE,
      statut: StatutMandat.GAGNE, priorite: Priorite.NORMALE,
      assignedToId: valentin.id, createdById: valentin.id, dateOuverture: dateOnly(daysAgo(100)), dateCloture: dateOnly(daysAgo(42)), createdAt: daysAgo(100),
    } }),
  ]);

  // ═══════════════════════════════════════════════════════
  // 6. CANDIDATS (30)
  // ═══════════════════════════════════════════════════════
  console.log('  Creating 30 candidats...');
  const candidatsList = [
    /* 0  */ { nom: 'Dubois', prenom: 'Pierre', email: 'pierre.dubois@gmail.com', telephone: '+33612000007', posteActuel: 'Mid-Market AE', entrepriseActuelle: 'Notion', localisation: 'Paris', salaireActuel: 58000, salaireSouhaite: 72000, source: 'candidature', tags: ['SaaS', 'PLG', 'French'], assignedToId: meroe.id, createdById: meroe.id },
    /* 1  */ { nom: 'Potin', prenom: 'Matthieu', email: 'matthieu.potin@gmail.com', telephone: '+33612000010', posteActuel: 'Regional Sales Director', entrepriseActuelle: 'Econocom', localisation: 'Lyon', salaireActuel: 85000, salaireSouhaite: 100000, source: 'linkedin', tags: ['Enterprise', 'Industrie', 'Leadership'], assignedToId: meroe.id, createdById: meroe.id },
    /* 2  */ { nom: 'Legay', prenom: 'Romain', email: 'romain.legay@gmail.com', telephone: '+33612000011', posteActuel: 'Sales Director', entrepriseActuelle: 'Algolia', localisation: 'Paris', salaireActuel: 78000, salaireSouhaite: 95000, source: 'cooptation', tags: ['SaaS', 'Tech', 'Leadership'], assignedToId: meroe.id, createdById: meroe.id },
    /* 3  */ { nom: 'Bouchard', prenom: 'Nadia', email: 'nadia.bouchard@gmail.com', telephone: '+33612000006', posteActuel: 'Account Executive', entrepriseActuelle: 'Datadog', localisation: 'Paris', salaireActuel: 62000, salaireSouhaite: 78000, source: 'linkedin', tags: ['SaaS', 'Monitoring', 'French'], assignedToId: meroe.id, createdById: meroe.id },
    /* 4  */ { nom: 'Martin', prenom: 'Thomas', email: 'thomas.martin@gmail.com', telephone: '+33612000001', posteActuel: 'Account Executive', entrepriseActuelle: 'Salesforce', localisation: 'Paris', salaireActuel: 65000, salaireSouhaite: 80000, source: 'linkedin', tags: ['SaaS', 'Enterprise', 'French'], assignedToId: meroe.id, createdById: meroe.id },
    /* 5  */ { nom: 'Lavagna', prenom: 'Juliette', email: 'juliette.lavagna@gmail.com', telephone: '+33612000012', posteActuel: 'Head of Sales', entrepriseActuelle: 'Swile', localisation: 'Paris', salaireActuel: 88000, salaireSouhaite: 105000, source: 'linkedin', tags: ['SaaS', 'Leadership', 'French'], assignedToId: meroe.id, createdById: meroe.id },
    /* 6  */ { nom: 'Petit', prenom: 'Julie', email: 'julie.petit@gmail.com', telephone: '+33612000002', posteActuel: 'Senior AE', entrepriseActuelle: 'HubSpot', localisation: 'Paris', salaireActuel: 75000, salaireSouhaite: 90000, source: 'linkedin', tags: ['SaaS', 'Mid-Market'], assignedToId: meroe.id, createdById: meroe.id },
    /* 7  */ { nom: 'Kowalski', prenom: 'Adam', email: 'adam.kowalski@gmail.com', telephone: '+48500000001', posteActuel: 'Business Development Director', entrepriseActuelle: 'Allegro', localisation: 'Warsaw', salaireActuel: 65000, salaireSouhaite: 80000, source: 'linkedin', tags: ['E-commerce', 'CEE', 'Leadership'], assignedToId: meroe.id, createdById: meroe.id },
    /* 8  */ { nom: 'Spasic', prenom: 'Nicolas', email: 'nicolas.spasic@gmail.com', telephone: '+33612000013', posteActuel: 'Founding AE', entrepriseActuelle: 'Freelance', localisation: 'Paris', salaireActuel: 55000, salaireSouhaite: 70000, source: 'cooptation', tags: ['Startup', 'SaaS', 'Entrepreneur'], assignedToId: meroe.id, createdById: meroe.id },
    /* 9  */ { nom: 'Fischer', prenom: 'Hans', email: 'hans.fischer@gmail.com', telephone: '+4917600000001', posteActuel: 'Account Manager', entrepriseActuelle: 'DHL', localisation: 'Frankfurt', salaireActuel: 55000, salaireSouhaite: 70000, source: 'linkedin', tags: ['Logistics', 'DACH', 'B2B'], assignedToId: guillermo.id, createdById: guillermo.id },
    /* 10 */ { nom: 'Hoffmann', prenom: 'Julia', email: 'julia.hoffmann@gmail.com', telephone: '+4917600000003', posteActuel: 'Key Account Director', entrepriseActuelle: 'Bosch', localisation: 'Stuttgart', salaireActuel: 90000, salaireSouhaite: 110000, source: 'cooptation', tags: ['Industry', 'DACH', 'Enterprise', 'Leadership'], assignedToId: guillermo.id, createdById: guillermo.id },
    /* 11 */ { nom: 'Al-Hassan', prenom: 'Omar', email: 'omar.alhassan@gmail.com', telephone: '+971501234567', posteActuel: 'Director of Revenue', entrepriseActuelle: 'Marriott', localisation: 'Dubai', salaireActuel: 95000, salaireSouhaite: 120000, source: 'linkedin', tags: ['Hospitality', 'Luxury', 'MENA'], assignedToId: valentin.id, createdById: valentin.id },
    /* 12 */ { nom: 'Kim', prenom: 'Ji-Yeon', email: 'jiyeon.kim@gmail.com', telephone: '+971502345678', posteActuel: 'Sales Director', entrepriseActuelle: 'Hilton', localisation: 'Dubai', salaireActuel: 85000, salaireSouhaite: 110000, source: 'cooptation', tags: ['Hospitality', 'APAC', 'Luxury'], assignedToId: valentin.id, createdById: valentin.id },
    /* 13 */ { nom: 'Durand', prenom: 'Camille', email: 'camille.durand@gmail.com', telephone: '+33612000004', posteActuel: 'SDR Lead', entrepriseActuelle: 'Contentsquare', localisation: 'Paris', salaireActuel: 45000, salaireSouhaite: 60000, source: 'candidature', tags: ['SaaS', 'SDR', 'French'], assignedToId: guillermo.id, createdById: guillermo.id },
    /* 14 */ { nom: 'Leroy', prenom: 'Antoine', email: 'antoine.leroy@gmail.com', telephone: '+33612000005', posteActuel: 'Channel Manager', entrepriseActuelle: 'Microsoft', localisation: 'Paris', salaireActuel: 80000, salaireSouhaite: 95000, source: 'linkedin', tags: ['Enterprise', 'Channel', 'Tech'], assignedToId: guillermo.id, createdById: guillermo.id },
    /* 15 */ { nom: 'Wilson', prenom: 'Charlotte', email: 'charlotte.wilson@gmail.com', telephone: '+447700000004', posteActuel: 'Sales Operations Manager', entrepriseActuelle: 'Revolut', localisation: 'London', salaireActuel: 72000, salaireSouhaite: 88000, source: 'linkedin', tags: ['Fintech', 'Sales Ops', 'UK'], assignedToId: valentin.id, createdById: valentin.id },
    /* 16 */ { nom: "O'Connor", prenom: 'Liam', email: 'liam.oconnor@gmail.com', telephone: '+353850000001', posteActuel: 'Commercial Director', entrepriseActuelle: 'Stripe', localisation: 'Dublin', salaireActuel: 125000, salaireSouhaite: 145000, source: 'candidature', tags: ['Fintech', 'Leadership', 'EMEA'], assignedToId: valentin.id, createdById: valentin.id },
    /* 17 */ { nom: 'Taylor', prenom: 'Rachel', email: 'rachel.taylor@gmail.com', telephone: '+447700000005', posteActuel: 'Head of Business Development', entrepriseActuelle: 'N26', localisation: 'London', salaireActuel: 105000, salaireSouhaite: 130000, source: 'linkedin', tags: ['Fintech', 'Leadership', 'EMEA'], assignedToId: guillermo.id, createdById: guillermo.id },
    /* 18 */ { nom: 'Singh', prenom: 'Priya', email: 'priya.singh@gmail.com', telephone: '+6590000003', posteActuel: 'Sales Team Lead', entrepriseActuelle: 'Shopee', localisation: 'Singapore', salaireActuel: 70000, salaireSouhaite: 90000, source: 'linkedin', tags: ['E-commerce', 'APAC', 'SEA'], assignedToId: guillermo.id, createdById: guillermo.id },
    /* 19 */ { nom: 'Garcia', prenom: 'Carlos', email: 'carlos.garcia@gmail.com', telephone: '+34600000001', posteActuel: 'Sales Manager Iberia', entrepriseActuelle: 'Oracle', localisation: 'Madrid', salaireActuel: 70000, salaireSouhaite: 85000, source: 'linkedin', tags: ['Enterprise', 'Iberia', 'SaaS'], assignedToId: meroe.id, createdById: meroe.id },
    // ─── VIVIER (no mandat) ─────────
    /* 20 */ { nom: 'Tan', prenom: 'Marcus', email: 'marcus.tan@gmail.com', telephone: '+6590000002', posteActuel: 'Enterprise AE', entrepriseActuelle: 'Palo Alto Networks', localisation: 'Singapore', salaireActuel: 80000, salaireSouhaite: 100000, source: 'linkedin', tags: ['Cybersecurity', 'Enterprise', 'APAC'], assignedToId: meroe.id, createdById: meroe.id },
    /* 21 */ { nom: 'Ng', prenom: 'Melissa', email: 'melissa.ng@gmail.com', telephone: '+6590000001', posteActuel: 'Regional Sales Manager', entrepriseActuelle: 'CrowdStrike', localisation: 'Singapore', salaireActuel: 75000, salaireSouhaite: 95000, source: 'linkedin', tags: ['Cybersecurity', 'APAC', 'SaaS'], assignedToId: meroe.id, createdById: meroe.id },
    /* 22 */ { nom: 'Rossi', prenom: 'Marco', email: 'marco.rossi@gmail.com', telephone: '+393300000001', posteActuel: 'Key Account Manager', entrepriseActuelle: 'AWS', localisation: 'Milan', salaireActuel: 68000, salaireSouhaite: 82000, source: 'linkedin', tags: ['Cloud', 'Enterprise', 'Italy'], assignedToId: guillermo.id, createdById: guillermo.id },
    /* 23 */ { nom: 'Andersson', prenom: 'Erik', email: 'erik.andersson@gmail.com', telephone: '+46700000001', posteActuel: 'VP Sales Nordics', entrepriseActuelle: 'Spotify', localisation: 'Stockholm', salaireActuel: 115000, salaireSouhaite: 135000, source: 'cooptation', tags: ['Tech', 'Leadership', 'Nordics'], assignedToId: meroe.id, createdById: meroe.id },
    /* 24 */ { nom: 'Nakamura', prenom: 'Yuki', email: 'yuki.nakamura@gmail.com', telephone: '+81900000001', posteActuel: 'Business Development Lead', entrepriseActuelle: 'Rakuten', localisation: 'Tokyo', salaireActuel: 90000, salaireSouhaite: 110000, source: 'linkedin', tags: ['E-commerce', 'APAC', 'Japan'], assignedToId: valentin.id, createdById: valentin.id },
    /* 25 */ { nom: 'Johnson', prenom: 'Alex', email: 'alex.johnson@gmail.com', telephone: '+12125550001', posteActuel: 'Enterprise Sales Director', entrepriseActuelle: 'Snowflake', localisation: 'New York', salaireActuel: 160000, salaireSouhaite: 190000, source: 'linkedin', tags: ['SaaS', 'Enterprise', 'US', 'Leadership'], assignedToId: meroe.id, createdById: meroe.id },
    /* 26 */ { nom: 'Park', prenom: 'Min-Jun', email: 'minjun.park@gmail.com', telephone: '+8210000001', posteActuel: 'Strategic Account Executive', entrepriseActuelle: 'Samsung SDS', localisation: 'Seoul', salaireActuel: 85000, salaireSouhaite: 105000, source: 'linkedin', tags: ['Enterprise', 'Korea', 'APAC'], assignedToId: valentin.id, createdById: valentin.id },
    /* 27 */ { nom: 'Ferreira', prenom: 'Ana', email: 'ana.ferreira@gmail.com', telephone: '+351910000001', posteActuel: 'Country Manager', entrepriseActuelle: 'Zendesk', localisation: 'Lisbon', salaireActuel: 78000, salaireSouhaite: 95000, source: 'cooptation', tags: ['SaaS', 'Iberia', 'Leadership'], assignedToId: meroe.id, createdById: meroe.id },
    /* 28 */ { nom: 'Nguyen', prenom: 'Duc', email: 'duc.nguyen@gmail.com', telephone: '+84900000001', posteActuel: 'Regional Sales Lead', entrepriseActuelle: 'Grab', localisation: 'Ho Chi Minh City', salaireActuel: 55000, salaireSouhaite: 70000, source: 'linkedin', tags: ['Tech', 'SEA', 'APAC'], assignedToId: valentin.id, createdById: valentin.id },
    /* 29 */ { nom: 'Thompson', prenom: 'Sarah', email: 'sarah.thompson@gmail.com', telephone: '+447700000001', posteActuel: 'Regional Sales Director', entrepriseActuelle: 'Gartner', localisation: 'London', salaireActuel: 110000, salaireSouhaite: 140000, source: 'linkedin', tags: ['Enterprise', 'EMEA', 'Leadership'], assignedToId: meroe.id, createdById: meroe.id },
  ];

  const candidats = await Promise.all(
    candidatsList.map((c) =>
      prisma.candidat.create({
        data: { ...c, consentementRgpd: true, consentementDate: new Date() },
      }),
    ),
  );

  // ═══════════════════════════════════════════════════════
  // 7. CANDIDATURES + STAGE HISTORY
  // ═══════════════════════════════════════════════════════
  console.log('  Creating candidatures...');
  const candidatureData: { mandatId: string; candidatId: string; stage: StageCandidature; createdById: string; motifRefus?: MotifRefus }[] = [
    // Mandat 0 — Head of Sales SENEF (5 candidats: 2 entretien client, 1 qualification, 2 refusés)
    { mandatId: mandats[0].id, candidatId: candidats[0].id, stage: StageCandidature.ENTRETIEN_CLIENT, createdById: meroe.id },
    { mandatId: mandats[0].id, candidatId: candidats[1].id, stage: StageCandidature.ENTRETIEN_CLIENT, createdById: meroe.id },
    { mandatId: mandats[0].id, candidatId: candidats[2].id, stage: StageCandidature.ENTRETIEN_1, createdById: meroe.id },
    { mandatId: mandats[0].id, candidatId: candidats[3].id, stage: StageCandidature.REFUSE, createdById: meroe.id, motifRefus: MotifRefus.PROFIL_PAS_ALIGNE },
    { mandatId: mandats[0].id, candidatId: candidats[4].id, stage: StageCandidature.REFUSE, createdById: meroe.id, motifRefus: MotifRefus.CANDIDAT_DECLINE },
    // Mandat 1 — Head of AM Joy (3 candidats: all SOURCING, dormant)
    { mandatId: mandats[1].id, candidatId: candidats[5].id, stage: StageCandidature.SOURCING, createdById: meroe.id },
    { mandatId: mandats[1].id, candidatId: candidats[6].id, stage: StageCandidature.SOURCING, createdById: meroe.id },
    { mandatId: mandats[1].id, candidatId: candidats[7].id, stage: StageCandidature.SOURCING, createdById: meroe.id },
    // Mandat 2 — Founding AE Temelion (1 candidat: OFFRE)
    { mandatId: mandats[2].id, candidatId: candidats[8].id, stage: StageCandidature.OFFRE, createdById: meroe.id },
    // Mandat 3 — BDM GreenLogistics (2 candidats)
    { mandatId: mandats[3].id, candidatId: candidats[9].id, stage: StageCandidature.CONTACTE, createdById: guillermo.id },
    { mandatId: mandats[3].id, candidatId: candidats[10].id, stage: StageCandidature.SOURCING, createdById: guillermo.id },
    // Mandat 4 — Director of Sales Luxe (2 candidats)
    { mandatId: mandats[4].id, candidatId: candidats[11].id, stage: StageCandidature.ENTRETIEN_1, createdById: valentin.id },
    { mandatId: mandats[4].id, candidatId: candidats[12].id, stage: StageCandidature.ENTRETIEN_1, createdById: valentin.id },
    // Mandat 5 — Enterprise AE TechVision (2 candidats)
    { mandatId: mandats[5].id, candidatId: candidats[13].id, stage: StageCandidature.CONTACTE, createdById: guillermo.id },
    { mandatId: mandats[5].id, candidatId: candidats[14].id, stage: StageCandidature.SOURCING, createdById: guillermo.id },
    // Mandat 6 — VP Sales APAC CloudSecure (0 candidats — nouveau)
    // Mandat 7 — Senior Sales Manager Revolut (2 candidats)
    { mandatId: mandats[7].id, candidatId: candidats[15].id, stage: StageCandidature.ENTRETIEN_CLIENT, createdById: valentin.id },
    { mandatId: mandats[7].id, candidatId: candidats[16].id, stage: StageCandidature.ENTRETIEN_1, createdById: valentin.id },
    // Mandat 8 — Head of Partnerships N26 (2 candidats, dormant)
    { mandatId: mandats[8].id, candidatId: candidats[17].id, stage: StageCandidature.SOURCING, createdById: guillermo.id },
    { mandatId: mandats[8].id, candidatId: candidats[18].id, stage: StageCandidature.SOURCING, createdById: guillermo.id },
    // Mandat 9 — Country Manager Iberia Oracle (1 candidat PLACÉ)
    { mandatId: mandats[9].id, candidatId: candidats[19].id, stage: StageCandidature.PLACE, createdById: meroe.id },
  ];

  for (const cd of candidatureData) {
    const candidature = await prisma.candidature.create({
      data: {
        mandatId: cd.mandatId,
        candidatId: cd.candidatId,
        stage: cd.stage,
        createdById: cd.createdById,
        motifRefus: cd.motifRefus ?? undefined,
      },
    });
    await prisma.stageHistory.create({
      data: { candidatureId: candidature.id, fromStage: null, toStage: cd.stage, changedById: cd.createdById },
    });
  }

  // ═══════════════════════════════════════════════════════
  // 8. ACTIVITÉS (50+ entries over last 30 days)
  // ═══════════════════════════════════════════════════════
  console.log('  Creating 50+ activities...');

  // 15 Appels (calls via Allo)
  const appels = [
    { titre: 'Appel qualification Pierre Dubois — Head of Sales SENEF', contenu: 'Échange de 15min. Pierre est motivé par le poste, dispo sous 2 mois. Bon fit culturel.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[0].id, userId: meroe.id, direction: Direction.SORTANT, source: SourceActivite.ALLO, metadata: { duration: 900, candidatName: 'Pierre Dubois' }, createdAt: daysAgo(3) },
    { titre: 'Appel Matthieu Potin — entretien téléphonique', contenu: 'Entretien tel 25min. Profil très senior, 12 ans XP. Intéressé par SENEF.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[1].id, userId: meroe.id, direction: Direction.SORTANT, source: SourceActivite.ALLO, metadata: { duration: 1500, candidatName: 'Matthieu Potin' }, createdAt: daysAgo(5) },
    { titre: 'Appel Nicolas Spasic — point offre Temelion', contenu: 'Feedback positif sur l\'offre. Nicolas demande des précisions sur l\'equity.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[8].id, userId: meroe.id, direction: Direction.SORTANT, source: SourceActivite.ALLO, metadata: { duration: 1200, candidatName: 'Nicolas Spasic' }, createdAt: daysAgo(2) },
    { titre: 'Appel commercial Fatima Al-Rashid — Luxe Hospitality', contenu: 'Appel de découverte 20min. Fatima confirme le besoin. Envoi proposition dans la semaine.', entiteType: EntiteType.CLIENT, entiteId: clients[4].id, userId: meroe.id, direction: Direction.SORTANT, source: SourceActivite.ALLO, metadata: { duration: 1200, clientName: 'Fatima Al-Rashid' }, createdAt: daysAgo(8) },
    { titre: 'Appel suivi Sébastien Gilles — Temelion', contenu: 'Point sur l\'offre faite à Nicolas Spasic. Sébastien veut finaliser cette semaine.', entiteType: EntiteType.CLIENT, entiteId: clients[3].id, userId: meroe.id, direction: Direction.SORTANT, source: SourceActivite.ALLO, metadata: { duration: 600, clientName: 'Sébastien Gilles' }, createdAt: daysAgo(2) },
    { titre: 'Appel Hans Fischer — qualification BDM GreenLogistics', contenu: 'Profil intéressant. Allemand natif, bonne connaissance supply chain.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[9].id, userId: guillermo.id, direction: Direction.SORTANT, source: SourceActivite.ALLO, metadata: { duration: 900, candidatName: 'Hans Fischer' }, createdAt: daysAgo(4) },
    { titre: 'Appel Klaus Weber — brief poste BDM', contenu: 'Brief détaillé du poste BDM DACH. Profil recherché : 5-7 ans, allemand courant.', entiteType: EntiteType.CLIENT, entiteId: clients[9].id, userId: guillermo.id, direction: Direction.SORTANT, source: SourceActivite.ALLO, metadata: { duration: 1800, clientName: 'Klaus Weber' }, createdAt: daysAgo(6) },
    { titre: 'Appel Sophie Moreau — nouveau mandat TechVision', contenu: 'Sophie confirme le besoin d\'un AE Enterprise. Budget 70-90k. Start ASAP.', entiteType: EntiteType.CLIENT, entiteId: clients[13].id, userId: guillermo.id, direction: Direction.SORTANT, source: SourceActivite.ALLO, metadata: { duration: 900, clientName: 'Sophie Moreau' }, createdAt: daysAgo(5) },
    { titre: 'Appel Camille Durand — approche Enterprise AE TechVision', contenu: 'Camille intéressée mais en process ailleurs. Relancer dans 1 semaine.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[13].id, userId: guillermo.id, direction: Direction.SORTANT, source: SourceActivite.ALLO, metadata: { duration: 600, candidatName: 'Camille Durand' }, createdAt: daysAgo(3) },
    { titre: 'Appel Rachel Taylor — sourcing Head of Partnerships N26', contenu: 'Premier contact. Rachel est ouverte à de nouvelles opportunités.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[17].id, userId: guillermo.id, direction: Direction.SORTANT, source: SourceActivite.ALLO, metadata: { duration: 480, candidatName: 'Rachel Taylor' }, createdAt: daysAgo(8) },
    { titre: 'Appel Omar Al-Hassan — Director of Sales Luxe', contenu: 'Entretien 20min. Profil très pertinent. Expérience hôtellerie de luxe.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[11].id, userId: valentin.id, direction: Direction.SORTANT, source: SourceActivite.ALLO, metadata: { duration: 1200, candidatName: 'Omar Al-Hassan' }, createdAt: daysAgo(6) },
    { titre: 'Appel Elena Vasquez — point mandat Revolut', contenu: 'Elena confirme 2 entretiens clients la semaine prochaine. Charlotte Wilson prioritaire.', entiteType: EntiteType.CLIENT, entiteId: clients[15].id, userId: valentin.id, direction: Direction.SORTANT, source: SourceActivite.ALLO, metadata: { duration: 900, clientName: 'Elena Vasquez' }, createdAt: daysAgo(4) },
    { titre: 'Appel Charlotte Wilson — prep entretien Revolut', contenu: 'Préparation entretien client. Brief sur l\'équipe et les attentes.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[15].id, userId: valentin.id, direction: Direction.SORTANT, source: SourceActivite.ALLO, metadata: { duration: 900, candidatName: 'Charlotte Wilson' }, createdAt: daysAgo(3) },
    { titre: 'Appel Ji-Yeon Kim — entretien Director of Sales', contenu: 'Bon échange. Ji-Yeon a 8 ans d\'expérience hospitality luxury. Motivée par Dubai.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[12].id, userId: valentin.id, direction: Direction.SORTANT, source: SourceActivite.ALLO, metadata: { duration: 1500, candidatName: 'Ji-Yeon Kim' }, createdAt: daysAgo(7) },
    { titre: 'Appel entrant Carlos Garcia — confirmation placement Oracle', contenu: 'Carlos confirme son acceptation de l\'offre Oracle. Début le 1er avril.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[19].id, userId: meroe.id, direction: Direction.ENTRANT, source: SourceActivite.ALLO, metadata: { duration: 300, candidatName: 'Carlos Garcia' }, createdAt: daysAgo(7) },
  ];

  // 12 Emails
  const emails = [
    { titre: 'Email envoyé : Opportunité Head of Sales — SENEF', contenu: 'Email d\'approche envoyé à Pierre Dubois pour le poste Head of Sales chez SENEF.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[0].id, userId: meroe.id, direction: Direction.SORTANT, source: SourceActivite.GMAIL, metadata: { subject: 'Pierre, une opportunité Head of Sales chez SENEF', to: 'pierre.dubois@gmail.com' }, createdAt: daysAgo(10) },
    { titre: 'Email reçu : Candidature spontanée Romain Legay', contenu: 'Romain Legay envoie sa candidature pour des postes Sales Director SaaS.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[2].id, userId: meroe.id, direction: Direction.ENTRANT, source: SourceActivite.GMAIL, metadata: { subject: 'Candidature — Sales Director', from: 'romain.legay@gmail.com' }, createdAt: daysAgo(12) },
    { titre: 'Email envoyé : Proposition commerciale Luxe Hospitality', contenu: 'Envoi de la proposition commerciale à Fatima Al-Rashid pour le mandat Director of Sales.', entiteType: EntiteType.CLIENT, entiteId: clients[4].id, userId: meroe.id, direction: Direction.SORTANT, source: SourceActivite.GMAIL, metadata: { subject: 'Proposition — Director of Sales Luxury Hotels', to: 'f.alrashid@luxehospitality.com' }, createdAt: daysAgo(7) },
    { titre: 'Email envoyé : Brief poste BDM GreenLogistics', contenu: 'Envoi du brief poste à François Dubois et Klaus Weber.', entiteType: EntiteType.CLIENT, entiteId: clients[8].id, userId: guillermo.id, direction: Direction.SORTANT, source: SourceActivite.GMAIL, metadata: { subject: 'Brief — BDM DACH GreenLogistics', to: 'f.dubois@greenlogistics.eu' }, createdAt: daysAgo(6) },
    { titre: 'Email reçu : Feedback entretien TechVision', contenu: 'Sophie Moreau envoie un feedback positif sur Camille Durand. Souhaite un second entretien.', entiteType: EntiteType.CLIENT, entiteId: clients[13].id, userId: guillermo.id, direction: Direction.ENTRANT, source: SourceActivite.GMAIL, metadata: { subject: 'Re: Candidature Camille Durand — AE Enterprise', from: 'sophie.moreau@techvision.fr' }, createdAt: daysAgo(2) },
    { titre: 'Email envoyé : Approche candidat Marcus Tan', contenu: 'InMail LinkedIn + email d\'approche pour le poste VP Sales APAC CloudSecure.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[20].id, userId: meroe.id, direction: Direction.SORTANT, source: SourceActivite.GMAIL, metadata: { subject: 'Marcus, VP Sales APAC — une opportunité passionnante', to: 'marcus.tan@gmail.com' }, createdAt: daysAgo(2) },
    { titre: 'Email envoyé : Shortlist candidats Revolut', contenu: 'Envoi de la shortlist 3 candidats à Elena Vasquez pour le poste Senior Sales Manager.', entiteType: EntiteType.CLIENT, entiteId: clients[15].id, userId: valentin.id, direction: Direction.SORTANT, source: SourceActivite.GMAIL, metadata: { subject: 'Shortlist — Senior Sales Manager Revolut', to: 'e.vasquez@revolut.com' }, createdAt: daysAgo(10) },
    { titre: 'Email reçu : Réponse Liam O\'Connor', contenu: 'Liam confirme sa disponibilité pour un entretien client Revolut.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[16].id, userId: valentin.id, direction: Direction.ENTRANT, source: SourceActivite.GMAIL, metadata: { subject: 'Re: Opportunité Senior Sales Manager — Revolut', from: 'liam.oconnor@gmail.com' }, createdAt: daysAgo(8) },
    { titre: 'Email envoyé : Offre Temelion — Nicolas Spasic', contenu: 'Transmission de l\'offre de Temelion à Nicolas Spasic. Package 65k fixe + variable.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[8].id, userId: meroe.id, direction: Direction.SORTANT, source: SourceActivite.GMAIL, metadata: { subject: 'Offre — Founding AE Temelion', to: 'nicolas.spasic@gmail.com' }, createdAt: daysAgo(4) },
    { titre: 'Email envoyé : Confirmation placement Carlos Garcia', contenu: 'Email de confirmation du placement et des détails de facturation à Oracle.', entiteType: EntiteType.CLIENT, entiteId: clients[23].id, userId: meroe.id, direction: Direction.SORTANT, source: SourceActivite.GMAIL, metadata: { subject: 'Confirmation placement — Country Manager Iberia', to: 'm.rodriguez@oracle.com' }, createdAt: daysAgo(7) },
    { titre: 'Email reçu : Demande de meeting Wei Lin Lim', contenu: 'Wei Lin propose un call demain pour discuter du poste VP Sales APAC.', entiteType: EntiteType.CLIENT, entiteId: clients[6].id, userId: meroe.id, direction: Direction.ENTRANT, source: SourceActivite.GMAIL, metadata: { subject: 'VP Sales APAC — availability for a call?', from: 'wl.lim@cloudsecure.io' }, createdAt: daysAgo(1) },
    { titre: 'Email envoyé : Relance N26 — avancement candidats', contenu: 'Relance à Markus Braun sur l\'avancement du sourcing Head of Partnerships.', entiteType: EntiteType.CLIENT, entiteId: clients[18].id, userId: guillermo.id, direction: Direction.SORTANT, source: SourceActivite.GMAIL, metadata: { subject: 'Point avancement — Head of Partnerships N26', to: 'm.braun@n26.com' }, createdAt: daysAgo(7) },
  ];

  // 10 Meetings
  const meetings = [
    // 4 Présentations candidat
    { titre: 'Présentation candidat Pierre Dubois — SENEF', contenu: 'Présentation de Pierre Dubois à Mme Mbaye. Bon échange, profil retenu pour entretien final.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[0].id, userId: meroe.id, metadata: { meetingType: 'presentation', attendees: ['a.mbaye@senef.fr', 'pierre.dubois@gmail.com'], duration: 3600 }, createdAt: daysAgo(2) },
    { titre: 'Présentation candidat Matthieu Potin — SENEF', contenu: 'Présentation de Matthieu Potin à Mme Mbaye. Profil senior, très bonne impression.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[1].id, userId: meroe.id, metadata: { meetingType: 'presentation', attendees: ['a.mbaye@senef.fr', 'matthieu.potin@gmail.com'], duration: 3600 }, createdAt: daysAgo(3) },
    { titre: 'Entretien Charlotte Wilson — Revolut', contenu: 'Entretien client avec Elena Vasquez. Charlotte fait bonne impression, feedback positif.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[15].id, userId: valentin.id, metadata: { meetingType: 'entretien', attendees: ['e.vasquez@revolut.com', 'charlotte.wilson@gmail.com'], duration: 2700 }, createdAt: daysAgo(4) },
    { titre: 'Entretien Omar Al-Hassan — Luxe Hospitality', contenu: 'Premier entretien Omar avec Fatima. Échange sur le scope du poste et les KPIs.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[11].id, userId: valentin.id, metadata: { meetingType: 'entretien', attendees: ['f.alrashid@luxehospitality.com', 'omar.alhassan@gmail.com'], duration: 3600 }, createdAt: daysAgo(5) },
    // 3 RDV commerciaux
    { titre: 'RDV commercial — Wei Lin Lim — CloudSecure', contenu: 'Meeting de découverte avec Wei Lin, CEO de CloudSecure. Besoin VP Sales APAC identifié.', entiteType: EntiteType.CLIENT, entiteId: clients[6].id, userId: meroe.id, metadata: { meetingType: 'commercial', attendees: ['wl.lim@cloudsecure.io'], duration: 2700 }, createdAt: daysAgo(3) },
    { titre: 'RDV commercial — Sophie Moreau — TechVision', contenu: 'Kick-off mandat Enterprise AE. Brief détaillé, profil idéal, timeline.', entiteType: EntiteType.CLIENT, entiteId: clients[13].id, userId: guillermo.id, metadata: { meetingType: 'commercial', attendees: ['sophie.moreau@techvision.fr', 'david.chen@techvision.fr'], duration: 3600 }, createdAt: daysAgo(5) },
    { titre: 'RDV commercial — Fatima Al-Rashid — Luxe Hospitality', contenu: 'Présentation de HumanUp et de notre expertise hospitality. Fatima intéressée, envoi proposition.', entiteType: EntiteType.CLIENT, entiteId: clients[4].id, userId: meroe.id, metadata: { meetingType: 'nouveau_client', attendees: ['f.alrashid@luxehospitality.com', 'k.tanaka@luxehospitality.com'], duration: 3600 }, createdAt: daysAgo(10) },
    // 3 Autres (weekly, internal)
    { titre: 'Weekly client — Mme Mbaye — SENEF', contenu: 'Point hebdomadaire sur l\'avancement du mandat Head of Sales. 2 candidats en entretien client.', entiteType: EntiteType.CLIENT, entiteId: clients[0].id, userId: meroe.id, metadata: { meetingType: 'weekly_client', attendees: ['a.mbaye@senef.fr'], duration: 1800 }, createdAt: daysAgo(1) },
    { titre: 'Weekly client — Elena Vasquez — Revolut', contenu: 'Point hebdo mandat Senior Sales Manager. Charlotte Wilson passe en entretien final.', entiteType: EntiteType.CLIENT, entiteId: clients[15].id, userId: valentin.id, metadata: { meetingType: 'weekly_client', attendees: ['e.vasquez@revolut.com'], duration: 1800 }, createdAt: daysAgo(1) },
    { titre: 'Réunion interne — Pipeline review Q1', contenu: 'Revue de pipeline Q1 avec l\'équipe. 10 mandats actifs, 3 placements ce trimestre.', entiteType: EntiteType.MANDAT, entiteId: mandats[0].id, userId: meroe.id, metadata: { meetingType: 'other', attendees: ['guillermo@humanup.io', 'valentin@humanup.io'], duration: 3600 }, createdAt: daysAgo(7) },
  ];

  // 5 Notes manuelles
  const notes = [
    { titre: 'Note — Brief poste Head of Sales SENEF', contenu: 'Poste clé. SENEF cherche un profil capable de structurer l\'équipe (3 AE + 2 SDR) et de closer les deals >100k ARR. Stack: Salesforce, Gong. Budget: 90-120k + variable déplafonné.', entiteType: EntiteType.MANDAT, entiteId: mandats[0].id, userId: meroe.id, createdAt: daysAgo(20) },
    { titre: 'Note — Feedback entretien Nicolas Spasic', contenu: 'Sébastien très enthousiaste. Nicolas a bien pitché sa vision go-to-market. Offre à envoyer rapidement.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[8].id, userId: meroe.id, createdAt: daysAgo(5) },
    { titre: 'Note — Marché DACH Supply Chain', contenu: 'Le marché DACH est tendu pour les profils BDM supply chain. Élargir le sourcing vers le Benelux.', entiteType: EntiteType.MANDAT, entiteId: mandats[3].id, userId: guillermo.id, createdAt: daysAgo(4) },
    { titre: 'Note — Contexte hôtellerie de luxe Dubai', contenu: 'Forte demande de Director of Sales dans le luxury hospitality à Dubai. Salaires en hausse de 15% vs 2025.', entiteType: EntiteType.MANDAT, entiteId: mandats[4].id, userId: valentin.id, createdAt: daysAgo(15) },
    { titre: 'Note — Carlos Garcia — process de closing', contenu: 'Carlos a accepté l\'offre Oracle à 125k + 20% bonus. Start 1er avril. Facturer 28k€ à Miguel Rodriguez.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[19].id, userId: meroe.id, createdAt: daysAgo(7) },
  ];

  // 5 Stage changes
  const stageChanges = [
    { titre: 'Pierre Dubois avancé à Entretien client — SENEF', contenu: 'Suite à l\'entretien 1 positif, Pierre passe en entretien client avec Mme Mbaye.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[0].id, userId: meroe.id, metadata: { fromStage: 'ENTRETIEN_1', toStage: 'ENTRETIEN_CLIENT' }, createdAt: daysAgo(4) },
    { titre: 'Nicolas Spasic avancé à Offre — Temelion', contenu: 'Offre envoyée à Nicolas pour le poste de Founding AE chez Temelion.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[8].id, userId: meroe.id, metadata: { fromStage: 'ENTRETIEN_CLIENT', toStage: 'OFFRE' }, createdAt: daysAgo(3) },
    { titre: 'Charlotte Wilson avancée à Entretien client — Revolut', contenu: 'Charlotte passe en entretien avec Elena Vasquez pour le Senior Sales Manager.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[15].id, userId: valentin.id, metadata: { fromStage: 'ENTRETIEN_1', toStage: 'ENTRETIEN_CLIENT' }, createdAt: daysAgo(5) },
    { titre: 'Carlos Garcia — PLACÉ chez Oracle', contenu: 'Carlos Garcia a accepté l\'offre de Country Manager Iberia. Placement confirmé!', entiteType: EntiteType.CANDIDAT, entiteId: candidats[19].id, userId: meroe.id, metadata: { fromStage: 'OFFRE', toStage: 'PLACE' }, createdAt: daysAgo(7) },
    { titre: 'Nadia Bouchard — Refusée pour Head of Sales SENEF', contenu: 'Profil trop junior pour le scope. Orientation vers d\'autres mandats AE.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[3].id, userId: meroe.id, metadata: { fromStage: 'ENTRETIEN_1', toStage: 'REFUSE', motif: 'PROFIL_PAS_ALIGNE' }, createdAt: daysAgo(6) },
  ];

  // 3 Documents (CV uploads)
  const documents = [
    { titre: 'CV uploadé — Pierre Dubois', contenu: 'CV de Pierre Dubois pour le mandat Head of Sales SENEF.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[0].id, userId: meroe.id, metadata: { fileName: 'CV_Pierre_Dubois_2026.pdf', fileSize: 245000 }, createdAt: daysAgo(10) },
    { titre: 'CV uploadé — Nicolas Spasic', contenu: 'CV de Nicolas Spasic pour le mandat Founding AE Temelion.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[8].id, userId: meroe.id, metadata: { fileName: 'CV_Nicolas_Spasic.pdf', fileSize: 312000 }, createdAt: daysAgo(15) },
    { titre: 'CV uploadé — Omar Al-Hassan', contenu: 'CV de Omar Al-Hassan pour le mandat Director of Sales Luxe Hospitality.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[11].id, userId: valentin.id, metadata: { fileName: 'CV_Omar_AlHassan.pdf', fileSize: 198000 }, createdAt: daysAgo(8) },
  ];

  // Create all activities
  for (const a of appels) {
    await prisma.activite.create({ data: { type: TypeActivite.APPEL, direction: a.direction, entiteType: a.entiteType, entiteId: a.entiteId, userId: a.userId, titre: a.titre, contenu: a.contenu, metadata: a.metadata, source: a.source, createdAt: a.createdAt } });
  }
  for (const a of emails) {
    await prisma.activite.create({ data: { type: TypeActivite.EMAIL, direction: a.direction, entiteType: a.entiteType, entiteId: a.entiteId, userId: a.userId, titre: a.titre, contenu: a.contenu, metadata: a.metadata, source: a.source, createdAt: a.createdAt } });
  }
  for (const a of meetings) {
    await prisma.activite.create({ data: { type: TypeActivite.MEETING, entiteType: a.entiteType, entiteId: a.entiteId, userId: a.userId, titre: a.titre, contenu: a.contenu, metadata: a.metadata, source: SourceActivite.CALENDAR, createdAt: a.createdAt } });
  }
  for (const a of notes) {
    await prisma.activite.create({ data: { type: TypeActivite.NOTE, entiteType: a.entiteType, entiteId: a.entiteId, userId: a.userId, titre: a.titre, contenu: a.contenu, source: SourceActivite.MANUEL, createdAt: a.createdAt } });
  }
  for (const a of stageChanges) {
    await prisma.activite.create({ data: { type: TypeActivite.NOTE, entiteType: a.entiteType, entiteId: a.entiteId, userId: a.userId, titre: a.titre, contenu: a.contenu, metadata: a.metadata, source: SourceActivite.SYSTEME, createdAt: a.createdAt } });
  }
  for (const a of documents) {
    const act = await prisma.activite.create({ data: { type: TypeActivite.NOTE, entiteType: a.entiteType, entiteId: a.entiteId, userId: a.userId, titre: a.titre, contenu: a.contenu, metadata: a.metadata, source: SourceActivite.MANUEL, createdAt: a.createdAt } });
    await prisma.fichierActivite.create({ data: { activiteId: act.id, nom: (a.metadata as any).fileName, url: `/uploads/${(a.metadata as any).fileName}`, mimeType: 'application/pdf', taille: (a.metadata as any).fileSize } });
  }

  // ═══════════════════════════════════════════════════════
  // 9. TÂCHES (15 — as activities with isTache=true)
  // ═══════════════════════════════════════════════════════
  console.log('  Creating 15 tasks...');
  const today = dateOnly(now);
  const taches = [
    // 5 today (2 HAUTE, 2 NORMALE, 1 BASSE)
    { titre: 'Préparer dossier candidat pour entretien final SENEF', entiteType: EntiteType.MANDAT, entiteId: mandats[0].id, userId: meroe.id, tacheDueDate: today, metadata: { priority: 'HAUTE' } },
    { titre: 'Appeler Nicolas Spasic — feedback offre Temelion', entiteType: EntiteType.CANDIDAT, entiteId: candidats[8].id, userId: meroe.id, tacheDueDate: today, metadata: { priority: 'HAUTE' } },
    { titre: 'Envoyer email de suivi à Klaus Weber — GreenLogistics', entiteType: EntiteType.CLIENT, entiteId: clients[9].id, userId: guillermo.id, tacheDueDate: today, metadata: { priority: 'NORMALE' } },
    { titre: 'Mettre à jour fiche candidat Marcus Tan — vivier APAC', entiteType: EntiteType.CANDIDAT, entiteId: candidats[20].id, userId: meroe.id, tacheDueDate: today, metadata: { priority: 'NORMALE' } },
    { titre: 'Relire notes brief poste VP Sales APAC CloudSecure', entiteType: EntiteType.MANDAT, entiteId: mandats[6].id, userId: meroe.id, tacheDueDate: today, metadata: { priority: 'BASSE' } },
    // 3 overdue
    { titre: 'Relancer Fatima Al-Rashid — proposition commerciale', entiteType: EntiteType.CLIENT, entiteId: clients[4].id, userId: meroe.id, tacheDueDate: dateOnly(daysAgo(2)), metadata: { priority: 'HAUTE' } },
    { titre: 'Envoyer shortlist candidats Joy/Privateaser', entiteType: EntiteType.MANDAT, entiteId: mandats[1].id, userId: meroe.id, tacheDueDate: dateOnly(daysAgo(5)), metadata: { priority: 'HAUTE' } },
    { titre: 'Follow-up call avec Liam O\'Connor — Revolut', entiteType: EntiteType.CANDIDAT, entiteId: candidats[16].id, userId: valentin.id, tacheDueDate: dateOnly(daysAgo(1)), metadata: { priority: 'NORMALE' } },
    // 4 this week
    { titre: 'Planifier entretien final Revolut — Charlotte Wilson', entiteType: EntiteType.CANDIDAT, entiteId: candidats[15].id, userId: valentin.id, tacheDueDate: dateOnly(new Date(now.getTime() + 2 * 86400000)), metadata: { priority: 'HAUTE' } },
    { titre: 'Sourcing LinkedIn — BDM GreenLogistics', entiteType: EntiteType.MANDAT, entiteId: mandats[3].id, userId: guillermo.id, tacheDueDate: dateOnly(new Date(now.getTime() + 3 * 86400000)), metadata: { priority: 'NORMALE' } },
    { titre: 'Préparer présentation candidat pour FinEdge', entiteType: EntiteType.MANDAT, entiteId: mandats[10].id, userId: meroe.id, tacheDueDate: dateOnly(new Date(now.getTime() + 1 * 86400000)), metadata: { priority: 'NORMALE' } },
    { titre: 'Envoyer contrat Carlos Garcia — Oracle', entiteType: EntiteType.CLIENT, entiteId: clients[23].id, userId: meroe.id, tacheDueDate: dateOnly(new Date(now.getTime() + 2 * 86400000)), metadata: { priority: 'HAUTE' } },
    // 3 completed
    { titre: 'Brief call avec Sophie Moreau — TechVision', entiteType: EntiteType.CLIENT, entiteId: clients[13].id, userId: guillermo.id, tacheDueDate: dateOnly(daysAgo(1)), tacheCompleted: true, metadata: { priority: 'NORMALE' } },
    { titre: 'Envoyer CV Pierre Dubois à SENEF', entiteType: EntiteType.CANDIDAT, entiteId: candidats[0].id, userId: meroe.id, tacheDueDate: dateOnly(daysAgo(2)), tacheCompleted: true, metadata: { priority: 'HAUTE' } },
    { titre: 'Qualifier profil Romain Legay — Head of Sales', entiteType: EntiteType.CANDIDAT, entiteId: candidats[2].id, userId: meroe.id, tacheDueDate: dateOnly(daysAgo(3)), tacheCompleted: true, metadata: { priority: 'NORMALE' } },
  ];

  for (const t of taches) {
    await prisma.activite.create({
      data: {
        type: TypeActivite.TACHE,
        entiteType: t.entiteType,
        entiteId: t.entiteId,
        userId: t.userId,
        titre: t.titre,
        source: SourceActivite.MANUEL,
        isTache: true,
        tacheCompleted: t.tacheCompleted ?? false,
        tacheDueDate: t.tacheDueDate,
        metadata: t.metadata,
      },
    });
  }

  // ═══════════════════════════════════════════════════════
  // 10. NOTIFICATIONS (10)
  // ═══════════════════════════════════════════════════════
  console.log('  Creating 10 notifications...');
  await Promise.all([
    prisma.notification.create({ data: { userId: meroe.id, type: TypeNotification.SYSTEME, titre: 'Nouveau candidat ajouté : Marcus Tan', contenu: 'Marcus Tan (Enterprise AE, Palo Alto Networks) a été ajouté au vivier APAC.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[20].id, lue: false, createdAt: hoursAgo(1) } }),
    prisma.notification.create({ data: { userId: meroe.id, type: TypeNotification.CANDIDATURE_STAGE_CHANGE, titre: 'Nicolas Spasic avancé à Offre — Temelion', contenu: 'Le candidat Nicolas Spasic a été avancé à l\'étape Offre pour le mandat Founding AE Temelion.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[8].id, lue: true, createdAt: daysAgo(2) } }),
    prisma.notification.create({ data: { userId: meroe.id, type: TypeNotification.TACHE_ECHEANCE, titre: 'Tâche en retard : Relancer Fatima Al-Rashid', contenu: 'La tâche "Relancer Fatima Al-Rashid — proposition commerciale" est en retard de 2 jours.', entiteType: EntiteType.CLIENT, entiteId: clients[4].id, lue: false, createdAt: daysAgo(1) } }),
    prisma.notification.create({ data: { userId: meroe.id, type: TypeNotification.EMAIL_RECU, titre: 'Email reçu de Wei Lin Lim — CloudSecure', contenu: 'Wei Lin propose un call pour discuter du poste VP Sales APAC.', entiteType: EntiteType.CLIENT, entiteId: clients[6].id, lue: false, createdAt: hoursAgo(3) } }),
    prisma.notification.create({ data: { userId: meroe.id, type: TypeNotification.CANDIDATURE_STAGE_CHANGE, titre: 'Carlos Garcia placé chez Oracle — Félicitations!', contenu: 'Placement confirmé! Carlos Garcia commence en tant que Country Manager Iberia le 1er avril.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[19].id, lue: true, createdAt: daysAgo(7) } }),
    prisma.notification.create({ data: { userId: meroe.id, type: TypeNotification.SYSTEME, titre: 'Nouveau mandat : VP Sales APAC — CloudSecure', contenu: 'Le mandat VP Sales APAC chez CloudSecure a été créé. Fee estimé : 30k€.', entiteType: EntiteType.MANDAT, entiteId: mandats[6].id, lue: true, createdAt: daysAgo(2) } }),
    prisma.notification.create({ data: { userId: meroe.id, type: TypeNotification.RELANCE_CLIENT, titre: 'Rappel : Entretien client SENEF demain', contenu: 'Entretien final de Pierre Dubois avec Mme Mbaye prévu demain à 14h.', entiteType: EntiteType.MANDAT, entiteId: mandats[0].id, lue: false, createdAt: daysAgo(1) } }),
    prisma.notification.create({ data: { userId: guillermo.id, type: TypeNotification.SYSTEME, titre: 'Nouveau mandat : Enterprise AE — TechVision', contenu: 'Sophie Moreau a confirmé le mandat Enterprise AE pour TechVision SAS.', entiteType: EntiteType.MANDAT, entiteId: mandats[5].id, lue: true, createdAt: daysAgo(5) } }),
    prisma.notification.create({ data: { userId: meroe.id, type: TypeNotification.CANDIDATURE_STAGE_CHANGE, titre: 'Pierre Dubois avancé à Entretien client — SENEF', contenu: 'Pierre Dubois passe en entretien client avec Mme Mbaye pour le poste Head of Sales.', entiteType: EntiteType.CANDIDAT, entiteId: candidats[0].id, lue: true, createdAt: daysAgo(1) } }),
    prisma.notification.create({ data: { userId: meroe.id, type: TypeNotification.TACHE_ECHEANCE, titre: 'Tâche en retard : Envoyer shortlist Joy/Privateaser', contenu: 'La shortlist pour le mandat Head of AM chez Joy/Privateaser est en retard de 5 jours.', entiteType: EntiteType.MANDAT, entiteId: mandats[1].id, lue: false, createdAt: daysAgo(3) } }),
  ]);

  // ═══════════════════════════════════════════════════════
  // 11. SEED DEFAULT SEQUENCES (4 templates multicanal)
  // ═══════════════════════════════════════════════════════
  console.log('  Creating 4 sequence templates...');
  const { seedDefaultSequences } = await import('../src/modules/sequences/sequence.service.js');
  await seedDefaultSequences(meroe.id);

  // ═══════════════════════════════════════════════════════
  // 12. SDR LISTS + CONTACTS (2 listes, 30 contacts)
  // ═══════════════════════════════════════════════════════
  console.log('  Creating SDR lists with contacts...');

  const sdrList1 = await prisma.sdrList.create({
    data: {
      name: 'Prospection Sales SaaS Q1',
      fileName: 'sales-saas-q1-2026.csv',
      totalContacts: 18,
      processedContacts: 12,
      status: 'in_progress',
      assignedToId: meroe.id,
      createdById: meroe.id,
      metadata: { headers: ['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Title'], importedAt: daysAgo(5).toISOString() },
      createdAt: daysAgo(5),
    },
  });

  const sdrList2 = await prisma.sdrList.create({
    data: {
      name: 'LinkedIn Export — Head of Sales',
      fileName: 'linkedin-head-of-sales.csv',
      totalContacts: 12,
      processedContacts: 0,
      status: 'imported',
      createdById: meroe.id,
      metadata: { headers: ['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Position'], importedAt: daysAgo(1).toISOString() },
      createdAt: daysAgo(1),
    },
  });

  // SDR List 1: 18 contacts — 12 already processed with results
  const sdrContacts1 = [
    { firstName: 'Sophie', lastName: 'Martin', email: 'sophie.martin@salesforce.com', phone: '+33612345001', company: 'Salesforce', jobTitle: 'VP Sales France', callResult: 'answered', notes: 'Très intéressée, envoyer fiche poste SENEF', processedAt: daysAgo(4) },
    { firstName: 'Thomas', lastName: 'Bernard', email: 'thomas.bernard@hubspot.fr', phone: '+33612345002', company: 'HubSpot', jobTitle: 'Director of Sales', callResult: 'answered', notes: 'En poste depuis 6 mois, pas en veille active mais ouvert à discuter', processedAt: daysAgo(4) },
    { firstName: 'Laura', lastName: 'Petit', email: 'laura.petit@docusign.com', phone: '+33612345003', company: 'DocuSign', jobTitle: 'Head of Enterprise Sales', callResult: 'no_answer', processedAt: daysAgo(4) },
    { firstName: 'Marc', lastName: 'Rousseau', email: 'marc.rousseau@datadog.com', phone: '+33612345004', company: 'Datadog', jobTitle: 'Regional Sales Director', callResult: 'voicemail', notes: 'Messagerie — rappeler mardi', processedAt: daysAgo(3) },
    { firstName: 'Camille', lastName: 'Dubois', email: 'camille.dubois@stripe.com', phone: '+33612345005', company: 'Stripe', jobTitle: 'Head of Sales Southern Europe', callResult: 'answered', notes: 'Super profil, a envoyé son CV. Entretien fixé la semaine prochaine', processedAt: daysAgo(3) },
    { firstName: 'Antoine', lastName: 'Moreau', email: 'antoine.moreau@algolia.com', phone: '+33612345006', company: 'Algolia', jobTitle: 'Sales Manager', callResult: 'not_interested', notes: 'Vient de signer chez Algolia, pas mobile', processedAt: daysAgo(3) },
    { firstName: 'Julie', lastName: 'Lefebvre', email: 'julie.lefebvre@contentful.com', phone: '+33612345007', company: 'Contentful', jobTitle: 'Enterprise AE', callResult: 'no_answer', processedAt: daysAgo(2) },
    { firstName: 'Nicolas', lastName: 'Garnier', email: 'nicolas.garnier@mongodb.com', phone: '+33612345008', company: 'MongoDB', jobTitle: 'Regional VP Sales', callResult: 'answered', notes: 'Connaît SENEF, intéressé par le poste. À recontacter après ses congés', processedAt: daysAgo(2) },
    { firstName: 'Émilie', lastName: 'Robert', email: 'emilie.robert@twilio.com', phone: '+33612345009', company: 'Twilio', jobTitle: 'Director Sales EMEA', callResult: 'wrong_number', notes: 'Numéro plus attribué', processedAt: daysAgo(2) },
    { firstName: 'Alexandre', lastName: 'Simon', email: 'alexandre.simon@amplitude.com', phone: '+33612345010', company: 'Amplitude', jobTitle: 'Head of Sales France', callResult: 'callback', notes: 'En meeting, rappeler demain 14h', processedAt: daysAgo(1) },
    { firstName: 'Margaux', lastName: 'Laurent', email: 'margaux.laurent@braze.com', phone: '+33612345011', company: 'Braze', jobTitle: 'Sales Director France', callResult: 'answered', notes: 'Très bon profil, motivation claire. Shortlistée pour SENEF.', processedAt: daysAgo(1) },
    { firstName: 'Romain', lastName: 'Michel', email: 'romain.michel@segment.com', phone: '+33612345012', company: 'Segment', jobTitle: 'Enterprise Account Executive', callResult: 'voicemail', processedAt: daysAgo(1) },
    // 6 remaining (pending)
    { firstName: 'Céline', lastName: 'Garcia', email: 'celine.garcia@zendesk.com', phone: '+33612345013', company: 'Zendesk', jobTitle: 'Head of Mid-Market Sales', callResult: 'pending' },
    { firstName: 'Maxime', lastName: 'Fournier', email: 'maxime.fournier@intercom.com', phone: '+33612345014', company: 'Intercom', jobTitle: 'Sales Manager France', callResult: 'pending' },
    { firstName: 'Pauline', lastName: 'Mercier', email: 'pauline.mercier@notion.so', phone: '+33612345015', company: 'Notion', jobTitle: 'Account Executive', callResult: 'pending' },
    { firstName: 'Vincent', lastName: 'Bonnet', email: 'vincent.bonnet@figma.com', phone: '+33612345016', company: 'Figma', jobTitle: 'Enterprise Sales Lead', callResult: 'pending' },
    { firstName: 'Isabelle', lastName: 'Girard', email: 'isabelle.girard@miro.com', phone: '+33612345017', company: 'Miro', jobTitle: 'Regional Director Sales', callResult: 'pending' },
    { firstName: 'Fabien', lastName: 'Andre', email: 'fabien.andre@airtable.com', phone: '+33612345018', company: 'Airtable', jobTitle: 'Head of Sales EMEA', callResult: 'pending' },
  ];

  await prisma.sdrContact.createMany({
    data: sdrContacts1.map((c, i) => ({
      sdrListId: sdrList1.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      company: c.company,
      jobTitle: c.jobTitle,
      callResult: c.callResult,
      notes: c.notes || null,
      processedAt: c.processedAt || null,
      orderInList: i + 1,
      rawData: { firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, company: c.company, title: c.jobTitle },
    })),
  });

  // SDR List 2: 12 contacts — all pending (just imported)
  const sdrContacts2 = [
    { firstName: 'Olivier', lastName: 'Durand', email: 'o.durand@sap.com', phone: '+33612346001', company: 'SAP', jobTitle: 'Head of Sales France' },
    { firstName: 'Clara', lastName: 'Lemoine', email: 'c.lemoine@oracle.com', phone: '+33612346002', company: 'Oracle', jobTitle: 'VP Sales Southern Europe' },
    { firstName: 'Yannick', lastName: 'Chevalier', email: 'y.chevalier@workday.com', phone: '+33612346003', company: 'Workday', jobTitle: 'Sales Director France' },
    { firstName: 'Sandrine', lastName: 'Blanc', email: 's.blanc@servicenow.com', phone: '+33612346004', company: 'ServiceNow', jobTitle: 'Head of Enterprise' },
    { firstName: 'Damien', lastName: 'Roche', email: 'd.roche@snowflake.com', phone: '+33612346005', company: 'Snowflake', jobTitle: 'Regional VP France' },
    { firstName: 'Nathalie', lastName: 'Morin', email: 'n.morin@splunk.com', phone: '+33612346006', company: 'Splunk', jobTitle: 'Director Sales' },
    { firstName: 'Thibault', lastName: 'Legrand', email: 't.legrand@elastic.co', phone: '+33612346007', company: 'Elastic', jobTitle: 'Head of Sales France' },
    { firstName: 'Marie', lastName: 'Dufour', email: 'm.dufour@confluent.io', phone: '+33612346008', company: 'Confluent', jobTitle: 'Enterprise Sales Lead' },
    { firstName: 'Stéphane', lastName: 'Perrin', email: 's.perrin@databricks.com', phone: '+33612346009', company: 'Databricks', jobTitle: 'VP Sales France' },
    { firstName: 'Aurélie', lastName: 'Clement', email: 'a.clement@hashicorp.com', phone: '+33612346010', company: 'HashiCorp', jobTitle: 'Sales Director EMEA' },
    { firstName: 'Guillaume', lastName: 'Fontaine', email: 'g.fontaine@gitlab.com', phone: '+33612346011', company: 'GitLab', jobTitle: 'Head of Sales France' },
    { firstName: 'Elise', lastName: 'Roussel', email: 'e.roussel@pagerduty.com', phone: '+33612346012', company: 'PagerDuty', jobTitle: 'Regional Sales Manager' },
  ];

  await prisma.sdrContact.createMany({
    data: sdrContacts2.map((c, i) => ({
      sdrListId: sdrList2.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      company: c.company,
      jobTitle: c.jobTitle,
      callResult: 'pending',
      orderInList: i + 1,
      rawData: { firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, company: c.company, title: c.jobTitle },
    })),
  });

  // ═══════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════
  console.log('\n✅ Seed completed successfully!');
  console.log('  ─────────────────────────────────────');
  console.log('  👤 3 users (Méroë, Guillermo, Valentin)');
  console.log('  🏢 15 entreprises');
  console.log('  🤝 25 clients');
  console.log('  📋 13 mandats (10 active + 3 past for revenue)');
  console.log('  👥 30 candidats (20 in pipelines + 10 vivier)');
  console.log(`  📎 ${candidatureData.length} candidatures`);
  console.log(`  📊 ${appels.length + emails.length + meetings.length + notes.length + stageChanges.length + documents.length} activities`);
  console.log('  ✅ 15 tasks');
  console.log('  🔔 10 notifications');
  console.log('  🎯 2 SDR lists (30 contacts, 12 processed)');
  console.log('  ─────────────────────────────────────');
  console.log('  💰 Revenue Q1: 83k€ facturé, 68k€ encaissé');
  console.log('  ⚠️  2 mandats dormants (Joy, N26)');
  console.log('  🎯 1 offre en cours (Temelion)');
  console.log('  🏆 1 placement récent (Oracle)');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
