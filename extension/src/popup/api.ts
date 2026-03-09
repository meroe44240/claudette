// HumanUp ATS - API Helper for Chrome Extension

const API_BASE_URL = 'https://ats.propium.co/api/v1';

async function getToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.session.get('accessToken', (result) => {
      resolve((result.accessToken as string) || null);
    });
  });
}

async function setToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.session.set({ accessToken: token }, resolve);
  });
}

async function clearToken(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.session.remove('accessToken', resolve);
  });
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}

export async function login(
  email: string,
  password: string
): Promise<{
  user: { id: string; email: string; nom: string; prenom: string };
}> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error('Email ou mot de passe incorrect');
    }
    if (res.status === 429) {
      throw new Error(
        'Trop de tentatives. Veuillez patienter quelques instants.'
      );
    }
    throw new Error(err.message || 'Identifiants invalides');
  }

  const data = await res.json();
  await setToken(data.accessToken);
  return { user: data.user };
}

export async function logout(): Promise<void> {
  await clearToken();
}

async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getToken();
  if (!token) {
    throw new Error('NOT_AUTHENTICATED');
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (res.status === 401) {
    await clearToken();
    throw new Error('NOT_AUTHENTICATED');
  }

  if (res.status === 429) {
    throw new Error(
      'Trop de requ\u00eates. Veuillez patienter quelques instants.'
    );
  }

  return res;
}

// --- Candidats ---

export interface CreateCandidatPayload {
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  linkedinUrl?: string;
  photoUrl?: string;
  posteActuel?: string;
  entrepriseActuelle?: string;
  localisation?: string;
  source?: string;
  tags?: string[];
  notes?: string;
}

export async function createCandidat(
  payload: CreateCandidatPayload
): Promise<{ id: string; _updated?: boolean }> {
  const res = await apiFetch('/candidats', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.message || 'Erreur lors de la cr\u00e9ation du candidat'
    );
  }
  const data = await res.json();
  return { ...data, _updated: res.status === 200 };
}

// --- Clients ---

export interface CreateClientPayload {
  nom: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  poste?: string;
  linkedinUrl?: string;
  entrepriseId: string;
  notes?: string;
}

export async function createClient(
  payload: CreateClientPayload
): Promise<{ id: string }> {
  const res = await apiFetch('/clients', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.message || 'Erreur lors de la cr\u00e9ation du client'
    );
  }
  return res.json();
}

// --- Entreprises ---

export interface CreateEntreprisePayload {
  nom: string;
  secteur?: string;
  siteWeb?: string;
  taille?: string;
  localisation?: string;
  linkedinUrl?: string;
  notes?: string;
}

export interface Entreprise {
  id: string;
  nom: string;
}

export async function fetchEntreprises(): Promise<Entreprise[]> {
  const res = await apiFetch('/entreprises?perPage=100');
  if (!res.ok) {
    throw new Error('Erreur lors du chargement des entreprises');
  }
  const data = await res.json();
  // API returns paginated { data: [...], meta: {...} }
  return data.data || data;
}

export async function createEntreprise(
  payload: CreateEntreprisePayload
): Promise<{ id: string }> {
  const res = await apiFetch('/entreprises', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.message || "Erreur lors de la cr\u00e9ation de l\u2019entreprise"
    );
  }
  return res.json();
}

// --- Mandats ---

export interface Mandat {
  id: string;
  titrePoste: string;
  entreprise?: { id: string; nom: string };
  statut: string;
}

export async function fetchMandats(): Promise<Mandat[]> {
  const res = await apiFetch('/mandats?perPage=100&statut=EN_COURS');
  if (!res.ok) {
    throw new Error('Erreur lors du chargement des mandats');
  }
  const data = await res.json();
  return data.data || data;
}

// --- Candidatures ---

export interface CreateCandidaturePayload {
  candidatId: string;
  mandatId: string;
  stage?: string;
  notes?: string;
}

export async function createCandidature(
  payload: CreateCandidaturePayload
): Promise<{ id: string }> {
  const res = await apiFetch('/candidatures', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.message || 'Erreur lors de la cr\u00e9ation de la candidature'
    );
  }
  return res.json();
}
