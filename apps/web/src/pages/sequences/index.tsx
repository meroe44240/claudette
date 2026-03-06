import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Zap, Plus, Play, Pause, X, Mail, Phone, MessageCircle,
  ChevronDown, ChevronRight, Clock, Users, Building2, Repeat,
  Copy, ToggleLeft, ToggleRight, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api-client';

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
  sequence: { nom: string; targetType: string; persona: string | null };
  stepLogs?: { stepOrder: number; channel?: string; status: string }[];
}

// ─── CHANNEL HELPERS ────────────────────────────────

const CHANNEL_CONFIG = {
  email: { icon: Mail, label: 'Email', bg: '#EFF6FF', text: '#3B82F6', pill: '#DBEAFE' },
  call: { icon: Phone, label: 'Appel', bg: '#F0FDF4', text: '#16A34A', pill: '#DCFCE7' },
  whatsapp: { icon: MessageCircle, label: 'WhatsApp', bg: '#ECFDF5', text: '#059669', pill: '#D1FAE5' },
};

const PERSONA_COLORS: Record<string, { bg: string; text: string }> = {
  'Candidat passif Tech': { bg: '#EFF6FF', text: '#3B82F6' },
  'DRH Grand Groupe': { bg: '#FFF7ED', text: '#D97706' },
  'Candidat en process': { bg: '#F0FDF4', text: '#16A34A' },
  'Startup Founder': { bg: '#FDF2F8', text: '#DB2777' },
};

function getChannels(steps: SequenceStep[]): ('email' | 'call' | 'whatsapp')[] {
  const channels = new Set<'email' | 'call' | 'whatsapp'>();
  steps.forEach(s => channels.add(s.channel));
  return Array.from(channels);
}

// ═════════════════════════════════════════════════════

export default function SequencesPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'templates' | 'active' | 'completed'>('templates');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sequences', 'runs', 'active'] }),
  });

  const resumeRunMutation = useMutation({
    mutationFn: (id: string) => api.put(`/sequences/runs/${id}/resume`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sequences', 'runs', 'active'] }),
  });

  const cancelRunMutation = useMutation({
    mutationFn: (id: string) => api.put(`/sequences/runs/${id}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequences', 'runs'] });
    },
  });

  const sequences = sequencesData?.data ?? [];
  const activeRuns = activeRunsData?.data ?? [];
  const completedRuns = completedRunsData?.data ?? [];

  // ── RENDER ─────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[24px] font-bold text-neutral-900">Séquences</h1>
          <p className="mt-1 text-[14px] text-neutral-500">
            Workflows multicanal — email, appel, WhatsApp
          </p>
        </div>
        <div className="flex items-center gap-3">
          {sequences.length === 0 && (
            <button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-[13px] font-medium text-white hover:bg-brand-600 transition-colors"
            >
              <Zap size={14} />
              {seedMutation.isPending ? 'Création...' : 'Créer les templates par défaut'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-neutral-100 p-1 w-fit">
        {[
          { key: 'templates' as const, label: `Templates (${sequences.length})` },
          { key: 'active' as const, label: `En cours (${activeRuns.length})` },
          { key: 'completed' as const, label: 'Terminées' },
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

      {/* ─── TAB: TEMPLATES ──────────────────────────── */}
      {tab === 'templates' && (
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-neutral-100 animate-pulse" />
            ))
          ) : sequences.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Zap size={48} strokeWidth={1} className="text-neutral-200 mb-3" />
              <p className="text-[16px] font-medium text-neutral-900 mb-1">Aucune séquence</p>
              <p className="text-[13px] text-neutral-500 mb-4">
                Créez des workflows multicanal pour vos candidats et clients
              </p>
              <button
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                className="rounded-lg bg-brand-500 px-5 py-2.5 text-[13px] font-medium text-white hover:bg-brand-600 transition-colors"
              >
                Créer les 4 templates par défaut
              </button>
            </div>
          ) : (
            sequences.map(seq => {
              const isExpanded = expandedId === seq.id;
              const steps = seq.steps || [];
              const channels = getChannels(steps);
              const personaColor = seq.persona ? PERSONA_COLORS[seq.persona] || { bg: '#F3F4F6', text: '#6B7280' } : null;

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
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 shrink-0">
                      <Repeat size={18} className="text-brand-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[15px] font-semibold text-neutral-900">{seq.nom}</h3>
                        {/* Persona badge */}
                        {seq.persona && personaColor && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ backgroundColor: personaColor.bg, color: personaColor.text }}
                          >
                            {seq.persona}
                          </span>
                        )}
                        {/* Active badge */}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          seq.isActive ? 'bg-revenue-100 text-revenue-600' : 'bg-neutral-100 text-neutral-400'
                        }`}>
                          {seq.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[12px] text-neutral-500">
                        <span>{steps.length} étape{steps.length > 1 ? 's' : ''}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          {seq.targetType === 'candidate' ? <Users size={11} /> : <Building2 size={11} />}
                          {seq.targetType === 'candidate' ? 'Candidats' : 'Clients'}
                        </span>
                        <span>·</span>
                        {/* Channel icons */}
                        <span className="flex items-center gap-1.5">
                          {channels.map(ch => {
                            const cfg = CHANNEL_CONFIG[ch];
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
                        <span>·</span>
                        <span>{seq.totalRuns} utilisation{seq.totalRuns > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Duplicate */}
                      <button
                        onClick={(e) => { e.stopPropagation(); duplicateMutation.mutate(seq); }}
                        className="rounded-md p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
                        title="Dupliquer"
                      >
                        <Copy size={14} />
                      </button>
                      {/* Toggle Active */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleActiveMutation.mutate({ id: seq.id, isActive: !seq.isActive }); }}
                        className="rounded-md p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
                        title={seq.isActive ? 'Désactiver' : 'Activer'}
                      >
                        {seq.isActive ? <ToggleRight size={16} className="text-revenue-500" /> : <ToggleLeft size={16} />}
                      </button>
                      {/* Expand */}
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
                            Arrêt automatique si le contact répond (email, appel ou WhatsApp)
                          </div>
                        )}
                        <div className="space-y-0">
                          {steps.map((step, i) => {
                            const cfg = CHANNEL_CONFIG[step.channel] || CHANNEL_CONFIG.email;
                            const Icon = cfg.icon;
                            const isLast = i === steps.length - 1;

                            return (
                              <div key={i} className="flex gap-3">
                                {/* Timeline */}
                                <div className="flex flex-col items-center">
                                  <div
                                    className="flex h-8 w-8 items-center justify-center rounded-full shrink-0"
                                    style={{ backgroundColor: cfg.bg }}
                                  >
                                    <Icon size={14} style={{ color: cfg.text }} />
                                  </div>
                                  {!isLast && <div className="w-0.5 flex-1 bg-neutral-200 my-1" />}
                                </div>
                                {/* Content */}
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
                                    <p className="mt-0.5 text-[12px] text-neutral-400 italic">{step.instructions}</p>
                                  )}
                                  {step.template.subject && (
                                    <p className="mt-0.5 text-[11px] text-neutral-400">Sujet : {step.template.subject}</p>
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

      {/* ─── TAB: EN COURS ───────────────────────────── */}
      {tab === 'active' && (
        <div className="space-y-3">
          {activeRuns.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Play size={48} strokeWidth={1} className="text-neutral-200 mb-3" />
              <p className="text-[16px] font-medium text-neutral-900 mb-1">Aucune séquence en cours</p>
              <p className="text-[13px] text-neutral-500">
                Lancez une séquence depuis la fiche d&apos;un candidat ou client
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-100 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    <th className="text-left px-4 py-3 font-medium text-neutral-500">Séquence</th>
                    <th className="text-left px-4 py-3 font-medium text-neutral-500">Persona</th>
                    <th className="text-left px-4 py-3 font-medium text-neutral-500">Étape</th>
                    <th className="text-left px-4 py-3 font-medium text-neutral-500">Prochaine action</th>
                    <th className="text-left px-4 py-3 font-medium text-neutral-500">Statut</th>
                    <th className="text-right px-4 py-3 font-medium text-neutral-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRuns.map(run => {
                    const isPaused = run.status === 'paused_reply';
                    return (
                      <tr
                        key={run.id}
                        className={`border-b border-neutral-50 transition-colors ${
                          isPaused ? 'bg-revenue-50/30' : 'hover:bg-neutral-50'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isPaused ? (
                              <CheckCircle2 size={16} className="text-revenue-500 shrink-0" />
                            ) : (
                              <Repeat size={14} className="text-brand-400 shrink-0" />
                            )}
                            <span className="font-medium text-neutral-900">{run.sequence.nom}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {run.sequence.persona && (
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-neutral-100 text-neutral-600">
                              {run.sequence.persona}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-neutral-600">
                          Étape {run.currentStep + 1}
                        </td>
                        <td className="px-4 py-3">
                          {run.nextActionAt ? (
                            <span className="flex items-center gap-1 text-neutral-500">
                              <Clock size={11} />
                              {format(new Date(run.nextActionAt), 'dd/MM HH:mm', { locale: fr })}
                            </span>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                            isPaused
                              ? 'bg-revenue-100 text-revenue-600'
                              : 'bg-blue-100 text-blue-600'
                          }`}>
                            {isPaused ? 'Réponse reçue' : 'En cours'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {run.status === 'running' ? (
                              <button
                                onClick={() => pauseRunMutation.mutate(run.id)}
                                className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
                                title="Pause"
                              >
                                <Pause size={14} />
                              </button>
                            ) : (
                              <button
                                onClick={() => resumeRunMutation.mutate(run.id)}
                                className="rounded-md p-1.5 text-revenue-500 hover:bg-revenue-50 transition-colors"
                                title="Reprendre"
                              >
                                <Play size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => cancelRunMutation.mutate(run.id)}
                              className="rounded-md p-1.5 text-neutral-400 hover:bg-danger-50 hover:text-danger-500 transition-colors"
                              title="Annuler"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: TERMINÉES ──────────────────────────── */}
      {tab === 'completed' && (
        <div className="space-y-3">
          {completedRuns.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <CheckCircle2 size={48} strokeWidth={1} className="text-neutral-200 mb-3" />
              <p className="text-[16px] font-medium text-neutral-900 mb-1">Aucune séquence terminée</p>
              <p className="text-[13px] text-neutral-500">
                Les séquences complétées ou annulées apparaîtront ici
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-100 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    <th className="text-left px-4 py-3 font-medium text-neutral-500">Séquence</th>
                    <th className="text-left px-4 py-3 font-medium text-neutral-500">Persona</th>
                    <th className="text-left px-4 py-3 font-medium text-neutral-500">Étapes</th>
                    <th className="text-left px-4 py-3 font-medium text-neutral-500">Début</th>
                    <th className="text-left px-4 py-3 font-medium text-neutral-500">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {completedRuns.map(run => (
                    <tr key={run.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-neutral-900">{run.sequence.nom}</td>
                      <td className="px-4 py-3">
                        {run.sequence.persona && (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-neutral-100 text-neutral-600">
                            {run.sequence.persona}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-600">
                        {run.stepLogs?.length ?? 0} exécutées
                      </td>
                      <td className="px-4 py-3 text-neutral-500">
                        {format(new Date(run.startedAt), 'dd/MM/yyyy', { locale: fr })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          run.status === 'completed' ? 'bg-revenue-100 text-revenue-600' : 'bg-neutral-100 text-neutral-500'
                        }`}>
                          {run.status === 'completed' ? 'Terminée' : 'Annulée'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
