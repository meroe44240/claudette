import type { PrismaClient } from '@prisma/client';

/**
 * Qualité des données : formats canoniques appliqués à toute écriture (web, MCP, imports, Gmail),
 * posés au niveau du client Prisma (voir lib/db.ts). Rien n'est rejeté ici : une valeur dont le
 * format ne peut pas être décidé est laissée telle quelle. Le refus des valeurs invalides se fait
 * dans les schémas d'entrée (zod) des routes.
 *
 * - emails en minuscules, sans espaces ni « mailto: »
 * - téléphones au format E.164 quand c'est décidable (+33…, 06…, 00…)
 * - URL LinkedIn canoniques : https://www.linkedin.com/in/<slug> (sans paramètres ni slash final)
 * - domaine d'entreprise nu (exemple.fr), déduit du site web s'il manque
 */

export const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
export const clean = (v: string | null | undefined) => (v == null ? v : v.replace(/[ ​\t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim());

export const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
export function normalizeEmail(v: string | null | undefined): string | null | undefined {
  if (v == null) return v;
  const s = v.trim().replace(/^mailto:/i, '').replace(/[<>"'\s]/g, '').toLowerCase();
  return s || null;
}

/** E.164, ou null quand le format ne permet pas de décider sans risque. */
export function phoneE164(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = v.trim().replace(/\(0\)/g, '').replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) {
    s = '+' + s.slice(1).replace(/\+/g, '');
    if (s.startsWith('+330')) s = '+33' + s.slice(4);
    if (s.startsWith('+33') && s.length !== 12) return null;
    return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
  }
  if (/^0[1-9]\d{8}$/.test(s)) return '+33' + s.slice(1); // format national français
  if (/^33[1-9]\d{8}$/.test(s)) return '+' + s;
  if (/^[67]\d{8}$/.test(s)) return '+33' + s; // mobile français sans le 0
  return null;
}

/** URL LinkedIn canonique, null si vide, 'INVALID' si ce n'est pas une URL LinkedIn. */
export function canonicalLinkedin(v: string | null | undefined, kind: 'in' | 'company' | 'any' = 'any'): string | null | 'INVALID' {
  if (blank(v)) return null;
  let s = String(v).trim();
  if (/^(null|undefined|linkedin|n\/?a|-)$/i.test(s)) return 'INVALID';
  if (!/linkedin\./i.test(s)) {
    // Un identifiant de profil seul (« prenom-nom-1a2b3c ») est accepté
    if (kind !== 'company' && /^[\p{L}\d%_-]{3,100}$/u.test(s) && /-/.test(s) && /\d/.test(s)) return `https://www.linkedin.com/in/${s.toLowerCase()}`;
    return 'INVALID';
  }
  s = s.replace(/^(https?:\/\/)?/i, 'https://');
  const m = s.match(/^https:\/\/(?:[a-z]{2,3}\.|www\.|m\.)?linkedin\.com\/(in|pub|company|school|showcase)\/([^/?#\s]+)/i);
  if (!m) return 'INVALID';
  const type = m[1].toLowerCase() === 'pub' ? 'in' : m[1].toLowerCase();
  let slug = m[2];
  try { slug = decodeURIComponent(slug); } catch { /* slug brut */ }
  return `https://www.linkedin.com/${type}/${slug.toLowerCase()}`;
}

export function domainOf(v: string | null | undefined): string | null {
  if (blank(v)) return null;
  const s = String(v).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#\s]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s) && !/linkedin\.com$/.test(s) ? s : null;
}

const PLACEHOLDER = /^(test\d*|testing|aaa+|bbb+|xxx+|zzz+|abc|toto|titi|tata|asdf|qsdf|azerty|qwerty|null|undefined|none|nan|unknown|inconnue?|candidat|candidate|n\/?a|na|nc|-+|\.+|\?+|x|xx|tbd|todo|placeholder|sample|exemple|example|demo|lorem|ipsum)$/i;
/** Texte de remplissage (« test », « N/A », « inconnu »…) qui ne peut pas servir de nom. */
export const isPlaceholder = (v: string | null | undefined) => !v || PLACEHOLDER.test(v.trim());

// ─── Normalisation à l'écriture ───

type Rule = (v: string) => string | null | undefined;
const keepIfUndecided = (fn: (v: string) => string | null): Rule => (v) => fn(v) ?? v;
const linkedinRule = (kind: 'in' | 'company'): Rule => (v) => {
  const u = canonicalLinkedin(v, kind);
  return u === 'INVALID' ? v : u;
};
const emailRule: Rule = (v) => normalizeEmail(v);
const trimRule: Rule = (v) => clean(v);

const RULES: Record<string, Record<string, Rule>> = {
  Candidat: { email: emailRule, telephone: keepIfUndecided(phoneE164), linkedinUrl: linkedinRule('in'), nom: trimRule, prenom: trimRule, posteActuel: trimRule, entrepriseActuelle: trimRule, localisation: trimRule },
  Client: { email: emailRule, telephone: keepIfUndecided(phoneE164), linkedinUrl: linkedinRule('in'), nom: trimRule, prenom: trimRule, poste: trimRule },
  Entreprise: { linkedinUrl: linkedinRule('company'), nom: trimRule, domaine: keepIfUndecided(domainOf), siteWeb: trimRule },
  Lead: { email: emailRule, phone: keepIfUndecided(phoneE164), contact: trimRule, company: trimRule },
};

export function normalizeData(model: string, data: unknown) {
  const rules = RULES[model];
  if (!rules || !data || typeof data !== 'object') return;
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows as Record<string, unknown>[]) {
    for (const [field, rule] of Object.entries(rules)) {
      const v = row[field];
      if (typeof v === 'string') row[field] = rule(v);
      else if (v && typeof v === 'object' && typeof (v as any).set === 'string') (v as any).set = rule((v as any).set);
    }
    if (model === 'Entreprise' && blank(row.domaine) && typeof row.siteWeb === 'string') {
      const d = domainOf(row.siteWeb);
      if (d) row.domaine = d;
    }
  }
}

/** Extension Prisma : normalise les champs ci-dessus sur create / createMany / update / updateMany / upsert. */
export function installDataQuality<T extends PrismaClient>(client: T): T {
  return client.$extends({
    name: 'data-quality',
    query: {
      $allModels: {
        async create({ model, args, query }) { normalizeData(model, (args as any).data); return query(args); },
        async createMany({ model, args, query }) { normalizeData(model, (args as any).data); return query(args); },
        async update({ model, args, query }) { normalizeData(model, (args as any).data); return query(args); },
        async updateMany({ model, args, query }) { normalizeData(model, (args as any).data); return query(args); },
        async upsert({ model, args, query }) { normalizeData(model, (args as any).create); normalizeData(model, (args as any).update); return query(args); },
      },
    },
  }) as unknown as T;
}

// ─── Schémas d'entrée (zod) ───

/** Pour .refine() : vide ou une URL LinkedIn de profil. */
export const isLinkedinProfileOrEmpty = (v: string | null | undefined) => {
  const u = canonicalLinkedin(v, 'in');
  return u === null || (u !== 'INVALID' && u.includes('/in/'));
};
export const isLinkedinCompanyOrEmpty = (v: string | null | undefined) => {
  const u = canonicalLinkedin(v, 'company');
  return u === null || (u !== 'INVALID' && !u.includes('/in/'));
};
