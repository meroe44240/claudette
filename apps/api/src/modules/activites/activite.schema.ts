import { z } from 'zod';

export const createActiviteSchema = z.object({
  type: z.enum(['APPEL', 'EMAIL', 'MEETING', 'NOTE', 'TACHE', 'TRANSCRIPT']),
  direction: z.enum(['ENTRANT', 'SORTANT']).optional(),
  entiteType: z.enum(['CANDIDAT', 'CLIENT', 'ENTREPRISE', 'MANDAT']),
  entiteId: z.string().uuid(),
  titre: z.string().optional(),
  contenu: z.string().optional(),
  metadata: z.any().optional(),
  source: z
    .enum(['MANUEL', 'ALLO', 'GMAIL', 'CALENDAR', 'GOOGLE_DOCS', 'AGENT_IA', 'SYSTEME'])
    .default('MANUEL'),
  bookmarked: z.boolean().optional(),
  isTache: z.boolean().optional(),
  tacheDueDate: z.string().datetime().optional(),
});

export const updateActiviteSchema = z.object({
  titre: z.string().optional(),
  contenu: z.string().optional(),
  bookmarked: z.boolean().optional(),
  tacheCompleted: z.boolean().optional(),
  tacheDueDate: z.string().datetime().optional(),
});

export type CreateActiviteInput = z.infer<typeof createActiviteSchema>;
export type UpdateActiviteInput = z.infer<typeof updateActiviteSchema>;
