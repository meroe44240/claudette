import { z } from 'zod';

export const createClientSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  prenom: z.string().optional(),
  email: z.string().email('Email invalide').optional(),
  telephone: z.string().optional(),
  poste: z.string().optional(),
  roleContact: z
    .enum(['HIRING_MANAGER', 'DRH', 'PROCUREMENT', 'CEO', 'AUTRE'])
    .optional(),
  linkedinUrl: z.string().optional(),
  entrepriseId: z.string().uuid('entrepriseId doit etre un UUID valide'),
  statutClient: z
    .enum([
      'LEAD',
      'PREMIER_CONTACT',
      'BESOIN_QUALIFIE',
      'PROPOSITION_ENVOYEE',
      'MANDAT_SIGNE',
      'RECURRENT',
      'INACTIF',
    ])
    .default('LEAD')
    .optional(),
  notes: z.string().optional(),
  assignedToId: z.string().uuid().optional(),
  typeClient: z.enum(['INBOUND', 'OUTBOUND', 'RESEAU', 'CLIENT_ACTIF', 'RECURRENT']).optional(),
});

export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
