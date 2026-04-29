import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { toast } from '../ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, ArrowRight, Check, X, ChevronDown, Loader2, RefreshCw,
  AlertTriangle, Phone,
} from 'lucide-react';

// ─── TYPES ──────────────────────────────────────────

interface PipelineSuggestion {
  id: string;
  candidatureId: string;
  mandatId: string;
  currentStage: string;
  currentStageLabel: string;
  suggestedStage: string;
  suggestedStageLabel: string;
  confidence: number;
  reasoning: string | null;
  triggerType: 'calendar_event' | 'email' | 'call' | 'inactivity';
  triggerData: Record<string, unknown> | null;
  status: string;
  createdAt: string;
  candidat: {
    id: string;
    nom: string;
    prenom: string | null;
    email: string | null;
    posteActuel: string | null;
  };
  mandat: {
    id: string;
    titrePoste: string;
    entrepriseNom: string;
  };
}

// ─── CONSTANTS ──────────────────────────────────────

const STAGE_OPTIONS = [
  { value: 'SOURCING', label: 'Sourcing' },
  { value: 'CONTACTE', label: 'Contacté' },
  { value: 'ENTRETIEN_1', label: 'Entretien 1' },
  { value: 'ENVOYE_CLIENT', label: 'Envoyé client' },
  { value: 'ENTRETIEN_CLIENT', label: 'Entretien Client' },
  { value: 'OFFRE', label: 'Offre' },
  { value: 'PLACE', label: 'Placé' },
  { value: 'REFUSE', label: 'Refusé' },
];

// ─── COMPONENT ──────────────────────────────────────

export default function PipelineAiSuggestions() {
  const queryClient = useQueryClient();

  // ── Fetch suggestions ──
  const { data: suggestionsRes, isLoading } = useQuery({
    queryKey: ['ai', 'pipeline', 'suggestions'],
    queryFn: () => api.get<{ data: PipelineSuggestion[]; count: number }>('/ai/pipeline/suggestions'),
    refetchInterval: 5 * 60 * 1000,
  });

  const suggestions = suggestionsRes?.data ?? [];

  // ── Apply mutation ──
  const applyMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage?: string }) =>
      api.put(`/ai/pipeline/suggestions/${id}/apply`, { stage }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'pipeline', 'suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['candidatures'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast('success', 'Mouvement pipeline applique');
    },
    onError: () => {
      toast('error', "Erreur lors de l'application du mouvement");
    },
  });

  // ── Dismiss mutation ──
  const dismissMutation = useMutation({
    mutationFn: (id: string) => api.put(`/ai/pipeline/suggestions/${id}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'pipeline', 'suggestions'] });
    },
    onError: () => {
      toast('error', 'Erreur lors du rejet');
    },
  });

  // ── Trigger analysis mutation ──
  const analyzeMutation = useMutation({
    mutationFn: () => api.post('/ai/pipeline/analyze'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'pipeline', 'suggestions'] });
      toast('success', 'Analyse pipeline lancee');
    },
    onError: () => {
      toast('error', "Erreur lors de l'analyse pipeline");
    },
  });

  // ── Don't render if no suggestions and not loading ──
  if (!isLoading && suggestions.length === 0) return null;
  if (isLoading) return null;

  const dormantCount = suggestions.filter((s) => s.triggerType === 'inactivity').length;
  const moveCount = suggestions.length - dormantCount;

  return (
    <div className="px-6 shrink-0 mt-1.5">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="rounded-2xl bg-white shadow-[0_1px_6px_rgba(59,130,246,0.10)] border border-blue-100/60 overflow-hidden"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-blue-50">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
              <Bot size={15} className="text-white" />
            </div>
            <span className="text-[13px] font-semibold text-neutral-800">
              {suggestions.length} mouvement{suggestions.length > 1 ? 's' : ''} pipeline suggere{suggestions.length > 1 ? 's' : ''}
            </span>
          </div>

          <button
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
            title="Relancer l'analyse"
          >
            <RefreshCw size={12} className={analyzeMutation.isPending ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* ── Suggestion list ── */}
        <div className="divide-y divide-neutral-50">
          <AnimatePresence mode="popLayout">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onApply={(stage) => applyMutation.mutate({ id: suggestion.id, stage })}
                onDismiss={() => dismissMutation.mutate(suggestion.id)}
                isApplying={applyMutation.isPending && applyMutation.variables?.id === suggestion.id}
                isDismissing={dismissMutation.isPending && dismissMutation.variables === suggestion.id}
              />
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

// ─── SUGGESTION CARD ────────────────────────────────

interface SuggestionCardProps {
  suggestion: PipelineSuggestion;
  onApply: (stage?: string) => void;
  onDismiss: () => void;
  isApplying: boolean;
  isDismissing: boolean;
}

function SuggestionCard({
  suggestion,
  onApply,
  onDismiss,
  isApplying,
  isDismissing,
}: SuggestionCardProps) {
  const [stageDropdownOpen, setStageDropdownOpen] = useState(false);

  const isDormant = suggestion.triggerType === 'inactivity';
  const candidatName = [suggestion.candidat.prenom, suggestion.candidat.nom].filter(Boolean).join(' ');

  // Filter stage options for "Autre etape" dropdown: only stages AFTER current stage
  const currentStageIdx = STAGE_OPTIONS.findIndex((s) => s.value === suggestion.currentStage);
  const availableStages = STAGE_OPTIONS.filter((s, idx) => {
    if (s.value === suggestion.suggestedStage) return false;
    if (s.value === 'REFUSE') return true;
    return idx > currentStageIdx;
  });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="overflow-hidden"
    >
      <div className={`px-4 py-3 transition-colors ${isDormant ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-blue-25/50'}`}>
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 mt-0.5 ${
            isDormant ? 'bg-amber-100' : 'bg-blue-50'
          }`}>
            {isDormant ? (
              <AlertTriangle size={15} className="text-amber-600" />
            ) : (
              <ArrowRight size={15} className="text-blue-600" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Name + stage move */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {isDormant ? (
                <span className="text-[13px] font-semibold text-neutral-800">
                  {candidatName}
                  <span className="text-amber-600 font-medium ml-1.5">
                    &mdash; dormant {suggestion.triggerData && typeof suggestion.triggerData === 'object' && 'daysSinceActivity' in suggestion.triggerData
                      ? `${(suggestion.triggerData as any).daysSinceActivity}j`
                      : '14j+'}
                  </span>
                </span>
              ) : (
                <span className="text-[13px] font-semibold text-neutral-800">
                  {candidatName}
                  <span className="text-blue-600 font-medium ml-1.5">
                    &rarr; {suggestion.suggestedStageLabel}
                  </span>
                  <span className="text-neutral-400 font-normal text-[12px] ml-1.5">
                    (etait : {suggestion.currentStageLabel})
                  </span>
                </span>
              )}
            </div>

            {/* Mandat info */}
            <div className="text-[12px] text-neutral-500 mt-0.5">
              {suggestion.mandat.titrePoste} &mdash; {suggestion.mandat.entrepriseNom}
            </div>

            {/* Reasoning */}
            {suggestion.reasoning && (
              <div className={`text-[11px] mt-1 italic ${isDormant ? 'text-amber-600' : 'text-blue-500'}`}>
                Raison : {suggestion.reasoning}
              </div>
            )}

            {/* Confidence badge */}
            <div className="mt-1.5 flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                isDormant
                  ? 'bg-amber-100 text-amber-700'
                  : suggestion.confidence >= 0.7
                  ? 'bg-green-100 text-green-700'
                  : suggestion.confidence >= 0.5
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-neutral-100 text-neutral-600'
              }`}>
                {Math.round(suggestion.confidence * 100)}% confiance
              </span>
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                isDormant
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-blue-50 text-blue-600'
              }`}>
                {suggestion.triggerType === 'calendar_event' && 'Calendrier'}
                {suggestion.triggerType === 'email' && 'Email'}
                {suggestion.triggerType === 'call' && 'Appel'}
                {suggestion.triggerType === 'inactivity' && 'Inactivite'}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            {isDormant ? (
              <>
                {/* Relancer */}
                <button
                  onClick={() => onDismiss()}
                  disabled={isApplying || isDismissing}
                  className="flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-600 transition-colors disabled:opacity-50 shadow-sm"
                  title="Ignorer (garder dans le pipe)"
                >
                  <Phone size={12} />
                  Relancer
                </button>
                {/* Retirer du pipe */}
                <button
                  onClick={() => onApply('REFUSE')}
                  disabled={isApplying || isDismissing}
                  className="flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                  title="Retirer du pipeline"
                >
                  {isApplying ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <X size={12} />
                  )}
                  Retirer du pipe
                </button>
              </>
            ) : (
              <>
                {/* Appliquer */}
                <button
                  onClick={() => onApply()}
                  disabled={isApplying || isDismissing}
                  className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
                  title="Appliquer le mouvement"
                >
                  {isApplying ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Check size={12} />
                  )}
                  Appliquer
                </button>

                {/* Autre etape dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setStageDropdownOpen(!stageDropdownOpen)}
                    disabled={isApplying || isDismissing}
                    className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 transition-colors disabled:opacity-50"
                    title="Choisir une autre etape"
                  >
                    Autre etape
                    <ChevronDown size={11} className={`transition-transform ${stageDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {stageDropdownOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-1 z-20 w-40 rounded-lg bg-white border border-neutral-200 shadow-lg overflow-hidden"
                      >
                        {availableStages.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => {
                              onApply(opt.value);
                              setStageDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-neutral-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}

            {/* Ignorer */}
            <button
              onClick={onDismiss}
              disabled={isApplying || isDismissing}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors disabled:opacity-50"
              title="Ignorer"
            >
              {isDismissing ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <X size={11} />
              )}
              Ignorer
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
