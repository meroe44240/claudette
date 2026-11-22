import { stageEn } from '../modules/mcp/labels.js';

/**
 * Événements métier, déduits du journal d'audit : une écriture journalisée (création ou
 * modification) donne zéro, un ou plusieurs événements. get_events lit le journal, les
 * webhooks reçoivent les mêmes événements au moment de l'écriture.
 */

export const EVENT_TYPES = {
  'mandate.created': 'A mandate was created',
  'mandate.closed': 'A mandate was closed (won, lost, cancelled or closed)',
  'candidate.created': 'A candidate was created',
  'candidate.tag_added': 'A tag (or the A-Player flag) was added to a candidate',
  'candidate.tag_removed': 'A tag (or the A-Player flag) was removed from a candidate',
  'stage.changed': 'An application moved to another pipeline stage, or a lead to another prospecting stage',
  'lead.created': 'A lead was created',
  'meeting.created': 'A meeting was created (booking link, calendar meeting logged in Propium)',
  'presentation.created': 'A candidate was presented to a company',
  'company.created': 'A company was created',
  'owner.changed': 'The owner of a company, lead or client contact changed',
  'document.added': 'A document was added (CV, attachment)',
} as const;
export type EventType = keyof typeof EVENT_TYPES;

const CLOSED = new Set(['GAGNE', 'PERDU', 'ANNULE', 'CLOTURE']);

/** Nom public (anglais) de l'entité, comme dans les outils génériques. */
const ENTITY: Record<string, string> = {
  MANDAT: 'mandate', CANDIDAT: 'candidate', CANDIDATURE: 'application', LEAD: 'lead', BOOKING: 'booking',
  ACTIVITE: 'activity', PRESENTATION: 'presentation', ENTREPRISE: 'company', CLIENT: 'client',
  DOCUMENT: 'document', FICHIERACTIVITE: 'activity_file',
};

/** Les entités et actions qui peuvent produire un événement (filtre SQL de get_events). */
export const EVENT_SOURCES: Array<{ action: 'CREATE' | 'UPDATE'; entityType: string }> = [
  { action: 'CREATE', entityType: 'MANDAT' }, { action: 'UPDATE', entityType: 'MANDAT' },
  { action: 'CREATE', entityType: 'CANDIDAT' }, { action: 'UPDATE', entityType: 'CANDIDAT' },
  { action: 'CREATE', entityType: 'CANDIDATURE' }, { action: 'UPDATE', entityType: 'CANDIDATURE' },
  { action: 'CREATE', entityType: 'LEAD' }, { action: 'UPDATE', entityType: 'LEAD' },
  { action: 'CREATE', entityType: 'BOOKING' }, { action: 'CREATE', entityType: 'ACTIVITE' },
  { action: 'CREATE', entityType: 'PRESENTATION' },
  { action: 'CREATE', entityType: 'ENTREPRISE' }, { action: 'UPDATE', entityType: 'ENTREPRISE' },
  { action: 'UPDATE', entityType: 'CLIENT' },
  { action: 'CREATE', entityType: 'DOCUMENT' }, { action: 'CREATE', entityType: 'FICHIERACTIVITE' },
];

export interface AuditLike {
  id?: string;
  action: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  changes?: unknown;
  metadata?: unknown;
  after?: unknown;
  createdAt?: Date;
}

export interface EventOut {
  type: EventType;
  entity: { type: string; id: string | null; label: string | null };
  details?: Record<string, unknown>;
}

type Change = { old: unknown; new: unknown };

export function eventsFromAudit(a: AuditLike): EventOut[] {
  const t = a.entityType.toUpperCase();
  const changes = (a.changes ?? {}) as Record<string, Change>;
  const after = (a.after ?? {}) as Record<string, any>;
  const meta = (a.metadata ?? {}) as Record<string, any>;
  const entity = { type: ENTITY[t] ?? t.toLowerCase(), id: a.entityId, label: a.entityLabel };
  const out: EventOut[] = [];
  const push = (type: EventType, details?: Record<string, unknown>, ent = entity) => out.push({ type, entity: ent, ...(details ? { details } : {}) });

  if (a.action === 'CREATE') {
    if (meta.bulk) return out; // insertion en masse sans ids : pas d'événement par ligne
    switch (t) {
      case 'MANDAT': push('mandate.created', { company_id: after.entrepriseId ?? null }); break;
      case 'CANDIDAT':
        push('candidate.created');
        for (const tag of (after.tags as string[] | undefined) ?? []) push('candidate.tag_added', { tag });
        if (after.aPlayer) push('candidate.tag_added', { tag: 'A-Player' });
        break;
      case 'CANDIDATURE':
        push('stage.changed', { from: null, to: after.stage ?? null, to_label: after.stage ? stageEn(after.stage) : null, candidate_id: after.candidatId, mandate_id: after.mandatId });
        break;
      case 'LEAD': push('lead.created', { company: after.company ?? null, owner_id: after.ownerId ?? null }); break;
      case 'BOOKING': push('meeting.created', { starts_at: after.slotStart ?? null, invitee: after.inviteeName ?? null, candidate_id: after.candidatId ?? null }); break;
      case 'ACTIVITE':
        if (after.type === 'MEETING') push('meeting.created', { title: after.titre ?? null, linked_to: after.entiteType ? { type: String(after.entiteType).toLowerCase(), id: after.entiteId } : null });
        break;
      case 'PRESENTATION':
        push('presentation.created', { candidate_id: after.candidatId, company_id: after.entrepriseId, channel: after.canal, status: after.statut, source: after.source });
        break;
      case 'ENTREPRISE': push('company.created'); break;
      case 'DOCUMENT': push('document.added', { kind: 'attachment', url: meta.url ?? null, filename: meta.filename ?? a.entityLabel, attached_to: meta.entity_type ? { type: meta.entity_type, id: meta.entity_id } : null }); break;
      case 'FICHIERACTIVITE': push('document.added', { kind: 'activity_file', url: after.url ?? null, filename: after.nom ?? null, activity_id: after.activiteId ?? null }); break;
    }
    return out;
  }

  if (a.action === 'UPDATE') {
    switch (t) {
      case 'MANDAT':
        if (changes.statut && CLOSED.has(String(changes.statut.new)) && !CLOSED.has(String(changes.statut.old))) push('mandate.closed', { status: changes.statut.new });
        break;
      case 'CANDIDAT': {
        if (changes.tags) {
          const before = new Set((changes.tags.old as string[] | null) ?? []);
          const now = new Set((changes.tags.new as string[] | null) ?? []);
          for (const tag of now) if (!before.has(tag)) push('candidate.tag_added', { tag });
          for (const tag of before) if (!now.has(tag)) push('candidate.tag_removed', { tag });
        }
        if (changes.aPlayer) push(changes.aPlayer.new ? 'candidate.tag_added' : 'candidate.tag_removed', { tag: 'A-Player' });
        if (changes.cvUrl && changes.cvUrl.new) push('document.added', { kind: 'cv', url: changes.cvUrl.new, attached_to: { type: 'candidate', id: a.entityId } });
        break;
      }
      case 'CANDIDATURE':
        if (changes.stage) {
          push('stage.changed', {
            from: changes.stage.old, to: changes.stage.new,
            from_label: changes.stage.old ? stageEn(String(changes.stage.old)) : null, to_label: stageEn(String(changes.stage.new)),
            candidate_id: after.candidatId ?? null, mandate_id: after.mandatId ?? null,
          });
        }
        break;
      case 'LEAD':
        if (changes.stage) push('stage.changed', { from: changes.stage.old, to: changes.stage.new });
        if (changes.ownerId) push('owner.changed', { from: changes.ownerId.old, to: changes.ownerId.new });
        break;
      case 'ENTREPRISE':
        if (changes.ownerId) push('owner.changed', { from: changes.ownerId.old, to: changes.ownerId.new });
        break;
      case 'CLIENT':
        if (changes.assignedToId) push('owner.changed', { from: changes.assignedToId.old, to: changes.assignedToId.new });
        break;
    }
  }
  return out;
}
