import { z } from 'zod';

export const createCandidatSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  prenom: z.string().optional(),
  email: z.string().email('Email invalide').optional(),
  telephone: z.string().optional(),
  linkedinUrl: z.string().optional(),
  photoUrl: z.string().url().optional(),
  posteActuel: z.string().optional(),
  entrepriseActuelle: z.string().optional(),
  localisation: z.string().optional(),
  salaireActuel: z.number().int().positive().optional(),
  salaireSouhaite: z.number().int().positive().optional(),
  anneesExperience: z.number().int().min(0).optional(),
  disponibilite: z.string().optional(),
  mobilite: z.string().optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  consentementRgpd: z.boolean().optional(),
  assignedToId: z.string().uuid().optional(),
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
