import { z } from 'zod';

export const createMandatSchema = z.object({
  titrePoste: z.string().min(1, 'Le titre du poste est requis'),
  type: z.enum(['CLIENT', 'VIVIER']).optional(),
  natureContrat: z.enum(['CDI', 'CDD', 'INTERIM', 'FREELANCE']).nullable().optional(),
  entrepriseId: z.string().uuid('entrepriseId doit etre un UUID valide'),
  // Optionnel : un mandat VIVIER (sourcing sans client) n'a pas de client.
  clientId: z.string().uuid('clientId doit etre un UUID valide').nullable().optional(),
  description: z.string().optional(),
  localisation: z.string().optional(),
  salaireMin: z.number().int().positive().optional(),
  salaireMax: z.number().int().positive().optional(),
  feePourcentage: z.number().min(0).max(100).default(20),
  statut: z.enum(['OUVERT', 'EN_COURS', 'GAGNE', 'PERDU', 'ANNULE', 'CLOTURE']).optional(),
  priorite: z.enum(['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']).optional(),
  notes: z.string().optional(),
  assignedToId: z.string().uuid().optional(),
  sourceurId: z.string().uuid().nullable().optional(),
  salesId: z.string().uuid().nullable().optional(),
  recruteurId: z.string().uuid().nullable().optional(),
});

export const updateMandatSchema = z.object({
  titrePoste: z.string().min(1).optional(),
  type: z.enum(['CLIENT', 'VIVIER']).optional(),
  natureContrat: z.enum(['CDI', 'CDD', 'INTERIM', 'FREELANCE']).nullable().optional(),
  entrepriseId: z.string().uuid().optional(),
  clientId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  localisation: z.string().nullable().optional(),
  salaireMin: z.number().int().positive().nullable().optional(),
  salaireMax: z.number().int().positive().nullable().optional(),
  feePourcentage: z.number().min(0).max(100).optional(),
  statut: z.enum(['OUVERT', 'EN_COURS', 'GAGNE', 'PERDU', 'ANNULE', 'CLOTURE']).optional(),
  priorite: z.enum(['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']).optional(),
  notes: z.string().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  sourceurId: z.string().uuid().nullable().optional(),
  salesId: z.string().uuid().nullable().optional(),
  recruteurId: z.string().uuid().nullable().optional(),
  visibleStages: z
    .array(z.enum(['SOURCING', 'CONTACTE', 'ENTRETIEN_1', 'ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'PROCESS', 'OFFRE', 'PLACE', 'REFUSE']))
    .optional(),
  transcript: z.string().nullable().optional(),
  ficheDePoste: z.string().nullable().optional(),
  scorecard: z.any().optional(),
  salaryRange: z.string().nullable().optional(),
  pitchPoints: z.any().optional(),
  typeContrat: z.string().nullable().optional(),
  etapeCycle: z.string().max(60).nullable().optional(),
  // ── Forecast ──
  nbPostes: z.number().int().min(1).max(50).optional(),
  feeType: z.enum(['POURCENTAGE_PACKAGE', 'POURCENTAGE_FIXE', 'MONTANT_FIXE']).optional(),
  feeMontantFixe: z.number().int().nonnegative().nullable().optional(),
  devise: z.string().regex(/^[A-Za-z]{3}$/).transform((s) => s.toUpperCase()).optional(),
  sourceDeal: z.string().max(30).nullable().optional(),
  paraformNbVersements: z.number().int().min(1).max(24).optional(),
  splitSalesPct: z.number().int().min(0).max(100).optional(),
  paymentTerms: z.string().max(50).nullable().optional(),
  // Raison de la perte quand le mandat est fermé sans placement (non persistée sur le mandat : va dans deals_perdus)
  raisonPerte: z.string().max(2000).optional(),
});

export const updateFeeSchema = z.object({
  feeMontantFacture: z.number().int().positive().optional(),
  feeStatut: z.enum(['NON_FACTURE', 'FACTURE', 'PAYE']).optional(),
});

export type CreateMandatInput = z.infer<typeof createMandatSchema>;
export type UpdateMandatInput = z.infer<typeof updateMandatSchema>;
export type UpdateFeeInput = z.infer<typeof updateFeeSchema>;
