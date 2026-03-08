/**
 * Back-office — Create new Job Posting.
 * URL: /job-board/new   (optionally ?mandatId=X to pre-fill from mandat)
 *
 * Features:
 *  - Import fiche de poste (paste or upload) + AI anonymisation
 *  - Link to mandat via dropdown
 *  - Custom sector / job type (editable combo)
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Sparkles, Loader2, Upload, FileText, X, Plus, Link2 } from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from '../../components/ui/Toast';

// ─── CONSTANTS ──────────────────────────────────────

const DEFAULT_SECTORS = [
  'Tech / SaaS',
  'Finance',
  'Hospitality',
  'Industrie',
  'Commerce',
  'Santé',
  'Immobilier',
  'Conseil',
  'Autre',
];

const DEFAULT_JOB_TYPES = [
  'Management',
  'Individual Contributor',
  'Direction',
  'Freelance',
  'Stage / Alternance',
];

interface MandatOption {
  id: string;
  titrePoste: string;
  localisation: string | null;
  salaireMin: number | null;
  salaireMax: number | null;
  salaryRange: string | null;
  description: string | null;
  statut: string;
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
  const initialMandatId = searchParams.get('mandatId') || '';
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    mandatId: initialMandatId,
  });

  // Custom sector / jobType input
  const [customSector, setCustomSector] = useState(false);
  const [customJobType, setCustomJobType] = useState(false);

  // Fiche de poste import
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [anonymizing, setAnonymizing] = useState(false);

  // Fetch open mandats for dropdown
  const { data: mandats } = useQuery<MandatOption[]>({
    queryKey: ['mandats-for-job'],
    queryFn: async () => {
      const res = await api.get<{ data: MandatOption[] }>('/mandats?perPage=200&statut=OUVERT,EN_COURS');
      return res.data || res as any;
    },
  });

  // If mandatId provided, fetch mandat data for pre-fill
  const selectedMandat = mandats?.find((m) => m.id === form.mandatId);

  // Pre-fill form when mandat changes
  useEffect(() => {
    if (selectedMandat) {
      const salaryRange = selectedMandat.salaryRange
        || (selectedMandat.salaireMin && selectedMandat.salaireMax
          ? `${Math.round(selectedMandat.salaireMin / 1000)}-${Math.round(selectedMandat.salaireMax / 1000)}k€`
          : '');

      setForm((prev) => ({
        ...prev,
        title: selectedMandat.titrePoste || prev.title,
        location: selectedMandat.localisation || selectedMandat.entreprise.localisation || prev.location,
        salaryRange: salaryRange || prev.salaryRange,
      }));
    }
  }, [selectedMandat?.id]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post<{ id: string }>('/jobs', data),
    onSuccess: (result) => {
      toast('success', 'Offre créée !');
      navigate(`/job-board/${result.id}`);
    },
    onError: () => toast('error', 'Erreur lors de la création'),
  });

  const [generatingAI, setGeneratingAI] = useState(false);

  const buildPayload = () => ({
    title: form.title.trim(),
    mandatId: form.mandatId || undefined,
    companyDescription: form.companyDescription || undefined,
    location: form.location || undefined,
    salaryRange: form.salaryRange || undefined,
    description: form.description || undefined,
    tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    jobType: form.jobType || undefined,
    sector: form.sector || undefined,
    isUrgent: form.isUrgent,
  });

  const handleCreate = () => {
    if (!form.title.trim()) {
      toast('error', 'Le titre est requis');
      return;
    }
    createMutation.mutate(buildPayload());
  };

  const handleCreateAndGenerate = async () => {
    if (!form.title.trim()) {
      toast('error', 'Le titre est requis');
      return;
    }
    setGeneratingAI(true);
    try {
      const result = await api.post<{ id: string }>('/jobs', buildPayload());
      const aiResult = await api.post<{ description: string; companyDescription: string; tags: string[] }>(
        `/jobs/${result.id}/generate-description`,
      );
      if (aiResult) {
        await api.put(`/jobs/${result.id}`, {
          description: aiResult.description,
          companyDescription: aiResult.companyDescription,
          tags: aiResult.tags,
        });
      }
      toast('success', 'Offre créée avec description IA !');
      navigate(`/job-board/${result.id}`);
    } catch {
      toast('error', 'Erreur lors de la création');
    } finally {
      setGeneratingAI(false);
    }
  };

  // Import fiche de poste + anonymize via AI
  const handleImportAnonymize = async () => {
    if (!importText.trim()) {
      toast('warning', 'Collez le texte de la fiche de poste');
      return;
    }
    setAnonymizing(true);
    try {
      const result = await api.post<{
        title: string;
        description: string;
        companyDescription: string;
        location: string;
        salaryRange: string;
        sector: string;
        jobType: string;
        tags: string[];
      }>('/jobs/anonymize-fiche', { text: importText });

      setForm((prev) => ({
        ...prev,
        title: result.title || prev.title,
        description: result.description || prev.description,
        companyDescription: result.companyDescription || prev.companyDescription,
        location: result.location || prev.location,
        salaryRange: result.salaryRange || prev.salaryRange,
        sector: result.sector || prev.sector,
        jobType: result.jobType || prev.jobType,
        tags: result.tags?.join(', ') || prev.tags,
      }));
      setShowImport(false);
      setImportText('');
      toast('success', 'Fiche importée et anonymisée !');
    } catch {
      toast('error', 'Erreur lors de l\'anonymisation');
    } finally {
      setAnonymizing(false);
    }
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setImportText(text);
      toast('success', 'Fichier chargé');
    } catch {
      toast('error', 'Impossible de lire le fichier');
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
            {selectedMandat && (
              <p className="text-xs text-neutral-500 mt-0.5">
                Pré-remplie depuis le mandat : {selectedMandat.titrePoste}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            <Upload size={14} />
            Importer fiche de poste
          </button>
          {form.mandatId && (
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

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText size={20} className="text-primary-500" />
                <h2 className="text-lg font-semibold text-neutral-900">Importer une fiche de poste</h2>
              </div>
              <button onClick={() => setShowImport(false)} className="text-neutral-400 hover:text-neutral-600">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-neutral-500 mb-3">
              Collez le texte de la fiche de poste ou importez un fichier. L'IA anonymisera automatiquement
              (suppression du nom de l'entreprise, reformulation neutre).
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={12}
              placeholder="Collez ici le texte de la fiche de poste...&#10;&#10;L'IA va :&#10;• Extraire le titre, la localisation, le salaire&#10;• Anonymiser le nom de l'entreprise&#10;• Réécrire la description en version anonyme&#10;• Détecter le secteur et le type de poste"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm font-mono outline-none focus:border-primary-400 resize-y"
            />
            <div className="flex items-center justify-between mt-4">
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.doc,.docx,.pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700"
                >
                  <Upload size={14} />
                  Charger un fichier (.txt, .md)
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowImport(false)}
                  className="rounded-lg border border-neutral-200 px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
                >
                  Annuler
                </button>
                <button
                  onClick={handleImportAnonymize}
                  disabled={anonymizing || !importText.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                >
                  {anonymizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Anonymiser & Importer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
          {/* Mandat link */}
          <div className="rounded-xl border border-neutral-200 p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                <Link2 size={13} className="inline mr-1" />
                Lier à un mandat
              </label>
              <select
                value={form.mandatId}
                onChange={(e) => setForm((prev) => ({ ...prev, mandatId: e.target.value }))}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400"
              >
                <option value="">— Offre d'appel (vivier général)</option>
                {mandats?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.titrePoste} — {m.entreprise.nom}
                  </option>
                ))}
              </select>
              <p className="text-xs text-neutral-400 mt-1">
                {form.mandatId
                  ? 'Les candidatures seront liées au pipeline du mandat.'
                  : 'Sans mandat, les candidatures entreront dans le vivier.'}
              </p>
            </div>

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

            {/* Sector - editable combo */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Secteur</label>
              {customSector ? (
                <div className="flex gap-1">
                  <input
                    value={form.sector}
                    onChange={(e) => setForm((prev) => ({ ...prev, sector: e.target.value }))}
                    placeholder="Saisir un secteur..."
                    className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
                    autoFocus
                  />
                  <button
                    onClick={() => { setCustomSector(false); setForm((prev) => ({ ...prev, sector: '' })); }}
                    className="rounded-lg border border-neutral-200 px-2 text-neutral-400 hover:text-neutral-600"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <select
                    value={form.sector}
                    onChange={(e) => setForm((prev) => ({ ...prev, sector: e.target.value }))}
                    className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400"
                  >
                    <option value="">Non défini</option>
                    {DEFAULT_SECTORS.map((s) => (
                      <option key={s} value={s.toLowerCase().replace(/\s*\/\s*/g, '_').replace(/\s+/g, '_')}>{s}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setCustomSector(true)}
                    className="rounded-lg border border-neutral-200 px-2 text-neutral-400 hover:text-primary-500"
                    title="Ajouter un secteur personnalisé"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Job Type - editable combo */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Type de poste</label>
              {customJobType ? (
                <div className="flex gap-1">
                  <input
                    value={form.jobType}
                    onChange={(e) => setForm((prev) => ({ ...prev, jobType: e.target.value }))}
                    placeholder="Saisir un type..."
                    className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
                    autoFocus
                  />
                  <button
                    onClick={() => { setCustomJobType(false); setForm((prev) => ({ ...prev, jobType: '' })); }}
                    className="rounded-lg border border-neutral-200 px-2 text-neutral-400 hover:text-neutral-600"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <select
                    value={form.jobType}
                    onChange={(e) => setForm((prev) => ({ ...prev, jobType: e.target.value }))}
                    className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400"
                  >
                    <option value="">Non défini</option>
                    {DEFAULT_JOB_TYPES.map((t) => (
                      <option key={t} value={t.toLowerCase().replace(/\s*\/\s*/g, '_').replace(/\s+/g, '_')}>{t}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setCustomJobType(true)}
                    className="rounded-lg border border-neutral-200 px-2 text-neutral-400 hover:text-primary-500"
                    title="Ajouter un type personnalisé"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              )}
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

          {selectedMandat ? (
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
              <p className="text-xs font-semibold text-blue-600 uppercase mb-2">Mandat lié</p>
              <Link to={`/mandats/${selectedMandat.id}`} className="text-sm font-medium text-blue-700 hover:text-blue-800">
                {selectedMandat.titrePoste}
              </Link>
              <p className="text-xs text-blue-500 mt-1">{selectedMandat.entreprise.nom}</p>
              <p className="text-xs text-blue-400 mt-2">
                Les candidatures seront automatiquement liées au pipeline de ce mandat.
              </p>
            </div>
          ) : (
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
