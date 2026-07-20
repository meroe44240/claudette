/**
 * Types du payload recap bi-hebdo.
 *
 * Deux sections seulement :
 *  1. Etat par mandat  — combien de candidats a quel stade + prez a venir.
 *  2. Activite par personne.
 *
 * Rendu et data sont decouples.
 */

export type Fonction = 'SALES' | 'RECRUTEUR' | 'LES_DEUX';
export type Stage =
  | 'SOURCING'
  | 'CONTACTE'
  | 'ENTRETIEN_1'
  | 'ENVOYE_CLIENT'
  | 'ENTRETIEN_CLIENT'
  | 'OFFRE'
  | 'PLACE'
  | 'REFUSE';

export interface RecapPayload {
  windowStart: Date;
  windowEnd: Date;
  generatedAt: Date;
  mandats: MandatRecap[];
  parPersonne: ParPersonne;
}

// ─── Bloc par mandat ─────────────────────────────────

export interface MandatBase {
  id: string;
  titrePoste: string;
  entreprise: string;
  clientLabel: string | null;
  sales: UserRef | null;
  recruteur: UserRef | null;
}

export interface MandatRecap extends MandatBase {
  ageJours: number;
  pipeline: PipelineBucket[];
  totalActifs: number;               // somme des count actifs (hors PLACE/REFUSE)
  presentationsPrevues: PresentationPrevue[];
}

export interface PipelineBucket {
  stage: Stage;
  count: number;
  oldestDays: number | null;         // Age du plus ancien candidat dans ce stage (jours)
}

export interface PresentationPrevue {
  candidatLabel: string;
  candidatId: string;
  at: Date;
  source: 'RDV' | 'DATE_ENTRETIEN';  // MEETING avec startTime OU dateEntretienClient de la candidature
  label?: string;                    // titre du RDV, si dispo
}

// ─── Activite par personne ───────────────────────────

export interface ParPersonne {
  sales: UserBlocSales[];
  recruteurs: UserBlocRecruteur[];
  totaux: RecapTotaux;
}

export interface UserRef {
  id: string;
  label: string;                     // "Prenom Nom" ou email si nom vide
  fonction: Fonction;
  excludeFromTeamStats: boolean;
}

export interface UserBlocSales {
  user: UserRef;
  nouveauxRdv: number;
  nouveauxMandats: number;
  appels: number;
  candidaturesEnvoyeesClient: number;  // transitions -> ENVOYE_CLIENT
}

export interface UserBlocRecruteur {
  user: UserRef;
  appels: number;
  entretiensRecruteur: number;         // transitions -> ENTRETIEN_1
  presentations: number;               // transitions -> ENVOYE_CLIENT (source-cote)
}

export interface RecapTotaux {
  // Totaux equipe (exclut les users avec excludeFromTeamStats=true)
  appelsEquipe: number;
  rdvEquipe: number;
  entretiensRecruteurEquipe: number;
  presentationsEquipe: number;
  entretiensClientEquipe: number;
  placementsEquipe: number;
  nouveauxMandatsEquipe: number;
  // Grand total (inclut tout le monde)
  appelsGrandTotal: number;
  rdvGrandTotal: number;
}
