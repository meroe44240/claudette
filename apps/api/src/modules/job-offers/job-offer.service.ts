import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';
import { notifyJobBoardApplication } from '../slack/slack.service.js';
import { callClaude } from '../../services/claudeAI.js';

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'offre';
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = slugify(base);
  let i = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.jobOffer.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${slugify(base)}-${++i}`;
  }
}

export interface JobOfferInput {
  titre: string;
  description: string;
  descriptionSociete?: string | null;
  missions?: string | null;
  packageInfo?: string | null;
  localisation?: string | null;
  titreEn?: string | null;
  descriptionEn?: string | null;
  descriptionSocieteEn?: string | null;
  missionsEn?: string | null;
  packageInfoEn?: string | null;
  localisationEn?: string | null;
  contractType?: string | null;
  remote?: string | null;
  salaireMin?: number | null;
  salaireMax?: number | null;
  currency?: string | null;
  secteur?: string | null;
  entrepriseNom?: string | null;
  tags?: string[];
  published?: boolean;
  mandatId?: string | null;
}

// ── Traduction auto FR → EN (job board bilingue) ─────────────────
// Les champs « …En » sont saisis à la main dans l'ATS ; quand ils sont vides,
// la landing /en retombe sur le français. On complète donc automatiquement
// les champs EN manquants par IA (sans jamais écraser une saisie manuelle).
const TRANSLATABLE = ['titre', 'description', 'descriptionSociete', 'missions', 'packageInfo', 'localisation'] as const;
type TranslatableField = typeof TRANSLATABLE[number];
const enKey = (f: TranslatableField) => `${f}En` as const;

function missingEnFields(o: Record<string, any>): TranslatableField[] {
  return TRANSLATABLE.filter((f) => (o[f] ?? '').toString().trim() && !(o[enKey(f)] ?? '').toString().trim());
}

const translating = new Set<string>();

export async function translateMissingEn(offerId: string, userId?: string | null): Promise<void> {
  if (translating.has(offerId)) return;
  translating.add(offerId);
  try {
    const offer = await prisma.jobOffer.findUnique({ where: { id: offerId } });
    if (!offer) return;
    const fields = missingEnFields(offer);
    if (fields.length === 0) return;

    const source = Object.fromEntries(fields.map((f) => [f, (offer as any)[f]]));
    const response = await callClaude({
      feature: 'job_offer_translation',
      systemPrompt:
        "Tu traduis des offres d'emploi du français vers l'anglais pour un job board de cabinet de recrutement. " +
        "Ton professionnel et naturel (anglais international). Conserve la mise en forme (retours à la ligne, puces, emojis), " +
        "les noms propres, noms d'entreprises, montants et acronymes. Pour une localisation, donne l'équivalent anglais " +
        "(ex : « Paris (75) » → « Paris, France », « Télétravail » → « Remote »). " +
        'Réponds UNIQUEMENT avec un objet JSON ayant exactement les mêmes clés que l\'entrée, valeurs traduites.',
      userPrompt: JSON.stringify(source, null, 2),
      userId: userId ?? offer.createdById ?? '00000000-0000-0000-0000-000000000000',
      maxTokens: 4000,
      temperature: 0,
    });

    const out = response.content && typeof response.content === 'object' ? response.content : {};
    // Relecture pour ne pas écraser une saisie manuelle faite pendant la traduction.
    const fresh = await prisma.jobOffer.findUnique({ where: { id: offerId } });
    if (!fresh) return;
    const data: Record<string, string> = {};
    for (const f of fields) {
      const v = out[f];
      if (typeof v === 'string' && v.trim() && !((fresh as any)[enKey(f)] ?? '').toString().trim()) data[enKey(f)] = v.trim();
    }
    if (Object.keys(data).length > 0) await prisma.jobOffer.update({ where: { id: offerId }, data });
  } catch (err) {
    console.error('[job-offers] Traduction EN échouée pour', offerId, err);
  } finally {
    translating.delete(offerId);
  }
}

// ── ATS (interne) ───────────────────────────────
export async function list() {
  return prisma.jobOffer.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function create(data: JobOfferInput, userId?: string) {
  const slug = await uniqueSlug(data.titre);
  const offer = await prisma.jobOffer.create({
    data: {
      slug,
      titre: data.titre,
      description: data.description,
      descriptionSociete: data.descriptionSociete ?? null,
      missions: data.missions ?? null,
      packageInfo: data.packageInfo ?? null,
      localisation: data.localisation ?? null,
      titreEn: data.titreEn ?? null,
      descriptionEn: data.descriptionEn ?? null,
      descriptionSocieteEn: data.descriptionSocieteEn ?? null,
      missionsEn: data.missionsEn ?? null,
      packageInfoEn: data.packageInfoEn ?? null,
      localisationEn: data.localisationEn ?? null,
      contractType: data.contractType ?? null,
      remote: data.remote ?? null,
      salaireMin: data.salaireMin ?? null,
      salaireMax: data.salaireMax ?? null,
      currency: data.currency ?? "EUR",
      secteur: data.secteur ?? null,
      entrepriseNom: data.entrepriseNom ?? null,
      tags: data.tags ?? [],
      published: data.published ?? false,
      mandatId: data.mandatId ?? null,
      createdById: userId ?? null,
    },
  });
  void translateMissingEn(offer.id, userId);
  return offer;
}

export async function update(id: string, data: JobOfferInput, userId?: string) {
  const existing = await prisma.jobOffer.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Offre', id);
  const slug = data.titre && data.titre !== existing.titre ? await uniqueSlug(data.titre, id) : existing.slug;
  const offer = await prisma.jobOffer.update({
    where: { id },
    data: {
      slug,
      titre: data.titre ?? existing.titre,
      description: data.description ?? existing.description,
      descriptionSociete: data.descriptionSociete !== undefined ? data.descriptionSociete : (existing as any).descriptionSociete,
      missions: data.missions !== undefined ? data.missions : (existing as any).missions,
      packageInfo: data.packageInfo !== undefined ? data.packageInfo : (existing as any).packageInfo,
      localisation: data.localisation ?? existing.localisation,
      titreEn: data.titreEn !== undefined ? data.titreEn : (existing as any).titreEn,
      descriptionEn: data.descriptionEn !== undefined ? data.descriptionEn : (existing as any).descriptionEn,
      descriptionSocieteEn: data.descriptionSocieteEn !== undefined ? data.descriptionSocieteEn : (existing as any).descriptionSocieteEn,
      missionsEn: data.missionsEn !== undefined ? data.missionsEn : (existing as any).missionsEn,
      packageInfoEn: data.packageInfoEn !== undefined ? data.packageInfoEn : (existing as any).packageInfoEn,
      localisationEn: data.localisationEn !== undefined ? data.localisationEn : (existing as any).localisationEn,
      contractType: data.contractType ?? existing.contractType,
      remote: data.remote ?? existing.remote,
      salaireMin: data.salaireMin ?? existing.salaireMin,
      salaireMax: data.salaireMax ?? existing.salaireMax,
      currency: data.currency ?? existing.currency,
      secteur: data.secteur ?? existing.secteur,
      entrepriseNom: data.entrepriseNom ?? existing.entrepriseNom,
      tags: data.tags ?? existing.tags,
      published: data.published ?? existing.published,
      mandatId: data.mandatId ?? existing.mandatId,
    },
  });
  void translateMissingEn(offer.id, userId);
  return offer;
}

export async function setPublished(id: string, published: boolean) {
  const existing = await prisma.jobOffer.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Offre', id);
  return prisma.jobOffer.update({ where: { id }, data: { published } });
}

export async function remove(id: string) {
  const existing = await prisma.jobOffer.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Offre', id);
  await prisma.jobOffer.delete({ where: { id } });
  return { ok: true };
}

// ── Public (consommé par la landing / job board) ─────
export async function listPublic() {
  const rows = await prisma.jobOffer.findMany({
    where: { published: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, createdById: true,
      slug: true, titre: true, description: true, descriptionSociete: true, missions: true, packageInfo: true,
      titreEn: true, descriptionEn: true, descriptionSocieteEn: true, missionsEn: true, packageInfoEn: true, localisationEn: true,
      localisation: true, contractType: true,
      remote: true, salaireMin: true, salaireMax: true, currency: true, secteur: true, entrepriseNom: true,
      tags: true, createdAt: true,
    },
  });
  // Rattrapage des offres publiées sans version EN (en tâche de fond, la
  // réponse n'attend pas : l'EN apparaît au chargement suivant).
  for (const r of rows) if (missingEnFields(r).length > 0) void translateMissingEn(r.id, r.createdById);
  const offers = rows.map(({ id: _id, createdById: _c, ...o }) => o);
  return { count: offers.length, offers };
}

export async function getPublicBySlug(slug: string) {
  const offer = await prisma.jobOffer.findUnique({
    where: { slug },
    select: {
      slug: true, titre: true, description: true, descriptionSociete: true, missions: true, packageInfo: true,
      titreEn: true, descriptionEn: true, descriptionSocieteEn: true, missionsEn: true, packageInfoEn: true, localisationEn: true,
      localisation: true, contractType: true,
      remote: true, salaireMin: true, salaireMax: true, currency: true, secteur: true, entrepriseNom: true,
      tags: true, published: true, createdAt: true,
    },
  });
  if (!offer || !offer.published) throw new NotFoundError('Offre', slug);
  return offer;
}

// ── Candidature publique (job board du site) ─────────────────────
// Crée un Candidat (source « Job board »). Si l'offre est rattachée à un
// mandat, crée aussi la Candidature dans le pipeline de ce mandat.
export interface PublicApplicationInput {
  nom: string;
  email: string;
  telephone?: string | null;
  linkedinUrl?: string | null;
  cvUrl?: string | null;
  disponibilite?: string | null;
  message?: string | null;
}

export async function applyToOffer(slug: string, data: PublicApplicationInput) {
  const offer = await prisma.jobOffer.findUnique({ where: { slug } });
  if (!offer || !offer.published) throw new NotFoundError('Offre', slug);

  // « Prénom Nom » → on isole le prénom du reste.
  const parts = data.nom.trim().split(/\s+/);
  const prenom = parts.length > 1 ? parts.shift()! : null;
  const nom = parts.join(' ') || data.nom.trim();

  const candidat = await prisma.candidat.create({
    data: {
      nom,
      prenom,
      email: data.email,
      telephone: data.telephone ?? null,
      linkedinUrl: data.linkedinUrl ?? null,
      cvUrl: data.cvUrl ?? null,
      disponibilite: data.disponibilite ?? null,
      source: 'Job board',
      tags: offer.secteur ? [offer.secteur] : [],
      notes: `Candidature via le job board pour « ${offer.titre} ».${data.message ? `\n\n${data.message}` : ''}`,
      consentementRgpd: true,
      consentementDate: new Date(),
    },
  });

  let candidatureId: string | null = null;
  if (offer.mandatId) {
    const candidature = await prisma.candidature
      .create({
        data: {
          mandatId: offer.mandatId,
          candidatId: candidat.id,
          stage: 'SOURCING',
          sourcePlacement: 'Job board',
          notes: `Candidature via le job board (offre : ${offer.titre}).`,
        },
      })
      .catch(() => null);
    candidatureId = candidature?.id ?? null;
  }

  void notifyJobBoardApplication({
    candidatNom: `${prenom ?? ''} ${nom}`.trim(),
    offreTitre: offer.titre,
    email: data.email,
    telephone: data.telephone ?? null,
    cvUrl: data.cvUrl ?? null,
  });

  return { ok: true, candidatId: candidat.id, candidatureId };
}

// Candidature spontanée (aucune offre) : crée juste un candidat + notif Slack.
export async function applySpontaneous(data: PublicApplicationInput) {
  const parts = data.nom.trim().split(/\s+/);
  const prenom = parts.length > 1 ? parts.shift()! : null;
  const nom = parts.join(' ') || data.nom.trim();

  const candidat = await prisma.candidat.create({
    data: {
      nom,
      prenom,
      email: data.email,
      telephone: data.telephone ?? null,
      linkedinUrl: data.linkedinUrl ?? null,
      cvUrl: data.cvUrl ?? null,
      disponibilite: data.disponibilite ?? null,
      source: 'Job board (spontanée)',
      notes: `Candidature spontanée via le job board.${data.message ? `\n\n${data.message}` : ''}`,
      consentementRgpd: true,
      consentementDate: new Date(),
    },
  });

  void notifyJobBoardApplication({
    candidatNom: `${prenom ?? ''} ${nom}`.trim(),
    offreTitre: null,
    email: data.email,
    telephone: data.telephone ?? null,
    cvUrl: data.cvUrl ?? null,
  });

  return { ok: true, candidatId: candidat.id, candidatureId: null };
}
