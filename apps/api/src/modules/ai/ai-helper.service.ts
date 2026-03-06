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

  // 3. Build AI prompt for batch personalization
  const systemPrompt = `Tu es un expert en rédaction d'emails de recrutement. Tu dois personnaliser un template d'email pour chaque client/prospect afin que le message soit pertinent et personnel.

Garde le même ton et la même structure que l'email original, mais adapte le contenu pour chaque destinataire en tenant compte de leur entreprise, secteur et poste.

Réponds UNIQUEMENT en JSON valide: un tableau d'objets avec les champs: clientId (string), subject (string), body (string).
Les variables {{client_first_name}} et {{client_company}} doivent être conservées dans les messages personnalisés.`;

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

  const userPrompt = `Profil candidat proposé:
- Poste: ${candidat.posteActuel || 'Non renseigné'}
- Localisation: ${candidat.localisation || 'Non renseignée'}
- Tags: ${candidat.tags?.join(', ') || 'Aucun'}

Template email original:
Objet: ${emailSubject}
Corps:
${emailBody}

Clients à personnaliser (${clients.length}):
${JSON.stringify(clientsInfo, null, 2)}

Personnalise l'email pour chaque client.`;

  // 4. Call Claude via centralized service
  const response = await callClaude({
    feature: 'task_extraction',
    systemPrompt,
    userPrompt,
    userId,
    maxTokens: 4000,
    temperature: 0.3,
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
