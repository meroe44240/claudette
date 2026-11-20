// Réponse par email aux emails Humanup Notes (brief, notes, email du soir).
//
// Chaque email part avec en « Répondre à » l'adresse du membre lui-même, avec un
// suffixe : prenom+n-<code>@humanup.io. Sa réponse arrive donc dans sa propre boîte
// (pas de rebond), et l'ATS la retrouve dans ses messages envoyés via la connexion
// Gmail. Seul le membre peut avoir envoyé un message depuis sa boîte : pas besoin
// d'autre preuve d'identité.
//
// Le code désigne un call (12 premiers caractères de son id) ou une journée
// (« j20261117 », pour l'email du soir qui couvre plusieurs calls).
//
// Claude lit la réponse et en tire des actions :
//  - appliquées tout de suite : infos de la fiche candidat, réponse à une question,
//    note sur une fiche, tâche ;
//  - à valider (visibles côté client, portail compris) : déplacement dans le pipeline.
//    Elles partent dans l'email de retour avec un lien « Valider » signé (7 jours).
import { SignJWT, jwtVerify } from 'jose';
import prisma from '../../lib/db.js';
import { escapeHtml, renderBrandedEmail, sendEmail } from '../../lib/mailer.js';
import { callClaude } from '../../services/claudeAI.js';
import * as candidatureService from '../candidatures/candidature.service.js';
import { appUrl, CALL_TYPE_LABEL, type CallType, type NoteQuestion } from './notes.types.js';
import { getUserLocale, promptLanguageLine, type Lang } from '../../lib/locale.js';

const FROM = () => process.env.NOTES_FROM || undefined;
const C = { muted: '#6e6a85', border: '#eceaf2', primary: '#22177A', warn: '#b45309' };
const secret = () => new TextEncoder().encode(process.env.JWT_ACCESS_SECRET || 'dev-access-secret');
const GOOGLE_CLIENT_ID = () => process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = () => process.env.GOOGLE_CLIENT_SECRET ?? '';

// ─── Adresse de réponse ──────────────────────────────

export function callReplyCode(callId: string): string {
  return callId.replace(/-/g, '').slice(0, 12).toLowerCase();
}

export function dayReplyCode(d: Date, tz = 'Europe/Paris'): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return `j${p.replace(/-/g, '')}`;
}

/** toi@humanup.io → toi+n-<code>@humanup.io (null si l'adresse a déjà un « + »). */
export function replyAddress(userEmail: string, code: string): string | undefined {
  const [local, domain] = userEmail.split('@');
  if (!local || !domain || local.includes('+')) return undefined;
  return `${local}+n-${code}@${domain}`;
}

const REPLY_RE = /\+n-([a-z0-9]{9,12})@/i;

export const REPLY_HINT_HTML_FR = `<p style="margin-top:18px;padding-top:12px;border-top:1px solid ${C.border};font-size:12px;color:${C.muted};">Répondez à cet email pour mettre à jour Propium (préavis, salaire, réponse à une question, tâche, étape du pipeline). Vous recevrez un résumé de ce qui a changé.</p>`;
export const REPLY_HINT_HTML = `<p style="margin-top:18px;padding-top:12px;border-top:1px solid ${C.border};font-size:12px;color:${C.muted};">Reply to this email to update Propium (notice period, salary, an answer to a question, a task, a pipeline stage). You'll get back a summary of what changed.</p>`;

// ─── Gmail ───────────────────────────────────────────

async function gmailToken(userId: string): Promise<{ token: string; configId: string; cfg: Record<string, any> } | null> {
  const config = await prisma.integrationConfig.findUnique({ where: { userId_provider: { userId, provider: 'gmail' } } });
  if (!config || !config.enabled || !config.accessToken) return null;
  const cfg = (config.config as Record<string, any>) || {};
  if (!config.tokenExpiry || config.tokenExpiry.getTime() > Date.now() + 5 * 60_000) return { token: config.accessToken, configId: config.id, cfg };
  if (!config.refreshToken || !GOOGLE_CLIENT_ID() || !GOOGLE_CLIENT_SECRET()) return null;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID(), client_secret: GOOGLE_CLIENT_SECRET(), refresh_token: config.refreshToken, grant_type: 'refresh_token' }),
  }).catch(() => null);
  const t = (await res?.json().catch(() => null)) as any;
  if (!t?.access_token) return null;
  await prisma.integrationConfig.update({ where: { id: config.id }, data: { accessToken: t.access_token, tokenExpiry: new Date(Date.now() + (t.expires_in || 3600) * 1000) } });
  return { token: t.access_token, configId: config.id, cfg };
}

const b64 = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

function findPart(part: any, mime: string): string | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data) return b64(part.body.data);
  for (const p of part.parts || []) {
    const r = findPart(p, mime);
    if (r) return r;
  }
  return null;
}

/** Garde ce que le membre a écrit : coupe la citation de l'email d'origine. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  for (const l of lines) {
    if (/^\s*>/.test(l)) break;
    if (/^\s*(Le .{3,120} a écrit\s*:|On .{3,120} wrote:|-{2,}\s*(Original|Message d'origine)|De\s*:.*@|From:.*@)/i.test(l)) break;
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

interface ReplyMessage { id: string; code: string; subject: string; text: string }

async function fetchReplies(token: string, since: Date, seen: Set<string>): Promise<ReplyMessage[]> {
  const q = `in:sent after:${Math.floor(since.getTime() / 1000)}`;
  const list = (await (await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=40&q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } })).json()) as any;
  const out: ReplyMessage[] = [];
  for (const m of list.messages || []) {
    if (seen.has(m.id)) continue;
    const meta = (await (await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject`, { headers: { Authorization: `Bearer ${token}` } })).json()) as any;
    const h: Record<string, string> = {};
    for (const x of meta.payload?.headers || []) h[x.name.toLowerCase()] = x.value;
    const code = `${h.to || ''} ${h.cc || ''}`.match(REPLY_RE)?.[1]?.toLowerCase();
    if (!code) continue;
    const full = (await (await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, { headers: { Authorization: `Bearer ${token}` } })).json()) as any;
    const plain = findPart(full.payload, 'text/plain');
    const html = plain ? null : findPart(full.payload, 'text/html');
    const raw = plain ?? (html ? html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').replace(/<blockquote[\s\S]*$/i, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&') : full.snippet || '');
    out.push({ id: m.id, code, subject: h.subject || '', text: stripQuoted(raw) });
  }
  return out;
}

// ─── Lecture par Claude ──────────────────────────────

const STAGES = ['SOURCING', 'CONTACTE', 'ENTRETIEN_1', 'ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'PROCESS', 'OFFRE', 'REFUSE'] as const;
const STAGE_LABEL: Record<string, string> = {
  SOURCING: 'Sourcing', CONTACTE: 'Qualification', ENTRETIEN_1: 'Entretien interne', ENVOYE_CLIENT: 'Envoi client',
  ENTRETIEN_CLIENT: 'Entretien client', PROCESS: 'Process', OFFRE: 'Offre', PLACE: 'Gagné', REFUSE: 'Perdu',
};
// Libellés des retours (email, page de validation) dans la langue du membre ; STAGE_LABEL sert aussi au prompt.
const STAGE_LABEL_EN: Record<string, string> = {
  SOURCING: 'Sourcing', CONTACTE: 'Qualification', ENTRETIEN_1: 'Internal interview', ENVOYE_CLIENT: 'Sent to client',
  ENTRETIEN_CLIENT: 'Client interview', PROCESS: 'Process', OFFRE: 'Offer', PLACE: 'Won', REFUSE: 'Lost',
};
const stageName = (stage: string, lang: Lang) => (lang === 'en' ? STAGE_LABEL_EN : STAGE_LABEL)[stage] ?? stage;

const R = {
  en: {
    field: { disponibilite: 'notice period', salaireActuel: 'current salary', salaireSouhaite: 'expected salary', posteActuel: 'role', entrepriseActuelle: 'company', localisation: 'location', mobilite: 'mobility', telephone: 'phone', email: 'email', linkedinUrl: 'LinkedIn' } as Record<string, string>,
    colon: ':', money: (n: number) => `€${n.toLocaleString('en-GB')}`, date: (d: Date) => d.toLocaleDateString('en-GB'),
    answer: 'Answer saved', note: 'Note added', task: 'Task created', due: 'due', moved: 'Application moved to', application: 'Application', on: 'on',
    updated: 'Updated in Propium', toApprove: 'To approve', approveWhy: 'These changes are visible to the client, so nothing happens until you approve them.',
    nothing: 'I didn’t find anything to update in your reply.', titleApprove: 'Updated, with changes to approve', titleDone: 'Propium updated',
    approveMany: 'Approve the changes', approve: 'Approve', subjectApprove: 'Propium updated · to approve', subjectDone: 'Propium updated',
    pageOk: 'Approved', pageNothing: 'Nothing to change: it was already done.', pageBad: 'Link expired or invalid',
    pageBadBody: 'This link is no longer valid. Reply to the email again, or make the change in Propium.', openNotes: 'Open Humanup Notes',
  },
  fr: {
    field: { disponibilite: 'préavis', salaireActuel: 'salaire actuel', salaireSouhaite: 'salaire souhaité', posteActuel: 'poste', entrepriseActuelle: 'entreprise', localisation: 'localisation', mobilite: 'mobilité', telephone: 'téléphone', email: 'email', linkedinUrl: 'LinkedIn' } as Record<string, string>,
    colon: ' :', money: (n: number) => `${n.toLocaleString('fr-FR')} €`, date: (d: Date) => d.toLocaleDateString('fr-FR'),
    answer: 'Réponse enregistrée', note: 'Note ajoutée', task: 'Tâche créée', due: 'pour le', moved: 'Candidature passée en', application: 'Candidature', on: 'le',
    updated: 'Mis à jour dans Propium', toApprove: 'À valider', approveWhy: 'Ces changements sont visibles du client : rien ne se fait tant que vous ne les validez pas.',
    nothing: 'Je n’ai rien trouvé à mettre à jour dans votre réponse.', titleApprove: 'Mis à jour, avec des changements à valider', titleDone: 'Propium mis à jour',
    approveMany: 'Valider les changements', approve: 'Valider', subjectApprove: 'Propium mis à jour · à valider', subjectDone: 'Propium mis à jour',
    pageOk: 'C’est validé', pageNothing: 'Rien à changer : c’était déjà fait.', pageBad: 'Lien expiré ou invalide',
    pageBadBody: 'Ce lien n’est plus valable. Répondez de nouveau à l’email, ou faites le changement dans Propium.', openNotes: 'Ouvrir Humanup Notes',
  },
} satisfies Record<Lang, unknown>;
export const replyText = (lang: Lang) => R[lang];
const quoted = (x: string, lang: Lang) => (lang === 'en' ? `"${x}"` : `« ${x} »`);
const CANDIDAT_FIELDS = ['posteActuel', 'entrepriseActuelle', 'localisation', 'disponibilite', 'salaireActuel', 'salaireSouhaite', 'mobilite', 'telephone', 'email', 'linkedinUrl'] as const;

type Action =
  | { type: 'update_candidat'; callId: string; fields: Record<string, unknown> }
  | { type: 'answer_question'; callId: string; questionId: string; answer: string }
  | { type: 'add_note'; callId: string; target: 'CANDIDAT' | 'MANDAT' | 'CLIENT'; text: string }
  | { type: 'create_task'; callId: string; titre: string; dueDate?: string | null }
  | { type: 'move_stage'; callId: string; stage: string; motif?: string | null; dateEntretienClient?: string | null };

const SYSTEM = `Tu traites la réponse par email d'un recruteur (cabinet Humanup) à un email de son assistant de prise de notes.
Il te donne en langage libre des infos à enregistrer dans l'ATS (Propium). Transforme-les en actions, sans rien inventer.
Actions possibles (callId = id du call concerné, parmi ceux listés) :
- update_candidat : fields parmi posteActuel, entrepriseActuelle, localisation, disponibilite (préavis ou date de dispo, texte court), salaireActuel et salaireSouhaite (entiers en euros bruts annuels : "95k" = 95000), mobilite, telephone, email, linkedinUrl.
- answer_question : réponse à une des questions du call (questionId parmi celles listées), en une phrase.
- add_note : une info utile qui ne rentre dans aucun champ (process concurrents, motivation, avis), target CANDIDAT, MANDAT ou CLIENT.
- create_task : une relance ou une action à faire, avec dueDate ISO (AAAA-MM-JJ) si une date est dite.
- move_stage : déplacer la candidature du candidat sur le mandat du call. stage parmi SOURCING, CONTACTE (Qualification), ENTRETIEN_1 (Entretien interne), ENVOYE_CLIENT (Envoi client), ENTRETIEN_CLIENT (Entretien client, avec dateEntretienClient ISO si connue), PROCESS, OFFRE, REFUSE (Perdu, avec motif). Seulement si le recruteur le demande clairement.
Une info qui correspond à un champ de la fiche (préavis, salaire, poste…) va TOUJOURS dans update_candidat, même si elle répond aussi à une question : fais alors les deux actions.
Si la réponse concerne plusieurs calls (email du soir), rattache chaque action au bon call d'après les noms.
Si l'étape demandée est déjà l'étape actuelle, ne crée pas de move_stage.
Si rien n'est exploitable, renvoie une liste vide et explique pourquoi dans "remarque".
Format exact de chaque action (respecte les noms de clés) :
{"type":"update_candidat","callId":"…","fields":{"disponibilite":"2 mois","salaireSouhaite":98000}}
{"type":"answer_question","callId":"…","questionId":"…","answer":"…"}
{"type":"add_note","callId":"…","target":"CANDIDAT","text":"…"}
{"type":"create_task","callId":"…","titre":"…","dueDate":"2026-11-20"}
{"type":"move_stage","callId":"…","stage":"ENVOYE_CLIENT","motif":null,"dateEntretienClient":null}
Réponds UNIQUEMENT en JSON : {"actions":[{"type":"...","callId":"...", ...}],"remarque":"<optionnel, une phrase>"}`;

async function callsForCode(userId: string, code: string) {
  if (code.startsWith('j')) {
    const y = Number(code.slice(1, 5)), mo = Number(code.slice(5, 7)) - 1, d = Number(code.slice(7, 9));
    const from = new Date(Date.UTC(y, mo, d) - 24 * 3600_000);
    const to = new Date(Date.UTC(y, mo, d) + 2 * 24 * 3600_000);
    return prisma.noteCall.findMany({ where: { startAt: { gte: from, lt: to }, OR: [{ userId }, { memberIds: { has: userId } }], callType: { not: 'INTERNE' } }, orderBy: { startAt: 'asc' } });
  }
  const ids = await prisma.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM note_calls WHERE replace(id::text, '-', '') LIKE ${code + '%'} LIMIT 1`;
  if (!ids.length) return [];
  const c = await prisma.noteCall.findUnique({ where: { id: ids[0].id } });
  return c && (c.userId === userId || c.memberIds.includes(userId)) ? [c] : [];
}

async function describeCall(c: any): Promise<string> {
  const lines = [`CALL ${c.id} : ${CALL_TYPE_LABEL[c.callType as CallType]} « ${c.titre} » le ${new Date(c.startAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`];
  if (c.candidatId) {
    const k = await prisma.candidat.findUnique({ where: { id: c.candidatId }, select: { prenom: true, nom: true, posteActuel: true, entrepriseActuelle: true, disponibilite: true, salaireActuel: true, salaireSouhaite: true, localisation: true } });
    if (k) lines.push(`Candidat : ${JSON.stringify(k)}`);
  }
  if (c.mandatId) {
    const m = await prisma.mandat.findUnique({ where: { id: c.mandatId }, select: { titrePoste: true, entreprise: { select: { nom: true } } } });
    if (m) lines.push(`Mandat : ${m.titrePoste} chez ${m.entreprise?.nom ?? '?'}`);
    if (c.candidatId) {
      const cand = await prisma.candidature.findUnique({ where: { mandatId_candidatId: { mandatId: c.mandatId, candidatId: c.candidatId } }, select: { stage: true } });
      lines.push(`Étape actuelle de la candidature : ${cand ? STAGE_LABEL[cand.stage] ?? cand.stage : 'pas encore de candidature'}`);
    }
  }
  if (c.clientId) {
    const cl = await prisma.client.findUnique({ where: { id: c.clientId }, select: { prenom: true, nom: true } });
    if (cl) lines.push(`Client : ${cl.prenom ?? ''} ${cl.nom}`);
  }
  const qs = ((c.questions as NoteQuestion[]) || []).map((q) => `  - [${q.id}] ${q.text}${q.answer ? ` (réponse actuelle : ${q.answer})` : ''}`);
  if (qs.length) lines.push(`Questions :\n${qs.join('\n')}`);
  return lines.join('\n');
}

// ─── Application ─────────────────────────────────────

interface Done { label: string; url?: string }

const toInt = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};

async function applyDirect(a: Action, call: any, userId: string, lang: Lang): Promise<Done | null> {
  const L = R[lang];
  if (a.type === 'update_candidat') {
    if (!call.candidatId) return null;
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(a.fields || {})) {
      if (!(CANDIDAT_FIELDS as readonly string[]).includes(k) || v == null || v === '') continue;
      if (k === 'salaireActuel' || k === 'salaireSouhaite') { const n = toInt(v); if (n) data[k] = n; }
      else data[k] = String(v).slice(0, k === 'disponibilite' ? 100 : 255);
    }
    if (!Object.keys(data).length) return null;
    const k = await prisma.candidat.update({ where: { id: call.candidatId }, data, select: { prenom: true, nom: true } });
    const what = Object.entries(data).map(([f, v]) => `${L.field[f] ?? f}${L.colon} ${typeof v === 'number' ? L.money(v) : v}`).join(', ');
    return { label: `${k.prenom ?? ''} ${k.nom}${L.colon} ${what}`.replace(/\s+/g, ' '), url: `${appUrl()}/candidats/${call.candidatId}` };
  }
  if (a.type === 'answer_question') {
    const qs = ((call.questions as NoteQuestion[]) || []);
    const q = qs.find((x) => x.id === a.questionId);
    if (!q || !a.answer?.trim()) return null;
    const next = qs.map((x) => (x.id === q.id ? { ...x, answer: a.answer.trim(), status: 'covered' as const, manual: true } : x));
    await prisma.noteCall.update({ where: { id: call.id }, data: { questions: next as any } });
    call.questions = next;
    if (q.trameId && call.mandatId && call.candidatId) {
      const cand = await prisma.candidature.findUnique({ where: { mandatId_candidatId: { mandatId: call.mandatId, candidatId: call.candidatId } } });
      if (cand) {
        const prev = ((cand as any).trameAnswers as any[]) || [];
        const merged = [...prev.filter((x) => x.questionId !== q.trameId), { questionId: q.trameId, answer: a.answer.trim(), source: 'humanup_notes_reply', filledAt: new Date().toISOString() }];
        await prisma.candidature.update({ where: { id: cand.id }, data: { trameAnswers: merged as any } });
      }
    }
    return { label: `${L.answer}${L.colon} ${q.text} → ${a.answer.trim()}`, url: `${appUrl()}/notes/${call.id}` };
  }
  if (a.type === 'add_note') {
    const entiteId = a.target === 'CANDIDAT' ? call.candidatId : a.target === 'MANDAT' ? call.mandatId : call.clientId;
    if (!entiteId || !a.text?.trim()) return null;
    await prisma.activite.create({ data: { type: 'NOTE', titre: lang === 'en' ? 'Note (email reply)' : 'Note (réponse email)', contenu: a.text.trim(), source: 'AGENT_IA', entiteType: a.target, entiteId, userId, metadata: { source: 'humanup_notes_reply', noteCallId: call.id } } });
    const path = a.target === 'CANDIDAT' ? 'candidats' : a.target === 'MANDAT' ? 'mandats' : 'clients';
    return { label: `${L.note}${L.colon} ${a.text.trim().slice(0, 140)}`, url: `${appUrl()}/${path}/${entiteId}` };
  }
  if (a.type === 'create_task') {
    if (!a.titre?.trim()) return null;
    const due = a.dueDate && !Number.isNaN(new Date(a.dueDate).getTime()) ? new Date(`${a.dueDate.slice(0, 10)}T09:00:00`) : new Date(Date.now() + 2 * 86400_000);
    const entiteType = call.candidatId ? 'CANDIDAT' : call.clientId ? 'CLIENT' : call.mandatId ? 'MANDAT' : null;
    const entiteId = call.candidatId ?? call.clientId ?? call.mandatId ?? null;
    await prisma.activite.create({ data: { type: 'TACHE', isTache: true, tacheDueDate: due, userId, titre: a.titre.trim().slice(0, 500), source: 'AGENT_IA', entiteType: entiteType as any, entiteId, metadata: { source: 'humanup_notes_reply', noteCallId: call.id } } });
    return { label: `${L.task}${L.colon} ${a.titre.trim()} (${L.due} ${L.date(due)})`, url: `${appUrl()}/taches` };
  }
  return null;
}

async function applyMoveStage(a: Extract<Action, { type: 'move_stage' }>, userId: string, lang: Lang): Promise<Done | null> {
  const call = await prisma.noteCall.findUnique({ where: { id: a.callId } });
  if (!call?.mandatId || !call.candidatId || !(STAGES as readonly string[]).includes(a.stage)) return null;
  let cand = await prisma.candidature.findUnique({ where: { mandatId_candidatId: { mandatId: call.mandatId, candidatId: call.candidatId } } });
  if (!cand) cand = await prisma.candidature.create({ data: { mandatId: call.mandatId, candidatId: call.candidatId, stage: 'CONTACTE', createdById: userId } });
  const updates: Record<string, unknown> = { stage: a.stage };
  if (a.stage === 'REFUSE') updates.motifRefusDetail = a.motif || 'Indiqué par réponse email';
  if (a.stage === 'ENTRETIEN_CLIENT' && a.dateEntretienClient) {
    const raw = String(a.dateEntretienClient);
    updates.dateEntretienClient = raw.includes('T') ? raw : new Date(`${raw.slice(0, 10)}T09:00:00`).toISOString();
  }
  await candidatureService.update(cand.id, updates as any, userId);
  return { label: `${R[lang].moved} ${quoted(stageName(a.stage, lang), lang)}`, url: `${appUrl()}/mandats/${call.mandatId}` };
}

async function stageLabelFor(a: Extract<Action, { type: 'move_stage' }>, lang: Lang): Promise<string> {
  const L = R[lang];
  const call = await prisma.noteCall.findUnique({ where: { id: a.callId }, select: { candidatId: true, titre: true } });
  const k = call?.candidatId ? await prisma.candidat.findUnique({ where: { id: call.candidatId }, select: { prenom: true, nom: true } }) : null;
  return `${k ? `${k.prenom ?? ''} ${k.nom}`.trim() : call?.titre ?? L.application} → ${quoted(stageName(a.stage, lang), lang)}${a.dateEntretienClient ? ` ${L.on} ${L.date(new Date(a.dateEntretienClient))}` : ''}${a.motif ? ` (${a.motif})` : ''}`;
}

export async function confirmToken(userId: string, actions: Action[]): Promise<string> {
  return new SignJWT({ sub: userId, type: 'notes_confirm', actions })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret());
}

/** Lien « Valider » de l'email de retour. Rejouer le lien ne fait rien de plus (même étape). */
/** Applique les changements validés ; renvoie aussi la langue du membre pour la page de retour. */
export async function applyConfirmToken(token: string): Promise<{ done: Done[]; lang: Lang }> {
  const { payload } = await jwtVerify(token, secret());
  if (payload.type !== 'notes_confirm' || typeof payload.sub !== 'string') throw new Error('Lien invalide');
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { status: true } });
  if (!user || user.status === 'ARCHIVED') throw new Error('Compte inactif');
  const { lang } = await getUserLocale(payload.sub);
  const done: Done[] = [];
  for (const a of (payload.actions as Action[]) || []) {
    if (a.type !== 'move_stage') continue;
    const call = await prisma.noteCall.findUnique({ where: { id: a.callId }, select: { userId: true, memberIds: true } });
    if (!call || (call.userId !== payload.sub && !call.memberIds.includes(payload.sub))) continue;
    const r = await applyMoveStage(a, payload.sub, lang);
    if (r) done.push(r);
  }
  return { done, lang };
}

// ─── Traitement d'une réponse ────────────────────────

export async function processReply(userId: string, code: string, text: string): Promise<{ done: Done[]; pending: string[]; remarque: string | null }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, prenom: true } });
  const calls = await callsForCode(userId, code);
  if (!user || !calls.length || !text.trim()) return { done: [], pending: [], remarque: calls.length ? 'Réponse vide.' : 'Call introuvable.' };

  const ctx = (await Promise.all(calls.map(describeCall))).join('\n\n');
  const { lang } = await getUserLocale(userId);
  const res = await callClaude({
    feature: 'notes_reply',
    preferAnthropic: true,
    userId,
    systemPrompt: `${SYSTEM}\n${promptLanguageLine(lang, '"remarque"')}`,
    userPrompt: `Date du jour : ${new Date().toISOString().slice(0, 10)}\n\n${ctx}\n\nRÉPONSE DU RECRUTEUR :\n${text.slice(0, 6000)}`,
    maxTokens: 1500,
    temperature: 0,
  });
  if (process.env.NOTES_REPLY_DEBUG) console.log('[Notes] Réponse lue :', JSON.stringify(res.content));
  const actions = ((res.content?.actions ?? []) as any[])
    .filter((a) => a && calls.some((c) => c.id === a.callId))
    .map((a) => ({ ...a, text: a.text ?? a.content ?? a.note, titre: a.titre ?? a.title, answer: a.answer ?? a.reponse })) as Action[];
  const byId = new Map(calls.map((c) => [c.id, c as any]));
  const done: Done[] = [];
  const toConfirm: Extract<Action, { type: 'move_stage' }>[] = [];
  for (const a of actions) {
    try {
      if (a.type === 'move_stage') { toConfirm.push(a); continue; }
      const r = await applyDirect(a, byId.get(a.callId), userId, lang);
      if (r) done.push(r);
    } catch (err) {
      console.error('[Notes] Action de réponse impossible:', a.type, (err as Error).message);
    }
  }
  const pending = await Promise.all(toConfirm.map((a) => stageLabelFor(a, lang)));
  const link = toConfirm.length ? `${appUrl()}/api/v1/notes/reply/confirm?t=${encodeURIComponent(await confirmToken(userId, toConfirm))}` : null;
  await sendFeedbackEmail(user.email, code, done, pending, link, (res.content?.remarque as string) || null, lang);
  return { done, pending, remarque: (res.content?.remarque as string) || null };
}

async function sendFeedbackEmail(to: string, code: string, done: Done[], pending: string[], confirmUrl: string | null, remarque: string | null, lang: Lang) {
  const L = R[lang];
  const a = (d: Done) => (d.url ? `<a href="${d.url}" style="color:${C.primary};">${escapeHtml(d.label)}</a>` : escapeHtml(d.label));
  const body = `
    ${done.length ? `<h3 style="margin:0 0 6px 0;font-size:15px;">${escapeHtml(L.updated)}</h3><ul style="margin:0 0 0 18px;padding:0;">${done.map((d) => `<li style="margin-bottom:4px;">${a(d)}</li>`).join('')}</ul>` : ''}
    ${pending.length ? `<h3 style="margin:18px 0 6px 0;font-size:15px;color:${C.warn};">${escapeHtml(L.toApprove)}</h3><p style="margin:0 0 6px 0;font-size:13px;color:${C.muted};">${escapeHtml(L.approveWhy)}</p><ul style="margin:0 0 0 18px;padding:0;">${pending.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
    ${!done.length && !pending.length ? `<p>${escapeHtml(L.nothing)}${remarque ? ` ${escapeHtml(remarque)}` : ''}</p>` : remarque ? `<p style="margin-top:12px;color:${C.muted};font-size:13px;">${escapeHtml(remarque)}</p>` : ''}
    ${lang === 'en' ? REPLY_HINT_HTML : REPLY_HINT_HTML_FR}`;
  const html = renderBrandedEmail({
    lang,
    title: pending.length ? L.titleApprove : L.titleDone,
    bodyHtml: body,
    ...(confirmUrl ? { cta: { label: pending.length > 1 ? L.approveMany : L.approve, href: confirmUrl } } : {}),
  });
  await sendEmail(to, pending.length ? L.subjectApprove : L.subjectDone, html, undefined, { from: FROM(), replyTo: replyAddress(to, code) });
}

// ─── Relève (toutes les 2 min) ───────────────────────

export async function pollRepliesForUser(userId: string): Promise<number> {
  const g = await gmailToken(userId);
  if (!g) return 0;
  const since = g.cfg.lastNotesReplyCheck ? new Date(g.cfg.lastNotesReplyCheck) : new Date(Date.now() - 60 * 60_000);
  const seen = new Set<string>((g.cfg.notesReplySeen as string[]) || []);
  const startedAt = new Date();
  let count = 0;
  try {
    // Marge de 10 min : Gmail filtre « after: » à la seconde près mais l'indexation a du retard.
    const replies = await fetchReplies(g.token, new Date(since.getTime() - 10 * 60_000), seen);
    for (const r of replies) {
      seen.add(r.id);
      try {
        await processReply(userId, r.code, r.text);
        count++;
      } catch (err) {
        console.error(`[Notes] Réponse ${r.id}:`, (err as Error).message);
      }
    }
  } finally {
    const fresh = await prisma.integrationConfig.findUnique({ where: { id: g.configId }, select: { config: true } });
    const cfg = (fresh?.config as Record<string, any>) || {};
    await prisma.integrationConfig.update({
      where: { id: g.configId },
      data: { config: { ...cfg, lastNotesReplyCheck: startedAt.toISOString(), notesReplySeen: [...seen].slice(-300) } },
    });
  }
  return count;
}

export async function pollAllReplies(): Promise<void> {
  const configs = await prisma.integrationConfig.findMany({ where: { provider: 'gmail', enabled: true, accessToken: { not: null } }, select: { userId: true } });
  for (const c of configs) {
    const u = await prisma.user.findUnique({ where: { id: c.userId }, select: { status: true } });
    if (u?.status === 'ARCHIVED') continue;
    try { await pollRepliesForUser(c.userId); }
    catch (err) { console.error(`[Notes] Relève des réponses ${c.userId}:`, (err as Error).message); }
  }
}
