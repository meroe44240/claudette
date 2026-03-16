import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { LayoutGrid, List, Plus, Search, Building2, Users, Calendar, Columns3, Briefcase, Filter, X, Download, Mail } from 'lucide-react';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useListNavigation } from '../../hooks/useListNavigation';
import { usePrefetch } from '../../hooks/usePrefetch';
import { api } from '../../lib/api-client';
import { toast } from '../../components/ui/Toast';
import { downloadCSV } from '../../lib/export';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Pagination from '../../components/ui/Pagination';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton, { SkeletonCard } from '../../components/ui/Skeleton';
import SelectionBar from '../../components/ui/SelectionBar';
import type { SelectionAction } from '../../components/ui/SelectionBar';
import SortableHeader, { toggleSort, applySortToData } from '../../components/ui/SortableHeader';
import type { SortConfig } from '../../components/ui/SortableHeader';

type StatutMandat = 'OUVERT' | 'EN_COURS' | 'GAGNE' | 'PERDU' | 'ANNULE' | 'CLOTURE';
type Priorite = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE';

interface Mandat {
  id: string;
  titrePoste: string;
  statut: StatutMandat;
  priorite: Priorite;
  salaireMin: number | null;
  salaireMax: number | null;
  feeMontantEstime: number | null;
  createdAt?: string;
  entreprise: { id: string; nom: string };
  client: { id: string; nom: string; prenom: string | null };
  _count?: { candidatures: number };
}

interface PaginatedResponse {
  data: Mandat[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

const statutLabels: Record<StatutMandat, string> = {
  OUVERT: 'Ouvert',
  EN_COURS: 'En cours',
  GAGNE: 'Gagné',
  PERDU: 'Perdu',
  ANNULE: 'Annulé',
  CLOTURE: 'Clôturé',
};

const statutVariant: Record<StatutMandat, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  OUVERT: 'info',
  EN_COURS: 'warning',
  GAGNE: 'success',
  PERDU: 'error',
  ANNULE: 'error',
  CLOTURE: 'default',
};

const prioriteLabels: Record<Priorite, string> = {
  BASSE: 'Basse',
  NORMALE: 'Normale',
  HAUTE: 'Haute',
  URGENTE: 'Urgente',
};

const prioriteVariant: Record<Priorite, 'default' | 'info' | 'warning' | 'error'> = {
  BASSE: 'default',
  NORMALE: 'info',
  HAUTE: 'warning',
  URGENTE: 'error',
};

function formatSalaireRange(min: number | null, max: number | null): string {
  if (!min && !max) return '—';
  if (min && max) return `${(min / 1000).toFixed(0)}k - ${(max / 1000).toFixed(0)}k€`;
  if (min) return `≥ ${(min / 1000).toFixed(0)}k€`;
  if (max) return `≤ ${(max / 1000).toFixed(0)}k€`;
  return '—';
}

function formatFee(value: number | null): string {
  if (!value) return '—';
  return `${(value / 1000).toFixed(0)}k€`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

const listStagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const listItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
};

type ViewMode = 'grid' | 'table';

// ── Selection actions ───────────────────────────────────────────
const SELECTION_ACTIONS: SelectionAction[] = [
  { key: 'export', label: 'Exporter CSV', icon: Download, variant: 'primary' },
  { key: 'email', label: 'Email clients', icon: Mail, variant: 'secondary' },
];

export default function MandatsPage() {
  usePageTitle('Mandats');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const navigate = useNavigate();
  const { prefetchOnHover, cancelPrefetch } = usePrefetch();
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [filterStatut, setFilterStatut] = useState<string>('');
  const [filterPriorite, setFilterPriorite] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = [filterStatut, filterPriorite].filter(Boolean).length;

  // ── Selection state ───────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleSort = useCallback((key: string) => {
    setSortConfig((prev) => toggleSort(prev, key));
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['mandats', page, search, filterStatut, filterPriorite],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('perPage', '20');
      if (search) params.set('search', search);
      if (filterStatut) params.set('statut', filterStatut);
      if (filterPriorite) params.set('priorite', filterPriorite);
      return api.get<PaginatedResponse>(`/mandats?${params.toString()}`);
    },
  });

  const total = data?.meta?.total ?? 0;

  // ── Sort mandats ──────────────────────────────────────────────
  const sortedMandats = useMemo(
    () => applySortToData(data?.data ?? [], sortConfig, (row, key) => {
      switch (key) {
        case 'titrePoste': return row.titrePoste;
        case 'entreprise': return row.entreprise.nom;
        case 'statut': return statutLabels[row.statut];
        case 'fee': return row.feeMontantEstime;
        case 'priorite': {
          const order: Record<string, number> = { BASSE: 0, NORMALE: 1, HAUTE: 2, URGENTE: 3 };
          return order[row.priorite] ?? 0;
        }
        default: return null;
      }
    }),
    [data?.data, sortConfig],
  );

  const { focusedIndex, setFocusedIndex } = useListNavigation(sortedMandats.length, {
    onSelect: (index) => navigate(`/mandats/${sortedMandats[index].id}`),
  });

  // ── Selection helpers ──────────────────────────────────────────
  const handleSelectionAction = useCallback((key: string) => {
    const ids = Array.from(selectedIds);

    switch (key) {
      case 'export': {
        downloadCSV('mandats', ids)
          .then(() => toast('success', `${ids.length} mandat(s) exporté(s)`))
          .catch(() => toast('error', "Erreur lors de l'export"));
        break;
      }
      case 'email': {
        const selected = sortedMandats.filter((m) => ids.includes(m.id));
        // Collect unique client info — in a real app you'd use client emails
        const clientNames = selected.map((m) => `${m.client.prenom || ''} ${m.client.nom}`.trim());
        toast('info', `Email groupé pour les clients : ${clientNames.join(', ')}`);
        break;
      }
      default:
        break;
    }
  }, [selectedIds, sortedMandats]);

  const allSelected = sortedMandats.length > 0 && sortedMandats.every((m) => selectedIds.has(m.id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedMandats.map((m) => m.id)));
    }
  }, [allSelected, sortedMandats]);

  const columns = [
    {
      key: 'checkbox',
      header: (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleSelectAll}
          className="h-4 w-4 rounded border-neutral-300 text-[#7C5CFC] focus:ring-[#7C5CFC]/30 cursor-pointer"
        />
      ) as unknown as string,
      render: (r: Mandat) => (
        <input
          type="checkbox"
          checked={selectedIds.has(r.id)}
          onChange={(e) => { e.stopPropagation(); toggleSelect(r.id); }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-neutral-300 text-[#7C5CFC] focus:ring-[#7C5CFC]/30 cursor-pointer"
        />
      ),
      className: 'w-10',
    },
    {
      key: 'titrePoste',
      header: (<SortableHeader label="Poste" sortKey="titrePoste" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Mandat) => <span className="font-semibold text-text-primary">{r.titrePoste}</span>,
    },
    {
      key: 'entreprise',
      header: (<SortableHeader label="Entreprise" sortKey="entreprise" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Mandat) => (
        <span
          className="text-accent hover:underline cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/entreprises/${r.entreprise.id}`);
          }}
        >
          {r.entreprise.nom}
        </span>
      ),
    },
    {
      key: 'client',
      header: 'Client',
      render: (r: Mandat) => (
        <span
          className="text-accent hover:underline cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/clients/${r.client.id}`);
          }}
        >
          {r.client.prenom} {r.client.nom}
        </span>
      ),
    },
    {
      key: 'statut',
      header: (<SortableHeader label="Statut" sortKey="statut" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Mandat) => (
        <Badge variant={statutVariant[r.statut]}>
          {statutLabels[r.statut]}
        </Badge>
      ),
    },
    {
      key: 'priorite',
      header: (<SortableHeader label="Priorité" sortKey="priorite" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Mandat) => (
        <Badge variant={prioriteVariant[r.priorite]}>
          {prioriteLabels[r.priorite]}
        </Badge>
      ),
    },
    {
      key: 'salaire',
      header: 'Salaire',
      render: (r: Mandat) => (
        <span className="text-text-secondary">
          {formatSalaireRange(r.salaireMin, r.salaireMax)}
        </span>
      ),
    },
    {
      key: 'fee',
      header: (<SortableHeader label="Fee estimé" sortKey="fee" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Mandat) => (
        <span className="font-semibold text-primary-500">{formatFee(r.feeMontantEstime)}</span>
      ),
    },
    {
      key: 'candidatures',
      header: 'Candidats',
      render: (r: Mandat) => (
        <Badge variant="info">{r._count?.candidatures || 0}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r: Mandat) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); navigate(`/mandats/${r.id}/kanban`); }}
        >
          <Columns3 size={14} /> Kanban
        </Button>
      ),
    },
  ];

  // ── Grid card ─────────────────────────────────────────────────
  function MandatCard({ mandat, index }: { mandat: Mandat; index: number }) {
    const candidatCount = mandat._count?.candidatures ?? 0;
    return (
      <div
        onClick={() => navigate(`/mandats/${mandat.id}`)}
        onMouseEnter={() => prefetchOnHover(['mandat', mandat.id], `/mandats/${mandat.id}`)}
        onMouseLeave={cancelPrefetch}
        className={`cursor-pointer rounded-2xl border border-border/50 bg-white p-5 shadow-card card-hover hover:shadow-card-hover flex flex-col ${focusedIndex === index ? 'ring-2 ring-primary-200/50 bg-primary-50/30' : ''}`}
      >
        {/* Header: Title + Status */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-[16px] font-semibold leading-tight text-text-primary line-clamp-2">
            {mandat.titrePoste}
          </p>
          <Badge variant={statutVariant[mandat.statut]} size="sm">
            {statutLabels[mandat.statut]}
          </Badge>
        </div>

        {/* Entreprise */}
        <div className="mt-2 flex items-center gap-1.5 text-[13px] text-neutral-500">
          <Building2 size={13} className="flex-shrink-0 text-neutral-400" />
          <span className="truncate">{mandat.entreprise.nom}</span>
        </div>

        {/* Fee */}
        {mandat.feeMontantEstime && (
          <p className="mt-3 text-[20px] font-bold text-primary-500">
            {formatFee(mandat.feeMontantEstime)}
          </p>
        )}

        {/* Badges row */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge variant={prioriteVariant[mandat.priorite]} size="sm">
            {prioriteLabels[mandat.priorite]}
          </Badge>
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-50 border border-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
            <Users size={10} />
            {candidatCount} candidat{candidatCount > 1 ? 's' : ''}
          </span>
        </div>

        {/* Progress bar placeholder */}
        {candidatCount > 0 && (
          <div className="mt-3">
            <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all"
                style={{ width: `${Math.min(100, candidatCount * 15)}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto pt-3 flex items-center justify-between border-t border-neutral-50">
          {mandat.createdAt ? (
            <span className="flex items-center gap-1 text-[11px] text-neutral-300">
              <Calendar size={10} />
              {formatDate(mandat.createdAt)}
            </span>
          ) : (
            <span />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/mandats/${mandat.id}/kanban`); }}
            className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-2 py-1 text-[11px] font-medium text-primary-600 hover:bg-primary-100 transition-colors"
          >
            <Columns3 size={11} />
            Kanban
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Mandats"
        breadcrumbs={[{ label: 'Mandats' }]}
        actions={
          <div className="flex items-center gap-3">
            {/* Counter badge */}
            {!isLoading && (
              <Badge variant="neutral" size="md">
                {total} mandat{total > 1 ? 's' : ''}
              </Badge>
            )}
            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-border bg-bg-secondary p-0.5">
              <button
                onClick={() => setView('table')}
                className={`rounded-md p-1.5 transition-colors ${view === 'table' ? 'bg-white text-accent shadow-sm' : 'text-text-tertiary hover:text-text-secondary'}`}
                title="Vue tableau"
              >
                <List size={16} />
              </button>
              <button
                onClick={() => setView('grid')}
                className={`rounded-md p-1.5 transition-colors ${view === 'grid' ? 'bg-white text-accent shadow-sm' : 'text-text-tertiary hover:text-text-secondary'}`}
                title="Vue cartes"
              >
                <LayoutGrid size={16} />
              </button>
            </div>
            <Button onClick={() => navigate('/mandats/new')}>
              <Plus size={16} /> Ajouter
            </Button>
          </div>
        }
      />

      {/* Search + Filters */}
      <div className="mb-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative max-w-[400px] flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Rechercher un mandat..."
              className="h-[40px] w-full rounded-lg border-[1.5px] border-neutral-100 bg-white pl-10 pr-4 text-sm shadow-sm outline-none transition-all focus:border-primary-500 focus:shadow-[0_0_0_3px_rgba(124,92,252,0.1)]"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              activeFilterCount > 0
                ? 'border-primary-300 bg-primary-50 text-primary-600'
                : 'border-neutral-200 bg-white text-text-secondary hover:bg-neutral-50'
            }`}
          >
            <Filter size={14} />
            Filtres
            {activeFilterCount > 0 && (
              <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-[11px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setFilterStatut(''); setFilterPriorite(''); setPage(1); }}
              className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary transition-colors"
            >
              <X size={12} /> Réinitialiser
            </button>
          )}
        </div>
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-100 bg-neutral-50/50 p-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-text-tertiary uppercase tracking-wider">Statut</label>
              <select
                value={filterStatut}
                onChange={(e) => { setFilterStatut(e.target.value); setPage(1); }}
                className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-primary-400"
              >
                <option value="">Tous</option>
                <option value="OUVERT">Ouvert</option>
                <option value="EN_COURS">En cours</option>
                <option value="GAGNE">Gagné</option>
                <option value="PERDU">Perdu</option>
                <option value="ANNULE">Annulé</option>
                <option value="CLOTURE">Clôturé</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-text-tertiary uppercase tracking-wider">Priorité</label>
              <select
                value={filterPriorite}
                onChange={(e) => { setFilterPriorite(e.target.value); setPage(1); }}
                className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-xs outline-none focus:border-primary-400"
              >
                <option value="">Toutes</option>
                <option value="BASSE">Basse</option>
                <option value="NORMALE">Normale</option>
                <option value="HAUTE">Haute</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        view === 'grid' ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <Skeleton className="h-12 w-full" count={5} />
        )
      ) : !sortedMandats.length ? (
        <EmptyState
          title="Aucun mandat"
          description="Suivez vos missions de recrutement de bout en bout en créant votre premier mandat."
          actionLabel="Ajouter un mandat"
          onAction={() => navigate('/mandats/new')}
          icon={<Briefcase size={48} strokeWidth={1} />}
        />
      ) : (
        <>
          {view === 'grid' ? (
            <motion.div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" variants={listStagger} initial="hidden" animate="show">
              {sortedMandats.map((m, index) => (
                <motion.div key={m.id} variants={listItem}>
                  <MandatCard mandat={m} index={index} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <Table
              columns={columns}
              data={sortedMandats}
              keyExtractor={(r) => r.id}
              onRowClick={(r) => navigate(`/mandats/${r.id}`)}
              onRowMouseEnter={(r) => prefetchOnHover(['mandat', r.id], `/mandats/${r.id}`)}
              onRowMouseLeave={cancelPrefetch}
              rowClassName={(_r, i) => focusedIndex === i ? 'ring-2 ring-primary-200/50 bg-primary-50/30' : ''}
            />
          )}
          {data?.meta && (
            <div className="mt-6 flex justify-center">
              <Pagination
                page={data.meta.page}
                totalPages={data.meta.totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      {/* Selection bar */}
      <SelectionBar
        count={selectedIds.size}
        entityLabel="mandats"
        actions={SELECTION_ACTIONS}
        onAction={handleSelectionAction}
        onCancel={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
