import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal, CheckCircle, XCircle, Clock,
  ChevronDown, ChevronRight, Activity,
  Filter, BarChart3,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';

// ─── TYPES ──────────────────────────────────────────────

interface McpActionLog {
  id: string;
  toolName: string;
  level: 'free' | 'confirm' | 'blocked';
  success: boolean;
  durationMs: number | null;
  input: unknown;
  output: unknown;
  errorMessage: string | null;
  createdAt: string;
  user?: { id: string; prenom: string | null; nom: string };
}

interface McpLogsResponse {
  data: McpActionLog[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

interface McpStatsResponse {
  total_calls: number;
  success_count: number;
  error_count: number;
  avg_duration_ms: number;
  by_tool: { tool: string; count: number; avg_ms: number; level: string }[];
  by_user: { userId: string; nom: string; prenom: string | null; count: number }[];
  by_level: { level: string; count: number }[];
}

interface McpToolsResponse {
  tools: string[];
}

// ─── HELPERS ────────────────────────────────────────────

const LEVEL_STYLES: Record<string, string> = {
  free: 'bg-green-100 text-green-700',
  confirm: 'bg-amber-100 text-amber-700',
  blocked: 'bg-red-100 text-red-700',
};

const LEVEL_BAR_COLORS: Record<string, string> = {
  free: 'bg-green-500',
  confirm: 'bg-amber-500',
  blocked: 'bg-red-500',
};

function formatRelativeDate(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "A l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `Il y a ${diffD}j`;
  return new Date(dateStr).toLocaleDateString('fr-FR');
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('fr-FR');
}

// ─── COMPONENT ──────────────────────────────────────────

export default function McpLogsPage() {
  // Filters
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [toolFilter, setToolFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [successFilter, setSuccessFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Build query params
  const buildParams = () => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (toolFilter) params.set('tool_name', toolFilter);
    if (levelFilter) params.set('level', levelFilter);
    if (successFilter) params.set('success', successFilter);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    return params.toString();
  };

  const buildStatsParams = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    return params.toString();
  };

  // Queries
  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ['mcp-logs', page, limit, toolFilter, levelFilter, successFilter, dateFrom, dateTo],
    queryFn: () => api.get<McpLogsResponse>(`/mcp-logs?${buildParams()}`),
  });

  const { data: stats } = useQuery({
    queryKey: ['mcp-logs-stats', dateFrom, dateTo],
    queryFn: () => api.get<McpStatsResponse>(`/mcp-logs/stats?${buildStatsParams()}`),
  });

  const { data: toolsData } = useQuery({
    queryKey: ['mcp-logs-tools'],
    queryFn: () => api.get<McpToolsResponse>('/mcp-logs/tools'),
  });

  const maxToolCount = stats?.by_tool?.length
    ? Math.max(...stats.by_tool.map((t) => t.count))
    : 1;

  const successRate = stats
    ? stats.total_calls > 0
      ? ((stats.success_count / stats.total_calls) * 100).toFixed(1)
      : '0'
    : '-';

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Terminal size={26} className="text-primary-500" />
            Logs MCP
          </span>
        }
        subtitle="Historique des appels aux outils MCP"
        breadcrumbs={[{ label: 'Admin' }, { label: 'Logs MCP' }]}
      />

      {/* ─── STATS CARDS ───────────────────────────────── */}
      <motion.div
        className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <StatCard
          label="Total appels"
          value={stats?.total_calls ?? '-'}
          sub="Tous les temps"
          icon={<Activity size={20} className="text-blue-500" />}
          color="blue"
        />
        <StatCard
          label="Taux de succes"
          value={`${successRate}%`}
          sub={`${stats?.success_count ?? 0} succes`}
          icon={<CheckCircle size={20} className="text-green-500" />}
          color="green"
        />
        <StatCard
          label="Erreurs"
          value={stats?.error_count ?? '-'}
          sub={stats && stats.error_count > 0 ? 'A verifier' : 'Aucune erreur'}
          icon={<XCircle size={20} className={stats && stats.error_count > 0 ? 'text-red-500' : 'text-neutral-400'} />}
          color={stats && stats.error_count > 0 ? 'red' : 'neutral'}
        />
        <StatCard
          label="Temps moyen"
          value={stats ? `${Math.round(stats.avg_duration_ms)}ms` : '-'}
          sub="Par appel"
          icon={<Clock size={20} className="text-purple-500" />}
          color="purple"
        />
      </motion.div>

      {/* ─── BY TOOL / BY USER ─────────────────────────── */}
      <motion.div
        className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {/* Par outil */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-neutral-700">
            <BarChart3 size={16} /> Par outil
          </h3>
          {stats?.by_tool?.length ? (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {stats.by_tool
                .sort((a, b) => b.count - a.count)
                .map((t) => (
                  <div key={t.tool} className="group">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-neutral-800 truncate max-w-[200px]">
                        {t.tool}
                      </span>
                      <span className="flex items-center gap-2 text-neutral-500">
                        <span>{t.count} appels</span>
                        <span className="text-neutral-300">|</span>
                        <span>{Math.round(t.avg_ms)}ms moy.</span>
                        <span
                          className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${LEVEL_STYLES[t.level] || 'bg-gray-100 text-gray-600'}`}
                        >
                          {t.level}
                        </span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${LEVEL_BAR_COLORS[t.level] || 'bg-gray-400'}`}
                        style={{ width: `${(t.count / maxToolCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-400">Aucune donnee</p>
          )}
        </div>

        {/* Par utilisateur */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-neutral-700">
            <Activity size={16} /> Par utilisateur
          </h3>
          {stats?.by_user?.length ? (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {stats.by_user
                .sort((a, b) => b.count - a.count)
                .map((u) => (
                  <div
                    key={u.userId}
                    className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-2"
                  >
                    <span className="text-sm font-medium text-neutral-800">
                      {u.prenom} {u.nom}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-600">
                      {u.count}
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-400">Aucune donnee</p>
          )}
        </div>
      </motion.div>

      {/* ─── FILTERS ───────────────────────────────────── */}
      <motion.div
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
          <Filter size={14} /> Filtres
        </div>

        <FilterSelect
          label="Outil"
          value={toolFilter}
          onChange={(v) => { setToolFilter(v); setPage(1); }}
          options={[
            { value: '', label: 'Tous' },
            ...(toolsData?.tools?.map((t) => ({ value: t, label: t })) ?? []),
          ]}
        />
        <FilterSelect
          label="Niveau"
          value={levelFilter}
          onChange={(v) => { setLevelFilter(v); setPage(1); }}
          options={[
            { value: '', label: 'Tous' },
            { value: 'free', label: 'Free' },
            { value: 'confirm', label: 'Confirm' },
            { value: 'blocked', label: 'Blocked' },
          ]}
        />
        <FilterSelect
          label="Statut"
          value={successFilter}
          onChange={(v) => { setSuccessFilter(v); setPage(1); }}
          options={[
            { value: '', label: 'Tous' },
            { value: 'true', label: 'Succes' },
            { value: 'false', label: 'Erreur' },
          ]}
        />
        <FilterInput
          label="Du"
          type="date"
          value={dateFrom}
          onChange={(v) => { setDateFrom(v); setPage(1); }}
        />
        <FilterInput
          label="Au"
          type="date"
          value={dateTo}
          onChange={(v) => { setDateTo(v); setPage(1); }}
        />
      </motion.div>

      {/* ─── TABLE ─────────────────────────────────────── */}
      <motion.div
        className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/60 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <th className="px-4 py-3 w-8" />
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Utilisateur</th>
                <th className="px-4 py-3">Outil</th>
                <th className="px-4 py-3">Niveau</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Duree</th>
              </tr>
            </thead>
            <tbody>
              {logsLoading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-neutral-400">
                    Chargement...
                  </td>
                </tr>
              ) : logs?.data?.length ? (
                logs.data.map((log) => (
                  <LogRow
                    key={log.id}
                    log={log}
                    expanded={expandedRow === log.id}
                    onToggle={() =>
                      setExpandedRow(expandedRow === log.id ? null : log.id)
                    }
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-neutral-400">
                    Aucun log
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {logs && logs.pages > 1 && (
          <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3">
            <span className="text-xs text-neutral-500">
              {logs.total} resultat{logs.total > 1 ? 's' : ''} &mdash; page {logs.page}/{logs.pages}
            </span>
            <div className="flex items-center gap-1">
              <PaginationBtn
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                label="Prec."
              />
              {Array.from({ length: Math.min(logs.pages, 7) }, (_, i) => {
                let p: number;
                if (logs.pages <= 7) {
                  p = i + 1;
                } else if (page <= 4) {
                  p = i + 1;
                } else if (page >= logs.pages - 3) {
                  p = logs.pages - 6 + i;
                } else {
                  p = page - 3 + i;
                }
                return (
                  <PaginationBtn
                    key={p}
                    active={p === page}
                    onClick={() => setPage(p)}
                    label={String(p)}
                  />
                );
              })}
              <PaginationBtn
                disabled={page >= logs.pages}
                onClick={() => setPage(page + 1)}
                label="Suiv."
              />
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── SUB-COMPONENTS ─────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
  color: string;
}) {
  const borderColor: Record<string, string> = {
    blue: 'border-blue-200',
    green: 'border-green-200',
    red: 'border-red-200',
    purple: 'border-purple-200',
    neutral: 'border-neutral-200',
  };
  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${borderColor[color] || 'border-neutral-200'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
          {label}
        </span>
        {icon}
      </div>
      <div className="text-2xl font-bold text-neutral-900">{value}</div>
      <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>
    </div>
  );
}

function LogRow({
  log,
  expanded,
  onToggle,
}: {
  log: McpActionLog;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-neutral-50 transition-colors hover:bg-neutral-50/50"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 text-neutral-400">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </td>
        <td className="px-4 py-2.5 whitespace-nowrap" title={formatDate(log.createdAt)}>
          <span className="text-neutral-700">{formatRelativeDate(log.createdAt)}</span>
        </td>
        <td className="px-4 py-2.5 text-neutral-700">
          {log.user ? `${log.user.prenom ?? ''} ${log.user.nom}`.trim() : '-'}
        </td>
        <td className="px-4 py-2.5">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${LEVEL_STYLES[log.level] || 'bg-gray-100 text-gray-600'}`}
          >
            <Terminal size={12} />
            {log.toolName}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${LEVEL_STYLES[log.level] || 'bg-gray-100 text-gray-600'}`}
          >
            {log.level}
          </span>
        </td>
        <td className="px-4 py-2.5">
          {log.success ? (
            <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
              <CheckCircle size={14} /> OK
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-red-600 text-xs font-medium">
              <XCircle size={14} /> Erreur
            </span>
          )}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-neutral-600">
          {log.durationMs != null ? `${log.durationMs}ms` : '-'}
        </td>
      </tr>
      <AnimatePresence>
        {expanded && (
          <tr>
            <td colSpan={7} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="border-b border-neutral-100 bg-neutral-50/40 px-6 py-4 space-y-3">
                  {log.errorMessage && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      <strong>Erreur :</strong> {log.errorMessage}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                        Input
                      </p>
                      <pre className="rounded-lg bg-gray-50 p-3 text-xs text-neutral-700 overflow-auto max-h-60 border border-neutral-200">
                        {log.input
                          ? JSON.stringify(log.input, null, 2)
                          : '(vide)'}
                      </pre>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                        Output
                      </p>
                      <pre className="rounded-lg bg-gray-50 p-3 text-xs text-neutral-700 overflow-auto max-h-60 border border-neutral-200">
                        {log.output
                          ? JSON.stringify(log.output, null, 2)
                          : '(vide)'}
                      </pre>
                    </div>
                  </div>
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FilterInput({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-200 transition-colors"
      />
    </div>
  );
}

function PaginationBtn({
  label,
  onClick,
  disabled,
  active,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`min-w-[32px] rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-primary-500 text-white'
          : disabled
            ? 'cursor-not-allowed text-neutral-300'
            : 'text-neutral-600 hover:bg-neutral-100'
      }`}
    >
      {label}
    </button>
  );
}
