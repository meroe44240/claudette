import { useState, useEffect, useMemo, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Phone, Calendar, Users, DollarSign, Building2,
  Mail, ChevronRight, ChevronDown,
  Check, TrendingUp, TrendingDown,
  AlertTriangle, Zap, Clock, CheckCircle2, Circle,
  ArrowRight, Eye, Bot, Link2,
} from 'lucide-react';
import { motion, useSpring, useTransform, useMotionValue, AnimatePresence } from 'framer-motion';
import { format, isToday as isTodayFn, isPast, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth-store';
import { usePageTitle } from '../../hooks/usePageTitle';
import { formatTaskDue } from '../../lib/format-relative-date';
import Skeleton from '../../components/ui/Skeleton';
import EmailComposer from '../../components/email/EmailComposer';
import { toast } from '../../components/ui/Toast';
import CallBriefPanel from '../../components/ai/CallBriefPanel';
import CalendarAiSuggestions from '../../components/dashboard/CalendarAiSuggestions';
import PipelineAiSuggestions from '../../components/dashboard/PipelineAiSuggestions';
import {
  categorizeEvents, countByType,
  MEETING_COLORS, MEETING_LABELS, type CategorizedEvent, type MeetingType,
} from '../../lib/meetingCategorizer';

// const AdminDashboard = lazy(() => import('./admin'));

// ─── TYPES ──────────────────────────────────────────

interface BandeauData {
  emailsNonLus: number;
  mandatsDormants: { count: number; worst: { titre: string; jours: number } | null };
  tachesEnRetard: number;
  sequenceReplies: number;
  rdvAujourdhui: number;
}

interface KpisData {
  caMois: { value: number; delta: number | null };
  appels: { today: number; week: number; moyJour: number };
  rdv: { today: number; week: number; confirmes: number; enAttente: number };
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
  metadata: any;
  entiteType?: string | null;
  entiteId?: string | null;
  type?: string | null;
}

const ENTITE_ROUTE_MAP: Record<string, string> = {
  CANDIDAT: '/candidats',
  CLIENT: '/clients',
  ENTREPRISE: '/entreprises',
  MANDAT: '/mandats',
};

interface GmailMessage {
  id: string;
  threadId: string;
  from: { name: string; email: string };
  subject: string;
  snippet: string;
  date: string;
  isRead: boolean;
}

interface WeeklyActivityItem {
  week: string;
  calls: number;
  rdv: number;
}

interface StructureKpis {
  caStructure: number;
  mandatsActifs: number;
  candidatsEnProcess: number;
  pipeStructure: number;
}

interface SpaData {
  bandeau: BandeauData;
  kpis: KpisData;
  structureKpis: StructureKpis | null;
  mandats: MandatSpa[];
  taches: TacheSpa[];
  recentEmails: { connected: boolean; messages: GmailMessage[]; unreadCount: number };
  weeklyActivity: WeeklyActivityItem[];
  calendarDots: Record<string, number>;
  revenueByMonth: Array<{ month: string; value: number }>;
}

interface CalendarEvent {
  id: string; title: string; startTime: string; endTime: string;
  participants?: string[]; location?: string; description?: string;
  status?: string;
  attendeeAnalysis?: {
    details: Array<{ email: string; role: 'internal' | 'candidat' | 'client' | 'external'; name?: string; entityId?: string }>;
    hasCandidats: boolean; hasClients: boolean; hasExternals: boolean; allInternal: boolean;
  } | null;
}

// ─── HELPERS ────────────────────────────────────────

function formatCurrency(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k\u20AC`;
  return `${n}\u20AC`;
}

function TrendBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const isPositive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
      isPositive ? 'bg-revenue-100 text-revenue-500' : 'bg-danger-100 text-danger-500'
    }`}>
      {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {isPositive ? '+' : ''}{value}%
    </span>
  );
}

// ─── ANIMATED COUNTER ───────────────────────────────

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const mv = useMotionValue(0);
  const sv = useSpring(mv, { stiffness: 100, damping: 30 });
  const display = useTransform(sv, (v: number) => Math.round(v).toLocaleString('fr-FR'));
  useEffect(() => { mv.set(value); }, [value, mv]);
  return <><motion.span>{display}</motion.span>{suffix}</>;
}

// ─── STAGGER ────────────────────────────────────────

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
};

// ─── PIPELINE STAGE LABELS ──────────────────────────

const PIPELINE_STAGES = [
  { key: 'SOURCING', label: 'Src', color: '#A78BFA' },
  { key: 'CONTACTE', label: 'Cont', color: '#3B82F6' },
  { key: 'ENTRETIEN_1', label: 'Entr', color: '#7C5CFC' },
  { key: 'ENTRETIEN_CLIENT', label: 'Client', color: '#14B8A6' },
  { key: 'OFFRE', label: 'Offre', color: '#F59E0B' },
  { key: 'PLACE', label: 'Place', color: '#059669' },
];

function StageDots({ highestStage }: { highestStage: string }) {
  const highestIdx = PIPELINE_STAGES.findIndex(s => s.key === highestStage);
  return (
    <div className="flex items-center gap-0.5">
      {PIPELINE_STAGES.map((stage, i) => {
        const isReached = i <= highestIdx;
        const isCurrent = i === highestIdx;
        return (
          <Fragment key={stage.key}>
            {i > 0 && (
              <div
                className="h-[1.5px]"
                style={{
                  width: 8,
                  background: isReached ? stage.color : '#EEEEF4',
                }}
              />
            )}
            <div
              style={{
                width: isCurrent ? 10 : 7,
                height: isCurrent ? 10 : 7,
                borderRadius: '50%',
                background: isReached ? stage.color : 'transparent',
                border: !isReached ? '1.5px solid #EEEEF4' : isCurrent ? `2px solid ${stage.color}` : 'none',
                flexShrink: 0,
              }}
              title={stage.label}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

// ─── MINI CALENDAR ──────────────────────────────────

function MiniCalendar({ calendarDots }: { calendarDots: Record<string, number> }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday = 0
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;

  const todayDate = now.getDate();
  const monthLabel = format(now, 'MMMM yyyy', { locale: fr });

  const cells: Array<{ day: number | null; isToday: boolean; isPast: boolean; isWeekend: boolean; dots: number }> = [];
  // Fill leading empty cells
  for (let i = 0; i < startDay; i++) cells.push({ day: null, isToday: false, isPast: false, isWeekend: false, dots: 0 });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayIdx = (startDay + d - 1) % 7; // 0=Mon...6=Sun
    cells.push({ day: d, isToday: d === todayDate, isPast: d < todayDate, isWeekend: dayIdx >= 5, dots: calendarDots[dateStr] ?? 0 });
  }
  // Fill trailing to complete last row
  while (cells.length % 7 !== 0) cells.push({ day: null, isToday: false, isPast: false, isWeekend: false, dots: 0 });

  const dayHeaders = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="text-[12px] font-semibold text-neutral-700 mb-1 capitalize shrink-0">{monthLabel}</div>
      <div className="grid grid-cols-7 text-center flex-1 min-h-0" style={{ gap: '1px 0' }}>
        {dayHeaders.map((h, i) => (
          <div key={i} className="text-[9px] font-semibold text-neutral-400 leading-[16px]">{h}</div>
        ))}
        {cells.map((c, i) => (
          <div key={i} className="flex flex-col items-center justify-center" style={{ height: 20 }}>
            {c.day ? (
              <>
                <div
                  className={`w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] leading-none cursor-pointer transition-colors ${
                    c.isToday
                      ? 'bg-brand-500 text-white font-bold'
                      : c.isWeekend
                        ? 'text-neutral-300'
                        : c.isPast
                          ? 'text-neutral-400 hover:bg-neutral-100'
                          : 'text-neutral-700 font-medium hover:bg-neutral-100'
                  }`}
                >
                  {c.day}
                </div>
                {c.dots > 0 && (
                  <div className="flex gap-px" style={{ marginTop: 1 }}>
                    {Array.from({ length: Math.min(c.dots, 3) }).map((_, j) => (
                      <div key={j} className="rounded-full bg-brand-400" style={{ width: 3, height: 3 }} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ width: 18, height: 18 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════
// MAIN DASHBOARD PAGE
// ═════════════════════════════════════════════════════

export default function DashboardPage() {
  return <RecruiterDashboard />;
}

// ─── TOGGLE PILL ────────────────────────────────────

function TogglePill({
  view, setView, isAdmin,
}: {
  view: string;
  setView: (v: 'personal' | 'team' | 'admin') => void;
  isAdmin: boolean;
}) {
  const items: Array<{ key: 'personal' | 'team' | 'admin'; label: string }> = [
    { key: 'personal', label: 'Mon activite' },
    { key: 'team', label: 'Equipe' },
  ];
  if (isAdmin) items.push({ key: 'admin', label: 'Admin' });

  return (
    <div className="flex rounded-lg overflow-hidden border border-neutral-100">
      {items.map(item => (
        <button
          key={item.key}
          onClick={() => setView(item.key)}
          className={`px-4 py-1.5 text-[13px] font-medium transition-colors ${
            view === item.key
              ? 'bg-brand-500 text-white'
              : 'bg-neutral-50 text-neutral-500 hover:text-neutral-700'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════
// RECRUITER DASHBOARD (SPA 360)
// ═════════════════════════════════════════════════════

function RecruiterDashboard() {
  usePageTitle('Dashboard');
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
  const [emailComposerOpen, setEmailComposerOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<{ to: string; subject: string } | null>(null);
  const [bookingCopied, setBookingCopied] = useState(false);
  const [briefPanel, setBriefPanel] = useState<{
    entityType: 'CANDIDAT' | 'CLIENT';
    entityId: string;
    entityName: string;
    calendarEventId?: string;
  } | null>(null);

  // ── API CALLS ─────────────────────────────────────
  const { data: spaData, isLoading } = useQuery({
    queryKey: ['dashboard', 'spa', period],
    queryFn: () => api.get<SpaData>(`/dashboard/spa?period=${period}&team=false`),
  });

  const { data: calEvents } = useQuery({
    queryKey: ['calendar', 'events'],
    queryFn: () => api.get<{ data: CalendarEvent[] }>('/integrations/calendar/events'),
  });

  const { data: bookingSettings } = useQuery({
    queryKey: ['booking', 'settings'],
    queryFn: () => api.get<{ slug: string; isActive: boolean }>('/booking/settings'),
  });

  const structureKpis = spaData?.structureKpis;

  // ── DERIVED DATA ──────────────────────────────────
  const bandeau = spaData?.bandeau;
  const kpis = spaData?.kpis;
  const mandats = spaData?.mandats ?? [];
  const tachesRaw = spaData?.taches ?? [];
  // Sort tasks: overdue first, then by priority (HAUTE > MOYENNE > BASSE), then by date
  const taches = useMemo(() => {
    const PRIORITY_ORDER: Record<string, number> = { HAUTE: 0, MOYENNE: 1, BASSE: 2 };
    const now = new Date();
    return [...tachesRaw].sort((a, b) => {
      const aOverdue = a.tacheDueDate && new Date(a.tacheDueDate) < now ? 1 : 0;
      const bOverdue = b.tacheDueDate && new Date(b.tacheDueDate) < now ? 1 : 0;
      if (aOverdue !== bOverdue) return bOverdue - aOverdue; // overdue first
      const aPrio = PRIORITY_ORDER[a.metadata?.priority || a.type || ''] ?? 1;
      const bPrio = PRIORITY_ORDER[b.metadata?.priority || b.type || ''] ?? 1;
      if (aPrio !== bPrio) return aPrio - bPrio; // high prio first
      // then by date
      const aDate = a.tacheDueDate ? new Date(a.tacheDueDate).getTime() : Infinity;
      const bDate = b.tacheDueDate ? new Date(b.tacheDueDate).getTime() : Infinity;
      return aDate - bDate;
    });
  }, [tachesRaw]);
  const emails = spaData?.recentEmails;
  const weeklyActivity = spaData?.weeklyActivity ?? [];
  const calendarDots = spaData?.calendarDots ?? {};

  const rawEvents = calEvents?.data ?? [];
  const categorizedAllEvents = useMemo(() => categorizeEvents(rawEvents), [rawEvents]);

  const todayEvents = useMemo(
    () => categorizedAllEvents
      .filter(e => { try { return isTodayFn(new Date(e.startTime)); } catch { return false; } })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [categorizedAllEvents],
  );

  // Enrich calendarDots with real calendar events
  const enrichedCalendarDots = useMemo(() => {
    const dots: Record<string, number> = { ...calendarDots };
    for (const ev of categorizedAllEvents) {
      try {
        const dateStr = format(new Date(ev.startTime), 'yyyy-MM-dd');
        dots[dateStr] = (dots[dateStr] ?? 0) + 1;
      } catch { /* skip */ }
    }
    return dots;
  }, [calendarDots, categorizedAllEvents]);

  // Bandeau notification text
  const bandeauItems = useMemo(() => {
    if (!bandeau) return [];
    const items: string[] = [];
    if (bandeau.emailsNonLus > 0) items.push(`${bandeau.emailsNonLus} email${bandeau.emailsNonLus > 1 ? 's' : ''} non lu${bandeau.emailsNonLus > 1 ? 's' : ''}`);
    if (bandeau.mandatsDormants.count > 0) {
      const worst = bandeau.mandatsDormants.worst;
      items.push(`${bandeau.mandatsDormants.count} mandat${bandeau.mandatsDormants.count > 1 ? 's' : ''} dormant${bandeau.mandatsDormants.count > 1 ? 's' : ''}${worst ? ` (${worst.jours}j)` : ''}`);
    }
    if (bandeau.tachesEnRetard > 0) items.push(`${bandeau.tachesEnRetard} tache${bandeau.tachesEnRetard > 1 ? 's' : ''} en retard`);
    if (bandeau.sequenceReplies > 0) items.push(`${bandeau.sequenceReplies} reponse${bandeau.sequenceReplies > 1 ? 's' : ''} sequence`);
    if (bandeau.rdvAujourdhui > 0) items.push(`${bandeau.rdvAujourdhui} RDV aujourd'hui`);
    return items;
  }, [bandeau]);

  const hasAlerts = bandeauItems.length > 0 && (
    (bandeau?.tachesEnRetard ?? 0) > 0 ||
    (bandeau?.mandatsDormants.count ?? 0) > 0
  );

  // Check if now is between two events
  const nowTime = new Date();

  // Task mutations
  const completeTacheMutation = useMutation({
    mutationFn: (id: string) => api.put(`/taches/${id}/complete`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard', 'spa'] }),
  });

  // ═══════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════

  return (
    <div
      className="flex flex-col dash-root"
      style={{ height: 'calc(100vh - 64px)', background: '#F8F8FA', overflow: 'hidden' }}
    >
      {/* ── BANDEAU NOTIFICATION (36px) ── */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center shrink-0 px-6 gap-3"
        style={{
          height: 36,
          background: hasAlerts ? '#FFF7ED' : '#F0FDF4',
        }}
      >
        {/* Pulse dot */}
        <div className="relative shrink-0">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: hasAlerts ? '#F59E0B' : '#22C55E' }}
          />
          <div
            className="absolute inset-0 w-2 h-2 rounded-full animate-ping"
            style={{ background: hasAlerts ? '#F59E0B' : '#22C55E', opacity: 0.4 }}
          />
        </div>

        {/* Text */}
        <div className="flex-1 text-[13px] text-neutral-700 truncate">
          {bandeauItems.length > 0 ? bandeauItems.join(' · ') : 'Tout est en ordre !'}
        </div>

        {/* CTA */}
        {bandeauItems.length > 0 && (
          <button
            onClick={() => navigate('/taches')}
            className="flex items-center gap-1 text-[12px] font-semibold text-brand-500 hover:text-brand-600 shrink-0"
          >
            VOIR <ArrowRight size={12} />
          </button>
        )}
      </motion.div>

      {/* ── GREETING + CONTROLS (44px) ── */}
      <div className="flex items-center justify-between px-6 shrink-0" style={{ height: 44 }}>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[22px] font-semibold text-neutral-900">
            Bonjour, {user?.prenom || 'Recruteur'}
          </span>
          <span className="text-[15px] font-normal text-neutral-400 ml-1">
            {' \u2014 '}{format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Booking public link */}
          {bookingSettings?.isActive && bookingSettings?.slug && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(`https://ats.propium.co/book/${bookingSettings.slug}`);
                setBookingCopied(true);
                toast('success', 'Lien booking copie !');
                setTimeout(() => setBookingCopied(false), 2000);
              }}
              className="flex items-center gap-1.5 h-8 rounded-lg border border-neutral-200 bg-white px-3 text-[13px] font-medium text-neutral-700 hover:border-brand-300 hover:text-brand-600 transition-colors"
              title={`https://ats.propium.co/book/${bookingSettings.slug}`}
            >
              {bookingCopied ? <Check size={13} className="text-green-500" /> : <Link2 size={13} />}
              {bookingCopied ? 'Copie !' : 'Lien booking'}
            </button>
          )}
          <div className="relative">
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as any)}
              className="h-8 appearance-none rounded-lg border border-neutral-200 bg-white pl-3 pr-7 text-[13px] font-medium text-neutral-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="today">Aujourd&apos;hui</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
            </select>
            <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400" />
          </div>
        </div>
      </div>

      {/* ── KPI ROW (72px) ── */}
      <div className="px-6 shrink-0" style={{ height: 68, marginTop: 2 }}>
        {isLoading ? (
          <div className="flex gap-0 h-full">
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-full flex-1 rounded-xl" />)}
          </div>
        ) : (
          <motion.div
            className="flex h-full bg-white rounded-xl shadow-[0_1px_4px_rgba(26,26,46,0.05)] overflow-hidden"
            variants={stagger} initial="hidden" animate="show"
          >
            {/* CA MOIS */}
            <motion.div variants={fadeUp} className="flex-1 flex flex-col justify-center px-4 border-r border-neutral-100">
              <div className="flex items-center gap-1.5">
                <DollarSign size={13} className="text-revenue-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">CA Mois</span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-[18px] font-bold text-revenue-500 leading-none">
                  {formatCurrency(kpis?.caMois.value ?? 0)}
                </span>
                <TrendBadge value={kpis?.caMois.delta ?? null} />
              </div>
            </motion.div>

            {/* APPELS */}
            <motion.div variants={fadeUp} className="flex-1 flex flex-col justify-center px-4 border-r border-neutral-100">
              <div className="flex items-center gap-1.5">
                <Phone size={13} className="text-activity-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Appels</span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-[18px] font-bold text-activity-500 leading-none">
                  <AnimatedCounter value={kpis?.appels.today ?? 0} />
                </span>
                <span className="text-[13px] font-semibold text-neutral-300">/ {kpis?.appels.week ?? 0}</span>
                <span className="text-[10px] text-neutral-400 ml-1">Moy {kpis?.appels.moyJour ?? 0}/j</span>
              </div>
            </motion.div>

            {/* RDV SEMAINE */}
            <motion.div variants={fadeUp} className="flex-1 flex flex-col justify-center px-4 border-r border-neutral-100">
              <div className="flex items-center gap-1.5">
                <Calendar size={13} className="text-neutral-700" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">RDV Semaine</span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-[18px] font-bold text-neutral-900 leading-none">
                  <AnimatedCounter value={kpis?.rdv.today ?? 0} />
                </span>
                <span className="text-[13px] font-semibold text-neutral-300">/ {kpis?.rdv.week ?? 0}</span>
              </div>
              <div className="text-[10px] text-neutral-400 mt-0.5">
                {kpis?.rdv.confirmes ?? 0} confirme{(kpis?.rdv.confirmes ?? 0) > 1 ? 's' : ''}, {kpis?.rdv.enAttente ?? 0} en attente
              </div>
            </motion.div>

            {/* CANDIDATS EN PROCESS */}
            <motion.div variants={fadeUp} className="flex-1 flex flex-col justify-center px-4 border-r border-neutral-100">
              <div className="flex items-center gap-1.5">
                <Users size={13} className="text-pipeline-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Candidats</span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-[18px] font-bold text-pipeline-500 leading-none">
                  <AnimatedCounter value={kpis?.candidatsEnProcess ?? 0} />
                </span>
                <span className="text-[10px] text-neutral-400">en process</span>
              </div>
            </motion.div>

            {/* PIPE PONDERE */}
            <motion.div variants={fadeUp} className="flex-1 flex flex-col justify-center px-4">
              <div className="flex items-center gap-1.5">
                <TrendingUp size={13} className="text-brand-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Pipe Pondere</span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-[18px] font-bold text-brand-500 leading-none">
                  {formatCurrency(kpis?.pipePondere.value ?? 0)}
                </span>
                <TrendBadge value={kpis?.pipePondere.delta ?? null} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>

      {/* ── STRUCTURE KPIS (for recruteurs — global numbers) ── */}
      {structureKpis && (
        <div className="px-6 shrink-0 mt-1.5">
          <div className="flex items-center gap-4 rounded-lg bg-neutral-50 border border-neutral-100 px-4 py-1.5">
            <div className="flex items-center gap-1.5">
              <Building2 size={12} className="text-neutral-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Structure</span>
            </div>
            <div className="h-3 w-px bg-neutral-200" />
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-neutral-500">CA global</span>
              <span className="text-[12px] font-bold text-revenue-500">{formatCurrency(structureKpis.caStructure)}</span>
            </div>
            <div className="h-3 w-px bg-neutral-200" />
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-neutral-500">Mandats actifs</span>
              <span className="text-[12px] font-bold text-neutral-800">{structureKpis.mandatsActifs}</span>
            </div>
            <div className="h-3 w-px bg-neutral-200" />
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-neutral-500">Candidats en process</span>
              <span className="text-[12px] font-bold text-pipeline-500">{structureKpis.candidatsEnProcess}</span>
            </div>
            <div className="h-3 w-px bg-neutral-200" />
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-neutral-500">Pipe global</span>
              <span className="text-[12px] font-bold text-brand-500">{formatCurrency(structureKpis.pipeStructure)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── AI CALENDAR SUGGESTIONS ── */}
      <CalendarAiSuggestions />

      {/* ── AI PIPELINE SUGGESTIONS ── */}
      <PipelineAiSuggestions />

      {/* ── MAIN ZONE (flex-1) ── */}
      <div className="flex-1 min-h-0 flex gap-3 px-6 mt-2 main-zone">
        {/* ── COL 1: AGENDA DU JOUR (28%) ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="rounded-xl bg-white shadow-[0_1px_4px_rgba(26,26,46,0.04)] flex flex-col min-h-0 agenda-col"
          style={{ width: '28%' }}
        >
          <div className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b border-neutral-50">
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-brand-500" />
              <h2 className="text-[14px] font-semibold text-neutral-900">Agenda du jour</h2>
              <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-500">
                {todayEvents.length}
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1.5">
            {todayEvents.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-neutral-300">
                <Calendar size={28} strokeWidth={1} className="mb-2" />
                <span className="text-[13px]">Aucun RDV aujourd'hui</span>
              </div>
            )}
            {todayEvents.map((event, idx) => {
              const startDate = new Date(event.startTime);
              const endDate = new Date(event.endTime);
              const isPastEvent = endDate < nowTime;
              const isNow = startDate <= nowTime && endDate >= nowTime;
              const colors = MEETING_COLORS[event.meetingType] || MEETING_COLORS.other;

              return (
                <div key={event.id}>
                  {/* "Now" marker line */}
                  {isNow && idx === todayEvents.findIndex(e => {
                    const s = new Date(e.startTime);
                    const en = new Date(e.endTime);
                    return s <= nowTime && en >= nowTime;
                  }) && (
                    <div className="flex items-center gap-2 my-1">
                      <div className="w-2 h-2 rounded-full bg-danger-500" />
                      <div className="flex-1 h-[1px] bg-danger-500" />
                      <span className="text-[10px] font-medium text-danger-500">{format(nowTime, 'HH:mm')}</span>
                    </div>
                  )}
                  <div
                    className="flex gap-2.5 rounded-lg p-2 transition-all hover:shadow-sm cursor-pointer"
                    style={{
                      opacity: isPastEvent ? 0.5 : 1,
                      borderLeft: `3px solid ${colors.border}`,
                      background: isNow ? colors.bg : 'transparent',
                    }}
                  >
                    {/* Time */}
                    <div className="flex flex-col items-center shrink-0" style={{ width: 40 }}>
                      <span className="text-[12px] font-semibold text-neutral-700">
                        {format(startDate, 'HH:mm')}
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        {format(endDate, 'HH:mm')}
                      </span>
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-neutral-800 truncate leading-tight">
                        {event.title}
                      </div>
                      {event.participants && event.participants.length > 0 && (
                        <div className="text-[10px] text-neutral-400 truncate mt-0.5">
                          {event.participants.slice(0, 2).join(', ')}
                          {event.participants.length > 2 && ` +${event.participants.length - 2}`}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-1">
                        {/* Type badge */}
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                          style={{ background: colors.pill, color: colors.text }}
                        >
                          {event.meetingTypeLabel}
                        </span>
                        {/* Status badge */}
                        {event.status === 'confirmed' && (
                          <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-green-50 text-green-600">
                            Confirme
                          </span>
                        )}
                        {event.status === 'tentative' && (
                          <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-amber-50 text-amber-600">
                            En attente
                          </span>
                        )}
                        {/* Brief button — show if event has candidat or client attendee */}
                        {event.attendeeAnalysis?.details?.some(d => d.entityId && (d.role === 'candidat' || d.role === 'client')) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const attendee = event.attendeeAnalysis!.details.find(d => d.entityId && (d.role === 'candidat' || d.role === 'client'))!;
                              setBriefPanel({
                                entityType: attendee.role === 'candidat' ? 'CANDIDAT' : 'CLIENT',
                                entityId: attendee.entityId!,
                                entityName: attendee.name || attendee.email,
                                calendarEventId: event.id,
                              });
                            }}
                            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors flex items-center gap-0.5"
                            title="Brief pre-appel IA"
                          >
                            <Bot size={9} />
                            Brief
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* ── COL 2: MANDATS (40%) ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="rounded-xl bg-white shadow-[0_1px_4px_rgba(26,26,46,0.04)] flex flex-col min-h-0 mandats-col"
          style={{ width: '40%' }}
        >
          <div className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b border-neutral-50">
            <div className="flex items-center gap-2">
              <Building2 size={15} className="text-pipeline-500" />
              <h2 className="text-[14px] font-semibold text-neutral-900">Mandats</h2>
              <span className="rounded-full bg-neutral-50 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
                {mandats.length}
              </span>
            </div>
            <button onClick={() => navigate('/mandats')} className="text-[12px] text-brand-500 hover:underline flex items-center gap-0.5">
              Voir tous <ChevronRight size={11} />
            </button>
          </div>

          {/* Table header */}
          <div
            className="grid px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 shrink-0 border-b border-neutral-50"
            style={{ gridTemplateColumns: '1fr 55px 110px 40px 55px' }}
          >
            <span>Mandat</span>
            <span className="text-right">Fee</span>
            <span className="text-center">Etape</span>
            <span className="text-center">Cand.</span>
            <span className="text-right">Activ.</span>
          </div>

          {/* Table body */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {mandats.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-neutral-300">
                <Building2 size={28} strokeWidth={1} className="mb-2" />
                <span className="text-[13px]">Aucun mandat actif</span>
              </div>
            )}
            {mandats.map(m => (
              <div
                key={m.id}
                onClick={() => navigate(`/mandats/${m.id}`)}
                className="grid px-4 py-2 items-center cursor-pointer hover:bg-neutral-25 transition-colors border-b border-neutral-50 last:border-b-0"
                style={{
                  gridTemplateColumns: '1fr 55px 110px 40px 55px',
                  background: m.isDormant ? 'rgba(251,191,36,0.05)' : undefined,
                }}
              >
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-neutral-800 truncate">{m.titrePoste}</div>
                  <div className="text-[10px] text-neutral-400 truncate">{m.entreprise.nom}</div>
                </div>
                <div className="text-[11px] text-right font-medium text-neutral-600">
                  {m.feeMontantEstime ? formatCurrency(m.feeMontantEstime) : '-'}
                </div>
                <div className="flex justify-center">
                  <StageDots highestStage={m.highestStage} />
                </div>
                <div className="text-[11px] text-center font-medium text-neutral-600">
                  {m.totalCandidats}
                </div>
                <div className="text-right">
                  {m.daysSinceActivity !== null ? (
                    <span className={`text-[11px] font-semibold ${
                      m.daysSinceActivity > 14 ? 'text-danger-500' :
                      m.daysSinceActivity > 7 ? 'text-urgent-500' :
                      'text-neutral-500'
                    }`}>
                      {m.daysSinceActivity}j
                      {m.isDormant && <AlertTriangle size={9} className="inline ml-0.5 text-urgent-500" />}
                    </span>
                  ) : (
                    <span className="text-[11px] text-neutral-300">-</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── COL 3: MESSAGES + TACHES (32%) ── */}
        <div className="flex flex-col gap-3 min-h-0 messages-tasks-col" style={{ width: '32%' }}>
          {/* MESSAGES (55% of col) */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="rounded-xl bg-white shadow-[0_1px_4px_rgba(26,26,46,0.04)] flex flex-col min-h-0"
            style={{ flex: '55 1 0%' }}
          >
            <div className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b border-neutral-50">
              <div className="flex items-center gap-2">
                <Mail size={15} className="text-brand-500" />
                <h2 className="text-[14px] font-semibold text-neutral-900">Messages</h2>
                {(emails?.unreadCount ?? 0) > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-white">
                    {emails!.unreadCount}
                  </span>
                )}
              </div>
              <button onClick={() => navigate('/emails')} className="text-[12px] text-brand-500 hover:underline flex items-center gap-0.5">
                Voir tous <ChevronRight size={11} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {!emails?.connected && (
                <div className="flex flex-col items-center justify-center h-full text-neutral-300 p-4">
                  <Mail size={24} strokeWidth={1} className="mb-2" />
                  <span className="text-[12px] text-center">Gmail non connecte</span>
                </div>
              )}
              {emails?.connected && emails.messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-neutral-300">
                  <Mail size={24} strokeWidth={1} className="mb-2" />
                  <span className="text-[12px]">Pas de nouveaux emails</span>
                </div>
              )}
              {emails?.messages.map(msg => (
                <div
                  key={msg.id}
                  className="flex gap-2.5 px-3 py-2 cursor-pointer hover:bg-neutral-25 transition-colors border-b border-neutral-50 last:border-b-0"
                  style={{ background: !msg.isRead ? 'rgba(59,130,246,0.04)' : undefined }}
                  onClick={() => {
                    setReplyTo({ to: msg.from.email, subject: `Re: ${msg.subject}` });
                    setEmailComposerOpen(true);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] truncate ${!msg.isRead ? 'font-semibold text-neutral-800' : 'font-medium text-neutral-600'}`}>
                        {msg.from.name || msg.from.email}
                      </span>
                      <span className="text-[10px] text-neutral-400 shrink-0">
                        {(() => {
                          try {
                            const d = new Date(msg.date);
                            if (isTodayFn(d)) return format(d, 'HH:mm');
                            return format(d, 'dd/MM');
                          } catch { return ''; }
                        })()}
                      </span>
                    </div>
                    <div className={`text-[11px] truncate mt-0.5 ${!msg.isRead ? 'font-medium text-neutral-700' : 'text-neutral-500'}`}>
                      {msg.subject}
                    </div>
                    <div className="text-[10px] text-neutral-400 truncate mt-0.5">
                      {msg.snippet}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* TACHES (45% of col) */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="rounded-xl bg-white shadow-[0_1px_4px_rgba(26,26,46,0.04)] flex flex-col min-h-0"
            style={{ flex: '45 1 0%' }}
          >
            <div className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b border-neutral-50">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-revenue-500" />
                <h2 className="text-[14px] font-semibold text-neutral-900">Taches du jour</h2>
                <span className="rounded-full bg-neutral-50 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
                  {taches.length}
                </span>
              </div>
              <button onClick={() => navigate('/taches')} className="text-[12px] text-brand-500 hover:underline flex items-center gap-0.5">
                Voir <ChevronRight size={11} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {taches.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-neutral-300">
                  <Check size={24} strokeWidth={1} className="mb-1" />
                  <span className="text-[12px]">Aucune tache</span>
                </div>
              )}
              {taches.map(t => {
                const isOverdue = t.tacheDueDate && isPast(new Date(t.tacheDueDate)) && !t.tacheCompleted;
                const isSequenceTask = t.metadata && (t.metadata.sequenceRunId || t.metadata.channel);
                return (
                  <div
                    key={t.id}
                    className="flex items-start gap-2 px-3 py-2 hover:bg-neutral-25 transition-colors border-b border-neutral-50 last:border-b-0"
                  >
                    <button
                      onClick={() => completeTacheMutation.mutate(t.id)}
                      className="mt-0.5 shrink-0"
                    >
                      {t.tacheCompleted ? (
                        <CheckCircle2 size={15} className="text-revenue-500" />
                      ) : (
                        <Circle size={15} className="text-neutral-300 hover:text-brand-500 transition-colors" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[12px] leading-tight ${t.tacheCompleted ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}>
                        {t.titre}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {t.tacheDueDate && (
                          (() => {
                            const due = formatTaskDue(t.tacheDueDate);
                            return (
                              <span className={`text-[10px] font-medium ${due.isOverdue ? 'text-danger-500 font-semibold' : due.isToday ? 'text-amber-500' : 'text-neutral-400'}`}>
                                {due.text}
                              </span>
                            );
                          })()
                        )}
                        {isSequenceTask && (
                          <span className="flex items-center gap-0.5 rounded-full bg-purple-50 px-1.5 py-0.5 text-[9px] font-semibold text-purple-600">
                            <Zap size={8} />
                            {t.metadata?.channel ?? 'Seq'}
                          </span>
                        )}
                        {t.entiteType && t.entiteId && ENTITE_ROUTE_MAP[t.entiteType] && (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`${ENTITE_ROUTE_MAP[t.entiteType!]}/${t.entiteId}`); }}
                            className="flex items-center gap-0.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-medium text-violet-600 hover:bg-violet-100 transition-colors"
                          >
                            <Link2 size={8} />
                            {t.entiteType === 'CANDIDAT' ? 'Candidat' : t.entiteType === 'CLIENT' ? 'Client' : t.entiteType === 'ENTREPRISE' ? 'Entreprise' : 'Mandat'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── BOTTOM ZONE (~160px) ── */}
      <div className="flex gap-3 px-6 pb-3 mt-2 shrink-0 bottom-zone" style={{ height: 140 }}>
        {/* ACTIVITE CHART (65%) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="rounded-xl bg-white shadow-[0_1px_4px_rgba(26,26,46,0.04)] flex flex-col activity-chart"
          style={{ width: '65%' }}
        >
          <div className="flex items-center justify-between px-4 py-2 shrink-0">
            <div className="flex items-center gap-2">
              <Phone size={14} className="text-activity-500" />
              <h2 className="text-[13px] font-semibold text-neutral-900">Activite &mdash; 4 dernieres semaines</h2>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm" style={{ background: '#3B82F6' }} />
                Appels
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm" style={{ background: '#14B8A6' }} />
                RDV
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-0 px-2 pb-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyActivity} barGap={2}>
                <XAxis
                  dataKey="week"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9CA3AF', fontSize: 11 }}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #F1F2F6', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Bar dataKey="calls" name="Appels" fill="#3B82F6" radius={[3, 3, 0, 0]} barSize={20} />
                <Bar dataKey="rdv" name="RDV" fill="#14B8A6" radius={[3, 3, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* MINI CALENDAR (35%) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="rounded-xl bg-white shadow-[0_1px_4px_rgba(26,26,46,0.04)] px-3 py-2 calendar-widget overflow-hidden"
          style={{ width: '35%' }}
        >
          <MiniCalendar calendarDots={enrichedCalendarDots} />
        </motion.div>
      </div>

      {/* ── EMAIL COMPOSER ── */}
      {emailComposerOpen && (
        <EmailComposer
          isOpen={emailComposerOpen}
          onClose={() => { setEmailComposerOpen(false); setReplyTo(null); }}
          defaultTo={replyTo?.to}
          defaultSubject={replyTo?.subject}
        />
      )}

      {/* ── RESPONSIVE STYLES ── */}
      <style>{`
        /* 1440px: bottom zone wraps, main zone still 3 columns */
        @media (max-width: 1440px) {
          .bottom-zone {
            flex-wrap: wrap;
            height: auto !important;
          }
          .activity-chart,
          .calendar-widget {
            width: 100% !important;
            height: 140px;
          }
        }
        /* 1280px: 2-column layout. Agenda+Mandats on top, Messages+Tasks below. Scroll enabled. */
        @media (max-width: 1280px) {
          .dash-root {
            overflow-y: auto !important;
            height: auto !important;
            min-height: calc(100vh - 64px);
          }
          .main-zone {
            flex-wrap: wrap;
            overflow-y: auto;
            flex: 1 1 auto;
          }
          .agenda-col {
            width: 48% !important;
            max-height: 320px;
          }
          .mandats-col {
            width: 48% !important;
            max-height: 320px;
          }
          .messages-tasks-col {
            width: 100% !important;
            flex-direction: row !important;
            min-height: 200px;
            max-height: 240px;
          }
          .messages-tasks-col > div {
            flex: 1 1 50% !important;
          }
          .bottom-zone {
            flex-wrap: wrap;
            height: auto !important;
          }
          .activity-chart,
          .calendar-widget {
            width: 100% !important;
            height: 140px;
          }
        }
        /* 768px and below: single column, scrollable */
        @media (max-width: 900px) {
          .dash-root {
            overflow-y: auto !important;
            height: auto !important;
            min-height: calc(100vh - 64px);
          }
          .main-zone {
            flex-direction: column;
            overflow-y: auto;
            flex: 1 1 auto;
          }
          .agenda-col,
          .mandats-col {
            width: 100% !important;
            max-height: 280px;
            flex-shrink: 0;
          }
          .messages-tasks-col {
            width: 100% !important;
            flex-direction: column !important;
            max-height: none !important;
            min-height: 0;
            flex-shrink: 0;
          }
          .messages-tasks-col > div {
            flex: 0 0 auto !important;
            max-height: 200px;
          }
          .bottom-zone {
            flex-direction: column;
            height: auto !important;
            flex-shrink: 0;
          }
          .activity-chart,
          .calendar-widget {
            width: 100% !important;
            height: 160px;
          }
        }
      `}</style>

      {/* ── CALL BRIEF PANEL ── */}
      <CallBriefPanel
        entityType={briefPanel?.entityType ?? 'CANDIDAT'}
        entityId={briefPanel?.entityId ?? ''}
        entityName={briefPanel?.entityName ?? ''}
        calendarEventId={briefPanel?.calendarEventId}
        isOpen={!!briefPanel}
        onClose={() => setBriefPanel(null)}
      />
    </div>
  );
}
