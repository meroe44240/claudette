import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import {
  Bell,
  BellOff,
  Clock,
  UserPlus,
  Briefcase,
  ExternalLink,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import Pagination from '../../components/ui/Pagination';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';

interface Notification {
  id: string;
  type: string;
  titre: string;
  contenu: string | null;
  lu: boolean;
  entiteType: string | null;
  entiteId: string | null;
  createdAt: string;
}

interface PaginatedNotifications {
  data: Notification[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
  unreadCount: number;
}

const typeConfig: Record<string, { icon: React.ReactNode; bg: string }> = {
  TACHE_ECHEANCE: {
    icon: <Clock size={18} className="text-[#D97706]" />,
    bg: 'bg-[#FFF7ED]',
  },
  CANDIDATURE_STAGE: {
    icon: <UserPlus size={18} className="text-[#7C5CFC]" />,
    bg: 'bg-[#F5F3FF]',
  },
  NOUVEAU_CANDIDAT: {
    icon: <UserPlus size={18} className="text-[#7C5CFC]" />,
    bg: 'bg-[#F5F3FF]',
  },
  MANDAT_UPDATE: {
    icon: <Briefcase size={18} className="text-[#3B82F6]" />,
    bg: 'bg-[#EFF6FF]',
  },
  SYSTEM: {
    icon: <Bell size={18} className="text-[#6B7194]" />,
    bg: 'bg-[#F8F8FC]',
  },
  // Fallback for existing types
  INFO: {
    icon: <Bell size={18} className="text-[#3B82F6]" />,
    bg: 'bg-[#EFF6FF]',
  },
  ALERTE: {
    icon: <Clock size={18} className="text-[#D97706]" />,
    bg: 'bg-[#FFF7ED]',
  },
  SUCCES: {
    icon: <Bell size={18} className="text-[#10B981]" />,
    bg: 'bg-[#ECFDF5]',
  },
  ERREUR: {
    icon: <Bell size={18} className="text-[#DC2626]" />,
    bg: 'bg-[#FEF2F2]',
  },
  MESSAGE: {
    icon: <Bell size={18} className="text-[#7C5CFC]" />,
    bg: 'bg-[#F5F3FF]',
  },
  MANDAT: {
    icon: <Briefcase size={18} className="text-[#3B82F6]" />,
    bg: 'bg-[#EFF6FF]',
  },
  CANDIDAT: {
    icon: <UserPlus size={18} className="text-[#7C5CFC]" />,
    bg: 'bg-[#F5F3FF]',
  },
};

const defaultTypeConfig = {
  icon: <Bell size={18} className="text-[#6B7194]" />,
  bg: 'bg-[#F8F8FC]',
};

const entityRoutes: Record<string, string> = {
  CANDIDAT: '/candidats',
  MANDAT: '/mandats',
  ENTREPRISE: '/entreprises',
  CLIENT: '/clients',
  ACTIVITE: '/activites',
};

const listStagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const listItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
};

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('unread');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const filters = new URLSearchParams({ page: String(page), perPage: '20' });
  if (activeTab === 'unread') filters.set('lu', 'false');

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', page, activeTab],
    queryFn: () => api.get<PaginatedNotifications>(`/notifications?${filters}`),
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => api.put(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => api.put('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast('success', 'Toutes les notifications marquées comme lues');
    },
    onError: () => {
      toast('error', 'Erreur lors de la mise à jour');
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.lu) {
      markAsReadMutation.mutate(notification.id);
    }

    if (notification.entiteType) {
      const basePath = entityRoutes[notification.entiteType];
      if (basePath) {
        // ACTIVITE doesn't need an ID — just go to the list
        if (notification.entiteType === 'ACTIVITE') {
          navigate(basePath);
        } else if (notification.entiteId) {
          navigate(`${basePath}/${notification.entiteId}`);
        }
      }
    }
  };

  const formatTimestamp = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "À l'instant";
    if (minutes < 60) return `Il y a ${minutes}min`;
    if (hours < 24) return `Il y a ${hours}h`;
    if (days < 7) return `Il y a ${days}j`;
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const TABS = [
    { id: 'unread', label: 'Non lues', count: data?.unreadCount },
    { id: 'all', label: 'Toutes' },
  ];

  return (
    <div className="font-['Plus_Jakarta_Sans']">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-neutral-900">Notifications</h1>
        <button
          onClick={() => markAllAsReadMutation.mutate()}
          disabled={markAllAsReadMutation.isPending || !data?.unreadCount}
          className="text-sm font-medium text-[#7C5CFC] hover:text-[#6344E0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Tout marquer comme lu
        </button>
      </div>

      {/* Pill-style tabs */}
      <div className="mb-6 flex items-center gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setPage(1); }}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-[#7C5CFC] text-white shadow-sm'
                : 'bg-transparent text-neutral-500 hover:bg-neutral-50'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
                activeTab === tab.id
                  ? 'bg-white/20 text-white'
                  : 'bg-[#7C5CFC]/10 text-[#7C5CFC]'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div className="rounded-2xl bg-white shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <Skeleton className="h-20 w-full" count={5} />
          </div>
        ) : !data?.data.length ? (
          <EmptyState
            title={
              activeTab === 'unread'
                ? 'Aucune notification non lue'
                : 'Aucune notification'
            }
            description={
              activeTab === 'unread'
                ? 'Vous êtes à jour !'
                : 'Les notifications apparaîtront ici'
            }
            icon={
              activeTab === 'unread' ? (
                <BellOff size={48} strokeWidth={1} />
              ) : (
                <Bell size={48} strokeWidth={1} />
              )
            }
          />
        ) : (
          <motion.div className="divide-y divide-neutral-100" variants={listStagger} initial="hidden" animate="show">
            {data.data.map((notification) => {
              const config = typeConfig[notification.type] || defaultTypeConfig;

              return (
                <motion.button
                  key={notification.id}
                  variants={listItem}
                  onClick={() => handleNotificationClick(notification)}
                  className={`group flex w-full items-start gap-4 px-6 py-4 text-left transition-colors duration-200 hover:bg-neutral-50 cursor-pointer ${
                    !notification.lu ? 'bg-[#F5F3FF]/50' : 'bg-white'
                  }`}
                >
                  {/* Unread dot */}
                  <div className="flex-shrink-0 mt-3 w-2">
                    {!notification.lu && (
                      <div className="h-2 w-2 rounded-full bg-[#7C5CFC]" />
                    )}
                  </div>

                  {/* Type icon */}
                  <div
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${config.bg}`}
                  >
                    {config.icon}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[15px] ${
                        !notification.lu
                          ? 'font-semibold text-neutral-900'
                          : 'font-medium text-neutral-700'
                      }`}
                    >
                      {notification.titre}
                    </p>
                    {notification.contenu && (
                      <p className="mt-0.5 text-[13px] text-neutral-500 line-clamp-2">
                        {notification.contenu}
                      </p>
                    )}
                    <span className="mt-1 inline-block text-[11px] text-neutral-300">
                      {formatTimestamp(notification.createdAt)}
                    </span>
                  </div>

                  {/* Link indicator for navigable notifications */}
                  {notification.entiteType && entityRoutes[notification.entiteType] && (
                    <div className="flex-shrink-0 mt-2 text-neutral-300 group-hover:text-[#7C5CFC] transition-colors">
                      <ExternalLink size={14} />
                    </div>
                  )}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </div>

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
  );
}
