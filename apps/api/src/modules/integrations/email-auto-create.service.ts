/**
 * Synchro Gmail → ATS (toutes les 15 minutes).
 *
 * Règles (validées 2026-11-26) :
 *  1. Emails reçus ET envoyés : chaque email est enregistré sur la fiche de chaque
 *     interlocuteur connu (expéditeur, destinataires, copies).
 *  2. Tous les participants comptent, une entrée par personne et par email.
 *  3. Tous les dossiers Gmail sauf spam, corbeille, promotions, réseaux sociaux, forums.
 *  4. Robot = lien de désinscription, envoi en masse ou adresse no-reply : ignoré.
 *     Une adresse générique (contact@, hello@…) n'est plus écartée pour ce seul motif.
 *  5. Interlocuteur inconnu : l'IA lit l'email et décide candidat / entreprise / à ignorer.
 *  6. Côté entreprise : client si l'entreprise est sous contrat, sinon Lead
 *     (voir contact-resolver.service.ts).
 *  7. Texte complet gardé (10 000 caractères max) + pièces jointes ; un CV envoyé par
 *     un candidat qui n'en a pas encore est ajouté à sa fiche.
 *  8. Contact avec un seul mandat en cours : l'email est rattaché à ce mandat.
 *
 * Les envois de profil sans pièce jointe (lien portail, profil dans le texte) sont
 * repérés par l'IA et passent par la détection des CV envoyés (push-detect).
 *
 * Reprise : un curseur (config.emailSyncCursor) avance email par email, du plus
 * ancien au plus récent. Une (re)connexion le remet 30 jours en arrière.
 */

import prisma from '../../lib/db.js';
import { matchEmail } from './gmail.service.js';
import {
  AiBudget, AiBudgetExhausted, aiIsAvailable, domainOf, findLeadByEmail, logOnLead,
  resolveUnknownContact, type Resolution, type ResolverStats,
} from './contact-resolver.service.js';

// ─── TYPES ──────────────────────────────────────────

interface Address {
  name: string | null;
  email: string;
}

interface Attachment {
  filename: string;
  mimeType: string;
  attachmentId?: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  rfcMessageId: string | null;
  internalDate: number;
  labelIds: string[];
  from: Address;
  to: Address[];
  cc: Address[];
  subject: string;
  snippet: string;
  body: string;
  headers: Record<string, string>;
  attachments: Attachment[];
}

interface EmailAutoCreateStats {
  candidats: number;
  clients: number;
  entreprises: number;
  leads: number;
  activities: number;
  skipped: number;
}

type Participant = Address & { role: 'from' | 'to' | 'cc' };

interface Match {
  type: 'CANDIDAT' | 'CLIENT';
  id: string;
  created?: boolean;
}

interface RunContext {
  userId: string;
  token: string;
  selfEmails: Set<string>;
  budget: AiBudget;
  stats: EmailAutoCreateStats & ResolverStats;
}

// ─── CONSTANTES ─────────────────────────────────────

const INTERNAL_DOMAINS = ['humanup.io'];
const MAX_MESSAGES_PER_RUN = 150;
const MAX_AI_PER_RUN = 40;
const MAX_BODY = 10_000;
const DEFAULT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

/** Adresses de robots (règle 4) : pas de vraie personne derrière. */
const ROBOT_PREFIXES = [
  'no-reply', 'noreply', 'no_reply', 'donotreply', 'do-not-reply', 'do_not_reply',
  'mailer-daemon', 'postmaster', 'bounce', 'bounces',
  'notification', 'notifications', 'notify', 'alert', 'alerts',
  'newsletter', 'news', 'marketing', 'promo', 'promotions',
  'billing', 'invoice', 'invoices', 'receipt', 'receipts', 'facturation', 'factures',
  'order', 'orders', 'shipping', 'calendar-notification', 'drive-shares-dm-noreply',
];

/** Domaines de services (outils, réseaux sociaux, emailing) : jamais des contacts. */
const AUTOMATED_DOMAINS = [
  'github.com', 'gitlab.com', 'bitbucket.org',
  'slack.com', 'notion.so', 'linear.app', 'figma.com',
  'vercel.com', 'netlify.com', 'heroku.com', 'railway.app',
  'stripe.com', 'paypal.com', 'wise.com',
  'google.com', 'accounts.google.com', 'googlegroups.com',
  'linkedin.com', 'twitter.com', 'x.com', 'facebook.com', 'facebookmail.com', 'instagram.com',
  'monday.com', 'asana.com', 'trello.com', 'atlassian.com', 'atlassian.net',
  'zoom.us', 'calendly.com',
  'mailchimp.com', 'mcsv.net', 'sendinblue.com', 'brevo.com', 'hubspot.com', 'hubspotemail.net', 'intercom.io', 'intercom-mail.com',
  'sentry.io', 'datadoghq.com', 'pagerduty.com',
  'amazonses.com', 'sendgrid.net', 'mailgun.org', 'mandrillapp.com',
  'docusign.net', 'yousign.com', 'withallo.com', 'crisp.chat',
  'welcometothejungle.com', 'indeed.com', 'hellowork.com', 'apec.fr', 'francetravail.fr',
];

const CV_FILE = /\.(pdf|docx?|odt)$/i;
const NON_CV = /\b(facture|invoice|devis|contrat|contract|proforma|bon de commande|rib|kbis|attestation|bulletin|paie|honoraires?|avoir|acompte|relev[ée])\b/i;
const SUBMISSION_HINT = /\b(profil|profile|candidat|candidate|cv|r[ée]sum[ée]|shortlist|pr[ée]sente?r?|propos(?:e|er|ition)|portail|portal)\b|ats\.propium\.co/i;

// ─── PARSING ────────────────────────────────────────

/** "Jean Dupont <jean@x.fr>, \"Martin, Paul\" <paul@y.fr>" → adresses. */
export function parseAddressList(header: string | undefined): Address[] {
  if (!header) return [];
  const out: Address[] = [];
  const re = /(?:"([^"]*)"|([^,<"]*?))\s*<([^>]+)>|([^\s,<>"]+@[^\s,<>"]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(header)) !== null) {
    const email = (m[3] || m[4] || '').trim().toLowerCase();
    if (!email.includes('@')) continue;
    const name = (m[1] ?? m[2] ?? '').trim().replace(/^'+|'+$/g, '') || null;
    out.push({ name: name && name.toLowerCase() !== email ? name : null, email });
  }
  return out;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

function walkParts(part: any, acc: { plain: string[]; html: string[]; attachments: Attachment[] }) {
  if (!part) return;
  if (part.filename && part.filename.trim()) {
    acc.attachments.push({ filename: part.filename.trim(), mimeType: part.mimeType || '', attachmentId: part.body?.attachmentId });
  } else if (part.body?.data) {
    if (part.mimeType === 'text/plain') acc.plain.push(decodeBase64Url(part.body.data));
    else if (part.mimeType === 'text/html') acc.html.push(decodeBase64Url(part.body.data));
  }
  for (const p of part.parts || []) walkParts(p, acc);
}

/** Retire l'historique cité (« Le … a écrit : », lignes « > ») pour garder le message lui-même. */
function stripQuoted(text: string): string {
  const cut = text.search(/\n(?:Le .{5,120}a écrit\s*:|On .{5,120}wrote\s*:|-{2,}\s*Original Message|De\s*:.*\n.*Envoy[ée])/i);
  const kept = cut > 0 ? text.slice(0, cut) : text;
  return kept
    .split('\n')
    .filter((l) => !/^\s*>/.test(l))
    .join('\n')
    .trim();
}

function parseMessage(d: any): GmailMessage {
  const headers: Record<string, string> = {};
  for (const h of d.payload?.headers || []) headers[String(h.name).toLowerCase()] = h.value;
  const acc = { plain: [] as string[], html: [] as string[], attachments: [] as Attachment[] };
  walkParts(d.payload, acc);
  const raw = acc.plain.length ? acc.plain.join('\n') : htmlToText(acc.html.join('\n'));
  const body = stripQuoted(raw).slice(0, MAX_BODY);
  return {
    id: d.id,
    threadId: d.threadId,
    rfcMessageId: headers['message-id'] || null,
    internalDate: Number(d.internalDate || Date.now()),
    labelIds: d.labelIds || [],
    from: parseAddressList(headers['from'])[0] || { name: null, email: '' },
    to: parseAddressList(headers['to']),
    cc: parseAddressList(headers['cc']),
    subject: headers['subject'] || '(sans objet)',
    snippet: d.snippet || '',
    body,
    headers,
    attachments: acc.attachments,
  };
}

const isInternal = (email: string) => INTERNAL_DOMAINS.includes(domainOf(email));

export function isRobotAddress(email: string): boolean {
  const local = email.split('@')[0].toLowerCase();
  const domain = domainOf(email);
  if (ROBOT_PREFIXES.some((p) => local === p || local.startsWith(`${p}-`) || local.startsWith(`${p}.`) || local.startsWith(`${p}_`) || local.startsWith(`${p}+`))) return true;
  if (/^(no-?reply|do-?not-?reply|mailer-daemon)/.test(local)) return true;
  return AUTOMATED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** En-têtes d'emailing : un email avec désinscription ou envoi en masse est un robot. */
function hasBulkHeaders(headers: Record<string, string>): boolean {
  if (headers['list-unsubscribe'] || headers['list-id']) return true;
  const prec = (headers['precedence'] || '').toLowerCase();
  if (prec === 'bulk' || prec === 'list' || prec === 'junk') return true;
  const auto = (headers['auto-submitted'] || '').toLowerCase();
  if (auto && auto !== 'no') return true;
  return false;
}

// ─── GMAIL API ──────────────────────────────────────

async function gmailGet(token: string, path: string): Promise<any> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Identifiants des emails depuis le curseur, tous dossiers utiles (règle 3). */
async function listMessageIds(token: string, since: Date): Promise<string[]> {
  const after = Math.floor(since.getTime() / 1000);
  const q = `after:${after} -in:spam -in:trash -in:chats -category:promotions -category:social -category:forums`;
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ q, maxResults: '200' });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await gmailGet(token, `/messages?${params}`);
    for (const m of data.messages || []) ids.push(m.id);
    pageToken = data.nextPageToken;
  } while (pageToken && ids.length < 2000);
  return ids;
}

async function fetchMessages(token: string, ids: string[]): Promise<GmailMessage[]> {
  const out: GmailMessage[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    const results = await Promise.all(batch.map(async (id) => {
      try {
        return parseMessage(await gmailGet(token, `/messages/${id}?format=full`));
      } catch (err) {
        console.warn(`[EmailSync] lecture ${id} impossible:`, err instanceof Error ? err.message : err);
        return null;
      }
    }));
    for (const r of results) if (r) out.push(r);
  }
  return out;
}

// ─── IA : envoi de profil sans pièce jointe ─────────

/** Envoi de profil sans pièce jointe : l'IA confirme et donne le nom du candidat. */
async function detectSubmission(ctx: RunContext, msg: GmailMessage): Promise<string[]> {
  ctx.budget.take();
  const { callTriageAi } = await import('./contact-resolver.service.js');
  const res = await callTriageAi({
    feature: 'email_triage',
    userId: ctx.userId,
    maxTokens: 200,
    systemPrompt: `Un recruteur a envoyé cet email à un client. Dis s'il lui présente un ou plusieurs candidats (profil décrit, lien vers un profil ou un portail, CV en lien). Une simple relance, une prise de rendez-vous ou une discussion commerciale ne compte pas.
Réponds uniquement en JSON : {"presente_candidat": true|false, "candidats": ["Prénom Nom"]}.`,
    userPrompt: JSON.stringify({ objet: msg.subject, texte: msg.body.slice(0, 3000) || msg.snippet }),
  });
  const c = res.content;
  if (!c?.presente_candidat || !Array.isArray(c.candidats)) return [];
  return c.candidats.filter((n: unknown) => typeof n === 'string' && n.trim().split(/\s+/).length >= 2);
}

// ─── RATTACHEMENT ───────────────────────────────────

/** Règle 8 : un seul mandat en cours pour ce contact → l'email y est rattaché. */
async function mandatOf(match: Match): Promise<{ mandatId: string; candidatureId?: string } | null> {
  if (match.type === 'CANDIDAT') {
    const cands = await prisma.candidature.findMany({
      where: { candidatId: match.id, stage: { notIn: ['REFUSE', 'PLACE'] as any }, mandat: { statut: { in: ['OUVERT', 'EN_COURS'] } } },
      select: { id: true, mandatId: true },
      take: 2,
    });
    return cands.length === 1 ? { mandatId: cands[0].mandatId, candidatureId: cands[0].id } : null;
  }
  const client = await prisma.client.findUnique({ where: { id: match.id }, select: { entrepriseId: true } });
  if (!client?.entrepriseId) return null;
  const mandats = await prisma.mandat.findMany({
    where: { entrepriseId: client.entrepriseId, statut: { in: ['OUVERT', 'EN_COURS'] } },
    select: { id: true },
    take: 2,
  });
  return mandats.length === 1 ? { mandatId: mandats[0].id } : null;
}

// ─── TRAITEMENT D'UN EMAIL ──────────────────────────

async function alreadyLogged(msg: GmailMessage, userId: string): Promise<Set<string>> {
  const or: any[] = [{ userId, metadata: { path: ['gmailMessageId'], equals: msg.id } }];
  if (msg.rfcMessageId) or.push({ metadata: { path: ['rfcMessageId'], equals: msg.rfcMessageId } });
  const rows = await prisma.activite.findMany({
    where: { type: 'EMAIL', source: 'GMAIL', OR: or },
    select: { entiteId: true },
  });
  return new Set(rows.map((r) => r.entiteId).filter((x): x is string => !!x));
}

/** Règle 7 : CV joint (PDF ou Word) par un candidat sans CV sur sa fiche. */
async function attachCvIfMissing(ctx: RunContext, candidatId: string, msg: GmailMessage): Promise<boolean> {
  const pdf = msg.attachments.find((a) => /\.pdf$/i.test(a.filename) && !NON_CV.test(a.filename));
  const word = pdf ? undefined : msg.attachments.find((a) => /\.docx$/i.test(a.filename) && !NON_CV.test(a.filename) && a.attachmentId);
  if (!pdf && !word) return false;
  const candidat = await prisma.candidat.findUnique({ where: { id: candidatId }, select: { cvUrl: true } });
  if (!candidat || candidat.cvUrl) return false;
  const nom = (pdf || word)!.filename;
  try {
    const cv = await import('../candidats/cv-upload.service.js');
    if (pdf) {
      const file = await cv.readCvSource(ctx.userId, { gmailMessageId: msg.id, attachmentName: pdf.filename });
      await cv.attachCv(candidatId, ctx.userId, file);
    } else {
      const att = await gmailGet(ctx.token, `/messages/${msg.id}/attachments/${word!.attachmentId}`);
      const buffer = Buffer.from(String(att.data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      const { wordCvToPdf } = await import('../candidats/cv-word.service.js');
      const converted = await wordCvToPdf(candidatId, buffer, word!.filename);
      await cv.attachCv(candidatId, ctx.userId, { ...converted, origin: 'gmail' });
    }
    console.log(`[EmailSync] CV ajouté à la fiche ${candidatId} (${nom})`);
    return true;
  } catch (err) {
    console.warn(`[EmailSync] CV non ajouté (${nom}):`, err instanceof Error ? err.message : err);
    return false;
  }
}

async function processMessage(ctx: RunContext, msg: GmailMessage): Promise<void> {
  const fromSelf = ctx.selfEmails.has(msg.from.email);
  const direction: 'ENTRANT' | 'SORTANT' = msg.labelIds.includes('SENT') || fromSelf ? 'SORTANT' : 'ENTRANT';

  // Règle 4 : robot → rien.
  if (direction === 'ENTRANT' && (!msg.from.email || isRobotAddress(msg.from.email) || hasBulkHeaders(msg.headers))) {
    ctx.stats.skipped++;
    return;
  }

  // Règle 2 : tous les participants externes.
  const raw: Participant[] = direction === 'ENTRANT'
    ? [{ ...msg.from, role: 'from' }, ...msg.to.map((a) => ({ ...a, role: 'to' as const })), ...msg.cc.map((a) => ({ ...a, role: 'cc' as const }))]
    : [...msg.to.map((a) => ({ ...a, role: 'to' as const })), ...msg.cc.map((a) => ({ ...a, role: 'cc' as const }))];
  const seen = new Set<string>();
  const people = raw.filter((p) => {
    if (!p.email || seen.has(p.email)) return false;
    seen.add(p.email);
    return !ctx.selfEmails.has(p.email) && !isInternal(p.email) && !isRobotAddress(p.email);
  });
  if (!people.length) {
    ctx.stats.skipped++;
    return;
  }

  const logged = await alreadyLogged(msg, ctx.userId);
  const contacts: Array<{ person: Participant; match: Match }> = [];

  for (const person of people) {
    const found = await matchEmail(person.email);
    let match: Match | null = found ? { type: found.type, id: found.id } : null;
    if (!match) {
      let lead = await findLeadByEmail(person.email);
      // Personne en copie d'un email reçu : on ne crée pas de fiche, on ne l'enregistre que si elle est connue.
      if (!lead && !(direction === 'ENTRANT' && person.role === 'cc')) {
        const r: Resolution = await resolveUnknownContact(ctx.userId, person, {
          origine: 'email',
          sens: direction,
          objet: msg.subject,
          texte: msg.body || msg.snippet,
          piecesJointes: msg.attachments.map((a) => a.filename),
          expediteur: msg.from.email,
        }, ctx.budget, ctx.stats);
        if (r?.type === 'LEAD') lead = { id: r.id };
        else if (r) match = { type: r.type, id: r.id, created: true };
      }
      if (lead) {
        const text = `${direction === 'ENTRANT' ? 'Email reçu' : 'Email envoyé'} : ${msg.subject}\n${msg.snippet}`.trim();
        await logOnLead(lead.id, ctx.userId, 'email', text, new Date(msg.internalDate));
        continue;
      }
    }
    if (match) contacts.push({ person, match });
  }

  for (const { person, match } of contacts) {
    if (logged.has(match.id)) continue;
    const mandat = await mandatOf(match);
    await prisma.activite.create({
      data: {
        type: 'EMAIL',
        direction,
        entiteType: match.type,
        entiteId: match.id,
        userId: ctx.userId,
        titre: `${direction === 'ENTRANT' ? 'Email reçu' : 'Email envoyé'} : ${msg.subject}`,
        contenu: msg.body || msg.snippet,
        source: 'GMAIL',
        createdAt: new Date(msg.internalDate),
        metadata: {
          gmailMessageId: msg.id,
          rfcMessageId: msg.rfcMessageId,
          threadId: msg.threadId,
          from: msg.headers['from'] || msg.from.email,
          to: msg.to.map((a) => a.email),
          cc: msg.cc.map((a) => a.email),
          subject: msg.subject,
          attachments: msg.attachments.map((a) => a.filename),
          participantRole: person.role,
          autoCreated: !!match.created,
          ...(match.created ? { autoCreatedType: match.type } : {}),
          ...(mandat ? { mandatId: mandat.mandatId, candidatureId: mandat.candidatureId ?? null } : {}),
        },
      },
    });
    ctx.stats.activities++;

    if (match.type === 'CANDIDAT' && direction === 'ENTRANT' && person.role === 'from') {
      await attachCvIfMissing(ctx, match.id, msg);
    }
  }

  // Envoi d'un profil au client sans pièce jointe (les envois avec CV joint passent par push-detect).
  if (direction === 'SORTANT' && ctx.budget.available && !msg.attachments.some((a) => CV_FILE.test(a.filename))) {
    const toClient = contacts.some((c) => c.match.type === 'CLIENT' && c.person.role !== 'cc');
    if (toClient && SUBMISSION_HINT.test(`${msg.subject}\n${msg.body}`)) {
      const names = await detectSubmission(ctx, msg);
      if (names.length) {
        const push = await import('./push-detect.service.js');
        for (const name of names) {
          await push.recordSubmissionWithoutAttachment(ctx.userId, {
            id: msg.id,
            to: msg.to.map((a) => a.email),
            toRaw: (msg.headers['to'] || '').split(',').map((s) => s.trim()).filter(Boolean),
            subject: msg.subject,
            date: new Date(msg.internalDate),
            snippet: msg.snippet,
          }, name);
        }
      }
    }
  }
}

// ─── ENTRÉES ────────────────────────────────────────

/** Synchro d'un utilisateur : avance le curseur email par email. */
export async function processIncomingEmailsForUser(userId: string): Promise<EmailAutoCreateStats> {
  const stats: EmailAutoCreateStats = { candidats: 0, clients: 0, entreprises: 0, leads: 0, activities: 0, skipped: 0 };

  const config = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: 'gmail' } },
  });
  if (!config || !config.enabled) return stats;

  const { getGoogleAccessToken } = await import('./google-auth.service.js');
  const token = await getGoogleAccessToken(userId);
  if (!token) return stats;

  const conf = (config.config as Record<string, any>) || {};
  const cursor = conf.emailSyncCursor
    ? new Date(conf.emailSyncCursor)
    : new Date(Date.now() - DEFAULT_LOOKBACK_MS);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const selfEmails = new Set([conf.email, user?.email].filter(Boolean).map((e: string) => e.toLowerCase()));

  const ctx: RunContext = {
    userId,
    token,
    selfEmails,
    budget: await new AiBudget(MAX_AI_PER_RUN, aiIsAvailable()).load(userId),
    stats: Object.assign(stats, { candidats: 0, clients: 0, entreprises: 0, leads: 0 }),
  };

  // Gmail filtre à la seconde près et renvoie du plus récent au plus ancien :
  // on lit tout depuis le curseur puis on traite dans l'ordre chronologique.
  // La liste arrive du plus récent au plus ancien : on ne lit en détail que les plus anciens.
  const ids = (await listMessageIds(token, new Date(cursor.getTime() - 60_000))).reverse();
  const batch = ids.slice(0, MAX_MESSAGES_PER_RUN + 30);
  const messages = (await fetchMessages(token, batch))
    .filter((m) => m.internalDate > cursor.getTime())
    .sort((a, b) => a.internalDate - b.internalDate);

  let newCursor = cursor.getTime();
  let processed = 0;
  for (const msg of messages) {
    if (processed >= MAX_MESSAGES_PER_RUN) break;
    try {
      await processMessage(ctx, msg);
    } catch (err) {
      if (err instanceof AiBudgetExhausted) break; // reprise au prochain passage, sur ce même email
      console.error(`[EmailSync] email ${msg.id} non traité:`, err);
      stats.skipped++;
    }
    newCursor = msg.internalDate;
    processed++;
  }
  // Tout est lu : le curseur rattrape le présent (marge de 2 min pour les emails en cours d'arrivée).
  if (processed === messages.length && batch.length === ids.length) newCursor = Math.max(newCursor, Date.now() - 2 * 60_000);

  await ctx.budget.save(userId);
  const fresh = await prisma.integrationConfig.findUnique({ where: { id: config.id }, select: { config: true } });
  await prisma.integrationConfig.update({
    where: { id: config.id },
    data: { config: { ...((fresh?.config as Record<string, any>) || {}), emailSyncCursor: new Date(newCursor).toISOString() } },
  });

  return stats;
}

/** Synchro de tous les utilisateurs connectés à Gmail (cron). */
export async function processAllIncomingEmails(): Promise<EmailAutoCreateStats> {
  const total: EmailAutoCreateStats = { candidats: 0, clients: 0, entreprises: 0, leads: 0, activities: 0, skipped: 0 };
  const configs = await prisma.integrationConfig.findMany({
    where: { provider: 'gmail', enabled: true },
    select: { userId: true },
  });
  for (const { userId } of configs) {
    try {
      const s = await processIncomingEmailsForUser(userId);
      (Object.keys(total) as Array<keyof EmailAutoCreateStats>).forEach((k) => { total[k] += s[k]; });
    } catch (err) {
      console.error(`[EmailSync] utilisateur ${userId}:`, err);
    }
  }
  if (total.activities + total.candidats + total.clients > 0) {
    console.log(
      `[EmailSync] ${total.activities} emails enregistrés, ${total.candidats} candidats, ${total.clients} clients, ` +
      `${total.entreprises} entreprises créés, ${total.leads} leads, ${total.skipped} ignorés`,
    );
  }
  return total;
}

