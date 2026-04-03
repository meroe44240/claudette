import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Zap, Plus, Play, Pause, X, Mail, Phone, MessageCircle,
  ChevronDown, ChevronRight, Clock, Users, Building2, Repeat,
  Copy, ToggleLeft, ToggleRight, CheckCircle2, AlertCircle,
  Eye, BarChart3, Snowflake, Shield, ArrowRight, CalendarClock,
  TrendingUp, MessageSquare, PhoneCall, Hash,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import { usePageTitle } from '../../hooks/usePageTitle';

// ─── TYPES ──────────────────────────────────────────

interface SequenceStep {
  order: number;
  delay_days: number;
  delay_hours: number;
  channel: 'email' | 'call' | 'whatsapp';
  action: 'send' | 'call' | 'message';
  template: {
    subject?: string;
    body?: string;
    whatsapp_message?: string;
  };
  task_title: string;
  instructions?: string;
}

interface Sequence {
  id: string;
  nom: string;
  description: string | null;
  persona: string | null;
  targetType: string;
  steps: SequenceStep[];
  stopOnReply: boolean;
  isActive: boolean;
  isSystem: boolean;
  autoTrigger: boolean;
  triggerEvent: string | null;
  totalRuns: number;
  createdAt: string;
  createdBy?: { nom: string; prenom?: string };
}

interface SequenceRun {
  id: string;
  sequenceId: string;
  targetType: string;
  targetId: string;
  currentStep: number;
  status: string;
  startedAt: string;
  nextActionAt: string | null;
  pushId: string | null;
  metadata: Record<string, string> | null;
  sequence: { nom: string; targetType: string; persona: string | null; steps: any; isSystem: boolean };
  stepLogs?: { stepOrder: number; channel?: string; status: string; executedAt?: string }[];
  contactName: string;
  companyName: string;
  totalSteps: number;
  currentStepChannel?: string | null;
  currentStepTitle?: string | null;
  lastStepLog?: { stepOrder: number; channel?: string; status: string; executedAt?: string } | null;
  endReason?: string;
}

interface RunDetail {
  run_id: string;
  sequence_name: string;
  contact_name: string;
  company_name: string;
  status: string;
  current_step: number;
  total_steps: number;
  started_at: string;
  next_action_at: string | null;
  push_id: string | null;
  steps: {
    order: number;
    total: number;
    channel: string;
    title: string;
    instructions?: string;
    scheduled_date: string;
    delay_days: number;
    status: string;
    executed_at?: string;
    result?: any;
    task_id?: string;
  }[];
  latest_research: any;
}

interface SequenceStats {
  period: string;
  total_runs: number;
  taux_reponse: number;
  replied_count: number;
  etape_moyenne_reponse: number;
  meilleur_canal: { channel: string; taux_reponse: number; total: number } | null;
  pire_canal: { channel: string; taux_reponse: number; total: number } | null;
  channels: { channel: string; taux_reponse: number; total: number }[];
  cold_count: number;
  temps_moyen_reponse_jours: number;
}

// ─── CHANNEL HELPERS ────────────────────────────────

const CHANNEL_CONFIG: Record<string, { icon: any; label: string; bg: string; text: string; pill: string }> = {
  email: { icon: Mail, label: 'Email', bg: '#EFF6FF', text: '#3B82F6', pill: '#DBEAFE' },
  call: { icon: Phone, label: 'Appel', bg: '#F0FDF4', text: '#16A34A', pill: '#DCFCE7' },
  whatsapp: { icon: MessageCircle, label: 'LinkedIn/WhatsApp', bg: '#ECFDF5', text: '#059669', pill: '#D1FAE5' },
  call_sms: { icon: PhoneCall, label: 'Call + SMS', bg: '#FEF3C7', text: '#D97706', pill: '#FDE68A' },
  sms_call: { icon: MessageSquare, label: 'SMS + Call', bg: '#FEF3C7', text: '#D97706', pill: '#FDE68A' },
  linkedin: { icon: MessageCircle, label: 'LinkedIn', bg: '#EFF6FF', text: '#2563EB', pill: '#DBEAFE' },
};

const PERSONA_COLORS: Record<string, { bg: string; text: string }> = {
  'Candidat passif Tech': { bg: '#EFF6FF', text: '#3B82F6' },
  'DRH Grand Groupe': { bg: '#FFF7ED', text: '#D97706' },
  'Candidat en process': { bg: '#F0FDF4', text: '#16A34A' },
  'Startup Founder': { bg: '#FDF2F8', text: '#DB2777' },
  'Prospect Adchase': { bg: '#F5F3FF', text: '#7C3AED' },
  'Prospect Push CV': { bg: '#FFF1F2', text: '#E11D48' },
};

function getChannels(steps: SequenceStep[]): string[] {
  const channels = new Set<string>();
  steps.forEach(s => channels.add(s.channel));
  return Array.from(channels);
}

function getChannelIcon(channel: string) {
  const cfg = CHANNEL_CONFIG[channel] || CHANNEL_CONFIG.email;
  return cfg;
}

// ─── PROGRESS BAR ───────────────────────────────────

function SequenceProgressBar({ current, total, status }: { current: number; total: number; status: string }) {
  return (
    <div className="flex gap-[3px]">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-[7px] flex-1 rounded-full transition-all ${
            i < current ? 'bg-brand-500' :
            i === current && status === 'running' ? 'bg-brand-500 animate-pulse' :
            'bg-neutral-200'
          }`}
        />
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════

export default function SequencesPage() {
  usePageTitle('Séquences');
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'active' | 'paused' | 'completed' | 'templates'>('active');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailRunId, setDetailRunId] = useState<string | null>(null);

  // ── API ────────────────────────────────────────────
  const { data: sequencesData, isLoading } = useQuery({
    queryKey: ['sequences'],
    queryFn: () => api.get<{ data: Sequence[] }>('/sequences'),
  });

  const { data: activeRunsData } = useQuery({
    queryKey: ['sequences', 'runs', 'active'],
    queryFn: () => api.get<{ data: SequenceRun[] }>('/sequences/runs/active'),
  });

  const { data: completedRunsData } = useQuery({
    queryKey: ['sequences', 'runs', 'completed'],
    queryFn: () => api.get<{ data: SequenceRun[] }>('/sequences/runs/completed'),
    enabled: tab === 'completed',
  });

  const { data: statsData } = useQuery({
    queryKey: ['sequences', 'stats'],
    queryFn: () => api.get<SequenceStats>('/sequences/stats'),
  });

  const { data: runDetailData } = useQuery({
    queryKey: ['sequences', 'run-detail', detailRunId],
    queryFn: () => api.get<RunDetail>(`/sequences/runs/${detailRunId}`),
    enabled: !!detailRunId,
  });

  const seedMutation = useMutation({
    mutationFn: () => api.post('/sequences/seed', {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sequences'] }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/sequences/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sequences'] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: (seq: Sequence) =>
      api.post('/sequences', {
        nom: `${seq.nom} (copie)`,
        description: seq.description,
        persona: seq.persona,
        targetType: seq.targetType,
        steps: seq.steps,
        stopOnReply: seq.stopOnReply,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sequences'] }),
  });

  const pauseRunMutation = useMutation({
    mutationFn: (id: string) => api.put(`/sequences/runs/${id}/pause`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sequences', 'runs'] }),
  });

  const resumeRunMutation = useMutation({
    mutationFn: (id: string) => api.put(`/sequences/runs/${id}/resume`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sequences', 'runs'] }),
  });

  const cancelRunMutation = useMutation({
    mutationFn: (id: string) => api.put(`/sequences/runs/${id}/cancel`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sequences', 'runs'] }),
  });

  const sequences = sequencesData?.data ?? [];
  const allRuns = activeRunsData?.data ?? [];
  const activeRuns = allRuns.filter(r => r.status === 'running');
  const pausedRuns = allRuns.filter(r => r.status === 'paused_reply');
  const completedRuns = completedRunsData?.data ?? [];
  const stats = statsData;
  const detail = runDetailData;

  // Group active runs by sequence name
  const runsBySequence = useMemo(() => {
    const map = new Map<string, SequenceRun[]>();
    for (const run of activeRuns) {
      const key = run.sequence.nom;
      const arr = map.get(key) || [];
      arr.push(run);
      map.set(key, arr);
    }
    return map;
  }, [activeRuns]);

  // ── RENDER ─────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Séquences"
        subtitle="Workflows multicanal — relances automatiques avec IA"
        breadcrumbs={[{ label: 'Séquences' }]}
        actions={
          sequences.length === 0 ? (
            <button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-[13px] font-medium text-white hover:bg-brand-600 transition-colors"
            >
              <Zap size={14} />
              {seedMutation.isPending ? 'Création...' : 'Créer les templates par défaut'}
            </button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-neutral-100 p-1 w-fit">
        {[
          { key: 'active' as const, label: `Actives (${activeRuns.length})` },
          { key: 'paused' as const, label: `En pause (${pausedRuns.length})` },
          { key: 'completed' as const, label: 'Terminées' },
          { key: 'templates' as const, label: `Templates (${sequences.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-4 py-2 text-[13px] font-medium transition-all ${
              tab === t.key ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── TAB: ACTIVES ────────────────────────────── */}
      {tab === 'active' && (
        <div className="space-y-4">
          {activeRuns.length === 0 ? (
            <EmptyBlock icon={Play} title="Aucune séquence active" subtitle="Les séquences se lancent automatiquement après un push CV ou manuellement depuis la fiche client" />
          ) : (
            [...runsBySequence.entries()].map(([seqName, runs]) => (
              <div key={seqName}>
                <h3 className="text-[12px] font-semibold text-neutral-400 uppercase tracking-wider mb-2 px-1">
                  {seqName} ({runs.length} active{runs.length > 1 ? 's' : ''})
                </h3>
                <div className="space-y-2">
                  {runs.map(run => (
                    <RunCard
                      key={run.id}
                      run={run}
                      onViewDetail={() => setDetailRunId(run.id)}
                      onPause={() => pauseRunMutation.mutate(run.id)}
                      onCancel={() => cancelRunMutation.mutate(run.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── TAB: EN PAUSE ───────────────────────────── */}
      {tab === 'paused' && (
        <div className="space-y-2">
          {pausedRuns.length === 0 ? (
            <EmptyBlock icon={Pause} title="Aucune séquence en pause" subtitle="Les séquences se mettent en pause automatiquement quand le prospect répond" />
          ) : (
            pausedRuns.map(run => (
              <RunCard
                key={run.id}
                run={run}
                onViewDetail={() => setDetailRunId(run.id)}
                onResume={() => resumeRunMutation.mutate(run.id)}
                onCancel={() => cancelRunMutation.mutate(run.id)}
                isPaused
              />
            ))
          )}
        </div>
      )}

      {/* ─── TAB: TERMINÉES ──────────────────────────── */}
      {tab === 'completed' && (
        <div className="space-y-2">
          {completedRuns.length === 0 ? (
            <EmptyBlock icon={CheckCircle2} title="Aucune séquence terminée" subtitle="Les séquences complétées ou annulées apparaîtront ici" />
          ) : (
            completedRuns.map(run => (
              <motion.div
                key={run.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 rounded-xl bg-white border border-neutral-100 shadow-sm px-5 py-3 cursor-pointer hover:bg-neutral-50 transition-colors"
                onClick={() => setDetailRunId(run.id)}
              >
                {/* Avatar */}
                <div className={`flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold shrink-0 ${
                  run.endReason === 'reply' ? 'bg-revenue-100 text-revenue-600' :
                  run.endReason === 'cold' ? 'bg-blue-100 text-blue-600' :
                  'bg-neutral-100 text-neutral-500'
                }`}>
                  {run.contactName ? run.contactName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '??'}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-neutral-900 truncate">
                      {run.contactName || 'Contact'} — {run.companyName || 'Entreprise'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <SequenceProgressBar current={run.totalSteps} total={run.totalSteps} status="completed" />
                    <span className="text-[11px] text-neutral-400 font-medium shrink-0">{run.totalSteps}/{run.totalSteps}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                    run.endReason === 'reply' ? 'bg-revenue-100 text-revenue-600' :
                    run.endReason === 'cold' ? 'bg-blue-100 text-blue-600' :
                    'bg-neutral-100 text-neutral-500'
                  }`}>
                    {run.endReason === 'reply' ? '✅ Répondu' :
                     run.endReason === 'cold' ? '❄️ Cold' :
                     '✕ Annulée'}
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    {format(new Date(run.startedAt), 'dd/MM/yy', { locale: fr })}
                  </span>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* ─── TAB: TEMPLATES ──────────────────────────── */}
      {tab === 'templates' && (
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-neutral-100 animate-pulse" />
            ))
          ) : sequences.length === 0 ? (
            <EmptyBlock icon={Zap} title="Aucune séquence" subtitle="Créez des workflows multicanal pour vos candidats et clients">
              <button
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                className="rounded-lg bg-brand-500 px-5 py-2.5 text-[13px] font-medium text-white hover:bg-brand-600 transition-colors mt-3"
              >
                Créer les templates par défaut
              </button>
            </EmptyBlock>
          ) : (
            sequences.map(seq => {
              const isExpanded = expandedId === seq.id;
              const steps = seq.steps || [];
              const channels = getChannels(steps);
              const personaColor = seq.persona ? PERSONA_COLORS[seq.persona] || { bg: '#F3F4F6', text: '#6B7280' } : null;
              const totalDays = steps.length > 0 ? steps[steps.length - 1].delay_days : 0;

              return (
                <motion.div
                  key={seq.id}
                  layout
                  className="rounded-xl bg-white border border-neutral-100 shadow-sm overflow-hidden"
                >
                  {/* Card header */}
                  <div
                    className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-neutral-50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : seq.id)}
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${
                      seq.isSystem ? 'bg-gradient-to-br from-brand-500 to-brand-600' : 'bg-brand-50'
                    }`}>
                      {seq.isSystem
                        ? <Shield size={18} className="text-white" />
                        : <Repeat size={18} className="text-brand-500" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[15px] font-semibold text-neutral-900">{seq.nom}</h3>
                        {seq.isSystem && (
                          <span className="rounded-full px-2 py-0.5 text-[9px] font-bold bg-brand-100 text-brand-600 uppercase tracking-wide">
                            Système
                          </span>
                        )}
                        {seq.persona && personaColor && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: personaColor.bg, color: personaColor.text }}
                          >
                            {seq.persona}
                          </span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          seq.isActive ? 'bg-revenue-100 text-revenue-600' : 'bg-neutral-100 text-neutral-400'
                        }`}>
                          {seq.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[12px] text-neutral-500 flex-wrap">
                        <span>{steps.length} étape{steps.length > 1 ? 's' : ''}, {totalDays} jours</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          {seq.targetType === 'candidate' ? <Users size={11} /> : <Building2 size={11} />}
                          {seq.targetType === 'candidate' ? 'Candidats' : 'Clients'}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1.5">
                          {channels.map(ch => {
                            const cfg = getChannelIcon(ch);
                            const Icon = cfg.icon;
                            return (
                              <span
                                key={ch}
                                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium"
                                style={{ backgroundColor: cfg.pill, color: cfg.text }}
                              >
                                <Icon size={10} />
                                {cfg.label}
                              </span>
                            );
                          })}
                        </span>
                        {seq.autoTrigger && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-1 text-brand-500 font-medium">
                              <Zap size={10} />
                              Auto : {seq.triggerEvent === 'push_cv' ? 'après push CV' : seq.triggerEvent}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span>{seq.totalRuns} utilisation{seq.totalRuns > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!seq.isSystem && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); duplicateMutation.mutate(seq); }}
                            className="rounded-md p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
                            title="Dupliquer"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleActiveMutation.mutate({ id: seq.id, isActive: !seq.isActive }); }}
                            className="rounded-md p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
                            title={seq.isActive ? 'Désactiver' : 'Activer'}
                          >
                            {seq.isActive ? <ToggleRight size={16} className="text-revenue-500" /> : <ToggleLeft size={16} />}
                          </button>
                        </>
                      )}
                      {isExpanded ? <ChevronDown size={16} className="text-neutral-400" /> : <ChevronRight size={16} className="text-neutral-400" />}
                    </div>
                  </div>

                  {/* Expanded: Steps timeline */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-neutral-100 px-5 py-4 bg-neutral-50/50"
                      >
                        {seq.description && (
                          <p className="text-[13px] text-neutral-500 mb-4">{seq.description}</p>
                        )}
                        {seq.stopOnReply && (
                          <div className="flex items-center gap-2 mb-4 rounded-lg bg-revenue-50 px-3 py-2 text-[12px] text-revenue-700">
                            <AlertCircle size={14} />
                            Arrêt automatique si le contact répond
                          </div>
                        )}
                        <div className="space-y-0">
                          {steps.map((step, i) => {
                            const cfg = getChannelIcon(step.channel);
                            const Icon = cfg.icon;
                            const isLast = i === steps.length - 1;

                            return (
                              <div key={i} className="flex gap-3">
                                <div className="flex flex-col items-center">
                                  <div
                                    className="flex h-8 w-8 items-center justify-center rounded-full shrink-0"
                                    style={{ backgroundColor: cfg.bg }}
                                  >
                                    <Icon size={14} style={{ color: cfg.text }} />
                                  </div>
                                  {!isLast && <div className="w-0.5 flex-1 bg-neutral-200 my-1" />}
                                </div>
                                <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
                                  <div className="flex items-center gap-2">
                                    <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">
                                      J+{step.delay_days}
                                    </span>
                                    <span
                                      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                                      style={{ backgroundColor: cfg.pill, color: cfg.text }}
                                    >
                                      {cfg.label}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-[13px] font-medium text-neutral-800">{step.task_title}</p>
                                  {step.instructions && (
                                    <p className="mt-0.5 text-[12px] text-neutral-400 italic line-clamp-2">{step.instructions}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* ─── STATS ───────────────────────────────────── */}
      {stats && stats.total_runs > 0 && (
        <div className="rounded-xl bg-white border border-neutral-100 shadow-sm p-5">
          <h3 className="text-[14px] font-semibold text-neutral-900 mb-4 flex items-center gap-2">
            <BarChart3 size={16} className="text-brand-500" />
            Stats Séquences (30 derniers jours)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <StatBlock label="Taux de réponse" value={`${stats.taux_reponse}%`} sub={`${stats.replied_count}/${stats.total_runs}`} color="brand" />
            <StatBlock label="Étape moy. réponse" value={String(stats.etape_moyenne_reponse)} color="blue" />
            <StatBlock label="Meilleur canal" value={stats.meilleur_canal ? getChannelIcon(stats.meilleur_canal.channel).label : '—'} sub={stats.meilleur_canal ? `${stats.meilleur_canal.taux_reponse}%` : ''} color="green" />
            <StatBlock label="Pire canal" value={stats.pire_canal && stats.pire_canal.channel !== stats.meilleur_canal?.channel ? getChannelIcon(stats.pire_canal.channel).label : '—'} sub={stats.pire_canal && stats.pire_canal.channel !== stats.meilleur_canal?.channel ? `${stats.pire_canal.taux_reponse}%` : ''} color="red" />
            <StatBlock label="Temps moy. réponse" value={`${stats.temps_moyen_reponse_jours}j`} color="purple" />
            <StatBlock label="Cold ce mois" value={String(stats.cold_count)} color="neutral" />
          </div>
        </div>
      )}

      {/* ─── DETAIL SLIDE-OVER ───────────────────────── */}
      <AnimatePresence>
        {detailRunId && detail && (
          <RunDetailPanel detail={detail} onClose={() => setDetailRunId(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── RUN CARD COMPONENT ─────────────────────────────

function RunCard({
  run,
  onViewDetail,
  onPause,
  onResume,
  onCancel,
  isPaused = false,
}: {
  run: SequenceRun;
  onViewDetail: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onCancel: () => void;
  isPaused?: boolean;
}) {
  const initials = run.contactName
    ? run.contactName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  const lastLog = run.lastStepLog;
  const lastAction = lastLog
    ? `${getChannelIcon(lastLog.channel || 'email').label} — ${lastLog.status === 'task_created' ? 'envoyé' : lastLog.status}`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-4 rounded-xl bg-white border shadow-sm px-5 py-3 transition-colors ${
        isPaused ? 'border-revenue-200 bg-revenue-50/30' : 'border-neutral-100 hover:bg-neutral-50'
      }`}
    >
      {/* Avatar */}
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white text-[12px] font-bold shrink-0">
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-neutral-900 truncate">
            {run.contactName || 'Contact'} — {run.companyName || 'Entreprise'}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <div className="w-32">
            <SequenceProgressBar current={run.currentStep} total={run.totalSteps} status={run.status} />
          </div>
          <span className="text-[12px] font-semibold text-neutral-700">{run.currentStep}/{run.totalSteps}</span>
          {run.nextActionAt && !isPaused && (
            <span className="flex items-center gap-1 text-[11px] text-neutral-500">
              <Clock size={10} />
              J+{run.currentStep > 0 ? (run.sequence.steps as any[])?.[run.currentStep]?.delay_days ?? '?' : '1'} {run.currentStepChannel ? getChannelIcon(run.currentStepChannel).label.toLowerCase() : ''}
            </span>
          )}
          {isPaused && (
            <span className="flex items-center gap-1 text-[11px] text-revenue-600 font-medium">
              <CheckCircle2 size={10} />
              A répondu
            </span>
          )}
          {lastAction && (
            <span className="text-[11px] text-neutral-400 truncate hidden md:block">
              Dernier : {lastAction}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onViewDetail}
          className="rounded-md p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
          title="Voir le détail"
        >
          <Eye size={14} />
        </button>
        {isPaused && onResume ? (
          <button
            onClick={onResume}
            className="rounded-md p-2 text-revenue-500 hover:bg-revenue-50 transition-colors"
            title="Reprendre"
          >
            <Play size={14} />
          </button>
        ) : onPause ? (
          <button
            onClick={onPause}
            className="rounded-md p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
            title="Pause"
          >
            <Pause size={14} />
          </button>
        ) : null}
        <button
          onClick={onCancel}
          className="rounded-md p-2 text-neutral-400 hover:bg-danger-50 hover:text-danger-500 transition-colors"
          title="Arrêter"
        >
          <X size={14} />
        </button>
      </div>
    </motion.div>
  );
}

// ─── RUN DETAIL PANEL ───────────────────────────────

function RunDetailPanel({ detail, onClose }: { detail: RunDetail; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <motion.div
        initial={{ x: 480 }}
        animate={{ x: 0 }}
        exit={{ x: 480 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full max-w-[480px] bg-white shadow-2xl overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-100 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-bold text-neutral-900">
                {detail.contact_name} ({detail.company_name})
              </h2>
              <p className="text-[12px] text-neutral-500 mt-0.5">
                {detail.sequence_name} — {detail.current_step}/{detail.total_steps}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 hover:bg-neutral-100 transition-colors"
            >
              <X size={18} className="text-neutral-400" />
            </button>
          </div>
          <div className="mt-3">
            <SequenceProgressBar
              current={detail.status === 'completed' ? detail.total_steps : detail.current_step - 1}
              total={detail.total_steps}
              status={detail.status}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="px-6 py-4 space-y-0">
          {detail.steps.map((step, i) => {
            const cfg = getChannelIcon(step.channel);
            const Icon = cfg.icon;
            const isLast = i === detail.steps.length - 1;
            const isCurrent = step.status === 'current';
            const isDone = step.status !== 'current' && step.status !== 'upcoming';
            const isUpcoming = step.status === 'upcoming';

            return (
              <div key={i} className="flex gap-3">
                {/* Timeline */}
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 transition-all ${
                      isCurrent ? 'ring-2 ring-brand-500 ring-offset-2' : ''
                    }`}
                    style={{
                      backgroundColor: isUpcoming ? '#F3F4F6' : cfg.bg,
                      opacity: isUpcoming ? 0.6 : 1,
                    }}
                  >
                    {isDone ? (
                      <CheckCircle2 size={14} className="text-revenue-500" />
                    ) : (
                      <Icon size={14} style={{ color: isUpcoming ? '#9CA3AF' : cfg.text }} />
                    )}
                  </div>
                  {!isLast && <div className={`w-0.5 flex-1 my-1 ${isDone ? 'bg-revenue-300' : 'bg-neutral-200'}`} />}
                </div>

                {/* Content */}
                <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      isCurrent ? 'bg-brand-100 text-brand-700' : 'bg-neutral-200 text-neutral-600'
                    }`}>
                      J+{step.delay_days}
                    </span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: isUpcoming ? '#F3F4F6' : cfg.pill,
                        color: isUpcoming ? '#9CA3AF' : cfg.text,
                      }}
                    >
                      {cfg.label}
                    </span>
                    <span className="text-[10px] text-neutral-400">
                      {step.scheduled_date ? format(new Date(step.scheduled_date), 'dd MMM', { locale: fr }) : ''}
                    </span>
                  </div>
                  <p className={`mt-1 text-[13px] font-medium ${
                    isUpcoming ? 'text-neutral-400' : 'text-neutral-800'
                  }`}>
                    {step.title}
                  </p>
                  {isDone && step.executed_at && (
                    <p className="mt-0.5 text-[11px] text-revenue-500">
                      Fait le {format(new Date(step.executed_at), 'dd/MM à HH:mm', { locale: fr })}
                      {step.result && typeof step.result === 'object' && (step.result as any).status
                        ? ` — ${(step.result as any).status}`
                        : ''}
                    </p>
                  )}
                  {isCurrent && step.instructions && (
                    <div className="mt-2 rounded-lg bg-brand-50 p-3 text-[12px] text-brand-800">
                      {step.instructions}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* AI Research */}
        {detail.latest_research && (
          <div className="mx-6 mb-6 rounded-xl bg-gradient-to-br from-violet-50 to-blue-50 border border-violet-100 p-4">
            <h4 className="text-[12px] font-semibold text-violet-700 mb-2 flex items-center gap-1.5">
              <Zap size={12} />
              Recherche IA du jour
            </h4>
            {detail.latest_research.best_signal && (
              <p className="text-[12px] text-violet-900 mb-1">
                <span className="font-semibold">Signal :</span> {detail.latest_research.best_signal}
              </p>
            )}
            {detail.latest_research.suggested_angle && (
              <p className="text-[12px] text-violet-800">
                <span className="font-semibold">Angle :</span> {detail.latest_research.suggested_angle}
              </p>
            )}
            {detail.latest_research.job_postings?.length > 0 && (
              <p className="text-[11px] text-violet-600 mt-1">
                {detail.latest_research.job_postings.length} offre(s) d&apos;emploi détectée(s)
              </p>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── STAT BLOCK ─────────────────────────────────────

function StatBlock({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  const colorMap: Record<string, string> = {
    brand: 'text-brand-600',
    blue: 'text-blue-600',
    green: 'text-revenue-600',
    red: 'text-danger-500',
    purple: 'text-violet-600',
    neutral: 'text-neutral-600',
  };

  return (
    <div className="text-center">
      <p className={`text-[20px] font-bold ${colorMap[color] || 'text-neutral-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-neutral-400 mt-0.5">{sub}</p>}
      <p className="text-[11px] text-neutral-500 mt-0.5">{label}</p>
    </div>
  );
}

// ─── EMPTY BLOCK ────────────────────────────────────

function EmptyBlock({ icon: Icon, title, subtitle, children }: { icon: any; title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <Icon size={48} strokeWidth={1} className="text-neutral-200 mb-3" />
      <p className="text-[16px] font-medium text-neutral-900 mb-1">{title}</p>
      <p className="text-[13px] text-neutral-500">{subtitle}</p>
      {children}
    </div>
  );
}
