import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Send, Search, Filter, Download, TrendingUp, Eye,
  MessageSquare, Calendar, ArrowRight,
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
  createdAt: string;
  candidat: { id: string; prenom: string; nom: string } | null;
  prospect: { id: string; nom: string; prenom: string | null; entreprise?: string } | null;
  entreprise: { id: string; nom: string } | null;
  contactEmail: string | null;
  canal: PushCanal;
  statut: PushStatus;
  message: string | null;
}

interface PushHistoryResponse {
  data: PushRecord[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface FunnelStep {
  stage: string;
  count: number;
  percentage: number;
}

interface DashboardStats {
  totals: {
    envoyes: number;
    reponses: number;
    rdv_bookes: number;
    taux_conversion: number;
  };
  conversion_funnel: FunnelStep[];
  by_canal: { canal: string; count: number }[];
  by_recruiter: { id: string; nom: string; count: number }[];
  timeline: { date: string; count: number }[];
  top_prospects: { nom: string; entreprise: string; pushes: number }[];
  avg_response_time_hours: number | null;
}

// ─── CONSTANTS ──────────────────────────────────────────

const STATUS_CONFIG: Record<PushStatus, { label: string; bg: string; text: string; dot: string }> = {
  ENVOYE:          { label: 'Envoy\u00e9',        bg: 'bg-blue-50 dark:bg-blue-900/30',    text: 'text-blue-700 dark:text-blue-300',    dot: 'bg-blue-500' },
  OUVERT:          { label: 'Ouvert',          bg: 'bg-yellow-50 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', dot: 'bg-yellow-500' },
  REPONDU:         { label: 'R\u00e9pondu',       bg: 'bg-green-50 dark:bg-green-900/30',   text: 'text-green-700 dark:text-green-300',   dot: 'bg-green-500' },
  RDV_BOOK:        { label: 'RDV book\u00e9',     bg: 'bg-purple-50 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
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
  { value: 'ENVOYE', label: 'Envoy\u00e9' },
  { value: 'OUVERT', label: 'Ouvert' },
  { value: 'REPONDU', label: 'R\u00e9pondu' },
  { value: 'RDV_BOOK', label: 'RDV book\u00e9' },
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
  const pushes = history?.data ?? [];
  const totalPages = history?.pages ?? 1;

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
        subtitle="Historique et statistiques des push CV envoy\u00e9s aux prospects"
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
          label="Total envoy\u00e9s"
          value={stats?.totals.envoyes ?? 0}
          icon={<Send size={20} />}
          color="blue"
          loading={loadingStats}
        />
        <StatCard
          label="R\u00e9ponses"
          value={stats?.totals.reponses ?? 0}
          icon={<MessageSquare size={20} />}
          color="green"
          loading={loadingStats}
        />
        <StatCard
          label="RDV book\u00e9s"
          value={stats?.totals.rdv_bookes ?? 0}
          icon={<Calendar size={20} />}
          color="purple"
          loading={loadingStats}
        />
        <StatCard
          label="Taux conversion"
          value={stats?.totals.taux_conversion != null ? `${stats.totals.taux_conversion.toFixed(1)}%` : '0%'}
          icon={<TrendingUp size={20} />}
          color="emerald"
          loading={loadingStats}
        />
      </motion.div>

      {/* ── CONVERSION FUNNEL ────────────────────────────── */}
      {stats?.conversion_funnel && stats.conversion_funnel.length > 0 && (
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
            {stats.conversion_funnel.map((step, i) => {
              const maxCount = stats.conversion_funnel[0]?.count || 1;
              const widthPct = Math.max((step.count / maxCount) * 100, 8);
              return (
                <div key={step.stage} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">{step.count}</span>
                  <div className="w-full flex justify-center">
                    <motion.div
                      className="rounded-t-md"
                      style={{
                        backgroundColor: FUNNEL_COLORS[i] ?? '#6B7280',
                        width: `${widthPct}%`,
                        minWidth: 24,
                      }}
                      initial={{ height: 0 }}
                      animate={{ height: 80 + (4 - i) * 16 }}
                      transition={{ delay: 0.15 + i * 0.05, type: 'spring', stiffness: 200, damping: 20 }}
                    />
                  </div>
                  <div className="text-center">
                    <span className="block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                      {STATUS_CONFIG[step.stage as PushStatus]?.label ?? step.stage}
                    </span>
                    <span className="block text-[10px] text-neutral-400">{step.percentage.toFixed(1)}%</span>
                  </div>
                  {i < stats.conversion_funnel.length - 1 && (
                    <ArrowRight size={12} className="text-neutral-300 absolute" style={{ display: 'none' }} />
                  )}
                </div>
              );
            })}
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
                    Aucun push trouv\u00e9
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
                  >
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300 whitespace-nowrap">
                      {format(new Date(push.createdAt), 'dd MMM yyyy', { locale: fr })}
                    </td>
                    <td className="px-4 py-3 font-medium text-neutral-800 dark:text-neutral-200">
                      {push.candidat ? `${push.candidat.prenom} ${push.candidat.nom}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
                      <div>
                        {push.prospect ? `${push.prospect.prenom ?? ''} ${push.prospect.nom}`.trim() : '-'}
                      </div>
                      {(push.entreprise?.nom || push.prospect?.entreprise) && (
                        <div className="text-xs text-neutral-400">
                          {push.entreprise?.nom ?? push.prospect?.entreprise}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400 text-xs">
                      {push.contactEmail ?? '-'}
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
                      <StatusBadge status={push.statut} />
                    </td>
                    <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400 max-w-[200px] truncate text-xs">
                      {push.message ? (push.message.length > 60 ? push.message.slice(0, 60) + '...' : push.message) : '-'}
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
              Page {history?.page ?? 1} sur {totalPages} ({history?.total ?? 0} r\u00e9sultats)
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-gray-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Pr\u00e9c\u00e9dent
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
