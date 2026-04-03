/**
 * Sequence AI Research — On-demand research before step execution
 *
 * Instead of a daily 6am cron, research is triggered just before
 * a step that needs AI-generated content is executed.
 * Results are cached in sequence_daily_research for the day.
 */

import prisma from '../../lib/db.js';
import { callClaudeWithWebSearch } from '../../services/claudeAI.js';
import { isAiConfigured } from '../../services/claudeAI.js';

// ─── TYPES ──────────────────────────────────────────

interface ResearchResult {
  job_postings: string[];
  company_news: string[];
  linkedin_posts: string[];
  sector_insight: string | null;
  best_signal: string | null;
  suggested_angle: string | null;
  case_study: string | null;
  market_insight: string | null;
}

interface GeneratedContent {
  email_subject?: string;
  email_body?: string;
  linkedin_message?: string;
  sms_message?: string;
  call_brief?: string;
  insight_subject?: string;
  insight_content?: string;
  case_study_role?: string;
  case_study_duration?: string;
  case_study_content?: string;
}

// ─── RESEARCH PROMPT ────────────────────────────────

const RESEARCH_SYSTEM_PROMPT = `Tu es un assistant IA pour recruteurs en cabinet. Tu fais une recherche web fraiche sur un prospect pour preparer une relance commerciale.

Tu as acces a l'outil de recherche web. Effectue les recherches suivantes :
1. "{{company}} recrutement" ou "{{company}} hiring" — offres d'emploi actives
2. "{{company}} actualites" — news recentes (levees de fonds, croissance, restructuration)
3. "{{contact}} {{company}} LinkedIn" — activite recente du contact
4. "{{company}} {{sector}}" — tendances sectorielles

Reponds UNIQUEMENT en JSON valide avec cette structure :
{
  "job_postings": ["description courte de chaque offre trouvee"],
  "company_news": ["chaque news pertinente en 1 phrase"],
  "linkedin_posts": ["resume de chaque post/activite du contact"],
  "sector_insight": "tendance sectorielle pertinente ou null",
  "best_signal": "le signal le plus fort pour justifier une relance, ou null",
  "suggested_angle": "l'angle de relance recommande base sur les signaux, ou null",
  "case_study": null,
  "market_insight": null
}`;

const CONTENT_SYSTEM_PROMPT = `Tu es un assistant IA pour recruteurs en cabinet. Tu generes du contenu personnalise pour des relances commerciales.

Base-toi sur les recherches du jour et le contexte fourni. Le ton doit etre professionnel, direct, et personnalise.

REGLES :
- Emails : courts (max 5 phrases), personnalises avec des FAITS REELS trouves dans la recherche
- LinkedIn : messages courts (max 3 phrases), reagir a un VRAI signal
- SMS : ultra-courts (max 2 phrases), avec booking link
- Call brief : bullet points pour le recruteur, pas un script

Reponds UNIQUEMENT en JSON valide avec la structure demandee.`;

// ─── GET OR RUN RESEARCH ────────────────────────────

export async function getOrRunResearch(
  sequenceRunId: string,
  contactName: string,
  companyName: string,
): Promise<ResearchResult | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Check cache first
  const cached = await prisma.sequenceDailyResearch.findUnique({
    where: {
      sequenceRunId_researchDate: {
        sequenceRunId,
        researchDate: today,
      },
    },
  });

  if (cached) {
    return cached.researchData as unknown as ResearchResult;
  }

  // Run fresh research
  if (!isAiConfigured()) {
    console.log('[SequenceResearch] AI not configured, skipping research');
    return null;
  }

  try {
    const prompt = `Fais une recherche web fraiche sur ce prospect :
- Contact : ${contactName}
- Entreprise : ${companyName}

Trouve les offres d'emploi, actualites, posts LinkedIn et signaux de relance.`;

    const systemPrompt = RESEARCH_SYSTEM_PROMPT
      .replace(/\{\{company\}\}/g, companyName)
      .replace(/\{\{contact\}\}/g, contactName)
      .replace(/\{\{sector\}\}/g, '');

    const result = await callClaudeWithWebSearch({
      feature: 'sequence_research',
      userId: 'system',
      systemPrompt,
      userPrompt: prompt,
      maxTokens: 2000,
    });

    let researchData: ResearchResult;
    try {
      // Extract JSON from response
      const jsonMatch = result.rawText.match(/\{[\s\S]*\}/);
      researchData = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        job_postings: [],
        company_news: [],
        linkedin_posts: [],
        sector_insight: null,
        best_signal: null,
        suggested_angle: null,
        case_study: null,
        market_insight: null,
      };
    } catch {
      console.error('[SequenceResearch] Failed to parse AI research response');
      researchData = {
        job_postings: [],
        company_news: [],
        linkedin_posts: [],
        sector_insight: null,
        best_signal: result.rawText.slice(0, 500),
        suggested_angle: null,
        case_study: null,
        market_insight: null,
      };
    }

    // Cache result
    await prisma.sequenceDailyResearch.create({
      data: {
        sequenceRunId,
        researchDate: today,
        researchData: researchData as any,
      },
    });

    console.log(`[SequenceResearch] Research completed for ${contactName} (${companyName})`);
    return researchData;
  } catch (error) {
    console.error('[SequenceResearch] Error running research:', error);
    return null;
  }
}

// ─── GENERATE STEP CONTENT ──────────────────────────

export async function generateStepContent(
  sequenceRunId: string,
  stepChannel: string,
  stepTitle: string,
  contactName: string,
  companyName: string,
  candidatName: string,
  userName: string,
  bookingLink: string,
  research: ResearchResult | null,
): Promise<GeneratedContent | null> {
  if (!isAiConfigured() || !research) return null;

  try {
    const researchContext = `
RECHERCHE DU JOUR :
- Offres d'emploi : ${research.job_postings.length > 0 ? research.job_postings.join('; ') : 'Aucune trouvee'}
- Actualites : ${research.company_news.length > 0 ? research.company_news.join('; ') : 'Aucune'}
- Posts LinkedIn : ${research.linkedin_posts.length > 0 ? research.linkedin_posts.join('; ') : 'Aucun'}
- Meilleur signal : ${research.best_signal || 'Aucun signal fort'}
- Angle suggere : ${research.suggested_angle || 'Approche standard'}
`;

    let contentRequest = '';
    let expectedFormat = '';

    if (stepChannel === 'email') {
      contentRequest = `Genere un email de relance pour ${contactName} (${companyName}).
Le recruteur ${userName} a pousse le CV de ${candidatName}.
Booking link : ${bookingLink}
Etape : ${stepTitle}`;
      expectedFormat = `{ "email_subject": "...", "email_body": "..." }`;
    } else if (stepChannel === 'call') {
      contentRequest = `Genere un brief pre-appel pour ${contactName} (${companyName}).
Le recruteur ${userName} a pousse le CV de ${candidatName}.
Etape : ${stepTitle}`;
      expectedFormat = `{ "call_brief": "..." }`;
    } else if (stepChannel === 'whatsapp') {
      contentRequest = `Genere un message LinkedIn/WhatsApp pour ${contactName} (${companyName}).
Le recruteur ${userName} a pousse le CV de ${candidatName}.
Booking link : ${bookingLink}
Etape : ${stepTitle}`;
      expectedFormat = `{ "linkedin_message": "..." }`;
    }

    const prompt = `${researchContext}

${contentRequest}

Reponds en JSON avec ce format : ${expectedFormat}`;

    const result = await callClaudeWithWebSearch({
      feature: 'sequence_content_gen',
      userId: 'system',
      systemPrompt: CONTENT_SYSTEM_PROMPT,
      userPrompt: prompt,
      maxTokens: 1500,
    });

    let content: GeneratedContent;
    try {
      const jsonMatch = result.rawText.match(/\{[\s\S]*\}/);
      content = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      content = {};
    }

    // Update daily research with generated content
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.sequenceDailyResearch.updateMany({
      where: {
        sequenceRunId,
        researchDate: today,
      },
      data: {
        generatedContent: content as any,
      },
    });

    return content;
  } catch (error) {
    console.error('[SequenceResearch] Error generating content:', error);
    return null;
  }
}
