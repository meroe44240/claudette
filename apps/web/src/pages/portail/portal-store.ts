/**
 * Session du portail client : partagée entre onglets (le lien d'un email de
 * mention s'ouvre dans un nouvel onglet), avec repli si le stockage est bloqué.
 */
const KEYS = ['portal_token', 'portal_mandat_id', 'portal_email', 'portal_last_mandat'];

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export const portalStore = {
  get(key: string): string | null {
    return safe(() => localStorage.getItem(key), null) ?? safe(() => sessionStorage.getItem(key), null);
  },
  set(key: string, value: string) {
    if (!safe(() => { localStorage.setItem(key, value); return true; }, false)) {
      safe(() => sessionStorage.setItem(key, value), undefined);
    }
  },
  clear() {
    for (const k of KEYS) {
      safe(() => localStorage.removeItem(k), undefined);
      safe(() => sessionStorage.removeItem(k), undefined);
    }
  },
};

// Jeton encore valable pour ce mandat ? (lecture de l'expiration du JWT, sans vérification de signature)
export function hasValidSession(_mandatId?: string | null): boolean {
  // Un identifiant donne accès à toutes les offres de l'entreprise : le jeton suffit.
  const token = portalStore.get('portal_token');
  if (!token) return false;
  const payload = safe(() => JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))), null as any);
  return !!payload?.exp && payload.exp * 1000 > Date.now() + 60_000;
}
