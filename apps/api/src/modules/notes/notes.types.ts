export type CallType = 'QUALIF' | 'INTAKE' | 'PROSPECT' | 'INTERNE';
export const CALL_TYPES: CallType[] = ['QUALIF', 'INTAKE', 'PROSPECT', 'INTERNE'];

export const CALL_TYPE_LABEL: Record<CallType, string> = {
  QUALIF: 'Qualif candidat',
  INTAKE: 'Intake client',
  PROSPECT: 'Prospect',
  INTERNE: 'Réunion interne',
};

export type QuestionStatus = 'todo' | 'partial' | 'covered';

export interface NoteQuestion {
  id: string;
  text: string;
  dealbreaker: boolean;
  status: QuestionStatus;
  answer: string | null;
  /** Le membre a coché ou décoché à la main : son choix prime sur l'IA. */
  manual: boolean;
  /** Identifiant de la question dans la trame du mandat, pour remplir la trame après le call. */
  trameId?: string | null;
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
  /** Secondes depuis le début de l'enregistrement. */
  t: number;
}

export interface Attendee {
  email: string;
  name?: string | null;
  role: 'internal' | 'candidat' | 'client' | 'lead' | 'external';
  entityId?: string | null;
  self?: boolean;
  organizer?: boolean;
}

export interface LiveAlert {
  id: string;
  kind: 'RELANCE' | 'CONTRADICTION';
  questionId?: string | null;
  text: string;
  at: string;
}

export interface PropiumLink {
  kind: 'CANDIDAT' | 'CLIENT' | 'MANDAT' | 'LEAD' | 'TACHE';
  id: string;
  label: string;
  action: 'created' | 'updated';
  url: string;
}

/** Durée cible du call en minutes (minuteur du panneau). */
export function targetMinutes(type: CallType, startAt: Date, endAt: Date): number {
  if (type === 'QUALIF') return 15;
  const mins = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
  return mins > 0 ? mins : 30;
}

export function appUrl(): string {
  return (process.env.APP_URL || 'https://ats.propium.co').replace(/\/$/, '');
}

/** IA disponible pour Notes : Claude de préférence, sinon le fournisseur configuré dans l'ATS. */
export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY);
}
