// Emails Humanup Notes : notes après le call, rappel 30 min avant, et email du
// soir (récap de la journée + préparation des meetings du lendemain).
import prisma from '../../lib/db.js';
import { escapeHtml, renderBrandedEmail, sendEmail } from '../../lib/mailer.js';
import { appUrl, CALL_TYPE_LABEL, CALL_TYPES, type Attendee, type CallType, type NoteQuestion, type PropiumLink } from './notes.types.js';

const FROM = () => process.env.NOTES_FROM || undefined;
const C = { muted: '#6e6a85', border: '#eceaf2', primary: '#22177A', warn: '#b45309', soft: '#f6f5fb' };

function fmtTime(d: Date, tz: string): string {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz });
}

async function recipients(call: { userId: string; memberIds: string[] }) {
  const ids = [call.userId, ...(call.memberIds || [])];
  return prisma.user.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { id: true, email: true, prenom: true } });
}

/** Mini rendu Markdown (titres ##, puces, gras) pour les notes générées. */
export function mdToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inList = false;
  const inline = (s: string) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^- /.test(line)) {
      if (!inList) { out.push('<ul style="margin:6px 0 12px 18px;padding:0;">'); inList = true; }
      out.push(`<li style="margin:3px 0;">${inline(line.slice(2))}</li>`);
      continue;
    }
    if (inList) { out.push('</ul>'); inList = false; }
    if (/^# /.test(line)) continue; // le titre est déjà dans l'en-tête
    if (/^## /.test(line)) out.push(`<h3 style="margin:18px 0 6px 0;font-size:15px;color:${C.primary};">${inline(line.slice(3))}</h3>`);
    else if (line.trim()) out.push(`<p style="margin:4px 0;">${inline(line)}</p>`);
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

function linksHtml(links: PropiumLink[]): string {
  if (!links.length) return '';
  const label = (l: PropiumLink) => `${l.action === 'created' ? 'Créé' : 'Mis à jour'} : ${{ CANDIDAT: 'candidat', CLIENT: 'client', MANDAT: 'mandat', LEAD: 'lead', TACHE: 'tâche' }[l.kind]}`;
  return `<div style="margin-top:20px;padding:14px 16px;background:${C.soft};border-radius:10px;">
    <div style="font-weight:600;margin-bottom:6px;">Dans Propium</div>
    ${links.map((l) => `<div style="margin:3px 0;">${escapeHtml(label(l))} · <a href="${escapeHtml(l.url)}" style="color:${C.primary};">${escapeHtml(l.label)}</a></div>`).join('')}
  </div>`;
}

// ─── Notes après le call ─────────────────────────────

export async function sendNotesEmail(call: any): Promise<void> {
  const to = await recipients(call);
  if (!to.length) return;
  const links = (call.propiumLinks as PropiumLink[]) || [];
  const mainLink = links.find((l) => l.kind !== 'TACHE');
  const dups = (call.duplicateFlags as any[]) || [];
  const body = `
    <p style="margin:0 0 12px 0;color:${C.muted};">${escapeHtml(CALL_TYPE_LABEL[call.callType as CallType])} · ${escapeHtml(new Date(call.startAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }))}</p>
    ${mdToHtml(call.notesMarkdown || '')}
    ${linksHtml(links)}
    ${dups.length ? `<p style="margin-top:14px;color:${C.warn};">À vérifier : ${dups.map((d) => escapeHtml(d.reason)).join(' ')}</p>` : ''}`;
  const html = renderBrandedEmail({
    title: `Notes : ${call.titre || 'call visio'}`,
    bodyHtml: body,
    cta: mainLink ? { label: 'Ouvrir la fiche Propium', href: mainLink.url } : { label: 'Voir le call', href: `${appUrl()}/notes/${call.id}` },
  });
  for (const u of to) await sendEmail(u.email, `Notes : ${call.titre || 'call visio'}`, html, call.notesMarkdown || undefined, { from: FROM() });
}

// ─── Rappel 30 min avant (qualif / intake sans brief) ─

export async function sendReminderEmail(call: any, missing: string[]): Promise<void> {
  const to = await recipients(call);
  if (!to.length) return;
  const tz = (await prisma.noteUserSettings.findUnique({ where: { userId: call.userId } }))?.timezone || 'Europe/Paris';
  const body = `
    <p>Ton call <strong>${escapeHtml(call.titre)}</strong> commence à ${fmtTime(new Date(call.startAt), tz)} et rien n'est encore chargé : ${escapeHtml(missing.join(', ') || 'brief')}.</p>
    <p>Sans brief, le template « ${escapeHtml(CALL_TYPE_LABEL[call.callType as CallType])} » s'applique.</p>
    <p>Le panneau live du call : <a href="${appUrl()}/notes/live/${call.id}" style="color:${C.primary};">${appUrl()}/notes/live/${call.id}</a></p>`;
  const html = renderBrandedEmail({ title: 'Brief à charger', bodyHtml: body, cta: { label: 'Charger le brief', href: `${appUrl()}/notes/${call.id}` } });
  for (const u of to) await sendEmail(u.email, `Rappel : brief à charger pour ${call.titre}`, html, undefined, { from: FROM() });
}

// ─── Email du soir (19h) ─────────────────────────────

interface DayData {
  today: any[];
  tomorrow: any[];
  tasksTomorrow: { titre: string | null; tacheDueDate: Date | null }[];
}

function todaySection(calls: any[]): string {
  if (!calls.length) return `<p style="color:${C.muted};">Aucun call visio aujourd'hui.</p>`;
  const counts = CALL_TYPES.map((t) => [t, calls.filter((c) => c.callType === t).length] as const).filter(([, n]) => n > 0);
  const people = calls.flatMap((c) => ((c.propiumLinks as PropiumLink[]) || []).filter((l) => l.kind !== 'TACHE'));
  const dbs = calls
    .map((c) => ({ c, q: ((c.questions as NoteQuestion[]) || []).filter((q) => q.dealbreaker && q.status !== 'covered') }))
    .filter((x) => x.q.length && x.c.status === 'DONE');
  const dups = calls.flatMap((c) => (c.duplicateFlags as any[]) || []);
  const failed = calls.filter((c) => c.status === 'FAILED');
  return `
    <p><strong>${calls.length} call${calls.length > 1 ? 's' : ''}</strong> : ${counts.map(([t, n]) => `${n} ${escapeHtml(CALL_TYPE_LABEL[t].toLowerCase())}`).join(', ')}.</p>
    ${people.length ? `<h3 style="margin:16px 0 6px 0;font-size:15px;">Fiches créées ou mises à jour</h3>${people.map((l) => `<div>${l.action === 'created' ? 'Créé' : 'Mis à jour'} · <a href="${escapeHtml(l.url)}" style="color:${C.primary};">${escapeHtml(l.label)}</a></div>`).join('')}` : ''}
    ${dbs.length ? `<h3 style="margin:16px 0 6px 0;font-size:15px;">Dealbreakers restés sans réponse</h3>${dbs.map((x) => `<div style="margin-bottom:6px;"><a href="${appUrl()}/notes/${x.c.id}" style="color:${C.primary};">${escapeHtml(x.c.titre)}</a><ul style="margin:2px 0 0 18px;padding:0;">${x.q.map((q) => `<li>${escapeHtml(q.text)}</li>`).join('')}</ul></div>`).join('')}` : ''}
    ${dups.length ? `<h3 style="margin:16px 0 6px 0;font-size:15px;color:${C.warn};">Doublons possibles à vérifier</h3>${dups.map((d) => `<div><a href="${escapeHtml(d.url)}" style="color:${C.primary};">${escapeHtml(d.label)}</a> : ${escapeHtml(d.reason)}</div>`).join('')}` : ''}
    ${failed.length ? `<p style="color:${C.warn};margin-top:12px;">${failed.length} call${failed.length > 1 ? 's' : ''} sans notes : ${failed.map((c) => escapeHtml(c.titre)).join(', ')}.</p>` : ''}`;
}

function tomorrowSection(calls: any[], tz: string): string {
  if (!calls.length) return `<p style="color:${C.muted};">Aucun meeting visio demain.</p>`;
  return calls.map((c) => {
    const att = ((c.attendees as Attendee[]) || []).filter((a) => a.role !== 'internal').map((a) => a.name || a.email).join(', ') || 'interne';
    const ficheUrl = c.candidatId ? `${appUrl()}/candidats/${c.candidatId}` : c.clientId ? `${appUrl()}/clients/${c.clientId}` : c.mandatId ? `${appUrl()}/mandats/${c.mandatId}` : null;
    const choose = c.needsReview
      ? `<div style="margin-top:6px;color:${C.warn};">À préciser${c.reviewReason ? ` : ${escapeHtml(c.reviewReason)}` : ''}</div>
         <div style="margin-top:4px;">${CALL_TYPES.map((t) => `<a href="${appUrl()}/notes/${c.id}?type=${t}" style="display:inline-block;margin:2px 4px 2px 0;padding:3px 10px;border:1px solid ${C.border};border-radius:999px;color:${C.primary};text-decoration:none;font-size:12px;">${escapeHtml(CALL_TYPE_LABEL[t])}</a>`).join('')}</div>`
      : '';
    const missing: string[] = c._missing || [];
    return `<div style="padding:12px 0;border-top:1px solid ${C.border};">
      <div><strong>${fmtTime(new Date(c.startAt), tz)}</strong> · ${escapeHtml(c.titre)}${c.excluded ? ' <span style="color:' + C.muted + ';">(sans bot)</span>' : ''}</div>
      <div style="color:${C.muted};font-size:13px;">${escapeHtml(CALL_TYPE_LABEL[c.callType as CallType])} · ${escapeHtml(att)}</div>
      ${choose}
      ${missing.length ? `<div style="margin-top:4px;font-size:13px;">À charger : ${escapeHtml(missing.join(', '))}</div>` : ''}
      <div style="margin-top:6px;font-size:13px;"><a href="${appUrl()}/notes/${c.id}" style="color:${C.primary};">Charger les documents</a>${ficheUrl ? ` · <a href="${ficheUrl}" style="color:${C.primary};">Fiche Propium</a>` : ''}</div>
    </div>`;
  }).join('');
}

export async function sendEveningEmail(user: { id: string; email: string; prenom: string | null }, data: DayData, tz: string): Promise<void> {
  const tasks = data.tasksTomorrow;
  const body = `
    <h3 style="margin:0 0 8px 0;font-size:16px;">Ta journée</h3>
    ${todaySection(data.today)}
    ${tasks.length ? `<h3 style="margin:16px 0 6px 0;font-size:15px;">Relances et tâches pour demain</h3><ul style="margin:0 0 0 18px;padding:0;">${tasks.map((t) => `<li>${escapeHtml(t.titre || 'Tâche')}</li>`).join('')}</ul>` : ''}
    <h3 style="margin:22px 0 4px 0;font-size:16px;">Demain tu as ${data.tomorrow.length} meeting${data.tomorrow.length > 1 ? 's' : ''}</h3>
    ${tomorrowSection(data.tomorrow, tz)}`;
  const html = renderBrandedEmail({ title: `Récap du ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz })}`, bodyHtml: body, cta: { label: 'Ouvrir Humanup Notes', href: `${appUrl()}/notes` } });
  await sendEmail(user.email, `Récap du soir · demain ${data.tomorrow.length} meeting${data.tomorrow.length > 1 ? 's' : ''}`, html, undefined, { from: FROM() });
}

export async function sendTeamRecap(to: string[], perUser: { name: string; today: any[] }[]): Promise<void> {
  const total = perUser.reduce((s, u) => s + u.today.length, 0);
  const body = `
    <p><strong>${total} call${total > 1 ? 's' : ''}</strong> visio dans l'équipe aujourd'hui.</p>
    ${perUser.filter((u) => u.today.length).map((u) => `<h3 style="margin:18px 0 6px 0;font-size:15px;">${escapeHtml(u.name)}</h3>${todaySection(u.today)}`).join('')}`;
  const html = renderBrandedEmail({ title: 'Récap équipe', bodyHtml: body, cta: { label: 'Ouvrir Humanup Notes', href: `${appUrl()}/notes` } });
  for (const email of to) await sendEmail(email, `Récap équipe · ${total} call${total > 1 ? 's' : ''} visio`, html, undefined, { from: FROM() });
}
