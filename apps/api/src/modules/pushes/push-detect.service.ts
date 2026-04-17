/**
 * Push CV Auto-Detect Service (v2)
 *
 * Scans sent Gmail emails and uses Gemini AI to detect "push CV" emails —
 * emails where the recruiter sends a candidate's CV/profile to a prospect.
 *
 * Improvements over v1:
 *  - Uses Gemini instead of Anthropic for classification
 *  - isActiveClient filter (skip active clients, only target prospects)
 *  - Anti-duplicate check (same candidate+company in 3/12 months)
 *  - Reply classification (auto-update push status on prospect replies)
 *  - PushDetectionLog (for debugging and threshold tuning)
 *  - PushEvent timeline (lifecycle tracking)
 *  - Better candidate matching (fuzzy + email)
 *
 * Cron: every 15 minutes.
 */

import prisma from '../../lib/db.js';
import { createPush } from './push.service.js';
import { parseCv, updateCandidatFromCv } from '../ai/cv-parsing.service.js';
import { isActiveClient } from './is-active-client.js';
import { checkDuplicatePush } from './check-duplicate.js';
import { classifyReply } from './classify-reply.js';
import { emitPushEvent } from './push-events.js';
import { callClaude } from '../../services/claudeAI.js';
import type { PushCanal, PushStatus } from '@prisma/client';
import type { CvParsingResult } from '../ai/cv-parsing.service.js';

// ─── TYPES ──────────────────────────────────────────

interface SentEmail {
  id: string;
  threadId: string;
  to: string;
  from: string;
  subject: string;
  snippet: string;
  labelIds: string[];
  internalDate: number;
}

interface GmailAttachment {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface PushDetection {
  is_push_cv: boolean;
  confidence: number;
  candidate_name: string | null;
  candidate_email: string | null;
  job_title_pitched: string | null;
  prospect_company: string | null;
  prospect_contact: string | null;
  prospect_email: string | null;
}

// ─── CONSTANTS ──────────────────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const CONFIDENCE_THRESHOLD = parseFloat(process.env.PUSH_DETECTION_CONFIDENCE_THRESHOLD || '0.7');

/** Domains to skip — internal, services, automated */
const SKIP_DOMAINS = new Set([
  'humanup.io',
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'outlook.fr',
  'live.com', 'live.fr', 'orange.fr', 'free.fr', 'sfr.fr', 'laposte.net',
  'google.com', 'linkedin.com', 'slack.com', 'github.com',
  'calendly.com', 'zoom.us', 'notion.so', 'figma.com',
  'docusign.net', 'stripe.com', 'hubspot.com', 'salesforce.com',
]);

/** Auto-reply patterns */
const AUTO_REPLY_PATTERNS = [
  /out of office/i, /absence.*bureau/i, /automatique/i, /auto-reply/i,
  /hors du bureau/i, /congés/i, /en vacances/i, /indisponible/i,
];

// ─── TOKEN ──────────────────────────────────────────

async function getValidAccessToken(userId: string): Promise<string | null> {
  let config = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: 'gmail' } },
  });

  if (!config || !config.enabled || !config.accessToken) return null;

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

      return tokens.access_token as string;
    } catch {
      return null;
    }
  }

  return config.accessToken;
}

// ─── GMAIL: FETCH EMAILS ────────────────────────────

async function fetchRecentSentEmails(
  accessToken: string,
  sinceTimestamp: Date,
  maxResults = 30,
): Promise<SentEmail[]> {
  const epochSeconds = Math.floor(sinceTimestamp.getTime() / 1000);
  const query = `in:sent after:${epochSeconds}`;

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const listData = (await listRes.json()) as any;

  if (!listData.messages || listData.messages.length === 0) return [];

  const emails: SentEmail[] = [];

  for (let i = 0; i < listData.messages.length; i += 10) {
    const batch = listData.messages.slice(i, i + 10);
    const fetches = batch.map(async (msg: any) => {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=To&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=In-Reply-To&metadataHeaders=List-Unsubscribe`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const msgData = (await msgRes.json()) as any;

        const headers: Record<string, string> = {};
        for (const h of (msgData.payload?.headers || [])) {
          headers[h.name.toLowerCase()] = h.value;
        }

        // Skip newsletters (has List-Unsubscribe header)
        if (headers['list-unsubscribe']) return;

        emails.push({
          id: msg.id,
          threadId: msgData.threadId || msg.id,
          to: headers['to'] || '',
          from: headers['from'] || '',
          subject: headers['subject'] || '',
          snippet: msgData.snippet || '',
          labelIds: msgData.labelIds || [],
          internalDate: parseInt(msgData.internalDate || '0', 10),
        });
      } catch (e) {
        console.warn(`[PushDetect] Could not fetch message ${msg.id}:`, e);
      }
    });
    await Promise.all(fetches);
  }

  return emails;
}

/**
 * Fetch recent inbox emails (for reply detection)
 */
async function fetchRecentInboxEmails(
  accessToken: string,
  sinceTimestamp: Date,
  maxResults = 20,
): Promise<SentEmail[]> {
  const epochSeconds = Math.floor(sinceTimestamp.getTime() / 1000);
  const query = `in:inbox after:${epochSeconds}`;

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const listData = (await listRes.json()) as any;
  if (!listData.messages?.length) return [];

  const emails: SentEmail[] = [];
  for (const msg of listData.messages) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=To&metadataHeaders=From&metadataHeaders=Subject`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const msgData = (await msgRes.json()) as any;
      const headers: Record<string, string> = {};
      for (const h of (msgData.payload?.headers || [])) {
        headers[h.name.toLowerCase()] = h.value;
      }

      emails.push({
        id: msg.id,
        threadId: msgData.threadId || msg.id,
        to: headers['to'] || '',
        from: headers['from'] || '',
        subject: headers['subject'] || '',
        snippet: msgData.snippet || '',
        labelIds: msgData.labelIds || [],
        internalDate: parseInt(msgData.internalDate || '0', 10),
      });
    } catch {
      // skip
    }
  }
  return emails;
}

// ─── PRE-FILTERS ────────────────────────────────────

function extractEmail(rawTo: string): string | null {
  const match = rawTo.match(/<(.+?)>/);
  if (match) return match[1].toLowerCase();
  if (rawTo.includes('@')) return rawTo.trim().toLowerCase();
  return null;
}

function extractName(rawTo: string): string | null {
  const match = rawTo.match(/^"?(.+?)"?\s*</);
  if (match) return match[1].trim();
  return null;
}

function extractDomain(email: string): string | null {
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

function isAutoReply(subject: string, snippet: string): boolean {
  const text = `${subject} ${snippet}`;
  return AUTO_REPLY_PATTERNS.some(p => p.test(text));
}

function shouldAnalyze(email: SentEmail): boolean {
  const toEmail = extractEmail(email.to);
  if (!toEmail) return false;

  const domain = extractDomain(toEmail);
  if (!domain || SKIP_DOMAINS.has(domain)) return false;

  if (isAutoReply(email.subject, email.snippet)) return false;

  // Quick keyword heuristic
  const text = `${email.subject} ${email.snippet}`.toLowerCase();
  const pushKeywords = [
    'cv', 'profil', 'candidat', 'candidature', 'poste', 'recrutement',
    'talent', 'collaborateur', 'présenter', 'recommander', 'opportunité',
    'ci-joint', 'en pièce jointe', 'pj', 'attached', 'attachment',
  ];
  return pushKeywords.some(kw => text.includes(kw));
}

// ─── GMAIL: ATTACHMENT HANDLING ─────────────────────

const CV_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

async function getMessageAttachments(
  accessToken: string,
  messageId: string,
): Promise<GmailAttachment[]> {
  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return [];

    const msgData = (await res.json()) as any;
    const attachments: GmailAttachment[] = [];

    function walkParts(parts: any[]) {
      for (const part of parts) {
        if (part.body?.attachmentId && CV_MIME_TYPES.has(part.mimeType)) {
          attachments.push({
            attachmentId: part.body.attachmentId,
            filename: part.filename || 'attachment',
            mimeType: part.mimeType,
            size: part.body.size || 0,
          });
        }
        if (part.parts) walkParts(part.parts);
      }
    }

    if (msgData.payload?.parts) {
      walkParts(msgData.payload.parts);
    } else if (msgData.payload?.body?.attachmentId && CV_MIME_TYPES.has(msgData.payload.mimeType)) {
      attachments.push({
        attachmentId: msgData.payload.body.attachmentId,
        filename: msgData.payload.filename || 'attachment',
        mimeType: msgData.payload.mimeType,
        size: msgData.payload.body.size || 0,
      });
    }

    return attachments;
  } catch {
    return [];
  }
}

async function downloadAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer | null> {
  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as any;
    if (!data.data) return null;

    const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64');
  } catch {
    return null;
  }
}

async function downloadAndParseCvAttachment(
  accessToken: string,
  messageId: string,
  userId: string,
): Promise<{ parsed: CvParsingResult; filename: string; buffer: Buffer } | null> {
  const attachments = await getMessageAttachments(accessToken, messageId);
  if (attachments.length === 0) return null;

  const attachment = attachments[0];
  const buffer = await downloadAttachment(accessToken, messageId, attachment.attachmentId);
  if (!buffer) return null;

  try {
    const parsed = await parseCv(buffer, attachment.filename, userId);
    return { parsed, filename: attachment.filename, buffer };
  } catch {
    return null;
  }
}

async function createCandidatFromParsedCv(
  parsed: CvParsingResult,
  userId: string,
): Promise<string> {
  const candidat = await prisma.candidat.create({
    data: {
      nom: parsed.candidate.last_name || 'Inconnu',
      prenom: parsed.candidate.first_name || undefined,
      email: parsed.candidate.email || undefined,
      telephone: parsed.candidate.phone || undefined,
      posteActuel: parsed.candidate.current_title || undefined,
      entrepriseActuelle: parsed.candidate.current_company || undefined,
      localisation: parsed.candidate.city || undefined,
      linkedinUrl: parsed.candidate.linkedin_url || undefined,
      anneesExperience: parsed.candidate.years_experience || undefined,
      tags: parsed.candidate.skills || [],
      source: 'push-auto-detect',
      aiPitchShort: parsed.pitch.short || undefined,
      aiPitchLong: parsed.pitch.long || undefined,
      aiSellingPoints: parsed.pitch.key_selling_points || [],
      aiIdealFor: parsed.pitch.ideal_for || undefined,
      aiAnonymizedProfile: parsed.anonymized_profile as any || undefined,
      aiParsedAt: new Date(),
      createdById: userId,
      assignedToId: userId,
    },
  });

  if (parsed.candidate.experience?.length) {
    try {
      const { bulkCreateExperiences } = await import('../candidats/candidat.service.js');
      await bulkCreateExperiences(
        candidat.id,
        parsed.candidate.experience.map((exp) => ({
          titre: exp.title,
          entreprise: exp.company,
          anneeDebut: exp.start_year,
          anneeFin: exp.end_year ?? null,
          highlights: exp.highlights || [],
          source: 'cv' as const,
        })),
      );
    } catch (err: any) {
      console.error('[PushDetect] Failed to save experiences:', err.message);
    }
  }

  return candidat.id;
}

// ─── AI CLASSIFICATION (Gemini via callClaude) ──────

const EXTRACT_AND_CLASSIFY_PROMPT = `Tu analyses un email envoyé par un recruteur en chasse de tête.

Détermine si c'est un "push CV" — l'envoi proactif d'un profil candidat à un prospect.

Signaux POSITIFS (push) :
- Mention d'un candidat, profil, CV
- Proposition de rencontre/entretien avec un candidat
- Présentation des compétences d'une personne
- Pièce jointe CV
- Formulation type : "je me permets de vous présenter...", "voici le profil de..."
- Premier contact dans un thread

Signaux NÉGATIFS (pas un push) :
- Réponse à un brief client actif / mention d'un mandat
- Échange interne (@humanup.io)
- Newsletter, notification, auto-reply
- Discussion commerciale sans candidat
- Relance sur facture/contrat
- Ton de suivi : "comme convenu", "suite à notre appel"
- Thread avec >3 messages (discussion en cours)

Retourne STRICTEMENT ce JSON, rien d'autre :
{
  "is_push_cv": true/false,
  "confidence": 0.0-1.0,
  "candidate_name": "Prénom Nom du candidat présenté ou null",
  "candidate_email": "email du candidat si mentionné ou null",
  "job_title_pitched": "poste pitché ou null",
  "prospect_company": "entreprise du destinataire ou null",
  "prospect_contact": "nom du contact destinataire ou null",
  "prospect_email": "email du destinataire ou null"
}`;

async function classifyEmail(email: SentEmail, userId: string): Promise<PushDetection | null> {
  const userPrompt = `Analyse cet email envoyé :

Destinataire: ${email.to}
Objet: ${email.subject}
Extrait: ${email.snippet}

Est-ce un push CV ?`;

  try {
    const response = await callClaude({
      feature: 'push_detect',
      systemPrompt: EXTRACT_AND_CLASSIFY_PROMPT,
      userPrompt,
      maxTokens: 500,
      temperature: 0,
      userId,
    });

    const text = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]) as PushDetection;
  } catch (err) {
    console.error('[PushDetect] AI classification error:', err);
    return null;
  }
}

// ─── CANDIDATE MATCHING (improved fuzzy) ────────────

function normalizeForMatch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

async function findCandidateByName(name: string | null): Promise<{ id: string; score: number } | null> {
  if (!name) return null;

  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');

  // Try exact match first
  const exactMatch = await prisma.candidat.findFirst({
    where: {
      OR: [
        { prenom: { equals: firstName, mode: 'insensitive' }, nom: { equals: lastName, mode: 'insensitive' } },
        { prenom: { equals: lastName, mode: 'insensitive' }, nom: { equals: firstName, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });

  if (exactMatch) return { id: exactMatch.id, score: 0.85 };

  // Fuzzy match: search broadly then compare with normalization
  const normalFirst = normalizeForMatch(firstName);
  const normalLast = normalizeForMatch(lastName);

  const candidates = await prisma.candidat.findMany({
    where: {
      OR: [
        { nom: { contains: lastName.slice(0, 3), mode: 'insensitive' } },
        { nom: { contains: firstName.slice(0, 3), mode: 'insensitive' } },
      ],
    },
    select: { id: true, nom: true, prenom: true },
    take: 50,
  });

  for (const c of candidates) {
    const cFirst = normalizeForMatch(c.prenom || '');
    const cLast = normalizeForMatch(c.nom);

    // Check both orderings
    const match1 = cFirst === normalFirst && cLast === normalLast;
    const match2 = cFirst === normalLast && cLast === normalFirst;

    if (match1 || match2) return { id: c.id, score: 0.85 };
  }

  return null;
}

async function findCandidateByEmail(email: string | null): Promise<{ id: string; score: number } | null> {
  if (!email) return null;

  const candidat = await prisma.candidat.findFirst({
    where: { email: { equals: email.toLowerCase(), mode: 'insensitive' } },
    select: { id: true },
  });

  return candidat ? { id: candidat.id, score: 1.0 } : null;
}

// ─── DETECTION LOG ──────────────────────────────────

async function logDetection(params: {
  gmailMessageId: string;
  recruiterId: string;
  status: 'created' | 'rejected' | 'error';
  rejectionReason?: string;
  extractedData?: any;
  candidateMatchScore?: number;
  isPushConfidence?: number;
  finalConfidence?: number;
  pushId?: string;
}) {
  try {
    await prisma.pushDetectionLog.create({
      data: {
        gmailMessageId: params.gmailMessageId,
        recruiterId: params.recruiterId,
        status: params.status,
        rejectionReason: params.rejectionReason,
        extractedData: params.extractedData,
        candidateMatchScore: params.candidateMatchScore,
        isPushConfidence: params.isPushConfidence,
        finalConfidence: params.finalConfidence,
        pushId: params.pushId,
      },
    });
  } catch (err) {
    console.error('[PushDetect] Failed to log detection:', err);
  }
}

// ─── REPLY DETECTION PIPELINE ───────────────────────

async function processIncomingReplies(
  accessToken: string,
  userId: string,
  sinceTimestamp: Date,
): Promise<{ processed: number }> {
  let processed = 0;

  const inboxEmails = await fetchRecentInboxEmails(accessToken, sinceTimestamp);
  if (inboxEmails.length === 0) return { processed: 0 };

  for (const email of inboxEmails) {
    // Skip emails from @humanup.io (internal)
    const fromEmail = extractEmail(email.from);
    if (!fromEmail) continue;
    const fromDomain = extractDomain(fromEmail);
    if (fromDomain === 'humanup.io') continue;

    // Check if this thread is linked to a push
    const push = await prisma.push.findFirst({
      where: { gmailThreadId: email.threadId },
      include: {
        candidat: { select: { nom: true, prenom: true } },
        prospect: { select: { companyName: true, contactName: true } },
      },
    });
    if (!push) continue;

    // Skip if we already processed this message
    const alreadyLogged = await prisma.pushEvent.findFirst({
      where: {
        pushId: push.id,
        eventType: 'reply_received',
        metadata: { path: ['gmailMessageId'], equals: email.id },
      },
    });
    if (alreadyLogged) continue;

    // Auto-reply check
    if (isAutoReply(email.subject, email.snippet)) continue;

    // Classify the reply
    const candidateName = `${push.candidat.prenom || ''} ${push.candidat.nom}`.trim();
    const classification = await classifyReply(
      email.snippet,
      { candidateName, sentAt: push.sentAt.toISOString() },
      userId,
    );

    if (!classification || classification.category === 'out_of_office') continue;

    // Map reply category to push status
    const statusMap: Record<string, PushStatus> = {
      interested: 'REPONDU',
      interview_requested: 'RDV_BOOK',
      declined: 'SANS_SUITE',
      needs_more_info: 'REPONDU',
    };

    const newStatus = statusMap[classification.category];
    if (newStatus && push.status === 'ENVOYE') {
      // Update push status
      await prisma.push.update({
        where: { id: push.id },
        data: { status: newStatus },
      });

      // Create follow-up task for meaningful replies
      if (classification.category === 'interested' || classification.category === 'needs_more_info') {
        await prisma.activite.create({
          data: {
            type: 'TACHE',
            isTache: true,
            tacheCompleted: false,
            titre: `Follow-up push — ${push.prospect.companyName} (${classification.category})`,
            contenu: `Réponse du prospect : ${classification.keyPoints.join('. ')}\n\nAction suggérée : ${classification.suggestedAction}`,
            userId,
            source: 'AGENT_IA',
            tacheDueDate: new Date(Date.now() + 48 * 60 * 60 * 1000), // +48h
            metadata: { priority: 'HAUTE', pushId: push.id, replyCategory: classification.category },
          },
        });
      }

      if (classification.category === 'interview_requested') {
        await prisma.activite.create({
          data: {
            type: 'TACHE',
            isTache: true,
            tacheCompleted: false,
            titre: `Booker RDV — ${candidateName} × ${push.prospect.companyName}`,
            contenu: `Le prospect demande un entretien avec ${candidateName}.\n\n${classification.suggestedAction}`,
            userId,
            source: 'AGENT_IA',
            tacheDueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // +24h urgent
            metadata: { priority: 'HAUTE', pushId: push.id, replyCategory: 'interview_requested' },
          },
        });
      }
    }

    // Log the reply event
    await emitPushEvent({
      pushId: push.id,
      eventType: 'reply_received',
      actorType: 'prospect',
      metadata: {
        gmailMessageId: email.id,
        category: classification.category,
        confidence: classification.confidence,
        keyPoints: classification.keyPoints,
        suggestedAction: classification.suggestedAction,
        newStatus: newStatus || null,
      },
    });

    // Slack notification on push replies is intentionally disabled — the
    // classification is logged on the push and visible in the ATS. Daily
    // Slack report surfaces the activity without spamming the channel.

    processed++;
    console.log(`[PushDetect] Reply classified: ${push.prospect.companyName} → ${classification.category} (${Math.round(classification.confidence * 100)}%)`);
  }

  return { processed };
}

// ─── FOLLOWUP DETECTION ─────────────────────────────

async function detectFollowupsInThread(email: SentEmail, userId: string): Promise<boolean> {
  // Check if this is a sent email on a thread already linked to a push
  const push = await prisma.push.findFirst({
    where: { gmailThreadId: email.threadId, recruiterId: userId },
  });

  if (!push) return false;

  // It's a follow-up on an existing push thread
  await prisma.push.update({
    where: { id: push.id },
    data: {
      followupCount: { increment: 1 },
      lastTouchpointAt: new Date(),
    },
  });

  await emitPushEvent({
    pushId: push.id,
    eventType: 'followup_sent',
    actorType: 'recruiter',
    actorId: userId,
    metadata: { gmailMessageId: email.id, subject: email.subject },
  });

  console.log(`[PushDetect] Followup #${push.followupCount + 1} detected on push ${push.id}`);
  return true; // Signal that this email was handled
}

// ─── MAIN PROCESS ───────────────────────────────────

export async function detectPushesForUser(userId: string): Promise<{
  detected: number;
  skipped: number;
  replies: number;
  followups: number;
}> {
  const stats = { detected: 0, skipped: 0, replies: 0, followups: 0 };

  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return stats;

  const config = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: 'gmail' } },
  });
  if (!config || !config.enabled) return stats;

  const configData = (config.config as Record<string, any>) || {};
  const lastCheck = configData.lastPushDetectCheck
    ? new Date(configData.lastPushDetectCheck)
    : new Date(Date.now() - 60 * 60 * 1000);

  // ── Process incoming replies first ──
  try {
    const replyResult = await processIncomingReplies(accessToken, userId, lastCheck);
    stats.replies = replyResult.processed;
  } catch (err) {
    console.error('[PushDetect] Reply processing error:', err);
  }

  // ── Process outgoing emails ──
  const sentEmails = await fetchRecentSentEmails(accessToken, lastCheck);
  if (sentEmails.length === 0) {
    await prisma.integrationConfig.update({
      where: { id: config.id },
      data: { config: { ...configData, lastPushDetectCheck: new Date().toISOString() } },
    });
    return stats;
  }

  // Get already-detected gmailMessageIds to avoid duplicates
  const existingLogs = await prisma.pushDetectionLog.findMany({
    where: { recruiterId: userId },
    select: { gmailMessageId: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const knownIds = new Set(existingLogs.map(l => l.gmailMessageId));

  for (const email of sentEmails) {
    if (knownIds.has(email.id)) { stats.skipped++; continue; }

    // Check if this is a followup on an existing push thread
    const isFollowup = await detectFollowupsInThread(email, userId);
    if (isFollowup) {
      stats.followups++;
      knownIds.add(email.id);
      continue;
    }

    if (!shouldAnalyze(email)) {
      stats.skipped++;
      continue;
    }

    // ── Filter: is recipient an active client? ──
    const recipientEmail = extractEmail(email.to);
    if (recipientEmail) {
      const clientCheck = await isActiveClient(recipientEmail);
      if (clientCheck.isActive) {
        await logDetection({
          gmailMessageId: email.id,
          recruiterId: userId,
          status: 'rejected',
          rejectionReason: `active_client:${clientCheck.reason} (${clientCheck.companyName})`,
        });
        stats.skipped++;
        continue;
      }
    }

    // ── AI Classification ──
    const detection = await classifyEmail(email, userId);
    if (!detection || !detection.is_push_cv) {
      await logDetection({
        gmailMessageId: email.id,
        recruiterId: userId,
        status: 'rejected',
        rejectionReason: detection ? `ai_rejected (confidence: ${detection.confidence})` : 'ai_error',
        extractedData: detection,
        isPushConfidence: detection?.confidence,
      });
      stats.skipped++;
      continue;
    }

    // ── Candidate matching ──
    let candidateMatch = await findCandidateByEmail(detection.candidate_email);
    if (!candidateMatch) {
      candidateMatch = await findCandidateByName(detection.candidate_name);
    }

    let candidatId = candidateMatch?.id || null;
    const candidateMatchScore = candidateMatch?.score || 0;

    // Try CV attachment if no match
    if (!candidatId) {
      const cvResult = await downloadAndParseCvAttachment(accessToken, email.id, userId);
      if (cvResult) {
        const parsedName = `${cvResult.parsed.candidate.first_name} ${cvResult.parsed.candidate.last_name}`.trim();
        const emailMatch = await findCandidateByEmail(cvResult.parsed.candidate.email || null);
        const nameMatch = emailMatch || await findCandidateByName(parsedName);

        if (nameMatch) {
          candidatId = nameMatch.id;
          try {
            await updateCandidatFromCv(cvResult.buffer, cvResult.filename, userId, candidatId);
          } catch {}
        } else {
          try {
            candidatId = await createCandidatFromParsedCv(cvResult.parsed, userId);
          } catch (err: any) {
            console.error('[PushDetect] Failed to create candidate from CV:', err.message);
          }
        }
      }
    }

    // ── Score calculation ──
    const prospectConfirmed = recipientEmail
      ? !(await isActiveClient(recipientEmail)).isActive
      : true;

    const finalConfidence =
      0.4 * (candidatId ? candidateMatchScore || 0.85 : 0) +
      0.3 * detection.confidence +
      0.3 * (prospectConfirmed ? 1.0 : 0);

    if (finalConfidence < CONFIDENCE_THRESHOLD || !candidatId) {
      await logDetection({
        gmailMessageId: email.id,
        recruiterId: userId,
        status: 'rejected',
        rejectionReason: !candidatId
          ? 'candidate_not_found'
          : `below_threshold (${finalConfidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`,
        extractedData: detection,
        candidateMatchScore,
        isPushConfidence: detection.confidence,
        finalConfidence,
      });

      // Create note for manual review if candidate wasn't found
      if (!candidatId && detection.confidence > 0.5) {
        await prisma.activite.create({
          data: {
            type: 'NOTE',
            titre: `Push CV détecté (candidat non trouvé) — ${detection.candidate_name || 'inconnu'}`,
            contenu: `Email envoyé à ${detection.prospect_company || email.to}. Objet: ${email.subject}. Candidat mentionné: ${detection.candidate_name || 'non identifié'}.`,
            userId,
            source: 'AGENT_IA',
            metadata: {
              gmailMessageId: email.id,
              pushAutoDetected: true,
              candidateName: detection.candidate_name,
              prospectCompany: detection.prospect_company,
              confidence: detection.confidence,
              needsManualReview: true,
            },
          },
        });
      }

      stats.skipped++;
      continue;
    }

    // ── Anti-duplicate check ──
    const prospectCompanyName = detection.prospect_company || extractDomain(recipientEmail || '') || 'Inconnu';
    const dupCheck = await checkDuplicatePush(candidatId, prospectCompanyName);

    if (dupCheck.blockingLevel === 'hard_block') {
      await logDetection({
        gmailMessageId: email.id,
        recruiterId: userId,
        status: 'rejected',
        rejectionReason: `duplicate_hard_block (${dupCheck.monthsAgo}mo ago by ${dupCheck.existingPush?.recruiterName})`,
        extractedData: detection,
        candidateMatchScore,
        isPushConfidence: detection.confidence,
        finalConfidence,
      });

      // Emit duplicate blocked event on existing push
      if (dupCheck.existingPush) {
        await emitPushEvent({
          pushId: dupCheck.existingPush.id,
          eventType: 'duplicate_blocked',
          actorType: 'system',
          metadata: {
            blockedRecruiterId: userId,
            gmailMessageId: email.id,
            monthsAgo: dupCheck.monthsAgo,
          },
        });
      }

      // Slack DM urgent
      try {
        const { sendDuplicatePushAlert } = await import('../slack/slack.service.js');
        const candidat = await prisma.candidat.findUnique({
          where: { id: candidatId },
          select: { nom: true, prenom: true },
        });
        await sendDuplicatePushAlert({
          candidatName: `${candidat?.prenom || ''} ${candidat?.nom || ''}`.trim(),
          entrepriseName: prospectCompanyName,
          originalRecruiter: dupCheck.existingPush?.recruiterName || '',
          monthsAgo: dupCheck.monthsAgo || 0,
          recruiterId: userId,
        });
      } catch {}

      stats.skipped++;
      continue;
    }

    // ── Existing entreprise check — skip auto-push creation ──
    // If the entreprise is already in our DB (even without active mandate), this
    // is an "envoi de CV" to an existing relationship, not a prospection push.
    // Skip auto-creation and let the recruiter classify it manually.
    const existingEntreprise = await prisma.entreprise.findFirst({
      where: { nom: { equals: prospectCompanyName, mode: 'insensitive' } },
      select: { id: true, nom: true },
    });
    if (existingEntreprise) {
      await logDetection({
        gmailMessageId: email.id,
        recruiterId: userId,
        status: 'rejected',
        rejectionReason: `existing_entreprise (${existingEntreprise.nom}) — envoi CV, not push`,
        extractedData: detection,
        candidateMatchScore,
        isPushConfidence: detection.confidence,
        finalConfidence,
      });
      console.log(`[PushDetect] Skipped auto-push: entreprise "${existingEntreprise.nom}" already exists → envoi CV not push`);
      stats.skipped++;
      continue;
    }

    // ── Create the push ──
    try {
      const prospectEmail = detection.prospect_email || recipientEmail;
      const prospectContact = detection.prospect_contact || extractName(email.to);

      const result = await createPush({
        candidatId,
        prospect: {
          companyName: prospectCompanyName,
          contactName: prospectContact || undefined,
          contactEmail: prospectEmail || undefined,
        },
        canal: 'EMAIL' as PushCanal,
        message: `[Auto-détecté] ${email.subject}`,
        recruiterId: userId,
        gmailThreadId: email.threadId,
        gmailMessageId: email.id,
        // Use the email's real send time so daily reports count the push on the
        // correct day, not the day the detection cron ran.
        sentAt: email.internalDate ? new Date(email.internalDate) : undefined,
      });

      // Update with auto-detected fields
      await prisma.push.update({
        where: { id: result.push_id },
        data: {
          autoDetected: true,
          detectionConfidence: finalConfidence,
          hasDuplicateWarning: dupCheck.blockingLevel === 'warn',
        },
      });

      // Emit 'sent' event
      await emitPushEvent({
        pushId: result.push_id,
        eventType: 'sent',
        actorType: 'recruiter',
        actorId: userId,
        metadata: {
          gmailMessageId: email.id,
          gmailThreadId: email.threadId,
          autoDetected: true,
          detectionConfidence: finalConfidence,
          candidateName: detection.candidate_name,
          jobTitlePitched: detection.job_title_pitched,
        },
      });

      // Log in candidate timeline
      await prisma.activite.create({
        data: {
          type: 'NOTE',
          titre: `Push auto-détecté — ${detection.candidate_name} → ${prospectCompanyName}`,
          contenu: `Push créé automatiquement. Email: "${email.subject}". Confiance: ${Math.round(finalConfidence * 100)}%`,
          userId,
          source: 'AGENT_IA',
          entiteType: 'CANDIDAT',
          entiteId: candidatId,
          metadata: {
            gmailMessageId: email.id,
            pushAutoDetected: true,
            pushId: result.push_id,
            confidence: finalConfidence,
            prospectCompany: prospectCompanyName,
            jobTitlePitched: detection.job_title_pitched,
          },
        },
      });

      // Log detection
      await logDetection({
        gmailMessageId: email.id,
        recruiterId: userId,
        status: 'created',
        extractedData: detection,
        candidateMatchScore,
        isPushConfidence: detection.confidence,
        finalConfidence,
        pushId: result.push_id,
      });

      if (dupCheck.blockingLevel === 'warn') {
        console.log(`[PushDetect] Push created with duplicate warning: ${detection.candidate_name} → ${prospectCompanyName} (${dupCheck.monthsAgo}mo ago)`);
      }

      console.log(`[PushDetect] Push auto-créé: ${detection.candidate_name} → ${prospectCompanyName} (${Math.round(finalConfidence * 100)}%)`);
      stats.detected++;
    } catch (err) {
      console.error(`[PushDetect] Error creating push for email ${email.id}:`, err);
      await logDetection({
        gmailMessageId: email.id,
        recruiterId: userId,
        status: 'error',
        rejectionReason: `create_error: ${(err as Error).message}`,
        extractedData: detection,
        finalConfidence,
      });
      stats.skipped++;
    }

    knownIds.add(email.id);
  }

  // Update last check timestamp
  await prisma.integrationConfig.update({
    where: { id: config.id },
    data: { config: { ...configData, lastPushDetectCheck: new Date().toISOString() } },
  });

  return stats;
}

/**
 * Process all users with Gmail integration.
 * Called by the cron job every 15 minutes.
 */
export async function detectAllPushes(): Promise<{
  detected: number;
  skipped: number;
  replies: number;
  followups: number;
}> {
  const total = { detected: 0, skipped: 0, replies: 0, followups: 0 };

  const gmailConfigs = await prisma.integrationConfig.findMany({
    where: { provider: 'gmail', enabled: true },
    select: { userId: true },
  });

  for (const { userId } of gmailConfigs) {
    try {
      const result = await detectPushesForUser(userId);
      total.detected += result.detected;
      total.skipped += result.skipped;
      total.replies += result.replies;
      total.followups += result.followups;
    } catch (err) {
      console.error(`[PushDetect] Error for user ${userId}:`, err);
    }
  }

  if (total.detected > 0 || total.replies > 0) {
    console.log(`[PushDetect] Done: ${total.detected} pushes, ${total.replies} replies, ${total.followups} followups, ${total.skipped} skipped`);
  }

  return total;
}
