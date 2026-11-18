import type { StageCandidature } from '@prisma/client';

/** Libelles anglais des etapes, utilises dans toutes les reponses MCP (le MCP repond en anglais). */
export const STAGE_LABEL_EN: Record<StageCandidature, string> = {
  SOURCING: 'Sourcing',
  CONTACTE: 'Qualification',
  ENTRETIEN_1: 'Internal interview',
  ENVOYE_CLIENT: 'Sent to client',
  ENTRETIEN_CLIENT: 'Client interview',
  PROCESS: 'Process',
  OFFRE: 'Offer',
  PLACE: 'Won',
  REFUSE: 'Lost',
};

export const stageEn = (s: string | null | undefined) => (s && (STAGE_LABEL_EN as Record<string, string>)[s]) || s || '';

/** Liste lisible des etapes pour les descriptions d'outils : "SOURCING (Sourcing), CONTACTE (Qualification), ..." */
export const STAGES_DOC = Object.entries(STAGE_LABEL_EN).map(([k, v]) => `${k} (${v})`).join(', ');
