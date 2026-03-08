/**
 * Public Job Board — Liste des offres.
 * URL: /jobs
 * Page publique sans authentification, layout standalone.
 * Branding HumanUp.io — Brand Book v4
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
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days}j`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return 'Il y a 1 sem.';
  return `Il y a ${weeks} sem.`;
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
    <div
      className="min-h-screen"
      style={{
        background: '#f0eef6',
        backgroundImage:
          'radial-gradient(ellipse 90% 70% at 5% 10%, rgba(34,211,238,.08) 0%, transparent 50%), ' +
          'radial-gradient(ellipse 80% 80% at 95% 90%, rgba(139,92,246,.06) 0%, transparent 50%), ' +
          'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(59,130,246,.04) 0%, transparent 40%)',
        backgroundAttachment: 'fixed',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Google Fonts — Poppins for headings */}
      <link
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <header
        className="sticky top-0 z-10"
        style={{
          background: 'rgba(255,255,255,.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,.7)',
        }}
      >
        <div className="mx-auto max-w-5xl px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo-icon.png" alt="HumanUp" className="h-10 w-auto" />
              <div>
                <h1
                  className="text-2xl font-extrabold tracking-tight text-[#1a1a2e]"
                  style={{ fontFamily: "'Poppins', sans-serif", letterSpacing: '-0.04em' }}
                >
                  Humanup
                  <span
                    style={{
                      background: 'linear-gradient(135deg, #22D3EE, #3B82F6, #8B5CF6)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    .io
                  </span>
                </h1>
                <p className="text-xs text-[#7878A0]" style={{ letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 }}>
                  Cabinet de recrutement sp&eacute;cialis&eacute;
                </p>
              </div>
            </div>
            <div className="hidden sm:block">
              <Link
                to="/jobs/candidature-spontanee"
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold text-white shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg, #3B82F6, #6366F1)', letterSpacing: '0.02em' }}
              >
                Candidature spontan&eacute;e <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div
        style={{
          background: 'rgba(255,255,255,.4)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,.6)',
        }}
      >
        <div className="mx-auto max-w-5xl px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7878A0]" />
              <input
                type="text"
                placeholder="Rechercher un poste..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,.6)',
                  border: '1px solid rgba(255,255,255,.7)',
                  backdropFilter: 'blur(8px)',
                  color: '#1a1a2e',
                }}
              />
            </div>
            <select
              value={sector}
              onChange={(e) => { setSector(e.target.value); }}
              className="rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.7)', color: '#1a1a2e' }}
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
              className="rounded-xl px-3 py-2.5 text-sm outline-none w-28"
              style={{ background: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.7)', color: '#1a1a2e' }}
            />
            <select
              value={jobType}
              onChange={(e) => { setJobType(e.target.value); }}
              className="rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: 'rgba(255,255,255,.6)', border: '1px solid rgba(255,255,255,.7)', color: '#1a1a2e' }}
            >
              {JOB_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <button
              onClick={handleSearch}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg, #3B82F6, #6366F1)' }}
            >
              Rechercher
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Counter */}
        <p className="mb-6 text-xs text-[#7878A0]" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>
          {meta ? `${meta.total} offre${meta.total > 1 ? 's' : ''} disponible${meta.total > 1 ? 's' : ''}` : ''}
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: '#3B82F6', borderTopColor: 'transparent' }}
            />
          </div>
        ) : jobs.length === 0 ? (
          <div
            className="rounded-2xl p-12 text-center"
            style={{
              background: 'rgba(255,255,255,.55)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,.7)',
            }}
          >
            <Briefcase size={48} className="mx-auto mb-4 text-[#D4D0E4]" />
            <p className="text-lg font-semibold text-[#1a1a2e]" style={{ fontFamily: "'Poppins', sans-serif" }}>
              Aucune offre pour le moment
            </p>
            <p className="mt-2 text-sm text-[#7878A0]">
              Envoyez-nous votre CV, on vous contactera.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <Link
                key={job.id}
                to={`/jobs/${job.slug}`}
                className="group block rounded-2xl p-6 transition-all"
                style={{
                  background: 'rgba(255,255,255,.55)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,.7)',
                  boxShadow: '0 2px 12px rgba(59,130,246,.03)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(59,130,246,.2)';
                  e.currentTarget.style.boxShadow = '0 8px 40px rgba(59,130,246,.06), 0 0 0 1px rgba(59,130,246,.05)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,.7)';
                  e.currentTarget.style.boxShadow = '0 2px 12px rgba(59,130,246,.03)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h2
                        className="text-base font-semibold text-[#1a1a2e] transition-colors"
                        style={{ fontFamily: "'Poppins', sans-serif" }}
                      >
                        {job.title}
                      </h2>
                      {isNew(job.publishedAt) && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-white"
                          style={{ background: 'linear-gradient(135deg, #22D3EE, #3B82F6)' }}
                        >
                          <Sparkles size={9} /> NEW
                        </span>
                      )}
                      {job.isUrgent && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-[10px] font-semibold text-white">
                          <Flame size={9} /> URGENT
                        </span>
                      )}
                    </div>
                    {/* Company type + key info */}
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      {job.companyDescription && (
                        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                          style={{ background: 'rgba(59,130,246,.08)', color: '#3B82F6' }}
                        >
                          <Briefcase size={11} /> {job.companyDescription}
                        </span>
                      )}
                      {job.salaryRange && (
                        <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                          style={{ background: 'rgba(34,197,94,.08)', color: '#16a34a' }}
                        >
                          {job.salaryRange}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-[#7878A0]">
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} /> {job.location}
                        </span>
                      )}
                      {job.jobType && (
                        <span className="flex items-center gap-1">
                          <Briefcase size={12} /> {job.jobType === 'management' ? 'Management' : job.jobType === 'ic' ? 'IC' : job.jobType === 'direction' ? 'Direction' : job.jobType}
                        </span>
                      )}
                      {job.publishedAt && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> {timeAgo(job.publishedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all group-hover:shadow-md"
                      style={{ background: 'linear-gradient(135deg, #3B82F6, #6366F1)' }}
                    >
                      Voir <ArrowRight size={12} />
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
                className="h-9 w-9 rounded-full text-xs font-semibold transition-all"
                style={
                  p === meta.page
                    ? { background: 'linear-gradient(135deg, #3B82F6, #6366F1)', color: '#fff', boxShadow: '0 2px 16px rgba(59,130,246,.2)' }
                    : { background: 'rgba(255,255,255,.6)', color: '#7878A0', border: '1px solid rgba(255,255,255,.8)' }
                }
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Spontaneous CTA */}
        <div
          className="mt-12 rounded-2xl p-8 text-center relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #3B82F6, #6366F1, #8B5CF6)',
          }}
        >
          {/* Subtle overlay gradient */}
          <div
            className="absolute inset-0 opacity-20"
            style={{ background: 'linear-gradient(135deg, rgba(34,211,238,.3), transparent 50%, rgba(139,92,246,.2))' }}
          />
          <div className="relative z-10">
            <p
              className="text-lg font-bold text-white mb-2"
              style={{ fontFamily: "'Poppins', sans-serif", letterSpacing: '-0.02em' }}
            >
              Vous ne trouvez pas votre poste ?
            </p>
            <p className="text-sm text-white/70 mb-6">
              On vous contactera si une opportunit&eacute; correspond &agrave; votre profil.
            </p>
            <Link
              to="/jobs/candidature-spontanee"
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold transition-all hover:shadow-lg hover:-translate-y-0.5"
              style={{ color: '#3B82F6' }}
            >
              Candidature spontan&eacute;e <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          background: 'rgba(255,255,255,.4)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid rgba(255,255,255,.6)',
        }}
      >
        <div className="mx-auto max-w-5xl px-6 py-6 text-center">
          <p className="text-sm text-[#7878A0]">
            <span
              className="font-bold"
              style={{
                background: 'linear-gradient(135deg, #22D3EE, #3B82F6, #8B5CF6)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Humanup.io
            </span>
            {' '}&middot; Cabinet de recrutement sp&eacute;cialis&eacute;
          </p>
          <p className="text-xs text-[#D4D0E4] mt-1">
            Recrutement sur-mesure &middot; contact@humanup.io
          </p>
        </div>
      </footer>
    </div>
  );
}
