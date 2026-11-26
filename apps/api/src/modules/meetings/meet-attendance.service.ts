/**
 * RDV effectué ou no-show, lu dans les appels Allo et Google Meet (toutes les 15 minutes).
 *
 * Pour chaque RDV terminé (statut PREVU) :
 *  - appel Allo de 5 min ou plus avec le contact, de 20 min avant à 30 min après → EFFECTUE
 *    (RDV téléphonique, ou visio passée en appel) ;
 *  - visio Google Meet créée par la personne : on lit la liste des connectés.
 *      au moins un externe connecté 5 min ou plus → EFFECTUE
 *      la visio a eu lieu sans externe              → NO_SHOW
 *      personne ne s'est connecté (2 h après la fin) → A_CONFIRMER (tenu ailleurs ?)
 *  - visio créée par quelqu'un d'autre (le client) ou pas de visio → A_CONFIRMER :
 *    la personne tranche en un clic.
 * Accès Meet pas encore autorisé : le RDV reste PREVU et est lu après la reconnexion
 * (en attendant, il apparaît dans les RDV à confirmer 2 h après sa fin).
 *
 * Google garde la présence Meet 30 jours : au-delà on ne relit plus.
 */

import prisma from '../../lib/db.js';
import { RDV_KINDS, meetingKindOf, meetingEnd, type RdvStatut } from './meeting-kind.js';

const MEET_SCOPE = 'https://www.googleapis.com/auth/meetings.space.readonly';
const MIN_PRESENCE_MS = 5 * 60 * 1000;
const WAIT_AFTER_END_MS = 10 * 60 * 1000;
const NO_RECORD_GRACE_MS = 2 * 3600 * 1000;
const LOOKBACK_MS = 30 * 86400 * 1000;
const MAX_PER_RUN = 60;
const INTERNAL_DOMAINS = ['humanup.io'];

type Meta = Record<string, any>;

interface MeetCheck {
  at: string;
  reason: 'present' | 'absent' | 'no_record' | 'no_meet' | 'not_organizer' | 'no_access' | 'allo_call';
  participants?: Array<{ name: string; minutes: number; external: boolean }>;
  /** Appel Allo qui a confirmé le RDV. */
  call?: { minutes: number; at: string };
  /** Les appels Allo ont déjà été cherchés (RDV à confirmer). */
  alloChecked?: boolean;
}

const normalise = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();

async function meetGet(token: string, path: string): Promise<{ status: number; data: any }> {
  const res = await fetch(`https://meet.googleapis.com/v2/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

/** Conférences Meet tenues sur ce code autour de l'heure du RDV. */
async function conferenceRecords(token: string, meetCode: string, start: Date, end: Date) {
  const from = new Date(start.getTime() - 3 * 3600 * 1000).toISOString();
  const to = new Date(end.getTime() + 3 * 3600 * 1000).toISOString();
  const filter = `space.meeting_code = "${meetCode}" AND start_time >= "${from}" AND start_time <= "${to}"`;
  return meetGet(token, `conferenceRecords?filter=${encodeURIComponent(filter)}&pageSize=10`);
}

async function participantsOf(token: string, record: string): Promise<any[]> {
  const out: any[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ pageSize: '100' });
    if (pageToken) q.set('pageToken', pageToken);
    const { status, data } = await meetGet(token, `${record}/participants?${q}`);
    if (status !== 200) break;
    out.push(...(data.participants || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

interface Internals {
  names: Set<string>;
}

async function loadInternals(): Promise<Internals> {
  const users = await prisma.user.findMany({ select: { prenom: true, nom: true, email: true } });
  const names = new Set<string>();
  for (const u of users) {
    const full = normalise(`${u.prenom ?? ''} ${u.nom}`);
    if (full.includes(' ')) names.add(full);
    const local = normalise((u.email || '').split('@')[0].replace(/[._-]/g, ' '));
    if (local.includes(' ')) names.add(local);
  }
  return { names };
}

/**
 * Un participant est interne si son nom affiché est celui d'un membre de l'équipe
 * (prénom + nom de la fiche, ou prénom.nom de l'email) ou d'un invité @humanup.io.
 */
function isInternalParticipant(p: any, internals: Internals, attendeeEmailsInternal: string[]): boolean {
  const display = normalise(p.signedinUser?.displayName || p.anonymousUser?.displayName || p.phoneUser?.displayName || '');
  if (!display) return false;
  if (internals.names.has(display)) return true;
  return attendeeEmailsInternal.some((e) => normalise(e.split('@')[0].replace(/[._-]/g, ' ')) === display);
}

function presenceMs(p: any, end: Date): number {
  const s = p.earliestStartTime ? new Date(p.earliestStartTime).getTime() : NaN;
  const e = p.latestEndTime ? new Date(p.latestEndTime).getTime() : end.getTime();
  return Number.isNaN(s) ? 0 : Math.max(0, e - s);
}

async function setStatut(id: string, meta: Meta, statut: RdvStatut, check: MeetCheck, source: 'MEET' | 'ALLO' = 'MEET'): Promise<void> {
  await prisma.activite.update({
    where: { id },
    data: {
      metadata: {
        ...meta,
        rdvStatut: statut,
        rdvStatutSource: source,
        rdvStatutAt: new Date().toISOString(),
        meetCheck: check as any,
      },
    },
  });
}

async function hasMeetAccess(userId: string): Promise<boolean> {
  const configs = await prisma.integrationConfig.findMany({
    where: { userId, provider: { in: ['gmail', 'calendar'] }, enabled: true },
    select: { config: true },
  });
  return configs.some((c) => String(((c.config as Meta) || {}).scopes || '').includes(MEET_SCOPE));
}

// ─── Appels Allo ─────────────────────────────────────

const PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000';
const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '').slice(-9);

/**
 * RDV tenu par téléphone : un appel Allo d'au moins 5 minutes avec le contact du RDV
 * (sa fiche ou son numéro), entre 20 min avant le début et 30 min après la fin.
 */
export async function alloCallFor(
  a: { userId: string | null; entiteType: string | null; entiteId: string | null; metadata: unknown },
  start: Date,
  end: Date,
): Promise<{ minutes: number; at: string } | null> {
  const meta = (a.metadata as Meta) || {};
  const candidatIds = new Set<string>();
  const clientIds = new Set<string>();
  if (a.entiteId && a.entiteId !== PLACEHOLDER_ID) (a.entiteType === 'CLIENT' ? clientIds : candidatIds).add(a.entiteId);
  for (const att of Array.isArray(meta.attendees) ? meta.attendees : []) {
    if (!att?.entityId) continue;
    if (att.role === 'candidat') candidatIds.add(att.entityId);
    if (att.role === 'client') clientIds.add(att.entityId);
  }
  const ids = [...candidatIds, ...clientIds];
  if (!ids.length) return null;

  const [cands, clis] = await Promise.all([
    candidatIds.size ? prisma.candidat.findMany({ where: { id: { in: [...candidatIds] } }, select: { telephone: true } }) : [],
    clientIds.size ? prisma.client.findMany({ where: { id: { in: [...clientIds] } }, select: { telephone: true } }) : [],
  ]);
  const phones = new Set([...cands, ...clis].map((c) => digits(c.telephone)).filter((p) => p.length === 9));

  const calls = await prisma.activite.findMany({
    where: {
      type: 'APPEL',
      createdAt: { gte: new Date(start.getTime() - 20 * 60000), lte: new Date(end.getTime() + 30 * 60000) },
      OR: [{ entiteId: { in: ids } }, ...(a.userId ? [{ userId: a.userId }] : [])],
    },
    select: { entiteId: true, metadata: true, createdAt: true },
  });
  for (const c of calls) {
    const m = (c.metadata as Meta) || {};
    const sameContact = (c.entiteId && ids.includes(c.entiteId))
      || [m.from, m.to, m.unidentifiedPhone, m.phone].some((p) => phones.has(digits(p)));
    const seconds = Number(m.duration ?? 0);
    if (sameContact && seconds * 1000 >= MIN_PRESENCE_MS) return { minutes: Math.round(seconds / 60), at: c.createdAt.toISOString() };
  }
  return null;
}

/** Vérifie un RDV terminé. Retourne false s'il faut réessayer plus tard. */
async function checkMeeting(
  a: { id: string; userId: string | null; metadata: unknown; entiteType: string | null; entiteId: string | null; createdAt: Date },
  token: string | null,
  access: boolean,
  internals: Internals,
): Promise<boolean> {
  const meta = { ...((a.metadata as Meta) || {}) };
  const end = meetingEnd(a)!;
  const start = meta.startTime ? new Date(meta.startTime) : new Date(end.getTime() - 3600 * 1000);
  const now = new Date();
  const late = now.getTime() - end.getTime() >= NO_RECORD_GRACE_MS; // appels Allo et présence Meet arrivés

  // 1. Appel Allo avec le contact à l'heure du RDV : effectué (RDV téléphonique ou passé en appel).
  const call = await alloCallFor(a, start, end);
  if (call) {
    await setStatut(a.id, meta, 'EFFECTUE', { at: now.toISOString(), reason: 'allo_call', call }, 'ALLO');
    return true;
  }

  // 2. Pas de visio Meet lisible : à confirmer, une fois les appels Allo arrivés.
  if (!meta.meetCode || meta.organizerSelf === false) {
    if (!late) return false;
    await setStatut(a.id, meta, 'A_CONFIRMER', { at: now.toISOString(), reason: meta.meetCode ? 'not_organizer' : 'no_meet', alloChecked: true });
    return true;
  }
  // Accès Meet pas encore autorisé : le RDV reste en attente, il sera lu après la reconnexion.
  if (!access || !token) return false;

  const { status, data } = await conferenceRecords(token, meta.meetCode, start, end);
  if (status === 401 || status === 403) {
    // Accès refusé par Google (API Meet non activée…) : la personne peut trancher à la main,
    // et on réessaie de lire la présence toutes les 6 h.
    await setStatut(a.id, meta, 'A_CONFIRMER', { at: now.toISOString(), reason: 'no_access', alloChecked: late });
    return true;
  }
  if (status !== 200) return false;

  const records: any[] = data.conferenceRecords || [];
  if (!records.length) {
    if (!late) return false;
    await setStatut(a.id, meta, 'A_CONFIRMER', { at: now.toISOString(), reason: 'no_record', alloChecked: true });
    return true;
  }

  const internalEmails = (Array.isArray(meta.attendees) ? meta.attendees : [])
    .filter((x: any) => x?.role === 'internal' || INTERNAL_DOMAINS.includes(String(x?.email || '').split('@')[1]))
    .map((x: any) => String(x.email || ''));

  const seen: MeetCheck['participants'] = [];
  for (const r of records) {
    for (const p of await participantsOf(token, r.name)) {
      const name = p.signedinUser?.displayName || p.anonymousUser?.displayName || p.phoneUser?.displayName || 'Participant';
      const external = !isInternalParticipant(p, internals, internalEmails);
      seen.push({ name, minutes: Math.round(presenceMs(p, end) / 60000), external });
    }
  }
  const present = seen.some((p) => p.external && p.minutes * 60000 >= MIN_PRESENCE_MS);
  // Visio vide : on attend les appels Allo avant de conclure au no-show.
  if (!present && !late) return false;
  await setStatut(a.id, meta, present ? 'EFFECTUE' : 'NO_SHOW', {
    at: now.toISOString(),
    reason: present ? 'present' : 'absent',
    participants: seen,
  });
  return true;
}

export async function runMeetAttendanceCheck(): Promise<void> {
  const since = new Date(Date.now() - LOOKBACK_MS);
  const candidates = await prisma.activite.findMany({
    where: {
      type: 'MEETING',
      source: 'CALENDAR',
      createdAt: { gte: new Date(since.getTime() - 60 * 86400 * 1000) },
      OR: [
        { metadata: { path: ['rdvStatut'], equals: 'PREVU' } },
        { metadata: { path: ['rdvStatut'], equals: 'A_CONFIRMER' } },
      ],
    },
    select: { id: true, userId: true, metadata: true, entiteType: true, entiteId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 600,
  });

  const now = Date.now();
  const due = candidates.filter((a) => {
    if (!RDV_KINDS.includes(meetingKindOf(a))) return false;
    const end = meetingEnd(a);
    if (!end || end.getTime() >= now - WAIT_AFTER_END_MS || end.getTime() <= since.getTime()) return false;
    const meta = (a.metadata as Meta) || {};
    if (meta.rdvStatut !== 'A_CONFIRMER') return true;
    // À confirmer : relu une fois pour les appels Allo, puis toutes les 6 h si l'accès Meet était refusé.
    if (!meta.meetCheck?.alloChecked) return true;
    const last = meta.meetCheck?.at ? new Date(meta.meetCheck.at).getTime() : 0;
    return meta.meetCheck?.reason === 'no_access' && now - last >= 6 * 3600 * 1000;
  });
  if (!due.length) return;

  const internals = await loadInternals();
  const { getGoogleAccessToken } = await import('../integrations/google-auth.service.js');
  const tokens = new Map<string, { token: string | null; access: boolean }>();
  let done = 0;

  for (const a of due.slice(0, MAX_PER_RUN)) {
    if (!a.userId) continue;
    let auth = tokens.get(a.userId);
    if (!auth) {
      const access = await hasMeetAccess(a.userId);
      auth = { access, token: access ? await getGoogleAccessToken(a.userId) : null };
      tokens.set(a.userId, auth);
    }
    try {
      if (await checkMeeting(a, auth.token, auth.access, internals)) done++;
    } catch (err) {
      console.error(`[MeetAttendance] RDV ${a.id}:`, err);
    }
  }
  if (done) console.log(`[MeetAttendance] ${done} RDV vérifié(s)`);
}

/** Choix manuel (un clic) : effectué ou no-show. */
export async function setRdvStatutManuel(
  id: string,
  userId: string,
  statut: 'EFFECTUE' | 'NO_SHOW' | 'ANNULE',
  opts: { anyOwner?: boolean } = {},
): Promise<void> {
  const a = await prisma.activite.findUnique({ where: { id }, select: { id: true, type: true, userId: true, metadata: true } });
  if (!a || a.type !== 'MEETING') {
    const { NotFoundError } = await import('../../lib/errors.js');
    throw new NotFoundError('Meeting', id);
  }
  // anyOwner : comptes agents (MCP), qui agissent pour toute l'équipe.
  if (a.userId !== userId && !opts.anyOwner) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role !== 'ADMIN') {
      const { AppError } = await import('../../lib/errors.js');
      throw new AppError(403, 'Ce RDV appartient à un autre utilisateur.');
    }
  }
  await prisma.activite.update({
    where: { id },
    data: {
      metadata: {
        ...((a.metadata as Meta) || {}),
        rdvStatut: statut,
        rdvStatutSource: 'MANUEL',
        rdvStatutAt: new Date().toISOString(),
        rdvStatutBy: userId,
      },
    },
  });
}
