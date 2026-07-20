import prisma from '../../lib/db.js';

const EXPIRY_DAYS = 60;
const WARNING_DAYS = 53;

/**
 * Check all clients with an assigned recruiter for inactivity-based ownership expiry.
 *
 * - If last activity on a client is > 60 days ago: release ownership (set assignedToId = null)
 * - If last activity is > 53 days but <= 60 days ago: previously sent an in-app warning, now no-op.
 *
 * The in-app Notification system was removed (chantier 4). To restore warnings,
 * pipe them through Slack DM using `slackUserId` instead.
 */
export async function checkClientOwnershipExpiry() {
  const now = new Date();
  const expiryThreshold = new Date(now.getTime() - EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const warningThreshold = new Date(now.getTime() - WARNING_DAYS * 24 * 60 * 60 * 1000);

  const assignedClients = await prisma.client.findMany({
    where: {
      assignedToId: { not: null },
    },
    select: {
      id: true,
      nom: true,
      prenom: true,
      assignedToId: true,
    },
  });

  let released = 0;
  let warned = 0;

  for (const client of assignedClients) {
    if (!client.assignedToId) continue;

    const lastActivity = await prisma.activite.findFirst({
      where: {
        entiteType: 'CLIENT',
        entiteId: client.id,
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const lastActivityDate = lastActivity?.createdAt ?? null;

    if (!lastActivityDate || lastActivityDate < expiryThreshold) {
      await prisma.client.update({
        where: { id: client.id },
        data: { assignedToId: null },
      });

      const clientLabel = [client.prenom, client.nom].filter(Boolean).join(' ');

      await prisma.activite.create({
        data: {
          type: 'NOTE',
          entiteType: 'CLIENT',
          entiteId: client.id,
          userId: client.assignedToId,
          titre: 'Prise en charge expirée (auto)',
          contenu: `La prise en charge du client "${clientLabel}" a expiré automatiquement après ${EXPIRY_DAYS} jours d'inactivité.`,
          source: 'SYSTEME',
        },
      });

      released++;
    } else if (lastActivityDate < warningThreshold) {
      // Warning would have been sent as in-app notification (feature removed).
      // TODO: pipe through Slack DM if needed.
      warned++;
    }
  }

  return { released, warned, checked: assignedClients.length };
}
