import { t, LOCALE } from '../../lib/i18n';

export type CallType = 'QUALIF' | 'INTAKE' | 'PROSPECT' | 'INTERNE';
export type QStatus = 'todo' | 'partial' | 'covered';

export interface NoteQuestion {
  id: string;
  text: string;
  dealbreaker: boolean;
  status: QStatus;
  answer: string | null;
  manual: boolean;
}

export interface Attendee { email: string; name?: string | null; role: string; entityId?: string | null }
export interface PropiumLink { kind: string; id: string; label: string; action: 'created' | 'updated'; url: string }
export interface LiveAlert { id: string; kind: 'RELANCE' | 'CONTRADICTION'; questionId?: string | null; text: string; at: string }

export const CALL_TYPES: CallType[] = ['QUALIF', 'INTAKE', 'PROSPECT', 'INTERNE'];

export const typeLabel = (c: string) =>
  ({ QUALIF: t('Qualif candidat'), INTAKE: t('Intake client'), PROSPECT: t('Prospect'), INTERNE: t('Réunion interne') } as Record<string, string>)[c] ?? c;

export const typeColor: Record<string, string> = {
  QUALIF: 'bg-[#EAE8F7] text-[#22177A]',
  INTAKE: 'bg-[#E3F1EA] text-[#1F6B45]',
  PROSPECT: 'bg-[#FBEFD9] text-[#8A5A0B]',
  INTERNE: 'bg-neutral-100 text-neutral-600',
};

export const statusLabel = (s: string, excluded?: boolean) => {
  if (excluded && s === 'SCHEDULED') return t('Sans bot');
  return ({
    SCHEDULED: t('Programmé'), JOINING: t('Le bot rejoint'), IN_CALL: t('En cours'), PROCESSING: t('Notes en cours'),
    DONE: t('Notes envoyées'), FAILED: t('Sans notes'), CANCELLED: t('Annulé'),
  } as Record<string, string>)[s] ?? s;
};

export const fmtDay = (d: string) => new Date(d).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtTime = (d: string) => new Date(d).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
