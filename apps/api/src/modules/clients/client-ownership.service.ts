import prisma from '../../lib/db.js';

const EXPIRY_DAYS = 60;
const WARNING_DAYS = 53;

/**
 * Check all clients with an assigned recruiter for inactivity-based ownership expiry.
 *
 * - If last activity on a client is > 60 days ago: release ownership (set assignedToId = null)
 *   and create a notification for the recruiter.
 * - If last activity is > 53 days but <= 60 days ago: send a warning notification (once).
 *   We check for an existing warning notification to avoid duplicates.
 */
export async function checkClientOwnershipExpiry() {
  const now = new Date();
  const expiryThreshold = new Date(now.getTime() - EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const warningThreshold = new Date(now.getTime() - WARNING_DAYS * 24 * 60 * 60 * 1000);

  // Find all clients with an assigned recruiter
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

    // Find the latest activity for this client
    const lastActivity = await prisma.activite.findFirst({
      where: {
        entiteType: 'CLIENT',
        entiteId: client.id,
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const lastActivityDate = lastActivity?.createdAt ?? null;

    // If no activity at all, or activity is older than expiry threshold -> release
    if (!lastActivityDate || lastActivityDate < expiryThreshold) {
      // Release ownership
      await prisma.client.update({
        where: { id: client.id },
        data: { assignedToId: null },
      });

      const clientLabel = [client.prenom, client.nom].filter(Boolean).join(' ');

      // Create notification for the recruiter
      await prisma.notification.create({
        data: {
          userId: client.assignedToId,
          type: 'SYSTEME',
          titre: `Prise en charge expirée : ${clientLabel}`,
          contenu: `Le client "${clientLabel}" a été libéré automatiquement suite à une inactivité de plus de ${EXPIRY_DAYS} jours.`,
          entiteType: 'CLIENT',
          entiteId: client.id,
        },
      });

      // Create an activity log for the release
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
      // Activity is between warning and expiry threshold -> send warning (once)
      const clientLabel = [client.prenom, client.nom].filter(Boolean).join(' ');

      // Check if a warning notification was already sent (avoid duplicates)
      const existingWarning = await prisma.notification.findFirst({
        where: {
          userId: client.assignedToId,
          type: 'SYSTEME',
          entiteType: 'CLIENT',
          entiteId: client.id,
          titre: { startsWith: 'Expiration prochaine' },
          createdAt: { gte: warningThreshold },
        },
      });

      if (!existingWarning) {
        const daysUntilExpiry = Math.ceil(
          (EXPIRY_DAYS * 24 * 60 * 60 * 1000 - (now.getTime() - lastActivityDate.getTime())) /
            (24 * 60 * 60 * 1000),
        );

        await prisma.notification.create({
          data: {
            userId: client.assignedToId,
            type: 'SYSTEME',
            titre: `Expiration prochaine : ${clientLabel}`,
            contenu: `Votre prise en charge du client "${clientLabel}" expire dans ${daysUntilExpiry} jour${daysUntilExpiry > 1 ? 's' : ''} si aucune activité n'est enregistrée.`,
            entiteType: 'CLIENT',
            entiteId: client.id,
          },
        });

        warned++;
      }
    }
  }

  return { released, warned, checked: assignedClients.length };
}
