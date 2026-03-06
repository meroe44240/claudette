import prisma from '../../lib/db.js';
import { getRecentInboxMessages, type InboxMessage } from '../integrations/gmail.service.js';

// ─── TYPES ──────────────────────────────────────────

interface ExtractedTask {
  title: string;
  priority: 'high' | 'medium' | 'low';
  deadline_hint: string | null;
  related_entity_type: 'candidate' | 'client' | 'company' | null;
  related_entity_name: string | null;
  source_quote: string;
}

interface TaskExtractionInput {
  text: string;
  sourceType: 'email' | 'allo_transcript' | 'gemini_transcript';
  sourceId?: string;
  userId: string;
  contextDate?: Date;
}

interface AiSuggestion {
  id: string;
  titre: string;
  contenu: string | null;
  priority: string;
  sourceType: string;
  sourceQuote: string;
  relatedEntityName: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  deadlineHint: string | null;
  tacheDueDate: string | null;
  createdAt: string;
}

// ─── SYSTEM PROMPT ──────────────────────────────────

const TASK_EXTRACTION_PROMPT = `Tu es un assistant de recruteur. Tu analyses des communications professionnelles (emails, transcriptions d'appels, notes de réunion) et tu en extrais les actions concrètes à faire.

Pour chaque action identifiée, retourne un objet JSON avec :
- "title": description courte et actionnable de la tâche (commence par un verbe à l'infinitif)
- "priority": "high" | "medium" | "low"
- "deadline_hint": une indication de deadline si mentionnée ("demain", "vendredi", "cette semaine", "ASAP", null si pas mentionné)
- "related_entity_type": "candidate" | "client" | "company" | null
- "related_entity_name": le nom de la personne/entreprise concernée ou null
- "source_quote": la phrase exacte du texte qui justifie cette tâche (pour traçabilité)

Exemples d'actions à détecter :
- Engagements pris ("je vous envoie ça demain" → tâche "Envoyer [X] à [Y]")
- Demandes reçues ("pourriez-vous me transmettre le CV" → tâche "Transmettre le CV de [X] à [Y]")
- Relances à faire ("on se recale la semaine prochaine" → tâche "Relancer [Y] pour recaler un call")
- Documents à préparer ("il faudrait mettre à jour la shortlist" → tâche "Mettre à jour la shortlist [mandat]")
- Feedbacks à collecter ("dites-moi ce que vous en pensez" → tâche "Demander feedback à [Y] sur [X]")

Ne retourne QUE des actions concrètes et actionnables. Ignore les politesses, les résumés, les informations de contexte.

Retourne UNIQUEMENT un JSON array, sans texte autour. Si aucune action détectée, retourne [].`;

// ─── CLAUDE API CALL ────────────────────────────────

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY non configurée. Ajoutez la clé dans .env');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.json() as any;
    console.error('[AI] Claude API error:', error);
    throw new Error(`Claude API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json() as any;
  return data.content?.[0]?.text ?? '[]';
}

// ─── ENTITY MATCHING ────────────────────────────────

async function matchEntityByName(
  name: string | null,
  type: 'candidate' | 'client' | 'company' | null,
): Promise<{ entiteType: string; entiteId: string } | null> {
  if (!name || !type) return null;

  const nameParts = name.trim().split(/\s+/);
  const firstPart = nameParts[0]?.toLowerCase() ?? '';
  const lastPart = nameParts[nameParts.length - 1]?.toLowerCase() ?? '';

  if (type === 'candidate') {
    // Fuzzy match on candidat name
    const candidat = await prisma.candidat.findFirst({
      where: {
        OR: [
          { nom: { contains: lastPart, mode: 'insensitive' }, prenom: { contains: firstPart, mode: 'insensitive' } },
          { nom: { contains: firstPart, mode: 'insensitive' } },
          { prenom: { contains: firstPart, mode: 'insensitive' }, nom: { contains: lastPart, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (candidat) return { entiteType: 'CANDIDAT', entiteId: candidat.id };
  }

  if (type === 'client') {
    const client = await prisma.client.findFirst({
      where: {
        OR: [
          { nom: { contains: lastPart, mode: 'insensitive' }, prenom: { contains: firstPart, mode: 'insensitive' } },
          { nom: { contains: firstPart, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (client) return { entiteType: 'CLIENT', entiteId: client.id };
  }

  if (type === 'company') {
    const entreprise = await prisma.entreprise.findFirst({
      where: { nom: { contains: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (entreprise) return { entiteType: 'ENTREPRISE', entiteId: entreprise.id };
  }

  return null;
}

// ─── DEADLINE CALCULATION ───────────────────────────

function calculateDeadline(hint: string | null, contextDate?: Date): Date | null {
  if (!hint) return null;

  const now = contextDate ?? new Date();
  const lower = hint.toLowerCase().trim();

  if (lower === 'asap' || lower === 'urgent' || lower === 'immédiatement') {
    return now; // Due today
  }
  if (lower === 'demain') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (lower === 'après-demain') {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    return d;
  }
  if (lower.includes('cette semaine') || lower.includes('fin de semaine')) {
    const d = new Date(now);
    const dayOfWeek = d.getDay();
    const daysToFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 0;
    d.setDate(d.getDate() + daysToFriday);
    return d;
  }
  if (lower.includes('semaine prochaine') || lower.includes('la semaine prochaine')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return d;
  }

  // Try to match day names
  const daysMap: Record<string, number> = {
    lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5,
    monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5,
  };
  for (const [dayName, dayNum] of Object.entries(daysMap)) {
    if (lower.includes(dayName)) {
      const d = new Date(now);
      const currentDay = d.getDay() || 7; // Make Sunday = 7
      let diff = dayNum - currentDay;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return d;
    }
  }

  return null;
}

// ─── MAIN EXTRACTION ────────────────────────────────

export async function extractTasks(input: TaskExtractionInput): Promise<AiSuggestion[]> {
  const sourceLabel = {
    email: 'Email',
    allo_transcript: 'Appel Allo',
    gemini_transcript: 'Meeting Gemini',
  }[input.sourceType];

  const userPrompt = `Source: ${sourceLabel}${input.sourceId ? ` (ID: ${input.sourceId})` : ''}\nDate: ${(input.contextDate ?? new Date()).toISOString()}\n\nContenu à analyser :\n\n${input.text}`;

  // Call Claude
  const rawResponse = await callClaude(TASK_EXTRACTION_PROMPT, userPrompt);

  // Parse JSON response
  let tasks: ExtractedTask[];
  try {
    // Strip potential markdown code fences
    const cleaned = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    tasks = JSON.parse(cleaned);
    if (!Array.isArray(tasks)) tasks = [];
  } catch (e) {
    console.warn('[AI] Failed to parse Claude response:', rawResponse);
    return [];
  }

  if (tasks.length === 0) return [];

  // Create activites for each extracted task
  const suggestions: AiSuggestion[] = [];

  for (const task of tasks) {
    // Match entity
    const entityMatch = await matchEntityByName(task.related_entity_name, task.related_entity_type);

    // Calculate deadline
    const deadline = calculateDeadline(task.deadline_hint, input.contextDate);

    const activite = await prisma.activite.create({
      data: {
        type: 'TACHE',
        isTache: true,
        tacheCompleted: false,
        tacheDueDate: deadline,
        entiteType: (entityMatch?.entiteType ?? 'CANDIDAT') as any,
        entiteId: entityMatch?.entiteId ?? '00000000-0000-0000-0000-000000000000',
        userId: input.userId,
        titre: task.title,
        contenu: task.source_quote,
        source: 'AGENT_IA',
        metadata: {
          aiStatus: 'pending_review',
          priority: task.priority,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceQuote: task.source_quote,
          deadlineHint: task.deadline_hint,
          relatedEntityName: task.related_entity_name,
          relatedEntityType: task.related_entity_type,
          entityMatched: !!entityMatch,
        },
      },
    });

    suggestions.push({
      id: activite.id,
      titre: task.title,
      contenu: task.source_quote,
      priority: task.priority,
      sourceType: input.sourceType,
      sourceQuote: task.source_quote,
      relatedEntityName: task.related_entity_name,
      relatedEntityType: task.related_entity_type,
      relatedEntityId: entityMatch?.entiteId ?? null,
      deadlineHint: task.deadline_hint,
      tacheDueDate: deadline?.toISOString() ?? null,
      createdAt: activite.createdAt.toISOString(),
    });
  }

  return suggestions;
}

// ─── GET AI SUGGESTIONS (pending_review) ─────────────

export async function getAiSuggestions(userId: string) {
  const suggestions = await prisma.activite.findMany({
    where: {
      userId,
      isTache: true,
      source: 'AGENT_IA',
      metadata: {
        path: ['aiStatus'],
        equals: 'pending_review',
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return suggestions.map(s => {
    const meta = s.metadata as any;
    return {
      id: s.id,
      titre: s.titre,
      contenu: s.contenu,
      priority: meta?.priority ?? 'medium',
      sourceType: meta?.sourceType ?? 'email',
      sourceQuote: meta?.sourceQuote ?? '',
      relatedEntityName: meta?.relatedEntityName ?? null,
      relatedEntityType: meta?.relatedEntityType ?? null,
      relatedEntityId: s.entiteId !== '00000000-0000-0000-0000-000000000000' ? s.entiteId : null,
      deadlineHint: meta?.deadlineHint ?? null,
      tacheDueDate: s.tacheDueDate?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    };
  });
}

// ─── ACCEPT / DISMISS SUGGESTION ─────────────────────

export async function acceptSuggestion(id: string, updates?: { titre?: string; tacheDueDate?: string }) {
  const existing = await prisma.activite.findUnique({ where: { id } });
  if (!existing) throw new Error('Suggestion not found');

  const meta = existing.metadata as any;

  return prisma.activite.update({
    where: { id },
    data: {
      titre: updates?.titre ?? existing.titre,
      tacheDueDate: updates?.tacheDueDate ? new Date(updates.tacheDueDate) : existing.tacheDueDate,
      metadata: { ...meta, aiStatus: 'accepted' },
    },
  });
}

export async function dismissSuggestion(id: string) {
  const existing = await prisma.activite.findUnique({ where: { id } });
  if (!existing) throw new Error('Suggestion not found');

  const meta = existing.metadata as any;

  return prisma.activite.update({
    where: { id },
    data: {
      tacheCompleted: true,
      metadata: { ...meta, aiStatus: 'dismissed' },
    },
  });
}

// ─── AUTO-EXTRACT TASKS FROM RECENT EMAILS ─────────

const PROCESSED_EMAILS_KEY = 'humanup:processed-email-ids';

/**
 * Automatically processes recent emails that haven't been analyzed yet.
 * - Fetches last N inbox messages from Gmail
 * - Skips those already processed (tracked in DB metadata)
 * - Extracts tasks from unprocessed emails via Claude
 * - Returns new suggestions created
 */
export async function autoExtractFromEmails(userId: string): Promise<{
  processed: number;
  newSuggestions: number;
  suggestions: AiSuggestion[];
}> {
  // Check if Gmail is connected
  const gmailConfig = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: 'gmail' } },
  });

  if (!gmailConfig?.enabled) {
    return { processed: 0, newSuggestions: 0, suggestions: [] };
  }

  // Check if ANTHROPIC_API_KEY is set
  if (!process.env.ANTHROPIC_API_KEY) {
    return { processed: 0, newSuggestions: 0, suggestions: [] };
  }

  // Get recent emails
  let messages: InboxMessage[];
  try {
    messages = await getRecentInboxMessages(userId, 10);
  } catch (error) {
    console.warn('[AI] Failed to fetch recent emails:', error);
    return { processed: 0, newSuggestions: 0, suggestions: [] };
  }

  if (messages.length === 0) {
    return { processed: 0, newSuggestions: 0, suggestions: [] };
  }

  // Find which emails have already been processed
  const alreadyProcessed = await prisma.activite.findMany({
    where: {
      userId,
      source: 'AGENT_IA',
      metadata: {
        path: ['sourceType'],
        equals: 'email',
      },
    },
    select: { metadata: true },
  });

  const processedEmailIds = new Set(
    alreadyProcessed
      .map(a => (a.metadata as any)?.sourceId)
      .filter(Boolean),
  );

  // Filter to unprocessed emails
  const unprocessed = messages.filter(m => !processedEmailIds.has(m.id));

  if (unprocessed.length === 0) {
    return { processed: 0, newSuggestions: 0, suggestions: [] };
  }

  // Process up to 5 emails at a time to avoid overloading
  const toProcess = unprocessed.slice(0, 5);
  const allSuggestions: AiSuggestion[] = [];

  for (const msg of toProcess) {
    const emailText = `De: ${msg.from.name} <${msg.from.email}>
Sujet: ${msg.subject}
Date: ${msg.date}

${msg.snippet}`;

    try {
      const suggestions = await extractTasks({
        text: emailText,
        sourceType: 'email',
        sourceId: msg.id,
        userId,
        contextDate: new Date(msg.date),
      });
      allSuggestions.push(...suggestions);
    } catch (error) {
      console.warn(`[AI] Failed to extract tasks from email ${msg.id}:`, error);
    }
  }

  return {
    processed: toProcess.length,
    newSuggestions: allSuggestions.length,
    suggestions: allSuggestions,
  };
}
