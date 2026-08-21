import { createHash } from 'node:crypto';

/**
 * Résout la photo d'une personne pour l'ATS.
 *  1. Une URL de photo fournie (ex. photo LinkedIn captée par l'extension) → utilisée telle quelle.
 *  2. Sinon, si un email est connu → Gravatar SI la personne en a un (vraie photo).
 *     (`d=404` : Gravatar répond 404 s'il n'y a pas d'avatar personnalisé → on ne met rien,
 *      l'UI affiche alors les initiales.)
 * Renvoie null si aucune vraie photo n'est trouvée (pas de faux avatar généré).
 */
export async function resolvePersonPhoto(opts: { photoUrl?: string | null; email?: string | null }): Promise<string | null> {
  const url = (opts.photoUrl || '').trim();
  if (/^https?:\/\//i.test(url)) return url;

  const email = (opts.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return null;

  try {
    const hash = createHash('md5').update(email).digest('hex');
    const probe = `https://www.gravatar.com/avatar/${hash}?d=404&s=256`;
    const res = await fetch(probe, { method: 'GET' });
    if (res.ok) return `https://www.gravatar.com/avatar/${hash}?s=256`;
  } catch { /* réseau indispo → on abandonne proprement */ }
  return null;
}
