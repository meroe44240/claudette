import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Search, LayoutGrid, List, MapPin, Building, Download } from 'lucide-react';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useListNavigation } from '../../hooks/useListNavigation';
import { usePrefetch } from '../../hooks/usePrefetch';
import { api } from '../../lib/api-client';
import { downloadCSV } from '../../lib/export';
import { toast } from '../../components/ui/Toast';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Pagination from '../../components/ui/Pagination';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton, { SkeletonCard } from '../../components/ui/Skeleton';
import FilterBar from '../../components/ui/FilterBar';
import type { FilterConfig } from '../../components/ui/FilterBar';
import SelectionBar from '../../components/ui/SelectionBar';
import type { SelectionAction } from '../../components/ui/SelectionBar';
import SortableHeader, { toggleSort, applySortToData } from '../../components/ui/SortableHeader';
import type { SortConfig } from '../../components/ui/SortableHeader';

type TailleEntreprise = 'STARTUP' | 'PME' | 'ETI' | 'GRAND_GROUPE';

interface Entreprise {
  id: string;
  nom: string;
  secteur: string | null;
  siteWeb: string | null;
  taille: TailleEntreprise | null;
  localisation: string | null;
  linkedinUrl: string | null;
  logoUrl: string | null;
  _count?: { clients: number; mandats: number };
}

interface PaginatedResponse {
  data: Entreprise[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

const tailleLabels: Record<TailleEntreprise, string> = {
  STARTUP: 'Startup',
  PME: 'PME',
  ETI: 'ETI',
  GRAND_GROUPE: 'Grand Groupe',
};

const tailleVariant: Record<TailleEntreprise, 'primary' | 'neutral' | 'warning' | 'success'> = {
  STARTUP: 'primary',
  PME: 'neutral',
  ETI: 'warning',
  GRAND_GROUPE: 'success',
};

const listStagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const listItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
};

type ViewMode = 'grid' | 'table';

function getLogoFromSiteWeb(siteWeb: string | null): string | null {
  if (!siteWeb) return null;
  try {
    const hostname = new URL(siteWeb.startsWith('http') ? siteWeb : `https://${siteWeb}`).hostname;
    if (!hostname || hostname === 'localhost') return null;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
  } catch {
    return null;
  }
}

function CompanyLogo({ src, siteWeb, name, size = 11 }: { src: string | null; siteWeb?: string | null; name: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  // Use logoUrl if available, otherwise auto-generate from siteWeb
  const imgSrc = src || getLogoFromSiteWeb(siteWeb ?? null);
  if (imgSrc && !imgError) {
    return (
      <img
        src={imgSrc}
        alt={name}
        className="object-contain rounded"
        style={{ height: size * 4, width: size * 4 }}
        onError={() => setImgError(true)}
      />
    );
  }
  return <Building size={size < 11 ? 18 : 20} className="text-neutral-500" />;
}

// ── Filter options ──────────────────────────────────────────────
const SECTOR_OPTIONS = [
  { value: 'SaaS', label: 'SaaS / Tech' },
  { value: 'Hospitality', label: 'Hospitality' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Cybersecurity', label: 'Cybersecurity' },
  { value: 'FinTech', label: 'FinTech' },
  { value: 'Supply Chain', label: 'Supply Chain' },
  { value: 'IT Services', label: 'IT Services' },
  { value: 'AI', label: 'AI / Deep Tech' },
  { value: 'Industrie', label: 'Industrie' },
  { value: 'Autre', label: 'Autre' },
];

const TAILLE_OPTIONS = [
  { value: 'STARTUP', label: 'Startup' },
  { value: 'PME', label: 'PME' },
  { value: 'ETI', label: 'ETI' },
  { value: 'GRAND_GROUPE', label: 'Grand Groupe' },
];

const MANDATS_COUNT_OPTIONS = [
  { value: '0', label: '0' },
  { value: '1-2', label: '1-2' },
  { value: '3-5', label: '3-5' },
  { value: '5+', label: '5+' },
];

const CLIENTS_COUNT_OPTIONS = [
  { value: '0', label: '0' },
  { value: '1-3', label: '1-3' },
  { value: '4-10', label: '4-10' },
  { value: '10+', label: '10+' },
];

// ── Selection actions ───────────────────────────────────────────
const SELECTION_ACTIONS: SelectionAction[] = [
  { key: 'export', label: 'Exporter CSV', icon: Download, variant: 'primary' },
];

// ── URL helpers ─────────────────────────────────────────────────
function parseFiltersFromURL(params: URLSearchParams): Record<string, any> {
  const result: Record<string, any> = {};
  const multiKeys = ['sector', 'city'];
  for (const key of multiKeys) {
    const val = params.get(key);
    if (val) result[key] = val.split(',');
  }
  const singleKeys = ['taille', 'mandats_count', 'clients_count'];
  for (const key of singleKeys) {
    const val = params.get(key);
    if (val) result[key] = val;
  }
  return result;
}

function serializeFiltersToURL(values: Record<string, any>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(values)) {
    if (Array.isArray(val) && val.length > 0) result[key] = val.join(',');
    else if (typeof val === 'string' && val) result[key] = val;
  }
  return result;
}

export default function EntreprisesPage() {
  usePageTitle('Entreprises');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('grid');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { prefetchOnHover, cancelPrefetch } = usePrefetch();
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const handleSort = useCallback((key: string) => {
    setSortConfig((prev) => toggleSort(prev, key));
  }, []);

  // ── Filter state ──────────────────────────────────────────────
  const [filterValues, setFilterValues] = useState<Record<string, any>>(() =>
    parseFiltersFromURL(searchParams),
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const serialized = serializeFiltersToURL(filterValues);
      const newParams = new URLSearchParams();
      for (const [k, v] of Object.entries(serialized)) newParams.set(k, v);
      setSearchParams(newParams, { replace: true });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filterValues, setSearchParams]);

  const handleFilterChange = useCallback((key: string, value: any) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const handleFilterReset = useCallback(() => {
    setFilterValues({});
    setPage(1);
  }, []);

  // ── Selection state ───────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleSelectionAction = useCallback((key: string) => {
    const ids = Array.from(selectedIds);

    switch (key) {
      case 'export': {
        downloadCSV('entreprises', ids)
          .then(() => toast('success', `${ids.length} entreprise(s) exportée(s)`))
          .catch(() => toast('error', "Erreur lors de l'export"));
        break;
      }
      default:
        break;
    }
  }, [selectedIds]);

  // ── Data fetching ─────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['entreprises', page, search, filterValues],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('perPage', '20');
      if (search) params.set('search', search);
      // Pass filter values as query params
      if (filterValues.sector?.length) params.set('secteur', filterValues.sector.join(','));
      if (filterValues.city?.length) params.set('localisation', filterValues.city.join(','));
      if (filterValues.taille) params.set('taille', filterValues.taille);
      return api.get<PaginatedResponse>(`/entreprises?${params.toString()}`);
    },
  });

  const total = data?.meta?.total ?? 0;

  // ── Dynamic filter options ────────────────────────────────────
  const dynamicCityOptions = useMemo(() => {
    if (!data?.data) return [];
    const cities = new Set<string>();
    data.data.forEach((e) => {
      if (e.localisation) cities.add(e.localisation);
    });
    return Array.from(cities).sort().map((city) => ({ value: city, label: city }));
  }, [data?.data]);

  const filterConfigs: FilterConfig[] = useMemo(() => [
    { key: 'sector', label: 'Secteur', type: 'multi-select', options: SECTOR_OPTIONS },
    { key: 'city', label: 'Ville', type: 'multi-select', options: dynamicCityOptions },
    { key: 'taille', label: 'Taille', type: 'single-select', options: TAILLE_OPTIONS },
    { key: 'mandats_count', label: 'Mandats', type: 'single-select', options: MANDATS_COUNT_OPTIONS },
    { key: 'clients_count', label: 'Clients', type: 'single-select', options: CLIENTS_COUNT_OPTIONS },
  ], [dynamicCityOptions]);

  // ── Sorting (server handles filtering, client handles sort of current page) ──
  const allEntreprises = data?.data ?? [];

  const sortedEntreprises = useMemo(
    () => applySortToData(allEntreprises, sortConfig, (row, key) => {
      switch (key) {
        case 'nom': return row.nom;
        case 'secteur': return row.secteur;
        case 'localisation': return row.localisation;
        default: return null;
      }
    }),
    [allEntreprises, sortConfig],
  );

  const { focusedIndex, setFocusedIndex } = useListNavigation(sortedEntreprises.length, {
    onSelect: (index) => navigate(`/entreprises/${sortedEntreprises[index].id}`),
  });

  const allSelected = sortedEntreprises.length > 0 && sortedEntreprises.every((e) => selectedIds.has(e.id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedEntreprises.map((e) => e.id)));
    }
  }, [allSelected, sortedEntreprises]);

  // ── Table columns ─────────────────────────────────────────────
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
      render: (r: Entreprise) => (
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
      key: 'nom',
      header: (<SortableHeader label="Nom" sortKey="nom" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Entreprise) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-50 overflow-hidden">
            <CompanyLogo src={r.logoUrl} siteWeb={r.siteWeb} name={r.nom} size={10} />
          </div>
          <span className="font-medium">{r.nom}</span>
        </div>
      ),
    },
    {
      key: 'secteur',
      header: (<SortableHeader label="Secteur" sortKey="secteur" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Entreprise) => (
        <span className="text-text-secondary">{r.secteur || '—'}</span>
      ),
    },
    {
      key: 'taille',
      header: 'Taille',
      render: (r: Entreprise) =>
        r.taille ? <Badge variant={tailleVariant[r.taille]}>{tailleLabels[r.taille]}</Badge> : '—',
    },
    {
      key: 'localisation',
      header: (<SortableHeader label="Localisation" sortKey="localisation" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Entreprise) => r.localisation || '—',
    },
    {
      key: 'clients',
      header: 'Clients',
      render: (r: Entreprise) => (
        <Badge variant="info">{r._count?.clients || 0}</Badge>
      ),
    },
    {
      key: 'mandats',
      header: 'Mandats',
      render: (r: Entreprise) => (
        <Badge variant="info">{r._count?.mandats || 0}</Badge>
      ),
    },
  ];

  // ── Grid card ─────────────────────────────────────────────────
  function EntrepriseCard({ entreprise, index }: { entreprise: Entreprise; index: number }) {
    const clientCount = entreprise._count?.clients ?? 0;
    const mandatCount = entreprise._count?.mandats ?? 0;
    const isSelected = selectedIds.has(entreprise.id);
    return (
      <div
        onClick={() => navigate(`/entreprises/${entreprise.id}`)}
        onMouseEnter={() => prefetchOnHover(['entreprise', entreprise.id], `/entreprises/${entreprise.id}`)}
        onMouseLeave={cancelPrefetch}
        className={`group relative cursor-pointer rounded-2xl border bg-white overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
          isSelected ? 'border-[#7C5CFC] ring-2 ring-[#7C5CFC]/20 shadow-md' : 'border-neutral-100 shadow-sm'
        } ${focusedIndex === index ? 'ring-2 ring-primary-200/50 bg-primary-50/30' : ''}`}
      >
        {/* Top accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-neutral-700 to-neutral-500" />

        <div className="p-5">
          {/* Header: Checkbox + Icon + Name */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => { e.stopPropagation(); toggleSelect(entreprise.id); }}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 h-4 w-4 rounded border-neutral-300 text-[#7C5CFC] focus:ring-[#7C5CFC]/30 cursor-pointer flex-shrink-0"
            />
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-neutral-100 to-neutral-50 border border-neutral-100 overflow-hidden">
              <CompanyLogo src={entreprise.logoUrl} siteWeb={entreprise.siteWeb} name={entreprise.nom} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-semibold text-neutral-900">
                {entreprise.nom}
              </p>
              {entreprise.secteur && (
                <p className="mt-0.5 text-[13px] text-neutral-500 truncate">{entreprise.secteur}</p>
              )}
            </div>
          </div>

          {/* Stats chips */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 border border-blue-100">
              <span className="text-[14px] font-semibold text-blue-600">{clientCount}</span>
              <span className="text-[11px] text-blue-500">client{clientCount > 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 border border-violet-100">
              <span className="text-[14px] font-semibold text-violet-600">{mandatCount}</span>
              <span className="text-[11px] text-violet-500">mandat{mandatCount > 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Location + Taille */}
          <div className="mt-3 pt-3 border-t border-neutral-50 flex flex-wrap items-center gap-2">
            {entreprise.localisation && (
              <div className="inline-flex items-center gap-1.5 rounded-full bg-neutral-50 px-2.5 py-1 text-[11px] font-medium text-neutral-600 border border-neutral-100">
                <MapPin size={11} className="text-neutral-400" />
                {entreprise.localisation}
              </div>
            )}
            {entreprise.taille && (
              <Badge variant={tailleVariant[entreprise.taille]} size="sm">
                {tailleLabels[entreprise.taille]}
              </Badge>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Entreprises"
        breadcrumbs={[{ label: 'Entreprises' }]}
        actions={
          <div className="flex items-center gap-3">
            {/* Counter badge */}
            {!isLoading && (
              <Badge variant="neutral" size="md">
                {total} entreprise{total > 1 ? 's' : ''}
              </Badge>
            )}
            {/* View toggle */}
            <div className="flex items-center rounded-lg border border-border bg-bg-secondary p-0.5">
              <button
                onClick={() => setView('grid')}
                className={`rounded-md p-1.5 transition-colors ${view === 'grid' ? 'bg-white text-accent shadow-sm' : 'text-text-tertiary hover:text-text-secondary'}`}
                title="Vue grille"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setView('table')}
                className={`rounded-md p-1.5 transition-colors ${view === 'table' ? 'bg-white text-accent shadow-sm' : 'text-text-tertiary hover:text-text-secondary'}`}
                title="Vue tableau"
              >
                <List size={16} />
              </button>
            </div>
            <Button onClick={() => navigate('/entreprises/new')}>
              <Plus size={16} /> Ajouter
            </Button>
          </div>
        }
      />

      {/* Search + Filters (compact row) */}
      <div className="mb-3 flex items-start gap-3">
        <div className="relative shrink-0" style={{ width: 240 }}>
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Rechercher une entreprise..."
            className="h-8 w-full rounded-md border border-neutral-200 bg-white pl-8 pr-3 text-xs outline-none transition-all focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
          />
        </div>
        <div className="flex-1 min-w-0">
          <FilterBar
            filters={filterConfigs}
            values={filterValues}
            onChange={handleFilterChange}
            onReset={handleFilterReset}
            resultCount={data?.data?.length ?? 0}
            totalCount={data?.meta?.total ?? 0}
          />
        </div>
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
      ) : !sortedEntreprises.length ? (
        <EmptyState
          title="Aucune entreprise"
          description="Centralisez les informations de vos entreprises clientes et prospects en ajoutant votre première entreprise."
          actionLabel="Ajouter une entreprise"
          onAction={() => navigate('/entreprises/new')}
          icon={<Building size={48} strokeWidth={1} />}
        />
      ) : (
        <>
          {view === 'grid' ? (
            <motion.div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" variants={listStagger} initial="hidden" animate="show">
              {sortedEntreprises.map((e, index) => (
                <motion.div key={e.id} variants={listItem}>
                  <EntrepriseCard entreprise={e} index={index} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <Table
              columns={columns}
              data={sortedEntreprises}
              keyExtractor={(r) => r.id}
              onRowClick={(r) => navigate(`/entreprises/${r.id}`)}
              onRowMouseEnter={(r) => prefetchOnHover(['entreprise', r.id], `/entreprises/${r.id}`)}
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
        entityLabel="entreprises"
        actions={SELECTION_ACTIONS}
        onAction={handleSelectionAction}
        onCancel={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
