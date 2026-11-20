// Emails Humanup Notes : notes après le call, brief 30 min avant, et email du
// soir (récap de la journée + préparation des meetings du lendemain).
import prisma from '../../lib/db.js';
import { escapeHtml, renderBrandedEmail, sendEmail } from '../../lib/mailer.js';
import { callReplyCode, dayReplyCode, REPLY_HINT_HTML, REPLY_HINT_HTML_FR, replyAddress } from './notes.reply.js';
import { formatDateTime, formatLongDate, formatTime, getUserLocale, localeOf, type Lang, type UserLocale } from '../../lib/locale.js';
import { localizeFlags, notesMessage } from './notes.messages.js';
import { appUrl, CALL_TYPES, type Attendee, type CallType, type NoteQuestion, type PropiumLink } from './notes.types.js';

const FROM = () => process.env.NOTES_FROM || undefined;
const C = { muted: '#6e6a85', border: '#eceaf2', primary: '#22177A', warn: '#b45309', soft: '#f6f5fb' };

// Emails internes à l'équipe : dans la langue de chaque destinataire (User.preferredLanguage),
// heures dans son fuseau (User.timezone), avec le nom du fuseau.
const CALL_TYPE_LABEL: Record<Lang, Record<CallType, string>> = {
  en: { QUALIF: 'Candidate qualification', INTAKE: 'Client intake', PROSPECT: 'Prospect', INTERNE: 'Internal meeting' },
  fr: { QUALIF: 'Qualification candidat', INTAKE: 'Intake client', PROSPECT: 'Prospect', INTERNE: 'Réunion interne' },
};
/** « 2 calls » / « 2 visios ». `forms` : [singulier, pluriel]. */
const plural = (n: number, forms: [string, string]) => `${n} ${n > 1 ? forms[1] : forms[0]}`;

const RECIPIENT_SELECT = { id: true, email: true, prenom: true, preferredLanguage: true, timezone: true } as const;
export type Recipient = { id: string; email: string; prenom: string | null; preferredLanguage: string | null; timezone: string | null };

async function recipients(call: { userId: string; memberIds: string[] }): Promise<Recipient[]> {
  const ids = [call.userId, ...(call.memberIds || [])];
  return prisma.user.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: RECIPIENT_SELECT });
}

/** Destinataires du brief : les membres du call, ou un seul membre (renvoi à la demande). */
export async function briefRecipients(call: { userId: string; memberIds: string[] }, onlyTo?: string): Promise<Recipient[]> {
  const to = await recipients(call);
  if (!onlyTo) return to;
  const mine = to.filter((u) => u.id === onlyTo);
  return mine.length ? mine : prisma.user.findMany({ where: { id: onlyTo }, select: RECIPIENT_SELECT });
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

// ─── Libellés ────────────────────────────────────────

const TXT = {
  en: {
    replyHint: REPLY_HINT_HTML, untitled: 'video call', colon: ':',
    // brief
    noBrief: 'Not enough information in Propium to write a brief.',
    questions: 'Prepared questions', mustAsk: 'must ask', missing: 'Missing:', upload: 'Upload it',
    profile: 'Propium profile', mandate: 'Mandate', questionsLink: 'Questions', liveCta: 'Open the live panel',
    briefTitle: (t: string) => `Brief: ${t}`, briefSubject: (time: string, t: string) => `Brief ${time}: ${t}`,
    askLang: 'Call language? The bot uses it for its captions.', fr: 'French', en: 'English',
    // notes
    notesTitle: (t: string) => `Notes: ${t}`, inPropium: 'In Propium', created: 'Created', updated: 'Updated',
    kind: { CANDIDAT: 'candidate', CLIENT: 'client', MANDAT: 'mandate', LEAD: 'lead', TACHE: 'task' } as Record<PropiumLink['kind'], string>,
    toCheck: 'To check:', openPropium: 'Open in Propium', viewCall: 'View the call',
    // récap
    calls: ['call', 'calls'] as [string, string], meetings: ['meeting', 'meetings'] as [string, string], videoCalls: ['video call', 'video calls'] as [string, string],
    noCallsToday: 'No video calls today.', profilesTouched: 'Profiles created or updated', dbOpen: 'Dealbreakers left unanswered',
    dups: 'Possible duplicates to check', withoutNotes: 'without notes', noMeetingsTomorrow: 'No video meetings tomorrow.',
    internal: 'internal', pickType: 'Pick the call type', noBot: '(no bot)', toUpload: 'To upload:', uploadDocs: 'Upload documents',
    yourDay: 'Your day', tasksTomorrow: 'Follow-ups and tasks for tomorrow', task: 'Task',
    tomorrowYouHave: (n: string) => `Tomorrow you have ${n}`, recapTitle: (d: string) => `Recap for ${d}`,
    recapSubject: (n: string) => `Evening recap · ${n} tomorrow`, openNotes: 'Open Humanup Notes',
    teamLine: (n: string) => `<strong>${n}</strong> across the team today.`, teamTitle: 'Team recap', teamSubject: (n: string) => `Team recap · ${n}`,
  },
  fr: {
    replyHint: REPLY_HINT_HTML_FR, untitled: 'visio', colon: ' :',
    noBrief: 'Pas assez d’informations dans Propium pour rédiger un brief.',
    questions: 'Questions préparées', mustAsk: 'à poser', missing: 'Il manque :', upload: 'Le charger',
    profile: 'Fiche Propium', mandate: 'Mandat', questionsLink: 'Questions', liveCta: 'Ouvrir le panneau live',
    briefTitle: (t: string) => `Brief : ${t}`, briefSubject: (time: string, t: string) => `Brief ${time} : ${t}`,
    askLang: 'Langue du call ? Le bot s’en sert pour ses sous-titres.', fr: 'Français', en: 'Anglais',
    notesTitle: (t: string) => `Notes : ${t}`, inPropium: 'Dans Propium', created: 'Créé', updated: 'Mis à jour',
    kind: { CANDIDAT: 'candidat', CLIENT: 'client', MANDAT: 'mandat', LEAD: 'lead', TACHE: 'tâche' } as Record<PropiumLink['kind'], string>,
    toCheck: 'À vérifier :', openPropium: 'Ouvrir dans Propium', viewCall: 'Voir le call',
    calls: ['call', 'calls'] as [string, string], meetings: ['réunion', 'réunions'] as [string, string], videoCalls: ['visio', 'visios'] as [string, string],
    noCallsToday: 'Aucune visio aujourd’hui.', profilesTouched: 'Fiches créées ou mises à jour', dbOpen: 'Dealbreakers restés sans réponse',
    dups: 'Doublons possibles à vérifier', withoutNotes: 'sans notes', noMeetingsTomorrow: 'Aucune visio demain.',
    internal: 'interne', pickType: 'Choisissez le type de call', noBot: '(sans bot)', toUpload: 'À charger :', uploadDocs: 'Charger des documents',
    yourDay: 'Votre journée', tasksTomorrow: 'Relances et tâches de demain', task: 'Tâche',
    tomorrowYouHave: (n: string) => `Demain : ${n}`, recapTitle: (d: string) => `Récap du ${d}`,
    recapSubject: (n: string) => `Récap du soir · ${n} demain`, openNotes: 'Ouvrir Humanup Notes',
    teamLine: (n: string) => `<strong>${n}</strong> dans l’équipe aujourd’hui.`, teamTitle: 'Récap équipe', teamSubject: (n: string) => `Récap équipe · ${n}`,
  },
} satisfies Record<Lang, unknown>;

/** Éléments manquants (clés françaises de buildContext) dans la langue du destinataire. */
const MISSING_EN: Record<string, string> = {
  'Brief du mandat (JD ou dossier de qualif)': 'Mandate brief (JD or qualification file)',
  'Mandat lié': 'Linked mandate',
  'CV du candidat': 'Candidate CV',
  'Fiche client': 'Client profile',
  'Profil LinkedIn du contact et site de la boîte': 'Contact’s LinkedIn profile and company website',
  'Ordre du jour': 'Agenda',
};
export const missingLabel = (m: string, lang: Lang) => (lang === 'en' ? MISSING_EN[m] ?? m : m);

const pillStyle = `display:inline-block;margin:2px 4px 2px 0;padding:3px 10px;border:1px solid ${C.border};border-radius:999px;color:${C.primary};text-decoration:none;font-size:12px;`;

// ─── Notes après le call ─────────────────────────────

function linksHtml(links: PropiumLink[], lang: Lang): string {
  if (!links.length) return '';
  const L = TXT[lang];
  const label = (l: PropiumLink) => `${l.action === 'created' ? L.created : L.updated}${L.colon} ${L.kind[l.kind]}`;
  return `<div style="margin-top:20px;padding:14px 16px;background:${C.soft};border-radius:10px;">
    <div style="font-weight:600;margin-bottom:6px;">${escapeHtml(L.inPropium)}</div>
    ${links.map((l) => `<div style="margin:3px 0;">${escapeHtml(label(l))} · <a href="${escapeHtml(l.url)}" style="color:${C.primary};">${escapeHtml(l.label)}</a></div>`).join('')}
  </div>`;
}

/**
 * Notes après le call : dans la langue de chaque destinataire, heure dans son fuseau.
 * `markdownByLang` : notes rédigées par langue ; à défaut, celles du call (langue du propriétaire).
 */
export async function sendNotesEmail(call: any, markdownByLang: Partial<Record<Lang, string>> = {}): Promise<void> {
  const to = await recipients(call);
  const links = (call.propiumLinks as PropiumLink[]) || [];
  const mainLink = links.find((l) => l.kind !== 'TACHE');
  for (const u of to) {
    const loc = localeOf(u);
    const L = TXT[loc.lang];
    const dups = localizeFlags(call.duplicateFlags as any[], loc.lang);
    const titre = call.titre || L.untitled;
    const md: string = markdownByLang[loc.lang] ?? call.notesMarkdown ?? '';
    const body = `
    <p style="margin:0 0 12px 0;color:${C.muted};">${escapeHtml(CALL_TYPE_LABEL[loc.lang][call.callType as CallType])} · ${escapeHtml(formatDateTime(call.startAt, loc))}</p>
    ${mdToHtml(md)}
    ${linksHtml(links, loc.lang)}
    ${dups.length ? `<p style="margin-top:14px;color:${C.warn};">${escapeHtml(L.toCheck)} ${dups.map((d) => escapeHtml(d.reason)).join(' ')}</p>` : ''}
    ${call.callType !== 'INTERNE' ? L.replyHint : ''}`;
    const html = renderBrandedEmail({
      lang: loc.lang,
      title: L.notesTitle(titre),
      bodyHtml: body,
      cta: mainLink ? { label: L.openPropium, href: mainLink.url } : { label: L.viewCall, href: `${appUrl()}/notes/${call.id}` },
    });
    await sendEmail(u.email, L.notesTitle(titre), html, md || undefined, { from: FROM(), replyTo: call.callType !== 'INTERNE' ? replyAddress(u.email, callReplyCode(call.id)) : undefined });
  }
}

// ─── Brief 30 min avant (qualif / intake) ────────────

/**
 * Brief 30 min avant, pour un destinataire : tout dans sa langue (`loc.lang`),
 * heure du call dans son fuseau (`loc.timezone`), au format « Thu 20 Nov, 19:30 (ICT) ».
 */
export async function sendBriefEmail(call: any, u: Recipient, loc: UserLocale, briefMd: string | null, missing: string[], opts: { askLanguage?: boolean } = {}): Promise<number> {
  const L = TXT[loc.lang];
  const when = formatDateTime(call.startAt, loc);
  const titre = call.titre || L.untitled;
  const questions = ((call.questions as NoteQuestion[]) || []);
  const ordered = [...questions.filter((q) => q.dealbreaker), ...questions.filter((q) => !q.dealbreaker)];
  const att = ((call.attendees as Attendee[]) || []).filter((a) => a.role !== 'internal').map((a) => a.name || a.email).join(', ');
  const ficheUrl = call.candidatId ? `${appUrl()}/candidats/${call.candidatId}` : call.clientId ? `${appUrl()}/clients/${call.clientId}` : null;
  const mandatUrl = call.mandatId ? `${appUrl()}/mandats/${call.mandatId}` : null;
  const body = `
    <p style="margin:0 0 12px 0;color:${C.muted};">${escapeHtml(CALL_TYPE_LABEL[loc.lang][call.callType as CallType])} · ${escapeHtml(when)}${att ? ` · ${escapeHtml(att)}` : ''}</p>
    ${opts.askLanguage ? askLanguageHtml(call.id, loc.lang) : ''}
    ${briefMd ? mdToHtml(briefMd) : `<p style="color:${C.muted};">${escapeHtml(L.noBrief)}</p>`}
    ${ordered.length ? `<h3 style="margin:18px 0 6px 0;font-size:15px;">${escapeHtml(L.questions)}</h3><ol style="margin:0 0 0 18px;padding:0;">${ordered.map((q) => `<li style="margin-bottom:3px;">${q.dealbreaker ? '<strong>' : ''}${escapeHtml(q.text)}${q.dealbreaker ? `</strong> <span style="color:${C.warn};font-size:12px;">${escapeHtml(L.mustAsk)}</span>` : ''}</li>`).join('')}</ol>` : ''}
    ${missing.length ? `<p style="margin-top:14px;color:${C.warn};">${escapeHtml(L.missing)} ${escapeHtml(missing.map((m) => missingLabel(m, loc.lang)).join(', '))}. <a href="${appUrl()}/notes/${call.id}" style="color:${C.primary};">${escapeHtml(L.upload)}</a></p>` : ''}
    <p style="margin-top:14px;font-size:13px;">${[ficheUrl ? `<a href="${ficheUrl}" style="color:${C.primary};">${escapeHtml(L.profile)}</a>` : '', mandatUrl ? `<a href="${mandatUrl}" style="color:${C.primary};">${escapeHtml(L.mandate)}</a>` : '', `<a href="${appUrl()}/notes/${call.id}" style="color:${C.primary};">${escapeHtml(L.questionsLink)}</a>`].filter(Boolean).join(' · ')}</p>
    ${L.replyHint}`;
  const html = renderBrandedEmail({ lang: loc.lang, title: L.briefTitle(titre), bodyHtml: body, cta: { label: L.liveCta, href: `${appUrl()}/notes/live/${call.id}` } });
  await sendEmail(u.email, L.briefSubject(formatTime(call.startAt, loc), titre), html, briefMd || undefined, { from: FROM(), replyTo: replyAddress(u.email, callReplyCode(call.id)) });
  return 1;
}

/** Langue inconnue (pas d'indicatif exploitable) : on la demande, un clic suffit. */
export function askLanguageHtml(callId: string, lang: Lang = 'en'): string {
  const L = TXT[lang];
  const pill = (code: 'fr' | 'en', label: string) => `<a href="${appUrl()}/notes/${callId}?lang=${code}" style="${pillStyle}">${label}</a>`;
  return `<div style="margin-top:6px;color:${C.warn};font-size:13px;">${escapeHtml(L.askLang)}</div><div style="margin-top:4px;">${pill('fr', L.fr)}${pill('en', L.en)}</div>`;
}

// ─── Email du soir (19h) ─────────────────────────────

interface DayData {
  today: any[];
  tomorrow: any[];
  tasksTomorrow: { titre: string | null; tacheDueDate: Date | null }[];
}

function todaySection(calls: any[], lang: Lang): string {
  const L = TXT[lang];
  if (!calls.length) return `<p style="color:${C.muted};">${escapeHtml(L.noCallsToday)}</p>`;
  const counts = CALL_TYPES.map((t) => [t, calls.filter((c) => c.callType === t).length] as const).filter(([, n]) => n > 0);
  const people = calls.flatMap((c) => ((c.propiumLinks as PropiumLink[]) || []).filter((l) => l.kind !== 'TACHE'));
  const dbs = calls
    .map((c) => ({ c, q: ((c.questions as NoteQuestion[]) || []).filter((q) => q.dealbreaker && q.status !== 'covered') }))
    .filter((x) => x.q.length && x.c.status === 'DONE');
  const dups = calls.flatMap((c) => localizeFlags(c.duplicateFlags as any[], lang));
  const failed = calls.filter((c) => c.status === 'FAILED');
  return `
    <p><strong>${plural(calls.length, L.calls)}</strong>${L.colon} ${counts.map(([t, n]) => `${n} ${escapeHtml(CALL_TYPE_LABEL[lang][t].toLowerCase())}`).join(', ')}.</p>
    ${people.length ? `<h3 style="margin:16px 0 6px 0;font-size:15px;">${escapeHtml(L.profilesTouched)}</h3>${people.map((l) => `<div>${l.action === 'created' ? L.created : L.updated} · <a href="${escapeHtml(l.url)}" style="color:${C.primary};">${escapeHtml(l.label)}</a></div>`).join('')}` : ''}
    ${dbs.length ? `<h3 style="margin:16px 0 6px 0;font-size:15px;">${escapeHtml(L.dbOpen)}</h3>${dbs.map((x) => `<div style="margin-bottom:6px;"><a href="${appUrl()}/notes/${x.c.id}" style="color:${C.primary};">${escapeHtml(x.c.titre)}</a><ul style="margin:2px 0 0 18px;padding:0;">${x.q.map((q) => `<li>${escapeHtml(q.text)}</li>`).join('')}</ul></div>`).join('')}` : ''}
    ${dups.length ? `<h3 style="margin:16px 0 6px 0;font-size:15px;color:${C.warn};">${escapeHtml(L.dups)}</h3>${dups.map((d) => `<div><a href="${escapeHtml(d.url)}" style="color:${C.primary};">${escapeHtml(d.label)}</a>${L.colon} ${escapeHtml(d.reason)}</div>`).join('')}` : ''}
    ${failed.length ? `<p style="color:${C.warn};margin-top:12px;">${plural(failed.length, L.calls)} ${escapeHtml(L.withoutNotes)}${L.colon} ${failed.map((c) => escapeHtml(c.titre)).join(', ')}.</p>` : ''}`;
}

function tomorrowSection(calls: any[], loc: UserLocale): string {
  const L = TXT[loc.lang];
  if (!calls.length) return `<p style="color:${C.muted};">${escapeHtml(L.noMeetingsTomorrow)}</p>`;
  return calls.map((c) => {
    const att = ((c.attendees as Attendee[]) || []).filter((a) => a.role !== 'internal').map((a) => a.name || a.email).join(', ') || L.internal;
    const ficheUrl = c.candidatId ? `${appUrl()}/candidats/${c.candidatId}` : c.clientId ? `${appUrl()}/clients/${c.clientId}` : c.mandatId ? `${appUrl()}/mandats/${c.mandatId}` : null;
    const choose = c.needsReview
      ? `<div style="margin-top:6px;color:${C.warn};">${escapeHtml(L.pickType)}${c.reviewReason ? `${L.colon} ${escapeHtml(notesMessage(c.reviewReason, loc.lang))}` : ''}</div>
         <div style="margin-top:4px;">${CALL_TYPES.map((t) => `<a href="${appUrl()}/notes/${c.id}?type=${t}" style="${pillStyle}">${escapeHtml(CALL_TYPE_LABEL[loc.lang][t])}</a>`).join('')}</div>`
      : '';
    const missing: string[] = c._missing || [];
    return `<div style="padding:12px 0;border-top:1px solid ${C.border};">
      <div><strong>${escapeHtml(formatTime(c.startAt, loc))}</strong> · ${escapeHtml(c.titre)}${c.excluded ? ` <span style="color:${C.muted};">${escapeHtml(L.noBot)}</span>` : ''}</div>
      <div style="color:${C.muted};font-size:13px;">${escapeHtml(CALL_TYPE_LABEL[loc.lang][c.callType as CallType])} · ${escapeHtml(att)}</div>
      ${choose}
      ${c._askLanguage && !c.excluded && c.callType !== 'INTERNE' ? askLanguageHtml(c.id, loc.lang) : ''}
      ${missing.length ? `<div style="margin-top:4px;font-size:13px;">${escapeHtml(L.toUpload)} ${escapeHtml(missing.map((m) => missingLabel(m, loc.lang)).join(', '))}</div>` : ''}
      <div style="margin-top:6px;font-size:13px;"><a href="${appUrl()}/notes/${c.id}" style="color:${C.primary};">${escapeHtml(L.uploadDocs)}</a>${ficheUrl ? ` · <a href="${ficheUrl}" style="color:${C.primary};">${escapeHtml(L.profile)}</a>` : ''}</div>
    </div>`;
  }).join('');
}

/** Récap du soir : dans la langue du membre ; `tz` = son fuseau (celui qui a déclenché l'envoi à 19h). */
export async function sendEveningEmail(user: { id: string; email: string; prenom: string | null }, data: DayData, tz: string): Promise<void> {
  const loc: UserLocale = { lang: (await getUserLocale(user.id)).lang, timezone: tz };
  const L = TXT[loc.lang];
  const tasks = data.tasksTomorrow;
  const meetings = plural(data.tomorrow.length, L.meetings);
  const body = `
    <h3 style="margin:0 0 8px 0;font-size:16px;">${escapeHtml(L.yourDay)}</h3>
    ${todaySection(data.today, loc.lang)}
    ${tasks.length ? `<h3 style="margin:16px 0 6px 0;font-size:15px;">${escapeHtml(L.tasksTomorrow)}</h3><ul style="margin:0 0 0 18px;padding:0;">${tasks.map((t) => `<li>${escapeHtml(t.titre || L.task)}</li>`).join('')}</ul>` : ''}
    <h3 style="margin:22px 0 4px 0;font-size:16px;">${escapeHtml(L.tomorrowYouHave(meetings))}</h3>
    ${tomorrowSection(data.tomorrow, loc)}
    ${L.replyHint}`;
  const html = renderBrandedEmail({ lang: loc.lang, title: L.recapTitle(formatLongDate(new Date(), loc)), bodyHtml: body, cta: { label: L.openNotes, href: `${appUrl()}/notes` } });
  await sendEmail(user.email, L.recapSubject(meetings), html, undefined, { from: FROM(), replyTo: replyAddress(user.email, dayReplyCode(new Date(), tz)) });
}

/** Récap équipe (admins) : dans la langue de chaque destinataire. */
export async function sendTeamRecap(to: string[], perUser: { name: string; today: any[] }[]): Promise<void> {
  const total = perUser.reduce((s, u) => s + u.today.length, 0);
  const users = await prisma.user.findMany({ where: { email: { in: to } }, select: { email: true, preferredLanguage: true, timezone: true } });
  for (const email of to) {
    const lang = localeOf(users.find((u) => u.email === email) ?? {}).lang;
    const L = TXT[lang];
    const n = plural(total, L.videoCalls);
    const body = `
    <p>${L.teamLine(n)}</p>
    ${perUser.filter((u) => u.today.length).map((u) => `<h3 style="margin:18px 0 6px 0;font-size:15px;">${escapeHtml(u.name)}</h3>${todaySection(u.today, lang)}`).join('')}`;
    const html = renderBrandedEmail({ lang, title: L.teamTitle, bodyHtml: body, cta: { label: L.openNotes, href: `${appUrl()}/notes` } });
    await sendEmail(email, L.teamSubject(n), html, undefined, { from: FROM() });
  }
}
