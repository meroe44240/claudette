import prisma from '../../lib/db.js';
import { callClaude } from '../../services/claudeAI.js';

export async function matchCandidatesForMandat(mandatId: string, userId: string) {
  // Get mandat with entreprise
  const mandat = await prisma.mandat.findUnique({
    where: { id: mandatId },
    include: { entreprise: true },
  });
  if (!mandat) throw new Error('Mandat not found');

  // Build search criteria from mandat
  const searchTerms = [
    mandat.titrePoste,
    mandat.description,
  ].filter(Boolean).join(' ');

  // Get all active candidats not already on this mandat
  const existingCandidatureIds = (await prisma.candidature.findMany({
    where: { mandatId },
    select: { candidatId: true },
  })).map(c => c.candidatId);

  const candidats = await prisma.candidat.findMany({
    where: {
      id: existingCandidatureIds.length > 0 ? { notIn: existingCandidatureIds } : undefined,
    },
    take: 100, // Limit for performance
    include: {
      experiences: { take: 3, orderBy: { anneeDebut: 'desc' } },
    },
  });

  if (candidats.length === 0) return { matches: [] };

  // Build candidate summaries for AI scoring
  const candidatSummaries = candidats.map(c => ({
    id: c.id,
    nom: `${c.prenom || ''} ${c.nom}`.trim(),
    poste: c.posteActuel || '',
    entreprise: c.entrepriseActuelle || '',
    localisation: c.localisation || '',
    competences: (c.tags as string[]) || [],
    salaire: c.salaireActuel,
    experiences: c.experiences.map(e => `${e.titre} @ ${e.entreprise}`).join(', '),
  }));

  // Use AI to score candidates
  const systemPrompt = `Tu es un recruteur expert. On te donne un mandat et une liste de candidats. Pour chacun, donne un score de 0 a 100 et une raison courte.
Retourne UNIQUEMENT un JSON array: [{"id":"...","score":85,"reason":"..."}]
Top 10 seulement, tries par score decroissant.`;

  const userPrompt = `Voici un mandat:
Poste: ${mandat.titrePoste}
Description: ${mandat.description || 'Non renseigne'}
Entreprise: ${mandat.entreprise?.nom || 'Non renseigne'}
Localisation: ${mandat.localisation || 'Non renseigne'}
Salaire: ${mandat.salaireMin || '?'}k - ${mandat.salaireMax || '?'}k

Voici ${candidatSummaries.length} candidats:
${candidatSummaries.map(c => `- ID:${c.id} | ${c.nom} | ${c.poste} @ ${c.entreprise} | ${c.localisation} | Skills: ${c.competences.join(', ')} | XP: ${c.experiences}`).join('\n')}`;

  try {
    const response = await callClaude({
      feature: 'task_extraction',
      systemPrompt,
      userPrompt,
      userId,
      maxTokens: 2000,
      temperature: 0.3,
    });

    const rawText = typeof response.content === 'string'
      ? response.content
      : response.rawText;
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { matches: [] };

    const scores = JSON.parse(jsonMatch[0]) as Array<{ id: string; score: number; reason: string }>;

    // Enrich with full candidat data
    const matches = scores.slice(0, 10).map(s => {
      const candidat = candidats.find(c => c.id === s.id);
      return {
        ...s,
        candidat: candidat ? {
          id: candidat.id,
          nom: candidat.nom,
          prenom: candidat.prenom,
          posteActuel: candidat.posteActuel,
          entrepriseActuelle: candidat.entrepriseActuelle,
          localisation: candidat.localisation,
          tags: candidat.tags,
        } : null,
      };
    }).filter(m => m.candidat);

    return { matches };
  } catch (error) {
    console.error('[AI Matching] Error:', error);
    return { matches: [] };
  }
}
