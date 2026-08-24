import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { createEvent, getBusyTimes } from '../integrations/calendar.service.js';
import { sendRawEmail } from '../integrations/gmail.service.js';
import * as leadService from '../leads/lead.service.js';
import { isPersonalEmail } from '../integrations/allo.service.js';

interface AvailabilityWindow { day: number; start: string; end: string } // day 0=dim..6=sam, "HH:MM"

// ── Emails de confirmation (envoyés via le Gmail connecté du recruteur) ──
// Design email-safe (pack_emails) : tables, Arial, URLs absolues, contrastes WCAG.
const IMG_BASE = 'https://ats.propium.co/brand/';
const escHtml = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]));
const firstNameOf = (n: string) => String(n || '').trim().split(/\s+/)[0] || '';
const capFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function dateLines(d: Date): { l1: string; l2: string } {
  try {
    const l1 = capFirst(new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(d));
    const l2 = 'à ' + new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(d);
    return { l1, l2 };
  } catch { return { l1: d.toISOString(), l2: '' }; }
}

interface ClientEmailData {
  name: string; dateL1: string; dateL2: string; durationMin: number; meetLink: string | null;
  hostName: string; hostTitle: string; hostPhone: string | null; hostEmail: string; hostPhotoUrl: string | null; note?: string | null;
}
function clientBookingEmail(o: ClientEmailData): string {
  const reschedule = `mailto:${o.hostEmail}?subject=${encodeURIComponent('Décaler mon rendez-vous')}`;
  const cancel = `mailto:${o.hostEmail}?subject=${encodeURIComponent('Annuler mon rendez-vous')}`;
  const noteLines = String(o.note || '').split('\n').filter(Boolean);
  const noteRows = noteLines.map((l, i) => {
    const idx = l.indexOf(':'); const k = idx > 0 ? l.slice(0, idx).trim() : 'Info'; const v = idx > 0 ? l.slice(idx + 1).trim() : l;
    const bb = i < noteLines.length - 1 ? 'border-bottom:1px solid #eceaf4' : '';
    return `<tr><td style="width:88px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#6E6A85;padding:8px 0;${bb}">${escHtml(k)}</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#1A1533;padding:8px 0;${bb}">${escHtml(v)}</td></tr>`;
  }).join('');
  const photo = o.hostPhotoUrl ? `<img src="${escHtml(o.hostPhotoUrl)}" width="38" height="38" alt="" style="width:38px;height:38px;border-radius:50%;display:inline-block;vertical-align:middle">` : '';
  return `<div style="background:#EDEDF2;padding:24px 10px;font-family:Arial,Helvetica,sans-serif">
<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;max-width:600px;margin:0 auto;background:#FCFCF5;border-radius:18px;overflow:hidden">
 <tr><td style="background:#22177A;padding:26px 32px 24px;border-bottom:3px solid #E6E9AF">
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%"><tr>
   <td style="vertical-align:middle">
    <img src="${IMG_BASE}logo-mark-cream.png" width="30" alt="" style="width:30px;display:inline-block;vertical-align:middle">
    <span style="display:inline-block;vertical-align:middle;padding-left:10px">
     <span style="display:block;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;letter-spacing:.5px;color:#E6E9AF;line-height:1">HUMANUP</span>
     <span style="display:block;font-family:Arial,Helvetica,sans-serif;font-size:8px;font-weight:bold;letter-spacing:2.6px;text-transform:uppercase;color:#b9bb96;padding-top:5px">Recruitment Agency</span>
    </span>
   </td>
   <td style="vertical-align:middle;text-align:right"><a href="https://humanup.io" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:#E6E9AF;text-decoration:none">humanup.io</a></td>
  </tr></table>
 </td></tr>
 <tr><td style="padding:34px 32px 0">
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;letter-spacing:2.2px;text-transform:uppercase;color:#6E6A85">Rendez-vous confirmé</div>
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:bold;line-height:1.08;color:#1A1533;padding-top:11px">Bonjour ${escHtml(firstNameOf(o.name))},<br>c'est confirmé.</div>
  <p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;color:#4A4568;padding-top:12px">Merci d'avoir réservé un premier échange avec HumanUp. On a hâte d'échanger sur votre projet de recrutement.</p>
 </td></tr>
 <tr><td style="padding:24px 32px 0">
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;background:#22177A;border-radius:16px"><tr>
   <td style="padding:24px 26px">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:9.5px;font-weight:bold;letter-spacing:2.4px;text-transform:uppercase;color:#b9bb96">Votre créneau</div>
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:bold;line-height:1.1;color:#E6E9AF;padding-top:11px">${escHtml(o.dateL1)}<br>${escHtml(o.dateL2)}</div>
    <div style="border-top:1px solid #3a2f8a;margin-top:15px;padding-top:12px;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;color:#b9bb96">${o.durationMin} minutes en visio avec <strong style="color:#ffffff">${escHtml(o.hostName)}</strong></div>
   </td>
  </tr></table>
 </td></tr>
 <tr><td style="padding:22px 32px 0">
  ${o.meetLink ? `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="background:#E6E9AF;border-radius:11px"><a href="${escHtml(o.meetLink)}" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:.2px;color:#22177A;text-decoration:none;padding:16px 32px">Rejoindre le Google Meet</a></td></tr></table>` : ''}
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:12px"><tr>
   <td style="padding-right:8px"><a href="${reschedule}" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;font-weight:bold;color:#22177A;text-decoration:none;border:1px solid #9a95c1;border-radius:11px;padding:10px 16px">Décaler le rendez-vous</a></td>
   <td><a href="${cancel}" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:12.5px;font-weight:bold;color:#4A4568;text-decoration:none;border:1px solid #9a95c1;border-radius:11px;padding:10px 16px">Annuler</a></td>
  </tr></table>
  <p style="font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#4A4568;padding-top:12px">Le lien est aussi dans l'invitation agenda que vous venez de recevoir.</p>
 </td></tr>
 <tr><td style="padding:28px 32px 0">
  <div style="border-top:1px solid #dcdaea;padding-top:20px">
   <div style="display:inline-block;background:#E6E9AF;border-radius:999px;padding:5px 12px;font-family:Arial,Helvetica,sans-serif;font-size:9.5px;font-weight:bold;letter-spacing:2.2px;text-transform:uppercase;color:#22177A">Le but de l'appel</div>
   <p style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.65;color:#4A4568;padding-top:11px">Le but est de <strong style="color:#1A1533">bien comprendre votre entreprise et le poste</strong> : votre contexte, ce que la personne devra réellement accomplir, l'équipe qu'elle rejoint et l'échéance.</p>
   <p style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.65;color:#4A4568;padding-top:10px">Sans engagement. Si un autre acteur est plus adapté, on vous le dit. À la fin, vous repartez avec une lecture claire de votre marché.</p>
  </div>
 </td></tr>
 ${noteRows ? `<tr><td style="padding:26px 32px 0">
  <div style="border-top:1px solid #dcdaea;padding-top:18px">
   <div style="display:inline-block;background:#E6E9AF;border-radius:999px;padding:5px 12px;font-family:Arial,Helvetica,sans-serif;font-size:9.5px;font-weight:bold;letter-spacing:2.2px;text-transform:uppercase;color:#22177A">Ce qu'on a noté</div>
   <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin-top:6px">${noteRows}</table>
  </div>
 </td></tr>` : ''}
 <tr><td style="padding:28px 0 0">
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;background:#22177A">
   <tr><td style="padding:24px 32px 20px;border-top:3px solid #E6E9AF">
    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%"><tr>
     <td style="vertical-align:middle">${photo}<span style="display:inline-block;vertical-align:middle;${photo ? 'padding-left:11px' : ''}">
       <span style="display:block;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;font-weight:bold;color:#ffffff">${escHtml(o.hostName)}</span>
       <span style="display:block;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#E6E9AF;padding-top:3px">${escHtml(o.hostTitle)}</span>
      </span></td>
     <td style="vertical-align:middle;text-align:right">
      ${o.hostPhone ? `<a href="tel:${escHtml(o.hostPhone)}" style="display:block;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#E6E9AF;text-decoration:none">${escHtml(o.hostPhone)}</a>` : ''}
      <a href="mailto:${escHtml(o.hostEmail)}" style="display:block;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#b9bb96;text-decoration:none;padding-top:3px">${escHtml(o.hostEmail)}</a>
     </td>
    </tr></table>
   </td></tr>
   <tr><td style="padding:0 32px 22px">
    <div style="border-top:1px solid #3a2f8a;padding-top:13px;text-align:center">
     <a href="https://humanup.io" style="font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;letter-spacing:2.4px;text-transform:uppercase;color:#E6E9AF;text-decoration:none">humanup.io</a>
     <div style="font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#b9bb96;padding-top:7px">Une question ? Répondez simplement à cet email.</div>
    </div>
   </td></tr>
  </table>
 </td></tr>
</table></div>`;
}

function recruiterBookingEmail(o: { name: string; email: string; dateL1: string; dateL2: string; meetLink: string | null; note?: string | null }): string {
  const rows = ([['Contact', o.name], ['Email', o.email], ['Créneau', `${o.dateL1} ${o.dateL2}`]] as [string, string][])
    .concat(String(o.note || '').split('\n').filter(Boolean).map((l) => { const i = l.indexOf(':'); return (i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : ['Info', l]) as [string, string]; }))
    .map(([k, v]) => `<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#6E6A85;padding:7px 14px 7px 0;white-space:nowrap;vertical-align:top">${escHtml(k)}</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:13.5px;color:#1A1533;font-weight:bold;padding:7px 0">${escHtml(v)}</td></tr>`).join('');
  return `<div style="background:#EDEDF2;padding:24px 10px;font-family:Arial,Helvetica,sans-serif">
<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;max-width:600px;margin:0 auto;background:#FCFCF5;border-radius:18px;overflow:hidden">
 <tr><td style="background:#22177A;padding:22px 30px;border-bottom:3px solid #E6E9AF">
  <span style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;letter-spacing:.5px;color:#E6E9AF">HUMANUP</span>
  <span style="font-family:Arial,Helvetica,sans-serif;font-size:8px;font-weight:bold;letter-spacing:2.4px;text-transform:uppercase;color:#b9bb96;padding-left:10px">Nouveau rendez-vous</span>
 </td></tr>
 <tr><td style="padding:28px 30px 6px">
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:21px;font-weight:bold;color:#1A1533">${escHtml(o.name)} a réservé un échange</div>
  <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin-top:14px">${rows}</table>
 </td></tr>
 <tr><td style="padding:8px 30px 28px">
  ${o.meetLink ? `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="background:#E6E9AF;border-radius:11px"><a href="${escHtml(o.meetLink)}" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;font-weight:bold;color:#22177A;text-decoration:none;padding:13px 24px">Ouvrir le Google Meet</a></td></tr></table>` : ''}
  <p style="font-family:Arial,Helvetica,sans-serif;font-size:11.5px;color:#4A4568;padding-top:14px">L'événement est dans votre Google Agenda. Répondez à cet email pour écrire au client.</p>
 </td></tr>
</table></div>`;
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
// Type effectif d'un RDV : le kind explicite, sinon dérivé de la fonction du host.
// Sales / admin → Discovery call ; Recruteur → Qualification.
function effectiveKind(kind: string | null | undefined, fonction?: string | null): string {
  if (kind && kind !== 'GENERIC') return kind;
  return fonction === 'RECRUTEUR' ? 'QUALIFICATION' : 'DISCOVERY';
}

export async function getPublicPage(slug: string) {
  const settings = await prisma.bookingSettings.findUnique({ where: { slug } });
  if (!settings || !settings.isActive) throw new NotFoundError('Page de réservation', slug);
  const user = await prisma.user.findUnique({ where: { id: settings.userId }, select: { prenom: true, nom: true, avatarUrl: true, avatarData: true, fonction: true } as any }) as any;
  const slots = await computeSlots(settings.userId, settings);
  const mandatId = (settings as any).mandatId as string | null;
  const mandat = mandatId
    ? await prisma.mandat.findUnique({ where: { id: mandatId }, select: { id: true, titrePoste: true, entreprise: { select: { nom: true } } } })
    : null;
  const kind = effectiveKind((settings as any).kind, user?.fonction);
  return {
    slug: settings.slug,
    kind,
    title: settings.title,
    durationMin: settings.durationMin,
    timezone: settings.timezone,
    host: {
      name: `${user?.prenom ? user.prenom + ' ' : ''}${user?.nom ?? ''}`.trim() || 'HumanUp',
      avatarUrl: user?.avatarUrl ?? user?.avatarData ?? null,
    },
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

  // Type effectif (dérivé de la fonction du host si non défini explicitement).
  const hostUser = await prisma.user.findUnique({ where: { id: settings.userId }, select: { fonction: true } as any }) as any;
  const kind = effectiveKind((settings as any).kind, hostUser?.fonction);
  // Un Discovery call (client) exige un email PRO — les adresses perso sont refusées.
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
  const host = await prisma.user.findUnique({ where: { id: settings.userId }, select: { prenom: true, nom: true, email: true, telephone: true, avatarUrl: true } as any }) as any;
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
  const { l1: dateL1, l2: dateL2 } = dateLines(start);
  const hostPhotoUrl = typeof host?.avatarUrl === 'string' && host.avatarUrl.startsWith('http') ? host.avatarUrl : null;
  // Récap propre : la note du site est déjà formatée "Label : Valeur" par ligne.
  const recapNote = (data.note && data.note.includes(':')) ? data.note.trim() : intakeNote;
  try {
    await sendRawEmail(settings.userId, {
      to: data.email.trim(),
      subject: 'Votre rendez-vous avec HumanUp est confirmé',
      body: `Bonjour ${firstNameOf(data.name)},\n\nVotre échange avec HumanUp est confirmé : ${dateL1} ${dateL2}.${meetLink ? `\nLien Google Meet : ${meetLink}` : ''}\n\nÀ très vite,\n${hostName}`,
      htmlBody: clientBookingEmail({
        name: data.name, dateL1, dateL2, durationMin: settings.durationMin, meetLink,
        hostName, hostTitle: 'International Recruiter', hostPhone: host?.telephone ?? null, hostEmail: host?.email ?? 'meroe@humanup.io', hostPhotoUrl, note: recapNote,
      }),
    });
  } catch (e) { console.warn('[Booking] email client échoué', (e as Error).message); }
  if (host?.email) {
    try {
      await sendRawEmail(settings.userId, {
        to: host.email,
        subject: `Nouveau RDV — ${data.name}${data.societe ? ' · ' + data.societe : ''}`,
        body: `${data.name} (${data.email}) a réservé un échange le ${dateL1} ${dateL2}.${intakeNote ? `\n\n${intakeNote}` : ''}${meetLink ? `\n\nMeet : ${meetLink}` : ''}`,
        htmlBody: recruiterBookingEmail({ name: data.name, email: data.email.trim(), dateL1, dateL2, meetLink, note: recapNote }),
      });
    } catch (e) { console.warn('[Booking] email recruteur échoué', (e as Error).message); }
  }

  // Discovery (entreprise qui recrute) → crée/enrichit un LEAD au stade "rdv" dans le CRM.
  if (kind === 'DISCOVERY') {
    try {
      // On parse la note brute du site ("Société : …\nFonction du contact : …\n…").
      const rawNote = (data.note || '').trim();
      const map: Record<string, string> = {};
      for (const line of rawNote.split('\n')) { const i = line.indexOf(':'); if (i > 0) map[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
      const interactionText = `RDV réservé : ${dateL1} ${dateL2}${meetLink ? ` · ${meetLink}` : ''}${rawNote ? `\n${rawNote}` : ''}`;
      const existing = await prisma.lead.findFirst({ where: { email: { equals: data.email.trim(), mode: 'insensitive' } }, select: { id: true } });
      if (existing) {
        await leadService.addInteraction(existing.id, 'note', interactionText, settings.userId);
        await prisma.lead.update({ where: { id: existing.id }, data: { lastContactAt: new Date() } });
      } else {
        const lead = await leadService.createLead({
          company: map['Société'] || data.societe || data.name.trim(),
          contact: data.name.trim(),
          role: map['Fonction du contact'] || null,
          sector: map['Secteur'] || null,
          phone: map['Tél'] || data.phone || null,
          email: data.email.trim(),
          source: 'Prise de RDV (site)',
          src: 'cold',
          stage: 'rdv',
          ownerId: settings.userId,
        });
        await leadService.addInteraction(lead.id, 'note', interactionText, settings.userId);
      }
    } catch (e) { console.warn('[Booking] création lead échouée', (e as Error).message); }
  }

  // Qualification liée à un mandat + candidat identifié → rattache le candidat au mandat
  const qualMandatId = kind === 'QUALIFICATION' ? ((settings as any).mandatId as string | null) : null;
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
