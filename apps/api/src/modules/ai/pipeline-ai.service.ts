import prisma from '../../lib/db.js';
import { AppError, NotFoundError } from '../../lib/errors.js';
import { getAiConfigWithKey } from './ai-config.service.js';

// ─── TYPES ──────────────────────────────────────────

interface AiPipelineMove {
  candidatureId: string;
  currentStage: string;
  suggestedStage: string;
  confidence: number;
  reasoning: string;
  triggerType: 'calendar_event' | 'email' | 'call' | 'inactivity';
  triggerData?: Record<string, unknown>;
}

interface CandidatureWithContext {
  id: string;
  stage: string;
  candidat: {
    id: string;
    nom: string;
    prenom: string | null;
    email: string | null;
  };
  mandat: {
    id: string;
    titrePoste: string;
    entreprise: {
      nom: string;
    };
  };
  stageHistory: Array<{
    fromStage: string | null;
    toStage: string;
    changedAt: Date;
  }>;
  recentActivities: Array<{
    type: string;
    titre: string | null;
    contenu: string | null;
    source: string;
    createdAt: Date;
  }>;
  lastActivityDate: Date | null;
  daysSinceActivity: number | null;
}

// ─── CONSTANTS ──────────────────────────────────────

const PIPELINE_STAGES = [
  'SOURCING',
  'CONTACTE',
  'ENTRETIEN_1',
  'ENTRETIEN_CLIENT',
  'OFFRE',
  'PLACE',
] as const;

const EXCLUDED_STAGES = ['REFUSE', 'PLACE'];

const DORMANT_THRESHOLD_DAYS = 14;
const ACTIVITY_LOOKBACK_HOURS = 48;

// ─── HELPERS ────────────────────────────────────────

function getStageIndex(stage: string): number {
  return PIPELINE_STAGES.indexOf(stage as typeof PIPELINE_STAGES[number]);
}

function isForwardMove(currentStage: string, suggestedStage: string): boolean {
  const currentIdx = getStageIndex(currentStage);
  const suggestedIdx = getStageIndex(suggestedStage);
  if (currentIdx === -1 || suggestedIdx === -1) return false;
  return suggestedIdx > currentIdx;
}

function getStageFrenchLabel(stage: string): string {
  const labels: Record<string, string> = {
    SOURCING: 'Sourcing',
    CONTACTE: 'Contacte',
    ENTRETIEN_1: 'Entretien 1',
    ENTRETIEN_CLIENT: 'Entretien Client',
    OFFRE: 'Offre',
    PLACE: 'Place',
    REFUSE: 'Refuse',
  };
  return labels[stage] || stage;
}

// ─── AI PROMPT ──────────────────────────────────────

function buildSystemPrompt(): string {
  return `Tu es un assistant IA pour un ATS (Applicant Tracking System) de recrutement utilise par HumanUp, un cabinet de chasse de tetes.

Ton role : analyser l'activite recente des candidatures et suggerer des mouvements dans le pipeline de recrutement.

Etapes du pipeline (dans l'ordre) :
1. SOURCING - Candidat identifie
2. CONTACTE - Premier contact effectue
3. ENTRETIEN_1 - Entretien recruteur realise
4. ENTRETIEN_CLIENT - Entretien avec le client
5. OFFRE - Offre en cours
6. PLACE - Candidat place (final)

Regles STRICTES :
- Tu ne peux suggerer QUE des mouvements vers l'AVANT (ex: SOURCING -> CONTACTE, pas ENTRETIEN_1 -> SOURCING)
- Exception : les candidats dormants (aucune activite depuis 14+ jours) peuvent etre signales avec triggerType "inactivity"
- Pour les dormants, suggestedStage doit etre "REFUSE" (retirer du pipe) comme suggestion
- Confiance elevee (0.8+) : quand l'activite correspond clairement a l'etape suivante (ex: entretien realise -> passer a ENTRETIEN_1)
- Confiance moyenne (0.5-0.7) : quand il y a des indices mais pas de certitude
- Confiance basse (0.3-0.5) : signaux faibles

Analyse les indices suivants :
- Appel effectue / email envoye -> probablement passer de SOURCING a CONTACTE
- Entretien calendrier realise -> passer a ENTRETIEN_1
- Reunion avec le client -> passer a ENTRETIEN_CLIENT
- Discussion offre / negociation -> passer a OFFRE
- Aucune activite depuis 14+ jours -> signaler comme dormant

Reponds UNIQUEMENT en JSON valide. Retourne un tableau de suggestions :
[
  {
    "candidatureId": "uuid",
    "currentStage": "STAGE_ACTUEL",
    "suggestedStage": "STAGE_SUGGERE",
    "confidence": 0.0-1.0,
    "reasoning": "Explication courte en francais",
    "triggerType": "calendar_event" | "email" | "call" | "inactivity",
    "triggerData": { "details": "..." }
  }
]

Si aucune suggestion, retourne un tableau vide : []

Important :
- Retourne UNIQUEMENT du JSON valide, sans markdown ni explication.
- Les raisons doivent etre en francais.
- Ne suggere PAS de mouvement si le candidat est deja a l'etape appropriee.`;
}

function buildUserPrompt(candidatures: CandidatureWithContext[]): string {
  let prompt = 'Analyse les candidatures suivantes et leurs activites recentes :\n\n';

  for (const c of candidatures) {
    const candidatName = [c.candidat.prenom, c.candidat.nom].filter(Boolean).join(' ');
    prompt += `--- Candidature ${c.id} ---\n`;
    prompt += `Candidat: ${candidatName}\n`;
    prompt += `Poste: ${c.mandat.titrePoste} chez ${c.mandat.entreprise.nom}\n`;
    prompt += `Etape actuelle: ${c.stage}\n`;

    if (c.daysSinceActivity !== null) {
      prompt += `Jours depuis derniere activite: ${c.daysSinceActivity}\n`;
    } else {
      prompt += `Aucune activite enregistree\n`;
    }

    if (c.recentActivities.length > 0) {
      prompt += `Activites recentes (48h) :\n`;
      for (const a of c.recentActivities) {
        const date = a.createdAt.toISOString().split('T')[0];
        prompt += `  - [${date}] ${a.type} (${a.source}): ${a.titre || ''}${a.contenu ? ' - ' + a.contenu.substring(0, 150) : ''}\n`;
      }
    }

    if (c.stageHistory.length > 0) {
      prompt += `Historique etapes recent :\n`;
      for (const h of c.stageHistory) {
        const date = h.changedAt.toISOString().split('T')[0];
        prompt += `  - [${date}] ${h.fromStage || '(debut)'} -> ${h.toStage}\n`;
      }
    }

    prompt += '\n';
  }

  prompt += 'Retourne tes suggestions de mouvements pipeline en JSON.';
  return prompt;
}

// ─── AI PROVIDER CALL ───────────────────────────────

async function callAiProvider(
  userId: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const config = await getAiConfigWithKey(userId);
  if (!config) {
    throw new AppError(400, 'Configuration IA non trouvee. Veuillez configurer votre cle API dans les parametres.');
  }

  let responseText = '';

  if (config.aiProvider === 'gemini') {
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
      throw new AppError(502, `Erreur Gemini: ${err.error?.message || response.status}`);
    }

    const data = (await response.json()) as any;
    responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } else if (config.aiProvider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4000,
        temperature: 0.1,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = (await response.json()) as any;
      throw new AppError(502, `Erreur Anthropic: ${err.error?.message || response.status}`);
    }

    const data = (await response.json()) as any;
    responseText = data.content?.[0]?.text || '';
  } else if (config.aiProvider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        max_tokens: 4000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const err = (await response.json()) as any;
      throw new AppError(502, `Erreur OpenAI: ${err.error?.message || response.status}`);
    }

    const data = (await response.json()) as any;
    responseText = data.choices?.[0]?.message?.content || '';
  } else {
    throw new AppError(400, `Fournisseur IA non reconnu: ${config.aiProvider}`);
  }

  return responseText;
}

function parseAiResponse(responseText: string): AiPipelineMove[] {
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    console.error('[PipelineAI] Failed to parse AI response:', cleaned.substring(0, 200));
    return [];
  }
}

// ─── MAIN SERVICE FUNCTIONS ─────────────────────────

/**
 * Analyze pipeline and suggest stage moves for active candidatures.
 */
export async function analyzePipelineMoves(userId: string) {
  // 1. Get all mandats assigned to or created by this user
  const mandats = await prisma.mandat.findMany({
    where: {
      OR: [
        { assignedToId: userId },
        { createdById: userId },
      ],
      statut: { in: ['OUVERT', 'EN_COURS'] },
    },
    select: { id: true },
  });

  const mandatIds = mandats.map((m) => m.id);

  if (mandatIds.length === 0) {
    return { suggestions: [], analyzed: 0, message: 'Aucun mandat actif trouve.' };
  }

  // 2. Get all active candidatures (not REFUSE/PLACE)
  const candidatures = await prisma.candidature.findMany({
    where: {
      mandatId: { in: mandatIds },
      stage: { notIn: ['REFUSE', 'PLACE'] },
    },
    include: {
      candidat: {
        select: { id: true, nom: true, prenom: true, email: true },
      },
      mandat: {
        select: {
          id: true,
          titrePoste: true,
          entreprise: { select: { nom: true } },
        },
      },
      stageHistory: {
        orderBy: { changedAt: 'desc' },
        take: 5,
        select: { fromStage: true, toStage: true, changedAt: true },
      },
    },
  });

  if (candidatures.length === 0) {
    return { suggestions: [], analyzed: 0, message: 'Aucune candidature active trouvee.' };
  }

  // 3. Get recent activities for each candidature's candidat (last 48 hours)
  const lookbackDate = new Date(Date.now() - ACTIVITY_LOOKBACK_HOURS * 60 * 60 * 1000);

  const candidatIds = [...new Set(candidatures.map((c) => c.candidatId))];

  // Fetch recent activities for all relevant candidats
  const recentActivities = await prisma.activite.findMany({
    where: {
      entiteType: 'CANDIDAT',
      entiteId: { in: candidatIds },
      createdAt: { gte: lookbackDate },
    },
    select: {
      entiteId: true,
      type: true,
      titre: true,
      contenu: true,
      source: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Also fetch the last activity date for dormant detection (any activity ever)
  const lastActivities = await prisma.activite.findMany({
    where: {
      entiteType: 'CANDIDAT',
      entiteId: { in: candidatIds },
    },
    select: {
      entiteId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Build a map of candidatId -> last activity date
  const lastActivityMap = new Map<string, Date>();
  for (const a of lastActivities) {
    if (!lastActivityMap.has(a.entiteId)) {
      lastActivityMap.set(a.entiteId, a.createdAt);
    }
  }

  // Build activity map by candidatId
  const activityMap = new Map<string, typeof recentActivities>();
  for (const a of recentActivities) {
    if (!activityMap.has(a.entiteId)) activityMap.set(a.entiteId, []);
    activityMap.get(a.entiteId)!.push(a);
  }

  // 4. Build context for each candidature
  const candidaturesWithContext: CandidatureWithContext[] = candidatures.map((c) => {
    const lastDate = lastActivityMap.get(c.candidatId) || null;
    const daysSince = lastDate
      ? Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      id: c.id,
      stage: c.stage,
      candidat: c.candidat,
      mandat: c.mandat,
      stageHistory: c.stageHistory.map((h) => ({
        fromStage: h.fromStage,
        toStage: h.toStage,
        changedAt: h.changedAt,
      })),
      recentActivities: (activityMap.get(c.candidatId) || []).map((a) => ({
        type: a.type,
        titre: a.titre,
        contenu: a.contenu,
        source: a.source,
        createdAt: a.createdAt,
      })),
      lastActivityDate: lastDate,
      daysSinceActivity: daysSince,
    };
  });

  // Filter: only include candidatures that have recent activity OR are dormant
  const relevantCandidatures = candidaturesWithContext.filter((c) => {
    const hasRecentActivity = c.recentActivities.length > 0;
    const isDormant = c.daysSinceActivity !== null && c.daysSinceActivity >= DORMANT_THRESHOLD_DAYS;
    const neverContacted = c.daysSinceActivity === null && c.stage !== 'SOURCING';
    return hasRecentActivity || isDormant || neverContacted;
  });

  if (relevantCandidatures.length === 0) {
    return {
      suggestions: [],
      analyzed: candidatures.length,
      message: 'Aucun mouvement pipeline a suggerer. Toutes les candidatures sont a jour.',
    };
  }

  console.log(`[PipelineAI] Analyzing ${relevantCandidatures.length} candidatures (${candidatures.length} total active)`);

  // 5. Call AI
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(relevantCandidatures);
  const aiResponseText = await callAiProvider(userId, systemPrompt, userPrompt);
  const aiSuggestions = parseAiResponse(aiResponseText);

  console.log(`[PipelineAI] AI returned ${aiSuggestions.length} suggestions`);

  // 6. Validate and create suggestion records
  const createdSuggestions = [];

  for (const suggestion of aiSuggestions) {
    // Find matching candidature
    const candidature = candidaturesWithContext.find((c) => c.id === suggestion.candidatureId);
    if (!candidature) {
      console.warn(`[PipelineAI] Candidature ${suggestion.candidatureId} not found, skipping`);
      continue;
    }

    // Validate stage move (must be forward, unless inactivity -> REFUSE)
    const isTriggerInactivity = suggestion.triggerType === 'inactivity';
    const targetStage = suggestion.suggestedStage;

    if (!isTriggerInactivity && !isForwardMove(candidature.stage, targetStage)) {
      console.warn(`[PipelineAI] Backward move rejected: ${candidature.stage} -> ${targetStage}`);
      continue;
    }

    // Check for duplicate pending suggestion
    const existingSuggestion = await prisma.aiPipelineSuggestion.findFirst({
      where: {
        candidatureId: suggestion.candidatureId,
        userId,
        status: 'pending',
        suggestedStage: targetStage,
      },
    });

    if (existingSuggestion) {
      console.log(`[PipelineAI] Duplicate suggestion skipped for ${suggestion.candidatureId}`);
      continue;
    }

    const record = await prisma.aiPipelineSuggestion.create({
      data: {
        candidatureId: suggestion.candidatureId,
        mandatId: candidature.mandat.id,
        userId,
        currentStage: candidature.stage,
        suggestedStage: targetStage,
        confidence: suggestion.confidence ?? 0.5,
        reasoning: suggestion.reasoning || null,
        triggerType: suggestion.triggerType || 'call',
        triggerData: suggestion.triggerData || undefined,
        status: 'pending',
      },
    });

    createdSuggestions.push(record);
  }

  console.log(`[PipelineAI] Created ${createdSuggestions.length} suggestion records`);

  return {
    suggestions: createdSuggestions,
    analyzed: candidatures.length,
    relevant: relevantCandidatures.length,
    message: `${createdSuggestions.length} suggestion(s) de mouvement pipeline creee(s) a partir de ${candidatures.length} candidatures.`,
  };
}

/**
 * Get pending pipeline suggestions for a user with candidature and mandat details.
 */
export async function getSuggestions(userId: string) {
  const suggestions = await prisma.aiPipelineSuggestion.findMany({
    where: { userId, status: 'pending' },
    include: {
      candidature: {
        include: {
          candidat: {
            select: { id: true, nom: true, prenom: true, email: true, posteActuel: true },
          },
          mandat: {
            select: {
              id: true,
              titrePoste: true,
              entreprise: { select: { nom: true } },
            },
          },
        },
      },
    },
    orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
  });

  return suggestions.map((s) => ({
    id: s.id,
    candidatureId: s.candidatureId,
    mandatId: s.mandatId,
    currentStage: s.currentStage,
    currentStageLabel: getStageFrenchLabel(s.currentStage),
    suggestedStage: s.suggestedStage,
    suggestedStageLabel: getStageFrenchLabel(s.suggestedStage),
    confidence: s.confidence,
    reasoning: s.reasoning,
    triggerType: s.triggerType,
    triggerData: s.triggerData,
    status: s.status,
    createdAt: s.createdAt,
    candidat: s.candidature.candidat,
    mandat: {
      id: s.candidature.mandat.id,
      titrePoste: s.candidature.mandat.titrePoste,
      entrepriseNom: s.candidature.mandat.entreprise.nom,
    },
  }));
}

/**
 * Apply a pipeline suggestion: move the candidature to the suggested (or overridden) stage.
 */
export async function applySuggestion(id: string, userId: string, stage?: string) {
  const suggestion = await prisma.aiPipelineSuggestion.findUnique({
    where: { id },
    include: {
      candidature: {
        include: {
          candidat: { select: { nom: true, prenom: true } },
          mandat: { select: { titrePoste: true, entreprise: { select: { nom: true } } } },
        },
      },
    },
  });

  if (!suggestion) {
    throw new NotFoundError('Suggestion pipeline', id);
  }

  if (suggestion.userId !== userId) {
    throw new AppError(403, 'Acces interdit a cette suggestion.');
  }

  if (suggestion.status !== 'pending') {
    throw new AppError(400, 'Cette suggestion a deja ete traitee.');
  }

  const targetStage = stage || suggestion.suggestedStage;

  // Validate that the target stage exists
  const validStages = [...PIPELINE_STAGES, 'REFUSE'];
  if (!validStages.includes(targetStage)) {
    throw new AppError(400, `Etape invalide: ${targetStage}`);
  }

  const candidatName = [suggestion.candidature.candidat.prenom, suggestion.candidature.candidat.nom]
    .filter(Boolean)
    .join(' ');

  // 1. Update candidature stage
  await prisma.candidature.update({
    where: { id: suggestion.candidatureId },
    data: { stage: targetStage as any },
  });

  // 2. Create StageHistory record
  await prisma.stageHistory.create({
    data: {
      candidatureId: suggestion.candidatureId,
      fromStage: suggestion.currentStage as any,
      toStage: targetStage as any,
      changedById: userId,
    },
  });

  // 3. Create Activite record
  const isInactivity = suggestion.triggerType === 'inactivity';
  await prisma.activite.create({
    data: {
      type: 'NOTE',
      entiteType: 'CANDIDAT',
      entiteId: suggestion.candidature.candidatId,
      userId,
      titre: isInactivity
        ? `Candidat retire du pipe (dormant)`
        : `Pipeline: ${getStageFrenchLabel(suggestion.currentStage)} → ${getStageFrenchLabel(targetStage)}`,
      contenu: `Mouvement pipeline applique via suggestion IA.\n${suggestion.reasoning || ''}\nPoste: ${suggestion.candidature.mandat.titrePoste} — ${suggestion.candidature.mandat.entreprise.nom}`,
      source: 'AGENT_IA',
      metadata: {
        pipelineSuggestionId: suggestion.id,
        fromStage: suggestion.currentStage,
        toStage: targetStage,
        confidence: suggestion.confidence,
        triggerType: suggestion.triggerType,
      },
    },
  });

  // 4. Mark suggestion as accepted
  const updated = await prisma.aiPipelineSuggestion.update({
    where: { id },
    data: {
      status: 'accepted',
      appliedStage: targetStage,
      resolvedAt: new Date(),
    },
  });

  return updated;
}

/**
 * Dismiss a pipeline suggestion.
 */
export async function dismissSuggestion(id: string, userId: string) {
  const suggestion = await prisma.aiPipelineSuggestion.findUnique({
    where: { id },
  });

  if (!suggestion) {
    throw new NotFoundError('Suggestion pipeline', id);
  }

  if (suggestion.userId !== userId) {
    throw new AppError(403, 'Acces interdit a cette suggestion.');
  }

  if (suggestion.status !== 'pending') {
    throw new AppError(400, 'Cette suggestion a deja ete traitee.');
  }

  const updated = await prisma.aiPipelineSuggestion.update({
    where: { id },
    data: {
      status: 'dismissed',
      resolvedAt: new Date(),
    },
  });

  return updated;
}
