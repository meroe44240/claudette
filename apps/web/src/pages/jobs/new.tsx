/**
 * Back-office — Create new Job Posting.
 * URL: /job-board/new   (optionally ?mandatId=X to pre-fill from mandat)
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Sparkles, Loader2 } from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from '../../components/ui/Toast';

// ─── CONSTANTS ──────────────────────────────────────

const SECTORS = [
  { value: '', label: 'Non défini' },
  { value: 'tech_saas', label: 'Tech / SaaS' },
  { value: 'finance', label: 'Finance' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'industrie', label: 'Industrie' },
  { value: 'commerce', label: 'Commerce' },
  { value: 'autre', label: 'Autre' },
];

const JOB_TYPES = [
  { value: '', label: 'Non défini' },
  { value: 'management', label: 'Management' },
  { value: 'ic', label: 'Individual Contributor' },
  { value: 'direction', label: 'Direction' },
];

interface MandatForPrefill {
  id: string;
  titrePoste: string;
  localisation: string | null;
  salaireMin: number | null;
  salaireMax: number | null;
  salaryRange: string | null;
  description: string | null;
  entreprise: {
    nom: string;
    secteur: string | null;
    taille: string | null;
    localisation: string | null;
  };
}

// ─── COMPONENT ──────────────────────────────────────

export default function JobBoardNewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mandatId = searchParams.get('mandatId');

  const [form, setForm] = useState({
    title: '',
    companyDescription: '',
    location: '',
    salaryRange: '',
    description: '',
    tags: '',
    jobType: '',
    sector: '',
    isUrgent: false,
  });

  // If mandatId provided, fetch mandat data for pre-fill
  const { data: mandat } = useQuery<MandatForPrefill>({
    queryKey: ['mandat-prefill', mandatId],
    queryFn: () => api.get(`/mandats/${mandatId}`),
    enabled: !!mandatId,
  });

  // Pre-fill form when mandat data arrives
  useEffect(() => {
    if (mandat) {
      const salaryRange = mandat.salaryRange
        || (mandat.salaireMin && mandat.salaireMax
          ? `${Math.round(mandat.salaireMin / 1000)}-${Math.round(mandat.salaireMax / 1000)}k€`
          : '');

      const sectorMap: Record<string, string> = {
        'Tech': 'tech_saas',
        'SaaS': 'tech_saas',
        'Finance': 'finance',
        'Hospitality': 'hospitality',
        'Industrie': 'industrie',
        'Commerce': 'commerce',
      };
      const sector = mandat.entreprise.secteur
        ? sectorMap[mandat.entreprise.secteur] || 'autre'
        : '';

      setForm((prev) => ({
        ...prev,
        title: mandat.titrePoste || prev.title,
        location: mandat.localisation || mandat.entreprise.localisation || prev.location,
        salaryRange: salaryRange || prev.salaryRange,
        sector,
      }));
    }
  }, [mandat]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post<{ id: string }>('/jobs', data),
    onSuccess: (result) => {
      toast('success','Offre créée !');
      navigate(`/job-board/${result.id}`);
    },
    onError: () => toast('error','Erreur lors de la création'),
  });

  const [generatingAI, setGeneratingAI] = useState(false);

  const handleCreate = () => {
    if (!form.title.trim()) {
      toast('error','Le titre est requis');
      return;
    }

    createMutation.mutate({
      title: form.title.trim(),
      mandatId: mandatId || undefined,
      companyDescription: form.companyDescription || undefined,
      location: form.location || undefined,
      salaryRange: form.salaryRange || undefined,
      description: form.description || undefined,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      jobType: form.jobType || undefined,
      sector: form.sector || undefined,
      isUrgent: form.isUrgent,
    });
  };

  const handleCreateAndGenerate = async () => {
    if (!form.title.trim()) {
      toast('error','Le titre est requis');
      return;
    }

    setGeneratingAI(true);
    try {
      // First create the posting
      const result = await api.post<{ id: string }>('/jobs', {
        title: form.title.trim(),
        mandatId: mandatId || undefined,
        companyDescription: form.companyDescription || undefined,
        location: form.location || undefined,
        salaryRange: form.salaryRange || undefined,
        description: form.description || undefined,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        jobType: form.jobType || undefined,
        sector: form.sector || undefined,
        isUrgent: form.isUrgent,
      });

      // Then generate description with AI
      const aiResult = await api.post<{ description: string; companyDescription: string; tags: string[] }>(
        `/jobs/${result.id}/generate-description`,
      );

      // Save AI-generated content
      if (aiResult) {
        await api.put(`/jobs/${result.id}`, {
          description: aiResult.description,
          companyDescription: aiResult.companyDescription,
          tags: aiResult.tags,
        });
      }

      toast('success','Offre créée avec description IA !');
      navigate(`/job-board/${result.id}`);
    } catch {
      toast('error','Erreur lors de la création');
    } finally {
      setGeneratingAI(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/job-board" className="text-neutral-400 hover:text-neutral-600 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Nouvelle offre</h1>
            {mandat && (
              <p className="text-xs text-neutral-500 mt-0.5">
                Pré-remplie depuis le mandat : {mandat.titrePoste}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mandatId && (
            <button
              onClick={handleCreateAndGenerate}
              disabled={createMutation.isPending || generatingAI}
              className="flex items-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50 transition-colors"
            >
              {generatingAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Créer + Générer IA
            </button>
          )}
          <button
            onClick={handleCreate}
            disabled={createMutation.isPending || generatingAI}
            className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            {createMutation.isPending ? 'Création...' : 'Créer l\'offre'}
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Titre du poste *</label>
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="ex: Account Executive Senior B2B SaaS"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-primary-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Entreprise anonymisée</label>
            <input
              value={form.companyDescription}
              onChange={(e) => setForm((prev) => ({ ...prev, companyDescription: e.target.value }))}
              placeholder="ex: Scale-up SaaS · B2B · 200 personnes"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-primary-400"
            />
            <p className="text-xs text-neutral-400 mt-1">Ne jamais mentionner le nom du client</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Description du poste</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={14}
              placeholder="Description en markdown (Missions, Profil, Avantages)...&#10;Vous pouvez aussi générer avec l'IA après création si l'offre est liée à un mandat."
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm font-mono outline-none focus:border-primary-400 resize-y"
            />
            <p className="text-xs text-neutral-400 mt-1">Supporte le markdown (# titres, - listes, **gras**)</p>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Localisation</label>
              <input
                value={form.location}
                onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="Paris, France"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Package</label>
              <input
                value={form.salaryRange}
                onChange={(e) => setForm((prev) => ({ ...prev, salaryRange: e.target.value }))}
                placeholder="ex: 80-100k€ fixe + variable"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Secteur</label>
              <select
                value={form.sector}
                onChange={(e) => setForm((prev) => ({ ...prev, sector: e.target.value }))}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400"
              >
                {SECTORS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Type de poste</label>
              <select
                value={form.jobType}
                onChange={(e) => setForm((prev) => ({ ...prev, jobType: e.target.value }))}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400"
              >
                {JOB_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Tags</label>
              <input
                value={form.tags}
                onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
                placeholder="SaaS, B2B, Management (virgules)"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isUrgent}
                onChange={(e) => setForm((prev) => ({ ...prev, isUrgent: e.target.checked }))}
                className="rounded border-neutral-300"
              />
              <span className="text-sm text-neutral-700">Marquer comme urgent</span>
            </label>
          </div>

          {mandat && (
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
              <p className="text-xs font-semibold text-blue-600 uppercase mb-2">Mandat lié</p>
              <Link to={`/mandats/${mandat.id}`} className="text-sm font-medium text-blue-700 hover:text-blue-800">
                {mandat.titrePoste}
              </Link>
              <p className="text-xs text-blue-500 mt-1">{mandat.entreprise.nom}</p>
              <p className="text-xs text-blue-400 mt-2">
                Les candidatures seront automatiquement liées au pipeline de ce mandat.
              </p>
            </div>
          )}

          {!mandatId && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
              <p className="text-xs font-semibold text-amber-600 uppercase mb-2">Offre d'appel</p>
              <p className="text-xs text-amber-500">
                Cette offre n'est liée à aucun mandat. Les candidatures entreront dans le vivier général.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
