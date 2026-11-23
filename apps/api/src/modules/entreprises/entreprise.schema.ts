import { z } from 'zod';
import { isPlaceholder, isLinkedinCompanyOrEmpty } from '../../lib/data-quality.js';

export const createEntrepriseSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis').refine((v) => !isPlaceholder(v), 'Le nom ne peut pas être un texte de remplissage (test, N/A, inconnu…)'),
  secteur: z.string().optional(),
  siteWeb: z.string().optional(),
  taille: z.enum(['STARTUP', 'PME', 'ETI', 'GRAND_GROUPE']).optional(),
  localisation: z.string().optional(),
  linkedinUrl: z.string().refine(isLinkedinCompanyOrEmpty, 'Lien LinkedIn invalide (attendu : https://www.linkedin.com/company/…)').optional(),
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
