import { randomUUID } from 'crypto';
import prisma from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import * as notificationService from '../notifications/notification.service.js';
import { matchEmail } from './gmail.service.js';
import { notifyNewMeeting } from '../slack/slack.service.js';
import type { MeetingKind } from '../meetings/meeting-kind.js';

// ─── TYPES ──────────────────────────────────────────

interface CalendarWebhookPayload {
  kind: string;                      // e.g. 'calendar#notification'
  id: string;                        // channel id
  resourceId: string;
  resourceUri: string;
  token?: string;
  expiration?: string;
  channelId?: string;
}

interface CalendarEventData {
  summary: string;
  description?: string;
  location?: string;
  startTime: string;                 // ISO datetime
  endTime: string;                   // ISO datetime
  attendees?: string[];              // email addresses
  entiteType?: 'CANDIDAT' | 'CLIENT' | 'ENTREPRISE' | 'MANDAT';
  entiteId?: string;
  withMeet?: boolean;                // génère un lien Google Meet (visioconférence)
  kind?: MeetingKind;                // nature du meeting ; seul un RDV_CLIENT est annoncé sur Slack
}

interface CalendlyParsedData {
  isCalendly: boolean;
  phone?: string;
  salaireSouhaite?: string;
  posteContacte?: string;
  geminiNotes?: string;
  inviteeName?: string;
  inviteeEmail?: string;
}

// ─── GOOGLE CALENDAR CONFIG ─────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';

// ─── CALENDLY PARSER ────────────────────────────────

/**
 * Parse a Calendly event description to extract structured data.
 * Calendly descriptions contain form answers like:
 *   Phone Number: +33 6 31 45 38 07
 *   Position for which you were contacted?: Head of AM
 *   What is your desired salary?: (78+8)
 *   Powered by Calendly.com
 *
 * After the meeting, Gemini notes may be added.
 */
export function parseCalendlyDescription(description: string | undefined | null): CalendlyParsedData {
  if (!description) return { isCalendly: false };

  const isCalendly = description.includes('Calendly') || description.includes('calendly.com');
  if (!isCalendly) return { isCalendly: false };

  const result: CalendlyParsedData = { isCalendly: true };

  // Extract phone number
  const phonePatterns = [
    /Phone\s*(?:Number)?[:\s]*([+\d\s\-().]{7,20})/i,
    /Téléphone[:\s]*([+\d\s\-().]{7,20})/i,
    /Numéro[:\s]*([+\d\s\-().]{7,20})/i,
  ];
  for (const pattern of phonePatterns) {
    const match = description.match(pattern);
    if (match) {
      result.phone = match[1].trim();
      break;
    }
  }

  // Extract desired salary
  const salaryPatterns = [
    /(?:desired\s+salary|salaire\s+souhaité|salary)[?:\s]*\(?([^)\n]+)\)?/i,
    /(?:What is your desired salary)[?:\s]*\(?([^)\n]+)\)?/i,
    /(?:prétentions?\s+salariales?)[?:\s]*\(?([^)\n]+)\)?/i,
  ];
  for (const pattern of salaryPatterns) {
    const match = description.match(pattern);
    if (match) {
      result.salaireSouhaite = match[1].trim().replace(/^\(|\)$/g, '');
      break;
    }
  }

  // Extract position contacted for
  const positionPatterns = [
    /Position\s+(?:for\s+which\s+you\s+were\s+)?contacted[?:\s]*([^\n]+)/i,
    /Poste\s+(?:pour\s+lequel\s+)?contacté[?:\s]*([^\n]+)/i,
    /Position[?:\s]+([^\n]+)/i,
  ];
  for (const pattern of positionPatterns) {
    const match = description.match(pattern);
    if (match) {
      result.posteContacte = match[1].trim();
      break;
    }
  }

  // Extract Gemini notes - they appear after "Notes de Gemini" or similar markers
  const geminiPatterns = [
    /Notes?\s+de\s+Gemini[:\s]*\n([\s\S]+?)(?=\n\n|$)/i,
    /Gemini\s+Notes?[:\s]*\n([\s\S]+?)(?=\n\n|$)/i,
    /AI\s+Notes?[:\s]*\n([\s\S]+?)(?=\n\n|$)/i,
  ];
  for (const pattern of geminiPatterns) {
    const match = description.match(pattern);
    if (match) {
      result.geminiNotes = match[1].trim();
      break;
    }
  }

  return result;
}

/**
 * Parse a salary string like "78+8", "78k+8k", "78000", "78K€" into a numeric value (in k€).
 */
function parseSalaryValue(salaryStr: string): number | null {
  const cleaned = salaryStr.replace(/[€\s]/g, '').toLowerCase();

  // Pattern: "78+8" or "78k+8k" (fixe + variable)
  const fixeVarMatch = cleaned.match(/^(\d+)k?\s*\+\s*(\d+)k?$/);
  if (fixeVarMatch) {
    const fixe = parseInt(fixeVarMatch[1], 10);
    const variable = parseInt(fixeVarMatch[2], 10);
    // If values are small (<200), they're in k€
    if (fixe < 200) return (fixe + variable) * 1000;
    return fixe + variable;
  }

  // Pattern: "78000" or "78k"
  const numMatch = cleaned.match(/^(\d+)k?$/);
  if (numMatch) {
    const val = parseInt(numMatch[1], 10);
    if (val < 200) return val * 1000; // It's in k€
    return val;
  }

  return null;
}

/**
 * Enrich a candidate with data extracted from a Calendly event.
 */
async function enrichCandidatFromCalendly(
  candidatId: string,
  calendlyData: CalendlyParsedData,
  eventSummary: string,
  userId: string,
): Promise<void> {
  const updates: Record<string, any> = {};
  const enrichedFields: string[] = [];

  // Get current candidate data
  const candidat = await prisma.candidat.findUnique({ where: { id: candidatId } });
  if (!candidat) return;

  // Update phone if not already set
  if (calendlyData.phone && !candidat.telephone) {
    updates.telephone = calendlyData.phone;
    enrichedFields.push(`Téléphone: ${calendlyData.phone}`);
  }

  // Update desired salary
  if (calendlyData.salaireSouhaite) {
    const salaryValue = parseSalaryValue(calendlyData.salaireSouhaite);
    if (salaryValue && !candidat.salaireSouhaite) {
      updates.salaireSouhaite = salaryValue;
      enrichedFields.push(`Salaire souhaité: ${calendlyData.salaireSouhaite} (${salaryValue}€)`);
    }
  }

  // Append Gemini notes to candidate notes
  if (calendlyData.geminiNotes) {
    const existingNotes = candidat.notes || '';
    const geminiSection = `\n\n--- Notes Gemini (${eventSummary}) ---\n${calendlyData.geminiNotes}`;
    if (!existingNotes.includes(calendlyData.geminiNotes.substring(0, 50))) {
      updates.notes = existingNotes + geminiSection;
      enrichedFields.push('Notes Gemini ajoutées');
    }
  }

  if (Object.keys(updates).length === 0) return;

  // Update the candidate
  await prisma.candidat.update({
    where: { id: candidatId },
    data: updates,
  });

  // Create an activity to track the enrichment
  await prisma.activite.create({
    data: {
      type: 'NOTE',
      entiteType: 'CANDIDAT',
      entiteId: candidatId,
      userId,
      titre: `Enrichissement Calendly - ${eventSummary}`,
      contenu: `Données extraites du RDV Calendly:\n${enrichedFields.join('\n')}`,
      source: 'CALENDAR',
      metadata: {
        calendlyEnrichment: true,
        extractedData: calendlyData as any,
      },
    },
  });

  // Notify the recruiter
  await notificationService.create({
    userId,
    type: 'SYSTEME',
    titre: 'Candidat enrichi via Calendly',
    contenu: `${candidat.prenom || ''} ${candidat.nom}: ${enrichedFields.join(', ')}`,
    entiteType: 'CANDIDAT',
    entiteId: candidatId,
  });

  console.log(`[Calendar/Calendly] Enriched candidat ${candidatId}: ${enrichedFields.join(', ')}`);
}

/**
 * Enrich a client with Gemini notes extracted from a Calendly event.
 */
async function enrichClientFromCalendly(
  clientId: string,
  calendlyData: CalendlyParsedData,
  eventSummary: string,
  userId: string,
): Promise<void> {
  if (!calendlyData.geminiNotes) return;

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return;

  const existingNotes = client.notes || '';
  // Avoid duplicating notes already present
  if (existingNotes.includes(calendlyData.geminiNotes.substring(0, 50))) return;

  const geminiSection = `\n\n--- Notes Gemini (${eventSummary}) ---\n${calendlyData.geminiNotes}`;
  await prisma.client.update({
    where: { id: clientId },
    data: { notes: existingNotes + geminiSection },
  });

  // Create an activity to track the enrichment
  await prisma.activite.create({
    data: {
      type: 'NOTE',
      entiteType: 'CLIENT',
      entiteId: clientId,
      userId,
      titre: `Enrichissement Calendly - ${eventSummary}`,
      contenu: `Notes Gemini ajoutées depuis le RDV Calendly`,
      source: 'CALENDAR',
      metadata: {
        calendlyEnrichment: true,
        extractedData: calendlyData as any,
      },
    },
  });

  // Notify the recruiter
  await notificationService.create({
    userId,
    type: 'SYSTEME',
    titre: 'Client enrichi via Calendly',
    contenu: `${client.nom}: Notes Gemini ajoutées depuis "${eventSummary}"`,
    entiteType: 'CLIENT',
    entiteId: clientId,
  });

  console.log(`[Calendar/Calendly] Enriched client ${clientId} with Gemini notes`);
}

// ─── HELPERS ────────────────────────────────────────

/**
 * Get a valid access token for Google Calendar.
 * Reuses the gmail integration config since they share Google OAuth.
 */
async function getValidAccessToken(userId: string): Promise<string> {
  // Calendar shares tokens with Gmail (same Google OAuth)
  // Try calendar-specific config first, then fall back to gmail
  let config = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: 'calendar' } },
  });

  if (!config || !config.accessToken) {
    config = await prisma.integrationConfig.findUnique({
      where: { userId_provider: { userId, provider: 'gmail' } },
    });
  }

  if (!config || !config.enabled) {
    throw new AppError(400, 'Intégration Google Calendar non configurée ou désactivée');
  }

  if (!config.accessToken) {
    throw new AppError(400, 'Token Google Calendar manquant. Veuillez reconnecter votre compte.');
  }

  // Refresh expired token via Google
  if (config.tokenExpiry && config.tokenExpiry.getTime() < Date.now() + 5 * 60 * 1000) {
    if (!config.refreshToken) {
      throw new AppError(400, 'Token expiré et pas de refresh token. Veuillez reconnecter votre compte Google.');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: config.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const tokens = await response.json() as any;
    if (tokens.error) {
      throw new AppError(400, 'Erreur lors du rafraîchissement du token Calendar. Veuillez reconnecter.');
    }

    const newExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
    await prisma.integrationConfig.update({
      where: { id: config.id },
      data: { accessToken: tokens.access_token, tokenExpiry: newExpiry },
    });

    console.log(`[Calendar] Token refreshed for user ${userId}`);
    return tokens.access_token as string;
  }

  return config.accessToken;
}

/**
 * Match calendar attendees to candidats/clients.
 */
async function matchAttendees(attendees: string[]): Promise<{
  type: 'CANDIDAT' | 'CLIENT';
  id: string;
  nom: string;
  email: string;
} | null> {
  for (const email of attendees) {
    const match = await matchEmail(email);
    if (match) {
      return { type: match.type, id: match.id, nom: match.nom, email: email };
    }
  }
  return null;
}

// ─── ATTENDEE ANALYSIS ─────────────────────────────

interface AttendeeDetail {
  email: string;
  role: 'internal' | 'candidat' | 'client' | 'external';
  name?: string;
  entityId?: string;
}

interface AttendeeAnalysis {
  details: AttendeeDetail[];
  hasCandidats: boolean;
  hasClients: boolean;
  hasExternals: boolean;
  allInternal: boolean;
}

const INTERNAL_DOMAINS = ['humanup.io'];

/**
 * Classify each attendee email as internal, candidat, client, or external.
 * Used by getUpcomingEvents to provide rich data for frontend categorization.
 */
async function analyzeAttendees(attendees: string[]): Promise<AttendeeAnalysis> {
  const filtered = attendees.filter(
    (e) => e && !e.includes('calendar.google.com'),
  );

  const details: AttendeeDetail[] = [];

  for (const email of filtered) {
    const domain = email.split('@')[1]?.toLowerCase();

    // Internal?
    if (domain && INTERNAL_DOMAINS.includes(domain)) {
      details.push({ email, role: 'internal' });
      continue;
    }

    // Known candidat or client?
    const match = await matchEmail(email);
    if (match) {
      details.push({
        email,
        role: match.type === 'CANDIDAT' ? 'candidat' : 'client',
        name: `${match.prenom ?? ''} ${match.nom}`.trim(),
        entityId: match.id,
      });
      continue;
    }

    // Unknown external
    details.push({ email, role: 'external' });
  }

  const nonInternal = details.filter((d) => d.role !== 'internal');
  return {
    details,
    hasCandidats: details.some((d) => d.role === 'candidat'),
    hasClients: details.some((d) => d.role === 'client'),
    hasExternals: nonInternal.length > 0,
    allInternal: nonInternal.length === 0 && details.length > 0,
  };
}

// ─── WEBHOOK PROCESSING ────────────────────────────

/**
 * Process a Google Calendar webhook notification.
 * Fetches updated events, detects Calendly events, enriches candidates.
 */
export async function processCalendarWebhook(payload: CalendarWebhookPayload) {
  const channelToken = payload.token;

  let userId: string | null = null;
  if (channelToken) {
    const config = await prisma.integrationConfig.findFirst({
      where: {
        provider: 'calendar',
        enabled: true,
        config: { path: ['channelToken'], equals: channelToken },
      },
    });
    if (config) userId = config.userId;
  }

  if (!userId) {
    const config = await prisma.integrationConfig.findFirst({
      where: { provider: 'calendar', enabled: true },
    });
    if (config) userId = config.userId;
  }

  if (!userId) {
    return { processed: false, reason: 'No matching Calendar integration found' };
  }

  // Fetch recently updated events from Google Calendar
  let enrichedCount = 0;
  try {
    const accessToken = await getValidAccessToken(userId);
    const updatedMin = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // last 10 minutes

    const calResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?updatedMin=${updatedMin}&maxResults=10&orderBy=updated&singleEvents=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (calResponse.ok) {
      const calData = await calResponse.json() as any;
      const items = calData.items || [];

      for (const item of items) {
        const description = item.description || '';
        const calendlyData = parseCalendlyDescription(description);

        if (calendlyData.isCalendly) {
          console.log(`[Calendar Webhook] Calendly event detected: ${item.summary}`);

          // Try to match attendees to a candidate
          const attendeeEmails = (item.attendees || [])
            .map((a: any) => a.email)
            .filter((e: string) => e && !e.includes('calendar.google.com'));

          const match = await matchAttendees(attendeeEmails);

          if (match && match.type === 'CANDIDAT') {
            await enrichCandidatFromCalendly(match.id, calendlyData, item.summary || 'RDV Calendly', userId);
            enrichedCount++;
          } else if (match && match.type === 'CLIENT') {
            await enrichClientFromCalendly(match.id, calendlyData, item.summary || 'RDV Calendly', userId);
            enrichedCount++;
          } else {
            // Try matching by name from the event summary or invitee
            console.log(`[Calendar Webhook] No candidate/client match for attendees: ${attendeeEmails.join(', ')}`);
          }
        }

        // Classify and create activity (same logic as the watcher)
        // Get the recruiter's email for classification
        const recruiterUser = await prisma.user.findUnique({
          where: { id: userId! },
          select: { email: true, nom: true, prenom: true },
        });
        if (recruiterUser) {
          const recruiterName = `${recruiterUser.prenom || ''} ${recruiterUser.nom}`.trim();
          const classified = await classifyCalendarEvent(item, recruiterUser.email);
          await processClassifiedEvent(classified, userId!, recruiterName);
        }
      }
    }
  } catch (e) {
    console.error('[Calendar Webhook] Error fetching events:', e);
  }

  return { processed: true, enrichedCandidates: enrichedCount };
}

// ─── CREATE EVENT ───────────────────────────────────

/**
 * Create a Google Calendar event via the API.
 * Also creates an Activite of type MEETING.
 */
export async function createEvent(userId: string, data: CalendarEventData, sendNotifications = true) {
  const accessToken = await getValidAccessToken(userId);

  // Match attendees to find related entity
  let matchedEntity: { type: 'CANDIDAT' | 'CLIENT'; id: string } | null = null;
  if (data.attendees && data.attendees.length > 0) {
    const match = await matchAttendees(data.attendees);
    if (match) {
      matchedEntity = { type: match.type, id: match.id };
    }
  }

  const entiteType = data.entiteType ?? matchedEntity?.type ?? 'CANDIDAT';
  const entiteId = data.entiteId ?? matchedEntity?.id ?? '00000000-0000-0000-0000-000000000000';

  // Create event via Google Calendar API
  const event: Record<string, unknown> = {
    summary: data.summary,
    description: data.description,
    location: data.location,
    start: { dateTime: data.startTime, timeZone: 'Europe/Paris' },
    end: { dateTime: data.endTime, timeZone: 'Europe/Paris' },
    attendees: data.attendees?.map(email => ({ email })),
    // Send Google Calendar invitations to attendees
    reminders: { useDefault: true },
  };

  // Génère un lien Google Meet (visioconférence) si demandé.
  if (data.withMeet) {
    event.conferenceData = {
      createRequest: {
        requestId: randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  // sendNotifications=all tells Google to send email invitations to all attendees
  const sendUpdates = sendNotifications ? 'all' : 'none';
  const calResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=${sendUpdates}${data.withMeet ? '&conferenceDataVersion=1' : ''}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    },
  );

  const calResult = await calResponse.json() as any;
  const createdViaApi = calResponse.ok;

  if (!calResponse.ok) {
    console.error('[Calendar] Create event error:', calResult);
  } else {
    console.log(`[Calendar] Event created: ${calResult.id}`);
  }

  // Create Activite for the meeting
  const activite = await prisma.activite.create({
    data: {
      type: 'MEETING',
      entiteType,
      entiteId,
      userId,
      titre: data.summary,
      contenu: data.description ?? `Réunion planifiée: ${data.summary}`,
      source: 'CALENDAR',
      metadata: {
        startTime: data.startTime,
        endTime: data.endTime,
        location: data.location,
        attendees: data.attendees,
        createdViaApi,
        googleEventId: calResult.id,
        ...(data.kind ? { calendarEventType: data.kind } : {}),
      },
    },
  });

  // Notify the user
  await notificationService.create({
    userId,
    type: 'SYSTEME',
    titre: 'Événement créé',
    contenu: `Événement "${data.summary}" planifié`,
    entiteType,
    entiteId,
  });

  // Slack : seul un RDV client est annoncé ici (il a forcément une date ; il lui faut des interlocuteurs).
  // Une présentation est annoncée par le pipeline, les autres meetings ne le sont pas.
  const interlocuteursInvites = (data.attendees || []).filter((e) => !e.toLowerCase().endsWith('@humanup.io'));
  const clientLie = entiteType === 'CLIENT' && entiteId !== '00000000-0000-0000-0000-000000000000';
  if (data.kind === 'RDV_CLIENT' && (clientLie || interlocuteursInvites.length > 0)) {
    (async () => {
      try {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { prenom: true } });
        let clientNom: string | null = null;
        let entrepriseNom: string | null = null;
        if (clientLie) {
          const client = await prisma.client.findUnique({
            where: { id: entiteId },
            select: { nom: true, prenom: true, entreprise: { select: { nom: true } } },
          });
          if (client) {
            clientNom = [client.prenom, client.nom].filter(Boolean).join(' ');
            entrepriseNom = client.entreprise?.nom || null;
          }
        }
        await notifyNewMeeting({
          titre: data.summary,
          recruteurPrenom: user?.prenom || null,
          clientNom,
          entrepriseNom,
          interlocuteurs: interlocuteursInvites.join(', ') || null,
          date: data.startTime,
          lieu: data.location || null,
        });
      } catch (err) {
        console.error('[Slack] Failed to send new meeting notification:', err);
      }
    })();
  }

  if (!createdViaApi) {
    return {
      success: false,
      activiteId: activite.id,
      message: `Erreur Calendar API: ${calResult.error?.message || 'Création échouée'}`,
    };
  }

  const meetLink: string | null =
    calResult.hangoutLink ||
    calResult.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ||
    null;

  return {
    success: true,
    activiteId: activite.id,
    googleEventId: calResult.id,
    meetLink,
    message: `Événement "${data.summary}" créé dans Google Calendar`,
  };
}

/**
 * Supprime un événement du calendrier principal (best-effort).
 * Notifie les invités (sendUpdates=all) — utilisé à l'annulation d'un RDV.
 */
export async function deleteEvent(userId: string, eventId: string): Promise<boolean> {
  try {
    const accessToken = await getValidAccessToken(userId);
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
    );
    // 200/204 = supprimé ; 404/410 = déjà absent → on considère OK.
    return res.ok || res.status === 404 || res.status === 410;
  } catch (e) {
    console.warn('[Calendar] deleteEvent échoué', (e as Error).message);
    return false;
  }
}

/**
 * Free/busy : renvoie les intervalles occupés du calendrier principal entre deux dates.
 * Best-effort — renvoie [] si le calendrier n'est pas connecté ou en cas d'erreur.
 */
export async function getBusyTimes(
  userId: string,
  timeMin: string,
  timeMax: string,
): Promise<Array<{ start: string; end: string }>> {
  try {
    const accessToken = await getValidAccessToken(userId);
    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin, timeMax, items: [{ id: 'primary' }] }),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    return json.calendars?.primary?.busy ?? [];
  } catch {
    return [];
  }
}

// ─── GET UPCOMING EVENTS ────────────────────────────

/**
 * Get upcoming events for a user.
 * Fetches from Google Calendar API, enriches Calendly events automatically.
 */
export async function getUpcomingEvents(userId: string) {
  let googleEvents: any[] = [];
  let source = 'database';

  try {
    const accessToken = await getValidAccessToken(userId);
    const now = new Date().toISOString();
    const calResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&maxResults=20&orderBy=startTime&singleEvents=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (calResponse.ok) {
      const calData = await calResponse.json() as any;
      const items = calData.items || [];

      for (const item of items) {
        const calendlyData = parseCalendlyDescription(item.description);
        const attendeeEmails = (item.attendees || []).map((a: any) => a.email).filter(Boolean);

        // Auto-enrich candidates from Calendly events
        if (calendlyData.isCalendly && (calendlyData.phone || calendlyData.salaireSouhaite || calendlyData.geminiNotes)) {
          const match = await matchAttendees(attendeeEmails.filter((e: string) => !e.includes('calendar.google.com')));
          if (match && match.type === 'CANDIDAT') {
            await enrichCandidatFromCalendly(match.id, calendlyData, item.summary || 'RDV', userId);
          } else if (match && match.type === 'CLIENT') {
            await enrichClientFromCalendly(match.id, calendlyData, item.summary || 'RDV', userId);
          }
        }

        const filteredEmails = attendeeEmails.filter((e: string) => !e.includes('calendar.google.com'));

        googleEvents.push({
          id: item.id,
          titre: item.summary || '(Sans titre)',
          description: item.description,
          startTime: item.start?.dateTime || item.start?.date,
          endTime: item.end?.dateTime || item.end?.date,
          location: item.location,
          attendees: attendeeEmails,
          htmlLink: item.htmlLink,
          source: 'google_calendar',
          status: item.status || 'confirmed',
          attendeeAnalysis: await analyzeAttendees(filteredEmails),
          isCalendly: calendlyData.isCalendly,
          calendlyData: calendlyData.isCalendly ? calendlyData : undefined,
        });
      }

      source = 'google_calendar';
      console.log(`[Calendar] Fetched ${googleEvents.length} events from Google Calendar`);
    } else {
      console.warn('[Calendar] Could not fetch from Google Calendar, falling back to database');
    }
  } catch (e) {
    console.warn('[Calendar] Error fetching from Google Calendar:', e);
  }

  if (googleEvents.length > 0) {
    return { events: googleEvents, source, message: 'Événements récupérés depuis Google Calendar' };
  }

  // Return MEETING activities from the database
  const now = new Date();
  const activities = await prisma.activite.findMany({
    where: {
      userId,
      type: 'MEETING',
      OR: [
        {
          metadata: {
            path: ['startTime'],
            string_starts_with: now.toISOString().substring(0, 10),
          },
        },
        {
          createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      user: { select: { nom: true, prenom: true } },
    },
  });

  return {
    events: activities,
    source: 'database',
    message: 'Événements récupérés depuis la base de données (sync Calendar non active)',
  };
}

/**
 * Sync Calendly events from Google Calendar and enrich candidates.
 * Scans recent/upcoming events, detects Calendly ones, extracts data.
 */
export async function syncCalendlyEvents(userId: string) {
  const accessToken = await getValidAccessToken(userId);

  // Fetch events from last 30 days + upcoming
  const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const calResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&maxResults=100&orderBy=startTime&singleEvents=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!calResponse.ok) {
    const err = await calResponse.json() as any;
    return { status: 'error', message: `Erreur Calendar API: ${err.error?.message || calResponse.status}` };
  }

  const calData = await calResponse.json() as any;
  const items = calData.items || [];

  let calendlyEvents = 0;
  let enrichedCount = 0;
  const enrichmentDetails: string[] = [];

  for (const item of items) {
    const calendlyData = parseCalendlyDescription(item.description);
    if (!calendlyData.isCalendly) continue;

    calendlyEvents++;

    const attendeeEmails = (item.attendees || [])
      .map((a: any) => a.email)
      .filter((e: string) => e && !e.includes('calendar.google.com'));

    const match = await matchAttendees(attendeeEmails);

    if (match && match.type === 'CANDIDAT') {
      const before = await prisma.candidat.findUnique({ where: { id: match.id } });

      await enrichCandidatFromCalendly(match.id, calendlyData, item.summary || 'RDV Calendly', userId);

      const after = await prisma.candidat.findUnique({ where: { id: match.id } });

      // Check if anything actually changed
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        enrichedCount++;
        enrichmentDetails.push(`${match.nom} (${match.email}): enrichi depuis "${item.summary}"`);
      }
    } else if (match && match.type === 'CLIENT') {
      const before = await prisma.client.findUnique({ where: { id: match.id } });

      await enrichClientFromCalendly(match.id, calendlyData, item.summary || 'RDV Calendly', userId);

      const after = await prisma.client.findUnique({ where: { id: match.id } });

      if (JSON.stringify(before) !== JSON.stringify(after)) {
        enrichedCount++;
        enrichmentDetails.push(`Client ${match.nom} (${match.email}): enrichi depuis "${item.summary}"`);
      }
    } else if (attendeeEmails.length > 0) {
      enrichmentDetails.push(`Pas de candidat/client trouvé pour: ${attendeeEmails.join(', ')} (${item.summary})`);
    }
  }

  console.log(`[Calendar/Calendly Sync] ${calendlyEvents} events Calendly trouvés, ${enrichedCount} candidats enrichis`);

  return {
    status: 'completed',
    totalEvents: items.length,
    calendlyEvents,
    enrichedCandidates: enrichedCount,
    details: enrichmentDetails,
    message: `${calendlyEvents} événements Calendly trouvés, ${enrichedCount} candidats enrichis`,
  };
}

/**
 * Validate Calendar webhook headers.
 */
export function validateWebhookHeaders(
  channelId: string | undefined,
  resourceState: string | undefined,
): boolean {
  if (!channelId || !resourceState) {
    return false;
  }

  const validStates = ['sync', 'exists', 'update'];
  return validStates.includes(resourceState);
}

// ─── GOOGLE CALENDAR WATCH (Push Notifications) ────

/**
 * Register a Google Calendar watch channel so Google sends push notifications
 * to our webhook endpoint whenever events change. Must be renewed before expiry.
 *
 * See: https://developers.google.com/calendar/api/guides/push
 */
export async function registerCalendarWatch(userId: string): Promise<{ channelId: string; expiration: string } | null> {
  try {
    const accessToken = await getValidAccessToken(userId);
    const webhookUrl = `${process.env.APP_URL || 'https://ats.propium.co'}/api/v1/integrations/calendar/webhook`;
    const channelId = `humanup-cal-${userId}-${Date.now()}`;
    const channelToken = `watch-${userId}`;

    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/watch',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: channelId,
          type: 'web_hook',
          address: webhookUrl,
          token: channelToken,
          params: { ttl: '604800' }, // 7 days
        }),
      },
    );

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[CalendarWatch] Failed to register watch for user ${userId}:`, errBody);
      return null;
    }

    const data = await res.json() as any;
    const expiration = data.expiration ? new Date(Number(data.expiration)).toISOString() : 'unknown';

    // Save watch info in integration config
    const existingConfig = await prisma.integrationConfig.findFirst({
      where: { userId, provider: 'calendar' },
      select: { config: true },
    });
    const prevConfig = (existingConfig?.config as Record<string, unknown>) || {};

    await prisma.integrationConfig.updateMany({
      where: { userId, provider: 'calendar' },
      data: {
        config: {
          ...prevConfig,
          channelId,
          channelToken,
          channelExpiration: expiration,
          resourceId: data.resourceId,
        },
      },
    });

    console.log(`[CalendarWatch] Registered for user ${userId}, expires ${expiration}`);
    return { channelId, expiration };
  } catch (err) {
    console.error(`[CalendarWatch] Error registering watch for user ${userId}:`, err);
    return null;
  }
}

/**
 * Register watches for all users with Calendar connected.
 * Called at startup and periodically to renew.
 */
export async function registerAllCalendarWatches(): Promise<void> {
  const configs = await prisma.integrationConfig.findMany({
    where: { provider: 'calendar', enabled: true },
    select: { userId: true, config: true },
  });

  for (const cfg of configs) {
    const config = cfg.config as Record<string, unknown> | null;
    const expiration = config?.channelExpiration as string | undefined;

    // Skip if watch is still valid (more than 1 hour remaining)
    if (expiration) {
      const expiresAt = new Date(expiration).getTime();
      if (expiresAt > Date.now() + 60 * 60 * 1000) {
        continue;
      }
    }

    await registerCalendarWatch(cfg.userId);
  }
}

// ─── CALENDAR EVENT CLASSIFIER & WATCHER ───────────

interface ClassifiedEvent {
  googleEventId: string;
  summary: string;
  startTime: string;
  endTime: string;
  htmlLink?: string;
  attendees: AttendeeDetail[];
  internalCount: number;
  externalCount: number;
}

/**
 * Lit un événement Google Calendar et qualifie ses participants
 * (interne / candidat / client / externe inconnu). La nature du meeting
 * (RDV client, présentation…) est décidée dans _processClassifiedEventInner.
 */
async function classifyCalendarEvent(
  item: any,
  recruiterEmail: string,
): Promise<ClassifiedEvent> {
  const attendeeEmails: string[] = (item.attendees || [])
    .map((a: any) => a.email)
    .filter((e: string) => e && !e.includes('calendar.google.com'));

  // Make sure the organiser is included (Google sometimes omits them)
  if (recruiterEmail && !attendeeEmails.includes(recruiterEmail)) {
    attendeeEmails.push(recruiterEmail);
  }

  const analysis = await analyzeAttendees(attendeeEmails);

  return {
    googleEventId: item.id,
    summary: item.summary || '(Sans titre)',
    startTime: item.start?.dateTime || item.start?.date || '',
    endTime: item.end?.dateTime || item.end?.date || '',
    htmlLink: item.htmlLink,
    attendees: analysis.details,
    internalCount: analysis.details.filter((d) => d.role === 'internal').length,
    externalCount: analysis.details.filter((d) => d.role !== 'internal').length,
  };
}

const RE_TITRE_RDV = /\b(rdv|rendez[\s-]?vous)\b/i;
const RE_TITRE_PRESENTATION = /\b(pr[ée]sentation|prez|entretien|interview)\b/i;
const RE_TITRE_INDICE = /\b(rdv|rendez[\s-]?vous|pr[ée]sentation|prez|client|prospect|d[ée]couverte|discovery)\b/i;

const jourParis = (d: Date) => d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });

interface ResolvedCandidat {
  id: string;
  prenom: string | null;
  nom: string;
}

/**
 * Retrouve le candidat d'un événement : invité connu comme candidat, sinon
 * nom lu dans le titre ou dans le nom d'un invité inconnu.
 */
async function resolveCandidat(
  classified: ClassifiedEvent,
  clientAtt: AttendeeDetail | undefined,
): Promise<ResolvedCandidat | null> {
  const externalAtts = classified.attendees.filter((a) => a.role !== 'internal');
  const candidatAtt = externalAtts.find((a) => a.role === 'candidat');

  if (candidatAtt?.entityId) {
    const candidat = await prisma.candidat.findUnique({
      where: { id: candidatAtt.entityId },
      select: { id: true, nom: true, prenom: true },
    });
    if (candidat) return { id: candidat.id, prenom: candidat.prenom || null, nom: candidat.nom };
  }

  // No attendee matched a candidat in DB — fall back to parsing the event title.
  // Patterns supported:
  //   "Entretien : Dimitri X Privateaser" → token "Dimitri"
  //   "Mendo × Théo Faugeras" → token "Théo Faugeras"
  //
  // Rules (strict — must not false-match):
  //  - Only EXACT matches on prenom or nom (no contains — "Of" would match "Coffolé").
  //  - Skip common non-name words (stopwords).
  //  - Only look for active candidats with a pipeline (candidatures exist).
  //  - If client entreprise is known, prefer candidats linked to a mandate on
  //    that entreprise.
  const STOPWORDS = new Set([
    'of', 'the', 'and', 'weekly', 'daily', 'standup', 'stand-up', 'meeting',
    'rdv', 'review', 'sync', 'call', 'suivi', 'entretien', 'presentation',
    'présentation', 'interview', 'brief', 'debrief', 'team', 'head', 'director',
    'directeur', 'manager', 'sales', 'marketing', 'product', 'chief', 'lead',
    'senior', 'junior', 'mid', 'staff', 'founding', 'co-founder', 'cofounder',
    'cto', 'ceo', 'cfo', 'coo', 'vp', 'account', 'executive', 'comptable',
    'general', 'général', 'auxiliaire', 'new', 'onboarding', 'client',
    'prospect', 'candidat', 'point', 'sync', 'catch', 'catchup', 'kickoff',
    'kick-off', 'kick', 'off', 'on', 'in', 'internal', 'externe', 'external',
  ]);

  const isNameToken = (s: string): boolean => {
    const lower = s.toLowerCase();
    if (lower.length < 3) return false;
    if (STOPWORDS.has(lower)) return false;
    if (!/^[A-ZÀ-Ý][a-zà-ÿ'\-]+$/u.test(s)) return false; // Capitalized word only
    return true;
  };

  const rawTitle = (classified.summary || '').replace(
    /^(entretien|suivi|présentation|presentation|meeting|rdv)\s*[:\-–]\s*/i,
    '',
  );
  const parts = rawTitle.split(/\s+(?:x|X|×)\s+/).map((p) => p.trim()).filter(Boolean);

  const externalNames = externalAtts
    .filter((a) => !a.entityId && a.name)
    .map((a) => a.name as string);

  // Gather candidate tokens. For each part, keep the whole trimmed string
  // if every word is a name, and also the individual words.
  const candidateTokens: string[] = [];
  for (const part of [...parts, ...externalNames]) {
    if (clientAtt?.name && part.toLowerCase().includes(clientAtt.name.toLowerCase())) continue;
    const words = part.split(/\s+/);
    if (words.length >= 2 && words.every(isNameToken)) {
      candidateTokens.push(part);
    }
    for (const w of words) {
      if (isNameToken(w)) candidateTokens.push(w);
    }
  }
  const uniqueTokens = Array.from(new Set(candidateTokens));
  if (uniqueTokens.length === 0) return null;

  // Candidats with an open candidature (any stage except final REFUSE/PLACE),
  // optionally on the client entreprise if known.
  const candidatureWhere: any = { stage: { notIn: ['REFUSE', 'PLACE'] } };
  const clientEntrepriseForFilter = clientAtt?.entityId
    ? (await prisma.client.findUnique({
        where: { id: clientAtt.entityId },
        select: { entrepriseId: true },
      }))?.entrepriseId
    : null;
  if (clientEntrepriseForFilter) {
    candidatureWhere.mandat = { entrepriseId: clientEntrepriseForFilter };
  }

  for (const q of uniqueTokens) {
    // EXACT match only, with ACTIVE pipeline.
    const found = await prisma.candidat.findFirst({
      where: {
        OR: [
          { prenom: { equals: q, mode: 'insensitive' } },
          { nom: { equals: q, mode: 'insensitive' } },
        ],
        candidatures: { some: candidatureWhere },
      },
      select: { id: true, nom: true, prenom: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (found) {
      console.log(`[CalendarWatcher] Resolved candidat from title/name "${q}": ${found.prenom} ${found.nom}`);
      return { id: found.id, prenom: found.prenom || null, nom: found.nom };
    }
  }
  return null;
}

/**
 * Annonce Slack d'une présentation identifiée dans l'agenda (candidat + contact client connus).
 * Retourne true si le message est parti, false si la présentation était déjà annoncée par le pipeline.
 */
async function annoncerPresentationAgenda(
  classified: ClassifiedEvent,
  candidat: ResolvedCandidat,
  clientAtt: AttendeeDetail,
  recruiterName: string,
): Promise<boolean> {
  const start = classified.startTime ? new Date(classified.startTime) : null;

  // Le recruteur a déjà passé la candidature en Entretien client pour ce jour-là → annonce déjà faite.
  if (start) {
    const dejaEnPipeline = await prisma.candidature.findMany({
      where: { candidatId: candidat.id, stage: 'ENTRETIEN_CLIENT', dateEntretienClient: { not: null } },
      select: { dateEntretienClient: true },
    });
    if (dejaEnPipeline.some((c) => c.dateEntretienClient && jourParis(c.dateEntretienClient) === jourParis(start))) {
      return false;
    }
  }

  // ── Resolve client/entreprise ──
  let entrepriseNom = 'Entreprise';
  let contactNom = clientAtt.name || clientAtt.email;
  let clientEntrepriseId: string | null = null;

  if (clientAtt.entityId) {
    const client = await prisma.client.findUnique({
      where: { id: clientAtt.entityId },
      select: { nom: true, prenom: true, entreprise: { select: { id: true, nom: true } } },
    });
    if (client) {
      contactNom = `${client.prenom || ''} ${client.nom}`.trim();
      if (client.entreprise) {
        entrepriseNom = client.entreprise.nom;
        clientEntrepriseId = client.entreprise.id;
      }
    }
  }

  // ── Resolve mandat — priority order ──
  //  1. Candidat is in pipeline for an active mandate on the client's entreprise
  //  2. Candidat is in pipeline for any active mandate
  //  3. Any active mandate on the client's entreprise
  //  4. Fall back to the event title
  let mandatTitre: string | null = null;

  const mandatsCandidat = await prisma.mandat.findMany({
    where: {
      statut: { in: ['OUVERT', 'EN_COURS'] },
      candidatures: { some: { candidatId: candidat.id } },
    },
    select: { titrePoste: true, entrepriseId: true, entreprise: { select: { nom: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  const candidatMandat =
    mandatsCandidat.find((m) => clientEntrepriseId && m.entrepriseId === clientEntrepriseId) || mandatsCandidat[0];
  if (candidatMandat) {
    mandatTitre = candidatMandat.titrePoste;
    if (!clientEntrepriseId && candidatMandat.entreprise) entrepriseNom = candidatMandat.entreprise.nom;
  }

  if (!mandatTitre && clientEntrepriseId) {
    const anyMandat = await prisma.mandat.findFirst({
      where: { entrepriseId: clientEntrepriseId, statut: { in: ['OUVERT', 'EN_COURS'] } },
      select: { titrePoste: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (anyMandat) mandatTitre = anyMandat.titrePoste;
  }

  const { notifyPresentation } = await import('../slack/slack.service.js');
  await notifyPresentation({
    candidatPrenom: candidat.prenom,
    candidatNom: candidat.nom,
    entrepriseNom,
    contactNom,
    mandatTitre: mandatTitre || classified.summary,
    recruteurPrenom: recruiterName,
    date: start,
  });
  return true;
}

/**
 * Événement non identifié : message privé Slack avec un lien vers l'ATS pour dire
 * s'il s'agit d'un RDV client, d'une présentation ou d'autre chose. Sans slackUserId
 * ni SLACK_BOT_TOKEN, l'événement reste visible dans l'ATS sur /rdv/classer.
 */
async function demanderClassement(
  activiteId: string,
  classified: ClassifiedEvent,
  userId: string,
): Promise<void> {
  try {
    const { sendSlackDm } = await import('../slack/slack.service.js');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { slackUserId: true },
    });
    if (!user?.slackUserId) return;

    const startDate = classified.startTime
      ? new Date(classified.startTime).toLocaleString('fr-FR', {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/Paris',
        })
      : 'Heure inconnue';

    const avec = classified.attendees
      .filter((a) => a.role !== 'internal')
      .map((a) => a.name || a.email)
      .join(', ');

    const lien = `${(process.env.APP_URL || 'https://ats.propium.co').replace(/\/$/, '')}/rdv/classer/${activiteId}`;

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `❓ *RDV client ou présentation ?*`,
            ``,
            `📅 *${classified.summary}* · ${startDate}`,
            `👥 Avec : ${avec || 'participants inconnus'}`,
            ``,
            `<${lien}|Répondre dans l'ATS>`,
            `_Rien n'est annoncé ni compté tant que tu n'as pas répondu._`,
          ].join('\n'),
        },
      },
    ];

    const sent = await sendSlackDm(user.slackUserId, { blocks, text: `RDV client ou présentation ? ${classified.summary}` });
    if (sent) {
      console.log(`[CalendarWatcher] Slack DM "à classer" sent for event: ${classified.summary}`);
    }
  } catch (err) {
    console.error('[CalendarWatcher] Failed to send "à classer" DM:', err);
  }
}

// In-memory lock to prevent duplicate processing when multiple webhooks fire simultaneously
const processingEvents = new Set<string>();

/**
 * Process a single classified event: create Activite if not already tracked.
 * Returns true if a new Activite was created.
 */
async function processClassifiedEvent(
  classified: ClassifiedEvent,
  userId: string,
  recruiterName: string,
): Promise<boolean> {
  // Skip internal events
  if (classified.externalCount === 0) return false;

  // In-memory lock: skip if already being processed right now
  const lockKey = `${classified.googleEventId}:${userId}`;
  if (processingEvents.has(lockKey)) return false;
  processingEvents.add(lockKey);

  try {
    return await _processClassifiedEventInner(classified, userId, recruiterName);
  } finally {
    // Release lock after a short delay to catch rapid duplicate webhooks
    setTimeout(() => processingEvents.delete(lockKey), 5000);
  }
}

/**
 * Nature d'un événement d'agenda. Un RDV client ou une présentation n'est retenu
 * automatiquement que s'il est clairement identifié ; sinon on pose la question.
 *
 *  - un seul externe, candidat connu                      → INTERVIEW
 *  - candidat identifié + contact client connu            → PRESENTATION (annoncée)
 *  - uniquement des contacts clients connus + titre « RDV » → RDV_CLIENT (annoncé)
 *  - contact client, plusieurs externes ou titre évocateur → A_CLASSER (question en message privé)
 *  - sinon (un externe inconnu, sans indice)              → INTERVIEW, comme avant
 */
async function _processClassifiedEventInner(
  classified: ClassifiedEvent,
  userId: string,
  recruiterName: string,
): Promise<boolean> {
  // Check if already processed by googleEventId
  const existing = await prisma.activite.findFirst({
    where: {
      source: 'CALENDAR',
      metadata: { path: ['googleEventId'], equals: classified.googleEventId },
    },
  });
  if (existing) return false;

  // RDV pris via la page de réservation : déjà enregistré et compté côté booking.
  const booking = await prisma.booking.findFirst({
    where: { googleEventId: classified.googleEventId },
    select: { id: true },
  });
  if (booking) return false;

  const externals = classified.attendees.filter((a) => a.role !== 'internal');
  const candidatAtt = externals.find((a) => a.role === 'candidat' && a.entityId);
  const clients = externals.filter((a) => a.role === 'client');
  const clientAtt = clients[0];

  let kind: MeetingKind;
  let candidat: ResolvedCandidat | null = null;

  if (externals.length === 1 && candidatAtt) {
    kind = 'INTERVIEW';
  } else {
    if (clients.length > 0 || externals.length >= 2) {
      candidat = await resolveCandidat(classified, clientAtt);
    }
    const titreRdv = RE_TITRE_RDV.test(classified.summary) && !RE_TITRE_PRESENTATION.test(classified.summary);
    if (candidat && clientAtt) {
      kind = 'PRESENTATION';
    } else if (!candidat && clients.length > 0 && clients.length === externals.length && titreRdv) {
      kind = 'RDV_CLIENT';
    } else if (clients.length > 0 || externals.length >= 2 || RE_TITRE_INDICE.test(classified.summary)) {
      kind = 'A_CLASSER';
    } else {
      kind = 'INTERVIEW';
    }
  }

  // Linked entity
  let entiteType: 'CANDIDAT' | 'CLIENT' = 'CANDIDAT';
  let entiteId = '00000000-0000-0000-0000-000000000000';
  if (kind === 'RDV_CLIENT' && clientAtt?.entityId) {
    entiteType = 'CLIENT';
    entiteId = clientAtt.entityId;
  } else if (candidat) {
    entiteId = candidat.id;
  } else if (candidatAtt?.entityId) {
    entiteId = candidatAtt.entityId;
  } else if (clientAtt?.entityId) {
    entiteType = 'CLIENT';
    entiteId = clientAtt.entityId;
  }

  // Annonces Slack : uniquement pour ce qui est identifié.
  let annonceSlack = false;
  try {
    if (kind === 'PRESENTATION' && candidat && clientAtt) {
      annonceSlack = await annoncerPresentationAgenda(classified, candidat, clientAtt, recruiterName);
    } else if (kind === 'RDV_CLIENT' && clientAtt) {
      const client = clientAtt.entityId
        ? await prisma.client.findUnique({
            where: { id: clientAtt.entityId },
            select: { nom: true, prenom: true, entreprise: { select: { nom: true } } },
          })
        : null;
      await notifyNewMeeting({
        titre: classified.summary,
        recruteurPrenom: recruiterName,
        clientNom: client ? [client.prenom, client.nom].filter(Boolean).join(' ') : clientAtt.name || clientAtt.email,
        entrepriseNom: client?.entreprise?.nom || null,
        date: classified.startTime || null,
        lieu: null,
      });
      annonceSlack = true;
    }
  } catch (err) {
    console.error('[CalendarWatcher] Slack notification error:', err);
  }

  const prefixes: Record<MeetingKind, string> = {
    INTERVIEW: '🎯 Interview',
    PRESENTATION: '🤝 Présentation',
    RDV_CLIENT: '📅 RDV client',
    A_CLASSER: '❓ À classer',
    AUTRE: 'Meeting',
  };

  const activite = await prisma.activite.create({
    data: {
      type: 'MEETING',
      entiteType,
      entiteId,
      userId,
      titre: `${prefixes[kind]} — ${classified.summary}`,
      contenu: `Événement détecté automatiquement.\nParticipants : ${classified.attendees.map((a) => a.email).join(', ')}`,
      source: 'CALENDAR',
      metadata: {
        googleEventId: classified.googleEventId,
        calendarEventType: kind,
        summary: classified.summary,
        startTime: classified.startTime,
        endTime: classified.endTime,
        htmlLink: classified.htmlLink,
        attendees: classified.attendees.map((a) => ({
          email: a.email,
          role: a.role,
          name: a.name,
          entityId: a.entityId,
        })),
        autoClassified: true,
        annonceSlack,
      },
    },
  });

  if (kind === 'A_CLASSER') {
    demanderClassement(activite.id, classified, userId).catch(() => {});
  }

  console.log(
    `[CalendarWatcher] Created ${kind} activity for event "${classified.summary}" (user ${userId})`,
  );
  return true;
}

/**
 * Calendar Watcher — runs every 15 minutes during business hours.
 *
 * For each recruiter with Calendar connected:
 *  1. Fetch events created/modified in the last 16 minutes (overlap for safety)
 *  2. Classify each event
 *  3. Create Activite typed INTERVIEW / PRESENTATION / RDV_CLIENT / A_CLASSER
 *  4. Send Slack DM with an ATS link for A_CLASSER events
 */
export async function runCalendarWatcher(): Promise<void> {
  // Only run Mon-Fri 8h-19h Paris
  const now = new Date();
  const parisStr = now.toLocaleString('en-GB', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [hours] = parisStr.split(':').map(Number);

  const dayFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
  });
  const dayStr = dayFormatter.format(now);
  const dayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0,
  };
  const dayOfWeek = dayMap[dayStr] ?? now.getDay();

  if (dayOfWeek < 1 || dayOfWeek > 5) return; // Weekend
  if (hours < 8 || hours >= 19) return;         // Outside business hours

  // Find all users with calendar (or gmail) integration enabled
  const calendarConfigs = await prisma.integrationConfig.findMany({
    where: {
      provider: { in: ['calendar', 'gmail'] },
      enabled: true,
    },
    select: { userId: true, provider: true },
  });

  // Deduplicate by userId (prefer calendar config over gmail)
  const userIds = new Map<string, string>();
  for (const cfg of calendarConfigs) {
    if (!userIds.has(cfg.userId) || cfg.provider === 'calendar') {
      userIds.set(cfg.userId, cfg.provider);
    }
  }

  if (userIds.size === 0) return;

  let totalCreated = 0;

  for (const [userId] of userIds) {
    try {
      const accessToken = await getValidAccessToken(userId);

      // Get the recruiter's email for classification
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, nom: true, prenom: true },
      });
      if (!user) continue;

      const recruiterName = [user.prenom, user.nom].filter(Boolean).join(' ');

      // Fetch events modified in the last 16 minutes (1 min overlap with 15 min interval)
      const updatedMin = new Date(Date.now() - 16 * 60 * 1000).toISOString();
      // Look at events in the next 30 days (upcoming interviews/presentations)
      const timeMin = new Date().toISOString();
      const timeMax = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const calResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
          `updatedMin=${encodeURIComponent(updatedMin)}` +
          `&timeMin=${encodeURIComponent(timeMin)}` +
          `&timeMax=${encodeURIComponent(timeMax)}` +
          `&maxResults=50` +
          `&singleEvents=true` +
          `&orderBy=startTime`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!calResponse.ok) {
        const err = await calResponse.json() as any;
        console.error(
          `[CalendarWatcher] API error for user ${userId}: ${err.error?.message || calResponse.status}`,
        );
        continue;
      }

      const calData = await calResponse.json() as any;
      const items = (calData.items || []).filter(
        (item: any) => item.status !== 'cancelled' && (item.attendees || []).length > 0,
      );

      for (const item of items) {
        const classified = await classifyCalendarEvent(item, user.email);
        const created = await processClassifiedEvent(classified, userId, recruiterName);
        if (created) totalCreated++;
      }
    } catch (err) {
      console.error(`[CalendarWatcher] Error processing user ${userId}:`, err);
    }
  }

  if (totalCreated > 0) {
    console.log(`[CalendarWatcher] Completed: ${totalCreated} new activit(ies) created`);
  }
}
