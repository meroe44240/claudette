/**
 * Auto-Push Service — "Full Auto" push flow (3-step)
 *
 * STEP 1: SCAN (0 credits)
 *   - Profile candidate via AI (or use recruiter-provided criteria)
 *   - Search internal cold/lead clients matching
 *   - Detect web prospects via AI search
 *   → Returns prospect list for recruiter to pick from
 *
 * STEP 2: ENRICH (X credits — recruiter approves)
 *   - Enrich ONLY selected prospects via FullEnrich
 *   - Generate personalized messages
 *   → Returns enriched prospects with messages for final validation
 *
 * STEP 3: EXECUTE (0 credits)
 *   - Multi-push to validated prospects
 *   - Auto-trigger Persistance Client sequence per push
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
  index: number;
  source: 'internal' | 'web_detection';
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
  needs_enrich: boolean;
  enrich_cost: number; // 0 if already has email, 1 otherwise
  client_id?: string;
  company_id?: string;
}

export interface ScanResult {
  candidate: AutoPushCandidate;
  profile: CandidateProfile;
  prospects: ProspectProposal[];
  summary: {
    total_found: number;
    internal_count: number;
    web_count: number;
    already_have_email: number;
    need_enrich: number;
    enrich_cost_total: number;
  };
  credits_available: number;
}

export interface EnrichResult {
  prospects: ProspectProposal[];
  credits_used: number;
  credits_remaining: number;
  enriched_count: number;
  email_found_count: number;
}

export interface ExecuteResult {
  pushes_created: number;
  sequences_started: number;
  prospects_created: number;
  details: Array<{
    company: string;
    contact: string;
    email: string | null;
    push_id: string;
    sequence_run_id?: string;
  }>;
}

// ─── HELPERS ────────────────────────────────────────

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

async function profileCandidate(
  candidate: AutoPushCandidate,
  overrides: { sectors?: string[]; locations?: string[]; company_sizes?: string[]; target_roles?: string[] },
): Promise<CandidateProfile> {
  let profile: CandidateProfile;

  if (isAiConfigured()) {
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
        profile = JSON.parse(jsonMatch[0]) as CandidateProfile;
      } else {
        profile = defaultProfile(candidate);
      }
    } catch {
      profile = defaultProfile(candidate);
    }
  } else {
    profile = defaultProfile(candidate);
  }

  // Apply recruiter overrides
  if (overrides.sectors?.length) profile.sectors = overrides.sectors;
  if (overrides.locations?.length) profile.geo = overrides.locations;
  if (overrides.company_sizes?.length) profile.company_size = overrides.company_sizes;
  if (overrides.target_roles?.length) profile.target_roles = overrides.target_roles;

  return profile;
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

async function searchInternalProspects(
  profile: CandidateProfile,
  limit: number,
): Promise<Omit<ProspectProposal, 'index'>[]> {
  const where: any = {
    statutClient: { in: ['LEAD', 'INACTIF', 'PREMIER_CONTACT'] },
  };

  const orConditions: any[] = [];

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

  for (const skill of profile.key_skills.slice(0, 3)) {
    orConditions.push({
      OR: [
        { notes: { contains: skill, mode: 'insensitive' } },
        { entreprise: { secteur: { contains: skill, mode: 'insensitive' } } },
      ],
    });
  }

  // Also search by target roles in notes
  for (const role of profile.target_roles.slice(0, 2)) {
    orConditions.push({
      notes: { contains: role, mode: 'insensitive' },
    });
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

  return clients.map(c => {
    const hasEmail = !!c.email;
    return {
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
      needs_enrich: !hasEmail,
      enrich_cost: hasEmail ? 0 : 1,
    };
  });
}

async function detectWebProspects(
  candidateId: string,
  userId: string,
  profile: CandidateProfile,
  limit: number,
): Promise<Omit<ProspectProposal, 'index'>[]> {
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
      needs_enrich: true,
      enrich_cost: 1,
    }));
  } catch (error) {
    console.error('[AutoPush] Web prospect detection error:', error);
    return [];
  }
}

// ═══════════════════════════════════════════════════
// STEP 1: SCAN — Find prospects (0 credits)
// ═══════════════════════════════════════════════════

export async function scanProspects(
  candidateId: string,
  userId: string,
  options: {
    max_prospects?: number;
    include_internal?: boolean;
    include_web?: boolean;
    // Recruiter-provided search criteria (override AI)
    sectors?: string[];
    locations?: string[];
    company_sizes?: string[];
    target_roles?: string[];
  } = {},
): Promise<ScanResult> {
  const maxProspects = options.max_prospects || 10;
  const includeInternal = options.include_internal !== false;
  const includeWeb = options.include_web !== false;

  // 1. Get candidate
  const candidate = await getCandidateData(candidateId);
  if (!candidate) throw new Error('Candidat non trouve');

  // 2. Profile candidate (AI + recruiter overrides)
  const profile = await profileCandidate(candidate, {
    sectors: options.sectors,
    locations: options.locations,
    company_sizes: options.company_sizes,
    target_roles: options.target_roles,
  });

  // 3. Search internal cold clients
  let allProspects: Omit<ProspectProposal, 'index'>[] = [];
  let internalCount = 0;
  let webCount = 0;

  if (includeInternal) {
    const internal = await searchInternalProspects(profile, Math.ceil(maxProspects * 0.6));
    allProspects.push(...internal);
    internalCount = internal.length;
    console.log(`[AutoPush] ${internal.length} internal prospects found`);
  }

  // 4. If not enough, detect via web
  if (includeWeb && allProspects.length < maxProspects) {
    const needed = maxProspects - allProspects.length;
    const webProspects = await detectWebProspects(candidateId, userId, profile, needed);
    allProspects.push(...webProspects);
    webCount = webProspects.length;
    console.log(`[AutoPush] ${webProspects.length} web prospects found`);
  }

  // Cap & index
  const indexed: ProspectProposal[] = allProspects
    .slice(0, maxProspects)
    .map((p, i) => ({ ...p, index: i + 1 }));

  // Compute summary
  const alreadyHaveEmail = indexed.filter(p => !p.needs_enrich).length;
  const needEnrich = indexed.filter(p => p.needs_enrich).length;

  // Get credits balance
  let creditsAvailable = 0;
  try {
    const { getCredits } = await import('../integrations/fullenrich.service.js');
    creditsAvailable = await getCredits();
  } catch {
    creditsAvailable = -1;
  }

  const scanResult: ScanResult = {
    candidate,
    profile,
    prospects: indexed,
    summary: {
      total_found: indexed.length,
      internal_count: internalCount,
      web_count: webCount,
      already_have_email: alreadyHaveEmail,
      need_enrich: needEnrich,
      enrich_cost_total: needEnrich, // 1 credit per contact
    },
    credits_available: creditsAvailable,
  };

  // Log activity for scan
  try {
    await prisma.activite.create({
      data: {
        type: 'NOTE',
        entiteType: 'CANDIDAT',
        entiteId: candidateId,
        userId,
        titre: `🔍 Auto-Push Scan — ${scanResult.summary.total_found} prospects trouvés`,
        contenu: [
          `Scan Auto-Push pour ${candidate.name}`,
          `Résultats : ${scanResult.summary.total_found} prospects trouvés`,
          `- ${internalCount} prospect(s) interne(s)`,
          `- ${webCount} prospect(s) web`,
          `- ${alreadyHaveEmail} avec email, ${needEnrich} à enrichir`,
          `Secteurs ciblés : ${profile.sectors.join(', ') || 'non définis'}`,
          `Zones géo : ${profile.geo.join(', ') || 'non définies'}`,
          `Crédits FullEnrich disponibles : ${creditsAvailable}`,
        ].join('\n'),
        source: 'AGENT_IA',
        metadata: {
          action: 'auto_push_scan',
          total_found: scanResult.summary.total_found,
          internal_count: internalCount,
          web_count: webCount,
          sectors: profile.sectors,
          locations: profile.geo,
          credits_available: creditsAvailable,
        },
      },
    });
  } catch (err) {
    console.error('[AutoPush] Failed to create scan activity:', err);
  }

  return scanResult;
}

// ═══════════════════════════════════════════════════
// STEP 2: ENRICH — Enrich selected prospects (costs credits)
// ═══════════════════════════════════════════════════

export async function enrichSelectedProspects(
  candidateId: string,
  prospects: ProspectProposal[],
  userId?: string,
): Promise<EnrichResult> {
  const candidate = await getCandidateData(candidateId);
  if (!candidate) throw new Error('Candidat non trouve');

  let creditsUsed = 0;
  let emailFoundCount = 0;

  for (const prospect of prospects) {
    // Skip if already has email
    if (prospect.contact_email) continue;

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

          creditsUsed++;

          if (result?.contact_info?.most_probable_work_email?.email) {
            prospect.contact_email = result.contact_info.most_probable_work_email.email;
            emailFoundCount++;
          } else if (result?.contact_info?.most_probable_personal_email?.email) {
            prospect.contact_email = result.contact_info.most_probable_personal_email.email;
            emailFoundCount++;
          }

          if (result?.profile?.employment?.current?.title) {
            prospect.contact_title = result.profile.employment.current.title;
          }
          if (result?.profile?.full_name) {
            prospect.contact_name = result.profile.full_name;
          }

          prospect.needs_enrich = false;
          prospect.enrich_cost = 0;
        }
      } catch (error) {
        console.error(`[AutoPush] Enrich failed for ${prospect.contact_name}:`, error);
      }
    }
  }

  // Generate personalized messages for all prospects
  if (isAiConfigured()) {
    const profile = await profileCandidate(candidate, {});
    await generateMessages(candidate, profile, prospects);
  } else {
    // Fallback messages
    for (const p of prospects) {
      if (!p.suggested_message) {
        p.suggested_message = `Bonjour${p.contact_name ? ' ' + p.contact_name.split(' ')[0] : ''},\n\nJe me permets de vous contacter car je pense avoir un profil qui pourrait vous interesser : ${candidate.name}, ${candidate.title || 'profil qualifie'}.\n\nSeriez-vous disponible pour un echange rapide ?`;
      }
    }
  }

  // Get remaining credits
  let creditsRemaining = 0;
  try {
    const { getCredits } = await import('../integrations/fullenrich.service.js');
    creditsRemaining = await getCredits();
  } catch {
    creditsRemaining = -1;
  }

  const enrichResult: EnrichResult = {
    prospects,
    credits_used: creditsUsed,
    credits_remaining: creditsRemaining,
    enriched_count: creditsUsed,
    email_found_count: emailFoundCount,
  };

  // Log activity for enrichment
  if (userId) {
    try {
      await prisma.activite.create({
        data: {
          type: 'NOTE',
          entiteType: 'CANDIDAT',
          entiteId: candidateId,
          userId,
          titre: `💳 Auto-Push Enrichissement — ${creditsUsed} crédit(s) utilisé(s), ${emailFoundCount} email(s) trouvé(s)`,
          contenu: [
            `Enrichissement Auto-Push pour ${candidate!.name}`,
            `Crédits utilisés : ${creditsUsed}`,
            `Emails trouvés : ${emailFoundCount}/${creditsUsed}`,
            `Crédits restants : ${creditsRemaining}`,
            `Prospects enrichis :`,
            ...prospects.map(p => `- ${p.contact_name || 'N/A'} @ ${p.company_name} → ${p.contact_email || 'email non trouvé'}`),
          ].join('\n'),
          source: 'AGENT_IA',
          metadata: {
            action: 'auto_push_enrich',
            credits_used: creditsUsed,
            email_found_count: emailFoundCount,
            enriched_count: creditsUsed,
            credits_remaining: creditsRemaining,
          },
        },
      });
    } catch (err) {
      console.error('[AutoPush] Failed to create enrich activity:', err);
    }
  }

  return enrichResult;
}

async function generateMessages(
  candidate: AutoPushCandidate,
  profile: CandidateProfile,
  prospects: ProspectProposal[],
): Promise<void> {
  try {
    const prospectList = prospects.map((p, i) =>
      `${i + 1}. ${p.contact_name || 'DRH'} chez ${p.company_name} (${p.company_sector || 'secteur inconnu'}) — Signal: ${p.signal || 'aucun'}${p.approach_angle ? ' — Angle: ' + p.approach_angle : ''}`
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
        if (messages[i]) p.suggested_message = messages[i];
      });
    }
  } catch (error) {
    console.error('[AutoPush] Message generation error:', error);
  }

  // Fallback for any missing
  for (const p of prospects) {
    if (!p.suggested_message) {
      p.suggested_message = `Bonjour${p.contact_name ? ' ' + p.contact_name.split(' ')[0] : ''},\n\nJe me permets de vous contacter car je pense avoir un profil qui pourrait vous interesser : ${candidate.name}, ${candidate.title || 'profil qualifie'}.\n\n${profile.pitch_summary}\n\nSeriez-vous disponible pour un echange rapide ?`;
    }
  }
}

// ═══════════════════════════════════════════════════
// STEP 3: EXECUTE — Send pushes (0 credits)
// ═══════════════════════════════════════════════════

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
): Promise<ExecuteResult> {
  const results: ExecuteResult = {
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
        email: prospect.contact_email || null,
        push_id: pushResult.push_id,
        sequence_run_id: pushResult.sequence_run_id || undefined,
      });
    } catch (error: any) {
      console.error(`[AutoPush] Push failed for ${prospect.company_name}:`, error.message);
    }
  }

  // Log activity for execution
  try {
    await prisma.activite.create({
      data: {
        type: 'NOTE',
        entiteType: 'CANDIDAT',
        entiteId: candidateId,
        userId,
        titre: `🚀 Auto-Push Exécuté — ${results.pushes_created} push(es), ${results.sequences_started} séquence(s)`,
        contenu: [
          `Auto-Push exécuté pour le candidat ${candidateId}`,
          `${results.pushes_created} push(es) créé(s)`,
          `${results.sequences_started} séquence(s) Persistance Client lancée(s)`,
          `${results.prospects_created} nouveau(x) prospect(s) créé(s)`,
          ``,
          `Détails :`,
          ...results.details.map(d => `- ${d.company} (${d.contact}) → ${d.email || 'pas d\'email'}${d.sequence_run_id ? ' + séquence' : ''}`),
        ].join('\n'),
        source: 'AGENT_IA',
        metadata: {
          action: 'auto_push_execute',
          pushes_created: results.pushes_created,
          sequences_started: results.sequences_started,
          prospects_created: results.prospects_created,
          details: results.details,
        },
      },
    });
  } catch (err) {
    console.error('[AutoPush] Failed to create execute activity:', err);
  }

  return results;
}
