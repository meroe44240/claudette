import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Phone, Calendar, Users, Building2, DollarSign, TrendingUp, ChevronRight,
  AlertTriangle, ArrowUpDown, Download,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '../../lib/api-client';

// ─── TYPES ──────────────────────────────────────────

interface RecruiterStats {
  userId: string;
  nom: string;
  prenom: string | null;
  avatarUrl: string | null;
  role: string;
  email: string;
  startDate: string | null;
  revenue: number;
  cost: number;
  margin: number;
  roi: number | null;
  monthlySalary: number | null;
  variableRate: number | null;
  nbAppels: number;
  nbRdvTotal: number;
  nbRdvPresentation: number;
  nbRdvCommercial: number;
  nbRdvAutre: number;
  nbCandidatsRencontres: number;
  nbMandatsActifs: number;
}

interface TeamFinancials {
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  overallRoi: number | null;
  monthlyPnL: Array<{ month: string; revenue: number; cost: number; margin: number }>;
}

interface TeamStatsResponse {
  recruiters: RecruiterStats[];
  financials: TeamFinancials;
  period: { start: string; end: string };
}

// ─── HELPERS ────────────────────────────────────────

function formatCurrency(n: number) { return n ? `${(n / 1000).toFixed(n >= 1000 ? 0 : 1)}k€` : '0€'; }
function formatRoi(roi: number | null) { return roi === null ? '∞' : `${roi.toFixed(1)}x`; }
function roiColor(roi: number | null) {
  if (roi === null) return '#059669';
  if (roi >= 2) return '#059669';
  if (roi >= 1) return '#F59E0B';
  return '#EF4444';
}
function roiLabel(roi: number | null) {
  if (roi === null) return 'Très rentable';
  if (roi >= 2) return 'Très rentable';
  if (roi >= 1.5) return 'Rentable';
  if (roi >= 1) return 'Rentable';
  if (roi >= 0.5) return 'À surveiller';
  return 'Déficitaire';
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
};

// ═════════════════════════════════════════════════════
// ADMIN DASHBOARD PAGE
// ═════════════════════════════════════════════════════

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'quarter' | 'year'>('month');
  const [sortCol, setSortCol] = useState<string>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'team-stats', period],
    queryFn: () => api.get<TeamStatsResponse>(`/admin/team-stats?period=${period}`),
  });

  const recruiters = data?.recruiters ?? [];
  const financials = data?.financials ?? { totalRevenue: 0, totalCost: 0, totalMargin: 0, overallRoi: 0, monthlyPnL: [] };

  // Sort recruiters for table
  const sortedRecruiters = useMemo(() => {
    const sorted = [...recruiters];
    sorted.sort((a, b) => {
      const aVal = (a as any)[sortCol] ?? 0;
      const bVal = (b as any)[sortCol] ?? 0;
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [recruiters, sortCol, sortDir]);

  // Best values for each column (for highlighting)
  const bestValues = useMemo(() => {
    if (recruiters.length === 0) return {};
    return {
      nbAppels: Math.max(...recruiters.map(r => r.nbAppels)),
      nbRdvTotal: Math.max(...recruiters.map(r => r.nbRdvTotal)),
      nbRdvPresentation: Math.max(...recruiters.map(r => r.nbRdvPresentation)),
      nbRdvCommercial: Math.max(...recruiters.map(r => r.nbRdvCommercial)),
      nbCandidatsRencontres: Math.max(...recruiters.map(r => r.nbCandidatsRencontres)),
      nbMandatsActifs: Math.max(...recruiters.map(r => r.nbMandatsActifs)),
      revenue: Math.max(...recruiters.map(r => r.revenue)),
    };
  }, [recruiters]);

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  const periodLabels = { day: 'Jour', week: 'Semaine', month: 'Mois', quarter: 'Trimestre', year: 'Année' };

  // ═══════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════

  return (
    <div className="space-y-6" style={{ padding: '20px 24px' }}>
      {/* ── HEADER ── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-neutral-900">Performance Équipe</h1>
          <p className="mt-1 text-[15px] text-neutral-500">
            {recruiters.length} recruteur{recruiters.length > 1 ? 's' : ''} actif{recruiters.length > 1 ? 's' : ''} · {format(new Date(), 'MMMM yyyy', { locale: fr })}
          </p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-neutral-100">
          {(['day', 'week', 'month', 'quarter', 'year'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                period === p ? 'bg-brand-500 text-white' : 'bg-neutral-50 text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {/* ── SECTION: P&L RÉSUMÉ ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-2xl bg-white p-7 shadow-[var(--shadow-card)]"
      >
        {/* 3 blocs financiers */}
        <div className="grid grid-cols-3 gap-8 mb-6">
          <div>
            <span className="text-[12px] font-semibold uppercase tracking-wider text-neutral-500">Revenue Facturée</span>
            <p className="mt-1 text-[36px] font-extrabold text-revenue-500 leading-none">{formatCurrency(financials.totalRevenue)}</p>
          </div>
          <div>
            <span className="text-[12px] font-semibold uppercase tracking-wider text-neutral-500">Coût Équipe</span>
            <p className="mt-1 text-[36px] font-extrabold text-danger-500 leading-none">{formatCurrency(financials.totalCost)}</p>
            <p className="text-[13px] text-neutral-500">Salaires + charges</p>
          </div>
          <div>
            <span className="text-[12px] font-semibold uppercase tracking-wider text-neutral-500">Marge Nette</span>
            <p className={`mt-1 text-[36px] font-extrabold leading-none ${financials.totalMargin >= 0 ? 'text-revenue-500' : 'text-danger-500'}`}>
              {formatCurrency(financials.totalMargin)}
            </p>
          </div>
        </div>

        {/* P&L bar */}
        <div className="h-3 rounded-full bg-neutral-100 overflow-hidden mb-6">
          {financials.totalRevenue > 0 && (
            <div className="flex h-full">
              <div
                className="h-full bg-revenue-500 rounded-l-full"
                style={{ width: `${Math.min((financials.totalMargin / financials.totalRevenue) * 100, 100)}%` }}
              />
              <div
                className="h-full bg-danger-500/30"
                style={{ width: `${Math.min((financials.totalCost / financials.totalRevenue) * 100, 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Monthly P&L Chart */}
        {financials.monthlyPnL.length > 0 && (
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={financials.monthlyPnL}>
                <CartesianGrid strokeDasharray="0" stroke="#EEEEF4" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#B4B7C9' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#B4B7C9' }} tickFormatter={(v: number) => `${v / 1000}k€`} />
                <Bar dataKey="revenue" fill="#059669" radius={[6, 6, 0, 0]} barSize={28} name="Revenue" />
                <Bar dataKey="cost" fill="#EF4444" opacity={0.25} radius={[6, 6, 0, 0]} barSize={28} name="Coût" />
                <Line dataKey="margin" stroke="#7C5CFC" strokeWidth={2.5} strokeDasharray="6 3" dot={false} name="Marge" />
                <Tooltip
                  formatter={(value: any, name: any) => [`${formatCurrency(Number(value))}`, name]}
                  contentStyle={{ borderRadius: 8, border: '1px solid #EEEEF4', fontSize: 13 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </motion.div>

      {/* ── SECTION: CARDS RECRUTEURS ── */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {recruiters.map((r, idx) => {
          const roiPct = r.roi === null ? 100 : Math.min(r.roi * 50, 100);
          return (
            <motion.div
              key={r.userId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + idx * 0.05 }}
              className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover-dash)] hover:-translate-y-0.5 transition-all duration-200"
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full overflow-hidden bg-pipeline-500 flex items-center justify-center shrink-0">
                  {r.avatarUrl ? (
                    <img src={r.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[14px] font-bold text-white">
                      {(r.prenom?.[0] ?? '').toUpperCase()}{r.nom[0]?.toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-[18px] font-semibold text-neutral-900">{r.prenom ?? ''} {r.nom}</p>
                  <p className="text-[13px] text-neutral-500">
                    {r.role === 'ADMIN' ? 'Admin' : 'Recruteur'}
                    {r.startDate && ` · Depuis ${format(new Date(r.startDate), 'MMM yyyy', { locale: fr })}`}
                  </p>
                </div>
              </div>

              {/* Finance blocks */}
              <div className="flex gap-3 mb-4">
                <div className="flex-1 rounded-xl bg-revenue-100 p-3.5">
                  <span className="text-[11px] font-semibold uppercase text-revenue-500">Revenue</span>
                  <p className="text-[22px] font-bold text-revenue-500">{formatCurrency(r.revenue)}</p>
                </div>
                <div className="flex-1 rounded-xl bg-danger-100 p-3.5">
                  <span className="text-[11px] font-semibold uppercase text-danger-500">Coût</span>
                  <p className="text-[22px] font-bold text-danger-500">{formatCurrency(r.cost)}</p>
                </div>
              </div>

              {/* Margin + ROI */}
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[15px] font-semibold ${r.margin >= 0 ? 'text-revenue-500' : 'text-danger-500'}`}>
                  Marge : {formatCurrency(r.margin)}
                </span>
                <span className="text-[15px] font-semibold text-neutral-700">
                  ROI : <span style={{ color: roiColor(r.roi) }}>{formatRoi(r.roi)}</span>
                </span>
              </div>

              {/* ROI bar */}
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${roiPct}%`, backgroundColor: roiColor(r.roi) }}
                  />
                </div>
                <span className="text-[11px] font-medium" style={{ color: roiColor(r.roi) }}>
                  {roiLabel(r.roi)}
                </span>
              </div>

              {/* Activity */}
              <div className="border-t border-neutral-100 pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[14px] text-neutral-700">
                    <Phone size={14} className="text-activity-500" /> Appels
                  </span>
                  <span className="text-[14px] font-bold text-neutral-900">{r.nbAppels}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[14px] text-neutral-700">
                    <Calendar size={14} className="text-activity-500" /> RDV
                  </span>
                  <span className="text-[14px] font-bold text-neutral-900">
                    {r.nbRdvTotal}
                    <span className="font-normal text-neutral-400 text-[12px] ml-1">
                      ({r.nbRdvPresentation} prés. / {r.nbRdvCommercial} com.)
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[14px] text-neutral-700">
                    <Users size={14} className="text-pipeline-500" /> Candidats rencontrés
                  </span>
                  <span className="text-[14px] font-bold text-neutral-900">{r.nbCandidatsRencontres}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[14px] text-neutral-700">
                    <Building2 size={14} className="text-pipeline-500" /> Mandats actifs
                  </span>
                  <span className="text-[14px] font-bold text-neutral-900">{r.nbMandatsActifs}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── SECTION: TABLEAU COMPARATIF ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="rounded-2xl bg-white shadow-[var(--shadow-card)] overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <h2 className="text-[18px] font-semibold text-neutral-900">Activité comparée</h2>
            <p className="text-[13px] text-neutral-500">{format(new Date(), 'MMMM yyyy', { locale: fr })}</p>
          </div>
          <button className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] text-neutral-500 hover:bg-neutral-50">
            <Download size={14} /> Exporter
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-neutral-50">
                {[
                  { key: 'nom', label: 'Recruteur', align: 'left' },
                  { key: 'nbAppels', label: 'Appels', align: 'right' },
                  { key: 'nbRdvTotal', label: 'RDV', align: 'right' },
                  { key: 'nbRdvPresentation', label: 'Prés.', align: 'right' },
                  { key: 'nbRdvCommercial', label: 'Comm.', align: 'right' },
                  { key: 'nbCandidatsRencontres', label: 'Cand.', align: 'right' },
                  { key: 'nbMandatsActifs', label: 'Mandats', align: 'right' },
                  { key: 'revenue', label: 'Revenue', align: 'right' },
                  { key: 'roi', label: 'ROI', align: 'right' },
                ].map(col => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-[12px] font-semibold uppercase tracking-wider text-neutral-500 cursor-pointer hover:text-neutral-700 select-none ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortCol === col.key && <ArrowUpDown size={12} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {sortedRecruiters.map(r => (
                <tr key={r.userId} className="hover:bg-neutral-50/50 transition-colors h-[56px]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: roiColor(r.roi) }} />
                      <div className="h-6 w-6 rounded-full overflow-hidden bg-pipeline-500 flex items-center justify-center shrink-0">
                        {r.avatarUrl ? (
                          <img src={r.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[9px] font-bold text-white">
                            {(r.prenom?.[0] ?? '').toUpperCase()}{r.nom[0]?.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className="text-[15px] font-medium text-neutral-900">
                        {r.prenom ?? ''} {r.nom}
                      </span>
                    </div>
                  </td>
                  <td className={`px-4 py-3 text-right text-[15px] ${r.nbAppels === bestValues.nbAppels && r.nbAppels > 0 ? 'font-bold text-revenue-500' : 'text-neutral-900'}`}>
                    {r.nbAppels}
                  </td>
                  <td className={`px-4 py-3 text-right text-[15px] ${r.nbRdvTotal === bestValues.nbRdvTotal && r.nbRdvTotal > 0 ? 'font-bold text-revenue-500' : 'text-neutral-900'}`}>
                    {r.nbRdvTotal}
                  </td>
                  <td className={`px-4 py-3 text-right text-[15px] ${r.nbRdvPresentation === bestValues.nbRdvPresentation && r.nbRdvPresentation > 0 ? 'font-bold text-revenue-500' : 'text-neutral-900'}`}>
                    {r.nbRdvPresentation}
                  </td>
                  <td className={`px-4 py-3 text-right text-[15px] ${r.nbRdvCommercial === bestValues.nbRdvCommercial && r.nbRdvCommercial > 0 ? 'font-bold text-revenue-500' : 'text-neutral-900'}`}>
                    {r.nbRdvCommercial}
                  </td>
                  <td className={`px-4 py-3 text-right text-[15px] ${r.nbCandidatsRencontres === bestValues.nbCandidatsRencontres && r.nbCandidatsRencontres > 0 ? 'font-bold text-revenue-500' : 'text-neutral-900'}`}>
                    {r.nbCandidatsRencontres}
                  </td>
                  <td className={`px-4 py-3 text-right text-[15px] ${r.nbMandatsActifs === bestValues.nbMandatsActifs && r.nbMandatsActifs > 0 ? 'font-bold text-revenue-500' : 'text-neutral-900'}`}>
                    {r.nbMandatsActifs}
                  </td>
                  <td className="px-4 py-3 text-right text-[15px] font-bold text-revenue-500">
                    {formatCurrency(r.revenue)}
                  </td>
                  <td className="px-4 py-3 text-right text-[15px] font-bold" style={{ color: roiColor(r.roi) }}>
                    {formatRoi(r.roi)}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Total row */}
            <tfoot>
              <tr className="bg-neutral-50 border-t-2 border-neutral-100">
                <td className="px-4 py-3 text-[15px] font-bold text-neutral-900">TOTAL</td>
                <td className="px-4 py-3 text-right text-[15px] font-bold text-neutral-900">
                  {recruiters.reduce((s, r) => s + r.nbAppels, 0)}
                </td>
                <td className="px-4 py-3 text-right text-[15px] font-bold text-neutral-900">
                  {recruiters.reduce((s, r) => s + r.nbRdvTotal, 0)}
                </td>
                <td className="px-4 py-3 text-right text-[15px] font-bold text-neutral-900">
                  {recruiters.reduce((s, r) => s + r.nbRdvPresentation, 0)}
                </td>
                <td className="px-4 py-3 text-right text-[15px] font-bold text-neutral-900">
                  {recruiters.reduce((s, r) => s + r.nbRdvCommercial, 0)}
                </td>
                <td className="px-4 py-3 text-right text-[15px] font-bold text-neutral-900">
                  {recruiters.reduce((s, r) => s + r.nbCandidatsRencontres, 0)}
                </td>
                <td className="px-4 py-3 text-right text-[15px] font-bold text-neutral-900">
                  {recruiters.reduce((s, r) => s + r.nbMandatsActifs, 0)}
                </td>
                <td className="px-4 py-3 text-right text-[15px] font-bold text-revenue-500">
                  {formatCurrency(financials.totalRevenue)}
                </td>
                <td className="px-4 py-3 text-right text-[15px] font-bold" style={{ color: roiColor(financials.overallRoi) }}>
                  {formatRoi(financials.overallRoi)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </motion.div>

      {/* ── SECTION: MANDATS PAR RECRUTEUR ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)]"
      >
        <h2 className="text-[18px] font-semibold text-neutral-900 mb-4">Mandats en cours</h2>

        {/* For now, just link to the mandats page — full implementation would require
            per-recruiter mandat data from the API */}
        <div className="text-center py-6">
          <p className="text-[14px] text-neutral-500 mb-3">
            Vue consolidée des mandats par recruteur
          </p>
          <button
            onClick={() => navigate('/mandats')}
            className="rounded-lg bg-brand-500 px-4 py-2 text-[14px] font-medium text-white hover:bg-primary-700 transition-colors"
          >
            Voir tous les mandats →
          </button>
        </div>
      </motion.div>
    </div>
  );
}
