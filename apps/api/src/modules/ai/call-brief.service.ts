import prisma from '../../lib/db.js';
import { callClaudeWithWebSearch } from '../../services/claudeAI.js';
import * as notificationService from '../notifications/notification.service.js';

// ─── TYPES ──────────────────────────────────────────

interface CallBriefResult {
  id: string;
  entityType: string;
  entityId: string;
  briefJson: any;
  generatedAt: Date;
  expiresAt: Date;
  cached: boolean;
}

// ─── SYSTEM PROMPT ─────────────────────────────────

const SYSTEM_PROMPT = `Tu es un assistant pour recruteurs en cabinet. Tu prépares des briefs pré-appel concis et actionnables.
Tu as accès à l'outil de recherche web. Utilise-le pour :
1. Chercher "{{contact_name}} {{company_name}}" — actualités, interviews, posts LinkedIn
2. Chercher "{{company_name}} recrutement" ou "{{company_name}} hiring" — offres d'emploi
3. Chercher "{{company_name}} actualités" — levées de fonds, expansion, restructuration
4. Chercher "{{company_name}} {{sector}} news" — actualités sectorielles

Ton brief doit permettre au recruteur d'être parfaitement préparé en 30 secondes de lecture.

Réponds UNIQUEMENT en JSON valide avec cette structure exacte :
{
  "contact_snapshot": {
    "name": "string",
    "title": "string",
    "company": "string",
    "relationship_status": "string",
    "last_interaction": "string",
    "key_info": ["string"]
  },
  "what_happened_since_last_contact": ["string"],
  "web_intelligence": {
    "company_news": [{ "headline": "string", "summary": "string", "relevance": "string", "source": "string", "date": "string" }],
    "hiring_signals": ["string"],
    "contact_activity": ["string"]
  },
  "talking_points": [{ "topic": "string", "context": "string", "suggested_angle": "string" }],
  "risks_and_warnings": ["string"],
  "objective_suggestion": "string"
}`;

// ─── HELPERS ────────────────────────────────────────

function formatActivitiesContext(activities: any[]): string {
  if (activities.length === 0) return 'Aucune activité récente.';

  return activities
    .map((a) => {
      const date = new Date(a.createdAt).toLocaleDateString('fr-FR');
      const type = a.type;
      const direction = a.direction ? ` (${a.direction})` : '';
      const titre = a.titre ? ` — ${a.titre}` : '';
      const contenu = a.contenu ? `\n   ${a.contenu.slice(0, 300)}` : '';
      return `- [${date}] ${type}${direction}${titre}${contenu}`;
    })
    .join('\n');
}

function formatCandidaturesContext(candidatures: any[]): string {
  if (candidatures.length === 0) return 'Aucune candidature en cours.';

  return candidatures
    .map((c) => {
      const mandat = c.mandat;
      return `- ${mandat.titrePoste} chez ${mandat.entreprise?.nom ?? 'N/A'} — Étape : ${c.stage}`;
    })
    .join('\n');
}

function formatMandatsContext(mandats: any[]): string {
  if (mandats.length === 0) return 'Aucun mandat associé.';

  return mandats
    .map((m) => {
      const statut = m.statut;
      const candidatures = m.candidatures?.length ?? 0;
      return `- ${m.titrePoste} (${statut}) — ${candidatures} candidat(s) en process`;
    })
    .join('\n');
}

function formatCallSummariesContext(summaries: any[]): string {
  if (summaries.length === 0) return 'Aucun résumé d\'appel précédent.';

  return summaries
    .map((s) => {
      const date = new Date(s.createdAt).toLocaleDateString('fr-FR');
      const json = s.summaryJson as any;
      const summary = json?.resume_narratif || json?.summary || 'Résumé disponible';
      return `- [${date}] ${typeof summary === 'string' ? summary.slice(0, 300) : 'Résumé disponible'}`;
    })
    .join('\n');
}

// ─── LOAD ENTITY CONTEXT ────────────────────────────

async function loadCandidatContext(entityId: string) {
  const candidat = await prisma.candidat.findUnique({
    where: { id: entityId },
    include: {
      candidatures: {
        include: {
          mandat: {
            include: { entreprise: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!candidat) throw new Error(`Candidat ${entityId} introuvable`);

  const activities = await prisma.activite.findMany({
    where: { entiteType: 'CANDIDAT', entiteId: entityId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const callSummaries = await prisma.aiCallSummary.findMany({
    where: { entityType: 'CANDIDAT', entityId: entityId },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });

  const contactName = `${candidat.prenom || ''} ${candidat.nom}`.trim();
  const companyName = candidat.entrepriseActuelle || '';
  const sector = '';

  return {
    contactName,
    companyName,
    sector,
    contextText: `
=== FICHE CANDIDAT ===
Nom : ${contactName}
Poste actuel : ${candidat.posteActuel || 'Non renseigné'}
Entreprise actuelle : ${companyName || 'Non renseignée'}
Localisation : ${candidat.localisation || 'Non renseignée'}
Email : ${candidat.email || 'Non renseigné'}
Téléphone : ${candidat.telephone || 'Non renseigné'}
LinkedIn : ${candidat.linkedinUrl || 'Non renseigné'}
Disponibilité : ${candidat.disponibilite || 'Non renseignée'}
Salaire actuel : ${candidat.salaireActuel ? `${candidat.salaireActuel}€` : 'Non renseigné'}
Salaire souhaité : ${candidat.salaireSouhaite ? `${candidat.salaireSouhaite}€` : 'Non renseigné'}
Tags : ${candidat.tags.length > 0 ? candidat.tags.join(', ') : 'Aucun'}
Notes : ${candidat.notes || 'Aucune'}

=== CANDIDATURES EN COURS ===
${formatCandidaturesContext(candidat.candidatures)}

=== DERNIÈRES ACTIVITÉS (5 max) ===
${formatActivitiesContext(activities)}

=== RÉSUMÉS D'APPELS PRÉCÉDENTS ===
${formatCallSummariesContext(callSummaries)}
`.trim(),
  };
}

async function loadClientContext(entityId: string) {
  const client = await prisma.client.findUnique({
    where: { id: entityId },
    include: {
      entreprise: true,
      mandats: {
        include: {
          candidatures: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!client) throw new Error(`Client ${entityId} introuvable`);

  const activities = await prisma.activite.findMany({
    where: { entiteType: 'CLIENT', entiteId: entityId },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const callSummaries = await prisma.aiCallSummary.findMany({
    where: { entityType: 'CLIENT', entityId: entityId },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });

  const contactName = `${client.prenom || ''} ${client.nom}`.trim();
  const companyName = client.entreprise?.nom || '';
  const sector = client.entreprise?.secteur || '';

  return {
    contactName,
    companyName,
    sector,
    contextText: `
=== FICHE CLIENT ===
Nom : ${contactName}
Poste : ${client.poste || 'Non renseigné'}
Rôle : ${client.roleContact || 'Non renseigné'}
Statut : ${client.statutClient}
Email : ${client.email || 'Non renseigné'}
Téléphone : ${client.telephone || 'Non renseigné'}
LinkedIn : ${client.linkedinUrl || 'Non renseigné'}
Entreprise : ${companyName}
Secteur : ${sector || 'Non renseigné'}
Localisation : ${client.entreprise?.localisation || 'Non renseignée'}
Site web : ${client.entreprise?.siteWeb || 'Non renseigné'}
Notes : ${client.notes || 'Aucune'}

=== MANDATS ASSOCIÉS ===
${formatMandatsContext(client.mandats)}

=== DERNIÈRES ACTIVITÉS (5 max) ===
${formatActivitiesContext(activities)}

=== RÉSUMÉS D'APPELS PRÉCÉDENTS ===
${formatCallSummariesContext(callSummaries)}
`.trim(),
  };
}

// ─── PUBLIC: generateCallBrief ──────────────────────

export async function generateCallBrief(
  entityType: 'CANDIDAT' | 'CLIENT',
  entityId: string,
  userId: string,
  calendarEventId?: string,
  forceRefresh = false,
): Promise<CallBriefResult> {
  // 1. Check cache (non-expired brief)
  if (!forceRefresh) {
    const cached = await getCachedBrief(entityType, entityId);
    if (cached) {
      return {
        id: cached.id,
        entityType: cached.entityType,
        entityId: cached.entityId,
        briefJson: cached.briefJson,
        generatedAt: cached.generatedAt,
        expiresAt: cached.expiresAt,
        cached: true,
      };
    }
  }

  // 2. Load internal context from ATS
  const context =
    entityType === 'CANDIDAT'
      ? await loadCandidatContext(entityId)
      : await loadClientContext(entityId);

  // 3. Build user prompt with the internal context
  const userPrompt = `Voici les données internes de notre ATS sur ce contact. Utilise-les comme base, puis enrichis avec tes recherches web.

${context.contextText}

---

Recherche sur le web les informations suivantes :
1. "${context.contactName} ${context.companyName}" — actualités, profil LinkedIn, interviews
2. "${context.companyName} recrutement" ou "${context.companyName} hiring" — offres d'emploi ouvertes
3. "${context.companyName} actualités" — levées de fonds, expansion, restructuration
${context.sector ? `4. "${context.companyName} ${context.sector} news" — actualités sectorielles` : ''}

Génère un brief pré-appel complet en JSON.`;

  // 4. Call Claude with web search
  const systemPrompt = SYSTEM_PROMPT
    .replace(/\{\{contact_name\}\}/g, context.contactName)
    .replace(/\{\{company_name\}\}/g, context.companyName)
    .replace(/\{\{sector\}\}/g, context.sector || 'N/A');

  const response = await callClaudeWithWebSearch({
    feature: 'call_brief',
    systemPrompt,
    userPrompt,
    userId,
    maxTokens: 4000,
    temperature: 0,
  });

  // 5. Store result in AiCallBrief with 24h expiry
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const brief = await prisma.aiCallBrief.create({
    data: {
      entityType,
      entityId,
      calendarEventId: calendarEventId ?? null,
      userId,
      briefJson: response.content ?? {},
      webResultsRaw: { rawText: response.rawText, model: response.model },
      generatedAt: new Date(),
      expiresAt,
    },
  });

  // 6. Create notification if calendarEventId provided
  if (calendarEventId) {
    try {
      await notificationService.create({
        userId,
        type: 'AI_BRIEF_READY',
        titre: `Brief pré-appel prêt`,
        contenu: `Le brief pour ${context.contactName} est prêt. Consultez-le avant votre appel.`,
        entiteType: entityType === 'CANDIDAT' ? 'CANDIDAT' : 'CLIENT',
        entiteId: entityId,
      });
    } catch (err) {
      console.error('[call-brief] Failed to create notification:', err);
    }
  }

  // 7. Return
  return {
    id: brief.id,
    entityType: brief.entityType,
    entityId: brief.entityId,
    briefJson: brief.briefJson,
    generatedAt: brief.generatedAt,
    expiresAt: brief.expiresAt,
    cached: false,
  };
}

// ─── PUBLIC: getCachedBrief ────────────────────────

export async function getCachedBrief(entityType: string, entityId: string) {
  return prisma.aiCallBrief.findFirst({
    where: {
      entityType,
      entityId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { generatedAt: 'desc' },
  });
}
