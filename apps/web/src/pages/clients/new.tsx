import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertTriangle, Building2, Plus, Check, Loader2 } from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Input, { Textarea } from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import { toast } from '../../components/ui/Toast';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useAutosave } from '../../hooks/useAutosave';
import PappersAutocomplete, { type PappersSuggestionData } from '../../components/entreprises/PappersAutocomplete';

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

const typeClientOptions = [
  { value: 'INBOUND', label: '📩 Inbound' },
  { value: 'OUTBOUND', label: '🎯 Outbound' },
  { value: 'RESEAU', label: '🤝 Réseau' },
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
  typeClient: string;
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
  typeClient: 'INBOUND',
  notes: '',
};

export default function ClientNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  // Track Pappers-created entreprise for display
  const [pappersEntreprise, setPappersEntreprise] = useState<{ nom: string; siren?: string } | null>(null);
  const [creatingEntreprise, setCreatingEntreprise] = useState(false);

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

  // Handle Pappers selection: auto-create entreprise then set entrepriseId
  const handlePappersSelect = async (data: PappersSuggestionData) => {
    setCreatingEntreprise(true);
    if (errors.entrepriseId) setErrors((prev) => ({ ...prev, entrepriseId: undefined }));

    try {
      // Build payload for entreprise creation
      const payload: Record<string, unknown> = { nom: data.nom };
      if (data.siren) payload.siren = data.siren;
      if (data.siret) payload.siret = data.siret;
      if (data.formeJuridique) payload.formeJuridique = data.formeJuridique;
      if (data.secteur) payload.secteur = data.secteur;
      if (data.localisation) payload.localisation = data.localisation;
      if (data.siteWeb) payload.siteWeb = data.siteWeb;
      if (data.taille) payload.taille = data.taille;
      if (data.codeNAF) payload.codeNAF = data.codeNAF;
      if (data.libelleNAF) payload.libelleNAF = data.libelleNAF;
      if (data.adresseComplete) payload.adresseComplete = data.adresseComplete;
      if (data.effectif) payload.effectif = data.effectif;
      if (data.capitalSocial) payload.capitalSocial = parseFloat(data.capitalSocial) || undefined;

      const created = await api.post<{ id: string }>('/entreprises', payload);

      setForm((prev) => ({ ...prev, entrepriseId: created.id }));
      setPappersEntreprise({ nom: data.nom, siren: data.siren });
      toast('success', `Entreprise "${data.nom}" créée via Pappers`);

      // Refresh entreprises list
      queryClient.invalidateQueries({ queryKey: ['entreprises'] });
    } catch (err: any) {
      // If duplicate, try to find the existing one
      toast('error', err.message || 'Erreur lors de la création de l\'entreprise');
    } finally {
      setCreatingEntreprise(false);
    }
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
    if (form.typeClient) payload.typeClient = form.typeClient;
    if (form.notes.trim()) payload.notes = form.notes.trim();

    mutation.mutate(payload);
  };

  // Selected entreprise name for display
  const selectedEntrepriseName = useMemo(() => {
    if (pappersEntreprise) return pappersEntreprise.nom;
    const found = entrepriseOptions.find((e) => e.value === form.entrepriseId);
    return found?.label || '';
  }, [form.entrepriseId, entrepriseOptions, pappersEntreprise]);

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

            {/* Entreprise — Select existing OR create from Pappers */}
            <div>
              <Select
                label="Entreprise *"
                options={entrepriseOptions}
                value={form.entrepriseId}
                onChange={(val) => {
                  setForm((prev) => ({ ...prev, entrepriseId: val }));
                  setPappersEntreprise(null);
                  if (errors.entrepriseId) setErrors((prev) => ({ ...prev, entrepriseId: undefined }));
                }}
                placeholder="Sélectionner une entreprise"
                searchable
                error={errors.entrepriseId}
              />

              {/* Pappers quick-create */}
              {!form.entrepriseId && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex-1 border-t border-neutral-200" />
                    <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">ou créer via Pappers</span>
                    <div className="flex-1 border-t border-neutral-200" />
                  </div>
                  <PappersAutocomplete onSelect={handlePappersSelect} />
                  {creatingEntreprise && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-600">
                      <Loader2 size={12} className="animate-spin" />
                      Création de l'entreprise en cours...
                    </div>
                  )}
                </div>
              )}

              {/* Show Pappers-created entreprise badge */}
              {pappersEntreprise && form.entrepriseId && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <Check size={14} className="text-emerald-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-emerald-800">{pappersEntreprise.nom}</span>
                    {pappersEntreprise.siren && (
                      <span className="ml-2 text-xs font-mono text-emerald-600">{pappersEntreprise.siren}</span>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                    <Building2 size={10} />
                    Pappers
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, entrepriseId: '' }));
                      setPappersEntreprise(null);
                    }}
                    className="text-xs text-emerald-600 hover:text-emerald-800 underline"
                  >
                    Changer
                  </button>
                </div>
              )}
            </div>

            <Select
              label="Statut client"
              options={statutClientOptions}
              value={form.statutClient}
              onChange={(val) => setForm((prev) => ({ ...prev, statutClient: val }))}
              placeholder="Sélectionner un statut"
            />
            <Select
              label="Type client"
              options={typeClientOptions}
              value={form.typeClient}
              onChange={(val) => setForm((prev) => ({ ...prev, typeClient: val }))}
              placeholder="Sélectionner un type"
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
            <Button type="submit" disabled={mutation.isPending || creatingEntreprise}>
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
