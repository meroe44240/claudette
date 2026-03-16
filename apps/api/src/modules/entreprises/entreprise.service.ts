import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';
import {
  type PaginationParams,
  paginationToSkipTake,
  paginatedResult,
} from '../../lib/pagination.js';
import { StageCandidature } from '@prisma/client';
import type { CreateEntrepriseInput, UpdateEntrepriseInput } from './entreprise.schema.js';

/**
 * Extract hostname from a website URL.
 * Returns null if the URL is invalid.
 */
function extractHostname(siteWeb: string): string | null {
  try {
    const hostname = new URL(siteWeb.startsWith('http') ? siteWeb : `https://${siteWeb}`).hostname;
    if (!hostname || hostname === 'localhost') return null;
    return hostname;
  } catch {
    return null;
  }
}

/**
 * Generate a logo URL from a website URL using Google Favicon API.
 * Returns a 128px favicon for the domain — reliable and free.
 */
function generateLogoUrl(siteWeb: string): string | null {
  const hostname = extractHostname(siteWeb);
  if (!hostname) return null;
  return `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
}

export async function getPappersStats() {
  const [total, enriched] = await Promise.all([
    prisma.entreprise.count(),
    prisma.entreprise.count({ where: { pappersEnrichedAt: { not: null } } }),
  ]);
  return { total, enriched, percentage: total > 0 ? Math.round((enriched / total) * 100) : 0 };
}

export async function list(
  params: PaginationParams,
  search?: string,
  sectors?: string[],
  cities?: string[],
  taille?: string,
  enriched?: boolean,
  sortBy?: string,
  sortDir?: 'asc' | 'desc',
  performance?: string,
) {
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

  if (enriched === true) {
    where.pappersEnrichedAt = { not: null };
  } else if (enriched === false) {
    where.pappersEnrichedAt = null;
  }

  // Determine if sort is on a computed field or a native Prisma field
  const computedSortFields = ['revenueCumule', 'mandatsActifs', 'mandatsHistoriques', 'placements', 'dernierMandat'];
  const isComputedSort = !sortBy || computedSortFields.includes(sortBy);

  const nativeSortMap: Record<string, any> = {
    nom: { nom: sortDir || 'asc' },
    createdAt: { createdAt: sortDir || 'desc' },
  };
  const orderBy = (!isComputedSort && sortBy && nativeSortMap[sortBy])
    ? nativeSortMap[sortBy]
    : { createdAt: 'desc' };

  const includeBlock = {
    _count: { select: { clients: true, mandats: true } },
    mandats: {
      select: {
        id: true,
        statut: true,
        feeMontantFacture: true,
        feeStatut: true,
        createdAt: true,
        candidatures: {
          select: { stage: true },
        },
      },
    },
  };

  // For computed sorts: fetch ALL matching records (no skip/take) so we can sort in memory
  // For native sorts: use DB-level pagination
  const { skip, take } = paginationToSkipTake(params);

  const [data, total] = await Promise.all([
    prisma.entreprise.findMany({
      where,
      ...(isComputedSort ? {} : { skip, take }),
      orderBy,
      include: includeBlock,
    }),
    prisma.entreprise.count({ where }),
  ]);

  // Post-query enrichment: compute derived fields from mandats
  let enrichedData = data.map((ent) => {
    const mandatsActifs = ent.mandats.filter((m) =>
      ['OUVERT', 'EN_COURS'].includes(m.statut),
    ).length;
    const mandatsHistoriques = ent.mandats.length;
    const placements = ent.mandats.reduce(
      (sum, m) => sum + m.candidatures.filter((c) => c.stage === 'PLACE').length,
      0,
    );
    const revenueCumule = ent.mandats
      .filter((m) => m.feeStatut === 'PAYE')
      .reduce((sum, m) => sum + (m.feeMontantFacture ?? 0), 0);
    const dernierMandat = ent.mandats.length > 0
      ? ent.mandats.reduce(
          (latest, m) => (m.createdAt > latest ? m.createdAt : latest),
          ent.mandats[0].createdAt,
        )
      : null;
    const pappersEnriched = !!ent.pappersEnrichedAt;

    // Strip raw mandats from response
    const { mandats, ...rest } = ent;
    return {
      ...rest,
      mandatsActifs,
      mandatsHistoriques,
      placements,
      revenueCumule,
      dernierMandat,
      pappersEnriched,
    };
  });

  // Performance filter (post-enrichment, before sorting)
  if (performance) {
    const perfFilters = performance.split(',').map((p) => p.trim());
    if (perfFilters.includes('revenue_positive')) {
      enrichedData = enrichedData.filter((e) => e.revenueCumule > 0);
    }
    if (perfFilters.includes('jamais_travaille')) {
      enrichedData = enrichedData.filter((e) => e.mandatsHistoriques === 0);
    }
  }

  // For computed sorts: sort in memory, then paginate via slice
  if (isComputedSort) {
    const actualSortBy = sortBy || 'revenueCumule';
    const actualSortDir = sortDir || 'desc';
    enrichedData.sort((a, b) => {
      const aVal = (a as any)[actualSortBy] ?? 0;
      const bVal = (b as any)[actualSortBy] ?? 0;
      const aNum = aVal instanceof Date ? aVal.getTime() : (typeof aVal === 'number' ? aVal : 0);
      const bNum = bVal instanceof Date ? bVal.getTime() : (typeof bVal === 'number' ? bVal : 0);
      return actualSortDir === 'asc' ? aNum - bNum : bNum - aNum;
    });

    const sliced = enrichedData.slice(skip, skip + take);
    return paginatedResult(sliced, enrichedData.length, params);
  }

  return paginatedResult(enrichedData, total, params);
}

export async function getById(id: string) {
  const entreprise = await prisma.entreprise.findUnique({
    where: { id },
    include: {
      _count: { select: { clients: true, mandats: true } },
      clients: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          email: true,
          telephone: true,
          poste: true,
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
      },
      mandats: {
        select: {
          id: true,
          titrePoste: true,
          statut: true,
          createdAt: true,
          _count: { select: { candidatures: true } },
        },
        take: 20,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!entreprise) throw new NotFoundError('Entreprise', id);

  return entreprise;
}

export async function create(data: CreateEntrepriseInput, createdById: string) {
  // Auto-generate logo URL from siteWeb if not provided
  if (data.siteWeb && !data.logoUrl) {
    const logo = generateLogoUrl(data.siteWeb);
    if (logo) data.logoUrl = logo;
  }

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

  // Auto-generate logo URL if siteWeb changed and no logoUrl provided (or old Clearbit URL)
  const hasBrokenLogo = existing.logoUrl?.includes('logo.clearbit.com');
  if (data.siteWeb && !data.logoUrl && (!existing.logoUrl || hasBrokenLogo)) {
    const logo = generateLogoUrl(data.siteWeb);
    if (logo) data.logoUrl = logo;
  }

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
        some: { stage: StageCandidature.PLACE },
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

export async function backfillLogos() {
  // Backfill: set logo for entreprises with siteWeb but no logo,
  // AND replace broken Clearbit URLs from old backfill
  const entreprises = await prisma.entreprise.findMany({
    where: {
      siteWeb: { not: null },
      OR: [
        { logoUrl: null },
        { logoUrl: { contains: 'logo.clearbit.com' } },
      ],
    },
    select: { id: true, siteWeb: true },
  });

  let count = 0;
  for (const ent of entreprises) {
    if (!ent.siteWeb) continue;
    const logo = generateLogoUrl(ent.siteWeb);
    if (logo) {
      await prisma.entreprise.update({
        where: { id: ent.id },
        data: { logoUrl: logo },
      });
      count++;
    }
  }
  return count;
}
