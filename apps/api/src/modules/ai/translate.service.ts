import { callClaude } from '../../services/claudeAI.js';

/**
 * Traduit une liste de textes courts en conservant l'ordre (FR ou EN).
 * Un élément vide ou déjà dans la langue cible est renvoyé tel quel.
 */
export async function translateTexts(texts: string[], target: 'fr' | 'en', userId: string): Promise<string[]> {
  if (texts.length === 0) return [];
  const langue = target === 'en' ? 'anglais (britannique, registre professionnel)' : 'français (registre professionnel)';
  const systemPrompt = `Tu es traducteur spécialisé en recrutement. Tu traduis les éléments d'un profil candidat en ${langue}.
Règles :
- Réponds UNIQUEMENT par un tableau JSON de chaînes, de la même longueur et dans le même ordre que l'entrée.
- Un élément déjà dans la langue cible est renvoyé tel quel.
- Ne traduis pas les noms propres (personnes, entreprises, produits, écoles, certifications) ni les acronymes métier.
- Conserve les chiffres, devises, pourcentages et unités à l'identique.
- Traduis les intitulés de poste par leur équivalent usuel dans la langue cible.
- N'ajoute rien, ne résume pas, ne commente pas.`;
  const response = await callClaude({
    feature: 'doc_translation',
    systemPrompt,
    userPrompt: JSON.stringify(texts),
    userId,
    maxTokens: 16000,
    temperature: 0,
  });
  const out = Array.isArray(response.content) ? response.content : JSON.parse((response.rawText.match(/\[[\s\S]*\]/) || ['null'])[0]);
  if (!Array.isArray(out) || out.length !== texts.length) throw new Error('Traduction incomplète, réessayez.');
  return out.map((t: unknown, i: number) => (typeof t === 'string' && t.trim() ? t : texts[i]));
}
