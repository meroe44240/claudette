import { z } from 'zod';

export const createEntrepriseSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  secteur: z.string().optional(),
  siteWeb: z.string().optional(),
  taille: z.enum(['STARTUP', 'PME', 'ETI', 'GRAND_GROUPE']).optional(),
  localisation: z.string().optional(),
  linkedinUrl: z.string().optional(),
  notes: z.string().optional(),
});

export const updateEntrepriseSchema = createEntrepriseSchema.partial();

export type CreateEntrepriseInput = z.infer<typeof createEntrepriseSchema>;
export type UpdateEntrepriseInput = z.infer<typeof updateEntrepriseSchema>;
