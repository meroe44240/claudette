import crypto from 'crypto';
import prisma from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import * as notificationService from '../notifications/notification.service.js';

// ─── TYPES ──────────────────────────────────────────

interface AlloWebhookPayload {
  event: string;            // e.g. 'call.ended'
  callId: string;
  from: string;             // caller phone number
  to: string;               // recipient phone number
  direction: 'inbound' | 'outbound';
  duration: number;         // seconds
  recordingUrl?: string;
  timestamp: string;
  userId?: string;          // Allo user id (maps to recruiter)
  metadata?: Record<string, unknown>;
}

interface PhoneMatchResult {
  type: 'CANDIDAT' | 'CLIENT';
  id: string;
  nom: string;
  prenom?: string | null;
  telephone?: string | null;
}

// ─── HELPERS ────────────────────────────────────────

/**
 * Normalise a phone number to its last 10 digits for partial matching.
 */
function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-10);
}

/**
 * Find a candidat or client by phone number (partial match on last 10 digits).
 */
export async function matchPhoneNumber(phone: string): Promise<PhoneMatchResult | null> {
  const normalised = normalisePhone(phone);
  if (normalised.length < 7) return null;

  // Try candidats first
  const candidats = await prisma.candidat.findMany({
    where: { telephone: { not: null } },
    select: { id: true, nom: true, prenom: true, telephone: true },
  });

  for (const c of candidats) {
    if (c.telephone && normalisePhone(c.telephone) === normalised) {
      return { type: 'CANDIDAT', id: c.id, nom: c.nom, prenom: c.prenom, telephone: c.telephone };
    }
  }

  // Try clients
  const clients = await prisma.client.findMany({
    where: { telephone: { not: null } },
    select: { id: true, nom: true, prenom: true, telephone: true },
  });

  for (const cl of clients) {
    if (cl.telephone && normalisePhone(cl.telephone) === normalised) {
      return { type: 'CLIENT', id: cl.id, nom: cl.nom, prenom: cl.prenom, telephone: cl.telephone };
    }
  }

  return null;
}

// ─── WEBHOOK PROCESSING ────────────────────────────

/**
 * Process an Allo webhook event (call ended).
 * Matches phone number with candidats/clients, creates Activite and Notification.
 */
export async function processAlloWebhook(payload: AlloWebhookPayload) {
  const callEndedEvents = ['call.ended', 'call_finished', 'Call Finished', 'call.finished'];
  if (!callEndedEvents.includes(payload.event)) {
    // Only process call ended/finished events for now
    return { processed: false, reason: `Event ${payload.event} not handled` };
  }

  // Determine which phone number to match (the external party)
  const externalPhone = payload.direction === 'inbound' ? payload.from : payload.to;
  const match = await matchPhoneNumber(externalPhone);

  // Find the recruiter user linked to this Allo user
  let recruiterId: string | null = null;
  if (payload.userId) {
    const config = await prisma.integrationConfig.findFirst({
      where: {
        provider: 'allo',
        enabled: true,
        config: { path: ['alloUserId'], equals: payload.userId },
      },
    });
    if (config) recruiterId = config.userId;
  }

  // If no recruiter found, try to find any user with allo integration
  if (!recruiterId) {
    const anyConfig = await prisma.integrationConfig.findFirst({
      where: { provider: 'allo', enabled: true },
    });
    if (anyConfig) recruiterId = anyConfig.userId;
  }

  const direction = payload.direction === 'inbound' ? 'ENTRANT' : 'SORTANT';
  const durationMinutes = Math.ceil(payload.duration / 60);
  const contactName = match ? `${match.prenom ?? ''} ${match.nom}`.trim() : externalPhone;

  // Create Activite
  const activite = await prisma.activite.create({
    data: {
      type: 'APPEL',
      direction,
      entiteType: match?.type ?? 'CANDIDAT',
      entiteId: match?.id ?? '00000000-0000-0000-0000-000000000000',
      userId: recruiterId,
      titre: `Appel ${direction === 'ENTRANT' ? 'entrant' : 'sortant'} - ${contactName}`,
      contenu: `Appel de ${durationMinutes} min avec ${contactName}`,
      source: 'ALLO',
      metadata: {
        callId: payload.callId,
        from: payload.from,
        to: payload.to,
        duration: payload.duration,
        recordingUrl: payload.recordingUrl,
        matched: !!match,
      },
    },
  });

  // Create Notification for the recruiter
  if (recruiterId) {
    await notificationService.create({
      userId: recruiterId,
      type: 'APPEL_ENTRANT',
      titre: `Appel ${direction === 'ENTRANT' ? 'entrant' : 'sortant'} terminé`,
      contenu: `Appel de ${durationMinutes} min avec ${contactName}`,
      entiteType: match?.type,
      entiteId: match?.id,
    });
  }

  return { processed: true, activiteId: activite.id, matched: !!match };
}

// ─── SYNC ──────────────────────────────────────────

/**
 * Placeholder for BullMQ job that would fetch calls from Allo API
 * and create missing activities.
 *
 * In production, this would:
 * 1. Retrieve the user's Allo API key from IntegrationConfig
 * 2. Call GET /v1/calls on the Allo API
 * 3. Compare with existing ALLO-sourced activities
 * 4. Create missing Activite entries
 */
export async function syncCalls(userId: string) {
  const config = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: 'allo' } },
  });

  if (!config || !config.enabled) {
    throw new AppError(400, 'Intégration Allo non configurée ou désactivée');
  }

  const alloApiKey = config.accessToken;
  const alloBaseUrl = process.env.ALLO_BASE_URL || 'https://api.withallo.com';

  if (!alloApiKey) {
    throw new AppError(400, 'Clé API Allo manquante. Veuillez configurer votre intégration.');
  }

  console.log(`[Allo Sync] Fetching calls for user ${userId}`);

  try {
    const response = await fetch(`${alloBaseUrl}/v1/calls`, {
      headers: { Authorization: `Bearer ${alloApiKey}` },
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('[Allo Sync] API error:', errData);
      return { status: 'error', message: `Erreur API Allo: ${response.status}` };
    }

    const calls = await response.json() as any;
    let synced = 0;

    for (const call of (calls.data || calls)) {
      // Check if activity already exists for this callId
      const existing = await prisma.activite.findFirst({
        where: {
          source: 'ALLO',
          metadata: { path: ['callId'], equals: call.id || call.callId },
        },
      });

      if (!existing) {
        await processAlloWebhook({
          event: 'call.ended',
          callId: call.id || call.callId,
          from: call.from,
          to: call.to,
          direction: call.direction === 'inbound' ? 'inbound' : 'outbound',
          duration: call.duration || 0,
          recordingUrl: call.recordingUrl,
          timestamp: call.timestamp || call.createdAt,
          userId: call.userId,
        });
        synced++;
      }
    }

    console.log(`[Allo Sync] Synced ${synced} new calls`);
    return { status: 'completed', synced, message: `${synced} appels synchronisés` };
  } catch (e) {
    console.error('[Allo Sync] Error:', e);
    return { status: 'error', message: 'Erreur lors de la synchronisation Allo' };
  }
}

/**
 * Validate Allo webhook signature.
 * Placeholder: in production, validate HMAC signature from X-Allo-Signature header.
 */
export function validateWebhookSignature(
  body: string,
  signature: string | undefined,
): boolean {
  const webhookSecret = process.env.ALLO_WEBHOOK_SECRET;

  if (!webhookSecret) {
    // If no secret configured, accept all (development mode)
    console.warn('[Allo] No ALLO_WEBHOOK_SECRET configured, skipping signature validation');
    return true;
  }

  if (!signature) {
    return false;
  }

  const expected = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
