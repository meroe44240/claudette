// HumanUp ATS - service worker
// Quand un profil LinkedIn est visité, le content script envoie sa photo. Si ce
// profil est déjà un candidat de l'ATS sans photo hébergée, l'ATS la télécharge
// et la garde (les liens LinkedIn expirent). Rien n'est créé : seuls les candidats
// existants sont mis à jour.

const API_BASE_URL = 'https://ats.propium.co/api/v1';

async function storedToken(): Promise<string | null> {
  const s = await chrome.storage.session.get('accessToken');
  return (s.accessToken as string) || null;
}

// Session ouverte dans l'ATS (cookie de rafraîchissement) → nouveau jeton sans se reconnecter.
async function refreshToken(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.accessToken) return null;
    await chrome.storage.session.set({ accessToken: data.accessToken });
    return data.accessToken as string;
  } catch {
    return null;
  }
}

async function post(path: string, body: unknown, token: string): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

// Un même profil n'est envoyé qu'une fois par session du navigateur.
const seen = new Set<string>();

async function profileSeen(linkedinUrl: string, photoUrl: string): Promise<void> {
  if (seen.has(linkedinUrl)) return;
  let token = (await storedToken()) ?? (await refreshToken());
  if (!token) return; // pas connecté à l'ATS : on ne fait rien
  let res = await post('/candidats/photo-linkedin', { linkedinUrl, photoUrl }, token);
  if (res.status === 401) {
    token = await refreshToken();
    if (!token) return;
    res = await post('/candidats/photo-linkedin', { linkedinUrl, photoUrl }, token);
  }
  if (res.ok) seen.add(linkedinUrl);
}

chrome.runtime.onMessage.addListener((message: { type?: string; linkedinUrl?: string; photoUrl?: string }) => {
  if (message?.type === 'PROFILE_SEEN' && message.linkedinUrl && message.photoUrl) {
    void profileSeen(message.linkedinUrl, message.photoUrl).catch(() => undefined);
  }
  return false;
});
