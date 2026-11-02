// Petit sélecteur FR / EN pour les pages publiques (sans menu profil).
// Le changement de langue recharge la page (voir lib/i18n).
import type { CSSProperties } from 'react';
import { lang, setLang, t, type Lang } from '../../lib/i18n';

interface LangSwitchProps {
  /** Couleur de la langue active (défaut : bleu HumanUp). */
  activeColor?: string;
  /** Couleur des langues inactives et du séparateur. */
  color?: string;
  /** Taille de police en px (défaut 12). */
  size?: number;
  style?: CSSProperties;
  className?: string;
}

const LANGS: Lang[] = ['fr', 'en'];

export function LangSwitch({ activeColor = '#22177A', color = '#6E6A85', size = 12, style, className }: LangSwitchProps) {
  return (
    <div role="group" aria-label={t('Langue')} className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0, ...style }}>
      {LANGS.map((l, i) => {
        const on = l === lang;
        return (
          <span key={l} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {i > 0 && <span aria-hidden style={{ color, opacity: 0.5, fontSize: size, padding: '0 1px' }}>/</span>}
            <button
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={on}
              aria-label={l === 'fr' ? 'Français' : 'English'}
              lang={l}
              style={{ fontSize: size, fontWeight: on ? 800 : 600, letterSpacing: '.04em', color: on ? activeColor : color, background: 'transparent', border: 'none', borderRadius: 6, padding: '4px 5px', cursor: on ? 'default' : 'pointer', fontFamily: 'inherit' }}
            >
              {l.toUpperCase()}
            </button>
          </span>
        );
      })}
    </div>
  );
}
export default LangSwitch;
