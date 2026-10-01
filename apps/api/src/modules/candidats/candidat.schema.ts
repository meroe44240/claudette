import { z } from 'zod';

export const createCandidatSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  prenom: z.string().optional(),
  email: z.string().email('Email invalide').optional().nullable(),
  telephone: z.string().optional().nullable(),
  linkedinUrl: z.string().optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  posteActuel: z.string().optional().nullable(),
  entrepriseActuelle: z.string().optional().nullable(),
  localisation: z.string().optional().nullable(),
  salaireActuel: z.number().int().positive().optional().nullable(),
  salaireSouhaite: z.number().int().positive().optional().nullable(),
  anneesExperience: z.number().int().min(0).optional().nullable(),
  disponibilite: z.string().optional().nullable(),
  mobilite: z.string().optional().nullable(),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
  consentementRgpd: z.boolean().optional(),
  assignedToId: z.string().uuid().optional().nullable(),
  tier: z.enum(['A', 'B', 'C']).optional().nullable(),
  // AI-generated fields
  aiPitchShort: z.string().optional(),
  aiPitchLong: z.string().optional(),
  aiSellingPoints: z.array(z.string()).optional(),
  aiIdealFor: z.string().optional(),
  aiAnonymizedProfile: z.record(z.string(), z.unknown()).optional(),
  aiParsedAt: z.string().datetime().optional(),
});

export const updateCandidatSchema = createCandidatSchema.partial();

export type CreateCandidatInput = z.infer<typeof createCandidatSchema>;
export type UpdateCandidatInput = z.infer<typeof updateCandidatSchema>;

// ─── DOSSIER CLIENT (portail) ───────────────────────

export const dossierSchema = z.object({
  synthese: z.string().max(500, 'La synthèse est limitée à 500 caractères').optional().nullable(),
  infos: z.array(z.object({ label: z.string().max(80), value: z.string().max(300) })).max(12).optional(),
  adequation: z.array(z.string().max(600)).max(20).optional(),
  sections: z.array(z.object({ title: z.string().max(120), items: z.array(z.string().max(600)).max(30) })).max(12).optional(),
  manuel: z.boolean().optional(),
  coordonneesVisibles: z.boolean().optional(),
});

export const syntheseApplySchema = z.object({
  fields: z.object({
    localisation: z.string().max(255).nullable().optional(),
    salaireActuel: z.number().int().positive().nullable().optional(),
    salaireSouhaite: z.number().int().positive().nullable().optional(),
    anneesExperience: z.number().int().min(0).nullable().optional(),
    disponibilite: z.string().max(100).nullable().optional(),
    mobilite: z.string().max(255).nullable().optional(),
  }).optional(),
  experiences: z.array(z.object({
    titre: z.string().min(1).max(255), entreprise: z.string().min(1).max(255),
    anneeDebut: z.number().int().min(1950).max(2100), anneeFin: z.number().int().min(1950).max(2100).nullable(),
    highlights: z.array(z.string().max(600)).max(5),
  })).optional(),
  dossier: dossierSchema.omit({ manuel: true, coordonneesVisibles: true }).optional(),
});

// ─── EXPERIENCE SCHEMAS ─────────────────────────────

export const createExperienceSchema = z.object({
  titre: z.string().min(1, 'Le titre du poste est requis'),
  entreprise: z.string().min(1, "Le nom de l'entreprise est requis"),
  anneeDebut: z.number().int().min(1950).max(2100),
  anneeFin: z.number().int().min(1950).max(2100).optional().nullable(),
  highlights: z.array(z.string()).max(5).optional().default([]),
  source: z.enum(['cv', 'manual']).optional().default('manual'),
});

export const updateExperienceSchema = createExperienceSchema.partial().extend({
  titre: z.string().min(1).optional(),
  entreprise: z.string().min(1).optional(),
});

export type CreateExperienceInput = z.infer<typeof createExperienceSchema>;
export type UpdateExperienceInput = z.infer<typeof updateExperienceSchema>;
