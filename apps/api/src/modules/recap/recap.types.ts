/**
 * Types du payload recap bi-hebdo.
 *
 * La forme est stable : le template email + l'endpoint preview lisent ce
 * meme objet. Rendu et data sont decouples.
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
  blocages: Blocages;
  mandats: MandatRecap[];
  parPersonne: ParPersonne;
}

// ─── Blocages ────────────────────────────────────────

export interface Blocages {
  mandatsGeles: MandatBloc[];        // > 7j sans mouvement (stage) ni activite
  clientsSilencieux: SilencieuxBloc[]; // > 5j depuis passage en ENTRETIEN_CLIENT
  mandatsSansRecruteur: MandatBase[];
  mandatsPipelineVide: MandatBase[];
  tachesEnRetard: TacheBloc[];       // > 2j
}

export interface MandatBase {
  id: string;
  titrePoste: string;
  entreprise: string;
  clientLabel: string | null;
  sales: UserRef | null;
  recruteur: UserRef | null;
}

export interface MandatBloc extends MandatBase {
  joursSansActivite: number;
  lastActivityAt: Date | null;
}

export interface SilencieuxBloc extends MandatBase {
  candidatId: string;
  candidatLabel: string;
  joursDepuisEntretienClient: number;
}

export interface TacheBloc {
  id: string;
  titre: string;
  dueDate: Date;
  joursRetard: number;
  user: UserRef | null;
  entiteType: string | null;
  entiteId: string | null;
}

// ─── Bloc par mandat ─────────────────────────────────

export interface MandatRecap extends MandatBase {
  ageJours: number;
  healthScore: HealthScore;
  pipeline: PipelineBucket[];
  mouvements: Mouvement[];
  prochaineAction: ProchaineAction | null;
}

export type HealthScore = 'GREEN' | 'YELLOW' | 'RED';

export interface PipelineBucket {
  stage: Stage;
  count: number;
  oldestDays: number | null;    // Age du plus ancien candidat dans ce stage (jours)
  alerte: boolean;              // depasse le seuil pour ce stage
}

export type MouvementType = 'STAGE' | 'ACTIVITE' | 'NOTE';

export interface Mouvement {
  type: MouvementType;
  at: Date;
  label: string;
  detail?: string;
  user: UserRef | null;
}

export interface ProchaineAction {
  type: 'TACHE' | 'RDV';
  at: Date;
  label: string;
  user: UserRef | null;
}

// ─── Activite par personne ───────────────────────────

export interface ParPersonne {
  sales: UserBlocSales[];
  recruteurs: UserBlocRecruteur[];
  totaux: RecapTotaux;
}

export interface UserRef {
  id: string;
  label: string;                 // "Prenom Nom" ou email si nom vide
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
