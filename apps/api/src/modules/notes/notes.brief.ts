// Brief d'avant-call : une fiche courte sur le poste, la personne en face et ce
// qu'il faut creuser, rédigée par Claude depuis Propium (mandat, CV, client, lead)
// et le brief chargé par le membre. Envoyé par email 30 min avant une qualif ou un intake.
import prisma from '../../lib/db.js';
import { callClaude } from '../../services/claudeAI.js';
import { buildContext } from './notes.context.js';
import { prepareQuestions } from './notes.questions.js';
import { sendBriefEmail } from './notes.emails.js';
import { resolveCallLanguage } from './notes.language.js';
import { aiAvailable, CALL_TYPE_LABEL, type CallType, type NoteQuestion } from './notes.types.js';

const SYSTEM = `Tu prépares le brief d'avant-call d'un recruteur d'un cabinet de recrutement (Humanup, profils sales et business).
Il le lit dans les 5 minutes avant le call : sois court, concret, factuel. Rien d'inventé : si une info manque, écris "non renseigné".
Format Markdown, sections dans cet ordre (n'écris une section que si elle a du contenu) :
## Le poste
Entreprise, intitulé, contexte (création de poste, remplacement), package (fixe, variable), localisation et télétravail, critères indispensables.
## Le candidat
(qualif uniquement) poste et boîte actuels, parcours en 2-3 lignes, chiffres connus, prétentions et préavis s'ils sont connus.
## Le client
(intake uniquement) l'entreprise, l'interlocuteur, l'historique avec Humanup, les mandats en cours.
## Points à creuser
3 à 5 puces : zones floues du CV, écarts avec les critères du poste, risques (préavis, salaire, mobilité), ce qui n'a pas encore été vérifié.
## Pitch du poste
(qualif uniquement) 2-3 phrases pour vendre le poste à ce candidat-là, en partant de ce qui compte pour lui.
Puces courtes, une info par ligne, pas de phrase d'introduction ni de conclusion.
Réponds UNIQUEMENT en JSON : {"brief":"<markdown>"}`;

export async function generateBrief(callId: string): Promise<{ markdown: string | null; missing: string[] }> {
  const call = await prisma.noteCall.findUnique({ where: { id: callId } });
  if (!call) throw new Error('Call introuvable');
  const ctx = await buildContext(call);
  if (!aiAvailable() || !ctx.text.trim()) return { markdown: null, missing: ctx.missing };
  try {
    const res = await callClaude({
      feature: 'notes_brief',
      preferAnthropic: true,
      userId: call.userId,
      systemPrompt: SYSTEM + (call.language === 'en'
        ? '\nRédige tout le brief en anglais (titres de sections compris : The role, The candidate, The client, To dig into, Role pitch).'
        : call.language === 'fr' ? '\nRédige tout le brief en français.' : ''),
      userPrompt: `Type de call : ${CALL_TYPE_LABEL[call.callType as CallType]}\nTitre : ${call.titre}\n\nCONTEXTE :\n${ctx.text}`,
      maxTokens: 1500,
      temperature: 0.2,
    });
    const md = typeof res.content?.brief === 'string' ? res.content.brief.trim() : '';
    return { markdown: md || null, missing: ctx.missing };
  } catch (err) {
    console.error('[Notes] Brief impossible:', (err as Error).message);
    return { markdown: null, missing: ctx.missing };
  }
}

/** Prépare les questions si besoin, rédige le brief et l'envoie au(x) membre(s) du call. */
export async function sendCallBrief(callId: string, opts: { onlyTo?: string } = {}): Promise<{ sent: number }> {
  let call = await prisma.noteCall.findUnique({ where: { id: callId } });
  if (!call) throw new Error('Call introuvable');
  if (!((call.questions as unknown as NoteQuestion[]) || []).length) call = await prepareQuestions(callId);
  const known = call!.callType !== 'INTERNE' ? await resolveCallLanguage(call!) : null;
  const { markdown, missing } = await generateBrief(callId);
  if (call!.callType !== 'INTERNE') (call as any)._askLanguage = !known;
  const sent = await sendBriefEmail(call!, markdown, missing, opts.onlyTo);
  return { sent };
}
