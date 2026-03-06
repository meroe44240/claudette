export type Role = 'ADMIN' | 'RECRUTEUR';

export type TailleEntreprise = 'STARTUP' | 'PME' | 'ETI' | 'GRAND_GROUPE';

export type RoleContact = 'HIRING_MANAGER' | 'DRH' | 'PROCUREMENT' | 'CEO' | 'AUTRE';

export type StatutClient = 'LEAD' | 'PREMIER_CONTACT' | 'BESOIN_QUALIFIE' | 'PROPOSITION_ENVOYEE' | 'MANDAT_SIGNE' | 'RECURRENT' | 'INACTIF';

export type StageCandidature = 'SOURCING' | 'CONTACTE' | 'ENTRETIEN_1' | 'ENTRETIEN_CLIENT' | 'OFFRE' | 'PLACE' | 'REFUSE';

export type StatutMandat = 'OUVERT' | 'EN_COURS' | 'GAGNE' | 'PERDU' | 'ANNULE' | 'CLOTURE';

export type Priorite = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE';

export type FeeStatut = 'NON_FACTURE' | 'FACTURE' | 'PAYE';

export type MotifRefus = 'SALAIRE' | 'PROFIL_PAS_ALIGNE' | 'CANDIDAT_DECLINE' | 'CLIENT_REFUSE' | 'TIMING' | 'POSTE_POURVU' | 'AUTRE';

export type TypeActivite = 'APPEL' | 'EMAIL' | 'MEETING' | 'NOTE' | 'TACHE' | 'TRANSCRIPT';

export type Direction = 'ENTRANT' | 'SORTANT';

export type EntiteType = 'CANDIDAT' | 'CLIENT' | 'ENTREPRISE' | 'MANDAT';

export type SourceActivite = 'MANUEL' | 'ALLO' | 'GMAIL' | 'CALENDAR' | 'GOOGLE_DOCS' | 'AGENT_IA' | 'SYSTEME';

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}
