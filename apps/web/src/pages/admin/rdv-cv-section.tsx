import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { CalendarCheck, CalendarPlus, FileText } from 'lucide-react';
import { api } from '../../lib/api-client';
import { t } from '../../lib/i18n';

// Compteurs RDV pris / RDV effectués / CV soumis au client (page Analytics).

const NAVY = '#22177A';
const INK = '#1A1533';
const FAINT = '#9A96AE';
const MUTED = '#8A8699';
const GREEN = '#2C6B3F';
const RED = '#B3261E';
const CARD_BORDER = '1px solid rgba(34,23,122,.08)';
const CARD_SHADOW = '0 1px 2px rgba(34,23,122,.04)';
const MANROPE = "'Manrope', sans-serif";

type Kind = 'RDV_CLIENT' | 'PRESENTATION' | 'INTERVIEW';
interface Counters {
  pris: number;
  prisParType: Record<Kind, number>;
  effectues: number;
  effectuesParType: Record<Kind, number>;
  noShow: number;
  annules: number;
  aConfirmer: number;
  aVenir: number;
  cvSoumis: number;
}
interface UserCounters extends Counters { userId: string; name: string; fonction: string }
interface RdvStats {
  selected: UserCounters | null;
  total: Counters;
  users: UserCounters[];
}

const KIND_LABEL: Record<Kind, string> = {
  RDV_CLIENT: 'RDV clients',
  PRESENTATION: 'Présentations',
  INTERVIEW: 'Entretiens candidats',
};

export function RdvCvSection({
  period, scope, isAdminView, periodLabel, meId,
}: {
  period: 'week' | 'month' | 'quarter';
  scope: string;
  isAdminView: boolean;
  periodLabel: string;
  meId?: string;
}) {
  const { data } = useQuery({
    queryKey: ['analytics-rdv', period, scope],
    queryFn: () => api.get<{ data: RdvStats }>(`/stats/rdv?period=${period}${scope ? `&userId=${scope}` : ''}`),
    enabled: !!scope,
  });
  const stats = data?.data;
  const c = stats?.selected;
  const team = [...(stats?.users || [])].sort((a, b) => b.pris - a.pris || b.effectues - a.effectues);

  const tenus = (c?.effectues || 0) + (c?.noShow || 0);
  const presence = tenus ? Math.round(((c?.effectues || 0) / tenus) * 100) : null;

  const card = (children: React.ReactNode, delay: number) => (
    <div className="ana-card ana-rise" style={{ background: '#fff', border: CARD_BORDER, borderRadius: 16, padding: '18px 20px', boxShadow: CARD_SHADOW, animationDelay: `${delay}s` }}>
      {children}
    </div>
  );
  const head = (label: string, icon: React.ReactNode, bg: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 9 }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: '#4A4568' }}>{t(label)}</span>
      <span style={{ width: 28, height: 28, borderRadius: 9, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
    </div>
  );
  const big = (n: number) => (
    <div style={{ fontFamily: MANROPE, fontWeight: 800, fontSize: 32, letterSpacing: '-.03em', color: INK, lineHeight: 1, marginTop: 14 }}>{n}</div>
  );
  const line = (label: string, n: number, color = '#4A4568') => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: MUTED, marginTop: 7 }}>
      <span>{t(label)}</span>
      <span style={{ fontWeight: 800, color }}>{n}</span>
    </div>
  );

  return (
    <div className="ana-rise" style={{ marginTop: 22, animationDelay: '.08s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: MANROPE, fontWeight: 800, fontSize: 17, letterSpacing: '-.015em', color: INK }}>{t('RDV et CV envoyés')}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {!!c?.aConfirmer && c.userId === meId && (
            <Link to="/rdv/classer" style={{ fontSize: 12, fontWeight: 800, color: NAVY, background: '#E6E9AF', borderRadius: 999, padding: '5px 12px', textDecoration: 'none' }}>
              {t('Confirmer mes RDV')} · {c.aConfirmer}
            </Link>
          )}
          <span style={{ fontSize: 12, color: MUTED }}>{periodLabel}</span>
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 13 }}>
        {card(<>
          {head('RDV pris', <CalendarPlus size={14} color="#2A4A8A" strokeWidth={2} />, '#E8EEF9')}
          {big(c?.pris || 0)}
          <div style={{ marginTop: 6 }}>
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => line(KIND_LABEL[k], c?.prisParType[k] || 0))}
          </div>
        </>, 0.1)}

        {card(<>
          {head('RDV effectués', <CalendarCheck size={14} color={GREEN} strokeWidth={2} />, '#EAF3EC')}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            {big(c?.effectues || 0)}
            {presence != null && <span style={{ fontSize: 12, fontWeight: 700, color: presence >= 80 ? GREEN : presence >= 60 ? '#8A6A2E' : RED }}>{presence} % {t('taux de présence')}</span>}
          </div>
          <div style={{ marginTop: 6 }}>
            {line('No-show', c?.noShow || 0, (c?.noShow || 0) > 0 ? RED : '#4A4568')}
            {line('À confirmer', c?.aConfirmer || 0)}
            {line('Annulés', c?.annules || 0)}
            {line('RDV à venir', c?.aVenir || 0)}
          </div>
        </>, 0.14)}

        {card(<>
          {head('CV soumis au client', <FileText size={14} color="#5B4B9E" strokeWidth={2} />, '#EDEAF9')}
          {big(c?.cvSoumis || 0)}
          <div style={{ fontSize: 12, color: FAINT, marginTop: 10, lineHeight: 1.45 }}>{t('CV joints, profils envoyés et passages en « Envoi client »')}</div>
        </>, 0.18)}
      </div>

      {isAdminView && team.length > 0 && (
        <div className="ana-scroll" style={{ marginTop: 14, background: '#fff', border: CARD_BORDER, borderRadius: 16, overflowX: 'auto', boxShadow: CARD_SHADOW }}>
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '12px 20px', borderBottom: '1.5px solid rgba(34,23,122,.1)', background: '#FCFCF5', fontSize: 11.5, fontWeight: 800, color: FAINT, minWidth: 640 }}>
            <span>{t('Collaborateur')}</span>
            {['Pris', 'Effectués', 'No-show', 'À confirmer', 'CV soumis'].map((h) => <span key={h} style={{ textAlign: 'center' }}>{t(h)}</span>)}
          </div>
          {team.map((u) => (
            <div key={u.userId} className="ana-row" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, alignItems: 'center', padding: '11px 20px', borderBottom: '1px solid rgba(34,23,122,.05)', minWidth: 640, background: u.userId === scope ? '#F2F3D8' : 'transparent' }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</span>
              <Num n={u.pris} />
              <Num n={u.effectues} color={GREEN} />
              <Num n={u.noShow} color={u.noShow ? RED : undefined} />
              <Num n={u.aConfirmer} />
              <Num n={u.cvSoumis} color={NAVY} />
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, alignItems: 'center', padding: '12px 20px', background: '#F2F3D8', minWidth: 640 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: NAVY }}>{t('Total équipe')}</span>
            <Num n={stats!.total.pris} color={NAVY} />
            <Num n={stats!.total.effectues} color={NAVY} />
            <Num n={stats!.total.noShow} color={NAVY} />
            <Num n={stats!.total.aConfirmer} color={NAVY} />
            <Num n={stats!.total.cvSoumis} color={NAVY} />
          </div>
        </div>
      )}
    </div>
  );
}

const GRID = 'minmax(150px,1.6fr) repeat(5,minmax(70px,.7fr))';

function Num({ n, color }: { n: number; color?: string }) {
  return <span style={{ textAlign: 'center', fontFamily: MANROPE, fontWeight: 800, fontSize: 13.5, color: color || '#4A4568' }}>{n}</span>;
}
