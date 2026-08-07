import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

interface TeamUser { id: string; nom: string | null; prenom: string | null }

interface Props {
  value: string;
  onChange: (value: string, mentionedIds: string[]) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  minHeight?: number;
}

function fullName(u: TeamUser) { return `${u.prenom || ''} ${u.nom || ''}`.trim() || (u.nom || u.prenom || '?'); }

/**
 * Textarea avec mentions @ : taper "@" ouvre une liste des membres de l'équipe.
 * Sélectionner insère "@Prénom Nom". Les IDs mentionnés (membres dont le nom
 * apparaît en @mention dans le texte) sont remontés via onChange -> notif Slack.
 */
export default function MentionTextarea({ value, onChange, placeholder, style, minHeight = 90 }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null); // texte après @ en cours de frappe
  const [active, setActive] = useState(0);

  const { data: team } = useQuery({ queryKey: ['team'], queryFn: () => api.get<TeamUser[]>('/settings/team') });
  const users = team ?? [];

  // IDs des membres effectivement @mentionnés dans le texte
  const mentionedIds = useMemo(() => {
    return users.filter((u) => value.includes(`@${fullName(u)}`)).map((u) => u.id);
  }, [value, users]);

  const suggestions = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return users.filter((u) => fullName(u).toLowerCase().includes(q)).slice(0, 6);
  }, [query, users]);

  const emit = (v: string) => onChange(v, users.filter((u) => v.includes(`@${fullName(u)}`)).map((u) => u.id));

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    const pos = e.target.selectionStart ?? v.length;
    // mot courant depuis le dernier @ jusqu'au curseur (sans espace)
    const before = v.slice(0, pos);
    const m = before.match(/(?:^|\s)@([\p{L} ]{0,30})$/u);
    setQuery(m ? m[1] : null);
    setActive(0);
    emit(v);
  };

  const pick = (u: TeamUser) => {
    const el = ref.current; if (!el) return;
    const pos = el.selectionStart ?? value.length;
    const before = value.slice(0, pos);
    const idx = before.lastIndexOf('@');
    if (idx < 0) return;
    const after = value.slice(pos);
    const inserted = `@${fullName(u)} `;
    const next = value.slice(0, idx) + inserted + after;
    setQuery(null);
    emit(next);
    // repositionne le curseur après l'insertion
    requestAnimationFrame(() => { const p = idx + inserted.length; el.focus(); el.setSelectionRange(p, p); });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (query === null || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(suggestions[active]); }
    else if (e.key === 'Escape') { setQuery(null); }
  };

  return (
    <div style={{ position: 'relative' }} data-mentioned={mentionedIds.length}>
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        placeholder={placeholder}
        style={{ width: '100%', minHeight, resize: 'vertical', fontFamily: "'Manrope',sans-serif", fontSize: 13.5, lineHeight: 1.55, padding: '11px 13px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none', boxSizing: 'border-box', ...style }}
      />
      {query !== null && suggestions.length > 0 && (
        <div style={{ position: 'absolute', left: 8, bottom: 8, zIndex: 50, minWidth: 210, background: '#fff', border: '1px solid rgba(34,23,122,.14)', borderRadius: 12, boxShadow: '0 20px 44px -20px rgba(34,23,122,.4)', padding: 5 }}>
          {suggestions.map((u, i) => (
            <button key={u.id} type="button" onMouseDown={(e) => { e.preventDefault(); pick(u); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8, border: 'none', background: i === active ? '#F2F3D8' : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#22177A', color: '#E6E9AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, flexShrink: 0 }}>{`${(u.prenom?.[0] || '')}${(u.nom?.[0] || '')}`.toUpperCase()}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1533' }}>{fullName(u)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
