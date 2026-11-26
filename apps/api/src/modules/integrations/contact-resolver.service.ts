/**
 * Interlocuteur inconnu (email ou invité d'agenda) → fiche dans l'ATS.
 *
 * Règles validées 2026-11-26 :
 *  - l'IA lit l'email ou l'événement et décide : candidat, côté entreprise, ou à ignorer ;
 *  - côté entreprise : client si l'entreprise est sous contrat avec HumanUp
 *    (mandat client signé ou en cours), sinon Lead dans le module Leads ;
 *  - sans IA disponible : entreprise sous contrat → client, entreprise connue sans
 *    contrat ou email pro → Lead, email perso avec un vrai nom → candidat.
 */

import prisma from '../../lib/db.js';
import { isPersonalEmail } from './allo.service.js';

export interface Person {
  name: string | null;
  email: string;
  /** Place dans l'échange : expéditeur, destinataire, copie, invité. */
  role: 'from' | 'to' | 'cc' | 'guest';
}

export interface Context {
  origine: 'email' | 'agenda';
  sens: 'ENTRANT' | 'SORTANT';
  objet: string;
  texte: string;
  piecesJointes?: string[];
  expediteur?: string;
}

export type Resolution =
  | { type: 'CANDIDAT' | 'CLIENT'; id: string; created: true }
  | { type: 'LEAD'; id: string; created: boolean }
  | null;

export interface ResolverStats {
  candidats: number;
  clients: number;
  entreprises: number;
  leads: number;
}

export class AiBudgetExhausted extends Error {}

/**
 * Appels IA autorisés pour un passage de synchro, et adresses déjà écartées par l'IA
 * (gardées dans la config Gmail de la personne pour ne pas les relire à chaque passage).
 */
export class AiBudget {
  ignored = new Set<string>();
  private dirty = false;
  constructor(public remaining: number, public readonly available: boolean) {}
  take(): void {
    if (this.remaining <= 0) throw new AiBudgetExhausted();
    this.remaining--;
  }
  ignore(email: string): void {
    this.ignored.add(email);
    this.dirty = true;
  }
  /** Charge la liste des adresses écartées de l'utilisateur. */
  async load(userId: string): Promise<this> {
    const cfg = await prisma.integrationConfig.findUnique({ where: { userId_provider: { userId, provider: 'gmail' } }, select: { config: true } });
    const list = ((cfg?.config as any)?.contactsIgnores as string[] | undefined) ?? [];
    this.ignored = new Set(list);
    return this;
  }
  /** Enregistre les nouvelles adresses écartées (3 000 au plus, les plus récentes). */
  async save(userId: string): Promise<void> {
    if (!this.dirty) return;
    const cfg = await prisma.integrationConfig.findUnique({ where: { userId_provider: { userId, provider: 'gmail' } }, select: { id: true, config: true } });
    if (!cfg) return;
    const list = Array.from(this.ignored).slice(-3000);
    await prisma.integrationConfig.update({ where: { id: cfg.id }, data: { config: { ...((cfg.config as any) || {}), contactsIgnores: list } } });
    this.dirty = false;
  }
}

export function aiIsAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY || !!process.env.GEMINI_API_KEY;
}

// ─── Helpers ────────────────────────────────────────

export const domainOf = (email: string) => (email.split('@')[1] || '').toLowerCase();

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

export function nameFromAddress(a: { name: string | null; email: string }): { prenom: string | null; nom: string } {
  const display = (a.name || '').replace(/["']/g, '').trim();
  if (display && /\p{L}{2,}/u.test(display) && !display.includes('@')) {
    const parts = display.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return { prenom: parts[0], nom: parts.slice(1).join(' ') };
    return { prenom: parts[0], nom: parts[0] };
  }
  const local = a.email.split('@')[0].replace(/\d+/g, ' ');
  const parts = local.split(/[._\-\s]+/).filter((p) => p.length >= 2);
  if (parts.length >= 2) return { prenom: capitalize(parts[0]), nom: parts.slice(1).map(capitalize).join(' ') };
  return { prenom: null, nom: capitalize(parts[0] || a.email.split('@')[0]) };
}

export function deriveCompanyName(domain: string): string {
  const n = domain.replace(/^www\./, '').split('.')[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : domain;
}

export async function findEntrepriseByDomain(domain: string): Promise<{ id: string; nom: string } | null> {
  const base = domain.replace(/^www\./, '').toLowerCase();
  if (!base || base.split('.')[0].length < 3 || isPersonalEmail(`x@${base}`)) return null;
  return prisma.entreprise.findFirst({
    where: { OR: [{ domaine: { equals: base, mode: 'insensitive' } }, { siteWeb: { contains: base, mode: 'insensitive' } }] },
    select: { id: true, nom: true },
  });
}

const ETAPES_AVANT_CONTRAT = /prospection|1er rendez-vous|premier rendez-vous|d[ée]couverte/i;

/**
 * Entreprise sous contrat : au moins un mandat client signé, ou ouvert / en cours /
 * gagné / clôturé hors étapes de prospection.
 */
export async function entrepriseSousContrat(entrepriseId: string): Promise<boolean> {
  const mandats = await prisma.mandat.findMany({
    where: { entrepriseId, type: 'CLIENT' } as any,
    select: { statut: true, contractStatus: true, etapeCycle: true } as any,
  });
  return (mandats as any[]).some((m) =>
    m.contractStatus === 'SIGNED'
    || (['OUVERT', 'EN_COURS', 'GAGNE', 'CLOTURE'].includes(m.statut) && !ETAPES_AVANT_CONTRAT.test(m.etapeCycle || '')),
  );
}

// ─── IA ─────────────────────────────────────────────

/**
 * Appel IA de la synchro : Claude (Anthropic) en priorité, le Gemini gratuit du serveur
 * étant limité à 20 requêtes par jour. Une erreur IA met le passage en pause
 * (AiBudgetExhausted) : rien n'est perdu, le passage suivant reprend au même endroit.
 */
export async function callTriageAi(options: Parameters<typeof import('../../services/claudeAI.js').callClaude>[0]) {
  const { callClaude } = await import('../../services/claudeAI.js');
  try {
    return await callClaude({ ...options, preferAnthropic: true });
  } catch (err) {
    console.warn('[Contacts] IA indisponible, passage mis en pause :', err instanceof Error ? err.message.slice(0, 160) : err);
    throw new AiBudgetExhausted();
  }
}

interface Triage {
  type: 'CANDIDAT' | 'CLIENT' | 'IGNORE';
  prenom?: string;
  nom?: string;
  poste?: string;
  entreprise?: string;
  telephone?: string;
}

async function triage(userId: string, person: Person, ctx: Context, entrepriseConnue: string | null, budget: AiBudget): Promise<Triage | null> {
  budget.take();
  const place = { from: 'expéditeur', to: 'destinataire', cc: 'en copie', guest: 'invité à un rendez-vous' }[person.role];
  const res = await callTriageAi({
    feature: 'email_triage',
    userId,
    maxTokens: 300,
    systemPrompt: `Tu tries les échanges d'un cabinet de recrutement (HumanUp). On te donne un ${ctx.origine === 'email' ? 'email' : 'rendez-vous d\'agenda'} et un interlocuteur que le cabinet ne connaît pas encore.
Décide qui est cet interlocuteur :
- CANDIDAT : une personne qui cherche un poste, envoie ou parle de son CV, répond à une approche de recrutement, est contactée pour un poste ou un entretien.
- CLIENT : une entreprise (dirigeant, RH, manager, assistant) qui recrute ou pourrait recruter avec le cabinet, parle d'un besoin, d'un mandat, d'un contrat, d'un candidat présenté, ou un prospect commercial du cabinet.
- IGNORE : fournisseur ou prestataire qui démarche le cabinet, outil, administration, banque, comptable, échange personnel, spam, robot.
En cas de vrai doute, réponds IGNORE.
Réponds uniquement en JSON : {"type":"CANDIDAT|CLIENT|IGNORE","prenom":"","nom":"","poste":"","entreprise":"","telephone":""}. Laisse vide ce que le texte ne dit pas. "entreprise" = l'entreprise de l'interlocuteur.`,
    userPrompt: JSON.stringify({
      sens: ctx.sens === 'ENTRANT' ? 'reçu par le cabinet' : 'envoyé ou organisé par le cabinet',
      interlocuteur: { nom_affiche: person.name, email: person.email, place },
      entreprise_deja_connue_pour_ce_domaine: entrepriseConnue,
      expediteur: ctx.expediteur,
      objet: ctx.objet,
      pieces_jointes: ctx.piecesJointes ?? [],
      texte: ctx.texte.slice(0, 3000),
    }),
  });
  const c = res.content;
  if (!c || typeof c !== 'object' || !['CANDIDAT', 'CLIENT', 'IGNORE'].includes(c.type)) return null;
  return c as Triage;
}

// ─── Création ───────────────────────────────────────

const libelleOrigine = (ctx: Context) => (ctx.origine === 'email' ? `l'email : "${ctx.objet}"` : `le rendez-vous : "${ctx.objet}"`);

async function createCandidat(userId: string, person: Person, ctx: Context, t: Triage | null, stats: ResolverStats): Promise<Resolution> {
  const guess = nameFromAddress(person);
  const nom = (t?.nom || '').trim() || guess.nom;
  const prenom = (t?.prenom || '').trim() || guess.prenom;
  const c = await prisma.candidat.create({
    data: {
      nom,
      prenom: prenom && prenom !== nom ? prenom : undefined,
      email: person.email,
      telephone: t?.telephone || undefined,
      posteActuel: t?.poste || undefined,
      entrepriseActuelle: t?.entreprise || undefined,
      source: ctx.origine === 'email' ? 'Email auto' : 'Agenda',
      notes: `Créé automatiquement depuis ${libelleOrigine(ctx)}`,
      createdById: userId,
    },
    select: { id: true },
  });
  stats.candidats++;
  console.log(`[Contacts] CANDIDAT créé : ${prenom ?? ''} ${nom} <${person.email}>`);
  return { type: 'CANDIDAT', id: c.id, created: true };
}

async function createClient(userId: string, person: Person, ctx: Context, t: Triage | null, entreprise: { id: string; nom: string }, stats: ResolverStats): Promise<Resolution> {
  const guess = nameFromAddress(person);
  const nom = (t?.nom || '').trim() || guess.nom;
  const prenom = (t?.prenom || '').trim() || guess.prenom;
  const c = await prisma.client.create({
    data: {
      nom,
      prenom: prenom && prenom !== nom ? prenom : undefined,
      email: person.email,
      telephone: t?.telephone || undefined,
      poste: t?.poste || undefined,
      entrepriseId: entreprise.id,
      typeClient: ctx.sens === 'ENTRANT' ? 'INBOUND' : 'OUTBOUND',
      createdById: userId,
      notes: `Créé automatiquement depuis ${libelleOrigine(ctx)}`,
    } as any,
    select: { id: true },
  });
  stats.clients++;
  console.log(`[Contacts] CLIENT créé : ${prenom ?? ''} ${nom} <${person.email}> @ ${entreprise.nom}`);
  return { type: 'CLIENT', id: c.id, created: true };
}

async function createLead(userId: string, person: Person, ctx: Context, t: Triage | null, entreprise: { id: string; nom: string } | null, stats: ResolverStats): Promise<Resolution> {
  const guess = nameFromAddress(person);
  const company = entreprise?.nom || (t?.entreprise || '').trim() || (isPersonalEmail(person.email) ? '' : deriveCompanyName(domainOf(person.email)));
  if (!company) return null; // personne côté entreprise sans entreprise identifiable : on ne devine pas
  const contact = [(t?.prenom || '').trim() || guess.prenom, (t?.nom || '').trim() || guess.nom].filter(Boolean).join(' ');
  const lead = await prisma.lead.create({
    data: {
      company,
      contact: contact || person.email,
      email: person.email,
      phone: t?.telephone || null,
      role: t?.poste || null,
      source: ctx.origine === 'email' ? (ctx.sens === 'ENTRANT' ? 'Email entrant' : 'Email envoyé') : 'Agenda',
      src: 'cold',
      stage: 'nouveau',
      ownerId: userId,
      entrepriseId: entreprise?.id ?? null,
      lastContactAt: new Date(),
    },
    select: { id: true },
  });
  stats.leads++;
  console.log(`[Contacts] LEAD créé : ${contact} <${person.email}> @ ${company}`);
  return { type: 'LEAD', id: lead.id, created: true };
}

/** Côté entreprise : client si sous contrat, sinon Lead. */
async function companySide(userId: string, person: Person, ctx: Context, t: Triage | null, known: { id: string; nom: string } | null, stats: ResolverStats): Promise<Resolution> {
  if (known && (await entrepriseSousContrat(known.id))) return createClient(userId, person, ctx, t, known, stats);
  if (!known && t?.entreprise) {
    const byName = await prisma.entreprise.findFirst({
      where: { nom: { equals: t.entreprise.trim(), mode: 'insensitive' } },
      select: { id: true, nom: true },
    });
    if (byName && (await entrepriseSousContrat(byName.id))) return createClient(userId, person, ctx, t, byName, stats);
    return createLead(userId, person, ctx, t, byName, stats);
  }
  return createLead(userId, person, ctx, t, known, stats);
}

/** Lead existant avec cet email (les leads ne sont ni candidats ni clients). */
export async function findLeadByEmail(email: string): Promise<{ id: string } | null> {
  return prisma.lead.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
}

/**
 * Interlocuteur inconnu → candidat, client ou Lead (ou rien).
 * Lève AiBudgetExhausted si le budget IA du passage est épuisé.
 */
export async function resolveUnknownContact(
  userId: string,
  person: Person,
  ctx: Context,
  budget: AiBudget,
  stats: ResolverStats,
): Promise<Resolution> {
  const known = await findEntrepriseByDomain(domainOf(person.email));

  if (!budget.available) {
    if (!isPersonalEmail(person.email) || known) return companySide(userId, person, ctx, null, known, stats);
    const n = nameFromAddress(person);
    if (n.prenom && n.nom !== n.prenom) return createCandidat(userId, person, ctx, null, stats);
    return null;
  }

  if (budget.ignored.has(person.email)) return null;
  const t = await triage(userId, person, ctx, known?.nom ?? null, budget);
  if (!t || t.type === 'IGNORE') {
    budget.ignore(person.email);
    return null;
  }
  if (t.type === 'CANDIDAT') return createCandidat(userId, person, ctx, t, stats);
  return companySide(userId, person, ctx, t, known, stats);
}

/** Note sur un Lead (email ou RDV), sans doublon. */
export async function logOnLead(leadId: string, userId: string, type: 'email' | 'note', text: string, at: Date): Promise<void> {
  const dup = await prisma.leadInteraction.findFirst({ where: { leadId, text }, select: { id: true } });
  if (dup) return;
  await prisma.leadInteraction.create({ data: { leadId, type, text, createdById: userId } });
  await prisma.lead.update({ where: { id: leadId }, data: { lastContactAt: at } });
}
