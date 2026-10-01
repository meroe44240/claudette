/**
 * Nature d'un meeting (Activite type MEETING), stockée dans metadata.calendarEventType.
 *
 *  - RDV_CLIENT   : rendez-vous commercial avec un client / prospect
 *  - PRESENTATION : candidat présenté au client (candidature en ENTRETIEN_CLIENT)
 *  - INTERVIEW    : entretien avec un candidat
 *  - AUTRE        : ni l'un ni l'autre (interne, suivi, perso…)
 *  - A_CLASSER    : détecté dans l'agenda mais pas identifié → question posée à la personne,
 *                   rien n'est annoncé ni compté tant qu'elle n'a pas répondu.
 *
 * Règle métier : un RDV client ou une présentation ne compte (Slack, standup) que
 * s'il a une date ET des interlocuteurs.
 */
export type MeetingKind = 'RDV_CLIENT' | 'PRESENTATION' | 'INTERVIEW' | 'AUTRE' | 'A_CLASSER';

export const MEETING_KINDS: MeetingKind[] = ['RDV_CLIENT', 'PRESENTATION', 'INTERVIEW', 'AUTRE', 'A_CLASSER'];

const PLACEHOLDER_ID = '00000000-0000-0000-0000-000000000000';
const INTERNAL_DOMAINS = ['humanup.io'];

interface MeetingLike {
  entiteType?: string | null;
  entiteId?: string | null;
  createdAt?: Date;
  metadata: unknown;
}

export function meetingKindOf(a: MeetingLike): MeetingKind {
  const raw = (a.metadata as any)?.calendarEventType;
  if (raw === 'AMBIGU') return 'A_CLASSER'; // ancien libellé
  if (MEETING_KINDS.includes(raw)) return raw;
  // Meetings antérieurs au typage : on déduit de l'entité liée.
  return a.entiteType === 'CLIENT' || a.entiteType === 'ENTREPRISE' ? 'RDV_CLIENT' : 'INTERVIEW';
}

export function meetingDate(a: MeetingLike): Date | null {
  const st = (a.metadata as any)?.startTime;
  if (!st) return null;
  const d = new Date(st);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function hasInterlocuteurs(a: MeetingLike): boolean {
  const meta = (a.metadata as any) ?? {};
  const saisis = meta.interlocuteurs;
  if (typeof saisis === 'string' && saisis.trim()) return true;
  if (Array.isArray(saisis) && saisis.length > 0) return true;
  if ((a.entiteType === 'CLIENT' || a.entiteType === 'ENTREPRISE') && a.entiteId && a.entiteId !== PLACEHOLDER_ID) return true;
  const attendees: unknown[] = Array.isArray(meta.attendees) ? meta.attendees : [];
  return attendees.some((att) => {
    const email = typeof att === 'string' ? att : (att as any)?.email;
    if (typeof att === 'object' && (att as any)?.role === 'internal') return false;
    const domain = typeof email === 'string' ? email.split('@')[1]?.toLowerCase() : undefined;
    return !!domain && !INTERNAL_DOMAINS.includes(domain);
  });
}

/** Un meeting ne compte comme RDV client que typé RDV_CLIENT, daté et avec interlocuteurs. */
export function compteCommeRdvClient(a: MeetingLike): boolean {
  return meetingKindOf(a) === 'RDV_CLIENT' && meetingDate(a) !== null && hasInterlocuteurs(a);
}

/** Jour auquel le RDV est compté : celui de sa validation s'il a été classé après coup, sinon sa création. */
export function dateComptage(a: MeetingLike): Date | null {
  const at = (a.metadata as any)?.classification?.at;
  if (at) {
    const d = new Date(at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return a.createdAt ?? null;
}

/** Marge de lecture pour retrouver les meetings classés plusieurs jours après leur détection. */
export const CLASSEMENT_LOOKBACK_MS = 21 * 86400000;
