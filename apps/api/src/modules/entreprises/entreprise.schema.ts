import { z } from 'zod';

export const createEntrepriseSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  secteur: z.string().optional(),
  siteWeb: z.string().optional(),
  taille: z.enum(['STARTUP', 'PME', 'ETI', 'GRAND_GROUPE']).optional(),
  localisation: z.string().optional(),
  linkedinUrl: z.string().optional(),
  logoUrl: z.string().optional(),
  notes: z.string().optional(),
  // Pappers (données légales françaises)
  siren: z.string().max(9).optional(),
  siret: z.string().max(14).optional(),
  formeJuridique: z.string().optional(),
  capitalSocial: z.number().optional(),
  chiffreAffaires: z.number().optional(),
  effectif: z.string().optional(),
  dateCreation: z.string().optional(),
  codeNAF: z.string().optional(),
  libelleNAF: z.string().optional(),
  adresseComplete: z.string().optional(),
  pappersUrl: z.string().optional(),
});

export const updateEntrepriseSchema = createEntrepriseSchema.partial();

export type CreateEntrepriseInput = z.infer<typeof createEntrepriseSchema>;
export type UpdateEntrepriseInput = z.infer<typeof updateEntrepriseSchema>;
