import { useState } from 'react';
import { useNavigate } from 'react-router';
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

const statutOptions = [
  { value: '', label: 'Sélectionner...' },
  { value: 'OUVERT', label: 'Ouvert' },
  { value: 'EN_COURS', label: 'En cours' },
  { value: 'GAGNE', label: 'Gagné' },
  { value: 'PERDU', label: 'Perdu' },
  { value: 'ANNULE', label: 'Annulé' },
  { value: 'CLOTURE', label: 'Clôturé' },
];

const prioriteOptions = [
  { value: '', label: 'Sélectionner...' },
  { value: 'BASSE', label: 'Basse' },
  { value: 'NORMALE', label: 'Normale' },
  { value: 'HAUTE', label: 'Haute' },
  { value: 'URGENTE', label: 'Urgente' },
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
  const [form, setForm] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

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
      toast('success', 'Entreprise créée');
    },
    onError: (error: any) => toast('error', error.message || 'Erreur'),
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
      toast('success', 'Client créé');
    },
    onError: (error: any) => toast('error', error.message || 'Erreur'),
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
      toast('success', 'Mandat créé');
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
        toast('error', error.message || 'Erreur lors de la création');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!form.titrePoste.trim()) newErrors.titrePoste = 'Le titre du poste est requis';
    if (!form.entrepriseId) newErrors.entrepriseId = "L'entreprise est requise";
    if (!form.clientId) newErrors.clientId = 'Le client est requis';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const payload: Record<string, unknown> = {
      titrePoste: form.titrePoste.trim(),
      entrepriseId: form.entrepriseId,
      clientId: form.clientId,
    };
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
        title="Nouveau mandat"
        breadcrumbs={[
          { label: 'Mandats', href: '/mandats' },
          { label: 'Nouveau' },
        ]}
      />

      <form onSubmit={handleSubmit}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring' as const, stiffness: 260, damping: 25 }}>
        <Card>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input
              label="Titre du poste *"
              value={form.titrePoste}
              onChange={set('titrePoste')}
              placeholder="Développeur Full Stack Senior"
              required
              error={errors.titrePoste}
            />
            <div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    label="Entreprise *"
                    options={entrepriseOptions}
                    value={form.entrepriseId}
                    onChange={(val) => {
                      setForm((prev) => ({ ...prev, entrepriseId: val, clientId: '' }));
                      if (errors.entrepriseId) setErrors((prev) => ({ ...prev, entrepriseId: undefined }));
                    }}
                    placeholder="Sélectionner une entreprise"
                    searchable
                    error={errors.entrepriseId}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewEntreprise(true)}
                  className="mb-[2px] flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-text-secondary hover:bg-primary-50 hover:text-accent hover:border-accent transition-colors"
                  title="Créer une entreprise"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    label="Client *"
                    options={clientOptions}
                    value={form.clientId}
                    onChange={(val) => {
                      setForm((prev) => ({ ...prev, clientId: val }));
                      if (errors.clientId) setErrors((prev) => ({ ...prev, clientId: undefined }));
                    }}
                    placeholder={form.entrepriseId ? 'Sélectionner un client' : "Sélectionner d'abord une entreprise"}
                    searchable
                    error={errors.clientId}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!form.entrepriseId) {
                      toast('error', "Sélectionnez d'abord une entreprise");
                      return;
                    }
                    setShowNewClient(true);
                  }}
                  className="mb-[2px] flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-text-secondary hover:bg-primary-50 hover:text-accent hover:border-accent transition-colors"
                  title="Créer un client"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <Input
              label="Localisation"
              value={form.localisation}
              onChange={set('localisation')}
              placeholder="Paris, France"
            />

            <Input
              label="Salaire min (EUR)"
              type="number"
              value={form.salaireMin}
              onChange={set('salaireMin')}
              placeholder="45000"
            />
            <Input
              label="Salaire max (EUR)"
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
              label="Statut"
              options={statutOptions}
              value={form.statut}
              onChange={(val) => setForm((prev) => ({ ...prev, statut: val }))}
              placeholder="Sélectionner un statut"
            />

            <Select
              label="Priorité"
              options={prioriteOptions}
              value={form.priorite}
              onChange={(val) => setForm((prev) => ({ ...prev, priorite: val }))}
              placeholder="Sélectionner une priorité"
            />

            <div className="sm:col-span-2">
              <Textarea
                label="Description"
                value={form.description}
                onChange={set('description')}
                placeholder="Description du poste, contexte du recrutement..."
              />
            </div>

            <div className="sm:col-span-2">
              <Textarea
                label="Notes"
                value={form.notes}
                onChange={set('notes')}
                placeholder="Notes internes sur le mandat..."
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => navigate('/mandats')}>
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Création...' : 'Créer'}
            </Button>
          </div>
        </Card>
        </motion.div>
      </form>

      {/* Modal création rapide entreprise */}
      <Modal isOpen={showNewEntreprise} onClose={() => setShowNewEntreprise(false)} title="Nouvelle entreprise">
        <div className="space-y-4">
          <Input
            label="Nom de l'entreprise *"
            value={newEntrepriseNom}
            onChange={(e) => setNewEntrepriseNom(e.target.value)}
            placeholder="Nom de l'entreprise"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowNewEntreprise(false)}>Annuler</Button>
            <Button
              disabled={!newEntrepriseNom.trim() || createEntrepriseMutation.isPending}
              onClick={() => createEntrepriseMutation.mutate({ nom: newEntrepriseNom.trim() })}
            >
              {createEntrepriseMutation.isPending ? 'Création...' : 'Créer'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal création rapide client */}
      <Modal isOpen={showNewClient} onClose={() => setShowNewClient(false)} title="Nouveau client">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Prénom"
              value={newClientPrenom}
              onChange={(e) => setNewClientPrenom(e.target.value)}
              placeholder="Prénom"
              autoFocus
            />
            <Input
              label="Nom *"
              value={newClientNom}
              onChange={(e) => setNewClientNom(e.target.value)}
              placeholder="Nom"
            />
          </div>
          <Input
            label="Email"
            type="email"
            value={newClientEmail}
            onChange={(e) => setNewClientEmail(e.target.value)}
            placeholder="email@entreprise.com"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowNewClient(false)}>Annuler</Button>
            <Button
              disabled={!newClientNom.trim() || createClientMutation.isPending}
              onClick={() => {
                const payload: any = { nom: newClientNom.trim(), entrepriseId: form.entrepriseId };
                if (newClientPrenom.trim()) payload.prenom = newClientPrenom.trim();
                if (newClientEmail.trim()) payload.email = newClientEmail.trim();
                createClientMutation.mutate(payload);
              }}
            >
              {createClientMutation.isPending ? 'Création...' : 'Créer'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
