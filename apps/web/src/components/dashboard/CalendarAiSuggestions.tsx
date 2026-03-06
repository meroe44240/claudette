import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { toast } from '../ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, User, Building2, Check, X, Edit2, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

// ─── TYPES ──────────────────────────────────────────

interface AiCalendarSuggestion {
  id: string;
  calendarEventId: string;
  eventTitle: string;
  eventDate: string;
  suggestionType: 'candidate' | 'client' | 'company';
  suggestedData: {
    email?: string;
    suggested_name?: string;
    suggested_first_name?: string;
    suggested_last_name?: string;
    suggested_type?: string;
    suggested_company?: string;
    domain?: string;
  };
  confidence: number;
  reasoning: string;
  status: string;
}

type FilterType = 'all' | 'candidate' | 'client' | 'company';

// ─── CONSTANTS ──────────────────────────────────────

const TYPE_CONFIG: Record<AiCalendarSuggestion['suggestionType'], {
  icon: typeof User;
  label: string;
  createLabel: string;
  color: string;
  bg: string;
  pill: string;
}> = {
  candidate: {
    icon: User,
    label: 'Candidat',
    createLabel: 'Creer comme candidat',
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    pill: 'bg-violet-100 text-violet-700',
  },
  client: {
    icon: User,
    label: 'Client',
    createLabel: 'Creer comme client',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    pill: 'bg-blue-100 text-blue-700',
  },
  company: {
    icon: Building2,
    label: 'Entreprise',
    createLabel: "Creer l'entreprise + le contact",
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    pill: 'bg-emerald-100 text-emerald-700',
  },
};

const FILTER_OPTIONS: Array<{ value: FilterType; label: string }> = [
  { value: 'all', label: 'Tout' },
  { value: 'candidate', label: 'Candidats' },
  { value: 'client', label: 'Clients' },
  { value: 'company', label: 'Entreprises' },
];

// ─── COMPONENT ──────────────────────────────────────

export default function CalendarAiSuggestions() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterType>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // ── Fetch suggestions ──
  const { data: suggestionsRes, isLoading } = useQuery({
    queryKey: ['ai', 'calendar', 'suggestions'],
    queryFn: () => api.get<{ data: AiCalendarSuggestion[] }>('/ai/calendar/suggestions'),
    refetchInterval: 5 * 60 * 1000, // refetch every 5 min
  });

  const suggestions = suggestionsRes?.data ?? [];
  const pendingSuggestions = suggestions.filter(s => s.status === 'pending');
  const filtered = filter === 'all'
    ? pendingSuggestions
    : pendingSuggestions.filter(s => s.suggestionType === filter);

  // ── Accept mutation ──
  const acceptMutation = useMutation({
    mutationFn: ({ id, modifications }: { id: string; modifications?: Record<string, unknown> }) =>
      api.put(`/ai/calendar/suggestions/${id}/accept`, { modifications }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'calendar', 'suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['candidats'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['entreprises'] });
      toast('success', 'Contact cree avec succes');
    },
    onError: () => {
      toast('error', 'Erreur lors de la creation du contact');
    },
  });

  // ── Dismiss mutation ──
  const dismissMutation = useMutation({
    mutationFn: (id: string) => api.put(`/ai/calendar/suggestions/${id}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'calendar', 'suggestions'] });
    },
    onError: () => {
      toast('error', 'Erreur lors du rejet');
    },
  });

  // ── Trigger analysis mutation ──
  const analyzeMutation = useMutation({
    mutationFn: () => api.post('/ai/calendar/analyze'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'calendar', 'suggestions'] });
      toast('success', 'Analyse du calendrier lancee');
    },
    onError: () => {
      toast('error', "Erreur lors de l'analyse");
    },
  });

  // ── Don't render if no suggestions and not loading ──
  if (!isLoading && pendingSuggestions.length === 0) return null;

  // ── Loading state ──
  if (isLoading) return null;

  return (
    <div className="px-6 shrink-0 mt-1.5">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        className="rounded-2xl bg-white shadow-[0_1px_6px_rgba(124,92,252,0.10)] border border-violet-100/60 overflow-hidden"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-violet-50">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-sm">
              <Bot size={15} className="text-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-neutral-800">
                {pendingSuggestions.length} contact{pendingSuggestions.length > 1 ? 's' : ''} detecte{pendingSuggestions.length > 1 ? 's' : ''} dans votre agenda
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Refresh button */}
            <button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-50"
              title="Relancer l'analyse"
            >
              <RefreshCw size={12} className={analyzeMutation.isPending ? 'animate-spin' : ''} />
            </button>

            {/* Filter dropdown */}
            <div className="relative">
              <button
                onClick={() => setFilterOpen(!filterOpen)}
                className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
              >
                {FILTER_OPTIONS.find(f => f.value === filter)?.label}
                <ChevronDown size={11} className={`transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {filterOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 z-20 w-32 rounded-lg bg-white border border-neutral-200 shadow-lg overflow-hidden"
                  >
                    {FILTER_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { setFilter(opt.value); setFilterOpen(false); }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] font-medium transition-colors ${
                          filter === opt.value
                            ? 'bg-violet-50 text-violet-700'
                            : 'text-neutral-600 hover:bg-neutral-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* ── Suggestion list ── */}
        <div className="divide-y divide-neutral-50">
          <AnimatePresence mode="popLayout">
            {filtered.map(suggestion => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                isEditing={editingId === suggestion.id}
                onEdit={() => setEditingId(editingId === suggestion.id ? null : suggestion.id)}
                onAccept={(modifications) => {
                  acceptMutation.mutate({ id: suggestion.id, modifications });
                  setEditingId(null);
                }}
                onDismiss={() => dismissMutation.mutate(suggestion.id)}
                isAccepting={acceptMutation.isPending && acceptMutation.variables?.id === suggestion.id}
                isDismissing={dismissMutation.isPending && dismissMutation.variables === suggestion.id}
              />
            ))}
          </AnimatePresence>

          {filtered.length === 0 && pendingSuggestions.length > 0 && (
            <div className="px-4 py-3 text-[12px] text-neutral-400 text-center">
              Aucune suggestion pour ce filtre
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── SUGGESTION CARD ────────────────────────────────

interface SuggestionCardProps {
  suggestion: AiCalendarSuggestion;
  isEditing: boolean;
  onEdit: () => void;
  onAccept: (modifications?: Record<string, unknown>) => void;
  onDismiss: () => void;
  isAccepting: boolean;
  isDismissing: boolean;
}

function SuggestionCard({
  suggestion,
  isEditing,
  onEdit,
  onAccept,
  onDismiss,
  isAccepting,
  isDismissing,
}: SuggestionCardProps) {
  const config = TYPE_CONFIG[suggestion.suggestionType];
  const Icon = config.icon;
  const { suggestedData } = suggestion;

  // ── Edit form state ──
  const [editFirstName, setEditFirstName] = useState(suggestedData.suggested_first_name ?? '');
  const [editLastName, setEditLastName] = useState(suggestedData.suggested_last_name ?? '');
  const [editEmail, setEditEmail] = useState(suggestedData.email ?? '');
  const [editType, setEditType] = useState<string>(suggestion.suggestionType);
  const [editCompany, setEditCompany] = useState(suggestedData.suggested_company ?? '');

  const displayName = suggestedData.suggested_name
    || [suggestedData.suggested_first_name, suggestedData.suggested_last_name].filter(Boolean).join(' ')
    || suggestedData.email
    || 'Contact inconnu';

  const eventDateFormatted = (() => {
    try {
      return format(new Date(suggestion.eventDate), "d MMM yyyy", { locale: fr });
    } catch {
      return suggestion.eventDate;
    }
  })();

  const confidencePercent = Math.round(suggestion.confidence * 100);

  const handleAcceptWithModifications = () => {
    const modifications: Record<string, unknown> = {};
    if (editFirstName !== (suggestedData.suggested_first_name ?? '')) modifications.suggested_first_name = editFirstName;
    if (editLastName !== (suggestedData.suggested_last_name ?? '')) modifications.suggested_last_name = editLastName;
    if (editEmail !== (suggestedData.email ?? '')) modifications.email = editEmail;
    if (editType !== suggestion.suggestionType) modifications.suggestionType = editType;
    if (editCompany !== (suggestedData.suggested_company ?? '')) modifications.suggested_company = editCompany;
    onAccept(Object.keys(modifications).length > 0 ? modifications : undefined);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="overflow-hidden"
    >
      <div className="px-4 py-3 hover:bg-violet-25/50 transition-colors">
        {/* Main row */}
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 mt-0.5 ${config.bg}`}>
            <Icon size={15} className={config.color} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Name + email line */}
            <div className="flex items-center gap-2 flex-wrap">
              {suggestion.suggestionType === 'company' && suggestedData.domain ? (
                <span className="text-[13px] font-semibold text-neutral-800">
                  {suggestedData.suggested_company || suggestedData.domain}
                  <span className="text-neutral-400 font-normal ml-1">({suggestedData.domain})</span>
                  <span className="text-neutral-400 font-normal ml-1">&mdash; nouvelle entreprise</span>
                </span>
              ) : (
                <span className="text-[13px] font-semibold text-neutral-800">
                  {displayName}
                  {suggestedData.email && displayName !== suggestedData.email && (
                    <span className="text-neutral-400 font-normal ml-1.5 text-[12px]">
                      {suggestedData.email}
                    </span>
                  )}
                </span>
              )}
              {/* Confidence badge */}
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${config.pill}`}>
                {config.label} {confidencePercent}%
              </span>
            </div>

            {/* Sub-line: company contact for company type */}
            {suggestion.suggestionType === 'company' && suggestedData.suggested_name && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <User size={11} className="text-neutral-400" />
                <span className="text-[12px] text-neutral-600">
                  {suggestedData.suggested_name}
                  {suggestedData.email && (
                    <span className="text-neutral-400 ml-1">{suggestedData.email}</span>
                  )}
                </span>
              </div>
            )}

            {/* Event source line */}
            <div className="text-[11px] text-neutral-400 mt-1">
              Detecte dans : &laquo;{suggestion.eventTitle}&raquo;
              <span className="ml-1">({eventDateFormatted})</span>
            </div>

            {/* Reasoning */}
            {suggestion.reasoning && (
              <div className="text-[11px] text-violet-500 mt-0.5 italic">
                {suggestion.reasoning}
              </div>
            )}

            {/* Action arrow */}
            <div className="text-[11px] font-medium text-violet-600 mt-1">
              &rarr; {config.createLabel}
            </div>

            {/* ── Inline edit form ── */}
            <AnimatePresence>
              {isEditing && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 p-3 rounded-xl bg-neutral-50 border border-neutral-100 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block mb-0.5">
                          Prenom
                        </label>
                        <input
                          type="text"
                          value={editFirstName}
                          onChange={e => setEditFirstName(e.target.value)}
                          className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[12px] text-neutral-800 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300"
                          placeholder="Prenom"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block mb-0.5">
                          Nom
                        </label>
                        <input
                          type="text"
                          value={editLastName}
                          onChange={e => setEditLastName(e.target.value)}
                          className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[12px] text-neutral-800 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300"
                          placeholder="Nom"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block mb-0.5">
                        Email
                      </label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={e => setEditEmail(e.target.value)}
                        className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[12px] text-neutral-800 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300"
                        placeholder="email@example.com"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block mb-0.5">
                          Type
                        </label>
                        <select
                          value={editType}
                          onChange={e => setEditType(e.target.value)}
                          className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[12px] text-neutral-800 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300 appearance-none bg-white"
                        >
                          <option value="candidate">Candidat</option>
                          <option value="client">Client</option>
                          <option value="company">Entreprise</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 block mb-0.5">
                          Entreprise
                        </label>
                        <input
                          type="text"
                          value={editCompany}
                          onChange={e => setEditCompany(e.target.value)}
                          className="w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[12px] text-neutral-800 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300"
                          placeholder="Nom de l'entreprise"
                        />
                      </div>
                    </div>
                    {/* Save with modifications */}
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={handleAcceptWithModifications}
                        disabled={isAccepting}
                        className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
                      >
                        {isAccepting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Creer avec modifications
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            {/* Accept */}
            <button
              onClick={() => onAccept()}
              disabled={isAccepting || isDismissing}
              className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-50 shadow-sm"
              title={suggestion.suggestionType === 'company' ? 'Creer tout' : 'Creer'}
            >
              {isAccepting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Check size={12} />
              )}
              {suggestion.suggestionType === 'company' ? 'Creer tout' : 'Creer'}
            </button>

            {/* Edit */}
            <button
              onClick={onEdit}
              disabled={isAccepting || isDismissing}
              className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                isEditing
                  ? 'bg-violet-100 text-violet-700'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
              title="Modifier"
            >
              <Edit2 size={11} />
              Modifier
            </button>

            {/* Dismiss */}
            <button
              onClick={onDismiss}
              disabled={isAccepting || isDismissing}
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
