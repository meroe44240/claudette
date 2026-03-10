import crypto from 'crypto';
import prisma from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import * as notificationService from '../notifications/notification.service.js';
import * as callSummaryService from '../ai/call-summary.service.js';

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
 * Try to match by name (Allo contact name) against existing candidats/clients.
 * Used as fallback when phone matching fails but Allo provides a name.
 */
async function matchByName(
  firstName: string,
  lastName: string,
  companyName?: string,
): Promise<PhoneMatchResult | null> {
  if (!firstName && !lastName) return null;

  // Try client first if company name is known
  if (companyName && lastName) {
    const client = await prisma.client.findFirst({
      where: {
        nom: { equals: lastName, mode: 'insensitive' },
        ...(firstName ? { prenom: { equals: firstName, mode: 'insensitive' } } : {}),
        entreprise: { nom: { equals: companyName, mode: 'insensitive' } },
      },
      select: { id: true, nom: true, prenom: true, telephone: true },
    });
    if (client) {
      return { type: 'CLIENT', id: client.id, nom: client.nom, prenom: client.prenom, telephone: client.telephone };
    }
  }

  // Try candidat by name
  if (lastName) {
    const candidat = await prisma.candidat.findFirst({
      where: {
        nom: { equals: lastName, mode: 'insensitive' },
        ...(firstName ? { prenom: { equals: firstName, mode: 'insensitive' } } : {}),
      },
      select: { id: true, nom: true, prenom: true, telephone: true },
    });
    if (candidat) {
      // Update phone number if missing
      if (!candidat.telephone) {
        // phone will be set by caller
      }
      return { type: 'CANDIDAT', id: candidat.id, nom: candidat.nom, prenom: candidat.prenom, telephone: candidat.telephone };
    }
  }

  return null;
}

/**
 * Auto-create a Client or Candidat from an Allo contact or phone number.
 * First tries name-based matching to avoid duplicates.
 *
 * Logic:
 *  - Has company → Client (pro)
 *  - No company  → Candidat (perso)
 */
async function autoCreateContact(
  phone: string,
  alloContact: AlloContact | undefined,
  recruiterId: string | null,
): Promise<PhoneMatchResult | null> {
  const firstName = alloContact?.name || '';
  const lastName = alloContact?.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const companyName = alloContact?.company?.name;
  const jobTitle = alloContact?.job_title;

  // 1. Try name-based matching first (avoid duplicates)
  if (firstName || lastName) {
    const nameMatch = await matchByName(firstName, lastName, companyName);
    if (nameMatch) {
      // Update phone number on the matched contact if missing
      if (!nameMatch.telephone) {
        if (nameMatch.type === 'CANDIDAT') {
          await prisma.candidat.update({ where: { id: nameMatch.id }, data: { telephone: phone } });
        } else {
          await prisma.client.update({ where: { id: nameMatch.id }, data: { telephone: phone } });
        }
        nameMatch.telephone = phone;
      }
      console.log(`[Allo Auto] Matched by name: ${fullName} → ${nameMatch.type} ${nameMatch.id}`);
      return nameMatch;
    }
  }

  // 2. If no real name available, DON'T create a phantom contact — return null
  //    The caller will create a task for the recruiter to identify the contact
  if (!firstName && !lastName) {
    console.log(`[Allo Auto] No name for ${phone} — skipping contact creation, task will be created`);
    return null;
  }

  // 3. Create new contact only when we have a real name
  if (companyName) {
    // ─── PRO → Create Entreprise + Client ───
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
        nom: lastName || firstName,
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
        nom: lastName || firstName,
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

  // ─── UNIDENTIFIED PHONE NUMBER — create task instead of phantom contact ───
  if (!match) {
    // Create activity without entity link
    const activite = await prisma.activite.create({
      data: {
        type: 'APPEL',
        direction,
        userId: recruiterId,
        titre: `Appel ${direction === 'ENTRANT' ? 'entrant' : 'sortant'} - ${externalPhone}`,
        contenu: payload.transcript
          ? `Appel de ${durationMinutes} min avec ${externalPhone}\n\n--- Transcript ---\n${payload.transcript}`
          : `Appel de ${durationMinutes} min avec ${externalPhone}`,
        source: 'ALLO',
        metadata: {
          callId: payload.callId,
          from: payload.from,
          to: payload.to,
          duration: payload.duration,
          recordingUrl: payload.recordingUrl,
          transcript: payload.transcript || undefined,
          matched: false,
          unidentifiedPhone: externalPhone,
        },
      },
    });

    // Create TASK for recruiter to identify the contact
    if (recruiterId) {
      await prisma.activite.create({
        data: {
          type: 'TACHE',
          isTache: true,
          userId: recruiterId,
          titre: `Identifier le contact : ${externalPhone}`,
          contenu: `Un appel ${direction === 'ENTRANT' ? 'entrant' : 'sortant'} de ${durationMinutes} min a eu lieu avec le numéro ${externalPhone}.\n\nCe numéro n'est associé à aucun candidat ou client.\n→ Attribuez ce numéro au bon contact dans votre CRM.`,
          source: 'ALLO',
          metadata: {
            unidentifiedPhone: externalPhone,
            callId: payload.callId,
            activiteId: activite.id,
          },
        },
      });

      await notificationService.create({
        userId: recruiterId,
        type: 'APPEL_ENTRANT',
        titre: `Numéro non identifié : ${externalPhone}`,
        contenu: `Appel de ${durationMinutes} min avec un numéro inconnu. Une tâche a été créée pour l'identifier.`,
      });
    }

    return { processed: true, activiteId: activite.id, matched: false, unidentifiedPhone: externalPhone };
  }

  // ─── IDENTIFIED CONTACT — normal flow ───
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

          // Convert Allo transcript array to readable text
          let transcriptText: string | undefined;
          if (Array.isArray(call.transcript) && call.transcript.length > 0) {
            transcriptText = call.transcript
              .map((t: { source?: string; text?: string }) => {
                const speaker = t.source === 'USER' ? 'Recruteur' : 'Interlocuteur';
                return `${speaker}: ${t.text}`;
              })
              .join('\n');
          } else if (typeof call.transcript === 'string' && call.transcript) {
            transcriptText = call.transcript;
          }

          // Append Allo AI summary if available
          if (call.summary) {
            transcriptText = transcriptText
              ? `${transcriptText}\n\n--- Résumé Allo ---\n${call.summary}`
              : call.summary;
          }

          const result = await processAlloWebhook(
            {
              event: 'call.ended',
              callId,
              from: call.from_number || call.from,
              to: call.to_number || call.to,
              direction: call.type === 'INBOUND' ? 'inbound' : 'outbound',
              duration: durationSeconds,
              recordingUrl: call.recording_url || call.recordingUrl,
              transcript: transcriptText,
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

// ─── AUTO-PROCESS TRANSCRIPTS WITH AI ────────────

/**
 * Find all Allo call activities with transcripts that haven't been AI-analyzed,
 * then run AI summary → auto-update candidat/client name + fields → auto-create tasks.
 */
export async function autoProcessTranscripts(userId: string) {
  // 1. Find ALLO call activities with content > 50 words but no AI summary yet
  //    Use raw query since there's no Prisma relation between Activite and AiCallSummary
  const activitiesWithSummary = await prisma.aiCallSummary.findMany({
    where: { userId },
    select: { activiteId: true },
  });
  const analyzedIds = new Set(activitiesWithSummary.map(s => s.activiteId));

  const activities = await prisma.activite.findMany({
    where: {
      source: 'ALLO',
      type: 'APPEL',
      contenu: { not: null },
    },
    select: {
      id: true,
      contenu: true,
      entiteType: true,
      entiteId: true,
    },
  });

  // Filter out already analyzed
  const unanalyzed = activities.filter(a => !analyzedIds.has(a.id));

  // Filter to those with >= 50 words (AI requirement)
  const processable = unanalyzed.filter(a => {
    const wordCount = (a.contenu ?? '').trim().split(/\s+/).length;
    return wordCount >= 50;
  });

  console.log(`[Allo AI] Found ${processable.length} calls to process (out of ${unanalyzed.length} without summary)`);

  let processed = 0;
  let namesUpdated = 0;
  let fieldsUpdated = 0;
  let tasksCreated = 0;
  const errors: string[] = [];

  for (const activity of processable) {
    try {
      // 2. Generate AI summary
      const summary = await callSummaryService.generateCallSummary(activity.id, userId);
      const summaryJson = summary.summaryJson as any;
      processed++;

      // 3. Auto-update candidat/client name if currently a phone number
      if (summaryJson.interlocutor && activity.entiteId) {
        const { first_name, last_name, company, job_title } = summaryJson.interlocutor;

        if (activity.entiteType === 'CANDIDAT' && (first_name || last_name)) {
          const candidat = await prisma.candidat.findUnique({
            where: { id: activity.entiteId },
            select: { nom: true, prenom: true, posteActuel: true, entrepriseActuelle: true },
          });

          if (candidat) {
            const updateData: Record<string, string> = {};

            // Update name only if current name looks like a phone number
            const isPhoneName = /^\+?\d[\d\s-]{6,}$/.test(candidat.nom);
            if (isPhoneName) {
              if (last_name) updateData.nom = last_name;
              if (first_name) updateData.prenom = first_name;
              console.log(`[Allo AI] Updated CANDIDAT name: ${candidat.nom} → ${first_name ?? ''} ${last_name ?? ''}`);
              namesUpdated++;
            }

            // Update company/title if empty
            if (!candidat.entrepriseActuelle && company) {
              updateData.entrepriseActuelle = company;
            }
            if (!candidat.posteActuel && job_title) {
              updateData.posteActuel = job_title;
            }

            if (Object.keys(updateData).length > 0) {
              await prisma.candidat.update({
                where: { id: activity.entiteId },
                data: updateData,
              });
            }
          }
        } else if (activity.entiteType === 'CLIENT' && (first_name || last_name)) {
          const client = await prisma.client.findUnique({
            where: { id: activity.entiteId },
            select: { nom: true, prenom: true, poste: true },
          });

          if (client) {
            const updateData: Record<string, string> = {};
            const isPhoneName = /^\+?\d[\d\s-]{6,}$/.test(client.nom);
            if (isPhoneName) {
              if (last_name) updateData.nom = last_name;
              if (first_name) updateData.prenom = first_name;
              console.log(`[Allo AI] Updated CLIENT name: ${client.nom} → ${first_name ?? ''} ${last_name ?? ''}`);
              namesUpdated++;
            }
            if (!client.poste && job_title) {
              updateData.poste = job_title;
            }

            if (Object.keys(updateData).length > 0) {
              await prisma.client.update({
                where: { id: activity.entiteId },
                data: updateData,
              });
            }
          }
        }
      }

      // 4. Create notification for user to review & validate actions/updates
      //    (NO auto-apply: the recruiter validates via notification → call summary page)
      const actionCount = summaryJson.action_items?.length ?? 0;
      const updateCount = summaryJson.info_updates?.length ?? 0;
      const contactName = summaryJson.interlocutor
        ? `${summaryJson.interlocutor.first_name ?? ''} ${summaryJson.interlocutor.last_name ?? ''}`.trim()
        : null;

      const notifParts: string[] = [];
      if (actionCount > 0) notifParts.push(`${actionCount} action${actionCount > 1 ? 's' : ''} proposée${actionCount > 1 ? 's' : ''}`);
      if (updateCount > 0) notifParts.push(`${updateCount} info${updateCount > 1 ? 's' : ''} à valider`);

      await notificationService.create({
        userId,
        type: 'AI_SUMMARY_READY',
        titre: `Analyse IA : appel ${contactName || 'inconnu'}`,
        contenu: notifParts.length > 0
          ? `${summaryJson.summary?.[0] ?? 'Appel analysé'} — ${notifParts.join(', ')}`
          : summaryJson.summary?.[0] ?? 'Appel analysé par IA',
        entiteType: activity.entiteType === 'CANDIDAT' ? 'CANDIDAT' : 'CLIENT',
        entiteId: activity.entiteId!,
      });
      tasksCreated++; // reuse counter for notifications created

      // Update activity title with real name if we found one
      if (summaryJson.interlocutor) {
        const { first_name, last_name } = summaryJson.interlocutor;
        if (first_name || last_name) {
          const contactName = `${first_name ?? ''} ${last_name ?? ''}`.trim();
          const currentActivity = await prisma.activite.findUnique({
            where: { id: activity.id },
            select: { titre: true, direction: true },
          });
          if (currentActivity?.titre?.match(/\+\d/)) {
            // Title contains a phone number → replace with real name
            const dirLabel = currentActivity.direction === 'ENTRANT' ? 'entrant' : 'sortant';
            await prisma.activite.update({
              where: { id: activity.id },
              data: { titre: `Appel ${dirLabel} - ${contactName}` },
            });
          }
        }
      }

    } catch (err: any) {
      console.error(`[Allo AI] Error processing activity ${activity.id}:`, err.message);
      errors.push(`${activity.id}: ${err.message}`);
    }
  }

  console.log(`[Allo AI] Done. Processed: ${processed}, Names updated: ${namesUpdated}, Fields: ${fieldsUpdated}, Notifications: ${tasksCreated}`);

  return {
    status: 'completed',
    processed,
    total: processable.length,
    namesUpdated,
    fieldsUpdated,
    notificationsSent: tasksCreated,
    errors: errors.length > 0 ? errors : undefined,
    message: `${processed} appels analysés par IA. ${namesUpdated} noms mis à jour, ${tasksCreated} notifications envoyées. Validez les actions proposées depuis vos notifications.`,
  };
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
