import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';

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
  localisation?: string | null;
  contractType?: string | null;
  remote?: string | null;
  salaireMin?: number | null;
  salaireMax?: number | null;
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
      localisation: data.localisation ?? null,
      contractType: data.contractType ?? null,
      remote: data.remote ?? null,
      salaireMin: data.salaireMin ?? null,
      salaireMax: data.salaireMax ?? null,
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
      localisation: data.localisation ?? existing.localisation,
      contractType: data.contractType ?? existing.contractType,
      remote: data.remote ?? existing.remote,
      salaireMin: data.salaireMin ?? existing.salaireMin,
      salaireMax: data.salaireMax ?? existing.salaireMax,
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
      slug: true, titre: true, description: true, localisation: true, contractType: true,
      remote: true, salaireMin: true, salaireMax: true, secteur: true, entrepriseNom: true,
      tags: true, createdAt: true,
    },
  });
  return { count: rows.length, offers: rows };
}

export async function getPublicBySlug(slug: string) {
  const offer = await prisma.jobOffer.findUnique({
    where: { slug },
    select: {
      slug: true, titre: true, description: true, localisation: true, contractType: true,
      remote: true, salaireMin: true, salaireMax: true, secteur: true, entrepriseNom: true,
      tags: true, published: true, createdAt: true,
    },
  });
  if (!offer || !offer.published) throw new NotFoundError('Offre', slug);
  return offer;
}
