import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router';
import { useMutation } from '@tanstack/react-query';
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

const tailleOptions = [
  { value: '', label: 'Sélectionner...' },
  { value: 'STARTUP', label: 'Startup' },
  { value: 'PME', label: 'PME' },
  { value: 'ETI', label: 'ETI' },
  { value: 'GRAND_GROUPE', label: 'Grand groupe' },
];

interface FormData {
  nom: string;
  secteur: string;
  siteWeb: string;
  taille: string;
  localisation: string;
  linkedinUrl: string;
  notes: string;
}

const initialForm: FormData = {
  nom: '',
  secteur: '',
  siteWeb: '',
  taille: '',
  localisation: '',
  linkedinUrl: '',
  notes: '',
};

export default function EntrepriseNewPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormData>(initialForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const isDirty = useMemo(
    () => Object.keys(initialForm).some((key) => form[key as keyof FormData] !== initialForm[key as keyof FormData]),
    [form],
  );
  const { unsavedChangesModal } = useUnsavedChanges(isDirty);

  // Autosave draft
  const { restoredData, clearDraft } = useAutosave<FormData>('draft-entreprise-new', form);

  useEffect(() => {
    if (restoredData) {
      setForm(restoredData);
      toast('success', 'Brouillon restauré');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Duplicate detection by name
  const [duplicateMatch, setDuplicateMatch] = useState<{ id: string; nom: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const nom = form.nom.trim();
    if (!nom || nom.length < 2) {
      setDuplicateMatch(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await api.get<{ exists: boolean; match?: { id: string; nom: string } }>(
          `/entreprises/check-duplicate?nom=${encodeURIComponent(nom)}`,
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
  }, [form.nom]);

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<{ id: string }>('/entreprises', payload),
    onSuccess: (created) => {
      clearDraft();
      toast('success', 'Entreprise créée');
      navigate(`/entreprises/${created.id}`);
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

    if (!form.nom.trim()) {
      setErrors({ nom: 'Le nom est requis' });
      return;
    }

    const payload: Record<string, unknown> = { nom: form.nom.trim() };
    if (form.secteur.trim()) payload.secteur = form.secteur.trim();
    if (form.siteWeb.trim()) payload.siteWeb = form.siteWeb.trim();
    if (form.taille) payload.taille = form.taille;
    if (form.localisation.trim()) payload.localisation = form.localisation.trim();
    if (form.linkedinUrl.trim()) payload.linkedinUrl = form.linkedinUrl.trim();
    if (form.notes.trim()) payload.notes = form.notes.trim();

    mutation.mutate(payload);
  };

  return (
    <div>
      <PageHeader
        title="Nouvelle entreprise"
        breadcrumbs={[
          { label: 'Entreprises', href: '/entreprises' },
          { label: 'Nouvelle' },
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
              placeholder="Nom de l'entreprise"
              required
              error={errors.nom}
            />
            <Select
              label="Secteur"
              options={[
                { value: '', label: 'Sélectionner...' },
                { value: 'Tech / SaaS', label: 'Tech / SaaS' },
                { value: 'Finance / Banque', label: 'Finance / Banque' },
                { value: 'Conseil', label: 'Conseil' },
                { value: 'Industrie', label: 'Industrie' },
                { value: 'Santé / Pharma', label: 'Santé / Pharma' },
                { value: 'E-commerce / Retail', label: 'E-commerce / Retail' },
                { value: 'Immobilier', label: 'Immobilier' },
                { value: 'Énergie', label: 'Énergie' },
                { value: 'Média / Communication', label: 'Média / Communication' },
                { value: 'Assurance', label: 'Assurance' },
                { value: 'Autre', label: 'Autre' },
              ]}
              value={form.secteur}
              onChange={(val) => setForm((prev) => ({ ...prev, secteur: val }))}
              placeholder="Sélectionner un secteur"
              searchable
            />

            <Input
              label="Site web"
              value={form.siteWeb}
              onChange={set('siteWeb')}
              placeholder="https://www.exemple.com"
            />
            <Select
              label="Taille"
              options={tailleOptions}
              value={form.taille}
              onChange={(val) => setForm((prev) => ({ ...prev, taille: val }))}
              placeholder="Sélectionner une taille"
            />

            <Input
              label="Localisation"
              value={form.localisation}
              onChange={set('localisation')}
              placeholder="Paris, France"
            />
            <Input
              label="LinkedIn"
              value={form.linkedinUrl}
              onChange={set('linkedinUrl')}
              placeholder="https://linkedin.com/company/..."
            />

            <div className="sm:col-span-2">
              <Textarea
                label="Notes"
                value={form.notes}
                onChange={set('notes')}
                placeholder="Notes sur l'entreprise..."
              />
            </div>
          </div>

          {duplicateMatch && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
              <div className="text-sm text-amber-800">
                <span>Une entreprise avec ce nom existe d&eacute;j&agrave; : </span>
                <Link
                  to={`/entreprises/${duplicateMatch.id}`}
                  className="font-medium underline hover:text-amber-900"
                >
                  {duplicateMatch.nom}
                </Link>
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => navigate('/entreprises')}>
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
