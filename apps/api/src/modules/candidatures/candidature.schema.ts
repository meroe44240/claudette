import { z } from 'zod';

export const createCandidatureSchema = z.object({
  mandatId: z.string().uuid('mandatId doit etre un UUID valide'),
  candidatId: z.string().uuid('candidatId doit etre un UUID valide'),
  stage: z
    .enum(['SOURCING', 'CONTACTE', 'ENTRETIEN_1', 'ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE', 'REFUSE'])
    .default('SOURCING'),
  notes: z.string().optional(),
});

export const updateCandidatureSchema = z.object({
  stage: z
    .enum(['SOURCING', 'CONTACTE', 'ENTRETIEN_1', 'ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE', 'REFUSE'])
    .optional(),
  notes: z.string().optional(),
  motifRefus: z
    .enum(['SALAIRE', 'PROFIL_PAS_ALIGNE', 'CANDIDAT_DECLINE', 'CLIENT_REFUSE', 'TIMING', 'POSTE_POURVU', 'AUTRE'])
    .optional(),
  motifRefusDetail: z.string().optional(),
  datePresentation: z.string().datetime().optional(),
  dateEntretienClient: z.string().datetime().optional(),
  dateDemarrage: z.string().datetime().optional(),
  feeMontantFacture: z.number().int().nonnegative().optional(),
  sourcePlacement: z.string().max(255).optional(),
  sourceLead: z.string().max(255).optional(),
});

export type CreateCandidatureInput = z.infer<typeof createCandidatureSchema>;
export type UpdateCandidatureInput = z.infer<typeof updateCandidatureSchema>;
