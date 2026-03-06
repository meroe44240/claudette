import prisma from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import * as notificationService from '../notifications/notification.service.js';

// ─── TYPES ──────────────────────────────────────────

interface ParsedTranscript {
  participants: string[];
  summary: string;
  actionItems: { description: string; assignee?: string }[];
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

// ─── CLAUDE API PARSING (PLACEHOLDER) ───────────────

export async function parseWithClaude(content: string): Promise<ParsedTranscript> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // The actual prompt that would be sent to Claude API
  const _systemPrompt = `You are an expert meeting transcript analyzer for a recruitment agency (ATS/CRM).
Analyze the following transcript and extract:
1. A list of all participants (names)
2. A concise summary (3-5 sentences) of what was discussed
3. A list of action items with the person responsible if mentioned

Respond in JSON format:
{
  "participants": ["Name 1", "Name 2"],
  "summary": "...",
  "actionItems": [
    { "description": "...", "assignee": "Name or null" }
  ]
}`;

  const _userPrompt = `Extract participants, write 3-5 sentence summary, list action items from this transcript:\n\n${content}`;

  if (apiKey) {
    // TODO: Actual Claude API call would go here
    // const response = await fetch('https://api.anthropic.com/v1/messages', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'x-api-key': apiKey,
    //     'anthropic-version': '2023-06-01',
    //   },
    //   body: JSON.stringify({
    //     model: 'claude-sonnet-4-20250514',
    //     max_tokens: 2048,
    //     system: systemPrompt,
    //     messages: [{ role: 'user', content: userPrompt }],
    //   }),
    // });
    console.log('[Transcript] Would call Claude API with ANTHROPIC_API_KEY to parse transcript');
  } else {
    console.log('[Transcript] No ANTHROPIC_API_KEY set, returning mock parsed result');
  }

  // Mock result for now
  return {
    participants: ['Jean Dupont', 'Marie Martin', 'Pierre Bernard'],
    summary:
      'Discussion about a senior developer position at Acme Corp. ' +
      'The client needs someone with React and Node.js experience. ' +
      'Two candidates were discussed with strong profiles. ' +
      'A follow-up meeting is scheduled for next week.',
    actionItems: [
      { description: 'Envoyer les CV des 2 candidats au client', assignee: 'Marie Martin' },
      { description: 'Planifier entretien technique avec Pierre', assignee: 'Jean Dupont' },
      { description: 'Mettre a jour la fiche du mandat avec les nouvelles exigences' },
    ],
  };
}

// ─── PROCESS TRANSCRIPT ─────────────────────────────

export async function processTranscript(userId: string, data: ProcessTranscriptInput) {
  const parsed = await parseWithClaude(data.content);

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

  // Determine entity type/id for the main activity (use first matched entity, or fallback to a general entry)
  const primaryMatch = matchedUsers[0];
  const entiteType = primaryMatch?.type === 'client' ? 'CLIENT' : 'CANDIDAT';
  const entiteId = primaryMatch?.id;

  // If no match found, we still create the activity but need a valid entity — use userId's first candidat or throw
  if (!entiteId) {
    // Create activity without specific entity link — use a placeholder approach
    // For now, we'll require at least one participant match
    console.log('[Transcript] No participant matched in DB — creating activity without entity link is not supported by schema. Attempting with first available candidat.');
  }

  // Create the main TRANSCRIPT activity
  const metadata = {
    googleDocId: data.googleDocId,
    parsedSummary: parsed.summary,
    actionItems: parsed.actionItems,
    participants: parsed.participants,
    matchedUsers,
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
    // Fallback: store under a generic entity type/id using the user's first created candidat
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

  // Create TACHE activities for each action item
  for (const item of parsed.actionItems) {
    // Try to find the assignee as a user (recruiter) in the system
    let assigneeUserId = userId; // default to current user

    if (item.assignee) {
      const nameParts = item.assignee.trim().split(/\s+/);
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            {
              AND: [
                { nom: { contains: nameParts[nameParts.length - 1] ?? item.assignee, mode: 'insensitive' } },
                ...(nameParts.length > 1 ? [{ prenom: { contains: nameParts[0]!, mode: 'insensitive' as const } }] : []),
              ],
            },
          ],
        },
        select: { id: true },
      });

      if (user) {
        assigneeUserId = user.id;
      }
    }

    await prisma.activite.create({
      data: {
        type: 'TACHE',
        source: 'GOOGLE_DOCS',
        entiteType: mainActivite.entiteType,
        entiteId: mainActivite.entiteId,
        titre: item.description,
        contenu: `Tache extraite du transcript: ${data.title}`,
        metadata: { fromTranscriptId: mainActivite.id, assignee: item.assignee },
        isTache: true,
        userId: assigneeUserId,
      },
    });
  }

  // Create notifications for all matched users (find associated system users)
  const notifiedUserIds = new Set<string>();
  notifiedUserIds.add(userId); // always notify the user who processed it

  // Notify the assignees
  for (const item of parsed.actionItems) {
    if (item.assignee) {
      const nameParts = item.assignee.trim().split(/\s+/);
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            {
              AND: [
                { nom: { contains: nameParts[nameParts.length - 1] ?? item.assignee, mode: 'insensitive' } },
                ...(nameParts.length > 1 ? [{ prenom: { contains: nameParts[0]!, mode: 'insensitive' as const } }] : []),
              ],
            },
          ],
        },
        select: { id: true },
      });

      if (user) {
        notifiedUserIds.add(user.id);
      }
    }
  }

  for (const notifyUserId of notifiedUserIds) {
    await notificationService.create({
      userId: notifyUserId,
      type: 'TRANSCRIPT_PARSE',
      titre: `Transcript analysé: ${data.title}`,
      contenu: `${parsed.actionItems.length} tâche(s) extraite(s), ${parsed.participants.length} participant(s) identifié(s).`,
      entiteType: mainActivite.entiteType as 'CANDIDAT' | 'CLIENT',
      entiteId: mainActivite.entiteId,
    });
  }

  return mainActivite;
}

// ─── GOOGLE DRIVE INTEGRATION (PLACEHOLDERS) ────────

export async function watchDriveFolder(userId: string, folderId: string) {
  // Placeholder for Google Drive push notification setup
  // Would use Google Drive API to watch for changes in the folder
  console.log(`[Transcript] Would set up Google Drive watch for folder ${folderId} by user ${userId}`);
  console.log('[Transcript] This would call Google Drive API: drive.files.watch()');
  console.log('[Transcript] With webhook URL pointing to POST /api/v1/transcripts/drive-webhook');

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

  return {
    status: 'watch_configured',
    folderId,
    message: 'Google Drive folder watch configured (placeholder — actual Drive API integration pending)',
  };
}

export async function handleDriveWebhook(payload: DriveWebhookPayload) {
  // Placeholder for processing Drive file change notifications
  console.log('[Transcript] Received Drive webhook payload:', JSON.stringify(payload));

  const fileId = payload.fileId || payload.resourceId;
  if (!fileId) {
    console.log('[Transcript] No fileId in webhook payload, ignoring');
    return { status: 'ignored', reason: 'no_file_id' };
  }

  // In production, this would:
  // 1. Fetch the Google Doc content using Google Docs API
  // 2. Find the user associated with this Drive watch
  // 3. Call processTranscript with the doc content
  console.log(`[Transcript] Would fetch Google Doc ${fileId} content via Docs API`);
  console.log('[Transcript] Would then call processTranscript() with the fetched content');

  return {
    status: 'received',
    fileId,
    message: 'Drive webhook received (placeholder — actual processing pending)',
  };
}
