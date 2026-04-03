const API_BASE = '/api/v1';

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

class ApiError extends Error {
  constructor(
    public status: number,
    public data: { error?: string; message?: string; details?: Record<string, string[]> },
  ) {
    super(data.message || 'Erreur API');
  }
}

async function request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const token = localStorage.getItem('accessToken');
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'include',
  });

  if (response.status === 401 && token) {
    const refreshed = await refreshToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${localStorage.getItem('accessToken')}`;
      const retryResponse = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        credentials: 'include',
      });
      if (!retryResponse.ok) {
        const data = await retryResponse.json().catch(() => ({}));
        throw new ApiError(retryResponse.status, data);
      }
      return retryResponse.json();
    }
    localStorage.removeItem('accessToken');
    window.location.href = '/login';
    throw new ApiError(401, { message: 'Session expirée' });
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(response.status, data);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

async function refreshToken(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) return false;
    const data = await response.json();
    localStorage.setItem('accessToken', data.accessToken);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body?: unknown) => request<T>(endpoint, { method: 'POST', body }),
  put: <T>(endpoint: string, body?: unknown) => request<T>(endpoint, { method: 'PUT', body }),
  patch: <T>(endpoint: string, body?: unknown) => request<T>(endpoint, { method: 'PATCH', body }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};

export { ApiError };
