import { PrismaClient } from '@prisma/client';
import { installAuditAndTrash } from './audit-trash.js';

/**
 * Client brut : sans journal ni corbeille. Réservé à lib/audit-trash.ts et aux cas qui
 * doivent contourner ces mécanismes en connaissance de cause.
 */
export const rawPrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

/**
 * Client utilisé partout : chaque écriture sur une donnée métier est journalisée
 * (avant / après, auteur, outil), et chaque suppression passe par la corbeille.
 */
// Typé comme un client ordinaire : l'extension ne change que le comportement, pas l'API.
const prisma = installAuditAndTrash(rawPrisma) as unknown as PrismaClient;

export default prisma;
