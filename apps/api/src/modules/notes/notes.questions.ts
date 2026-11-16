// Préparation des questions d'un call : trame du mandat, brief, ou génération
// par Claude depuis la JD, la scorecard et le CV. Repli sur le template du type.
import { randomUUID } from 'crypto';
import prisma from '../../lib/db.js';
import { callClaude } from '../../services/claudeAI.js';
import { aiAvailable as isAiConfigured } from './notes.types.js';
import { buildContext } from './notes.context.js';
import { TEMPLATES } from './notes.templates.js';
import { CALL_TYPE_LABEL, type CallType, type NoteQuestion } from './notes.types.js';

export function newQuestion(text: string, dealbreaker = false, trameId: string | null = null): NoteQuestion {
  return { id: randomUUID().slice(0, 8), text: text.trim(), dealbreaker, status: 'todo', answer: null, manual: false, trameId };
}

export function templateQuestions(type: CallType): NoteQuestion[] {
  return TEMPLATES[type].map((q) => newQuestion(q.text, !!q.dealbreaker));
}

const SYSTEM = `Tu prépares la liste de questions d'un call pour un cabinet de recrutement (Humanup, profils sales et business).
Règles :
- Reprends d'abord les questions du brief ou de la trame du mandat quand elles existent, sans les reformuler inutilement.
- Sinon, génère-les depuis la fiche de poste et la scorecard.
- Pour une qualif avec CV : retire ce que le CV dit déjà clairement, creuse les points flous (chiffres absents, trous dans le parcours, durées courtes en poste) et ajoute 2 ou 3 questions de vérification du track record (chiffres, deals, classement).
- Une qualif dure 15 minutes : 8 à 12 questions maximum, les dealbreakers du poste d'abord.
- Marque "dealbreaker": true pour les questions obligatoires (critères éliminatoires du poste, salaire, préavis, localisation si contrainte).
- Questions courtes, une seule idée par question, tutoiement pour un candidat, vouvoiement pour un client ou un prospect.
- Écris dans la langue du contexte (français par défaut, anglais si le brief ou le poste sont en anglais).
Réponds UNIQUEMENT en JSON : {"questions":[{"text":"...","dealbreaker":true,"fromTrame":"<id de la question de trame ou null>"}]}`;

/**
 * Génère et enregistre les questions d'un call.
 * `force` : écrase une liste existante (bouton « Régénérer »).
 */
export async function prepareQuestions(callId: string, opts: { force?: boolean; userId?: string } = {}) {
  const call = await prisma.noteCall.findUnique({ where: { id: callId } });
  if (!call) throw new Error('Call introuvable');
  const existing = (call.questions as unknown as NoteQuestion[]) || [];
  if (existing.length && !opts.force) return call;

  const type = call.callType as CallType;
  const ctx = await buildContext(call);
  let questions: NoteQuestion[] = [];
  let source = 'TEMPLATE';

  const richContext = ctx.hasBrief || ctx.trame.length > 0 || call.candidatId || call.mandatId || call.clientId || call.leadId;
  if (type !== 'INTERNE' && richContext && isAiConfigured()) {
    try {
      const res = await callClaude({
        feature: 'notes_questions',
        preferAnthropic: true,
        userId: opts.userId || call.userId,
        systemPrompt: SYSTEM,
        userPrompt: `Type de call : ${CALL_TYPE_LABEL[type]}\nQuestions types de ce type de call (à utiliser si le contexte ne dit rien de mieux) :\n${TEMPLATES[type].map((q) => `- ${q.text}`).join('\n')}\n\nCONTEXTE :\n${ctx.text}\n\nTrame (ids) : ${JSON.stringify(ctx.trame)}`,
        maxTokens: 2500,
        temperature: 0.2,
      });
      const list = (res.content?.questions ?? []) as any[];
      questions = list
        .filter((q) => typeof q?.text === 'string' && q.text.trim())
        .slice(0, 20)
        .map((q) => newQuestion(q.text, !!q.dealbreaker, ctx.trame.some((t) => t.id === q.fromTrame) ? q.fromTrame : null));
      if (questions.length) source = 'IA';
    } catch (err) {
      console.error('[Notes] Génération des questions impossible:', (err as Error).message);
    }
  }

  if (!questions.length && ctx.trame.length && type === 'QUALIF') {
    questions = ctx.trame.map((q) => newQuestion(q.text, false, q.id));
    source = 'TRAME';
  }
  if (!questions.length && type === 'INTERNE' && call.brief?.trim()) {
    // Ordre du jour saisi par l'organisateur : une ligne = un point.
    questions = call.brief.split('\n').map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim()).filter((l) => l.length > 2).slice(0, 15).map((l) => newQuestion(l));
    if (questions.length) questions.push(newQuestion('Actions : qui fait quoi, pour quand ?', true));
    source = 'MANUEL';
  }
  if (!questions.length) questions = templateQuestions(type);

  return prisma.noteCall.update({
    where: { id: callId },
    data: { questions: questions as any, questionsSource: source },
  });
}
