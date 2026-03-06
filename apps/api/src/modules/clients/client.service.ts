import prisma from '../../lib/db.js';
import { NotFoundError, ForbiddenError } from '../../lib/errors.js';
import {
  type PaginationParams,
  paginationToSkipTake,
  paginatedResult,
} from '../../lib/pagination.js';
import type { CreateClientInput, UpdateClientInput } from './client.schema.js';
import type { StatutClient } from '@prisma/client';

export async function list(
  params: PaginationParams,
  search?: string,
  entrepriseId?: string,
  statutClient?: string,
  sectors?: string[],
  cities?: string[],
  roles?: string[],
  assignedToId?: string,
) {
  const { skip, take } = paginationToSkipTake(params);

  const where: any = {};
  const AND: any[] = [];

  if (search) {
    where.OR = [
      { nom: { contains: search, mode: 'insensitive' } },
      { prenom: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (entrepriseId) {
    where.entrepriseId = entrepriseId;
  }

  if (statutClient) {
    const statuts = statutClient.split(',').map((s) => s.trim()).filter(Boolean);
    if (statuts.length === 1) {
      where.statutClient = statuts[0];
    } else if (statuts.length > 1) {
      where.statutClient = { in: statuts };
    }
  }

  if (sectors && sectors.length > 0) {
    AND.push({
      entreprise: {
        OR: sectors.map((s) => ({ secteur: { contains: s, mode: 'insensitive' } })),
      },
    });
  }

  if (cities && cities.length > 0) {
    AND.push({
      entreprise: {
        OR: cities.map((c) => ({ localisation: { contains: c, mode: 'insensitive' } })),
      },
    });
  }

  if (roles && roles.length > 0) {
    where.roleContact = { in: roles };
  }

  if (assignedToId) {
    where.assignedToId = assignedToId;
  }

  if (AND.length > 0) {
    where.AND = AND;
  }

  const [data, total] = await Promise.all([
    prisma.client.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        entreprise: { select: { id: true, nom: true, secteur: true, localisation: true } },
        assignedTo: { select: { id: true, nom: true, prenom: true } },
        mandats: { select: { id: true, statut: true } },
      },
    }),
    prisma.client.count({ where }),
  ]);

  return paginatedResult(data, total, params);
}

export async function getById(id: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      entreprise: true,
      mandats: true,
      assignedTo: { select: { id: true, nom: true, prenom: true, avatarUrl: true } },
    },
  });

  if (!client) throw new NotFoundError('Client', id);

  // Fetch last activity date for ownership expiry computation
  const lastActivity = await prisma.activite.findFirst({
    where: { entiteType: 'CLIENT', entiteId: id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  return { ...client, lastActivityAt: lastActivity?.createdAt ?? null };
}

export async function create(data: CreateClientInput, createdById: string) {
  // Verifier que l'entreprise existe
  const entreprise = await prisma.entreprise.findUnique({
    where: { id: data.entrepriseId },
  });
  if (!entreprise) throw new NotFoundError('Entreprise', data.entrepriseId);

  return prisma.client.create({
    data: {
      ...data,
      createdById,
    },
    include: {
      entreprise: { select: { id: true, nom: true } },
    },
  });
}

export async function update(id: string, data: UpdateClientInput) {
  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Client', id);

  // Si entrepriseId est fourni, verifier que l'entreprise existe
  if (data.entrepriseId) {
    const entreprise = await prisma.entreprise.findUnique({
      where: { id: data.entrepriseId },
    });
    if (!entreprise) throw new NotFoundError('Entreprise', data.entrepriseId);
  }

  return prisma.client.update({
    where: { id },
    data,
    include: {
      entreprise: { select: { id: true, nom: true } },
    },
  });
}

export async function remove(id: string) {
  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Client', id);

  // Delete related activites and their fichiers
  const activites = await prisma.activite.findMany({
    where: { entiteType: 'CLIENT', entiteId: id },
    select: { id: true },
  });

  if (activites.length > 0) {
    await prisma.fichierActivite.deleteMany({
      where: { activiteId: { in: activites.map((a) => a.id) } },
    });
    await prisma.activite.deleteMany({
      where: { entiteType: 'CLIENT', entiteId: id },
    });
  }

  // Delete mandats associated with this client (and their candidatures)
  const mandats = await prisma.mandat.findMany({
    where: { clientId: id },
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

    await prisma.mandat.deleteMany({ where: { clientId: id } });
  }

  return prisma.client.delete({ where: { id } });
}

export async function checkDuplicate(email: string) {
  if (!email) return { exists: false };

  const match = await prisma.client.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, nom: true, prenom: true, email: true },
  });

  if (match) {
    return { exists: true, match };
  }
  return { exists: false };
}

export async function getPipeline() {
  const allStatuts: StatutClient[] = [
    'LEAD',
    'PREMIER_CONTACT',
    'BESOIN_QUALIFIE',
    'PROPOSITION_ENVOYEE',
    'MANDAT_SIGNE',
    'RECURRENT',
    'INACTIF',
  ];

  const clients = await prisma.client.findMany({
    include: {
      entreprise: { select: { id: true, nom: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const pipeline: Record<string, { count: number; clients: typeof clients }> = {};

  for (const statut of allStatuts) {
    const filtered = clients.filter((c) => c.statutClient === statut);
    pipeline[statut] = {
      count: filtered.length,
      clients: filtered,
    };
  }

  return pipeline;
}

// ─── Client ownership assignment ────────────────────────────

export async function assignClient(
  clientId: string,
  assignedToId: string | null,
  callerUserId: string,
  callerRole: string,
) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, nom: true, prenom: true, assignedToId: true },
  });
  if (!client) throw new NotFoundError('Client', clientId);

  // Permission check: if client already has an owner, only owner or ADMIN can reassign
  if (client.assignedToId) {
    if (client.assignedToId !== callerUserId && callerRole !== 'ADMIN') {
      throw new ForbiddenError(
        'Seul le recruteur assigné ou un administrateur peut réassigner ce client',
      );
    }
  }

  // If assigning to someone, verify user exists
  if (assignedToId) {
    const targetUser = await prisma.user.findUnique({
      where: { id: assignedToId },
      select: { id: true, nom: true, prenom: true },
    });
    if (!targetUser) throw new NotFoundError('Utilisateur', assignedToId);
  }

  // Update the client
  const updated = await prisma.client.update({
    where: { id: clientId },
    data: { assignedToId },
    include: {
      entreprise: true,
      mandats: true,
      assignedTo: { select: { id: true, nom: true, prenom: true, avatarUrl: true } },
    },
  });

  // Create an activity log
  const clientLabel = [client.prenom, client.nom].filter(Boolean).join(' ');
  const actionLabel = assignedToId
    ? `Client pris en charge`
    : `Client libéré`;

  await prisma.activite.create({
    data: {
      type: 'NOTE',
      entiteType: 'CLIENT',
      entiteId: clientId,
      userId: callerUserId,
      titre: actionLabel,
      contenu: assignedToId
        ? `Le client "${clientLabel}" a été pris en charge.`
        : `Le client "${clientLabel}" a été libéré de son assignation.`,
      source: 'SYSTEME',
    },
  });

  // Create an audit log entry
  await prisma.auditLog.create({
    data: {
      userId: callerUserId,
      action: 'UPDATE',
      entityType: 'CLIENT',
      entityId: clientId,
      entityLabel: clientLabel,
      changes: {
        assignedToId: {
          old: client.assignedToId,
          new: assignedToId,
        },
      },
    },
  });

  // Fetch lastActivityAt for the response
  const lastActivity = await prisma.activite.findFirst({
    where: { entiteType: 'CLIENT', entiteId: clientId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  return { ...updated, lastActivityAt: lastActivity?.createdAt ?? null };
}
