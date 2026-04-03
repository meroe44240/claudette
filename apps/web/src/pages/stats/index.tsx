import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, ComposedChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  CartesianGrid, ReferenceLine,
} from 'recharts';
import {
  Download, Trophy, AlertTriangle, ChevronDown,
  TrendingUp, TrendingDown, Rocket,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth-store';
import PageHeader from '../../components/ui/PageHeader';

// ─── TYPES ──────────────────────────────────────────────

interface ScorecardItem {
  value: number;
  trend: number;
  sparkline: number[];
}

interface StatsData {
  scorecards: {
    appels: ScorecardItem;
    rdv: ScorecardItem;
    candidats: ScorecardItem;
    mandats: ScorecardItem;
    ca: ScorecardItem;
    tauxPresentation: ScorecardItem;
  };
  callsByDay: { day: string; count: number; isToday: boolean }[];
  rdvByType: { type: string; count: number; color: string }[];
  funnel: { stage: string; count: number }[];
  mandatsActifs: {
    id: string;
    titre: string;
    entreprise: string;
    candidats: number;
    fee: number;
    dormantDays: number | null;
    progress: number;
  }[];
  revenueByMonth: { month: string; facture: number; encaisse: number }[];
  caYtd: number;
  objectifAnnuel: number;
  pipeCommercial: number;
  impayes: number;
  radar: { metric: string; value: number; teamAvg: number }[];
  timePerStage: { from: string; to: string; days: number; teamAvg: number }[];
  timeToFill: number | null;
  teamTimeToFill: number | null;
  teamComparison: {
    userId: string;
    nom: string;
    prenom: string;
    appels: number;
    rdv: number;
    candidats: number;
    ca: number;
  }[] | null;
}

interface UserOption {
  id: string;
  nom: string;
  prenom: string | null;
}

type Period = 'week' | 'month' | 'quarter' | 'year';

// ─── DESIGN TOKENS ──────────────────────────────────────

const COLORS = {
  activityBlue: '#3B82F6',
  revenueGreen: '#059669',
  revenueGreenDark: '#047857',
  pipelineViolet: '#7C5CFC',
  warningAmber: '#F59E0B',
  dangerRed: '#EF4444',
  commercialTeal: '#14B8A6',
  presentationViolet: '#8B5CF6',
  neutralBg: '#FAFAF9',
  neutralText: '#6B7194',
};

const CARD_SHADOW = '0 2px 12px rgba(26,26,46,0.05)';

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: 'week', label: 'Cette semaine' },
  { key: 'month', label: 'Ce mois' },
  { key: 'quarter', label: 'Ce trimestre' },
  { key: 'year', label: 'Cette année' },
];

const SCORECARD_CONFIG: {
  key: keyof StatsData['scorecards'];
  label: string;
  emoji: string;
  color: string;
  format: (v: number) => string;
}[] = [
  { key: 'appels', label: 'APPELS', emoji: '\uD83D\uDCDE', color: COLORS.activityBlue, format: (v) => String(v) },
  { key: 'rdv', label: 'RDV', emoji: '\uD83D\uDCC5', color: COLORS.commercialTeal, format: (v) => String(v) },
  { key: 'candidats', label: 'CANDIDATS', emoji: '\uD83D\uDC65', color: COLORS.pipelineViolet, format: (v) => String(v) },
  { key: 'mandats', label: 'MANDATS', emoji: '\uD83D\uDCCB', color: COLORS.warningAmber, format: (v) => String(v) },
  { key: 'ca', label: 'CA', emoji: '\uD83D\uDCB0', color: COLORS.revenueGreen, format: (v) => formatCurrency(v) },
  { key: 'tauxPresentation', label: 'TAUX PRÉSENTATION', emoji: '\uD83C\uDFAF', color: COLORS.activityBlue, format: (v) => `${v}%` },
];

// ─── HELPERS ────────────────────────────────────────────

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M\u20AC`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k\u20AC`;
  return `${n}\u20AC`;
}

function formatFee(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k\u20AC`;
  return `${n}\u20AC`;
}

function speedColor(days: number, teamAvg: number): string {
  if (days <= teamAvg * 0.8) return COLORS.revenueGreen;
  if (days <= teamAvg * 1.2) return COLORS.warningAmber;
  return COLORS.dangerRed;
}

// ─── ANIMATION VARIANTS ─────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 260, damping: 24, delay: i * 0.04 },
  }),
};

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

// ─── SKELETON COMPONENTS ────────────────────────────────

function SkeletonPulse({ className }: { className: string }) {
  return <div className={`skeleton-shimmer rounded-md bg-neutral-100 ${className}`} />;
}

function ScorecardSkeleton() {
  return (
    <div
      className="rounded-2xl bg-white p-6"
      style={{ boxShadow: CARD_SHADOW }}
    >
      <div className="flex items-center justify-between mb-3">
        <SkeletonPulse className="h-3 w-16" />
        <SkeletonPulse className="h-5 w-5 rounded-full" />
      </div>
      <SkeletonPulse className="h-8 w-20 mb-2" />
      <SkeletonPulse className="h-4 w-16" />
      <SkeletonPulse className="h-5 w-full mt-3" />
    </div>
  );
}

function ChartCardSkeleton({ height = 'h-64' }: { height?: string }) {
  return (
    <div
      className="rounded-2xl bg-white p-6"
      style={{ boxShadow: CARD_SHADOW }}
    >
      <SkeletonPulse className="h-5 w-40 mb-6" />
      <SkeletonPulse className={`w-full ${height}`} />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      {/* Scorecard skeletons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <ScorecardSkeleton key={i} />
        ))}
      </div>
      {/* Chart skeletons */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCardSkeleton />
        <ChartCardSkeleton />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCardSkeleton height="h-72" />
        <ChartCardSkeleton height="h-72" />
      </div>
      <ChartCardSkeleton height="h-80" />
    </div>
  );
}

// ─── CUSTOM TOOLTIP ─────────────────────────────────────

function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl bg-white px-4 py-3 text-[13px]"
      style={{ boxShadow: '0 4px 20px rgba(26,26,46,0.12)', border: '1px solid #f0f0f3' }}
    >
      {label && <p className="font-semibold text-neutral-900 mb-1">{label}</p>}
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color || entry.fill }}
          />
          <span className="text-neutral-500">{entry.name}:</span>
          <span className="font-semibold text-neutral-900">
            {formatter ? formatter(entry.value, entry.name) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── MINI SPARKLINE ─────────────────────────────────────

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const chartData = data.map((v, i) => ({ v, i }));
  return (
    <div className="w-[60px] h-[20px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-${color.replace('#', '')})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── SCORECARD ──────────────────────────────────────────

function Scorecard({
  item,
  config,
  index,
}: {
  item: ScorecardItem;
  config: typeof SCORECARD_CONFIG[0];
  index: number;
}) {
  const isPositive = item.trend >= 0;
  return (
    <motion.div
      custom={index}
      variants={fadeUp}
      initial="hidden"
      animate="show"
      className="rounded-2xl bg-white p-5 flex flex-col justify-between min-h-[140px]"
      style={{ boxShadow: CARD_SHADOW }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
          {config.label}
        </span>
        <span className="text-base">{config.emoji}</span>
      </div>
      <div className="flex items-end gap-3">
        <span className="text-2xl font-bold text-neutral-900">{config.format(item.value)}</span>
        <span
          className={`flex items-center gap-0.5 text-[12px] font-semibold ${
            isPositive ? 'text-emerald-600' : 'text-red-500'
          }`}
        >
          {isPositive ? (
            <TrendingUp size={13} />
          ) : (
            <TrendingDown size={13} />
          )}
          {isPositive ? '+' : ''}{item.trend}%
        </span>
      </div>
      <div className="mt-2">
        <MiniSparkline data={item.sparkline} color={config.color} />
      </div>
    </motion.div>
  );
}

// ─── SECTION TITLE ──────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[18px] font-bold text-neutral-900 mb-4 -tracking-[0.01em]">
      {children}
    </h2>
  );
}

// ─── CARD WRAPPER ───────────────────────────────────────

function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl bg-white p-6 ${className}`}
      style={{ boxShadow: CARD_SHADOW }}
    >
      {children}
    </div>
  );
}

// ─── CALLS BAR CHART ────────────────────────────────────

function CallsByDayChart({ data }: { data: StatsData['callsByDay'] }) {
  const avg = data.length > 0
    ? Math.round(data.reduce((s, d) => s + d.count, 0) / data.length)
    : 0;

  return (
    <Card>
      <h3 className="text-[15px] font-semibold text-neutral-900 mb-4">
        Appels par jour
      </h3>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f3" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 12, fill: COLORS.neutralText }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: COLORS.neutralText }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(59,130,246,0.04)' }} />
            <ReferenceLine
              y={avg}
              stroke={COLORS.neutralText}
              strokeDasharray="6 4"
              label={{
                value: `Moy: ${avg}`,
                position: 'right',
                fill: COLORS.neutralText,
                fontSize: 11,
              }}
            />
            <Bar
              dataKey="count"
              name="Appels"
              barSize={28}
              radius={[6, 6, 0, 0]}
            >
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={COLORS.activityBlue}
                  fillOpacity={entry.isToday ? 1 : 0.6}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── RDV PIE CHART ──────────────────────────────────────

function RdvByTypeChart({ data }: { data: StatsData['rdvByType'] }) {
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <Card>
      <h3 className="text-[15px] font-semibold text-neutral-900 mb-4">
        RDV par type
      </h3>
      <div className="h-[260px] flex items-center justify-center">
        <div className="relative w-full h-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="type"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                strokeWidth={0}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip formatter={(v: number, name: string) => `${v} (${total > 0 ? Math.round((v / total) * 100) : 0}%)`} />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Center total */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <span className="text-2xl font-bold text-neutral-900">{total}</span>
              <span className="block text-[11px] text-neutral-400 uppercase tracking-wider">Total</span>
            </div>
          </div>
        </div>
      </div>
      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {data.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px]">
            <span
              className="h-2.5 w-2.5 rounded-full inline-block"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-neutral-600">{entry.type}</span>
            <span className="font-semibold text-neutral-900">
              {entry.count} ({total > 0 ? Math.round((entry.count / total) * 100) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── FUNNEL CHART ───────────────────────────────────────

function FunnelChart({ data }: { data: StatsData['funnel'] }) {
  const max = Math.max(...data.map((d) => d.count), 1);

  // Generate a gradient from light to dark purple
  const generateColor = (index: number, total: number): string => {
    const lightness = 80 - (index / Math.max(total - 1, 1)) * 40;
    return `hsl(254, 80%, ${lightness}%)`;
  };

  const chartData = data.map((d, i) => ({
    ...d,
    fill: generateColor(i, data.length),
  }));

  return (
    <Card>
      <h3 className="text-[15px] font-semibold text-neutral-900 mb-4">
        Pipeline de recrutement
      </h3>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 40, bottom: 4, left: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f3" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 12, fill: COLORS.neutralText }}
              axisLine={false}
              tickLine={false}
              domain={[0, max]}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="stage"
              tick={{ fontSize: 12, fill: COLORS.neutralText }}
              axisLine={false}
              tickLine={false}
              width={110}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(124,92,252,0.04)' }} />
            <Bar
              dataKey="count"
              name="Candidats"
              barSize={24}
              radius={[0, 6, 6, 0]}
              label={{
                position: 'right',
                fill: COLORS.neutralText,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── MANDATS ACTIFS LIST ────────────────────────────────

function MandatsActifsList({ data }: { data: StatsData['mandatsActifs'] }) {
  return (
    <Card>
      <h3 className="text-[15px] font-semibold text-neutral-900 mb-4">
        Mandats actifs
      </h3>
      <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1 -mr-1">
        {data.length === 0 && (
          <p className="text-[13px] text-neutral-400 py-4 text-center">
            Aucun mandat actif
          </p>
        )}
        {data.map((m) => (
          <div
            key={m.id}
            className="rounded-xl border border-neutral-100 p-4 hover:border-neutral-200 transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-neutral-900 truncate">
                  {m.titre}
                </p>
                <p className="text-[12px] text-neutral-400 truncate">{m.entreprise}</p>
              </div>
              <div className="text-right shrink-0 ml-3">
                <span className="text-[13px] font-semibold text-neutral-900">
                  {formatFee(m.fee)}
                </span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="mb-2">
              <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(m.progress, 100)}%`,
                    backgroundColor: COLORS.pipelineViolet,
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-neutral-400">
                {m.candidats} candidat{m.candidats !== 1 ? 's' : ''}
              </span>
              {m.dormantDays !== null && m.dormantDays > 7 && (
                <span className="flex items-center gap-1 text-amber-600 font-medium">
                  <AlertTriangle size={11} />
                  Dormant {m.dormantDays}j
                </span>
              )}
              {(m.dormantDays === null || m.dormantDays <= 7) && (
                <span className="text-neutral-400">{m.progress}%</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── REVENUE CHART ──────────────────────────────────────

function RevenueChart({
  data,
  caYtd,
  objectifAnnuel,
  pipeCommercial,
  impayes,
}: {
  data: StatsData['revenueByMonth'];
  caYtd: number;
  objectifAnnuel: number;
  pipeCommercial: number;
  impayes: number;
}) {
  // Build cumulative encaisse for the line
  const chartData = useMemo(() => {
    let cumul = 0;
    return data.map((d, i) => {
      cumul += d.encaisse;
      // Prorated objective line
      const prorataObjectif = objectifAnnuel > 0
        ? Math.round((objectifAnnuel / 12) * (i + 1))
        : 0;
      return {
        ...d,
        encaisseCumul: cumul,
        objectifProrata: prorataObjectif,
      };
    });
  }, [data, objectifAnnuel]);

  const progressPct = objectifAnnuel > 0
    ? Math.min(Math.round((caYtd / objectifAnnuel) * 100), 100)
    : 0;

  return (
    <Card>
      <h3 className="text-[15px] font-semibold text-neutral-900 mb-4">
        Chiffre d'affaires
      </h3>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f3" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: COLORS.neutralText }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: COLORS.neutralText }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatCurrency(v)}
            />
            <Tooltip
              content={
                <ChartTooltip
                  formatter={(v: number) => formatCurrency(v)}
                />
              }
              cursor={{ fill: 'rgba(5,150,105,0.04)' }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
            <Bar
              dataKey="facture"
              name="CA facturé"
              fill={COLORS.revenueGreen}
              barSize={24}
              radius={[6, 6, 0, 0]}
            />
            <Line
              dataKey="encaisseCumul"
              name="Encaissé cumulé"
              stroke={COLORS.revenueGreenDark}
              strokeWidth={2}
              dot={{ r: 3, fill: COLORS.revenueGreenDark }}
              type="monotone"
            />
            <Line
              dataKey="objectifProrata"
              name="Objectif prorata"
              stroke={COLORS.neutralText}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              dot={false}
              type="monotone"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Progress bar & KPIs */}
      <div className="mt-6 space-y-4">
        {/* Annual objective progress */}
        <div>
          <div className="flex items-center justify-between text-[13px] mb-2">
            <span className="font-medium text-neutral-600">Objectif annuel</span>
            <span className="font-semibold text-neutral-900">
              {formatCurrency(caYtd)} / {formatCurrency(objectifAnnuel)}
              <span className="ml-2 text-neutral-400">({progressPct}%)</span>
            </span>
          </div>
          <div className="h-3 rounded-full bg-neutral-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPct}%`,
                backgroundColor: progressPct >= 80 ? COLORS.revenueGreen : progressPct >= 50 ? COLORS.warningAmber : COLORS.dangerRed,
              }}
            />
          </div>
        </div>

        {/* Revenue sub-KPIs */}
        <div className="flex flex-wrap gap-6 pt-2">
          <div>
            <span className="block text-[11px] text-neutral-400 uppercase tracking-wider mb-0.5">
              Pipe pondéré
            </span>
            <span className="text-[16px] font-bold text-neutral-900">
              {formatCurrency(pipeCommercial)}
            </span>
          </div>
          <div>
            <span className="block text-[11px] text-neutral-400 uppercase tracking-wider mb-0.5">
              Impayés
            </span>
            <span className="text-[16px] font-bold text-red-500">
              {formatCurrency(impayes)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── RADAR CHART ────────────────────────────────────────

function PerformanceRadar({ data }: { data: StatsData['radar'] }) {
  return (
    <Card>
      <h3 className="text-[15px] font-semibold text-neutral-900 mb-4">
        Radar de performance
      </h3>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke="#e8e8ee" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fontSize: 11, fill: COLORS.neutralText }}
            />
            <PolarRadiusAxis
              tick={{ fontSize: 10, fill: COLORS.neutralText }}
              axisLine={false}
              domain={[0, 100]}
              tickCount={4}
            />
            <Radar
              name="Équipe"
              dataKey="teamAvg"
              stroke="#c4c4d0"
              fill="#c4c4d0"
              fillOpacity={0.15}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <Radar
              name="Vous"
              dataKey="value"
              stroke={COLORS.pipelineViolet}
              fill={COLORS.pipelineViolet}
              fillOpacity={0.2}
              strokeWidth={2}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
            <Tooltip content={<ChartTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── TIME PER STAGE ─────────────────────────────────────

function TimePerStageChart({
  data,
  timeToFill,
  teamTimeToFill,
}: {
  data: StatsData['timePerStage'];
  timeToFill: number | null;
  teamTimeToFill: number | null;
}) {
  const maxDays = Math.max(...data.map((d) => Math.max(d.days, d.teamAvg)), 1);

  return (
    <Card>
      <h3 className="text-[15px] font-semibold text-neutral-900 mb-4">
        Temps par étape
      </h3>
      <div className="space-y-3 mb-4">
        {data.map((stage, i) => {
          const pct = (stage.days / maxDays) * 100;
          const avgPct = (stage.teamAvg / maxDays) * 100;
          return (
            <div key={i}>
              <div className="flex items-center justify-between text-[12px] mb-1">
                <span className="text-neutral-600">
                  {stage.from} &rarr; {stage.to}
                </span>
                <span className="font-semibold text-neutral-900">{stage.days}j</span>
              </div>
              <div className="relative h-3 rounded-full bg-neutral-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(pct, 2)}%`,
                    backgroundColor: speedColor(stage.days, stage.teamAvg),
                  }}
                />
                {/* Team average marker */}
                <div
                  className="absolute top-0 h-full w-0.5 bg-neutral-400"
                  style={{ left: `${avgPct}%` }}
                  title={`Moy. équipe: ${stage.teamAvg}j`}
                />
              </div>
            </div>
          );
        })}
      </div>
      {/* Total time to fill */}
      <div className="pt-4 border-t border-neutral-100">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-neutral-600">
            Time-to-fill total
          </span>
          <div className="text-right">
            <span className="text-[18px] font-bold text-neutral-900">
              {timeToFill !== null ? `${timeToFill}j` : 'N/A'}
            </span>
            {teamTimeToFill !== null && (
              <span className="block text-[11px] text-neutral-400">
                Moy. équipe: {teamTimeToFill}j
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── TEAM COMPARISON CHART (ADMIN) ──────────────────────

function TeamComparisonChart({
  data,
}: {
  data: NonNullable<StatsData['teamComparison']>;
}) {
  // Find top performer per metric
  const tops = useMemo(() => {
    if (data.length === 0) return { appels: '', rdv: '', candidats: '', ca: '' };
    return {
      appels: data.reduce((top, d) => (d.appels > top.appels ? d : top), data[0]).userId,
      rdv: data.reduce((top, d) => (d.rdv > top.rdv ? d : top), data[0]).userId,
      candidats: data.reduce((top, d) => (d.candidats > top.candidats ? d : top), data[0]).userId,
      ca: data.reduce((top, d) => (d.ca > top.ca ? d : top), data[0]).userId,
    };
  }, [data]);

  // Best overall: who has the most "tops"
  const topCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(tops).forEach((uid) => {
      counts[uid] = (counts[uid] || 0) + 1;
    });
    let bestId = '';
    let bestCount = 0;
    Object.entries(counts).forEach(([uid, c]) => {
      if (c > bestCount) {
        bestId = uid;
        bestCount = c;
      }
    });
    return bestId;
  }, [tops]);

  const chartData = data.map((d) => ({
    name: `${d.prenom ?? ''} ${d.nom}`.trim(),
    Appels: d.appels,
    RDV: d.rdv,
    Candidats: d.candidats,
    CA: d.ca,
    userId: d.userId,
  }));

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-semibold text-neutral-900">
          Comparaison équipe
        </h3>
        {topCounts && (
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
            <Trophy size={13} />
            {data.find((d) => d.userId === topCounts)?.prenom ?? ''}{' '}
            {data.find((d) => d.userId === topCounts)?.nom ?? ''}
          </span>
        )}
      </div>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f3" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: COLORS.neutralText }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: COLORS.neutralText }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(124,92,252,0.04)' }} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
            <Bar dataKey="Appels" fill={COLORS.activityBlue} barSize={14} radius={[4, 4, 0, 0]} />
            <Bar dataKey="RDV" fill={COLORS.commercialTeal} barSize={14} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Candidats" fill={COLORS.pipelineViolet} barSize={14} radius={[4, 4, 0, 0]} />
            <Bar dataKey="CA" fill={COLORS.revenueGreen} barSize={14} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── CSV EXPORT ─────────────────────────────────────────

function exportToCsv(stats: StatsData) {
  const rows: string[][] = [];

  // Scorecards
  rows.push(['== Scorecards ==']);
  rows.push(['Métrique', 'Valeur', 'Tendance %']);
  SCORECARD_CONFIG.forEach((cfg) => {
    const item = stats.scorecards[cfg.key];
    rows.push([cfg.label, String(item.value), `${item.trend}%`]);
  });
  rows.push([]);

  // Calls by day
  rows.push(['== Appels par jour ==']);
  rows.push(['Jour', 'Nombre']);
  stats.callsByDay.forEach((d) => rows.push([d.day, String(d.count)]));
  rows.push([]);

  // RDV by type
  rows.push(['== RDV par type ==']);
  rows.push(['Type', 'Nombre']);
  stats.rdvByType.forEach((d) => rows.push([d.type, String(d.count)]));
  rows.push([]);

  // Funnel
  rows.push(['== Pipeline ==']);
  rows.push(['Étape', 'Nombre']);
  stats.funnel.forEach((d) => rows.push([d.stage, String(d.count)]));
  rows.push([]);

  // Mandats actifs
  rows.push(['== Mandats actifs ==']);
  rows.push(['Titre', 'Entreprise', 'Candidats', 'Fee', 'Progression %', 'Jours dormant']);
  stats.mandatsActifs.forEach((m) =>
    rows.push([m.titre, m.entreprise, String(m.candidats), String(m.fee), String(m.progress), m.dormantDays !== null ? String(m.dormantDays) : '']),
  );
  rows.push([]);

  // Revenue
  rows.push(['== Chiffre d\'affaires ==']);
  rows.push(['Mois', 'Facturé', 'Encaissé']);
  stats.revenueByMonth.forEach((d) => rows.push([d.month, String(d.facture), String(d.encaisse)]));
  rows.push([]);

  rows.push(['CA YTD', String(stats.caYtd)]);
  rows.push(['Objectif annuel', String(stats.objectifAnnuel)]);
  rows.push(['Pipe commercial', String(stats.pipeCommercial)]);
  rows.push(['Impayés', String(stats.impayes)]);
  rows.push([]);

  // Radar
  rows.push(['== Performance ==']);
  rows.push(['Métrique', 'Valeur', 'Moy. équipe']);
  stats.radar.forEach((d) => rows.push([d.metric, String(d.value), String(d.teamAvg)]));
  rows.push([]);

  // Time per stage
  rows.push(['== Temps par étape ==']);
  rows.push(['De', 'Vers', 'Jours', 'Moy. équipe']);
  stats.timePerStage.forEach((d) => rows.push([d.from, d.to, String(d.days), String(d.teamAvg)]));
  if (stats.timeToFill !== null) {
    rows.push(['Time-to-fill', String(stats.timeToFill), '', stats.teamTimeToFill !== null ? String(stats.teamTimeToFill) : '']);
  }
  rows.push([]);

  // Team comparison
  if (stats.teamComparison) {
    rows.push(['== Comparaison équipe ==']);
    rows.push(['Nom', 'Appels', 'RDV', 'Candidats', 'CA']);
    stats.teamComparison.forEach((d) =>
      rows.push([`${d.prenom} ${d.nom}`, String(d.appels), String(d.rdv), String(d.candidats), String(d.ca)]),
    );
  }

  const csvContent = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stats-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═════════════════════════════════════════════════════════
// ─── MAIN COMPONENT ─────────────────────────────────────
// ═════════════════════════════════════════════════════════

export default function StatsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const [period, setPeriod] = useState<Period>('month');
  const [selectedUserId, setSelectedUserId] = useState<string>(user?.id ?? '');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  // Fetch users list for admin selector
  const { data: usersData } = useQuery({
    queryKey: ['stats-users'],
    queryFn: () =>
      api.get<{ data: UserOption[] }>('/users?perPage=200'),
    enabled: isAdmin,
  });

  const users = usersData?.data ?? [];

  // Fetch stats
  const {
    data: stats,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['stats', period, selectedUserId],
    queryFn: async () => {
      const res = await api.get<{ data: StatsData }>(`/stats?period=${period}&userId=${selectedUserId}`);
      return res.data;
    },
    enabled: !!selectedUserId,
  });

  // Fetch push stats
  const { data: pushStats } = useQuery({
    queryKey: ['push-stats', period],
    queryFn: () => api.get<{
      totals: { sent: number; opened: number; responded: number; rdv_booked: number; converted: number; sans_suite: number };
      conversion_funnel: { opened_pct: number; responded_pct: number; rdv_booked_pct: number; converted_pct: number };
    }>(`/pushes/stats/dashboard?period=${period}`),
  });

  // Selected user name (for header)
  const displayUser = useMemo(() => {
    if (!isAdmin || selectedUserId === user?.id) {
      return { prenom: user?.prenom ?? '', nom: user?.nom ?? '' };
    }
    const found = users.find((u) => u.id === selectedUserId);
    return found
      ? { prenom: found.prenom ?? '', nom: found.nom }
      : { prenom: user?.prenom ?? '', nom: user?.nom ?? '' };
  }, [isAdmin, selectedUserId, user, users]);

  const handleExportCsv = useCallback(() => {
    if (stats) exportToCsv(stats);
  }, [stats]);

  // ─── RENDER ─────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.neutralBg }}>
      {/* Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span className="text-[24px]">{'\uD83D\uDCCA'}</span>
            Statistiques de {displayUser.prenom} {displayUser.nom}
          </span>
        }
        breadcrumbs={[{ label: 'Statistiques' }]}
      />

      {/* Controls bar */}
      <div className="mb-8 flex flex-wrap items-center gap-4">
        {/* Period pills */}
        <div className="flex items-center gap-1 bg-white rounded-xl p-1" style={{ boxShadow: CARD_SHADOW }}>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setPeriod(opt.key)}
              className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${
                period === opt.key
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-transparent text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Admin user selector */}
        {isAdmin && users.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              style={{ boxShadow: CARD_SHADOW }}
            >
              <span>
                {displayUser.prenom} {displayUser.nom}
              </span>
              <ChevronDown
                size={14}
                className={`text-neutral-400 transition-transform ${userDropdownOpen ? 'rotate-180' : ''}`}
              />
            </button>
            <AnimatePresence>
              {userDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full left-0 mt-1 z-50 min-w-[220px] rounded-xl bg-white border border-neutral-100 py-1 max-h-[300px] overflow-y-auto"
                  style={{ boxShadow: '0 8px 30px rgba(26,26,46,0.12)' }}
                >
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        setSelectedUserId(u.id);
                        setUserDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-[13px] transition-colors ${
                        selectedUserId === u.id
                          ? 'bg-blue-50 text-blue-700 font-semibold'
                          : 'text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      {u.prenom ?? ''} {u.nom}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            {/* Backdrop to close dropdown */}
            {userDropdownOpen && (
              <div
                className="fixed inset-0 z-40"
                onClick={() => setUserDropdownOpen(false)}
              />
            )}
          </div>
        )}
      </div>

      {/* Loading state */}
      {isLoading && <LoadingSkeleton />}

      {/* Error state */}
      {isError && (
        <div
          className="rounded-2xl bg-white p-8 text-center"
          style={{ boxShadow: CARD_SHADOW }}
        >
          <div className="text-[48px] mb-4">&#x26A0;&#xFE0F;</div>
          <h3 className="text-[16px] font-semibold text-neutral-900 mb-2">
            Erreur de chargement
          </h3>
          <p className="text-[13px] text-neutral-500 mb-4">
            {(error as any)?.message ?? 'Impossible de charger les statistiques. Veuillez réessayer.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-blue-500 px-6 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-600 transition-colors"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* Data loaded */}
      {stats && !isLoading && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="space-y-8"
        >
          {/* ────── SECTION 1: SCORECARDS ────── */}
          <section>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
              {SCORECARD_CONFIG.map((cfg, i) => (
                <Scorecard
                  key={cfg.key}
                  item={stats.scorecards[cfg.key]}
                  config={cfg}
                  index={i}
                />
              ))}
            </div>
          </section>

          {/* ────── SECTION 2: ACTIVITY ────── */}
          <section>
            <SectionTitle>Activité</SectionTitle>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <motion.div variants={fadeUp} custom={0}>
                <CallsByDayChart data={stats.callsByDay} />
              </motion.div>
              <motion.div variants={fadeUp} custom={1}>
                <RdvByTypeChart data={stats.rdvByType} />
              </motion.div>
            </div>
          </section>

          {/* ────── SECTION 3: PIPELINE ────── */}
          <section>
            <SectionTitle>Pipeline</SectionTitle>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <motion.div variants={fadeUp} custom={0}>
                <FunnelChart data={stats.funnel} />
              </motion.div>
              <motion.div variants={fadeUp} custom={1}>
                <MandatsActifsList data={stats.mandatsActifs} />
              </motion.div>
            </div>
          </section>

          {/* ────── SECTION 4: REVENUE ────── */}
          <section>
            <SectionTitle>Chiffre d'affaires</SectionTitle>
            <motion.div variants={fadeUp} custom={0}>
              <RevenueChart
                data={stats.revenueByMonth}
                caYtd={stats.caYtd}
                objectifAnnuel={stats.objectifAnnuel}
                pipeCommercial={stats.pipeCommercial}
                impayes={stats.impayes}
              />
            </motion.div>
          </section>

          {/* ────── SECTION 5: EFFICIENCY ────── */}
          <section>
            <SectionTitle>Efficacité</SectionTitle>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <motion.div variants={fadeUp} custom={0}>
                <PerformanceRadar data={stats.radar} />
              </motion.div>
              <motion.div variants={fadeUp} custom={1}>
                <TimePerStageChart
                  data={stats.timePerStage}
                  timeToFill={stats.timeToFill}
                  teamTimeToFill={stats.teamTimeToFill}
                />
              </motion.div>
            </div>
          </section>

          {/* ────── SECTION 6: PUSH CV ────── */}
          {pushStats && (
            <section>
              <SectionTitle>Push CV</SectionTitle>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'Total envoyés', value: pushStats.totals.sent, color: COLORS.activityBlue },
                  { label: 'Réponses', value: pushStats.totals.responded, color: COLORS.commercialTeal },
                  { label: 'RDV bookés', value: pushStats.totals.rdv_booked, color: COLORS.pipelineViolet },
                  { label: 'Taux conversion', value: pushStats.totals.sent > 0 ? `${Math.round((pushStats.totals.converted / pushStats.totals.sent) * 100)}%` : '0%', color: COLORS.revenueGreen },
                ].map((item, i) => (
                  <motion.div key={item.label} variants={fadeUp} custom={i}>
                    <Card>
                      <div className="flex items-center gap-2 mb-2">
                        <Rocket size={14} style={{ color: item.color }} />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                          {item.label}
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-neutral-900">{item.value}</p>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {pushStats.conversion_funnel && (
                <motion.div variants={fadeUp} custom={4}>
                  <Card>
                    <h3 className="text-[13px] font-semibold text-neutral-700 mb-4">Funnel de conversion</h3>
                    <div className="space-y-3">
                      {[
                        { label: 'Ouverts', count: pushStats.totals.opened, pct: pushStats.conversion_funnel.opened_pct },
                        { label: 'Répondus', count: pushStats.totals.responded, pct: pushStats.conversion_funnel.responded_pct },
                        { label: 'RDV bookés', count: pushStats.totals.rdv_booked, pct: pushStats.conversion_funnel.rdv_booked_pct },
                        { label: 'Convertis', count: pushStats.totals.converted, pct: pushStats.conversion_funnel.converted_pct },
                      ].map((step) => (
                        <div key={step.label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] font-medium text-neutral-600">{step.label}</span>
                            <span className="text-[12px] font-semibold text-neutral-800">
                              {step.count} ({step.pct}%)
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.max(step.pct, 2)}%`,
                                backgroundColor: COLORS.pipelineViolet,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </motion.div>
              )}
            </section>
          )}

          {/* ────── SECTION 7: TEAM COMPARISON (ADMIN) ────── */}
          {isAdmin && stats.teamComparison && stats.teamComparison.length > 0 && (
            <section>
              <SectionTitle>Comparaison équipe</SectionTitle>
              <motion.div variants={fadeUp} custom={0}>
                <TeamComparisonChart data={stats.teamComparison} />
              </motion.div>
            </section>
          )}

          {/* ────── CSV EXPORT ────── */}
          <section className="pb-8">
            <div className="flex justify-end">
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors border border-neutral-200"
              >
                <Download size={15} />
                Exporter en CSV
              </button>
            </div>
          </section>
        </motion.div>
      )}
    </div>
  );
}
