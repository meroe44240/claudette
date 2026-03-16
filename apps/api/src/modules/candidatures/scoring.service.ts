/**
 * Scoring service — évalue la compatibilité candidat/mandat (0-100)
 *
 * Critères (poids) :
 * - Salaire (25%) : ratio entre souhaité et fourchette du mandat
 * - Localisation (20%) : match exact ville
 * - Compétences/tags (25%) : intersection des tags candidat ↔ mandat
 * - Expérience (15%) : années d'expérience vs exigence
 * - Disponibilité (15%) : disponible = bonus
 */

interface CandidatForScoring {
  salaireSouhaite?: number | null;
  localisation?: string | null;
  tags?: string[];
  anneesExperience?: number | null;
  disponibilite?: string | null;
}

interface MandatForScoring {
  salaireMin?: number | null;
  salaireMax?: number | null;
  localisation?: string | null;
  tags?: string[];
  anneesExperienceMin?: number | null;
}

export function scoreCandidature(candidat: CandidatForScoring, mandat: MandatForScoring): number {
  let total = 0;
  let weightUsed = 0;

  // --- Salaire (25%) ---
  const salaireWeight = 25;
  if (candidat.salaireSouhaite && (mandat.salaireMin || mandat.salaireMax)) {
    const min = mandat.salaireMin || 0;
    const max = mandat.salaireMax || Infinity;
    const souhaite = candidat.salaireSouhaite;

    if (souhaite >= min && souhaite <= max) {
      total += salaireWeight;
    } else if (souhaite < min) {
      // Sous le budget = bon pour le client
      total += salaireWeight;
    } else {
      // Au-dessus du budget, pénalité proportionnelle
      const over = souhaite - max;
      const penalty = Math.min(over / max, 1);
      total += salaireWeight * (1 - penalty);
    }
    weightUsed += salaireWeight;
  }

  // --- Localisation (20%) ---
  const locWeight = 20;
  if (candidat.localisation && mandat.localisation) {
    const cLoc = candidat.localisation.toLowerCase().trim();
    const mLoc = mandat.localisation.toLowerCase().trim();
    if (cLoc === mLoc || cLoc.includes(mLoc) || mLoc.includes(cLoc)) {
      total += locWeight;
    } else {
      total += locWeight * 0.3; // Partial credit
    }
    weightUsed += locWeight;
  }

  // --- Tags/Compétences (25%) ---
  const tagsWeight = 25;
  const cTags = (candidat.tags || []).map((t) => t.toLowerCase());
  const mTags = (mandat.tags || []).map((t) => t.toLowerCase());
  if (cTags.length > 0 && mTags.length > 0) {
    const intersection = cTags.filter((t) => mTags.includes(t));
    const ratio = intersection.length / mTags.length;
    total += tagsWeight * Math.min(ratio, 1);
    weightUsed += tagsWeight;
  }

  // --- Expérience (15%) ---
  const expWeight = 15;
  if (candidat.anneesExperience != null && mandat.anneesExperienceMin != null) {
    if (candidat.anneesExperience >= mandat.anneesExperienceMin) {
      total += expWeight;
    } else {
      const ratio = candidat.anneesExperience / mandat.anneesExperienceMin;
      total += expWeight * ratio;
    }
    weightUsed += expWeight;
  }

  // --- Disponibilité (15%) ---
  const dispoWeight = 15;
  if (candidat.disponibilite) {
    const dispo = candidat.disponibilite.toLowerCase();
    if (dispo.includes('immédiat') || dispo.includes('immediat') || dispo.includes('disponible')) {
      total += dispoWeight;
    } else if (dispo.includes('1 mois') || dispo.includes('2 semaines')) {
      total += dispoWeight * 0.8;
    } else if (dispo.includes('2 mois') || dispo.includes('3 mois')) {
      total += dispoWeight * 0.5;
    } else {
      total += dispoWeight * 0.3;
    }
    weightUsed += dispoWeight;
  }

  // Normalize: if we couldn't evaluate some criteria, scale to 100
  if (weightUsed === 0) return 50; // Neutral if no data
  return Math.round((total / weightUsed) * 100);
}
