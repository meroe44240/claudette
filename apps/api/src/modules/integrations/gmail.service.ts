import prisma from '../../lib/db.js';
import { AppError, NotFoundError } from '../../lib/errors.js';
import * as notificationService from '../notifications/notification.service.js';

// ─── TYPES ──────────────────────────────────────────

interface GmailWebhookPayload {
  message: {
    data: string;        // base64-encoded JSON { emailAddress, historyId }
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

interface GmailNotificationData {
  emailAddress: string;
  historyId: string;
}

interface EmailMatchResult {
  type: 'CANDIDAT' | 'CLIENT';
  id: string;
  nom: string;
  prenom?: string | null;
  email?: string | null;
}

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  htmlBody?: string;
  cc?: string;
  bcc?: string;
  inReplyTo?: string;
}

// ─── GOOGLE OAUTH CONFIG ────────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3001/api/v1/integrations/gmail/callback';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
].join(' ');

// ─── HELPERS ────────────────────────────────────────

/**
 * Find a candidat or client by email address.
 */
export async function matchEmail(email: string): Promise<EmailMatchResult | null> {
  const normalised = email.toLowerCase().trim();

  // Try candidats first
  const candidat = await prisma.candidat.findFirst({
    where: { email: { equals: normalised, mode: 'insensitive' } },
    select: { id: true, nom: true, prenom: true, email: true },
  });

  if (candidat) {
    return { type: 'CANDIDAT', id: candidat.id, nom: candidat.nom, prenom: candidat.prenom, email: candidat.email };
  }

  // Try clients
  const client = await prisma.client.findFirst({
    where: { email: { equals: normalised, mode: 'insensitive' } },
    select: { id: true, nom: true, prenom: true, email: true },
  });

  if (client) {
    return { type: 'CLIENT', id: client.id, nom: client.nom, prenom: client.prenom, email: client.email };
  }

  return null;
}

// ─── OAUTH FLOW ─────────────────────────────────────

/**
 * Generate the Google OAuth URL for Gmail scope.
 */
export function getOAuthUrl(userId: string): string {
  if (!GOOGLE_CLIENT_ID) {
    throw new AppError(500, 'Google OAuth non configuré (GOOGLE_CLIENT_ID manquant)');
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: userId, // Pass userId in state for callback
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchange OAuth authorization code for tokens and store in IntegrationConfig.
 */
export async function handleOAuthCallback(userId: string, code: string) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new AppError(500, 'Google OAuth non configuré');
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenResponse.json() as any;

  if (tokens.error) {
    console.error('[Gmail OAuth] Token exchange error:', tokens);
    throw new AppError(400, `Erreur OAuth Google: ${tokens.error_description || tokens.error}`);
  }

  console.log(`[Gmail OAuth] Token exchange successful for user ${userId}`);

  const tokenExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

  // Fetch user email from Google userinfo
  let userEmail: string | null = null;
  try {
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userinfo = await userinfoRes.json() as any;
    userEmail = userinfo.email || null;
  } catch (e) {
    console.warn('[Gmail OAuth] Could not fetch user email:', e);
  }

  const config = await prisma.integrationConfig.upsert({
    where: { userId_provider: { userId, provider: 'gmail' } },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || undefined,
      tokenExpiry,
      enabled: true,
      config: { email: userEmail },
    },
    create: {
      userId,
      provider: 'gmail',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry,
      enabled: true,
      config: { email: userEmail },
    },
  });

  // Also create/update calendar config with same tokens (shared Google OAuth)
  await prisma.integrationConfig.upsert({
    where: { userId_provider: { userId, provider: 'calendar' } },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || undefined,
      tokenExpiry,
      enabled: true,
      config: { email: userEmail },
    },
    create: {
      userId,
      provider: 'calendar',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry,
      enabled: true,
      config: { email: userEmail },
    },
  });

  return { success: true, configId: config.id };
}

/**
 * Refresh an expired access token using the refresh token.
 */
async function refreshAccessToken(userId: string): Promise<string> {
  const config = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: 'gmail' } },
  });

  if (!config || !config.refreshToken) {
    throw new AppError(400, 'Intégration Gmail non configurée ou token de rafraîchissement manquant');
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
    console.error('[Gmail] Token refresh error:', tokens);
    throw new AppError(400, 'Erreur lors du rafraîchissement du token Gmail. Veuillez reconnecter votre compte.');
  }

  console.log(`[Gmail] Token refreshed for user ${userId}`);

  const newAccessToken = tokens.access_token as string;
  const tokenExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

  // Update both gmail and calendar configs
  await prisma.integrationConfig.update({
    where: { userId_provider: { userId, provider: 'gmail' } },
    data: { accessToken: newAccessToken, tokenExpiry },
  });

  await prisma.integrationConfig.updateMany({
    where: { userId, provider: 'calendar' },
    data: { accessToken: newAccessToken, tokenExpiry },
  });

  return newAccessToken;
}

/**
 * Get a valid access token for the user, refreshing if needed.
 */
async function getValidAccessToken(userId: string): Promise<string> {
  const config = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: 'gmail' } },
  });

  if (!config || !config.enabled) {
    throw new AppError(400, 'Intégration Gmail non configurée ou désactivée');
  }

  if (!config.accessToken) {
    throw new AppError(400, 'Token Gmail manquant. Veuillez reconnecter votre compte.');
  }

  // Check if token is expired or will expire in the next 5 minutes
  if (config.tokenExpiry && config.tokenExpiry.getTime() < Date.now() + 5 * 60 * 1000) {
    return refreshAccessToken(userId);
  }

  return config.accessToken;
}

// ─── WEBHOOK PROCESSING ────────────────────────────

/**
 * Process a Gmail push notification webhook.
 * Decodes the Pub/Sub message, fetches new messages, and creates activities.
 */
export async function processGmailWebhook(payload: GmailWebhookPayload) {
  // Decode the Pub/Sub message data
  let notificationData: GmailNotificationData;
  try {
    const decoded = Buffer.from(payload.message.data, 'base64').toString('utf-8');
    notificationData = JSON.parse(decoded) as GmailNotificationData;
  } catch {
    throw new AppError(400, 'Données webhook Gmail invalides');
  }

  const emailAddress = notificationData.emailAddress;

  // Find the user with this Gmail integration
  // In production, we'd match by the email address stored in config
  const configs = await prisma.integrationConfig.findMany({
    where: { provider: 'gmail', enabled: true },
  });

  let matchedConfig = configs.find((c) => {
    const cfg = c.config as Record<string, unknown>;
    return cfg.email === emailAddress;
  });

  // Fallback: use first gmail config (development)
  if (!matchedConfig && configs.length > 0) {
    matchedConfig = configs[0];
  }

  if (!matchedConfig) {
    return { processed: false, reason: 'No matching Gmail integration found' };
  }

  const userId = matchedConfig.userId;

  console.log(`[Gmail Webhook] New message for ${emailAddress}, historyId: ${notificationData.historyId}`);

  // Try to fetch recent messages via Gmail API
  let emailSubject = `Email reçu - ${emailAddress}`;
  let emailFrom = emailAddress;
  let gmailMessageId: string | undefined;

  try {
    const accessToken = await getValidAccessToken(userId);
    const historyRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${notificationData.historyId}&historyTypes=messageAdded`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const historyData = await historyRes.json() as any;

    if (historyData.history?.[0]?.messagesAdded?.[0]?.message?.id) {
      gmailMessageId = historyData.history[0].messagesAdded[0].message.id;
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailMessageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const msgData = await msgRes.json() as any;
      const headers = msgData.payload?.headers || [];
      const subjectHeader = headers.find((h: any) => h.name === 'Subject');
      const fromHeader = headers.find((h: any) => h.name === 'From');
      if (subjectHeader) emailSubject = subjectHeader.value;
      if (fromHeader) emailFrom = fromHeader.value;
    }
  } catch (e) {
    console.warn('[Gmail Webhook] Could not fetch message details:', e);
  }

  // Match sender email to candidat/client
  const senderEmail = emailFrom.match(/<([^>]+)>/)?.[1] || emailFrom;
  const senderMatch = await matchEmail(senderEmail);

  const activite = await prisma.activite.create({
    data: {
      type: 'EMAIL',
      direction: 'ENTRANT',
      entiteType: senderMatch?.type ?? 'CANDIDAT',
      entiteId: senderMatch?.id ?? '00000000-0000-0000-0000-000000000000',
      userId,
      titre: emailSubject,
      contenu: `Email de ${emailFrom}`,
      source: 'GMAIL',
      metadata: {
        historyId: notificationData.historyId,
        emailAddress,
        webhookMessageId: payload.message.messageId,
        gmailMessageId,
        from: emailFrom,
        matched: !!senderMatch,
      },
    },
  });

  // Create notification
  await notificationService.create({
    userId,
    type: 'EMAIL_RECU',
    titre: 'Nouvel email reçu',
    contenu: `Un nouvel email a été détecté pour ${emailAddress}`,
  });

  return { processed: true, activiteId: activite.id };
}

// ─── SEND EMAIL ─────────────────────────────────────

/**
 * Build a base64url-encoded MIME message for the Gmail API.
 */
function createMimeMessage(
  to: string,
  subject: string,
  body: string,
  options?: { htmlBody?: string; cc?: string; bcc?: string; inReplyTo?: string },
): string {
  const boundary = `boundary_${Date.now()}`;
  const lines = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
  ];

  if (options?.cc) {
    lines.splice(1, 0, `Cc: ${options.cc}`);
  }
  if (options?.bcc) {
    lines.splice(1, 0, `Bcc: ${options.bcc}`);
  }
  if (options?.inReplyTo) {
    lines.push(`In-Reply-To: ${options.inReplyTo}`);
    lines.push(`References: ${options.inReplyTo}`);
  }

  const htmlBody = options?.htmlBody;
  if (htmlBody) {
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', '', body, '', `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', '', htmlBody, '', `--${boundary}--`);
  } else {
    lines.push('Content-Type: text/plain; charset=UTF-8', '', body);
  }

  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64url');
}

/**
 * Send an email via Gmail API using stored OAuth token.
 */
export async function sendEmail(userId: string, params: SendEmailParams) {
  const accessToken = await getValidAccessToken(userId);

  // Match recipient to candidat/client
  const match = await matchEmail(params.to);
  const contactName = match ? `${match.prenom ?? ''} ${match.nom}`.trim() : params.to;

  // Build and send MIME message via Gmail API
  const rawMessage = createMimeMessage(params.to, params.subject, params.body, {
    htmlBody: params.htmlBody,
    cc: params.cc,
    bcc: params.bcc,
    inReplyTo: params.inReplyTo,
  });

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: rawMessage }),
  });

  const result = await response.json() as any;
  const sentViaApi = response.ok;

  if (!response.ok) {
    console.error('[Gmail] Send error:', result);
  } else {
    console.log(`[Gmail] Email sent to ${params.to}, messageId: ${result.id}`);
  }

  // Create Activite for the sent email
  const activite = await prisma.activite.create({
    data: {
      type: 'EMAIL',
      direction: 'SORTANT',
      entiteType: match?.type ?? 'CANDIDAT',
      entiteId: match?.id ?? '00000000-0000-0000-0000-000000000000',
      userId,
      titre: `Email envoyé - ${params.subject}`,
      contenu: params.body,
      source: 'GMAIL',
      metadata: {
        to: params.to,
        cc: params.cc || null,
        bcc: params.bcc || null,
        subject: params.subject,
        contactName,
        matched: !!match,
        sentViaApi,
        gmailMessageId: result.id,
        inReplyTo: params.inReplyTo || null,
      },
    },
  });

  // Create notification
  await notificationService.create({
    userId,
    type: 'EMAIL_RECU',
    titre: 'Email envoyé',
    contenu: `Email envoyé à ${contactName}: ${params.subject}`,
  });

  if (!sentViaApi) {
    throw new AppError(502, `Erreur Gmail API: ${result.error?.message || 'Envoi échoué'}`);
  }

  return {
    success: true,
    activiteId: activite.id,
    message: `Email envoyé à ${contactName}`,
  };
}

// ─── FETCH RECENT INBOX MESSAGES ─────────────────────

export interface InboxMessage {
  id: string;
  threadId: string;
  from: { name: string; email: string };
  subject: string;
  snippet: string;
  date: string;
  isRead: boolean;
}

/**
 * Fetch recent inbox messages directly from Gmail API.
 * Returns formatted messages with sender info, subject, snippet, read status.
 */
export async function getRecentInboxMessages(userId: string, maxResults = 10): Promise<InboxMessage[]> {
  const accessToken = await getValidAccessToken(userId);

  // Fetch message list
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const listData = await listRes.json() as any;

  if (!listData.messages || listData.messages.length === 0) {
    return [];
  }

  // Fetch each message's metadata in parallel
  const messages: InboxMessage[] = [];

  const fetches = listData.messages.slice(0, maxResults).map(async (msg: any) => {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const msgData = await msgRes.json() as any;

      const headers = msgData.payload?.headers || [];
      const subjectHeader = headers.find((h: any) => h.name === 'Subject');
      const fromHeader = headers.find((h: any) => h.name === 'From');
      const dateHeader = headers.find((h: any) => h.name === 'Date');

      // Parse "From" header: "Name <email>" or just "email"
      const fromRaw = fromHeader?.value || '';
      const emailMatch = fromRaw.match(/<([^>]+)>/);
      const fromEmail = emailMatch ? emailMatch[1] : fromRaw.trim();
      const fromName = emailMatch
        ? fromRaw.replace(/<[^>]+>/, '').replace(/"/g, '').trim()
        : fromRaw.split('@')[0];

      const isRead = !(msgData.labelIds || []).includes('UNREAD');

      messages.push({
        id: msg.id,
        threadId: msg.threadId || msg.id,
        from: { name: fromName || fromEmail, email: fromEmail },
        subject: subjectHeader?.value || '(Sans objet)',
        snippet: msgData.snippet || '',
        date: dateHeader?.value || new Date().toISOString(),
        isRead,
      });
    } catch (e) {
      console.warn(`[Gmail] Could not fetch message ${msg.id}:`, e);
    }
  });

  await Promise.all(fetches);

  // Sort by date descending
  messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return messages;
}

/**
 * Get count of unread messages in inbox.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const accessToken = await getValidAccessToken(userId);

  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json() as any;

  return data.messagesUnread ?? 0;
}

/**
 * List Gmail messages with pagination, label filtering, and search.
 */
export async function listMessages(
  userId: string,
  opts: { maxResults: number; labelIds: string[]; q: string; pageToken?: string },
) {
  const accessToken = await getValidAccessToken(userId);

  const params = new URLSearchParams();
  params.set('maxResults', String(opts.maxResults));
  if (opts.labelIds.length) {
    opts.labelIds.forEach(l => params.append('labelIds', l));
  }
  if (opts.q) params.set('q', opts.q);
  if (opts.pageToken) params.set('pageToken', opts.pageToken);

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const listData = await listRes.json() as any;

  if (!listData.messages || listData.messages.length === 0) {
    return { messages: [], nextPageToken: null, resultSizeEstimate: 0 };
  }

  // Fetch each message's metadata in parallel
  const messages: InboxMessage[] = [];

  const fetches = listData.messages.map(async (msg: any) => {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const msgData = await msgRes.json() as any;

      const headers = msgData.payload?.headers || [];
      const subjectHeader = headers.find((h: any) => h.name === 'Subject');
      const fromHeader = headers.find((h: any) => h.name === 'From');
      const toHeader = headers.find((h: any) => h.name === 'To');
      const dateHeader = headers.find((h: any) => h.name === 'Date');

      const fromRaw = fromHeader?.value || '';
      const emailMatch = fromRaw.match(/<([^>]+)>/);
      const fromEmail = emailMatch ? emailMatch[1] : fromRaw.trim();
      const fromName = emailMatch
        ? fromRaw.replace(/<[^>]+>/, '').replace(/"/g, '').trim()
        : fromRaw.split('@')[0];

      const isRead = !(msgData.labelIds || []).includes('UNREAD');
      const isSent = (msgData.labelIds || []).includes('SENT');

      messages.push({
        id: msg.id,
        threadId: msg.threadId || msg.id,
        from: { name: fromName || fromEmail, email: fromEmail },
        subject: subjectHeader?.value || '(Sans objet)',
        snippet: msgData.snippet || '',
        date: dateHeader?.value || new Date().toISOString(),
        isRead,
        ...(isSent && { isSent: true }),
        ...(toHeader && { to: toHeader.value }),
      } as any);
    } catch (e) {
      console.warn(`[Gmail] Could not fetch message ${msg.id}:`, e);
    }
  });

  await Promise.all(fetches);

  // Sort by date descending
  messages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Try to match sender emails to ATS contacts
  const allEmails = messages.map(m => m.from.email.toLowerCase());
  const uniqueEmails = [...new Set(allEmails)];

  const [matchedCandidats, matchedClients] = await Promise.all([
    prisma.candidat.findMany({
      where: { email: { in: uniqueEmails, mode: 'insensitive' } },
      select: { id: true, nom: true, prenom: true, email: true },
    }),
    prisma.client.findMany({
      where: { email: { in: uniqueEmails, mode: 'insensitive' } },
      select: { id: true, nom: true, prenom: true, email: true },
    }),
  ]);

  const contactMap = new Map<string, { id: string; nom: string; prenom: string; type: string }>();
  matchedCandidats.forEach(c => {
    if (c.email) contactMap.set(c.email.toLowerCase(), { id: c.id, nom: c.nom, prenom: c.prenom || '', type: 'candidat' });
  });
  matchedClients.forEach(c => {
    if (c.email) contactMap.set(c.email.toLowerCase(), { id: c.id, nom: c.nom, prenom: c.prenom || '', type: 'client' });
  });

  const enrichedMessages = messages.map(m => ({
    ...m,
    contact: contactMap.get(m.from.email.toLowerCase()) || null,
  }));

  return {
    messages: enrichedMessages,
    nextPageToken: listData.nextPageToken || null,
    resultSizeEstimate: listData.resultSizeEstimate || messages.length,
  };
}
