import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, Clock, AlertTriangle, Calendar, Plus, Send,
  ChevronDown, ChevronUp, Mail, Loader2, Trash2, AlarmClock,
  User, Building2, FileText, Briefcase, ExternalLink, Pencil,
  UserPlus, Phone,
} from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../../lib/api-client';
import { t, LOCALE } from '../../lib/i18n';
import { usePageTitle } from '../../hooks/usePageTitle';
import { formatTaskDue } from '../../lib/format-relative-date';
import Badge from '../../components/ui/Badge';
import Pagination from '../../components/ui/Pagination';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input, { Textarea } from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { toast } from '../../components/ui/Toast';
import PageHeader from '../../components/ui/PageHeader';
import IdentifyContactModal from '../../components/activity/IdentifyContactModal';
import { useAuthStore } from '../../stores/auth-store';

interface Tache {
  id: string;
  titre: string;
  contenu: string | null;
  type: string;
  tacheDueDate: string | null;
  tacheCompleted: boolean;
  createdAt: string;
  metadata?: Record<string, any>;
  user?: { nom: string; prenom: string | null };
  entiteType?: string | null;
  entiteId?: string | null;
  entiteNom?: string | null;
}

const ENTITE_ROUTES: Record<string, string> = {
  CANDIDAT: '/candidats',
  CLIENT: '/clients',
  ENTREPRISE: '/entreprises',
  MANDAT: '/mandats',
};

const ENTITE_ICONS: Record<string, typeof User> = {
  CANDIDAT: User,
  CLIENT: Building2,
  ENTREPRISE: Briefcase,
  MANDAT: FileText,
};

const ENTITE_LABELS: Record<string, string> = {
  CANDIDAT: t('Candidat'),
  CLIENT: t('Client'),
  ENTREPRISE: t('Entreprise'),
  MANDAT: t('Mandat'),
};

interface PaginatedResponse {
  data: Tache[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

const priorityConfig: Record<string, { label: string; variant: 'error' | 'warning' | 'success'; dot: string }> = {
  HAUTE: { label: t('Haute'), variant: 'error', dot: '#DC2626' },
  MOYENNE: { label: t('Moyenne'), variant: 'warning', dot: '#F59E0B' },
  BASSE: { label: t('Basse'), variant: 'success', dot: '#10B981' },
};

const listStagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const listItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
};

export default function TachesPage() {
  usePageTitle(t('Tâches'));
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'ADMIN';
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('todo');
  const [viewAll, setViewAll] = useState(isAdmin); // Admins see all by default
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Tache | null>(null);
  const [createForm, setCreateForm] = useState({
    titre: '',
    contenu: '',
    entiteType: 'CANDIDAT' as string,
    entiteId: '',
    tacheDueDate: '',
    tachePriority: 'MOYENNE' as string,
  });
  const [editForm, setEditForm] = useState({
    titre: '',
    contenu: '',
    tacheDueDate: '',
    tachePriority: 'MOYENNE' as string,
  });

  // -- Identify contact modal --
  const [identifyModalOpen, setIdentifyModalOpen] = useState(false);
  const [identifyActiviteId, setIdentifyActiviteId] = useState('');
  const [identifyPhone, setIdentifyPhone] = useState('');

  const queryClient = useQueryClient();

  const filters = new URLSearchParams({ page: String(page), perPage: '20' });
  if (activeTab !== 'all') filters.set('status', activeTab);
  if (isAdmin && viewAll) filters.set('userId', 'all');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['taches', page, activeTab, viewAll ? 'all' : 'mine'],
    queryFn: () => api.get<PaginatedResponse>(`/taches?${filters}`),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/taches', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taches'] });
      toast('success', t('Tâche créée'));
      setShowCreateModal(false);
      setCreateForm({ titre: '', contenu: '', entiteType: 'CANDIDAT', entiteId: '', tacheDueDate: '', tachePriority: 'MOYENNE' });
    },
    onError: () => toast('error', t('Erreur lors de la création')),
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) => api.put(`/taches/${id}/snooze`, { days }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['taches'] }); toast('success', t('Tâche reportée')); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/taches/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['taches'] }); toast('success', t('Tâche supprimée')); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/taches/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taches'] });
      toast('success', t('Tâche modifiée'));
      setEditingTask(null);
    },
    onError: () => toast('error', t('Erreur lors de la modification')),
  });

  const openEditModal = (task: Tache) => {
    setEditForm({
      titre: task.titre,
      contenu: task.contenu || '',
      tacheDueDate: task.tacheDueDate ? new Date(task.tacheDueDate).toISOString().slice(0, 16) : '',
      tachePriority: task.type || 'MOYENNE',
    });
    setEditingTask(task);
  };

  const isAdchaseTask = (task: Tache) => !!(task.metadata?.adchaseCampaignId);

  const toggleCompletion = async (id: string, current: boolean) => {
    try {
      await api.put(`/taches/${id}/complete`, {});
      refetch();
      toast('success', current ? t('Tâche réouverte') : t('Tâche terminée'));
    } catch {
      toast('error', t('Erreur lors de la mise à jour'));
    }
  };

  const handleAdchaseSend = async (task: Tache) => {
    setSendingId(task.id);
    try {
      await api.put(`/taches/${task.id}/complete`, {});
      refetch();
      toast('success', t('Email envoyé et tâche terminée'));
    } catch {
      toast('error', t('Erreur lors de l\'envoi de l\'email'));
    } finally {
      setSendingId(null);
    }
  };

  const isOverdue = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString(LOCALE, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const todoCount = data?.meta?.total ?? 0;

  const TABS = [
    { id: 'todo', label: t('À faire'), count: activeTab === 'todo' ? todoCount : undefined },
    { id: 'overdue', label: t('En retard'), isRed: true },
    { id: 'done', label: t('Terminées') },
  ];

  return (
    <div className="font-['Plus_Jakarta_Sans']">
      <PageHeader
        title={t('Tâches')}
        breadcrumbs={[{ label: t('Tâches') }]}
        actions={
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> {t('Nouvelle tâche')}
          </Button>
        }
      />

      {/* Pill-style tabs */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setPage(1); }}
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? tab.id === 'overdue'
                    ? 'bg-red-500 text-white shadow-sm'
                    : 'bg-[#22177A] text-white shadow-sm'
                  : 'bg-transparent text-neutral-500 hover:bg-neutral-50'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
                  activeTab === tab.id
                    ? 'bg-white/20 text-white'
                    : 'bg-neutral-100 text-neutral-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1 rounded-lg border border-neutral-200 p-0.5">
            <button
              onClick={() => { setViewAll(false); setPage(1); }}
              className={`rounded-md px-3 py-1 text-[13px] font-medium transition-all ${
                !viewAll ? 'bg-[#22177A] text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {t('Mes tâches')}
            </button>
            <button
              onClick={() => { setViewAll(true); setPage(1); }}
              className={`rounded-md px-3 py-1 text-[13px] font-medium transition-all ${
                viewAll ? 'bg-[#22177A] text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {t('Toutes')}
            </button>
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {isLoading ? (
          <Skeleton className="h-16 w-full" count={5} />
        ) : !data?.data.length ? (
          <EmptyState
            title={t('Aucune tâche')}
            description={
              activeTab === 'todo'
                ? t('Toutes les tâches sont terminées')
                : activeTab === 'overdue'
                  ? t('Aucune tâche en retard')
                  : t('Les tâches apparaîtront ici')
            }
          />
        ) : (
          <motion.div variants={listStagger} initial="hidden" animate="show" className="space-y-2">
          {data.data.map((task) => {
            const isAdchase = isAdchaseTask(task);
            const isExpanded = expandedId === task.id;
            const isSending = sendingId === task.id;

            return (
            <motion.div
              key={task.id}
              variants={listItem}
              className="group rounded-2xl bg-white shadow-card transition-colors duration-200 hover:bg-neutral-50"
            >
              <div className="flex items-start gap-3 p-4">
                {/* Circle checkbox — for non-Adchase tasks */}
                {!isAdchase ? (
                  <button
                    onClick={() => toggleCompletion(task.id, task.tacheCompleted)}
                    className="mt-0.5 flex-shrink-0"
                  >
                    {task.tacheCompleted ? (
                      <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#10B981]">
                        <Check size={14} className="text-white" strokeWidth={3} />
                      </div>
                    ) : (
                      <div className="h-[22px] w-[22px] rounded-full border-2 border-neutral-300 transition-colors group-hover:border-[#22177A]" />
                    )}
                  </button>
                ) : (
                  <div className="mt-0.5 flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full bg-violet-100">
                    {task.tacheCompleted ? (
                      <Check size={14} className="text-emerald-600" strokeWidth={3} />
                    ) : (
                      <Mail size={12} className="text-violet-600" />
                    )}
                  </div>
                )}

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <p
                        className={`text-[15px] font-semibold ${
                          task.tacheCompleted
                            ? 'text-neutral-300 line-through'
                            : 'text-neutral-900'
                        }`}
                      >
                        {task.titre}
                      </p>
                      {isAdchase && !task.tacheCompleted && (
                        <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600">
                          Adchase
                        </span>
                      )}
                      {isAdchase && task.tacheCompleted && task.metadata?.emailSent && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                          <Check size={10} /> {t('Envoyé')}
                        </span>
                      )}
                    </div>

                    {/* Priority */}
                    {task.type && priorityConfig[task.type] && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: priorityConfig[task.type].dot }}
                        />
                        <Badge variant={priorityConfig[task.type].variant} size="sm">
                          {priorityConfig[task.type].label}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  {task.contenu && (
                    <p className="mt-1 text-[13px] text-neutral-500 line-clamp-2">{task.contenu}</p>
                  )}

                  {/* Identify contact button for unidentified call tasks */}
                  {task.metadata?.unidentifiedPhone && task.metadata?.activiteId && !task.tacheCompleted && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIdentifyActiviteId(task.metadata!.activiteId);
                        setIdentifyPhone(task.metadata!.unidentifiedPhone);
                        setIdentifyModalOpen(true);
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-[12px] font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
                    >
                      <UserPlus size={14} />
                      {t('Identifier ce contact ({tel})', { tel: task.metadata.unidentifiedPhone })}
                    </button>
                  )}

                  {/* Entity link */}
                  {task.entiteType && task.entiteId && ENTITE_ROUTES[task.entiteType] && (
                    <Link
                      to={`${ENTITE_ROUTES[task.entiteType]}/${task.entiteId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-600 hover:bg-violet-100 transition-colors"
                    >
                      {(() => {
                        const Icon = ENTITE_ICONS[task.entiteType!] || FileText;
                        return <Icon size={11} />;
                      })()}
                      {task.entiteNom || ENTITE_LABELS[task.entiteType] || task.entiteType}
                      <ExternalLink size={9} className="opacity-50" />
                    </Link>
                  )}

                  {/* Metadata row */}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-neutral-500">
                    {/* Due date */}
                    {task.tacheDueDate && (
                      (() => {
                        const due = formatTaskDue(task.tacheDueDate);
                        return (
                          <span
                            className={`flex items-center gap-1 ${
                              due.isOverdue && !task.tacheCompleted
                                ? 'font-semibold text-red-500'
                                : due.isToday && !task.tacheCompleted
                                  ? 'font-medium text-amber-500'
                                  : ''
                            }`}
                          >
                            {due.isOverdue && !task.tacheCompleted ? (
                              <AlertTriangle size={13} />
                            ) : (
                              <Calendar size={13} className="text-neutral-400" />
                            )}
                            {due.text}
                          </span>
                        );
                      })()
                    )}
                    {!task.tacheCompleted && task.tacheDueDate && (
                      <div className="relative inline-flex">
                        <button
                          onClick={(e) => { e.stopPropagation(); snoozeMutation.mutate({ id: task.id, days: 1 }); }}
                          className="ml-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                          title={t('Reporter +1 jour')}
                        >
                          {t('+1j')}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); snoozeMutation.mutate({ id: task.id, days: 3 }); }}
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                          title={t('Reporter +3 jours')}
                        >
                          {t('+3j')}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); snoozeMutation.mutate({ id: task.id, days: 7 }); }}
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                          title={t('Reporter +1 semaine')}
                        >
                          {t('+7j')}
                        </button>
                      </div>
                    )}

                    {task.user && (
                      <span className="ml-auto text-neutral-400">
                        {t('Assigné à {nom}', { nom: `${task.user.prenom ?? ''} ${task.user.nom}` })}
                      </span>
                    )}
                    {!isAdchase && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(task); }}
                          className="ml-2 rounded p-1 text-neutral-300 hover:bg-violet-50 hover:text-violet-500 transition-colors"
                          title={t('Modifier')}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); if(confirm(t('Supprimer cette tâche ?'))) deleteMutation.mutate(task.id); }}
                          disabled={deleteMutation.isPending}
                          className="rounded p-1 text-neutral-300 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Adchase: expand to see email + send button */}
                  {isAdchase && !task.tacheCompleted && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : task.id)}
                        className="flex items-center gap-1 text-[12px] font-medium text-violet-600 hover:text-violet-700 transition-colors"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {isExpanded ? t('Masquer l\'email') : t('Voir l\'email')}
                      </button>

                      <button
                        onClick={() => handleAdchaseSend(task)}
                        disabled={isSending}
                        className="ml-auto flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-1.5 text-[13px] font-medium text-white hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 transition-all"
                      >
                        {isSending ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Send size={14} />
                        )}
                        {isSending ? t('Envoi en cours...') : t('Valider & Envoyer')}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Expanded email preview */}
              <AnimatePresence>
                {isAdchase && isExpanded && !task.tacheCompleted && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="mx-4 mb-4 rounded-lg border border-neutral-100 bg-neutral-50 p-4">
                      <div className="mb-2 flex items-center gap-2 text-[12px] text-neutral-400">
                        <Mail size={12} />
                        <span>{t('Objet :')} <strong className="text-neutral-600">{task.metadata?.emailSubject || '—'}</strong></span>
                      </div>
                      <div className="whitespace-pre-wrap text-[13px] text-neutral-700 leading-relaxed">
                        {task.metadata?.emailBody || t('Aucun contenu')}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
            );
          })}
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

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title={t('Nouvelle tâche')}>
        <div className="space-y-4">
          <Input
            label={t('Titre')}
            placeholder={t('Ex: Relancer le candidat')}
            value={createForm.titre}
            onChange={(e) => setCreateForm(f => ({ ...f, titre: e.target.value }))}
          />
          <Textarea
            label={t('Description (optionnel)')}
            placeholder={t('Détails de la tâche...')}
            value={createForm.contenu}
            onChange={(e) => setCreateForm(f => ({ ...f, contenu: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label={t("Type d'entité")}
              options={[
                { value: 'CANDIDAT', label: t('Candidat') },
                { value: 'CLIENT', label: t('Client') },
                { value: 'ENTREPRISE', label: t('Entreprise') },
                { value: 'MANDAT', label: t('Mandat') },
              ]}
              value={createForm.entiteType}
              onChange={(val) => setCreateForm(f => ({ ...f, entiteType: val }))}
            />
            <Select
              label={t('Priorité')}
              options={[
                { value: 'HAUTE', label: t('Haute') },
                { value: 'MOYENNE', label: t('Moyenne') },
                { value: 'BASSE', label: t('Basse') },
              ]}
              value={createForm.tachePriority}
              onChange={(val) => setCreateForm(f => ({ ...f, tachePriority: val }))}
            />
          </div>
          <Input
            label={t("Date d'échéance")}
            type="datetime-local"
            value={createForm.tacheDueDate}
            onChange={(e) => setCreateForm(f => ({ ...f, tacheDueDate: e.target.value }))}
          />
          <Input
            label={t("ID de l'entité liée")}
            placeholder={t("UUID de l'entité")}
            value={createForm.entiteId}
            onChange={(e) => setCreateForm(f => ({ ...f, entiteId: e.target.value }))}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>{t('Annuler')}</Button>
            <Button
              onClick={() => createMutation.mutate({
                titre: createForm.titre,
                contenu: createForm.contenu || undefined,
                entiteType: createForm.entiteType,
                entiteId: createForm.entiteId || undefined,
                tacheDueDate: createForm.tacheDueDate ? new Date(createForm.tacheDueDate).toISOString() : undefined,
                tachePriority: createForm.tachePriority,
              })}
              disabled={!createForm.titre || createMutation.isPending}
            >
              {createMutation.isPending ? t('Création...') : t('Créer la tâche')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Identify Contact Modal */}
      <IdentifyContactModal
        isOpen={identifyModalOpen}
        onClose={() => {
          setIdentifyModalOpen(false);
          refetch(); // Refresh tasks to show the closed task
        }}
        activiteId={identifyActiviteId}
        phoneNumber={identifyPhone}
      />

      {/* Edit modal */}
      <Modal isOpen={!!editingTask} onClose={() => setEditingTask(null)} title={t('Modifier la tâche')}>
        <div className="space-y-4">
          <Input
            label={t('Titre')}
            placeholder={t('Ex: Relancer le candidat')}
            value={editForm.titre}
            onChange={(e) => setEditForm(f => ({ ...f, titre: e.target.value }))}
          />
          <Textarea
            label={t('Description (optionnel)')}
            placeholder={t('Détails de la tâche...')}
            value={editForm.contenu}
            onChange={(e) => setEditForm(f => ({ ...f, contenu: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label={t('Priorité')}
              options={[
                { value: 'HAUTE', label: t('Haute') },
                { value: 'MOYENNE', label: t('Moyenne') },
                { value: 'BASSE', label: t('Basse') },
              ]}
              value={editForm.tachePriority}
              onChange={(val) => setEditForm(f => ({ ...f, tachePriority: val }))}
            />
            <Input
              label={t("Date d'échéance")}
              type="datetime-local"
              value={editForm.tacheDueDate}
              onChange={(e) => setEditForm(f => ({ ...f, tacheDueDate: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEditingTask(null)}>{t('Annuler')}</Button>
            <Button
              onClick={() => editingTask && updateMutation.mutate({
                id: editingTask.id,
                data: {
                  titre: editForm.titre,
                  contenu: editForm.contenu || undefined,
                  tacheDueDate: editForm.tacheDueDate ? new Date(editForm.tacheDueDate).toISOString() : null,
                  tachePriority: editForm.tachePriority,
                },
              })}
              disabled={!editForm.titre || updateMutation.isPending}
            >
              {updateMutation.isPending ? t('Enregistrement...') : t('Enregistrer')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
