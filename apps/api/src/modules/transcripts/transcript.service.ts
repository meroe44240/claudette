import prisma from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import * as notificationService from '../notifications/notification.service.js';
import { getAiConfigWithKey } from '../ai/ai-config.service.js';

// ─── TYPES ──────────────────────────────────────────

interface ParsedTranscript {
  participants: string[];
  summary: string;
  actionItems: { description: string; assignee?: string }[];
  linkedEntity?: {
    name: string;
    type: 'candidat' | 'client';
    company?: string;
    phone?: string;
  };
}

interface ProcessTranscriptInput {
  googleDocId: string;
  title: string;
  content: string;
}

interface DriveWebhookPayload {
  fileId?: string;
  resourceId?: string;
  changeType?: string;
  [key: string]: unknown;
}

// Keywords to identify transcript / call summary documents
const TRANSCRIPT_KEYWORDS = [
  'transcript',
  'compte rendu',
  'compte-rendu',
  'cr appel',
  'cr call',
  'résumé appel',
  'resume appel',
  'call summary',
  'call report',
  'note appel',
  'note de call',
  'entretien',
  'debrief',
  'call notes',
  'notes by gemini',   // Gemini auto-generated meeting notes
];

function isTranscriptDoc(name: string): boolean {
  const lower = name.toLowerCase();
  return TRANSCRIPT_KEYWORDS.some(kw => lower.includes(kw));
}

// ─── GEMINI API PARSING ─────────────────────────────

export async function parseWithGemini(userId: string, content: string): Promise<ParsedTranscript> {
  // Get user's AI config (Gemini API key)
  const config = await getAiConfigWithKey(userId);

  if (!config) {
    throw new AppError(400, 'Configuration IA non trouvée — configurez Gemini dans les paramètres');
  }

  if (config.aiProvider !== 'gemini') {
    throw new AppError(400, `Provider IA configuré : ${config.aiProvider}. Gemini requis pour les transcripts.`);
  }

  const systemPrompt = `Tu es un expert en analyse de transcripts d'appels de recrutement.
Tu travailles pour HumanUp, un cabinet de recrutement spécialisé.

Analyse le transcript / compte rendu d'appel suivant et extrais :
1. La liste de TOUS les participants (noms complets)
2. Un résumé concis (3-5 phrases) de ce qui a été discuté
3. Une liste d'actions à mener avec la personne responsable si mentionnée
4. L'entité principale liée à cet appel (candidat ou client/prospect)

Réponds STRICTEMENT en JSON valide :
{
  "participants": ["Nom Complet 1", "Nom Complet 2"],
  "summary": "Résumé de l'appel...",
  "actionItems": [
    { "description": "Description de l'action", "assignee": "Nom ou null" }
  ],
  "linkedEntity": {
    "name": "Nom de la personne principale (candidat ou client)",
    "type": "candidat" ou "client",
    "company": "Entreprise si mentionnée ou null",
    "phone": "Numéro de téléphone si mentionné ou null"
  }
}

Règles :
- "type" = "candidat" si c'est un candidat (cherche un poste, en processus de recrutement)
- "type" = "client" si c'est un client/prospect/DRH/hiring manager
- Les actions doivent être concrètes et actionnables
- Le résumé doit mentionner le contexte (poste, entreprise, étape du process)
- Réponds UNIQUEMENT avec le JSON, pas de texte autour`;

  const userPrompt = `Analyse ce transcript / compte rendu d'appel de recrutement :\n\n${content.slice(0, 30000)}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { temperature: 0.1, maxOutputTokens: 4000 },
        }),
      },
    );

    if (!response.ok) {
      const err = (await response.json()) as any;
      console.error('[Transcript] Gemini API error:', err.error?.message || response.status);
      throw new AppError(502, `Erreur Gemini: ${err.error?.message || response.status}`);
    }

    const data = (await response.json()) as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Transcript] No JSON found in Gemini response:', text.slice(0, 200));
      throw new AppError(500, 'Réponse IA invalide — pas de JSON trouvé');
    }

    const parsed = JSON.parse(jsonMatch[0]) as ParsedTranscript;
    console.log(`[Transcript] Parsed with Gemini: ${parsed.participants.length} participants, ${parsed.actionItems.length} actions`);
    return parsed;
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    console.error('[Transcript] Parse error:', err.message);
    throw new AppError(500, `Erreur lors de l'analyse du transcript: ${err.message}`);
  }
}

// ─── GOOGLE DOC FETCHING ────────────────────────────

/**
 * Fetch the text content of a Google Doc using the Google Docs API.
 * Requires a valid access token with documents.readonly scope.
 */
export async function fetchGoogleDocContent(docId: string, accessToken: string): Promise<{ title: string; content: string }> {
  const url = `https://docs.googleapis.com/v1/documents/${docId}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('[Transcript] Google Docs API error:', err);
    if (response.status === 404) throw new AppError(404, 'Document Google non trouvé');
    if (response.status === 403) throw new AppError(403, 'Accès au document refusé — reconnectez Google Drive');
    throw new AppError(500, `Erreur Google Docs API: ${response.status}`);
  }

  const doc = (await response.json()) as any;
  const title = doc.title ?? 'Sans titre';

  // Extract text from document body
  let textContent = '';
  if (doc.body?.content) {
    for (const element of doc.body.content) {
      if (element.paragraph?.elements) {
        for (const el of element.paragraph.elements) {
          if (el.textRun?.content) {
            textContent += el.textRun.content;
          }
        }
      }
      if (element.table) {
        for (const row of element.table.tableRows ?? []) {
          for (const cell of row.tableCells ?? []) {
            for (const cellContent of cell.content ?? []) {
              if (cellContent.paragraph?.elements) {
                for (const el of cellContent.paragraph.elements) {
                  if (el.textRun?.content) {
                    textContent += el.textRun.content;
                  }
                }
              }
            }
            textContent += '\t';
          }
          textContent += '\n';
        }
      }
    }
  }

  return { title, content: textContent.trim() };
}

/**
 * List Google Docs from a Drive folder — only transcripts & call summaries.
 */
export async function listDriveTranscripts(folderId: string, accessToken: string): Promise<Array<{ id: string; name: string; modifiedTime: string }>> {
  const query = `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=100`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('[Transcript] Drive API error:', err);
    throw new AppError(500, `Erreur Google Drive API: ${response.status}`);
  }

  const data = (await response.json()) as any;
  const allDocs: Array<{ id: string; name: string; modifiedTime: string }> = data.files ?? [];

  // Filter to only transcript / call summary documents
  const transcripts = allDocs.filter(d => isTranscriptDoc(d.name));
  console.log(`[Transcript] Drive folder: ${allDocs.length} docs total, ${transcripts.length} are transcripts/CR`);

  return transcripts;
}

// ─── GET GOOGLE ACCESS TOKEN FOR USER ───────────────

async function getGoogleAccessToken(userId: string): Promise<string> {
  // Try gmail config first (most likely to have valid token)
  const config = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: 'gmail' } },
  });

  if (!config?.accessToken) {
    throw new AppError(400, 'Google non connecté — connectez Gmail/Drive dans les intégrations');
  }

  // Check if token is expired and refresh if needed
  if (config.tokenExpiry && new Date(config.tokenExpiry) < new Date()) {
    if (!config.refreshToken) {
      throw new AppError(401, 'Token Google expiré — reconnectez Gmail dans les intégrations');
    }

    // Refresh the token
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';

    const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: config.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!refreshResponse.ok) {
      throw new AppError(401, 'Impossible de rafraîchir le token Google — reconnectez Gmail');
    }

    const tokens = (await refreshResponse.json()) as any;
    await prisma.integrationConfig.update({
      where: { userId_provider: { userId, provider: 'gmail' } },
      data: {
        accessToken: tokens.access_token,
        tokenExpiry: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
      },
    });

    return tokens.access_token;
  }

  return config.accessToken;
}

// ─── PROCESS GOOGLE DOC BY URL/ID ───────────────────

/**
 * Fetch a Google Doc, parse it with Gemini, match participants, create activities.
 * This is the main entry point for processing a Google Doc transcript.
 */
export async function processGoogleDoc(userId: string, docUrlOrId: string) {
  // Extract doc ID from URL if needed
  const docIdMatch = docUrlOrId.match(/\/d\/([a-zA-Z0-9_-]+)/);
  const docId = docIdMatch ? docIdMatch[1] : docUrlOrId;

  // Get access token
  const accessToken = await getGoogleAccessToken(userId);

  // Fetch doc content
  const { title, content } = await fetchGoogleDocContent(docId, accessToken);

  if (content.length < 50) {
    throw new AppError(400, 'Le document est trop court pour être analysé');
  }

  console.log(`[Transcript] Processing Google Doc: "${title}" (${content.length} chars)`);

  // Process the transcript
  return processTranscript(userId, { googleDocId: docId, title, content });
}

// ─── PROCESS TRANSCRIPT ─────────────────────────────

export async function processTranscript(userId: string, data: ProcessTranscriptInput) {
  const parsed = await parseWithGemini(userId, data.content);

  // Match participants with candidats/clients by name or email
  const matchedUsers: { id: string; nom: string; type: 'candidat' | 'client' }[] = [];

  for (const participant of parsed.participants) {
    const nameParts = participant.trim().split(/\s+/);
    const searchName = nameParts[0] ?? participant;
    const searchLastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined;

    // Search candidats
    const candidat = await prisma.candidat.findFirst({
      where: {
        OR: [
          {
            AND: [
              { nom: { contains: searchLastName ?? searchName, mode: 'insensitive' } },
              ...(searchLastName ? [{ prenom: { contains: searchName, mode: 'insensitive' as const } }] : []),
            ],
          },
          { email: { equals: participant.toLowerCase(), mode: 'insensitive' } },
        ],
      },
      select: { id: true, nom: true },
    });

    if (candidat) {
      matchedUsers.push({ id: candidat.id, nom: candidat.nom, type: 'candidat' });
      continue;
    }

    // Search clients
    const client = await prisma.client.findFirst({
      where: {
        OR: [
          {
            AND: [
              { nom: { contains: searchLastName ?? searchName, mode: 'insensitive' } },
              ...(searchLastName ? [{ prenom: { contains: searchName, mode: 'insensitive' as const } }] : []),
            ],
          },
          { email: { equals: participant.toLowerCase(), mode: 'insensitive' } },
        ],
      },
      select: { id: true, nom: true },
    });

    if (client) {
      matchedUsers.push({ id: client.id, nom: client.nom, type: 'client' });
    }
  }

  // Also try to match the linkedEntity from AI if participants didn't match
  if (parsed.linkedEntity?.name) {
    const entityName = parsed.linkedEntity.name;
    const nameParts = entityName.trim().split(/\s+/);
    const searchLast = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
    const searchFirst = nameParts.length > 1 ? nameParts[0] : undefined;

    if (parsed.linkedEntity.type === 'candidat') {
      const c = await prisma.candidat.findFirst({
        where: {
          nom: { contains: searchLast, mode: 'insensitive' },
          ...(searchFirst ? { prenom: { contains: searchFirst, mode: 'insensitive' } } : {}),
        },
        select: { id: true, nom: true },
      });
      if (c && !matchedUsers.find(m => m.id === c.id)) {
        matchedUsers.unshift({ id: c.id, nom: c.nom, type: 'candidat' });
      }
    } else {
      const cl = await prisma.client.findFirst({
        where: {
          nom: { contains: searchLast, mode: 'insensitive' },
          ...(searchFirst ? { prenom: { contains: searchFirst, mode: 'insensitive' } } : {}),
        },
        select: { id: true, nom: true },
      });
      if (cl && !matchedUsers.find(m => m.id === cl.id)) {
        matchedUsers.unshift({ id: cl.id, nom: cl.nom, type: 'client' });
      }
    }
  }

  // Determine entity type/id for the main activity
  const primaryMatch = matchedUsers[0];
  const entiteType = primaryMatch?.type === 'client' ? 'CLIENT' : 'CANDIDAT';
  const entiteId = primaryMatch?.id;

  // Create the main TRANSCRIPT activity
  const metadata = {
    googleDocId: data.googleDocId,
    parsedSummary: parsed.summary,
    actionItems: parsed.actionItems,
    participants: parsed.participants,
    matchedUsers,
    linkedEntity: parsed.linkedEntity,
  };

  let mainActivite;

  if (entiteId) {
    mainActivite = await prisma.activite.create({
      data: {
        type: 'TRANSCRIPT',
        source: 'GOOGLE_DOCS',
        entiteType: entiteType as 'CANDIDAT' | 'CLIENT',
        entiteId,
        titre: data.title,
        contenu: parsed.summary,
        metadata,
        userId,
      },
      include: {
        user: { select: { nom: true, prenom: true } },
        fichiers: true,
      },
    });
  } else {
    // Fallback: store under a generic entity
    const fallbackCandidat = await prisma.candidat.findFirst({
      where: { createdById: userId },
      select: { id: true },
    });

    if (!fallbackCandidat) {
      throw new AppError(400, 'Aucun participant reconnu et aucun candidat existant pour associer le transcript');
    }

    mainActivite = await prisma.activite.create({
      data: {
        type: 'TRANSCRIPT',
        source: 'GOOGLE_DOCS',
        entiteType: 'CANDIDAT',
        entiteId: fallbackCandidat.id,
        titre: data.title,
        contenu: parsed.summary,
        metadata,
        userId,
      },
      include: {
        user: { select: { nom: true, prenom: true } },
        fichiers: true,
      },
    });
  }

  // Create notification with action items for user to VALIDATE (not auto-create tasks)
  const actionCount = parsed.actionItems.length;
  await notificationService.create({
    userId,
    type: 'TRANSCRIPT_PARSE',
    titre: `Transcript analysé : ${data.title}`,
    contenu: `${parsed.participants.length} participant(s), ${actionCount} action(s) proposée(s). Validez les prochaines étapes.`,
    entiteType: mainActivite.entiteType as 'CANDIDAT' | 'CLIENT',
    entiteId: mainActivite.entiteId,
  });

  return {
    ...mainActivite,
    parsed,
    matchedUsers,
  };
}

// ─── GOOGLE DRIVE INTEGRATION ───────────────────────

export async function watchDriveFolder(userId: string, folderId: string) {
  // Store the folder config
  await prisma.integrationConfig.upsert({
    where: {
      userId_provider: { userId, provider: 'google_docs' },
    },
    update: {
      config: { folderId, watchActive: true },
      enabled: true,
    },
    create: {
      userId,
      provider: 'google_docs',
      config: { folderId, watchActive: true },
      enabled: true,
    },
  });

  // List existing transcript docs in the folder
  try {
    const accessToken = await getGoogleAccessToken(userId);
    const docs = await listDriveTranscripts(folderId, accessToken);
    return {
      status: 'watch_configured',
      folderId,
      transcriptsFound: docs.length,
      docs: docs.slice(0, 10),
      message: `Dossier configuré — ${docs.length} transcripts/CR trouvés`,
    };
  } catch {
    return {
      status: 'watch_configured',
      folderId,
      message: 'Dossier configuré (listing non disponible — vérifiez les permissions Google)',
    };
  }
}

// Scan lock per user to prevent concurrent scans (race condition → duplicates)
const scanLocks = new Map<string, boolean>();

/**
 * Scan a configured Drive folder and process any new/unprocessed transcripts.
 * Only processes docs whose title matches transcript/call summary keywords.
 */
export async function scanDriveFolder(userId: string) {
  if (scanLocks.get(userId)) {
    return { status: 'skipped', message: 'Scan déjà en cours pour cet utilisateur' };
  }
  scanLocks.set(userId, true);
  try {
    return await _doScanDriveFolder(userId);
  } finally {
    scanLocks.delete(userId);
  }
}

async function _doScanDriveFolder(userId: string) {
  const config = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: 'google_docs' } },
  });

  if (!config?.enabled || !(config.config as any)?.folderId) {
    throw new AppError(400, 'Dossier Google Drive non configuré');
  }

  const folderId = (config.config as any).folderId;
  const accessToken = await getGoogleAccessToken(userId);
  const docs = await listDriveTranscripts(folderId, accessToken);

  // Find already processed doc IDs
  const existingActivities = await prisma.activite.findMany({
    where: {
      source: 'GOOGLE_DOCS',
      type: 'TRANSCRIPT',
      userId,
    },
    select: { metadata: true },
  });

  const processedDocIds = new Set(
    existingActivities
      .map(a => (a.metadata as any)?.googleDocId)
      .filter(Boolean),
  );

  const newDocs = docs.filter(d => !processedDocIds.has(d.id));
  console.log(`[Transcript] Scan: ${docs.length} transcripts in folder, ${newDocs.length} new`);

  let processed = 0;
  const errors: string[] = [];

  for (const doc of newDocs) {
    try {
      // Re-check before processing to prevent duplicates from concurrent operations
      const alreadyExists = await prisma.activite.findFirst({
        where: {
          source: 'GOOGLE_DOCS',
          type: 'TRANSCRIPT',
          userId,
          metadata: { path: ['googleDocId'], equals: doc.id },
        },
        select: { id: true },
      });
      if (alreadyExists) {
        console.log(`[Transcript] Skip already processed: ${doc.name}`);
        continue;
      }
      await processGoogleDoc(userId, doc.id);
      processed++;
    } catch (err: any) {
      console.error(`[Transcript] Error processing doc ${doc.id}:`, err.message);
      errors.push(`${doc.name}: ${err.message}`);
    }
  }

  return {
    status: 'completed',
    scanned: docs.length,
    newDocs: newDocs.length,
    processed,
    errors: errors.length > 0 ? errors : undefined,
    message: `${processed} nouveau(x) transcript(s) analysé(s) sur ${newDocs.length} trouvé(s)`,
  };
}

export async function handleDriveWebhook(payload: DriveWebhookPayload) {
  console.log('[Transcript] Received Drive webhook payload:', JSON.stringify(payload));

  const fileId = payload.fileId || payload.resourceId;
  if (!fileId) {
    return { status: 'ignored', reason: 'no_file_id' };
  }

  // Find user by google_docs config
  const config = await prisma.integrationConfig.findFirst({
    where: { provider: 'google_docs', enabled: true },
  });

  if (!config) {
    return { status: 'ignored', reason: 'no_config' };
  }

  try {
    const result = await processGoogleDoc(config.userId, fileId);
    return { status: 'processed', activiteId: result.id };
  } catch (err: any) {
    console.error('[Transcript] Webhook processing error:', err.message);
    return { status: 'error', message: err.message };
  }
}
