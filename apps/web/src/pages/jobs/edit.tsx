/**
 * Back-office Job Posting Edit + Applications.
 * URL: /job-board/:id
 */

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Sparkles, Loader2, Eye, Users, CheckCircle, XCircle, ExternalLink, FileText } from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from '../../components/ui/Toast';

// ─── TYPES ──────────────────────────────────────────

interface JobPosting {
  id: string;
  slug: string;
  title: string;
  companyDescription: string | null;
  location: string | null;
  salaryRange: string | null;
  description: string | null;
  tags: string[];
  jobType: string | null;
  sector: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  visibility: 'PUBLIC' | 'PRIVATE_LINK';
  isUrgent: boolean;
  mandatId: string | null;
  viewCount: number;
  applicationCount: number;
  publishedAt: string | null;
  mandat?: {
    id: string;
    titrePoste: string;
    entreprise: { nom: string; secteur: string | null; taille: string | null };
    client: { nom: string };
  };
  assignedTo?: { id: string; nom: string; prenom: string };
  _count: { applications: number };
}

interface Application {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  salaryCurrent: string | null;
  currentCompany: string | null;
  availability: string | null;
  cvFileUrl: string | null;
  status: 'NEW' | 'REVIEWED' | 'SHORTLISTED' | 'REJECTED';
  createdAt: string;
  candidat?: {
    id: string;
    nom: string;
    prenom: string | null;
    email: string | null;
    posteActuel: string | null;
    aiPitchShort: string | null;
    cvUrl: string | null;
  };
}

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

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  NEW: { label: 'Nouvelle', className: 'bg-blue-100 text-blue-700' },
  REVIEWED: { label: 'Vue', className: 'bg-neutral-100 text-neutral-600' },
  SHORTLISTED: { label: 'Retenue', className: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Refusée', className: 'bg-red-100 text-red-600' },
};

// ─── COMPONENT ──────────────────────────────────────

export default function JobBoardEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'edit' | 'applications'>('edit');

  const { data: job, isLoading } = useQuery<JobPosting>({
    queryKey: ['job-posting', id],
    queryFn: () => api.get(`/jobs/${id}`),
    enabled: !!id,
  });

  // Form state
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

  useEffect(() => {
    if (job) {
      setForm({
        title: job.title || '',
        companyDescription: job.companyDescription || '',
        location: job.location || '',
        salaryRange: job.salaryRange || '',
        description: job.description || '',
        tags: job.tags.join(', '),
        jobType: job.jobType || '',
        sector: job.sector || '',
        isUrgent: job.isUrgent,
      });
    }
  }, [job]);

  // Applications
  const { data: applicationsData } = useQuery<{ data: Application[]; meta: any }>({
    queryKey: ['job-applications', id],
    queryFn: () => api.get(`/jobs/${id}/applications?perPage=50`),
    enabled: !!id && activeTab === 'applications',
  });

  // Mutations
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.put(`/jobs/${id}`, data),
    onSuccess: () => {
      toast('success','Offre mise à jour');
      queryClient.invalidateQueries({ queryKey: ['job-posting', id] });
    },
    onError: () => toast('error','Erreur lors de la mise à jour'),
  });

  const [generatingAI, setGeneratingAI] = useState(false);

  const handleSave = () => {
    updateMutation.mutate({
      title: form.title,
      companyDescription: form.companyDescription,
      location: form.location,
      salaryRange: form.salaryRange,
      description: form.description,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      jobType: form.jobType || undefined,
      sector: form.sector || undefined,
      isUrgent: form.isUrgent,
    });
  };

  const handleAction = async (action: 'publish' | 'unpublish' | 'archive') => {
    try {
      await api.post(`/jobs/${id}/${action}`);
      toast('success',action === 'publish' ? 'Offre publiée !' : action === 'unpublish' ? 'Offre dépubliée' : 'Offre archivée');
      queryClient.invalidateQueries({ queryKey: ['job-posting', id] });
    } catch {
      toast('error','Erreur');
    }
  };

  const handleGenerateAI = async () => {
    if (!job?.mandatId) return;
    setGeneratingAI(true);
    try {
      const result = await api.post<{ description: string; companyDescription: string; tags: string[] }>(
        `/jobs/${id}/generate-description`,
      );
      setForm((prev) => ({
        ...prev,
        description: result.description || prev.description,
        companyDescription: result.companyDescription || prev.companyDescription,
        tags: result.tags?.join(', ') || prev.tags,
      }));
      toast('success','Description générée par IA !');
    } catch {
      toast('error','La génération IA a échoué');
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleApplicationAction = async (appId: string, status: 'SHORTLISTED' | 'REJECTED') => {
    try {
      await api.put(`/jobs/applications/${appId}/status`, { status });
      toast('success',status === 'SHORTLISTED' ? 'Candidature retenue' : 'Candidature refusée');
      queryClient.invalidateQueries({ queryKey: ['job-applications', id] });
    } catch {
      toast('error','Erreur');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6">
        <p>Offre introuvable</p>
        <Link to="/job-board" className="text-primary-500 mt-2 inline-block">← Retour</Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/job-board" className="text-neutral-400 hover:text-neutral-600 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">{job.title}</h1>
            <div className="flex items-center gap-2 mt-1 text-xs text-neutral-500">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${
                job.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' :
                job.status === 'DRAFT' ? 'bg-neutral-100 text-neutral-600' :
                'bg-neutral-100 text-neutral-500'
              }`}>
                {job.status === 'PUBLISHED' ? 'Publiée' : job.status === 'DRAFT' ? 'Brouillon' : 'Archivée'}
              </span>
              <span className="flex items-center gap-1"><Eye size={12} /> {job.viewCount}</span>
              <span className="flex items-center gap-1"><Users size={12} /> {job._count.applications}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {job.status === 'DRAFT' && (
            <button onClick={() => handleAction('publish')} className="rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 transition-colors">
              Publier
            </button>
          )}
          {job.status === 'PUBLISHED' && (
            <>
              <a href={`/jobs/${job.slug}`} target="_blank" rel="noopener noreferrer"
                className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 transition-colors flex items-center gap-1">
                <ExternalLink size={14} /> Voir
              </a>
              <button onClick={() => handleAction('unpublish')} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 transition-colors">
                Dépublier
              </button>
            </>
          )}
          <button onClick={handleSave} disabled={updateMutation.isPending}
            className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-colors">
            {updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-neutral-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('edit')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'edit' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
          }`}
        >
          Édition
        </button>
        <button
          onClick={() => setActiveTab('applications')}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'applications' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
          }`}
        >
          Candidatures ({job._count.applications})
        </button>
      </div>

      {activeTab === 'edit' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main form */}
          <div className="lg:col-span-2 space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Titre du poste</label>
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
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
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-neutral-700">Description du poste</label>
                {job.mandatId && (
                  <button
                    onClick={handleGenerateAI}
                    disabled={generatingAI}
                    className="flex items-center gap-1 text-xs text-primary-500 hover:text-primary-600 font-medium disabled:opacity-50"
                  >
                    {generatingAI ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    Générer avec IA
                  </button>
                )}
              </div>
              <textarea
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                rows={16}
                placeholder="Description en markdown (Missions, Profil, Avantages)..."
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
                  placeholder="SaaS, B2B, Management (séparés par des virgules)"
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

            {job.mandat && (
              <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-4">
                <p className="text-xs font-semibold text-neutral-500 uppercase mb-2">Mandat lié</p>
                <Link to={`/mandats/${job.mandat.id}`} className="text-sm font-medium text-primary-600 hover:text-primary-700">
                  {job.mandat.titrePoste}
                </Link>
                <p className="text-xs text-neutral-500 mt-1">{job.mandat.entreprise.nom} · {job.mandat.client.nom}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Applications Tab */
        <div className="space-y-3">
          {!applicationsData?.data.length ? (
            <div className="rounded-xl bg-neutral-50 p-12 text-center border border-neutral-200">
              <Users size={48} className="mx-auto mb-4 text-neutral-300" />
              <p className="text-neutral-600">Aucune candidature pour le moment</p>
            </div>
          ) : (
            applicationsData.data.map((app) => (
              <div key={app.id} className="rounded-xl bg-white p-5 border border-neutral-200">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-neutral-900">
                        {app.firstName} {app.lastName}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGES[app.status]?.className || ''}`}>
                        {STATUS_BADGES[app.status]?.label || app.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-500">
                      <span>{app.email}</span>
                      {app.currentCompany && <span>· {app.currentCompany}</span>}
                      {app.salaryCurrent && <span>· {app.salaryCurrent}</span>}
                      {app.availability && <span>· Dispo: {app.availability}</span>}
                    </div>
                    {app.candidat?.aiPitchShort && (
                      <p className="text-xs text-neutral-500 mt-2 bg-neutral-50 rounded-lg px-3 py-2 italic">
                        {app.candidat.aiPitchShort}
                      </p>
                    )}
                    <p className="text-xs text-neutral-400 mt-2">
                      Postulé le {new Date(app.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {app.candidat?.id && (
                      <Link
                        to={`/candidats/${app.candidat.id}`}
                        className="rounded-lg border border-neutral-200 p-2 text-neutral-500 hover:text-primary-600 transition-colors"
                        title="Voir la fiche candidat"
                      >
                        <FileText size={14} />
                      </Link>
                    )}
                    {(app.cvFileUrl || app.candidat?.cvUrl) && (
                      <a
                        href={app.cvFileUrl || app.candidat?.cvUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
                      >
                        📄 CV
                      </a>
                    )}
                    {app.status === 'NEW' || app.status === 'REVIEWED' ? (
                      <>
                        <button
                          onClick={() => handleApplicationAction(app.id, 'SHORTLISTED')}
                          className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors flex items-center gap-1"
                        >
                          <CheckCircle size={12} /> Retenir
                        </button>
                        <button
                          onClick={() => handleApplicationAction(app.id, 'REJECTED')}
                          className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors flex items-center gap-1"
                        >
                          <XCircle size={12} /> Refuser
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
