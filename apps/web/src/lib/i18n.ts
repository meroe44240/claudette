// Langue de l'interface interne, choisie par chaque utilisateur (FR par défaut).
// La clé de traduction est le texte français lui-même : `t('Candidats')` rend
// « Candidates » en anglais et « Candidats » en français. Une clé absente du
// dictionnaire retombe sur le français. Le changement de langue recharge la page,
// donc `t()` peut être appelé partout, y compris dans des constantes de module.
import { EN } from '../i18n/en';

export type Lang = 'fr' | 'en';

const STORAGE_KEY = 'ats.lang';

function readLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
}

export const lang: Lang = readLang();
export const isEn = lang === 'en';
/** Locale pour les dates et les nombres (`toLocaleDateString(LOCALE)`). */
export const LOCALE = isEn ? 'en-GB' : 'fr-FR';

const dict: Record<string, string> = isEn ? EN : {};

/**
 * Traduit un texte français. Variables entre accolades : `t('{n} mandats', { n })`.
 * Pour un pluriel, choisir la clé : `t(n > 1 ? '{n} mandats' : '{n} mandat', { n })`.
 */
export function t(fr: string, vars?: Record<string, string | number>): string {
  const out = dict[fr] ?? fr;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : out;
}

export function setLang(next: Lang): void {
  if (next === lang) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch { /* stockage indisponible */ }
  window.location.reload();
}
