/**
 * Public Job Detail + Application Form.
 * URL: /jobs/:slug
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { ArrowLeft, MapPin, Clock, Upload, Loader2, CheckCircle2, Flame, Sparkles, ArrowRight } from 'lucide-react';
import { publicGet, publicPost } from '../../lib/public-api';
import { renderMarkdown } from '../../lib/markdown';

// ─── TYPES ──────────────────────────────────────────

interface JobDetail {
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
  isUrgent: boolean;
  publishedAt: string | null;
  applicationCount: number;
  similarJobs: {
    slug: string;
    title: string;
    companyDescription: string | null;
    location: string | null;
    salaryRange: string | null;
    isUrgent: boolean;
    publishedAt: string | null;
  }[];
}

const AVAILABILITY_OPTIONS = [
  { value: 'immediate', label: 'Immediate' },
  { value: '1_month', label: '1 mois' },
  { value: '3_months', label: '3 mois' },
  { value: 'passive', label: 'En veille' },
];

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Publiee aujourd'hui";
  if (days === 1) return 'Publiee hier';
  if (days < 7) return `Publiee il y a ${days} jours`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return 'Publiee il y a 1 semaine';
  return `Publiee il y a ${weeks} semaines`;
}

// ─── COMPONENT ──────────────────────────────────────

export default function PublicJobDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Form state
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    salaryCurrent: '',
    currentCompany: '',
    availability: '',
  });
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    publicGet<JobDetail>(`/jobs/${slug}`)
      .then((data) => {
        setJob(data);
        setNotFound(false);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.firstName || !form.lastName || !form.email) {
      setError('Veuillez remplir les champs obligatoires');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('firstName', form.firstName);
      formData.append('lastName', form.lastName);
      formData.append('email', form.email);
      if (form.phone) formData.append('phone', form.phone);
      if (form.salaryCurrent) formData.append('salaryCurrent', form.salaryCurrent);
      if (form.currentCompany) formData.append('currentCompany', form.currentCompany);
      if (form.availability) formData.append('availability', form.availability);
      if (cvFile) formData.append('cv', cvFile);

      await publicPost(`/jobs/${slug}/apply`, formData);
      navigate(`/jobs/confirmation?name=${encodeURIComponent(form.firstName)}&title=${encodeURIComponent(job?.title || '')}`);
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center app-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (notFound || !job) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center app-bg p-6">
        <p className="text-lg font-medium text-[#1a1a2e] mb-4">Offre introuvable</p>
        <Link to="/jobs" className="text-primary-500 hover:text-primary-600 font-medium">
          ← Retour aux offres
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-bg">
      {/* Header */}
      <header className="glass sticky top-0 z-10 border-b border-white/30">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <Link to="/jobs" className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 transition-colors">
            <ArrowLeft size={16} /> Retour aux offres
          </Link>
          <div className="flex items-center gap-2">
            <img src="/logo-icon.png" alt="HumanUp" className="h-8 w-auto" />
            <span className="text-sm font-semibold text-[#1a1a2e]" style={{ fontFamily: 'var(--font-heading)' }}>HumanUp</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {/* Job Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-2xl font-bold text-[#1a1a2e]" style={{ fontFamily: 'var(--font-heading)' }}>{job.title}</h1>
            {job.isUrgent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-semibold text-white">
                <Flame size={10} /> URGENT
              </span>
            )}
          </div>
          {job.companyDescription && (
            <p className="text-neutral-600 mb-3">{job.companyDescription}</p>
          )}
          <div className="flex flex-wrap gap-4 text-sm text-neutral-500">
            {job.location && (
              <span className="flex items-center gap-1.5"><MapPin size={14} /> {job.location}</span>
            )}
            {job.salaryRange && (
              <span className="flex items-center gap-1.5">{job.salaryRange}</span>
            )}
            {job.publishedAt && (
              <span className="flex items-center gap-1.5"><Clock size={14} /> {timeAgo(job.publishedAt)}</span>
            )}
          </div>
          {job.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {job.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-primary-50 border border-primary-100 px-3 py-1 text-xs font-medium text-primary-700">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Description */}
          <div className="lg:col-span-2">
            {job.description ? (
              <div
                className="glass-card rounded-2xl p-8 prose prose-neutral max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(job.description) }}
              />
            ) : (
              <p className="text-neutral-500 italic">Aucune description disponible pour cette offre.</p>
            )}
          </div>

          {/* Similar Jobs Sidebar */}
          {job.similarJobs.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-3">
                Offres similaires
              </h3>
              <div className="space-y-3">
                {job.similarJobs.map((sj) => (
                  <Link
                    key={sj.slug}
                    to={`/jobs/${sj.slug}`}
                    className="block glass-card rounded-xl p-4 card-hover"
                  >
                    <p className="font-medium text-[#1a1a2e] text-sm">{sj.title}</p>
                    {sj.location && (
                      <p className="text-xs text-neutral-500 mt-1"><MapPin size={12} className="inline mr-1" />{sj.location}</p>
                    )}
                    {sj.salaryRange && (
                      <p className="text-xs text-neutral-500 mt-0.5">{sj.salaryRange}</p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Application Form */}
        <div className="mt-12 glass-card rounded-2xl p-8" id="postuler">
          <h2 className="text-xl font-bold text-[#1a1a2e] mb-6" style={{ fontFamily: 'var(--font-heading)' }}>Postuler</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Prenom *</label>
                <input
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-white/50 bg-white/60 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Nom *</label>
                <input
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-white/50 bg-white/60 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Email *</label>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-white/50 bg-white/60 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Telephone *</label>
                <input
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-white/50 bg-white/60 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Salaire actuel</label>
                <input
                  name="salaryCurrent"
                  value={form.salaryCurrent}
                  onChange={handleChange}
                  placeholder="ex: 55k"
                  className="w-full rounded-xl border border-white/50 bg-white/60 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Entreprise actuelle</label>
                <input
                  name="currentCompany"
                  value={form.currentCompany}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-white/50 bg-white/60 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>

            {/* Availability */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Disponibilite</label>
              <div className="flex flex-wrap gap-3">
                {AVAILABILITY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`cursor-pointer rounded-full border px-4 py-2 text-sm transition-all ${
                      form.availability === opt.value
                        ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium shadow-sm'
                        : 'border-white/50 bg-white/60 text-neutral-600 hover:border-primary-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="availability"
                      value={opt.value}
                      checked={form.availability === opt.value}
                      onChange={handleChange}
                      className="sr-only"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* CV Upload */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">CV (PDF)</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                  cvFile
                    ? 'border-primary-400 bg-primary-50/50'
                    : 'border-white/60 hover:border-primary-300 bg-white/40'
                }`}
              >
                {cvFile ? (
                  <div className="flex items-center justify-center gap-2 text-primary-600">
                    <CheckCircle2 size={20} />
                    <span className="text-sm font-medium">{cvFile.name}</span>
                  </div>
                ) : (
                  <>
                    <Upload size={24} className="mx-auto mb-2 text-neutral-400" />
                    <p className="text-sm text-neutral-500">
                      Cliquez ou glissez votre CV ici (PDF)
                    </p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => setCvFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full gradient-btn rounded-full py-3 text-sm font-semibold text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Envoi en cours...
                </>
              ) : (
                <>
                  Envoyer ma candidature <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-neutral-400">
          Une question ? Contactez-nous : contact@humanup.io
        </p>
      </main>
    </div>
  );
}
