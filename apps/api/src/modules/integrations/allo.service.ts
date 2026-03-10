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
  transcript?: string;      // call transcript text
  timestamp: string;
  userId?: string;          // Allo user id (maps to recruiter)
  metadata?: Record<string, unknown>;
}

interface AlloContact {
  id: string;
  name: string;
  last_name?: string;
  company?: { name: string; id: string } | null;
  job_title?: string;
  numbers: Array<{ number: string; type?: string }>;
}

interface PhoneMatchResult {
  type: 'CANDIDAT' | 'CLIENT';
  id: string;
  nom: string;
  prenom?: string | null;
  telephone?: string | null;
}

// Personal email domains — used to classify contacts
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.fr',
  'outlook.com', 'outlook.fr', 'live.com', 'live.fr',
  'yahoo.com', 'yahoo.fr', 'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'protonmail.com', 'proton.me', 'orange.fr',
  'wanadoo.fr', 'free.fr', 'sfr.fr', 'laposte.net',
  'gmx.com', 'gmx.fr', 'mail.com', 'yandex.com',
]);

// ─── HELPERS ────────────────────────────────────────

/**
 * Normalise a phone number to its last 10 digits for partial matching.
 */
function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-10);
}

/**
 * Check if an email domain is personal (→ Candidat) or professional (→ Client).
 */
export function isPersonalEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return true; // no domain = treat as personal
  return PERSONAL_DOMAINS.has(domain);
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

// ─── ALLO CONTACTS ─────────────────────────────────

/**
 * Fetch all contacts from Allo API and build a phone → contact map.
 */
async function fetchAlloContacts(
  apiKey: string,
  baseUrl: string,
): Promise<Map<string, AlloContact>> {
  const phoneMap = new Map<string, AlloContact>();

  let page = 0;
  let totalPages = 1;

  while (page < totalPages) {
    const url = new URL(`${baseUrl}/v1/api/contacts`);
    url.searchParams.set('size', '100');
    url.searchParams.set('page', String(page));

    const res = await fetch(url.toString(), {
      headers: { Authorization: apiKey },
    });

    if (!res.ok) break;

    const body = await res.json() as any;
    const contacts: AlloContact[] = body.data?.results || [];
    totalPages = body.data?.metadata?.pagination?.total_pages || 1;

    for (const contact of contacts) {
      for (const num of contact.numbers || []) {
        if (num.number) {
          phoneMap.set(normalisePhone(num.number), contact);
        }
      }
    }

    page++;
  }

  return phoneMap;
}

/**
 * Auto-create a Client or Candidat from an Allo contact or phone number.
 *
 * Logic:
 *  - Has company → Client (pro)
 *  - No company  → Candidat (perso)
 */
async function autoCreateContact(
  phone: string,
  alloContact: AlloContact | undefined,
  recruiterId: string | null,
): Promise<PhoneMatchResult> {
  const firstName = alloContact?.name || '';
  const lastName = alloContact?.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim() || phone;
  const companyName = alloContact?.company?.name;
  const jobTitle = alloContact?.job_title;

  if (companyName) {
    // ─── PRO → Create Entreprise + Client ───
    // Find or create the entreprise
    let entreprise = await prisma.entreprise.findFirst({
      where: { nom: { equals: companyName, mode: 'insensitive' } },
    });

    if (!entreprise) {
      entreprise = await prisma.entreprise.create({
        data: {
          nom: companyName,
          createdById: recruiterId,
        },
      });
      console.log(`[Allo Auto] Created entreprise: ${companyName}`);
    }

    const client = await prisma.client.create({
      data: {
        nom: lastName || firstName || phone,
        prenom: lastName ? firstName : undefined,
        telephone: phone,
        poste: jobTitle || undefined,
        entrepriseId: entreprise.id,
        notes: 'Créé automatiquement depuis Allo',
        createdById: recruiterId,
      },
    });

    console.log(`[Allo Auto] Created CLIENT: ${fullName} @ ${companyName}`);
    return {
      type: 'CLIENT',
      id: client.id,
      nom: client.nom,
      prenom: client.prenom,
      telephone: phone,
    };
  } else {
    // ─── PERSO → Create Candidat ───
    const candidat = await prisma.candidat.create({
      data: {
        nom: lastName || firstName || phone,
        prenom: lastName ? firstName : undefined,
        telephone: phone,
        source: 'ALLO',
        createdById: recruiterId,
      },
    });

    console.log(`[Allo Auto] Created CANDIDAT: ${fullName}`);
    return {
      type: 'CANDIDAT',
      id: candidat.id,
      nom: candidat.nom,
      prenom: candidat.prenom,
      telephone: phone,
    };
  }
}

// ─── WEBHOOK PROCESSING ────────────────────────────

/**
 * Process an Allo webhook event (call ended).
 * Matches phone number with candidats/clients, auto-creates if not found,
 * creates Activite and Notification.
 */
export async function processAlloWebhook(
  payload: AlloWebhookPayload,
  alloContactMap?: Map<string, AlloContact>,
) {
  const callEndedEvents = ['call.ended', 'call_finished', 'Call Finished', 'call.finished'];
  if (!callEndedEvents.includes(payload.event)) {
    return { processed: false, reason: `Event ${payload.event} not handled` };
  }

  // Determine which phone number to match (the external party)
  const externalPhone = payload.direction === 'inbound' ? payload.from : payload.to;
  let match = await matchPhoneNumber(externalPhone);

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

  // Auto-create contact if not found in DB
  if (!match) {
    const alloContact = alloContactMap?.get(normalisePhone(externalPhone));
    match = await autoCreateContact(externalPhone, alloContact, recruiterId);
  }

  const direction = payload.direction === 'inbound' ? 'ENTRANT' : 'SORTANT';
  const durationMinutes = Math.ceil(payload.duration / 60);
  const contactName = `${match.prenom ?? ''} ${match.nom}`.trim();

  // Create Activite
  const activite = await prisma.activite.create({
    data: {
      type: 'APPEL',
      direction,
      entiteType: match.type,
      entiteId: match.id,
      userId: recruiterId,
      titre: `Appel ${direction === 'ENTRANT' ? 'entrant' : 'sortant'} - ${contactName}`,
      contenu: payload.transcript
        ? `Appel de ${durationMinutes} min avec ${contactName}\n\n--- Transcript ---\n${payload.transcript}`
        : `Appel de ${durationMinutes} min avec ${contactName}`,
      source: 'ALLO',
      metadata: {
        callId: payload.callId,
        from: payload.from,
        to: payload.to,
        duration: payload.duration,
        recordingUrl: payload.recordingUrl,
        transcript: payload.transcript || undefined,
        matched: true,
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
      entiteType: match.type,
      entiteId: match.id,
    });
  }

  return { processed: true, activiteId: activite.id, matched: true, contactType: match.type };
}

// ─── SYNC ──────────────────────────────────────────

/**
 * Fetch calls from Allo API, auto-create Candidat/Client, and create activities.
 *
 * Classification:
 *  - Allo contact has company → Client (domaine pro)
 *  - No company              → Candidat (perso)
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

  // Get the Allo phone number from config (required by Allo API)
  const alloNumber = (config.config as any)?.alloNumber;
  if (!alloNumber) {
    throw new AppError(400, 'Numéro Allo manquant. Veuillez reconfigurer votre intégration.');
  }

  console.log(`[Allo Sync] Fetching calls for user ${userId}, number ${alloNumber}`);

  try {
    // Pre-fetch all Allo contacts for phone-based lookup
    const alloContactMap = await fetchAlloContacts(alloApiKey, alloBaseUrl);
    console.log(`[Allo Sync] Loaded ${alloContactMap.size} Allo contact phone mappings`);

    // Fetch calls page by page
    let page = 0;
    let totalPages = 1;
    let synced = 0;
    let created = { candidats: 0, clients: 0 };

    while (page < totalPages) {
      const url = new URL(`${alloBaseUrl}/v1/api/calls`);
      url.searchParams.set('allo_number', alloNumber);
      url.searchParams.set('size', '100');
      url.searchParams.set('page', String(page));

      const response = await fetch(url.toString(), {
        headers: { Authorization: alloApiKey },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error('[Allo Sync] API error:', errData);
        return { status: 'error', message: `Erreur API Allo: ${response.status}` };
      }

      const body = await response.json() as any;
      const calls = body.data?.results || body.data || [];
      totalPages = body.data?.metadata?.pagination?.total_pages || 1;

      for (const call of calls) {
        const callId = call.id || call.callId;
        // Check if activity already exists for this callId
        const existing = await prisma.activite.findFirst({
          where: {
            source: 'ALLO',
            metadata: { path: ['callId'], equals: callId },
          },
        });

        if (!existing) {
          const durationSeconds = Math.round((call.length_in_minutes || 0) * 60);
          const result = await processAlloWebhook(
            {
              event: 'call.ended',
              callId,
              from: call.from_number || call.from,
              to: call.to_number || call.to,
              direction: call.type === 'INBOUND' ? 'inbound' : 'outbound',
              duration: durationSeconds,
              recordingUrl: call.recording_url || call.recordingUrl,
              timestamp: call.start_date || call.timestamp || call.createdAt,
              userId: call.userId,
            },
            alloContactMap,
          );

          synced++;
          if (result.contactType === 'CANDIDAT') created.candidats++;
          if (result.contactType === 'CLIENT') created.clients++;
        }
      }

      page++;
    }

    console.log(`[Allo Sync] Synced ${synced} calls. Created: ${created.candidats} candidats, ${created.clients} clients`);
    return {
      status: 'completed',
      synced,
      created,
      message: `${synced} appels synchronisés (${created.candidats} candidats, ${created.clients} clients créés)`,
    };
  } catch (e) {
    console.error('[Allo Sync] Error:', e);
    return { status: 'error', message: 'Erreur lors de la synchronisation Allo' };
  }
}

/**
 * Validate Allo webhook signature.
 */
export function validateWebhookSignature(
  body: string,
  signature: string | undefined,
): boolean {
  const webhookSecret = process.env.ALLO_WEBHOOK_SECRET;

  if (!webhookSecret) {
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
