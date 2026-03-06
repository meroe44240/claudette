/**
 * Email Auto-Create Service
 *
 * Parses incoming Gmail emails and automatically creates:
 *  - Email perso (@gmail.com, etc.) → Candidat
 *  - Email pro  (@company.com)      → Entreprise + Client
 *  - Email @humanup.io              → SKIP (internal)
 *  - Email already in DB            → SKIP creation, log activity only
 *
 * Cron: every 15 minutes.
 */

import prisma from '../../lib/db.js';
import { isPersonalEmail } from './allo.service.js';
import { matchEmail } from './gmail.service.js';

// ─── TYPES ──────────────────────────────────────────

interface ParsedSender {
  name: string | null;
  email: string;
  firstName: string;
  lastName: string;
}

interface SignatureInfo {
  phone?: string;
  title?: string;
  company?: string;
  website?: string;
}

interface EmailAutoCreateStats {
  candidats: number;
  clients: number;
  entreprises: number;
  activities: number;
  skipped: number;
}

// ─── CONSTANTS ──────────────────────────────────────

const INTERNAL_DOMAINS = ['humanup.io'];

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';

/** Prefixes that indicate automated / no-reply senders */
const AUTOMATED_PREFIXES = [
  'no-reply', 'noreply', 'no_reply', 'donotreply', 'do-not-reply',
  'notifications', 'notification', 'notify', 'alert', 'alerts',
  'newsletter', 'news', 'marketing', 'promo', 'info', 'contact',
  'support', 'help', 'admin', 'system', 'mailer-daemon', 'postmaster',
  'billing', 'invoice', 'receipt', 'order', 'shipping',
  'calendar-notification', 'drive-shares-dm-noreply',
  'updates', 'feedback', 'team', 'hello', 'bonjour',
];

/** Domains that are services, not real people */
const AUTOMATED_DOMAINS = new Set([
  'github.com', 'gitlab.com', 'bitbucket.org',
  'slack.com', 'notion.so', 'linear.app', 'figma.com',
  'vercel.com', 'netlify.com', 'heroku.com', 'railway.app',
  'stripe.com', 'paypal.com', 'wise.com',
  'google.com', 'accounts.google.com', 'googlegroups.com',
  'linkedin.com', 'twitter.com', 'facebook.com', 'instagram.com',
  'monday.com', 'asana.com', 'trello.com', 'jira.atlassian.com',
  'zoom.us', 'calendly.com',
  'mailchimp.com', 'sendinblue.com', 'hubspot.com', 'intercom.io',
  'sentry.io', 'datadog.com', 'pagerduty.com',
  'amazonses.com', 'sendgrid.net', 'mailgun.org',
  'docusign.net', 'e.]]]]', 'noreply.github.com',
  'withallo.com', 'crisp.chat',
]);

// ─── TOKEN MANAGEMENT ───────────────────────────────

async function getValidAccessToken(userId: string): Promise<string | null> {
  let config = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: 'gmail' } },
  });

  if (!config || !config.enabled || !config.accessToken) return null;

  // Refresh expired token
  if (config.tokenExpiry && config.tokenExpiry.getTime() < Date.now() + 5 * 60 * 1000) {
    if (!config.refreshToken || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;

    try {
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
      if (tokens.error) return null;

      const newExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
      await prisma.integrationConfig.update({
        where: { id: config.id },
        data: { accessToken: tokens.access_token, tokenExpiry: newExpiry },
      });

      // Also update calendar config
      await prisma.integrationConfig.updateMany({
        where: { userId, provider: 'calendar' },
        data: { accessToken: tokens.access_token, tokenExpiry: newExpiry },
      });

      return tokens.access_token as string;
    } catch {
      return null;
    }
  }

  return config.accessToken;
}

// ─── PARSING HELPERS ────────────────────────────────

/**
 * Parse the "From" header: "Olivier Brachet <olivier@bitek.fr>" → { name, email }
 */
function parseFromHeader(fromString: string): { name: string | null; email: string } {
  // "Name <email>"
  const match = fromString.match(/^"?(.+?)"?\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
  }
  // "<email>"
  const emailMatch = fromString.match(/<(.+?)>/);
  if (emailMatch) {
    return { name: null, email: emailMatch[1].trim().toLowerCase() };
  }
  // Just an email
  return { name: null, email: fromString.trim().toLowerCase() };
}

/**
 * Extract first name and last name from the From header or email address.
 */
function extractName(from: { name: string | null; email: string }): { firstName: string; lastName: string } {
  if (from.name && from.name !== from.email) {
    const parts = from.name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
    }
    return { firstName: parts[0] || '', lastName: '' };
  }

  // Fallback: parse from email local part
  const localPart = from.email.split('@')[0];
  const parts = localPart.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) {
    return {
      firstName: capitalize(parts[0]),
      lastName: parts.slice(1).map(capitalize).join(' '),
    };
  }

  return { firstName: capitalize(localPart), lastName: '' };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Check if an email sender is automated (no-reply, newsletter, service).
 */
function isAutomatedEmail(senderEmail: string, headers?: Record<string, string>): boolean {
  const localPart = senderEmail.split('@')[0].toLowerCase();
  const domain = senderEmail.split('@')[1]?.toLowerCase() || '';

  if (AUTOMATED_PREFIXES.some((p) => localPart.startsWith(p))) return true;
  if (AUTOMATED_DOMAINS.has(domain)) return true;

  // Check email headers
  if (headers) {
    if (headers['precedence'] === 'bulk' || headers['precedence'] === 'list') return true;
    if (headers['list-unsubscribe']) return true;
  }

  return false;
}

/**
 * Best-effort extraction of info from an email signature (last ~30 lines).
 */
function extractSignatureInfo(snippet: string): SignatureInfo | null {
  if (!snippet) return null;
  const text = snippet;
  const info: SignatureInfo = {};

  // Phone patterns (France + international)
  const phonePatterns = [
    /(?:\+33|0033|0)\s*[1-9](?:[\s.\-]*\d{2}){4}/,
    /\+\d{1,3}[\s.\-]?\d{1,4}[\s.\-]?\d{1,4}[\s.\-]?\d{1,4}/,
    /(?:Tel|Tél|Phone|Mobile|Mob)\s*[:.]\s*([+\d\s.()\-]{8,20})/i,
  ];
  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      info.phone = (match[1] || match[0]).replace(/[^\d+]/g, '').trim();
      break;
    }
  }

  // Job title patterns
  const titlePatterns = [
    /(?:CEO|CTO|CFO|COO|CRO|CPO|VP|Head of|Director|Directeur|Directrice|Manager|DRH|Fondateur|Fondatrice|Co-Founder|Founder|Partner|Associé)[^\n,|]{0,40}/i,
    /(?:Account Executive|Business Developer|Sales Manager|Chargé d'affaires|Ingénieur Commercial|Key Account Manager|Talent Acquisition|Recruteur|Recruteuse)[^\n,|]{0,30}/i,
  ];
  for (const pattern of titlePatterns) {
    const match = text.match(pattern);
    if (match) {
      info.title = match[0].trim();
      break;
    }
  }

  // Website
  const websiteMatch = text.match(/(?:www\.|https?:\/\/)([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
  if (websiteMatch) {
    info.website = websiteMatch[0].startsWith('http') ? websiteMatch[0] : `https://${websiteMatch[0]}`;
  }

  return Object.keys(info).length > 0 ? info : null;
}

/**
 * Derive a company name from a domain. e.g. "bitek.fr" → "Bitek"
 */
function deriveCompanyName(domain: string): string {
  const name = domain.split('.')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ─── GMAIL API ──────────────────────────────────────

interface GmailMessage {
  id: string;
  threadId: string;
  from: string;        // raw From header
  subject: string;
  date: string;
  snippet: string;
  headers: Record<string, string>;
}

/**
 * Fetch recent incoming emails since a given timestamp.
 */
async function fetchRecentIncomingEmails(
  accessToken: string,
  sinceTimestamp: Date,
  maxResults = 50,
): Promise<GmailMessage[]> {
  const epochSeconds = Math.floor(sinceTimestamp.getTime() / 1000);
  const query = `is:inbox -from:me after:${epochSeconds}`;

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const listData = (await listRes.json()) as any;

  if (!listData.messages || listData.messages.length === 0) {
    return [];
  }

  // Fetch metadata for each message in parallel (batches of 10)
  const messages: GmailMessage[] = [];
  const messageIds: string[] = listData.messages.map((m: any) => m.id);

  // Process in batches of 10 to avoid rate limits
  for (let i = 0; i < messageIds.length; i += 10) {
    const batch = messageIds.slice(i, i + 10);
    const fetches = batch.map(async (msgId: string) => {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Precedence&metadataHeaders=List-Unsubscribe`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const msgData = (await msgRes.json()) as any;

        const rawHeaders: Record<string, string> = {};
        for (const h of (msgData.payload?.headers || [])) {
          rawHeaders[h.name.toLowerCase()] = h.value;
        }

        messages.push({
          id: msgId,
          threadId: msgData.threadId || msgId,
          from: rawHeaders['from'] || '',
          subject: rawHeaders['subject'] || '(Sans objet)',
          date: rawHeaders['date'] || new Date().toISOString(),
          snippet: msgData.snippet || '',
          headers: {
            precedence: rawHeaders['precedence'] || '',
            'list-unsubscribe': rawHeaders['list-unsubscribe'] || '',
          },
        });
      } catch (e) {
        console.warn(`[EmailAutoCreate] Could not fetch message ${msgId}:`, e);
      }
    });

    await Promise.all(fetches);
  }

  return messages;
}

// ─── AUTO-CREATE LOGIC ──────────────────────────────

/**
 * Process a single email: skip internal/automated, match or auto-create.
 */
async function processEmail(
  email: GmailMessage,
  userId: string,
  knownMessageIds: Set<string>,
): Promise<'candidats' | 'clients' | 'entreprises' | 'activities' | 'skipped'> {
  // Already processed?
  if (knownMessageIds.has(email.id)) return 'skipped';

  const from = parseFromHeader(email.from);
  if (!from.email) return 'skipped';

  const senderEmail = from.email.toLowerCase().trim();
  const domain = senderEmail.split('@')[1] || '';

  // Skip internal emails
  if (INTERNAL_DOMAINS.includes(domain)) return 'skipped';

  // Skip automated emails
  if (isAutomatedEmail(senderEmail, email.headers)) return 'skipped';

  // ── Contact already in ATS? ──
  const existingMatch = await matchEmail(senderEmail);

  if (existingMatch) {
    // Known contact → log the email activity on their profile
    await prisma.activite.create({
      data: {
        type: 'EMAIL',
        direction: 'ENTRANT',
        entiteType: existingMatch.type,
        entiteId: existingMatch.id,
        userId,
        titre: `Email reçu : ${email.subject}`,
        contenu: email.snippet || `Email de ${from.name || senderEmail}`,
        source: 'GMAIL',
        metadata: {
          gmailMessageId: email.id,
          from: email.from,
          subject: email.subject,
          autoCreated: false,
        },
      },
    });
    return 'activities';
  }

  // ── New contact — extract info ──
  const { firstName, lastName } = extractName(from);
  const signatureInfo = extractSignatureInfo(email.snippet);

  if (isPersonalEmail(senderEmail)) {
    // ── EMAIL PERSO → CANDIDAT ──
    const candidat = await prisma.candidat.create({
      data: {
        nom: lastName || firstName || senderEmail.split('@')[0],
        prenom: lastName ? firstName : undefined,
        email: senderEmail,
        telephone: signatureInfo?.phone || undefined,
        posteActuel: signatureInfo?.title || undefined,
        entrepriseActuelle: signatureInfo?.company || undefined,
        source: 'Email auto',
        notes: `Créé automatiquement depuis l'email : "${email.subject}"`,
        createdById: userId,
      },
    });

    // Log activity on the new candidat
    await prisma.activite.create({
      data: {
        type: 'EMAIL',
        direction: 'ENTRANT',
        entiteType: 'CANDIDAT',
        entiteId: candidat.id,
        userId,
        titre: `Email reçu : ${email.subject}`,
        contenu: email.snippet || `Email de ${from.name || senderEmail}`,
        source: 'GMAIL',
        metadata: {
          gmailMessageId: email.id,
          from: email.from,
          subject: email.subject,
          autoCreated: true,
          autoCreatedType: 'CANDIDAT',
        },
      },
    });

    console.log(`[EmailAutoCreate] CANDIDAT créé: ${firstName} ${lastName} <${senderEmail}>`);
    return 'candidats';

  } else {
    // ── EMAIL PRO → ENTREPRISE + CLIENT ──

    // Find or create entreprise by domain
    let entreprise = await prisma.entreprise.findFirst({
      where: {
        OR: [
          { siteWeb: { contains: domain, mode: 'insensitive' } },
          { nom: { equals: deriveCompanyName(domain), mode: 'insensitive' } },
        ],
      },
    });

    let entrepriseCreated = false;

    if (!entreprise) {
      const companyName = signatureInfo?.company || deriveCompanyName(domain);
      entreprise = await prisma.entreprise.create({
        data: {
          nom: companyName,
          siteWeb: signatureInfo?.website || `https://www.${domain}`,
          createdById: userId,
        },
      });
      entrepriseCreated = true;
      console.log(`[EmailAutoCreate] ENTREPRISE créée: ${companyName} (${domain})`);
    }

    // Create client
    const client = await prisma.client.create({
      data: {
        nom: lastName || firstName || senderEmail.split('@')[0],
        prenom: lastName ? firstName : undefined,
        email: senderEmail,
        telephone: signatureInfo?.phone || undefined,
        poste: signatureInfo?.title || undefined,
        entrepriseId: entreprise.id,
        notes: `Créé automatiquement depuis l'email : "${email.subject}"`,
        createdById: userId,
      },
    });

    // Log activity on the new client
    await prisma.activite.create({
      data: {
        type: 'EMAIL',
        direction: 'ENTRANT',
        entiteType: 'CLIENT',
        entiteId: client.id,
        userId,
        titre: `Email reçu : ${email.subject}`,
        contenu: email.snippet || `Email de ${from.name || senderEmail}`,
        source: 'GMAIL',
        metadata: {
          gmailMessageId: email.id,
          from: email.from,
          subject: email.subject,
          autoCreated: true,
          autoCreatedType: 'CLIENT',
          entrepriseId: entreprise.id,
          entrepriseCreated,
        },
      },
    });

    console.log(`[EmailAutoCreate] CLIENT créé: ${firstName} ${lastName} <${senderEmail}> @ ${entreprise.nom}`);
    return entrepriseCreated ? 'entreprises' : 'clients';
  }
}

// ─── MAIN SYNC FUNCTION ─────────────────────────────

/**
 * Process incoming emails for a single user.
 * Called by the cron job every 15 minutes.
 */
export async function processIncomingEmailsForUser(userId: string): Promise<EmailAutoCreateStats> {
  const stats: EmailAutoCreateStats = { candidats: 0, clients: 0, entreprises: 0, activities: 0, skipped: 0 };

  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return stats;

  // Get last check timestamp from config
  const config = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: 'gmail' } },
  });
  if (!config || !config.enabled) return stats;

  const configData = (config.config as Record<string, any>) || {};
  const lastCheck = configData.lastEmailAutoCreateCheck
    ? new Date(configData.lastEmailAutoCreateCheck)
    : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24h on first run

  // Fetch recent incoming emails
  const emails = await fetchRecentIncomingEmails(accessToken, lastCheck);

  if (emails.length === 0) {
    // Update timestamp even if no emails
    await prisma.integrationConfig.update({
      where: { id: config.id },
      data: {
        config: { ...configData, lastEmailAutoCreateCheck: new Date().toISOString() },
      },
    });
    return stats;
  }

  // Get already processed gmail message IDs to avoid duplicates
  const existingActivities = await prisma.activite.findMany({
    where: {
      source: 'GMAIL',
      userId,
      metadata: { path: ['gmailMessageId'], not: 'null' as any },
    },
    select: { metadata: true },
  });

  const knownMessageIds = new Set<string>();
  for (const a of existingActivities) {
    const meta = a.metadata as Record<string, any>;
    if (meta?.gmailMessageId) knownMessageIds.add(meta.gmailMessageId);
  }

  // Process each email
  for (const email of emails) {
    try {
      const result = await processEmail(email, userId, knownMessageIds);
      stats[result]++;
      // Add to known set to prevent double-processing within same batch
      knownMessageIds.add(email.id);
    } catch (err) {
      console.error(`[EmailAutoCreate] Error processing email ${email.id}:`, err);
      stats.skipped++;
    }
  }

  // Update last check timestamp
  await prisma.integrationConfig.update({
    where: { id: config.id },
    data: {
      config: { ...configData, lastEmailAutoCreateCheck: new Date().toISOString() },
    },
  });

  return stats;
}

/**
 * Process incoming emails for ALL users with Gmail integration.
 * Called by the cron job.
 */
export async function processAllIncomingEmails(): Promise<EmailAutoCreateStats> {
  const totalStats: EmailAutoCreateStats = { candidats: 0, clients: 0, entreprises: 0, activities: 0, skipped: 0 };

  const gmailConfigs = await prisma.integrationConfig.findMany({
    where: { provider: 'gmail', enabled: true },
    select: { userId: true },
  });

  if (gmailConfigs.length === 0) return totalStats;

  for (const { userId } of gmailConfigs) {
    try {
      const userStats = await processIncomingEmailsForUser(userId);
      totalStats.candidats += userStats.candidats;
      totalStats.clients += userStats.clients;
      totalStats.entreprises += userStats.entreprises;
      totalStats.activities += userStats.activities;
      totalStats.skipped += userStats.skipped;
    } catch (err) {
      console.error(`[EmailAutoCreate] Error for user ${userId}:`, err);
    }
  }

  if (totalStats.candidats + totalStats.clients + totalStats.entreprises + totalStats.activities > 0) {
    console.log(
      `[EmailAutoCreate] Done: ${totalStats.candidats} candidats, ${totalStats.clients} clients, ` +
      `${totalStats.entreprises} entreprises, ${totalStats.activities} activités, ${totalStats.skipped} skippés`,
    );
  }

  return totalStats;
}
