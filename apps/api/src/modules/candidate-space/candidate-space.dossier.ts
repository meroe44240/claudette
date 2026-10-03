// Espace candidat : dossier de préparation, un par mandat. Rédigé par l'IA ou
// le recruteur, relu puis publié ; les candidats du mandat le voient à partir
// de « Envoi client », tant que leur process est ouvert.
import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { callClaude } from '../../services/claudeAI.js';
import { asProfile, type CandidateProfile } from './candidate-space.fields.js';

export interface DossierFact { label: string; value: string }
export interface DossierSection {
  id: string;
  title: string;
  body: string;
  facts: DossierFact[];
  sources: string;
  /** Partie nominative (hiring manager...) : montrée seulement quand l'entretien client est confirmé. */
  confirmedBody: string;
  checkedAt?: string;
  checkedBy?: string;
}
export interface DossierPhoto { url: string; caption: string }
interface Published { sections: DossierSection[]; photos: DossierPhoto[] }

const TECH: Array<[string, string]> = [
  ['company', 'The company'],
  ['news', 'Recent news to mention'],
  ['people', 'Who you will meet'],
  ['stakes', 'What is at stake in the role'],
  ['process', 'The process'],
  ['watchouts', 'Watch-outs: why other profiles did not go through'],
  ['questions', 'Questions you are likely to get'],
];
const SALES_EXTRA: Array<[string, string]> = [
  ['comp', 'Compensation plan'],
  ['quota', 'Quota and ramp'],
  ['territory', 'Territory and pipeline'],
  ['deals', 'Deal profile and sales cycle'],
  ['salesTeam', 'The sales team'],
];

export function templateSections(profile: CandidateProfile): DossierSection[] {
  const list = profile === 'SALES' ? [...TECH.slice(0, 4), ...SALES_EXTRA, ...TECH.slice(4)] : TECH;
  return list.map(([id, title]) => ({ id, title, body: '', facts: [], sources: '', confirmedBody: '' }));
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function cleanSections(input: unknown): DossierSection[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: DossierSection[] = [];
  for (const raw of input.slice(0, 20)) {
    const r = (raw ?? {}) as Record<string, unknown>;
    let id = str(r.id, 40).replace(/[^a-zA-Z0-9_-]/g, '') || `s${out.length + 1}`;
    while (seen.has(id)) id += 'x';
    seen.add(id);
    out.push({
      id,
      title: str(r.title, 120),
      body: str(r.body, 6000),
      facts: (Array.isArray(r.facts) ? r.facts : [])
        .slice(0, 8)
        .map((f) => ({ label: str((f as any)?.label, 40), value: str((f as any)?.value, 160) }))
        .filter((f) => f.label && f.value),
      sources: str(r.sources, 400),
      confirmedBody: str(r.confirmedBody, 3000),
      ...(str(r.checkedAt, 40) ? { checkedAt: str(r.checkedAt, 40), checkedBy: str(r.checkedBy, 80) } : {}),
    });
  }
  return out;
}

export function cleanPhotos(input: unknown): DossierPhoto[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 6)
    .map((p) => ({ url: str((p as any)?.url, 1000), caption: str((p as any)?.caption, 160) }))
    .filter((p) => /^https:\/\//.test(p.url));
}

const hasContent = (s: DossierSection) => !!(s.body || s.facts.length || s.confirmedBody);
const contentKey = (s: DossierSection) => JSON.stringify([s.title, s.body, s.facts, s.sources, s.confirmedBody]);

// ── Côté recruteur ───────────────────────────────────
export async function getDossier(mandatId: string) {
  const mandat = await prisma.mandat.findUnique({ where: { id: mandatId }, select: { id: true, dossier: true } });
  if (!mandat) throw new NotFoundError('Mandat', mandatId);
  const d = mandat.dossier;
  const sections = cleanSections(d?.sections);
  const photos = cleanPhotos(d?.photos);
  const published = (d?.published ?? null) as Published | null;
  const publisher = d?.publishedById
    ? await prisma.user.findUnique({ where: { id: d.publishedById }, select: { prenom: true, nom: true } })
    : null;
  const live = sections.filter(hasContent);
  return {
    sections: sections.length ? sections : templateSections('TECH'),
    photos,
    publishedAt: d?.publishedAt ?? null,
    publishedBy: publisher?.prenom || publisher?.nom || null,
    // Le brouillon diffère de ce que voient les candidats.
    dirty: !!published && (JSON.stringify(live.map(contentKey)) !== JSON.stringify(published.sections.map(contentKey)) || JSON.stringify(photos) !== JSON.stringify(published.photos)),
    missingSources: live.filter((s) => !s.sources).map((s) => s.title || s.id),
  };
}

export async function saveDossier(mandatId: string, input: { sections: unknown; photos: unknown }) {
  const exists = await prisma.mandat.findUnique({ where: { id: mandatId }, select: { id: true } });
  if (!exists) throw new NotFoundError('Mandat', mandatId);
  const data = { sections: cleanSections(input.sections) as any, photos: cleanPhotos(input.photos) as any };
  await prisma.mandatDossier.upsert({ where: { mandatId }, update: data, create: { mandatId, ...data } });
  return getDossier(mandatId);
}

/** Publie le brouillon : une rubrique sans source ne passe pas. */
export async function publishDossier(mandatId: string, userId: string) {
  const d = await prisma.mandatDossier.findUnique({ where: { mandatId } });
  if (!d) throw new ValidationError('Enregistre le dossier avant de le publier.');
  const live = cleanSections(d.sections).filter(hasContent);
  if (!live.length) throw new ValidationError('Le dossier est vide.');
  const untitled = live.find((s) => !s.title);
  if (untitled) throw new ValidationError('Une rubrique remplie n\'a pas de titre.');
  const unsourced = live.filter((s) => !s.sources);
  if (unsourced.length) throw new ValidationError(`Source manquante : ${unsourced.map((s) => s.title).join(', ')}.`);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { prenom: true, nom: true } });
  const by = user?.prenom || user?.nom || 'Humanup';
  const now = new Date().toISOString();
  const before = new Map(((d.published as Published | null)?.sections ?? []).map((s) => [s.id, s]));
  // Une rubrique inchangée garde sa date de vérification ; sinon elle est vérifiée par celui qui publie.
  const sections = live.map((s) => {
    const old = before.get(s.id);
    return old && old.checkedAt && contentKey(old) === contentKey(s)
      ? { ...s, checkedAt: old.checkedAt, checkedBy: old.checkedBy }
      : { ...s, checkedAt: now, checkedBy: by };
  });
  await prisma.mandatDossier.update({
    where: { mandatId },
    data: { published: { sections, photos: cleanPhotos(d.photos) } as any, publishedAt: new Date(), publishedById: userId },
  });
  return getDossier(mandatId);
}

export async function unpublishDossier(mandatId: string) {
  await prisma.mandatDossier.updateMany({ where: { mandatId }, data: { published: null as any, publishedAt: null, publishedById: null } });
  return getDossier(mandatId);
}

/** Rédige un brouillon à partir de la fiche du mandat et du brief collé par le recruteur. */
export async function generateDossier(mandatId: string, userId: string, input: { brief?: string; profile?: unknown }) {
  const m = await prisma.mandat.findUnique({
    where: { id: mandatId },
    select: {
      titrePoste: true, description: true, ficheDePoste: true, transcript: true, notes: true, localisation: true, salaryRange: true,
      entreprise: { select: { nom: true, siteWeb: true } },
    },
  });
  if (!m) throw new NotFoundError('Mandat', mandatId);
  const profile = asProfile(input.profile);
  const template = templateSections(profile);
  const material = [
    `ROLE: ${m.titrePoste} at ${m.entreprise?.nom ?? '?'}${m.localisation ? `, ${m.localisation}` : ''}${m.salaryRange ? `, ${m.salaryRange}` : ''}`,
    m.entreprise?.siteWeb ? `WEBSITE: ${m.entreprise.siteWeb}` : '',
    m.description ? `### Description du mandat\n${m.description.slice(0, 8000)}` : '',
    m.ficheDePoste ? `### Fiche de poste\n${m.ficheDePoste.slice(0, 8000)}` : '',
    m.notes ? `### Notes internes\n${m.notes.slice(0, 4000)}` : '',
    m.transcript ? `### Transcript du brief client\n${m.transcript.slice(0, 30000)}` : '',
    input.brief?.trim() ? `### Éléments collés par le recruteur\n${input.brief.trim().slice(0, 60000)}` : '',
  ].filter(Boolean).join('\n\n');
  if (material.length < 400) throw new ValidationError('Pas assez de matière : colle la fiche de poste ou le compte rendu du brief client.');

  const systemPrompt = `Tu rédiges le dossier de préparation qu'un cabinet de recrutement remet à ses candidats avant leurs entretiens chez le client. Le candidat lit ce dossier : écris en ANGLAIS, en t'adressant à lui ("you"), ton direct et concret, phrases courtes.
Réponds UNIQUEMENT en JSON : {"sections":[{"id":"","title":"","body":"","facts":[{"label":"","value":""}],"sources":"","confirmedBody":""}]}.
Rubriques attendues, dans cet ordre (garde id et title) :
${template.map((s) => `- ${s.id}: ${s.title}`).join('\n')}
Règles :
- N'invente rien. Une rubrique sans matière dans les sources : body vide. Jamais de fait supposé.
- body : texte brut. Paragraphes séparés par une ligne vide ; une liste = lignes commençant par "- ". Pas de markdown, pas de gras.
- facts : 0 à 4 chiffres clés courts (uniquement pour "company").
- sources : d'où viennent les faits de la rubrique (ex. "Role page on Paraform, October 2026", "Intake call with the hiring team"). Vide si tu n'as pas de source.
- "people" : dans body, décris les interlocuteurs par leur rôle seulement, sans aucun nom. Mets les noms, parcours et ce qu'ils valorisent dans confirmedBody (affiché quand l'entretien est confirmé).
- "watchouts" : des tendances reformulées en conseils, jamais de nom de candidat, jamais de citation brute du client.
- "questions" : les questions probables, avec une ligne sur ce que l'intervieweur cherche.
- INTERDIT dans tout le dossier : honoraires du cabinet, fourchettes de salaire internes ou non publiées, stratégie de négociation, nombre ou détail des candidats refusés, remarques du client sur d'autres candidats, tout critère lié à l'âge, l'origine, la santé ou la situation familiale, et toute information sur l'activité des recruteurs.`;
  const r = await callClaude({ feature: 'candidate_space_dossier', systemPrompt, userPrompt: material, userId, maxTokens: 6000, temperature: 0.2 });
  const j = (typeof r.content === 'object' && r.content ? r.content : JSON.parse((r.rawText.match(/\{[\s\S]*\}/) || ['{}'])[0])) as { sections?: unknown };
  const written = cleanSections(j.sections);
  if (!written.some(hasContent)) throw new ValidationError("L'IA n'a rien pu rédiger à partir de ces éléments.");
  // On garde l'ordre du gabarit, et les rubriques ajoutées par l'IA à la fin.
  const sections = [
    ...template.map((t) => ({ ...t, ...(written.find((w) => w.id === t.id) ?? {}), id: t.id })),
    ...written.filter((w) => !template.some((t) => t.id === w.id)),
  ];
  return { sections };
}

// ── Côté candidat ────────────────────────────────────
const minutes = (s: DossierSection) => Math.max(1, Math.ceil(`${s.body} ${s.confirmedBody}`.split(/\s+/).length / 200));

export async function candidateDossier(account: { dossierRead: unknown }, mandatId: string, interviewConfirmed: boolean) {
  const d = await prisma.mandatDossier.findUnique({ where: { mandatId }, select: { published: true, publishedAt: true } });
  const pub = d?.published as Published | null | undefined;
  if (!pub?.sections?.length) return null;
  const read = new Set((((account.dossierRead ?? {}) as Record<string, string[]>)[mandatId] ?? []));
  const sections = pub.sections.map((s) => ({
    id: s.id,
    title: s.title,
    body: s.body,
    facts: s.facts,
    sources: s.sources,
    confirmedBody: interviewConfirmed ? s.confirmedBody : '',
    checkedAt: s.checkedAt ?? null,
    checkedBy: s.checkedBy ?? null,
    minutes: minutes(interviewConfirmed ? s : { ...s, confirmedBody: '' }),
    read: read.has(s.id),
  }));
  return {
    updatedAt: d!.publishedAt,
    minutes: sections.reduce((n, s) => n + s.minutes, 0),
    photos: pub.photos ?? [],
    sections,
  };
}

export async function markSectionRead(account: { id: string; dossierRead: unknown }, mandatId: string, sectionId: string) {
  const all = { ...((account.dossierRead ?? {}) as Record<string, string[]>) };
  const list = new Set(all[mandatId] ?? []);
  if (list.has(sectionId)) return { ok: true };
  list.add(sectionId);
  all[mandatId] = [...list].slice(0, 40);
  await prisma.candidateAccount.update({ where: { id: account.id }, data: { dossierRead: all as any } });
  return { ok: true };
}
