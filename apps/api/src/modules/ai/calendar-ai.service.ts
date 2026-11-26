/**
 * Lecture des invités d'agenda à la demande (route /calendar-ai) : mêmes règles que la
 * synchro agenda (IA : candidat, client si entreprise sous contrat, sinon Lead).
 * Contient aussi l'ancienne gestion des suggestions, gardée pour compatibilité.
 */

import prisma from '../../lib/db.js';
import { AppError, NotFoundError } from '../../lib/errors.js';

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

// ─── CONSTANTS ──────────────────────────────────────


// ─── TOKEN HELPER ───────────────────────────────────

async function getValidAccessToken(userId: string): Promise<string> {
  const { requireGoogleAccessToken } = await import('../integrations/google-auth.service.js');
  return requireGoogleAccessToken(userId);
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

// ─── HELPERS ────────────────────────────────────────

function deriveCompanyName(domain: string): string {
  const name = domain.split('.')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ─── MAIN : lecture des invités (même règles que la synchro) ─────

/**
 * Relit les événements des 14 derniers et 14 prochains jours : chaque invité inconnu
 * est lu par l'IA (candidat, client si entreprise sous contrat, sinon Lead).
 * Appelé à la demande ; la synchro agenda le fait déjà à chaque nouvel événement.
 */
export async function analyzeCalendarEvents(userId: string) {
  const events = await fetchRecentCalendarEvents(userId);
  if (events.length === 0) {
    return { candidats: 0, clients: 0, entreprises: 0, leads: 0, analyzed: 0, message: 'Aucun événement calendrier trouvé.' };
  }
  const { resolveEventAttendees } = await import('../integrations/calendar.service.js');
  const { AiBudget, AiBudgetExhausted, aiIsAvailable } = await import('../integrations/contact-resolver.service.js');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const budget = await new AiBudget(60, aiIsAvailable()).load(userId);
  let stats = { candidats: 0, clients: 0, entreprises: 0, leads: 0 };
  try {
    stats = await resolveEventAttendees(userId, events, (user?.email || '').toLowerCase(), budget, { onlyUntracked: false });
  } catch (err) {
    if (!(err instanceof AiBudgetExhausted)) throw err;
  } finally {
    await budget.save(userId);
  }
  return {
    ...stats,
    analyzed: events.length,
    message: `${stats.candidats} candidats, ${stats.clients} clients, ${stats.leads} leads créés depuis ${events.length} événements.`,
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
