// Langue et fuseau d'un membre : source unique pour les emails et les contenus IA.
// - getUserLocale / getUserLocales : lit User.preferredLanguage et User.timezone.
// - promptLanguageLine : la phrase à ajouter à un prompt pour écrire dans une langue.
// - formatDateTime / formatTime : heures sans ambiguïté, avec le fuseau (« Thu 20 Nov, 19:30 (ICT) »).
// Les instants restent stockés en UTC ; seul le rendu dépend du membre.
import prisma from './db.js';
import { validTimeZone } from './timezone.js';

export type Lang = 'fr' | 'en';
export interface UserLocale { lang: Lang; timezone: string }

/** Langue par défaut d'un membre qui n'a encore rien choisi (comme l'interface). */
export const DEFAULT_LANG: Lang = 'en';
export const DEFAULT_TIMEZONE = 'Europe/Paris';

export function normalizeLang(v: unknown): Lang | null {
  const s = String(v ?? '').trim().toLowerCase().slice(0, 2);
  return s === 'fr' || s === 'en' ? s : null;
}

/** Fuseau IANA valide, ou null (au lieu d'un repli silencieux). */
export function normalizeTimeZone(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const tz = v.trim();
  return validTimeZone(tz) === tz ? tz : null;
}

function toLocale(u: { preferredLanguage: string | null; timezone: string | null } | null | undefined): UserLocale {
  return {
    lang: normalizeLang(u?.preferredLanguage) ?? DEFAULT_LANG,
    timezone: normalizeTimeZone(u?.timezone) ?? DEFAULT_TIMEZONE,
  };
}

export async function getUserLocale(userId: string | null | undefined): Promise<UserLocale> {
  if (!userId) return toLocale(null);
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { preferredLanguage: true, timezone: true } });
  return toLocale(u);
}

export async function getUserLocales(userIds: string[]): Promise<Map<string, UserLocale>> {
  const rows = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, preferredLanguage: true, timezone: true } })
    : [];
  const map = new Map<string, UserLocale>();
  for (const id of userIds) map.set(id, toLocale(rows.find((r) => r.id === id)));
  return map;
}

/** Locale de membre extraite d'une ligne User déjà chargée. */
export function localeOf(u: { preferredLanguage?: string | null; timezone?: string | null }): UserLocale {
  return toLocale({ preferredLanguage: u.preferredLanguage ?? null, timezone: u.timezone ?? null });
}

const LANG_NAME: Record<Lang, string> = { fr: 'français', en: 'anglais (britannique, registre professionnel)' };

/**
 * Consigne de langue à ajouter au system prompt (les prompts sont écrits en français).
 * Le contenu est produit directement dans la langue : jamais rédigé puis traduit.
 */
export function promptLanguageLine(lang: Lang, what = 'tout le texte que tu produis'): string {
  return `LANGUE : écris ${what} en ${LANG_NAME[lang]}, quelle que soit la langue du contexte ou du transcript. Ne change pas les noms propres, les chiffres ni les clés JSON.`;
}

// ── Heures ─────────────────────────────────────────

// Abréviations usuelles : Intl ne donne que « GMT+7 » hors des fuseaux américains.
const ZONE_ABBR: Record<string, [std: string, dst?: string]> = {
  'Asia/Ho_Chi_Minh': ['ICT'], 'Asia/Saigon': ['ICT'], 'Asia/Bangkok': ['ICT'], 'Asia/Phnom_Penh': ['ICT'], 'Asia/Vientiane': ['ICT'],
  'Asia/Singapore': ['SGT'], 'Asia/Kuala_Lumpur': ['MYT'], 'Asia/Hong_Kong': ['HKT'], 'Asia/Shanghai': ['CST'], 'Asia/Tokyo': ['JST'],
  'Asia/Kolkata': ['IST'], 'Asia/Dubai': ['GST'], 'Australia/Sydney': ['AEST', 'AEDT'],
  'Europe/Paris': ['CET', 'CEST'], 'Europe/Brussels': ['CET', 'CEST'], 'Europe/Luxembourg': ['CET', 'CEST'], 'Europe/Zurich': ['CET', 'CEST'],
  'Europe/Monaco': ['CET', 'CEST'], 'Europe/Berlin': ['CET', 'CEST'], 'Europe/Madrid': ['CET', 'CEST'], 'Europe/Amsterdam': ['CET', 'CEST'],
  'Europe/Rome': ['CET', 'CEST'], 'Africa/Casablanca': ['WET', 'WEST'],
  'Europe/London': ['GMT', 'BST'], 'Europe/Dublin': ['GMT', 'IST'], 'Europe/Lisbon': ['WET', 'WEST'], UTC: ['UTC'], 'Etc/UTC': ['UTC'],
  'America/New_York': ['EST', 'EDT'], 'America/Toronto': ['EST', 'EDT'], 'America/Montreal': ['EST', 'EDT'], 'America/Chicago': ['CST', 'CDT'],
  'America/Denver': ['MST', 'MDT'], 'America/Los_Angeles': ['PST', 'PDT'],
};

function offsetMinutes(d: Date, timeZone: string): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    .formatToParts(d)
    .reduce<Record<string, number>>((a, x) => (x.type === 'literal' ? a : { ...a, [x.type]: Number(x.value) }), {});
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((wall - Math.floor(d.getTime() / 60_000) * 60_000) / 60_000);
}

/** Nom court du fuseau à cette date : ICT, CET / CEST, sinon GMT+7. */
export function zoneLabel(d: Date, timeZone: string): string {
  const tz = validTimeZone(timeZone);
  const abbr = ZONE_ABBR[tz];
  if (abbr) {
    if (!abbr[1]) return abbr[0];
    // Heure d'été : décalage supérieur au minimum de l'année.
    const y = d.getUTCFullYear();
    const std = Math.min(offsetMinutes(new Date(Date.UTC(y, 0, 1)), tz), offsetMinutes(new Date(Date.UTC(y, 6, 1)), tz));
    return offsetMinutes(d, tz) > std ? abbr[1] : abbr[0];
  }
  const off = offsetMinutes(d, tz);
  if (off === 0) return 'GMT';
  const h = Math.floor(Math.abs(off) / 60);
  const m = Math.abs(off) % 60;
  return `GMT${off > 0 ? '+' : '-'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

const intlLocale = (lang: Lang) => (lang === 'fr' ? 'fr-FR' : 'en-GB');

/** « 19:30 (ICT) » */
export function formatTime(date: Date | string, loc: UserLocale): string {
  const d = new Date(date);
  const tz = validTimeZone(loc.timezone);
  const time = d.toLocaleTimeString(intlLocale(loc.lang), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz });
  return `${time} (${zoneLabel(d, tz)})`;
}

/** « Thu 20 Nov, 19:30 (ICT) » / « jeu. 20 nov., 19:30 (CET) » */
export function formatDateTime(date: Date | string, loc: UserLocale): string {
  const d = new Date(date);
  const tz = validTimeZone(loc.timezone);
  const day = d.toLocaleDateString(intlLocale(loc.lang), { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).replace(/,/g, '');
  return `${day}, ${formatTime(d, loc)}`;
}

/** « Thursday 20 November » dans le fuseau du membre. */
export function formatLongDate(date: Date | string, loc: UserLocale): string {
  return new Date(date).toLocaleDateString(intlLocale(loc.lang), { weekday: 'long', day: 'numeric', month: 'long', timeZone: validTimeZone(loc.timezone) });
}
