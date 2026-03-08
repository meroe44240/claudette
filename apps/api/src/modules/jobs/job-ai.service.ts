/**
 * AI-powered job description generation.
 * Uses Claude Haiku to generate attractive, anonymized job descriptions
 * from mandat data.
 */

import { callClaude } from '../../services/claudeAI.js';
import prisma from '../../lib/db.js';

const JOB_DESCRIPTION_SYSTEM_PROMPT = `Tu es un expert en recrutement spécialisé dans les postes commerciaux et sales. Tu génères des descriptions de poste attractives et professionnelles pour un job board public.

RÈGLES IMPORTANTES :
1. JAMAIS le nom du client/entreprise — utiliser uniquement la description anonymisée fournie
2. Le ton doit être professionnel mais engageant
3. Structure en 3 sections : Missions, Profil recherché, Ce qu'on offre
4. Utiliser des bullet points (tirets markdown)
5. Être factuel et spécifique (chiffres, contexte, enjeux)

Réponds UNIQUEMENT en JSON valide :
{
  "description": "string - description complète en markdown avec les 3 sections",
  "companyDescription": "string - description anonymisée de l'entreprise en une ligne (ex: Scale-up SaaS · B2B · 200 personnes)",
  "tags": ["string - 5-8 tags pertinents pour le poste"]
}`;

export async function generateJobDescription(
  mandatId: string,
  userId: string,
): Promise<{ description: string; companyDescription: string; tags: string[] } | null> {
  const mandat = await prisma.mandat.findUnique({
    where: { id: mandatId },
    include: {
      entreprise: { select: { nom: true, secteur: true, taille: true, localisation: true } },
    },
  });

  if (!mandat) return null;

  const tailleTxt = mandat.entreprise.taille
    ? { STARTUP: 'Startup', PME: 'PME (50-250 personnes)', ETI: 'ETI (250-5000 personnes)', GRAND_GROUPE: 'Grand Groupe (5000+ personnes)' }[mandat.entreprise.taille]
    : 'Taille non précisée';

  const pitchPoints = mandat.pitchPoints
    ? (Array.isArray(mandat.pitchPoints) ? mandat.pitchPoints : []).join(', ')
    : '';

  const userPrompt = `Génère une description de poste attractive pour cette offre :

- Titre du poste : ${mandat.titrePoste}
- Secteur : ${mandat.entreprise.secteur || 'Non précisé'}
- Taille entreprise : ${tailleTxt}
- Localisation : ${mandat.localisation || 'Non précisé'}
- Salaire : ${mandat.salaryRange || (mandat.salaireMin && mandat.salaireMax ? `${mandat.salaireMin / 1000}-${mandat.salaireMax / 1000}k€` : 'Non précisé')}
- Points clés du poste : ${pitchPoints || 'Non précisé'}
- Description existante : ${mandat.description || 'Aucune'}

RAPPEL : Ne JAMAIS mentionner le nom "${mandat.entreprise.nom}" dans la description. Utiliser uniquement une description anonymisée du type d'entreprise.`;

  try {
    const response = await callClaude({
      feature: 'job_description',
      systemPrompt: JOB_DESCRIPTION_SYSTEM_PROMPT,
      userPrompt,
      userId,
      maxTokens: 3000,
      temperature: 0.7,
    });

    // Parse JSON from response
    const text = typeof response === 'string'
      ? response
      : (response as any)?.content?.[0]?.text || (response as any)?.text || JSON.stringify(response);

    // Extract JSON from potential markdown code blocks
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      description: parsed.description || '',
      companyDescription: parsed.companyDescription || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  } catch (err) {
    console.error('[JobBoard AI] Description generation failed:', err);
    return null;
  }
}
