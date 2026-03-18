import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Briefcase,
  Check,
  Circle,
  Clock,
  AlertTriangle,
  Users,
  ListChecks,
  CheckCircle2,
  Mail,
  Calendar,
  Link,
  Unlink,
  ExternalLink,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { toast } from '../../components/ui/Toast';
import { useAuthStore } from '../../stores/auth-store';
import AgendaWidget from '../../components/calendar/AgendaWidget';
import PageHeader from '../../components/ui/PageHeader';

interface MandatRecruteur {
  id: string;
  titrePoste: string;
  entreprise: { nom: string } | null;
  stageCounts: Record<string, number>;
  totalCandidatures: number;
}

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

interface RecruteurDashboard {
  mandats: MandatRecruteur[];
  activitesRecentes: Array<{
    id: string;
    type: string;
    titre: string | null;
    contenu: string | null;
    source: string;
    createdAt: string;
  }>;
}

interface TachesResponse {
  data: Tache[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

const stageLabels: Record<string, string> = {
  SOURCING: 'Sourcing',
  CONTACTE: 'Contacté',
  ENTRETIEN_1: 'Entretien 1',
  ENTRETIEN_CLIENT: 'Entretien Client',
  OFFRE: 'Offre',
  PLACE: 'Placé',
  REFUSE: 'Refusé',
};

const roleLabels: Record<string, string> = {
  ADMIN: 'Administrateur',
  RECRUTEUR: 'Recruteur',
};

const sectionStagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const sectionItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
};

interface IntegrationStatus {
  connected: boolean;
  email?: string;
  calendarName?: string;
}

interface IntegrationsData {
  gmail?: IntegrationStatus;
  calendar?: IntegrationStatus;
}

export default function MonEspacePage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [showOverdue, setShowOverdue] = useState(false);

  // --- Integrations (Gmail / Calendar) ---
  const { data: integrations, isLoading: loadingIntegrations } = useQuery({
    queryKey: ['integrations', 'status'],
    queryFn: () => api.get<IntegrationsData>('/integrations/status'),
  });

  const disconnectGmailMutation = useMutation({
    mutationFn: () => api.post('/integrations/gmail/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'status'] });
      toast('success', 'Gmail déconnecté');
    },
    onError: () => toast('error', 'Erreur lors de la déconnexion'),
  });

  const disconnectCalendarMutation = useMutation({
    mutationFn: () => api.post('/integrations/calendar/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'status'] });
      toast('success', 'Google Calendar déconnecté');
    },
    onError: () => toast('error', 'Erreur lors de la déconnexion'),
  });

  const handleConnectGmail = async () => {
    try {
      const data = await api.get<{ url: string }>('/integrations/gmail/auth-url');
      window.open(data.url, '_blank');
    } catch {
      toast('error', "Erreur lors de la récupération de l'URL d'authentification");
    }
  };

  const handleConnectCalendar = async () => {
    try {
      const data = await api.get<{ url: string }>('/integrations/calendar/auth-url');
      window.open(data.url, '_blank');
    } catch {
      toast('error', "Erreur lors de la récupération de l'URL d'authentification");
    }
  };

  const { data: dashboard, isLoading: loadingDashboard } = useQuery({
    queryKey: ['dashboard', 'recruteur'],
    queryFn: () => api.get<RecruteurDashboard>('/dashboard/recruteur'),
  });

  const { data: tachesData, isLoading: loadingTaches, refetch: refetchTaches } = useQuery({
    queryKey: ['mon-espace', 'taches', showOverdue ? 'overdue' : 'todo'],
    queryFn: () =>
      api.get<TachesResponse>(
        `/taches?status=${showOverdue ? 'overdue' : 'todo'}&perPage=10`,
      ),
  });

  const toggleCompletion = async (id: string, current: boolean) => {
    try {
      await api.put(`/taches/${id}/complete`, {});
      refetchTaches();
      toast('success', current ? 'Tâche réouverte' : 'Tâche terminée');
    } catch {
      toast('error', 'Erreur lors de la mise à jour');
    }
  };

  const isOverdue = (date: string | null) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  const mandatsCount = dashboard?.mandats?.length ?? 0;
  const totalCandidats = dashboard?.mandats?.reduce((sum, m) => sum + m.totalCandidatures, 0) ?? 0;
  const tachesCount = tachesData?.meta?.total ?? 0;

  const initials = user
    ? `${(user.prenom || '')[0] || ''}${(user.nom || '')[0] || ''}`.toUpperCase()
    : '?';

  return (
    <motion.div className="font-['Plus_Jakarta_Sans']" variants={sectionStagger} initial="hidden" animate="show">
      <PageHeader
        title="Mon espace"
        breadcrumbs={[{ label: 'Mon espace' }]}
      />
      {/* Header: Avatar + User info */}
      <motion.div className="mb-6 flex items-center gap-5" variants={sectionItem}>
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#7C5CFC] to-[#A78BFA] text-[22px] font-bold text-white shadow-lg">
          {initials}
        </div>
        <div>
          <h1 className="text-[28px] font-bold text-neutral-900">
            {user?.prenom} {user?.nom}
          </h1>
          <p className="text-[15px] text-neutral-500">
            {roleLabels[user?.role || ''] || user?.role || ''}
          </p>
        </div>
      </motion.div>

      {/* Mini KPI pills */}
      <motion.div className="mb-8 flex flex-wrap items-center gap-3" variants={sectionItem}>
        <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 shadow-sm">
          <Briefcase size={16} className="text-[#7C5CFC]" />
          <span className="text-sm font-semibold text-neutral-700">{mandatsCount} mandats actifs</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 shadow-sm">
          <Users size={16} className="text-[#3B82F6]" />
          <span className="text-sm font-semibold text-neutral-700">{totalCandidats} candidats en cours</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 shadow-sm">
          <ListChecks size={16} className="text-[#10B981]" />
          <span className="text-sm font-semibold text-neutral-700">{tachesCount} tâches</span>
        </div>
      </motion.div>

      {/* Mes Mandats */}
      <motion.section className="mb-8" variants={sectionItem}>
        <h2 className="mb-3 text-lg font-semibold text-neutral-900">Mes Mandats</h2>
        {loadingDashboard ? (
          <Skeleton className="h-24 w-full" count={3} />
        ) : !dashboard?.mandats?.length ? (
          <Card>
            <EmptyState
              title="Aucun mandat actif"
              description="Vos mandats actifs apparaîtront ici"
              icon={<Briefcase size={40} strokeWidth={1} />}
            />
          </Card>
        ) : (
          <Card>
            <div className="divide-y divide-neutral-100">
              {/* Mini table header */}
              <div className="grid grid-cols-12 gap-4 pb-3 text-[12px] font-semibold uppercase tracking-wider text-neutral-400">
                <div className="col-span-4">Poste</div>
                <div className="col-span-3">Entreprise</div>
                <div className="col-span-2 text-center">Candidats</div>
                <div className="col-span-3">Étapes</div>
              </div>
              {dashboard.mandats.map((mandat) => (
                <div key={mandat.id} className="grid grid-cols-12 items-center gap-4 py-3">
                  <div className="col-span-4">
                    <p className="truncate text-sm font-semibold text-neutral-900">{mandat.titrePoste}</p>
                  </div>
                  <div className="col-span-3">
                    <p className="truncate text-sm text-neutral-500">
                      {mandat.entreprise?.nom || '-'}
                    </p>
                  </div>
                  <div className="col-span-2 text-center">
                    <Badge variant="info">
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {mandat.totalCandidatures}
                      </span>
                    </Badge>
                  </div>
                  <div className="col-span-3 flex flex-wrap gap-1">
                    {Object.entries(mandat.stageCounts).map(([stage, count]) =>
                      count > 0 ? (
                        <span
                          key={stage}
                          className="inline-flex items-center gap-1 rounded-md bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-500"
                        >
                          {stageLabels[stage] || stage}: {count}
                        </span>
                      ) : null,
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </motion.section>

      {/* Mes Tâches */}
      <motion.section className="mb-8" variants={sectionItem}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Mes tâches</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setShowOverdue(false)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                !showOverdue
                  ? 'bg-[#7C5CFC] text-white shadow-sm'
                  : 'bg-transparent text-neutral-500 hover:bg-neutral-50'
              }`}
            >
              À faire
            </button>
            <button
              onClick={() => setShowOverdue(true)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                showOverdue
                  ? 'bg-red-500 text-white shadow-sm'
                  : 'bg-transparent text-neutral-500 hover:bg-neutral-50'
              }`}
            >
              En retard
            </button>
          </div>
        </div>
        {loadingTaches ? (
          <Skeleton className="h-14 w-full" count={4} />
        ) : !tachesData?.data?.length ? (
          <Card>
            <EmptyState
              title={showOverdue ? 'Aucune tâche en retard' : 'Aucune tâche à faire'}
              description="Vous êtes à jour !"
              icon={<CheckCircle2 size={40} strokeWidth={1} />}
            />
          </Card>
        ) : (
          <Card>
            <div className="divide-y divide-neutral-100">
              {tachesData.data.map((tache) => (
                <div key={tache.id} className="flex items-start gap-3 py-3 transition-colors hover:bg-neutral-50 -mx-6 px-6">
                  <button
                    onClick={() => toggleCompletion(tache.id, tache.tacheCompleted)}
                    className="mt-0.5 flex-shrink-0"
                  >
                    {tache.tacheCompleted ? (
                      <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#10B981]">
                        <Check size={14} className="text-white" strokeWidth={3} />
                      </div>
                    ) : (
                      <div className="h-[22px] w-[22px] rounded-full border-2 border-neutral-300 hover:border-[#7C5CFC] transition-colors" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold ${
                        tache.tacheCompleted
                          ? 'text-neutral-300 line-through'
                          : 'text-neutral-900'
                      }`}
                    >
                      {tache.titre}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-neutral-500">
                      {tache.tacheDueDate && (
                        <span
                          className={`flex items-center gap-1 ${
                            !tache.tacheCompleted && isOverdue(tache.tacheDueDate)
                              ? 'font-semibold text-red-500'
                              : ''
                          }`}
                        >
                          {!tache.tacheCompleted && isOverdue(tache.tacheDueDate) ? (
                            <AlertTriangle size={12} />
                          ) : (
                            <Clock size={12} />
                          )}
                          {formatDate(tache.tacheDueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </motion.section>

      {/* Agenda */}
      <motion.section className="mb-8" variants={sectionItem}>
        <AgendaWidget />
      </motion.section>

      {/* Mes Intégrations */}
      <motion.section className="mb-8" variants={sectionItem}>
        <h2 className="mb-3 text-lg font-semibold text-neutral-900">Mes Intégrations</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Gmail */}
          <Card>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50">
                  <Mail size={18} className="text-red-500" />
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold text-neutral-900">Gmail</h3>
                  <p className="mt-0.5 text-[13px] text-neutral-500">
                    Envoyez des emails depuis HumanUp
                  </p>
                </div>
              </div>
              <Badge variant={integrations?.gmail?.connected ? 'success' : 'default'}>
                {integrations?.gmail?.connected ? 'Connecté' : 'Déconnecté'}
              </Badge>
            </div>
            {integrations?.gmail?.connected && integrations.gmail.email && (
              <div className="mt-3 flex items-center gap-2 text-sm text-neutral-500">
                <Mail size={14} className="text-neutral-300" />
                <span className="font-medium text-neutral-900">{integrations.gmail.email}</span>
              </div>
            )}
            <div className="mt-4">
              {integrations?.gmail?.connected ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => disconnectGmailMutation.mutate()}
                  disabled={disconnectGmailMutation.isPending}
                >
                  <Unlink size={14} />
                  {disconnectGmailMutation.isPending ? 'Déconnexion...' : 'Déconnecter'}
                </Button>
              ) : (
                <Button size="sm" className="w-full" onClick={handleConnectGmail}>
                  <Link size={14} />
                  Connecter Gmail
                  <ExternalLink size={12} />
                </Button>
              )}
            </div>
          </Card>

          {/* Google Calendar */}
          <Card>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                  <Calendar size={18} className="text-blue-500" />
                </div>
                <div>
                  <h3 className="text-[16px] font-semibold text-neutral-900">Google Calendar</h3>
                  <p className="mt-0.5 text-[13px] text-neutral-500">
                    Synchronisez votre agenda
                  </p>
                </div>
              </div>
              <Badge variant={integrations?.calendar?.connected ? 'success' : 'default'}>
                {integrations?.calendar?.connected ? 'Connecté' : 'Déconnecté'}
              </Badge>
            </div>
            {integrations?.calendar?.connected && integrations.calendar.email && (
              <div className="mt-3 flex items-center gap-2 text-sm text-neutral-500">
                <Calendar size={14} className="text-neutral-300" />
                <span className="font-medium text-neutral-900">{integrations.calendar.email}</span>
              </div>
            )}
            <div className="mt-4">
              {integrations?.calendar?.connected ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => disconnectCalendarMutation.mutate()}
                  disabled={disconnectCalendarMutation.isPending}
                >
                  <Unlink size={14} />
                  {disconnectCalendarMutation.isPending ? 'Déconnexion...' : 'Déconnecter'}
                </Button>
              ) : (
                <Button size="sm" className="w-full" onClick={handleConnectCalendar}>
                  <Link size={14} />
                  Connecter Google Calendar
                  <ExternalLink size={12} />
                </Button>
              )}
            </div>
          </Card>
        </div>
      </motion.section>
    </motion.div>
  );
}
