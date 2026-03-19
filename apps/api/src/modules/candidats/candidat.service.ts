import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';
import { paginatedResult, paginationToSkipTake } from '../../lib/pagination.js';
import type { PaginationParams } from '../../lib/pagination.js';
import type { CreateCandidatInput, UpdateCandidatInput, CreateExperienceInput, UpdateExperienceInput } from './candidat.schema.js';

export async function list(
  params: PaginationParams,
  search?: string,
  localisation?: string,
  source?: string,
  tags?: string[],
  salaireMin?: number,
  salaireMax?: number,
  poste?: string,
  entreprise?: string,
  disponibilite?: string,
  assignedToId?: string,
  stages?: string[],
  dateAddedPeriod?: string,
  sortBy?: string,
  sortDir?: 'asc' | 'desc',
) {
  const where: any = {};

  if (search) {
    where.OR = [
      { nom: { contains: search, mode: 'insensitive' } },
      { prenom: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { posteActuel: { contains: search, mode: 'insensitive' } },
      { entrepriseActuelle: { contains: search, mode: 'insensitive' } },
      { experiences: { some: { titre: { contains: search, mode: 'insensitive' } } } },
      { experiences: { some: { entreprise: { contains: search, mode: 'insensitive' } } } },
    ];
  }

  if (localisation) {
    const locs = localisation.split(',').map((l) => l.trim()).filter(Boolean);
    if (locs.length === 1) {
      where.localisation = { contains: locs[0], mode: 'insensitive' };
    } else if (locs.length > 1) {
      // Use AND to combine with any existing OR (search)
      const locCondition = { OR: locs.map((l) => ({ localisation: { contains: l, mode: 'insensitive' as const } })) };
      where.AND = [...(where.AND || []), locCondition];
    }
  }

  if (source) {
    const sources = source.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (sources.length === 1) {
      where.source = { equals: sources[0], mode: 'insensitive' };
    } else if (sources.length > 1) {
      const srcCondition = { OR: sources.map((s) => ({ source: { equals: s, mode: 'insensitive' as const } })) };
      where.AND = [...(where.AND || []), srcCondition];
    }
  }

  if (tags && tags.length > 0) {
    where.tags = { hasSome: tags };
  }

  if (salaireMin !== undefined) {
    where.salaireSouhaite = { ...where.salaireSouhaite, gte: salaireMin };
  }

  if (salaireMax !== undefined) {
    where.salaireSouhaite = { ...where.salaireSouhaite, lte: salaireMax };
  }

  if (poste) {
    where.posteActuel = { contains: poste, mode: 'insensitive' };
  }

  if (entreprise) {
    where.entrepriseActuelle = { contains: entreprise, mode: 'insensitive' };
  }

  if (disponibilite) {
    where.disponibilite = { equals: disponibilite, mode: 'insensitive' };
  }

  if (assignedToId) {
    where.assignedToId = assignedToId;
  }

  if (stages && stages.length > 0) {
    where.candidatures = { some: { stage: { in: stages } } };
  }

  if (dateAddedPeriod) {
    const now = new Date();
    let gte: Date;
    switch (dateAddedPeriod) {
      case 'week':
        gte = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        gte = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
        break;
      case '3months':
        gte = new Date(now.getTime() - 93 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        gte = new Date(now.getTime() - 366 * 24 * 60 * 60 * 1000);
        break;
      default:
        gte = new Date(0);
    }
    where.createdAt = { gte };
  }

  const { skip, take } = paginationToSkipTake(params);

  // Build orderBy from sortBy/sortDir
  const allowedSorts: Record<string, any> = {
    nom: { nom: sortDir || 'asc' },
    prenom: { prenom: sortDir || 'asc' },
    posteActuel: { posteActuel: sortDir || 'asc' },
    entrepriseActuelle: { entrepriseActuelle: sortDir || 'asc' },
    localisation: { localisation: sortDir || 'asc' },
    salaireSouhaite: { salaireSouhaite: sortDir || 'desc' },
    salaireActuel: { salaireActuel: sortDir || 'desc' },
    anneesExperience: { anneesExperience: sortDir || 'desc' },
    createdAt: { createdAt: sortDir || 'desc' },
  };
  const orderBy = (sortBy && allowedSorts[sortBy]) || { createdAt: 'desc' };

  const [data, total] = await Promise.all([
    prisma.candidat.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        _count: { select: { candidatures: true } },
        assignedTo: { select: { id: true, nom: true, prenom: true } },
      },
    }),
    prisma.candidat.count({ where }),
  ]);

  return paginatedResult(data, total, params);
}

export async function getById(id: string) {
  const candidat = await prisma.candidat.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, nom: true, prenom: true } },
      experiences: { orderBy: { anneeDebut: 'desc' } },
      candidatures: {
        include: {
          mandat: {
            select: {
              id: true,
              titrePoste: true,
              slug: true,
              entreprise: { select: { id: true, nom: true } },
              statut: true,
            },
          },
          stageHistory: {
            orderBy: { changedAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!candidat) throw new NotFoundError('Candidat', id);
  return candidat;
}

export async function create(data: CreateCandidatInput, createdById: string) {
  // Cast JSON fields to any for Prisma compatibility
  const prismaData = {
    ...data,
    aiAnonymizedProfile: data.aiAnonymizedProfile as any,
    aiSellingPoints: data.aiSellingPoints as any,
  };

  // Upsert: if a candidat with the same linkedinUrl already exists, update it
  if (data.linkedinUrl) {
    // Normalize URL for matching: remove trailing slashes and query params
    const normalized = data.linkedinUrl.replace(/\/+$/, '').split('?')[0].split('#')[0];
    const withSlash = normalized + '/';

    const existing = await prisma.candidat.findFirst({
      where: {
        OR: [
          { linkedinUrl: normalized },
          { linkedinUrl: withSlash },
          { linkedinUrl: data.linkedinUrl },
        ],
      },
    });
    if (existing) {
      return {
        ...(await prisma.candidat.update({
          where: { id: existing.id },
          data: {
            ...prismaData,
            linkedinUrl: normalized, // Normalize stored URL
            createdById: existing.createdById,
          },
        })),
        _updated: true,
      };
    }
  }

  return prisma.candidat.create({
    data: {
      ...prismaData,
      consentementDate: data.consentementRgpd ? new Date() : undefined,
      createdById,
      assignedToId: prismaData.assignedToId ?? createdById,
    },
  });
}

export async function update(id: string, data: UpdateCandidatInput) {
  const existing = await prisma.candidat.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Candidat', id);

  const updateData: any = { ...data };

  // If consentementRgpd is being set to true and was not true before, set the date
  if (data.consentementRgpd === true && !existing.consentementRgpd) {
    updateData.consentementDate = new Date();
  }

  return prisma.candidat.update({
    where: { id },
    data: updateData,
  });
}

export async function remove(id: string) {
  const existing = await prisma.candidat.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Candidat', id);

  // Delete related candidatures first (cascade will handle stageHistory)
  await prisma.candidature.deleteMany({ where: { candidatId: id } });

  return prisma.candidat.delete({ where: { id } });
}

export async function gdprDelete(id: string) {
  const existing = await prisma.candidat.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Candidat', id);

  // Delete in order: stageHistory (via candidatures cascade), candidatures, activites fichiers, activites, then candidat
  const candidatureIds = await prisma.candidature.findMany({
    where: { candidatId: id },
    select: { id: true },
  });

  if (candidatureIds.length > 0) {
    await prisma.stageHistory.deleteMany({
      where: { candidatureId: { in: candidatureIds.map((c) => c.id) } },
    });
    await prisma.candidature.deleteMany({ where: { candidatId: id } });
  }

  // Delete activites and their fichiers for this candidat
  const activites = await prisma.activite.findMany({
    where: { entiteType: 'CANDIDAT', entiteId: id },
    select: { id: true },
  });

  if (activites.length > 0) {
    await prisma.fichierActivite.deleteMany({
      where: { activiteId: { in: activites.map((a) => a.id) } },
    });
    await prisma.activite.deleteMany({
      where: { entiteType: 'CANDIDAT', entiteId: id },
    });
  }

  return prisma.candidat.delete({ where: { id } });
}

export async function checkDuplicate(email: string) {
  if (!email) return { exists: false };

  const match = await prisma.candidat.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, nom: true, prenom: true, email: true },
  });

  if (match) {
    return { exists: true, match };
  }
  return { exists: false };
}

export async function exportData(id: string) {
  const candidat = await prisma.candidat.findUnique({
    where: { id },
    include: {
      experiences: { orderBy: { anneeDebut: 'desc' } },
      candidatures: {
        include: {
          mandat: {
            select: {
              id: true,
              titrePoste: true,
              entreprise: { select: { id: true, nom: true } },
            },
          },
          stageHistory: true,
        },
      },
    },
  });

  if (!candidat) throw new NotFoundError('Candidat', id);

  const activites = await prisma.activite.findMany({
    where: { entiteType: 'CANDIDAT', entiteId: id },
    include: { fichiers: true },
  });

  return {
    ...candidat,
    activites,
  };
}

// ─── EXPERIENCE CRUD ────────────────────────────────

export async function listExperiences(candidatId: string) {
  const candidat = await prisma.candidat.findUnique({ where: { id: candidatId } });
  if (!candidat) throw new NotFoundError('Candidat', candidatId);
  return prisma.candidatExperience.findMany({
    where: { candidatId },
    orderBy: { anneeDebut: 'desc' },
  });
}

export async function createExperience(candidatId: string, data: CreateExperienceInput) {
  const candidat = await prisma.candidat.findUnique({ where: { id: candidatId } });
  if (!candidat) throw new NotFoundError('Candidat', candidatId);
  return prisma.candidatExperience.create({
    data: { ...data, candidatId },
  });
}

export async function updateExperience(experienceId: string, data: UpdateExperienceInput) {
  const existing = await prisma.candidatExperience.findUnique({ where: { id: experienceId } });
  if (!existing) throw new NotFoundError('Experience', experienceId);
  return prisma.candidatExperience.update({
    where: { id: experienceId },
    data,
  });
}

export async function deleteExperience(experienceId: string) {
  const existing = await prisma.candidatExperience.findUnique({ where: { id: experienceId } });
  if (!existing) throw new NotFoundError('Experience', experienceId);
  return prisma.candidatExperience.delete({ where: { id: experienceId } });
}

export async function bulkCreateExperiences(
  candidatId: string,
  experiences: CreateExperienceInput[],
) {
  // Delete old CV-sourced experiences, then insert new ones
  await prisma.candidatExperience.deleteMany({
    where: { candidatId, source: 'cv' },
  });
  if (experiences.length === 0) return [];
  return prisma.candidatExperience.createMany({
    data: experiences.map((exp) => ({ ...exp, candidatId, source: 'cv' })),
  });
}
