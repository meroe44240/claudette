import { PrismaClient } from '@prisma/client';
import { installAuditAndTrash } from './audit-trash.js';
import { runDeferred } from './request-context.js';

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
const extended = installAuditAndTrash(rawPrisma) as unknown as PrismaClient;

// Les transactions différent le journal et la corbeille jusqu'au commit (voir runDeferred) :
// une transaction annulée ne laisse ni trace dans le journal ni webhook envoyé.
const prisma = new Proxy(extended, {
  get(target, prop) {
    const value = Reflect.get(target, prop);
    if (prop === '$transaction') {
      return (arg: unknown, opts?: unknown) => runDeferred(() => (value as (...a: unknown[]) => Promise<unknown>).call(target, arg, opts));
    }
    return typeof value === 'function' && typeof prop === 'string' && prop.startsWith('$') ? value.bind(target) : value;
  },
}) as PrismaClient;

export default prisma;
