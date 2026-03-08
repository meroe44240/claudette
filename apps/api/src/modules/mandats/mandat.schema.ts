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

export const updateMandatSchema = createMandatSchema.partial().extend({
  transcript: z.string().optional(),
  ficheDePoste: z.string().optional(),
  scorecard: z.any().optional(),
  salaryRange: z.string().optional(),
  pitchPoints: z.any().optional(),
});

export const updateFeeSchema = z.object({
  feeMontantFacture: z.number().int().positive().optional(),
  feeStatut: z.enum(['NON_FACTURE', 'FACTURE', 'PAYE']).optional(),
});

export type CreateMandatInput = z.infer<typeof createMandatSchema>;
export type UpdateMandatInput = z.infer<typeof updateMandatSchema>;
export type UpdateFeeInput = z.infer<typeof updateFeeSchema>;
