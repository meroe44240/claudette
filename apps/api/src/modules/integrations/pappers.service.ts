import prisma from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { logActivity } from '../../lib/activity-logger.js';

// ─── CONFIG ──────────────────────────────────────────

const PAPPERS_BASE_URL = process.env.PAPPERS_BASE_URL || 'https://api.pappers.fr/v2';
const PAPPERS_API_KEY = process.env.PAPPERS_API_KEY || '';

// ─── TYPES ──────────────────────────────────────────

export interface PappersSuggestion {
  siren: string;
  denomination: string;
  nom_entreprise: string;
  siege: {
    siret: string;
    code_postal: string;
    ville: string;
    adresse_ligne_1?: string;
  };
  forme_juridique?: string;
  code_naf?: string;
  libelle_code_naf?: string;
}

export interface PappersEntreprise {
  siren: string;
  denomination: string;
  nom_entreprise: string;
  forme_juridique?: string;
  capital?: number;
  effectif?: string;
  effectif_min?: number;
  effectif_max?: number;
  date_creation?: string;
  code_naf?: string;
  libelle_code_naf?: string;
  siege: {
    siret: string;
    adresse_ligne_1?: string;
    code_postal?: string;
    ville?: string;
  };
  chiffre_affaires?: number;
  resultat?: number;
  site_url?: string;
  fiche_pappers_url?: string;
  [key: string]: unknown;
}

export interface PappersSearchResult {
  resultats: PappersEntreprise[];
  total: number;
  page: number;
  par_page: number;
}

export interface PappersTokenUsage {
  jetons_utilises: number;
  jetons_restants: number;
  date_debut_periode?: string;
  date_fin_periode?: string;
}

// ─── HELPERS ────────────────────────────────────────

function getApiKey(): string {
  if (!PAPPERS_API_KEY) {
    throw new AppError(500, 'Clé API Pappers non configurée (PAPPERS_API_KEY manquante)');
  }
  return PAPPERS_API_KEY;
}

async function pappersGet<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const apiKey = getApiKey();
  const url = new URL(`${PAPPERS_BASE_URL}${endpoint}`);
  url.searchParams.set('api_token', apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Erreur inconnue');
    if (response.status === 401 || response.status === 403) {
      throw new AppError(401, 'Clé API Pappers invalide ou expirée');
    }
    if (response.status === 404) {
      throw new AppError(404, 'Aucune entreprise trouvée');
    }
    if (response.status === 429) {
      throw new AppError(429, 'Quota Pappers dépassé — réessayez plus tard');
    }
    throw new AppError(response.status, `Erreur Pappers: ${errorText}`);
  }

  return response.json() as Promise<T>;
}

// ─── PUBLIC FUNCTIONS ────────────────────────────────

/**
 * Autocomplétion rapide par nom d'entreprise.
 */
export async function suggestions(query: string): Promise<PappersSuggestion[]> {
  if (query.length < 2) return [];

  const data = await pappersGet<{ resultats_nom_entreprise?: PappersSuggestion[] }>(
    '/suggestions',
    { q: query },
  );
  return data.resultats_nom_entreprise || [];
}

/**
 * Recherche avancée par nom d'entreprise.
 */
export async function searchByName(nom: string, page = 1): Promise<PappersSearchResult> {
  return pappersGet<PappersSearchResult>('/recherche', {
    q: nom,
    page: String(page),
    par_page: '10',
  });
}

/**
 * Fiche complète d'une entreprise par SIREN.
 */
export async function getBySiren(siren: string): Promise<PappersEntreprise> {
  return pappersGet<PappersEntreprise>('/entreprise', { siren });
}

/**
 * Fiche complète d'une entreprise par SIRET.
 */
export async function getBySiret(siret: string): Promise<PappersEntreprise> {
  return pappersGet<PappersEntreprise>('/entreprise', { siret });
}

/**
 * Suivi consommation de jetons Pappers.
 */
export async function getTokenUsage(): Promise<PappersTokenUsage> {
  return pappersGet<PappersTokenUsage>('/suivi-jetons', {});
}

/**
 * Vérifie que la clé API est configurée et fonctionnelle.
 */
export async function checkStatus(): Promise<{ connected: boolean; tokensUsed?: number; tokensRemaining?: number }> {
  if (!PAPPERS_API_KEY) {
    return { connected: false };
  }
  try {
    const usage = await getTokenUsage();
    return {
      connected: true,
      tokensUsed: usage.jetons_utilises,
      tokensRemaining: usage.jetons_restants,
    };
  } catch {
    return { connected: false };
  }
}

/**
 * Déduit la taille d'entreprise à partir de l'effectif Pappers.
 */
function deduireTaille(effectif: string | undefined, effectifMin?: number): 'STARTUP' | 'PME' | 'ETI' | 'GRAND_GROUPE' | null {
  if (!effectif && effectifMin === undefined) return null;
  const n = effectifMin || parseInt(effectif || '0', 10);
  if (n <= 50) return 'STARTUP';
  if (n <= 250) return 'PME';
  if (n <= 5000) return 'ETI';
  return 'GRAND_GROUPE';
}

/**
 * Enrichit une entreprise existante avec les données Pappers.
 * Cherche par SIREN si disponible, sinon par nom.
 */
export async function enrichEntreprise(entrepriseId: string): Promise<{
  success: boolean;
  entreprise: unknown;
  fieldsUpdated: string[];
}> {
  const entreprise = await prisma.entreprise.findUnique({
    where: { id: entrepriseId },
  });

  if (!entreprise) {
    throw new AppError(404, 'Entreprise non trouvée');
  }

  let pappersData: PappersEntreprise | null = null;

  // 1. Try by SIREN if available
  if (entreprise.siren) {
    try {
      pappersData = await getBySiren(entreprise.siren);
    } catch {
      // Fallback to name search
    }
  }

  // 2. Fallback: search by name
  if (!pappersData) {
    try {
      const searchResults = await searchByName(entreprise.nom);
      if (searchResults.resultats?.length > 0) {
        pappersData = searchResults.resultats[0];
        // Get full details
        if (pappersData.siren) {
          try {
            pappersData = await getBySiren(pappersData.siren);
          } catch {
            // Use search result data
          }
        }
      }
    } catch {
      throw new AppError(404, `Aucune entreprise trouvée sur Pappers pour "${entreprise.nom}"`);
    }
  }

  if (!pappersData) {
    throw new AppError(404, `Aucune entreprise trouvée sur Pappers pour "${entreprise.nom}"`);
  }

  // 3. Map Pappers data → Prisma update
  const fieldsUpdated: string[] = [];
  const updateData: Record<string, unknown> = {};

  if (pappersData.siren) {
    updateData.siren = pappersData.siren;
    fieldsUpdated.push('siren');
  }
  if (pappersData.siege?.siret) {
    updateData.siret = pappersData.siege.siret;
    fieldsUpdated.push('siret');
  }
  if (pappersData.forme_juridique) {
    updateData.formeJuridique = pappersData.forme_juridique;
    fieldsUpdated.push('formeJuridique');
  }
  if (pappersData.capital !== undefined && pappersData.capital !== null) {
    updateData.capitalSocial = pappersData.capital;
    fieldsUpdated.push('capitalSocial');
  }
  if (pappersData.chiffre_affaires !== undefined && pappersData.chiffre_affaires !== null) {
    updateData.chiffreAffaires = pappersData.chiffre_affaires;
    fieldsUpdated.push('chiffreAffaires');
  }
  if (pappersData.effectif) {
    updateData.effectif = pappersData.effectif;
    fieldsUpdated.push('effectif');
  }
  if (pappersData.date_creation) {
    updateData.dateCreation = pappersData.date_creation;
    fieldsUpdated.push('dateCreation');
  }
  if (pappersData.code_naf) {
    updateData.codeNAF = pappersData.code_naf;
    fieldsUpdated.push('codeNAF');
  }
  if (pappersData.libelle_code_naf) {
    updateData.libelleNAF = pappersData.libelle_code_naf;
    fieldsUpdated.push('libelleNAF');
  }

  // Compose address
  const adresseParts = [
    pappersData.siege?.adresse_ligne_1,
    pappersData.siege?.code_postal,
    pappersData.siege?.ville,
  ].filter(Boolean);
  if (adresseParts.length > 0) {
    updateData.adresseComplete = adresseParts.join(', ');
    fieldsUpdated.push('adresseComplete');
  }

  if (pappersData.fiche_pappers_url) {
    updateData.pappersUrl = pappersData.fiche_pappers_url;
    fieldsUpdated.push('pappersUrl');
  }

  // Also update common fields if empty
  if (!entreprise.secteur && pappersData.libelle_code_naf) {
    updateData.secteur = pappersData.libelle_code_naf;
    fieldsUpdated.push('secteur');
  }
  if (!entreprise.localisation && pappersData.siege?.ville) {
    updateData.localisation = pappersData.siege.ville;
    fieldsUpdated.push('localisation');
  }
  if (!entreprise.siteWeb && pappersData.site_url) {
    updateData.siteWeb = pappersData.site_url;
    fieldsUpdated.push('siteWeb');
  }
  if (!entreprise.taille) {
    const taille = deduireTaille(pappersData.effectif, pappersData.effectif_min);
    if (taille) {
      updateData.taille = taille;
      fieldsUpdated.push('taille');
    }
  }

  // Store raw data + timestamp
  updateData.pappersRawData = pappersData as unknown as Record<string, unknown>;
  updateData.pappersEnrichedAt = new Date();

  const updated = await prisma.entreprise.update({
    where: { id: entrepriseId },
    data: updateData,
  });

  console.log(`[Pappers] Enriched entreprise "${entreprise.nom}" — ${fieldsUpdated.length} fields updated`);

  // Fire-and-forget: log enrichment activity
  if (entreprise.createdById) {
    logActivity({
      type: 'NOTE',
      entiteType: 'ENTREPRISE',
      entiteId: entrepriseId,
      userId: entreprise.createdById,
      titre: 'Données Pappers mises à jour',
      contenu: `Champs enrichis : ${fieldsUpdated.join(', ')}`,
      source: 'SYSTEME',
      metadata: { pappersEnrich: true, fieldsUpdated },
    }).catch(() => {});
  }

  return {
    success: true,
    entreprise: updated,
    fieldsUpdated,
  };
}
