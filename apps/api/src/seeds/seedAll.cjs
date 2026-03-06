// Seed script - HumanUp ATS
// Usage: node apps/api/src/seeds/seedAll.js

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');

const prisma = new PrismaClient();

// ─── FIXED IDS ───
const MEROE_ID = 'e8d757cd-5891-4f26-a716-d873af779bb0';
const GUILLERMO_ID = '89c405e5-7dc3-44b6-af0a-1495a0770616';
const VALENTIN_ID = '4543e84b-c88e-4b72-a27a-55ec9a647a84';
const MARIE_ID = 'f1a2b3c4-d5e6-4f78-9a0b-1c2d3e4f5a6b';

// Enterprise IDs
const E = {};
['SENEF','JOY','TEMELION','LUXE','CLOUDSECURE','GREENLOGISTICS','FINEDGE','TECHVISION','REVOLUT','MARRIOTT','PALOALTO','N26','CONTENTSQUARE','HILTON','ORACLE'].forEach(k => E[k] = randomUUID());

// Client IDs (25)
const C = {};
for (let i = 1; i <= 25; i++) C['C'+i] = randomUUID();

// Mandat IDs (10)
const M = {};
for (let i = 1; i <= 10; i++) M['M'+i] = randomUUID();

// Candidat IDs (30)
const CA = {};
for (let i = 1; i <= 30; i++) CA['CA'+i] = randomUUID();

// Helper: date relative to now
function daysAgo(n) { return new Date(Date.now() - n * 86400000); }
function hoursAgo(n) { return new Date(Date.now() - n * 3600000); }

async function main() {
  console.log('Cleaning database...');
  // Delete in order respecting FK constraints
  await prisma.$executeRawUnsafe('DELETE FROM "sequence_step_logs"');
  await prisma.$executeRawUnsafe('DELETE FROM "sequence_runs"');
  await prisma.$executeRawUnsafe('DELETE FROM "sequences"');
  await prisma.$executeRawUnsafe('DELETE FROM "sdr_contacts"');
  await prisma.$executeRawUnsafe('DELETE FROM "sdr_lists"');
  await prisma.$executeRawUnsafe('DELETE FROM "adchase_prospects"');
  await prisma.$executeRawUnsafe('DELETE FROM "adchase_campaigns"');
  await prisma.$executeRawUnsafe('DELETE FROM "ai_prospect_searches"');
  await prisma.$executeRawUnsafe('DELETE FROM "ai_call_briefs"');
  await prisma.$executeRawUnsafe('DELETE FROM "ai_call_summaries"');
  await prisma.$executeRawUnsafe('DELETE FROM "ai_usage_logs"');
  await prisma.$executeRawUnsafe('DELETE FROM "reminders"');
  await prisma.$executeRawUnsafe('DELETE FROM "audit_logs"');
  await prisma.$executeRawUnsafe('DELETE FROM "notifications"');
  await prisma.$executeRawUnsafe('DELETE FROM "fichiers_activites"');
  await prisma.$executeRawUnsafe('DELETE FROM "activites"');
  await prisma.$executeRawUnsafe('DELETE FROM "stage_history"');
  await prisma.$executeRawUnsafe('DELETE FROM "candidatures"');
  await prisma.$executeRawUnsafe('DELETE FROM "templates"');
  await prisma.$executeRawUnsafe('DELETE FROM "integration_configs"');
  await prisma.$executeRawUnsafe('DELETE FROM "mandats"');
  await prisma.$executeRawUnsafe('DELETE FROM "candidats"');
  await prisma.$executeRawUnsafe('DELETE FROM "clients"');
  await prisma.$executeRawUnsafe('DELETE FROM "entreprises"');
  await prisma.$executeRawUnsafe('DELETE FROM "users"');
  console.log('Database cleaned.');

  // ─── USERS ───
  const pwHash = '$2b$12$PZqTfgi.nWb1suu4jtH/h.Q43TEWmVzXdh9urbmwTldypYzU2yNyO';
  await prisma.user.createMany({ data: [
    { id: MEROE_ID, email: 'meroe@humanup.io', passwordHash: pwHash, nom: 'Nguimbi', prenom: 'Meroe', role: 'ADMIN', mustChangePassword: false, monthlySalary: 0, variableRate: 0, startDate: new Date('2024-01-01') },
    { id: GUILLERMO_ID, email: 'guillermo@humanup.io', passwordHash: pwHash, nom: 'Solis Gomez', prenom: 'Guillermo', role: 'RECRUTEUR', mustChangePassword: false, monthlySalary: 4500, variableRate: 10, startDate: new Date('2024-06-01') },
    { id: VALENTIN_ID, email: 'valentin@humanup.io', passwordHash: pwHash, nom: 'Murcia', prenom: 'Valentin', role: 'RECRUTEUR', mustChangePassword: false, monthlySalary: 3200, variableRate: 8, startDate: new Date('2025-01-01') },
    { id: MARIE_ID, email: 'marie@humanup.io', passwordHash: pwHash, nom: 'Le Ret', prenom: 'Marie', role: 'RECRUTEUR', mustChangePassword: false, monthlySalary: 3200, variableRate: 8, startDate: new Date('2025-09-01') },
  ]});
  console.log('4 users created.');

  // ─── ENTREPRISES (15) ───
  await prisma.entreprise.createMany({ data: [
    { id: E.SENEF, nom: 'SENEF', secteur: 'SaaS/Tech', siteWeb: 'https://senef.fr', taille: 'PME', localisation: 'Paris, France', createdById: MEROE_ID },
    { id: E.JOY, nom: 'Joy/Privateaser', secteur: 'Hospitality/Events', siteWeb: 'https://joy-privateaser.com', taille: 'PME', localisation: 'Paris, France', createdById: MEROE_ID },
    { id: E.TEMELION, nom: 'Temelion', secteur: 'AI/Deep Tech', siteWeb: 'https://temelion.ai', taille: 'STARTUP', localisation: 'Lyon, France', createdById: MEROE_ID },
    { id: E.LUXE, nom: 'Luxe Hospitality Group', secteur: 'Hospitality', siteWeb: 'https://luxehospitality.com', taille: 'GRAND_GROUPE', localisation: 'Dubai, UAE', createdById: MEROE_ID },
    { id: E.CLOUDSECURE, nom: 'CloudSecure', secteur: 'Cybersecurity SaaS', siteWeb: 'https://cloudsecure.io', taille: 'PME', localisation: 'Singapore', createdById: MEROE_ID },
    { id: E.GREENLOGISTICS, nom: 'GreenLogistics', secteur: 'Supply Chain', siteWeb: 'https://greenlogistics.eu', taille: 'ETI', localisation: 'Amsterdam, Netherlands', createdById: GUILLERMO_ID },
    { id: E.FINEDGE, nom: 'FinEdge Capital', secteur: 'Finance', siteWeb: 'https://finedgecapital.com', taille: 'PME', localisation: 'London, UK', createdById: MEROE_ID },
    { id: E.TECHVISION, nom: 'TechVision SAS', secteur: 'IT Services', siteWeb: 'https://techvision.fr', taille: 'ETI', localisation: 'Paris, France', createdById: GUILLERMO_ID },
    { id: E.REVOLUT, nom: 'Revolut', secteur: 'FinTech', siteWeb: 'https://revolut.com', taille: 'GRAND_GROUPE', localisation: 'London, UK', createdById: VALENTIN_ID },
    { id: E.MARRIOTT, nom: 'Marriott International', secteur: 'Hospitality', siteWeb: 'https://marriott.com', taille: 'GRAND_GROUPE', localisation: 'Dubai, UAE', createdById: VALENTIN_ID },
    { id: E.PALOALTO, nom: 'Palo Alto Networks', secteur: 'Cybersecurity', siteWeb: 'https://paloaltonetworks.com', taille: 'GRAND_GROUPE', localisation: 'Singapore', createdById: MEROE_ID },
    { id: E.N26, nom: 'N26', secteur: 'FinTech', siteWeb: 'https://n26.com', taille: 'ETI', localisation: 'Berlin, Germany', createdById: GUILLERMO_ID },
    { id: E.CONTENTSQUARE, nom: 'Contentsquare', secteur: 'SaaS/Analytics', siteWeb: 'https://contentsquare.com', taille: 'ETI', localisation: 'Paris, France', createdById: MEROE_ID },
    { id: E.HILTON, nom: 'Hilton', secteur: 'Hospitality', siteWeb: 'https://hilton.com', taille: 'GRAND_GROUPE', localisation: 'Dubai, UAE', createdById: VALENTIN_ID },
    { id: E.ORACLE, nom: 'Oracle', secteur: 'Tech', siteWeb: 'https://oracle.com', taille: 'GRAND_GROUPE', localisation: 'Madrid, Spain', createdById: MEROE_ID },
  ]});
  console.log('15 entreprises created.');

  // ─── CLIENTS (25) ───
  await prisma.client.createMany({ data: [
    { id: C.C1, nom: 'Al-Rashid', prenom: 'Fatima', email: 'fatima.alrashid@luxehospitality.com', telephone: '+971501234567', poste: 'Group HR Director', roleContact: 'DRH', entrepriseId: E.LUXE, statutClient: 'PROPOSITION_ENVOYEE', createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: C.C2, nom: 'Lim', prenom: 'Wei Lin', email: 'weilin@cloudsecure.io', telephone: '+6591234567', poste: 'CEO & Co-Founder', roleContact: 'CEO', entrepriseId: E.CLOUDSECURE, statutClient: 'LEAD', createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: C.C3, nom: 'Dubois', prenom: 'Francois', email: 'f.dubois@greenlogistics.eu', telephone: '+31612345678', poste: 'Procurement Director', roleContact: 'PROCUREMENT', entrepriseId: E.GREENLOGISTICS, statutClient: 'BESOIN_QUALIFIE', createdById: GUILLERMO_ID, assignedToId: GUILLERMO_ID },
    { id: C.C4, nom: 'Schmidt', prenom: 'Anna', email: 'a.schmidt@finedgecapital.com', telephone: '+447912345678', poste: 'Head of Talent', roleContact: 'DRH', entrepriseId: E.FINEDGE, statutClient: 'MANDAT_SIGNE', createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: C.C5, nom: 'Chen', prenom: 'David', email: 'd.chen@techvision.fr', telephone: '+33612345678', poste: 'DRH', roleContact: 'DRH', entrepriseId: E.TECHVISION, statutClient: 'MANDAT_SIGNE', createdById: GUILLERMO_ID, assignedToId: GUILLERMO_ID },
    { id: C.C6, nom: 'Moreau', prenom: 'Sophie', email: 's.moreau@techvision.fr', telephone: '+33623456789', poste: 'VP Sales', roleContact: 'HIRING_MANAGER', entrepriseId: E.TECHVISION, statutClient: 'MANDAT_SIGNE', createdById: GUILLERMO_ID, assignedToId: GUILLERMO_ID },
    { id: C.C7, nom: 'Tanaka', prenom: 'Kenji', email: 'k.tanaka@luxehospitality.com', telephone: '+971502345678', poste: 'CEO EMEA', roleContact: 'CEO', entrepriseId: E.LUXE, statutClient: 'PREMIER_CONTACT', createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: C.C8, nom: 'Williams', prenom: 'James', email: 'j.williams@finedgecapital.com', telephone: '+447923456789', poste: 'Managing Director', roleContact: 'CEO', entrepriseId: E.FINEDGE, statutClient: 'RECURRENT', createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: C.C9, nom: 'Patel', prenom: 'Raj', email: 'r.patel@cloudsecure.io', telephone: '+6592345678', poste: 'VP Sales APAC', roleContact: 'HIRING_MANAGER', entrepriseId: E.CLOUDSECURE, statutClient: 'PREMIER_CONTACT', createdById: VALENTIN_ID, assignedToId: VALENTIN_ID },
    { id: C.C10, nom: 'Weber', prenom: 'Klaus', email: 'k.weber@greenlogistics.eu', telephone: '+31623456789', poste: 'CRO', roleContact: 'HIRING_MANAGER', entrepriseId: E.GREENLOGISTICS, statutClient: 'BESOIN_QUALIFIE', createdById: GUILLERMO_ID, assignedToId: GUILLERMO_ID },
    { id: C.C11, nom: 'Mbaye', prenom: 'Aminata', email: 'a.mbaye@senef.fr', telephone: '+33634567890', poste: 'Head of Sales', roleContact: 'HIRING_MANAGER', entrepriseId: E.SENEF, statutClient: 'MANDAT_SIGNE', createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: C.C12, nom: 'Gilles', prenom: 'Sebastien', email: 's.gilles@temelion.ai', telephone: '+33645678901', poste: 'CEO', roleContact: 'CEO', entrepriseId: E.TEMELION, statutClient: 'MANDAT_SIGNE', createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: C.C13, nom: 'Leroy', prenom: 'Pierre', email: 'p.leroy@joy-privateaser.com', telephone: '+33656789012', poste: 'DRH', roleContact: 'DRH', entrepriseId: E.JOY, statutClient: 'MANDAT_SIGNE', createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: C.C14, nom: 'Johnson', prenom: 'Sarah', email: 's.johnson@revolut.com', telephone: '+447934567890', poste: 'Head of Sales Recruiting', roleContact: 'DRH', entrepriseId: E.REVOLUT, statutClient: 'MANDAT_SIGNE', createdById: VALENTIN_ID, assignedToId: VALENTIN_ID },
    { id: C.C15, nom: 'Ahmed', prenom: 'Omar', email: 'o.ahmed@marriott.com', telephone: '+971503456789', poste: 'VP Talent Acquisition EMEA', roleContact: 'DRH', entrepriseId: E.MARRIOTT, statutClient: 'LEAD', createdById: VALENTIN_ID, assignedToId: VALENTIN_ID },
    { id: C.C16, nom: 'Ng', prenom: 'Michael', email: 'm.ng@paloaltonetworks.com', telephone: '+6593456789', poste: 'Sales Director APAC', roleContact: 'HIRING_MANAGER', entrepriseId: E.PALOALTO, statutClient: 'PREMIER_CONTACT', createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: C.C17, nom: 'Mueller', prenom: 'Katrin', email: 'k.mueller@n26.com', telephone: '+491701234567', poste: 'VP People', roleContact: 'DRH', entrepriseId: E.N26, statutClient: 'MANDAT_SIGNE', createdById: GUILLERMO_ID, assignedToId: GUILLERMO_ID },
    { id: C.C18, nom: 'Berger', prenom: 'Antoine', email: 'a.berger@contentsquare.com', telephone: '+33667890123', poste: 'CRO', roleContact: 'HIRING_MANAGER', entrepriseId: E.CONTENTSQUARE, statutClient: 'BESOIN_QUALIFIE', createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: C.C19, nom: 'Al-Maktoum', prenom: 'Rashid', email: 'r.almaktoum@hilton.com', telephone: '+971504567890', poste: 'Regional HR Director ME', roleContact: 'DRH', entrepriseId: E.HILTON, statutClient: 'LEAD', createdById: VALENTIN_ID, assignedToId: VALENTIN_ID },
    { id: C.C20, nom: 'Garcia', prenom: 'Elena', email: 'e.garcia@oracle.com', telephone: '+34612345678', poste: 'Country Manager Spain', roleContact: 'HIRING_MANAGER', entrepriseId: E.ORACLE, statutClient: 'MANDAT_SIGNE', createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: C.C21, nom: 'Petit', prenom: 'Claire', email: 'c.petit@senef.fr', telephone: '+33678901234', poste: 'CEO', roleContact: 'CEO', entrepriseId: E.SENEF, statutClient: 'RECURRENT', createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: C.C22, nom: 'Brown', prenom: 'Thomas', email: 't.brown@revolut.com', telephone: '+447945678901', poste: 'VP Engineering', roleContact: 'HIRING_MANAGER', entrepriseId: E.REVOLUT, statutClient: 'PREMIER_CONTACT', createdById: VALENTIN_ID, assignedToId: VALENTIN_ID },
    { id: C.C23, nom: 'Nakamura', prenom: 'Yuki', email: 'y.nakamura@cloudsecure.io', telephone: '+6594567890', poste: 'Head of Marketing', roleContact: 'AUTRE', entrepriseId: E.CLOUDSECURE, statutClient: 'LEAD', createdById: MARIE_ID, assignedToId: MARIE_ID },
    { id: C.C24, nom: 'Martin', prenom: 'Julien', email: 'j.martin@contentsquare.com', telephone: '+33689012345', poste: 'VP Sales EMEA', roleContact: 'HIRING_MANAGER', entrepriseId: E.CONTENTSQUARE, statutClient: 'PREMIER_CONTACT', createdById: MARIE_ID, assignedToId: MARIE_ID },
    { id: C.C25, nom: 'O\'Brien', prenom: 'Patrick', email: 'p.obrien@finedgecapital.com', telephone: '+447956789012', poste: 'Head of Operations', roleContact: 'HIRING_MANAGER', entrepriseId: E.FINEDGE, statutClient: 'BESOIN_QUALIFIE', createdById: MARIE_ID, assignedToId: MARIE_ID },
  ]});
  console.log('25 clients created.');

  // ─── MANDATS (10) ───
  await prisma.mandat.createMany({ data: [
    { id: M.M1, titrePoste: 'Head of Sales', entrepriseId: E.SENEF, clientId: C.C11, feeMontantEstime: 25000, statut: 'EN_COURS', priorite: 'HAUTE', localisation: 'Paris, France', description: 'Recrutement Head of Sales pour piloter la strategie commerciale SaaS de SENEF. Profil senior 8-12 ans XP.', dateOuverture: daysAgo(21), assignedToId: MEROE_ID, createdById: MEROE_ID },
    { id: M.M2, titrePoste: 'Head of Account Management', entrepriseId: E.JOY, clientId: C.C13, feeMontantEstime: 20000, statut: 'EN_COURS', priorite: 'NORMALE', localisation: 'Paris, France', description: 'Head of AM pour Joy/Privateaser. Gestion portefeuille clients events et hospitality.', dateOuverture: daysAgo(14), assignedToId: MEROE_ID, createdById: MEROE_ID },
    { id: M.M3, titrePoste: 'Founding Account Executive', entrepriseId: E.TEMELION, clientId: C.C12, feeMontantEstime: 18000, statut: 'EN_COURS', priorite: 'HAUTE', localisation: 'Lyon, France', description: 'Premier commercial pour Temelion. Profil entrepreneurial, capable de structurer la fonction commerciale AI/Deep Tech.', dateOuverture: daysAgo(30), assignedToId: MEROE_ID, createdById: MEROE_ID },
    { id: M.M4, titrePoste: 'Business Dev Manager', entrepriseId: E.GREENLOGISTICS, clientId: C.C3, feeMontantEstime: 15000, statut: 'OUVERT', priorite: 'NORMALE', localisation: 'Amsterdam, Netherlands', description: 'BDM pour developper le marche BeNeLux et DACH. Supply chain / logistics.', dateOuverture: daysAgo(7), assignedToId: GUILLERMO_ID, createdById: GUILLERMO_ID },
    { id: M.M5, titrePoste: 'Director of Sales Luxury Hotels', entrepriseId: E.LUXE, clientId: C.C1, feeMontantEstime: 23000, statut: 'EN_COURS', priorite: 'HAUTE', localisation: 'Dubai, UAE', description: 'Director of Sales pour le segment luxury. Experience hospitality haut de gamme requise. Base Dubai.', dateOuverture: daysAgo(21), assignedToId: VALENTIN_ID, createdById: VALENTIN_ID },
    { id: M.M6, titrePoste: 'Enterprise Account Executive', entrepriseId: E.TECHVISION, clientId: C.C5, feeMontantEstime: 16000, statut: 'OUVERT', priorite: 'NORMALE', localisation: 'Paris, France', description: 'EAE pour vendre des services IT aux grands comptes francais. TechVision en forte croissance.', dateOuverture: daysAgo(5), assignedToId: GUILLERMO_ID, createdById: GUILLERMO_ID },
    { id: M.M7, titrePoste: 'VP Sales APAC', entrepriseId: E.CLOUDSECURE, clientId: C.C2, feeMontantEstime: 30000, statut: 'OUVERT', priorite: 'URGENTE', localisation: 'Singapore', description: 'VP Sales pour piloter la croissance APAC de CloudSecure. Cybersecurity SaaS, 80 employes.', dateOuverture: daysAgo(2), assignedToId: MEROE_ID, createdById: MEROE_ID },
    { id: M.M8, titrePoste: 'Senior Sales Manager', entrepriseId: E.REVOLUT, clientId: C.C14, feeMontantEstime: 22000, statut: 'EN_COURS', priorite: 'NORMALE', localisation: 'London, UK', description: 'Senior Sales Manager B2B pour Revolut Business. FinTech, marche UK/Europe.', dateOuverture: daysAgo(30), assignedToId: VALENTIN_ID, createdById: VALENTIN_ID },
    { id: M.M9, titrePoste: 'Head of Partnerships', entrepriseId: E.N26, clientId: C.C17, feeMontantEstime: 20000, statut: 'EN_COURS', priorite: 'NORMALE', localisation: 'Berlin, Germany', description: 'Head of Partnerships pour N26. Developpement partenariats strategiques B2B2C.', dateOuverture: daysAgo(10), assignedToId: GUILLERMO_ID, createdById: GUILLERMO_ID },
    { id: M.M10, titrePoste: 'Country Manager Iberia', entrepriseId: E.ORACLE, clientId: C.C20, feeMontantEstime: 28000, feeMontantFacture: 28000, feeStatut: 'PAYE', statut: 'GAGNE', priorite: 'NORMALE', localisation: 'Madrid, Spain', description: 'Country Manager Iberia pour Oracle. Mandat place avec succes.', dateOuverture: daysAgo(60), dateCloture: daysAgo(7), assignedToId: MEROE_ID, createdById: MEROE_ID },
  ]});
  console.log('10 mandats created.');

  // ─── CANDIDATS (30) ───
  await prisma.candidat.createMany({ data: [
    // Mandat 1 - Head of Sales SENEF (5 candidats)
    { id: CA.CA1, nom: 'Dubois', prenom: 'Pierre', email: 'pierre.dubois@notion.so', telephone: '+33612000001', posteActuel: 'Mid-Market AE', entrepriseActuelle: 'Notion', localisation: 'Paris', source: 'candidature', tags: ['saas','mid-market'], createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: CA.CA2, nom: 'Potin', prenom: 'Matthieu', email: 'matthieu.potin@gmail.com', telephone: '+33612000002', posteActuel: 'Regional Sales Director', entrepriseActuelle: 'Schneider Electric', localisation: 'Lyon', source: 'linkedin', tags: ['industrie','director'], createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: CA.CA3, nom: 'Legay', prenom: 'Romain', email: 'romain.legay@salesforce.com', telephone: '+33612000003', posteActuel: 'Sales Director', entrepriseActuelle: 'Salesforce', localisation: 'Paris', source: 'cooptation', tags: ['saas','enterprise'], createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: CA.CA4, nom: 'Benoit', prenom: 'Camille', email: 'camille.benoit@hubspot.com', telephone: '+33612000004', posteActuel: 'Head of Sales France', entrepriseActuelle: 'HubSpot', localisation: 'Paris', source: 'linkedin', tags: ['saas','head-of-sales'], createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: CA.CA5, nom: 'Ferreira', prenom: 'Lucas', email: 'lucas.ferreira@datadog.com', telephone: '+33612000005', posteActuel: 'Enterprise AE', entrepriseActuelle: 'Datadog', localisation: 'Paris', source: 'linkedin', tags: ['saas','enterprise'], createdById: MEROE_ID, assignedToId: MEROE_ID },
    // Mandat 2 - Head of AM Joy (3 candidats, dormant)
    { id: CA.CA6, nom: 'Lavagna', prenom: 'Juliette', email: 'juliette.lavagna@gmail.com', telephone: '+33612000006', posteActuel: 'Head of Sales', entrepriseActuelle: 'Swile', localisation: 'Paris', source: 'linkedin', tags: ['startup','head-of-sales'], createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: CA.CA7, nom: 'Roussel', prenom: 'Theo', email: 'theo.roussel@accor.com', telephone: '+33612000007', posteActuel: 'Key Account Manager', entrepriseActuelle: 'Accor', localisation: 'Paris', source: 'linkedin', tags: ['hospitality','KAM'], createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: CA.CA8, nom: 'Dupont', prenom: 'Marine', email: 'marine.dupont@eventbrite.com', telephone: '+33612000008', posteActuel: 'Account Director', entrepriseActuelle: 'Eventbrite', localisation: 'Paris', source: 'candidature', tags: ['events','account-mgmt'], createdById: MEROE_ID, assignedToId: MEROE_ID },
    // Mandat 3 - Founding AE Temelion (1 candidat en offre)
    { id: CA.CA9, nom: 'Spasic', prenom: 'Nicolas', email: 'nicolas.spasic@gmail.com', telephone: '+33612000009', posteActuel: 'Freelance Sales Consultant', entrepriseActuelle: 'Independant', localisation: 'Paris', source: 'cooptation', tags: ['startup','founding-ae','ai'], createdById: MEROE_ID, assignedToId: MEROE_ID },
    // Mandat 4 - BDM GreenLogistics (3 candidats)
    { id: CA.CA10, nom: 'Van der Berg', prenom: 'Pieter', email: 'pieter.vdb@dhl.com', telephone: '+31612000010', posteActuel: 'Business Dev Manager', entrepriseActuelle: 'DHL', localisation: 'Amsterdam', source: 'linkedin', tags: ['logistics','BDM'], createdById: GUILLERMO_ID, assignedToId: GUILLERMO_ID },
    { id: CA.CA11, nom: 'Richter', prenom: 'Hans', email: 'hans.richter@kuehne-nagel.com', telephone: '+49170000011', posteActuel: 'Sales Manager DACH', entrepriseActuelle: 'Kuehne+Nagel', localisation: 'Hamburg', source: 'linkedin', tags: ['logistics','DACH'], createdById: GUILLERMO_ID, assignedToId: GUILLERMO_ID },
    { id: CA.CA12, nom: 'De Vries', prenom: 'Lisa', email: 'lisa.devries@flexport.com', telephone: '+31612000012', posteActuel: 'Account Executive', entrepriseActuelle: 'Flexport', localisation: 'Amsterdam', source: 'linkedin', tags: ['supply-chain','AE'], createdById: GUILLERMO_ID, assignedToId: GUILLERMO_ID },
    // Mandat 5 - Director Sales Luxe Hospitality (3 candidats)
    { id: CA.CA13, nom: 'Al-Sayed', prenom: 'Hassan', email: 'hassan.alsayed@fourseasons.com', telephone: '+971501000013', posteActuel: 'Director of Sales', entrepriseActuelle: 'Four Seasons', localisation: 'Dubai', source: 'linkedin', tags: ['luxury','hospitality','director'], createdById: VALENTIN_ID, assignedToId: VALENTIN_ID },
    { id: CA.CA14, nom: 'Smith', prenom: 'Rebecca', email: 'rebecca.smith@ritzcarlton.com', telephone: '+971501000014', posteActuel: 'Regional Sales Manager', entrepriseActuelle: 'Ritz-Carlton', localisation: 'Dubai', source: 'linkedin', tags: ['luxury','hospitality'], createdById: VALENTIN_ID, assignedToId: VALENTIN_ID },
    { id: CA.CA15, nom: 'Khoury', prenom: 'Nadia', email: 'nadia.khoury@jumeirah.com', telephone: '+971501000015', posteActuel: 'Sales & Marketing Director', entrepriseActuelle: 'Jumeirah', localisation: 'Dubai', source: 'cooptation', tags: ['luxury','hospitality','marketing'], createdById: VALENTIN_ID, assignedToId: VALENTIN_ID },
    // Mandat 6 - EAE TechVision (2 candidats)
    { id: CA.CA16, nom: 'Lambert', prenom: 'Alexandre', email: 'alexandre.lambert@capgemini.com', telephone: '+33612000016', posteActuel: 'Senior Account Manager', entrepriseActuelle: 'Capgemini', localisation: 'Paris', source: 'linkedin', tags: ['IT-services','enterprise'], createdById: GUILLERMO_ID, assignedToId: GUILLERMO_ID },
    { id: CA.CA17, nom: 'Girard', prenom: 'Emilie', email: 'emilie.girard@atos.net', telephone: '+33612000017', posteActuel: 'Enterprise AE', entrepriseActuelle: 'Atos', localisation: 'Paris', source: 'candidature', tags: ['IT-services','AE'], createdById: GUILLERMO_ID, assignedToId: GUILLERMO_ID },
    // Mandat 7 - VP Sales CloudSecure (0 candidats, new)
    // Mandat 8 - Senior Sales Manager Revolut (3 candidats)
    { id: CA.CA18, nom: 'Wilson', prenom: 'Charlotte', email: 'charlotte.wilson@revolut.com', telephone: '+447912000018', posteActuel: 'Sales Ops Manager', entrepriseActuelle: 'Revolut', localisation: 'London', source: 'linkedin', tags: ['fintech','sales-ops'], createdById: VALENTIN_ID, assignedToId: VALENTIN_ID },
    { id: CA.CA19, nom: 'Davies', prenom: 'Oliver', email: 'oliver.davies@monzo.com', telephone: '+447912000019', posteActuel: 'Senior Sales Manager', entrepriseActuelle: 'Monzo', localisation: 'London', source: 'linkedin', tags: ['fintech','sales'], createdById: VALENTIN_ID, assignedToId: VALENTIN_ID },
    { id: CA.CA20, nom: 'Thompson', prenom: 'Emily', email: 'emily.thompson@wise.com', telephone: '+447912000020', posteActuel: 'B2B Sales Lead', entrepriseActuelle: 'Wise', localisation: 'London', source: 'candidature', tags: ['fintech','B2B'], createdById: VALENTIN_ID, assignedToId: VALENTIN_ID },
    // Mandat 9 - Head of Partnerships N26 (2 candidats)
    { id: CA.CA21, nom: 'Schneider', prenom: 'Felix', email: 'felix.schneider@klarna.com', telephone: '+491700000021', posteActuel: 'Partnership Manager', entrepriseActuelle: 'Klarna', localisation: 'Berlin', source: 'linkedin', tags: ['fintech','partnerships'], createdById: GUILLERMO_ID, assignedToId: GUILLERMO_ID },
    { id: CA.CA22, nom: 'Bauer', prenom: 'Lena', email: 'lena.bauer@traderepublic.com', telephone: '+491700000022', posteActuel: 'Head of BD', entrepriseActuelle: 'Trade Republic', localisation: 'Berlin', source: 'linkedin', tags: ['fintech','BD'], createdById: GUILLERMO_ID, assignedToId: GUILLERMO_ID },
    // Mandat 10 - Country Manager Oracle (1 place)
    { id: CA.CA23, nom: 'Garcia', prenom: 'Carlos', email: 'carlos.garcia@oracle.com', telephone: '+34612000023', posteActuel: 'Sales Manager Iberia', entrepriseActuelle: 'Oracle', localisation: 'Madrid', source: 'linkedin', tags: ['tech','country-manager'], createdById: MEROE_ID, assignedToId: MEROE_ID },
    // Vivier (7 candidats sans mandat)
    { id: CA.CA24, nom: 'Tan', prenom: 'Marcus', email: 'marcus.tan@paloaltonetworks.com', telephone: '+6591000024', posteActuel: 'Enterprise AE', entrepriseActuelle: 'Palo Alto Networks', localisation: 'Singapore', source: 'linkedin', tags: ['cybersecurity','APAC'], createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: CA.CA25, nom: 'Park', prenom: 'Soo-Jin', email: 'soojin.park@aws.com', telephone: '+6591000025', posteActuel: 'Senior Account Manager', entrepriseActuelle: 'AWS', localisation: 'Singapore', source: 'linkedin', tags: ['cloud','APAC'], createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: CA.CA26, nom: 'Roux', prenom: 'Manon', email: 'manon.roux@doctolib.fr', telephone: '+33612000026', posteActuel: 'Sales Team Lead', entrepriseActuelle: 'Doctolib', localisation: 'Paris', source: 'cooptation', tags: ['saas','team-lead'], createdById: MARIE_ID, assignedToId: MARIE_ID },
    { id: CA.CA27, nom: 'Kowalski', prenom: 'Adam', email: 'adam.kowalski@spotify.com', telephone: '+46701000027', posteActuel: 'Head of Ad Sales', entrepriseActuelle: 'Spotify', localisation: 'Stockholm', source: 'linkedin', tags: ['tech','ad-sales'], createdById: MARIE_ID, assignedToId: MARIE_ID },
    { id: CA.CA28, nom: 'Ibrahim', prenom: 'Layla', email: 'layla.ibrahim@emirates.com', telephone: '+971501000028', posteActuel: 'Commercial Director', entrepriseActuelle: 'Emirates', localisation: 'Dubai', source: 'linkedin', tags: ['hospitality','director'], createdById: VALENTIN_ID, assignedToId: VALENTIN_ID },
    { id: CA.CA29, nom: 'Lemoine', prenom: 'Baptiste', email: 'baptiste.lemoine@algolia.com', telephone: '+33612000029', posteActuel: 'Mid-Market AE', entrepriseActuelle: 'Algolia', localisation: 'Paris', source: 'linkedin', tags: ['saas','mid-market'], createdById: MEROE_ID, assignedToId: MEROE_ID },
    { id: CA.CA30, nom: 'Chen', prenom: 'Mei', email: 'mei.chen@grab.com', telephone: '+6591000030', posteActuel: 'Country Sales Manager', entrepriseActuelle: 'Grab', localisation: 'Singapore', source: 'linkedin', tags: ['tech','APAC','country-manager'], createdById: MEROE_ID, assignedToId: MEROE_ID },
  ]});
  console.log('30 candidats created.');

  // ─── CANDIDATURES (link candidats to mandats) ───
  await prisma.candidature.createMany({ data: [
    // M1 - Head of Sales SENEF: 5 candidats
    { mandatId: M.M1, candidatId: CA.CA1, stage: 'ENTRETIEN_CLIENT', createdById: MEROE_ID, dateEntretienClient: daysAgo(3) },
    { mandatId: M.M1, candidatId: CA.CA2, stage: 'ENTRETIEN_CLIENT', createdById: MEROE_ID, dateEntretienClient: daysAgo(5) },
    { mandatId: M.M1, candidatId: CA.CA3, stage: 'ENTRETIEN_1', createdById: MEROE_ID },
    { mandatId: M.M1, candidatId: CA.CA4, stage: 'REFUSE', createdById: MEROE_ID, motifRefus: 'SALAIRE' },
    { mandatId: M.M1, candidatId: CA.CA5, stage: 'REFUSE', createdById: MEROE_ID, motifRefus: 'CANDIDAT_DECLINE' },
    // M2 - Head of AM Joy: 3 candidats (sourcing, dormant)
    { mandatId: M.M2, candidatId: CA.CA6, stage: 'SOURCING', createdById: MEROE_ID },
    { mandatId: M.M2, candidatId: CA.CA7, stage: 'SOURCING', createdById: MEROE_ID },
    { mandatId: M.M2, candidatId: CA.CA8, stage: 'SOURCING', createdById: MEROE_ID },
    // M3 - Founding AE Temelion: 1 en offre
    { mandatId: M.M3, candidatId: CA.CA9, stage: 'OFFRE', createdById: MEROE_ID },
    // M4 - BDM GreenLogistics: 3
    { mandatId: M.M4, candidatId: CA.CA10, stage: 'CONTACTE', createdById: GUILLERMO_ID },
    { mandatId: M.M4, candidatId: CA.CA11, stage: 'CONTACTE', createdById: GUILLERMO_ID },
    { mandatId: M.M4, candidatId: CA.CA12, stage: 'ENTRETIEN_1', createdById: GUILLERMO_ID },
    // M5 - Dir Sales Luxe: 3
    { mandatId: M.M5, candidatId: CA.CA13, stage: 'ENTRETIEN_CLIENT', createdById: VALENTIN_ID, dateEntretienClient: daysAgo(2) },
    { mandatId: M.M5, candidatId: CA.CA14, stage: 'ENTRETIEN_1', createdById: VALENTIN_ID },
    { mandatId: M.M5, candidatId: CA.CA15, stage: 'CONTACTE', createdById: VALENTIN_ID },
    // M6 - EAE TechVision: 2
    { mandatId: M.M6, candidatId: CA.CA16, stage: 'CONTACTE', createdById: GUILLERMO_ID },
    { mandatId: M.M6, candidatId: CA.CA17, stage: 'SOURCING', createdById: GUILLERMO_ID },
    // M8 - Senior Sales Revolut: 3
    { mandatId: M.M8, candidatId: CA.CA18, stage: 'ENTRETIEN_1', createdById: VALENTIN_ID },
    { mandatId: M.M8, candidatId: CA.CA19, stage: 'ENTRETIEN_CLIENT', createdById: VALENTIN_ID, dateEntretienClient: daysAgo(4) },
    { mandatId: M.M8, candidatId: CA.CA20, stage: 'CONTACTE', createdById: VALENTIN_ID },
    // M9 - Head of Partnerships N26: 2
    { mandatId: M.M9, candidatId: CA.CA21, stage: 'SOURCING', createdById: GUILLERMO_ID },
    { mandatId: M.M9, candidatId: CA.CA22, stage: 'SOURCING', createdById: GUILLERMO_ID },
    // M10 - Country Manager Oracle: 1 place
    { mandatId: M.M10, candidatId: CA.CA23, stage: 'PLACE', createdById: MEROE_ID },
  ]});
  console.log('23 candidatures created.');

  // ─── ACTIVITES (55+) ───
  const acts = [];
  const actId = () => randomUUID();

  // --- 15 Appels ---
  acts.push(
    { id: actId(), type: 'APPEL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: CA.CA1, userId: MEROE_ID, titre: 'Appel decouverte Pierre Dubois', contenu: 'Echange de 20 minutes avec Pierre Dubois, actuellement Mid-Market Account Executive chez Notion. Pierre est tres interesse par le poste Head of Sales chez SENEF. Il connait bien le marche SaaS B2B en France et a deja manage une equipe de 5 commerciaux chez Notion. Son salaire actuel est de 85k euros fixe plus 15k variable, et il souhaite obtenir entre 95 et 100k euros fixe pour ce nouveau poste. Sa disponibilite est de 2 mois car il a un preavis de 3 mois mais peut negocier une sortie anticipee. Il est motive par le challenge de structurer une equipe commerciale dans un environnement SaaS en croissance. Il a mentionne qu\'il est egalement en discussion avec Contentsquare pour un poste similaire mais que SENEF l\'interesse davantage en raison de la taille de l\'entreprise et de l\'autonomie offerte. Action: envoyer la fiche de poste complete et organiser un entretien avec Mme Mbaye.', metadata: JSON.stringify({duration:1200}), source: 'ALLO', createdAt: daysAgo(5) },
    { id: actId(), type: 'APPEL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: CA.CA2, userId: MEROE_ID, titre: 'Appel qualification Matthieu Potin', contenu: 'Matthieu a 12 ans XP en industrie, cherche a pivoter vers le SaaS. Motivation forte. Entretien client planifie.', metadata: JSON.stringify({duration:900}), source: 'ALLO', createdAt: daysAgo(7) },
    { id: actId(), type: 'APPEL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: CA.CA9, userId: MEROE_ID, titre: 'Appel offre Nicolas Spasic', contenu: 'Discussion sur l\'offre Temelion. Nicolas veut 70k fixe + 30k variable. Temelion propose 65k + 25k + BSPCE. Negociation en cours.', metadata: JSON.stringify({duration:1800}), source: 'ALLO', createdAt: daysAgo(2) },
    { id: actId(), type: 'APPEL', direction: 'SORTANT', entiteType: 'CLIENT', entiteId: C.C11, userId: MEROE_ID, titre: 'Point hebdo Mme Mbaye - SENEF', contenu: 'Point sur les candidats presentes. Mme Mbaye veut voir Pierre Dubois et Matthieu Potin en entretien. Romain Legay a retenir en backup.', metadata: JSON.stringify({duration:900}), source: 'ALLO', createdAt: daysAgo(1) },
    { id: actId(), type: 'APPEL', direction: 'ENTRANT', entiteType: 'CLIENT', entiteId: C.C12, userId: MEROE_ID, titre: 'Appel Sebastien Gilles - Temelion', contenu: 'Sebastien appelle pour discuter de l\'offre a Nicolas. OK pour monter a 68k fixe. Veut closer cette semaine.', metadata: JSON.stringify({duration:600}), source: 'ALLO', createdAt: daysAgo(2) },
    { id: actId(), type: 'APPEL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: CA.CA13, userId: VALENTIN_ID, titre: 'Appel Hassan Al-Sayed - Luxe Hospitality', contenu: 'Hassan interesse par le poste Director of Sales. 15 ans XP luxury hospitality. Entretien avec Fatima Al-Rashid planifie.', metadata: JSON.stringify({duration:1500}), source: 'ALLO', createdAt: daysAgo(3) },
    { id: actId(), type: 'APPEL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: CA.CA10, userId: GUILLERMO_ID, titre: 'Appel Pieter Van der Berg - GreenLogistics', contenu: 'Pieter est chez DHL depuis 5 ans. Interesse par un role plus entrepreneurial. A envoyer la JD GreenLogistics.', metadata: JSON.stringify({duration:1200}), source: 'ALLO', createdAt: daysAgo(3) },
    { id: actId(), type: 'APPEL', direction: 'SORTANT', entiteType: 'CLIENT', entiteId: C.C1, userId: VALENTIN_ID, titre: 'Appel Fatima Al-Rashid - Luxe Hospitality', contenu: 'Fatima veut un profil avec experience pre-opening. Budget 180-220k AED package. Entretien Hassan la semaine prochaine.', metadata: JSON.stringify({duration:900}), source: 'ALLO', createdAt: daysAgo(4) },
    { id: actId(), type: 'APPEL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: CA.CA19, userId: VALENTIN_ID, titre: 'Appel Oliver Davies - Revolut', contenu: 'Oliver est Senior Sales Manager chez Monzo. Tres interesse par Revolut Business. Entretien client avec Sarah Johnson organise.', metadata: JSON.stringify({duration:1200}), source: 'ALLO', createdAt: daysAgo(4) },
    { id: actId(), type: 'APPEL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: CA.CA21, userId: GUILLERMO_ID, titre: 'Appel Felix Schneider - N26', contenu: 'Felix est Partnership Manager chez Klarna. Interesse par Head of Partnerships N26 mais veut en savoir plus sur la strategie.', metadata: JSON.stringify({duration:900}), source: 'ALLO', createdAt: daysAgo(6) },
    { id: actId(), type: 'APPEL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: CA.CA24, userId: MEROE_ID, titre: 'Appel Marcus Tan - vivier APAC', contenu: 'Marcus est Enterprise AE chez Palo Alto Networks Singapore. Potentiel pour le mandat VP Sales CloudSecure. A recontacter quand le mandat avance.', metadata: JSON.stringify({duration:600}), source: 'ALLO', createdAt: daysAgo(1) },
    { id: actId(), type: 'APPEL', direction: 'SORTANT', entiteType: 'CLIENT', entiteId: C.C2, userId: MEROE_ID, titre: 'Appel Wei Lin Lim - CloudSecure', contenu: 'Brief sur le poste VP Sales APAC. Budget 250-300k SGD total package. Recherche profil cybersecurity ou enterprise SaaS.', metadata: JSON.stringify({duration:1800}), source: 'ALLO', createdAt: daysAgo(2) },
    { id: actId(), type: 'APPEL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: CA.CA16, userId: GUILLERMO_ID, titre: 'Appel Alexandre Lambert - TechVision', contenu: 'Alexandre est chez Capgemini. Interesse par un role plus commercial pur chez TechVision. Bon profil grands comptes.', metadata: JSON.stringify({duration:900}), source: 'ALLO', createdAt: daysAgo(1) },
    { id: actId(), type: 'APPEL', direction: 'ENTRANT', entiteType: 'CLIENT', entiteId: C.C14, userId: VALENTIN_ID, titre: 'Appel Sarah Johnson - Revolut feedback', contenu: 'Sarah veut voir Oliver Davies en entretien final la semaine prochaine. Impressionnee par son profil Monzo.', metadata: JSON.stringify({duration:600}), source: 'ALLO', createdAt: daysAgo(3) },
    { id: actId(), type: 'APPEL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: CA.CA26, userId: MARIE_ID, titre: 'Appel Manon Roux - vivier', contenu: 'Manon est Sales Team Lead chez Doctolib. Pas en recherche active mais ouverte a des opportunites Head of Sales SaaS.', metadata: JSON.stringify({duration:900}), source: 'ALLO', createdAt: daysAgo(8) },
  );

  // --- 12 Emails ---
  acts.push(
    { id: actId(), type: 'EMAIL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: CA.CA1, userId: MEROE_ID, titre: 'Envoi fiche de poste Head of Sales SENEF', contenu: 'Envoi de la JD complete + presentation SENEF a Pierre Dubois.', source: 'GMAIL', createdAt: daysAgo(4) },
    { id: actId(), type: 'EMAIL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: CA.CA9, userId: MEROE_ID, titre: 'Envoi proposition offre Temelion', contenu: 'Email avec les details de l\'offre Temelion a Nicolas Spasic. 68k fixe + 25k variable + 0.5% BSPCE.', source: 'GMAIL', createdAt: daysAgo(1) },
    { id: actId(), type: 'EMAIL', direction: 'ENTRANT', entiteType: 'CANDIDAT', entiteId: CA.CA4, userId: MEROE_ID, titre: 'Refus Camille Benoit - SENEF', contenu: 'Camille decline le process SENEF. Salaire trop bas par rapport a HubSpot. Souhaite rester en contact pour d\'autres opportunites.', source: 'GMAIL', createdAt: daysAgo(10) },
    { id: actId(), type: 'EMAIL', direction: 'SORTANT', entiteType: 'CLIENT', entiteId: C.C3, userId: GUILLERMO_ID, titre: 'Presentation profils BDM GreenLogistics', contenu: 'Email de presentation de 3 profils a Francois Dubois pour le poste BDM. Pieter, Hans et Lisa.', source: 'GMAIL', createdAt: daysAgo(3) },
    { id: actId(), type: 'EMAIL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: CA.CA6, userId: MEROE_ID, titre: 'Approche LinkedIn Juliette Lavagna', contenu: 'Message LinkedIn transforme en email. Presentation du poste Head of AM Joy/Privateaser.', source: 'GMAIL', createdAt: daysAgo(12) },
    { id: actId(), type: 'EMAIL', direction: 'ENTRANT', entiteType: 'CLIENT', entiteId: C.C20, userId: MEROE_ID, titre: 'Confirmation placement Oracle - Elena Garcia', contenu: 'Elena confirme que Carlos Garcia a signe son contrat Country Manager Iberia. Debut le 1er avril.', source: 'GMAIL', createdAt: daysAgo(7) },
    { id: actId(), type: 'EMAIL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: CA.CA18, userId: VALENTIN_ID, titre: 'Presentation poste Revolut a Charlotte Wilson', contenu: 'Email d\'approche pour le poste Senior Sales Manager Revolut Business.', source: 'GMAIL', createdAt: daysAgo(15) },
    { id: actId(), type: 'EMAIL', direction: 'SORTANT', entiteType: 'CLIENT', entiteId: C.C17, userId: GUILLERMO_ID, titre: 'Proposition commerciale N26', contenu: 'Envoi de la proposition de collaboration pour le poste Head of Partnerships. Fee 20% sur package annuel.', source: 'GMAIL', createdAt: daysAgo(10) },
    { id: actId(), type: 'EMAIL', direction: 'ENTRANT', entiteType: 'CANDIDAT', entiteId: CA.CA5, userId: MEROE_ID, titre: 'Lucas Ferreira decline - SENEF', contenu: 'Lucas a recu une promotion interne chez Datadog. Decline le process.', source: 'GMAIL', createdAt: daysAgo(8) },
    { id: actId(), type: 'EMAIL', direction: 'SORTANT', entiteType: 'CLIENT', entiteId: C.C7, userId: MEROE_ID, titre: 'Intro email Kenji Tanaka - Luxe Hospitality', contenu: 'Email de prise de contact avec le CEO EMEA de Luxe Hospitality Group.', source: 'GMAIL', createdAt: daysAgo(6) },
    { id: actId(), type: 'EMAIL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: CA.CA27, userId: MARIE_ID, titre: 'Approche Adam Kowalski - Spotify', contenu: 'Email d\'approche pour Adam. Presentation des opportunites Head of Sales dans le portfolio HumanUp.', source: 'GMAIL', createdAt: daysAgo(5) },
    { id: actId(), type: 'EMAIL', direction: 'ENTRANT', entiteType: 'CANDIDAT', entiteId: CA.CA23, userId: MEROE_ID, titre: 'Carlos Garcia - docs signing Oracle', contenu: 'Carlos envoie ses documents signes pour le contrat Oracle Country Manager Iberia.', source: 'GMAIL', createdAt: daysAgo(8) },
  );

  // --- 10 Meetings ---
  acts.push(
    { id: actId(), type: 'MEETING', entiteType: 'CANDIDAT', entiteId: CA.CA1, userId: MEROE_ID, titre: 'Entretien client Pierre Dubois x SENEF', contenu: 'Entretien entre Pierre Dubois et Mme Mbaye (SENEF). 45min. Pierre a bien presente son parcours SaaS.', source: 'CALENDAR', metadata: JSON.stringify({calendarEventId:'evt_001'}), createdAt: daysAgo(3) },
    { id: actId(), type: 'MEETING', entiteType: 'CANDIDAT', entiteId: CA.CA2, userId: MEROE_ID, titre: 'Entretien client Matthieu Potin x SENEF', contenu: 'Entretien Matthieu avec Mme Mbaye. Bon feeling mais questions sur le pivot industrie vers SaaS.', source: 'CALENDAR', metadata: JSON.stringify({calendarEventId:'evt_002'}), createdAt: daysAgo(5) },
    { id: actId(), type: 'MEETING', entiteType: 'CANDIDAT', entiteId: CA.CA13, userId: VALENTIN_ID, titre: 'Entretien client Hassan x Luxe Hospitality', contenu: 'Entretien Hassan Al-Sayed avec Fatima Al-Rashid. Excellent entretien. Experience Four Seasons tres valorisee.', source: 'CALENDAR', metadata: JSON.stringify({calendarEventId:'evt_003'}), createdAt: daysAgo(2) },
    { id: actId(), type: 'MEETING', entiteType: 'CANDIDAT', entiteId: CA.CA19, userId: VALENTIN_ID, titre: 'Entretien client Oliver Davies x Revolut', contenu: 'Entretien Oliver avec Sarah Johnson. Revolut impressionne par son track record Monzo.', source: 'CALENDAR', metadata: JSON.stringify({calendarEventId:'evt_004'}), createdAt: daysAgo(4) },
    { id: actId(), type: 'MEETING', entiteType: 'CLIENT', entiteId: C.C11, userId: MEROE_ID, titre: 'RDV commercial SENEF - point mandats', contenu: 'Meeting avec Claire Petit (CEO SENEF) et Mme Mbaye. Discussion sur le pipeline et potentiel 2eme mandat.', source: 'CALENDAR', metadata: JSON.stringify({calendarEventId:'evt_005'}), createdAt: daysAgo(10) },
    { id: actId(), type: 'MEETING', entiteType: 'CLIENT', entiteId: C.C2, userId: MEROE_ID, titre: 'RDV commercial CloudSecure - brief VP Sales', contenu: 'Meeting de brief avec Wei Lin Lim pour le poste VP Sales APAC. Definition du profil ideal.', source: 'CALENDAR', metadata: JSON.stringify({calendarEventId:'evt_006'}), createdAt: daysAgo(2) },
    { id: actId(), type: 'MEETING', entiteType: 'CLIENT', entiteId: C.C1, userId: VALENTIN_ID, titre: 'RDV commercial Luxe Hospitality - Fatima', contenu: 'Presentation de 3 profils pour le poste Director of Sales. Fatima valide Hassan pour un entretien final.', source: 'CALENDAR', metadata: JSON.stringify({calendarEventId:'evt_007'}), createdAt: daysAgo(6) },
    { id: actId(), type: 'MEETING', entiteType: 'MANDAT', entiteId: M.M3, userId: MEROE_ID, titre: 'Point offre Temelion - Sebastien Gilles', contenu: 'Discussion finale sur les conditions d\'embauche de Nicolas Spasic. BSPCE et package valides.', source: 'CALENDAR', metadata: JSON.stringify({calendarEventId:'evt_008'}), createdAt: daysAgo(3) },
    { id: actId(), type: 'MEETING', entiteType: 'ENTREPRISE', entiteId: E.CONTENTSQUARE, userId: MEROE_ID, titre: 'Meeting prospection Contentsquare', contenu: 'Rencontre avec Antoine Berger, CRO Contentsquare. Discussion sur les besoins recrutement sales EMEA.', source: 'CALENDAR', metadata: JSON.stringify({calendarEventId:'evt_009'}), createdAt: daysAgo(9) },
    { id: actId(), type: 'MEETING', entiteType: 'ENTREPRISE', entiteId: E.MARRIOTT, userId: VALENTIN_ID, titre: 'Meeting intro Marriott Dubai', contenu: 'Premier contact avec Omar Ahmed, VP TA EMEA chez Marriott. Potentiel pour mandats hospitality Dubai.', source: 'CALENDAR', metadata: JSON.stringify({calendarEventId:'evt_010'}), createdAt: daysAgo(12) },
  );

  // --- 5 Notes ---
  acts.push(
    { id: actId(), type: 'NOTE', entiteType: 'CANDIDAT', entiteId: CA.CA9, userId: MEROE_ID, titre: 'Note nego Nicolas Spasic', contenu: 'Nicolas hesite entre notre offre et une opportunite chez Mistral AI. Point fort Temelion: BSPCE + role founding. A closer rapidement.', source: 'MANUEL', createdAt: daysAgo(1) },
    { id: actId(), type: 'NOTE', entiteType: 'MANDAT', entiteId: M.M2, userId: MEROE_ID, titre: 'Mandat dormant Joy/Privateaser', contenu: 'Pas d\'activite depuis 12 jours sur le mandat Head of AM. Pierre Leroy ne repond plus. Relancer ou proposer un point.', source: 'MANUEL', createdAt: daysAgo(1) },
    { id: actId(), type: 'NOTE', entiteType: 'CLIENT', entiteId: C.C8, userId: MEROE_ID, titre: 'Note relation James Williams - FinEdge', contenu: 'James est un client recurrent. 3 placements en 2 ans. Potentiel pour un nouveau mandat Senior Quant Trader Q2.', source: 'MANUEL', createdAt: daysAgo(4) },
    { id: actId(), type: 'NOTE', entiteType: 'CANDIDAT', entiteId: CA.CA23, userId: MEROE_ID, titre: 'Placement confirme Carlos Garcia', contenu: 'Carlos a signe. Fee 28k EUR facture et paye par Oracle. Excellent placement, 60 jours du mandat au closing.', source: 'MANUEL', createdAt: daysAgo(7) },
    { id: actId(), type: 'NOTE', entiteType: 'ENTREPRISE', entiteId: E.REVOLUT, userId: VALENTIN_ID, titre: 'Intelligence marche Revolut', contenu: 'Revolut vient de lever 1Md en Serie E. Forte croissance B2B. Potentiel pour 2-3 mandats sales en 2026.', source: 'MANUEL', createdAt: daysAgo(15) },
  );

  // --- 5 Changements de statut ---
  acts.push(
    { id: actId(), type: 'NOTE', entiteType: 'CANDIDAT', entiteId: CA.CA23, userId: MEROE_ID, titre: 'Statut: PLACE', contenu: 'Carlos Garcia place comme Country Manager Iberia chez Oracle.', source: 'SYSTEME', createdAt: daysAgo(7) },
    { id: actId(), type: 'NOTE', entiteType: 'CANDIDAT', entiteId: CA.CA4, userId: MEROE_ID, titre: 'Statut: REFUSE', contenu: 'Camille Benoit decline le process SENEF - salaire.', source: 'SYSTEME', createdAt: daysAgo(10) },
    { id: actId(), type: 'NOTE', entiteType: 'CANDIDAT', entiteId: CA.CA5, userId: MEROE_ID, titre: 'Statut: REFUSE', contenu: 'Lucas Ferreira decline - promotion interne Datadog.', source: 'SYSTEME', createdAt: daysAgo(8) },
    { id: actId(), type: 'NOTE', entiteType: 'CANDIDAT', entiteId: CA.CA9, userId: MEROE_ID, titre: 'Statut: OFFRE', contenu: 'Nicolas Spasic passe en etape Offre pour le mandat Temelion.', source: 'SYSTEME', createdAt: daysAgo(3) },
    { id: actId(), type: 'NOTE', entiteType: 'MANDAT', entiteId: M.M10, userId: MEROE_ID, titre: 'Mandat cloture - Oracle', contenu: 'Mandat Country Manager Iberia cloture avec succes. Fee 28k EUR.', source: 'SYSTEME', createdAt: daysAgo(7) },
  );

  // --- 3 Documents (CV uploads) ---
  acts.push(
    { id: actId(), type: 'NOTE', entiteType: 'CANDIDAT', entiteId: CA.CA1, userId: MEROE_ID, titre: 'CV uploade - Pierre Dubois', contenu: 'CV Pierre Dubois Mid-Market AE Notion uploade.', source: 'MANUEL', createdAt: daysAgo(6) },
    { id: actId(), type: 'NOTE', entiteType: 'CANDIDAT', entiteId: CA.CA9, userId: MEROE_ID, titre: 'CV uploade - Nicolas Spasic', contenu: 'CV Nicolas Spasic Founding AE uploade.', source: 'MANUEL', createdAt: daysAgo(25) },
    { id: actId(), type: 'NOTE', entiteType: 'CANDIDAT', entiteId: CA.CA13, userId: VALENTIN_ID, titre: 'CV uploade - Hassan Al-Sayed', contenu: 'CV Hassan Al-Sayed Director of Sales Four Seasons uploade.', source: 'MANUEL', createdAt: daysAgo(10) },
  );

  // --- 15 Taches (stored as Activites with isTache=true) ---
  // 5 today (2 haute, 2 moyenne, 1 basse)
  const today = new Date(); today.setHours(18,0,0,0);
  const todayMorning = new Date(); todayMorning.setHours(10,0,0,0);
  acts.push(
    { id: actId(), type: 'TACHE', entiteType: 'CANDIDAT', entiteId: CA.CA9, userId: MEROE_ID, titre: 'Closer offre Nicolas Spasic - Temelion', contenu: 'Appeler Nicolas pour finaliser l\'offre. Deadline: ce soir.', isTache: true, tacheDueDate: today, metadata: JSON.stringify({priorite:'HAUTE'}), source: 'MANUEL', createdAt: daysAgo(1) },
    { id: actId(), type: 'TACHE', entiteType: 'CLIENT', entiteId: C.C2, userId: MEROE_ID, titre: 'Envoyer shortlist VP Sales APAC a CloudSecure', contenu: 'Compiler et envoyer les 3-5 meilleurs profils identifies pour le poste VP Sales APAC.', isTache: true, tacheDueDate: today, metadata: JSON.stringify({priorite:'HAUTE'}), source: 'MANUEL', createdAt: daysAgo(1) },
    { id: actId(), type: 'TACHE', entiteType: 'CANDIDAT', entiteId: CA.CA3, userId: MEROE_ID, titre: 'Preparer entretien Romain Legay - SENEF', contenu: 'Briefer Romain sur le process SENEF et preparer les questions.', isTache: true, tacheDueDate: today, metadata: JSON.stringify({priorite:'NORMALE'}), source: 'MANUEL', createdAt: daysAgo(2) },
    { id: actId(), type: 'TACHE', entiteType: 'MANDAT', entiteId: M.M4, userId: GUILLERMO_ID, titre: 'Envoyer JD BDM a Pieter Van der Berg', contenu: 'Envoyer la fiche de poste GreenLogistics a Pieter.', isTache: true, tacheDueDate: today, metadata: JSON.stringify({priorite:'NORMALE'}), source: 'MANUEL', createdAt: daysAgo(1) },
    { id: actId(), type: 'TACHE', entiteType: 'ENTREPRISE', entiteId: E.CONTENTSQUARE, userId: MEROE_ID, titre: 'Rechercher profils sales EMEA Contentsquare', contenu: 'Suite au meeting avec Antoine Berger, identifier des profils potentiels.', isTache: true, tacheDueDate: today, metadata: JSON.stringify({priorite:'BASSE'}), source: 'MANUEL', createdAt: daysAgo(3) },
  );
  // 3 en retard
  acts.push(
    { id: actId(), type: 'TACHE', entiteType: 'CLIENT', entiteId: C.C13, userId: MEROE_ID, titre: 'Relancer Pierre Leroy - Joy/Privateaser', contenu: 'Le mandat Head of AM est dormant depuis 12j. Relancer Pierre pour un point.', isTache: true, tacheDueDate: daysAgo(2), metadata: JSON.stringify({priorite:'HAUTE'}), source: 'MANUEL', createdAt: daysAgo(5) },
    { id: actId(), type: 'TACHE', entiteType: 'CANDIDAT', entiteId: CA.CA14, userId: VALENTIN_ID, titre: 'Debrief Rebecca Smith post-entretien', contenu: 'Appeler Rebecca pour debrief apres son entretien Luxe Hospitality.', isTache: true, tacheDueDate: daysAgo(1), metadata: JSON.stringify({priorite:'NORMALE'}), source: 'MANUEL', createdAt: daysAgo(4) },
    { id: actId(), type: 'TACHE', entiteType: 'MANDAT', entiteId: M.M9, userId: GUILLERMO_ID, titre: 'Sourcer 5 profils Head of Partnerships N26', contenu: 'Le sourcing est en retard. Trouver 5 profils sur LinkedIn.', isTache: true, tacheDueDate: daysAgo(3), metadata: JSON.stringify({priorite:'HAUTE'}), source: 'MANUEL', createdAt: daysAgo(7) },
  );
  // 4 cette semaine
  const inTwoDays = new Date(Date.now() + 2*86400000);
  const inThreeDays = new Date(Date.now() + 3*86400000);
  const inFourDays = new Date(Date.now() + 4*86400000);
  acts.push(
    { id: actId(), type: 'TACHE', entiteType: 'CLIENT', entiteId: C.C4, userId: MEROE_ID, titre: 'Preparer proposal FinEdge Capital - nouveau mandat', contenu: 'Anna Schmidt mentionne un besoin Senior Quant. Preparer une proposition.', isTache: true, tacheDueDate: inTwoDays, metadata: JSON.stringify({priorite:'NORMALE'}), source: 'MANUEL', createdAt: daysAgo(1) },
    { id: actId(), type: 'TACHE', entiteType: 'CANDIDAT', entiteId: CA.CA15, userId: VALENTIN_ID, titre: 'Appeler Nadia Khoury - Luxe Hospitality', contenu: 'Premier appel pour qualifier Nadia pour le poste Director of Sales.', isTache: true, tacheDueDate: inTwoDays, metadata: JSON.stringify({priorite:'NORMALE'}), source: 'MANUEL', createdAt: daysAgo(2) },
    { id: actId(), type: 'TACHE', entiteType: 'MANDAT', entiteId: M.M6, userId: GUILLERMO_ID, titre: 'Qualifier Emilie Girard - TechVision', contenu: 'Appel de qualification pour le poste EAE TechVision.', isTache: true, tacheDueDate: inThreeDays, metadata: JSON.stringify({priorite:'NORMALE'}), source: 'MANUEL', createdAt: daysAgo(1) },
    { id: actId(), type: 'TACHE', entiteType: 'ENTREPRISE', entiteId: E.MARRIOTT, userId: VALENTIN_ID, titre: 'Follow-up proposal Marriott Dubai', contenu: 'Relancer Omar Ahmed suite au meeting intro. Envoyer proposition formelle.', isTache: true, tacheDueDate: inFourDays, metadata: JSON.stringify({priorite:'NORMALE'}), source: 'MANUEL', createdAt: daysAgo(5) },
  );
  // 3 completees
  acts.push(
    { id: actId(), type: 'TACHE', entiteType: 'MANDAT', entiteId: M.M10, userId: MEROE_ID, titre: 'Finaliser contrat Carlos Garcia - Oracle', contenu: 'S\'assurer que tous les documents sont signes.', isTache: true, tacheCompleted: true, tacheDueDate: daysAgo(8), source: 'MANUEL', createdAt: daysAgo(10) },
    { id: actId(), type: 'TACHE', entiteType: 'CLIENT', entiteId: C.C12, userId: MEROE_ID, titre: 'Envoyer shortlist Temelion a Sebastien', contenu: 'Shortlist de 3 profils pour le poste Founding AE.', isTache: true, tacheCompleted: true, tacheDueDate: daysAgo(20), source: 'MANUEL', createdAt: daysAgo(25) },
    { id: actId(), type: 'TACHE', entiteType: 'CANDIDAT', entiteId: CA.CA13, userId: VALENTIN_ID, titre: 'Briefer Hassan pour entretien Luxe Hospitality', contenu: 'Prep call avant l\'entretien avec Fatima.', isTache: true, tacheCompleted: true, tacheDueDate: daysAgo(3), source: 'MANUEL', createdAt: daysAgo(5) },
  );

  await prisma.activite.createMany({ data: acts });
  console.log(`${acts.length} activites created (incl. 15 taches).`);

  // ─── MANDATS FICTIFS PASSES (revenue) ───
  // 3 mandats passes pour le dashboard financier
  const MF1 = randomUUID(), MF2 = randomUUID(), MF3 = randomUUID();
  await prisma.mandat.createMany({ data: [
    { id: MF1, titrePoste: 'Head of BD EMEA', entrepriseId: E.FINEDGE, clientId: C.C8, feeMontantEstime: 22000, feeMontantFacture: 22000, feeStatut: 'PAYE', statut: 'GAGNE', dateOuverture: daysAgo(120), dateCloture: daysAgo(60), assignedToId: MEROE_ID, createdById: MEROE_ID },
    { id: MF2, titrePoste: 'Sales Manager Nordics', entrepriseId: E.REVOLUT, clientId: C.C14, feeMontantEstime: 18000, feeMontantFacture: 18000, feeStatut: 'PAYE', statut: 'GAGNE', dateOuverture: daysAgo(90), dateCloture: daysAgo(30), assignedToId: GUILLERMO_ID, createdById: GUILLERMO_ID },
    { id: MF3, titrePoste: 'Regional Sales Director ME', entrepriseId: E.HILTON, clientId: C.C19, feeMontantEstime: 15000, feeMontantFacture: 15000, feeStatut: 'FACTURE', statut: 'GAGNE', dateOuverture: daysAgo(75), dateCloture: daysAgo(42), assignedToId: VALENTIN_ID, createdById: VALENTIN_ID },
  ]});
  console.log('3 past mandats (revenue) created.');

  // ─── NOTIFICATIONS (10) ───
  await prisma.notification.createMany({ data: [
    { userId: MEROE_ID, type: 'CANDIDATURE_STAGE_CHANGE', titre: 'Nicolas Spasic passe en Offre', contenu: 'Le candidat Nicolas Spasic est passe en etape Offre pour le mandat Founding AE Temelion.', entiteType: 'CANDIDAT', entiteId: CA.CA9, createdAt: daysAgo(3) },
    { userId: MEROE_ID, type: 'TACHE_ECHEANCE', titre: 'Tache en retard: Relancer Pierre Leroy', contenu: 'La tache "Relancer Pierre Leroy - Joy/Privateaser" est en retard de 2 jours.', entiteType: 'CLIENT', entiteId: C.C13, createdAt: daysAgo(1) },
    { userId: MEROE_ID, type: 'EMAIL_RECU', titre: 'Nouveau email de Carlos Garcia', contenu: 'Carlos Garcia a envoye ses documents signes pour le contrat Oracle.', entiteType: 'CANDIDAT', entiteId: CA.CA23, createdAt: daysAgo(8) },
    { userId: VALENTIN_ID, type: 'CANDIDATURE_STAGE_CHANGE', titre: 'Oliver Davies en entretien client Revolut', contenu: 'Oliver Davies passe en entretien final avec Sarah Johnson chez Revolut.', entiteType: 'CANDIDAT', entiteId: CA.CA19, createdAt: daysAgo(4) },
    { userId: VALENTIN_ID, type: 'APPEL_ENTRANT', titre: 'Appel de Sarah Johnson - Revolut', contenu: 'Sarah Johnson a appele pour donner un feedback positif sur Oliver Davies.', entiteType: 'CLIENT', entiteId: C.C14, createdAt: daysAgo(3) },
    { userId: GUILLERMO_ID, type: 'RELANCE_CLIENT', titre: 'Relance: Katrin Mueller - N26', contenu: 'Pas d\'activite depuis 7 jours sur le mandat Head of Partnerships N26.', entiteType: 'CLIENT', entiteId: C.C17, createdAt: daysAgo(1) },
    { userId: GUILLERMO_ID, type: 'TACHE_ECHEANCE', titre: 'Tache en retard: Sourcer profils N26', contenu: 'La tache "Sourcer 5 profils Head of Partnerships N26" est en retard de 3 jours.', entiteType: 'MANDAT', entiteId: M.M9, createdAt: daysAgo(1) },
    { userId: MEROE_ID, type: 'SYSTEME', titre: 'Mandat cloture: Oracle Country Manager', contenu: 'Le mandat Country Manager Iberia Oracle a ete cloture avec succes. Fee: 28,000 EUR.', entiteType: 'MANDAT', entiteId: M.M10, createdAt: daysAgo(7) },
    { userId: MARIE_ID, type: 'SYSTEME', titre: 'Bienvenue sur HumanUp !', contenu: 'Votre compte a ete cree. Commencez par explorer vos candidats et mandats.', createdAt: daysAgo(15) },
    { userId: MEROE_ID, type: 'RELANCE_CLIENT', titre: 'Mandat dormant: Head of AM Joy/Privateaser', contenu: 'Le mandat Head of Account Management chez Joy/Privateaser n\'a pas eu d\'activite depuis 12 jours.', entiteType: 'MANDAT', entiteId: M.M2, createdAt: hoursAgo(6) },
  ]});
  console.log('10 notifications created.');

  console.log('\n=== SEED COMPLETE ===');
  console.log('Users: 4, Entreprises: 15, Clients: 25, Mandats: 13 (10 actifs + 3 passes)');
  console.log('Candidats: 30, Candidatures: 23, Activites: ' + acts.length);
  console.log('Revenue: 83k EUR facture (28k Oracle + 22k FinEdge + 18k Revolut + 15k Hilton)');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
