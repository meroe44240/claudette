import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { format, differenceInMinutes, isToday as isTodayFn } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  DollarSign, Phone, Calendar, Users, Building2,
  Plus, AlertTriangle, ArrowRight, ChevronDown, Video, Send, Zap,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth-store';
import { usePageTitle } from '../../hooks/usePageTitle';
import Skeleton from '../../components/ui/Skeleton';
import AnimatedCounter from '../../components/ui/AnimatedCounter';
import { categorizeEvents, type CategorizedEvent } from '../../lib/meetingCategorizer';

// ─── TYPES ──────────────────────────────────────────

interface BandeauData {
  emailsNonLus: number;
  mandatsDormants: { count: number; worst: { titre: string; jours: number } | null };
  tachesEnRetard: number;
  rdvAujourdhui: number;
}

interface KpisData {
  caMois: { value: number; delta: number | null };
  appels: { today: number; week: number; moyJour: number };
  rdv: { today: number; week: number; confirmes: number; enAttente: number };
  presentationsMois: number;
  placementsMois: number;
  nouveauxMandats: number;
  candidatsEnProcess: number;
  pipePondere: { value: number; delta: number | null };
}

interface CandidatParStage {
  id: string;
  candidatId: string;
  nom: string;
  prenom: string | null;
  photoUrl: string | null;
}

interface MandatSpa {
  id: string;
  titrePoste: string;
  entreprise: { id: string; nom: string; logoUrl: string | null };
  feeMontantEstime: number | null;
  highestStage: string;
  totalCandidats: number;
  ouvertDepuisJours: number;
  daysSinceActivity: number | null;
  isDormant: boolean;
  candidaturesParStage: Record<string, CandidatParStage[]>;
}

interface StructureKpis { caStructure: number; mandatsActifs: number; candidatsEnProcess: number; pipeStructure: number }

interface SpaData {
  bandeau: BandeauData;
  kpis: KpisData;
  structureKpis: StructureKpis | null;
  mandats: MandatSpa[];
}

interface CalendarEvent {
  id: string; title: string; startTime: string; endTime: string;
  participants?: string[]; status?: string;
}

// ─── CONSTANTES ─────────────────────────────────────

// Objectifs KPI (placeholders — pas encore de modèle "objectifs" en base).
const TARGETS = { appels: 40, rdv: 2, mandats: 2, presentations: 4, ca: 20000 };

// 7 étapes du pipeline (ordre + libellé court + couleur pastille), calées sur la maquette.
const STAGES = [
  { key: 'SOURCING', label: 'Sourcing', dot: '#8E7CC3' },
  { key: 'CONTACTE', label: 'Contacté', dot: '#8E7CC3' },
  { key: 'ENTRETIEN_1', label: 'Entr. 1', dot: '#22177A' },
  { key: 'ENVOYE_CLIENT', label: 'Envoyé', dot: '#2A6BD8' },
  { key: 'ENTRETIEN_CLIENT', label: 'Entr. client', dot: '#E08A2B' },
  { key: 'OFFRE', label: 'Offre', dot: '#C9A227' },
  { key: 'PLACE', label: 'Placé', dot: '#3B9A54' },
];

const STATUT_MAP: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  SOURCING: { label: 'Sourcing', bg: '#F3F0FA', fg: '#5B4B9E', dot: '#8E7CC3' },
  CONTACTE: { label: 'Contacté', bg: '#F3F0FA', fg: '#5B4B9E', dot: '#8E7CC3' },
  ENTRETIEN_1: { label: 'Entretiens', bg: '#E8EEF9', fg: '#2A4A8A', dot: '#2A6BD8' },
  ENVOYE_CLIENT: { label: 'Envoyé client', bg: '#E8EEF9', fg: '#2A4A8A', dot: '#2A6BD8' },
  ENTRETIEN_CLIENT: { label: 'Entr. client', bg: '#FBF3E7', fg: '#8A6A2E', dot: '#E08A2B' },
  OFFRE: { label: 'Offre', bg: '#F0EFC4', fg: '#8A6A2E', dot: '#C9A227' },
  PLACE: { label: 'Placé', bg: '#EAF3EC', fg: '#2C6B3F', dot: '#3B9A54' },
};

// Palette d'avatars (fond / encre)
const AV: Array<[string, string]> = [['#22177A', '#E6E9AF'], ['#E6E9AF', '#22177A'], ['#8E7CC3', '#fff']];

const RANGES = [
  { label: 'Semaine', period: 'week' as const },
  { label: 'Mois', period: 'month' as const },
  { label: 'Trimestre', period: 'month' as const }, // trimestre = mois pour l'instant (pas de bornes trimestre côté API)
];

// ─── HELPERS ────────────────────────────────────────

function formatCurrency(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k€`;
  return `${n}€`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?';
}

// Métadonnées visuelles d'un RDV selon son type détecté
function agendaMeta(type: CategorizedEvent['meetingType']) {
  switch (type) {
    case 'presentation':
      return { label: 'Présentation candidat', accent: '#22177A', tagBg: 'rgba(34,23,122,.09)', tagFg: '#22177A', avBg: '#E6E9AF', avFg: '#22177A', Icon: Send };
    case 'entretien':
      return { label: 'Interview', accent: '#3B9A54', tagBg: '#EAF3EC', tagFg: '#2C6B3F', avBg: '#8E7CC3', avFg: '#fff', Icon: Zap };
    case 'weekly_client':
    case 'nouveau_client':
    case 'commercial':
      return { label: 'Meeting client', accent: '#2A6BD8', tagBg: '#E8EEF9', tagFg: '#2A4A8A', avBg: '#22177A', avFg: '#E6E9AF', Icon: Users };
    default:
      return { label: 'Rendez-vous', accent: '#8E7CC3', tagBg: '#F2F3D8', tagFg: '#6E6A85', avBg: '#8E7CC3', avFg: '#fff', Icon: Calendar };
  }
}

// ═════════════════════════════════════════════════════
// DASHBOARD PAGE
// ═════════════════════════════════════════════════════

export default function DashboardPage() {
  usePageTitle('Dashboard');
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [rangeIdx, setRangeIdx] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [toolsBannerHidden, setToolsBannerHidden] = useState(false);

  const apiPeriod = RANGES[rangeIdx].period;

  const { data: spaData, isLoading } = useQuery({
    queryKey: ['dashboard', 'spa', apiPeriod],
    queryFn: () => api.get<SpaData>(`/dashboard/spa?period=${apiPeriod}&team=false`),
  });

  const { data: calEvents } = useQuery({
    queryKey: ['calendar', 'events'],
    queryFn: () => api.get<{ data: CalendarEvent[] }>('/integrations/calendar/events'),
  });

  // Bandeau "connecte tes outils" : Gmail / Agenda / Allo non connectes
  const { data: integrations } = useQuery({
    queryKey: ['integrations', 'status'],
    queryFn: () =>
      api.get<{ gmail?: { connected: boolean }; calendar?: { connected: boolean }; allo?: { connected: boolean } }>(
        '/integrations/status',
      ),
  });
  const missingTools = integrations
    ? ([
        !integrations.gmail?.connected && 'Gmail',
        !integrations.calendar?.connected && 'Google Agenda',
        !integrations.allo?.connected && 'Allo',
      ].filter(Boolean) as string[])
    : [];

  const bandeau = spaData?.bandeau;
  const kpis = spaData?.kpis;
  const mandats = spaData?.mandats ?? [];

  // Agenda du jour (RDV catégorisés du jour, triés par heure)
  const rawEvents = calEvents?.data ?? [];
  const todayEvents = useMemo(() => {
    return categorizeEvents(rawEvents)
      .filter(e => { try { return isTodayFn(new Date(e.startTime)); } catch { return false; } })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [rawEvents]);

  const { nextEventId, minutesUntilNext } = useMemo(() => {
    const now = Date.now();
    const upcoming = todayEvents.filter(e => new Date(e.startTime).getTime() > now);
    if (!upcoming.length) return { nextEventId: null as string | null, minutesUntilNext: null as number | null };
    const next = upcoming[0];
    return { nextEventId: next.id, minutesUntilNext: Math.max(0, Math.round((new Date(next.startTime).getTime() - now) / 60000)) };
  }, [todayEvents]);

  // Bandeau d'alerte
  const alertItems = useMemo(() => {
    if (!bandeau) return [];
    const items: string[] = [];
    if (bandeau.mandatsDormants.count > 0)
      items.push(`${bandeau.mandatsDormants.count} mandat${bandeau.mandatsDormants.count > 1 ? 's' : ''} dormant${bandeau.mandatsDormants.count > 1 ? 's' : ''}`);
    if (bandeau.tachesEnRetard > 0)
      items.push(`${bandeau.tachesEnRetard} tâche${bandeau.tachesEnRetard > 1 ? 's' : ''} en retard`);
    return items;
  }, [bandeau]);

  // KPI (5 cartes avec cible + barre)
  const kpiCards = useMemo(() => {
    if (!kpis) return [];
    const rangeWord = rangeIdx === 0 ? 'cette semaine' : 'ce mois';
    return [
      { label: 'Appels', raw: kpis.appels.today, display: <AnimatedCounter value={kpis.appels.today} />, target: TARGETS.appels, targetLabel: String(TARGETS.appels), period: "aujourd'hui", Icon: Phone, iconBg: '#F2F3D8', bar: '#C9A227', pctColor: '#B47814' },
      { label: 'RDV', raw: kpis.rdv.today, display: <AnimatedCounter value={kpis.rdv.today} />, target: TARGETS.rdv, targetLabel: String(TARGETS.rdv), period: "aujourd'hui", Icon: Calendar, iconBg: '#F2F3D8', bar: '#8E7CC3', pctColor: '#9A96AE' },
      { label: 'Nouveaux mandats', raw: kpis.nouveauxMandats, display: <AnimatedCounter value={kpis.nouveauxMandats} />, target: TARGETS.mandats, targetLabel: String(TARGETS.mandats), period: rangeWord, Icon: Building2, iconBg: '#F2F3D8', bar: '#2A6BD8', pctColor: '#9A96AE' },
      { label: 'Présentations', raw: kpis.presentationsMois, display: <AnimatedCounter value={kpis.presentationsMois} />, target: TARGETS.presentations, targetLabel: String(TARGETS.presentations), period: 'ce mois', Icon: Users, iconBg: '#F2F3D8', bar: '#3B9A54', pctColor: '#9A96AE' },
      { label: 'CA mois', raw: kpis.caMois.value, display: <AnimatedCounter value={kpis.caMois.value} formatFn={formatCurrency} />, target: TARGETS.ca, targetLabel: formatCurrency(TARGETS.ca), period: 'ce mois', Icon: DollarSign, iconBg: '#E6E9AF', bar: '#22177A', pctColor: '#9A96AE' },
    ].map(k => ({ ...k, pct: k.target > 0 ? Math.min(100, Math.round((k.raw / k.target) * 100)) : 0 }));
  }, [kpis, rangeIdx]);

  // Bande "Mon activité" (chiffres perso)
  const monActivite = kpis ? [
    { label: 'Mon CA', value: formatCurrency(kpis.caMois.value) },
    { label: 'Mes mandats actifs', value: String(mandats.length) },
    { label: 'Mes candidats en process', value: String(kpis.candidatsEnProcess) },
    { label: 'Mon pipe', value: formatCurrency(kpis.pipePondere.value) },
  ] : [];

  const hasAlerts = alertItems.length > 0;

  return (
    <div className="rise-stagger" style={{ position: 'relative' }}>
      {/* Bandeau "connecte tes outils" */}
      {integrations && missingTools.length > 0 && !toolsBannerHidden && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 16px', background: '#F2F3D8', border: '1px solid rgba(34,23,122,0.18)', borderRadius: 14, marginBottom: 14 }}>
          <span style={{ fontSize: 19, flexShrink: 0 }}>🔌</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#22177A' }}>Connecte tes outils pour tout synchroniser</div>
            <div style={{ fontSize: 12.5, color: '#4A4568', marginTop: 1 }}>
              Non connecté : <strong>{missingTools.join(' · ')}</strong>. Mails, RDV (+ lien Meet auto) et appels seront synchronisés dans l'ATS.
            </div>
          </div>
          <button onClick={() => navigate('/settings/integrations/guide')} style={{ flexShrink: 0, fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 12.5, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 10, padding: '8px 14px', cursor: 'pointer' }}>Connecter</button>
          <button onClick={() => setToolsBannerHidden(true)} title="Masquer" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent', color: '#8A8699', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      )}
      {/* Styles locaux (classes non présentes globalement) */}
      <style>{`
        @keyframes atsPulse { 0%,100%{ transform:scale(1); opacity:1; } 50%{ transform:scale(1.9); opacity:.3; } }
        .mrow{ transition:transform .26s cubic-bezier(.16,1,.3,1), box-shadow .26s ease, border-color .26s ease; }
        .mrow:hover{ transform:translateY(-3px); box-shadow:0 26px 52px -34px rgba(34,23,122,.45); border-color:rgba(34,23,122,.2); }
        .mrow:hover .m-open{ opacity:1; transform:none; }
        .m-chev:hover{ background:rgba(34,23,122,.06) !important; }
        .agcard{ transition:border-color .18s ease, box-shadow .2s ease, transform .2s cubic-bezier(.16,1,.3,1); }
        .agcard:hover{ border-color:rgba(34,23,122,.24) !important; box-shadow:0 16px 32px -22px rgba(34,23,122,.4); transform:translateY(-2px); }
        .kstage{ transition:background .2s ease, border-color .2s ease, transform .2s cubic-bezier(.16,1,.3,1); }
        .kstage:hover{ background:#fff; border-color:rgba(34,23,122,.22); transform:translateY(-2px); }
        .pcard{ transition:border-color .16s ease, box-shadow .18s ease, transform .16s cubic-bezier(.16,1,.3,1); }
        .pcard:hover{ border-color:rgba(34,23,122,.32) !important; box-shadow:0 6px 14px -8px rgba(34,23,122,.45) !important; transform:translateY(-1px); }
        .alertbar{ transition:transform .22s cubic-bezier(.16,1,.3,1), box-shadow .24s ease; }
        .alertbar:hover{ transform:translateY(-2px); box-shadow:0 20px 40px -26px rgba(180,120,20,.55); }
        .alertbar:hover .a-arrow{ transform:translateX(4px); }
        .mlink:hover{ color:#22177A !important; }
        .clink:hover{ color:#22177A !important; text-decoration:underline; }
        .rangebtn{ transition:transform .15s ease, box-shadow .2s ease; }
      `}</style>

      {/* GREETING + RANGE */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9A96AE' }}>
            Dashboard · {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
          </div>
          <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 32, letterSpacing: '-0.035em', color: '#1A1533', marginTop: 9, lineHeight: 1 }}>
            Bonjour, {user?.prenom || 'Meroe'}.
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ display: 'inline-flex', background: '#F0EFC4', borderRadius: 11, padding: 4 }}>
            {RANGES.map((r, i) => (
              <button
                key={r.label}
                onClick={() => setRangeIdx(i)}
                className="rangebtn"
                style={{
                  fontWeight: 800, fontSize: 12.5, border: 'none', borderRadius: 8, padding: '8px 15px', cursor: 'pointer',
                  background: rangeIdx === i ? '#fff' : 'transparent',
                  color: rangeIdx === i ? '#22177A' : '#8A7F5A',
                  boxShadow: rangeIdx === i ? '0 6px 14px -10px rgba(34,23,122,.5)' : 'none',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate('/mandats/new')}
            className="rangebtn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 11, padding: '11px 17px', cursor: 'pointer' }}
          >
            <Plus size={14} strokeWidth={2.4} />Nouveau mandat
          </button>
        </div>
      </div>

      {/* ALERT */}
      {hasAlerts && (
        <div
          onClick={() => navigate('/mandats/kanban')}
          className="alertbar"
          style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18, background: '#FBF3E7', border: '1px solid rgba(201,162,39,.32)', borderRadius: 14, padding: '14px 18px', cursor: 'pointer' }}
        >
          <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 10, background: '#F5E7CB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={17} color="#B47814" strokeWidth={2.2} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1533' }}>{alertItems.join(' · ')}</div>
            <div style={{ fontSize: 12.5, color: '#8A6A2E', marginTop: 2 }}>
              {bandeau?.mandatsDormants.worst
                ? `« ${bandeau.mandatsDormants.worst.titre} » sans action depuis ${bandeau.mandatsDormants.worst.jours} jours.`
                : 'Aucune action enregistrée depuis plus de 7 jours sur ces mandats.'}
            </div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A6A2E' }}>
            Traiter<ArrowRight className="a-arrow" size={15} strokeWidth={2.4} style={{ transition: 'transform .22s cubic-bezier(.16,1,.3,1)' }} />
          </span>
        </div>
      )}

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginTop: 16 }}>
        {isLoading || !kpis
          ? [1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-[132px] rounded-2xl" />)
          : kpiCards.map(k => (
            <div key={k.label} className="kpi" style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 16, padding: '18px 20px 16px', boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9A96AE' }}>{k.label}</span>
                <span style={{ width: 26, height: 26, borderRadius: 8, background: k.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <k.Icon size={14} color="#22177A" />
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 13 }}>
                <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 30, letterSpacing: '-0.035em', color: '#22177A', lineHeight: 1 }}>{k.display}</span>
                <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 14, color: '#C4C1D0', letterSpacing: '-0.02em' }}>/ {k.targetLabel}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'rgba(34,23,122,.07)', marginTop: 14, overflow: 'hidden' }}>
                <div className="bar-fill" style={{ width: `${k.pct}%`, height: '100%', borderRadius: 999, background: k.bar }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 11.5, color: '#9A96AE' }}>{k.period}</span>
                <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 11.5, color: k.pctColor }}>{k.pct}%</span>
              </div>
            </div>
          ))}
      </div>

      {/* MON ACTIVITÉ */}
      {kpis && (
        <div className="rise" style={{ display: 'flex', alignItems: 'center', marginTop: 16, background: '#22177A', borderRadius: 16, padding: '18px 24px', position: 'relative', overflow: 'hidden' }}>
          <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(230,233,175,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(230,233,175,.045) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
          <div aria-hidden style={{ position: 'absolute', top: -100, right: -50, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle,rgba(230,233,175,.13),transparent 68%)' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, paddingRight: 26 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(230,233,175,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={15} color="#E6E9AF" />
            </span>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#E6E9AF' }}>Mon activité</span>
          </div>
          <div style={{ position: 'relative', flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
            {monActivite.map((s, i) => (
              <div key={s.label} style={{ padding: '0 22px', borderLeft: i === 0 ? '1px solid rgba(230,233,175,.18)' : '1px solid rgba(230,233,175,.18)' }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(230,233,175,.55)' }}>{s.label}</div>
                <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 22, letterSpacing: '-0.03em', color: '#fff', marginTop: 7 }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AGENDA */}
      <div className="card-depth rise" style={{ marginTop: 16, padding: '20px 22px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: '#F2F3D8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={15} color="#22177A" />
            </span>
            <span style={{ fontWeight: 800, fontSize: 16.5, letterSpacing: '-0.015em', color: '#1A1533' }}>Agenda du jour</span>
            <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 11.5, color: '#22177A', background: '#E6E9AF', borderRadius: 999, padding: '3px 10px' }}>{todayEvents.length}</span>
          </div>
          {minutesUntilNext != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: '#B3261E' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#B3261E', animation: 'atsPulse 2s ease-in-out infinite' }} />
              Prochain dans {minutesUntilNext < 60 ? `${minutesUntilNext} min` : `${Math.floor(minutesUntilNext / 60)}h${String(minutesUntilNext % 60).padStart(2, '0')}`}
            </span>
          )}
        </div>

        {todayEvents.length === 0 ? (
          <div style={{ marginTop: 16, border: '1px dashed rgba(34,23,122,.18)', borderRadius: 14, padding: '28px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#6E6A85' }}>Aucun rendez-vous aujourd'hui</div>
            <div style={{ fontSize: 12.5, color: '#9A96AE', marginTop: 4 }}>Profitez-en pour avancer votre pipeline.</div>
            <button onClick={() => navigate('/mandats/kanban')} style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 800, color: '#22177A', background: 'rgba(34,23,122,.06)', border: '1px solid rgba(34,23,122,.12)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer' }}>
              Voir le pipeline<ArrowRight size={14} strokeWidth={2.4} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, todayEvents.length)},minmax(0,1fr))`, gap: 12, marginTop: 16 }}>
            {todayEvents.slice(0, 3).map(e => {
              const meta = agendaMeta(e.meetingType);
              const durMin = (() => { try { return Math.max(0, differenceInMinutes(new Date(e.endTime), new Date(e.startTime))); } catch { return 0; } })();
              const isNext = e.id === nextEventId;
              const where = e.location || 'Visioconférence';
              const ctx = (e.participants && e.participants.length > 0) ? e.participants.slice(0, 2).join(', ') : meta.label;
              return (
                <div key={e.id} className="agcard" style={{ position: 'relative', background: '#FCFCF5', border: '1px solid rgba(34,23,122,.09)', borderRadius: 14, padding: '14px 16px', overflow: 'hidden' }}>
                  <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: meta.accent }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', borderRadius: 999, padding: '4px 10px', background: meta.tagBg, color: meta.tagFg }}>
                      <meta.Icon size={11} strokeWidth={2.4} />{meta.label}
                    </span>
                    <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 14, letterSpacing: '-0.02em', color: isNext ? '#B3261E' : '#1A1533' }}>{format(new Date(e.startTime), 'HH:mm')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 13 }}>
                    <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', background: meta.avBg, color: meta.avFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black', sans-serif", fontSize: 11.5 }}>{initials(e.title)}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</div>
                      <div style={{ fontSize: 11.5, color: '#6E6A85', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ctx}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, paddingTop: 11, borderTop: '1px solid rgba(34,23,122,.07)' }}>
                    <Video size={12} color="#9A96AE" />
                    <span style={{ fontSize: 11.5, color: '#8A8699', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{where}</span>
                    {durMin > 0 && <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 800, color: '#22177A' }}>{durMin} min</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MANDATS EN COURS */}
      <div className="rise" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.015em', color: '#1A1533' }}>Mes mandats en cours</span>
            <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 11.5, color: '#22177A', background: '#E6E9AF', borderRadius: 999, padding: '3px 10px' }}>{mandats.length}</span>
          </div>
          <a onClick={() => navigate('/mandats')} style={{ fontSize: 13, fontWeight: 700, color: '#22177A', cursor: 'pointer' }}>Voir tous ›</a>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isLoading ? (
            [1, 2].map(i => <Skeleton key={i} className="h-[92px] rounded-2xl" />)
          ) : mandats.length === 0 ? (
            <div style={{ border: '1px dashed rgba(34,23,122,.18)', borderRadius: 16, padding: '28px 20px', textAlign: 'center', color: '#6E6A85', fontSize: 14 }}>
              Aucun mandat en cours pour l'instant.
            </div>
          ) : mandats.map((m, idx) => {
            const isOpen = expanded[m.id] ?? (idx === 0);
            const statut = STATUT_MAP[m.highestStage] ?? STATUT_MAP.SOURCING;
            // Total = somme des colonnes visibles (hors REFUSÉ) pour que la lecture soit juste.
            const visibleTotal = STAGES.reduce((s, st) => s + (m.candidaturesParStage[st.key]?.length ?? 0), 0);
            return (
              <div key={m.id} className="mrow" style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 18, padding: '18px 20px', boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 11, background: '#fff', border: '1px solid rgba(34,23,122,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 5 }}>
                    {m.entreprise.logoUrl
                      ? <img src={m.entreprise.logoUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      : <Building2 size={18} color="#8A8699" />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a onClick={() => navigate(`/mandats/${m.id}`)} className="mlink" style={{ fontSize: 15.5, fontWeight: 800, color: '#1A1533', cursor: 'pointer', display: 'inline-block' }}>{m.titrePoste}</a>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 3 }}>
                      <a onClick={() => navigate(`/entreprises/${m.entreprise.id}`)} className="clink" style={{ fontSize: 12.5, color: '#6E6A85', cursor: 'pointer' }}>{m.entreprise.nom}</a>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#C4C1D0' }} />
                      <span style={{ fontSize: 12, color: '#9A96AE' }}>ouvert depuis {m.ouvertDepuisJours} j</span>
                    </div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: '5px 12px', background: statut.bg, color: statut.fg }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: statut.dot }} />{statut.label}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: '#22177A', background: 'rgba(34,23,122,.05)', border: '1px solid rgba(34,23,122,.09)', borderRadius: 999, padding: '5px 12px' }}>
                    <Users size={13} />{visibleTotal}
                  </span>
                  <a onClick={() => navigate(`/mandats/${m.id}`)} className="m-open" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 800, color: '#22177A', opacity: 0, transform: 'translateX(-6px)', transition: 'opacity .24s ease, transform .24s cubic-bezier(.16,1,.3,1)', cursor: 'pointer' }}>
                    Ouvrir<ArrowRight size={14} strokeWidth={2.4} />
                  </a>
                  <button onClick={() => setExpanded(prev => ({ ...prev, [m.id]: !isOpen }))} className="m-chev" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(34,23,122,.14)', background: '#fff', color: '#22177A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .18s ease, transform .26s cubic-bezier(.16,1,.3,1)', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                    <ChevronDown size={15} strokeWidth={2.4} />
                  </button>
                </div>

                {isOpen ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8, marginTop: 14, alignItems: 'start' }}>
                    {STAGES.map((st, i) => {
                      const people = m.candidaturesParStage[st.key] ?? [];
                      const active = people.length > 0;
                      const shown = people.slice(0, 2);
                      const more = people.length - shown.length;
                      return (
                        <div key={st.key} className="kstage" style={{ background: active ? '#FCFCF5' : 'rgba(252,252,245,.5)', border: `1px solid ${active ? 'rgba(34,23,122,.11)' : 'rgba(34,23,122,.06)'}`, borderRadius: 12, padding: '9px 9px 10px', minHeight: 104 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
                              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#8A8699', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.label}</span>
                            </span>
                            <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 11, letterSpacing: '-0.02em', color: active ? '#1A1533' : '#C4C1D0', flexShrink: 0 }}>{people.length}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 9 }}>
                            {shown.map((p, j) => {
                              const nom = `${p.prenom ? p.prenom + ' ' : ''}${p.nom}`.trim();
                              const [bg, fg] = AV[(i + j) % 3];
                              return (
                                <a key={p.id} onClick={() => navigate(`/candidats/${p.candidatId}`)} className="pcard" style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid rgba(34,23,122,.1)', borderRadius: 8, padding: '5px 6px', boxShadow: '0 1px 2px rgba(34,23,122,.05)', cursor: 'pointer' }}>
                                  <span style={{ flexShrink: 0, width: 19, height: 19, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black', sans-serif", fontSize: 8 }}>{initials(nom)}</span>
                                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</span>
                                </a>
                              );
                            })}
                            {more > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: '#8A8699', paddingLeft: 3 }}>+{more} autres</span>}
                            {!active && <span style={{ display: 'block', height: 26, border: '1px dashed rgba(34,23,122,.14)', borderRadius: 8 }} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 13, borderTop: '1px solid rgba(34,23,122,.07)', flexWrap: 'wrap' }}>
                    {STAGES.map(st => {
                      const n = (m.candidaturesParStage[st.key] ?? []).length;
                      const active = n > 0;
                      return (
                        <span key={st.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '5px 11px', background: active ? '#FCFCF5' : 'rgba(252,252,245,.5)', border: `1px solid ${active ? 'rgba(34,23,122,.11)' : 'rgba(34,23,122,.06)'}` }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#6E6A85' }}>{st.label}</span>
                          <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 11, color: active ? '#1A1533' : '#C4C1D0' }}>{n}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
