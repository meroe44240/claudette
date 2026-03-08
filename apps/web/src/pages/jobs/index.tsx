/**
 * Back-office Job Board Management Page.
 * URL: /job-board
 */

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Plus, ExternalLink, Copy, Eye, Users, Megaphone, Archive, Pencil } from 'lucide-react';
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
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  visibility: 'PUBLIC' | 'PRIVATE_LINK';
  isUrgent: boolean;
  mandatId: string | null;
  viewCount: number;
  applicationCount: number;
  publishedAt: string | null;
  createdAt: string;
  mandat?: {
    id: string;
    titrePoste: string;
    client: { nom: string };
    entreprise: { nom: string };
  };
  _count: { applications: number };
}

interface PaginatedResponse {
  data: JobPosting[];
  meta: { total: number; page: number; perPage: number; totalPages: number };
}

interface StatsResponse {
  totalPublished: number;
  totalDraft: number;
  totalArchived: number;
  applicationsThisMonth: number;
  totalApplications: number;
}

const TABS = [
  { key: 'PUBLISHED', label: 'Publiées' },
  { key: 'DRAFT', label: 'Brouillons' },
  { key: 'ARCHIVED', label: 'Archivées' },
] as const;

// ─── COMPONENT ──────────────────────────────────────

export default function JobBoardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('status') || 'PUBLISHED';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ['job-board-stats'],
    queryFn: () => api.get('/jobs/stats'),
  });

  const { data, isLoading, refetch } = useQuery<PaginatedResponse>({
    queryKey: ['job-board-list', activeTab, page],
    queryFn: () => api.get(`/jobs?status=${activeTab}&page=${page}&perPage=20`),
  });

  const handleTabChange = (tab: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('status', tab);
    params.set('page', '1');
    setSearchParams(params);
  };

  const handleAction = async (jobId: string, action: 'publish' | 'unpublish' | 'archive') => {
    try {
      await api.post(`/jobs/${jobId}/${action}`);
      toast('success',
        action === 'publish' ? 'Offre publiée !' :
        action === 'unpublish' ? 'Offre dépubliée' : 'Offre archivée',
      );
      refetch();
    } catch {
      toast('error','Une erreur est survenue');
    }
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/jobs/${slug}`;
    navigator.clipboard.writeText(url);
    toast('success','Lien copié !');
  };

  const tabCounts: Record<string, number> = {
    PUBLISHED: stats?.totalPublished ?? 0,
    DRAFT: stats?.totalDraft ?? 0,
    ARCHIVED: stats?.totalArchived ?? 0,
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Megaphone size={24} /> Job Board
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {stats?.totalApplications ?? 0} candidatures au total · {stats?.applicationsThisMonth ?? 0} ce mois-ci
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/jobs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            <ExternalLink size={16} /> Voir le Job Board
          </a>
          <Link
            to="/job-board/new"
            className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
          >
            <Plus size={16} /> Créer une offre
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-neutral-100 rounded-lg p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {tab.label} ({tabCounts[tab.key]})
          </button>
        ))}
      </div>

      {/* Job list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        </div>
      ) : !data?.data.length ? (
        <div className="rounded-xl bg-neutral-50 p-12 text-center border border-neutral-200">
          <Megaphone size={48} className="mx-auto mb-4 text-neutral-300" />
          <p className="text-neutral-600 font-medium">Aucune offre dans cette catégorie</p>
          <Link to="/job-board/new" className="mt-4 inline-flex items-center gap-1 text-sm text-primary-500 hover:text-primary-600 font-medium">
            <Plus size={14} /> Créer une offre
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {data.data.map((job) => (
            <div
              key={job.id}
              className="rounded-xl bg-white p-5 border border-neutral-200 hover:border-neutral-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Link
                      to={`/job-board/${job.id}`}
                      className="text-lg font-semibold text-neutral-900 hover:text-primary-600 transition-colors"
                    >
                      {job.title}
                    </Link>
                    {job.status === 'PUBLISHED' && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        job.mandatId
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {job.mandatId ? '🟢 Live' : '🟡 Appel'}
                      </span>
                    )}
                    {job.status === 'DRAFT' && (
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-500">
                        Brouillon
                      </span>
                    )}
                    {job.isUrgent && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                        URGENT
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-500">
                    {job.companyDescription && <span>{job.companyDescription}</span>}
                    {job.location && <span>· {job.location}</span>}
                    {job.salaryRange && <span>· {job.salaryRange}</span>}
                  </div>
                  {job.mandat && (
                    <p className="text-xs text-neutral-400 mt-1">
                      📋 Lié au mandat : {job.mandat.titrePoste} — {job.mandat.entreprise.nom}
                    </p>
                  )}
                  {!job.mandatId && (
                    <p className="text-xs text-neutral-400 mt-1">
                      📋 Offre d'appel (pas de mandat lié)
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-neutral-400">
                    <span className="flex items-center gap-1"><Eye size={12} /> {job.viewCount} vues</span>
                    <span className="flex items-center gap-1"><Users size={12} /> {job._count.applications} candidatures</span>
                    {job.publishedAt && (
                      <span>Publiée le {new Date(job.publishedAt).toLocaleDateString('fr-FR')}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to={`/job-board/${job.id}`}
                    className="rounded-lg border border-neutral-200 p-2 text-neutral-500 hover:text-neutral-700 hover:border-neutral-300 transition-colors"
                    title="Modifier"
                  >
                    <Pencil size={14} />
                  </Link>
                  {job.status === 'DRAFT' && (
                    <button
                      onClick={() => handleAction(job.id, 'publish')}
                      className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
                    >
                      Publier
                    </button>
                  )}
                  {job.status === 'PUBLISHED' && (
                    <button
                      onClick={() => handleAction(job.id, 'unpublish')}
                      className="rounded-lg bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
                    >
                      Dépublier
                    </button>
                  )}
                  {job.status !== 'ARCHIVED' && (
                    <button
                      onClick={() => handleAction(job.id, 'archive')}
                      className="rounded-lg border border-neutral-200 p-2 text-neutral-400 hover:text-neutral-600 transition-colors"
                      title="Archiver"
                    >
                      <Archive size={14} />
                    </button>
                  )}
                  {job.status === 'PUBLISHED' && (
                    <>
                      <button
                        onClick={() => copyLink(job.slug)}
                        className="rounded-lg border border-neutral-200 p-2 text-neutral-400 hover:text-neutral-600 transition-colors"
                        title="Copier le lien"
                      >
                        <Copy size={14} />
                      </button>
                      <a
                        href={`/jobs/${job.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-neutral-200 p-2 text-neutral-400 hover:text-neutral-600 transition-colors"
                        title="Voir sur le job board"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data?.meta && data.meta.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {Array.from({ length: data.meta.totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.set('page', String(p));
                setSearchParams(params);
              }}
              className={`h-8 w-8 rounded-lg text-sm font-medium ${
                p === data.meta.page
                  ? 'bg-primary-500 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
