import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Phone, Mail, Send, MailOpen, Calendar, FileText, StickyNote, ListChecks, CheckCircle, Mic, Star, Plus, Loader2, ArrowRight, Zap, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api-client';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input, { Textarea } from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Skeleton from '../../components/ui/Skeleton';
import Pagination from '../../components/ui/Pagination';
import { toast } from '../../components/ui/Toast';
import AiCallSummaryEncart from './AiCallSummaryEncart';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Activite {
  id: string;
  type: string;
  direction: string | null;
  titre: string | null;
  contenu: string | null;
  source: string;
  metadata: any;
  bookmarked: boolean;
  isTache: boolean;
  tacheCompleted: boolean;
  createdAt: string;
  user?: { nom: string; prenom: string | null };
}

interface PaginatedResponse {
  data: Activite[];
  meta: { total: number; page: number; perPage: number; totalPages: number };
}

interface ActivityJournalProps {
  entiteType: 'CANDIDAT' | 'CLIENT' | 'ENTREPRISE' | 'MANDAT';
  entiteId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Icon + color config per activity type (with direction variants)
const typeConfig: Record<string, { icon: React.ElementType; bg: string; color: string }> = {
  APPEL: { icon: Phone, bg: '#EFF6FF', color: '#3B82F6' },
  EMAIL_SORTANT: { icon: Send, bg: '#EFF6FF', color: '#3B82F6' },
  EMAIL_ENTRANT: { icon: MailOpen, bg: '#F5F3FF', color: '#7C5CFC' },
  EMAIL: { icon: Mail, bg: '#EFF6FF', color: '#3B82F6' },
  MEETING: { icon: Calendar, bg: '#F0FDFA', color: '#14B8A6' },
  NOTE: { icon: StickyNote, bg: '#FFF7ED', color: '#F59E0B' },
  TACHE: { icon: CheckCircle, bg: '#ECFDF5', color: '#059669' },
  TRANSCRIPT: { icon: Mic, bg: '#F5F3FF', color: '#7C5CFC' },
  STATUS_CHANGE: { icon: ArrowRight, bg: '#ECFDF5', color: '#059669' },
  SEQUENCE_STEP: { icon: Zap, bg: '#F5F3FF', color: '#7C5CFC' },
  DOCUMENT: { icon: FileText, bg: '#F8F8FC', color: '#6B7194' },
};

function getTypeConfig(type: string, direction?: string | null) {
  if (type === 'EMAIL' && direction === 'SORTANT') return typeConfig.EMAIL_SORTANT;
  if (type === 'EMAIL' && direction === 'ENTRANT') return typeConfig.EMAIL_ENTRANT;
  return typeConfig[type] ?? { icon: FileText, bg: '#F1F2F6', color: '#6B7194' };
}

// Keep backward compatibility for dot colors
const typeDotColors: Record<string, string> = {
  APPEL: '#3B82F6',
  EMAIL: '#3B82F6',
  MEETING: '#14B8A6',
  NOTE: '#F59E0B',
  TACHE: '#059669',
  TRANSCRIPT: '#7C5CFC',
};

const sourceLabels: Record<string, string> = {
  MANUEL: 'Manuel',
  ALLO: 'Allo',
  GMAIL: 'Gmail',
  CALENDAR: 'Calendar',
  GOOGLE_DOCS: 'Google Docs',
  AGENT_IA: 'Agent IA',
  SYSTEME: 'Système',
};

const TYPE_OPTIONS = [
  { value: 'APPEL', label: 'Appel' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'NOTE', label: 'Note' },
  { value: 'TACHE', label: 'Tâche' },
];

const DIRECTION_OPTIONS = [
  { value: '', label: 'Aucune' },
  { value: 'ENTRANT', label: 'Entrant' },
  { value: 'SORTANT', label: 'Sortant' },
];

const TABS = [
  { id: 'all', label: 'Toutes' },
  { id: 'APPEL', label: 'Appels' },
  { id: 'EMAIL', label: 'Emails' },
  { id: 'MEETING', label: 'Meetings' },
  { id: 'NOTE', label: 'Notes' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(d: string): string {
  const date = new Date(d);
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDayLabel(d: string): string {
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (date.toDateString() === yesterday.toDateString()) return 'Hier';
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Animation Variants
// ---------------------------------------------------------------------------

const staggerContainer = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActivityJournal({ entiteType, entiteId }: ActivityJournalProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('all');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);

  // -- Create activity modal state --
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newType, setNewType] = useState('NOTE');
  const [newDirection, setNewDirection] = useState('');
  const [newTitre, setNewTitre] = useState('');
  const [newContenu, setNewContenu] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // -- Quick note mutation --
  const quickNoteMutation = useMutation({
    mutationFn: () =>
      api.post('/activites', {
        type: 'NOTE',
        titre: 'Note',
        contenu: quickNote,
        entiteType,
        entiteId,
        source: 'MANUEL',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activites', entiteType, entiteId] });
      setQuickNote('');
      setQuickNoteOpen(false);
      toast('success', 'Note ajoutée');
    },
  });

  // -- Query --
  const filters = new URLSearchParams({
    entiteType,
    entiteId,
    page: String(page),
    perPage: '20',
  });
  if (activeTab !== 'all') filters.set('type', activeTab);
  if (bookmarkedOnly) filters.set('bookmarked', 'true');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['activites', entiteType, entiteId, page, activeTab, bookmarkedOnly],
    queryFn: () => api.get<PaginatedResponse>(`/activites?${filters}`),
  });

  // -- Bookmark toggle --
  const toggleBookmark = async (id: string, current: boolean) => {
    try {
      await api.put(`/activites/${id}`, { bookmarked: !current });
      refetch();
      toast('success', current ? 'Bookmark retiré' : 'Activité bookmarkée');
    } catch {
      toast('error', 'Erreur lors de la mise à jour');
    }
  };

  // -- Create mutation --
  const createActiviteMutation = useMutation({
    mutationFn: () =>
      api.post('/activites', {
        type: newType,
        ...(newDirection ? { direction: newDirection } : {}),
        titre: newTitre || undefined,
        contenu: newContenu || undefined,
        entiteType,
        entiteId,
        source: 'MANUEL',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activites', entiteType, entiteId] });
      resetCreateForm();
      toast('success', 'Activité créée');
    },
    onError: () => {
      toast('error', 'Erreur lors de la création');
    },
  });

  function resetCreateForm() {
    setCreateModalOpen(false);
    setNewType('NOTE');
    setNewDirection('');
    setNewTitre('');
    setNewContenu('');
  }

  // -- Group activities by day --
  const groupedActivities = useMemo(() => {
    if (!data?.data) return [];
    const groups: { day: string; dayLabel: string; items: Activite[] }[] = [];
    let currentDay = '';

    for (const a of data.data) {
      const dayKey = new Date(a.createdAt).toDateString();
      if (dayKey !== currentDay) {
        currentDay = dayKey;
        groups.push({ day: dayKey, dayLabel: formatDayLabel(a.createdAt), items: [] });
      }
      groups[groups.length - 1].items.push(a);
    }

    return groups;
  }, [data?.data]);

  // -- Render --
  return (
    <div className="font-['Plus_Jakarta_Sans']">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-[22px] font-bold text-neutral-900">Journal d'activité</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBookmarkedOnly(!bookmarkedOnly)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              bookmarkedOnly
                ? 'bg-amber-50 text-amber-600'
                : 'text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            <Star size={16} fill={bookmarkedOnly ? 'currentColor' : 'none'} />
            Bookmarks
          </button>
          <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
            <Plus size={16} /> Nouvelle activité
          </Button>
        </div>
      </div>

      {/* Pill-style tabs */}
      <div className="mb-6 flex items-center gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setPage(1);
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-[#7C5CFC] text-white shadow-sm'
                : 'bg-transparent text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Quick note input */}
      <div className="mb-4">
        {!quickNoteOpen ? (
          <button
            onClick={() => setQuickNoteOpen(true)}
            className="w-full rounded-xl bg-neutral-50 px-4 py-3 text-left text-[14px] text-neutral-400 hover:bg-neutral-100 transition-colors"
          >
            Ajouter une note...
          </button>
        ) : (
          <div className="rounded-xl bg-white border border-neutral-200 p-3 shadow-sm">
            <textarea
              autoFocus
              value={quickNote}
              onChange={e => setQuickNote(e.target.value)}
              placeholder="Écrire une note..."
              className="w-full resize-none rounded-lg bg-neutral-50 px-3 py-2 text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              rows={3}
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => { setQuickNoteOpen(false); setQuickNote(''); }}
                className="rounded-md px-3 py-1.5 text-[13px] font-medium text-neutral-500 hover:bg-neutral-100"
              >
                Annuler
              </button>
              <button
                onClick={() => quickNote.trim() && quickNoteMutation.mutate()}
                disabled={!quickNote.trim() || quickNoteMutation.isPending}
                className="rounded-md bg-brand-500 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                {quickNoteMutation.isPending ? 'Envoi...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Timeline content */}
      <div className="mt-2">
        {isLoading ? (
          <Skeleton className="h-16 w-full" count={5} />
        ) : !data?.data.length ? (
          <div className="rounded-xl bg-white p-8 text-center shadow-card">
            <p className="text-sm text-neutral-500">Aucune activité</p>
          </div>
        ) : (
          <motion.div
            className="relative"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            {/* Vertical timeline line */}
            <div className="absolute left-[20px] top-0 bottom-0 w-[2px] bg-neutral-100" />

            {groupedActivities.map((group) => (
              <div key={group.day}>
                {/* Day separator */}
                <motion.div
                  className="relative z-10 flex justify-center my-6"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <span className="rounded-full bg-neutral-100 px-4 py-1 text-[12px] font-semibold uppercase text-neutral-500 tracking-wide">
                    {group.dayLabel}
                  </span>
                </motion.div>

                {/* Events for this day */}
                {group.items.map((a) => {
                  const cfg = getTypeConfig(a.type, a.direction);
                  const Icon = cfg.icon;
                  const meta = a.metadata ?? {};
                  const duration = meta.duration_seconds ? `${Math.round(meta.duration_seconds / 60)} min` : null;
                  const meetingDuration = meta.duration_minutes ? `${meta.duration_minutes}h` : null;

                  return (
                    <motion.div key={a.id} className="relative pl-[56px] pb-5 group" variants={staggerItem}>
                      {/* Icon circle */}
                      <motion.div
                        className="absolute left-[2px] top-[2px] flex h-9 w-9 items-center justify-center rounded-full"
                        style={{ backgroundColor: cfg.bg }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      >
                        <Icon size={16} style={{ color: cfg.color }} />
                      </motion.div>

                      {/* Content */}
                      <div className="rounded-xl bg-white px-4 py-3.5 shadow-card hover:shadow-card-hover transition-shadow duration-200">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Header: time + title + duration */}
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-semibold text-neutral-500">
                                {formatTime(a.createdAt)}
                              </span>
                              <span className="text-[14px] font-medium text-neutral-900">
                                {a.titre || a.type}
                              </span>
                              {duration && (
                                <span className="text-[12px] text-neutral-400">({duration})</span>
                              )}
                              {meetingDuration && (
                                <span className="text-[12px] text-neutral-400">({meetingDuration})</span>
                              )}
                              {meta.meeting_type && (
                                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
                                  {meta.meeting_type}
                                </span>
                              )}
                            </div>
                            {/* Content preview */}
                            {a.contenu && (
                              <p className="text-[13px] text-neutral-500 mt-1 line-clamp-2">
                                {a.contenu.slice(0, 200)}
                              </p>
                            )}
                            {/* Email metadata */}
                            {a.type === 'EMAIL' && meta.subject && (
                              <p className="text-[13px] font-medium text-neutral-600 mt-0.5">
                                Objet : {meta.subject}
                              </p>
                            )}
                            {/* Meta row */}
                            <div className="flex items-center gap-2 mt-2">
                              {a.user && (
                                <span className="text-[12px] text-neutral-400">
                                  Par : {a.user.prenom} {a.user.nom}
                                </span>
                              )}
                              <Badge>{sourceLabels[a.source] || a.source}</Badge>
                            </div>
                          </div>

                          {/* Bookmark button */}
                          <motion.button
                            onClick={() => toggleBookmark(a.id, a.bookmarked)}
                            className="ml-auto text-neutral-300 hover:text-amber-500 transition-colors"
                            whileTap={{ scale: 0.8 }}
                          >
                            {a.bookmarked ? (
                              <Star size={16} fill="currentColor" className="text-amber-500" />
                            ) : (
                              <Star size={16} />
                            )}
                          </motion.button>
                        </div>
                      </div>

                      {/* AI Call Summary encart for APPEL activities */}
                      {a.type === 'APPEL' && a.contenu && a.contenu.length > 50 && (
                        <AiCallSummaryEncart
                          activiteId={a.id}
                          entiteType={entiteType}
                          entiteId={entiteId}
                        />
                      )}
                    </motion.div>
                  );
                })}
              </div>
            ))}
          </motion.div>
        )}

        {data?.meta && (
          <div className="mt-4 flex justify-center">
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      {/* Create Activity Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={resetCreateForm}
        title="Nouvelle activité"
        size="md"
      >
        <div className="space-y-4">
          {/* Type */}
          <Select
            label="Type"
            options={TYPE_OPTIONS}
            value={newType}
            onChange={setNewType}
          />

          {/* Direction (only relevant for APPEL/EMAIL) */}
          {(newType === 'APPEL' || newType === 'EMAIL') && (
            <Select
              label="Direction"
              options={DIRECTION_OPTIONS}
              value={newDirection}
              onChange={setNewDirection}
              placeholder="Aucune"
            />
          )}

          {/* Titre */}
          <Input
            label="Titre"
            value={newTitre}
            onChange={(e) => setNewTitre(e.target.value)}
            placeholder="Titre de l'activité"
          />

          {/* Contenu */}
          <Textarea
            label="Contenu"
            value={newContenu}
            onChange={(e) => setNewContenu(e.target.value)}
            placeholder="Détails de l'activité..."
          />

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={resetCreateForm}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => createActiviteMutation.mutate()}
              disabled={createActiviteMutation.isPending}
            >
              {createActiviteMutation.isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Création...
                </>
              ) : (
                'Créer'
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
