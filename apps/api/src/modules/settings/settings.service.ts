import prisma from '../../lib/db.js';
import { NotFoundError, ConflictError, ValidationError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import type { Role, Fonction } from '@prisma/client';

// avatarUrl/telephone : client Prisma régénéré au build prod (cast pour le dev local)
const userSelect = {
  id: true,
  email: true,
  nom: true,
  prenom: true,
  role: true,
  fonction: true,
  avatarUrl: true,
  telephone: true,
  excludeFromTeamStats: true,
  lastLoginAt: true,
  createdAt: true,
} as any;

export async function listUsers() {
  return prisma.user.findMany({
    select: userSelect,
    orderBy: { createdAt: 'desc' },
  });
}

export interface TeamMember {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  avatarUrl: string | null;
  telephone: string | null;
  fonction: string;
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  // telephone/avatarUrl : client Prisma régénéré au build prod (cast pour le dev local)
  return (await prisma.user.findMany({
    select: { id: true, nom: true, prenom: true, email: true, avatarUrl: true, telephone: true, fonction: true } as any,
    orderBy: { nom: 'asc' },
  })) as unknown as TeamMember[];
}

export async function createUser(data: {
  email: string;
  nom: string;
  prenom?: string;
  role: Role;
  fonction?: Fonction;
  excludeFromTeamStats?: boolean;
  password: string;
}) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new ConflictError('Un utilisateur avec cet email existe deja');
  }

  const passwordHash = await hashPassword(data.password);

  return prisma.user.create({
    data: {
      email: data.email,
      nom: data.nom,
      prenom: data.prenom,
      role: data.role,
      fonction: data.fonction ?? 'RECRUTEUR',
      excludeFromTeamStats: data.excludeFromTeamStats ?? false,
      passwordHash,
      mustChangePassword: true,
    },
    select: userSelect,
  });
}

export async function updateUser(
  id: string,
  data: {
    nom?: string;
    prenom?: string;
    role?: Role;
    fonction?: Fonction;
    excludeFromTeamStats?: boolean;
    telephone?: string;
    avatarUrl?: string;
    password?: string;
  },
) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Utilisateur', id);

  const updateData: any = {};
  if (data.nom !== undefined) updateData.nom = data.nom;
  if (data.prenom !== undefined) updateData.prenom = data.prenom;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.fonction !== undefined) updateData.fonction = data.fonction;
  if (data.excludeFromTeamStats !== undefined)
    updateData.excludeFromTeamStats = data.excludeFromTeamStats;
  if (data.telephone !== undefined) updateData.telephone = data.telephone;
  if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
  // Reset du mot de passe par un admin : hash + ne force pas le changement.
  if (data.password) {
    updateData.passwordHash = await hashPassword(data.password);
    updateData.mustChangePassword = false;
  }

  return prisma.user.update({
    where: { id },
    data: updateData,
    select: userSelect,
  });
}

export async function deleteUser(id: string) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Utilisateur', id);

  // Check they are not the last admin
  if (existing.role === 'ADMIN') {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    if (adminCount <= 1) {
      throw new ValidationError('Impossible de supprimer le dernier administrateur');
    }
  }

  await prisma.user.delete({ where: { id } });

  return { message: 'Utilisateur supprime' };
}

const GENERAL_SETTINGS_PROVIDER = 'general_settings';

export async function getGeneralSettings(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User', userId);

  const config = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: GENERAL_SETTINGS_PROVIDER } },
  });

  const settings = (config?.config as Record<string, any>) || {};
  return {
    companyName: settings.companyName || '',
    currency: settings.currency || 'EUR',
    timezone: settings.timezone || 'Europe/Paris',
    language: settings.language || 'fr',
  };
}

export async function updateGeneralSettings(userId: string, data: {
  companyName?: string;
  currency?: string;
  timezone?: string;
  language?: string;
}) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User', userId);

  const existing = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: GENERAL_SETTINGS_PROVIDER } },
  });

  const existingSettings = (existing?.config as Record<string, any>) || {};
  const settings = {
    ...existingSettings,
    ...(data.companyName !== undefined && { companyName: data.companyName }),
    ...(data.currency !== undefined && { currency: data.currency }),
    ...(data.timezone !== undefined && { timezone: data.timezone }),
    ...(data.language !== undefined && { language: data.language }),
  };

  await prisma.integrationConfig.upsert({
    where: { userId_provider: { userId, provider: GENERAL_SETTINGS_PROVIDER } },
    create: {
      userId,
      provider: GENERAL_SETTINGS_PROVIDER,
      config: settings,
      enabled: true,
    },
    update: {
      config: settings,
    },
  });

  return {
    companyName: settings.companyName || '',
    currency: settings.currency || 'EUR',
    timezone: settings.timezone || 'Europe/Paris',
    language: settings.language || 'fr',
  };
}
