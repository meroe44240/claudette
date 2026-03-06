import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  Quote,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Skeleton from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';

// ─── Types ──────────────────────────────────────────

interface ActionItem {
  title: string;
  priority: 'high' | 'medium' | 'low';
  deadline_hint: string | null;
}

interface InfoUpdate {
  field: string;
  label: string;
  current_value: string | null;
  suggested_value: string;
  source_quote: string;
}

interface KeyQuote {
  quote: string;
  context: string;
}

interface SummaryJson {
  summary: string[];
  sentiment: 'positive_interested' | 'positive_cautious' | 'neutral' | 'hesitant' | 'negative_not_interested';
  sentiment_detail: string;
  action_items: ActionItem[];
  info_updates: InfoUpdate[];
  key_quotes: KeyQuote[];
}

interface AiCallSummary {
  id: string;
  activiteId: string;
  entityType: string;
  entityId: string;
  userId: string;
  summaryJson: SummaryJson;
  actionsAccepted: number[];
  updatesApplied: number[];
  createdAt: string;
}

interface AiCallSummaryEncartProps {
  activiteId: string;
  entiteType: string;
  entiteId: string;
}

// ─── Sentiment Config ───────────────────────────────

const sentimentConfig: Record<string, { emoji: string; label: string; colorClass: string; bgClass: string; borderClass: string }> = {
  positive_interested: {
    emoji: '\u{1F60A}',
    label: 'Interesse',
    colorClass: 'text-emerald-700',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
  },
  positive_cautious: {
    emoji: '\u{1F642}',
    label: 'Prudemment positif',
    colorClass: 'text-lime-700',
    bgClass: 'bg-lime-50',
    borderClass: 'border-lime-200',
  },
  neutral: {
    emoji: '\u{1F610}',
    label: 'Neutre',
    colorClass: 'text-amber-700',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
  },
  hesitant: {
    emoji: '\u{1F615}',
    label: 'Hesitant',
    colorClass: 'text-orange-700',
    bgClass: 'bg-orange-50',
    borderClass: 'border-orange-200',
  },
  negative_not_interested: {
    emoji: '\u{1F61E}',
    label: 'Pas interesse',
    colorClass: 'text-red-700',
    bgClass: 'bg-red-50',
    borderClass: 'border-red-200',
  },
};

// ─── Priority Config ────────────────────────────────

const priorityConfig: Record<string, { variant: 'error' | 'warning' | 'default'; label: string }> = {
  high: { variant: 'error', label: 'Haute' },
  medium: { variant: 'warning', label: 'Moyenne' },
  low: { variant: 'default', label: 'Basse' },
};

// ─── Component ──────────────────────────────────────

export default function AiCallSummaryEncart({ activiteId, entiteType, entiteId }: AiCallSummaryEncartProps) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedUpdates, setSelectedUpdates] = useState<number[]>([]);

  // ── Fetch existing summary ──
  const { data: summaryResponse, isLoading, isError } = useQuery({
    queryKey: ['ai-call-summary', activiteId],
    queryFn: () => api.get<{ data: AiCallSummary | null }>(`/ai/call-summary/${activiteId}`),
  });

  const summary = summaryResponse?.data ?? null;
  const summaryJson = summary?.summaryJson;
  const actionsAccepted = summary?.actionsAccepted ?? [];
  const updatesApplied = summary?.updatesApplied ?? [];

  // ── Generate summary mutation ──
  const generateMutation = useMutation({
    mutationFn: () => api.post<{ data: AiCallSummary }>('/ai/call-summary', { activiteId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-call-summary', activiteId] });
      setIsExpanded(true);
      toast('success', 'Resume IA genere avec succes');
    },
    onError: (error: any) => {
      const message = error?.data?.message || error?.message || 'Erreur lors de la generation du resume';
      toast('error', message);
    },
  });

  // ── Accept action mutation ──
  const acceptActionMutation = useMutation({
    mutationFn: (actionIndex: number) =>
      api.post(`/ai/call-summary/${summary!.id}/accept-action`, { actionIndex }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-call-summary', activiteId] });
      queryClient.invalidateQueries({ queryKey: ['activites'] });
      toast('success', 'Tache creee avec succes');
    },
    onError: () => {
      toast('error', 'Erreur lors de la creation de la tache');
    },
  });

  // ── Apply updates mutation ──
  const applyUpdatesMutation = useMutation({
    mutationFn: (updateIndices: number[]) =>
      api.post(`/ai/call-summary/${summary!.id}/apply-updates`, { updateIndices }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-call-summary', activiteId] });
      setSelectedUpdates([]);
      toast('success', 'Fiche mise a jour avec succes');
    },
    onError: () => {
      toast('error', 'Erreur lors de la mise a jour');
    },
  });

  // ── Toggle update selection ──
  function toggleUpdateSelection(index: number) {
    setSelectedUpdates((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  }

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="mt-2 ml-[56px] rounded-xl bg-white/60 px-4 py-3 shadow-sm">
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  // ── Error state ──
  if (isError) {
    return null;
  }

  // ── No summary exists yet → show generate button ──
  if (!summary) {
    return (
      <div className="mt-2 ml-[56px]">
        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200/60 px-4 py-2.5 text-[13px] font-medium text-violet-700 hover:from-violet-100 hover:to-indigo-100 hover:border-violet-300 transition-all duration-200 disabled:opacity-60"
        >
          {generateMutation.isPending ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              <span>Analyse en cours...</span>
            </>
          ) : (
            <>
              <Bot size={15} />
              <span>Generer le resume IA</span>
            </>
          )}
        </button>
      </div>
    );
  }

  // ── Summary exists → render encart ──
  if (!summaryJson) return null;

  const sentiment = sentimentConfig[summaryJson.sentiment] ?? sentimentConfig.neutral;

  return (
    <div className="mt-2 ml-[56px]">
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between rounded-xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200/60 px-4 py-2.5 text-left hover:from-violet-100 hover:to-indigo-100 transition-all duration-200"
      >
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-violet-600" />
          <span className="text-[13px] font-semibold text-violet-800">
            Resume IA
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${sentiment.bgClass} ${sentiment.colorClass} border ${sentiment.borderClass}`}>
            {sentiment.emoji} {sentiment.label}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp size={16} className="text-violet-500" />
        ) : (
          <ChevronDown size={16} className="text-violet-500" />
        )}
      </button>

      {/* Expandable content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="rounded-b-xl border border-t-0 border-violet-200/60 bg-white px-4 py-4 space-y-4">
              {/* Sentiment detail */}
              {summaryJson.sentiment_detail && (
                <p className="text-[13px] italic text-neutral-500">
                  {sentiment.emoji} &laquo;{summaryJson.sentiment_detail}&raquo;
                </p>
              )}

              {/* Summary bullets */}
              {summaryJson.summary && summaryJson.summary.length > 0 && (
                <ul className="space-y-1.5">
                  {summaryJson.summary.map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-[13px] text-neutral-700">
                      <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-400" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Action items */}
              {summaryJson.action_items && summaryJson.action_items.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
                    <Sparkles size={13} />
                    Actions suggerees
                  </h4>
                  <div className="space-y-2">
                    {summaryJson.action_items.map((action, idx) => {
                      const isAccepted = actionsAccepted.includes(idx);
                      const prio = priorityConfig[action.priority] ?? priorityConfig.medium;

                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                            isAccepted
                              ? 'border-emerald-200 bg-emerald-50/50'
                              : 'border-neutral-200 bg-neutral-50/50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {isAccepted ? (
                              <CheckCircle2 size={16} className="flex-shrink-0 text-emerald-500" />
                            ) : (
                              <div className="flex-shrink-0 h-4 w-4 rounded-full border-2 border-neutral-300" />
                            )}
                            <span className={`text-[13px] ${isAccepted ? 'text-neutral-500 line-through' : 'text-neutral-700'}`}>
                              {action.title}
                            </span>
                            <Badge variant={prio.variant} size="sm">
                              {prio.label}
                            </Badge>
                            {action.deadline_hint && (
                              <span className="text-[11px] text-neutral-400 flex-shrink-0">
                                {action.deadline_hint}
                              </span>
                            )}
                          </div>
                          {!isAccepted && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => acceptActionMutation.mutate(idx)}
                              disabled={acceptActionMutation.isPending}
                              className="flex-shrink-0 ml-2 text-violet-600 hover:text-violet-800 hover:bg-violet-50"
                            >
                              {acceptActionMutation.isPending ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                'Accepter'
                              )}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Info updates */}
              {summaryJson.info_updates && summaryJson.info_updates.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
                    <AlertCircle size={13} />
                    Mettre a jour la fiche
                  </h4>
                  <div className="space-y-2">
                    {summaryJson.info_updates.map((update, idx) => {
                      const isApplied = updatesApplied.includes(idx);
                      const isSelected = selectedUpdates.includes(idx);

                      return (
                        <label
                          key={idx}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                            isApplied
                              ? 'border-emerald-200 bg-emerald-50/50 cursor-default'
                              : isSelected
                                ? 'border-violet-300 bg-violet-50/50'
                                : 'border-neutral-200 bg-neutral-50/50 hover:bg-neutral-100/50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isApplied || isSelected}
                            disabled={isApplied}
                            onChange={() => !isApplied && toggleUpdateSelection(idx)}
                            className="h-4 w-4 rounded border-neutral-300 text-violet-600 focus:ring-violet-500 disabled:opacity-50"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-[13px] font-medium text-neutral-700">
                              {update.label}
                            </span>
                            <span className="mx-1.5 text-[12px] text-neutral-400">:</span>
                            {update.current_value && (
                              <>
                                <span className="text-[12px] text-neutral-400 line-through">
                                  {update.current_value}
                                </span>
                                <span className="mx-1 text-neutral-300">&rarr;</span>
                              </>
                            )}
                            {!update.current_value && (
                              <>
                                <span className="text-[12px] text-neutral-400">&mdash;</span>
                                <span className="mx-1 text-neutral-300">&rarr;</span>
                              </>
                            )}
                            <span className={`text-[12px] font-medium ${isApplied ? 'text-emerald-600' : 'text-violet-700'}`}>
                              {update.suggested_value}
                            </span>
                          </div>
                          {isApplied && (
                            <CheckCircle2 size={14} className="flex-shrink-0 text-emerald-500" />
                          )}
                        </label>
                      );
                    })}
                  </div>

                  {/* Apply button */}
                  {summaryJson.info_updates.some((_, idx) => !updatesApplied.includes(idx)) && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => applyUpdatesMutation.mutate(selectedUpdates)}
                        disabled={selectedUpdates.length === 0 || applyUpdatesMutation.isPending}
                        loading={applyUpdatesMutation.isPending}
                      >
                        Appliquer les mises a jour ({selectedUpdates.length})
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Key quotes */}
              {summaryJson.key_quotes && summaryJson.key_quotes.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
                    <Quote size={13} />
                    Citations cles
                  </h4>
                  <div className="space-y-2">
                    {summaryJson.key_quotes.map((kq, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-neutral-100 bg-neutral-50/50 px-3 py-2"
                      >
                        <p className="text-[13px] italic text-neutral-600">
                          &laquo;{kq.quote}&raquo;
                        </p>
                        <p className="mt-1 text-[11px] text-neutral-400">
                          {kq.context}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
