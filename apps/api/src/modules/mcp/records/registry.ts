import * as candidatService from '../../candidats/candidat.service.js';
import * as clientService from '../../clients/client.service.js';
import * as entrepriseService from '../../entreprises/entreprise.service.js';
import * as mandatService from '../../mandats/mandat.service.js';
import * as leadService from '../../leads/lead.service.js';
import * as candidatureService from '../../candidatures/candidature.service.js';
import * as activiteService from '../../activites/activite.service.js';
import * as jobOfferService from '../../job-offers/job-offer.service.js';
import { opportunityValue } from '../../leads/lead.service.js';

/**
 * Entités exposées aux outils génériques (list_records, get_record, create_record…).
 * Le nom public est en anglais ; les champs gardent leur nom Prisma (français), listés
 * dans chaque erreur de champ inconnu.
 */
export interface IncludeDef {
  /** Relation Prisma, ou « activities » : activités rattachées par entiteType / entiteId. */
  relation: string;
  description: string;
  orderBy?: Record<string, 'asc' | 'desc'>;
  select?: Record<string, unknown>;
}

export interface EntityDef {
  name: string;
  model: string;
  description: string;
  /** Champs parcourus par le paramètre q (texte libre). */
  searchFields: string[];
  /** Champs renvoyés par défaut dans les listes (fields absent). */
  listFields: string[];
  includes?: Record<string, IncludeDef>;
  /** Champs qu'on ne modifie pas par les outils génériques, avec l'outil à utiliser. */
  lockedFields?: Record<string, string>;
  /** Champ auteur rempli avec l'utilisateur courant à la création s'il est absent. */
  authorField?: string;
  /** Lecture seule : ni création, ni modification, ni suppression génériques. */
  readOnly?: boolean;
  /** Suppression par le service métier (qui nettoie les données liées), sinon suppression directe. */
  remove?: (id: string) => Promise<unknown>;
  /** EntiteType des activités rattachées (notes, appels, emails, tâches). */
  activityType?: 'CANDIDAT' | 'CLIENT' | 'ENTREPRISE' | 'MANDAT';
  /** Champs calculés ajoutés à chaque ligne renvoyée. */
  computed?: (row: Record<string, any>) => Record<string, unknown>;
}

const activities: IncludeDef = { relation: 'activities', description: 'last 50 notes, calls, emails, meetings and tasks' };

export const ENTITIES: EntityDef[] = [
  {
    name: 'candidate', model: 'Candidat', description: 'Candidates (talent pool)',
    searchFields: ['nom', 'prenom', 'email', 'telephone', 'posteActuel', 'entrepriseActuelle', 'localisation'],
    listFields: ['id', 'prenom', 'nom', 'email', 'telephone', 'posteActuel', 'entrepriseActuelle', 'localisation', 'tier', 'aPlayer', 'tags', 'source', 'assignedToId', 'createdAt', 'updatedAt'],
    includes: {
      experiences: { relation: 'experiences', description: 'work experiences', orderBy: { anneeDebut: 'desc' } },
      applications: { relation: 'candidatures', description: 'applications to mandates, with the mandate title and stage', select: { id: true, stage: true, mandatId: true, updatedAt: true, mandat: { select: { titrePoste: true, entreprise: { select: { nom: true } } } } } },
      presentations: { relation: 'presentations', description: 'companies the candidate was presented to', orderBy: { presentedAt: 'desc' } },
      activities,
    },
    authorField: 'createdById', activityType: 'CANDIDAT',
    remove: (id) => candidatService.remove(id),
  },
  {
    name: 'company', model: 'Entreprise', description: 'Companies (clients and prospects)',
    searchFields: ['nom', 'secteur', 'domaine', 'localisation', 'siren'],
    listFields: ['id', 'nom', 'secteur', 'taille', 'localisation', 'siteWeb', 'domaine', 'siren', 'ownerId', 'createdAt', 'updatedAt'],
    includes: {
      contacts: { relation: 'clients', description: 'client contacts', select: { id: true, prenom: true, nom: true, poste: true, email: true, telephone: true, statutClient: true } },
      mandates: { relation: 'mandats', description: 'mandates', select: { id: true, titrePoste: true, statut: true, dateOuverture: true } },
      target_profiles: { relation: 'profilsRecherches', description: 'target profiles' },
      presentations: { relation: 'presentations', description: 'candidates presented to this company', orderBy: { presentedAt: 'desc' } },
      activities,
    },
    lockedFields: { ownerId: 'Use claim_owner / release_owner (they keep the ownership period and reason).' },
    authorField: 'createdById', activityType: 'ENTREPRISE',
    remove: (id) => entrepriseService.remove(id),
  },
  {
    name: 'client', model: 'Client', description: 'Client contacts (people at companies)',
    searchFields: ['nom', 'prenom', 'email', 'telephone', 'poste'],
    listFields: ['id', 'prenom', 'nom', 'email', 'telephone', 'poste', 'roleContact', 'entrepriseId', 'statutClient', 'typeClient', 'assignedToId', 'createdAt', 'updatedAt'],
    includes: {
      company: { relation: 'entreprise', description: 'the company', select: { id: true, nom: true, secteur: true } },
      mandates: { relation: 'mandats', description: 'mandates', select: { id: true, titrePoste: true, statut: true } },
      activities,
    },
    authorField: 'createdById', activityType: 'CLIENT',
    remove: (id) => clientService.remove(id),
  },
  {
    name: 'mandate', model: 'Mandat', description: 'Mandates (open positions to fill)',
    searchFields: ['titrePoste', 'localisation', 'description'],
    listFields: ['id', 'titrePoste', 'entrepriseId', 'clientId', 'statut', 'priorite', 'localisation', 'salaireMin', 'salaireMax', 'feePourcentage', 'feeMontantEstime', 'assignedToId', 'recruteurId', 'salesId', 'sourceurId', 'dateOuverture', 'createdAt', 'updatedAt'],
    includes: {
      company: { relation: 'entreprise', description: 'the company', select: { id: true, nom: true } },
      client: { relation: 'client', description: 'the client contact', select: { id: true, prenom: true, nom: true, email: true } },
      applications: { relation: 'candidatures', description: 'applications with candidate name and stage', select: { id: true, stage: true, candidatId: true, updatedAt: true, candidat: { select: { prenom: true, nom: true } } } },
      target_profiles: { relation: 'profilsRecherches', description: 'target profiles' },
      activities,
    },
    lockedFields: {
      statut: 'Use update_mandate: it checks that a candidate is placed before Won.',
      feeMontantEstime: 'Use update_mandate: the estimated fee is recalculated from the salary.',
    },
    authorField: 'createdById', activityType: 'MANDAT',
    remove: (id) => mandatService.remove(id),
  },
  {
    name: 'lead', model: 'Lead', description: 'Sales leads (prospection pipeline)',
    searchFields: ['company', 'contact', 'email', 'phone', 'city', 'sector', 'role'],
    listFields: ['id', 'company', 'contact', 'role', 'email', 'phone', 'city', 'sector', 'stage', 'src', 'source', 'ownerId', 'entrepriseId', 'nbPostes', 'packageMoyen', 'lastContactAt', 'createdAt', 'updatedAt'],
    includes: { interactions: { relation: 'interactions', description: 'calls, emails, notes', orderBy: { createdAt: 'desc' } } },
    lockedFields: { stage: 'Use move_lead_stage, lose_lead or convert_lead.', ownerId: 'Use claim_owner / release_owner (they keep the ownership period and reason).' },
    computed: (r) => ('nbPostes' in r || 'packageMoyen' in r ? { valeurOpportunite: opportunityValue(r) } : {}),
    remove: (id) => leadService.removeLead(id),
  },
  {
    name: 'application', model: 'Candidature', description: 'Applications: a candidate in a mandate pipeline',
    searchFields: ['notes', 'interlocuteurClient'],
    listFields: ['id', 'candidatId', 'mandatId', 'stage', 'datePresentation', 'dateEntretienClient', 'motifRefus', 'interetConfirme', 'createdAt', 'updatedAt'],
    includes: {
      candidate: { relation: 'candidat', description: 'the candidate', select: { id: true, prenom: true, nom: true, email: true } },
      mandate: { relation: 'mandat', description: 'the mandate', select: { id: true, titrePoste: true, entrepriseId: true } },
      stage_history: { relation: 'stageHistory', description: 'stage changes', orderBy: { changedAt: 'desc' } },
    },
    lockedFields: { stage: 'Use move_candidate_stage or bulk_move_candidate_stage (they record the history and check required fields).' },
    authorField: 'createdById',
    remove: (id) => candidatureService.remove(id),
  },
  {
    name: 'activity', model: 'Activite', description: 'Notes, calls, emails, meetings and tasks (isTache=true) linked to a record by entiteType + entiteId',
    searchFields: ['titre', 'contenu'],
    listFields: ['id', 'type', 'entiteType', 'entiteId', 'userId', 'titre', 'isTache', 'tacheCompleted', 'tacheDueDate', 'source', 'createdAt'],
    includes: { files: { relation: 'fichiers', description: 'attached files' } },
    authorField: 'userId',
    remove: (id) => activiteService.remove(id),
  },
  {
    name: 'presentation', model: 'Presentation', description: 'Candidates presented to companies (prefer create_presentation / update_presentation)',
    searchFields: ['note'], listFields: ['id', 'candidatId', 'entrepriseId', 'clientId', 'mandatId', 'candidatureId', 'leadId', 'canal', 'statut', 'accordCandidat', 'anonyme', 'cvUrl', 'source', 'presentedById', 'presentedAt'],
    authorField: 'presentedById',
  },
  {
    name: 'ownership', model: 'Ownership', description: 'Ownership periods of companies, leads and clients (read only, use claim_owner / release_owner)', readOnly: true,
    searchFields: ['motif'], listFields: ['id', 'entiteType', 'entiteId', 'ownerId', 'motif', 'claimedAt', 'expiresAt', 'releasedAt', 'releaseMotif'],
  },
  {
    name: 'lead_interaction', model: 'LeadInteraction', description: 'Interactions logged on a lead',
    searchFields: ['text'], listFields: ['id', 'leadId', 'type', 'text', 'createdById', 'createdAt'], authorField: 'createdById',
  },
  {
    name: 'job_offer', model: 'JobOffer', description: 'Job board offers',
    searchFields: ['titre', 'description', 'localisation', 'entrepriseNom'],
    listFields: ['id', 'slug', 'titre', 'localisation', 'contractType', 'remote', 'salaireMin', 'salaireMax', 'published', 'mandatId', 'createdAt', 'updatedAt'],
    authorField: 'createdById',
    remove: (id) => jobOfferService.remove(id),
  },
  {
    name: 'target_profile', model: 'ProfilRecherche', description: 'Target profiles a company is looking for (prefer upsert_target_profile)',
    searchFields: ['intituleType', 'intituleCle', 'ville'], listFields: ['id', 'entrepriseId', 'fonction', 'intituleType', 'seniorite', 'ville', 'pays', 'salaireMin', 'salaireMax', 'mandatLieId', 'updatedAt'],
  },
  {
    name: 'candidate_experience', model: 'CandidatExperience', description: 'Work experiences of a candidate',
    searchFields: ['titre', 'entreprise'], listFields: ['id', 'candidatId', 'titre', 'entreprise', 'anneeDebut', 'anneeFin', 'highlights'],
  },
  {
    name: 'activity_file', model: 'FichierActivite', description: 'Files attached to an activity',
    searchFields: ['nom'], listFields: ['id', 'activiteId', 'nom', 'url', 'mimeType', 'taille', 'createdAt'],
  },
  {
    name: 'stage_history', model: 'StageHistory', description: 'Stage changes of applications (read only)', readOnly: true,
    searchFields: [], listFields: ['id', 'candidatureId', 'fromStage', 'toStage', 'changedById', 'changedAt'],
  },
  {
    name: 'call_note', model: 'NoteCall', description: 'Meeting notes from the note-taker (Humanup Notes)', readOnly: true,
    searchFields: ['titre'], listFields: ['id', 'titre', 'userId', 'startAt', 'endAt', 'createdAt'],
  },
  {
    name: 'linkedin_post', model: 'PostLinkedin', description: 'LinkedIn editorial calendar posts (statut: IDEE, A_VALIDER, VALIDE, PUBLIE)',
    searchFields: ['texte'], listFields: ['id', 'auteurId', 'datePost', 'statut', 'texte', 'imageUrl', 'updatedAt'],
    includes: { comments: { relation: 'commentaires', description: 'discussion', orderBy: { createdAt: 'asc' } } },
    authorField: 'auteurId',
  },
  {
    name: 'linkedin_post_comment', model: 'PostLinkedinComment', description: 'Comments on LinkedIn posts',
    searchFields: ['texte'], listFields: ['id', 'postId', 'auteurId', 'texte', 'createdAt'], authorField: 'auteurId',
  },
  {
    name: 'booking', model: 'Booking', description: 'Meetings booked through booking links',
    searchFields: ['inviteeName', 'inviteeEmail'], listFields: ['id', 'userId', 'slotStart', 'slotEnd', 'inviteeName', 'inviteeEmail', 'status', 'candidatId'],
  },
  {
    name: 'market_list', model: 'MarketList', description: 'Market lists (List Push reverse sourcing)',
    searchFields: ['name'], listFields: ['id', 'name', 'sectorTags', 'zones', 'candidatId', 'createdById', 'updatedAt'],
    includes: { establishments: { relation: 'establishments', description: 'establishments of the list', orderBy: { frequency: 'desc' } } },
    authorField: 'createdById',
  },
  {
    name: 'market_list_establishment', model: 'MarketListEstablishment', description: 'Establishments in a market list (status NEW, EXCLUDED, PROSPECTION, CLIENT_EXISTING)',
    searchFields: ['name', 'city', 'sector'], listFields: ['id', 'marketListId', 'name', 'city', 'sector', 'effectif', 'frequency', 'status', 'entrepriseId'],
  },
  {
    name: 'question_template', model: 'QuestionTemplate', description: 'Qualification question templates (trames)',
    searchFields: ['name', 'category'], listFields: ['id', 'name', 'category', 'isSystem', 'updatedAt'], authorField: 'createdById',
  },
  {
    name: 'contract_approval', model: 'ContractApproval', description: 'Contract free-clause approvals (read only, use review_contract_approval)', readOnly: true,
    searchFields: ['reason'], listFields: ['id', 'mandatId', 'requestedById', 'feeRequested', 'status', 'approvedById', 'createdAt'],
  },
  {
    name: 'portal_comment', model: 'PortalComment', description: 'Comments left in the client portal (read only)', readOnly: true,
    searchFields: ['content'], listFields: ['id', 'candidatureId', 'mandatId', 'portalAccessId', 'content', 'createdAt'],
  },
];

const byName = new Map<string, EntityDef>();
for (const e of ENTITIES) {
  byName.set(e.name, e);
  byName.set(e.model.toLowerCase(), e);
}
// Alias courants (pluriels, noms français).
const ALIASES: Record<string, string> = {
  candidates: 'candidate', candidat: 'candidate', candidats: 'candidate', companies: 'company', entreprise: 'company', entreprises: 'company',
  clients: 'client', contact: 'client', contacts: 'client', mandates: 'mandate', mandat: 'mandate', mandats: 'mandate', leads: 'lead',
  applications: 'application', candidature: 'application', candidatures: 'application', activities: 'activity', activite: 'activity',
  task: 'activity', tasks: 'activity', note: 'activity', notes: 'activity', job_offers: 'job_offer', joboffer: 'job_offer', offer: 'job_offer',
  target_profiles: 'target_profile', profilrecherche: 'target_profile', experience: 'candidate_experience', experiences: 'candidate_experience',
};

export function getEntity(name: string): EntityDef {
  const key = String(name ?? '').trim().toLowerCase();
  const e = byName.get(key) ?? byName.get(ALIASES[key] ?? '');
  if (!e) {
    throw new RecordError(`Unknown entity "${name}". Available: ${ENTITIES.map((x) => x.name).join(', ')}.`);
  }
  return e;
}

export class RecordError extends Error {
  constructor(message: string, public details?: Record<string, unknown>) { super(message); }
}
