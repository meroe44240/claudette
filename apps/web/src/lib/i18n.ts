// Langue de l'interface, choisie par chaque utilisateur (EN par défaut).
// Source de vérité : User.preferredLanguage (profil). localStorage n'en est que le
// cache (lu au démarrage, sans attendre le réseau) et la langue des pages publiques.
// La clé de traduction est le texte français lui-même : `t('Candidats')` rend
// « Candidates » en anglais et « Candidats » en français. Une clé absente du
// dictionnaire retombe sur le français. Le changement de langue recharge la page,
// donc `t()` peut être appelé partout, y compris dans des constantes de module.
import { EN } from '../i18n/en';
import { api } from './api-client';

export type Lang = 'fr' | 'en';

const STORAGE_KEY = 'ats.lang';

function readLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'fr' ? 'fr' : 'en';
  } catch {
    return 'en';
  }
}

export const lang: Lang = readLang();
export const isEn = lang === 'en';
/** Locale pour les dates et les nombres (`toLocaleDateString(LOCALE)`). */
export const LOCALE = isEn ? 'en-GB' : 'fr-FR';
/** Deux-points selon la typographie de la langue : « Relance : » / « Follow-up: ». */
export const COLON = isEn ? ':' : ' :';

const dict: Record<string, string> = isEn ? EN : {};

/**
 * Traduit un texte français. Variables entre accolades : `t('{n} mandats', { n })`.
 * Pour un pluriel, choisir la clé : `t(n > 1 ? '{n} mandats' : '{n} mandat', { n })`.
 */
export function t(fr: string, vars?: Record<string, string | number>): string {
  const out = dict[fr] ?? fr;
  return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : out;
}

const loggedIn = () => {
  try { return !!localStorage.getItem('accessToken'); } catch { return false; }
};

function cacheLang(next: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch { /* stockage indisponible */ }
}

/** Change la langue : enregistrée dans le profil si l'utilisateur est connecté, puis rechargement. */
export async function setLang(next: Lang): Promise<void> {
  if (next === lang) return;
  cacheLang(next);
  if (loggedIn()) await api.put('/auth/me', { preferredLanguage: next }).catch(() => null);
  window.location.reload();
}

/** Fuseau IANA du navigateur (ex. Asia/Ho_Chi_Minh). */
export function browserTimeZone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}

/**
 * Aligne l'interface sur le profil, après la connexion et au démarrage de l'app.
 * - Langue du profil différente du cache : on l'applique (rechargement).
 * - Profil sans langue ou sans fuseau (première connexion) : on y enregistre
 *   la langue actuelle de l'interface et le fuseau du navigateur.
 */
export async function syncLocaleWithProfile(profile: { preferredLanguage?: string | null; timezone?: string | null } | null | undefined): Promise<void> {
  if (!profile) return;
  const patch: Record<string, string> = {};
  if (profile.preferredLanguage !== 'fr' && profile.preferredLanguage !== 'en') patch.preferredLanguage = lang;
  if (!profile.timezone) {
    const tz = browserTimeZone();
    if (tz) patch.timezone = tz;
  }
  if (Object.keys(patch).length) await api.put('/auth/me', patch).catch(() => null);
  if ((profile.preferredLanguage === 'fr' || profile.preferredLanguage === 'en') && profile.preferredLanguage !== lang) {
    cacheLang(profile.preferredLanguage);
    window.location.reload();
  }
}
