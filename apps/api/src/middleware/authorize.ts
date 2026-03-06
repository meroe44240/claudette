import { FastifyReply, FastifyRequest } from 'fastify';

type RoleLevel = 'RECRUTEUR' | 'MANAGER' | 'ADMIN';

const ROLE_HIERARCHY: Record<RoleLevel, number> = {
  RECRUTEUR: 1,
  MANAGER: 2,
  ADMIN: 3,
};

/**
 * Authorization middleware that checks if the authenticated user has a role
 * at or above the minimum required level. Uses a hierarchical model:
 *   RECRUTEUR (1) < MANAGER (2) < ADMIN (3)
 *
 * Usage:
 *   preHandler: [authenticate, authorize('MANAGER')]
 *   → allows MANAGER and ADMIN, blocks RECRUTEUR
 */
export function authorize(...allowedRoles: RoleLevel[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userRole = request.userRole as RoleLevel | undefined;

    if (!userRole) {
      return reply.status(401).send({ error: 'Non authentifié' });
    }

    const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
    const allowed = allowedRoles.some(
      (role) => userLevel >= ROLE_HIERARCHY[role],
    );

    if (!allowed) {
      return reply.status(403).send({
        error: 'Accès interdit',
        requiredRole: allowedRoles,
      });
    }
  };
}
