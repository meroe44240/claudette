import { Prisma } from '@prisma/client';
import type { FonctionProfil, SenioriteProfil, RemoteProfil, MarcheProfil, LienMandatProfil, SegmentClient, MotionVente, Role } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../lib/db.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';

// ─── Profils recherchés ─────────────────────────────────────────────────────
// Photo, à la date d'analyse, des profils qu'une société recrute (déduits de
// ses offres d'emploi). Module séparé : rien n'est lu par les mandats, le job
// board ou les stats recruteurs.

export const FONCTIONS = ['ENGINEERING', 'SALES'] as const;
export const SENIORITES = ['JUNIOR', 'CONFIRME', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTION'] as const;
export const REMOTES = ['ONSITE', 'HYBRID', 'REMOTE'] as const;
export const MARCHES = ['FRANCE', 'EUROPE', 'UK', 'US', 'CANADA', 'APAC'] as const;
export const LIENS = ['CONCURRENT_DIRECT', 'SIMILAIRE', 'VOISINE'] as const;
export const SEGMENTS = ['SMB', 'MID_MARKET', 'ENTERPRISE', 'PUBLIC'] as const;
export const MOTIONS = ['OUTBOUND', 'INBOUND', 'PLG', 'PARTENAIRES', 'FIELD_SALES'] as const;

// Le nom de la plateforme source ne doit jamais apparaître dans l'interface.
const PARTNER_RE = /paraform(\.com)?/gi;
const PARTNER_LABEL = 'plateforme partenaire';
export function masquerSource(v: string): string;
export function masquerSource(v: string | null | undefined): string | null;
export function masquerSource(v: string | null | undefined): string | null {
  if (v == null) return null;
  return v.replace(PARTNER_RE, PARTNER_LABEL);
}

function sourceLabel(url: string | null | undefined, source: string | null | undefined): string | null {
  let host = '';
  try { if (url) host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* url invalide */ }
  if (/paraform/i.test(host) || /paraform/i.test(source ?? '')) return PARTNER_LABEL;
  if (source && source.trim()) return masquerSource(source.trim());
  if (/linkedin\./.test(host)) return 'LinkedIn';
  if (/welcometothejungle\./.test(host)) return 'Welcome to the Jungle';
  if (/indeed\./.test(host)) return 'Indeed';
  return host || null;
}

/** Clé anti-doublon : minuscules, sans accents, espaces normalisés. */
export function intituleCle(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function cleanList(v: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of v ?? []) {
    const x = masquerSource(String(raw).trim());
    if (!x) continue;
    const k = x.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}
const txt = (v: string | null | undefined) => { const x = masquerSource(v?.trim() || null); return x ? x : null; };

// ─── Validation d'entrée (API + MCP) ────────────────────────────────────────

const offreSchema = z.object({
  titre: z.string().min(1),
  url: z.string().optional().nullable(),
  date_vue: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
});

export const upsertSchema = z.object({
  company_id: z.string().uuid(),
  fonction: z.enum(FONCTIONS),
  intitule_type: z.string().min(1).max(255),
  seniorite: z.enum(SENIORITES).optional().nullable(),
  pays: z.string().max(100).optional().nullable(),
  ville: z.string().max(150).optional().nullable(),
  remote: z.enum(REMOTES).optional().nullable(),
  langues: z.array(z.string()).optional(),
  salaire_min: z.number().int().optional().nullable(),
  salaire_max: z.number().int().optional().nullable(),
  devise: z.string().max(3).optional().nullable(),
  ote: z.string().max(255).optional().nullable(),
  equity: z.string().max(255).optional().nullable(),
  marche: z.enum(MARCHES).optional().nullable(),
  offres_sources: z.array(offreSchema).optional(),
  date_analyse: z.string().optional().nullable(),
  analyse_par: z.string().max(100).optional().nullable(),
  mandat_lie_id: z.string().uuid().optional().nullable(),
  type_lien: z.enum(LIENS).optional().nullable(),
  experience_attendue: z.string().optional().nullable(),
  // Engineering
  technos: z.array(z.string()).optional(),
  perimetre: z.string().optional().nullable(),
  projets: z.string().optional().nullable(),
  // Sales
  segments: z.array(z.enum(SEGMENTS)).optional(),
  secteurs: z.array(z.string()).optional(),
  acheteur_type: z.string().max(255).optional().nullable(),
  cycle_de_vente: z.string().max(100).optional().nullable(),
  panier_moyen_acv: z.string().max(100).optional().nullable(),
  motion: z.array(z.enum(MOTIONS)).optional(),
  territoire: z.string().max(255).optional().nullable(),
  quota: z.string().max(255).optional().nullable(),
  outils_methodo: z.array(z.string()).optional(),
});
export type UpsertInput = z.infer<typeof upsertSchema>;

export interface Actor { userId: string; userRole: Role }

/** Écriture réservée aux admins et aux comptes agents. */
export async function assertCanWrite(actor: Actor) {
  if (actor.userRole === 'ADMIN') return;
  const u = await prisma.user.findUnique({ where: { id: actor.userId }, select: { estAgent: true } });
  if (!u?.estAgent) throw new ForbiddenError('Only admins and agent accounts can write target profiles.');
}

// ─── Format de sortie ───────────────────────────────────────────────────────

const includeList = {
  entreprise: { select: { id: true, nom: true, logoUrl: true, siteWeb: true, domaine: true } },
  mandatLie: { select: { id: true, titrePoste: true } },
  analysePar: { select: { id: true, prenom: true, nom: true } },
} satisfies Prisma.ProfilRechercheInclude;

type ProfilRow = Prisma.ProfilRechercheGetPayload<{ include: typeof includeList }>;

export function serialize(p: ProfilRow) {
  const eng = p.fonction === 'ENGINEERING';
  const offres = Array.isArray(p.offresSources) ? (p.offresSources as any[]) : [];
  const auteur = p.analyseParNom || (p.analysePar ? `${p.analysePar.prenom ?? ''} ${p.analysePar.nom}`.trim() : null);
  return {
    id: p.id,
    company: { id: p.entreprise.id, name: p.entreprise.nom, logoUrl: p.entreprise.logoUrl, siteWeb: p.entreprise.siteWeb, domaine: p.entreprise.domaine },
    fonction: p.fonction,
    intitule_type: masquerSource(p.intituleType),
    seniorite: p.seniorite,
    localisation: { pays: p.pays, ville: p.ville, remote: p.remote },
    langues: p.langues,
    remuneration: { salaire_min: p.salaireMin, salaire_max: p.salaireMax, devise: p.devise, ote: p.ote, equity: p.equity },
    marche: p.marche,
    offres_sources: offres.map((o) => ({
      titre: masquerSource(String(o?.titre ?? '')),
      url: o?.url ?? null,
      date_vue: o?.date_vue ?? null,
      source: sourceLabel(o?.url, o?.source),
    })),
    date_analyse: p.dateAnalyse.toISOString(),
    analyse_par: masquerSource(auteur),
    mandat_lie: p.mandatLie ? { id: p.mandatLie.id, titre: p.mandatLie.titrePoste, type_lien: p.typeLien } : null,
    experience_attendue: masquerSource(p.experienceAttendue),
    ...(eng
      ? { technos: p.technos, perimetre: masquerSource(p.perimetre), projets: masquerSource(p.projets) }
      : {
          type_clients: { segments: p.segments, secteurs: p.secteurs },
          acheteur_type: masquerSource(p.acheteurType),
          cycle_de_vente: p.cycleDeVente,
          panier_moyen_acv: p.panierMoyenAcv,
          motion: p.motion,
          territoire: masquerSource(p.territoire),
          quota: p.quota,
          outils_methodo: p.outilsMethodo,
        }),
  };
}
export type ProfilDTO = ReturnType<typeof serialize>;

// ─── Écriture ───────────────────────────────────────────────────────────────

/**
 * Crée ou remplace un profil. Même société + même fonction + même intitulé
 * (normalisé) = même profil : la nouvelle analyse écrase entièrement
 * l'ancienne (champs non fournis remis à vide, rien n'est conservé ni inventé).
 */
export async function upsert(raw: unknown, actor: Actor): Promise<{ id: string; replaced: boolean }> {
  await assertCanWrite(actor);
  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError('Invalid target profile', parsed.error.flatten().fieldErrors as any);
  const i = parsed.data;

  const ent = await prisma.entreprise.findUnique({ where: { id: i.company_id }, select: { id: true } });
  if (!ent) throw new NotFoundError('Entreprise', i.company_id);
  if (i.mandat_lie_id) {
    const m = await prisma.mandat.findUnique({ where: { id: i.mandat_lie_id }, select: { id: true } });
    if (!m) throw new NotFoundError('Mandat', i.mandat_lie_id);
  }
  const intitule = txt(i.intitule_type)!;
  const cle = intituleCle(intitule);
  if (!cle) throw new ValidationError('intitule_type is empty');
  const dateAnalyse = i.date_analyse ? new Date(i.date_analyse) : new Date();
  if (Number.isNaN(dateAnalyse.getTime())) throw new ValidationError('date_analyse is not a valid date');

  const eng = i.fonction === 'ENGINEERING';
  const data = {
    intituleType: intitule,
    seniorite: (i.seniorite ?? null) as SenioriteProfil | null,
    pays: txt(i.pays),
    ville: txt(i.ville),
    remote: (i.remote ?? null) as RemoteProfil | null,
    langues: cleanList(i.langues),
    salaireMin: i.salaire_min ?? null,
    salaireMax: i.salaire_max ?? null,
    devise: i.devise ? i.devise.toUpperCase() : null,
    ote: txt(i.ote),
    equity: txt(i.equity),
    marche: (i.marche ?? null) as MarcheProfil | null,
    offresSources: (i.offres_sources ?? []).map((o) => ({
      titre: masquerSource(o.titre.trim()),
      url: o.url?.trim() || null,
      date_vue: o.date_vue || null,
      source: o.source ? masquerSource(o.source.trim()) : null,
    })) as Prisma.InputJsonValue,
    dateAnalyse,
    analyseParId: actor.userId,
    analyseParNom: txt(i.analyse_par),
    mandatLieId: i.mandat_lie_id ?? null,
    typeLien: (i.mandat_lie_id ? i.type_lien ?? null : null) as LienMandatProfil | null,
    experienceAttendue: txt(i.experience_attendue),
    technos: eng ? cleanList(i.technos) : [],
    perimetre: eng ? txt(i.perimetre) : null,
    projets: eng ? txt(i.projets) : null,
    segments: (eng ? [] : [...new Set(i.segments ?? [])]) as SegmentClient[],
    secteurs: eng ? [] : cleanList(i.secteurs),
    acheteurType: eng ? null : txt(i.acheteur_type),
    cycleDeVente: eng ? null : txt(i.cycle_de_vente),
    panierMoyenAcv: eng ? null : txt(i.panier_moyen_acv),
    motion: (eng ? [] : [...new Set(i.motion ?? [])]) as MotionVente[],
    territoire: eng ? null : txt(i.territoire),
    quota: eng ? null : txt(i.quota),
    outilsMethodo: eng ? [] : cleanList(i.outils_methodo),
  };

  const where = { entrepriseId_fonction_intituleCle: { entrepriseId: i.company_id, fonction: i.fonction as FonctionProfil, intituleCle: cle } };
  const existing = await prisma.profilRecherche.findUnique({ where, select: { id: true } });
  const row = await prisma.profilRecherche.upsert({
    where,
    create: { entrepriseId: i.company_id, fonction: i.fonction as FonctionProfil, intituleCle: cle, ...data },
    update: data,
    select: { id: true },
  });
  return { id: row.id, replaced: !!existing };
}

export async function setSummary(companyId: string, resume: string, actor: Actor) {
  await assertCanWrite(actor);
  const ent = await prisma.entreprise.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!ent) throw new NotFoundError('Entreprise', companyId);
  const clean = txt(resume);
  const up = await prisma.entreprise.update({
    where: { id: companyId },
    data: { resumeProfils: clean, resumeProfilsDate: clean ? new Date() : null },
    select: { resumeProfils: true, resumeProfilsDate: true },
  });
  return { company_id: companyId, resume_profils: up.resumeProfils, date: up.resumeProfilsDate?.toISOString() ?? null };
}

export async function remove(id: string, actor: Actor) {
  await assertCanWrite(actor);
  await prisma.profilRecherche.delete({ where: { id } }).catch(() => { throw new NotFoundError('Profil recherché', id); });
  return { success: true };
}

// ─── Lecture ────────────────────────────────────────────────────────────────

export async function getByCompany(companyId: string) {
  const ent = await prisma.entreprise.findUnique({ where: { id: companyId }, select: { id: true, nom: true, resumeProfils: true, resumeProfilsDate: true } });
  if (!ent) throw new NotFoundError('Entreprise', companyId);
  const rows = await prisma.profilRecherche.findMany({ where: { entrepriseId: companyId }, include: includeList, orderBy: [{ dateAnalyse: 'desc' }, { intituleType: 'asc' }] });
  const all = rows.map(serialize);
  return {
    company: { id: ent.id, name: ent.nom },
    resume_profils: masquerSource(ent.resumeProfils),
    resume_profils_date: ent.resumeProfilsDate?.toISOString() ?? null,
    engineering: all.filter((p) => p.fonction === 'ENGINEERING'),
    sales: all.filter((p) => p.fonction === 'SALES'),
  };
}

const csvList = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : typeof v === 'string' && v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

export const searchSchema = z.object({
  q: z.string().optional(),
  fonction: z.enum(FONCTIONS).optional(),
  seniorite: z.preprocess(csvList, z.array(z.enum(SENIORITES))).optional(),
  technos: z.preprocess(csvList, z.array(z.string())).optional(),
  segments: z.preprocess(csvList, z.array(z.enum(SEGMENTS))).optional(),
  secteurs: z.preprocess(csvList, z.array(z.string())).optional(),
  motion: z.preprocess(csvList, z.array(z.enum(MOTIONS))).optional(),
  cycle_de_vente: z.string().optional(),
  marche: z.preprocess(csvList, z.array(z.enum(MARCHES))).optional(),
  pays: z.string().optional(),
  remote: z.preprocess(csvList, z.array(z.enum(REMOTES))).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  company_id: z.string().uuid().optional(),
  mandat_lie_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  per_page: z.coerce.number().int().min(1).max(1000).optional(),
});
export type SearchInput = z.infer<typeof searchSchema>;

/** Ids dont un tableau texte contient au moins une des valeurs (insensible à la casse). */
async function idsWithAny(column: 'technos' | 'secteurs', values: string[]): Promise<string[]> {
  const lowered = values.map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (!lowered.length) return [];
  const col = Prisma.raw(`"${column}"`);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM profils_recherches
    WHERE EXISTS (SELECT 1 FROM unnest(${col}) AS x WHERE lower(x) = ANY(${lowered}::text[]))`;
  return rows.map((r) => r.id);
}

async function buildWhere(f: SearchInput): Promise<Prisma.ProfilRechercheWhereInput> {
  const and: Prisma.ProfilRechercheWhereInput[] = [];
  if (f.fonction) and.push({ fonction: f.fonction });
  if (f.seniorite?.length) and.push({ seniorite: { in: f.seniorite } });
  if (f.segments?.length) and.push({ segments: { hasSome: f.segments } });
  if (f.motion?.length) and.push({ motion: { hasSome: f.motion } });
  if (f.marche?.length) and.push({ marche: { in: f.marche } });
  if (f.remote?.length) and.push({ remote: { in: f.remote } });
  if (f.cycle_de_vente?.trim()) and.push({ cycleDeVente: { contains: f.cycle_de_vente.trim(), mode: 'insensitive' } });
  if (f.pays?.trim()) and.push({ pays: { contains: f.pays.trim(), mode: 'insensitive' } });
  if (f.company_id) and.push({ entrepriseId: f.company_id });
  if (f.mandat_lie_id) and.push({ mandatLieId: f.mandat_lie_id });
  if (f.date_from || f.date_to) {
    const d: Prisma.DateTimeFilter = {};
    if (f.date_from) d.gte = new Date(f.date_from);
    if (f.date_to) { const to = new Date(f.date_to); if (/^\d{4}-\d{2}-\d{2}$/.test(f.date_to)) to.setUTCHours(23, 59, 59, 999); d.lte = to; }
    and.push({ dateAnalyse: d });
  }
  if (f.technos?.length) and.push({ id: { in: await idsWithAny('technos', f.technos) } });
  if (f.secteurs?.length) and.push({ id: { in: await idsWithAny('secteurs', f.secteurs) } });
  const q = f.q?.trim();
  if (q) {
    const c = { contains: q, mode: 'insensitive' as const };
    and.push({
      OR: [
        { intituleType: c }, { perimetre: c }, { projets: c }, { experienceAttendue: c },
        { acheteurType: c }, { territoire: c }, { ville: c }, { pays: c },
        { entreprise: { nom: c } },
        { technos: { has: q } }, { secteurs: { has: q } }, { outilsMethodo: { has: q } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export async function search(raw: unknown) {
  const f = searchSchema.parse(raw ?? {});
  const where = await buildWhere(f);
  const page = f.page ?? 1;
  const perPage = f.per_page ?? 50;
  const [total, rows] = await Promise.all([
    prisma.profilRecherche.count({ where }),
    prisma.profilRecherche.findMany({ where, include: includeList, orderBy: [{ dateAnalyse: 'desc' }, { intituleType: 'asc' }], skip: (page - 1) * perPage, take: perPage }),
  ]);
  return { data: rows.map(serialize), meta: { total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) } };
}

/** Valeurs distinctes pour alimenter les filtres de la page. */
export async function facets() {
  const rows = await prisma.profilRecherche.findMany({ select: { technos: true, secteurs: true, pays: true, entreprise: { select: { id: true, nom: true } }, mandatLie: { select: { id: true, titrePoste: true } } } });
  const count = (arr: string[]) => {
    const m = new Map<string, { v: string; n: number }>();
    for (const x of arr) { const k = x.toLowerCase(); const e = m.get(k); if (e) e.n++; else m.set(k, { v: x, n: 1 }); }
    return [...m.values()].sort((a, b) => b.n - a.n || a.v.localeCompare(b.v)).map((e) => e.v);
  };
  const companies = new Map<string, string>();
  const mandats = new Map<string, string>();
  for (const r of rows) {
    companies.set(r.entreprise.id, r.entreprise.nom);
    if (r.mandatLie) mandats.set(r.mandatLie.id, r.mandatLie.titrePoste);
  }
  return {
    technos: count(rows.flatMap((r) => r.technos)),
    secteurs: count(rows.flatMap((r) => r.secteurs)),
    pays: count(rows.map((r) => r.pays).filter((x): x is string => !!x)),
    companies: [...companies].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    mandats: [...mandats].map(([id, titre]) => ({ id, titre })).sort((a, b) => a.titre.localeCompare(b.titre)),
  };
}

// ─── Export CSV ─────────────────────────────────────────────────────────────

const SEN_FR: Record<string, string> = { JUNIOR: 'Junior', CONFIRME: 'Confirmé', SENIOR: 'Senior', LEAD: 'Lead', MANAGER: 'Manager', DIRECTION: 'Direction' };
const REM_FR: Record<string, string> = { ONSITE: 'Sur site', HYBRID: 'Hybride', REMOTE: 'Télétravail' };
const SEG_FR: Record<string, string> = { SMB: 'SMB', MID_MARKET: 'Mid-market', ENTERPRISE: 'Grands comptes', PUBLIC: 'Secteur public' };
const MOT_FR: Record<string, string> = { OUTBOUND: 'Outbound', INBOUND: 'Inbound', PLG: 'PLG', PARTENAIRES: 'Partenaires', FIELD_SALES: 'Field sales' };
const LIEN_FR: Record<string, string> = { CONCURRENT_DIRECT: 'Concurrent direct', SIMILAIRE: 'Similaire', VOISINE: 'Voisine' };

export async function exportCsv(raw: unknown): Promise<string> {
  const f = searchSchema.parse({ ...(raw as object), page: 1, per_page: 1000 });
  const where = await buildWhere(f);
  const rows = (await prisma.profilRecherche.findMany({ where, include: includeList, orderBy: [{ dateAnalyse: 'desc' }], take: 5000 })).map(serialize);
  const head = ['Société', 'Fonction', 'Intitulé', 'Séniorité', 'Marché', 'Pays', 'Ville', 'Remote', 'Langues', 'Salaire min', 'Salaire max', 'Devise', 'OTE', 'Equity',
    'Technos', 'Périmètre', 'Projets', 'Segments', 'Secteurs', 'Acheteur', 'Cycle de vente', 'Panier moyen / ACV', 'Motion', 'Territoire', 'Quota', 'Outils / méthodo',
    'Expérience attendue', 'Mandat lié', 'Type de lien', 'Offres sources', 'Date d\'analyse', 'Analysé par'];
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = rows.map((p: any) => [
    p.company.name, p.fonction === 'ENGINEERING' ? 'Engineering' : 'Sales', p.intitule_type, p.seniorite ? SEN_FR[p.seniorite] : '', p.marche ?? '',
    p.localisation.pays, p.localisation.ville, p.localisation.remote ? REM_FR[p.localisation.remote] : '', p.langues.join(', '),
    p.remuneration.salaire_min, p.remuneration.salaire_max, p.remuneration.devise, p.remuneration.ote, p.remuneration.equity,
    (p.technos ?? []).join(', '), p.perimetre, p.projets,
    (p.type_clients?.segments ?? []).map((s: string) => SEG_FR[s]).join(', '), (p.type_clients?.secteurs ?? []).join(', '),
    p.acheteur_type, p.cycle_de_vente, p.panier_moyen_acv, (p.motion ?? []).map((m: string) => MOT_FR[m]).join(', '), p.territoire, p.quota, (p.outils_methodo ?? []).join(', '),
    p.experience_attendue, p.mandat_lie?.titre, p.mandat_lie?.type_lien ? LIEN_FR[p.mandat_lie.type_lien] : '',
    p.offres_sources.map((o: any) => [o.titre, o.source, o.url].filter(Boolean).join(' | ')).join(' ; '),
    p.date_analyse.slice(0, 10), p.analyse_par,
  ].map(esc).join(';'));
  return '﻿' + [head.map(esc).join(';'), ...lines].join('\r\n');
}

// ─── Phase 2 : rapprochement candidat ↔ profils ────────────────────────────

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function mentions(hay: string, term: string): boolean {
  const t = norm(term).trim();
  if (!t) return false;
  // Limites de mot souples (gère C++, C#, Node.js…)
  return new RegExp(`(^|[^a-z0-9])${escRe(t)}($|[^a-z0-9+#])`).test(hay);
}

const SALES_TITLE_RE = /\b(sales|account executive|account manager|business develop|commercial|sdr|bdr|ae\b|kam|key account|head of sales|vp sales|chief revenue|cro\b|ingenieur d'affaires|ingenieur commercial|charge d'affaires|customer success)/;
const ENG_TITLE_RE = /\b(engineer|developer|developpeur|ingenieur logiciel|software|devops|sre\b|data engineer|data scientist|cto\b|tech lead|architect|fullstack|full-stack|backend|back-end|frontend|front-end|mobile|ml\b|machine learning)/;

function senioriteCandidat(annees: number | null, titre: string): SenioriteProfil | null {
  if (/\b(vp|vice president|chief|cto|cro|ceo|directeur|director|head of)\b/.test(titre)) return 'DIRECTION';
  if (/\b(manager|responsable)\b/.test(titre) && !/account manager/.test(titre)) return 'MANAGER';
  if (/\b(lead|principal|staff)\b/.test(titre)) return 'LEAD';
  if (annees == null) return null;
  if (annees < 3) return 'JUNIOR';
  if (annees < 6) return 'CONFIRME';
  return 'SENIOR';
}
const SEN_RANK: Record<SenioriteProfil, number> = { JUNIOR: 0, CONFIRME: 1, SENIOR: 2, LEAD: 3, MANAGER: 3, DIRECTION: 4 };

const SEG_KW: Record<SegmentClient, string[]> = {
  SMB: ['smb', 'tpe', 'pme', 'small business', 'petites entreprises'],
  MID_MARKET: ['mid-market', 'mid market', 'midmarket', 'eti', 'mid-size'],
  ENTERPRISE: ['enterprise', 'grands comptes', 'grand compte', 'key account', 'cac 40', 'cac40', 'fortune 500', 'large accounts', 'strategic accounts'],
  PUBLIC: ['secteur public', 'public sector', 'collectivites', 'administration', 'ugap', 'marches publics'],
};
const MOT_KW: Record<MotionVente, string[]> = {
  OUTBOUND: ['outbound', 'prospection', 'cold call', 'chasse', 'new business', 'hunter', 'hunting'],
  INBOUND: ['inbound', 'leads entrants', 'marketing qualified'],
  PLG: ['plg', 'product-led', 'product led', 'freemium', 'self-serve'],
  PARTENAIRES: ['partenaires', 'partner', 'channel', 'indirect', 'revendeurs', 'alliances', 'integrateurs'],
  FIELD_SALES: ['field sales', 'terrain', 'field', 'itinerant'],
};

export type MatchReason =
  | { code: 'technos' | 'segments' | 'secteurs' | 'acheteur' | 'motion'; items: string[] }
  | { code: 'cycle' | 'ville' | 'pays'; value: string }
  | { code: 'seniorite'; value: SenioriteProfil }
  | { code: 'seniorite_proche'; value: SenioriteProfil; candidate: SenioriteProfil }
  | { code: 'remote' };

const SEN_EN: Record<string, string> = { JUNIOR: 'junior', CONFIRME: 'mid-level', SENIOR: 'senior', LEAD: 'lead', MANAGER: 'manager', DIRECTION: 'executive' };
const SEG_EN: Record<string, string> = { SMB: 'SMB', MID_MARKET: 'mid-market', ENTERPRISE: 'enterprise', PUBLIC: 'public sector' };
const MOT_EN: Record<string, string> = { OUTBOUND: 'outbound', INBOUND: 'inbound', PLG: 'PLG', PARTENAIRES: 'partners', FIELD_SALES: 'field sales' };

/** Raison en anglais (réponses MCP). */
export function reasonText(r: MatchReason): string {
  switch (r.code) {
    case 'technos': return `Shared technos: ${r.items.join(', ')}`;
    case 'segments': return `Same client type: ${r.items.map((s) => SEG_EN[s] ?? s).join(', ')}`;
    case 'secteurs': return `Has sold to these industries: ${r.items.join(', ')}`;
    case 'acheteur': return `Has sold to: ${r.items.join(', ')}`;
    case 'motion': return `Same sales motion: ${r.items.map((m) => MOT_EN[m] ?? m).join(', ')}`;
    case 'cycle': return `Comparable sales cycle (${r.value})`;
    case 'seniorite': return `Seniority matches (${SEN_EN[r.value]})`;
    case 'seniorite_proche': return `Close seniority (candidate ${SEN_EN[r.candidate]}, profile ${SEN_EN[r.value]})`;
    case 'remote': return 'Fully remote role';
    case 'ville': return `Same city (${r.value})`;
    case 'pays': return `Same country (${r.value})`;
  }
}

export async function matchCandidate(candidatId: string) {
  const c = await prisma.candidat.findUnique({
    where: { id: candidatId },
    select: {
      id: true, prenom: true, nom: true, tier: true, aPlayer: true, posteActuel: true, localisation: true, mobilite: true,
      anneesExperience: true, tags: true, cvTexte: true, aiPitchLong: true, notes: true,
      experiences: { select: { titre: true, entreprise: true, highlights: true } },
    },
  });
  if (!c) throw new NotFoundError('Candidat', candidatId);
  const eligible = c.aPlayer || c.tier === 'S' || c.tier === 'A';
  const candidate = { id: c.id, name: `${c.prenom ?? ''} ${c.nom}`.trim(), tier: c.tier, a_player: c.aPlayer, eligible };
  if (!eligible) return { candidate, matches: [], message: 'Matching is only available for S-Tier, A-tier or A-Player candidates.' };

  const titre = norm(`${c.posteActuel ?? ''} ${c.experiences.map((e) => e.titre).join(' ')}`);
  const hay = norm([c.posteActuel, c.cvTexte, c.aiPitchLong, c.notes, c.tags.join(' '), ...c.experiences.flatMap((e) => [e.titre, e.entreprise, ...e.highlights])].filter(Boolean).join('\n'));
  const lieu = norm(`${c.localisation ?? ''} ${c.mobilite ?? ''}`);
  const tagsLow = new Set(c.tags.map((t) => norm(t)));
  const isSales = SALES_TITLE_RE.test(norm(c.posteActuel ?? '')) || (SALES_TITLE_RE.test(titre) && !ENG_TITLE_RE.test(norm(c.posteActuel ?? '')));
  const isEng = ENG_TITLE_RE.test(titre) || c.tags.length > 0;
  const senC = senioriteCandidat(c.anneesExperience, norm(c.posteActuel ?? ''));

  const profils = (await prisma.profilRecherche.findMany({ include: includeList, orderBy: { dateAnalyse: 'desc' } })).filter((p) => (p.fonction === 'SALES' ? isSales : isEng && !isSales));
  const out: Array<{ score: number; reasons: MatchReason[]; profile: ProfilDTO }> = [];

  for (const p of profils) {
    const reasons: MatchReason[] = [];
    let score = 0;
    let core = false;

    if (p.fonction === 'ENGINEERING') {
      const communs = p.technos.filter((t) => tagsLow.has(norm(t)) || mentions(hay, t));
      if (communs.length) {
        core = true;
        score += Math.min(communs.length, 6) * 2;
        reasons.push({ code: 'technos', items: communs });
      }
    } else {
      const segs = p.segments.filter((s) => SEG_KW[s].some((k) => mentions(hay, k)));
      if (segs.length) { core = true; score += 3 * segs.length; reasons.push({ code: 'segments', items: segs }); }
      const secteurs = p.secteurs.filter((s) => mentions(hay, s));
      if (secteurs.length) { score += 2; reasons.push({ code: 'secteurs', items: secteurs }); }
      if (p.acheteurType) {
        const roles = p.acheteurType.split(/[,/;]|\bet\b|\bou\b/).map((x) => x.trim()).filter((x) => x.length >= 2);
        const hit = roles.filter((r) => mentions(hay, r));
        if (hit.length) { core = true; score += 2; reasons.push({ code: 'acheteur', items: hit }); }
      }
      const mots = p.motion.filter((m) => MOT_KW[m].some((k) => mentions(hay, k)));
      if (mots.length) { score += 2 * mots.length; reasons.push({ code: 'motion', items: mots }); }
      if (p.cycleDeVente && /cycle/.test(hay)) {
        const cyc = norm(p.cycleDeVente).match(/\d+/g);
        if (cyc && cyc.some((n) => new RegExp(`\\b${n}\\s*(a|-|à)?\\s*\\d*\\s*(mois|months|semaines|weeks)`).test(hay))) { score += 1; reasons.push({ code: 'cycle', value: p.cycleDeVente }); }
      }
    }
    if (!core) continue;

    if (p.seniorite && senC) {
      const d = Math.abs(SEN_RANK[p.seniorite] - SEN_RANK[senC]);
      if (d === 0) { score += 2; reasons.push({ code: 'seniorite', value: p.seniorite }); }
      else if (d === 1) { score += 1; reasons.push({ code: 'seniorite_proche', value: p.seniorite, candidate: senC }); }
      else score -= 2;
    }
    if (p.remote === 'REMOTE') { score += 1; reasons.push({ code: 'remote' }); }
    else if (p.ville && mentions(lieu, p.ville)) { score += 2; reasons.push({ code: 'ville', value: p.ville }); }
    else if (p.pays && mentions(lieu, p.pays)) { score += 1; reasons.push({ code: 'pays', value: p.pays }); }
    else if (lieu.trim() && (p.ville || p.pays)) score -= 1;

    if (score >= 3) out.push({ score, reasons, profile: serialize(p) });
  }
  out.sort((a, b) => b.score - a.score);
  return { candidate, matches: out.slice(0, 25) };
}
