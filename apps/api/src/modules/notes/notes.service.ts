import { createRequire } from 'module';
import prisma from '../../lib/db.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { buildContext } from './notes.context.js';
import { finalizeCall } from './notes.finalize.js';
import { startDemo, stopDemo } from './notes.live.js';
import { newQuestion, prepareQuestions } from './notes.questions.js';
import * as recall from './recall.client.js';
import { notesUserSettings, RETENTION_DAYS } from './notes.scheduler.js';
import { CALL_TYPES, targetMinutes, type CallType, type NoteQuestion, type QuestionStatus } from './notes.types.js';

const require = createRequire(import.meta.url);

type Requester = { userId: string; userRole: string };

/** Jamais renvoyés au navigateur : le secret du webhook Recall et le transcript (route dédiée). */
function strip<T extends { webhookSecret?: string; transcript?: unknown }>(c: T) {
  const { webhookSecret: _s, transcript: _t, ...rest } = c;
  return rest;
}

async function load(id: string, who: Requester) {
  const call = await prisma.noteCall.findUnique({ where: { id } });
  if (!call) throw new NotFoundError('Call', id);
  if (who.userRole !== 'ADMIN' && call.userId !== who.userId && !call.memberIds.includes(who.userId)) throw new ForbiddenError('Ce call ne vous concerne pas');
  return call;
}

/** Liste « à venir » (dès maintenant) ou « passés ». */
export async function listCalls(who: Requester, range: 'upcoming' | 'past', all = false) {
  const now = new Date();
  const mine = all && who.userRole === 'ADMIN' ? {} : { OR: [{ userId: who.userId }, { memberIds: { has: who.userId } }] };
  const when = range === 'upcoming'
    ? { endAt: { gte: now }, status: { notIn: ['DONE', 'FAILED', 'CANCELLED'] } }
    : { OR: [{ endAt: { lt: now } }, { status: { in: ['DONE', 'FAILED', 'CANCELLED', 'PROCESSING'] } }] };
  const calls = await prisma.noteCall.findMany({
    where: { AND: [mine, when] },
    orderBy: { startAt: range === 'upcoming' ? 'asc' : 'desc' },
    take: range === 'upcoming' ? 60 : 100,
    select: {
      id: true, titre: true, startAt: true, endAt: true, platform: true, callType: true, typeSource: true, needsReview: true, reviewReason: true,
      excluded: true, status: true, attendees: true, questions: true, userId: true, brief: true, recallBotId: true, error: true, propiumLinks: true,
      candidatId: true, clientId: true, mandatId: true, leadId: true,
    },
  });
  const ownerIds = [...new Set(calls.map((c) => c.userId))];
  const owners = await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, prenom: true, nom: true } });
  return {
    recallConfigured: recall.isRecallConfigured(),
    calls: calls.map((c) => {
      const qs = (c.questions as unknown as NoteQuestion[]) || [];
      const o = owners.find((u) => u.id === c.userId);
      return {
        ...c,
        questions: undefined,
        brief: undefined,
        hasBrief: !!c.brief?.trim(),
        questionCount: qs.length,
        uncoveredDealbreakers: qs.filter((q) => q.dealbreaker && q.status !== 'covered').length,
        owner: o ? `${o.prenom ?? ''} ${o.nom}`.trim() : null,
      };
    }),
  };
}

export async function getCall(id: string, who: Requester) {
  const call = await load(id, who);
  const ctx = await buildContext(call);
  const [candidat, client, mandat, lead] = await Promise.all([
    call.candidatId ? prisma.candidat.findUnique({ where: { id: call.candidatId }, select: { id: true, prenom: true, nom: true, posteActuel: true, entrepriseActuelle: true, cvTexte: true } }) : null,
    call.clientId ? prisma.client.findUnique({ where: { id: call.clientId }, select: { id: true, prenom: true, nom: true, entreprise: { select: { nom: true } } } }) : null,
    call.mandatId ? prisma.mandat.findUnique({ where: { id: call.mandatId }, select: { id: true, titrePoste: true, entreprise: { select: { nom: true } } } }) : null,
    call.leadId ? prisma.lead.findUnique({ where: { id: call.leadId }, select: { id: true, contact: true, company: true } }) : null,
  ]);
  return {
    ...call,
    transcriptCount: ((call.transcript as unknown as any[]) || []).length,
    transcript: undefined,
    webhookSecret: undefined,
    missing: ctx.missing,
    hasTrame: ctx.trame.length > 0,
    targetMinutes: targetMinutes(call.callType as CallType, call.startAt, call.endAt),
    recallConfigured: recall.isRecallConfigured(),
    retentionDays: RETENTION_DAYS,
    linked: {
      candidat: candidat ? { id: candidat.id, label: `${candidat.prenom ?? ''} ${candidat.nom}`.trim(), sub: [candidat.posteActuel, candidat.entrepriseActuelle].filter(Boolean).join(' · '), hasCv: !!candidat.cvTexte } : null,
      client: client ? { id: client.id, label: `${client.prenom ?? ''} ${client.nom}`.trim(), sub: client.entreprise.nom } : null,
      mandat: mandat ? { id: mandat.id, label: mandat.titrePoste, sub: mandat.entreprise.nom } : null,
      lead: lead ? { id: lead.id, label: lead.contact, sub: lead.company } : null,
    },
  };
}

export async function getTranscript(id: string, who: Requester) {
  const call = await load(id, who);
  return { transcript: call.transcript, purgedAt: call.transcriptPurgedAt };
}

/** État léger interrogé toutes les 2-3 s par le panneau live. */
export async function getLive(id: string, who: Requester) {
  const call = await load(id, who);
  const t = (call.transcript as unknown as { speaker: string; text: string }[]) || [];
  return {
    id: call.id, titre: call.titre, status: call.status, callType: call.callType, platform: call.platform,
    startAt: call.startAt, endAt: call.endAt, startedAt: call.startedAt, endedAt: call.endedAt,
    questions: call.questions, alerts: call.alerts, lastAnalyzedAt: call.lastAnalyzedAt,
    transcriptTail: t.slice(-4), transcriptCount: t.length,
    targetMinutes: targetMinutes(call.callType as CallType, call.startAt, call.endAt),
    recallConfigured: recall.isRecallConfigured(), hasBot: !!call.recallBotId, meetingUrl: call.meetingUrl,
    propiumLinks: call.propiumLinks, error: call.error,
  };
}

export async function updateCall(id: string, who: Requester, body: {
  callType?: string; candidatId?: string | null; clientId?: string | null; mandatId?: string | null; leadId?: string | null; brief?: string | null; excluded?: boolean; language?: string | null;
}) {
  const call = await load(id, who);
  const data: any = {};
  if (body.callType !== undefined) {
    if (!CALL_TYPES.includes(body.callType as CallType)) throw new ValidationError('Type de call inconnu');
    data.callType = body.callType;
  }
  for (const k of ['candidatId', 'clientId', 'mandatId', 'leadId'] as const) if (body[k] !== undefined) data[k] = body[k] || null;
  if (body.callType !== undefined || ['candidatId', 'clientId', 'mandatId', 'leadId'].some((k) => (body as any)[k] !== undefined)) {
    data.typeSource = 'MANUEL';
    data.needsReview = false;
    data.reviewReason = null;
  }
  if (body.brief !== undefined) data.brief = body.brief?.slice(0, 60_000) || null;
  if (body.language !== undefined && body.language !== call.language) {
    if (body.language !== null && body.language !== 'fr' && body.language !== 'en') throw new ValidationError('Langue inconnue');
    data.language = body.language;
    // Bot déjà programmé avec d'autres sous-titres : on le refait avec la bonne langue.
    if (call.recallBotId && call.status === 'SCHEDULED' && recall.isRecallConfigured()) {
      await recall.deleteScheduledBot(call.recallBotId).catch(() => null);
      data.recallBotId = null;
      setTimeout(() => { import('./notes.scheduler.js').then((m) => m.scheduleBots()).catch(() => null); }, 1000);
    }
  }
  if (body.excluded !== undefined) {
    data.excluded = body.excluded;
    if (body.excluded && call.recallBotId && call.status === 'SCHEDULED' && recall.isRecallConfigured()) {
      await recall.deleteScheduledBot(call.recallBotId).catch(() => null);
      data.recallBotId = null;
    }
  }
  return strip(await prisma.noteCall.update({ where: { id }, data }));
}

/** CV, JD ou dossier en PDF : le texte est ajouté au brief du call. */
export async function addBriefDocument(id: string, who: Requester, buffer: Buffer, filename: string, mimetype: string) {
  const call = await load(id, who);
  let text = '';
  if (mimetype === 'application/pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ verbosity: 0, data: buffer });
    await parser.load();
    const r = await parser.getText();
    await parser.destroy();
    text = (typeof r === 'string' ? r : r?.text || '').trim();
  } else if (mimetype.startsWith('text/')) {
    text = buffer.toString('utf8');
  } else {
    throw new ValidationError('Formats acceptés : PDF ou texte.');
  }
  if (!text) throw new ValidationError('Impossible de lire le texte de ce document (PDF scanné ?).');
  const brief = `${call.brief ? `${call.brief}\n\n` : ''}=== ${filename} ===\n${text}`.slice(0, 60_000);
  const docs = [...((call.briefDocs as any[]) || []), { name: filename, at: new Date().toISOString(), chars: text.length }];
  return strip(await prisma.noteCall.update({ where: { id }, data: { brief, briefDocs: docs as any } }));
}

export async function regenerateQuestions(id: string, who: Requester) {
  await load(id, who);
  return strip(await prepareQuestions(id, { force: true, userId: who.userId }));
}

/** Édition de la liste : ajout, suppression, ordre, dealbreakers. Les statuts existants sont conservés. */
export async function saveQuestions(id: string, who: Requester, list: { id?: string; text: string; dealbreaker?: boolean }[]) {
  const call = await load(id, who);
  const prev = (call.questions as unknown as NoteQuestion[]) || [];
  const next: NoteQuestion[] = list
    .filter((q) => q.text?.trim())
    .slice(0, 40)
    .map((q) => {
      const old = q.id ? prev.find((p) => p.id === q.id) : null;
      return old ? { ...old, text: q.text.trim(), dealbreaker: !!q.dealbreaker } : newQuestion(q.text, !!q.dealbreaker);
    });
  return strip(await prisma.noteCall.update({ where: { id }, data: { questions: next as any, questionsSource: call.questionsSource || 'MANUEL' } }));
}

/** Cochage manuel : prime sur le statut automatique. */
export async function setQuestionStatus(id: string, who: Requester, qid: string, status: QuestionStatus, answer?: string | null) {
  const call = await load(id, who);
  const qs = ((call.questions as unknown as NoteQuestion[]) || []).map((q) =>
    q.id === qid ? { ...q, status, manual: true, ...(answer !== undefined ? { answer } : {}) } : q,
  );
  return strip(await prisma.noteCall.update({ where: { id }, data: { questions: qs as any } }));
}

export async function dismissAlert(id: string, who: Requester, alertId: string) {
  const call = await load(id, who);
  const alerts = ((call.alerts as any[]) || []).filter((a) => a.id !== alertId);
  return strip(await prisma.noteCall.update({ where: { id }, data: { alerts } }));
}

/** Un participant refuse : le bot quitte le call et rien n'est conservé. */
export async function removeBot(id: string, who: Requester) {
  const call = await load(id, who);
  stopDemo(id);
  if (call.recallBotId && recall.isRecallConfigured()) {
    if (call.status === 'SCHEDULED') await recall.deleteScheduledBot(call.recallBotId).catch(() => null);
    else {
      await recall.leaveCall(call.recallBotId).catch(() => null);
      await recall.deleteBotMedia(call.recallBotId).catch(() => null);
    }
  }
  return strip(await prisma.noteCall.update({
    where: { id },
    data: { status: 'CANCELLED', excluded: true, transcript: [], alerts: [], analyzedCount: 0, error: 'Bot retiré à la demande d’un participant : rien n’a été conservé.' },
  }));
}

export async function endCall(id: string, who: Requester) {
  const call = await load(id, who);
  stopDemo(id);
  if (call.recallBotId && recall.isRecallConfigured() && ['JOINING', 'IN_CALL'].includes(call.status)) await recall.leaveCall(call.recallBotId).catch(() => null);
  void finalizeCall(id);
  return { ok: true };
}

export async function runDemo(id: string, who: Requester) {
  const call = await load(id, who);
  if (!((call.questions as unknown as any[]) || []).length) await prepareQuestions(id, { userId: who.userId });
  await startDemo(id, finalizeCall);
  return { ok: true };
}

/** Call ajouté à la main (hors agenda) : utile pour tester ou pour un lien reçu au dernier moment. */
export async function createManualCall(who: Requester, body: { titre: string; meetingUrl: string; startAt: string; durationMin?: number; callType?: string }) {
  const { extractMeetingLink, meetingKey } = await import('./notes.detect.js');
  const link = extractMeetingLink({ location: body.meetingUrl }) ?? (body.meetingUrl === 'demo' ? { url: `demo://${Date.now()}`, platform: 'MEET' as const } : null);
  if (!link) throw new ValidationError('Lien Google Meet ou Teams invalide.');
  const startAt = new Date(body.startAt);
  if (Number.isNaN(startAt.getTime())) throw new ValidationError('Date invalide');
  const type = CALL_TYPES.includes(body.callType as CallType) ? (body.callType as CallType) : 'QUALIF';
  const created = await prisma.noteCall.create({
    data: {
      meetingKey: meetingKey(link, startAt), userId: who.userId, titre: body.titre.slice(0, 500), startAt,
      endAt: new Date(startAt.getTime() + (body.durationMin || 30) * 60_000), meetingUrl: link.url, platform: link.platform,
      callType: type, typeSource: 'MANUEL',
    },
  });
  return { id: created.id, titre: created.titre, startAt: created.startAt, callType: created.callType };
}

export async function getSettings(userId: string) {
  const s = await notesUserSettings(userId);
  const google = await prisma.integrationConfig.findFirst({ where: { userId, provider: { in: ['calendar', 'gmail'] }, enabled: true, accessToken: { not: null } }, select: { provider: true } });
  return { enabled: s.enabled, timezone: s.timezone, googleConnected: !!google, recallConfigured: recall.isRecallConfigured(), botName: recall.BOT_NAME, retentionDays: RETENTION_DAYS };
}

export async function updateSettings(userId: string, body: { enabled?: boolean; timezone?: string }) {
  if (body.timezone) {
    try { new Intl.DateTimeFormat('fr-FR', { timeZone: body.timezone }); } catch { throw new ValidationError('Fuseau horaire inconnu'); }
  }
  await prisma.noteUserSettings.upsert({
    where: { userId },
    update: { ...(body.enabled !== undefined ? { enabled: body.enabled } : {}), ...(body.timezone ? { timezone: body.timezone } : {}) },
    create: { userId, enabled: body.enabled ?? true, ...(body.timezone ? { timezone: body.timezone } : {}) },
  });
  return getSettings(userId);
}
