// Tâches planifiées Humanup Notes :
//  - toutes les 5 min : lecture des agendas Google, création des calls, envoi des bots Recall
//  - toutes les minutes : suivi des bots, rappels 30 min avant, fin de call, récap de 19h
//  - toutes les 10 s : cochage live des calls en cours
//  - chaque nuit : suppression des transcripts de plus de 6 mois
import prisma from '../../lib/db.js';
import { getValidAccessToken } from '../integrations/calendar.service.js';
import { buildContext } from './notes.context.js';
import { classifyAttendees, detectCall, extractMeetingLink, isInternalEmail, meetingKey } from './notes.detect.js';
import { sendEveningEmail, sendTeamRecap } from './notes.emails.js';
import { sendCallBrief } from './notes.brief.js';
import { pollAllReplies } from './notes.reply.js';
import { finalizeCall } from './notes.finalize.js';
import { appendSegments, markInCall, tickLive } from './notes.live.js';
import { prepareQuestions } from './notes.questions.js';
import * as recall from './recall.client.js';
import type { NoteQuestion, TranscriptSegment } from './notes.types.js';

export const RETENTION_DAYS = Number(process.env.NOTES_RETENTION_DAYS || 180);
const SYNC_AHEAD_HOURS = 36;
const BOT_SCHEDULE_AHEAD_MS = 3 * 3600_000;

export async function notesUserSettings(userId: string) {
  return (await prisma.noteUserSettings.findUnique({ where: { userId } })) ?? { userId, enabled: true, timezone: 'Europe/Paris', lastRecapDate: null };
}

/** Membres actifs avec Google connecté et Humanup Notes activé. */
async function eligibleUsers() {
  const configs = await prisma.integrationConfig.findMany({
    where: { provider: { in: ['calendar', 'gmail'] }, enabled: true, accessToken: { not: null } },
    select: { userId: true },
  });
  const ids = [...new Set(configs.map((c) => c.userId))];
  if (!ids.length) return [];
  const users = await prisma.user.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { id: true, email: true, prenom: true, nom: true, role: true } });
  const settings = await prisma.noteUserSettings.findMany({ where: { userId: { in: ids } } });
  return users.filter((u) => settings.find((s) => s.userId === u.id)?.enabled !== false);
}

// ─── Synchro des agendas ─────────────────────────────

export async function syncAllCalendars(): Promise<void> {
  for (const u of await eligibleUsers()) {
    try {
      await syncUserCalendar(u.id, u.email);
    } catch (err) {
      console.error(`[Notes] Synchro agenda ${u.email}:`, (err as Error).message);
    }
  }
}

export async function syncUserCalendar(userId: string, userEmail: string): Promise<number> {
  const token = await getValidAccessToken(userId);
  const now = Date.now();
  const params = new URLSearchParams({
    timeMin: new Date(now - 2 * 3600_000).toISOString(),
    timeMax: new Date(now + SYNC_AHEAD_HOURS * 3600_000).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google Calendar ${res.status}`);
  const data = (await res.json()) as any;

  if (data.timeZone) {
    await prisma.noteUserSettings.upsert({ where: { userId }, update: { timezone: data.timeZone }, create: { userId, timezone: data.timeZone } });
  }

  let count = 0;
  for (const item of data.items || []) {
    if (!item.start?.dateTime) continue; // journée entière
    const self = (item.attendees || []).find((a: any) => a.self || a.email?.toLowerCase() === userEmail.toLowerCase());
    if (self?.responseStatus === 'declined') continue;
    const link = extractMeetingLink(item);
    if (!link) continue;
    const startAt = new Date(item.start.dateTime);
    const endAt = new Date(item.end?.dateTime || startAt.getTime() + 30 * 60_000);
    const key = meetingKey(link, startAt);

    if (item.status === 'cancelled') {
      await cancelByKey(key);
      continue;
    }
    // Événement déplacé : l'ancienne réunion (autre horaire) de ce membre est annulée.
    const moved = await prisma.noteCall.findMany({ where: { googleEventId: item.id, userId, meetingKey: { not: key }, status: 'SCHEDULED' } });
    for (const m of moved) await cancelCall(m.id);

    await upsertCall(userId, item, link, key, startAt, endAt);
    count++;
  }
  return count;
}

async function upsertCall(userId: string, item: any, link: { url: string; platform: 'MEET' | 'TEAMS' }, key: string, startAt: Date, endAt: Date) {
  const titre = String(item.summary || '(Sans titre)').slice(0, 500);
  const description = item.description ? String(item.description).slice(0, 20000) : null;
  const excludedByTitle = /\[no-?bot\]/i.test(titre);
  const rawAttendees = item.attendees?.length ? item.attendees : item.organizer ? [{ ...item.organizer, organizer: true }] : [];
  const attendees = await classifyAttendees(rawAttendees);

  const existing = await prisma.noteCall.findUnique({ where: { meetingKey: key } });
  if (existing) {
    const memberIds = existing.userId === userId || existing.memberIds.includes(userId) ? existing.memberIds : [...existing.memberIds, userId];
    const data: any = { titre, description, endAt, attendees: attendees as any, memberIds };
    if (excludedByTitle) data.excluded = true;
    // Le type et le rattachement restent ceux choisis à la main.
    if (existing.typeSource === 'AUTO' && existing.status === 'SCHEDULED') {
      const d = await detectCall(titre, description, attendees);
      Object.assign(data, { callType: d.callType, needsReview: d.needsReview, reviewReason: d.reviewReason, candidatId: existing.candidatId ?? d.candidatId, clientId: existing.clientId ?? d.clientId, mandatId: existing.mandatId ?? d.mandatId, leadId: existing.leadId ?? d.leadId });
    }
    await prisma.noteCall.update({ where: { id: existing.id }, data });
    return;
  }

  // Propriétaire : l'organisateur s'il est de Humanup, sinon le membre dont l'agenda est lu.
  const orgEmail = String(item.organizer?.email || '').toLowerCase();
  let ownerId = userId;
  if (orgEmail && isInternalEmail(orgEmail)) {
    const org = await prisma.user.findFirst({ where: { email: { equals: orgEmail, mode: 'insensitive' }, status: 'ACTIVE' }, select: { id: true } });
    if (org) ownerId = org.id;
  }
  const d = await detectCall(titre, description, attendees);
  await prisma.noteCall.create({
    data: {
      meetingKey: key, userId: ownerId, memberIds: ownerId === userId ? [] : [userId], googleEventId: item.id,
      titre, description, startAt, endAt, meetingUrl: link.url, platform: link.platform, attendees: attendees as any,
      callType: d.callType, needsReview: d.needsReview, reviewReason: d.reviewReason,
      candidatId: d.candidatId, clientId: d.clientId, mandatId: d.mandatId, leadId: d.leadId,
      excluded: excludedByTitle,
    },
  }).catch((err) => {
    // Deux agendas lus en même temps : l'autre a créé la réunion, on se rattache au prochain passage.
    if (!String(err?.code).includes('P2002')) throw err;
  });
}

async function cancelByKey(key: string) {
  const c = await prisma.noteCall.findUnique({ where: { meetingKey: key } });
  if (c && c.status === 'SCHEDULED') await cancelCall(c.id);
}

export async function cancelCall(id: string) {
  const c = await prisma.noteCall.findUnique({ where: { id } });
  if (!c) return;
  if (c.recallBotId && recall.isRecallConfigured()) await recall.deleteScheduledBot(c.recallBotId).catch(() => null);
  await prisma.noteCall.update({ where: { id }, data: { status: 'CANCELLED', recallBotId: null } });
}

// ─── Bots Recall ─────────────────────────────────────

export async function scheduleBots(): Promise<void> {
  if (!recall.isRecallConfigured()) return;
  const now = Date.now();
  const calls = await prisma.noteCall.findMany({
    where: { status: 'SCHEDULED', startAt: { lte: new Date(now + BOT_SCHEDULE_AHEAD_MS) }, endAt: { gt: new Date(now) } },
  });
  for (const c of calls) {
    try {
      const owner = await notesUserSettings(c.userId);
      const off = c.excluded || !owner.enabled;
      if (off && c.recallBotId) {
        await recall.deleteScheduledBot(c.recallBotId).catch(() => null);
        await prisma.noteCall.update({ where: { id: c.id }, data: { recallBotId: null } });
      } else if (!off && !c.recallBotId) {
        const bot = await recall.createBot({ noteCallId: c.id, webhookSecret: c.webhookSecret, meetingUrl: c.meetingUrl, joinAt: new Date(c.startAt.getTime() - 60_000), language: guessLanguage(c) });
        await prisma.noteCall.update({ where: { id: c.id }, data: { recallBotId: bot.id } });
      }
    } catch (err) {
      console.error(`[Notes] Bot ${c.id}:`, (err as Error).message);
      await prisma.noteCall.update({ where: { id: c.id }, data: { error: (err as Error).message.slice(0, 500) } }).catch(() => null);
    }
  }
}

/** Suivi des bots partis : arrivée dans le call, fin, erreur. */
export async function pollBots(): Promise<void> {
  if (!recall.isRecallConfigured()) return;
  const calls = await prisma.noteCall.findMany({
    where: { recallBotId: { not: null }, status: { in: ['SCHEDULED', 'JOINING', 'IN_CALL'] }, startAt: { lte: new Date(Date.now() + 2 * 60_000) } },
  });
  for (const c of calls) {
    try {
      const bot = await recall.getBot(c.recallBotId!);
      await applyBotStatus(c.id, recall.lastStatusCode(bot), bot);
    } catch (err) {
      console.error(`[Notes] Statut bot ${c.id}:`, (err as Error).message);
    }
  }
}

export async function applyBotStatus(callId: string, code: string | null, bot?: any): Promise<void> {
  if (!code) return;
  const c = await prisma.noteCall.findUnique({ where: { id: callId } });
  if (!c || ['DONE', 'CANCELLED', 'PROCESSING', 'FAILED'].includes(c.status)) return;
  if (['joining_call', 'in_waiting_room'].includes(code) && c.status === 'SCHEDULED') {
    await prisma.noteCall.update({ where: { id: callId }, data: { status: 'JOINING' } });
  } else if (['in_call_recording', 'in_call_not_recording'].includes(code) && c.status !== 'IN_CALL') {
    await markInCall(callId);
  } else if (['call_ended', 'done', 'analysis_done'].includes(code)) {
    if (retranscribing.has(callId)) return;
    let current = (c.transcript as unknown as TranscriptSegment[]) || [];
    if (bot && code !== 'call_ended') {
      const final = await recall.fetchFinalTranscript(bot).catch(() => null);
      if (final && final.length && textLength(final) >= textLength(current)) {
        await prisma.noteCall.update({ where: { id: callId }, data: { transcript: final as any } });
        current = final;
      }
    }
    const endedAt = c.endedAt ?? new Date();
    if (!c.endedAt) await prisma.noteCall.update({ where: { id: callId }, data: { endedAt } });
    if (isThin(current, c.startedAt, endedAt)) {
      // Sous-titres quasi vides (souvent : langue des sous-titres différente de celle parlée).
      // On attend l'enregistrement terminé puis on fait retranscrire l'audio.
      if (code === 'call_ended') return;
      const recId = bot ? recall.recordingId(bot) : null;
      if (recId) {
        void retranscribe(callId, recId);
        return;
      }
    }
    await finalizeCall(callId);
    if (bot && code !== 'call_ended') await dropMedia(callId);
  } else if (code === 'fatal') {
    const sub = bot?.status_changes?.at(-1)?.sub_code;
    if ((c.transcript as unknown as any[])?.length) await finalizeCall(callId);
    else await prisma.noteCall.update({ where: { id: callId }, data: { status: 'FAILED', error: `Le bot n’a pas pu rejoindre le call${sub ? ` (${sub})` : ''}.` } });
  }
}

/** L'audio n'est gardé chez Recall que le temps d'écrire les notes. */
async function dropMedia(callId: string): Promise<void> {
  const c = await prisma.noteCall.findUnique({ where: { id: callId }, select: { recallBotId: true, status: true } });
  if (c?.recallBotId && c.status === 'DONE') await recall.deleteBotMedia(c.recallBotId).catch(() => null);
}

const retranscribing = new Set<string>();
const textLength = (segs: { text: string }[]) => segs.reduce((n, s) => n + (s.text?.length || 0), 0);

/** Moins de 100 caractères par minute de call : les sous-titres n'ont presque rien capté. */
function isThin(segs: TranscriptSegment[], startedAt: Date | null, endedAt: Date): boolean {
  if (!startedAt) return false;
  const minutes = (endedAt.getTime() - startedAt.getTime()) / 60_000;
  return minutes >= 3 && textLength(segs) < 100 * minutes;
}

/** Transcription complète de l'audio après le call (langue détectée), puis notes. */
async function retranscribe(callId: string, recId: string): Promise<void> {
  retranscribing.add(callId);
  try {
    const job = await recall.createAsyncTranscript(recId);
    const deadline = Date.now() + 20 * 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20_000));
      const res = await recall.getAsyncTranscript(job.id);
      if (res.status === 'processing') continue;
      const c = await prisma.noteCall.findUnique({ where: { id: callId }, select: { transcript: true } });
      const current = (c?.transcript as unknown as TranscriptSegment[]) || [];
      if (res.status === 'done' && textLength(res.segments) > textLength(current)) {
        await prisma.noteCall.update({
          where: { id: callId },
          data: { transcript: res.segments as any, ...(res.language ? { language: res.language } : {}) },
        });
      }
      break;
    }
  } catch (err) {
    console.error(`[Notes] Retranscription ${callId}:`, (err as Error).message);
  } finally {
    retranscribing.delete(callId);
  }
  await finalizeCall(callId);
  await dropMedia(callId);
}

/** Langue probable du call avant qu'il commence (titre + questions préparées) : règle les sous-titres du bot. */
export function guessLanguage(c: { titre: string; questions: unknown; language: string | null }): 'fr' | 'en' | null {
  if (c.language === 'fr' || c.language === 'en') return c.language;
  const qs = ((c.questions as unknown as NoteQuestion[]) || []).map((q) => q.text || '').join(' ');
  const words = `${c.titre} ${qs}`.toLowerCase().match(/[a-zàâçéèêëîïôûùüÿœ']+/g) || [];
  const EN = new Set(['the', 'with', 'and', 'you', 'your', 'what', 'are', 'for', 'call', 'interview', 'meeting', 'chat', 'how', 'is', 'of', 'to', 'can', 'do']);
  const FR = new Set(['le', 'la', 'les', 'avec', 'et', 'vous', 'votre', 'quel', 'quelle', 'est', 'pour', 'entretien', 'échange', 'un', 'une', 'des', 'du', 'de', 'comment']);
  let en = 0;
  let fr = 0;
  for (const w of words) {
    if (EN.has(w)) en++;
    if (FR.has(w)) fr++;
  }
  return en > fr ? 'en' : fr > 0 ? 'fr' : null;
}

/** Filet de sécurité : un call en cours sans nouvel échange depuis 10 min après l'heure de fin est clôturé. */
async function closeStaleCalls(): Promise<void> {
  const calls = await prisma.noteCall.findMany({
    where: { status: 'IN_CALL', endAt: { lt: new Date(Date.now() - 10 * 60_000) }, updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    select: { id: true },
  });
  for (const c of calls) if (!retranscribing.has(c.id)) await finalizeCall(c.id);
}

// ─── Préparation et rappel 30 min avant ──────────────

async function prepareUpcoming(): Promise<void> {
  const now = Date.now();
  const calls = await prisma.noteCall.findMany({
    where: { status: 'SCHEDULED', excluded: false, startAt: { gte: new Date(now), lte: new Date(now + 35 * 60_000) } },
  });
  for (const c of calls) {
    try {
      const minutes = (c.startAt.getTime() - now) / 60_000;
      if (!c.reminderSentAt && (c.callType === 'QUALIF' || c.callType === 'INTAKE') && minutes <= 32) {
        // Marqué avant l'envoi : pas de doublon si la génération prend plus d'une minute.
        await prisma.noteCall.update({ where: { id: c.id }, data: { reminderSentAt: new Date() } });
        await sendCallBrief(c.id);
      }
      // À 5 min du début, la liste est prête (trame, IA ou template du type de call).
      if (minutes <= 5 && !((c.questions as unknown as any[]) || []).length) await prepareQuestions(c.id);
    } catch (err) {
      console.error(`[Notes] Préparation ${c.id}:`, (err as Error).message);
    }
  }
}

// ─── Récap du soir (19h heure locale) ────────────────

function localParts(tz: string, d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

/** Début de la journée locale `date` (AAAA-MM-JJ) dans le fuseau `tz`, en UTC. */
export function startOfLocalDay(date: string, tz: string): Date {
  const guess = new Date(`${date}T00:00:00Z`);
  const lp = localParts(tz, guess);
  const asUtc = Date.UTC(Number(lp.date.slice(0, 4)), Number(lp.date.slice(5, 7)) - 1, Number(lp.date.slice(8, 10)), lp.hour, lp.minute);
  const offset = asUtc - guess.getTime(); // décalage du fuseau à cet instant
  return new Date(guess.getTime() - offset);
}

async function userDay(userId: string, tz: string, date: string) {
  const start = startOfLocalDay(date, tz);
  const end = new Date(start.getTime() + 24 * 3600_000);
  const end2 = new Date(end.getTime() + 24 * 3600_000);
  const mine = { OR: [{ userId }, { memberIds: { has: userId } }] };
  const today = await prisma.noteCall.findMany({ where: { ...mine, startAt: { gte: start, lt: end }, status: { notIn: ['CANCELLED'] }, excluded: false }, orderBy: { startAt: 'asc' } });
  const tomorrow = await prisma.noteCall.findMany({ where: { ...mine, startAt: { gte: end, lt: end2 }, status: { notIn: ['CANCELLED'] } }, orderBy: { startAt: 'asc' } });
  for (const c of tomorrow as any[]) c._missing = c.excluded ? [] : (await buildContext(c)).missing;
  const tasksTomorrow = await prisma.activite.findMany({
    where: { isTache: true, tacheCompleted: false, userId, tacheDueDate: { gte: end, lt: end2 } },
    select: { titre: true, tacheDueDate: true },
    take: 30,
  });
  return { today, tomorrow, tasksTomorrow };
}

export async function runEveningRecap(force?: { userId: string }): Promise<number> {
  let sent = 0;
  const users = force ? (await eligibleUsers()).filter((u) => u.id === force.userId) : await eligibleUsers();
  for (const u of users) {
    try {
      const s = await notesUserSettings(u.id);
      const lp = localParts(s.timezone);
      if (!force && (lp.hour !== 19 || s.lastRecapDate === lp.date)) continue;
      await prisma.noteUserSettings.upsert({ where: { userId: u.id }, update: { lastRecapDate: lp.date }, create: { userId: u.id, lastRecapDate: lp.date, timezone: s.timezone } });
      const day = await userDay(u.id, s.timezone, lp.date);
      if (force || day.today.length || day.tomorrow.length || day.tasksTomorrow.length) {
        await sendEveningEmail(u, day, s.timezone);
        sent++;
      }
      if (u.role === 'ADMIN') {
        const team = await eligibleUsers();
        const perUser = [];
        for (const m of team) {
          const ms = await notesUserSettings(m.id);
          const start = startOfLocalDay(localParts(ms.timezone).date, ms.timezone);
          const today = await prisma.noteCall.findMany({ where: { userId: m.id, startAt: { gte: start, lt: new Date(start.getTime() + 24 * 3600_000) }, status: { notIn: ['CANCELLED'] }, excluded: false }, orderBy: { startAt: 'asc' } });
          perUser.push({ name: `${m.prenom ?? ''} ${m.nom}`.trim(), today });
        }
        if (force || perUser.some((p) => p.today.length)) await sendTeamRecap([u.email], perUser);
      }
    } catch (err) {
      console.error(`[Notes] Récap du soir ${u.email}:`, (err as Error).message);
    }
  }
  return sent;
}

// ─── Conservation : transcripts supprimés après 6 mois ─

export async function purgeOldTranscripts(): Promise<void> {
  const limit = new Date(Date.now() - RETENTION_DAYS * 86_400_000);
  const r = await prisma.noteCall.updateMany({
    where: { startAt: { lt: limit }, transcriptPurgedAt: null },
    data: { transcript: [], transcriptPurgedAt: new Date() },
  });
  const a = await prisma.activite.deleteMany({
    where: { type: 'TRANSCRIPT', createdAt: { lt: limit }, metadata: { path: ['source'], equals: 'humanup_notes' } },
  });
  if (r.count || a.count) console.log(`[Notes] Purge : ${r.count} transcript(s) de call, ${a.count} activité(s) transcript supprimés.`);
}

// ─── Démarrage ───────────────────────────────────────

let started = false;
let lastPurge = '';

export function startNotesJobs(): void {
  if (started || process.env.NOTES_DISABLED === 'true') return;
  started = true;
  const safe = (name: string, fn: () => Promise<void>) => async () => {
    try { await fn(); } catch (err) { console.error(`[Notes] ${name}:`, (err as Error).message); }
  };
  setInterval(safe('synchro', async () => { await syncAllCalendars(); await scheduleBots(); }), 5 * 60_000);
  // Réponses par email aux emails Notes (lues dans les boîtes Gmail connectées).
  setInterval(safe('réponses email', pollAllReplies), 2 * 60_000);
  setInterval(safe('minute', async () => {
    await pollBots();
    await prepareUpcoming();
    await closeStaleCalls();
    await runEveningRecap();
    const day = new Date().toISOString().slice(0, 10);
    if (lastPurge !== day) { lastPurge = day; await purgeOldTranscripts(); }
  }), 60_000);
  setInterval(safe('live', tickLive), 10_000);
  // Premier passage peu après le démarrage.
  setTimeout(safe('synchro initiale', async () => { await syncAllCalendars(); await scheduleBots(); }), 20_000);
  console.log(`[Notes] Jobs démarrés (Recall ${recall.isRecallConfigured() ? 'branché' : 'non configuré : mode simulation'}).`);
}

export { appendSegments };
