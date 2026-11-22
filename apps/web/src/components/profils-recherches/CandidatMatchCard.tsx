import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api-client';
import { t } from '../../lib/i18n';
import { Chip, FONCTION_LABEL, SENIORITE_LABEL, SEGMENT_LABEL, MOTION_LABEL, type Profil } from './shared';

type Reason = { code: string; items?: string[]; value?: string; candidate?: string };

function reasonText(r: Reason): string {
  const list = (m?: Record<string, string>) => (r.items ?? []).map(x => m?.[x] ?? x).join(', ');
  const sen = (k?: string) => SENIORITE_LABEL[k ?? ''] ?? '';
  switch (r.code) {
    case 'technos': return t('Technos en commun : {v}', { v: list() });
    case 'segments': return t('Même type de clients : {v}', { v: list(SEGMENT_LABEL) });
    case 'secteurs': return t('Secteurs déjà vendus : {v}', { v: list() });
    case 'acheteur': return t('A déjà vendu à : {v}', { v: list() });
    case 'motion': return t('Même motion : {v}', { v: list(MOTION_LABEL) });
    case 'cycle': return t('Cycle de vente comparable ({v})', { v: r.value ?? '' });
    case 'seniorite': return t('Séniorité alignée ({v})', { v: sen(r.value) });
    case 'seniorite_proche': return t('Séniorité proche (candidat {c}, profil {v})', { c: sen(r.candidate), v: sen(r.value) });
    case 'remote': return t('Poste en télétravail complet');
    case 'ville': return t('Même ville ({v})', { v: r.value ?? '' });
    case 'pays': return t('Même pays ({v})', { v: r.value ?? '' });
    default: return r.code;
  }
}

interface MatchResp {
  candidate: { id: string; eligible: boolean };
  matches: Array<{ score: number; reasons: Reason[]; profile: Profil }>;
}

/** Profils recherchés qui collent à un candidat S-Tier, niveau A ou A-Player. */
export default function CandidatMatchCard({ candidatId, card, h2 }: { candidatId: string; card: React.CSSProperties; h2: React.CSSProperties }) {
  const navigate = useNavigate();
  const [all, setAll] = useState(false);
  const { data } = useQuery({ queryKey: ['profils-recherches', 'match', candidatId], queryFn: () => api.get<MatchResp>(`/profils-recherches/match/${candidatId}`), staleTime: 60_000 });
  if (!data?.candidate.eligible) return null;
  const list = all ? data.matches : data.matches.slice(0, 4);
  return (
    <div style={card}>
      <div style={h2}>{t('Profils recherchés qui collent')}</div>
      {data.matches.length === 0 && <div style={{ fontSize: 13, color: '#8A8699', marginTop: 8 }}>{t('Aucun profil recherché ne correspond pour le moment.')}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {list.map(m => (
          <div key={m.profile.id} onClick={() => navigate(`/entreprises/${m.profile.company.id}?onglet=profils`)} style={{ cursor: 'pointer', padding: '10px 12px', borderRadius: 11, background: '#FBFBF3', border: '1px solid rgba(34,23,122,.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: '#1A1533', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.profile.company.name} · {m.profile.intitule_type}</span>
              <Chip>{FONCTION_LABEL[m.profile.fonction]}</Chip>
            </div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12, color: '#4A4568', lineHeight: 1.5 }}>
              {m.reasons.map((r, i) => <li key={i}>{reasonText(r)}</li>)}
            </ul>
          </div>
        ))}
      </div>
      {data.matches.length > 4 && <button onClick={() => setAll(a => !a)} style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: '#22177A', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{all ? t('Voir moins') : t('Voir les {n}', { n: data.matches.length })}</button>}
    </div>
  );
}
