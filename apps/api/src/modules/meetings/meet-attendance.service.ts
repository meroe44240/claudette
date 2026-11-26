/**
 * RDV effectué ou no-show, lu dans Google Meet (toutes les 15 minutes).
 *
 * Pour chaque RDV terminé (statut PREVU) :
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
  reason: 'present' | 'absent' | 'no_record' | 'no_meet' | 'not_organizer' | 'no_access';
  participants?: Array<{ name: string; minutes: number; external: boolean }>;
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

async function setStatut(id: string, meta: Meta, statut: RdvStatut, check: MeetCheck): Promise<void> {
  await prisma.activite.update({
    where: { id },
    data: {
      metadata: {
        ...meta,
        rdvStatut: statut,
        rdvStatutSource: 'MEET',
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

  if (!meta.meetCode) {
    await setStatut(a.id, meta, 'A_CONFIRMER', { at: now.toISOString(), reason: 'no_meet' });
    return true;
  }
  if (meta.organizerSelf === false) {
    await setStatut(a.id, meta, 'A_CONFIRMER', { at: now.toISOString(), reason: 'not_organizer' });
    return true;
  }
  // Accès Meet pas encore autorisé : le RDV reste en attente, il sera lu après la reconnexion.
  if (!access || !token) return false;

  const { status, data } = await conferenceRecords(token, meta.meetCode, start, end);
  if (status === 401 || status === 403) {
    // Accès refusé par Google (API Meet non activée…) : la personne peut trancher à la main,
    // et on réessaie de lire la présence toutes les 6 h.
    await setStatut(a.id, meta, 'A_CONFIRMER', { at: now.toISOString(), reason: 'no_access' });
    return true;
  }
  if (status !== 200) return false;

  const records: any[] = data.conferenceRecords || [];
  if (!records.length) {
    if (now.getTime() - end.getTime() < NO_RECORD_GRACE_MS) return false;
    await setStatut(a.id, meta, 'A_CONFIRMER', { at: now.toISOString(), reason: 'no_record' });
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
        { metadata: { path: ['meetCheck', 'reason'], equals: 'no_access' } },
      ],
    },
    select: { id: true, userId: true, metadata: true, entiteType: true, entiteId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const now = Date.now();
  const due = candidates.filter((a) => {
    if (!RDV_KINDS.includes(meetingKindOf(a))) return false;
    const end = meetingEnd(a);
    return !!end && end.getTime() < now - WAIT_AFTER_END_MS && end.getTime() > since.getTime();
  });
  if (!due.length) return;

  const internals = await loadInternals();
  const { getGoogleAccessToken } = await import('../integrations/google-auth.service.js');
  const tokens = new Map<string, { token: string | null; access: boolean }>();
  let done = 0;

  for (const a of due.slice(0, MAX_PER_RUN)) {
    if (!a.userId) continue;
    const meta = (a.metadata as Meta) || {};
    let auth = tokens.get(a.userId);
    if (!auth) {
      const access = await hasMeetAccess(a.userId);
      auth = { access, token: access ? await getGoogleAccessToken(a.userId) : null };
      tokens.set(a.userId, auth);
    }
    // Accès refusé récemment : on ne réessaie qu'au bout de 6 h.
    if (meta.rdvStatut === 'A_CONFIRMER') {
      const last = meta.meetCheck?.at ? new Date(meta.meetCheck.at).getTime() : 0;
      if (!auth.access || Date.now() - last < 6 * 3600 * 1000) continue;
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
