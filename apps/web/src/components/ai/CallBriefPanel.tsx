import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Globe, Target, AlertTriangle, Copy, RefreshCw, X,
  ChevronDown, ChevronRight, User, Clock, Newspaper, Briefcase,
  MessageSquare, Sparkles,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from '../ui/Toast';

// ─── TYPES ──────────────────────────────────────────

interface CallBriefPanelProps {
  entityType: 'CANDIDAT' | 'CLIENT';
  entityId: string;
  entityName: string;
  calendarEventId?: string;
  onClose: () => void;
  isOpen: boolean;
}

interface CompanyNews {
  headline: string;
  summary: string;
  relevance: string;
  source: string;
  date: string;
}

interface TalkingPoint {
  topic: string;
  context: string;
  suggested_angle: string;
}

interface BriefData {
  contact_snapshot: {
    name: string;
    title: string;
    company: string;
    relationship_status: string;
    last_interaction: string;
    key_info: string[];
  };
  what_happened_since_last_contact: string[];
  web_intelligence: {
    company_news: CompanyNews[];
    hiring_signals: string[];
    contact_activity: string[];
  };
  talking_points: TalkingPoint[];
  risks_and_warnings: string[];
  objective_suggestion: string;
}

interface BriefResponse {
  data: {
    id: string;
    entityType: string;
    entityId: string;
    briefJson: BriefData;
    generatedAt: string;
    expiresAt: string;
    cached: boolean;
  };
}

// ─── COLLAPSIBLE SECTION ────────────────────────────

function CollapsibleSection({
  title,
  icon: Icon,
  iconColor = 'text-neutral-500',
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ComponentType<any>;
  iconColor?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-neutral-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-neutral-25 transition-colors"
      >
        <Icon size={15} className={iconColor} />
        <span className="text-[13px] font-semibold text-neutral-800 uppercase tracking-wide flex-1">
          {title}
        </span>
        {isOpen ? (
          <ChevronDown size={14} className="text-neutral-400" />
        ) : (
          <ChevronRight size={14} className="text-neutral-400" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── SKELETON LOADER ────────────────────────────────

function BriefSkeleton() {
  return (
    <div className="space-y-4 p-5">
      {/* Contact snapshot skeleton */}
      <div className="border border-neutral-100 rounded-xl p-4 space-y-3">
        <div className="h-4 w-32 rounded skeleton-shimmer" />
        <div className="space-y-2">
          <div className="h-3 w-3/4 rounded skeleton-shimmer" />
          <div className="h-3 w-1/2 rounded skeleton-shimmer" />
          <div className="h-3 w-2/3 rounded skeleton-shimmer" />
        </div>
      </div>
      {/* Events skeleton */}
      <div className="border border-neutral-100 rounded-xl p-4 space-y-2">
        <div className="h-4 w-48 rounded skeleton-shimmer" />
        <div className="h-3 w-full rounded skeleton-shimmer" />
        <div className="h-3 w-5/6 rounded skeleton-shimmer" />
      </div>
      {/* Web intel skeleton */}
      <div className="border border-neutral-100 rounded-xl p-4 space-y-2">
        <div className="h-4 w-40 rounded skeleton-shimmer" />
        <div className="h-3 w-full rounded skeleton-shimmer" />
        <div className="h-3 w-3/4 rounded skeleton-shimmer" />
        <div className="h-3 w-5/6 rounded skeleton-shimmer" />
      </div>
      {/* Talking points skeleton */}
      <div className="border border-neutral-100 rounded-xl p-4 space-y-2">
        <div className="h-4 w-36 rounded skeleton-shimmer" />
        <div className="h-3 w-full rounded skeleton-shimmer" />
        <div className="h-3 w-2/3 rounded skeleton-shimmer" />
      </div>
    </div>
  );
}

// ─── FORMAT BRIEF AS TEXT ───────────────────────────

function formatBriefAsText(brief: BriefData, entityName: string): string {
  const lines: string[] = [];

  lines.push(`BRIEF PRE-APPEL - ${entityName}`);
  lines.push('='.repeat(50));
  lines.push('');

  // Contact snapshot
  const cs = brief.contact_snapshot;
  lines.push('QUI');
  lines.push(`  ${cs.name} - ${cs.title}`);
  lines.push(`  ${cs.company}`);
  lines.push(`  Statut : ${cs.relationship_status}`);
  lines.push(`  Dernier contact : ${cs.last_interaction}`);
  if (cs.key_info?.length > 0) {
    cs.key_info.forEach((info) => lines.push(`  - ${info}`));
  }
  lines.push('');

  // Events since last contact
  if (brief.what_happened_since_last_contact?.length > 0) {
    lines.push('DEPUIS VOTRE DERNIER ECHANGE');
    brief.what_happened_since_last_contact.forEach((e) => lines.push(`  - ${e}`));
    lines.push('');
  }

  // Web intelligence
  const wi = brief.web_intelligence;
  if (wi) {
    lines.push('INTELLIGENCE WEB');
    if (wi.company_news?.length > 0) {
      lines.push('  Actualites :');
      wi.company_news.forEach((n) => {
        lines.push(`    - ${n.headline}`);
        lines.push(`      ${n.summary}`);
        lines.push(`      Pertinence : ${n.relevance}`);
      });
    }
    if (wi.hiring_signals?.length > 0) {
      lines.push('  Signaux recrutement :');
      wi.hiring_signals.forEach((s) => lines.push(`    - ${s}`));
    }
    if (wi.contact_activity?.length > 0) {
      lines.push('  Activite du contact :');
      wi.contact_activity.forEach((a) => lines.push(`    - ${a}`));
    }
    lines.push('');
  }

  // Talking points
  if (brief.talking_points?.length > 0) {
    lines.push('POINTS A ABORDER');
    brief.talking_points.forEach((tp, i) => {
      lines.push(`  ${i + 1}. ${tp.topic}`);
      lines.push(`     Contexte : ${tp.context}`);
      lines.push(`     Angle : ${tp.suggested_angle}`);
    });
    lines.push('');
  }

  // Risks
  if (brief.risks_and_warnings?.length > 0) {
    lines.push('RISQUES ET AVERTISSEMENTS');
    brief.risks_and_warnings.forEach((r) => lines.push(`  - ${r}`));
    lines.push('');
  }

  // Objective
  if (brief.objective_suggestion) {
    lines.push(`OBJECTIF RECOMMANDE : ${brief.objective_suggestion}`);
  }

  return lines.join('\n');
}

// ─── MAIN COMPONENT ────────────────────────────────

export default function CallBriefPanel({
  entityType,
  entityId,
  entityName,
  calendarEventId,
  onClose,
  isOpen,
}: CallBriefPanelProps) {
  // Fetch cached brief
  const {
    data: cachedBrief,
    isLoading: isCacheLoading,
  } = useQuery({
    queryKey: ['call-brief', entityType, entityId],
    queryFn: () => api.get<BriefResponse['data']>(`/ai/call-brief/${entityType}/${entityId}`),
    enabled: isOpen,
    retry: false,
  });

  // Generate brief mutation
  const generateMutation = useMutation({
    mutationFn: (forceRefresh: boolean) =>
      api.post<BriefResponse['data']>('/ai/call-brief', {
        entityType,
        entityId,
        calendarEventId,
        forceRefresh,
      }),
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de la generation du brief');
    },
  });

  // Determine which brief to show
  const briefData = (generateMutation.data as any)?.data ?? cachedBrief;
  const brief: BriefData | null = briefData?.briefJson ?? null;
  const isGenerating = generateMutation.isPending;
  const isCached = briefData?.cached === true || (!generateMutation.data && cachedBrief);

  // Auto-generate if no cached brief found
  const handleGenerate = (forceRefresh = false) => {
    generateMutation.mutate(forceRefresh);
  };

  // Copy brief to clipboard
  const handleCopy = async () => {
    if (!brief) return;
    const text = formatBriefAsText(brief, entityName);
    try {
      await navigator.clipboard.writeText(text);
      toast('success', 'Brief copie dans le presse-papiers');
    } catch {
      toast('error', 'Impossible de copier le brief');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 h-full bg-white shadow-2xl z-50 flex flex-col"
            style={{ width: 'min(450px, 100vw)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-100 shrink-0">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-50">
                <Bot size={18} className="text-violet-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[15px] font-semibold text-neutral-900 truncate">
                  Brief pre-appel
                </h2>
                <p className="text-[12px] text-neutral-400 truncate">
                  {entityName}
                </p>
              </div>
              <button
                onClick={onClose}
                className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-neutral-50 transition-colors"
              >
                <X size={18} className="text-neutral-400" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* No brief yet - prompt to generate */}
              {!brief && !isGenerating && !isCacheLoading && (
                <div className="flex flex-col items-center justify-center h-full px-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
                    <Sparkles size={28} className="text-violet-400" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-neutral-800 mb-2">
                    Preparer votre appel
                  </h3>
                  <p className="text-[13px] text-neutral-500 mb-6 leading-relaxed">
                    L'IA va analyser le profil, les interactions passees et rechercher des actualites pertinentes pour vous preparer en 30 secondes.
                  </p>
                  <button
                    onClick={() => handleGenerate(false)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-500 text-white text-[13px] font-semibold hover:bg-violet-600 transition-colors shadow-md shadow-violet-500/20"
                  >
                    <Sparkles size={15} />
                    Generer le brief
                  </button>
                </div>
              )}

              {/* Loading state */}
              {(isGenerating || isCacheLoading) && !brief && <BriefSkeleton />}

              {/* Brief content */}
              {brief && (
                <div className="space-y-3 p-4">
                  {/* Contact Snapshot */}
                  <CollapsibleSection title="Qui" icon={User} iconColor="text-blue-500">
                    <div className="space-y-2">
                      <div className="text-[13px] font-medium text-neutral-800">
                        {brief.contact_snapshot?.name}
                        {brief.contact_snapshot?.title && (
                          <span className="font-normal text-neutral-500">
                            {' '}&middot; {brief.contact_snapshot.title}
                          </span>
                        )}
                      </div>
                      {brief.contact_snapshot?.company && (
                        <div className="text-[12px] text-neutral-500">
                          {brief.contact_snapshot.company}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                        {brief.contact_snapshot?.relationship_status && (
                          <span className="text-neutral-600">
                            <span className="text-neutral-400">Statut : </span>
                            {brief.contact_snapshot.relationship_status}
                          </span>
                        )}
                        {brief.contact_snapshot?.last_interaction && (
                          <span className="text-neutral-600">
                            <span className="text-neutral-400">Dernier contact : </span>
                            {brief.contact_snapshot.last_interaction}
                          </span>
                        )}
                      </div>
                      {brief.contact_snapshot?.key_info && brief.contact_snapshot.key_info.length > 0 && (
                        <ul className="space-y-1 mt-1">
                          {brief.contact_snapshot.key_info.map((info, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-[12px] text-neutral-600">
                              <span className="text-neutral-300 mt-0.5 shrink-0">&bull;</span>
                              {info}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </CollapsibleSection>

                  {/* What happened since last contact */}
                  {brief.what_happened_since_last_contact && brief.what_happened_since_last_contact.length > 0 && (
                    <CollapsibleSection title="Depuis votre dernier echange" icon={Clock} iconColor="text-amber-500">
                      <ul className="space-y-1.5">
                        {brief.what_happened_since_last_contact.map((event, i) => (
                          <li key={i} className="flex items-start gap-2 text-[12px] text-neutral-700">
                            <span className="text-amber-400 mt-0.5 shrink-0">&bull;</span>
                            {event}
                          </li>
                        ))}
                      </ul>
                    </CollapsibleSection>
                  )}

                  {/* Web Intelligence */}
                  {brief.web_intelligence && (
                    <CollapsibleSection title="Intelligence web" icon={Globe} iconColor="text-emerald-500">
                      <div className="space-y-3">
                        {/* Company news */}
                        {brief.web_intelligence.company_news && brief.web_intelligence.company_news.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Newspaper size={12} className="text-neutral-400" />
                              <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">
                                Actualites
                              </span>
                            </div>
                            <div className="space-y-2">
                              {brief.web_intelligence.company_news.map((news, i) => (
                                <div key={i} className="rounded-lg bg-neutral-25 p-2.5">
                                  <div className="text-[12px] font-medium text-neutral-800">
                                    {news.headline}
                                  </div>
                                  {news.summary && (
                                    <div className="text-[11px] text-neutral-500 mt-0.5">
                                      {news.summary}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2 mt-1">
                                    {news.relevance && (
                                      <span className="text-[10px] text-emerald-600 font-medium">
                                        &rarr; {news.relevance}
                                      </span>
                                    )}
                                    {news.source && (
                                      <span className="text-[10px] text-neutral-400">
                                        {news.source}
                                      </span>
                                    )}
                                    {news.date && (
                                      <span className="text-[10px] text-neutral-400">
                                        {news.date}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Hiring signals */}
                        {brief.web_intelligence.hiring_signals && brief.web_intelligence.hiring_signals.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Briefcase size={12} className="text-neutral-400" />
                              <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">
                                Signaux recrutement
                              </span>
                            </div>
                            <ul className="space-y-1">
                              {brief.web_intelligence.hiring_signals.map((signal, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-[12px] text-neutral-700">
                                  <Briefcase size={11} className="text-blue-400 mt-0.5 shrink-0" />
                                  {signal}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Contact activity */}
                        {brief.web_intelligence.contact_activity && brief.web_intelligence.contact_activity.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <MessageSquare size={12} className="text-neutral-400" />
                              <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide">
                                Activite du contact
                              </span>
                            </div>
                            <ul className="space-y-1">
                              {brief.web_intelligence.contact_activity.map((activity, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-[12px] text-neutral-700">
                                  <MessageSquare size={11} className="text-violet-400 mt-0.5 shrink-0" />
                                  {activity}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* No web results */}
                        {(!brief.web_intelligence.company_news || brief.web_intelligence.company_news.length === 0) &&
                         (!brief.web_intelligence.hiring_signals || brief.web_intelligence.hiring_signals.length === 0) &&
                         (!brief.web_intelligence.contact_activity || brief.web_intelligence.contact_activity.length === 0) && (
                          <p className="text-[12px] text-neutral-400 italic">
                            Aucune information web trouvee.
                          </p>
                        )}
                      </div>
                    </CollapsibleSection>
                  )}

                  {/* Talking Points */}
                  {brief.talking_points && brief.talking_points.length > 0 && (
                    <CollapsibleSection title="Points a aborder" icon={Target} iconColor="text-violet-500">
                      <div className="space-y-2.5">
                        {brief.talking_points.map((tp, i) => (
                          <div key={i} className="flex gap-2.5">
                            <span className="flex items-center justify-center shrink-0 w-5 h-5 rounded-full bg-violet-50 text-violet-500 text-[11px] font-bold mt-0.5">
                              {i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] font-medium text-neutral-800">
                                {tp.topic}
                              </div>
                              {tp.context && (
                                <div className="text-[11px] text-neutral-500 mt-0.5">
                                  {tp.context}
                                </div>
                              )}
                              {tp.suggested_angle && (
                                <div className="text-[11px] text-violet-600 font-medium mt-0.5">
                                  &rarr; {tp.suggested_angle}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleSection>
                  )}

                  {/* Risks and warnings */}
                  {brief.risks_and_warnings && brief.risks_and_warnings.length > 0 && (
                    <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle size={14} className="text-amber-500" />
                        <span className="text-[12px] font-semibold text-amber-700 uppercase tracking-wide">
                          Risques et avertissements
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {brief.risks_and_warnings.map((risk, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-[12px] text-amber-800">
                            <span className="text-amber-400 mt-0.5 shrink-0">&bull;</span>
                            {risk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Objective suggestion */}
                  {brief.objective_suggestion && (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Target size={14} className="text-emerald-500" />
                        <span className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wide">
                          Objectif recommande
                        </span>
                      </div>
                      <p className="text-[12px] text-emerald-800 leading-relaxed">
                        {brief.objective_suggestion}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 px-5 py-3 border-t border-neutral-100 shrink-0 bg-neutral-25">
              {brief && (
                <>
                  <button
                    onClick={handleCopy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-neutral-600 bg-white border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                  >
                    <Copy size={13} />
                    Copier le brief
                  </button>
                  <button
                    onClick={() => handleGenerate(true)}
                    disabled={isGenerating}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-neutral-600 bg-white border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={isGenerating ? 'animate-spin' : ''} />
                    Rafraichir
                  </button>
                </>
              )}
              {isCached && briefData?.generatedAt && (
                <span className="ml-auto text-[10px] text-neutral-400">
                  Genere le {new Date(briefData.generatedAt).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
