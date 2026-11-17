// Langue d'un call avant qu'il commence : elle règle les sous-titres du bot.
// Source : l'indicatif du téléphone de la personne en face (candidat, client ou lead).
// Sans téléphone exploitable, la langue reste inconnue et on la demande au membre.
import prisma from '../../lib/db.js';
import type { NoteQuestion } from './notes.types.js';

export type CallLanguage = 'fr' | 'en';

/** Indicatifs de pays où l'on parle français au travail. */
const FRANCOPHONE = ['33', '32', '41', '352', '377', '212', '213', '216', '221', '225', '237', '262', '269', '590', '594', '596', '687', '689'];

/** +33 6…, 0033 6…, 06… : français ; autre indicatif : anglais ; sinon inconnu. */
export function languageFromPhone(phone: string | null | undefined): CallLanguage | null {
  if (!phone) return null;
  const raw = phone.replace(/[\s.\-()/]/g, '');
  let intl: string | null = null;
  if (raw.startsWith('+')) intl = raw.slice(1);
  else if (raw.startsWith('00')) intl = raw.slice(2);
  else if (/^0[1-9]\d{8}$/.test(raw)) return 'fr'; // numéro français sans indicatif
  if (!intl || !/^\d{6,}$/.test(intl)) return null;
  return FRANCOPHONE.some((c) => intl!.startsWith(c)) ? 'fr' : 'en';
}

/** Téléphone de la personne en face, selon les fiches rattachées au call. */
async function counterpartPhone(c: { candidatId: string | null; clientId: string | null; leadId: string | null }): Promise<string | null> {
  if (c.candidatId) {
    const x = await prisma.candidat.findUnique({ where: { id: c.candidatId }, select: { telephone: true } });
    if (x?.telephone) return x.telephone;
  }
  if (c.clientId) {
    const x = await prisma.client.findUnique({ where: { id: c.clientId }, select: { telephone: true } });
    if (x?.telephone) return x.telephone;
  }
  if (c.leadId) {
    const x = await prisma.lead.findUnique({ where: { id: c.leadId }, select: { phone: true } });
    if (x?.phone) return x.phone;
  }
  return null;
}

/**
 * Langue connue du call : choisie à la main, ou déduite du téléphone (alors enregistrée).
 * null = inconnue, à demander.
 */
export async function resolveCallLanguage(c: {
  id: string; language: string | null; candidatId: string | null; clientId: string | null; leadId: string | null;
}): Promise<CallLanguage | null> {
  if (c.language === 'fr' || c.language === 'en') return c.language;
  const lang = languageFromPhone(await counterpartPhone(c));
  if (lang) await prisma.noteCall.update({ where: { id: c.id }, data: { language: lang } }).catch(() => null);
  return lang;
}

/** Faute de mieux pour le bot (la question reste posée) : indices du titre et des questions. */
export function guessLanguageFromText(c: { titre: string; questions: unknown }): CallLanguage {
  const qs = ((c.questions as unknown as NoteQuestion[]) || []).map((q) => q.text || '').join(' ');
  const words = `${c.titre} ${qs}`.toLowerCase().match(/[a-zàâçéèêëîïôûùüÿœ']+/g) || [];
  const EN = new Set(['the', 'with', 'and', 'you', 'your', 'what', 'are', 'for', 'interview', 'meeting', 'chat', 'how', 'is', 'of', 'to', 'can', 'do']);
  const FR = new Set(['le', 'la', 'les', 'avec', 'et', 'vous', 'votre', 'quel', 'quelle', 'est', 'pour', 'entretien', 'échange', 'un', 'une', 'des', 'du', 'de', 'comment']);
  let en = 0;
  let fr = 0;
  for (const w of words) {
    if (EN.has(w)) en++;
    if (FR.has(w)) fr++;
  }
  return en > fr ? 'en' : 'fr';
}
