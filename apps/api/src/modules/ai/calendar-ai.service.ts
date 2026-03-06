import prisma from '../../lib/db.js';
import { AppError, NotFoundError } from '../../lib/errors.js';
import { getAiConfigWithKey } from './ai-config.service.js';

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

interface UnknownParticipant {
  email: string;
  name?: string;
  domain: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
}

interface AiSuggestion {
  email: string;
  name: string;
  type: 'candidate' | 'client' | 'company';
  confidence: number;
  reasoning: string;
  suggestedData: Record<string, any>;
  eventId: string;
  eventTitle: string;
  eventDate: string;
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

// ─── KNOWN CONTACTS / COMPANIES ────────────────────

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

async function getKnownDomains(): Promise<Set<string>> {
  const domains = new Set<string>();

  const entreprises = await prisma.entreprise.findMany({
    where: { siteWeb: { not: null } },
    select: { siteWeb: true },
  });

  for (const e of entreprises) {
    if (e.siteWeb) {
      try {
        const url = e.siteWeb.startsWith('http') ? e.siteWeb : `https://${e.siteWeb}`;
        const hostname = new URL(url).hostname.replace(/^www\./, '');
        domains.add(hostname.toLowerCase());
      } catch {
        // Invalid URL, skip
      }
    }
  }

  return domains;
}

// ─── AI ANALYSIS ────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are an AI assistant for a recruitment ATS (Applicant Tracking System) used by a headhunting firm called HumanUp.

Your task is to analyze calendar event participants and determine if they should be added to the ATS as candidates, clients (company contacts), or companies.

Context:
- HumanUp is a recruitment agency. Their calendar events include meetings with candidates (job seekers), clients (hiring managers / HR contacts at companies), and internal team meetings.
- Internal emails end with @humanup.io - these should be ignored.
- External participants who are NOT already in the ATS should be analyzed.

For each unknown participant, determine:
1. Whether they are likely a CANDIDATE (someone looking for a job or being recruited), a CLIENT (a hiring manager, HR person, or company contact), or if their company should be added.
2. Use clues from:
   - The event title (e.g., "Entretien", "Interview" = candidate; "Réunion client", "Business dev" = client)
   - The email domain (corporate domains suggest client/company; gmail/outlook suggest candidate)
   - The person's display name
   - The event description if available

Respond in JSON format ONLY. Return an array of suggestions:
[
  {
    "email": "person@example.com",
    "name": "Person Name",
    "type": "candidate" | "client" | "company",
    "confidence": 0.0-1.0,
    "reasoning": "Brief explanation",
    "suggestedData": {
      // For candidate: { nom, prenom, email, source }
      // For client: { nom, prenom, email, poste, entrepriseNom }
      // For company: { nom, siteWeb, secteur }
    }
  }
]

If a participant's email domain suggests a company that is not yet tracked, also suggest adding the company (type: "company") in addition to the individual contact.

If there are no suggestions, return an empty array: []

Important:
- Only return valid JSON, no markdown or explanation outside the JSON.
- "nom" is the last name, "prenom" is the first name (French).
- For source field on candidates, use "Calendar - [event title]".
- Confidence should be higher (0.7+) when the event title clearly indicates the relationship type.
- Confidence should be lower (0.3-0.6) when you are guessing based on domain alone.`;
}

function buildUserPrompt(unknownParticipants: UnknownParticipant[]): string {
  const grouped = new Map<string, UnknownParticipant[]>();
  for (const p of unknownParticipants) {
    const key = `${p.eventId}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }

  let prompt = 'Analyze the following calendar event participants that are NOT yet in our ATS:\n\n';

  for (const [eventId, participants] of grouped) {
    const first = participants[0];
    prompt += `Event: "${first.eventTitle}" (${first.eventDate})\n`;
    prompt += `Participants:\n`;
    for (const p of participants) {
      prompt += `  - ${p.name || '(no name)'} <${p.email}> (domain: ${p.domain})\n`;
    }
    prompt += '\n';
  }

  prompt += 'Return your analysis as a JSON array of suggestions.';
  return prompt;
}

async function callAiProvider(
  userId: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const config = await getAiConfigWithKey(userId);
  if (!config) {
    throw new AppError(400, 'Configuration IA non trouvée. Veuillez configurer votre clé API dans les paramètres.');
  }

  let responseText = '';

  if (config.aiProvider === 'gemini') {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
        }),
      },
    );

    if (!response.ok) {
      const err = (await response.json()) as any;
      throw new AppError(502, `Erreur Gemini: ${err.error?.message || response.status}`);
    }

    const data = (await response.json()) as any;
    responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } else if (config.aiProvider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 2000,
        temperature: 0.1,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = (await response.json()) as any;
      throw new AppError(502, `Erreur Anthropic: ${err.error?.message || response.status}`);
    }

    const data = (await response.json()) as any;
    responseText = data.content?.[0]?.text || '';
  } else if (config.aiProvider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const err = (await response.json()) as any;
      throw new AppError(502, `Erreur OpenAI: ${err.error?.message || response.status}`);
    }

    const data = (await response.json()) as any;
    responseText = data.choices?.[0]?.message?.content || '';
  } else {
    throw new AppError(400, `Fournisseur IA non reconnu: ${config.aiProvider}`);
  }

  return responseText;
}

function parseAiResponse(responseText: string): AiSuggestion[] {
  // Strip markdown code blocks if present
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    console.error('[CalendarAI] Failed to parse AI response:', cleaned.substring(0, 200));
    return [];
  }
}

// ─── MAIN SERVICE FUNCTIONS ─────────────────────────

/**
 * Analyze calendar events and create suggestions for unknown participants.
 */
export async function analyzeCalendarEvents(userId: string) {
  // 1. Fetch recent calendar events
  const events = await fetchRecentCalendarEvents(userId);
  console.log(`[CalendarAI] Fetched ${events.length} calendar events for analysis`);

  if (events.length === 0) {
    return { suggestions: [], analyzed: 0, message: 'Aucun événement calendrier trouvé.' };
  }

  // 2. Get known contacts and companies
  const knownEmails = await getKnownEmails();
  const knownDomains = await getKnownDomains();

  // 3. Get already processed event+email combos (pending or accepted or dismissed)
  const existingSuggestions = await prisma.aiCalendarSuggestion.findMany({
    where: { userId },
    select: { calendarEventId: true, suggestedData: true },
  });

  const processedKeys = new Set<string>();
  for (const s of existingSuggestions) {
    const data = s.suggestedData as Record<string, any>;
    const email = data?.email || '';
    processedKeys.add(`${s.calendarEventId}::${email.toLowerCase()}`);
  }

  // 4. Find unknown external participants
  const unknownParticipants: UnknownParticipant[] = [];

  for (const event of events) {
    const attendees = event.attendees || [];
    const filteredAttendees = attendees.filter(
      (a) => a.email && !a.email.includes('calendar.google.com'),
    );

    // Skip events with no external attendees
    const hasExternal = filteredAttendees.some((a) => {
      const domain = a.email.split('@')[1]?.toLowerCase();
      return domain && !INTERNAL_DOMAINS.includes(domain);
    });
    if (!hasExternal) continue;

    // Skip purely internal events
    const allInternal = filteredAttendees.every((a) => {
      const domain = a.email.split('@')[1]?.toLowerCase();
      return domain && INTERNAL_DOMAINS.includes(domain);
    });
    if (allInternal) continue;

    const eventDate = event.start?.dateTime || event.start?.date || '';

    for (const attendee of filteredAttendees) {
      const email = attendee.email.toLowerCase();
      const domain = email.split('@')[1] || '';

      // Skip internal
      if (INTERNAL_DOMAINS.includes(domain)) continue;

      // Skip known contacts
      if (knownEmails.has(email)) continue;

      // Skip already processed
      const key = `${event.id}::${email}`;
      if (processedKeys.has(key)) continue;

      unknownParticipants.push({
        email,
        name: attendee.displayName || undefined,
        domain,
        eventId: event.id,
        eventTitle: event.summary || '(Sans titre)',
        eventDate,
      });
    }
  }

  console.log(`[CalendarAI] Found ${unknownParticipants.length} unknown participants to analyze`);

  if (unknownParticipants.length === 0) {
    return {
      suggestions: [],
      analyzed: events.length,
      message: 'Tous les participants sont déjà connus ou internes.',
    };
  }

  // 5. Call AI to analyze unknown participants
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(unknownParticipants);
  const aiResponseText = await callAiProvider(userId, systemPrompt, userPrompt);
  const aiSuggestions = parseAiResponse(aiResponseText);

  console.log(`[CalendarAI] AI returned ${aiSuggestions.length} suggestions`);

  // 6. Enrich suggestions with event data and create DB records
  const createdSuggestions = [];

  for (const suggestion of aiSuggestions) {
    // Find the matching participant to get event info
    const participant = unknownParticipants.find(
      (p) => p.email.toLowerCase() === suggestion.email?.toLowerCase(),
    );

    if (!participant) continue;

    // Double-check this combo hasn't been processed yet (race condition guard)
    const alreadyExists = await prisma.aiCalendarSuggestion.findFirst({
      where: {
        userId,
        calendarEventId: participant.eventId,
        suggestedData: {
          path: ['email'],
          equals: participant.email,
        },
      },
    });
    if (alreadyExists) continue;

    // Ensure suggestedData has the email
    const suggestedData = {
      ...suggestion.suggestedData,
      email: participant.email,
    };

    const record = await prisma.aiCalendarSuggestion.create({
      data: {
        userId,
        calendarEventId: participant.eventId,
        eventTitle: participant.eventTitle,
        eventDate: participant.eventDate ? new Date(participant.eventDate) : new Date(),
        suggestionType: suggestion.type || 'candidate',
        suggestedData,
        confidence: suggestion.confidence ?? 0.5,
        reasoning: suggestion.reasoning || null,
        status: 'pending',
      },
    });

    createdSuggestions.push(record);
  }

  // Also check for unknown company domains (not in the AI response)
  // This handles cases where AI didn't explicitly suggest a company
  for (const participant of unknownParticipants) {
    const domain = participant.domain;

    // Skip common personal email providers
    const personalDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
      'icloud.com', 'me.com', 'protonmail.com', 'proton.me', 'orange.fr',
      'free.fr', 'sfr.fr', 'wanadoo.fr', 'laposte.net',
    ];
    if (personalDomains.includes(domain)) continue;

    // Skip if domain is already known
    if (knownDomains.has(domain)) continue;

    // Check if we already have a company suggestion for this domain from AI
    const alreadyHasCompanySuggestion = aiSuggestions.some(
      (s) => s.type === 'company' && s.suggestedData?.siteWeb?.includes(domain),
    );
    if (alreadyHasCompanySuggestion) continue;

    // Check if we already have a DB suggestion for this domain
    const existingCompanySuggestion = await prisma.aiCalendarSuggestion.findFirst({
      where: {
        userId,
        suggestionType: 'company',
        suggestedData: {
          path: ['siteWeb'],
          string_contains: domain,
        },
      },
    });
    if (existingCompanySuggestion) continue;

    // Create a company suggestion
    const companyName = domain.split('.')[0];
    const capitalizedName = companyName.charAt(0).toUpperCase() + companyName.slice(1);

    const record = await prisma.aiCalendarSuggestion.create({
      data: {
        userId,
        calendarEventId: participant.eventId,
        eventTitle: participant.eventTitle,
        eventDate: participant.eventDate ? new Date(participant.eventDate) : new Date(),
        suggestionType: 'company',
        suggestedData: {
          nom: capitalizedName,
          siteWeb: `https://www.${domain}`,
          email: participant.email,
        },
        confidence: 0.4,
        reasoning: `Domaine professionnel ${domain} détecté dans un événement calendrier. L'entreprise n'est pas encore dans l'ATS.`,
        status: 'pending',
      },
    });

    createdSuggestions.push(record);
    // Add domain to known set so we don't suggest it again in same batch
    knownDomains.add(domain);
  }

  console.log(`[CalendarAI] Created ${createdSuggestions.length} suggestion records`);

  return {
    suggestions: createdSuggestions,
    analyzed: events.length,
    unknownParticipants: unknownParticipants.length,
    message: `${createdSuggestions.length} nouvelles suggestions créées à partir de ${events.length} événements.`,
  };
}

/**
 * Get pending calendar suggestions for a user.
 */
export async function getSuggestions(userId: string) {
  const suggestions = await prisma.aiCalendarSuggestion.findMany({
    where: { userId, status: 'pending' },
    orderBy: [{ confidence: 'desc' }, { eventDate: 'desc' }],
  });

  return suggestions;
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
    // Create a Candidat record
    const candidat = await prisma.candidat.create({
      data: {
        nom: data.nom || data.name || 'Inconnu',
        prenom: data.prenom || data.firstName || null,
        email: data.email || null,
        telephone: data.telephone || data.phone || null,
        posteActuel: data.posteActuel || data.currentPosition || null,
        entrepriseActuelle: data.entrepriseActuelle || data.currentCompany || null,
        linkedinUrl: data.linkedinUrl || null,
        source: data.source || `Calendar - ${suggestion.eventTitle}`,
        notes: data.notes || `Suggéré par l'analyse IA du calendrier. Événement: "${suggestion.eventTitle}" (${suggestion.eventDate.toISOString().split('T')[0]})`,
        createdById: userId,
      },
    });
    createdEntityId = candidat.id;

    // Create an activity to track
    await prisma.activite.create({
      data: {
        type: 'NOTE',
        entiteType: 'CANDIDAT',
        entiteId: candidat.id,
        userId,
        titre: `Candidat créé via suggestion IA Calendar`,
        contenu: `Candidat détecté dans l'événement "${suggestion.eventTitle}". ${suggestion.reasoning || ''}`,
        source: 'AGENT_IA',
        metadata: {
          calendarSuggestionId: suggestion.id,
          calendarEventId: suggestion.calendarEventId,
          confidence: suggestion.confidence,
        },
      },
    });
  } else if (suggestion.suggestionType === 'client') {
    // Find or create the company first
    let entrepriseId: string;

    if (data.entrepriseId) {
      entrepriseId = data.entrepriseId;
    } else if (data.entrepriseNom) {
      // Try to find existing company by name
      const existing = await prisma.entreprise.findFirst({
        where: { nom: { equals: data.entrepriseNom, mode: 'insensitive' } },
      });

      if (existing) {
        entrepriseId = existing.id;
      } else {
        // Create the company
        const domain = data.email?.split('@')[1] || '';
        const entreprise = await prisma.entreprise.create({
          data: {
            nom: data.entrepriseNom,
            siteWeb: domain ? `https://www.${domain}` : null,
            secteur: data.secteur || null,
            createdById: userId,
          },
        });
        entrepriseId = entreprise.id;
      }
    } else {
      // Create a placeholder company from email domain
      const domain = data.email?.split('@')[1] || '';
      const companyName = domain ? domain.split('.')[0] : 'Inconnu';
      const capitalizedName = companyName.charAt(0).toUpperCase() + companyName.slice(1);

      const existing = await prisma.entreprise.findFirst({
        where: {
          OR: [
            { nom: { equals: capitalizedName, mode: 'insensitive' } },
            { siteWeb: { contains: domain } },
          ],
        },
      });

      if (existing) {
        entrepriseId = existing.id;
      } else {
        const entreprise = await prisma.entreprise.create({
          data: {
            nom: capitalizedName,
            siteWeb: domain ? `https://www.${domain}` : null,
            createdById: userId,
          },
        });
        entrepriseId = entreprise.id;
      }
    }

    // Create the client
    const client = await prisma.client.create({
      data: {
        nom: data.nom || data.name || 'Inconnu',
        prenom: data.prenom || data.firstName || null,
        email: data.email || null,
        telephone: data.telephone || data.phone || null,
        poste: data.poste || data.jobTitle || null,
        entrepriseId,
        linkedinUrl: data.linkedinUrl || null,
        notes: data.notes || `Suggéré par l'analyse IA du calendrier. Événement: "${suggestion.eventTitle}" (${suggestion.eventDate.toISOString().split('T')[0]})`,
        createdById: userId,
      },
    });
    createdEntityId = client.id;

    // Create an activity to track
    await prisma.activite.create({
      data: {
        type: 'NOTE',
        entiteType: 'CLIENT',
        entiteId: client.id,
        userId,
        titre: `Client créé via suggestion IA Calendar`,
        contenu: `Client détecté dans l'événement "${suggestion.eventTitle}". ${suggestion.reasoning || ''}`,
        source: 'AGENT_IA',
        metadata: {
          calendarSuggestionId: suggestion.id,
          calendarEventId: suggestion.calendarEventId,
          confidence: suggestion.confidence,
        },
      },
    });
  } else if (suggestion.suggestionType === 'company') {
    // Check for existing company with same domain
    const domain = data.siteWeb
      ? new URL(data.siteWeb.startsWith('http') ? data.siteWeb : `https://${data.siteWeb}`).hostname.replace(/^www\./, '')
      : null;

    let existing = null;
    if (domain) {
      existing = await prisma.entreprise.findFirst({
        where: {
          OR: [
            { nom: { equals: data.nom, mode: 'insensitive' } },
            { siteWeb: { contains: domain } },
          ],
        },
      });
    } else {
      existing = await prisma.entreprise.findFirst({
        where: { nom: { equals: data.nom, mode: 'insensitive' } },
      });
    }

    if (existing) {
      // Company already exists, just link it
      createdEntityId = existing.id;
    } else {
      const entreprise = await prisma.entreprise.create({
        data: {
          nom: data.nom || 'Inconnu',
          siteWeb: data.siteWeb || null,
          secteur: data.secteur || null,
          localisation: data.localisation || null,
          createdById: userId,
        },
      });
      createdEntityId = entreprise.id;

      // Create an activity
      await prisma.activite.create({
        data: {
          type: 'NOTE',
          entiteType: 'ENTREPRISE',
          entiteId: entreprise.id,
          userId,
          titre: `Entreprise créée via suggestion IA Calendar`,
          contenu: `Entreprise détectée dans l'événement "${suggestion.eventTitle}". ${suggestion.reasoning || ''}`,
          source: 'AGENT_IA',
          metadata: {
            calendarSuggestionId: suggestion.id,
            calendarEventId: suggestion.calendarEventId,
            confidence: suggestion.confidence,
          },
        },
      });
    }
  }

  // Update the suggestion status
  const updated = await prisma.aiCalendarSuggestion.update({
    where: { id },
    data: {
      status: 'accepted',
      createdEntityId,
      resolvedAt: new Date(),
    },
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

  if (!suggestion) {
    throw new NotFoundError('Suggestion', id);
  }

  if (suggestion.userId !== userId) {
    throw new AppError(403, 'Accès interdit à cette suggestion.');
  }

  const updated = await prisma.aiCalendarSuggestion.update({
    where: { id },
    data: {
      status: 'dismissed',
      resolvedAt: new Date(),
    },
  });

  return updated;
}
