import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Clock, AlertTriangle, Calendar, Plus } from 'lucide-react';
import { api } from '../../lib/api-client';
import Badge from '../../components/ui/Badge';
import Pagination from '../../components/ui/Pagination';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import Button from '../../components/ui/Button';
import { toast } from '../../components/ui/Toast';

interface Tache {
  id: string;
  titre: string;
  contenu: string | null;
  type: string;
  tacheDueDate: string | null;
  tacheCompleted: boolean;
  createdAt: string;
  user?: { nom: string; prenom: string | null };
}

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
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('todo');

  const filters = new URLSearchParams({ page: String(page), perPage: '20' });
  if (activeTab !== 'all') filters.set('status', activeTab);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['taches', page, activeTab],
    queryFn: () => api.get<PaginatedResponse>(`/taches?${filters}`),
  });

  const toggleCompletion = async (id: string, current: boolean) => {
    try {
      await api.put(`/taches/${id}/complete`, {});
      refetch();
      toast('success', current ? 'Tâche réouverte' : 'Tâche terminée');
    } catch {
      toast('error', 'Erreur lors de la mise à jour');
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
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-neutral-900">Tâches</h1>
        <Button variant="primary">
          <Plus size={16} /> Nouvelle tâche
        </Button>
      </div>

      {/* Pill-style tabs */}
      <div className="mb-6 flex items-center gap-1">
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
          {data.data.map((t) => (
            <motion.div
              key={t.id}
              variants={listItem}
              className="group flex items-start gap-3 rounded-2xl bg-white p-4 shadow-card transition-colors duration-200 hover:bg-neutral-50"
            >
              {/* Circle checkbox */}
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

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p
                    className={`text-[15px] font-semibold ${
                      t.tacheCompleted
                        ? 'text-neutral-300 line-through'
                        : 'text-neutral-900'
                    }`}
                  >
                    {t.titre}
                  </p>

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

                {/* Metadata row */}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-neutral-500">
                  {/* Due date */}
                  {t.tacheDueDate && (
                    <span
                      className={`flex items-center gap-1 ${
                        !t.tacheCompleted && isOverdue(t.tacheDueDate)
                          ? 'font-semibold text-red-500'
                          : ''
                      }`}
                    >
                      {!t.tacheCompleted && isOverdue(t.tacheDueDate) ? (
                        <AlertTriangle size={13} />
                      ) : (
                        <Calendar size={13} className="text-neutral-400" />
                      )}
                      {formatDate(t.tacheDueDate)}
                    </span>
                  )}

                  {t.user && (
                    <span className="ml-auto text-neutral-400">
                      Assigné à {t.user.prenom} {t.user.nom}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
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
    </div>
  );
}
