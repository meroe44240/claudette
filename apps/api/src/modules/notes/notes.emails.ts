// Emails Humanup Notes : notes après le call, brief 30 min avant, et email du
// soir (récap de la journée + préparation des meetings du lendemain).
import prisma from '../../lib/db.js';
import { escapeHtml, renderBrandedEmail, sendEmail } from '../../lib/mailer.js';
import { callReplyCode, dayReplyCode, REPLY_HINT_HTML, replyAddress } from './notes.reply.js';
import { appUrl, CALL_TYPES, type Attendee, type CallType, type NoteQuestion, type PropiumLink } from './notes.types.js';

const FROM = () => process.env.NOTES_FROM || undefined;
const C = { muted: '#6e6a85', border: '#eceaf2', primary: '#22177A', warn: '#b45309', soft: '#f6f5fb' };

// Emails internes à l'équipe : en anglais (l'interface et les emails candidats/clients restent en français).
const CALL_TYPE_LABEL: Record<CallType, string> = {
  QUALIF: 'Candidate qualification',
  INTAKE: 'Client intake',
  PROSPECT: 'Prospect',
  INTERNE: 'Internal meeting',
};
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

function fmtTime(d: Date, tz: string): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
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
  const label = (l: PropiumLink) => `${l.action === 'created' ? 'Created' : 'Updated'}: ${{ CANDIDAT: 'candidate', CLIENT: 'client', MANDAT: 'mandate', LEAD: 'lead', TACHE: 'task' }[l.kind]}`;
  return `<div style="margin-top:20px;padding:14px 16px;background:${C.soft};border-radius:10px;">
    <div style="font-weight:600;margin-bottom:6px;">In Propium</div>
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
    <p style="margin:0 0 12px 0;color:${C.muted};">${escapeHtml(CALL_TYPE_LABEL[call.callType as CallType])} · ${escapeHtml(new Date(call.startAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }))}</p>
    ${mdToHtml(call.notesMarkdown || '')}
    ${linksHtml(links)}
    ${dups.length ? `<p style="margin-top:14px;color:${C.warn};">To check: ${dups.map((d) => escapeHtml(d.reason)).join(' ')}</p>` : ''}
    ${call.callType !== 'INTERNE' ? REPLY_HINT_HTML : ''}`;
  const html = renderBrandedEmail({
    lang: 'en',
    title: `Notes: ${call.titre || 'video call'}`,
    bodyHtml: body,
    cta: mainLink ? { label: 'Open in Propium', href: mainLink.url } : { label: 'View the call', href: `${appUrl()}/notes/${call.id}` },
  });
  for (const u of to) await sendEmail(u.email, `Notes: ${call.titre || 'video call'}`, html, call.notesMarkdown || undefined, { from: FROM(), replyTo: call.callType !== 'INTERNE' ? replyAddress(u.email, callReplyCode(call.id)) : undefined });
}

// ─── Brief 30 min avant (qualif / intake) ────────────

export async function sendBriefEmail(call: any, briefMd: string | null, missing: string[], onlyTo?: string): Promise<number> {
  let to = await recipients(call);
  if (onlyTo) to = to.filter((u) => u.id === onlyTo).length ? to.filter((u) => u.id === onlyTo) : await prisma.user.findMany({ where: { id: onlyTo }, select: { id: true, email: true, prenom: true } });
  if (!to.length) return 0;
  const tz = (await prisma.noteUserSettings.findUnique({ where: { userId: call.userId } }))?.timezone || 'Europe/Paris';
  const questions = ((call.questions as NoteQuestion[]) || []);
  const ordered = [...questions.filter((q) => q.dealbreaker), ...questions.filter((q) => !q.dealbreaker)];
  const att = ((call.attendees as Attendee[]) || []).filter((a) => a.role !== 'internal').map((a) => a.name || a.email).join(', ');
  const ficheUrl = call.candidatId ? `${appUrl()}/candidats/${call.candidatId}` : call.clientId ? `${appUrl()}/clients/${call.clientId}` : null;
  const mandatUrl = call.mandatId ? `${appUrl()}/mandats/${call.mandatId}` : null;
  const body = `
    <p style="margin:0 0 12px 0;color:${C.muted};">${escapeHtml(CALL_TYPE_LABEL[call.callType as CallType])} · ${fmtTime(new Date(call.startAt), tz)}${att ? ` · ${escapeHtml(att)}` : ''}</p>
    ${call._askLanguage ? askLanguageHtml(call.id) : ""}
    ${briefMd ? mdToHtml(briefMd) : `<p style="color:${C.muted};">Not enough information in Propium to write a brief.</p>`}
    ${ordered.length ? `<h3 style="margin:18px 0 6px 0;font-size:15px;">Prepared questions</h3><ol style="margin:0 0 0 18px;padding:0;">${ordered.map((q) => `<li style="margin-bottom:3px;">${q.dealbreaker ? '<strong>' : ''}${escapeHtml(q.text)}${q.dealbreaker ? '</strong> <span style="color:' + C.warn + ';font-size:12px;">must ask</span>' : ''}</li>`).join('')}</ol>` : ''}
    ${missing.length ? `<p style="margin-top:14px;color:${C.warn};">Missing: ${escapeHtml(missing.join(', '))}. <a href="${appUrl()}/notes/${call.id}" style="color:${C.primary};">Upload it</a></p>` : ''}
    <p style="margin-top:14px;font-size:13px;">${[ficheUrl ? `<a href="${ficheUrl}" style="color:${C.primary};">Propium profile</a>` : '', mandatUrl ? `<a href="${mandatUrl}" style="color:${C.primary};">Mandate</a>` : '', `<a href="${appUrl()}/notes/${call.id}" style="color:${C.primary};">Questions</a>`].filter(Boolean).join(' · ')}</p>
    ${REPLY_HINT_HTML}`;
  const html = renderBrandedEmail({ lang: 'en', title: `Brief: ${call.titre || 'video call'}`, bodyHtml: body, cta: { label: 'Open the live panel', href: `${appUrl()}/notes/live/${call.id}` } });
  for (const u of to) await sendEmail(u.email, `Brief ${fmtTime(new Date(call.startAt), tz)}: ${call.titre || 'video call'}`, html, briefMd || undefined, { from: FROM(), replyTo: replyAddress(u.email, callReplyCode(call.id)) });
  return to.length;
}


/** Langue inconnue (pas d'indicatif exploitable) : on la demande, un clic suffit. */
export function askLanguageHtml(callId: string): string {
  const pill = (code: 'fr' | 'en', label: string) => `<a href="${appUrl()}/notes/${callId}?lang=${code}" style="display:inline-block;margin:2px 4px 2px 0;padding:3px 10px;border:1px solid ${C.border};border-radius:999px;color:${C.primary};text-decoration:none;font-size:12px;">${label}</a>`;
  return `<div style="margin-top:6px;color:${C.warn};font-size:13px;">Call language? The bot uses it for its captions.</div><div style="margin-top:4px;">${pill('fr', 'French')}${pill('en', 'English')}</div>`;
}
// ─── Email du soir (19h) ─────────────────────────────

interface DayData {
  today: any[];
  tomorrow: any[];
  tasksTomorrow: { titre: string | null; tacheDueDate: Date | null }[];
}

function todaySection(calls: any[]): string {
  if (!calls.length) return `<p style="color:${C.muted};">No video calls today.</p>`;
  const counts = CALL_TYPES.map((t) => [t, calls.filter((c) => c.callType === t).length] as const).filter(([, n]) => n > 0);
  const people = calls.flatMap((c) => ((c.propiumLinks as PropiumLink[]) || []).filter((l) => l.kind !== 'TACHE'));
  const dbs = calls
    .map((c) => ({ c, q: ((c.questions as NoteQuestion[]) || []).filter((q) => q.dealbreaker && q.status !== 'covered') }))
    .filter((x) => x.q.length && x.c.status === 'DONE');
  const dups = calls.flatMap((c) => (c.duplicateFlags as any[]) || []);
  const failed = calls.filter((c) => c.status === 'FAILED');
  return `
    <p><strong>${plural(calls.length, 'call')}</strong>: ${counts.map(([t, n]) => `${n} ${escapeHtml(CALL_TYPE_LABEL[t].toLowerCase())}`).join(', ')}.</p>
    ${people.length ? `<h3 style="margin:16px 0 6px 0;font-size:15px;">Profiles created or updated</h3>${people.map((l) => `<div>${l.action === 'created' ? 'Created' : 'Updated'} · <a href="${escapeHtml(l.url)}" style="color:${C.primary};">${escapeHtml(l.label)}</a></div>`).join('')}` : ''}
    ${dbs.length ? `<h3 style="margin:16px 0 6px 0;font-size:15px;">Dealbreakers left unanswered</h3>${dbs.map((x) => `<div style="margin-bottom:6px;"><a href="${appUrl()}/notes/${x.c.id}" style="color:${C.primary};">${escapeHtml(x.c.titre)}</a><ul style="margin:2px 0 0 18px;padding:0;">${x.q.map((q) => `<li>${escapeHtml(q.text)}</li>`).join('')}</ul></div>`).join('')}` : ''}
    ${dups.length ? `<h3 style="margin:16px 0 6px 0;font-size:15px;color:${C.warn};">Possible duplicates to check</h3>${dups.map((d) => `<div><a href="${escapeHtml(d.url)}" style="color:${C.primary};">${escapeHtml(d.label)}</a>: ${escapeHtml(d.reason)}</div>`).join('')}` : ''}
    ${failed.length ? `<p style="color:${C.warn};margin-top:12px;">${plural(failed.length, 'call')} without notes: ${failed.map((c) => escapeHtml(c.titre)).join(', ')}.</p>` : ''}`;
}

function tomorrowSection(calls: any[], tz: string): string {
  if (!calls.length) return `<p style="color:${C.muted};">No video meetings tomorrow.</p>`;
  return calls.map((c) => {
    const att = ((c.attendees as Attendee[]) || []).filter((a) => a.role !== 'internal').map((a) => a.name || a.email).join(', ') || 'internal';
    const ficheUrl = c.candidatId ? `${appUrl()}/candidats/${c.candidatId}` : c.clientId ? `${appUrl()}/clients/${c.clientId}` : c.mandatId ? `${appUrl()}/mandats/${c.mandatId}` : null;
    const choose = c.needsReview
      ? `<div style="margin-top:6px;color:${C.warn};">Pick the call type${c.reviewReason ? `: ${escapeHtml(c.reviewReason)}` : ''}</div>
         <div style="margin-top:4px;">${CALL_TYPES.map((t) => `<a href="${appUrl()}/notes/${c.id}?type=${t}" style="display:inline-block;margin:2px 4px 2px 0;padding:3px 10px;border:1px solid ${C.border};border-radius:999px;color:${C.primary};text-decoration:none;font-size:12px;">${escapeHtml(CALL_TYPE_LABEL[t])}</a>`).join('')}</div>`
      : '';
    const missing: string[] = c._missing || [];
    return `<div style="padding:12px 0;border-top:1px solid ${C.border};">
      <div><strong>${fmtTime(new Date(c.startAt), tz)}</strong> · ${escapeHtml(c.titre)}${c.excluded ? ' <span style="color:' + C.muted + ';">(no bot)</span>' : ''}</div>
      <div style="color:${C.muted};font-size:13px;">${escapeHtml(CALL_TYPE_LABEL[c.callType as CallType])} · ${escapeHtml(att)}</div>
      ${choose}
      ${c._askLanguage && !c.excluded && c.callType !== "INTERNE" ? askLanguageHtml(c.id) : ""}
      ${missing.length ? `<div style="margin-top:4px;font-size:13px;">To upload: ${escapeHtml(missing.join(', '))}</div>` : ''}
      <div style="margin-top:6px;font-size:13px;"><a href="${appUrl()}/notes/${c.id}" style="color:${C.primary};">Upload documents</a>${ficheUrl ? ` · <a href="${ficheUrl}" style="color:${C.primary};">Propium profile</a>` : ''}</div>
    </div>`;
  }).join('');
}

export async function sendEveningEmail(user: { id: string; email: string; prenom: string | null }, data: DayData, tz: string): Promise<void> {
  const tasks = data.tasksTomorrow;
  const body = `
    <h3 style="margin:0 0 8px 0;font-size:16px;">Your day</h3>
    ${todaySection(data.today)}
    ${tasks.length ? `<h3 style="margin:16px 0 6px 0;font-size:15px;">Follow-ups and tasks for tomorrow</h3><ul style="margin:0 0 0 18px;padding:0;">${tasks.map((t) => `<li>${escapeHtml(t.titre || 'Task')}</li>`).join('')}</ul>` : ''}
    <h3 style="margin:22px 0 4px 0;font-size:16px;">Tomorrow you have ${plural(data.tomorrow.length, 'meeting')}</h3>
    ${tomorrowSection(data.tomorrow, tz)}
    ${REPLY_HINT_HTML}`;
  const html = renderBrandedEmail({ lang: 'en', title: `Recap for ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz })}`, bodyHtml: body, cta: { label: 'Open Humanup Notes', href: `${appUrl()}/notes` } });
  await sendEmail(user.email, `Evening recap · ${plural(data.tomorrow.length, 'meeting')} tomorrow`, html, undefined, { from: FROM(), replyTo: replyAddress(user.email, dayReplyCode(new Date(), tz)) });
}

export async function sendTeamRecap(to: string[], perUser: { name: string; today: any[] }[]): Promise<void> {
  const total = perUser.reduce((s, u) => s + u.today.length, 0);
  const body = `
    <p><strong>${plural(total, 'video call')}</strong> across the team today.</p>
    ${perUser.filter((u) => u.today.length).map((u) => `<h3 style="margin:18px 0 6px 0;font-size:15px;">${escapeHtml(u.name)}</h3>${todaySection(u.today)}`).join('')}`;
  const html = renderBrandedEmail({ lang: 'en', title: 'Team recap', bodyHtml: body, cta: { label: 'Open Humanup Notes', href: `${appUrl()}/notes` } });
  for (const email of to) await sendEmail(email, `Team recap · ${plural(total, 'video call')}`, html, undefined, { from: FROM() });
}
