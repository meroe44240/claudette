/**
 * Kalent API integration — AI talent sourcing.
 * https://docs.kalent.ai
 *
 * Shared REST API key (server-side env) so every user of the ATS can source
 * without their own Kalent account.
 */

const BASE_URL = 'https://app.kalent.ai/api';
const API_KEY = process.env.KALENT_API_KEY || '';

export interface KalentFilter {
  filterType: string; // JOB_TITLE, LOCATION, SKILL, COMPANY, SENIORITY, INDUSTRY, etc.
  value: string;
  isRequired?: boolean;
  isExcluded?: boolean;
  isExactMatch?: boolean;
  radius?: number; // LOCATION only, km
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': API_KEY,
  };
}

function ensureKey() {
  if (!API_KEY) throw new Error('KALENT_API_KEY non configure cote serveur');
}

async function callKalent(path: string, init: RequestInit): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Kalent error ${res.status}: ${body}`);
  }
  return res.json();
}

/** Recherche par filtres structures. `related` = searchTransactionId precedents (pagination). */
export async function searchTalents(filters: KalentFilter[], related: string[] = []): Promise<any> {
  ensureKey();
  if (!filters.length) throw new Error('Au moins un filtre est requis');

  const normalized = filters.map((f) => ({
    filterType: f.filterType,
    value: f.value,
    isRequired: f.isRequired ?? true,
    isExcluded: f.isExcluded ?? false,
    isExactMatch: f.isExactMatch ?? false,
    ...(f.radius !== undefined ? { radius: f.radius } : {}),
  }));

  return callKalent('/v1/search/talents', {
    method: 'POST',
    body: JSON.stringify({ filters: normalized, relatedSearchTransactionIds: related }),
  });
}

/** Recherche en langage naturel (Kalent traduit le prompt en filtres cote serveur). */
export async function searchByPrompt(prompt: string, related: string[] = []): Promise<any> {
  ensureKey();
  if (!prompt.trim()) throw new Error('Un prompt est requis');
  return callKalent('/v1/search/talents/by-prompt', {
    method: 'POST',
    body: JSON.stringify({ prompt: prompt.trim(), relatedSearchTransactionIds: related }),
  });
}

/** Lance l'enrichissement des coordonnees d'un profil LinkedIn (async). Renvoie { talentId }. */
export async function startEnrichment(
  linkedinUrl: string,
  enrichmentType: 'all' | 'phone' | 'personalEmail' = 'all',
): Promise<any> {
  ensureKey();
  if (!linkedinUrl) throw new Error('linkedinUrl requis');
  return callKalent('/v1/contact/enrich', {
    method: 'POST',
    body: JSON.stringify({ linkedinUrl, enrichmentType }),
  });
}

/** Recupere le resultat d'enrichissement (emails, phones, contactsLoading). */
export async function getEnrichment(talentId: string): Promise<any> {
  ensureKey();
  const res = await fetch(`${BASE_URL}/v1/contact/enrich?talentId=${encodeURIComponent(talentId)}`, {
    headers: headers(),
  });
  if (res.status === 404) return { data: { talentId, emails: [], phones: [], contactsLoading: { email: false, phone: false } } };
  if (!res.ok) throw new Error(`Kalent error ${res.status}: ${await res.text()}`);
  return res.json();
}

export function isConfigured(): boolean {
  return Boolean(API_KEY);
}
