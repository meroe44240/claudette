// Transcripts de démonstration : rejoués dans le pipeline live quand Recall.ai
// n'est pas encore branché (ou pour tester le panneau sans vrai call).
import type { CallType } from './notes.types.js';

type Line = [speaker: string, text: string];

const QUALIF: Line[] = [
  ['Recruteur', 'Bonjour Julien, merci de prendre le temps. On a quinze minutes, je te propose qu’on parte de ton poste actuel.'],
  ['Candidat', 'Avec plaisir. Je suis Account Executive chez Payfit depuis deux ans, sur le segment mid-market, des boîtes de 50 à 250 salariés.'],
  ['Recruteur', 'Et concrètement, tes résultats sur les douze derniers mois ?'],
  ['Candidat', 'J’avais un quota de 600 k€ d’ARR, j’ai fini à 112 %. J’ai signé 38 deals, panier moyen autour de 18 k€.'],
  ['Recruteur', 'Très bien. Pourquoi tu regardes le marché aujourd’hui ?'],
  ['Candidat', 'On a été réorganisés, mon territoire a été coupé en deux. Et j’ai envie d’aller vers de l’enterprise, des cycles plus longs.'],
  ['Recruteur', 'Côté rémunération, tu es à combien aujourd’hui ?'],
  ['Candidat', 'Je suis bien payé, je dirais dans la moyenne du marché.'],
  ['Recruteur', 'D’accord, et en chiffres, fixe et variable ?'],
  ['Candidat', '55 k€ de fixe et 45 k€ de variable à objectif atteint. Je vise autour de 110 à 120 k€ OTE.'],
  ['Recruteur', 'Ton préavis ?'],
  ['Candidat', 'Trois mois, mais je pense pouvoir négocier à deux.'],
  ['Recruteur', 'Tu es basé où, et le télétravail c’est important pour toi ?'],
  ['Candidat', 'Paris, onzième. Deux jours de télétravail ce serait idéal, mais je peux être au bureau trois jours.'],
  ['Recruteur', 'Tu as d’autres process en cours ?'],
  ['Candidat', 'Oui, un chez Qonto où je suis au troisième entretien, et un premier échange chez Swile.'],
  ['Recruteur', 'Parfait. Prochaine étape, je te présente le poste en détail et je t’envoie la fiche ce soir.'],
];

const INTAKE: Line[] = [
  ['Recruteur', 'Merci pour votre temps. Parlez-moi du poste que vous souhaitez ouvrir.'],
  ['Client', 'On cherche un Head of Sales pour structurer l’équipe, aujourd’hui six commerciaux qui me reportent directement.'],
  ['Recruteur', 'Pourquoi maintenant ?'],
  ['Client', 'On vient de lever 12 millions en série A et on veut doubler l’équipe d’ici un an.'],
  ['Recruteur', 'Quel profil vous imaginez ?'],
  ['Client', 'Quelqu’un qui a déjà managé une équipe de cinq à dix en SaaS B2B, idéalement passé par une scale-up.'],
  ['Recruteur', 'Et la rémunération ?'],
  ['Client', 'Entre 90 et 110 k€ fixe, plus 30 % de variable, et des BSPCE.'],
  ['Recruteur', 'Le process côté vous ?'],
  ['Client', 'Un premier entretien avec moi, un cas pratique, puis un échange avec le CEO qui décide.'],
  ['Recruteur', 'Des délais ?'],
  ['Client', 'Idéalement une arrivée en mars.'],
  ['Recruteur', 'Qu’est-ce qui exclurait un candidat ?'],
  ['Client', 'Quelqu’un qui n’a jamais été lui-même commercial terrain, ça ne marche pas chez nous.'],
];

const PROSPECT: Line[] = [
  ['Commercial', 'Merci d’avoir accepté l’échange. Où en êtes-vous sur vos recrutements ?'],
  ['Prospect', 'On a trois postes de commerciaux ouverts depuis deux mois, et on n’arrive pas à recruter.'],
  ['Commercial', 'Quel est l’enjeu derrière ?'],
  ['Prospect', 'On lance une nouvelle offre au premier trimestre, sans les commerciaux on rate la fenêtre.'],
  ['Commercial', 'Qui décide sur ce sujet chez vous ?'],
  ['Prospect', 'Moi pour le choix du cabinet, mais le DAF valide le budget.'],
  ['Commercial', 'Vous avez une enveloppe en tête ?'],
  ['Prospect', 'On a déjà travaillé à 18 % avec un cabinet, au-delà ce sera compliqué.'],
  ['Commercial', 'Ce qu’on peut faire, c’est vous envoyer une proposition et en reparler mardi prochain ?'],
  ['Prospect', 'Mardi 14 h, ça me va.'],
];

const INTERNE: Line[] = [
  ['Méroë', 'On fait le point sur les mandats de la semaine.'],
  ['Léa', 'Sur le mandat Head of Sales, j’ai trois candidats en entretien client, on attend les retours jeudi.'],
  ['Méroë', 'OK. On décide de ne plus prendre de nouveaux mandats retail ce trimestre.'],
  ['Léa', 'Ça me va. Je relance le client Payfit demain pour le feedback.'],
  ['Méroë', 'Et je prépare la proposition pour Qonto d’ici vendredi.'],
  ['Léa', 'Point ouvert : le recrutement du deuxième sourceur, on en reparle la semaine prochaine.'],
];

export const DEMO: Record<CallType, Line[]> = { QUALIF, INTAKE, PROSPECT, INTERNE };
