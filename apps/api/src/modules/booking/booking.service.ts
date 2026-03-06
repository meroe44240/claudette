import crypto from 'crypto';
import prisma from '../../lib/db.js';
import { AppError, NotFoundError, ValidationError, ConflictError } from '../../lib/errors.js';
import { paginatedResult, paginationToSkipTake } from '../../lib/pagination.js';
import type { PaginationParams } from '../../lib/pagination.js';
import * as notificationService from '../notifications/notification.service.js';

// ─── TYPES ──────────────────────────────────────────

interface BookingInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  date: string;       // "YYYY-MM-DD"
  time: string;       // "HH:MM"
  entityType: 'candidat' | 'client';
  salary?: string;
  currentCompany?: string;
  availability?: string;
  competingProcesses?: string;
  message?: string;
  mandatSlug?: string;
}

interface BookingSettingsInput {
  slug: string;
  isActive?: boolean;
  workingDays?: number[];
  startTime?: string;
  endTime?: string;
  slotDuration?: number;
  bufferMinutes?: number;
  minNoticeHours?: number;
  maxAdvanceDays?: number;
  welcomeMessage?: string;
  reminderEmail?: boolean;
  reminderBefore?: boolean;
}

interface TimeSlot {
  time: string;  // "HH:MM"
}

interface CalendarEvent {
  start: string;  // ISO datetime
  end: string;
}

// ─── GOOGLE CALENDAR CONFIG ─────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// ─── HELPERS ────────────────────────────────────────

/**
 * Convert text to a URL-safe slug.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

/**
 * Generate all possible time slots for a day based on start/end time and duration.
 */
function generateSlots(startTime: string, endTime: string, durationMinutes: number): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  for (let m = startMinutes; m + durationMinutes <= endMinutes; m += durationMinutes) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push({ time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` });
  }

  return slots;
}

/**
 * Check if a slot overlaps with a calendar event or existing booking (including buffer).
 */
function isSlotAvailable(
  slotTime: string,
  dateStr: string,
  durationMinutes: number,
  calendarEvents: CalendarEvent[],
  existingBookings: { bookingDate: Date; bookingTime: string; durationMinutes: number }[],
  bufferMinutes: number,
): boolean {
  const [slotH, slotM] = slotTime.split(':').map(Number);
  const slotStart = new Date(`${dateStr}T${slotTime}:00`);
  const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);

  // Add buffer around the slot for comparison
  const slotStartWithBuffer = new Date(slotStart.getTime() - bufferMinutes * 60 * 1000);
  const slotEndWithBuffer = new Date(slotEnd.getTime() + bufferMinutes * 60 * 1000);

  // Check against calendar events
  for (const event of calendarEvents) {
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);

    // Overlap: slotStartWithBuffer < eventEnd AND slotEndWithBuffer > eventStart
    if (slotStartWithBuffer < eventEnd && slotEndWithBuffer > eventStart) {
      return false;
    }
  }

  // Check against existing bookings
  for (const booking of existingBookings) {
    const bDateStr = booking.bookingDate.toISOString().substring(0, 10);
    const bStart = new Date(`${bDateStr}T${booking.bookingTime}:00`);
    const bEnd = new Date(bStart.getTime() + booking.durationMinutes * 60 * 1000);

    if (slotStartWithBuffer < bEnd && slotEndWithBuffer > bStart) {
      return false;
    }
  }

  return true;
}

/**
 * Get a valid access token for Google Calendar.
 * Reuses the gmail integration config since they share Google OAuth.
 */
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
    throw new AppError(400, 'Integration Google Calendar non configuree ou desactivee');
  }

  if (!config.accessToken) {
    throw new AppError(400, 'Token Google Calendar manquant. Veuillez reconnecter votre compte.');
  }

  // Refresh expired token
  if (config.tokenExpiry && config.tokenExpiry.getTime() < Date.now() + 5 * 60 * 1000) {
    if (!config.refreshToken) {
      throw new AppError(400, 'Token expire et pas de refresh token. Veuillez reconnecter votre compte Google.');
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
      throw new AppError(400, 'Erreur lors du rafraichissement du token Calendar. Veuillez reconnecter.');
    }

    const newExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
    await prisma.integrationConfig.update({
      where: { id: config.id },
      data: { accessToken: tokens.access_token, tokenExpiry: newExpiry },
    });

    console.log(`[Booking] Token refreshed for user ${userId}`);
    return tokens.access_token as string;
  }

  return config.accessToken;
}

/**
 * Fetch Google Calendar events for a specific date range.
 */
async function fetchCalendarEvents(userId: string, dateStr: string): Promise<CalendarEvent[]> {
  const accessToken = await getValidAccessToken(userId);

  const timeMin = new Date(`${dateStr}T00:00:00`).toISOString();
  const timeMax = new Date(`${dateStr}T23:59:59`).toISOString();

  const calResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!calResponse.ok) {
    const err = await calResponse.json() as any;
    console.error('[Booking] Calendar fetch error:', err);
    return [];
  }

  const calData = await calResponse.json() as any;
  const items = calData.items || [];

  return items
    .filter((item: any) => item.start?.dateTime && item.end?.dateTime && item.status !== 'cancelled')
    .map((item: any) => ({
      start: item.start.dateTime,
      end: item.end.dateTime,
    }));
}

/**
 * Build a base64url-encoded MIME message for the Gmail API.
 */
function createMimeMessage(
  from: string,
  to: string,
  subject: string,
  htmlBody: string,
): string {
  const boundary = `boundary_${Date.now()}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    htmlBody.replace(/<[^>]+>/g, ''),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ];

  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64url');
}

// ─── PUBLIC-FACING SERVICE FUNCTIONS ─────────────────

/**
 * Get recruiter public info by booking slug.
 * Optionally include mandat info when mandatSlug is provided.
 */
export async function getRecruiterPublicInfo(slug: string, mandatSlug?: string) {
  const setting = await prisma.bookingSetting.findUnique({
    where: { slug },
    include: {
      user: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
  });

  if (!setting) {
    throw new NotFoundError('Page de reservation');
  }

  if (!setting.isActive) {
    throw new AppError(400, 'La page de reservation n\'est pas active.');
  }

  let mandatInfo = null;
  if (mandatSlug) {
    const mandat = await prisma.mandat.findFirst({
      where: {
        slug: mandatSlug,
        isBookingPublic: true,
        OR: [
          { assignedToId: setting.userId },
          { createdById: setting.userId },
        ],
      },
      select: {
        id: true,
        titrePoste: true,
        localisation: true,
        salaryRange: true,
        description: true,
        slug: true,
        entreprise: { select: { nom: true } },
      },
    });

    if (!mandat) {
      throw new NotFoundError('Mandat');
    }

    mandatInfo = mandat;
  }

  return {
    recruiter: {
      nom: setting.user.nom,
      prenom: setting.user.prenom,
      email: setting.user.email,
      avatarUrl: setting.user.avatarUrl,
    },
    settings: {
      slug: setting.slug,
      slotDuration: setting.slotDuration,
      welcomeMessage: setting.welcomeMessage,
      maxAdvanceDays: setting.maxAdvanceDays,
      workingDays: setting.workingDays,
    },
    mandat: mandatInfo,
  };
}

/**
 * Get available time slots for a specific date.
 */
export async function getAvailableSlots(slug: string, dateStr: string): Promise<TimeSlot[]> {
  const setting = await prisma.bookingSetting.findUnique({
    where: { slug },
    include: { user: { select: { id: true } } },
  });

  if (!setting || !setting.isActive) {
    throw new NotFoundError('Page de reservation');
  }

  // Validate the date
  const requestedDate = new Date(`${dateStr}T00:00:00`);
  if (isNaN(requestedDate.getTime())) {
    throw new ValidationError('Date invalide. Format attendu: YYYY-MM-DD');
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const minDate = today;
  const maxDate = new Date(today.getTime() + setting.maxAdvanceDays * 24 * 60 * 60 * 1000);

  if (requestedDate < minDate) {
    throw new ValidationError('La date demandee est dans le passe.');
  }

  if (requestedDate > maxDate) {
    throw new ValidationError(`Reservation possible jusqu'a ${setting.maxAdvanceDays} jours a l'avance.`);
  }

  // Check if it's a working day (0=Sun, 1=Mon ... 6=Sat)
  const dayOfWeek = requestedDate.getDay();
  if (!setting.workingDays.includes(dayOfWeek)) {
    return []; // Not a working day, no slots
  }

  // Generate all possible slots
  const allSlots = generateSlots(setting.startTime, setting.endTime, setting.slotDuration);

  // Fetch calendar events for this day
  let calendarEvents: CalendarEvent[] = [];
  try {
    calendarEvents = await fetchCalendarEvents(setting.userId, dateStr);
  } catch (e) {
    console.warn('[Booking] Could not fetch calendar events, continuing without:', e);
  }

  // Fetch existing bookings for this day
  const existingBookings = await prisma.booking.findMany({
    where: {
      userId: setting.userId,
      bookingDate: requestedDate,
      status: { in: ['confirmed', 'pending'] },
    },
    select: {
      bookingDate: true,
      bookingTime: true,
      durationMinutes: true,
    },
  });

  // Filter slots
  const availableSlots = allSlots.filter((slot) => {
    // Filter out slots within minNoticeHours of now
    const slotDateTime = new Date(`${dateStr}T${slot.time}:00`);
    const minNoticeTime = new Date(now.getTime() + setting.minNoticeHours * 60 * 60 * 1000);
    if (slotDateTime <= minNoticeTime) {
      return false;
    }

    // Check availability against calendar events and existing bookings
    return isSlotAvailable(
      slot.time,
      dateStr,
      setting.slotDuration,
      calendarEvents,
      existingBookings,
      setting.bufferMinutes,
    );
  });

  return availableSlots;
}

/**
 * Create a new booking.
 */
export async function createBooking(slug: string, data: BookingInput) {
  // Validate required fields
  if (!data.firstName || !data.lastName || !data.email || !data.phone || !data.date || !data.time) {
    throw new ValidationError('Tous les champs obligatoires doivent etre remplis (nom, prenom, email, telephone, date, heure).');
  }

  const setting = await prisma.bookingSetting.findUnique({
    where: { slug },
    include: {
      user: {
        select: { id: true, nom: true, prenom: true, email: true },
      },
    },
  });

  if (!setting || !setting.isActive) {
    throw new NotFoundError('Page de reservation');
  }

  // Re-verify slot availability (anti race condition)
  const availableSlots = await getAvailableSlots(slug, data.date);
  const isStillAvailable = availableSlots.some((s) => s.time === data.time);
  if (!isStillAvailable) {
    throw new ConflictError('Ce creneau n\'est plus disponible. Veuillez en choisir un autre.');
  }

  const recruiterName = `${setting.user.prenom || ''} ${setting.user.nom}`.trim();

  // Find or create candidat/client
  let candidatId: string | null = null;
  let clientId: string | null = null;
  let entityId: string | null = null;

  if (data.entityType === 'candidat') {
    // Look for existing candidat by email
    const existing = await prisma.candidat.findFirst({
      where: { email: { equals: data.email.toLowerCase().trim(), mode: 'insensitive' } },
    });

    if (existing) {
      candidatId = existing.id;
      entityId = existing.id;

      // Update phone if not set
      if (!existing.telephone && data.phone) {
        await prisma.candidat.update({
          where: { id: existing.id },
          data: { telephone: data.phone },
        });
      }
    } else {
      const newCandidat = await prisma.candidat.create({
        data: {
          nom: data.lastName,
          prenom: data.firstName,
          email: data.email.toLowerCase().trim(),
          telephone: data.phone,
          entrepriseActuelle: data.currentCompany || undefined,
          source: 'BOOKING',
          createdById: setting.userId,
        },
      });
      candidatId = newCandidat.id;
      entityId = newCandidat.id;
    }
  } else {
    // entityType === 'client'
    const existing = await prisma.client.findFirst({
      where: { email: { equals: data.email.toLowerCase().trim(), mode: 'insensitive' } },
    });

    if (existing) {
      clientId = existing.id;
      entityId = existing.id;
    } else {
      // For a new client, we need an entreprise; create a placeholder if currentCompany is given
      let entrepriseId: string;
      if (data.currentCompany) {
        const existingEntreprise = await prisma.entreprise.findFirst({
          where: { nom: { equals: data.currentCompany, mode: 'insensitive' } },
        });
        if (existingEntreprise) {
          entrepriseId = existingEntreprise.id;
        } else {
          const newEntreprise = await prisma.entreprise.create({
            data: {
              nom: data.currentCompany,
              createdById: setting.userId,
            },
          });
          entrepriseId = newEntreprise.id;
        }
      } else {
        // Use or create a placeholder company
        let placeholder = await prisma.entreprise.findFirst({
          where: { nom: 'Non renseigne' },
        });
        if (!placeholder) {
          placeholder = await prisma.entreprise.create({
            data: { nom: 'Non renseigne', createdById: setting.userId },
          });
        }
        entrepriseId = placeholder.id;
      }

      const newClient = await prisma.client.create({
        data: {
          nom: data.lastName,
          prenom: data.firstName,
          email: data.email.toLowerCase().trim(),
          telephone: data.phone,
          entrepriseId,
          createdById: setting.userId,
        },
      });
      clientId = newClient.id;
      entityId = newClient.id;
    }
  }

  // If mandatSlug provided, create a Candidature
  let mandatId: string | null = null;
  if (data.mandatSlug && data.entityType === 'candidat' && candidatId) {
    const mandat = await prisma.mandat.findFirst({
      where: {
        slug: data.mandatSlug,
        OR: [
          { assignedToId: setting.userId },
          { createdById: setting.userId },
        ],
      },
    });

    if (mandat) {
      mandatId = mandat.id;

      // Check if candidature already exists
      const existingCandidature = await prisma.candidature.findUnique({
        where: { mandatId_candidatId: { mandatId: mandat.id, candidatId } },
      });

      if (!existingCandidature) {
        await prisma.candidature.create({
          data: {
            mandatId: mandat.id,
            candidatId,
            stage: 'SOURCING',
            createdById: setting.userId,
          },
        });
      }
    }
  }

  // Create Google Calendar event
  const bookingDate = new Date(`${data.date}T${data.time}:00`);
  const bookingEndDate = new Date(bookingDate.getTime() + setting.slotDuration * 60 * 1000);
  let calendarEventId: string | null = null;

  try {
    const accessToken = await getValidAccessToken(setting.userId);

    const event = {
      summary: `RDV ${data.firstName} ${data.lastName} — ${recruiterName}`,
      description: [
        `Reservation via la page de booking`,
        `Contact: ${data.firstName} ${data.lastName}`,
        `Email: ${data.email}`,
        `Telephone: ${data.phone}`,
        data.currentCompany ? `Entreprise actuelle: ${data.currentCompany}` : null,
        data.salary ? `Salaire souhaite: ${data.salary}` : null,
        data.availability ? `Disponibilite: ${data.availability}` : null,
        data.competingProcesses ? `Process en cours: ${data.competingProcesses}` : null,
        data.message ? `Message: ${data.message}` : null,
      ].filter(Boolean).join('\n'),
      start: { dateTime: bookingDate.toISOString(), timeZone: 'Europe/Paris' },
      end: { dateTime: bookingEndDate.toISOString(), timeZone: 'Europe/Paris' },
      attendees: [
        { email: data.email },
        { email: setting.user.email },
      ],
    };

    const calResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
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
    if (calResponse.ok) {
      calendarEventId = calResult.id;
      console.log(`[Booking] Calendar event created: ${calResult.id}`);
    } else {
      console.error('[Booking] Calendar event creation error:', calResult);
    }
  } catch (e) {
    console.error('[Booking] Failed to create calendar event:', e);
  }

  // Generate cancelToken
  const cancelToken = crypto.randomBytes(32).toString('hex');

  // Create booking record
  const booking = await prisma.booking.create({
    data: {
      userId: setting.userId,
      mandatId,
      entityType: data.entityType,
      candidatId,
      clientId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email.toLowerCase().trim(),
      phone: data.phone,
      salary: data.salary,
      currentCompany: data.currentCompany,
      availability: data.availability,
      competingProcesses: data.competingProcesses,
      message: data.message,
      bookingDate: new Date(`${data.date}T00:00:00`),
      bookingTime: data.time,
      durationMinutes: setting.slotDuration,
      calendarEventId,
      status: 'confirmed',
      cancelToken,
    },
  });

  // Create booking reminders
  const bookingDateTime = new Date(`${data.date}T${data.time}:00`);

  if (setting.reminderEmail) {
    // Reminder 1 day before
    const dayBefore = new Date(bookingDateTime.getTime() - 24 * 60 * 60 * 1000);
    if (dayBefore > new Date()) {
      await prisma.bookingReminder.create({
        data: {
          bookingId: booking.id,
          type: 'email_day_before',
          status: 'pending',
          scheduledAt: dayBefore,
        },
      });
    }
  }

  if (setting.reminderBefore) {
    // Reminder 1 hour before
    const hourBefore = new Date(bookingDateTime.getTime() - 60 * 60 * 1000);
    if (hourBefore > new Date()) {
      await prisma.bookingReminder.create({
        data: {
          bookingId: booking.id,
          type: 'email_1h_before',
          status: 'pending',
          scheduledAt: hourBefore,
        },
      });
    }
  }

  // Send confirmation email via Gmail API
  try {
    const accessToken = await getValidAccessToken(setting.userId);
    const cancelUrl = `${APP_URL}/booking/cancel/${booking.id}?token=${cancelToken}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Confirmation de votre RDV</h2>
        <p>Bonjour ${data.firstName},</p>
        <p>Votre rendez-vous avec <strong>${recruiterName}</strong> est confirme.</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Date:</strong> ${new Date(data.date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p style="margin: 4px 0;"><strong>Heure:</strong> ${data.time}</p>
          <p style="margin: 4px 0;"><strong>Duree:</strong> ${setting.slotDuration} minutes</p>
        </div>
        <p>Un evenement a ete ajoute a votre calendrier.</p>
        <p style="margin-top: 24px;">Si vous devez annuler, <a href="${cancelUrl}" style="color: #2563eb;">cliquez ici</a>.</p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">Cet email a ete envoye automatiquement depuis la plateforme HumanUp.</p>
      </div>
    `;

    const rawMessage = createMimeMessage(
      setting.user.email,
      data.email,
      `Confirmation de votre RDV avec ${recruiterName}`,
      htmlBody,
    );

    const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawMessage }),
    });

    if (gmailResponse.ok) {
      console.log(`[Booking] Confirmation email sent to ${data.email}`);
    } else {
      const gmailError = await gmailResponse.json() as any;
      console.error('[Booking] Confirmation email error:', gmailError);
    }
  } catch (e) {
    console.error('[Booking] Failed to send confirmation email:', e);
  }

  // Create notification for recruiter
  await notificationService.create({
    userId: setting.userId,
    type: 'SYSTEME',
    titre: 'Nouveau RDV reserve',
    contenu: `${data.firstName} ${data.lastName} a reserve un creneau le ${data.date} a ${data.time}`,
    entiteType: data.entityType === 'candidat' ? 'CANDIDAT' : 'CLIENT',
    entiteId: entityId || undefined,
  });

  // Log activity
  await prisma.activite.create({
    data: {
      type: 'MEETING',
      entiteType: data.entityType === 'candidat' ? 'CANDIDAT' : 'CLIENT',
      entiteId: entityId || '00000000-0000-0000-0000-000000000000',
      userId: setting.userId,
      titre: `RDV ${data.firstName} ${data.lastName} — ${recruiterName}`,
      contenu: `RDV reserve via la page de booking pour le ${data.date} a ${data.time}`,
      source: 'SYSTEME',
      metadata: {
        bookingId: booking.id,
        startTime: bookingDate.toISOString(),
        endTime: bookingEndDate.toISOString(),
        calendarEventId,
        contactEmail: data.email,
        contactPhone: data.phone,
        mandatId,
      },
    },
  });

  // Detect active sequences for this email and pause if match
  try {
    const activeRuns = await prisma.sequenceRun.findMany({
      where: { status: 'running' },
      include: { sequence: true },
    });

    for (const run of activeRuns) {
      if (!run.sequence.stopOnReply) continue;

      let targetEmail: string | null = null;
      if (run.targetType === 'candidate') {
        const candidat = await prisma.candidat.findUnique({ where: { id: run.targetId }, select: { email: true } });
        targetEmail = candidat?.email ?? null;
      } else {
        const client = await prisma.client.findUnique({ where: { id: run.targetId }, select: { email: true } });
        targetEmail = client?.email ?? null;
      }

      if (targetEmail && targetEmail.toLowerCase() === data.email.toLowerCase().trim()) {
        await prisma.sequenceRun.update({
          where: { id: run.id },
          data: { status: 'paused_reply' },
        });

        if (run.assignedToId) {
          await notificationService.create({
            userId: run.assignedToId,
            type: 'SYSTEME',
            titre: `Sequence "${run.sequence.nom}" en pause — RDV reserve`,
            contenu: `${data.firstName} ${data.lastName} a reserve un RDV. La sequence a ete automatiquement mise en pause.`,
            entiteType: run.targetType === 'candidate' ? 'CANDIDAT' : 'CLIENT',
            entiteId: run.targetId,
          });
        }

        console.log(`[Booking] Paused sequence run ${run.id} due to booking from ${data.email}`);
      }
    }
  } catch (e) {
    console.error('[Booking] Error detecting sequences:', e);
  }

  return {
    id: booking.id,
    date: data.date,
    time: data.time,
    duration: setting.slotDuration,
    recruiterName,
    status: 'confirmed',
    cancelUrl: `${APP_URL}/booking/cancel/${booking.id}?token=${cancelToken}`,
  };
}

/**
 * Get cancel info for a booking (used to show cancel page).
 */
export async function getCancelInfo(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: { select: { nom: true, prenom: true } },
    },
  });

  if (!booking) {
    throw new NotFoundError('Reservation', bookingId);
  }

  return {
    id: booking.id,
    firstName: booking.firstName,
    lastName: booking.lastName,
    bookingDate: booking.bookingDate,
    bookingTime: booking.bookingTime,
    durationMinutes: booking.durationMinutes,
    status: booking.status,
    recruiterName: `${booking.user.prenom || ''} ${booking.user.nom}`.trim(),
  };
}

/**
 * Cancel a booking by id and cancel token.
 */
export async function cancelBooking(bookingId: string, token: string, reason?: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, cancelToken: token },
    include: {
      user: { select: { id: true, nom: true, prenom: true, email: true } },
    },
  });

  if (!booking) {
    throw new NotFoundError('Reservation');
  }

  if (booking.status !== 'confirmed') {
    throw new AppError(400, 'Cette reservation ne peut plus etre annulee.');
  }

  // Delete Google Calendar event if exists
  if (booking.calendarEventId) {
    try {
      const accessToken = await getValidAccessToken(booking.userId);
      const delResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${booking.calendarEventId}?sendUpdates=all`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (delResponse.ok || delResponse.status === 204) {
        console.log(`[Booking] Calendar event ${booking.calendarEventId} deleted`);
      } else {
        console.warn(`[Booking] Could not delete calendar event: ${delResponse.status}`);
      }
    } catch (e) {
      console.error('[Booking] Failed to delete calendar event:', e);
    }
  }

  // Update booking status
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelReason: reason || null,
    },
  });

  // Delete pending reminders
  await prisma.bookingReminder.deleteMany({
    where: { bookingId, status: 'pending' },
  });

  // Notify recruiter
  await notificationService.create({
    userId: booking.userId,
    type: 'SYSTEME',
    titre: 'RDV annule',
    contenu: `${booking.firstName} ${booking.lastName} a annule son RDV du ${booking.bookingDate.toISOString().substring(0, 10)} a ${booking.bookingTime}`,
    entiteType: booking.entityType === 'candidat' ? 'CANDIDAT' : 'CLIENT',
    entiteId: booking.candidatId || booking.clientId || undefined,
  });

  return { success: true, message: 'Reservation annulee avec succes.' };
}

// ─── AUTHENTICATED SERVICE FUNCTIONS ────────────────

/**
 * Get booking settings for the current user.
 */
export async function getBookingSettings(userId: string) {
  const settings = await prisma.bookingSetting.findUnique({
    where: { userId },
  });

  return settings || null;
}

/**
 * Create or update booking settings.
 */
export async function saveBookingSettings(userId: string, input: BookingSettingsInput) {
  // Validate slug
  if (!input.slug || input.slug.length < 3) {
    throw new ValidationError('Le slug doit contenir au moins 3 caracteres.');
  }

  const cleanSlug = slugify(input.slug);

  // Check slug uniqueness (exclude own setting)
  const existing = await prisma.bookingSetting.findUnique({
    where: { slug: cleanSlug },
  });

  if (existing && existing.userId !== userId) {
    throw new ConflictError('Ce slug est deja utilise par un autre utilisateur.');
  }

  // Validate time format
  if (input.startTime && !/^\d{2}:\d{2}$/.test(input.startTime)) {
    throw new ValidationError('Format d\'heure invalide pour startTime. Attendu: HH:MM');
  }
  if (input.endTime && !/^\d{2}:\d{2}$/.test(input.endTime)) {
    throw new ValidationError('Format d\'heure invalide pour endTime. Attendu: HH:MM');
  }

  const settings = await prisma.bookingSetting.upsert({
    where: { userId },
    update: {
      slug: cleanSlug,
      isActive: input.isActive,
      workingDays: input.workingDays,
      startTime: input.startTime,
      endTime: input.endTime,
      slotDuration: input.slotDuration,
      bufferMinutes: input.bufferMinutes,
      minNoticeHours: input.minNoticeHours,
      maxAdvanceDays: input.maxAdvanceDays,
      welcomeMessage: input.welcomeMessage,
      reminderEmail: input.reminderEmail,
      reminderBefore: input.reminderBefore,
    },
    create: {
      userId,
      slug: cleanSlug,
      isActive: input.isActive ?? true,
      workingDays: input.workingDays ?? [1, 2, 3, 4, 5],
      startTime: input.startTime ?? '09:00',
      endTime: input.endTime ?? '18:00',
      slotDuration: input.slotDuration ?? 30,
      bufferMinutes: input.bufferMinutes ?? 15,
      minNoticeHours: input.minNoticeHours ?? 2,
      maxAdvanceDays: input.maxAdvanceDays ?? 30,
      welcomeMessage: input.welcomeMessage,
      reminderEmail: input.reminderEmail ?? true,
      reminderBefore: input.reminderBefore ?? true,
    },
  });

  return settings;
}

/**
 * List bookings for the authenticated recruiter.
 */
export async function listBookings(
  userId: string,
  params: PaginationParams,
  status?: string,
) {
  const where: any = { userId };

  if (status) {
    where.status = status;
  }

  const { skip, take } = paginationToSkipTake(params);

  const [data, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      skip,
      take,
      orderBy: { bookingDate: 'desc' },
      include: {
        mandat: { select: { titrePoste: true, slug: true } },
        candidat: { select: { id: true, nom: true, prenom: true } },
        client: { select: { id: true, nom: true, prenom: true } },
      },
    }),
    prisma.booking.count({ where }),
  ]);

  return paginatedResult(data, total, params);
}

/**
 * Update booking status (completed, no_show).
 */
export async function updateBookingStatus(bookingId: string, userId: string, status: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId },
  });

  if (!booking) {
    throw new NotFoundError('Reservation', bookingId);
  }

  const validStatuses = ['completed', 'no_show', 'confirmed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Statut invalide. Valeurs acceptees: ${validStatuses.join(', ')}`);
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status },
  });

  // If no_show, add a note to the candidat or client
  if (status === 'no_show') {
    const noteContent = `No-show au RDV du ${booking.bookingDate.toISOString().substring(0, 10)} a ${booking.bookingTime}`;

    if (booking.candidatId) {
      const candidat = await prisma.candidat.findUnique({ where: { id: booking.candidatId } });
      if (candidat) {
        const existingNotes = candidat.notes || '';
        await prisma.candidat.update({
          where: { id: booking.candidatId },
          data: { notes: existingNotes + `\n\n--- No-show ---\n${noteContent}` },
        });
      }

      await prisma.activite.create({
        data: {
          type: 'NOTE',
          entiteType: 'CANDIDAT',
          entiteId: booking.candidatId,
          userId,
          titre: 'No-show au RDV',
          contenu: noteContent,
          source: 'SYSTEME',
          metadata: { bookingId: booking.id },
        },
      });
    } else if (booking.clientId) {
      const client = await prisma.client.findUnique({ where: { id: booking.clientId } });
      if (client) {
        const existingNotes = client.notes || '';
        await prisma.client.update({
          where: { id: booking.clientId },
          data: { notes: existingNotes + `\n\n--- No-show ---\n${noteContent}` },
        });
      }

      await prisma.activite.create({
        data: {
          type: 'NOTE',
          entiteType: 'CLIENT',
          entiteId: booking.clientId,
          userId,
          titre: 'No-show au RDV',
          contenu: noteContent,
          source: 'SYSTEME',
          metadata: { bookingId: booking.id },
        },
      });
    }
  }

  return updated;
}

/**
 * Get all active mandats for the user with their booking URLs.
 */
export async function getMandatBookingLinks(userId: string) {
  const setting = await prisma.bookingSetting.findUnique({
    where: { userId },
  });

  if (!setting) {
    return { links: [], message: 'Configurez d\'abord vos parametres de booking.' };
  }

  const mandats = await prisma.mandat.findMany({
    where: {
      OR: [
        { assignedToId: userId },
        { createdById: userId },
      ],
      statut: { in: ['OUVERT', 'EN_COURS'] },
      isBookingPublic: true,
      slug: { not: null },
    },
    select: {
      id: true,
      titrePoste: true,
      slug: true,
      entreprise: { select: { nom: true } },
      statut: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const links = mandats.map((m) => ({
    mandatId: m.id,
    titrePoste: m.titrePoste,
    entreprise: m.entreprise.nom,
    statut: m.statut,
    bookingUrl: `${APP_URL}/booking/${setting.slug}/${m.slug}`,
    directUrl: `${APP_URL}/booking/${setting.slug}`,
  }));

  return {
    recruiterSlug: setting.slug,
    directBookingUrl: `${APP_URL}/booking/${setting.slug}`,
    links,
  };
}
