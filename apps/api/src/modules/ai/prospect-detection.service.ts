import prisma from '../../lib/db.js';
import { callClaudeWithWebSearch } from '../../services/claudeAI.js';
import { NotFoundError } from '../../lib/errors.js';

// ─── TYPES ───────────────────────────────────────────

export interface ProspectSearchParams {
  sectors?: string[];
  locations?: string[];
  companySize?: string;
  signalTypes?: string[];
}

export interface DetectedProspect {
  company_name: string;
  company_website: string | null;
  company_sector: string;
  company_size: string;
  company_city: string;
  company_country: string;
  signal_type: 'job_posting' | 'fundraising' | 'growth' | 'departure' | 'expansion' | 'restructuring';
  signal_detail: string;
  signal_source: string;
  signal_date: string;
  relevance_score: number;
  approach_angle: string;
  suggested_contacts: Array<{ title: string; linkedin_search_hint: string }>;
}

export interface ProspectDetectionResult {
  prospects: DetectedProspect[];
  search_summary: string;
}

export interface CreateCompanyInput {
  companyName: string;
  sector?: string;
  location?: string;
  website?: string;
}

// ─── SYSTEM PROMPT ───────────────────────────────────

const SYSTEM_PROMPT = `Tu es un expert en développement commercial pour cabinets de recrutement spécialisés commercial/sales.

Tu dois identifier des entreprises qui pourraient avoir besoin du profil candidat décrit ci-dessous.

Utilise l'outil de recherche web pour chercher des SIGNAUX FAIBLES :
1. Offres d'emploi similaires publiées (Welcome to the Jungle, LinkedIn, Indeed)
2. Levées de fonds récentes (= ils vont recruter)
3. Croissance rapide / expansion (nouveaux bureaux, nouveaux marchés)
4. Départs de commerciaux (poste à remplacer)
5. Restructurations d'équipe commerciale
6. Annonces de recrutement dans la presse ou sur LinkedIn

Pour chaque entreprise identifiée :
- Décris le signal PRÉCIS (avec source)
- Donne un score de pertinence (1-10)
- Propose un angle d'approche personnalisé
- Suggère les titres des contacts à chercher

EXCLUS les entreprises listées ci-dessous (déjà clientes).
Réponds UNIQUEMENT en JSON valide avec cette structure exacte :
{
  "prospects": [
    {
      "company_name": "string",
      "company_website": "string | null",
      "company_sector": "string",
      "company_size": "string",
      "company_city": "string",
      "company_country": "string",
      "signal_type": "job_posting | fundraising | growth | departure | expansion | restructuring",
      "signal_detail": "string - max 30 mots",
      "signal_source": "string - URL ou source",
      "signal_date": "string - date approximative",
      "relevance_score": "number 1-10",
      "approach_angle": "string - max 40 mots",
      "suggested_contacts": [{ "title": "string", "linkedin_search_hint": "string" }]
    }
  ],
  "search_summary": "string - 2-3 phrases résumant le marché"
}`;

// ─── CACHE CHECK ─────────────────────────────────────

function areParamsSimilar(cached: any, incoming: ProspectSearchParams): boolean {
  const cachedSectors = (cached.sectors || []).sort().join(',');
  const incomingSectors = (incoming.sectors || []).sort().join(',');
  const cachedLocations = (cached.locations || []).sort().join(',');
  const incomingLocations = (incoming.locations || []).sort().join(',');
  const cachedSize = cached.companySize || '';
  const incomingSize = incoming.companySize || '';
  const cachedSignals = (cached.signalTypes || []).sort().join(',');
  const incomingSignals = (incoming.signalTypes || []).sort().join(',');

  return (
    cachedSectors === incomingSectors &&
    cachedLocations === incomingLocations &&
    cachedSize === incomingSize &&
    cachedSignals === incomingSignals
  );
}

// ─── DETECT PROSPECTS ────────────────────────────────

export async function detectProspects(
  candidatId: string,
  userId: string,
  searchParams: ProspectSearchParams,
): Promise<{ cached: boolean; data: ProspectDetectionResult; searchId: string }> {
  // 1. Check cache: existing AiProspectSearch where expiresAt > now() with same candidatId + similar params
  const existingSearch = await prisma.aiProspectSearch.findFirst({
    where: {
      candidatId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existingSearch && areParamsSimilar(existingSearch.searchParams as any, searchParams)) {
    return {
      cached: true,
      data: existingSearch.resultsJson as unknown as ProspectDetectionResult,
      searchId: existingSearch.id,
    };
  }

  // 2. Load candidat profile
  const candidat = await prisma.candidat.findUnique({
    where: { id: candidatId },
    select: {
      id: true,
      nom: true,
      prenom: true,
      posteActuel: true,
      localisation: true,
      tags: true,
      aiAnonymizedProfile: true,
      aiIdealFor: true,
      aiPitchShort: true,
      aiSellingPoints: true,
    },
  });

  if (!candidat) {
    throw new NotFoundError('Candidat non trouvé');
  }

  // 3. Load all existing entreprises (to exclude from results)
  const existingEntreprises = await prisma.entreprise.findMany({
    select: { nom: true },
  });
  const excludedNames = existingEntreprises.map((e) => e.nom);

  // 4. Build user prompt
  const profileDescription = buildProfileDescription(candidat);
  const userPrompt = buildUserPrompt(profileDescription, searchParams, excludedNames);

  // 5. Call callClaudeWithWebSearch
  const response = await callClaudeWithWebSearch({
    feature: 'prospect_detection',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxTokens: 6000,
    temperature: 0.2,
    userId,
  });

  // 6. Parse results
  let results: ProspectDetectionResult;

  if (typeof response.content === 'object' && response.content !== null && 'prospects' in response.content) {
    results = response.content as ProspectDetectionResult;
  } else {
    // Fallback: try to parse from rawText
    try {
      const parsed = JSON.parse(
        response.rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim(),
      );
      results = parsed as ProspectDetectionResult;
    } catch {
      results = {
        prospects: [],
        search_summary: 'Impossible de parser les résultats IA. Veuillez réessayer.',
      };
    }
  }

  // Ensure prospects is an array
  if (!Array.isArray(results.prospects)) {
    results.prospects = [];
  }

  // 7. Store in AiProspectSearch with expiresAt = now + 48h
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  const savedSearch = await prisma.aiProspectSearch.create({
    data: {
      candidatId,
      userId,
      searchParams: searchParams as any,
      resultsJson: results as any,
      prospectsSelected: [],
      resultCount: results.prospects.length,
      expiresAt,
    },
  });

  return {
    cached: false,
    data: results,
    searchId: savedSearch.id,
  };
}

// ─── GET CACHED PROSPECTS ────────────────────────────

export async function getCachedProspects(candidatId: string) {
  const search = await prisma.aiProspectSearch.findFirst({
    where: {
      candidatId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!search) {
    return null;
  }

  return {
    searchId: search.id,
    data: search.resultsJson as unknown as ProspectDetectionResult,
    searchParams: search.searchParams,
    resultCount: search.resultCount,
    createdAt: search.createdAt,
    expiresAt: search.expiresAt,
  };
}

// ─── CREATE COMPANIES FROM PROSPECTS ─────────────────

export async function createCompaniesFromProspects(
  prospects: CreateCompanyInput[],
  userId: string,
) {
  const created = [];

  for (const p of prospects) {
    // Check if company already exists (case-insensitive)
    const existing = await prisma.entreprise.findFirst({
      where: {
        nom: {
          equals: p.companyName,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      created.push({ ...existing, alreadyExisted: true });
      continue;
    }

    const entreprise = await prisma.entreprise.create({
      data: {
        nom: p.companyName,
        secteur: p.sector ?? null,
        localisation: p.location ?? null,
        siteWeb: p.website ?? null,
        notes: 'Source: Détection IA de prospects (signaux faibles)',
        createdById: userId,
      },
    });

    created.push({ ...entreprise, alreadyExisted: false });
  }

  return created;
}

// ─── HELPERS ─────────────────────────────────────────

function buildProfileDescription(candidat: {
  nom: string;
  prenom: string | null;
  posteActuel: string | null;
  localisation: string | null;
  tags: string[];
  aiAnonymizedProfile: any;
  aiIdealFor: string | null;
  aiPitchShort: string | null;
  aiSellingPoints: any;
}): string {
  const lines: string[] = [];

  if (candidat.posteActuel) {
    lines.push(`Poste actuel : ${candidat.posteActuel}`);
  }
  if (candidat.localisation) {
    lines.push(`Localisation : ${candidat.localisation}`);
  }
  if (candidat.tags && candidat.tags.length > 0) {
    lines.push(`Compétences/Tags : ${candidat.tags.join(', ')}`);
  }
  if (candidat.aiPitchShort) {
    lines.push(`Pitch : ${candidat.aiPitchShort}`);
  }
  if (candidat.aiIdealFor) {
    lines.push(`Idéal pour : ${candidat.aiIdealFor}`);
  }
  if (candidat.aiSellingPoints && Array.isArray(candidat.aiSellingPoints)) {
    lines.push(`Points forts : ${(candidat.aiSellingPoints as string[]).join(', ')}`);
  }
  if (candidat.aiAnonymizedProfile && typeof candidat.aiAnonymizedProfile === 'object') {
    const anon = candidat.aiAnonymizedProfile as Record<string, any>;
    if (anon.titre) lines.push(`Profil anonymisé : ${anon.titre}`);
    if (anon.summary) lines.push(`Résumé : ${anon.summary}`);
    if (anon.bulletPoints && Array.isArray(anon.bulletPoints)) {
      lines.push(`Points clés : ${anon.bulletPoints.join(' | ')}`);
    }
  }

  return lines.join('\n');
}

function buildUserPrompt(
  profileDescription: string,
  searchParams: ProspectSearchParams,
  excludedNames: string[],
): string {
  const parts: string[] = [];

  parts.push('=== PROFIL CANDIDAT ===');
  parts.push(profileDescription);
  parts.push('');

  parts.push('=== PARAMETRES DE RECHERCHE ===');
  if (searchParams.sectors && searchParams.sectors.length > 0) {
    parts.push(`Secteurs ciblés : ${searchParams.sectors.join(', ')}`);
  }
  if (searchParams.locations && searchParams.locations.length > 0) {
    parts.push(`Géographie : ${searchParams.locations.join(', ')}`);
  }
  if (searchParams.companySize) {
    parts.push(`Taille d'entreprise : ${searchParams.companySize}`);
  }
  if (searchParams.signalTypes && searchParams.signalTypes.length > 0) {
    parts.push(`Types de signaux à privilégier : ${searchParams.signalTypes.join(', ')}`);
  }
  parts.push('');

  if (excludedNames.length > 0) {
    parts.push('=== ENTREPRISES A EXCLURE (déjà clientes) ===');
    parts.push(excludedNames.join(', '));
    parts.push('');
  }

  parts.push('Recherche et identifie 10-15 entreprises correspondant à ces critères avec des signaux faibles récents.');
  parts.push('Réponds UNIQUEMENT en JSON valide.');

  return parts.join('\n');
}
