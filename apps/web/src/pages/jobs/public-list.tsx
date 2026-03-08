/**
 * Public Job Board — Liste des offres.
 * URL: /jobs
 * Page publique sans authentification, layout standalone.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Search, MapPin, Briefcase, Clock, ArrowRight, Flame, Sparkles } from 'lucide-react';
import { publicGet } from '../../lib/public-api';

// ─── TYPES ──────────────────────────────────────────

interface JobPosting {
  id: string;
  slug: string;
  title: string;
  companyDescription: string | null;
  location: string | null;
  salaryRange: string | null;
  tags: string[];
  jobType: string | null;
  sector: string | null;
  isUrgent: boolean;
  publishedAt: string | null;
  applicationCount: number;
}

interface PaginatedResponse {
  data: JobPosting[];
  meta: { total: number; page: number; perPage: number; totalPages: number };
}

// ─── CONSTANTS ──────────────────────────────────────

const SECTORS = [
  { value: '', label: 'Tous les secteurs' },
  { value: 'tech_saas', label: 'Tech / SaaS' },
  { value: 'finance', label: 'Finance' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'industrie', label: 'Industrie' },
  { value: 'commerce', label: 'Commerce' },
  { value: 'autre', label: 'Autre' },
];

const JOB_TYPES = [
  { value: '', label: 'Tous les types' },
  { value: 'management', label: 'Management' },
  { value: 'ic', label: 'Individual Contributor' },
  { value: 'direction', label: 'Direction' },
];

// ─── HELPERS ────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Publiée aujourd'hui";
  if (days === 1) return 'Publiée hier';
  if (days < 7) return `Publiée il y a ${days} jours`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return 'Publiée il y a 1 semaine';
  return `Publiée il y a ${weeks} semaines`;
}

function isNew(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const diff = Date.now() - new Date(dateStr).getTime();
  return diff < 7 * 24 * 60 * 60 * 1000;
}

// ─── COMPONENT ──────────────────────────────────────

export default function PublicJobListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [meta, setMeta] = useState<PaginatedResponse['meta'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [sector, setSector] = useState(searchParams.get('sector') || '');
  const [jobType, setJobType] = useState(searchParams.get('jobType') || '');
  const [location, setLocation] = useState(searchParams.get('location') || '');

  const page = parseInt(searchParams.get('page') || '1', 10);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('perPage', '12');
      if (search) params.set('search', search);
      if (sector) params.set('sector', sector);
      if (jobType) params.set('jobType', jobType);
      if (location) params.set('location', location);

      const result = await publicGet<PaginatedResponse>(`/jobs?${params.toString()}`);
      setJobs(result.data);
      setMeta(result.meta);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, sector, jobType, location]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (sector) params.set('sector', sector);
    if (jobType) params.set('jobType', jobType);
    if (location) params.set('location', location);
    params.set('page', '1');
    setSearchParams(params);
  };

  const goToPage = (p: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(p));
    setSearchParams(params);
  };

  return (
    <div className="min-h-screen app-bg">
      {/* Header */}
      <header className="glass sticky top-0 z-10 border-b border-white/30">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#3B82F6] to-[#7C5CFC] shadow-md">
              <span className="text-xl font-bold text-white">H</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#1a1a2e]" style={{ fontFamily: 'var(--font-heading)' }}>HumanUp</h1>
              <p className="text-sm text-neutral-500">Cabinet de recrutement specialise Commercial & Sales</p>
            </div>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="glass border-b border-white/30">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Rechercher un poste..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full rounded-xl border border-white/50 bg-white/60 backdrop-blur-sm py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <select
              value={sector}
              onChange={(e) => { setSector(e.target.value); }}
              className="rounded-xl border border-white/50 bg-white/60 backdrop-blur-sm px-3 py-2.5 text-sm outline-none focus:border-primary-400"
            >
              {SECTORS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Ville..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="rounded-xl border border-white/50 bg-white/60 backdrop-blur-sm px-3 py-2.5 text-sm outline-none focus:border-primary-400 w-32"
            />
            <select
              value={jobType}
              onChange={(e) => { setJobType(e.target.value); }}
              className="rounded-xl border border-white/50 bg-white/60 backdrop-blur-sm px-3 py-2.5 text-sm outline-none focus:border-primary-400"
            >
              {JOB_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <button
              onClick={handleSearch}
              className="gradient-btn rounded-full px-5 py-2.5 text-sm font-medium text-white shadow-md hover:shadow-lg"
            >
              Rechercher
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Counter */}
        <p className="mb-6 text-sm text-neutral-500">
          {meta ? `${meta.total} offre${meta.total > 1 ? 's' : ''} disponible${meta.total > 1 ? 's' : ''}` : ''}
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <Briefcase size={48} className="mx-auto mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-[#1a1a2e]">Aucune offre pour le moment</p>
            <p className="mt-2 text-sm text-neutral-500">Revenez bientot ou envoyez-nous une candidature spontanee !</p>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <Link
                key={job.id}
                to={`/jobs/${job.slug}`}
                className="group block glass-card rounded-2xl p-6 card-hover hover:border-l-4 hover:border-l-primary-500"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-lg font-semibold text-[#1a1a2e] group-hover:text-primary-600 transition-colors">
                        {job.title}
                      </h2>
                      {isNew(job.publishedAt) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#3B82F6] to-[#7C5CFC] px-2.5 py-0.5 text-[11px] font-semibold text-white">
                          <Sparkles size={10} /> NOUVEAU
                        </span>
                      )}
                      {job.isUrgent && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                          <Flame size={10} /> URGENT
                        </span>
                      )}
                    </div>
                    {job.companyDescription && (
                      <p className="text-sm text-neutral-600 mb-2">
                        {job.companyDescription}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-500">
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={14} /> {job.location}
                        </span>
                      )}
                      {job.salaryRange && (
                        <span className="flex items-center gap-1">
                          {job.salaryRange}
                        </span>
                      )}
                      {job.publishedAt && (
                        <span className="flex items-center gap-1">
                          <Clock size={14} /> {timeAgo(job.publishedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <span className="inline-flex items-center gap-1 gradient-btn rounded-full px-4 py-2 text-sm font-medium text-white shadow-sm group-hover:shadow-md transition-shadow">
                      Postuler <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => goToPage(p)}
                className={`h-9 w-9 rounded-full text-sm font-medium transition-colors ${
                  p === meta.page
                    ? 'gradient-btn text-white shadow-md'
                    : 'glass-card text-neutral-600 hover:bg-white/80'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Spontaneous CTA */}
        <div className="mt-12 gradient-card-violet rounded-2xl p-8 text-center">
          <p className="text-lg font-semibold text-white mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
            Vous ne trouvez pas votre bonheur ?
          </p>
          <p className="text-sm text-white/80 mb-6">
            Envoyez-nous votre CV, nous vous contacterons si une opportunite correspond a votre profil.
          </p>
          <Link
            to="/jobs/candidature-spontanee"
            className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-primary-700 hover:bg-white/90 transition-colors shadow-md"
          >
            Candidature spontanee <ArrowRight size={14} />
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="glass border-t border-white/30">
        <div className="mx-auto max-w-5xl px-6 py-6 text-center">
          <p className="text-sm text-neutral-500">
            <span className="gradient-text font-semibold">HumanUp</span> · Cabinet de recrutement international
          </p>
          <p className="text-xs text-neutral-400 mt-1">
            Specialise Commercial, Sales & Business Development · contact@humanup.io
          </p>
        </div>
      </footer>
    </div>
  );
}
