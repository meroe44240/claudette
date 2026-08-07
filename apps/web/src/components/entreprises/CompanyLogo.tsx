import { useState } from 'react';

/** Extrait un domaine propre depuis un champ domaine ou une URL de site. */
export function domainFrom(domaine?: string | null, siteWeb?: string | null): string | null {
  const raw = (domaine || siteWeb || '').trim();
  if (!raw) return null;
  let d = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].split('?')[0].trim();
  if (!d.includes('.')) return null;
  return d.toLowerCase();
}

/**
 * URL du logo/icône de marque à partir du domaine, via DuckDuckGo icons
 * (gratuit, sans clé, fiable). NB : Clearbit (logo.clearbit.com) a été
 * discontinué après le rachat HubSpot — on utilise DuckDuckGo à la place.
 */
export function clearbitLogo(domaine?: string | null, siteWeb?: string | null): string | null {
  const d = domainFrom(domaine, siteWeb);
  return d ? `https://icons.duckduckgo.com/ip3/${d}.ico` : null;
}

function initials(nom: string): string {
  return nom.trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

interface Props {
  nom: string;
  domaine?: string | null;
  siteWeb?: string | null;
  logoUrl?: string | null;
  size?: number;   // largeur
  height?: number; // hauteur (défaut ~0.78*size)
  radius?: number;
}

/**
 * Logo d'entreprise : utilise logoUrl s'il existe, sinon récupère le logo via
 * Clearbit à partir du domaine/site. Retombe sur les initiales si aucun logo.
 */
export default function CompanyLogo({ nom, domaine, siteWeb, logoUrl, size = 36, height, radius = 8 }: Props) {
  const [failed, setFailed] = useState(false);
  const src = logoUrl || clearbitLogo(domaine, siteWeb);
  const w = size;
  const h = height ?? Math.round(size * 0.78);

  if (src && !failed) {
    return (
      <span style={{ flexShrink: 0, width: w, height: h, borderRadius: radius, background: '#fff', border: '1px solid rgba(34,23,122,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 3 }}>
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </span>
    );
  }
  return (
    <span style={{ flexShrink: 0, width: w, height: h, borderRadius: radius, background: '#F2F3D8', border: '1px solid rgba(34,23,122,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: Math.max(10, Math.round(w * 0.3)), color: '#22177A' }}>{initials(nom)}</span>
  );
}
