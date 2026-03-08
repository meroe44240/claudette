/**
 * Public API client for unauthenticated routes (/api/public/).
 * Separate from api-client.ts which uses /api/v1 with auth headers.
 */

const PUBLIC_API = '/api/public';

export async function publicGet<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${PUBLIC_API}${endpoint}`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Erreur API');
  }
  return response.json();
}

export async function publicPost<T>(endpoint: string, body: FormData | Record<string, unknown>): Promise<T> {
  const isFormData = body instanceof FormData;
  const response = await fetch(`${PUBLIC_API}${endpoint}`, {
    method: 'POST',
    headers: isFormData ? {} : { 'Content-Type': 'application/json' },
    body: isFormData ? body : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Erreur API');
  }
  return response.json();
}
