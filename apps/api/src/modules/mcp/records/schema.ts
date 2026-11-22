import { Prisma } from '@prisma/client';
import { ENTITIES, getEntity } from './registry.js';
import { scalarFields } from './engine.js';
import { STAGE_LABEL_EN } from '../labels.js';
import { EVENT_TYPES } from '../../../lib/events.js';
import { LEAD_STAGES } from '../../leads/lead.service.js';
import { CANAUX, STATUTS } from '../../presentations/presentation.service.js';

/**
 * describe_schema : les entités, leurs champs (type, obligatoire, valeurs possibles, modifiable
 * ou non), leurs liens et les codes métier, tirés du schéma Prisma et du registre des outils
 * génériques, donc toujours à jour.
 */

const ENUMS = new Map(Prisma.dmmf.datamodel.enums.map((e) => [e.name, e.values.map((v) => v.name)]));
const MODELS = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
const SYSTEM = new Set(['id', 'createdAt', 'updatedAt']);

/** Champs texte à liste fermée (pas d'enum en base). */
const VALUE_HINTS: Record<string, Record<string, readonly string[]>> = {
  Lead: { stage: LEAD_STAGES, src: ['push', 'cold', 'call', 'csv'] },
  Presentation: { canal: CANAUX, statut: STATUTS, source: ['MANUEL', 'PIPELINE', 'LIST_PUSH', 'GMAIL', 'REPRISE'] },
  PostLinkedin: { statut: ['IDEE', 'A_VALIDER', 'VALIDE', 'PUBLIE'] },
  Candidat: { tier: ['A', 'B', 'C'] },
  Mandat: { natureContrat: ['CDI', 'CDD', 'INTERIM', 'FREELANCE'] },
  Ownership: { entiteType: ['ENTREPRISE', 'LEAD', 'CLIENT'] },
  Booking: { status: ['CONFIRMED', 'CANCELLED'] },
};

export const BUSINESS_CODES = {
  pipeline_stages: Object.entries(STAGE_LABEL_EN).map(([code, label]) => ({ code, label })),
  lead_stages: [...LEAD_STAGES],
  presentation_channels: [...CANAUX],
  presentation_statuses: [...STATUTS],
  opportunity_value: 'Lead value = nbPostes × packageMoyen × 22 % (valeurOpportunite, computed, read only)',
  event_types: EVENT_TYPES,
};

function typeOf(f: Prisma.DMMF.Field) {
  const base = f.kind === 'enum' ? 'enum' : f.type === 'DateTime' ? 'datetime (ISO 8601)' : f.type === 'Json' ? 'json' : f.type.toLowerCase();
  return f.isList ? `${base}[]` : base;
}

export function describeSchema(entity?: string) {
  if (!entity) {
    return {
      entities: ENTITIES.map((e) => ({
        name: e.name, description: e.description, read_only: !!e.readOnly,
        fields: scalarFields(e).length, includes: Object.keys(e.includes ?? {}),
      })),
      codes: BUSINESS_CODES,
      hint: 'Call describe_schema {"entity":"<name>"} for the fields of one entity.',
    };
  }
  const def = getEntity(entity);
  const model = MODELS.get(def.model)!;
  const hints = VALUE_HINTS[def.model] ?? {};
  const relations = model.fields.filter((f) => f.kind === 'object');
  // Liens par clé étrangère : le champ scalaire qui porte l'id de l'autre entité.
  const fkTarget = new Map<string, string>();
  for (const r of relations) for (const fk of r.relationFromFields ?? []) {
    const target = ENTITIES.find((x) => x.model === r.type);
    fkTarget.set(fk, target ? target.name : r.type === 'User' ? 'user' : r.type);
  }
  return {
    name: def.name,
    description: def.description,
    read_only: !!def.readOnly,
    fields: scalarFields(def).map((f) => {
      const values = f.kind === 'enum' ? ENUMS.get(f.type) : hints[f.name];
      const locked = def.lockedFields?.[f.name];
      return {
        name: f.name,
        type: typeOf(f),
        required: f.isRequired && !f.hasDefaultValue && !f.isUpdatedAt && !SYSTEM.has(f.name),
        ...(values ? { values: [...values] } : {}),
        ...(fkTarget.has(f.name) ? { links_to: fkTarget.get(f.name) } : {}),
        writable: !def.readOnly && !SYSTEM.has(f.name) && !f.isUpdatedAt && !locked,
        ...(locked ? { how_to_change: locked } : {}),
        ...(f.name === def.authorField ? { default: 'current user' } : {}),
      };
    }),
    computed: def.model === 'Lead' ? [{ name: 'valeurOpportunite', type: 'int', description: BUSINESS_CODES.opportunity_value }] : [],
    includes: Object.entries(def.includes ?? {}).map(([name, i]) => ({ name, description: i.description })),
    default_list_fields: def.listFields,
    search_fields: def.searchFields,
    ...(def.model === 'Candidature' ? { pipeline_stages: BUSINESS_CODES.pipeline_stages } : {}),
  };
}
