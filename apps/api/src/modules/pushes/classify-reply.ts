/**
 * Classify incoming replies to push CV emails.
 *
 * Uses Gemini Flash to categorize the prospect's response
 * and suggest next actions.
 */

import { callClaude } from '../../services/claudeAI.js';

export type ReplyCategory =
  | 'interested'
  | 'interview_requested'
  | 'declined'
  | 'needs_more_info'
  | 'out_of_office'
  | 'other';

export interface ReplyClassification {
  category: ReplyCategory;
  confidence: number;
  keyPoints: string[];
  suggestedAction: string;
}

const CLASSIFY_REPLY_SYSTEM_PROMPT = `Tu classifies la réponse d'un prospect à un push CV (envoi proactif d'un profil candidat par un cabinet de recrutement).

Catégories possibles :
- "interested" : exprime un intérêt, veut en savoir plus, demande le CV complet
- "interview_requested" : demande explicite d'entretien avec le candidat, veut le rencontrer
- "declined" : refuse (profil pas adapté, pas de besoin, timing mauvais, pas intéressé)
- "needs_more_info" : pose des questions, demande précisions (salaire, disponibilité, etc.)
- "out_of_office" : auto-reply d'absence (OOO, congés, absent)
- "other" : ne rentre dans aucune catégorie (remerciement vague, transfert interne, etc.)

Retourne STRICTEMENT ce JSON, rien d'autre :
{
  "category": "<une des valeurs ci-dessus>",
  "confidence": 0.0-1.0,
  "key_points": ["point 1", "point 2"],
  "suggested_action": "1 phrase d'action recommandée pour le recruteur"
}`;

export async function classifyReply(
  replyBody: string,
  context: { candidateName: string; sentAt: string },
  userId: string,
): Promise<ReplyClassification | null> {
  const userPrompt = `EMAIL DE RÉPONSE :
${replyBody.slice(0, 2000)}

CONTEXTE (push original) :
Candidat : ${context.candidateName}
Envoyé le : ${context.sentAt}`;

  try {
    const response = await callClaude({
      feature: 'push_reply_classify',
      systemPrompt: CLASSIFY_REPLY_SYSTEM_PROMPT,
      userPrompt,
      maxTokens: 500,
      temperature: 0,
      userId,
    });

    const text = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      category: parsed.category || 'other',
      confidence: parsed.confidence || 0,
      keyPoints: parsed.key_points || [],
      suggestedAction: parsed.suggested_action || '',
    };
  } catch (err) {
    console.error('[PushReply] Classification error:', err);
    return null;
  }
}
