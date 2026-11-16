// Bibliothèque de questions par type de call, appliquée quand aucun brief n'est chargé.
import type { CallType } from './notes.types.js';

interface TemplateQuestion { text: string; dealbreaker?: boolean }

export const TEMPLATES: Record<CallType, TemplateQuestion[]> = {
  QUALIF: [
    { text: 'Quel est ton poste actuel et ton périmètre exact (équipe, budget, clients) ?' },
    { text: 'Pourquoi regardes-tu le marché aujourd’hui ?', dealbreaker: true },
    { text: 'Quels sont tes résultats chiffrés sur les 12 derniers mois (quota, atteinte, deals signés) ?', dealbreaker: true },
    { text: 'Quelle est ta rémunération actuelle (fixe + variable) et tes attentes ?', dealbreaker: true },
    { text: 'Quel est ton préavis et ta date de disponibilité ?', dealbreaker: true },
    { text: 'Où es-tu basé et quelle mobilité / quel rythme de télétravail souhaites-tu ?' },
    { text: 'Quels autres process as-tu en cours et à quel stade ?' },
    { text: 'Qu’est-ce qui te ferait dire oui à une nouvelle opportunité ?' },
  ],
  INTAKE: [
    { text: 'Quel est le poste, son périmètre et pourquoi il s’ouvre maintenant ?', dealbreaker: true },
    { text: 'Quel profil cible : expérience, secteur, compétences indispensables ?', dealbreaker: true },
    { text: 'Quelle fourchette de salaire (fixe + variable) ?', dealbreaker: true },
    { text: 'Quel process de recrutement : étapes, interlocuteurs, décideur final ?' },
    { text: 'Quels délais : date de démarrage souhaitée, urgence ?' },
    { text: 'Quels sont les dealbreakers côté client (ce qui exclut un candidat) ?', dealbreaker: true },
    { text: 'Quelles infos clés sur la boîte à pitcher aux candidats (croissance, équipe, culture) ?' },
  ],
  PROSPECT: [
    { text: 'Quel est le besoin de recrutement aujourd’hui (postes, volumes) ?', dealbreaker: true },
    { text: 'Quels enjeux business derrière ces recrutements ?' },
    { text: 'Quel budget / quelles conditions de collaboration envisagées ?' },
    { text: 'Qui sont les décideurs et qui d’autre intervient ?', dealbreaker: true },
    { text: 'Quelle est la prochaine étape et à quelle date ?', dealbreaker: true },
  ],
  INTERNE: [
    { text: 'Points de l’ordre du jour traités' },
    { text: 'Décisions prises' },
    { text: 'Actions : qui fait quoi, pour quand ?', dealbreaker: true },
  ],
};
