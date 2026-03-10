import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertTriangle, AlertOctagon, Info, Users, Briefcase,
  Clock, UserCheck, RefreshCw, Wand2,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import Badge from '../../components/ui/Badge';
import { toast } from '../../components/ui/Toast';

interface AlertItem {
  type: 'stagnant_candidature' | 'dormant_mandat' | 'overdue_task' | 'placement_followup' | 'cold_candidat';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  entityType: string;
  entityId: string;
}

const severityConfig = {
  critical: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: AlertOctagon, label: 'Critique' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: AlertTriangle, label: 'Attention' },
  info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600', icon: Info, label: 'Info' },
};

const typeConfig: Record<string, { icon: typeof Users; label: string }> = {
  stagnant_candidature: { icon: Users, label: 'Candidature stagnante' },
  dormant_mandat: { icon: Briefcase, label: 'Mandat dormant' },
  overdue_task: { icon: Clock, label: 'Tache en retard' },
  placement_followup: { icon: UserCheck, label: 'Follow-up placement' },
  cold_candidat: { icon: Users, label: 'Candidat froid' },
};

export default function AlertsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard-alerts'],
    queryFn: () => api.get<{ alerts: AlertItem[]; tasksCreated: number }>('/dashboard/alerts'),
  });

  const createTasksMutation = useMutation({
    mutationFn: () => api.post('/dashboard/alerts/create-tasks'),
    onSuccess: (res: any) => {
      toast('success', res.data?.message || 'Taches creees');
      queryClient.invalidateQueries({ queryKey: ['dashboard-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['taches'] });
    },
    onError: () => toast('error', 'Erreur lors de la creation des taches'),
  });

  const alerts = data?.alerts || [];
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const infoCount = alerts.filter(a => a.severity === 'info').length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Centre d'alertes"
          subtitle="Candidatures stagnantes, mandats dormants, taches en retard"
        />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
          {criticalCount > 0 && (
            <Button
              onClick={() => createTasksMutation.mutate()}
              disabled={createTasksMutation.isPending}
            >
              <Wand2 className="mr-2 h-4 w-4" />
              Creer les taches ({criticalCount})
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Critiques', count: criticalCount, config: severityConfig.critical },
          { label: 'Attention', count: warningCount, config: severityConfig.warning },
          { label: 'Informations', count: infoCount, config: severityConfig.info },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`rounded-xl border p-4 ${card.config.bg} ${card.config.border}`}
          >
            <div className="flex items-center gap-3">
              <card.config.icon className={`h-6 w-6 ${card.config.text}`} />
              <div>
                <p className={`text-2xl font-bold ${card.config.text}`}>{card.count}</p>
                <p className="text-sm text-neutral-500">{card.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Alert list */}
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : alerts.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-12 text-center">
          <p className="text-lg font-semibold text-emerald-700">Aucune alerte</p>
          <p className="mt-1 text-sm text-emerald-600">Tout est en ordre dans votre pipeline</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert, i) => {
            const sev = severityConfig[alert.severity];
            const typ = typeConfig[alert.type] || typeConfig.stagnant_candidature;

            return (
              <motion.div
                key={`${alert.entityId}-${alert.type}-${i}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`rounded-xl border p-4 ${sev.bg} ${sev.border}`}
              >
                <div className="flex items-start gap-3">
                  <sev.icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${sev.text}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-neutral-900">{alert.title}</span>
                      <Badge variant={alert.severity === 'critical' ? 'error' : alert.severity === 'warning' ? 'warning' : 'info'}>
                        {typ.label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-neutral-600">{alert.description}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
