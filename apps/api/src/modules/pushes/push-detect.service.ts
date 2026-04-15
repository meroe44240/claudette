/**
 * Push CV Auto-Detect Service
 *
 * Scans sent Gmail emails and uses Claude AI to detect "push CV" emails —
 * emails where the recruiter sends a candidate's CV/profile to a prospect.
 *
 * When detected, auto-creates a Push record + follow-up tasks.
 *
 * Cron: every 15 minutes.
 */

import prisma from '../../lib/db.js';
import { createPush } from './push.service.js';
import { parseCv, updateCandidatFromCv } from '../ai/cv-parsing.service.js';
import type { PushCanal } from '@prisma/client';
import type { CvParsingResult } from '../ai/cv-parsing.service.js';

// ─── TYPES ──────────────────────────────────────────

interface SentEmail {
  id: string;
  to: string;
  subject: string;
  snippet: string;
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
  prospect_company: string | null;
  prospect_contact: string | null;
  prospect_email: string | null;
}

// ─── CONSTANTS ──────────────────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';

/** Domains to skip — internal, services, automated */
const SKIP_DOMAINS = new Set([
  'humanup.io',
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'google.com', 'linkedin.com', 'slack.com', 'github.com',
  'calendly.com', 'zoom.us', 'notion.so',
]);

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

// ─── GMAIL: FETCH SENT EMAILS ───────────────────────

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
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const msgData = (await msgRes.json()) as any;

        const headers: Record<string, string> = {};
        for (const h of (msgData.payload?.headers || [])) {
          headers[h.name.toLowerCase()] = h.value;
        }

        emails.push({
          id: msg.id,
          to: headers['to'] || '',
          subject: headers['subject'] || '',
          snippet: msgData.snippet || '',
        });
      } catch (e) {
        console.warn(`[PushDetect] Could not fetch message ${msg.id}:`, e);
      }
    });
    await Promise.all(fetches);
  }

  return emails;
}

// ─── PRE-FILTER ─────────────────────────────────────

function shouldAnalyze(email: SentEmail): boolean {
  // Skip emails to self or internal domains
  const toEmail = extractEmail(email.to);
  if (!toEmail) return false;

  const domain = toEmail.split('@')[1]?.toLowerCase() || '';
  if (SKIP_DOMAINS.has(domain)) return false;

  // Quick heuristic: push CVs typically mention CV, profil, candidat, poste, etc.
  const text = `${email.subject} ${email.snippet}`.toLowerCase();
  const pushKeywords = ['cv', 'profil', 'candidat', 'candidature', 'poste', 'recrutement', 'talent', 'collaborateur', 'présenter', 'recommander'];
  const hasKeyword = pushKeywords.some(kw => text.includes(kw));

  // Also check for attachment hints
  const attachmentHints = ['ci-joint', 'en pièce jointe', 'pj', 'attached', 'attachment'];
  const hasAttachment = attachmentHints.some(kw => text.includes(kw));

  return hasKeyword || hasAttachment;
}

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

// ─── GMAIL: ATTACHMENT HANDLING ────────────────────

/** MIME types we consider as CV attachments */
const CV_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/**
 * Fetch the full message (format=full) to extract attachment metadata.
 */
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
  } catch (err) {
    console.warn(`[PushDetect] Could not get attachments for ${messageId}:`, err);
    return [];
  }
}

/**
 * Download a single Gmail attachment and return its Buffer.
 * Gmail returns base64url-encoded data.
 */
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

    // Gmail uses base64url encoding (- and _ instead of + and /)
    const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64');
  } catch (err) {
    console.warn(`[PushDetect] Could not download attachment ${attachmentId}:`, err);
    return null;
  }
}

/**
 * Download the first CV attachment from a Gmail message and parse it.
 * Returns the parsed CV data + the raw buffer, or null if no attachment found or parsing fails.
 */
async function downloadAndParseCvAttachment(
  accessToken: string,
  messageId: string,
  userId: string,
): Promise<{ parsed: CvParsingResult; filename: string; buffer: Buffer } | null> {
  const attachments = await getMessageAttachments(accessToken, messageId);
  if (attachments.length === 0) return null;

  // Take the first CV-like attachment
  const attachment = attachments[0];
  console.log(`[PushDetect] Downloading attachment: "${attachment.filename}" (${attachment.mimeType}, ${attachment.size} bytes)`);

  const buffer = await downloadAttachment(accessToken, messageId, attachment.attachmentId);
  if (!buffer) return null;

  try {
    const parsed = await parseCv(buffer, attachment.filename, userId);
    console.log(`[PushDetect] CV parsed: ${parsed.candidate.first_name} ${parsed.candidate.last_name}`);
    return { parsed, filename: attachment.filename, buffer };
  } catch (err) {
    console.error(`[PushDetect] CV parsing failed for "${attachment.filename}":`, err);
    return null;
  }
}

/**
 * Create a new Candidat from parsed CV data.
 * Returns the created candidate ID.
 */
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

  // Save structured experiences
  if (parsed.candidate.experience && parsed.candidate.experience.length > 0) {
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

  console.log(`[PushDetect] Candidat created from CV: ${parsed.candidate.first_name} ${parsed.candidate.last_name} (${candidat.id})`);
  return candidat.id;
}

// ─── AI CLASSIFICATION ─────────────────────────────

const SYSTEM_PROMPT = `Tu es un classificateur d'emails pour un cabinet de recrutement.
Tu dois determiner si un email envoye par un recruteur est un "push CV" — c'est-a-dire l'envoi du CV ou profil d'un candidat a un prospect (entreprise non-cliente) pour proposer ses services.

Reponds UNIQUEMENT en JSON valide, sans markdown, sans commentaire.

Schema de reponse:
{
  "is_push_cv": boolean,
  "confidence": number (0-100),
  "candidate_name": string | null,
  "prospect_company": string | null,
  "prospect_contact": string | null,
  "prospect_email": string | null
}

Indices qu'un email est un push CV:
- Mention d'un candidat, profil, CV
- Proposition de rencontre/entretien avec un candidat
- Presentation des competences d'une personne
- Piece jointe CV
- Formulation type: "je me permets de vous presenter...", "voici le profil de..."

Indices que ce n'est PAS un push CV:
- Echange interne
- Newsletter, notification
- Discussion commerciale sans candidat
- Relance sur facture/contrat
- Email de suivi sans mention de candidat`;

async function classifyEmail(email: SentEmail): Promise<PushDetection | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const userPrompt = `Analyse cet email envoye:

Destinataire: ${email.to}
Objet: ${email.subject}
Extrait: ${email.snippet}

Est-ce un push CV ?`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as any;
    const text = data.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]) as PushDetection;
  } catch (err) {
    console.error('[PushDetect] AI classification error:', err);
    return null;
  }
}

// ─── CANDIDATE MATCHING ────────────────────────────

async function findCandidateByName(name: string | null): Promise<string | null> {
  if (!name) return null;

  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');

  const candidat = await prisma.candidat.findFirst({
    where: {
      OR: [
        { prenom: { equals: firstName, mode: 'insensitive' }, nom: { equals: lastName, mode: 'insensitive' } },
        { prenom: { equals: lastName, mode: 'insensitive' }, nom: { equals: firstName, mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });

  return candidat?.id || null;
}

// ─── MAIN PROCESS ───────────────────────────────────

export async function detectPushesForUser(userId: string): Promise<{ detected: number; skipped: number }> {
  const stats = { detected: 0, skipped: 0 };

  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return stats;

  const config = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: 'gmail' } },
  });
  if (!config || !config.enabled) return stats;

  const configData = (config.config as Record<string, any>) || {};
  const lastCheck = configData.lastPushDetectCheck
    ? new Date(configData.lastPushDetectCheck)
    : new Date(Date.now() - 60 * 60 * 1000); // Default: last hour

  const sentEmails = await fetchRecentSentEmails(accessToken, lastCheck);
  if (sentEmails.length === 0) {
    await prisma.integrationConfig.update({
      where: { id: config.id },
      data: { config: { ...configData, lastPushDetectCheck: new Date().toISOString() } },
    });
    return stats;
  }

  // Get already-detected gmailMessageIds to avoid duplicates
  const existingPushes = await prisma.activite.findMany({
    where: {
      userId,
      source: 'GMAIL',
      metadata: { path: ['pushAutoDetected'], equals: true },
    },
    select: { metadata: true },
  });

  const knownIds = new Set<string>();
  for (const a of existingPushes) {
    const meta = a.metadata as Record<string, any>;
    if (meta?.gmailMessageId) knownIds.add(meta.gmailMessageId);
  }

  for (const email of sentEmails) {
    if (knownIds.has(email.id)) { stats.skipped++; continue; }
    if (!shouldAnalyze(email)) { stats.skipped++; continue; }

    const detection = await classifyEmail(email);
    if (!detection || !detection.is_push_cv || detection.confidence < 60) {
      stats.skipped++;
      continue;
    }

    // Try to match candidate in DB
    let candidatId = await findCandidateByName(detection.candidate_name);

    if (!candidatId) {
      // Candidate not found in DB — try downloading CV attachment and parsing it
      console.log(`[PushDetect] Candidate "${detection.candidate_name}" not found — attempting CV attachment parsing...`);

      const cvResult = await downloadAndParseCvAttachment(accessToken, email.id, userId);

      if (cvResult) {
        // CV parsed successfully — try to match again with parsed name
        const parsedName = `${cvResult.parsed.candidate.first_name} ${cvResult.parsed.candidate.last_name}`.trim();
        candidatId = await findCandidateByName(parsedName);

        if (candidatId) {
          // Candidate exists — update with CV data using the already-downloaded buffer
          console.log(`[PushDetect] Matched existing candidate via CV parse: "${parsedName}" (${candidatId})`);
          try {
            await updateCandidatFromCv(cvResult.buffer, cvResult.filename, userId, candidatId);
          } catch (err: any) {
            console.warn(`[PushDetect] Failed to update existing candidate with CV:`, err.message);
          }
        } else {
          // Create a new candidate from the parsed CV
          try {
            candidatId = await createCandidatFromParsedCv(cvResult.parsed, userId);
          } catch (err: any) {
            console.error(`[PushDetect] Failed to create candidate from CV:`, err.message);
          }
        }
      }
    }

    if (!candidatId) {
      // Still no candidate — log for manual review
      console.log(`[PushDetect] Push CV detected but candidate not found and no CV attachment: "${detection.candidate_name}" → ${detection.prospect_company}`);
      await prisma.activite.create({
        data: {
          type: 'NOTE',
          titre: `Push CV detecte (candidat non trouve) — ${detection.candidate_name || 'inconnu'}`,
          contenu: `Email envoye a ${detection.prospect_company || email.to}. Objet: ${email.subject}. Candidat mentionne: ${detection.candidate_name || 'non identifie'}. Aucune piece jointe CV exploitable trouvee.`,
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
      stats.detected++;
      continue;
    }

    // Create the push
    try {
      const prospectEmail = detection.prospect_email || extractEmail(email.to);
      const prospectContact = detection.prospect_contact || extractName(email.to);

      await createPush({
        candidatId,
        prospect: {
          companyName: detection.prospect_company || prospectEmail?.split('@')[1]?.split('.')[0] || 'Inconnu',
          contactName: prospectContact || undefined,
          contactEmail: prospectEmail || undefined,
        },
        canal: 'EMAIL' as PushCanal,
        message: `[Auto-detecte] ${email.subject}`,
        recruiterId: userId,
      });

      // Log the detection
      await prisma.activite.create({
        data: {
          type: 'NOTE',
          titre: `Push CV auto-detecte — ${detection.candidate_name} → ${detection.prospect_company}`,
          contenu: `Push cree automatiquement depuis l'email: "${email.subject}"`,
          userId,
          source: 'AGENT_IA',
          entiteType: 'CANDIDAT',
          entiteId: candidatId,
          metadata: {
            gmailMessageId: email.id,
            pushAutoDetected: true,
            confidence: detection.confidence,
          },
        },
      });

      console.log(`[PushDetect] Push auto-cree: ${detection.candidate_name} → ${detection.prospect_company} (${detection.confidence}%)`);
      stats.detected++;
    } catch (err) {
      console.error(`[PushDetect] Error creating push for email ${email.id}:`, err);
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
export async function detectAllPushes(): Promise<{ detected: number; skipped: number }> {
  const total = { detected: 0, skipped: 0 };

  const gmailConfigs = await prisma.integrationConfig.findMany({
    where: { provider: 'gmail', enabled: true },
    select: { userId: true },
  });

  for (const { userId } of gmailConfigs) {
    try {
      const result = await detectPushesForUser(userId);
      total.detected += result.detected;
      total.skipped += result.skipped;
    } catch (err) {
      console.error(`[PushDetect] Error for user ${userId}:`, err);
    }
  }

  if (total.detected > 0) {
    console.log(`[PushDetect] Done: ${total.detected} pushes detected, ${total.skipped} skipped`);
  }

  return total;
}
