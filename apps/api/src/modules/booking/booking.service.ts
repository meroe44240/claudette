import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { createEvent, getBusyTimes } from '../integrations/calendar.service.js';
import { sendRawEmail } from '../integrations/gmail.service.js';
import { isPersonalEmail } from '../integrations/allo.service.js';

interface AvailabilityWindow { day: number; start: string; end: string } // day 0=dim..6=sam, "HH:MM"

// ── Emails de confirmation (envoyés via le Gmail connecté du recruteur) ──
const escHtml = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]));
const firstNameOf = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';
function fmtDateFr(d: Date): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(d);
  } catch { return d.toISOString(); }
}
const emailShell = (inner: string) => `<div style="background:#EDEDF2;padding:28px 12px;font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(34,23,122,.12)">
<div style="background:#22177A;padding:26px 32px">
  <div style="font-family:'Archivo Black',Arial Black,sans-serif;font-weight:800;font-size:19px;letter-spacing:.02em;color:#E6E9AF">HUMANUP</div>
  <div style="font-size:10px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:rgba(230,233,175,.6);margin-top:5px">Recruitment Agency · humanup.io</div>
</div>
${inner}
<div style="padding:18px 32px 26px;border-top:1px solid #ECECF3;color:#9A96AE;font-size:12px;line-height:1.6">
  Hong Kong · Canada · <a href="https://humanup.io" style="color:#8A8699;text-decoration:none">humanup.io</a><br/>
  Une question ? Répondez simplement à cet email.
</div></div></div>`;

function clientBookingEmail(o: { name: string; dateStr: string; meetLink: string | null; hostName: string; note?: string | null }): string {
  const recap = String(o.note || '').split('\n').filter(Boolean)
    .map((l) => `<tr><td style="padding:3px 0;font-size:14px;color:#312C4A">${escHtml(l)}</td></tr>`).join('');
  return emailShell(`<div style="padding:30px 32px 8px">
  <div style="font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#8A7F5A">Rendez-vous confirmé</div>
  <h1 style="font-family:'Archivo Black',Arial Black,sans-serif;font-size:23px;color:#1A1533;margin:8px 0 14px;line-height:1.15">Bonjour ${escHtml(firstNameOf(o.name))}, c'est confirmé.</h1>
  <p style="font-size:15px;line-height:1.65;color:#312C4A;margin:0 0 18px">Merci d'avoir réservé un premier échange avec HumanUp. On a hâte d'échanger sur votre projet de recrutement.</p>
  <div style="background:#F7F7EE;border-left:3px solid #E6E9AF;border-radius:4px;padding:14px 18px;margin:0 0 18px">
    <div style="font-size:13px;color:#8A7F5A;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Votre créneau</div>
    <div style="font-size:16px;font-weight:700;color:#22177A;text-transform:capitalize">${escHtml(o.dateStr)}</div>
    <div style="font-size:13px;color:#6E6A85;margin-top:2px">Échange de 30–45 min${o.hostName ? ` avec ${escHtml(o.hostName)}` : ''} · en visio</div>
  </div>
  ${o.meetLink ? `<a href="${escHtml(o.meetLink)}" style="display:inline-block;background:#22177A;color:#E6E9AF;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:11px">Rejoindre le Google Meet</a>
  <div style="font-size:12px;color:#9A96AE;margin:8px 0 20px">Le lien est aussi dans l'invitation agenda que vous venez de recevoir.</div>` : `<div style="font-size:13px;color:#6E6A85;margin-bottom:20px">Vous recevez le lien de visio dans l'invitation agenda.</div>`}
  <div style="font-family:'Archivo Black',Arial Black,sans-serif;font-size:14px;color:#22177A;margin:6px 0 8px">Le but de cet échange</div>
  <p style="font-size:14px;line-height:1.65;color:#312C4A;margin:0 0 6px">30 minutes pour <b>cadrer le poste</b> : le problème à résoudre, le profil idéal, le contexte et l'échéance. On part de votre enjeu réel, pas d'une liste de compétences.</p>
  <p style="font-size:14px;line-height:1.65;color:#312C4A;margin:0 0 18px">Sans engagement — si un autre acteur est plus adapté, on vous le dit. À la fin, vous repartez avec une lecture claire de votre marché.</p>
  ${recap ? `<div style="font-family:'Archivo Black',Arial Black,sans-serif;font-size:14px;color:#22177A;margin:0 0 6px">Ce qu'on a noté</div>
  <table style="width:100%;border-collapse:collapse;margin:0 0 6px">${recap}</table>` : ''}
</div>`);
}

function recruiterBookingEmail(o: { name: string; email: string; dateStr: string; meetLink: string | null; note?: string | null }): string {
  const rows = ([['Contact', o.name], ['Email', o.email], ['Créneau', o.dateStr]] as [string, string][])
    .concat(String(o.note || '').split('\n').filter(Boolean).map((l) => { const i = l.indexOf(':'); return (i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : ['Info', l]) as [string, string]; }))
    .map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;font-size:13px;color:#8A8699;white-space:nowrap;vertical-align:top">${escHtml(k)}</td><td style="padding:6px 0;font-size:14px;color:#1A1533;font-weight:600">${escHtml(v)}</td></tr>`).join('');
  return emailShell(`<div style="padding:28px 32px 10px">
  <div style="font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#8A7F5A">Nouveau rendez-vous</div>
  <h1 style="font-family:'Archivo Black',Arial Black,sans-serif;font-size:21px;color:#1A1533;margin:8px 0 16px">${escHtml(o.name)} a réservé un échange</h1>
  <table style="width:100%;border-collapse:collapse;margin:0 0 16px">${rows}</table>
  ${o.meetLink ? `<a href="${escHtml(o.meetLink)}" style="display:inline-block;background:#22177A;color:#E6E9AF;text-decoration:none;font-weight:700;font-size:14px;padding:11px 18px;border-radius:10px">Ouvrir le Google Meet</a>` : ''}
  <p style="font-size:12px;color:#9A96AE;margin:16px 0 0">L'événement est dans votre Google Agenda.</p>
</div>`);
}

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

export async function createBooking(slug: string, data: {
  name: string; email: string; note?: string; slotStart: string;
  poste?: string; societe?: string; phone?: string; roleHiring?: string; timeline?: string;
}) {
  const settings = await prisma.bookingSettings.findUnique({ where: { slug } });
  if (!settings || !settings.isActive) throw new NotFoundError('Page de réservation', slug);
  if (!data.name?.trim() || !data.email?.trim()) throw new ValidationError('Nom et email requis');

  // Un Discovery call (client) exige un email PRO — les adresses perso sont refusées.
  const kind = (settings as any).kind ?? 'GENERIC';
  if (kind === 'DISCOVERY' && isPersonalEmail(data.email.trim())) {
    throw new ValidationError('Merci d’utiliser votre email professionnel (une adresse gmail/générique ne permet pas de réserver).');
  }

  // Note enrichie avec les réponses d'intake
  const intakeNote = [
    data.poste ? `Poste : ${data.poste}` : '',
    data.societe ? `Société : ${data.societe}` : '',
    data.phone ? `Téléphone : ${data.phone}` : '',
    data.roleHiring ? `Recrute pour / poste : ${data.roleHiring}` : '',
    data.timeline ? `Échéance : ${data.timeline}` : '',
    data.note?.trim() ? `Message : ${data.note.trim()}` : '',
  ].filter(Boolean).join('\n') || null;

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
  const host = await prisma.user.findUnique({ where: { id: settings.userId }, select: { prenom: true, nom: true, email: true } });
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
      inviteeNote: intakeNote,
      meetLink, googleEventId,
      candidatId: candidat?.id ?? null,
    },
  });

  // Emails de confirmation (envoyés depuis le Gmail connecté du recruteur — best-effort).
  const hostName = `${host?.prenom ? host.prenom + ' ' : ''}${host?.nom ?? ''}`.trim() || 'HumanUp';
  const dateStr = fmtDateFr(start);
  try {
    await sendRawEmail(settings.userId, {
      to: data.email.trim(),
      subject: 'Votre rendez-vous avec HumanUp est confirmé',
      body: `Bonjour ${firstNameOf(data.name)},\n\nVotre échange avec HumanUp est confirmé : ${dateStr}.${meetLink ? `\nLien Google Meet : ${meetLink}` : ''}\n\nÀ très vite,\n${hostName}`,
      htmlBody: clientBookingEmail({ name: data.name, dateStr, meetLink, hostName, note: intakeNote }),
    });
  } catch (e) { console.warn('[Booking] email client échoué', (e as Error).message); }
  if (host?.email) {
    try {
      await sendRawEmail(settings.userId, {
        to: host.email,
        subject: `Nouveau RDV — ${data.name}${data.societe ? ' · ' + data.societe : ''}`,
        body: `${data.name} (${data.email}) a réservé un échange le ${dateStr}.${intakeNote ? `\n\n${intakeNote}` : ''}${meetLink ? `\n\nMeet : ${meetLink}` : ''}`,
        htmlBody: recruiterBookingEmail({ name: data.name, email: data.email.trim(), dateStr, meetLink, note: intakeNote }),
      });
    } catch (e) { console.warn('[Booking] email recruteur échoué', (e as Error).message); }
  }

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
