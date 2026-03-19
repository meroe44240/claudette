import { z } from 'zod';

export const createMandatSchema = z.object({
  titrePoste: z.string().min(1, 'Le titre du poste est requis'),
  entrepriseId: z.string().uuid('entrepriseId doit etre un UUID valide'),
  clientId: z.string().uuid('clientId doit etre un UUID valide'),
  description: z.string().optional(),
  localisation: z.string().optional(),
  salaireMin: z.number().int().positive().optional(),
  salaireMax: z.number().int().positive().optional(),
  feePourcentage: z.number().min(0).max(100).default(20),
  statut: z.enum(['OUVERT', 'EN_COURS', 'GAGNE', 'PERDU', 'ANNULE', 'CLOTURE']).optional(),
  priorite: z.enum(['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']).optional(),
  notes: z.string().optional(),
  assignedToId: z.string().uuid().optional(),
});

export const updateMandatSchema = z.object({
  titrePoste: z.string().min(1).optional(),
  entrepriseId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  description: z.string().nullable().optional(),
  localisation: z.string().nullable().optional(),
  salaireMin: z.number().int().positive().nullable().optional(),
  salaireMax: z.number().int().positive().nullable().optional(),
  feePourcentage: z.number().min(0).max(100).optional(),
  statut: z.enum(['OUVERT', 'EN_COURS', 'GAGNE', 'PERDU', 'ANNULE', 'CLOTURE']).optional(),
  priorite: z.enum(['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']).optional(),
  notes: z.string().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  transcript: z.string().nullable().optional(),
  ficheDePoste: z.string().nullable().optional(),
  scorecard: z.any().optional(),
  salaryRange: z.string().nullable().optional(),
  pitchPoints: z.any().optional(),
  typeContrat: z.string().nullable().optional(),
});

export const updateFeeSchema = z.object({
  feeMontantFacture: z.number().int().positive().optional(),
  feeStatut: z.enum(['NON_FACTURE', 'FACTURE', 'PAYE']).optional(),
});

export type CreateMandatInput = z.infer<typeof createMandatSchema>;
export type UpdateMandatInput = z.infer<typeof updateMandatSchema>;
export type UpdateFeeInput = z.infer<typeof updateFeeSchema>;
