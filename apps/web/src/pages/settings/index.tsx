import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Trash2, Plug, Settings, Users, Puzzle, GitBranch, Bell, Sparkles, Eye, EyeOff, CheckCircle2, Loader2, CalendarCheck, Copy } from 'lucide-react';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth-store';
import PageHeader from '../../components/ui/PageHeader';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input, { Textarea } from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { toast } from '../../components/ui/Toast';

interface User {
  id: string;
  nom: string;
  prenom: string | null;
  email: string;
  role: 'ADMIN' | 'RECRUTEUR';
  lastLoginAt: string | null;
  createdAt: string;
}

interface CreateUserPayload {
  email: string;
  nom: string;
  prenom: string;
  role: string;
  password: string;
}

const roleOptions = [
  { value: 'RECRUTEUR', label: 'Recruteur' },
  { value: 'ADMIN', label: 'Administrateur' },
];

const roleBadgeVariant: Record<string, 'info' | 'warning'> = {
  ADMIN: 'warning',
  RECRUTEUR: 'info',
};

type SettingsSection = 'general' | 'equipe' | 'integrations' | 'pipeline' | 'notifications' | 'booking';

const sidebarItems: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
  { id: 'general', label: 'Général', icon: <Settings size={16} /> },
  { id: 'equipe', label: 'Équipe', icon: <Users size={16} /> },
  { id: 'integrations', label: 'Intégrations', icon: <Puzzle size={16} /> },
  { id: 'pipeline', label: 'Pipeline', icon: <GitBranch size={16} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
  { id: 'booking' as SettingsSection, label: 'Booking', icon: <CalendarCheck size={16} /> },
];

export default function SettingsPage() {
  const { user: currentUser } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formEmail, setFormEmail] = useState('');
  const [formNom, setFormNom] = useState('');
  const [formPrenom, setFormPrenom] = useState('');
  const [formRole, setFormRole] = useState('RECRUTEUR');
  const [formPassword, setFormPassword] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // General settings form state
  const [companyName, setCompanyName] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [timezone, setTimezone] = useState('Europe/Paris');
  const [language, setLanguage] = useState('fr');

  // AI config state
  const [aiProvider, setAiProvider] = useState<'openai' | 'anthropic' | 'gemini'>('openai');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState('gpt-4o');
  const [showAiKey, setShowAiKey] = useState(false);

  // Booking config state
  const [bookingActive, setBookingActive] = useState(true);
  const [bookingSlug, setBookingSlug] = useState('');
  const [bookingDays, setBookingDays] = useState([1, 2, 3, 4, 5]);
  const [bookingStartTime, setBookingStartTime] = useState('09:00');
  const [bookingEndTime, setBookingEndTime] = useState('18:00');
  const [bookingSlotDuration, setBookingSlotDuration] = useState(30);
  const [bookingBuffer, setBookingBuffer] = useState(15);
  const [bookingMinNotice, setBookingMinNotice] = useState(2);
  const [bookingMaxAdvance, setBookingMaxAdvance] = useState(30);
  const [bookingWelcome, setBookingWelcome] = useState('Choisissez un créneau pour notre échange.');
  const [bookingReminderEmail, setBookingReminderEmail] = useState(true);
  const [bookingReminderBefore, setBookingReminderBefore] = useState(true);

  const aiProviderOptions = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'gemini', label: 'Gemini (Google)' },
  ];

  const openaiModelOptions = [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  ];

  const anthropicModelOptions = [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-haiku-4-20250414', label: 'Claude Haiku 4' },
  ];

  const geminiModelOptions = [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ];

  const aiModelOptions = aiProvider === 'openai' ? openaiModelOptions : aiProvider === 'gemini' ? geminiModelOptions : anthropicModelOptions;

  // Load existing AI config
  const { data: aiConfigData, isLoading: aiConfigLoading } = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => api.get<{ data: { aiProvider: string; model: string; hasApiKey: boolean; enabled: boolean } | null }>('/ai/config'),
    enabled: activeSection === 'integrations',
  });

  // Sync AI form state when config loads — validate model exists in options
  useEffect(() => {
    if (aiConfigData?.data) {
      const cfg = aiConfigData.data;
      const provider = cfg.aiProvider as 'openai' | 'anthropic' | 'gemini';
      setAiProvider(provider);
      // Validate model exists in current options, otherwise use default
      const opts = provider === 'openai' ? openaiModelOptions : provider === 'gemini' ? geminiModelOptions : anthropicModelOptions;
      const modelExists = opts.some((o) => o.value === cfg.model);
      if (modelExists) {
        setAiModel(cfg.model);
      } else {
        setAiModel(opts[0].value);
      }
    }
  }, [aiConfigData]);

  const saveAiConfigMutation = useMutation({
    mutationFn: (payload: { provider: string; apiKey: string; model: string }) =>
      api.put('/ai/config', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-config'] });
      toast('success', 'Configuration IA enregistree avec succes');
      setAiApiKey('');
    },
    onError: (error: any) => {
      toast('error', error?.data?.message || 'Erreur lors de la sauvegarde');
    },
  });

  const testAiMutation = useMutation({
    mutationFn: () => api.post<{ success: boolean; message: string }>('/ai/test'),
    onSuccess: (result) => {
      if (result.success) {
        toast('success', result.message);
      } else {
        toast('error', result.message);
      }
    },
    onError: (error: any) => {
      toast('error', error?.data?.message || 'Erreur lors du test');
    },
  });

  const handleSaveAiConfig = () => {
    if (!aiApiKey.trim() && !aiConfigData?.data?.hasApiKey) {
      toast('error', 'Veuillez entrer une cle API');
      return;
    }
    saveAiConfigMutation.mutate({
      provider: aiProvider,
      apiKey: aiApiKey.trim() || '__KEEP_EXISTING__',
      model: aiModel,
    });
  };

  // Booking settings queries
  const { data: bookingSettingsData } = useQuery({
    queryKey: ['booking-settings'],
    queryFn: () => api.get<{ data: any }>('/booking/settings'),
    enabled: activeSection === 'booking',
  });

  // Sync form state when booking config loads
  useEffect(() => {
    if (bookingSettingsData?.data) {
      const s = bookingSettingsData.data;
      setBookingActive(s.isActive ?? true);
      setBookingSlug(s.slug ?? '');
      setBookingDays(s.workingDays ?? [1, 2, 3, 4, 5]);
      setBookingStartTime(s.startTime ?? '09:00');
      setBookingEndTime(s.endTime ?? '18:00');
      setBookingSlotDuration(s.slotDuration ?? 30);
      setBookingBuffer(s.bufferMinutes ?? 15);
      setBookingMinNotice(s.minNoticeHours ?? 2);
      setBookingMaxAdvance(s.maxAdvanceDays ?? 30);
      setBookingWelcome(s.welcomeMessage ?? '');
      setBookingReminderEmail(s.reminderEmail ?? true);
      setBookingReminderBefore(s.reminderBefore ?? true);
    }
  }, [bookingSettingsData]);

  const saveBookingMutation = useMutation({
    mutationFn: (payload: any) => api.put('/booking/settings', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking-settings'] });
      toast('success', 'Paramètres de booking enregistrés');
    },
    onError: (error: any) => {
      toast('error', error?.data?.message || 'Erreur lors de la sauvegarde');
    },
  });

  const { data: mandatLinksData } = useQuery({
    queryKey: ['booking-mandat-links'],
    queryFn: () => api.get<{ data: any[] }>('/booking/mandat-links'),
    enabled: activeSection === 'booking',
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast('success', 'Lien copié !');
  };

  const { data: users, isLoading } = useQuery({
    queryKey: ['settings', 'users'],
    queryFn: () => api.get<User[]>('/settings/users'),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateUserPayload) => api.post('/settings/users', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] });
      toast('success', 'Utilisateur créé avec succès');
      closeCreateModal();
    },
    onError: (error: any) => {
      if (error.data?.details) {
        const errs: Record<string, string> = {};
        for (const [key, msgs] of Object.entries(error.data.details)) {
          errs[key] = (msgs as string[])[0];
        }
        setFormErrors(errs);
      } else {
        toast('error', error.data?.message || 'Erreur lors de la création');
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/settings/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] });
      toast('success', 'Utilisateur supprimé');
      setDeleteConfirm(null);
    },
    onError: () => {
      toast('error', 'Erreur lors de la suppression');
      setDeleteConfirm(null);
    },
  });

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setFormEmail('');
    setFormNom('');
    setFormPrenom('');
    setFormRole('RECRUTEUR');
    setFormPassword('');
    setFormErrors({});
  };

  const handleCreate = () => {
    const errors: Record<string, string> = {};
    if (!formEmail.trim()) errors.email = 'Email requis';
    if (!formNom.trim()) errors.nom = 'Nom requis';
    if (!formPrenom.trim()) errors.prenom = 'Prénom requis';
    if (!formPassword.trim()) errors.password = 'Mot de passe requis';
    if (formPassword.length > 0 && formPassword.length < 8)
      errors.password = 'Minimum 8 caractères';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    createMutation.mutate({
      email: formEmail.trim(),
      nom: formNom.trim(),
      prenom: formPrenom.trim(),
      role: formRole,
      password: formPassword,
    });
  };

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const columns = [
    {
      key: 'nom',
      header: 'Nom',
      render: (u: User) => (
        <div>
          <span className="font-medium text-neutral-900">
            {u.prenom} {u.nom}
          </span>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (u: User) => <span className="text-neutral-500">{u.email}</span>,
    },
    {
      key: 'role',
      header: 'Rôle',
      render: (u: User) => (
        <Badge variant={roleBadgeVariant[u.role] || 'default'}>
          {u.role === 'ADMIN' ? 'Admin' : 'Recruteur'}
        </Badge>
      ),
    },
    {
      key: 'lastLoginAt',
      header: 'Dernière connexion',
      render: (u: User) => (
        <span className="text-xs text-neutral-300">{formatDate(u.lastLoginAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      render: (u: User) =>
        u.id !== currentUser?.id ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteConfirm(u.id);
            }}
            className="rounded-lg p-1.5 text-neutral-300 transition-colors hover:bg-error-100 hover:text-error"
          >
            <Trash2 size={16} />
          </button>
        ) : null,
    },
  ];

  if (currentUser?.role !== 'ADMIN') {
    return (
      <div>
        <PageHeader title="Paramètres" breadcrumbs={[{ label: 'Paramètres' }]} />
        <EmptyState
          title="Accès restreint"
          description="Seuls les administrateurs peuvent accéder à cette page."
        />
      </div>
    );
  }

  const currencyOptions = [
    { value: 'EUR', label: 'EUR (€)' },
    { value: 'USD', label: 'USD ($)' },
    { value: 'GBP', label: 'GBP (£)' },
    { value: 'CAD', label: 'CAD ($)' },
    { value: 'CHF', label: 'CHF' },
  ];

  const timezoneOptions = [
    { value: 'Europe/Paris', label: 'Europe/Paris (CET)' },
    { value: 'Europe/London', label: 'Europe/London (GMT)' },
    { value: 'America/New_York', label: 'America/New_York (EST)' },
    { value: 'America/Montreal', label: 'America/Montreal (EST)' },
    { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
  ];

  const languageOptions = [
    { value: 'fr', label: 'Français' },
    { value: 'en', label: 'English' },
  ];

  return (
    <div>
      <PageHeader
        title="Paramètres"
        breadcrumbs={[{ label: 'Paramètres' }]}
      />

      <div className="flex gap-8">
        {/* Sidebar */}
        <nav className="w-[200px] shrink-0">
          <div className="space-y-1">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveSection(item.id);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  activeSection === item.id
                    ? 'bg-primary-50 text-primary-500 font-semibold'
                    : 'text-neutral-500 hover:bg-neutral-50'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <motion.div className="max-w-[720px] flex-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {/* General section */}
          {activeSection === 'general' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-900">Général</h2>
                <p className="mt-1 text-[13px] text-neutral-500">Paramètres généraux de votre espace</p>
              </div>
              <div className="space-y-6">
                <Input
                  label="Nom de l'entreprise"
                  placeholder="HumanUp"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
                <Select
                  label="Devise"
                  options={currencyOptions}
                  value={currency}
                  onChange={setCurrency}
                />
                <Select
                  label="Fuseau horaire"
                  options={timezoneOptions}
                  value={timezone}
                  onChange={setTimezone}
                />
                <Select
                  label="Langue"
                  options={languageOptions}
                  value={language}
                  onChange={setLanguage}
                />
                <div className="flex justify-end pt-2">
                  <Button>Enregistrer</Button>
                </div>
              </div>
            </div>
          )}

          {/* Team section */}
          {activeSection === 'equipe' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[18px] font-semibold text-neutral-900">Équipe</h2>
                  <p className="mt-1 text-[13px] text-neutral-500">Gérez les membres de votre équipe</p>
                </div>
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus size={16} />
                  Ajouter un utilisateur
                </Button>
              </div>

              {isLoading ? (
                <Skeleton className="h-12 w-full" count={5} />
              ) : !users?.length ? (
                <EmptyState
                  title="Aucun utilisateur"
                  description="Ajoutez votre premier utilisateur pour commencer"
                  actionLabel="Ajouter un utilisateur"
                  onAction={() => setShowCreateModal(true)}
                />
              ) : (
                <Table<User>
                  columns={columns}
                  data={users}
                  keyExtractor={(u) => u.id}
                />
              )}
            </div>
          )}

          {/* Pipeline section */}
          {activeSection === 'pipeline' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-900">Pipeline</h2>
                <p className="mt-1 text-[13px] text-neutral-500">Configurez les étapes de votre pipeline de recrutement</p>
              </div>
              <EmptyState
                title="Bientôt disponible"
                description="La configuration du pipeline sera disponible prochainement."
              />
            </div>
          )}

          {/* Integrations section */}
          {activeSection === 'integrations' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-900">Integrations</h2>
                <p className="mt-1 text-[13px] text-neutral-500">Connectez vos outils pour une experience unifiee</p>
              </div>
              <Button onClick={() => navigate('/settings/integrations')}>
                <Plug size={16} />
                Gerer les integrations
              </Button>

              {/* AI Configuration Section */}
              <div className="rounded-xl border border-neutral-200 bg-white p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100">
                    <Sparkles size={18} className="text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-neutral-900">Intelligence Artificielle</h3>
                    <p className="text-[12px] text-neutral-500">Configurez votre fournisseur IA pour les fonctionnalites Adchase et autres</p>
                  </div>
                  {aiConfigData?.data?.hasApiKey && (
                    <Badge variant="success" className="ml-auto">
                      <CheckCircle2 size={12} className="mr-1" /> Connecte
                    </Badge>
                  )}
                </div>

                {aiConfigLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-neutral-400" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Select
                      label="Fournisseur IA"
                      options={aiProviderOptions}
                      value={aiProvider}
                      onChange={(val) => {
                        setAiProvider(val as 'openai' | 'anthropic' | 'gemini');
                        setAiModel(val === 'openai' ? 'gpt-4o' : val === 'gemini' ? 'gemini-2.5-flash' : 'claude-sonnet-4-20250514');
                      }}
                    />

                    <Select
                      label="Modele"
                      options={aiModelOptions}
                      value={aiModel}
                      onChange={setAiModel}
                    />

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                        Cle API
                      </label>
                      <div className="relative">
                        <input
                          type={showAiKey ? 'text' : 'password'}
                          value={aiApiKey}
                          onChange={(e) => setAiApiKey(e.target.value)}
                          placeholder={aiConfigData?.data?.hasApiKey ? 'Cle deja configuree (laisser vide pour garder)' : 'Entrez votre cle API...'}
                          className="w-full rounded-lg border-[1.5px] border-neutral-100 bg-white px-3 py-2.5 pr-10 text-sm outline-none transition-all placeholder:text-text-tertiary focus:border-primary-500 focus:shadow-[0_0_0_3px_rgba(124,92,252,0.1)]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAiKey(!showAiKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                        >
                          {showAiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        variant="secondary"
                        onClick={() => testAiMutation.mutate()}
                        loading={testAiMutation.isPending}
                        disabled={!aiConfigData?.data?.hasApiKey && !aiApiKey.trim()}
                      >
                        Tester la connexion
                      </Button>
                      <Button
                        onClick={handleSaveAiConfig}
                        loading={saveAiConfigMutation.isPending}
                      >
                        Enregistrer
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notifications section */}
          {activeSection === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-900">Notifications</h2>
                <p className="mt-1 text-[13px] text-neutral-500">Configurez vos préférences de notifications</p>
              </div>
              <EmptyState
                title="Bientôt disponible"
                description="Les paramètres de notifications seront disponibles prochainement."
              />
            </div>
          )}

          {/* Booking section */}
          {activeSection === 'booking' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-[18px] font-semibold text-neutral-900">
                  {'\u{1F4C5}'} Paramètres de booking
                </h2>
                <p className="mt-1 text-[13px] text-neutral-500">
                  Configurez votre disponibilité et vos créneaux de réservation
                </p>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="booking-active"
                  checked={bookingActive}
                  onChange={(e) => setBookingActive(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
                />
                <label htmlFor="booking-active" className="text-sm font-medium text-neutral-900">
                  Booking activé
                </label>
              </div>

              {/* Link preview card */}
              {bookingSlug && (
                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
                    Votre lien de booking
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                      https://ats.propium.co/book/{bookingSlug}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`https://ats.propium.co/book/${bookingSlug}`)}
                      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-50"
                    >
                      <Copy size={14} />
                      Copier
                    </button>
                  </div>
                </div>
              )}

              {/* Slug input */}
              <Input
                label="Votre slug"
                placeholder="mon-entreprise"
                value={bookingSlug}
                onChange={(e) => setBookingSlug(e.target.value)}
              />

              {/* Working days */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Jours de disponibilité
                </label>
                <div className="flex gap-2">
                  {(['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const).map((dayLabel, idx) => {
                    const dayValues = [1, 2, 3, 4, 5, 6, 0];
                    const dayValue = dayValues[idx];
                    const isSelected = bookingDays.includes(dayValue);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setBookingDays((prev) =>
                            isSelected ? prev.filter((d) => d !== dayValue) : [...prev, dayValue]
                          );
                        }}
                        className={`flex h-10 w-10 items-center justify-center rounded-lg border-[1.5px] text-sm font-medium transition-colors ${
                          isSelected
                            ? 'border-primary-500 bg-primary-50 text-primary-500'
                            : 'border-neutral-100 bg-white text-neutral-400 hover:bg-neutral-50'
                        }`}
                      >
                        {dayLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time range */}
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Heure de début"
                  type="time"
                  value={bookingStartTime}
                  onChange={(e) => setBookingStartTime(e.target.value)}
                />
                <Input
                  label="Heure de fin"
                  type="time"
                  value={bookingEndTime}
                  onChange={(e) => setBookingEndTime(e.target.value)}
                />
              </div>

              {/* Duration dropdown */}
              <Select
                label="Durée du créneau"
                options={[
                  { value: '15', label: '15 min' },
                  { value: '30', label: '30 min' },
                  { value: '45', label: '45 min' },
                  { value: '60', label: '60 min' },
                ]}
                value={String(bookingSlotDuration)}
                onChange={(val) => setBookingSlotDuration(Number(val))}
              />

              {/* Buffer dropdown */}
              <Select
                label="Temps tampon entre créneaux"
                options={[
                  { value: '0', label: '0 min' },
                  { value: '5', label: '5 min' },
                  { value: '10', label: '10 min' },
                  { value: '15', label: '15 min' },
                  { value: '30', label: '30 min' },
                ]}
                value={String(bookingBuffer)}
                onChange={(val) => setBookingBuffer(Number(val))}
              />

              {/* Min notice dropdown */}
              <Select
                label="Préavis minimum"
                options={[
                  { value: '1', label: '1 heure' },
                  { value: '2', label: '2 heures' },
                  { value: '4', label: '4 heures' },
                  { value: '8', label: '8 heures' },
                  { value: '24', label: '24 heures' },
                ]}
                value={String(bookingMinNotice)}
                onChange={(val) => setBookingMinNotice(Number(val))}
              />

              {/* Max advance dropdown */}
              <Select
                label="Réservation à l'avance max"
                options={[
                  { value: '7', label: '7 jours' },
                  { value: '14', label: '14 jours' },
                  { value: '30', label: '30 jours' },
                  { value: '60', label: '60 jours' },
                  { value: '90', label: '90 jours' },
                ]}
                value={String(bookingMaxAdvance)}
                onChange={(val) => setBookingMaxAdvance(Number(val))}
              />

              {/* Welcome message */}
              <Textarea
                label="Message d'accueil"
                placeholder="Choisissez un créneau pour notre échange."
                value={bookingWelcome}
                onChange={(e) => setBookingWelcome(e.target.value)}
              />

              {/* Reminders */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Rappels
                </label>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="reminder-email"
                      checked={bookingReminderEmail}
                      onChange={(e) => setBookingReminderEmail(e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
                    />
                    <label htmlFor="reminder-email" className="text-sm text-neutral-700">
                      Email la veille (18h)
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="reminder-before"
                      checked={bookingReminderBefore}
                      onChange={(e) => setBookingReminderBefore(e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
                    />
                    <label htmlFor="reminder-before" className="text-sm text-neutral-700">
                      Email 1h avant
                    </label>
                  </div>
                </div>
              </div>

              {/* Save button */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={() =>
                    saveBookingMutation.mutate({
                      isActive: bookingActive,
                      slug: bookingSlug,
                      workingDays: bookingDays,
                      startTime: bookingStartTime,
                      endTime: bookingEndTime,
                      slotDuration: bookingSlotDuration,
                      bufferMinutes: bookingBuffer,
                      minNoticeHours: bookingMinNotice,
                      maxAdvanceDays: bookingMaxAdvance,
                      welcomeMessage: bookingWelcome,
                      reminderEmail: bookingReminderEmail,
                      reminderBefore: bookingReminderBefore,
                    })
                  }
                  loading={saveBookingMutation.isPending}
                >
                  Sauvegarder
                </Button>
              </div>

              {/* Mandat links section */}
              {mandatLinksData?.data && mandatLinksData.data.length > 0 && (
                <div className="space-y-3 border-t border-neutral-100 pt-6">
                  <h3 className="text-[15px] font-semibold text-neutral-900">Liens par mandat</h3>
                  <div className="space-y-2">
                    {mandatLinksData.data.map((mandat: any) => (
                      <div
                        key={mandat.id}
                        className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-neutral-900 truncate">
                            {mandat.title}{mandat.company ? ` — ${mandat.company}` : ''}
                          </p>
                          <p className="text-xs text-neutral-400 truncate">
                            https://ats.propium.co/book/{bookingSlug}/{mandat.slug}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(`https://ats.propium.co/book/${bookingSlug}/${mandat.slug}`)
                          }
                          className="ml-3 flex-shrink-0 rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-neutral-600"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* Create User Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={closeCreateModal}
        title="Ajouter un utilisateur"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Prénom"
              placeholder="Jean"
              value={formPrenom}
              onChange={(e) => {
                setFormPrenom(e.target.value);
                setFormErrors((prev) => ({ ...prev, prenom: '' }));
              }}
              error={formErrors.prenom}
            />
            <Input
              label="Nom"
              placeholder="Dupont"
              value={formNom}
              onChange={(e) => {
                setFormNom(e.target.value);
                setFormErrors((prev) => ({ ...prev, nom: '' }));
              }}
              error={formErrors.nom}
            />
          </div>
          <Input
            label="Email"
            type="email"
            placeholder="jean.dupont@exemple.com"
            value={formEmail}
            onChange={(e) => {
              setFormEmail(e.target.value);
              setFormErrors((prev) => ({ ...prev, email: '' }));
            }}
            error={formErrors.email}
          />
          <Select
            label="Rôle"
            options={roleOptions}
            value={formRole}
            onChange={setFormRole}
          />
          <Input
            label="Mot de passe"
            type="password"
            placeholder="Minimum 8 caractères"
            value={formPassword}
            onChange={(e) => {
              setFormPassword(e.target.value);
              setFormErrors((prev) => ({ ...prev, password: '' }));
            }}
            error={formErrors.password}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={closeCreateModal}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Création...' : 'Créer'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Confirmer la suppression"
        size="sm"
      >
        <p className="text-sm text-neutral-500">
          Êtes-vous sûr de vouloir supprimer cet utilisateur ? Cette action est irréversible.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
