import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, Clock, AlertTriangle, Calendar, Plus, Send,
  ChevronDown, ChevronUp, Mail, Loader2, Trash2, AlarmClock,
  User, Building2, FileText, Briefcase, ExternalLink, Pencil,
} from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../../lib/api-client';
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
  CANDIDAT: 'Candidat',
  CLIENT: 'Client',
  ENTREPRISE: 'Entreprise',
  MANDAT: 'Mandat',
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
  HAUTE: { label: 'Haute', variant: 'error', dot: '#DC2626' },
  MOYENNE: { label: 'Moyenne', variant: 'warning', dot: '#F59E0B' },
  BASSE: { label: 'Basse', variant: 'success', dot: '#10B981' },
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
  usePageTitle('Tâches');
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
      toast('success', 'Tâche créée');
      setShowCreateModal(false);
      setCreateForm({ titre: '', contenu: '', entiteType: 'CANDIDAT', entiteId: '', tacheDueDate: '', tachePriority: 'MOYENNE' });
    },
    onError: () => toast('error', 'Erreur lors de la création'),
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) => api.put(`/taches/${id}/snooze`, { days }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['taches'] }); toast('success', 'Tâche reportée'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/taches/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['taches'] }); toast('success', 'Tâche supprimée'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/taches/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taches'] });
      toast('success', 'Tâche modifiée');
      setEditingTask(null);
    },
    onError: () => toast('error', 'Erreur lors de la modification'),
  });

  const openEditModal = (t: Tache) => {
    setEditForm({
      titre: t.titre,
      contenu: t.contenu || '',
      tacheDueDate: t.tacheDueDate ? new Date(t.tacheDueDate).toISOString().slice(0, 16) : '',
      tachePriority: t.type || 'MOYENNE',
    });
    setEditingTask(t);
  };

  const isAdchaseTask = (t: Tache) => !!(t.metadata?.adchaseCampaignId);

  const toggleCompletion = async (id: string, current: boolean) => {
    try {
      await api.put(`/taches/${id}/complete`, {});
      refetch();
      toast('success', current ? 'Tâche réouverte' : 'Tâche terminée');
    } catch {
      toast('error', 'Erreur lors de la mise à jour');
    }
  };

  const handleAdchaseSend = async (t: Tache) => {
    setSendingId(t.id);
    try {
      await api.put(`/taches/${t.id}/complete`, {});
      refetch();
      toast('success', 'Email envoyé et tâche terminée');
    } catch {
      toast('error', 'Erreur lors de l\'envoi de l\'email');
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
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const todoCount = data?.meta?.total ?? 0;

  const TABS = [
    { id: 'todo', label: 'À faire', count: activeTab === 'todo' ? todoCount : undefined },
    { id: 'overdue', label: 'En retard', isRed: true },
    { id: 'done', label: 'Terminées' },
  ];

  return (
    <div className="font-['Plus_Jakarta_Sans']">
      <PageHeader
        title="Tâches"
        breadcrumbs={[{ label: 'Tâches' }]}
        actions={
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> Nouvelle tâche
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
                    : 'bg-[#7C5CFC] text-white shadow-sm'
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
                !viewAll ? 'bg-[#7C5CFC] text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Mes tâches
            </button>
            <button
              onClick={() => { setViewAll(true); setPage(1); }}
              className={`rounded-md px-3 py-1 text-[13px] font-medium transition-all ${
                viewAll ? 'bg-[#7C5CFC] text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Toutes
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
            title="Aucune tâche"
            description={
              activeTab === 'todo'
                ? 'Toutes les tâches sont terminées'
                : activeTab === 'overdue'
                  ? 'Aucune tâche en retard'
                  : 'Les tâches apparaîtront ici'
            }
          />
        ) : (
          <motion.div variants={listStagger} initial="hidden" animate="show" className="space-y-2">
          {data.data.map((t) => {
            const isAdchase = isAdchaseTask(t);
            const isExpanded = expandedId === t.id;
            const isSending = sendingId === t.id;

            return (
            <motion.div
              key={t.id}
              variants={listItem}
              className="group rounded-2xl bg-white shadow-card transition-colors duration-200 hover:bg-neutral-50"
            >
              <div className="flex items-start gap-3 p-4">
                {/* Circle checkbox — for non-Adchase tasks */}
                {!isAdchase ? (
                  <button
                    onClick={() => toggleCompletion(t.id, t.tacheCompleted)}
                    className="mt-0.5 flex-shrink-0"
                  >
                    {t.tacheCompleted ? (
                      <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#10B981]">
                        <Check size={14} className="text-white" strokeWidth={3} />
                      </div>
                    ) : (
                      <div className="h-[22px] w-[22px] rounded-full border-2 border-neutral-300 transition-colors group-hover:border-[#7C5CFC]" />
                    )}
                  </button>
                ) : (
                  <div className="mt-0.5 flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full bg-violet-100">
                    {t.tacheCompleted ? (
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
                          t.tacheCompleted
                            ? 'text-neutral-300 line-through'
                            : 'text-neutral-900'
                        }`}
                      >
                        {t.titre}
                      </p>
                      {isAdchase && !t.tacheCompleted && (
                        <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600">
                          Adchase
                        </span>
                      )}
                      {isAdchase && t.tacheCompleted && t.metadata?.emailSent && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                          <Check size={10} /> Envoyé
                        </span>
                      )}
                    </div>

                    {/* Priority */}
                    {t.type && priorityConfig[t.type] && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: priorityConfig[t.type].dot }}
                        />
                        <Badge variant={priorityConfig[t.type].variant} size="sm">
                          {priorityConfig[t.type].label}
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  {t.contenu && (
                    <p className="mt-1 text-[13px] text-neutral-500 line-clamp-2">{t.contenu}</p>
                  )}

                  {/* Entity link */}
                  {t.entiteType && t.entiteId && ENTITE_ROUTES[t.entiteType] && (
                    <Link
                      to={`${ENTITE_ROUTES[t.entiteType]}/${t.entiteId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-600 hover:bg-violet-100 transition-colors"
                    >
                      {(() => {
                        const Icon = ENTITE_ICONS[t.entiteType!] || FileText;
                        return <Icon size={11} />;
                      })()}
                      {t.entiteNom || ENTITE_LABELS[t.entiteType] || t.entiteType}
                      <ExternalLink size={9} className="opacity-50" />
                    </Link>
                  )}

                  {/* Metadata row */}
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-neutral-500">
                    {/* Due date */}
                    {t.tacheDueDate && (
                      (() => {
                        const due = formatTaskDue(t.tacheDueDate);
                        return (
                          <span
                            className={`flex items-center gap-1 ${
                              due.isOverdue && !t.tacheCompleted
                                ? 'font-semibold text-red-500'
                                : due.isToday && !t.tacheCompleted
                                  ? 'font-medium text-amber-500'
                                  : ''
                            }`}
                          >
                            {due.isOverdue && !t.tacheCompleted ? (
                              <AlertTriangle size={13} />
                            ) : (
                              <Calendar size={13} className="text-neutral-400" />
                            )}
                            {due.text}
                          </span>
                        );
                      })()
                    )}
                    {!t.tacheCompleted && t.tacheDueDate && (
                      <div className="relative inline-flex">
                        <button
                          onClick={(e) => { e.stopPropagation(); snoozeMutation.mutate({ id: t.id, days: 1 }); }}
                          className="ml-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                          title="Reporter +1 jour"
                        >
                          +1j
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); snoozeMutation.mutate({ id: t.id, days: 3 }); }}
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                          title="Reporter +3 jours"
                        >
                          +3j
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); snoozeMutation.mutate({ id: t.id, days: 7 }); }}
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                          title="Reporter +1 semaine"
                        >
                          +7j
                        </button>
                      </div>
                    )}

                    {t.user && (
                      <span className="ml-auto text-neutral-400">
                        Assigné à {t.user.prenom} {t.user.nom}
                      </span>
                    )}
                    {!isAdchase && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditModal(t); }}
                          className="ml-2 rounded p-1 text-neutral-300 hover:bg-violet-50 hover:text-violet-500 transition-colors"
                          title="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); if(confirm('Supprimer cette tâche ?')) deleteMutation.mutate(t.id); }}
                          disabled={deleteMutation.isPending}
                          className="rounded p-1 text-neutral-300 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Adchase: expand to see email + send button */}
                  {isAdchase && !t.tacheCompleted && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : t.id)}
                        className="flex items-center gap-1 text-[12px] font-medium text-violet-600 hover:text-violet-700 transition-colors"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {isExpanded ? 'Masquer l\'email' : 'Voir l\'email'}
                      </button>

                      <button
                        onClick={() => handleAdchaseSend(t)}
                        disabled={isSending}
                        className="ml-auto flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-1.5 text-[13px] font-medium text-white hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 transition-all"
                      >
                        {isSending ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Send size={14} />
                        )}
                        {isSending ? 'Envoi en cours...' : 'Valider & Envoyer'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Expanded email preview */}
              <AnimatePresence>
                {isAdchase && isExpanded && !t.tacheCompleted && (
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
                        <span>Objet : <strong className="text-neutral-600">{t.metadata?.emailSubject || '—'}</strong></span>
                      </div>
                      <div className="whitespace-pre-wrap text-[13px] text-neutral-700 leading-relaxed">
                        {t.metadata?.emailBody || 'Aucun contenu'}
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

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Nouvelle tâche">
        <div className="space-y-4">
          <Input
            label="Titre"
            placeholder="Ex: Relancer le candidat"
            value={createForm.titre}
            onChange={(e) => setCreateForm(f => ({ ...f, titre: e.target.value }))}
          />
          <Textarea
            label="Description (optionnel)"
            placeholder="Détails de la tâche..."
            value={createForm.contenu}
            onChange={(e) => setCreateForm(f => ({ ...f, contenu: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Type d'entité"
              options={[
                { value: 'CANDIDAT', label: 'Candidat' },
                { value: 'CLIENT', label: 'Client' },
                { value: 'ENTREPRISE', label: 'Entreprise' },
                { value: 'MANDAT', label: 'Mandat' },
              ]}
              value={createForm.entiteType}
              onChange={(val) => setCreateForm(f => ({ ...f, entiteType: val }))}
            />
            <Select
              label="Priorité"
              options={[
                { value: 'HAUTE', label: 'Haute' },
                { value: 'MOYENNE', label: 'Moyenne' },
                { value: 'BASSE', label: 'Basse' },
              ]}
              value={createForm.tachePriority}
              onChange={(val) => setCreateForm(f => ({ ...f, tachePriority: val }))}
            />
          </div>
          <Input
            label="Date d'échéance"
            type="datetime-local"
            value={createForm.tacheDueDate}
            onChange={(e) => setCreateForm(f => ({ ...f, tacheDueDate: e.target.value }))}
          />
          <Input
            label="ID de l'entité liée"
            placeholder="UUID de l'entité"
            value={createForm.entiteId}
            onChange={(e) => setCreateForm(f => ({ ...f, entiteId: e.target.value }))}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Annuler</Button>
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
              {createMutation.isPending ? 'Création...' : 'Créer la tâche'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal isOpen={!!editingTask} onClose={() => setEditingTask(null)} title="Modifier la tâche">
        <div className="space-y-4">
          <Input
            label="Titre"
            placeholder="Ex: Relancer le candidat"
            value={editForm.titre}
            onChange={(e) => setEditForm(f => ({ ...f, titre: e.target.value }))}
          />
          <Textarea
            label="Description (optionnel)"
            placeholder="Détails de la tâche..."
            value={editForm.contenu}
            onChange={(e) => setEditForm(f => ({ ...f, contenu: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Priorité"
              options={[
                { value: 'HAUTE', label: 'Haute' },
                { value: 'MOYENNE', label: 'Moyenne' },
                { value: 'BASSE', label: 'Basse' },
              ]}
              value={editForm.tachePriority}
              onChange={(val) => setEditForm(f => ({ ...f, tachePriority: val }))}
            />
            <Input
              label="Date d'échéance"
              type="datetime-local"
              value={editForm.tacheDueDate}
              onChange={(e) => setEditForm(f => ({ ...f, tacheDueDate: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setEditingTask(null)}>Annuler</Button>
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
              {updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
