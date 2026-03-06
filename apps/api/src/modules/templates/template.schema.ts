import { z } from 'zod';

export const createTemplateSchema = z.object({
  nom: z.string().min(1, 'Le nom est requis'),
  type: z.enum([
    'EMAIL_PRISE_CONTACT',
    'EMAIL_RELANCE',
    'EMAIL_PRESENTATION_CLIENT',
    'NOTE_BRIEF_POSTE',
    'NOTE_COMPTE_RENDU',
    'AUTRE',
  ]),
  sujet: z.string().optional(),
  contenu: z.string().default(''),
  variables: z.array(z.string()).optional(),
  isGlobal: z.boolean().default(false),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const renderTemplateSchema = z.object({
  candidatId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  mandatId: z.string().uuid().optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
export type RenderTemplateInput = z.infer<typeof renderTemplateSchema>;
