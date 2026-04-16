import prisma from '../../lib/db.js';
import { callClaude } from '../../services/claudeAI.js';
import { AppError } from '../../lib/errors.js';
import * as notificationService from '../notifications/notification.service.js';

// ─── SYSTEM PROMPT ──────────────────────────────────

const CALL_SUMMARY_SYSTEM_PROMPT = `Tu es un assistant pour recruteurs en cabinet de recrutement spécialisé commercial/sales.
Tu analyses des transcriptions d'appels de recrutement.

Ton rôle :
1. Identifier le nom complet de l'interlocuteur (prénom + nom) et son entreprise si mentionnés
2. Résumer l'appel en 3 bullet points maximum (chacun max 20 mots)
3. Détecter le sentiment du contact (intéressé, hésitant, pas intéressé, etc.)
4. Extraire les actions concrètes à faire
5. Identifier les informations à mettre à jour sur la fiche (salaire, dispo, process concurrent, etc.)

Sois factuel et concis. Pas de blabla. Chaque bullet doit contenir une information actionnable.

Réponds UNIQUEMENT en JSON valide.`;

// ─── TYPES ──────────────────────────────────────────

interface CallSummaryJson {
  interlocutor: {
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    job_title: string | null;
  };
  summary: string[];
  sentiment: 'positive_interested' | 'positive_cautious' | 'neutral' | 'hesitant' | 'negative_not_interested';
  sentiment_detail: string;
  action_items: Array<{
    title: string;
    priority: 'high' | 'medium' | 'low';
    deadline_hint: string | null;
  }>;
  info_updates: Array<{
    field: 'expected_salary' | 'availability' | 'notice_period' | 'competing_process' | 'location' | 'motivation' | 'other';
    label: string;
    current_value: string | null;
    suggested_value: string;
    source_quote: string;
  }>;
  key_quotes: Array<{
    quote: string;
    context: string;
  }>;
}

// ─── FIELD MAPPING (info_updates field → Prisma field) ───

const CANDIDAT_FIELD_MAP: Record<string, string> = {
  expected_salary: 'salaireSouhaite',
  availability: 'disponibilite',
  notice_period: 'disponibilite',
  location: 'localisation',
  motivation: 'notes',
};

const CLIENT_FIELD_MAP: Record<string, string> = {
  location: 'notes',
  motivation: 'notes',
};

// ─── GENERATE CALL SUMMARY ─────────────────────────

export async function generateCallSummary(activiteId: string, userId: string) {
  // 1. Load the activite - must be type APPEL
  const activite = await prisma.activite.findUnique({
    where: { id: activiteId },
  });

  if (!activite) {
    throw new Error('Activité introuvable');
  }

  if (activite.type !== 'APPEL') {
    throw new Error('Cette activité n\'est pas un appel');
  }

  // 2. Check conditions: contenu must have >= 50 words
  if (!activite.contenu) {
    throw new Error('L\'activité n\'a pas de contenu à analyser');
  }

  const wordCount = activite.contenu.trim().split(/\s+/).length;
  if (wordCount < 50) {
    throw new Error('Le contenu de l\'appel est trop court pour générer un résumé (minimum 50 mots)');
  }

  // 3. Check if summary already exists for this activiteId
  const existing = await prisma.aiCallSummary.findUnique({
    where: { activiteId },
  });

  if (existing) {
    return existing;
  }

  // 4. Load the related entity for context
  let entityContext = '';
  if (activite.entiteType === 'CANDIDAT') {
    const candidat = await prisma.candidat.findUnique({
      where: { id: activite.entiteId! },
      select: {
        nom: true,
        prenom: true,
        posteActuel: true,
        entrepriseActuelle: true,
        salaireSouhaite: true,
        disponibilite: true,
        localisation: true,
        tags: true,
      },
    });
    if (candidat) {
      entityContext = `\n\nContexte du candidat :
- Nom : ${candidat.prenom ?? ''} ${candidat.nom}
- Poste actuel : ${candidat.posteActuel ?? 'Non renseigné'}
- Entreprise actuelle : ${candidat.entrepriseActuelle ?? 'Non renseigné'}
- Salaire souhaité : ${candidat.salaireSouhaite ? `${candidat.salaireSouhaite}€` : 'Non renseigné'}
- Disponibilité : ${candidat.disponibilite ?? 'Non renseigné'}
- Localisation : ${candidat.localisation ?? 'Non renseigné'}
- Tags : ${candidat.tags.length > 0 ? candidat.tags.join(', ') : 'Aucun'}`;
    }
  } else if (activite.entiteType === 'CLIENT') {
    const client = await prisma.client.findUnique({
      where: { id: activite.entiteId! },
      select: {
        nom: true,
        prenom: true,
        poste: true,
        entrepriseId: true,
        statutClient: true,
      },
    });
    if (client) {
      entityContext = `\n\nContexte du client :
- Nom : ${client.prenom ?? ''} ${client.nom}
- Poste : ${client.poste ?? 'Non renseigné'}
- Statut : ${client.statutClient}`;
    }
  }

  // 5. Build user prompt
  const userPrompt = `Voici la transcription/notes d'un appel de recrutement :

${activite.contenu}${entityContext}

Analyse cet appel et retourne le JSON suivant :
{
  "interlocutor": {
    "first_name": "prénom de l'interlocuteur (pas le recruteur) ou null",
    "last_name": "nom de famille ou null",
    "company": "entreprise actuelle de l'interlocuteur ou null",
    "job_title": "poste/titre actuel ou null"
  },
  "summary": ["bullet 1 (max 20 mots)", "bullet 2 (max 20 mots)", "bullet 3 (max 20 mots)"],
  "sentiment": "positive_interested | positive_cautious | neutral | hesitant | negative_not_interested",
  "sentiment_detail": "explication en 1 phrase (max 25 mots)",
  "action_items": [
    { "title": "commence par un verbe", "priority": "high | medium | low", "deadline_hint": "string | null" }
  ],
  "info_updates": [
    { "field": "expected_salary | availability | notice_period | competing_process | location | motivation | other", "label": "libellé court", "current_value": "valeur actuelle ou null", "suggested_value": "nouvelle valeur détectée", "source_quote": "citation max 15 mots" }
  ],
  "key_quotes": [
    { "quote": "verbatim max 20 mots", "context": "pourquoi c'est important" }
  ]
}`;

  // 6. Call Claude
  const response = await callClaude({
    feature: 'call_summary',
    systemPrompt: CALL_SUMMARY_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 2000,
    temperature: 0,
    userId,
  });

  const summaryJson = response.content as CallSummaryJson;

  // 7. Store in AiCallSummary
  const fallbackUuid = '00000000-0000-0000-0000-000000000000';
  const summary = await prisma.aiCallSummary.create({
    data: {
      activiteId,
      entityType: activite.entiteType ?? 'CANDIDAT',
      entityId: activite.entiteId || fallbackUuid,
      userId,
      summaryJson: summaryJson as any,
      actionsAccepted: [],
      updatesApplied: [],
    },
  });

  // 8. Create notification AI_SUMMARY_READY
  await notificationService.create({
    userId,
    type: 'AI_SUMMARY_READY',
    titre: 'Résumé IA disponible',
    contenu: `Le résumé de votre appel est prêt. ${summaryJson.action_items?.length ?? 0} action(s) suggérée(s).`,
    entiteType: (activite.entiteType ?? undefined) as any,
    entiteId: activite.entiteId ?? undefined,
  });

  // 9. Return the summary
  return summary;
}

// ─── GET CALL SUMMARY ───────────────────────────────

export async function getCallSummary(activiteId: string) {
  return prisma.aiCallSummary.findUnique({
    where: { activiteId },
  });
}

// ─── ACCEPT ACTION ITEM ────────────────────────────

export async function acceptActionItem(summaryId: string, actionIndex: number, userId: string) {
  // 1. Load the summary
  const summary = await prisma.aiCallSummary.findUnique({
    where: { id: summaryId },
  });

  if (!summary) {
    throw new AppError(404, 'Résumé IA introuvable');
  }

  const summaryJson = summary.summaryJson as unknown as CallSummaryJson;

  // 2. Extract the action item
  if (!summaryJson.action_items || actionIndex < 0 || actionIndex >= summaryJson.action_items.length) {
    throw new AppError(400, 'Action introuvable dans le résumé');
  }

  const actionItem = summaryJson.action_items[actionIndex];

  // Check if already accepted
  const accepted = (summary.actionsAccepted as number[]) ?? [];
  if (accepted.includes(actionIndex)) {
    throw new AppError(409, 'Cette action a déjà été acceptée');
  }

  // 3. Calculate deadline from hint
  const tacheDueDate = calculateDeadlineFromHint(actionItem.deadline_hint);

  // 4. Create a tache (Activite with isTache=true, source=AGENT_IA)
  const tache = await prisma.activite.create({
    data: {
      type: 'TACHE',
      entiteType: summary.entityType as any,
      entiteId: summary.entityId,
      userId,
      titre: actionItem.title,
      contenu: `Action suggérée par l'IA suite à un appel. Priorité : ${actionItem.priority}`,
      source: 'AGENT_IA',
      isTache: true,
      tacheCompleted: false,
      tacheDueDate,
      metadata: {
        aiSummaryId: summaryId,
        actionIndex,
        priority: actionItem.priority,
        aiStatus: 'accepted',
      },
    },
  });

  // 5. Update actionsAccepted array
  await prisma.aiCallSummary.update({
    where: { id: summaryId },
    data: {
      actionsAccepted: [...accepted, actionIndex],
    },
  });

  // 6. Return the created task
  return tache;
}

// ─── APPLY INFO UPDATES ────────────────────────────

export async function applyInfoUpdates(summaryId: string, updateIndices: number[], userId: string) {
  // 1. Load the summary
  const summary = await prisma.aiCallSummary.findUnique({
    where: { id: summaryId },
  });

  if (!summary) {
    throw new AppError(404, 'Résumé IA introuvable');
  }

  const summaryJson = summary.summaryJson as unknown as CallSummaryJson;

  if (!summaryJson.info_updates || summaryJson.info_updates.length === 0) {
    throw new AppError(400, 'Aucune mise à jour disponible dans ce résumé');
  }

  const alreadyApplied = (summary.updatesApplied as number[]) ?? [];
  let appliedCount = 0;

  // 2. For each selected info_update
  for (const idx of updateIndices) {
    if (idx < 0 || idx >= summaryJson.info_updates.length) continue;
    if (alreadyApplied.includes(idx)) continue;

    const update = summaryJson.info_updates[idx];

    // 3. Update the candidat/client field
    if (summary.entityType === 'CANDIDAT') {
      const fieldName = CANDIDAT_FIELD_MAP[update.field];
      if (fieldName) {
        const updateData: Record<string, unknown> = {};

        if (fieldName === 'salaireSouhaite') {
          // Parse salary: extract number from string like "75k", "75000", "75 000"
          const salaryNum = parseSalary(update.suggested_value);
          if (salaryNum) {
            updateData[fieldName] = salaryNum;
          }
        } else if (fieldName === 'notes') {
          // Append to notes instead of replacing
          const candidat = await prisma.candidat.findUnique({
            where: { id: summary.entityId },
            select: { notes: true },
          });
          const existingNotes = candidat?.notes ?? '';
          const newNote = `[IA - ${update.label}] ${update.suggested_value}`;
          updateData[fieldName] = existingNotes ? `${existingNotes}\n${newNote}` : newNote;
        } else {
          updateData[fieldName] = update.suggested_value;
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.candidat.update({
            where: { id: summary.entityId },
            data: updateData,
          });
          appliedCount++;
        }
      } else if (update.field === 'competing_process' || update.field === 'other') {
        // Append to notes for fields without direct mapping
        const candidat = await prisma.candidat.findUnique({
          where: { id: summary.entityId },
          select: { notes: true },
        });
        const existingNotes = candidat?.notes ?? '';
        const newNote = `[IA - ${update.label}] ${update.suggested_value}`;
        await prisma.candidat.update({
          where: { id: summary.entityId },
          data: { notes: existingNotes ? `${existingNotes}\n${newNote}` : newNote },
        });
        appliedCount++;
      }
    } else if (summary.entityType === 'CLIENT') {
      // For clients, most updates go to notes
      const client = await prisma.client.findUnique({
        where: { id: summary.entityId },
        select: { notes: true },
      });
      const existingNotes = client?.notes ?? '';
      const newNote = `[IA - ${update.label}] ${update.suggested_value}`;
      await prisma.client.update({
        where: { id: summary.entityId },
        data: { notes: existingNotes ? `${existingNotes}\n${newNote}` : newNote },
      });
      appliedCount++;
    }
  }

  // 4. Update updatesApplied array
  const newApplied = [...alreadyApplied, ...updateIndices.filter(i => !alreadyApplied.includes(i))];
  await prisma.aiCallSummary.update({
    where: { id: summaryId },
    data: {
      updatesApplied: newApplied,
    },
  });

  // 5. Return count of applied updates
  return { appliedCount, totalRequested: updateIndices.length };
}

// ─── HELPERS ────────────────────────────────────────

function parseSalary(value: string): number | null {
  if (!value) return null;
  // Remove spaces and lowercase
  const clean = value.replace(/\s/g, '').toLowerCase();

  // Match patterns like "75k", "75K€", "75000", "75 000€"
  const kMatch = clean.match(/^(\d+)k/);
  if (kMatch) return parseInt(kMatch[1], 10) * 1000;

  const numMatch = clean.match(/^(\d+)/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    // If less than 1000, assume it's in k
    return num < 1000 ? num * 1000 : num;
  }

  return null;
}

function calculateDeadlineFromHint(hint: string | null): Date | null {
  if (!hint) return null;

  const now = new Date();
  const lower = hint.toLowerCase().trim();

  if (lower === 'asap' || lower === 'urgent' || lower.includes('immédiat')) {
    return now;
  }
  if (lower === 'demain' || lower.includes('tomorrow')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (lower.includes('cette semaine') || lower.includes('fin de semaine')) {
    const d = new Date(now);
    const dayOfWeek = d.getDay();
    const daysToFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 0;
    d.setDate(d.getDate() + daysToFriday);
    return d;
  }
  if (lower.includes('semaine prochaine')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return d;
  }

  // Try day names
  const daysMap: Record<string, number> = {
    lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5,
  };
  for (const [dayName, dayNum] of Object.entries(daysMap)) {
    if (lower.includes(dayName)) {
      const d = new Date(now);
      const currentDay = d.getDay() || 7;
      let diff = dayNum - currentDay;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return d;
    }
  }

  return null;
}
