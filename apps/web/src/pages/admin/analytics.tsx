import { useState, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Phone, Send, UserPlus, Presentation, FileText, DollarSign,
  Calendar, ChevronDown,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth-store';

// ─── BRAND TOKENS ───────────────────────────────────
const NAVY = '#22177A';
const INK = '#1A1533';
const FAINT = '#9A96AE';
const MUTED = '#8A8699';
const GREEN = '#2C6B3F';
const CARD_BORDER = '1px solid rgba(34,23,122,.08)';
const CARD_SHADOW = '0 1px 2px rgba(34,23,122,.04)';
const MANROPE = "'Manrope', sans-serif";
const ARCHIVO = "'Archivo Black', sans-serif";

// fr-FR thousands separator is a (narrow) no-break space -> normalise to a normal space
const fmt = (v: number) => v.toLocaleString('fr-FR').replace(/[  ]/g, ' ');

// Palette avatars (le leaderboard ne fournit pas de couleur)
const AV: [string, string][] = [
  ['#E6E9AF', '#22177A'], ['#8E7CC3', '#fff'], ['#22177A', '#E6E9AF'],
  ['#3B9A54', '#fff'], ['#2A6BD8', '#fff'], ['#C9A227', '#fff'],
];
const initials = (name: string) => name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

type Period = 'week' | 'month' | 'quarter';

interface Scorecard { value: number; trend: number; }
interface StatsData {
  scorecards: { appels: Scorecard; rdv: Scorecard; candidats: Scorecard; mandats: Scorecard; ca: Scorecard; tauxPresentation: Scorecard };
  rdvByType: { type: string; count: number; color: string }[];
  funnel: { stage: string; count: number }[];
  revenueByMonth: { month: string; facture: number; encaisse: number }[];
}
interface LbEntry {
  userId: string; nom: string; prenom: string | null;
  stats: { placements: number; revenue: number; calls: number; emails: number; meetings: number; activeCandidatures: number };
  rank: number;
}

const RDV_META: Record<string, { label: string; accent: string; bg: string }> = {
  MEETING: { label: 'Meetings', accent: '#2A6BD8', bg: '#E8EEF9' },
  APPEL: { label: 'Appels', accent: NAVY, bg: 'rgba(34,23,122,.08)' },
  EMAIL: { label: 'Emails', accent: '#3B9A54', bg: '#EAF3EC' },
};

export default function AnalyticsPage() {
  const { user } = useAuthStore();
  const realAdmin = user?.role === 'ADMIN';
  const [period, setPeriod] = useState<Period>('month');
  const [isAdmin, setIsAdmin] = useState<boolean>(!!realAdmin);
  const [who, setWho] = useState<string>(user?.id || '');

  const scope = isAdmin ? (who || user?.id || '') : (user?.id || '');
  const { data: statsResp } = useQuery({
    queryKey: ['analytics-stats', period, scope],
    queryFn: () => api.get<{ data: StatsData }>(`/stats?period=${period}${scope ? `&userId=${scope}` : ''}`),
    enabled: !!scope,
  });
  const { data: lbResp } = useQuery({
    queryKey: ['analytics-lb', period],
    queryFn: () => api.get<{ leaderboard: LbEntry[] }>(`/stats/leaderboard?period=${period}`),
    enabled: isAdmin,
  });

  const people = (lbResp?.leaderboard || []).map((e) => ({ id: e.userId, name: `${e.prenom || ''} ${e.nom}`.trim() }));
  const periodLabel = period === 'week' ? 'cette semaine' : period === 'quarter' ? 'ce trimestre' : 'ce mois';

  const v = useMemo(() => {
    const sd = statsResp?.data;
    const sc = sd?.scorecards;
    const lb = lbResp?.leaderboard || [];
    const funnel = sd?.funnel || [];
    const fStage = (s: string) => funnel.find((f) => f.stage === s)?.count || 0;
    const presn = fStage('ENTRETIEN_CLIENT') + fStage('OFFRE') + fStage('PLACE');
    const calls = sc?.appels.value || 0;
    const mandats = sc?.mandats.value || 0;
    const caNum = sc?.ca.value || 0;
    const places = fStage('PLACE');

    const pctOf = (n: number, t: number) => (t > 0 ? Math.min(100, Math.round((n / t) * 100)) : 0);
    const trendStr = (t?: number) => (t == null ? '—' : (t > 0 ? '+' : '') + t + ' %');
    const trendCol = (t?: number) => (t && t > 0 ? GREEN : t && t < 0 ? '#B3261E' : FAINT);

    const kpis = [
      { label: 'Calls', value: String(calls), delta: trendStr(sc?.appels.trend), deltaColor: trendCol(sc?.appels.trend), pct: pctOf(calls, 200), bar: '#C9A227', note: 'objectif 200', iconBg: '#F2F3D8', icon: <Phone size={14} color={NAVY} strokeWidth={2} /> },
      { label: 'Push prospection', value: '—', delta: 'à venir', deltaColor: FAINT, pct: 0, bar: '#8E7CC3', note: 'via List Push', iconBg: '#EDEAF9', icon: <Send size={14} color="#5B4B9E" strokeWidth={2} /> },
      { label: 'Push shortlist', value: '—', delta: 'à venir', deltaColor: FAINT, pct: 0, bar: '#3B9A54', note: 'via List Push', iconBg: '#EAF3EC', icon: <UserPlus size={14} color={GREEN} strokeWidth={2} /> },
      { label: 'Présentations', value: String(presn), delta: 'pipeline', deltaColor: FAINT, pct: pctOf(presn, 12), bar: '#2A6BD8', note: 'présentés au client', iconBg: '#E8EEF9', icon: <Presentation size={14} color="#2A4A8A" strokeWidth={2} /> },
      { label: 'Mandats', value: String(mandats), delta: trendStr(sc?.mandats.trend), deltaColor: trendCol(sc?.mandats.trend), pct: pctOf(mandats, 5), bar: '#E08A2B', note: places + ' placements', iconBg: '#FBF3E7', icon: <FileText size={14} color="#8A6A2E" strokeWidth={2} /> },
      { label: 'CA facturé', value: fmt(caNum) + ' €', delta: trendStr(sc?.ca.trend), deltaColor: trendCol(sc?.ca.trend), pct: pctOf(caNum, 20000), bar: NAVY, note: 'objectif 20 000 €', iconBg: '#E6E9AF', icon: <DollarSign size={14} color={NAVY} strokeWidth={2} /> },
    ];

    const rdvRaw = sd?.rdvByType || [];
    const rdvTotal = rdvRaw.reduce((a, r) => a + r.count, 0);
    const rdvIcon = (t: string) => t === 'MEETING'
      ? <Calendar size={14} color="#2A4A8A" strokeWidth={2} />
      : t === 'APPEL'
        ? <Phone size={14} color={NAVY} strokeWidth={2} />
        : <Send size={14} color={GREEN} strokeWidth={2} />;
    const rdvTypes = rdvRaw.map((r) => {
      const meta = RDV_META[r.type] || { label: r.type, accent: NAVY, bg: 'rgba(34,23,122,.08)' };
      return {
        label: meta.label, n: r.count, accent: meta.accent, bg: meta.bg, icon: rdvIcon(r.type),
        share: rdvTotal ? Math.round((r.count / rdvTotal) * 100) + ' %' : '—',
        pct: rdvTotal ? Math.round((r.count / rdvTotal) * 100) : 0,
      };
    });

    const team = lb.map((e, i) => ({
      name: `${e.prenom || ''} ${e.nom}`.trim(), role: 'Recruteur', ini: initials(`${e.prenom || ''} ${e.nom}`),
      avBg: AV[i % AV.length][0], avFg: AV[i % AV.length][1],
      calls: String(e.stats.calls), pushProsp: '—', pushShort: '—', presn: '—',
      rdv: String(e.stats.meetings), places: String(e.stats.placements), ca: fmt(e.stats.revenue) + ' €',
    }));
    const sumLb = (fn: (e: LbEntry) => number) => lb.reduce((a, e) => a + fn(e), 0);
    const tot = {
      calls: String(sumLb((e) => e.stats.calls)), pushProsp: '—', pushShort: '—', presn: '—',
      rdv: String(sumLb((e) => e.stats.meetings)), places: String(sumLb((e) => e.stats.placements)),
      ca: fmt(sumLb((e) => e.stats.revenue)) + ' €',
    };

    const rev = sd?.revenueByMonth || [];
    const last6 = rev.slice(-6);
    const maxMo = Math.max(1, ...last6.map((m) => m.facture));
    const months = last6.map((m, i) => ({
      name: m.month,
      label: (m.facture / 1000).toFixed(m.facture >= 10000 ? 0 : 1).replace('.', ',') + 'k',
      h: Math.round((m.facture / maxMo) * 100),
      bg: i === last6.length - 1 ? NAVY : 'rgba(34,23,122,.16)',
    }));
    const caTotal = fmt(last6.reduce((a, m) => a + m.facture, 0)) + ' €';

    const selName = isAdmin
      ? (people.find((p) => p.id === who)?.name || `${user?.prenom || ''} ${user?.nom || ''}`.trim())
      : `${user?.prenom || ''} ${user?.nom || ''}`.trim();

    return {
      showTeam: isAdmin,
      showRoles: false,
      title: selName || 'Mon activité',
      subtitle: (isAdmin ? 'Vue admin' : 'Recruteur') + ' · ' + periodLabel,
      periodLabel, caTotal,
      kpis, rdvTypes, rdvTotal, team, tot, months, hats: [] as any[],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsResp, lbResp, period, who, isAdmin, user]);

  const segBtn = (active: boolean): React.CSSProperties => ({
    fontFamily: MANROPE, fontWeight: 700, fontSize: 12.5, padding: '8px 15px', borderRadius: 8,
    border: 'none', cursor: 'pointer',
    ...(active
      ? { background: '#fff', color: NAVY, boxShadow: '0 4px 12px -8px rgba(34,23,122,.6)' }
      : { background: 'transparent', color: MUTED }),
  });

  return (
    <div style={{ fontFamily: MANROPE, color: INK }}>
      <style>{`
        @keyframes anaRise { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:none; } }
        @keyframes anaBarFill { from { width:0 !important; } }
        @keyframes anaGrow { from { transform:scaleY(0); } to { transform:scaleY(1); } }
        .ana-rise { animation: anaRise .66s cubic-bezier(.16,1,.3,1) both; }
        .ana-card { transition: transform .18s cubic-bezier(.16,1,.3,1), box-shadow .18s ease, border-color .18s ease; }
        .ana-card:hover { transform: translateY(-3px); box-shadow: 0 18px 36px -26px rgba(34,23,122,.5); border-color: rgba(34,23,122,.18); }
        .ana-bar { animation: anaBarFill .9s cubic-bezier(.16,1,.3,1) both; }
        .ana-grow { transform-origin: bottom; animation: anaGrow .8s cubic-bezier(.16,1,.3,1) both; }
        .ana-row { transition: background .14s ease; }
        .ana-row:hover { background: #FAFAF2; }
        .ana-scroll::-webkit-scrollbar { width:7px; height:7px; }
        .ana-scroll::-webkit-scrollbar-thumb { background: rgba(34,23,122,.16); border-radius:999px; }
        @media (prefers-reduced-motion: reduce) { .ana-rise, .ana-bar, .ana-grow { animation-duration:.001s !important; } }
      `}</style>

      {/* HEADER */}
      <div className="ana-rise" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: FAINT, fontWeight: 600 }}>Analytics</div>
          <h1 style={{ fontFamily: ARCHIVO, fontSize: 30, letterSpacing: '-0.02em', color: INK, marginTop: 5 }}>{v.title}</h1>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 5 }}>{v.subtitle}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, background: '#EFEFE6', borderRadius: 11, padding: 4 }}>
            {([['week', 'Semaine'], ['month', 'Mois'], ['quarter', 'Trimestre']] as [Period, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setPeriod(k)} style={segBtn(period === k)}>{label}</button>
            ))}
          </div>
          {realAdmin && (
            <div style={{ display: 'flex', gap: 4, background: '#EFEFE6', borderRadius: 11, padding: 4 }}>
              {([['admin', 'Admin'], ['rec', 'Recruteur']] as ['admin' | 'rec', string][]).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => {
                    setIsAdmin(k === 'admin');
                    setWho(user?.id || '');
                  }}
                  style={segBtn((isAdmin ? 'admin' : 'rec') === k)}
                >{label}</button>
              ))}
            </div>
          )}
          {isAdmin && people.length > 0 && (
            <div style={{ position: 'relative' }}>
              <select
                value={who}
                onChange={(e) => setWho(e.target.value)}
                style={{
                  appearance: 'none', fontFamily: MANROPE, fontSize: 13, fontWeight: 700, color: NAVY,
                  background: '#fff', border: '1.5px solid rgba(34,23,122,.18)', borderRadius: 11,
                  padding: '10px 34px 10px 14px', cursor: 'pointer', outline: 'none',
                }}
              >
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown size={13} color={NAVY} strokeWidth={2.4} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
          )}
        </div>
      </div>

      {/* KPI GRID */}
      <div className="ana-scroll" style={{ overflowX: 'auto', marginTop: 20, paddingBottom: 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 13, minWidth: 1270 }}>
          {v.kpis.map((k, i) => (
            <div
              key={k.label}
              className="ana-card ana-rise"
              style={{ background: '#fff', border: CARD_BORDER, borderRadius: 16, padding: '17px 19px', boxShadow: CARD_SHADOW, animationDelay: `${0.06 + i * 0.04}s` }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 9 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: FAINT }}>{k.label}</span>
                <span style={{ width: 26, height: 26, borderRadius: 8, background: k.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{k.icon}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 13 }}>
                <span style={{ fontFamily: MANROPE, fontWeight: 800, fontSize: 27, letterSpacing: '-.03em', color: INK, lineHeight: 1 }}>{k.value}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: k.deltaColor }}>{k.delta}</span>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: 'rgba(34,23,122,.07)', marginTop: 13, overflow: 'hidden' }}>
                <span className="ana-bar" style={{ display: 'block', width: `${k.pct}%`, height: '100%', borderRadius: 999, background: k.bar }} />
              </div>
              <div style={{ fontSize: 11, color: FAINT, marginTop: 7 }}>{k.note}</div>
            </div>
          ))}
        </div>
      </div>

      {/* RENDEZ-VOUS PAR TYPE */}
      <div className="ana-rise" style={{ marginTop: 22, animationDelay: '.2s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <span style={{ fontFamily: MANROPE, fontWeight: 800, fontSize: 17, letterSpacing: '-.015em', color: INK }}>Rendez-vous par type</span>
          <span style={{ fontSize: 12, color: MUTED }}>{v.rdvTotal} au total · {v.periodLabel}</span>
        </div>
        <div className="ana-scroll" style={{ overflowX: 'auto', paddingBottom: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 13, minWidth: 840 }}>
            {v.rdvTypes.map((r, i) => (
              <div key={r.label} className="ana-card ana-rise" style={{ position: 'relative', overflow: 'hidden', background: '#fff', border: CARD_BORDER, borderRadius: 16, padding: '17px 19px', boxShadow: CARD_SHADOW, animationDelay: `${0.1 + i * 0.04}s` }}>
                <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: r.accent }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 9, background: r.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{r.icon}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#4A4568' }}>{r.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginTop: 12 }}>
                  <span style={{ fontFamily: MANROPE, fontWeight: 800, fontSize: 25, letterSpacing: '-.03em', color: INK, lineHeight: 1 }}>{r.n}</span>
                  <span style={{ fontSize: 11.5, color: FAINT }}>{r.share}</span>
                </div>
                <div style={{ height: 5, borderRadius: 999, background: 'rgba(34,23,122,.07)', marginTop: 12, overflow: 'hidden' }}>
                  <span className="ana-bar" style={{ display: 'block', width: `${r.pct}%`, height: '100%', borderRadius: 999, background: r.accent }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TABLEAU PAR RECRUTEUR — admin only */}
      {v.showTeam && (
        <div className="ana-rise" style={{ marginTop: 26, animationDelay: '.26s' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <span style={{ fontFamily: MANROPE, fontWeight: 800, fontSize: 17, letterSpacing: '-.015em', color: INK }}>Par recruteur</span>
            <span style={{ fontSize: 12, color: MUTED }}>vue administrateur</span>
          </div>
          <div className="ana-scroll" style={{ background: '#fff', border: CARD_BORDER, borderRadius: 16, overflowX: 'auto', boxShadow: CARD_SHADOW }}>
            <TeamHeader />
            {v.team.map((t) => (
              <div key={t.name} className="ana-row" style={{ display: 'grid', gridTemplateColumns: TEAM_COLS, gap: 12, alignItems: 'center', padding: '13px 20px', borderBottom: '1px solid rgba(34,23,122,.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                  <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: t.avBg, color: t.avFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MANROPE, fontWeight: 800, fontSize: 11 }}>{t.ini}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: FAINT }}>{t.role}</div>
                  </div>
                </div>
                <Td color={INK}>{t.calls}</Td>
                <Td color="#5B4B9E">{t.pushProsp}</Td>
                <Td color={GREEN}>{t.pushShort}</Td>
                <Td color={INK}>{t.presn}</Td>
                <Td color={INK}>{t.rdv}</Td>
                <span style={{ textAlign: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 26, fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: '3px 9px', background: '#EAF3EC', color: GREEN }}>{t.places}</span>
                </span>
                <span style={{ textAlign: 'right', fontFamily: MANROPE, fontWeight: 800, fontSize: 13.5, color: NAVY }}>{t.ca}</span>
              </div>
            ))}
            {/* Total row — lime */}
            <div style={{ display: 'grid', gridTemplateColumns: TEAM_COLS, gap: 12, alignItems: 'center', padding: '13px 20px', background: '#F2F3D8' }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: NAVY }}>Total équipe</span>
              <TotTd>{v.tot.calls}</TotTd>
              <TotTd>{v.tot.pushProsp}</TotTd>
              <TotTd>{v.tot.pushShort}</TotTd>
              <TotTd>{v.tot.presn}</TotTd>
              <TotTd>{v.tot.rdv}</TotTd>
              <TotTd>{v.tot.places}</TotTd>
              <span style={{ textAlign: 'right', fontFamily: MANROPE, fontWeight: 800, fontSize: 14, color: NAVY }}>{v.tot.ca}</span>
            </div>
          </div>
        </div>
      )}

      {/* CA FACTURÉ PAR MOIS */}
      <div className="ana-rise" style={{ marginTop: 26, animationDelay: '.32s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <span style={{ fontFamily: MANROPE, fontWeight: 800, fontSize: 17, letterSpacing: '-.015em', color: INK }}>CA facturé par mois</span>
          <span style={{ fontSize: 12, color: MUTED }}>{v.caTotal} sur 6 mois</span>
        </div>
        <div style={{ background: '#fff', border: CARD_BORDER, borderRadius: 16, padding: '22px 24px 18px', boxShadow: CARD_SHADOW }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 150 }}>
            {v.months.map((m) => (
              <div key={m.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: NAVY }}>{m.label}</span>
                <div className="ana-grow" style={{ width: '100%', borderRadius: '7px 7px 0 0', background: m.bg, height: `${m.h}%` }} />
                <span style={{ fontSize: 10.5, color: FAINT }}>{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TEAM TABLE HELPERS ─────────────────────────────
const TEAM_COLS = 'minmax(150px,1.4fr) repeat(6, minmax(72px,.68fr)) minmax(100px,.9fr)';

function TeamHeader() {
  const th: React.CSSProperties = { textAlign: 'center' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: TEAM_COLS, gap: 12, padding: '12px 20px', borderBottom: '1.5px solid rgba(34,23,122,.1)', background: '#FCFCF5', fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: FAINT }}>
      <span>Recruteur</span>
      <span style={th}>Calls</span>
      <span style={th}>Push prosp.</span>
      <span style={th}>Push short.</span>
      <span style={th}>Présent.</span>
      <span style={th}>RDV</span>
      <span style={th}>Placés</span>
      <span style={{ textAlign: 'right' }}>CA facturé</span>
    </div>
  );
}

function Td({ children, color }: { children: ReactNode; color: string }) {
  return <span style={{ textAlign: 'center', fontFamily: MANROPE, fontWeight: 800, fontSize: 13.5, color }}>{children}</span>;
}

function TotTd({ children }: { children: ReactNode }) {
  return <span style={{ textAlign: 'center', fontFamily: MANROPE, fontWeight: 800, fontSize: 14, color: NAVY }}>{children}</span>;
}
