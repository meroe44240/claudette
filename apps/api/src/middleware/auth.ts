import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../lib/jwt.js';
import prisma from '../lib/db.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';
import type { Role } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    userEmail: string;
    userRole: Role;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'] as string | undefined;

  if (apiKey) {
    const user = await prisma.user.findUnique({ where: { apiKey } });
    if (!user) throw new UnauthorizedError('API Key invalide');
    request.userId = user.id;
    request.userEmail = user.email;
    request.userRole = user.role;
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token manquant');
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyAccessToken(token);
    request.userId = payload.sub;
    request.userEmail = payload.email;
    request.userRole = payload.role as Role;
  } catch {
    throw new UnauthorizedError('Token invalide ou expiré');
  }
}

export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!roles.includes(request.userRole)) {
      throw new ForbiddenError('Rôle insuffisant');
    }
  };
}
