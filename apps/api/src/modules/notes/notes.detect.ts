// Détection depuis l'invitation Google Calendar : lien visio, participants,
// type de call et rattachement aux fiches Propium.
import prisma from '../../lib/db.js';
import type { Attendee, CallType } from './notes.types.js';

const INTERNAL_DOMAIN = 'humanup.io';
export const PUBLIC_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.fr', 'live.com', 'live.fr', 'yahoo.com', 'yahoo.fr', 'icloud.com', 'me.com', 'orange.fr', 'free.fr', 'sfr.fr', 'laposte.net', 'wanadoo.fr', 'protonmail.com', 'proton.me']);

const TEAMS_RE = /https:\/\/teams\.(?:microsoft|live)\.com\/(?:l\/meetup-join|meet)\/[^\s"<>)]+/i;
const MEET_RE = /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i;

export interface MeetingLink { url: string; platform: 'MEET' | 'TEAMS' }

/** Lien de visio Meet ou Teams d'un événement Google Calendar (null si aucun). */
export function extractMeetingLink(item: any): MeetingLink | null {
  const video = item?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri as string | undefined;
  const candidates = [item?.hangoutLink, video, item?.location, item?.description].filter(Boolean).map(String);
  for (const c of candidates) {
    const teams = c.match(TEAMS_RE);
    if (teams) return { url: decodeHtml(teams[0]), platform: 'TEAMS' };
  }
  for (const c of candidates) {
    const meet = c.match(MEET_RE);
    if (meet) return { url: meet[0].toLowerCase(), platform: 'MEET' };
  }
  return null;
}

function decodeHtml(s: string): string {
  return s.replace(/&amp;/g, '&');
}

/** Clé de dédoublonnage : même lien + même heure de début = même réunion, un seul bot. */
export function meetingKey(link: MeetingLink, startAt: Date): string {
  let base = link.url;
  if (link.platform === 'TEAMS') base = decodeURIComponent(link.url.split('?')[0]).toLowerCase();
  return `${base}|${startAt.toISOString()}`.slice(0, 400);
}

export function isInternalEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`);
}

/** Qualifie chaque participant : membre Humanup, candidat, client, lead ou inconnu. */
export async function classifyAttendees(raw: any[]): Promise<Attendee[]> {
  const out: Attendee[] = [];
  for (const a of raw || []) {
    const email = String(a?.email || '').toLowerCase().trim();
    if (!email || email.includes('calendar.google.com') || a?.resource) continue;
    const base = { email, name: a?.displayName || null, self: !!a?.self, organizer: !!a?.organizer };
    if (isInternalEmail(email)) { out.push({ ...base, role: 'internal' }); continue; }
    const cand = await prisma.candidat.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true, prenom: true, nom: true } });
    if (cand) { out.push({ ...base, role: 'candidat', entityId: cand.id, name: base.name || `${cand.prenom ?? ''} ${cand.nom}`.trim() }); continue; }
    const client = await prisma.client.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true, prenom: true, nom: true } });
    if (client) { out.push({ ...base, role: 'client', entityId: client.id, name: base.name || `${client.prenom ?? ''} ${client.nom}`.trim() }); continue; }
    const lead = await prisma.lead.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true, contact: true } });
    if (lead) { out.push({ ...base, role: 'lead', entityId: lead.id, name: base.name || lead.contact }); continue; }
    out.push({ ...base, role: 'external' });
  }
  return out;
}

export interface Detection {
  callType: CallType;
  needsReview: boolean;
  reviewReason: string | null;
  candidatId: string | null;
  clientId: string | null;
  mandatId: string | null;
  leadId: string | null;
}

const has = (title: string, words: string[]) => words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(title));

/** Déduit le type de call et son rattachement (tableau « Signal de détection » de la spec). */
export async function detectCall(title: string, description: string | null, attendees: Attendee[]): Promise<Detection> {
  const externals = attendees.filter((a) => a.role !== 'internal');
  const cand = externals.find((a) => a.role === 'candidat');
  const client = externals.find((a) => a.role === 'client');
  const lead = externals.find((a) => a.role === 'lead');
  const text = `${title} ${description ?? ''}`;

  const d: Detection = { callType: 'PROSPECT', needsReview: false, reviewReason: null, candidatId: null, clientId: null, mandatId: null, leadId: null };

  if (attendees.length > 0 && externals.length === 0) {
    d.callType = 'INTERNE';
    return d;
  }

  const qualifSignal = !!cand || has(title, ['qualif', 'qualification', 'screening']);
  const intakeSignal = !!client || has(title, ['intake', 'brief', 'kick-?off']);

  if (qualifSignal && intakeSignal && !(cand && !client) && !(client && !cand)) {
    d.needsReview = true;
    d.reviewReason = 'Le titre et les participants indiquent à la fois une qualif et un intake.';
  }

  if (qualifSignal && (!intakeSignal || cand)) {
    d.callType = 'QUALIF';
    d.candidatId = cand?.entityId ?? null;
    d.mandatId = await guessMandatForCandidat(d.candidatId, text);
    if (!d.candidatId && !d.needsReview) {
      d.needsReview = true;
      d.reviewReason = 'Candidat introuvable dans Propium : chargez son CV ou choisissez la fiche.';
    } else if (!d.mandatId && !d.needsReview) {
      d.needsReview = true;
      d.reviewReason = 'Mandat lié inconnu : choisissez le mandat de cette qualif.';
    }
    return d;
  }

  if (intakeSignal) {
    d.callType = 'INTAKE';
    d.clientId = client?.entityId ?? null;
    if (d.clientId) d.mandatId = await guessMandatForClient(d.clientId, text);
    return d;
  }

  d.callType = 'PROSPECT';
  d.leadId = lead?.entityId ?? null;
  if (!lead && externals.length > 0) {
    // Domaine inconnu de Propium : prospect, sauf si le domaine est celui d'une entreprise cliente connue.
    const domain = externals[0].email.split('@')[1];
    const ent = domain && !PUBLIC_DOMAINS.has(domain)
      ? await prisma.entreprise.findFirst({
          where: { OR: [{ domaine: { equals: domain, mode: 'insensitive' } }, { siteWeb: { contains: domain, mode: 'insensitive' } }], clients: { some: {} } },
          select: { id: true },
        }).catch(() => null)
      : null;
    if (ent) {
      d.needsReview = true;
      d.reviewReason = 'Le contact vient d’une entreprise déjà connue : intake ou prospect ?';
    }
  }
  return d;
}

/** Mandat d'une qualif : la candidature active du candidat, ou un mandat cité dans le titre. */
async function guessMandatForCandidat(candidatId: string | null, text: string): Promise<string | null> {
  if (candidatId) {
    const cands = await prisma.candidature.findMany({
      where: { candidatId, stage: { notIn: ['PLACE', 'REFUSE'] }, mandat: { statut: { in: ['OUVERT', 'EN_COURS'] } } },
      select: { mandatId: true, mandat: { select: { titrePoste: true, entreprise: { select: { nom: true } } } } },
      orderBy: { updatedAt: 'desc' },
    });
    if (cands.length === 1) return cands[0].mandatId;
    const hit = cands.find((c) => mentions(text, c.mandat.entreprise.nom) || mentions(text, c.mandat.titrePoste));
    if (hit) return hit.mandatId;
    if (cands.length > 1) return null;
  }
  const open = await prisma.mandat.findMany({
    where: { statut: { in: ['OUVERT', 'EN_COURS'] } },
    select: { id: true, titrePoste: true, entreprise: { select: { nom: true } } },
  });
  const byCompany = open.filter((m) => mentions(text, m.entreprise.nom));
  if (byCompany.length === 1) return byCompany[0].id;
  return null;
}

async function guessMandatForClient(clientId: string, text: string): Promise<string | null> {
  const mandats = await prisma.mandat.findMany({
    where: { clientId, statut: { in: ['OUVERT', 'EN_COURS'] } },
    select: { id: true, titrePoste: true },
    orderBy: { updatedAt: 'desc' },
  });
  const hit = mandats.find((m) => mentions(text, m.titrePoste));
  return hit?.id ?? null;
}

function mentions(text: string, needle: string | null | undefined): boolean {
  if (!needle || needle.length < 3) return false;
  return text.toLowerCase().includes(needle.toLowerCase());
}
