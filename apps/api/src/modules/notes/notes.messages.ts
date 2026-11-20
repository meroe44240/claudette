// Messages enregistrés sur un call (motif de vérification, doublon, erreur) : stockés en
// français (texte stable, comme les clés de l'interface), traduits à l'affichage selon la
// langue de la personne qui les lit (réponses de l'API Notes, emails).
import type { Lang } from '../../lib/locale.js';

const EXACT_EN: Record<string, string> = {
  // Détection du type de call
  'Le titre et les participants indiquent à la fois une qualif et un intake.': 'The title and attendees point to both a qualification and an intake.',
  'Candidat introuvable dans Propium : chargez son CV ou choisissez la fiche.': 'Candidate not found in Propium: upload their CV or pick the profile.',
  'Mandat lié inconnu : choisissez le mandat de cette qualif.': 'Linked mandate unknown: pick the mandate for this qualification.',
  'Le contact vient d’une entreprise déjà connue : intake ou prospect ?': 'The contact is from a company we already know: intake or prospect?',
  // Fin de call
  'Aucun transcript reçu (bot refusé, call annulé ou personne n’a parlé).': 'No transcript received (bot refused, call cancelled or nobody spoke).',
  'Bot retiré à la demande d’un participant : rien n’a été conservé.': 'Bot removed at a participant’s request: nothing was kept.',
  'Client retrouvé par le nom et l’entreprise : fiche existante mise à jour, à vérifier.': 'Client matched by name and company: existing profile updated, please check.',
  // Libellés
  'Écriture Propium': 'Propium update',
  'Candidat': 'Candidate',
};

// Messages avec une partie variable.
const PATTERNS_EN: [RegExp, (...m: string[]) => string][] = [
  [/^Erreur : (.*)$/s, (_, e) => `Error: ${e}`],
  [/^Correspondance par le nom uniquement \((\d+) fiches? possibles?\) : fiche existante mise à jour, à vérifier\.$/, (_, n) => `Matched by name only (${n} possible profile${Number(n) > 1 ? 's' : ''}): existing profile updated, please check.`],
  [/^Le bot n’a pas pu rejoindre le call(?: \((.+)\))?\.$/, (_, sub) => `The bot couldn’t join the call${sub ? ` (${sub})` : ''}.`],
];

/** Message enregistré, dans la langue du lecteur (inchangé s'il est inconnu). */
export function notesMessage<T extends string | null | undefined>(text: T, lang: Lang): T {
  if (!text || lang === 'fr') return text;
  const exact = EXACT_EN[text];
  if (exact) return exact as T;
  for (const [re, fn] of PATTERNS_EN) {
    const m = text.match(re);
    if (m) return fn(...m) as T;
  }
  return text;
}

/** Doublons / alertes d'écriture d'un call, dans la langue du lecteur. */
export function localizeFlags<F extends { label: string; reason: string }>(flags: F[] | null | undefined, lang: Lang): F[] {
  return (flags || []).map((f) => ({ ...f, label: notesMessage(f.label, lang), reason: notesMessage(f.reason, lang) }));
}
