import prisma from '../../lib/db.js';
import { callClaude } from '../../services/claudeAI.js';

// ─── ADCHASE AI RECOMMEND ───────────────────────────

interface AiRecommendation {
  clientId: string;
  clientName: string;
  entreprise: string;
  score: number;
  reason: string;
}

export async function aiRecommendProspects(
  userId: string,
  candidatId: string,
): Promise<AiRecommendation[]> {
  // 1. Load candidat profile
  const candidat = await prisma.candidat.findUnique({
    where: { id: candidatId },
    select: {
      id: true,
      nom: true,
      prenom: true,
      posteActuel: true,
      entrepriseActuelle: true,
      localisation: true,
      tags: true,
      cvTexte: true,
      aiPitchShort: true,
      aiSellingPoints: true,
    },
  });

  if (!candidat) throw new Error('Candidat non trouvé');

  // 2. Load all clients with entreprise info
  const clients = await prisma.client.findMany({
    include: {
      entreprise: {
        select: { id: true, nom: true, secteur: true, taille: true, localisation: true },
      },
      mandats: {
        select: { id: true, titrePoste: true, statut: true },
        take: 5,
        orderBy: { createdAt: 'desc' },
      },
    },
    take: 100,
  });

  if (clients.length === 0) return [];

  // 3. Build AI prompt
  const candidatProfile = {
    poste: candidat.posteActuel || 'Non renseigné',
    entreprise: candidat.entrepriseActuelle || 'Non renseignée',
    localisation: candidat.localisation || 'Non renseignée',
    tags: candidat.tags || [],
    cvSummary: candidat.cvTexte ? candidat.cvTexte.substring(0, 500) : '',
    pitch: candidat.aiPitchShort || '',
    sellingPoints: Array.isArray(candidat.aiSellingPoints) ? candidat.aiSellingPoints : [],
  };

  const clientsList = clients.map((c) => ({
    id: c.id,
    name: `${c.prenom || ''} ${c.nom}`.trim(),
    poste: c.poste || '',
    entreprise: c.entreprise?.nom || '',
    secteur: c.entreprise?.secteur || '',
    taille: c.entreprise?.taille || '',
    localisation: c.entreprise?.localisation || '',
    mandatsActifs: c.mandats.filter((m) => !['CLOTURE', 'ANNULE', 'PERDU'].includes(m.statut)).length,
  }));

  const systemPrompt = `Tu es un consultant en recrutement expert. Tu dois analyser un profil de candidat et recommander les meilleurs clients/prospects à qui présenter ce candidat. Pour chaque client, attribue un score de 0 à 100 et une raison courte (1 phrase max).

Réponds UNIQUEMENT en JSON valide, un tableau d'objets avec les champs: clientId (string), score (number 0-100), reason (string en français).
Trie par score décroissant. Retourne maximum 10 résultats. Ne retourne que les clients avec un score >= 30.`;

  const userPrompt = `Profil candidat:
- Poste: ${candidatProfile.poste}
- Entreprise actuelle: ${candidatProfile.entreprise}
- Localisation: ${candidatProfile.localisation}
- Tags/Compétences: ${candidatProfile.tags.join(', ') || 'Aucun'}
${candidatProfile.pitch ? `- Pitch: ${candidatProfile.pitch}` : ''}
${candidatProfile.sellingPoints.length > 0 ? `- Points forts: ${(candidatProfile.sellingPoints as string[]).join(', ')}` : ''}
${candidatProfile.cvSummary ? `- Extrait CV: ${candidatProfile.cvSummary}` : ''}

Liste des clients prospects:
${JSON.stringify(clientsList, null, 2)}

Recommande les meilleurs clients pour ce candidat.`;

  // 4. Call Claude via centralized service
  const response = await callClaude({
    feature: 'task_extraction',
    systemPrompt,
    userPrompt,
    userId,
    maxTokens: 2000,
    temperature: 0.3,
  });

  // 5. Parse response
  let recommendations: Array<{ clientId: string; score: number; reason: string }>;
  try {
    const rawText = typeof response.content === 'string'
      ? response.content
      : response.rawText;
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    recommendations = JSON.parse(cleaned);
    if (!Array.isArray(recommendations)) recommendations = [];
  } catch (e) {
    console.warn('[AI] Failed to parse recommendations:', response.rawText);
    return [];
  }

  // 6. Enrich with client data
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  return recommendations
    .filter((r) => r.clientId && r.score > 0)
    .map((r) => {
      const client = clientMap.get(r.clientId);
      return {
        clientId: r.clientId,
        clientName: client ? `${client.prenom || ''} ${client.nom}`.trim() : 'Inconnu',
        entreprise: client?.entreprise?.nom || '',
        score: Math.min(100, Math.max(0, r.score)),
        reason: r.reason || '',
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ─── ADCHASE AI PERSONALIZE MESSAGES ────────────────

interface PersonalizedMessage {
  prospectClientId: string;
  clientName: string;
  entreprise: string;
  subject: string;
  body: string;
}

export async function aiPersonalizeMessages(
  userId: string,
  candidatId: string,
  emailSubject: string,
  emailBody: string,
  prospectClientIds: string[],
): Promise<PersonalizedMessage[]> {
  // 1. Load candidat profile (enriched with selling points)
  const candidat = await prisma.candidat.findUnique({
    where: { id: candidatId },
    select: {
      id: true,
      nom: true,
      prenom: true,
      posteActuel: true,
      entrepriseActuelle: true,
      localisation: true,
      tags: true,
      aiSellingPoints: true,
      aiPitchShort: true,
      anneesExperience: true,
    },
  });

  if (!candidat) throw new Error('Candidat non trouvé');

  // 2. Load all prospects with entreprise info
  const clients = await prisma.client.findMany({
    where: { id: { in: prospectClientIds } },
    include: {
      entreprise: {
        select: { nom: true, secteur: true, taille: true, localisation: true },
      },
    },
  });

  if (clients.length === 0) return [];

  // 3. Build AI prompt — sharp headhunter tone
  const sellingPoints = Array.isArray(candidat.aiSellingPoints) ? (candidat.aiSellingPoints as string[]) : [];

  const systemPrompt = `Tu es un headhunter senior chez Humanup.io. Tu personnalises des emails de prospection pour chaque client/prospect.

RÈGLES :
- Garde le ton direct, factuel et confiant de l'email original.
- Adapte chaque message au contexte spécifique du destinataire : son secteur, son poste, les enjeux de son marché.
- Ajoute un angle business pertinent pour chaque client (ex: si le client est dans la fintech, mentionne l'expertise fintech du candidat).
- NE CHANGE PAS la structure fondamentale du message — personnalise les accroches et les arguments.
- Les variables {{client_first_name}} et {{client_company}} DOIVENT être conservées telles quelles.
- JAMAIS de formules bateau : "je me permets", "n'hésitez pas", "excellente opportunité".
- Chaque message doit sembler écrit spécifiquement pour ce client, pas un copier-coller.

Réponds UNIQUEMENT en JSON valide : un tableau d'objets avec les champs: clientId (string), subject (string), body (string).`;

  const clientsInfo = clients.map((c) => ({
    id: c.id,
    prenom: c.prenom || '',
    nom: c.nom,
    poste: c.poste || '',
    entreprise: c.entreprise?.nom || '',
    secteur: c.entreprise?.secteur || '',
    taille: c.entreprise?.taille || '',
    localisation: c.entreprise?.localisation || '',
  }));

  const userPrompt = `Profil candidat :
- Poste : ${candidat.posteActuel || 'Non renseigné'}
- Localisation : ${candidat.localisation || 'Non renseignée'}
- Expérience : ${candidat.anneesExperience ? `${candidat.anneesExperience} ans` : 'Non renseignée'}
- Compétences : ${(candidat.tags as string[] || []).join(', ') || 'Aucune'}
${sellingPoints.length > 0 ? `- Selling points : ${sellingPoints.join(' | ')}` : ''}
${candidat.aiPitchShort ? `- Pitch : ${candidat.aiPitchShort}` : ''}

Template email original :
Objet : ${emailSubject}
Corps :
${emailBody}

Clients à personnaliser (${clients.length}) :
${JSON.stringify(clientsInfo, null, 2)}

Personnalise l'email pour chaque client en adaptant l'angle business.`;

  // 4. Call Claude via centralized service
  const response = await callClaude({
    feature: 'task_extraction',
    systemPrompt,
    userPrompt,
    userId,
    maxTokens: 4000,
    temperature: 0.4,
  });

  // 5. Parse response
  let personalized: Array<{ clientId: string; subject: string; body: string }>;
  try {
    const rawText = typeof response.content === 'string'
      ? response.content
      : response.rawText;
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    personalized = JSON.parse(cleaned);
    if (!Array.isArray(personalized)) personalized = [];
  } catch (e) {
    console.warn('[AI] Failed to parse personalized messages:', response.rawText);
    return [];
  }

  // 6. Enrich with client names
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  return personalized.map((p) => {
    const client = clientMap.get(p.clientId);
    return {
      prospectClientId: p.clientId,
      clientName: client ? `${client.prenom || ''} ${client.nom}`.trim() : 'Inconnu',
      entreprise: client?.entreprise?.nom || '',
      subject: p.subject || emailSubject,
      body: p.body || emailBody,
    };
  });
}

// ─── MANDAT AI SCORECARD GENERATION ─────────────────

export interface Scorecard {
  competencesCles: Array<{ nom: string; poids: number; description: string }>;
  criteresTechniques: Array<{ nom: string; obligatoire: boolean }>;
  criteresComportementaux: Array<{ nom: string; description: string }>;
  questionsEntretien: Array<{ question: string; competenceVisee: string }>;
  profilIdeal: string;
  redFlags: string[];
}

export async function aiGenerateScorecard(
  userId: string,
  mandatId: string,
): Promise<Scorecard> {
  // 1. Load mandat with all context
  const mandat = await prisma.mandat.findUnique({
    where: { id: mandatId },
    select: {
      id: true,
      titrePoste: true,
      description: true,
      localisation: true,
      salaireMin: true,
      salaireMax: true,
      salaryRange: true,
      transcript: true,
      ficheDePoste: true,
      entreprise: { select: { nom: true, secteur: true, taille: true } },
    },
  });

  if (!mandat) throw new Error('Mandat non trouvé');

  // 2. Build rich context
  const context: string[] = [];
  if (mandat.transcript) context.push(`TRANSCRIPT DU CALL CLIENT :\n${mandat.transcript}`);
  if (mandat.ficheDePoste) context.push(`FICHE DE POSTE :\n${mandat.ficheDePoste}`);
  if (mandat.description) context.push(`DESCRIPTION DU MANDAT :\n${mandat.description}`);

  if (context.length === 0) {
    throw new Error('Ajoutez un transcript ou une fiche de poste avant de générer la scorecard');
  }

  const systemPrompt = `Tu es un expert en recrutement chez Humanup.io. Tu analyses un brief client (transcript d'appel et/ou fiche de poste) pour générer une scorecard structurée et actionnable.

La scorecard doit permettre à un recruteur d'évaluer objectivement chaque candidat sur ce poste.

Réponds UNIQUEMENT en JSON valide avec cette structure exacte :
{
  "competencesCles": [{ "nom": "string", "poids": number (1-5), "description": "string court" }],
  "criteresTechniques": [{ "nom": "string", "obligatoire": boolean }],
  "criteresComportementaux": [{ "nom": "string", "description": "string court" }],
  "questionsEntretien": [{ "question": "string", "competenceVisee": "string" }],
  "profilIdeal": "description en 2-3 phrases du candidat idéal",
  "redFlags": ["signal d'alerte 1", "signal d'alerte 2", ...]
}

RÈGLES :
- 5-8 compétences clés avec un poids de 1 (nice-to-have) à 5 (critique)
- 4-6 critères techniques (hard skills, outils, certifications)
- 3-5 critères comportementaux (soft skills, culture fit)
- 5-8 questions d'entretien précises et pertinentes
- 3-5 red flags spécifiques au poste
- Si le transcript mentionne des informations sur le salaire, la localisation ou le contexte, extrais-les aussi
- Sois spécifique au secteur et au poste — pas de compétences génériques`;

  const userPrompt = `Poste : ${mandat.titrePoste}
Entreprise : ${mandat.entreprise?.nom || 'Non renseignée'} (${mandat.entreprise?.secteur || 'secteur inconnu'})
Localisation : ${mandat.localisation || 'Non renseignée'}
Salaire : ${mandat.salaryRange || (mandat.salaireMin && mandat.salaireMax ? `${mandat.salaireMin}-${mandat.salaireMax}€` : 'Non renseigné')}

${context.join('\n\n---\n\n')}

Génère la scorecard pour ce poste.`;

  // 3. Call Claude
  const response = await callClaude({
    feature: 'task_extraction',
    systemPrompt,
    userPrompt,
    userId,
    maxTokens: 3000,
    temperature: 0.3,
  });

  // 4. Parse response
  let scorecard: Scorecard;
  try {
    const rawText = typeof response.content === 'string'
      ? response.content
      : response.rawText;
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    scorecard = JSON.parse(cleaned);
  } catch (e) {
    console.warn('[AI] Failed to parse scorecard:', response.rawText);
    throw new Error('Erreur lors du parsing de la scorecard IA');
  }

  // 5. Save scorecard to mandat
  const updateData: any = {
    scorecard: scorecard as any,
    scorecardGeneratedAt: new Date(),
  };

  // Try to auto-populate missing mandat fields from transcript
  await prisma.mandat.update({
    where: { id: mandatId },
    data: updateData,
  });

  return scorecard;
}
