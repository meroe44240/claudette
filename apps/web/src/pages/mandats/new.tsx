import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Input, { Textarea } from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
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
  statut: '',
  priorite: '',
  notes: '',
};

export default function MandatNewPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

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
    </div>
  );
}
