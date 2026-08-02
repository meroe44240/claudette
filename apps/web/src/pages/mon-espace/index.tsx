import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Briefcase, Users, ListChecks, ChevronRight, Shield } from 'lucide-react';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth-store';
import { usePageTitle } from '../../hooks/usePageTitle';

// ─── TYPES ──────────────────────────────────────────
interface MandatRecruteur {
  id: string;
  titrePoste: string;
  entreprise: { nom: string } | null;
  stageCounts: Record<string, number>;
  totalCandidatures: number;
}
interface RecruteurDashboard { mandats: MandatRecruteur[] }
interface TachesResponse { meta: { total: number } }

const STAGE_LABELS: Record<string, string> = {
  SOURCING: 'Sourcing', CONTACTE: 'Contacté', ENTRETIEN_1: 'Entretien 1', ENVOYE_CLIENT: 'Envoyé client',
  ENTRETIEN_CLIENT: 'Entretien client', OFFRE: 'Offre', PLACE: 'Placé', REFUSE: 'Refusé',
};
const STAGE_PILL: Record<string, { bg: string; fg: string }> = {
  SOURCING: { bg: '#F6F4FB', fg: '#6B5CA5' },
  CONTACTE: { bg: '#F2F5FC', fg: '#3B6FE0' },
  ENTRETIEN_1: { bg: 'rgba(34,23,122,0.08)', fg: '#22177A' },
  ENVOYE_CLIENT: { bg: '#E8EEF9', fg: '#2A4A8A' },
  ENTRETIEN_CLIENT: { bg: '#FBF3E7', fg: '#8A6A2E' },
  OFFRE: { bg: '#F0EFC4', fg: '#8A6A2E' },
  PLACE: { bg: '#EAF3EC', fg: '#2C6B3F' },
  REFUSE: { bg: '#F5EAE7', fg: '#A2402C' },
};
const ROLE_LABELS: Record<string, string> = { ADMIN: 'Administrateur', RECRUTEUR: 'Recruteur', SALES: 'Sales', MANAGER: 'Manager' };
const STAGE_ORDER = ['SOURCING', 'CONTACTE', 'ENTRETIEN_1', 'ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE', 'REFUSE'];

function initials(prenom?: string | null, nom?: string | null) { return `${(prenom?.[0] ?? '')}${(nom?.[0] ?? '')}`.toUpperCase() || 'U'; }

const GRID = '1.6fr 1.2fr 0.8fr 1.7fr';

export default function MonEspacePage() {
  usePageTitle('Mon espace');
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);

  const { data: dashboard } = useQuery({ queryKey: ['dashboard', 'recruteur'], queryFn: () => api.get<RecruteurDashboard>('/dashboard/recruteur') });
  const { data: tachesData } = useQuery({ queryKey: ['mon-espace', 'taches-count'], queryFn: () => api.get<TachesResponse>('/taches?status=todo&perPage=1') });

  const mandats = dashboard?.mandats ?? [];
  const mandatsCount = mandats.length;
  const totalCandidats = mandats.reduce((s, m) => s + m.totalCandidatures, 0);
  const tachesCount = tachesData?.meta?.total ?? 0;
  const fullName = `${user?.prenom ? user.prenom + ' ' : ''}${user?.nom ?? ''}`.trim() || 'Utilisateur';

  const stats = [
    { icon: <Briefcase size={19} color="#22177A" />, value: mandatsCount, label: 'mandats actifs' },
    { icon: <Users size={19} color="#22177A" />, value: totalCandidats, label: 'candidats en cours' },
    { icon: <ListChecks size={19} color="#22177A" />, value: tachesCount, label: 'tâches' },
  ];

  return (
    <div>
      <style>{`
        .mrow{ position:relative; transition:background .16s ease, padding-left .2s cubic-bezier(.16,1,.3,1); }
        .mrow::before{ content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:#22177A; transform:scaleY(0); transition:transform .22s cubic-bezier(.16,1,.3,1); }
        .mrow:hover{ background:#FBFBF3; padding-left:26px; }
        .mrow:hover::before{ transform:scaleY(1); }
      `}</style>

      {/* HEADER */}
      <div style={{ fontSize: 13, color: '#9A96AE', fontWeight: 600 }}>Mon espace</div>
      <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 38, letterSpacing: '-0.035em', color: '#1A1533', marginTop: 4 }}>Mon espace</h1>

      {/* PROFILE */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 26 }}>
        <span style={{ width: 90, height: 90, borderRadius: '50%', background: '#22177A', color: '#E6E9AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black',sans-serif", fontSize: 30, boxShadow: '0 18px 40px -22px rgba(34,23,122,0.6)' }}>{initials(user?.prenom, user?.nom)}</span>
        <div>
          <h2 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 30, letterSpacing: '-0.03em', color: '#1A1533' }}>{fullName}</h2>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 8, fontSize: 13, fontWeight: 700, color: '#22177A', background: '#F0EFC4', borderRadius: 999, padding: '5px 13px' }}>
            <Shield size={13} />{user?.role ? (ROLE_LABELS[user.role] ?? user.role) : 'Membre'}
          </div>
        </div>
      </div>

      {/* STAT CHIPS */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 22 }}>
        {stats.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid rgba(34,23,122,0.08)', borderRadius: 14, padding: '16px 22px', boxShadow: '0 1px 2px rgba(34,23,122,0.04)' }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, background: '#F0EFC4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.icon}</span>
            <div><div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 24, color: '#1A1533' }}>{s.value}</div><div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 1 }}>{s.label}</div></div>
          </div>
        ))}
      </div>

      {/* MES MANDATS */}
      <h3 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 22, letterSpacing: '-0.02em', color: '#1A1533', marginTop: 34 }}>Mes Mandats</h3>
      <div style={{ marginTop: 16, background: '#fff', border: '1px solid rgba(34,23,122,0.08)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 2px rgba(34,23,122,0.04)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14, padding: '14px 22px', background: '#F7F7EE', borderBottom: '1px solid rgba(34,23,122,0.08)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#8A8699' }}>
          <span>Poste</span><span>Entreprise</span><span style={{ textAlign: 'center' }}>Candidats</span><span>Étapes</span>
        </div>
        {mandats.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#8A8699', fontSize: 14 }}>Aucun mandat qui vous est assigné.</div>
        ) : mandats.map(m => {
          const pills = STAGE_ORDER.filter(s => (m.stageCounts[s] ?? 0) > 0).map(s => ({ s, n: m.stageCounts[s] }));
          return (
            <div key={m.id} className="mrow" onClick={() => navigate(`/mandats/${m.id}`)} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14, alignItems: 'center', padding: '15px 22px', borderBottom: '1px solid rgba(34,23,122,0.05)', cursor: 'pointer' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.titrePoste}</span>
              <span style={{ fontSize: 13, color: '#22177A', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.entreprise?.nom || '—'}</span>
              <span style={{ textAlign: 'center' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, borderRadius: 999, padding: '4px 11px', background: 'rgba(34,23,122,0.07)', color: '#22177A' }}><Users size={11} />{m.totalCandidatures}</span></span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {pills.length === 0 ? <span style={{ fontSize: 12, color: '#C4C1D0' }}>—</span> : pills.map(p => {
                    const meta = STAGE_PILL[p.s] ?? { bg: 'rgba(34,23,122,0.06)', fg: '#5A5470' };
                    return <span key={p.s} style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '4px 10px', background: meta.bg, color: meta.fg, whiteSpace: 'nowrap' }}>{STAGE_LABELS[p.s]}: {p.n}</span>;
                  })}
                </span>
                <ChevronRight size={16} color="#C4C1D0" strokeWidth={2.2} style={{ flexShrink: 0 }} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
