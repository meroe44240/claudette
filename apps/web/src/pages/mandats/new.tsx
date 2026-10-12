import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Input, { Textarea } from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { toast } from '../../components/ui/Toast';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useAutosave } from '../../hooks/useAutosave';
import { t } from '../../lib/i18n';

const statutOptions = [
  { value: '', label: t('Sélectionner...') },
  { value: 'OUVERT', label: t('Ouvert') },
  { value: 'EN_COURS', label: t('En cours') },
  { value: 'GAGNE', label: t('Gagné') },
  { value: 'PERDU', label: t('Perdu') },
  { value: 'ANNULE', label: t('Annulé') },
  { value: 'CLOTURE', label: t('Clôturé') },
];

const prioriteOptions = [
  { value: '', label: t('Sélectionner...') },
  { value: 'BASSE', label: t('Basse') },
  { value: 'NORMALE', label: t('Normale') },
  { value: 'HAUTE', label: t('Haute') },
  { value: 'URGENTE', label: t('Urgente') },
];

interface Entreprise {
  id: string;
  nom: string;
}

interface Client {
  id: string;
  nom: string;
  prenom: string | null;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; perPage: number; totalPages: number };
}

interface FormData {
  titrePoste: string;
  type: string;
  entrepriseId: string;
  clientId: string;
  description: string;
  localisation: string;
  salaireMin: string;
  salaireMax: string;
  feePourcentage: string;
  statut: string;
  priorite: string;
  notes: string;
}

const initialForm: FormData = {
  titrePoste: '',
  type: 'CLIENT',
  entrepriseId: '',
  clientId: '',
  description: '',
  localisation: '',
  salaireMin: '',
  salaireMax: '',
  feePourcentage: '20',
  statut: 'OUVERT',
  priorite: 'NORMALE',
  notes: '',
};

export default function MandatNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState<FormData>(() => {
    const entrepriseId = searchParams.get('entrepriseId') || '';
    return { ...initialForm, entrepriseId };
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const isDirty = useMemo(
    () => Object.keys(initialForm).some((key) => form[key as keyof FormData] !== initialForm[key as keyof FormData]),
    [form],
  );
  const { unsavedChangesModal } = useUnsavedChanges(isDirty);

  // Autosave draft
  const { restoredData, clearDraft } = useAutosave<FormData>('draft-mandat-new', form);

  useEffect(() => {
    if (restoredData) {
      setForm(restoredData);
      toast('success', t('Brouillon restauré'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inline creation modals
  const [showNewEntreprise, setShowNewEntreprise] = useState(false);
  const [newEntrepriseNom, setNewEntrepriseNom] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientNom, setNewClientNom] = useState('');
  const [newClientPrenom, setNewClientPrenom] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');

  const createEntrepriseMutation = useMutation({
    mutationFn: (payload: { nom: string }) => api.post<{ id: string }>('/entreprises', payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['entreprises', 'all'] });
      setForm((prev) => ({ ...prev, entrepriseId: created.id, clientId: '' }));
      setShowNewEntreprise(false);
      setNewEntrepriseNom('');
      toast('success', t('Entreprise créée'));
    },
    onError: (error: any) => toast('error', error.message || t('Erreur')),
  });

  const createClientMutation = useMutation({
    mutationFn: (payload: { nom: string; prenom?: string; email?: string; entrepriseId: string }) =>
      api.post<{ id: string }>('/clients', payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['clients', 'byEntreprise', form.entrepriseId] });
      setForm((prev) => ({ ...prev, clientId: created.id }));
      setShowNewClient(false);
      setNewClientNom('');
      setNewClientPrenom('');
      setNewClientEmail('');
      toast('success', t('Client créé'));
    },
    onError: (error: any) => toast('error', error.message || t('Erreur')),
  });

  const { data: entreprisesData } = useQuery({
    queryKey: ['entreprises', 'all'],
    queryFn: () => api.get<PaginatedResponse<Entreprise>>('/entreprises?perPage=100'),
  });

  const { data: clientsData } = useQuery({
    queryKey: ['clients', 'byEntreprise', form.entrepriseId],
    queryFn: () =>
      api.get<PaginatedResponse<Client>>(
        `/clients?entrepriseId=${form.entrepriseId}&perPage=100`,
      ),
    enabled: !!form.entrepriseId,
  });

  const entrepriseOptions = (entreprisesData?.data || []).map((e) => ({
    value: e.id,
    label: e.nom,
  }));

  const clientOptions = (clientsData?.data || []).map((c) => ({
    value: c.id,
    label: `${c.prenom || ''} ${c.nom}`.trim(),
  }));

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<{ id: string }>('/mandats', payload),
    onSuccess: (created) => {
      clearDraft();
      toast('success', t('Mandat créé'));
      navigate(`/mandats/${created.id}`);
    },
    onError: (error: any) => {
      if (error.data?.details) {
        const errs: Partial<Record<keyof FormData, string>> = {};
        for (const [key, msgs] of Object.entries(error.data.details)) {
          errs[key as keyof FormData] = (msgs as string[])[0];
        }
        setErrors(errs);
      } else {
        toast('error', error.message || t('Erreur lors de la création'));
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!form.titrePoste.trim()) newErrors.titrePoste = t('Le titre du poste est requis');
    if (!form.entrepriseId) newErrors.entrepriseId = t("L'entreprise est requise");
    // Un mandat VIVIER (sourcing sans client) n'exige pas de client.
    if (form.type === 'CLIENT' && !form.clientId) newErrors.clientId = t('Le client est requis');

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const payload: Record<string, unknown> = {
      titrePoste: form.titrePoste.trim(),
      type: form.type,
      entrepriseId: form.entrepriseId,
    };
    if (form.type === 'CLIENT' && form.clientId) payload.clientId = form.clientId;
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.localisation.trim()) payload.localisation = form.localisation.trim();
    if (form.salaireMin) payload.salaireMin = parseInt(form.salaireMin, 10);
    if (form.salaireMax) payload.salaireMax = parseInt(form.salaireMax, 10);
    if (form.feePourcentage) payload.feePourcentage = parseFloat(form.feePourcentage);
    if (form.statut) payload.statut = form.statut;
    if (form.priorite) payload.priorite = form.priorite;
    if (form.notes.trim()) payload.notes = form.notes.trim();

    mutation.mutate(payload);
  };

  return (
    <div>
      <PageHeader
        title={t('Nouveau mandat')}
        breadcrumbs={[
          { label: t('Mandats'), href: '/mandats' },
          { label: t('Nouveau') },
        ]}
      />

      <form onSubmit={handleSubmit}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring' as const, stiffness: 260, damping: 25 }}>
        <Card>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">{t('Type de mandat')}</label>
              <div className="inline-flex rounded-xl border border-border bg-[#EFEFE6] p-1">
                {[{ v: 'CLIENT', l: t('Client') }, { v: 'VIVIER', l: t('Vivier') }].map((o) => (
                  <button key={o.v} type="button" onClick={() => setForm((prev) => ({ ...prev, type: o.v, ...(o.v === 'VIVIER' ? { clientId: '' } : {}) }))}
                    className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${form.type === o.v ? 'bg-white text-[#22177A] shadow-sm' : 'text-text-secondary'}`}>
                    {o.l}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-text-secondary">{form.type === 'VIVIER' ? t('Sourcing sans client : ni contrat, ni fee, ni portail — exclu des statistiques.') : t('Mandat client classique : contrat, fee, portail, compté dans les stats.')}</p>
            </div>
            <Input
              label={t('Titre du poste *')}
              value={form.titrePoste}
              onChange={set('titrePoste')}
              placeholder={t('Développeur Full Stack Senior')}
              required
              error={errors.titrePoste}
            />
            <div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    label={t('Entreprise *')}
                    options={entrepriseOptions}
                    value={form.entrepriseId}
                    onChange={(val) => {
                      setForm((prev) => ({ ...prev, entrepriseId: val, clientId: '' }));
                      if (errors.entrepriseId) setErrors((prev) => ({ ...prev, entrepriseId: undefined }));
                    }}
                    placeholder={t('Sélectionner une entreprise')}
                    searchable
                    error={errors.entrepriseId}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewEntreprise(true)}
                  className="mb-[2px] flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-text-secondary hover:bg-primary-50 hover:text-accent hover:border-accent transition-colors"
                  title={t('Créer une entreprise')}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {form.type === 'CLIENT' && (
            <div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    label={t('Client *')}
                    options={clientOptions}
                    value={form.clientId}
                    onChange={(val) => {
                      setForm((prev) => ({ ...prev, clientId: val }));
                      if (errors.clientId) setErrors((prev) => ({ ...prev, clientId: undefined }));
                    }}
                    placeholder={form.entrepriseId ? t('Sélectionner un client') : t("Sélectionner d'abord une entreprise")}
                    searchable
                    error={errors.clientId}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!form.entrepriseId) {
                      toast('error', t("Sélectionnez d'abord une entreprise"));
                      return;
                    }
                    setShowNewClient(true);
                  }}
                  className="mb-[2px] flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-text-secondary hover:bg-primary-50 hover:text-accent hover:border-accent transition-colors"
                  title={t('Créer un client')}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            )}
            <Input
              label={t('Localisation')}
              value={form.localisation}
              onChange={set('localisation')}
              placeholder="Paris, France"
            />

            <Input
              label={t('Salaire min (EUR)')}
              type="number"
              value={form.salaireMin}
              onChange={set('salaireMin')}
              placeholder="45000"
            />
            <Input
              label={t('Salaire max (EUR)')}
              type="number"
              value={form.salaireMax}
              onChange={set('salaireMax')}
              placeholder="65000"
            />

            <Input
              label="Fee (%)"
              type="number"
              value={form.feePourcentage}
              onChange={set('feePourcentage')}
              placeholder="20"
            />
            <Select
              label={t('Statut')}
              options={statutOptions}
              value={form.statut}
              onChange={(val) => setForm((prev) => ({ ...prev, statut: val }))}
              placeholder={t('Sélectionner un statut')}
            />

            <Select
              label={t('Priorité')}
              options={prioriteOptions}
              value={form.priorite}
              onChange={(val) => setForm((prev) => ({ ...prev, priorite: val }))}
              placeholder={t('Sélectionner une priorité')}
            />

            <div className="sm:col-span-2">
              <Textarea
                label="Description"
                value={form.description}
                onChange={set('description')}
                placeholder={t('Description du poste, contexte du recrutement...')}
              />
            </div>

            <div className="sm:col-span-2">
              <Textarea
                label="Notes"
                value={form.notes}
                onChange={set('notes')}
                placeholder={t('Notes internes sur le mandat...')}
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => navigate('/mandats')}>
              {t('Annuler')}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t('Création...') : t('Créer')}
            </Button>
          </div>
        </Card>
        </motion.div>
      </form>

      {/* Modal création rapide entreprise */}
      <Modal isOpen={showNewEntreprise} onClose={() => setShowNewEntreprise(false)} title={t('Nouvelle entreprise')}>
        <div className="space-y-4">
          <Input
            label={t("Nom de l'entreprise *")}
            value={newEntrepriseNom}
            onChange={(e) => setNewEntrepriseNom(e.target.value)}
            placeholder={t("Nom de l'entreprise")}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowNewEntreprise(false)}>{t('Annuler')}</Button>
            <Button
              disabled={!newEntrepriseNom.trim() || createEntrepriseMutation.isPending}
              onClick={() => createEntrepriseMutation.mutate({ nom: newEntrepriseNom.trim() })}
            >
              {createEntrepriseMutation.isPending ? t('Création...') : t('Créer')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal création rapide client */}
      <Modal isOpen={showNewClient} onClose={() => setShowNewClient(false)} title={t('Nouveau client')}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('Prénom')}
              value={newClientPrenom}
              onChange={(e) => setNewClientPrenom(e.target.value)}
              placeholder={t('Prénom')}
              autoFocus
            />
            <Input
              label={t('Nom *')}
              value={newClientNom}
              onChange={(e) => setNewClientNom(e.target.value)}
              placeholder={t('Nom')}
            />
          </div>
          <Input
            label="Email"
            type="email"
            value={newClientEmail}
            onChange={(e) => setNewClientEmail(e.target.value)}
            placeholder={t('email@entreprise.com')}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowNewClient(false)}>{t('Annuler')}</Button>
            <Button
              disabled={!newClientNom.trim() || createClientMutation.isPending}
              onClick={() => {
                const payload: any = { nom: newClientNom.trim(), entrepriseId: form.entrepriseId };
                if (newClientPrenom.trim()) payload.prenom = newClientPrenom.trim();
                if (newClientEmail.trim()) payload.email = newClientEmail.trim();
                createClientMutation.mutate(payload);
              }}
            >
              {createClientMutation.isPending ? t('Création...') : t('Créer')}
            </Button>
          </div>
        </div>
      </Modal>
      {unsavedChangesModal}
    </div>
  );
}
