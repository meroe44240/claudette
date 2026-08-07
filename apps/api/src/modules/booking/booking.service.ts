import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { createEvent, getBusyTimes } from '../integrations/calendar.service.js';

interface AvailabilityWindow { day: number; start: string; end: string } // day 0=dim..6=sam, "HH:MM"

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'moi';
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = slugify(base); let i = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const ex = await prisma.bookingSettings.findUnique({ where: { slug } });
    if (!ex || ex.id === excludeId) return slug;
    slug = `${slugify(base)}-${++i}`;
  }
}

// ── Types de page de réservation (recruteur) ─────────
// Un user peut avoir PLUSIEURS types (Discovery client, Qualification candidat…).
export async function listSettings(userId: string) {
  return prisma.bookingSettings.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
}

// Rétro-compat : renvoie le premier type (ou null)
export async function getSettings(userId: string) {
  return prisma.bookingSettings.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
}

export interface SaveTypeInput {
  id?: string; kind?: string; mandatId?: string | null;
  slug?: string; title?: string; durationMin?: number; timezone?: string;
  availability?: AvailabilityWindow[]; bufferMin?: number; advanceDays?: number; isActive?: boolean;
}

/** Crée (id absent) ou met à jour (id présent) un type de page de réservation. */
export async function saveType(userId: string, data: SaveTypeInput) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { prenom: true, nom: true } });
  const existing = data.id
    ? await prisma.bookingSettings.findFirst({ where: { id: data.id, userId } })
    : null;
  if (data.id && !existing) throw new NotFoundError('Type de réservation', data.id);

  const baseSlug = data.slug || existing?.slug || `${user?.prenom || ''}-${user?.nom || 'moi'}-${data.kind || 'rdv'}`.trim();
  const slug = await uniqueSlug(baseSlug, existing?.id);
  const payload: any = {
    kind: data.kind ?? (existing as any)?.kind ?? 'GENERIC',
    mandatId: data.mandatId !== undefined ? data.mandatId : (existing as any)?.mandatId ?? null,
    slug,
    title: data.title ?? existing?.title ?? 'Prendre rendez-vous',
    durationMin: data.durationMin ?? existing?.durationMin ?? 30,
    timezone: data.timezone ?? existing?.timezone ?? 'Europe/Paris',
    availability: (data.availability ?? existing?.availability ?? []) as any,
    bufferMin: data.bufferMin ?? existing?.bufferMin ?? 0,
    advanceDays: data.advanceDays ?? existing?.advanceDays ?? 14,
    isActive: data.isActive ?? existing?.isActive ?? true,
  };
  if (existing) return prisma.bookingSettings.update({ where: { id: existing.id }, data: payload });
  return prisma.bookingSettings.create({ data: { userId, ...payload } });
}

export async function deleteType(userId: string, id: string) {
  const existing = await prisma.bookingSettings.findFirst({ where: { id, userId } });
  if (!existing) throw new NotFoundError('Type de réservation', id);
  await prisma.bookingSettings.delete({ where: { id } });
  return { deleted: true };
}

// Rétro-compat pour l'ancien PUT /settings (met à jour le 1er type ou en crée un)
export async function upsertSettings(userId: string, data: SaveTypeInput) {
  const first = await prisma.bookingSettings.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
  return saveType(userId, { ...data, id: first?.id });
}

// ── Calcul des créneaux disponibles ─────────────────
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

async function computeSlots(userId: string, settings: any): Promise<string[]> {
  const windows: AvailabilityWindow[] = Array.isArray(settings.availability) ? settings.availability : [];
  if (windows.length === 0) return [];
  const duration = settings.durationMin * 60000;
  const buffer = (settings.bufferMin || 0) * 60000;
  const now = Date.now();
  const horizon = now + settings.advanceDays * 86400000;

  // Créneaux déjà réservés (notre table)
  const booked = await prisma.booking.findMany({
    where: { userId, status: 'CONFIRMED', slotStart: { gte: new Date(now), lte: new Date(horizon) } },
    select: { slotStart: true, slotEnd: true },
  });
  // Occupation Google Calendar (best-effort)
  const busy = await getBusyTimes(userId, new Date(now).toISOString(), new Date(horizon).toISOString());

  const isFree = (start: number, end: number) => {
    for (const b of booked) if (overlaps(start, end, b.slotStart.getTime(), b.slotEnd.getTime())) return false;
    for (const b of busy) if (overlaps(start, end, new Date(b.start).getTime(), new Date(b.end).getTime())) return false;
    return true;
  };

  const slots: string[] = [];
  for (let d = 0; d <= settings.advanceDays; d++) {
    const day = new Date(now + d * 86400000);
    const dow = day.getDay();
    for (const w of windows.filter((x) => x.day === dow)) {
      const [sh, sm] = w.start.split(':').map(Number);
      const [eh, em] = w.end.split(':').map(Number);
      const windowStart = new Date(day); windowStart.setHours(sh, sm, 0, 0);
      const windowEnd = new Date(day); windowEnd.setHours(eh, em, 0, 0);
      for (let t = windowStart.getTime(); t + duration <= windowEnd.getTime(); t += duration + buffer) {
        if (t < now + 3600000) continue; // pas de créneau dans l'heure qui vient
        if (t > horizon) break;
        if (isFree(t, t + duration)) slots.push(new Date(t).toISOString());
      }
    }
  }
  return slots.slice(0, 200);
}

// ── Page publique + création ────────────────────────
export async function getPublicPage(slug: string) {
  const settings = await prisma.bookingSettings.findUnique({ where: { slug } });
  if (!settings || !settings.isActive) throw new NotFoundError('Page de réservation', slug);
  const user = await prisma.user.findUnique({ where: { id: settings.userId }, select: { prenom: true, nom: true, avatarUrl: true } });
  const slots = await computeSlots(settings.userId, settings);
  const mandatId = (settings as any).mandatId as string | null;
  const mandat = mandatId
    ? await prisma.mandat.findUnique({ where: { id: mandatId }, select: { id: true, titrePoste: true, entreprise: { select: { nom: true } } } })
    : null;
  return {
    slug: settings.slug,
    kind: (settings as any).kind ?? 'GENERIC',
    title: settings.title,
    durationMin: settings.durationMin,
    timezone: settings.timezone,
    host: { name: `${user?.prenom ? user.prenom + ' ' : ''}${user?.nom ?? ''}`.trim() || 'HumanUp', avatarUrl: user?.avatarUrl ?? null },
    mandat: mandat ? { id: mandat.id, titrePoste: mandat.titrePoste, entreprise: mandat.entreprise?.nom ?? null } : null,
    slots,
  };
}

export async function createBooking(slug: string, data: { name: string; email: string; note?: string; slotStart: string }) {
  const settings = await prisma.bookingSettings.findUnique({ where: { slug } });
  if (!settings || !settings.isActive) throw new NotFoundError('Page de réservation', slug);
  if (!data.name?.trim() || !data.email?.trim()) throw new ValidationError('Nom et email requis');

  const start = new Date(data.slotStart);
  if (isNaN(start.getTime())) throw new ValidationError('Créneau invalide');
  const end = new Date(start.getTime() + settings.durationMin * 60000);
  if (start.getTime() < Date.now()) throw new ValidationError('Ce créneau est passé');

  // Vérifie que le créneau est toujours libre
  const conflict = await prisma.booking.findFirst({
    where: { userId: settings.userId, status: 'CONFIRMED', slotStart: { lt: end }, slotEnd: { gt: start } },
  });
  if (conflict) throw new ValidationError('Ce créneau vient d\'être réservé — choisissez-en un autre.');

  // Rattache à un candidat existant si l'email matche
  const candidat = await prisma.candidat.findFirst({ where: { email: { equals: data.email.trim(), mode: 'insensitive' } }, select: { id: true } });

  // Crée l'événement Google Calendar (invitation auto au candidat) + lien Meet
  const host = await prisma.user.findUnique({ where: { id: settings.userId }, select: { prenom: true, nom: true } });
  let meetLink: string | null = null;
  let googleEventId: string | null = null;
  try {
    const ev: any = await createEvent(settings.userId, {
      summary: `${settings.title} — ${data.name}`,
      description: `Réservé via la page de réservation HumanUp.${data.note ? `\n\nMessage : ${data.note}` : ''}`,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      attendees: [data.email.trim()],
      entiteType: candidat ? 'CANDIDAT' : undefined,
      entiteId: candidat?.id,
      withMeet: true,
    });
    meetLink = ev?.meetLink ?? null;
    googleEventId = ev?.googleEventId ?? null;
  } catch (e) {
    // Le calendrier peut ne pas être connecté — on enregistre quand même la résa.
    console.warn('[Booking] createEvent a échoué (calendrier non connecté ?)', (e as Error).message);
  }

  const booking = await prisma.booking.create({
    data: {
      userId: settings.userId,
      slotStart: start, slotEnd: end,
      inviteeName: data.name.trim(), inviteeEmail: data.email.trim(),
      inviteeNote: data.note?.trim() || null,
      meetLink, googleEventId,
      candidatId: candidat?.id ?? null,
    },
  });

  // Qualification liée à un mandat + candidat identifié → rattache le candidat au mandat
  const qualMandatId = (settings as any).kind === 'QUALIFICATION' ? ((settings as any).mandatId as string | null) : null;
  if (qualMandatId && candidat?.id) {
    try {
      const already = await prisma.candidature.findFirst({ where: { mandatId: qualMandatId, candidatId: candidat.id }, select: { id: true } });
      if (!already) {
        await prisma.candidature.create({ data: { mandatId: qualMandatId, candidatId: candidat.id, stage: 'CONTACTE', createdById: settings.userId } });
      }
    } catch (e) {
      console.warn('[Booking] rattachement candidat->mandat échoué', (e as Error).message);
    }
  }

  return {
    id: booking.id,
    slotStart: start.toISOString(),
    slotEnd: end.toISOString(),
    meetLink,
    hostName: `${host?.prenom ? host.prenom + ' ' : ''}${host?.nom ?? ''}`.trim() || 'HumanUp',
    message: meetLink
      ? 'Réservation confirmée. Vous recevez une invitation par email avec le lien Google Meet.'
      : 'Réservation confirmée. Vous recevez une confirmation par email.',
  };
}

// ── ATS : mes réservations ──────────────────────────
export async function listMyBookings(userId: string) {
  return prisma.booking.findMany({
    where: { userId, slotStart: { gte: new Date(Date.now() - 86400000) } },
    orderBy: { slotStart: 'asc' },
    take: 100,
  });
}
