/**
 * Full Enrich API integration
 * https://app.fullenrich.com/api/v2
 */

const BASE_URL = 'https://app.fullenrich.com/api/v2';
const API_KEY = process.env.FULLENRICH_API_KEY || '';

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`,
  };
}

// ─── Types ──────────────────────────────────────────

export interface EnrichInput {
  first_name?: string;
  last_name?: string;
  domain?: string;
  company_name?: string;
  linkedin_url?: string;
}

export interface ContactInfo {
  most_probable_work_email?: { email: string; status: string } | null;
  most_probable_personal_email?: { email: string; status: string } | null;
  most_probable_phone?: { number: string; region: string } | null;
  work_emails?: Array<{ email: string; status: string }>;
  personal_emails?: Array<{ email: string; status: string }>;
  phones?: Array<{ number: string; region: string }>;
}

export interface EnrichProfile {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  location?: { country?: string; city?: string };
  skills?: string[];
  employment?: {
    current?: {
      title?: string;
      company?: { name?: string; domain?: string; industry?: string; headcount_range?: string };
    };
  };
}

export interface EnrichResult {
  input: EnrichInput;
  contact_info: ContactInfo;
  profile?: EnrichProfile;
}

// ─── API calls ──────────────────────────────────────

/**
 * Start a bulk enrichment (1 or more contacts).
 * Returns the enrichment_id to poll.
 */
export async function startEnrichment(contacts: EnrichInput[], enrichFields?: string[]): Promise<string> {
  const fields = enrichFields || ['contact.emails', 'contact.phones', 'contact.personal_emails'];
  const res = await fetch(`${BASE_URL}/contact/enrich/bulk`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name: `MCP enrichment ${new Date().toISOString()}`,
      data: contacts.map((c) => ({
        ...c,
        enrich_fields: fields,
      })),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`FullEnrich error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as any;
  return json.enrichment_id;
}

/**
 * Poll enrichment results. Retries up to maxRetries with delay.
 */
export async function getEnrichmentResults(enrichmentId: string, maxRetries = 10, delayMs = 5000): Promise<EnrichResult[]> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(`${BASE_URL}/contact/enrich/bulk/${enrichmentId}?forceResults=true`, {
      headers: headers(),
    });

    if (res.status === 200) {
      const json = (await res.json()) as any;
      return json.data || [];
    }

    if (res.status === 400) {
      // In progress — wait and retry
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    const body = await res.text();
    throw new Error(`FullEnrich poll error ${res.status}: ${body}`);
  }

  throw new Error('Enrichissement en cours — rester patient, les resultats arrivent dans quelques minutes.');
}

/**
 * Enrich a single contact and wait for results.
 */
export async function enrichContact(input: EnrichInput, enrichFields?: string[]): Promise<EnrichResult | null> {
  const enrichmentId = await startEnrichment([input], enrichFields);
  const results = await getEnrichmentResults(enrichmentId);
  return results[0] || null;
}

/**
 * Search people via Full Enrich people search (synchronous).
 */
export async function searchPeople(filters: {
  job_titles?: string[];
  company_names?: string[];
  company_domains?: string[];
  locations?: string[];
  skills?: string[];
  seniority?: string[];
  limit?: number;
}): Promise<any> {
  const body: any = {
    limit: filters.limit || 10,
    offset: 0,
  };

  if (filters.job_titles?.length) {
    body.current_position_titles = filters.job_titles.map((v) => ({ value: v, exclude: false, exact_match: false }));
  }
  if (filters.company_names?.length) {
    body.current_company_names = filters.company_names.map((v) => ({ value: v, exclude: false, exact_match: false }));
  }
  if (filters.company_domains?.length) {
    body.current_company_domains = filters.company_domains.map((v) => ({ value: v, exclude: false, exact_match: false }));
  }
  if (filters.locations?.length) {
    body.person_locations = filters.locations.map((v) => ({ value: v, exclude: false, exact_match: false }));
  }
  if (filters.skills?.length) {
    body.person_skills = filters.skills.map((v) => ({ value: v, exclude: false, exact_match: false }));
  }
  if (filters.seniority?.length) {
    body.current_position_seniority_level = filters.seniority.map((v) => ({ value: v, exclude: false, exact_match: false }));
  }

  const res = await fetch(`${BASE_URL}/people/search`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FullEnrich search error ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Get credit balance.
 */
export async function getCredits(): Promise<number> {
  const res = await fetch(`${BASE_URL}/account/credits`, { headers: headers() });
  if (!res.ok) throw new Error(`FullEnrich credits error ${res.status}`);
  const json = (await res.json()) as any;
  return json.balance;
}

/**
 * Verify API key is valid.
 */
export async function verifyApiKey(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/account/keys/verify`, { headers: headers() });
    return res.ok;
  } catch {
    return false;
  }
}
