import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';
import { notifyJobBoardApplication } from '../slack/slack.service.js';

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

// ── ATS (interne) ───────────────────────────────
export async function list() {
  return prisma.jobOffer.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function create(data: JobOfferInput, userId?: string) {
  const slug = await uniqueSlug(data.titre);
  return prisma.jobOffer.create({
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
}

export async function update(id: string, data: JobOfferInput) {
  const existing = await prisma.jobOffer.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Offre', id);
  const slug = data.titre && data.titre !== existing.titre ? await uniqueSlug(data.titre, id) : existing.slug;
  return prisma.jobOffer.update({
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
      slug: true, titre: true, description: true, descriptionSociete: true, missions: true, packageInfo: true,
      titreEn: true, descriptionEn: true, descriptionSocieteEn: true, missionsEn: true, packageInfoEn: true, localisationEn: true,
      localisation: true, contractType: true,
      remote: true, salaireMin: true, salaireMax: true, currency: true, secteur: true, entrepriseNom: true,
      tags: true, createdAt: true,
    },
  });
  return { count: rows.length, offers: rows };
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
