import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { toast } from '../ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarSync, User, Building2, Loader2, RefreshCw, Check, Users, X } from 'lucide-react';

// ─── TYPES ──────────────────────────────────────────

interface AnalyzeResult {
  status: string;
  analyzed: number;
  candidats: number;
  clients: number;
  entreprises: number;
  message: string;
}

interface LegacySuggestion {
  id: string;
  status: string;
}

// ─── COMPONENT ──────────────────────────────────────

export default function CalendarAiSuggestions() {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<AnalyzeResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  // ── Check for legacy pending suggestions (backward compat) ──
  const { data: legacyRes } = useQuery({
    queryKey: ['ai', 'calendar', 'suggestions'],
    queryFn: () => api.get<{ data: LegacySuggestion[]; count: number }>('/ai/calendar/suggestions'),
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  });

  const pendingLegacy = (legacyRes?.data ?? []).filter(s => s.status === 'pending');

  // ── Auto-accept all legacy pending suggestions ──
  const acceptAllMutation = useMutation({
    mutationFn: async () => {
      const results = [];
      for (const s of pendingLegacy) {
        try {
          const res = await api.put(`/ai/calendar/suggestions/${s.id}/accept`);
          results.push(res);
        } catch {
          // Try to dismiss if accept fails
          try { await api.put(`/ai/calendar/suggestions/${s.id}/dismiss`); } catch {}
        }
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai', 'calendar', 'suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['candidats'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['entreprises'] });
      toast('success', `${pendingLegacy.length} suggestion(s) traitee(s) automatiquement`);
    },
    onError: () => {
      toast('error', 'Erreur lors du traitement des suggestions');
    },
  });

  // ── Trigger calendar auto-create ──
  const analyzeMutation = useMutation({
    mutationFn: () => api.post<AnalyzeResult>('/ai/calendar/analyze'),
    onSuccess: (data: any) => {
      const result = data as AnalyzeResult;
      setLastResult(result);
      setShowResult(true);
      queryClient.invalidateQueries({ queryKey: ['candidats'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['entreprises'] });
      const total = (result.candidats || 0) + (result.clients || 0);
      if (total > 0) {
        toast('success', `${result.candidats} candidat(s), ${result.clients} client(s), ${result.entreprises} entreprise(s) crees`);
      } else {
        toast('success', `${result.analyzed} evenements analyses. Aucun nouveau contact.`);
      }
    },
    onError: () => {
      toast('error', "Erreur lors de l'analyse du calendrier");
    },
  });

  // ── If there are legacy pending suggestions, show a banner to auto-accept them ──
  if (pendingLegacy.length > 0) {
    return (
      <div className="px-6 shrink-0 mt-1.5">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className="rounded-2xl bg-white shadow-[0_1px_6px_rgba(124,92,252,0.10)] border border-violet-100/60 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-sm">
                <CalendarSync size={15} className="text-white" />
              </div>
              <div>
                <span className="text-[13px] font-semibold text-neutral-800">
                  {pendingLegacy.length} suggestion{pendingLegacy.length > 1 ? 's' : ''} en attente
                </span>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Les contacts sont maintenant crees automatiquement. Voulez-vous accepter les anciennes suggestions ?
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => acceptAllMutation.mutate()}
                disabled={acceptAllMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-50 shadow-sm"
              >
                {acceptAllMutation.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Check size={12} />
                )}
                Accepter tout
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── No legacy suggestions: don't render anything by default ──
  // The calendar auto-create runs via cron every 30 min.
  // This component only appears briefly if there are old legacy suggestions.
  return null;
}
