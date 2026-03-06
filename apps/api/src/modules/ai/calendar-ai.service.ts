/**
 * Calendar Auto-Create Service
 *
 * Analyzes calendar events and DIRECTLY creates contacts:
 *  - Email @humanup.io → SKIP (internal)
 *  - Email already in DB → SKIP
 *  - Email perso (@gmail.com, etc.) → Candidat
 *  - Email pro (@entreprise.com) → Entreprise + Client
 *
 * No AI, no suggestions, no manual validation.
 */

import prisma from '../../lib/db.js';
import { AppError, NotFoundError } from '../../lib/errors.js';
import { isPersonalEmail } from '../integrations/allo.service.js';

// ─── TYPES ──────────────────────────────────────────

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  organizer?: { email: string; displayName?: string };
  htmlLink?: string;
  location?: string;
}

interface AutoCreateStats {
  candidats: number;
  clients: number;
  entreprises: number;
  skipped: number;
  analyzed: number;
}

// ─── CONSTANTS ──────────────────────────────────────

const INTERNAL_DOMAINS = ['humanup.io'];

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';

// ─── TOKEN HELPER ───────────────────────────────────

async function getValidAccessToken(userId: string): Promise<string> {
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

  // Refresh expired token
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

    const tokens = (await response.json()) as any;
    if (tokens.error) {
      throw new AppError(400, 'Erreur lors du rafraîchissement du token Calendar. Veuillez reconnecter.');
    }

    const newExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
    await prisma.integrationConfig.update({
      where: { id: config.id },
      data: { accessToken: tokens.access_token, tokenExpiry: newExpiry },
    });

    return tokens.access_token as string;
  }

  return config.accessToken;
}

// ─── FETCH CALENDAR EVENTS ─────────────────────────

async function fetchRecentCalendarEvents(userId: string): Promise<CalendarEvent[]> {
  const accessToken = await getValidAccessToken(userId);

  // Fetch events from last 14 days + next 14 days
  const timeMin = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const calResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&maxResults=100&orderBy=startTime&singleEvents=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!calResponse.ok) {
    const err = (await calResponse.json()) as any;
    throw new AppError(502, `Erreur Calendar API: ${err.error?.message || calResponse.status}`);
  }

  const calData = (await calResponse.json()) as any;
  return (calData.items || []) as CalendarEvent[];
}

// ─── KNOWN CONTACTS ─────────────────────────────────

async function getKnownEmails(): Promise<Set<string>> {
  const emails = new Set<string>();

  const candidats = await prisma.candidat.findMany({
    where: { email: { not: null } },
    select: { email: true },
  });
  for (const c of candidats) {
    if (c.email) emails.add(c.email.toLowerCase());
  }

  const clients = await prisma.client.findMany({
    where: { email: { not: null } },
    select: { email: true },
  });
  for (const c of clients) {
    if (c.email) emails.add(c.email.toLowerCase());
  }

  return emails;
}

// ─── HELPERS ────────────────────────────────────────

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function extractName(displayName: string | undefined, email: string): { firstName: string; lastName: string } {
  if (displayName && displayName !== email) {
    const parts = displayName.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
    }
    return { firstName: parts[0] || '', lastName: '' };
  }

  // Fallback: parse from email
  const localPart = email.split('@')[0];
  const parts = localPart.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) {
    return {
      firstName: capitalize(parts[0]),
      lastName: parts.slice(1).map(capitalize).join(' '),
    };
  }

  return { firstName: capitalize(localPart), lastName: '' };
}

function deriveCompanyName(domain: string): string {
  const name = domain.split('.')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ─── MAIN: DIRECT AUTO-CREATE ───────────────────────

/**
 * Analyze calendar events and DIRECTLY create contacts.
 * No suggestions, no manual validation.
 *
 * Logic: email perso → Candidat, email pro → Entreprise + Client.
 */
export async function analyzeCalendarEvents(userId: string) {
  const stats: AutoCreateStats = { candidats: 0, clients: 0, entreprises: 0, skipped: 0, analyzed: 0 };

  // 1. Fetch recent calendar events
  const events = await fetchRecentCalendarEvents(userId);
  stats.analyzed = events.length;

  if (events.length === 0) {
    return { ...stats, message: 'Aucun événement calendrier trouvé.' };
  }

  // 2. Get known contacts
  const knownEmails = await getKnownEmails();

  // 3. Track already processed emails within this batch (dedupe by email across events)
  const processedInBatch = new Set<string>();

  for (const event of events) {
    const attendees = event.attendees || [];
    const eventTitle = event.summary || '(Sans titre)';
    const eventDate = event.start?.dateTime || event.start?.date || '';

    for (const attendee of attendees) {
      if (!attendee.email) continue;

      const email = attendee.email.toLowerCase().trim();
      const domain = email.split('@')[1] || '';

      // Skip Google Calendar resource rooms
      if (email.includes('calendar.google.com') || email.includes('resource.calendar.google.com')) continue;

      // Skip internal
      if (INTERNAL_DOMAINS.includes(domain)) continue;

      // Skip already known in ATS
      if (knownEmails.has(email)) continue;

      // Skip already processed in this batch (same person in multiple events)
      if (processedInBatch.has(email)) continue;
      processedInBatch.add(email);

      // ── AUTO-CREATE ──
      const { firstName, lastName } = extractName(attendee.displayName, email);

      if (isPersonalEmail(email)) {
        // ── PERSO → CANDIDAT ──
        const candidat = await prisma.candidat.create({
          data: {
            nom: lastName || firstName || email.split('@')[0],
            prenom: lastName ? firstName : undefined,
            email,
            source: `Calendar - ${eventTitle}`,
            notes: `Créé automatiquement depuis l'événement : "${eventTitle}" (${eventDate.split('T')[0] || ''})`,
            createdById: userId,
          },
        });

        // Log activity
        await prisma.activite.create({
          data: {
            type: 'NOTE',
            entiteType: 'CANDIDAT',
            entiteId: candidat.id,
            userId,
            titre: `Candidat créé auto (Calendar)`,
            contenu: `Détecté dans "${eventTitle}". Email perso → candidat.`,
            source: 'CALENDAR',
            metadata: { calendarEventId: event.id, eventTitle, eventDate, autoCreated: true },
          },
        });

        knownEmails.add(email);
        stats.candidats++;
        console.log(`[CalendarAutoCreate] CANDIDAT: ${firstName} ${lastName} <${email}>`);

      } else {
        // ── PRO → ENTREPRISE + CLIENT ──

        // Find or create entreprise by domain
        let entreprise = await prisma.entreprise.findFirst({
          where: {
            OR: [
              { siteWeb: { contains: domain, mode: 'insensitive' } },
              { nom: { equals: deriveCompanyName(domain), mode: 'insensitive' } },
            ],
          },
        });

        if (!entreprise) {
          entreprise = await prisma.entreprise.create({
            data: {
              nom: deriveCompanyName(domain),
              siteWeb: `https://www.${domain}`,
              createdById: userId,
            },
          });
          stats.entreprises++;
          console.log(`[CalendarAutoCreate] ENTREPRISE: ${entreprise.nom} (${domain})`);
        }

        // Create client
        const client = await prisma.client.create({
          data: {
            nom: lastName || firstName || email.split('@')[0],
            prenom: lastName ? firstName : undefined,
            email,
            entrepriseId: entreprise.id,
            notes: `Créé automatiquement depuis l'événement : "${eventTitle}" (${eventDate.split('T')[0] || ''})`,
            createdById: userId,
          },
        });

        // Log activity
        await prisma.activite.create({
          data: {
            type: 'NOTE',
            entiteType: 'CLIENT',
            entiteId: client.id,
            userId,
            titre: `Client créé auto (Calendar)`,
            contenu: `Détecté dans "${eventTitle}". Email pro @${domain} → client.`,
            source: 'CALENDAR',
            metadata: {
              calendarEventId: event.id, eventTitle, eventDate,
              autoCreated: true, entrepriseId: entreprise.id,
            },
          },
        });

        knownEmails.add(email);
        stats.clients++;
        console.log(`[CalendarAutoCreate] CLIENT: ${firstName} ${lastName} <${email}> @ ${entreprise.nom}`);
      }
    }
  }

  const total = stats.candidats + stats.clients;
  if (total > 0) {
    console.log(
      `[CalendarAutoCreate] Done: ${stats.candidats} candidats, ${stats.clients} clients, ` +
      `${stats.entreprises} entreprises from ${stats.analyzed} events`,
    );
  }

  return {
    ...stats,
    message: `${stats.candidats} candidats, ${stats.clients} clients, ${stats.entreprises} entreprises créés depuis ${stats.analyzed} événements.`,
  };
}

// ─── LEGACY: suggestion management (kept for backward compat with existing pending suggestions) ──

/**
 * Get pending calendar suggestions for a user.
 */
export async function getSuggestions(userId: string) {
  try {
    const suggestions = await prisma.aiCalendarSuggestion.findMany({
      where: { userId, status: 'pending' },
      orderBy: [{ confidence: 'desc' }, { eventDate: 'desc' }],
    });
    return suggestions;
  } catch {
    // Table may not exist yet
    return [];
  }
}

/**
 * Accept a suggestion and create the corresponding entity.
 */
export async function acceptSuggestion(
  id: string,
  userId: string,
  modifications?: Record<string, any>,
) {
  const suggestion = await prisma.aiCalendarSuggestion.findUnique({
    where: { id },
  });

  if (!suggestion) {
    throw new NotFoundError('Suggestion', id);
  }

  if (suggestion.userId !== userId) {
    throw new AppError(403, 'Accès interdit à cette suggestion.');
  }

  if (suggestion.status !== 'pending') {
    throw new AppError(400, 'Cette suggestion a déjà été traitée.');
  }

  const data = { ...(suggestion.suggestedData as Record<string, any>), ...modifications };
  let createdEntityId: string | null = null;

  if (suggestion.suggestionType === 'candidate') {
    const candidat = await prisma.candidat.create({
      data: {
        nom: data.nom || data.name || 'Inconnu',
        prenom: data.prenom || data.firstName || null,
        email: data.email || null,
        source: data.source || `Calendar - ${suggestion.eventTitle}`,
        notes: `Créé depuis suggestion Calendar : "${suggestion.eventTitle}"`,
        createdById: userId,
      },
    });
    createdEntityId = candidat.id;

  } else if (suggestion.suggestionType === 'client') {
    let entrepriseId: string;
    const companyName = data.entrepriseNom || (data.email ? deriveCompanyName(data.email.split('@')[1]) : 'Inconnu');
    const domain = data.email?.split('@')[1] || '';

    const existing = await prisma.entreprise.findFirst({
      where: {
        OR: [
          { nom: { equals: companyName, mode: 'insensitive' } },
          ...(domain ? [{ siteWeb: { contains: domain } }] : []),
        ],
      },
    });

    if (existing) {
      entrepriseId = existing.id;
    } else {
      const ent = await prisma.entreprise.create({
        data: {
          nom: companyName,
          siteWeb: domain ? `https://www.${domain}` : null,
          createdById: userId,
        },
      });
      entrepriseId = ent.id;
    }

    const client = await prisma.client.create({
      data: {
        nom: data.nom || 'Inconnu',
        prenom: data.prenom || null,
        email: data.email || null,
        poste: data.poste || null,
        entrepriseId,
        notes: `Créé depuis suggestion Calendar : "${suggestion.eventTitle}"`,
        createdById: userId,
      },
    });
    createdEntityId = client.id;

  } else if (suggestion.suggestionType === 'company') {
    const domain = data.siteWeb
      ? (() => { try { return new URL(data.siteWeb.startsWith('http') ? data.siteWeb : `https://${data.siteWeb}`).hostname.replace(/^www\./, ''); } catch { return null; } })()
      : null;

    const existing = domain
      ? await prisma.entreprise.findFirst({
          where: { OR: [{ nom: { equals: data.nom, mode: 'insensitive' } }, { siteWeb: { contains: domain } }] },
        })
      : await prisma.entreprise.findFirst({
          where: { nom: { equals: data.nom, mode: 'insensitive' } },
        });

    if (existing) {
      createdEntityId = existing.id;
    } else {
      const ent = await prisma.entreprise.create({
        data: { nom: data.nom || 'Inconnu', siteWeb: data.siteWeb || null, createdById: userId },
      });
      createdEntityId = ent.id;
    }
  }

  const updated = await prisma.aiCalendarSuggestion.update({
    where: { id },
    data: { status: 'accepted', createdEntityId, resolvedAt: new Date() },
  });

  return updated;
}

/**
 * Dismiss a suggestion.
 */
export async function dismissSuggestion(id: string, userId: string) {
  const suggestion = await prisma.aiCalendarSuggestion.findUnique({
    where: { id },
  });

  if (!suggestion) throw new NotFoundError('Suggestion', id);
  if (suggestion.userId !== userId) throw new AppError(403, 'Accès interdit.');

  return prisma.aiCalendarSuggestion.update({
    where: { id },
    data: { status: 'dismissed', resolvedAt: new Date() },
  });
}
