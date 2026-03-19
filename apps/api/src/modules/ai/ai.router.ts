import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as aiService from './ai.service.js';
import * as aiConfigService from './ai-config.service.js';
import * as aiHelperService from './ai-helper.service.js';
import * as cvParsingService from './cv-parsing.service.js';
import * as callSummaryService from './call-summary.service.js';
import * as callBriefService from './call-brief.service.js';
import * as prospectDetectionService from './prospect-detection.service.js';
import { authenticate } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';
import prisma from '../../lib/db.js';
import * as documentService from '../documents/document.service.js';
import { callClaude } from '../../services/claudeAI.js';

/** Convert AI errors to user-friendly 503 responses instead of generic 500 */
function handleAiError(err: any, reply: FastifyReply) {
  const msg = err.message || '';
  let message: string;
  if (msg.includes('overloaded') || msg.includes('529')) {
    message = 'Le service IA est temporairement surchargé. Réessayez dans quelques secondes.';
  } else if (msg.includes('429')) {
    message = 'Trop de requêtes IA. Réessayez dans quelques secondes.';
  } else if (msg.includes('ANTHROPIC_API_KEY')) {
    message = 'Clé API Anthropic non configurée. Contactez l\'administrateur.';
  } else {
    message = `Erreur IA : ${msg.substring(0, 200)}`;
  }
  console.error('[AI Router] Error:', msg);
  reply.status(503);
  return { error: 'AI_ERROR', message };
}

const extractTasksSchema = z.object({
  text: z.string().min(1, 'Le texte est requis'),
  sourceType: z.enum(['email', 'allo_transcript', 'gemini_transcript']),
  sourceId: z.string().optional(),
});

const acceptSuggestionSchema = z.object({
  titre: z.string().optional(),
  tacheDueDate: z.string().datetime().optional(),
});

const saveAiConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'gemini']),
  apiKey: z.string().min(1, 'La clé API est requise'),
  model: z.string().min(1, 'Le modèle est requis'),
});

const aiRecommendSchema = z.object({
  candidatId: z.string().uuid(),
});

const aiPersonalizeSchema = z.object({
  candidatId: z.string().uuid(),
  emailSubject: z.string().min(1),
  emailBody: z.string().min(1),
  prospectClientIds: z.array(z.string().uuid()).min(1),
});

const prospectDetectionSchema = z.object({
  candidatId: z.string().uuid(),
  searchParams: z.object({
    sectors: z.array(z.string()).optional(),
    locations: z.array(z.string()).optional(),
    companySize: z.string().optional(),
    signalTypes: z.array(z.string()).optional(),
  }).optional(),
});

const createCompaniesSchema = z.object({
  prospects: z.array(z.object({
    companyName: z.string().min(1),
    sector: z.string().optional(),
    location: z.string().optional(),
    website: z.string().optional(),
  })).min(1),
});

const generateCallSummarySchema = z.object({
  activiteId: z.string().uuid(),
});

const generateCallBriefSchema = z.object({
  entityType: z.enum(['CANDIDAT', 'CLIENT']),
  entityId: z.string().uuid(),
  calendarEventId: z.string().optional(),
  forceRefresh: z.boolean().optional(),
});

const acceptActionSchema = z.object({
  actionIndex: z.number().int().min(0),
});

const applyUpdatesSchema = z.object({
  updateIndices: z.array(z.number().int().min(0)).min(1),
});

export default async function aiRouter(fastify: FastifyInstance) {
  // POST /extract-tasks — Extract tasks from text using Claude
  fastify.post('/extract-tasks', {
    schema: {
      description: 'Extraire des tâches d\'un texte via IA',
      tags: ['AI'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = extractTasksSchema.parse(request.body);
      const suggestions = await aiService.extractTasks({
        text: input.text,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        userId: request.userId,
      });
      return { data: suggestions, count: suggestions.length };
    },
  });

  // GET /suggestions — Get pending AI task suggestions
  fastify.get('/suggestions', {
    schema: {
      description: 'Obtenir les suggestions IA en attente de review',
      tags: ['AI'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const suggestions = await aiService.getAiSuggestions(request.userId);
      return { data: suggestions, count: suggestions.length };
    },
  });

  // PUT /suggestions/:id/accept — Accept an AI suggestion
  fastify.put('/suggestions/:id/accept', {
    schema: {
      description: 'Accepter une suggestion IA (la déplacer dans les tâches)',
      tags: ['AI'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = acceptSuggestionSchema.parse(request.body ?? {});
      const result = await aiService.acceptSuggestion(id, body);
      return { success: true, id: result.id };
    },
  });

  // POST /auto-extract — Auto-extract tasks from recent emails
  fastify.post('/auto-extract', {
    schema: {
      description: 'Auto-extraire des tâches depuis les emails récents non traités',
      tags: ['AI'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const result = await aiService.autoExtractFromEmails(request.userId);
      return result;
    },
  });

  // PUT /suggestions/:id/dismiss — Dismiss an AI suggestion
  fastify.put('/suggestions/:id/dismiss', {
    schema: {
      description: 'Ignorer une suggestion IA',
      tags: ['AI'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      await aiService.dismissSuggestion(id);
      return { success: true };
    },
  });

  // ─── AI CONFIGURATION ROUTES ─────────────────────────

  // GET /config — Get current AI config
  fastify.get('/config', {
    schema: {
      description: 'Obtenir la configuration IA de l\'utilisateur',
      tags: ['AI'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const config = await aiConfigService.getAiConfig(request.userId);
      return { data: config };
    },
  });

  // PUT /config — Save AI config
  fastify.put('/config', {
    schema: {
      description: 'Enregistrer la configuration IA',
      tags: ['AI'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = saveAiConfigSchema.parse(request.body);
      const result = await aiConfigService.saveAiConfig(request.userId, input);
      return { data: result };
    },
  });

  // POST /test — Test AI connection
  fastify.post('/test', {
    schema: {
      description: 'Tester la connexion IA',
      tags: ['AI'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const result = await aiConfigService.testAiConnection(request.userId);
      return result;
    },
  });

  // ─── ADCHASE AI ROUTES ───────────────────────────────

  // POST /adchase/recommend — AI recommendation for prospects
  fastify.post('/adchase/recommend', {
    schema: {
      description: 'Recommandation IA de prospects pour un candidat',
      tags: ['AI'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      try {
        const input = aiRecommendSchema.parse(request.body);
        const recommendations = await aiHelperService.aiRecommendProspects(
          request.userId,
          input.candidatId,
        );
        return { data: recommendations };
      } catch (err: any) {
        if (err.name === 'ZodError') throw err;
        return handleAiError(err, reply);
      }
    },
  });

  // POST /adchase/personalize — AI message personalization
  fastify.post('/adchase/personalize', {
    schema: {
      description: 'Personnalisation IA des messages par prospect',
      tags: ['AI'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      try {
        const input = aiPersonalizeSchema.parse(request.body);
        const personalized = await aiHelperService.aiPersonalizeMessages(
          request.userId,
          input.candidatId,
          input.emailSubject,
          input.emailBody,
          input.prospectClientIds,
        );
        return { data: personalized };
      } catch (err: any) {
        if (err.name === 'ZodError') throw err;
        return handleAiError(err, reply);
      }
    },
  });

  // POST /adchase/generate-pitch-email — AI email generation from profile
  fastify.post('/adchase/generate-pitch-email', {
    schema: {
      description: 'Générer un email de présentation Adchase via IA',
      tags: ['AI'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const body = request.body as {
        candidatId: string;
        profile: { titre: string; points: string[]; ville: string; secteur: string; experience: string };
      };

      try {
        const { callClaude } = await import('../../services/claudeAI.js');
        const prisma = (await import('../../lib/db.js')).default;

        // Enrich with full candidat data for sharper emails
        const candidat = await prisma.candidat.findUnique({
          where: { id: body.candidatId },
          select: {
            aiSellingPoints: true,
            aiPitchShort: true,
            tags: true,
            anneesExperience: true,
            experiences: {
              select: { titre: true, entreprise: true },
              orderBy: { anneeDebut: 'desc' as const },
              take: 5,
            },
          },
        });

        const sellingPoints = Array.isArray(candidat?.aiSellingPoints) ? (candidat.aiSellingPoints as string[]) : [];
        const expHistory = candidat?.experiences?.map((e: { titre: string; entreprise: string }) => `${e.titre} @ ${e.entreprise}`).join(', ') || '';

        const response = await callClaude({
          feature: 'cv_parsing',
          systemPrompt: `Tu es un headhunter senior chez Humanup.io, cabinet de recrutement international spécialisé. Tu as 15+ ans d'expérience dans le placement de profils commerciaux, sales et business development.

Tu contactes des DRH et hiring managers pour leur présenter un talent que tu as sourcé, qualifié et validé personnellement.

RÈGLES DE RÉDACTION :
- Ton : direct, factuel, confiant. Pas de formules bateau.
- NE COMMENCE JAMAIS par "Bonjour {{client_first_name}}" — commence par le hook directement, un fait, un chiffre, une accroche business.
- 5-6 lignes max pour le body. Chaque phrase doit apporter de la valeur.
- Objet court et percutant (max 8 mots). Pas de "Présentation d'un profil" ou "Opportunité" — sois spécifique.
- Montre que tu connais le marché et les enjeux du recrutement dans ce secteur.
- L'email doit donner envie d'en savoir plus, pas de tout révéler.
- Utilise les variables {{client_first_name}} et {{client_company}} de manière naturelle.
- JAMAIS de : "je me permets", "n'hésitez pas", "cordialement", "excellente opportunité", "profil exceptionnel"
- Signe avec "— L'équipe Humanup.io"

Réponds UNIQUEMENT en JSON valide : { "subject": "string", "body": "string" }`,
          userPrompt: `Profil candidat anonymisé :
- Titre : ${body.profile.titre}
- Ville : ${body.profile.ville}
- Secteur : ${body.profile.secteur || 'Non précisé'}
- Expérience : ${body.profile.experience || 'Non précisée'}
- Points clés : ${body.profile.points.join(' | ')}
${sellingPoints.length > 0 ? `- Selling points validés : ${sellingPoints.join(' | ')}` : ''}
${candidat?.aiPitchShort ? `- Pitch interne : ${candidat.aiPitchShort}` : ''}
${candidat?.tags?.length ? `- Compétences : ${(candidat.tags as string[]).join(', ')}` : ''}
${expHistory ? `- Parcours : ${expHistory}` : ''}

Rédige un email de prospection sharp pour présenter ce profil à un client.`,
          userId: request.userId,
          maxTokens: 800,
          temperature: 0.4,
        });

        return { data: response.content };
      } catch (err: any) {
        return handleAiError(err, reply);
      }
    },
  });

  // ─── MANDAT SCORECARD ROUTE ────────────────────────────

  // POST /mandat/:id/generate-scorecard — Generate AI scorecard from transcript/fiche de poste
  fastify.post('/mandat/:id/generate-scorecard', {
    schema: {
      description: 'Générer une scorecard IA pour un mandat depuis le transcript/fiche de poste',
      tags: ['AI'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as { transcript?: string; ficheDePoste?: string } | undefined;

        // If transcript or ficheDePoste provided in body, update the mandat first
        if (body?.transcript || body?.ficheDePoste) {
          const prisma = (await import('../../lib/db.js')).default;
          await prisma.mandat.update({
            where: { id },
            data: {
              ...(body.transcript && { transcript: body.transcript }),
              ...(body.ficheDePoste && { ficheDePoste: body.ficheDePoste }),
            },
          });
        }

        const scorecard = await aiHelperService.aiGenerateScorecard(
          request.userId,
          id,
        );
        return { data: scorecard };
      } catch (err: any) {
        if (err.message?.includes('non trouvé') || err.message?.includes('Ajoutez')) {
          reply.status(400);
          return { error: 'VALIDATION_ERROR', message: err.message };
        }
        return handleAiError(err, reply);
      }
    },
  });

  // ─── PROSPECT DETECTION ROUTES ──────────────────────────

  // POST /prospect-detection — Run AI prospect detection via weak signals
  fastify.post('/prospect-detection', {
    schema: {
      description: 'Détection IA de prospects via signaux faibles (web search)',
      tags: ['AI'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      try {
        const input = prospectDetectionSchema.parse(request.body);
        const result = await prospectDetectionService.detectProspects(
          input.candidatId,
          request.userId,
          input.searchParams ?? {},
        );
        return { data: result.data, cached: result.cached, searchId: result.searchId };
      } catch (err: any) {
        if (err.name === 'ZodError') throw err;
        return handleAiError(err, reply);
      }
    },
  });

  // GET /prospect-detection/:candidatId — Get cached prospect detection results
  fastify.get('/prospect-detection/:candidatId', {
    schema: {
      description: 'Obtenir les résultats en cache de détection de prospects IA',
      tags: ['AI'],
      params: {
        type: 'object',
        required: ['candidatId'],
        properties: { candidatId: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { candidatId } = request.params as { candidatId: string };
      const cached = await prospectDetectionService.getCachedProspects(candidatId);
      if (!cached) {
        return { data: null };
      }
      return { data: cached };
    },
  });

  // POST /prospect-detection/create-companies — Create entreprises from selected prospects
  fastify.post('/prospect-detection/create-companies', {
    schema: {
      description: 'Créer des entreprises dans l\'ATS à partir des prospects IA sélectionnés',
      tags: ['AI'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = createCompaniesSchema.parse(request.body);
      const created = await prospectDetectionService.createCompaniesFromProspects(
        input.prospects,
        request.userId,
      );
      return {
        data: created,
        count: created.length,
        newCount: created.filter((c: any) => !c.alreadyExisted).length,
      };
    },
  });

  // ─── CALL SUMMARY ROUTES ──────────────────────────────

  // POST /call-summary — Generate AI summary for a call activity
  fastify.post('/call-summary', {
    schema: {
      description: 'Générer un résumé IA pour une activité d\'appel',
      tags: ['AI'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      try {
        const input = generateCallSummarySchema.parse(request.body);
        const summary = await callSummaryService.generateCallSummary(
          input.activiteId,
          request.userId,
        );
        return { data: summary };
      } catch (err: any) {
        if (err.name === 'ZodError') throw err;
        return handleAiError(err, reply);
      }
    },
  });

  // GET /call-summary/:activiteId — Get existing summary for an activity
  fastify.get('/call-summary/:activiteId', {
    schema: {
      description: 'Obtenir le résumé IA existant pour une activité',
      tags: ['AI'],
      params: {
        type: 'object',
        required: ['activiteId'],
        properties: { activiteId: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { activiteId } = request.params as { activiteId: string };
      const summary = await callSummaryService.getCallSummary(activiteId);
      return { data: summary };
    },
  });

  // POST /call-summary/:id/accept-action — Accept an action item from a summary
  fastify.post('/call-summary/:id/accept-action', {
    schema: {
      description: 'Accepter une action suggérée par le résumé IA (crée une tâche)',
      tags: ['AI'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = acceptActionSchema.parse(request.body);
      const task = await callSummaryService.acceptActionItem(
        id,
        input.actionIndex,
        request.userId,
      );
      return { data: task };
    },
  });

  // POST /call-summary/:id/apply-updates — Apply info updates from a summary
  fastify.post('/call-summary/:id/apply-updates', {
    schema: {
      description: 'Appliquer les mises à jour suggérées par le résumé IA sur la fiche',
      tags: ['AI'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = applyUpdatesSchema.parse(request.body);
      const result = await callSummaryService.applyInfoUpdates(
        id,
        input.updateIndices,
        request.userId,
      );
      return { data: result };
    },
  });

  // ─── CALL BRIEF ROUTES ─────────────────────────────────

  // POST /call-brief — Generate or retrieve a pre-call brief
  fastify.post('/call-brief', {
    schema: {
      description: 'Générer un brief pré-appel enrichi via IA (avec recherche web)',
      tags: ['AI'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      try {
        const input = generateCallBriefSchema.parse(request.body);
        const brief = await callBriefService.generateCallBrief(
          input.entityType,
          input.entityId,
          request.userId,
          input.calendarEventId,
          input.forceRefresh ?? false,
        );
        return { data: brief };
      } catch (err: any) {
        if (err.name === 'ZodError') throw err;
        return handleAiError(err, reply);
      }
    },
  });

  // GET /call-brief/:entityType/:entityId — Get cached brief
  fastify.get('/call-brief/:entityType/:entityId', {
    schema: {
      description: 'Obtenir le brief pré-appel en cache (non expiré)',
      tags: ['AI'],
      params: {
        type: 'object',
        required: ['entityType', 'entityId'],
        properties: {
          entityType: { type: 'string', enum: ['CANDIDAT', 'CLIENT'] },
          entityId: { type: 'string', format: 'uuid' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { entityType, entityId } = request.params as { entityType: string; entityId: string };
      const brief = await callBriefService.getCachedBrief(entityType, entityId);
      if (!brief) {
        return { data: null };
      }
      return { data: brief };
    },
  });

  // ─── CV PARSING ROUTES ────────────────────────────────

  // POST /parse-cv — Parse a CV (PDF) and return structured data + pitch
  fastify.post('/parse-cv', {
    schema: {
      description: 'Parser un CV (PDF) via IA pour extraire les informations et générer un pitch',
      tags: ['AI'],
      consumes: ['multipart/form-data'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const data = await request.file();

      if (!data) {
        throw new ValidationError('Aucun fichier envoyé');
      }

      // Validate file type
      const allowedMimes = ['application/pdf'];
      if (!allowedMimes.includes(data.mimetype)) {
        throw new ValidationError('Format non supporté. Seuls les fichiers PDF sont acceptés.');
      }

      // Read the file buffer
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);

      // Validate file size (10 MB max)
      const maxSize = 10 * 1024 * 1024;
      if (fileBuffer.length > maxSize) {
        throw new ValidationError('Le fichier est trop volumineux. Taille maximale : 10 Mo.');
      }

      const result = await cvParsingService.parseCv(fileBuffer, data.filename, request.userId);
      return { data: result };
    },
  });

  // ─── AI CANDIDATE MATCHING ─────────────────────────────

  // POST /matching/:mandatId — AI candidate matching for a mandat
  fastify.post('/matching/:mandatId', {
    schema: {
      description: 'AI-powered candidate matching for a mandat',
      tags: ['AI'],
      params: { type: 'object', required: ['mandatId'], properties: { mandatId: { type: 'string' } } },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      try {
        const { mandatId } = request.params as { mandatId: string };
        const { matchCandidatesForMandat } = await import('./matching.service.js');
        return matchCandidatesForMandat(mandatId, request.userId);
      } catch (err: any) {
        if (err.message?.includes('not found')) {
          reply.status(404);
          return { error: 'NOT_FOUND', message: err.message };
        }
        return handleAiError(err, reply);
      }
    },
  });

  // POST /update-from-cv — Parse a CV and update an existing candidat with AI fields
  fastify.post('/update-from-cv', {
    schema: {
      description: 'Parser un CV et mettre à jour un candidat existant avec les données IA',
      tags: ['AI'],
      consumes: ['multipart/form-data'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const data = await request.file();

      if (!data) {
        throw new ValidationError('Aucun fichier envoyé');
      }

      // Extract candidatId from form fields
      const fields = data.fields as Record<string, any>;
      const candidatIdField = fields.candidatId;

      if (!candidatIdField?.value) {
        throw new ValidationError('Le champ candidatId est requis');
      }
      const candidatId = candidatIdField.value as string;

      // Validate file type
      const allowedMimes = ['application/pdf'];
      if (!allowedMimes.includes(data.mimetype)) {
        throw new ValidationError('Format non supporté. Seuls les fichiers PDF sont acceptés.');
      }

      // Read the file buffer
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);

      // Validate file size (10 MB max)
      const maxSize = 10 * 1024 * 1024;
      if (fileBuffer.length > maxSize) {
        throw new ValidationError('Le fichier est trop volumineux. Taille maximale : 10 Mo.');
      }

      // Store the CV file on disk and update cvUrl
      const doc = await documentService.upload('candidat', candidatId, fileBuffer, data.filename, data.mimetype);
      await prisma.candidat.update({
        where: { id: candidatId },
        data: { cvUrl: doc.url },
      });

      const result = await cvParsingService.updateCandidatFromCv(
        fileBuffer,
        data.filename,
        request.userId,
        candidatId,
      );

      return { data: { ...result, cvUrl: doc.url } };
    },
  });

  // ─── MORNING BRIEFING ──────────────────────────────────

  // GET /morning-briefing — AI-generated morning briefing
  fastify.get('/morning-briefing', {
    schema: {
      description: 'AI-generated morning briefing',
      tags: ['AI'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const userId = request.userId;

      // Gather data for briefing
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      const [overdueTasks, todayTasks, activeMandats, recentActivities] = await Promise.all([
        prisma.activite.count({
          where: { userId, isTache: true, tacheCompleted: false, tacheDueDate: { lt: startOfDay } },
        }),
        prisma.activite.findMany({
          where: { userId, isTache: true, tacheCompleted: false, tacheDueDate: { gte: startOfDay, lt: new Date(startOfDay.getTime() + 86400000) } },
          select: { titre: true, entiteType: true },
          take: 10,
        }),
        prisma.mandat.findMany({
          where: { assignedToId: userId, statut: { in: ['OUVERT', 'EN_COURS'] } },
          select: { titrePoste: true, candidatures: { select: { stage: true } } },
        }),
        prisma.activite.count({
          where: { userId, type: { in: ['EMAIL'] }, createdAt: { gte: new Date(today.getTime() - 86400000) } },
        }),
      ]);

      const mandatSummaries = activeMandats.map(m => {
        const stages = m.candidatures.reduce((acc: Record<string, number>, c) => {
          acc[c.stage] = (acc[c.stage] || 0) + 1;
          return acc;
        }, {});
        return `${m.titrePoste}: ${Object.entries(stages).map(([s, n]) => `${n} en ${s}`).join(', ') || 'aucun candidat'}`;
      });

      const systemPrompt = `Tu es un assistant de recruteur. Genere un briefing matinal concis (max 5 bullet points) en francais.
Format: JSON array de strings, chaque string = 1 priorite du jour. Ex: ["Relancer X car tache en retard", "Mandat Y a besoin de sourcing"]`;

      const userPrompt = `Donnees:
- ${overdueTasks} taches en retard
- ${todayTasks.length} taches aujourd'hui: ${todayTasks.map(t => t.titre).join(', ') || 'aucune'}
- ${activeMandats.length} mandats actifs: ${mandatSummaries.join('; ') || 'aucun'}
- ${recentActivities} activites email dans les 24h`;

      try {
        const response = await callClaude({
          feature: 'task_extraction',
          systemPrompt,
          userPrompt,
          userId,
          maxTokens: 1000,
          temperature: 0.4,
        });
        const rawText = typeof response.content === 'string'
          ? response.content
          : response.rawText;
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        const priorities = jsonMatch ? JSON.parse(jsonMatch[0]) : ['Consultez votre dashboard pour les priorites du jour'];
        return { priorities, stats: { overdueTasks, todayTasks: todayTasks.length, activeMandats: activeMandats.length, recentActivities } };
      } catch {
        return { priorities: ['Erreur lors de la generation du briefing'], stats: { overdueTasks, todayTasks: todayTasks.length, activeMandats: activeMandats.length, recentActivities } };
      }
    },
  });
}
