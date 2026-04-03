import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Search, Filter, Download, TrendingUp, Eye,
  MessageSquare, Calendar, ArrowRight, X,
  User, Building2, Mail, Phone, Linkedin, Clock, Activity,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth-store';
import PageHeader from '../../components/ui/PageHeader';

// ─── TYPES ──────────────────────────────────────────────

type PushStatus = 'ENVOYE' | 'OUVERT' | 'REPONDU' | 'RDV_BOOK' | 'CONVERTI_MANDAT' | 'SANS_SUITE';
type PushCanal = 'EMAIL' | 'LINKEDIN';
type Period = 'week' | 'month' | 'quarter';

interface PushRecord {
  id: string;
  sentAt: string;
  candidat: { nom: string; prenom: string | null; posteActuel: string | null };
  prospect: { companyName: string; contactName: string | null; contactEmail: string | null };
  recruiter: { nom: string; prenom: string | null };
  canal: PushCanal;
  status: PushStatus;
  message_preview: string | null;
}

interface PushHistoryResponse {
  pushes: PushRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

interface PushDetail {
  id: string;
  candidat: { id: string; nom: string; prenom: string | null; posteActuel: string | null; email: string | null; telephone: string | null };
  prospect: { id: string; companyName: string; contactName: string | null; contactEmail: string | null; contactLinkedin: string | null; sector: string | null };
  recruiter: { id: string; nom: string; prenom: string | null };
  canal: PushCanal;
  status: PushStatus;
  message: string | null;
  sentAt: string;
  gmailSentAt: string | null;
  gmailThreadId: string | null;
  gmailMessageId: string | null;
  sequenceRun: { id: string; status: string; currentStep: number; startedAt: string } | null;
  activities: { id: string; type: string; titre: string | null; isTache: boolean; tacheCompleted: boolean; tacheDueDate: string | null; source: string; createdAt: string }[];
  createdAt: string;
}

interface DashboardStats {
  totals: {
    sent: number;
    opened: number;
    responded: number;
    rdv_booked: number;
    converted: number;
    sans_suite: number;
  };
  conversion_funnel: {
    opened_pct: number;
    responded_pct: number;
    rdv_booked_pct: number;
    converted_pct: number;
  };
  by_canal: Record<string, number>;
  by_recruiter: { id: string; name: string; sent: number; responded: number; converted: number }[];
  timeline: { date: string; count: number }[];
  top_prospects: { id: string; name: string; company: string; total: number; responded: number; response_rate: number }[];
  avg_response_time_hours: number | null;
}

// ─── CONSTANTS ──────────────────────────────────────────

const STATUS_CONFIG: Record<PushStatus, { label: string; bg: string; text: string; dot: string }> = {
  ENVOYE:          { label: 'Envoyé',        bg: 'bg-blue-50 dark:bg-blue-900/30',    text: 'text-blue-700 dark:text-blue-300',    dot: 'bg-blue-500' },
  OUVERT:          { label: 'Ouvert',          bg: 'bg-yellow-50 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', dot: 'bg-yellow-500' },
  REPONDU:         { label: 'Répondu',       bg: 'bg-green-50 dark:bg-green-900/30',   text: 'text-green-700 dark:text-green-300',   dot: 'bg-green-500' },
  RDV_BOOK:        { label: 'RDV booké',     bg: 'bg-purple-50 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
  CONVERTI_MANDAT: { label: 'Converti',        bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-600' },
  SANS_SUITE:      { label: 'Sans suite',      bg: 'bg-gray-50 dark:bg-gray-800',       text: 'text-gray-500 dark:text-gray-400',     dot: 'bg-gray-400' },
};

const CANAL_OPTIONS: { value: PushCanal | ''; label: string }[] = [
  { value: '', label: 'Tous les canaux' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'LINKEDIN', label: 'LinkedIn' },
];

const STATUS_OPTIONS: { value: PushStatus | ''; label: string }[] = [
  { value: '', label: 'Tous les statuts' },
  { value: 'ENVOYE', label: 'Envoyé' },
  { value: 'OUVERT', label: 'Ouvert' },
  { value: 'REPONDU', label: 'Répondu' },
  { value: 'RDV_BOOK', label: 'RDV booké' },
  { value: 'CONVERTI_MANDAT', label: 'Converti' },
  { value: 'SANS_SUITE', label: 'Sans suite' },
];

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'quarter', label: 'Trimestre' },
];

const FUNNEL_COLORS = ['#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#059669'];

// ─── HELPERS ────────────────────────────────────────────

function StatusBadge({ status }: { status: PushStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.ENVOYE;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useMemo(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ─── MAIN COMPONENT ────────────────────────────────────

export default function PushCVDashboard() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';

  // ── Filter state
  const [page, setPage] = useState(1);
  const [searchRaw, setSearchRaw] = useState('');
  const [statusFilter, setStatusFilter] = useState<PushStatus | ''>('');
  const [canalFilter, setCanalFilter] = useState<PushCanal | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [period, setPeriod] = useState<Period>('month');
  const limit = 20;

  const search = useDebounce(searchRaw, 400);

  // ── Build query strings
  const historyParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set('page', String(page));
    p.set('limit', String(limit));
    if (search) p.set('search', search);
    if (statusFilter) p.set('status', statusFilter);
    if (canalFilter) p.set('canal', canalFilter);
    if (dateFrom) p.set('from', dateFrom);
    if (dateTo) p.set('to', dateTo);
    return p.toString();
  }, [page, search, statusFilter, canalFilter, dateFrom, dateTo]);

  const statsParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set('period', period);
    return p.toString();
  }, [period]);

  // ── Queries
  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ['pushes-history', historyParams],
    queryFn: () => api.get<PushHistoryResponse>(`/pushes/history?${historyParams}`),
  });

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['pushes-stats', statsParams],
    queryFn: () => api.get<DashboardStats>(`/pushes/stats/dashboard?${statsParams}`),
  });

  // ── Slide-over state
  const [selectedPushId, setSelectedPushId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: pushDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['push-detail', selectedPushId],
    queryFn: () => api.get<PushDetail>(`/pushes/${selectedPushId}`),
    enabled: !!selectedPushId,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PushStatus }) =>
      api.patch(`/pushes/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['push-detail', selectedPushId] });
      queryClient.invalidateQueries({ queryKey: ['pushes-history'] });
      queryClient.invalidateQueries({ queryKey: ['pushes-stats'] });
    },
  });

  // ── Export CSV
  const handleExport = async () => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (statusFilter) p.set('status', statusFilter);
    if (canalFilter) p.set('canal', canalFilter);
    if (dateFrom) p.set('from', dateFrom);
    if (dateTo) p.set('to', dateTo);
    p.set('format', 'csv');
    const blob = await api.get<Blob>(`/pushes/history?${p.toString()}`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pushes-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Derived
  const pushes = history?.pushes ?? [];
  const totalPages = history?.pagination?.total_pages ?? 1;

  // ────────────────────────────────────────────────────────
  //  RENDER
  // ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Send size={26} className="text-primary-500" />
            Push CV
          </span>
        }
        subtitle="Historique et statistiques des push CV envoyés aux prospects"
        breadcrumbs={[
          { label: 'Accueil', href: '/' },
          { label: 'Push CV' },
        ]}
        actions={
          isAdmin ? (
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-gray-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Download size={16} />
              Exporter CSV
            </button>
          ) : undefined
        }
      />

      {/* ── STATS CARDS ──────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-end gap-1">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setPeriod(opt.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              period === opt.value
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-gray-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <StatCard
          label="Total envoyés"
          value={stats?.totals.sent ?? 0}
          icon={<Send size={20} />}
          color="blue"
          loading={loadingStats}
        />
        <StatCard
          label="Réponses"
          value={stats?.totals.responded ?? 0}
          icon={<MessageSquare size={20} />}
          color="green"
          loading={loadingStats}
        />
        <StatCard
          label="RDV bookés"
          value={stats?.totals.rdv_booked ?? 0}
          icon={<Calendar size={20} />}
          color="purple"
          loading={loadingStats}
        />
        <StatCard
          label="Taux conversion"
          value={stats?.totals.sent ? `${((stats.totals.converted / stats.totals.sent) * 100).toFixed(1)}%` : '0%'}
          icon={<TrendingUp size={20} />}
          color="emerald"
          loading={loadingStats}
        />
      </motion.div>

      {/* ── CONVERSION FUNNEL ────────────────────────────── */}
      {stats?.conversion_funnel && stats.totals.sent > 0 && (
        <motion.div
          className="mb-8 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-gray-800 shadow-sm p-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-4 flex items-center gap-2">
            <Eye size={16} className="text-primary-500" />
            Funnel de conversion
          </h3>
          <div className="flex items-end gap-2">
            {[
              { label: 'Envoyés', count: stats.totals.sent, pct: 100 },
              { label: 'Ouverts', count: stats.totals.opened, pct: stats.conversion_funnel.opened_pct },
              { label: 'Répondus', count: stats.totals.responded, pct: stats.conversion_funnel.responded_pct },
              { label: 'RDV bookés', count: stats.totals.rdv_booked, pct: stats.conversion_funnel.rdv_booked_pct },
              { label: 'Convertis', count: stats.totals.converted, pct: stats.conversion_funnel.converted_pct },
            ].map((step, i) => (
              <div key={step.label} className="flex-1 flex flex-col items-center gap-2">
                <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">{step.count}</span>
                <div className="w-full flex justify-center">
                  <motion.div
                    className="rounded-t-md"
                    style={{
                      backgroundColor: FUNNEL_COLORS[i] ?? '#6B7280',
                      width: `${Math.max(step.pct, 8)}%`,
                      minWidth: 24,
                    }}
                    initial={{ height: 0 }}
                    animate={{ height: 80 + (4 - i) * 16 }}
                    transition={{ delay: 0.15 + i * 0.05, type: 'spring', stiffness: 200, damping: 20 }}
                  />
                </div>
                <div className="text-center">
                  <span className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                    {step.label}
                  </span>
                  <span className="block text-[10px] text-neutral-400">{step.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── FILTERS ──────────────────────────────────────── */}
      <motion.div
        className="mb-6 flex flex-wrap items-center gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Rechercher candidat, prospect..."
            value={searchRaw}
            onChange={(e) => { setSearchRaw(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-gray-800 text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-colors"
          />
        </div>

        {/* Status */}
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as PushStatus | ''); setPage(1); }}
            className="pl-8 pr-8 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-gray-800 text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 appearance-none cursor-pointer transition-colors"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Canal */}
        <select
          value={canalFilter}
          onChange={(e) => { setCanalFilter(e.target.value as PushCanal | ''); setPage(1); }}
          className="px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-gray-800 text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 appearance-none cursor-pointer transition-colors"
        >
          {CANAL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-gray-800 text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-colors"
          />
          <span className="text-neutral-400 text-xs">au</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-gray-800 text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-colors"
          />
        </div>
      </motion.div>

      {/* ── TABLE ─────────────────────────────────────────── */}
      <motion.div
        className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 dark:border-neutral-700 bg-neutral-50/50 dark:bg-gray-900/30">
                <th className="text-left px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">Date</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">Candidat</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">Prospect / Entreprise</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">Canal</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">Statut</th>
                <th className="text-left px-4 py-3 font-medium text-neutral-500 dark:text-neutral-400">Message</th>
              </tr>
            </thead>
            <tbody>
              {loadingHistory ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-neutral-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                      Chargement...
                    </div>
                  </td>
                </tr>
              ) : pushes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-neutral-400">
                    Aucun push trouvé
                  </td>
                </tr>
              ) : (
                pushes.map((push, idx) => (
                  <motion.tr
                    key={push.id}
                    className="border-b border-neutral-50 dark:border-neutral-700/50 hover:bg-neutral-50/50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    onClick={() => setSelectedPushId(push.id)}
                  >
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300 whitespace-nowrap">
                      {format(new Date(push.sentAt), 'dd MMM yyyy', { locale: fr })}
                    </td>
                    <td className="px-4 py-3 font-medium text-neutral-800 dark:text-neutral-200">
                      {push.candidat ? `${push.candidat.prenom ?? ''} ${push.candidat.nom}`.trim() : '-'}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
                      <div>
                        {push.prospect?.contactName ?? '-'}
                      </div>
                      {push.prospect?.companyName && (
                        <div className="text-xs text-neutral-400">
                          {push.prospect.companyName}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400 text-xs">
                      {push.prospect?.contactEmail ?? '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                        push.canal === 'EMAIL'
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-sky-600 dark:text-sky-400'
                      }`}>
                        {push.canal === 'EMAIL' ? 'Email' : 'LinkedIn'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={push.status} />
                    </td>
                    <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400 max-w-[200px] truncate text-xs">
                      {push.message_preview ?? '-'}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── PAGINATION ───────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100 dark:border-neutral-700">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              Page {history?.pagination?.page ?? 1} sur {totalPages} ({history?.pagination?.total ?? 0} résultats)
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-gray-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Précédent
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                if (p > totalPages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 text-xs font-medium rounded-lg transition-colors ${
                      p === page
                        ? 'bg-primary-500 text-white'
                        : 'border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-gray-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-gray-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* ── SLIDE-OVER PANEL ─────────────────────────────── */}
      <AnimatePresence>
        {selectedPushId && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/40 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPushId(null)}
            />
            {/* Panel */}
            <motion.div
              className="fixed top-0 right-0 h-full w-full max-w-lg z-50 bg-white dark:bg-gray-900 shadow-2xl border-l border-neutral-200 dark:border-neutral-700 flex flex-col"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
                <h2 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
                  Détail du push
                </h2>
                <button
                  onClick={() => setSelectedPushId(null)}
                  className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-gray-800 text-neutral-500 dark:text-neutral-400 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {loadingDetail ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : pushDetail ? (
                  <>
                    {/* Status */}
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2">
                        Statut
                      </label>
                      <select
                        value={pushDetail.status}
                        onChange={(e) =>
                          statusMutation.mutate({ id: pushDetail.id, status: e.target.value as PushStatus })
                        }
                        disabled={statusMutation.isPending}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-gray-800 text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 appearance-none cursor-pointer transition-colors disabled:opacity-50"
                      >
                        {STATUS_OPTIONS.filter((o) => o.value !== '').map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Candidat */}
                    {pushDetail.candidat && (
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                        <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                          <User size={14} />
                          Candidat
                        </h3>
                        <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                          {pushDetail.candidat.prenom} {pushDetail.candidat.nom}
                        </p>
                        {pushDetail.candidat.posteActuel && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                            {pushDetail.candidat.posteActuel}
                          </p>
                        )}
                        <div className="mt-2 space-y-1">
                          {pushDetail.candidat.email && (
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
                              <Mail size={12} /> {pushDetail.candidat.email}
                            </p>
                          )}
                          {pushDetail.candidat.telephone && (
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
                              <Phone size={12} /> {pushDetail.candidat.telephone}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Prospect / Entreprise */}
                    {pushDetail.prospect && (
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                        <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                          <Building2 size={14} />
                          Prospect / Entreprise
                        </h3>
                        <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                          {pushDetail.prospect.contactName}
                        </p>
                        {pushDetail.prospect.companyName && (
                          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                            {pushDetail.prospect.companyName}
                            {pushDetail.prospect.sector && ` - ${pushDetail.prospect.sector}`}
                          </p>
                        )}
                        <div className="mt-2 space-y-1">
                          {pushDetail.prospect.contactEmail && (
                            <p className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
                              <Mail size={12} /> {pushDetail.prospect.contactEmail}
                            </p>
                          )}
                          {pushDetail.prospect.contactLinkedin && (
                            <a
                              href={pushDetail.prospect.contactLinkedin}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1.5"
                            >
                              <Linkedin size={12} /> Profil LinkedIn
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Recruteur + Canal + Dates */}
                    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 space-y-3">
                      {pushDetail.recruiter && (
                        <div>
                          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Recruteur :</span>
                          <span className="ml-2 text-sm text-neutral-800 dark:text-neutral-200">
                            {pushDetail.recruiter.prenom} {pushDetail.recruiter.nom}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Canal :</span>
                        <span className={`ml-2 text-sm font-medium ${
                          pushDetail.canal === 'EMAIL' ? 'text-blue-600 dark:text-blue-400' : 'text-sky-600 dark:text-sky-400'
                        }`}>
                          {pushDetail.canal === 'EMAIL' ? 'Email' : 'LinkedIn'}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Créé le :</span>
                        <span className="ml-2 text-sm text-neutral-800 dark:text-neutral-200">
                          {format(new Date(pushDetail.createdAt), 'dd MMM yyyy HH:mm', { locale: fr })}
                        </span>
                      </div>
                      {pushDetail.sentAt && (
                        <div>
                          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Envoyé le :</span>
                          <span className="ml-2 text-sm text-neutral-800 dark:text-neutral-200">
                            {format(new Date(pushDetail.sentAt), 'dd MMM yyyy HH:mm', { locale: fr })}
                          </span>
                        </div>
                      )}
                      {pushDetail.gmailSentAt && (
                        <div>
                          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Gmail envoyé :</span>
                          <span className="ml-2 text-sm text-neutral-800 dark:text-neutral-200">
                            {format(new Date(pushDetail.gmailSentAt), 'dd MMM yyyy HH:mm', { locale: fr })}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Message */}
                    {pushDetail.message && (
                      <div>
                        <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <MessageSquare size={14} />
                          Message
                        </h3>
                        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-gray-800 p-4 text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                          {pushDetail.message}
                        </div>
                      </div>
                    )}

                    {/* Sequence Run */}
                    {pushDetail.sequenceRun && (
                      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
                        <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                          <Activity size={14} />
                          Séquence
                        </h3>
                        <div className="space-y-2">
                          <div>
                            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Statut :</span>
                            <span className="ml-2 text-sm text-neutral-800 dark:text-neutral-200">
                              {pushDetail.sequenceRun.status}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Étape :</span>
                            <span className="ml-2 text-sm text-neutral-800 dark:text-neutral-200">
                              {pushDetail.sequenceRun.currentStep}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Démarré le :</span>
                            <span className="ml-2 text-sm text-neutral-800 dark:text-neutral-200">
                              {format(new Date(pushDetail.sequenceRun.startedAt), 'dd MMM yyyy HH:mm', { locale: fr })}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Activities */}
                    {pushDetail.activities && pushDetail.activities.length > 0 && (
                      <div>
                        <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                          <Clock size={14} />
                          Activités ({pushDetail.activities.length})
                        </h3>
                        <div className="space-y-2">
                          {pushDetail.activities.map((act) => (
                            <div
                              key={act.id}
                              className="rounded-lg border border-neutral-100 dark:border-neutral-700/50 bg-neutral-50/50 dark:bg-gray-800/50 p-3"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                                  {act.type}
                                </span>
                                <span className="text-[11px] text-neutral-400">
                                  {format(new Date(act.createdAt), 'dd MMM yyyy HH:mm', { locale: fr })}
                                </span>
                              </div>
                              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                {act.titre ?? act.type}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12 text-neutral-400">
                    Push introuvable
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── STAT CARD ──────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  color,
  loading,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'emerald';
  loading: boolean;
}) {
  const colorMap = {
    blue:    { bg: 'bg-blue-50 dark:bg-blue-900/30',    icon: 'text-blue-500',    value: 'text-blue-700 dark:text-blue-300' },
    green:   { bg: 'bg-green-50 dark:bg-green-900/30',   icon: 'text-green-500',   value: 'text-green-700 dark:text-green-300' },
    purple:  { bg: 'bg-purple-50 dark:bg-purple-900/30', icon: 'text-purple-500',  value: 'text-purple-700 dark:text-purple-300' },
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/30', icon: 'text-emerald-500', value: 'text-emerald-700 dark:text-emerald-300' },
  };
  const c = colorMap[color];

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-gray-800 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
          {label}
        </span>
        <div className={`w-9 h-9 rounded-lg ${c.bg} flex items-center justify-center ${c.icon}`}>
          {icon}
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-20 bg-neutral-100 dark:bg-neutral-700 rounded animate-pulse" />
      ) : (
        <span className={`text-2xl font-bold ${c.value}`}>{value}</span>
      )}
    </div>
  );
}
