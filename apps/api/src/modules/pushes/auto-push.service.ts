/**
 * Auto-Push Service — "Full Auto" push flow
 *
 * Given a candidate, this service:
 * 1. Profiles the candidate (sector, target role, geo)
 * 2. Searches internal cold/lead clients matching the profile
 * 3. If not enough → detects prospects via AI web search
 * 4. Enriches contacts via FullEnrich (email)
 * 5. Generates personalized messages per prospect
 * 6. Returns a proposal for the recruiter to validate
 * 7. On validation → multi-push with auto sequence trigger
 */

import prisma from '../../lib/db.js';
import { callClaudeWithWebSearch, isAiConfigured } from '../../services/claudeAI.js';
import { enrichContact } from '../integrations/fullenrich.service.js';
import { detectProspects } from '../ai/prospect-detection.service.js';
import { createPush } from './push.service.js';

// ─── TYPES ──────────────────────────────────────────

export interface AutoPushCandidate {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  skills: string[];
  city: string | null;
  experience_years: number | null;
}

export interface CandidateProfile {
  sectors: string[];
  target_roles: string[];
  geo: string[];
  company_size: string[];
  key_skills: string[];
  seniority: string;
  pitch_summary: string;
}

export interface ProspectProposal {
  source: 'internal' | 'web_detection' | 'external_search';
  company_name: string;
  company_sector?: string;
  company_city?: string;
  contact_name?: string;
  contact_email?: string;
  contact_title?: string;
  linkedin_url?: string;
  signal?: string;
  approach_angle?: string;
  relevance_score?: number;
  suggested_message?: string;
  // Internal prospect fields
  client_id?: string;
  company_id?: string;
}

export interface AutoPushProposal {
  candidate: AutoPushCandidate;
  profile: CandidateProfile;
  prospects: ProspectProposal[];
  credits_needed: number;
  credits_available: number;
}

export interface AutoPushExecuteResult {
  pushes_created: number;
  sequences_started: number;
  prospects_created: number;
  details: Array<{
    company: string;
    contact: string;
    push_id: string;
    sequence_run_id?: string;
  }>;
}

// ─── 1. GET CANDIDATE DATA ─────────────────────────

async function getCandidateData(candidateId: string): Promise<AutoPushCandidate | null> {
  const c = await prisma.candidat.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      nom: true,
      prenom: true,
      posteActuel: true,
      entrepriseActuelle: true,
      tags: true,
      localisation: true,
      anneesExperience: true,
    },
  });
  if (!c) return null;
  return {
    id: c.id,
    name: `${c.prenom || ''} ${c.nom}`.trim(),
    title: c.posteActuel,
    company: c.entrepriseActuelle,
    skills: c.tags,
    city: c.localisation,
    experience_years: c.anneesExperience,
  };
}

// ─── 2. PROFILE CANDIDATE VIA AI ───────────────────

async function profileCandidate(candidate: AutoPushCandidate): Promise<CandidateProfile> {
  if (!isAiConfigured()) {
    return defaultProfile(candidate);
  }

  try {
    const result = await callClaudeWithWebSearch({
      feature: 'auto_push_profiling',
      userId: 'system',
      systemPrompt: `Tu es un expert en recrutement. Analyse le profil candidat et determine quels types d'entreprises pourraient avoir besoin de ce profil.

Reponds UNIQUEMENT en JSON valide :
{
  "sectors": ["SaaS", "Fintech", ...],
  "target_roles": ["Head of Sales", "VP Sales", ...],
  "geo": ["Paris", "Lyon", ...],
  "company_size": ["STARTUP", "PME", "ETI", "GRAND_GROUPE"],
  "key_skills": ["vente complexe", "management", ...],
  "seniority": "senior|mid|junior|executive",
  "pitch_summary": "Resume en 2 phrases de pourquoi ce candidat est top"
}`,
      userPrompt: `Profil candidat :
- Nom : ${candidate.name}
- Poste actuel : ${candidate.title || 'Non renseigne'}
- Entreprise : ${candidate.company || 'Non renseignee'}
- Competences/tags : ${candidate.skills.join(', ') || 'Aucun'}
- Ville : ${candidate.city || 'Non renseignee'}
- Experience : ${candidate.experience_years ? candidate.experience_years + ' ans' : 'Non renseignee'}

Analyse ce profil et determine les secteurs, roles cibles, et taille d'entreprises ideales.`,
      maxTokens: 1000,
    });

    const jsonMatch = result.rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as CandidateProfile;
    }
  } catch (error) {
    console.error('[AutoPush] Profiling error:', error);
  }

  return defaultProfile(candidate);
}

function defaultProfile(candidate: AutoPushCandidate): CandidateProfile {
  return {
    sectors: [],
    target_roles: candidate.title ? [candidate.title] : [],
    geo: candidate.city ? [candidate.city] : ['Paris'],
    company_size: ['STARTUP', 'PME', 'ETI'],
    key_skills: candidate.skills.slice(0, 5),
    seniority: 'senior',
    pitch_summary: `${candidate.name}, ${candidate.title || 'profil qualifie'} avec experience en ${candidate.skills.slice(0, 3).join(', ') || 'competences variees'}.`,
  };
}

// ─── 3. SEARCH INTERNAL COLD CLIENTS ───────────────

async function searchInternalProspects(
  profile: CandidateProfile,
  limit: number = 10,
): Promise<ProspectProposal[]> {
  // Search clients with status LEAD or INACTIF, matching sector/tags
  const where: any = {
    statutClient: { in: ['LEAD', 'INACTIF', 'PREMIER_CONTACT'] },
  };

  // Build OR conditions for matching
  const orConditions: any[] = [];

  if (profile.sectors.length > 0) {
    for (const sector of profile.sectors) {
      orConditions.push({
        entreprise: {
          OR: [
            { secteur: { contains: sector, mode: 'insensitive' } },
            { nom: { contains: sector, mode: 'insensitive' } },
          ],
        },
      });
    }
  }

  if (profile.key_skills.length > 0) {
    for (const skill of profile.key_skills.slice(0, 3)) {
      orConditions.push({
        OR: [
          { notes: { contains: skill, mode: 'insensitive' } },
          { entreprise: { secteur: { contains: skill, mode: 'insensitive' } } },
        ],
      });
    }
  }

  if (orConditions.length > 0) {
    where.OR = orConditions;
  }

  const clients = await prisma.client.findMany({
    where,
    include: {
      entreprise: {
        select: { id: true, nom: true, secteur: true, localisation: true, taille: true },
      },
    },
    take: limit,
    orderBy: { updatedAt: 'desc' },
  });

  return clients.map(c => ({
    source: 'internal' as const,
    company_name: c.entreprise?.nom || 'Inconnu',
    company_sector: c.entreprise?.secteur || undefined,
    company_city: c.entreprise?.localisation || undefined,
    contact_name: `${c.prenom || ''} ${c.nom}`.trim(),
    contact_email: c.email || undefined,
    contact_title: c.poste || undefined,
    client_id: c.id,
    company_id: c.entreprise?.id || undefined,
    relevance_score: 7,
    signal: `Client ${c.statutClient} dans la base`,
  }));
}

// ─── 4. DETECT PROSPECTS VIA AI WEB SEARCH ─────────

async function detectWebProspects(
  candidateId: string,
  userId: string,
  profile: CandidateProfile,
  limit: number = 5,
): Promise<ProspectProposal[]> {
  try {
    const result = await detectProspects(candidateId, userId, {
      sectors: profile.sectors,
      locations: profile.geo,
      companySize: profile.company_size.length > 0 ? profile.company_size[0] : undefined,
      signalTypes: ['job_posting', 'growth', 'fundraising'],
    });

    return result.data.prospects.slice(0, limit).map(p => ({
      source: 'web_detection' as const,
      company_name: p.company_name,
      company_sector: p.company_sector,
      company_city: p.company_city,
      signal: `${p.signal_type}: ${p.signal_detail}`,
      approach_angle: p.approach_angle,
      relevance_score: p.relevance_score,
      contact_name: p.suggested_contacts?.[0]?.title || undefined,
      linkedin_url: undefined,
    }));
  } catch (error) {
    console.error('[AutoPush] Web prospect detection error:', error);
    return [];
  }
}

// ─── 5. ENRICH CONTACTS ────────────────────────────

async function enrichProspects(
  prospects: ProspectProposal[],
): Promise<ProspectProposal[]> {
  const enriched: ProspectProposal[] = [];

  for (const prospect of prospects) {
    // Skip if already has email
    if (prospect.contact_email) {
      enriched.push(prospect);
      continue;
    }

    // Try to enrich if we have name + company
    if (prospect.contact_name && prospect.company_name) {
      try {
        const nameParts = prospect.contact_name.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        if (firstName && lastName) {
          const result = await enrichContact({
            first_name: firstName,
            last_name: lastName,
            company_name: prospect.company_name,
            linkedin_url: prospect.linkedin_url || undefined,
          }, ['email']);

          if (result?.contact_info?.most_probable_work_email?.email) {
            prospect.contact_email = result.contact_info.most_probable_work_email.email;
          } else if (result?.contact_info?.most_probable_personal_email?.email) {
            prospect.contact_email = result.contact_info.most_probable_personal_email.email;
          }

          if (result?.profile?.employment?.current?.title) {
            prospect.contact_title = result.profile.employment.current.title;
          }
        }
      } catch (error) {
        console.error(`[AutoPush] Enrich failed for ${prospect.contact_name}:`, error);
      }
    }

    enriched.push(prospect);
  }

  return enriched;
}

// ─── 6. GENERATE PERSONALIZED MESSAGES ─────────────

async function generateMessages(
  candidate: AutoPushCandidate,
  profile: CandidateProfile,
  prospects: ProspectProposal[],
): Promise<ProspectProposal[]> {
  if (!isAiConfigured()) return prospects;

  try {
    const prospectList = prospects.map((p, i) =>
      `${i + 1}. ${p.contact_name || 'DRH'} chez ${p.company_name} (${p.company_sector || 'secteur inconnu'}) — Signal: ${p.signal || 'aucun'}`
    ).join('\n');

    const result = await callClaudeWithWebSearch({
      feature: 'auto_push_messages',
      userId: 'system',
      systemPrompt: `Tu es un expert en approche commerciale pour le recrutement. Genere des messages de push CV courts et personnalises.

REGLES :
- Max 4 phrases par message
- Mentionne le signal/contexte specifique du prospect
- Ne mentionne PAS le salaire du candidat
- Inclure un CTA (booking link sera ajoute automatiquement)
- Ton professionnel mais direct
- Personalise chaque message differemment

Reponds en JSON : { "messages": ["message1", "message2", ...] }`,
      userPrompt: `Candidat : ${candidate.name}
Profil : ${profile.pitch_summary}
Poste : ${candidate.title || 'Non precise'}
Competences cles : ${profile.key_skills.join(', ')}

Prospects a contacter :
${prospectList}

Genere un message de push CV personnalise pour CHAQUE prospect.`,
      maxTokens: 2000,
    });

    const jsonMatch = result.rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const messages: string[] = parsed.messages || [];
      prospects.forEach((p, i) => {
        if (messages[i]) {
          p.suggested_message = messages[i];
        }
      });
    }
  } catch (error) {
    console.error('[AutoPush] Message generation error:', error);
  }

  // Fallback messages for prospects without one
  for (const p of prospects) {
    if (!p.suggested_message) {
      p.suggested_message = `Bonjour${p.contact_name ? ' ' + p.contact_name.split(' ')[0] : ''},\n\nJe me permets de vous contacter car je pense avoir un profil qui pourrait vous interesser : ${candidate.name}, ${candidate.title || 'profil qualifie'}.\n\n${profile.pitch_summary}\n\nSeriez-vous disponible pour un echange rapide ?`;
    }
  }

  return prospects;
}

// ─── MAIN: PREPARE PROPOSAL ────────────────────────

export async function prepareAutoPush(
  candidateId: string,
  userId: string,
  options: {
    max_prospects?: number;
    include_internal?: boolean;
    include_web?: boolean;
    enrich_contacts?: boolean;
    sectors?: string[];
    locations?: string[];
  } = {},
): Promise<AutoPushProposal> {
  const maxProspects = options.max_prospects || 8;
  const includeInternal = options.include_internal !== false;
  const includeWeb = options.include_web !== false;
  const enrichContacts = options.enrich_contacts !== false;

  // 1. Get candidate
  const candidate = await getCandidateData(candidateId);
  if (!candidate) throw new Error('Candidat non trouve');

  // 2. Profile candidate
  const profile = await profileCandidate(candidate);

  // Override with user-specified sectors/locations
  if (options.sectors?.length) profile.sectors = options.sectors;
  if (options.locations?.length) profile.geo = options.locations;

  // 3. Search internal cold clients
  let allProspects: ProspectProposal[] = [];

  if (includeInternal) {
    const internal = await searchInternalProspects(profile, Math.ceil(maxProspects / 2));
    allProspects.push(...internal);
    console.log(`[AutoPush] ${internal.length} internal prospects found`);
  }

  // 4. If not enough, detect via web
  if (includeWeb && allProspects.length < maxProspects) {
    const needed = maxProspects - allProspects.length;
    const webProspects = await detectWebProspects(candidateId, userId, profile, needed);
    allProspects.push(...webProspects);
    console.log(`[AutoPush] ${webProspects.length} web prospects found`);
  }

  // Cap at max
  allProspects = allProspects.slice(0, maxProspects);

  // 5. Enrich contacts (find emails)
  let creditsNeeded = 0;
  if (enrichContacts) {
    const needsEnrich = allProspects.filter(p => !p.contact_email && p.contact_name).length;
    creditsNeeded = needsEnrich; // 1 credit per email enrichment
    allProspects = await enrichProspects(allProspects);
  }

  // 6. Generate personalized messages
  allProspects = await generateMessages(candidate, profile, allProspects);

  // Get credits
  let creditsAvailable = 0;
  try {
    const { getCredits } = await import('../integrations/fullenrich.service.js');
    creditsAvailable = await getCredits();
  } catch {
    creditsAvailable = -1; // Unknown
  }

  return {
    candidate,
    profile,
    prospects: allProspects,
    credits_needed: creditsNeeded,
    credits_available: creditsAvailable,
  };
}

// ─── MAIN: EXECUTE PUSHES ──────────────────────────

export async function executeAutoPush(
  candidateId: string,
  userId: string,
  selectedProspects: Array<{
    company_name: string;
    contact_name?: string;
    contact_email?: string;
    message: string;
    client_id?: string;
    canal?: 'EMAIL' | 'LINKEDIN';
  }>,
): Promise<AutoPushExecuteResult> {
  const results: AutoPushExecuteResult = {
    pushes_created: 0,
    sequences_started: 0,
    prospects_created: 0,
    details: [],
  };

  for (const prospect of selectedProspects) {
    try {
      const pushResult = await createPush({
        candidatId: candidateId,
        prospect: {
          id: prospect.client_id,
          companyName: prospect.company_name,
          contactName: prospect.contact_name,
          contactEmail: prospect.contact_email,
        },
        canal: prospect.canal || 'EMAIL',
        message: prospect.message,
        recruiterId: userId,
      });

      results.pushes_created++;
      if (pushResult.sequence_started) results.sequences_started++;
      if (!prospect.client_id) results.prospects_created++;

      results.details.push({
        company: prospect.company_name,
        contact: prospect.contact_name || 'N/A',
        push_id: pushResult.push_id,
        sequence_run_id: pushResult.sequence_run_id || undefined,
      });
    } catch (error: any) {
      console.error(`[AutoPush] Push failed for ${prospect.company_name}:`, error.message);
    }
  }

  return results;
}
