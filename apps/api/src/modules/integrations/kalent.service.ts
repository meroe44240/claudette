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

export async function searchTalents(filters: KalentFilter[]): Promise<any> {
  if (!API_KEY) {
    throw new Error('KALENT_API_KEY non configure cote serveur');
  }
  if (!filters.length) {
    throw new Error('Au moins un filtre est requis');
  }

  const normalized = filters.map((f) => ({
    filterType: f.filterType,
    value: f.value,
    isRequired: f.isRequired ?? true,
    isExcluded: f.isExcluded ?? false,
    isExactMatch: f.isExactMatch ?? false,
    ...(f.radius !== undefined ? { radius: f.radius } : {}),
  }));

  const res = await fetch(`${BASE_URL}/v1/search/talents`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ filters: normalized }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Kalent error ${res.status}: ${body}`);
  }

  return res.json();
}

export function isConfigured(): boolean {
  return Boolean(API_KEY);
}
