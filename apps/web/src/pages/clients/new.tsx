import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Input, { Textarea } from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import { toast } from '../../components/ui/Toast';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useAutosave } from '../../hooks/useAutosave';

const roleContactOptions = [
  { value: '', label: 'Sélectionner...' },
  { value: 'HIRING_MANAGER', label: 'Hiring Manager' },
  { value: 'DRH', label: 'DRH' },
  { value: 'PROCUREMENT', label: 'Procurement' },
  { value: 'CEO', label: 'CEO' },
  { value: 'AUTRE', label: 'Autre' },
];

const statutClientOptions = [
  { value: 'LEAD', label: 'Lead' },
  { value: 'PREMIER_CONTACT', label: 'Premier contact' },
  { value: 'BESOIN_QUALIFIE', label: 'Besoin qualifié' },
  { value: 'PROPOSITION_ENVOYEE', label: 'Proposition envoyée' },
  { value: 'MANDAT_SIGNE', label: 'Mandat signé' },
  { value: 'RECURRENT', label: 'Récurrent' },
  { value: 'INACTIF', label: 'Inactif' },
];

interface Entreprise {
  id: string;
  nom: string;
}

interface PaginatedEntreprises {
  data: Entreprise[];
  meta: { total: number; page: number; perPage: number; totalPages: number };
}

interface FormData {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  poste: string;
  roleContact: string;
  linkedinUrl: string;
  entrepriseId: string;
  statutClient: string;
  notes: string;
}

const initialForm: FormData = {
  nom: '',
  prenom: '',
  email: '',
  telephone: '',
  poste: '',
  roleContact: '',
  linkedinUrl: '',
  entrepriseId: '',
  statutClient: 'LEAD',
  notes: '',
};

export default function ClientNewPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const isDirty = useMemo(
    () => Object.keys(initialForm).some((key) => form[key as keyof FormData] !== initialForm[key as keyof FormData]),
    [form],
  );
  const { unsavedChangesModal } = useUnsavedChanges(isDirty);

  // Autosave draft
  const { restoredData, clearDraft } = useAutosave<FormData>('draft-client-new', form);

  useEffect(() => {
    if (restoredData) {
      setForm(restoredData);
      toast('success', 'Brouillon restauré');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Duplicate detection
  const [duplicateMatch, setDuplicateMatch] = useState<{ id: string; nom: string; prenom?: string; email?: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const email = form.email.trim();
    if (!email || !email.includes('@')) {
      setDuplicateMatch(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await api.get<{ exists: boolean; match?: { id: string; nom: string; prenom?: string; email?: string } }>(
          `/clients/check-duplicate?email=${encodeURIComponent(email)}`,
        );
        if (result.exists && result.match) {
          setDuplicateMatch(result.match);
        } else {
          setDuplicateMatch(null);
        }
      } catch {
        setDuplicateMatch(null);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form.email]);

  const { data: entreprisesData } = useQuery({
    queryKey: ['entreprises', 'all'],
    queryFn: () => api.get<PaginatedEntreprises>('/entreprises?perPage=100'),
  });

  const entrepriseOptions = (entreprisesData?.data || []).map((e) => ({
    value: e.id,
    label: e.nom,
  }));

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<{ id: string }>('/clients', payload),
    onSuccess: (created) => {
      clearDraft();
      toast('success', 'Client créé');
      navigate(`/clients/${created.id}`);
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
    if (!form.nom.trim()) newErrors.nom = 'Le nom est requis';
    if (!form.entrepriseId) newErrors.entrepriseId = "L'entreprise est requise";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const payload: Record<string, unknown> = {
      nom: form.nom.trim(),
      entrepriseId: form.entrepriseId,
    };
    if (form.prenom.trim()) payload.prenom = form.prenom.trim();
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.telephone.trim()) payload.telephone = form.telephone.trim();
    if (form.poste.trim()) payload.poste = form.poste.trim();
    if (form.roleContact) payload.roleContact = form.roleContact;
    if (form.linkedinUrl.trim()) payload.linkedinUrl = form.linkedinUrl.trim();
    if (form.statutClient) payload.statutClient = form.statutClient;
    if (form.notes.trim()) payload.notes = form.notes.trim();

    mutation.mutate(payload);
  };

  return (
    <div>
      <PageHeader
        title="Nouveau client"
        breadcrumbs={[
          { label: 'Clients', href: '/clients' },
          { label: 'Nouveau' },
        ]}
      />

      <form onSubmit={handleSubmit}>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring' as const, stiffness: 260, damping: 25 }}>
        <Card>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input
              label="Nom *"
              value={form.nom}
              onChange={set('nom')}
              placeholder="Nom du contact"
              required
              error={errors.nom}
            />
            <Input
              label="Prénom"
              value={form.prenom}
              onChange={set('prenom')}
              placeholder="Prénom"
            />

            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="email@exemple.com"
              error={errors.email}
            />
            <Input
              label="Téléphone"
              type="tel"
              value={form.telephone}
              onChange={set('telephone')}
              placeholder="+33 1 23 45 67 89"
            />

            <Input
              label="Poste"
              value={form.poste}
              onChange={set('poste')}
              placeholder="Directeur des ressources humaines"
            />
            <Select
              label="Rôle contact"
              options={roleContactOptions}
              value={form.roleContact}
              onChange={(val) => setForm((prev) => ({ ...prev, roleContact: val }))}
              placeholder="Sélectionner un rôle"
            />

            <Input
              label="LinkedIn"
              value={form.linkedinUrl}
              onChange={set('linkedinUrl')}
              placeholder="https://linkedin.com/in/..."
            />
            <Select
              label="Entreprise *"
              options={entrepriseOptions}
              value={form.entrepriseId}
              onChange={(val) => {
                setForm((prev) => ({ ...prev, entrepriseId: val }));
                if (errors.entrepriseId) setErrors((prev) => ({ ...prev, entrepriseId: undefined }));
              }}
              placeholder="Sélectionner une entreprise"
              searchable
              error={errors.entrepriseId}
            />

            <Select
              label="Statut client"
              options={statutClientOptions}
              value={form.statutClient}
              onChange={(val) => setForm((prev) => ({ ...prev, statutClient: val }))}
              placeholder="Sélectionner un statut"
            />

            <div className="sm:col-span-2">
              <Textarea
                label="Notes"
                value={form.notes}
                onChange={set('notes')}
                placeholder="Notes sur le contact client..."
              />
            </div>
          </div>

          {duplicateMatch && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
              <div className="text-sm text-amber-800">
                <span>Un client avec cet email existe d&eacute;j&agrave; : </span>
                <Link
                  to={`/clients/${duplicateMatch.id}`}
                  className="font-medium underline hover:text-amber-900"
                >
                  {duplicateMatch.prenom ? `${duplicateMatch.prenom} ` : ''}{duplicateMatch.nom} ({duplicateMatch.email})
                </Link>
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => navigate('/clients')}>
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Création...' : 'Créer'}
            </Button>
          </div>
        </Card>
        </motion.div>
      </form>
      {unsavedChangesModal}
    </div>
  );
}
