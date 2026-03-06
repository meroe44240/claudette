import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Phone, Mail, Calendar, Link, Unlink, ExternalLink, Shield, RefreshCw, X, Check } from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';

interface IntegrationStatus {
  connected: boolean;
  email?: string;
  calendarName?: string;
  apiKeyConfigured?: boolean;
  webhookUrl?: string;
}

interface IntegrationsData {
  gmail?: IntegrationStatus;
  calendar?: IntegrationStatus;
  allo?: IntegrationStatus;
}

interface AuthUrlResponse {
  url: string;
}

export default function IntegrationsSettingsPage() {
  const queryClient = useQueryClient();
  const [alloModalOpen, setAlloModalOpen] = useState(false);
  const [alloApiKey, setAlloApiKey] = useState('');

  const { data: integrations, isLoading } = useQuery({
    queryKey: ['integrations', 'status'],
    queryFn: () => api.get<IntegrationsData>('/integrations/status'),
  });

  const saveAlloMutation = useMutation({
    mutationFn: (apiKey: string) =>
      api.put('/integrations/config/allo', {
        accessToken: apiKey,
        enabled: true,
        config: { webhookConfigured: true },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'status'] });
      toast('success', 'Allo configuré avec succès');
      setAlloModalOpen(false);
      setAlloApiKey('');
    },
    onError: () => {
      toast('error', 'Erreur lors de la configuration Allo');
    },
  });

  const disconnectAlloMutation = useMutation({
    mutationFn: () =>
      api.put('/integrations/config/allo', { enabled: false, accessToken: '' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'status'] });
      toast('success', 'Allo déconnecté');
    },
    onError: () => {
      toast('error', 'Erreur lors de la déconnexion');
    },
  });

  const syncAlloMutation = useMutation({
    mutationFn: () => api.post<{ status: string; synced?: number; message: string }>('/integrations/allo/sync'),
    onSuccess: (result) => {
      toast('success', result.message || 'Synchronisation Allo terminée');
    },
    onError: () => {
      toast('error', 'Erreur lors de la synchronisation Allo');
    },
  });

  const disconnectGmailMutation = useMutation({
    mutationFn: () => api.post('/integrations/gmail/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'status'] });
      toast('success', 'Gmail déconnecté');
    },
    onError: () => {
      toast('error', 'Erreur lors de la déconnexion');
    },
  });

  const disconnectCalendarMutation = useMutation({
    mutationFn: () => api.post('/integrations/calendar/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'status'] });
      toast('success', 'Google Calendar déconnecté');
    },
    onError: () => {
      toast('error', 'Erreur lors de la déconnexion');
    },
  });

  const syncCalendlyMutation = useMutation({
    mutationFn: () => api.post<{ calendlyEvents: number; enrichedCandidates: number; message: string }>('/integrations/calendar/sync-calendly'),
    onSuccess: (result) => {
      toast('success', result.message || 'Synchronisation Calendly terminée');
    },
    onError: () => {
      toast('error', 'Erreur lors de la synchronisation Calendly');
    },
  });

  const handleConnectGmail = async () => {
    try {
      const data = await api.get<AuthUrlResponse>('/integrations/gmail/auth-url');
      window.open(data.url, '_blank');
    } catch {
      toast('error', "Erreur lors de la récupération de l'URL d'authentification");
    }
  };

  const handleConnectCalendar = async () => {
    try {
      const data = await api.get<AuthUrlResponse>('/integrations/calendar/auth-url');
      window.open(data.url, '_blank');
    } catch {
      toast('error', "Erreur lors de la récupération de l'URL d'authentification");
    }
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title="Intégrations"
          breadcrumbs={[
            { label: 'Paramètres', href: '/settings' },
            { label: 'Intégrations' },
          ]}
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-48 w-full" count={3} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Intégrations"
        subtitle="Connectez vos outils pour une expérience unifiée"
        breadcrumbs={[
          { label: 'Paramètres', href: '/settings' },
          { label: 'Intégrations' },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Allo Card */}
        <Card>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50">
                <Phone size={18} className="text-green-600" />
              </div>
              <div>
                <h3 className="text-[18px] font-semibold text-neutral-900">Allo (Téléphonie)</h3>
                <p className="mt-0.5 text-[13px] text-neutral-500">
                  Intégration téléphonique pour vos appels
                </p>
              </div>
            </div>
            <Badge variant={integrations?.allo?.connected ? 'success' : 'default'}>
              {integrations?.allo?.connected ? 'Connecté' : 'Déconnecté'}
            </Badge>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center gap-2 text-neutral-500">
              <Shield size={14} className="text-neutral-300" />
              <span>
                Clé API :{' '}
                {integrations?.allo?.apiKeyConfigured ? (
                  <span className="font-medium text-neutral-900">{'*'.repeat(20)}</span>
                ) : (
                  <span className="text-neutral-300">Non configurée</span>
                )}
              </span>
            </div>
            <div className="rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-500">
              <span className="font-medium">Webhook URL :</span>
              <br />
              <span className="break-all">{window.location.origin}/api/v1/integrations/allo/webhook</span>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {integrations?.allo?.connected ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => syncAlloMutation.mutate()}
                  disabled={syncAlloMutation.isPending}
                >
                  <RefreshCw size={14} className={syncAlloMutation.isPending ? 'animate-spin' : ''} />
                  {syncAlloMutation.isPending ? 'Synchronisation...' : 'Synchroniser les appels'}
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onClick={() => { setAlloApiKey(''); setAlloModalOpen(true); }}
                  >
                    Reconfigurer
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onClick={() => disconnectAlloMutation.mutate()}
                    disabled={disconnectAlloMutation.isPending}
                  >
                    <Unlink size={14} />
                    Déconnecter
                  </Button>
                </div>
              </>
            ) : (
              <Button size="sm" className="w-full" onClick={() => setAlloModalOpen(true)}>
                <Link size={14} />
                Configurer Allo
              </Button>
            )}
          </div>
        </Card>

        {/* Allo Config Modal */}
        {alloModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Phone size={18} className="text-green-600" />
                  <h3 className="text-lg font-semibold text-neutral-900">Configurer Allo</h3>
                </div>
                <button onClick={() => setAlloModalOpen(false)} className="text-neutral-400 hover:text-neutral-600">
                  <X size={18} />
                </button>
              </div>
              <p className="text-[13px] text-neutral-500 mb-4">
                Entrez votre clé API Allo pour activer l'intégration téléphonique.
              </p>
              <input
                type="password"
                value={alloApiKey}
                onChange={e => setAlloApiKey(e.target.value)}
                placeholder="Clé API Allo (ex: allo_xxxxxxxxxxxx)"
                className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                autoFocus
              />
              <div className="flex gap-2 mt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => setAlloModalOpen(false)}
                >
                  Annuler
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => saveAlloMutation.mutate(alloApiKey)}
                  disabled={!alloApiKey.trim() || saveAlloMutation.isPending}
                >
                  <Check size={14} />
                  {saveAlloMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Gmail Card */}
        <Card>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50">
                <Mail size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-[18px] font-semibold text-neutral-900">Gmail</h3>
                <p className="mt-0.5 text-[13px] text-neutral-500">
                  Envoyez des emails directement depuis HumanUp
                </p>
              </div>
            </div>
            <Badge variant={integrations?.gmail?.connected ? 'success' : 'default'}>
              {integrations?.gmail?.connected ? 'Connecté' : 'Déconnecté'}
            </Badge>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            {integrations?.gmail?.connected && integrations.gmail.email && (
              <div className="flex items-center gap-2 text-neutral-500">
                <Mail size={14} className="text-neutral-300" />
                <span className="font-medium text-neutral-900">{integrations.gmail.email}</span>
              </div>
            )}
            {!integrations?.gmail?.connected && (
              <p className="text-neutral-300">
                Connectez votre compte Gmail pour envoyer des emails directement depuis HumanUp.
              </p>
            )}
          </div>

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

        {/* Google Calendar Card */}
        <Card>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                <Calendar size={18} className="text-blue-500" />
              </div>
              <div>
                <h3 className="text-[18px] font-semibold text-neutral-900">Google Calendar</h3>
                <p className="mt-0.5 text-[13px] text-neutral-500">
                  Synchronisez votre agenda et planifiez des rendez-vous
                </p>
              </div>
            </div>
            <Badge variant={integrations?.calendar?.connected ? 'success' : 'default'}>
              {integrations?.calendar?.connected ? 'Connecté' : 'Déconnecté'}
            </Badge>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            {integrations?.calendar?.connected && integrations.calendar.calendarName && (
              <div className="flex items-center gap-2 text-neutral-500">
                <Calendar size={14} className="text-neutral-300" />
                <span className="font-medium text-neutral-900">{integrations.calendar.calendarName}</span>
              </div>
            )}
            {integrations?.calendar?.connected && integrations.calendar.email && (
              <div className="flex items-center gap-2 text-neutral-500">
                <Mail size={14} className="text-neutral-300" />
                <span className="font-medium text-neutral-900">{integrations.calendar.email}</span>
              </div>
            )}
            {!integrations?.calendar?.connected && (
              <p className="text-neutral-300">
                Connectez Google Calendar pour planifier des rendez-vous et synchroniser votre agenda.
              </p>
            )}
          </div>

          <div className="mt-4 space-y-2">
            {integrations?.calendar?.connected ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => syncCalendlyMutation.mutate()}
                  disabled={syncCalendlyMutation.isPending}
                >
                  <RefreshCw size={14} className={syncCalendlyMutation.isPending ? 'animate-spin' : ''} />
                  {syncCalendlyMutation.isPending ? 'Synchronisation...' : 'Sync Calendly → Candidats'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => disconnectCalendarMutation.mutate()}
                  disabled={disconnectCalendarMutation.isPending}
                >
                  <Unlink size={14} />
                  {disconnectCalendarMutation.isPending ? 'Déconnexion...' : 'Déconnecter'}
                </Button>
              </>
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
    </div>
  );
}
