// Pendant le call : réception du transcript temps réel et cochage des questions.
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../lib/db.js';
import { callClaude } from '../../services/claudeAI.js';
import { aiAvailable as isAiConfigured } from './notes.types.js';
import { buildContext } from './notes.context.js';
import { DEMO } from './notes.demo.js';
import { prepareQuestions } from './notes.questions.js';
import { getUserLocale, promptLanguageLine, type Lang } from '../../lib/locale.js';
import type { CallType, LiveAlert, NoteQuestion, TranscriptSegment } from './notes.types.js';

/** Délai minimal entre deux analyses d'un même call (spec : 20 à 30 s). */
const ANALYSIS_EVERY_MS = 20_000;
const analyzing = new Set<string>();

/** Ajoute des segments au transcript (append atomique) et passe le call en cours si besoin. */
export async function appendSegments(callId: string, segments: TranscriptSegment[]): Promise<void> {
  if (!segments.length) return;
  await prisma.$executeRaw`UPDATE note_calls SET transcript = transcript || ${JSON.stringify(segments)}::jsonb, updated_at = NOW() WHERE id = ${callId}::uuid`;
  const call = await prisma.noteCall.findUnique({ where: { id: callId }, select: { status: true, questions: true } });
  if (call && (call.status === 'SCHEDULED' || call.status === 'JOINING')) await markInCall(callId);
  void maybeAnalyze(callId);
}

/** Début du call : la liste de questions est figée (elle reste modifiable). */
export async function markInCall(callId: string): Promise<void> {
  const call = await prisma.noteCall.findUnique({ where: { id: callId }, select: { questions: true, startedAt: true } });
  if (!call) return;
  if (!((call.questions as unknown as NoteQuestion[]) || []).length) await prepareQuestions(callId).catch(() => null);
  await prisma.noteCall.update({
    where: { id: callId },
    data: { status: 'IN_CALL', startedAt: call.startedAt ?? new Date(), questionsLockedAt: new Date() },
  });
}

/** Lance une analyse si de nouveaux échanges sont arrivés depuis la dernière (et au plus toutes les 20 s). */
export async function maybeAnalyze(callId: string, force = false): Promise<void> {
  if (analyzing.has(callId)) return;
  const call = await prisma.noteCall.findUnique({ where: { id: callId } });
  if (!call || call.status !== 'IN_CALL') return;
  const transcript = (call.transcript as unknown as TranscriptSegment[]) || [];
  if (transcript.length <= call.analyzedCount) return;
  if (!force && call.lastAnalyzedAt && Date.now() - call.lastAnalyzedAt.getTime() < ANALYSIS_EVERY_MS) return;
  analyzing.add(callId);
  try {
    await analyze(call, transcript);
  } catch (err) {
    console.error(`[Notes] Analyse live ${callId}:`, (err as Error).message);
  } finally {
    analyzing.delete(callId);
  }
}

const SYSTEM = `Tu suis un call de recrutement en direct pour un membre de l'équipe Humanup.
On te donne la liste des questions du brief avec leur statut, les nouveaux échanges du transcript, et un peu de contexte (CV, fiche Propium).
Pour chaque question à laquelle les NOUVEAUX échanges répondent (même si la réponse est venue spontanément, avant que la question soit posée) :
- "covered" si la réponse est complète et exploitable,
- "partial" si elle est incomplète ou vague (exemple : un salaire sans chiffre).
"answer" résume la réponse en une ligne, factuelle, avec les chiffres.
Ne renvoie que les questions qui changent. N'invente rien.
"relance" : si une réponse est vague, une relance courte à poser (une phrase), sinon null.
"contradiction" : si une réponse contredit le CV ou la fiche Propium, explique en une phrase, sinon null.
"language" : langue parlée dans le call, "fr" ou "en".
Réponds UNIQUEMENT en JSON : {"updates":[{"id":"...","status":"covered|partial","answer":"..."}],"relance":{"questionId":"...","text":"..."}|null,"contradiction":{"questionId":"...","text":"..."}|null,"language":"fr"}`;

const LANG_LABEL: Record<Lang, string> = { fr: 'français', en: 'anglais' };

/**
 * Langues du panneau live, données au modèle (rien n'est traduit après coup) :
 * - "answer" et "contradiction" sont lus par le membre : dans SA langue ;
 * - "relance" est dite à voix haute à la personne en face : dans la langue parlée du call.
 */
export function liveLanguageRules(recruiterLang: Lang, spokenLang: Lang | null): string {
  const spoken = spokenLang
    ? `en ${LANG_LABEL[spokenLang]} (langue parlée du call)`
    : 'dans la langue parlée dans les échanges du transcript';
  return `${promptLanguageLine(recruiterLang, '"answer" et "contradiction.text"')}
"relance.text" est une phrase que le membre pose à voix haute : écris-la ${spoken}.`;
}

async function analyze(call: any, transcript: TranscriptSegment[]): Promise<void> {
  const questions = ((call.questions as NoteQuestion[]) || []).map((q) => ({ ...q }));
  const fresh = transcript.slice(call.analyzedCount);
  const recent = transcript.slice(Math.max(0, call.analyzedCount - 6), call.analyzedCount);
  const now = new Date();

  if (!isAiConfigured() || !questions.length) {
    await prisma.noteCall.update({ where: { id: call.id }, data: { analyzedCount: transcript.length, lastAnalyzedAt: now } });
    return;
  }

  const open = questions.filter((q) => !q.manual && q.status !== 'covered');
  const ctx = await buildContext(call);
  const fmt = (s: TranscriptSegment) => `${s.speaker} : ${s.text}`;
  const { lang: recruiterLang } = await getUserLocale(call.userId);
  const res = await callClaude({
    feature: 'notes_live',
    preferAnthropic: true,
    userId: call.userId,
    systemPrompt: `${SYSTEM}\n${liveLanguageRules(recruiterLang, call.language === 'fr' || call.language === 'en' ? call.language : null)}`,
    userPrompt: [
      `QUESTIONS OUVERTES :\n${open.map((q) => `[${q.id}] (${q.status}${q.dealbreaker ? ', dealbreaker' : ''}) ${q.text}${q.answer ? ` | réponse partielle : ${q.answer}` : ''}`).join('\n') || '(aucune)'}`,
      recent.length ? `ÉCHANGES PRÉCÉDENTS (contexte) :\n${recent.map(fmt).join('\n')}` : '',
      `NOUVEAUX ÉCHANGES :\n${fresh.map(fmt).join('\n')}`,
      `CONTEXTE PROPIUM :\n${ctx.text.slice(0, 6000)}`,
    ].filter(Boolean).join('\n\n'),
    maxTokens: 1200,
    temperature: 0,
  });

  const out = res.content && typeof res.content === 'object' ? res.content : {};
  // Relire la version la plus récente : le membre a pu cocher à la main pendant l'analyse.
  const latest = await prisma.noteCall.findUnique({ where: { id: call.id }, select: { questions: true, alerts: true } });
  const current = ((latest?.questions as unknown as NoteQuestion[]) || questions).map((q) => ({ ...q }));
  for (const u of (out.updates || []) as any[]) {
    const q = current.find((x) => x.id === u?.id);
    if (!q || q.manual) continue;
    if (u.status === 'covered' || u.status === 'partial') {
      if (q.status === 'covered' && u.status === 'partial') continue;
      q.status = u.status;
      if (typeof u.answer === 'string' && u.answer.trim()) q.answer = u.answer.trim().slice(0, 300);
    }
  }

  const alerts = ((latest?.alerts as unknown as LiveAlert[]) || []).slice();
  const push = (kind: LiveAlert['kind'], a: any) => {
    if (!a?.text || typeof a.text !== 'string') return;
    if (alerts.some((x) => x.kind === kind && x.text === a.text)) return;
    alerts.push({ id: randomUUID().slice(0, 8), kind, questionId: a.questionId ?? null, text: a.text.slice(0, 300), at: now.toISOString() });
  };
  push('RELANCE', out.relance);
  push('CONTRADICTION', out.contradiction);

  await prisma.noteCall.update({
    where: { id: call.id },
    data: {
      questions: current as any,
      alerts: alerts.slice(-12) as any,
      analyzedCount: transcript.length,
      lastAnalyzedAt: now,
      ...(out.language === 'fr' || out.language === 'en' ? { language: out.language } : {}),
    },
  });
}

// ─── Simulation (sans Recall.ai) ─────────────────────

const demoRuns = new Map<string, ReturnType<typeof setInterval>>();

/** Rejoue un transcript de démonstration dans le pipeline live, puis génère les notes. */
export async function startDemo(callId: string, onEnd: (callId: string) => Promise<void>): Promise<void> {
  const call = await prisma.noteCall.findUnique({ where: { id: callId } });
  if (!call) throw new Error('Call introuvable');
  if (demoRuns.has(callId)) return;
  await prisma.noteCall.update({
    where: { id: callId },
    data: { transcript: [], analyzedCount: 0, alerts: [], lastAnalyzedAt: null, status: 'SCHEDULED', startedAt: null, endedAt: null, notes: Prisma.DbNull, notesMarkdown: null, notesSentAt: null, propiumLinks: [], duplicateFlags: [], tasksCreated: [], error: null },
  });
  // Les statuts repartent de zéro, sauf les choix manuels.
  const qs = ((call.questions as unknown as NoteQuestion[]) || []).map((q) => ({ ...q, status: 'todo', answer: null, manual: false }));
  await prisma.noteCall.update({ where: { id: callId }, data: { questions: qs as any } });

  const lines = DEMO[call.callType as CallType] || DEMO.QUALIF;
  let i = 0;
  const step = Number(process.env.NOTES_DEMO_STEP_MS || 3500);
  const timer = setInterval(async () => {
    try {
      if (i >= lines.length) {
        clearInterval(timer);
        demoRuns.delete(callId);
        await maybeAnalyze(callId, true);
        await onEnd(callId);
        return;
      }
      const [speaker, text] = lines[i];
      await appendSegments(callId, [{ speaker, text, t: Math.round((i * step) / 1000) }]);
      i++;
    } catch (err) {
      console.error('[Notes] Démo:', (err as Error).message);
    }
  }, step);
  demoRuns.set(callId, timer);
}

export function stopDemo(callId: string): void {
  const t = demoRuns.get(callId);
  if (t) clearInterval(t);
  demoRuns.delete(callId);
}

/** Toutes les 10 s : analyse des calls en cours qui ont reçu de nouveaux échanges. */
export async function tickLive(): Promise<void> {
  const calls = await prisma.noteCall.findMany({ where: { status: 'IN_CALL' }, select: { id: true } });
  for (const c of calls) await maybeAnalyze(c.id);
}
