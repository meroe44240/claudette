import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');
import { callClaude, callClaudeWithVision } from '../../services/claudeAI.js';
import prisma from '../../lib/db.js';

// ─── SYSTEM PROMPT ──────────────────────────────────────

const CV_PARSING_SYSTEM_PROMPT = `Tu es un expert en recrutement commercial/sales. Tu analyses des CVs pour en extraire les informations structurées et rédiger un pitch commercial.

Le pitch commercial est un texte de 6-8 lignes qu'un recruteur envoie à un client (DRH, hiring manager) pour présenter un candidat de manière attractive. Il doit être factuel, impactant, et donner envie de rencontrer le candidat.

Le profil anonymisé doit :
- Remplacer le nom par "Candidat"
- Remplacer les entreprises par leur description (secteur + taille)
- Garder tous les chiffres et résultats

Extrais les informations suivantes du CV et génère les contenus demandés.

Réponds UNIQUEMENT en JSON valide. Pas de markdown, pas de backticks.

Le JSON doit suivre exactement cette structure :
{
  "candidate": {
    "first_name": "string",
    "last_name": "string",
    "email": "string ou null",
    "phone": "string ou null",
    "city": "string ou null",
    "current_title": "string",
    "current_company": "string",
    "linkedin_url": "string ou null",
    "years_experience": number,
    "languages": ["string"],
    "skills": ["string - max 10 compétences clés"],
    "education": [{"school": "string", "degree": "string", "year": number ou null}],
    "experience": [{"title": "string", "company": "string", "start_year": number, "end_year": number ou null, "highlights": ["string - max 3 réalisations clés"]}],
    "sector": "string - secteur principal",
    "seniority": "string - junior/confirmé/senior/expert/dirigeant"
  },
  "pitch": {
    "short": "string - pitch court de 3 lignes maximum, percutant",
    "long": "string - pitch long de 6-8 lignes, détaillé et commercial",
    "key_selling_points": ["string", "string", "string"],
    "ideal_for": "string - une phrase décrivant le poste/entreprise idéal(e) pour ce candidat"
  },
  "anonymized_profile": {
    "title": "string - titre anonymisé du profil",
    "summary": "string - résumé anonymisé de 3-4 lignes",
    "bullet_points": ["string - 5-6 points forts anonymisés"]
  }
}`;

// ─── TYPES ──────────────────────────────────────────────

export interface CvParsingResult {
  candidate: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    city: string | null;
    current_title: string;
    current_company: string;
    linkedin_url: string | null;
    years_experience: number;
    languages: string[];
    skills: string[];
    education: { school: string; degree: string; year: number | null }[];
    experience: {
      title: string;
      company: string;
      start_year: number;
      end_year: number | null;
      highlights: string[];
    }[];
    sector: string;
    seniority: string;
  };
  pitch: {
    short: string;
    long: string;
    key_selling_points: string[];
    ideal_for: string;
  };
  anonymized_profile: {
    title: string;
    summary: string;
    bullet_points: string[];
  };
}

// ─── PDF TEXT EXTRACTION ────────────────────────────────

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ verbosity: 0, data: buffer });
    await parser.load();
    const result = await parser.getText();
    await parser.destroy();
    // getText() returns { pages: [...], text: "...", total: N }
    const text = typeof result === 'string' ? result : result?.text || '';
    return text.trim();
  } catch (err: any) {
    console.error('[cv-parsing] PDF parse error:', err.message);
    return '';
  }
}

// ─── MAIN PARSE FUNCTION ────────────────────────────────

export async function parseCv(
  buffer: Buffer,
  filename: string,
  userId: string,
): Promise<CvParsingResult> {
  // 1. Try extracting text from PDF
  const extractedText = await extractTextFromPdf(buffer);

  let result: CvParsingResult;

  if (extractedText.length < 50) {
    // Scanned PDF or image-based PDF — use vision
    console.log(`[cv-parsing] Text too short (${extractedText.length} chars) for "${filename}", using vision mode`);

    const base64 = buffer.toString('base64');
    const response = await callClaudeWithVision({
      feature: 'cv_parsing',
      systemPrompt: CV_PARSING_SYSTEM_PROMPT,
      userPrompt: `Analyse ce CV (fichier: ${filename}) et extrais toutes les informations selon le format JSON demandé.`,
      imageBase64: base64,
      mediaType: 'application/pdf',
      userId,
      maxTokens: 4000,
    });

    result = validateAndCleanResult(response.content);
  } else {
    // Text-based PDF — send text to Claude
    console.log(`[cv-parsing] Extracted ${extractedText.length} chars from "${filename}", using text mode`);

    const response = await callClaude({
      feature: 'cv_parsing',
      systemPrompt: CV_PARSING_SYSTEM_PROMPT,
      userPrompt: `Voici le contenu textuel d'un CV (fichier: ${filename}). Analyse-le et extrais toutes les informations selon le format JSON demandé.\n\n--- DÉBUT DU CV ---\n${extractedText}\n--- FIN DU CV ---`,
      userId,
      maxTokens: 4000,
    });

    result = validateAndCleanResult(response.content);
  }

  return result;
}

// ─── UPDATE CANDIDAT FROM CV ────────────────────────────

export async function updateCandidatFromCv(
  buffer: Buffer,
  filename: string,
  userId: string,
  candidatId: string,
): Promise<{ parsed: CvParsingResult; candidat: any }> {
  // Parse the CV
  const parsed = await parseCv(buffer, filename, userId);

  // Build the update payload from parsed data
  const updateData: Record<string, any> = {};

  if (parsed.candidate.last_name) updateData.nom = parsed.candidate.last_name;
  if (parsed.candidate.first_name) updateData.prenom = parsed.candidate.first_name;
  if (parsed.candidate.email) updateData.email = parsed.candidate.email;
  if (parsed.candidate.phone) updateData.telephone = parsed.candidate.phone;
  if (parsed.candidate.current_title) updateData.posteActuel = parsed.candidate.current_title;
  if (parsed.candidate.current_company) updateData.entrepriseActuelle = parsed.candidate.current_company;
  if (parsed.candidate.city) updateData.localisation = parsed.candidate.city;
  if (parsed.candidate.linkedin_url) updateData.linkedinUrl = parsed.candidate.linkedin_url;
  if (parsed.candidate.skills && parsed.candidate.skills.length > 0) {
    updateData.tags = parsed.candidate.skills;
  }

  // AI-specific fields
  updateData.aiPitchShort = parsed.pitch.short;
  updateData.aiPitchLong = parsed.pitch.long;
  updateData.aiSellingPoints = parsed.pitch.key_selling_points;
  updateData.aiIdealFor = parsed.pitch.ideal_for;
  updateData.aiAnonymizedProfile = parsed.anonymized_profile;
  updateData.aiParsedAt = new Date();

  const candidat = await prisma.candidat.update({
    where: { id: candidatId },
    data: updateData,
  });

  // Save structured experiences to the dedicated table
  if (parsed.candidate.experience && parsed.candidate.experience.length > 0) {
    try {
      const { bulkCreateExperiences } = await import('../candidats/candidat.service.js');
      await bulkCreateExperiences(
        candidatId,
        parsed.candidate.experience.map((exp) => ({
          titre: exp.title,
          entreprise: exp.company,
          anneeDebut: exp.start_year,
          anneeFin: exp.end_year ?? null,
          highlights: exp.highlights || [],
          source: 'cv' as const,
        })),
      );
    } catch (err: any) {
      console.error('[cv-parsing] Failed to save experiences:', err.message);
    }
  }

  return { parsed, candidat };
}

// ─── VALIDATION / CLEANUP ───────────────────────────────

function validateAndCleanResult(content: any): CvParsingResult {
  if (typeof content === 'string') {
    throw new Error('L\'IA n\'a pas retourné un JSON valide. Veuillez réessayer.');
  }

  // Ensure all required fields exist with defaults
  const candidate = content.candidate || {};
  const pitch = content.pitch || {};
  const anonymized = content.anonymized_profile || {};

  return {
    candidate: {
      first_name: candidate.first_name || '',
      last_name: candidate.last_name || '',
      email: candidate.email || null,
      phone: candidate.phone || null,
      city: candidate.city || null,
      current_title: candidate.current_title || '',
      current_company: candidate.current_company || '',
      linkedin_url: candidate.linkedin_url || null,
      years_experience: typeof candidate.years_experience === 'number' ? candidate.years_experience : 0,
      languages: Array.isArray(candidate.languages) ? candidate.languages : [],
      skills: Array.isArray(candidate.skills) ? candidate.skills.slice(0, 10) : [],
      education: Array.isArray(candidate.education)
        ? candidate.education.map((e: any) => ({
            school: e.school || '',
            degree: e.degree || '',
            year: typeof e.year === 'number' ? e.year : null,
          }))
        : [],
      experience: Array.isArray(candidate.experience)
        ? candidate.experience.map((e: any) => ({
            title: e.title || '',
            company: e.company || '',
            start_year: typeof e.start_year === 'number' ? e.start_year : 0,
            end_year: typeof e.end_year === 'number' ? e.end_year : null,
            highlights: Array.isArray(e.highlights) ? e.highlights.slice(0, 3) : [],
          }))
        : [],
      sector: candidate.sector || '',
      seniority: candidate.seniority || '',
    },
    pitch: {
      short: pitch.short || '',
      long: pitch.long || '',
      key_selling_points: Array.isArray(pitch.key_selling_points) ? pitch.key_selling_points.slice(0, 3) : [],
      ideal_for: pitch.ideal_for || '',
    },
    anonymized_profile: {
      title: anonymized.title || '',
      summary: anonymized.summary || '',
      bullet_points: Array.isArray(anonymized.bullet_points) ? anonymized.bullet_points : [],
    },
  };
}
