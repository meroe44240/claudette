import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';
import {
  type PaginationParams,
  paginationToSkipTake,
  paginatedResult,
} from '../../lib/pagination.js';
import type { CreateEntrepriseInput, UpdateEntrepriseInput } from './entreprise.schema.js';

export async function list(
  params: PaginationParams,
  search?: string,
  sectors?: string[],
  cities?: string[],
  taille?: string,
) {
  const { skip, take } = paginationToSkipTake(params);

  const where: any = {};

  if (search) {
    where.nom = { contains: search, mode: 'insensitive' };
  }

  if (sectors && sectors.length > 0) {
    where.OR = sectors.map((s) => ({ secteur: { contains: s, mode: 'insensitive' } }));
  }

  if (cities && cities.length > 0) {
    // If we already have an OR from sectors, we need to use AND to combine them
    if (where.OR) {
      const sectorOR = where.OR;
      delete where.OR;
      where.AND = [
        { OR: sectorOR },
        { OR: cities.map((c) => ({ localisation: { contains: c, mode: 'insensitive' } })) },
      ];
    } else {
      where.OR = cities.map((c) => ({ localisation: { contains: c, mode: 'insensitive' } }));
    }
  }

  if (taille) {
    where.taille = taille;
  }

  const [data, total] = await Promise.all([
    prisma.entreprise.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { clients: true, mandats: true } },
      },
    }),
    prisma.entreprise.count({ where }),
  ]);

  return paginatedResult(data, total, params);
}

export async function getById(id: string) {
  const entreprise = await prisma.entreprise.findUnique({
    where: { id },
    include: {
      _count: { select: { clients: true, mandats: true } },
    },
  });

  if (!entreprise) throw new NotFoundError('Entreprise', id);

  return entreprise;
}

export async function create(data: CreateEntrepriseInput, createdById: string) {
  return prisma.entreprise.create({
    data: {
      ...data,
      createdById,
    },
  });
}

export async function update(id: string, data: UpdateEntrepriseInput) {
  const existing = await prisma.entreprise.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Entreprise', id);

  return prisma.entreprise.update({
    where: { id },
    data,
  });
}

export async function remove(id: string) {
  const existing = await prisma.entreprise.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Entreprise', id);

  // Delete mandats and their candidatures
  const mandats = await prisma.mandat.findMany({
    where: { entrepriseId: id },
    select: { id: true },
  });

  if (mandats.length > 0) {
    const mandatIds = mandats.map((m) => m.id);
    const candidatures = await prisma.candidature.findMany({
      where: { mandatId: { in: mandatIds } },
      select: { id: true },
    });

    if (candidatures.length > 0) {
      await prisma.stageHistory.deleteMany({
        where: { candidatureId: { in: candidatures.map((c) => c.id) } },
      });
      await prisma.candidature.deleteMany({
        where: { mandatId: { in: mandatIds } },
      });
    }

    // Delete mandat-related activites
    const mandatActivites = await prisma.activite.findMany({
      where: { entiteType: 'MANDAT', entiteId: { in: mandatIds } },
      select: { id: true },
    });
    if (mandatActivites.length > 0) {
      await prisma.fichierActivite.deleteMany({
        where: { activiteId: { in: mandatActivites.map((a) => a.id) } },
      });
      await prisma.activite.deleteMany({
        where: { entiteType: 'MANDAT', entiteId: { in: mandatIds } },
      });
    }

    await prisma.mandat.deleteMany({ where: { entrepriseId: id } });
  }

  // Delete clients
  const clients = await prisma.client.findMany({
    where: { entrepriseId: id },
    select: { id: true },
  });

  if (clients.length > 0) {
    const clientIds = clients.map((c) => c.id);

    // Delete client-related activites
    const clientActivites = await prisma.activite.findMany({
      where: { entiteType: 'CLIENT', entiteId: { in: clientIds } },
      select: { id: true },
    });
    if (clientActivites.length > 0) {
      await prisma.fichierActivite.deleteMany({
        where: { activiteId: { in: clientActivites.map((a) => a.id) } },
      });
      await prisma.activite.deleteMany({
        where: { entiteType: 'CLIENT', entiteId: { in: clientIds } },
      });
    }

    await prisma.client.deleteMany({ where: { entrepriseId: id } });
  }

  // Delete entreprise-related activites
  const activites = await prisma.activite.findMany({
    where: { entiteType: 'ENTREPRISE', entiteId: id },
    select: { id: true },
  });
  if (activites.length > 0) {
    await prisma.fichierActivite.deleteMany({
      where: { activiteId: { in: activites.map((a) => a.id) } },
    });
    await prisma.activite.deleteMany({
      where: { entiteType: 'ENTREPRISE', entiteId: id },
    });
  }

  return prisma.entreprise.delete({ where: { id } });
}

export async function checkDuplicate(nom: string) {
  if (!nom) return { exists: false };

  const match = await prisma.entreprise.findFirst({
    where: { nom: { equals: nom, mode: 'insensitive' } },
    select: { id: true, nom: true },
  });

  if (match) {
    return { exists: true, match };
  }
  return { exists: false };
}

export async function getStats(id: string) {
  const existing = await prisma.entreprise.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Entreprise', id);

  const mandats = await prisma.mandat.findMany({
    where: {
      entrepriseId: id,
      candidatures: {
        some: { stage: 'PLACE' },
      },
      feeStatut: 'PAYE',
    },
    select: {
      feeMontantFacture: true,
    },
  });

  const revenueCumule = mandats.reduce(
    (sum, m) => sum + (m.feeMontantFacture ?? 0),
    0,
  );
  const nombrePlacements = mandats.length;
  const feeMoyen = nombrePlacements > 0 ? Math.round(revenueCumule / nombrePlacements) : 0;

  return {
    revenueCumule,
    nombrePlacements,
    feeMoyen,
  };
}
