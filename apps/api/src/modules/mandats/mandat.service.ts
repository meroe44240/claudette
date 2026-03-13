import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';
import { paginatedResult, paginationToSkipTake } from '../../lib/pagination.js';
import type { PaginationParams } from '../../lib/pagination.js';
import type { CreateMandatInput, UpdateMandatInput, UpdateFeeInput } from './mandat.schema.js';

function calculateFeeMontantEstime(salaireMin?: number | null, salaireMax?: number | null, feePourcentage?: number | null): number | undefined {
  if (salaireMin != null && salaireMax != null && feePourcentage != null) {
    return Math.round(((salaireMin + salaireMax) / 2) * feePourcentage / 100);
  }
  return undefined;
}

export async function list(
  params: PaginationParams,
  search?: string,
  statut?: string,
  priorite?: string,
  entrepriseId?: string,
) {
  const where: any = {};

  if (search) {
    where.OR = [
      { titrePoste: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { entreprise: { nom: { contains: search, mode: 'insensitive' } } },
    ];
  }

  if (statut) {
    where.statut = statut;
  }

  if (priorite) {
    where.priorite = priorite;
  }

  if (entrepriseId) {
    where.entrepriseId = entrepriseId;
  }

  const { skip, take } = paginationToSkipTake(params);

  const [data, total] = await Promise.all([
    prisma.mandat.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        entreprise: { select: { id: true, nom: true } },
        client: { select: { id: true, nom: true, prenom: true } },
        assignedTo: { select: { id: true, nom: true, prenom: true } },
        _count: { select: { candidatures: true } },
      },
    }),
    prisma.mandat.count({ where }),
  ]);

  return paginatedResult(data, total, params);
}

export async function getById(id: string) {
  const mandat = await prisma.mandat.findUnique({
    where: { id },
    include: {
      entreprise: true,
      client: true,
      assignedTo: { select: { id: true, nom: true, prenom: true } },
      candidatures: {
        include: {
          candidat: {
            select: {
              id: true,
              nom: true,
              prenom: true,
              email: true,
              telephone: true,
              posteActuel: true,
              entrepriseActuelle: true,
              localisation: true,
              linkedinUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!mandat) throw new NotFoundError('Mandat', id);
  return mandat;
}

export async function create(data: CreateMandatInput, createdById: string) {
  // Verify entreprise exists
  const entreprise = await prisma.entreprise.findUnique({ where: { id: data.entrepriseId } });
  if (!entreprise) throw new NotFoundError('Entreprise', data.entrepriseId);

  // Verify client exists
  const client = await prisma.client.findUnique({ where: { id: data.clientId } });
  if (!client) throw new NotFoundError('Client', data.clientId);

  const feeMontantEstime = calculateFeeMontantEstime(data.salaireMin, data.salaireMax, data.feePourcentage);

  return prisma.mandat.create({
    data: {
      ...data,
      feeMontantEstime,
      createdById,
    },
  });
}

export async function update(id: string, data: UpdateMandatInput) {
  const existing = await prisma.mandat.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Mandat', id);

  // Determine values for fee recalculation
  const salaireMin = data.salaireMin !== undefined ? data.salaireMin : existing.salaireMin;
  const salaireMax = data.salaireMax !== undefined ? data.salaireMax : existing.salaireMax;
  const feePourcentage = data.feePourcentage !== undefined ? data.feePourcentage : Number(existing.feePourcentage);

  const updateData: any = { ...data };

  // Recalculate feeMontantEstime if salary or fee% changes
  if (data.salaireMin !== undefined || data.salaireMax !== undefined || data.feePourcentage !== undefined) {
    const estimated = calculateFeeMontantEstime(salaireMin, salaireMax, feePourcentage);
    if (estimated !== undefined) {
      updateData.feeMontantEstime = estimated;
    }
  }

  return prisma.mandat.update({
    where: { id },
    data: updateData,
  });
}

export async function remove(id: string) {
  const existing = await prisma.mandat.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Mandat', id);

  // Delete candidatures and their stage history
  const candidatures = await prisma.candidature.findMany({
    where: { mandatId: id },
    select: { id: true },
  });

  if (candidatures.length > 0) {
    await prisma.stageHistory.deleteMany({
      where: { candidatureId: { in: candidatures.map((c) => c.id) } },
    });
    await prisma.candidature.deleteMany({ where: { mandatId: id } });
  }

  // Delete mandat-related activites
  const activites = await prisma.activite.findMany({
    where: { entiteType: 'MANDAT', entiteId: id },
    select: { id: true },
  });

  if (activites.length > 0) {
    await prisma.fichierActivite.deleteMany({
      where: { activiteId: { in: activites.map((a) => a.id) } },
    });
    await prisma.activite.deleteMany({
      where: { entiteType: 'MANDAT', entiteId: id },
    });
  }

  return prisma.mandat.delete({ where: { id } });
}

export async function clone(id: string) {
  const existing = await prisma.mandat.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Mandat', id);

  return prisma.mandat.create({
    data: {
      titrePoste: `${existing.titrePoste} (copie)`,
      entrepriseId: existing.entrepriseId,
      clientId: existing.clientId,
      description: existing.description,
      localisation: existing.localisation,
      salaireMin: existing.salaireMin,
      salaireMax: existing.salaireMax,
      feePourcentage: existing.feePourcentage,
      feeMontantEstime: existing.feeMontantEstime,
      statut: 'OUVERT',
      priorite: existing.priorite,
      notes: existing.notes,
      createdById: existing.createdById,
    },
  });
}

export async function getKanban(id: string) {
  const existing = await prisma.mandat.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Mandat', id);

  const candidatures = await prisma.candidature.findMany({
    where: { mandatId: id },
    include: {
      candidat: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          email: true,
          telephone: true,
          posteActuel: true,
          entrepriseActuelle: true,
          localisation: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Group candidatures by stage
  const stages = ['SOURCING', 'CONTACTE', 'ENTRETIEN_1', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE', 'REFUSE'] as const;
  const kanban: Record<string, typeof candidatures> = {};

  for (const stage of stages) {
    kanban[stage] = candidatures.filter((c) => c.stage === stage);
  }

  return kanban;
}

export async function updateFee(id: string, data: UpdateFeeInput) {
  const existing = await prisma.mandat.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Mandat', id);

  return prisma.mandat.update({
    where: { id },
    data: {
      ...(data.feeMontantFacture !== undefined && { feeMontantFacture: data.feeMontantFacture }),
      ...(data.feeStatut !== undefined && { feeStatut: data.feeStatut }),
    },
  });
}
