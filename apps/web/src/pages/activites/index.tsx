import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Phone, Mail, Calendar, FileText, ListChecks, Mic, Star, StarOff, Plus, Loader2, Search, MessageSquare } from 'lucide-react';
import { api } from '../../lib/api-client';
import Badge from '../../components/ui/Badge';
import Pagination from '../../components/ui/Pagination';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Select from '../../components/ui/Select';
import Input, { Textarea } from '../../components/ui/Input';
import { toast } from '../../components/ui/Toast';

const typeIcons: Record<string, React.ReactNode> = {
  APPEL: <Phone size={16} />,
  EMAIL: <Mail size={16} />,
  MEETING: <Calendar size={16} />,
  NOTE: <FileText size={16} />,
  TACHE: <ListChecks size={16} />,
  TRANSCRIPT: <Mic size={16} />,
};

const typeDotColors: Record<string, string> = {
  APPEL: '#7C5CFC',
  EMAIL: '#3B82F6',
  MEETING: '#10B981',
  NOTE: '#F59E0B',
  TACHE: '#6B7194',
  TRANSCRIPT: '#6B7194',
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

const ENTITE_TYPE_OPTIONS = [
  { value: 'CANDIDAT', label: 'Candidat' },
  { value: 'CLIENT', label: 'Client' },
  { value: 'ENTREPRISE', label: 'Entreprise' },
  { value: 'MANDAT', label: 'Mandat' },
];

const ENTITE_ENDPOINTS: Record<string, string> = {
  CANDIDAT: '/candidats',
  CLIENT: '/clients',
  ENTREPRISE: '/entreprises',
  MANDAT: '/mandats',
};

interface EntitySearchResult {
  id: string;
  label: string;
}

interface PaginatedEntities {
  data: Array<Record<string, unknown>>;
  meta: { total: number; page: number; perPage: number; totalPages: number };
}

interface Activite {
  id: string;
  type: string;
  titre: string | null;
  contenu: string | null;
  source: string;
  bookmarked: boolean;
  isTache: boolean;
  tacheCompleted: boolean;
  createdAt: string;
  user?: { nom: string; prenom: string | null };
}

interface PaginatedResponse {
  data: Activite[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

/** Build a display label for an entity result depending on type */
function entityLabel(entiteType: string, item: Record<string, unknown>): string {
  switch (entiteType) {
    case 'CANDIDAT':
    case 'CLIENT':
      return [item.prenom, item.nom].filter(Boolean).join(' ');
    case 'ENTREPRISE':
      return (item.nom as string) || '';
    case 'MANDAT':
      return (item.titrePoste as string) || '';
    default:
      return (item.nom as string) || (item.id as string) || '';
  }
}

const TABS = [
  { id: 'all', label: 'Toutes' },
  { id: 'APPEL', label: 'Appels' },
  { id: 'EMAIL', label: 'Emails' },
  { id: 'MEETING', label: 'Meetings' },
  { id: 'NOTE', label: 'Notes' },
];

const timelineStagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const timelineItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
};

export default function ActivitesPage() {
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
  const [newEntiteType, setNewEntiteType] = useState('CANDIDAT');
  const [newEntiteId, setNewEntiteId] = useState('');
  const [entitySearch, setEntitySearch] = useState('');
  const [debouncedEntitySearch, setDebouncedEntitySearch] = useState('');
  const [selectedEntityLabel, setSelectedEntityLabel] = useState('');

  // Debounce entity search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedEntitySearch(entitySearch), 300);
    return () => clearTimeout(timer);
  }, [entitySearch]);

  // Reset entity selection when entiteType changes
  useEffect(() => {
    setNewEntiteId('');
    setSelectedEntityLabel('');
    setEntitySearch('');
  }, [newEntiteType]);

  // Search entities for linking
  const { data: entityResults, isLoading: isSearchingEntities } = useQuery({
    queryKey: ['entity-search', newEntiteType, debouncedEntitySearch],
    queryFn: async () => {
      const endpoint = ENTITE_ENDPOINTS[newEntiteType];
      if (!endpoint) return [];
      const params = new URLSearchParams({ perPage: '8' });
      if (debouncedEntitySearch.trim()) params.set('search', debouncedEntitySearch.trim());
      const resp = await api.get<PaginatedEntities>(`${endpoint}?${params}`);
      return (resp.data || []).map((item) => ({
        id: item.id as string,
        label: entityLabel(newEntiteType, item),
      }));
    },
    enabled: createModalOpen && !newEntiteId,
  });

  // Create activity mutation
  const createActiviteMutation = useMutation({
    mutationFn: () =>
      api.post('/activites', {
        type: newType,
        ...(newDirection ? { direction: newDirection } : {}),
        titre: newTitre || undefined,
        contenu: newContenu || undefined,
        entiteType: newEntiteType,
        entiteId: newEntiteId,
        source: 'MANUEL',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activites'] });
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
    setNewEntiteType('CANDIDAT');
    setNewEntiteId('');
    setEntitySearch('');
    setSelectedEntityLabel('');
  }

  const filters = new URLSearchParams({ page: String(page), perPage: '20' });
  if (activeTab !== 'all') filters.set('type', activeTab);
  if (bookmarkedOnly) filters.set('bookmarked', 'true');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['activites', page, activeTab, bookmarkedOnly],
    queryFn: () => api.get<PaginatedResponse>(`/activites?${filters}`),
  });

  const toggleBookmark = async (id: string, current: boolean) => {
    try {
      await api.put(`/activites/${id}`, { bookmarked: !current });
      refetch();
      toast('success', current ? 'Bookmark retiré' : 'Activité bookmarkée');
    } catch {
      toast('error', 'Erreur lors de la mise à jour');
    }
  };

  const formatTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDayLabel = (d: string) => {
    const date = new Date(d);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Aujourd'hui";
    if (date.toDateString() === yesterday.toDateString()) return 'Hier';
    return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  // Group activities by day
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

  return (
    <div className="font-['Plus_Jakarta_Sans']">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-neutral-900">Activités</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBookmarkedOnly(!bookmarkedOnly)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              bookmarkedOnly
                ? 'bg-amber-50 text-amber-600'
                : 'text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            {bookmarkedOnly ? <Star size={16} fill="currentColor" /> : <StarOff size={16} />}
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
            onClick={() => { setActiveTab(tab.id); setPage(1); }}
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

      {/* Timeline content */}
      <div className="mt-6">
        {isLoading ? (
          <Skeleton className="h-16 w-full" count={5} />
        ) : !data?.data.length ? (
          <EmptyState
            title="Aucune activité"
            description="Les activités apparaîtront ici"
          />
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[20px] top-0 bottom-0 w-[2px] bg-neutral-100" />

            {groupedActivities.map((group, gi) => (
              <motion.div key={group.day} variants={timelineStagger} initial="hidden" animate="show">
                {/* Day separator */}
                <motion.div className="relative z-10 flex justify-center my-6" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                  <span className="rounded-full bg-neutral-100 px-4 py-1 text-[12px] font-semibold uppercase text-neutral-500 tracking-wide">
                    {group.dayLabel}
                  </span>
                </motion.div>

                {/* Events for this day */}
                {group.items.map((a) => (
                  <motion.div key={a.id} variants={timelineItem} className="relative pl-[48px] pb-6 group">
                    {/* Colored dot */}
                    <div
                      className="absolute left-[14px] top-[4px] h-[12px] w-[12px] rounded-full border-2 border-white shadow-sm"
                      style={{ backgroundColor: typeDotColors[a.type] || '#6B7194' }}
                    />

                    {/* Content card */}
                    <div className="rounded-xl bg-white p-4 shadow-card hover:shadow-card-hover transition-shadow duration-200">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Time */}
                          <span className="text-[11px] font-semibold text-neutral-500">
                            {formatTime(a.createdAt)}
                          </span>
                          {/* Title */}
                          <p className="text-[15px] font-semibold text-neutral-900 mt-0.5">
                            {a.titre || a.type}
                          </p>
                          {/* Content preview */}
                          {a.contenu && (
                            <p className="text-[13px] text-neutral-500 mt-1 line-clamp-2">
                              {a.contenu.slice(0, 150)}
                            </p>
                          )}
                          {/* Meta row */}
                          <div className="flex items-center gap-2 mt-2">
                            <Badge>{sourceLabels[a.source] || a.source}</Badge>
                            {a.user && (
                              <span className="text-[11px] text-neutral-400">
                                {a.user.prenom} {a.user.nom}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Bookmark button */}
                        <motion.button
                          whileTap={{ scale: 0.8 }}
                          onClick={() => toggleBookmark(a.id, a.bookmarked)}
                          className="ml-auto text-neutral-300 hover:text-amber-500 transition-colors"
                        >
                          {a.bookmarked ? (
                            <Star size={16} fill="currentColor" className="text-amber-500" />
                          ) : (
                            <Star size={16} />
                          )}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ))}
          </div>
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

          {/* Entity Type */}
          <Select
            label="Type d'entité"
            options={ENTITE_TYPE_OPTIONS}
            value={newEntiteType}
            onChange={setNewEntiteType}
          />

          {/* Entity search/select */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-700">
              Entité liée
            </label>
            {newEntiteId ? (
              <div className="flex items-center gap-2 rounded-xl border border-[#7C5CFC]/30 bg-[#7C5CFC]/5 px-3 py-2">
                <span className="flex-1 text-sm font-medium text-neutral-900">{selectedEntityLabel}</span>
                <button
                  type="button"
                  onClick={() => { setNewEntiteId(''); setSelectedEntityLabel(''); }}
                  className="text-xs text-neutral-400 hover:text-red-500"
                >
                  Changer
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    value={entitySearch}
                    onChange={(e) => setEntitySearch(e.target.value)}
                    placeholder="Rechercher..."
                    className="w-full rounded-xl border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-4 focus:ring-[#7C5CFC]/10 focus:border-[#7C5CFC]"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-neutral-200">
                  {isSearchingEntities ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 size={16} className="animate-spin text-neutral-400" />
                    </div>
                  ) : !entityResults?.length ? (
                    <div className="py-4 text-center text-xs text-neutral-400">
                      Aucun résultat
                    </div>
                  ) : (
                    entityResults.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => { setNewEntiteId(e.id); setSelectedEntityLabel(e.label); }}
                        className="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-50 border-b border-neutral-100 last:border-b-0"
                      >
                        {e.label}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={resetCreateForm}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => createActiviteMutation.mutate()}
              disabled={!newEntiteId || createActiviteMutation.isPending}
            >
              {createActiviteMutation.isPending ? (
                <><Loader2 size={16} className="animate-spin" /> Création...</>
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
