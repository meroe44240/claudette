import prisma from '../../lib/db.js';
import { NotFoundError, ConflictError, ValidationError } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import type { Role } from '@prisma/client';

const userSelect = {
  id: true,
  email: true,
  nom: true,
  prenom: true,
  role: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export async function listUsers() {
  return prisma.user.findMany({
    select: userSelect,
    orderBy: { createdAt: 'desc' },
  });
}

export async function createUser(data: {
  email: string;
  nom: string;
  prenom?: string;
  role: Role;
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
      passwordHash,
      mustChangePassword: true,
    },
    select: userSelect,
  });
}

export async function updateUser(id: string, data: { nom?: string; prenom?: string; role?: Role }) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Utilisateur', id);

  const updateData: any = {};
  if (data.nom !== undefined) updateData.nom = data.nom;
  if (data.prenom !== undefined) updateData.prenom = data.prenom;
  if (data.role !== undefined) updateData.role = data.role;

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
