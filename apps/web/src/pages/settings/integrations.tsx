import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Phone, Mail, Calendar, Link, Unlink, ExternalLink, Shield, RefreshCw, X, Check, Building2, HardDrive, Folder } from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { t } from '../../lib/i18n';

interface IntegrationStatus {
  connected: boolean;
  email?: string;
  calendarName?: string;
  apiKeyConfigured?: boolean;
  webhookUrl?: string;
}

interface PappersStatus {
  connected: boolean;
  tokensUsed?: number;
  tokensRemaining?: number;
}

interface IntegrationsData {
  gmail?: IntegrationStatus;
  calendar?: IntegrationStatus;
  allo?: IntegrationStatus;
  pappers?: PappersStatus;
}

interface AuthUrlResponse {
  url: string;
}

export default function IntegrationsSettingsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [alloModalOpen, setAlloModalOpen] = useState(false);
  const [alloApiKey, setAlloApiKey] = useState('');
  const [driveFolderId, setDriveFolderId] = useState('');

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
      toast('success', t('Allo configuré avec succès'));
      setAlloModalOpen(false);
      setAlloApiKey('');
    },
    onError: () => {
      toast('error', t('Erreur lors de la configuration Allo'));
    },
  });

  const disconnectAlloMutation = useMutation({
    mutationFn: () =>
      api.put('/integrations/config/allo', { enabled: false, accessToken: '' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'status'] });
      toast('success', t('Allo déconnecté'));
    },
    onError: () => {
      toast('error', t('Erreur lors de la déconnexion'));
    },
  });

  const syncAlloMutation = useMutation({
    mutationFn: () => api.post<{ status: string; synced?: number; message: string }>('/integrations/allo/sync'),
    onSuccess: (result) => {
      toast('success', result.message || t('Synchronisation Allo terminée'));
    },
    onError: () => {
      toast('error', t('Erreur lors de la synchronisation Allo'));
    },
  });

  const disconnectGmailMutation = useMutation({
    mutationFn: () => api.post('/integrations/gmail/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'status'] });
      toast('success', t('Gmail déconnecté'));
    },
    onError: () => {
      toast('error', t('Erreur lors de la déconnexion'));
    },
  });

  const disconnectCalendarMutation = useMutation({
    mutationFn: () => api.post('/integrations/calendar/disconnect'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations', 'status'] });
      toast('success', t('Google Calendar déconnecté'));
    },
    onError: () => {
      toast('error', t('Erreur lors de la déconnexion'));
    },
  });

  const syncCalendlyMutation = useMutation({
    mutationFn: () => api.post<{ calendlyEvents: number; enrichedCandidates: number; message: string }>('/integrations/calendar/sync-calendly'),
    onSuccess: (result) => {
      toast('success', result.message || t('Synchronisation Calendly terminée'));
    },
    onError: () => {
      toast('error', t('Erreur lors de la synchronisation Calendly'));
    },
  });

  // Google Drive rides the same Google OAuth as Gmail (scope drive.readonly).
  const watchDriveMutation = useMutation({
    mutationFn: (folderId: string) => api.put('/transcripts/watch', { folderId }),
    onSuccess: () => {
      toast('success', t('Dossier Drive surveillé'));
    },
    onError: () => {
      toast('error', t('Dossier Drive introuvable ou accès refusé'));
    },
  });

  const scanDriveMutation = useMutation({
    mutationFn: () => api.post<{ processed?: number; message?: string }>('/transcripts/scan-folder'),
    onSuccess: (result) => {
      toast('success', result?.message || t('Dossier Drive scanné'));
    },
    onError: () => {
      toast('error', t('Erreur lors du scan du dossier Drive'));
    },
  });

  const handleConnectDrive = async () => {
    try {
      const data = await api.get<AuthUrlResponse>('/integrations/gmail/auth-url');
      window.open(data.url, '_blank');
    } catch {
      toast('error', t("Erreur lors de la récupération de l'URL d'authentification Google"));
    }
  };

  const handleConnectGmail = async () => {
    try {
      const data = await api.get<AuthUrlResponse>('/integrations/gmail/auth-url');
      window.open(data.url, '_blank');
    } catch {
      toast('error', t("Erreur lors de la récupération de l'URL d'authentification"));
    }
  };

  const handleConnectCalendar = async () => {
    try {
      const data = await api.get<AuthUrlResponse>('/integrations/calendar/auth-url');
      window.open(data.url, '_blank');
    } catch {
      toast('error', t("Erreur lors de la récupération de l'URL d'authentification"));
    }
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader
          title={t('Intégrations')}
          breadcrumbs={[
            { label: t('Paramètres'), href: '/settings' },
            { label: t('Intégrations') },
          ]}
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-48 w-full" count={3} />
        </div>
      </div>
    );
  }

  const googleConnected = !!(integrations?.gmail?.connected || integrations?.calendar?.connected);

  return (
    <div>
      <div className="rise" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 13, color: '#9A96AE', fontWeight: 600 }}>{t('Administration')}</div>
          <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 38, letterSpacing: '-0.035em', color: '#1A1533', marginTop: 4 }}>{t('Mes intégrations')}</h1>
          <div style={{ fontSize: 13.5, color: '#6E6A85', marginTop: 6 }}>{t('Connectez vos outils pour une expérience unifiée.')}</div>
        </div>
        <Button variant="secondary" onClick={() => navigate('/settings/integrations/guide')}>
          📖 {t('Guide de connexion')}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Allo Card */}
        <Card>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50">
                <Phone size={18} className="text-green-600" />
              </div>
              <div>
                <h3 className="text-[18px] font-semibold text-neutral-900">{t('Allo (Téléphonie)')}</h3>
                <p className="mt-0.5 text-[13px] text-neutral-500">
                  {t('Intégration téléphonique pour vos appels')}
                </p>
              </div>
            </div>
            <Badge variant={integrations?.allo?.connected ? 'success' : 'default'}>
              {integrations?.allo?.connected ? t('Connecté') : t('Déconnecté')}
            </Badge>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center gap-2 text-neutral-500">
              <Shield size={14} className="text-neutral-300" />
              <span>
                {t('Clé API :')}{' '}
                {integrations?.allo?.apiKeyConfigured ? (
                  <span className="font-medium text-neutral-900">{'*'.repeat(20)}</span>
                ) : (
                  <span className="text-neutral-300">{t('Non configurée')}</span>
                )}
              </span>
            </div>
            <div className="rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-500">
              <span className="font-medium">{t('Webhook URL :')}</span>
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
                  {syncAlloMutation.isPending ? t('Synchronisation...') : t('Synchroniser les appels')}
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onClick={() => { setAlloApiKey(''); setAlloModalOpen(true); }}
                  >
                    {t('Reconfigurer')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onClick={() => disconnectAlloMutation.mutate()}
                    disabled={disconnectAlloMutation.isPending}
                  >
                    <Unlink size={14} />
                    {t('Déconnecter')}
                  </Button>
                </div>
              </>
            ) : (
              <Button size="sm" className="w-full" onClick={() => setAlloModalOpen(true)}>
                <Link size={14} />
                {t('Configurer Allo')}
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
                  <h3 className="text-lg font-semibold text-neutral-900">{t('Configurer Allo')}</h3>
                </div>
                <button onClick={() => setAlloModalOpen(false)} className="text-neutral-400 hover:text-neutral-600">
                  <X size={18} />
                </button>
              </div>
              <p className="text-[13px] text-neutral-500 mb-4">
                {t("Entrez votre clé API Allo pour activer l'intégration téléphonique.")}
              </p>
              <input
                type="password"
                value={alloApiKey}
                onChange={e => setAlloApiKey(e.target.value)}
                placeholder={t('Clé API Allo (ex: allo_xxxxxxxxxxxx)')}
                className="w-full rounded-lg border border-[rgba(34,23,122,0.14)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[rgba(34,23,122,0.1)] focus:border-[#22177A]"
                autoFocus
              />
              <div className="flex gap-2 mt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => setAlloModalOpen(false)}
                >
                  {t('Annuler')}
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => saveAlloMutation.mutate(alloApiKey)}
                  disabled={!alloApiKey.trim() || saveAlloMutation.isPending}
                >
                  <Check size={14} />
                  {saveAlloMutation.isPending ? t('Sauvegarde...') : t('Sauvegarder')}
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
                  {t('Envoyez des emails directement depuis HumanUp')}
                </p>
              </div>
            </div>
            <Badge variant={integrations?.gmail?.connected ? 'success' : 'default'}>
              {integrations?.gmail?.connected ? t('Connecté') : t('Déconnecté')}
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
                {t('Connectez votre compte Gmail pour envoyer des emails directement depuis HumanUp.')}
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
                {disconnectGmailMutation.isPending ? t('Déconnexion...') : t('Déconnecter')}
              </Button>
            ) : (
              <Button size="sm" className="w-full" onClick={handleConnectGmail}>
                <Link size={14} />
                {t('Connecter Gmail')}
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
                  {t('Synchronisez votre agenda et planifiez des rendez-vous')}
                </p>
              </div>
            </div>
            <Badge variant={integrations?.calendar?.connected ? 'success' : 'default'}>
              {integrations?.calendar?.connected ? t('Connecté') : t('Déconnecté')}
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
                {t('Connectez Google Calendar pour planifier des rendez-vous et synchroniser votre agenda.')}
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
                  {syncCalendlyMutation.isPending ? t('Synchronisation...') : t('Sync Calendly -> Candidats')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => disconnectCalendarMutation.mutate()}
                  disabled={disconnectCalendarMutation.isPending}
                >
                  <Unlink size={14} />
                  {disconnectCalendarMutation.isPending ? t('Déconnexion...') : t('Déconnecter')}
                </Button>
              </>
            ) : (
              <Button size="sm" className="w-full" onClick={handleConnectCalendar}>
                <Link size={14} />
                {t('Connecter Google Calendar')}
                <ExternalLink size={12} />
              </Button>
            )}
          </div>
        </Card>

        {/* Google Drive Card */}
        <Card>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-50">
                <HardDrive size={18} className="text-yellow-600" />
              </div>
              <div>
                <h3 className="text-[18px] font-semibold text-neutral-900">Google Drive</h3>
                <p className="mt-0.5 text-[13px] text-neutral-500">
                  {t('Importez CV et comptes-rendus depuis un dossier Drive')}
                </p>
              </div>
            </div>
            <Badge variant={googleConnected ? 'success' : 'default'}>
              {googleConnected ? t('Connecté') : t('Déconnecté')}
            </Badge>
          </div>

          {googleConnected ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-neutral-500">
                <Shield size={14} className="text-neutral-300" />
                <span>
                  {t('Accès via votre compte Google')}
                  {integrations?.gmail?.email && (
                    <span className="font-medium text-neutral-900"> ({integrations.gmail.email})</span>
                  )}
                </span>
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">
                  {t('Dossier Drive à surveiller')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={driveFolderId}
                    onChange={(e) => setDriveFolderId(e.target.value)}
                    placeholder={t('ID du dossier Drive (ex: 1a2B3c...)')}
                    className="w-full rounded-lg border border-[rgba(34,23,122,0.14)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[rgba(34,23,122,0.1)] focus:border-[#22177A]"
                  />
                  <Button
                    size="sm"
                    onClick={() => watchDriveMutation.mutate(driveFolderId)}
                    disabled={!driveFolderId.trim() || watchDriveMutation.isPending}
                  >
                    <Folder size={14} />
                    {watchDriveMutation.isPending ? '...' : t('Surveiller')}
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-neutral-400">
                  {t('CV et comptes-rendus déposés dans ce dossier sont importés automatiquement.')}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => scanDriveMutation.mutate()}
                disabled={scanDriveMutation.isPending}
              >
                <RefreshCw size={14} className={scanDriveMutation.isPending ? 'animate-spin' : ''} />
                {scanDriveMutation.isPending ? t('Scan en cours...') : t('Scanner le dossier maintenant')}
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-neutral-300">
                {t('Connectez votre compte Google pour accéder à Drive (import de CV et comptes-rendus).')}
              </p>
              <Button size="sm" className="w-full" onClick={handleConnectDrive}>
                <Link size={14} />
                {t('Connecter Google Drive')}
                <ExternalLink size={12} />
              </Button>
            </div>
          )}
        </Card>

        {/* Pappers Card */}
        <Card>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
                <Building2 size={18} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-[18px] font-semibold text-neutral-900">Pappers</h3>
                <p className="mt-0.5 text-[13px] text-neutral-500">
                  {t('Enrichissez vos entreprises avec les données légales et financières (SIREN, SIRET, capital, effectif...)')}
                </p>
              </div>
            </div>
            <Badge variant={integrations?.pappers?.connected ? 'success' : 'error'}>
              {integrations?.pappers?.connected ? t('Connecté') : t('Non configuré')}
            </Badge>
          </div>

          <div className="mt-4 space-y-3 text-sm">
            {integrations?.pappers?.connected ? (
              <>
                <div className="flex items-center gap-2 text-neutral-500">
                  <Shield size={14} className="text-neutral-300" />
                  <span>
                    {t('Clé API :')} <span className="font-medium text-neutral-900">{t('Configurée côté serveur')}</span>
                  </span>
                </div>
                {integrations.pappers.tokensUsed != null && (
                  <div className="flex items-center gap-2">
                    <Badge variant="info" size="sm">
                      {t('{n} jetons utilisés', { n: integrations.pappers.tokensUsed })}
                    </Badge>
                    {integrations.pappers.tokensRemaining != null && (
                      <Badge variant="default" size="sm">
                        {t('{n} restants', { n: integrations.pappers.tokensRemaining })}
                      </Badge>
                    )}
                  </div>
                )}
                <div className="rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-500">
                  {t("L'auto-complétion Pappers est disponible lors de la création d'une entreprise.")}
                </div>
              </>
            ) : (
              <p className="text-neutral-300">
                {t('Ajoutez la variable')} <span className="font-mono text-neutral-400">PAPPERS_API_KEY</span> {t('dans le fichier')} <span className="font-mono text-neutral-400">.env</span> {t('du serveur pour activer Pappers.')}
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
