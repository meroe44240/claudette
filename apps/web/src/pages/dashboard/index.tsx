import { useMemo, useState, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { format, isToday as isTodayFn, isPast } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  DollarSign, Phone, Calendar, Users, TrendingUp,
  Building2, FileText, Mail, CheckSquare, ArrowRight, ChevronDown,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth-store';
import { usePageTitle } from '../../hooks/usePageTitle';
import { formatTaskDue } from '../../lib/format-relative-date';
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
  candidatsEnProcess: number;
  pipePondere: { value: number; delta: number | null };
}

interface MandatSpa {
  id: string;
  titrePoste: string;
  entreprise: { id: string; nom: string };
  feeMontantEstime: number | null;
  highestStage: string;
  totalCandidats: number;
  daysSinceActivity: number | null;
  isDormant: boolean;
}

interface TacheSpa {
  id: string;
  titre: string;
  tacheDueDate: string | null;
  tacheCompleted: boolean;
  metadata: Record<string, unknown> | null;
  entiteType?: string | null;
  entiteId?: string | null;
  type?: string | null;
}

interface GmailMessage {
  id: string;
  threadId: string;
  from: { name: string; email: string };
  subject: string;
  snippet: string;
  date: string;
  isRead: boolean;
}

interface WeeklyActivityItem { week: string; calls: number; rdv: number }
interface StructureKpis { caStructure: number; mandatsActifs: number; candidatsEnProcess: number; pipeStructure: number }

interface SpaData {
  bandeau: BandeauData;
  kpis: KpisData;
  structureKpis: StructureKpis | null;
  mandats: MandatSpa[];
  taches: TacheSpa[];
  recentEmails: { connected: boolean; messages: GmailMessage[]; unreadCount: number };
  weeklyActivity: WeeklyActivityItem[];
  calendarDots: Record<string, number>;
}

interface CalendarEvent {
  id: string; title: string; startTime: string; endTime: string;
  participants?: string[]; status?: string;
}

// ─── HELPERS ────────────────────────────────────────

function formatCurrency(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k€`;
  return `${n}€`;
}

// Stage color palette (per mock)
const N = '#22177A', G = '#3B9A54', O = '#E08A2B', B = '#3B6FE0', P = '#8E7CC3';
const empty = 'rgba(34,23,122,0.14)';
const STAGE_COLOR: Record<string, string> = {
  SOURCING: P, CONTACTE: B, ENTRETIEN_1: N, ENVOYE_CLIENT: O,
  ENTRETIEN_CLIENT: O, OFFRE: G, PLACE: G, REFUSE: empty,
};
const STAGE_ORDER = ['SOURCING', 'CONTACTE', 'ENTRETIEN_1', 'ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE'];

function StageDots({ highestStage }: { highestStage: string }) {
  const highestIdx = STAGE_ORDER.indexOf(highestStage);
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {STAGE_ORDER.map((s, i) => (
        <span
          key={s}
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: i <= highestIdx ? STAGE_COLOR[s] : empty,
          }}
        />
      ))}
    </span>
  );
}

// ─── MINI CALENDAR ──────────────────────────────────

function MiniCalendar({ calendarDots }: { calendarDots: Record<string, number> }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;
  const todayDate = now.getDate();
  const monthLabel = format(now, 'MMMM yyyy', { locale: fr });

  const cells: Array<{ day: number | null; isToday: boolean; dots: number }> = [];
  for (let i = 0; i < startDay; i++) cells.push({ day: null, isToday: false, dots: 0 });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, isToday: d === todayDate, dots: calendarDots[dateStr] ?? 0 });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, isToday: false, dots: 0 });

  return (
    <>
      <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 16, color: '#1A1533', textTransform: 'capitalize' }}>{monthLabel}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginTop: 16, textAlign: 'center' }}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((h, i) => (
          <span key={i} style={{ fontSize: 11, fontWeight: 700, color: '#9A96AE' }}>{h}</span>
        ))}
        {cells.map((c, i) => (
          <span
            key={i}
            style={{
              fontSize: 13,
              padding: '7px 0',
              borderRadius: 9,
              color: c.isToday ? '#E6E9AF' : c.day ? '#1A1533' : 'transparent',
              fontWeight: c.isToday ? 800 : 500,
              background: c.isToday ? '#22177A' : 'transparent',
              position: 'relative',
            }}
          >
            {c.day ?? '·'}
            {!c.isToday && c.dots > 0 && (
              <span
                aria-hidden
                style={{
                  position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
                  width: 4, height: 4, borderRadius: '50%', background: '#22177A',
                }}
              />
            )}
          </span>
        ))}
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════
// DASHBOARD PAGE
// ═════════════════════════════════════════════════════

export default function DashboardPage() {
  usePageTitle('Dashboard');
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');

  const { data: spaData, isLoading } = useQuery({
    queryKey: ['dashboard', 'spa', period],
    queryFn: () => api.get<SpaData>(`/dashboard/spa?period=${period}&team=false`),
  });

  const { data: calEvents } = useQuery({
    queryKey: ['calendar', 'events'],
    queryFn: () => api.get<{ data: CalendarEvent[] }>('/integrations/calendar/events'),
  });

  const { data: pappersStats } = useQuery({
    queryKey: ['entreprises', 'stats', 'pappers'],
    queryFn: () => api.get<{ total: number; enriched: number; percentage: number }>('/entreprises/stats/pappers'),
  });

  const completeTacheMutation = useMutation({
    mutationFn: (id: string) => api.put(`/taches/${id}/complete`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard', 'spa'] }),
  });

  const bandeau = spaData?.bandeau;
  const kpis = spaData?.kpis;
  const structureKpis = spaData?.structureKpis;
  const mandats = spaData?.mandats ?? [];
  const tachesRaw = spaData?.taches ?? [];
  const emails = spaData?.recentEmails;
  const weeklyActivity = spaData?.weeklyActivity ?? [];
  const calendarDots = spaData?.calendarDots ?? {};

  const rawEvents = calEvents?.data ?? [];
  const categorizedAllEvents: CategorizedEvent[] = useMemo(() => categorizeEvents(rawEvents), [rawEvents]);
  const todayEvents = useMemo(
    () => categorizedAllEvents
      .filter(e => { try { return isTodayFn(new Date(e.startTime)); } catch { return false; } })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [categorizedAllEvents],
  );

  const taches = useMemo(() => {
    const PRIORITY_ORDER: Record<string, number> = { HAUTE: 0, MOYENNE: 1, BASSE: 2 };
    const now = new Date();
    return [...tachesRaw].sort((a, b) => {
      const aOverdue = a.tacheDueDate && new Date(a.tacheDueDate) < now ? 1 : 0;
      const bOverdue = b.tacheDueDate && new Date(b.tacheDueDate) < now ? 1 : 0;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      const aPrio = PRIORITY_ORDER[(a.metadata?.priority as string) || a.type || ''] ?? 1;
      const bPrio = PRIORITY_ORDER[(b.metadata?.priority as string) || b.type || ''] ?? 1;
      if (aPrio !== bPrio) return aPrio - bPrio;
      return (a.tacheDueDate ? new Date(a.tacheDueDate).getTime() : Infinity) -
             (b.tacheDueDate ? new Date(b.tacheDueDate).getTime() : Infinity);
    });
  }, [tachesRaw]);

  // Bandeau alert text
  const bandeauItems = useMemo(() => {
    if (!bandeau) return [];
    const items: string[] = [];
    if (bandeau.emailsNonLus > 0) items.push(`${bandeau.emailsNonLus} email${bandeau.emailsNonLus > 1 ? 's' : ''} non lu${bandeau.emailsNonLus > 1 ? 's' : ''}`);
    if (bandeau.mandatsDormants.count > 0) {
      const worst = bandeau.mandatsDormants.worst;
      items.push(`${bandeau.mandatsDormants.count} mandat${bandeau.mandatsDormants.count > 1 ? 's' : ''} dormant${bandeau.mandatsDormants.count > 1 ? 's' : ''}${worst ? ` (${worst.jours}j)` : ''}`);
    }
    if (bandeau.tachesEnRetard > 0) items.push(`${bandeau.tachesEnRetard} tâche${bandeau.tachesEnRetard > 1 ? 's' : ''} en retard`);
    if (bandeau.rdvAujourdhui > 0) items.push(`${bandeau.rdvAujourdhui} RDV aujourd’hui`);
    return items;
  }, [bandeau]);
  const hasAlerts = bandeauItems.length > 0;

  // Max value pour normaliser barres activité
  const maxBar = useMemo(() => {
    if (!weeklyActivity.length) return 1;
    return Math.max(1, ...weeklyActivity.map(w => Math.max(w.calls, w.rdv)));
  }, [weeklyActivity]);

  return (
    <div className="rise-stagger">
      {/* Breadcrumb */}
      <div style={{ fontSize: 13, color: '#9A96AE', fontWeight: 600 }}>Dashboard</div>
      {/* H1 */}
      <h1
        style={{
          fontFamily: "'Archivo Black', sans-serif",
          fontSize: 40, letterSpacing: '-0.035em', color: '#1A1533', marginTop: 4, lineHeight: 1,
        }}
      >
        Dashboard
      </h1>

      {/* Alert bar */}
      <div
        style={{
          position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', gap: 12,
          marginTop: 20, padding: '13px 20px',
          background: hasAlerts ? '#FBF3E7' : '#EAF3EC',
          border: `1px solid ${hasAlerts ? 'rgba(180,120,20,0.22)' : 'rgba(59,154,84,0.22)'}`,
          borderRadius: 14,
        }}
      >
        <span style={{ position: 'relative', display: 'inline-flex', width: 9, height: 9, flexShrink: 0 }}>
          <span
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: hasAlerts ? '#C9A227' : '#3B9A54',
              animation: 'atsPulseDot 2.2s ease-in-out infinite',
            }}
          />
          <span style={{ position: 'relative', width: 9, height: 9, borderRadius: '50%', background: hasAlerts ? '#C9A227' : '#3B9A54' }} />
        </span>
        <span style={{ fontSize: 14, color: hasAlerts ? '#8A6A2E' : '#2C6B3F', fontWeight: 600, flex: 1 }}>
          {hasAlerts ? bandeauItems.join(' · ') : 'Tout est en ordre !'}
        </span>
        {hasAlerts && (
          <a
            onClick={() => navigate('/taches')}
            style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#22177A', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Voir <ArrowRight size={13} />
          </a>
        )}
      </div>

      {/* Greeting + range */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, marginTop: 24 }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 27, letterSpacing: '-0.02em', color: '#1A1533' }}>
          Bonjour, {user?.prenom || 'Recruteur'}
          <span style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 500, fontSize: 16, color: '#8A8699' }}>
            {' — '}{format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
          </span>
        </div>
        <div className="relative">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value as 'today' | 'week' | 'month')}
            className="appearance-none"
            style={{
              fontSize: 14, fontWeight: 700, color: '#22177A',
              background: '#fff', border: '1px solid rgba(34,23,122,0.14)',
              borderRadius: 11, padding: '10px 34px 10px 16px', cursor: 'pointer',
            }}
          >
            <option value="today">Aujourd’hui</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
          </select>
          <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#22177A', pointerEvents: 'none' }} />
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginTop: 16 }}>
        {isLoading ? (
          [1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-[104px] rounded-2xl" />)
        ) : (
          <>
            <KpiCard
              icon={<DollarSign size={14} />}
              label="CA mois"
              value={<AnimatedCounter value={kpis?.caMois.value ?? 0} formatFn={formatCurrency} />}
              valueColor="#1A1533"
              sub={kpis?.caMois.delta != null ? `${kpis.caMois.delta >= 0 ? '↗ +' : '↘ '}${kpis.caMois.delta}%` : ''}
              subColor={(kpis?.caMois.delta ?? 0) >= 0 ? '#2C6B3F' : '#B3261E'}
            />
            <KpiCard
              icon={<Phone size={14} />}
              label="Appels"
              value={<AnimatedCounter value={kpis?.appels.today ?? 0} />}
              valueColor="#1A1533"
              sub={`/ ${kpis?.appels.week ?? 0}`}
              subColor="#9A96AE"
              foot={`Moy ${kpis?.appels.moyJour ?? 0}/j`}
            />
            <KpiCard
              icon={<Calendar size={14} />}
              label="RDV semaine"
              value={<AnimatedCounter value={kpis?.rdv.today ?? 0} />}
              valueColor="#1A1533"
              sub={`/ ${kpis?.rdv.week ?? 0}`}
              subColor="#9A96AE"
              foot={`${kpis?.rdv.confirmes ?? 0} confirmé${(kpis?.rdv.confirmes ?? 0) > 1 ? 's' : ''}, ${kpis?.rdv.enAttente ?? 0} en attente`}
            />
            <KpiCard
              icon={<Users size={14} />}
              label="Présentations"
              value={<AnimatedCounter value={kpis?.presentationsMois ?? 0} />}
              valueColor="#1A1533"
              foot="ce mois"
            />
            <KpiCard
              icon={<TrendingUp size={14} />}
              label="Placements"
              value={<AnimatedCounter value={kpis?.placementsMois ?? 0} />}
              valueColor="#22177A"
              foot="ce mois"
            />
          </>
        )}
      </div>

      {/* Structure strip */}
      {structureKpis && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap',
            marginTop: 14, padding: '14px 20px', background: '#fff',
            border: '1px solid rgba(34,23,122,0.08)', borderRadius: 14,
            boxShadow: '0 1px 2px rgba(34,23,122,0.04)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A8699' }}>
            <Building2 size={14} color="#22177A" />Structure
          </span>
          <span style={{ fontSize: 14, color: '#4A4568' }}>
            CA global <strong style={{ color: '#2C6B3F' }}><AnimatedCounter value={structureKpis.caStructure} formatFn={formatCurrency} /></strong>
          </span>
          <span style={{ fontSize: 14, color: '#4A4568' }}>
            Mandats actifs <strong style={{ color: '#1A1533' }}><AnimatedCounter value={structureKpis.mandatsActifs} /></strong>
          </span>
          <span style={{ fontSize: 14, color: '#4A4568' }}>
            Candidats en process <strong style={{ color: '#1A1533' }}><AnimatedCounter value={structureKpis.candidatsEnProcess} /></strong>
          </span>
          <span style={{ fontSize: 14, color: '#4A4568' }}>
            Pipe global <strong style={{ color: '#22177A' }}><AnimatedCounter value={structureKpis.pipeStructure} formatFn={formatCurrency} /></strong>
          </span>
        </div>
      )}

      {/* Pappers strip */}
      {pappersStats && pappersStats.total > 0 && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 16, marginTop: 12,
            padding: '13px 20px', background: '#fff',
            border: '1px solid rgba(34,23,122,0.08)', borderRadius: 14,
            boxShadow: '0 1px 2px rgba(34,23,122,0.04)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A8699' }}>
            <FileText size={14} color="#22177A" />Entreprises enrichies Pappers
          </span>
          <span style={{ fontSize: 14, color: '#4A4568', fontWeight: 700 }}>
            {pappersStats.enriched} <span style={{ color: '#9A96AE', fontWeight: 500 }}>/ {pappersStats.total}</span>
          </span>
          <div style={{ flex: 1, maxWidth: 220, height: 7, borderRadius: 999, background: 'rgba(34,23,122,0.1)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${pappersStats.percentage}%`, height: '100%', borderRadius: 999,
                background: 'linear-gradient(90deg, #22177A, #5B4B9E)',
              }}
            />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#22177A' }}>{pappersStats.percentage}%</span>
        </div>
      )}

      {/* 3-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr 1fr', gap: 16, marginTop: 20, alignItems: 'start' }}>
        {/* Agenda */}
        <div className="card-depth" style={{ padding: 20, minHeight: 400 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Calendar size={17} color="#22177A" strokeWidth={2} />
            <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 16, color: '#1A1533' }}>Agenda du jour</span>
            <span
              style={{
                width: 22, height: 22, borderRadius: '50%',
                background: '#F0EFC4', color: '#22177A',
                fontSize: 12, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {todayEvents.length}
            </span>
          </div>
          {todayEvents.length === 0 && (
            <div style={{ marginTop: 40, fontSize: 13, color: '#9A96AE', textAlign: 'center' }}>Aucun RDV aujourd’hui</div>
          )}
          {todayEvents.map(ev => (
            <div key={ev.id} className="row-hover" style={{ marginTop: 20, display: 'flex', gap: 14, borderLeft: '3px solid #3B9A54', padding: '6px 4px' }}>
              <div style={{ paddingLeft: 12 }}>
                <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 15, color: '#1A1533' }}>
                  {format(new Date(ev.startTime), 'HH:mm')}{' '}
                  <span style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 700, color: '#4A4568' }}>{ev.title}</span>
                </div>
                <div style={{ fontSize: 12, color: '#9A96AE', marginTop: 2 }}>
                  {format(new Date(ev.endTime), 'HH:mm')}{ev.participants?.length ? ` · ${ev.participants.slice(0, 2).join(', ')}` : ''}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '4px 10px', background: '#EAF3EC', color: '#2C6B3F' }}>RDV</span>
                  {ev.status === 'confirmed' && (
                    <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '4px 10px', background: '#EAF3EC', color: '#2C6B3F' }}>Confirmé</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Mandats */}
        <div className="card-depth" style={{ padding: 20, minHeight: 400 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <FileText size={17} color="#22177A" strokeWidth={2} />
              <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 16, color: '#1A1533' }}>Mandats</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#9A96AE' }}>{mandats.length}</span>
            </div>
            <a onClick={() => navigate('/mandats')} style={{ fontSize: 12.5, fontWeight: 700, color: '#22177A', cursor: 'pointer' }}>
              Voir tous ›
            </a>
          </div>
          <div
            style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10,
              marginTop: 16, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: '#9A96AE',
              paddingBottom: 8, borderBottom: '1px solid rgba(34,23,122,0.07)',
            }}
          >
            <span>Mandat</span><span>Fee</span><span style={{ textAlign: 'center' }}>Étape</span><span style={{ textAlign: 'right' }}>Cand.</span>
          </div>
          {mandats.length === 0 && (
            <div style={{ marginTop: 40, fontSize: 13, color: '#9A96AE', textAlign: 'center' }}>Aucun mandat actif</div>
          )}
          {mandats.map(m => (
            <div
              key={m.id}
              onClick={() => navigate(`/mandats/${m.id}`)}
              className="row-hover"
              style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 10,
                alignItems: 'center', padding: '11px 4px', cursor: 'pointer',
                borderBottom: '1px solid rgba(34,23,122,0.05)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1A1533', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.titrePoste}</div>
                <div style={{ fontSize: 11.5, color: '#9A96AE' }}>{m.entreprise.nom}</div>
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#22177A', minWidth: 34 }}>
                {m.feeMontantEstime ? formatCurrency(m.feeMontantEstime) : '—'}
              </span>
              <StageDots highestStage={m.highestStage} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1533', textAlign: 'right', minWidth: 16 }}>{m.totalCandidats}</span>
            </div>
          ))}
        </div>

        {/* Messages + Tâches */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card-depth" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Mail size={17} color="#22177A" strokeWidth={2} />
                <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 16, color: '#1A1533' }}>Messages</span>
                {(emails?.unreadCount ?? 0) > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: '#22177A', borderRadius: 999, padding: '2px 8px' }}>
                    {emails!.unreadCount}
                  </span>
                )}
              </div>
              <a onClick={() => navigate('/emails')} style={{ fontSize: 12.5, fontWeight: 700, color: '#22177A', cursor: 'pointer' }}>Voir tous ›</a>
            </div>
            {!emails?.connected && (
              <div style={{ marginTop: 22, fontSize: 12.5, color: '#9A96AE', textAlign: 'center' }}>Gmail non connecté</div>
            )}
            {emails?.connected && emails.messages.length === 0 && (
              <div style={{ marginTop: 22, fontSize: 12.5, color: '#9A96AE', textAlign: 'center' }}>Pas de nouveaux emails</div>
            )}
            {emails?.messages.slice(0, 3).map(msg => (
              <div key={msg.id} className="row-hover" style={{ padding: '12px 6px', borderBottom: '1px solid rgba(34,23,122,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1533' }}>{msg.from.name || msg.from.email}</span>
                  <span style={{ fontSize: 11.5, color: '#9A96AE' }}>
                    {(() => { try { const d = new Date(msg.date); return isTodayFn(d) ? format(d, 'HH:mm') : format(d, 'dd/MM'); } catch { return ''; } })()}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: '#4A4568', marginTop: 2 }}>{msg.subject}</div>
                <div style={{ fontSize: 12, color: '#9A96AE', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg.snippet}</div>
              </div>
            ))}
          </div>

          <div className="card-depth" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <CheckSquare size={17} color="#22177A" strokeWidth={2} />
                <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 16, color: '#1A1533' }}>Tâches du jour</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#9A96AE' }}>{taches.length}</span>
              </div>
              <a onClick={() => navigate('/taches')} style={{ fontSize: 12.5, fontWeight: 700, color: '#22177A', cursor: 'pointer' }}>Voir ›</a>
            </div>
            {taches.length === 0 && (
              <div style={{ marginTop: 22, fontSize: 12.5, color: '#9A96AE', textAlign: 'center' }}>Aucune tâche</div>
            )}
            {taches.slice(0, 3).map(t => {
              const isOverdue = t.tacheDueDate && isPast(new Date(t.tacheDueDate)) && !t.tacheCompleted;
              const due = t.tacheDueDate ? formatTaskDue(t.tacheDueDate) : null;
              return (
                <div key={t.id} className="row-hover" style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '13px 4px', borderBottom: '1px solid rgba(34,23,122,0.06)' }}>
                  <span
                    onClick={() => completeTacheMutation.mutate(t.id)}
                    style={{
                      flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
                      border: '1.5px solid rgba(34,23,122,0.25)', marginTop: 1, cursor: 'pointer',
                      background: t.tacheCompleted ? '#22177A' : 'transparent',
                    }}
                  />
                  <div>
                    <div style={{ fontSize: 13.5, color: '#1A1533', lineHeight: 1.45 }}>{t.titre}</div>
                    {due && (
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: isOverdue ? '#B3261E' : '#9A96AE', marginTop: 4 }}>
                        {isOverdue ? 'En retard ' : ''}{due.text}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom row: activity chart + calendar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, marginTop: 20, alignItems: 'start' }}>
        <div className="card-depth" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Phone size={17} color="#22177A" strokeWidth={2} />
              <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 16, color: '#1A1533' }}>Activité — 4 dernières semaines</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: '#8A8699' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#3B6FE0' }} />Appels
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#3B9A54' }} />RDV
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: 170, marginTop: 20, padding: '0 20px' }}>
            {weeklyActivity.map((b, i) => (
              <Fragment key={i}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 130 }}>
                    <div
                      className="bar-grow"
                      style={{
                        width: 26,
                        borderRadius: '7px 7px 0 0',
                        background: 'linear-gradient(180deg,#5B8CF0,#3B6FE0)',
                        height: `${Math.max(4, (b.calls / maxBar) * 130)}px`,
                        animationDelay: `${0.6 + i * 0.08}s`,
                      }}
                    />
                    <div
                      className="bar-grow"
                      style={{
                        width: 26,
                        borderRadius: '7px 7px 0 0',
                        background: 'linear-gradient(180deg,#48B368,#3B9A54)',
                        height: `${Math.max(4, (b.rdv / maxBar) * 130)}px`,
                        animationDelay: `${0.66 + i * 0.08}s`,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 12, color: '#9A96AE' }}>{b.week}</span>
                </div>
              </Fragment>
            ))}
          </div>
        </div>

        <div className="card-depth" style={{ padding: 22 }}>
          <MiniCalendar calendarDots={calendarDots} />
        </div>
      </div>

      {/* Pulse keyframe (local, alert dot) */}
      <style>{`
        @keyframes atsPulseDot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.9); opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

// ─── KPI CARD ────────────────────────────────────────

function KpiCard({
  icon, label, value, valueColor, sub, subColor, foot,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  valueColor: string;
  sub?: string;
  subColor?: string;
  foot?: string;
}) {
  return (
    <div className="kpi">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A8699' }}>
        <span style={{ color: '#22177A', display: 'inline-flex' }}>{icon}</span>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 12 }}>
        <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 29, letterSpacing: '-0.02em', color: valueColor, lineHeight: 1 }}>
          {value}
        </span>
        {sub && <span style={{ fontSize: 12.5, fontWeight: 700, color: subColor ?? '#9A96AE' }}>{sub}</span>}
      </div>
      {foot && <div style={{ fontSize: 12, color: '#9A96AE', marginTop: 3 }}>{foot}</div>}
    </div>
  );
}
