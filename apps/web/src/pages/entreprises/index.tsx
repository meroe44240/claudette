import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Search, LayoutGrid, List, Download, Building2, MapPin, Users, MoreHorizontal, Sparkles } from 'lucide-react';
import { usePageTitle } from '../../hooks/usePageTitle';
import { usePrefetch } from '../../hooks/usePrefetch';
import { toast } from '../../components/ui/Toast';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Pagination from '../../components/ui/Pagination';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import FilterBar from '../../components/ui/FilterBar';
import type { FilterConfig } from '../../components/ui/FilterBar';
import SelectionBar from '../../components/ui/SelectionBar';
import type { SelectionAction } from '../../components/ui/SelectionBar';
import SortableHeader, { toggleSort } from '../../components/ui/SortableHeader';
import type { SortConfig } from '../../components/ui/SortableHeader';

// ── Interface ────────────────────────────────────────────────────
interface Entreprise {
  id: string;
  nom: string;
  secteur: string | null;
  siteWeb: string | null;
  taille: string | null;
  localisation: string | null;
  logoUrl: string | null;
  effectif: string | null;
  pappersEnriched: boolean;
  libelleNAF: string | null;
  adresseComplete: string | null;
  _count?: { clients: number; mandats: number };
  mandatsActifs: number;
  mandatsHistoriques: number;
  revenueCumule: number;
  placements: number;
  dernierMandat: string | null;
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

// ── Helpers ──────────────────────────────────────────────────────
const TAILLE_LABELS: Record<string, string> = {
  STARTUP: 'Startup',
  PME: 'PME',
  ETI: 'ETI',
  GRAND_GROUPE: 'Grand groupe',
};

function formatRevenue(amount: number): string {
  if (amount === 0) return '\u2014';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
}

function formatRelativeDate(date: string | null): string {
  if (!date) return '\u2014';
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return `il y a ${days}j`;
  if (days < 30) return `il y a ${Math.floor(days / 7)} sem`;
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`;
  return `il y a ${Math.floor(days / 365)} an(s)`;
}

function extractCity(localisation: string | null, adresseComplete: string | null): string {
  if (localisation) return localisation;
  if (!adresseComplete) return '\u2014';
  // Try to extract city from full address (usually last meaningful part before postal code)
  const parts = adresseComplete.split(',').map((p) => p.trim());
  if (parts.length >= 2) return parts[parts.length - 1];
  return adresseComplete;
}

function formatTaille(taille: string | null, effectif: string | null): string {
  if (effectif) return effectif;
  if (taille && TAILLE_LABELS[taille]) return TAILLE_LABELS[taille];
  return '\u2014';
}

// ── Company logo ────────────────────────────────────────────────
function CompanyLogo({ url, name, size = 32 }: { url?: string | null; name: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  if (url && !imgError) {
    return (
      <img
        src={url}
        alt={name}
        className="rounded-md object-contain bg-neutral-50 border border-neutral-100"
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div
      className="rounded-md bg-neutral-100 flex items-center justify-center text-neutral-500 font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Animations ──────────────────────────────────────────────────
const listStagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const listItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
};

// ── View type ───────────────────────────────────────────────────
type ViewMode = 'grid' | 'table';

// ── Filter options ──────────────────────────────────────────────
const PERFORMANCE_OPTIONS = [
  { value: 'revenue_positive', label: 'Revenue > 0' },
  { value: 'jamais_travaille', label: 'Jamais travaille' },
];

const TAILLE_OPTIONS = [
  { value: 'STARTUP', label: 'Startup' },
  { value: 'PME', label: 'PME' },
  { value: 'ETI', label: 'ETI' },
  { value: 'GRAND_GROUPE', label: 'Grand groupe' },
];

// ── Selection actions ───────────────────────────────────────────
const SELECTION_ACTIONS: SelectionAction[] = [
  { key: 'enrich', label: 'Enrichir Pappers', icon: Sparkles, variant: 'primary' },
  { key: 'export', label: 'Exporter', icon: Download, variant: 'ghost' },
];

// ── URL helpers ─────────────────────────────────────────────────
function parseFiltersFromURL(params: URLSearchParams): Record<string, any> {
  const result: Record<string, any> = {};
  const multiKeys = ['performance', 'secteur', 'city'];
  for (const key of multiKeys) {
    const val = params.get(key);
    if (val) result[key] = val.split(',');
  }
  const singleKeys = ['taille'];
  for (const key of singleKeys) {
    const val = params.get(key);
    if (val) result[key] = val;
  }
  const toggleKeys = ['enriched'];
  for (const key of toggleKeys) {
    const val = params.get(key);
    if (val === 'true') result[key] = true;
  }
  return result;
}

function serializeFiltersToURL(values: Record<string, any>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(values)) {
    if (Array.isArray(val) && val.length > 0) result[key] = val.join(',');
    else if (typeof val === 'boolean' && val) result[key] = 'true';
    else if (typeof val === 'string' && val) result[key] = val;
  }
  return result;
}

// ── Main page ───────────────────────────────────────────────────
export default function EntreprisesPage() {
  usePageTitle('Entreprises');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { prefetchOnHover, cancelPrefetch } = usePrefetch();
  const queryClient = useQueryClient();
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: 'revenueCumule', direction: 'desc' });

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

  // ── Data fetching ─────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['entreprises', page, search, filterValues, sortConfig],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('perPage', '20');
      if (search) params.set('search', search);
      if (filterValues.performance?.length) params.set('performance', filterValues.performance.join(','));
      if (filterValues.secteur?.length) params.set('secteur', filterValues.secteur.join(','));
      if (filterValues.city?.length) params.set('localisation', filterValues.city.join(','));
      if (filterValues.taille) params.set('taille', filterValues.taille);
      if (filterValues.enriched) params.set('enriched', 'true');
      if (sortConfig) {
        params.set('sortBy', sortConfig.key);
        params.set('sortDir', sortConfig.direction);
      }
      return api.get<PaginatedResponse>(`/entreprises?${params.toString()}`);
    },
  });

  const total = data?.meta?.total ?? 0;

  // ── Dynamic filter options ────────────────────────────────────
  const dynamicSecteurOptions = useMemo(() => {
    if (!data?.data) return [];
    const sectors = new Set<string>();
    data.data.forEach((e) => {
      if (e.secteur) sectors.add(e.secteur);
      if (e.libelleNAF) sectors.add(e.libelleNAF);
    });
    return Array.from(sectors).sort().map((s) => ({ value: s, label: s }));
  }, [data?.data]);

  const dynamicCityOptions = useMemo(() => {
    if (!data?.data) return [];
    const cities = new Set<string>();
    data.data.forEach((e) => {
      const city = extractCity(e.localisation, e.adresseComplete);
      if (city && city !== '\u2014') cities.add(city);
    });
    return Array.from(cities).sort().map((city) => ({ value: city, label: city }));
  }, [data?.data]);

  const filterConfigs: FilterConfig[] = useMemo(() => [
    { key: 'performance', label: 'Performance', type: 'multi-select', options: PERFORMANCE_OPTIONS },
    { key: 'secteur', label: 'Secteur', type: 'multi-select', options: dynamicSecteurOptions },
    { key: 'city', label: 'Ville', type: 'multi-select', options: dynamicCityOptions },
    { key: 'taille', label: 'Taille', type: 'single-select', options: TAILLE_OPTIONS },
    { key: 'enriched', label: 'Pappers', type: 'toggle' },
  ], [dynamicSecteurOptions, dynamicCityOptions]);

  // ── Data (server-side sorting) ──
  const allEntreprises = data?.data ?? [];
  const sortedEntreprises = allEntreprises; // sorting is server-side

  const allSelected = sortedEntreprises.length > 0 && sortedEntreprises.every((e) => selectedIds.has(e.id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedEntreprises.map((e) => e.id)));
    }
  }, [allSelected, sortedEntreprises]);

  const [enriching, setEnriching] = useState(false);

  const handleSelectionAction = useCallback(async (key: string) => {
    const ids = Array.from(selectedIds);
    const selected = allEntreprises.filter((e) => ids.includes(e.id));

    switch (key) {
      case 'enrich': {
        if (enriching) return;
        setEnriching(true);
        toast('success', `Enrichissement de ${ids.length} entreprise(s) en cours...`);
        try {
          const result = await api.post<{ enriched: number; failed: number }>('/entreprises/bulk-enrich', { ids });
          toast('success', `${result.enriched} entreprise(s) enrichie(s) via Pappers`);
          if (result.failed > 0) {
            toast('error', `${result.failed} échec(s) d'enrichissement`);
          }
          queryClient.invalidateQueries({ queryKey: ['entreprises'] });
          setSelectedIds(new Set());
        } catch (err: any) {
          toast('error', err.message || 'Erreur lors de l\'enrichissement');
        } finally {
          setEnriching(false);
        }
        break;
      }
      case 'export': {
        const headers = ['Nom', 'Secteur', 'Localisation', 'Taille', 'Contacts', 'Mandats actifs', 'Mandats historiques', 'Revenue', 'Placements', 'Dernier mandat'];
        const rows = selected.map((e) => [
          e.nom,
          e.secteur || e.libelleNAF || '',
          extractCity(e.localisation, e.adresseComplete),
          formatTaille(e.taille, e.effectif),
          String(e._count?.clients || 0),
          String(e.mandatsActifs),
          String(e.mandatsHistoriques),
          e.revenueCumule ? String(e.revenueCumule) : '0',
          String(e.placements),
          e.dernierMandat ? new Date(e.dernierMandat).toLocaleDateString('fr-FR') : '',
        ]);
        const csvContent = [headers, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `entreprises-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast('success', `${selected.length} entreprise(s) exportee(s)`);
        break;
      }
      default:
        break;
    }
  }, [selectedIds, allEntreprises]);

  // ── Table columns (12 columns) ────────────────────────────────
  const columns = [
    // 1. Checkbox
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
    // 2. Entreprise (logo + nom + pappers badge)
    {
      key: 'nom',
      header: (<SortableHeader label="Entreprise" sortKey="nom" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Entreprise) => (
        <div className="flex items-center gap-3 min-w-[200px]">
          <CompanyLogo url={r.logoUrl} name={r.nom} size={32} />
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-medium truncate">{r.nom}</span>
              {r.pappersEnriched && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 border border-emerald-100 flex-shrink-0">
                  &#10003; Pappers
                </span>
              )}
            </div>
          </div>
        </div>
      ),
      className: 'min-w-[200px]',
    },
    // 3. Secteur
    {
      key: 'secteur',
      header: 'Secteur',
      render: (r: Entreprise) => {
        const label = r.secteur || r.libelleNAF;
        return label ? <Badge>{label}</Badge> : <span className="text-neutral-300">{'\u2014'}</span>;
      },
      className: 'w-32',
    },
    // 4. Ville
    {
      key: 'ville',
      header: 'Ville',
      render: (r: Entreprise) => {
        const city = extractCity(r.localisation, r.adresseComplete);
        return <span className="text-text-secondary text-sm">{city}</span>;
      },
      className: 'w-28',
    },
    // 5. Taille
    {
      key: 'taille',
      header: 'Taille',
      render: (r: Entreprise) => {
        const label = formatTaille(r.taille, r.effectif);
        return <span className="text-text-secondary text-sm">{label}</span>;
      },
      className: 'w-24',
    },
    // 6. Contacts
    {
      key: 'contacts',
      header: 'Contacts',
      render: (r: Entreprise) => (
        <span className="text-sm tabular-nums">{r._count?.clients || 0}</span>
      ),
      className: 'w-20',
    },
    // 7. Mandats actifs
    {
      key: 'mandatsActifs',
      header: (<SortableHeader label="Actifs" sortKey="mandatsActifs" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Entreprise) => (
        <span className={`text-sm tabular-nums ${r.mandatsActifs > 0 ? 'font-semibold text-violet-600' : ''}`}>
          {r.mandatsActifs}
        </span>
      ),
      className: 'w-20',
    },
    // 8. Mandats historiques
    {
      key: 'mandatsHistoriques',
      header: (<SortableHeader label="Historique" sortKey="mandatsHistoriques" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Entreprise) => (
        <span className="text-sm tabular-nums">{r.mandatsHistoriques}</span>
      ),
      className: 'w-20',
    },
    // 9. Revenue
    {
      key: 'revenueCumule',
      header: (<SortableHeader label="Revenue" sortKey="revenueCumule" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Entreprise) => (
        <span className={`text-sm tabular-nums ${r.revenueCumule > 0 ? 'font-semibold text-emerald-600' : 'text-neutral-400'}`}>
          {formatRevenue(r.revenueCumule)}
        </span>
      ),
      className: 'w-28',
    },
    // 10. Placements
    {
      key: 'placements',
      header: (<SortableHeader label="Placements" sortKey="placements" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Entreprise) => (
        <span className={`text-sm tabular-nums ${r.placements > 0 ? 'font-semibold' : ''}`}>
          {r.placements}
        </span>
      ),
      className: 'w-20',
    },
    // 11. Dernier mandat
    {
      key: 'dernierMandat',
      header: (<SortableHeader label="Dernier" sortKey="dernierMandat" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Entreprise) => (
        <span className="text-sm text-neutral-500">{formatRelativeDate(r.dernierMandat)}</span>
      ),
      className: 'w-28',
    },
    // 12. Actions
    {
      key: 'actions',
      header: '',
      render: (r: Entreprise) => (
        <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/entreprises/${r.id}`); }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-violet-50 hover:text-violet-600 transition-colors"
            title="Plus d'options"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      ),
      className: 'w-10',
    },
  ];

  // ── Grid card (secondary view) ────────────────────────────────
  function EntrepriseCard({ entreprise }: { entreprise: Entreprise }) {
    const isSelected = selectedIds.has(entreprise.id);
    return (
      <div
        onClick={() => navigate(`/entreprises/${entreprise.id}`)}
        onMouseEnter={() => prefetchOnHover(['entreprise', entreprise.id], `/entreprises/${entreprise.id}`)}
        onMouseLeave={cancelPrefetch}
        className={`group relative cursor-pointer rounded-xl border bg-white overflow-hidden transition-all duration-200 hover:shadow-md hover:border-[#7C5CFC]/30 ${
          isSelected ? 'border-[#7C5CFC] ring-2 ring-[#7C5CFC]/20 shadow-md' : 'border-neutral-100 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-4 px-4 py-3">
          {/* Checkbox */}
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => { e.stopPropagation(); toggleSelect(entreprise.id); }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-neutral-300 text-[#7C5CFC] focus:ring-[#7C5CFC]/30 cursor-pointer flex-shrink-0"
          />

          {/* Logo */}
          <CompanyLogo url={entreprise.logoUrl} name={entreprise.nom} size={36} />

          {/* Name + Secteur */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-[14px] font-semibold text-neutral-900">{entreprise.nom}</p>
              {entreprise.pappersEnriched && (
                <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 border border-emerald-100 flex-shrink-0">
                  &#10003; Pappers
                </span>
              )}
            </div>
            {(entreprise.secteur || entreprise.libelleNAF) && (
              <p className="mt-0.5 truncate text-[12px] text-neutral-500">{entreprise.secteur || entreprise.libelleNAF}</p>
            )}
          </div>

          {/* Stats columns (desktop) */}
          <div className="hidden lg:flex items-center gap-5 flex-shrink-0">
            {/* Ville */}
            <div className="w-[100px]">
              {(entreprise.localisation || entreprise.adresseComplete) ? (
                <div className="flex items-center gap-1.5 text-[12px] text-neutral-600">
                  <MapPin size={12} className="flex-shrink-0 text-neutral-400" />
                  <span className="truncate">{extractCity(entreprise.localisation, entreprise.adresseComplete)}</span>
                </div>
              ) : (
                <span className="text-[12px] text-neutral-300">{'\u2014'}</span>
              )}
            </div>

            {/* Contacts */}
            <div className="w-[60px] text-center">
              <div className="flex items-center gap-1 text-[12px] text-neutral-600">
                <Users size={12} className="text-neutral-400" />
                <span>{entreprise._count?.clients || 0}</span>
              </div>
            </div>

            {/* Mandats actifs */}
            <div className="w-[50px] text-center">
              {entreprise.mandatsActifs > 0 ? (
                <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-600 border border-violet-100">
                  {entreprise.mandatsActifs}
                </span>
              ) : (
                <span className="text-[12px] text-neutral-300">0</span>
              )}
            </div>

            {/* Revenue */}
            <div className="w-[90px] text-right">
              <span className={`text-[12px] tabular-nums ${entreprise.revenueCumule > 0 ? 'font-semibold text-emerald-600' : 'text-neutral-300'}`}>
                {formatRevenue(entreprise.revenueCumule)}
              </span>
            </div>
          </div>
        </div>

        {/* Mobile info row */}
        <div className="lg:hidden px-4 pb-3 flex flex-wrap gap-2">
          {(entreprise.localisation || entreprise.adresseComplete) && (
            <div className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
              <MapPin size={10} className="text-neutral-400" />
              {extractCity(entreprise.localisation, entreprise.adresseComplete)}
            </div>
          )}
          <div className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
            <Users size={10} className="text-neutral-400" />
            {entreprise._count?.clients || 0} contact(s)
          </div>
          {entreprise.mandatsActifs > 0 && (
            <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600">
              {entreprise.mandatsActifs} actif(s)
            </span>
          )}
          {entreprise.revenueCumule > 0 && (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
              {formatRevenue(entreprise.revenueCumule)}
            </span>
          )}
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
          <div className="grid grid-cols-1 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <Skeleton className="h-12 w-full" count={5} />
        )
      ) : !sortedEntreprises.length ? (
        <EmptyState
          title="Aucune entreprise"
          description="Centralisez les informations de vos entreprises clientes et prospects en ajoutant votre premiere entreprise."
          actionLabel="Ajouter une entreprise"
          onAction={() => navigate('/entreprises/new')}
          icon={<Building2 size={48} strokeWidth={1} />}
        />
      ) : (
        <>
          {view === 'grid' ? (
            <motion.div className="grid grid-cols-1 gap-2" variants={listStagger} initial="hidden" animate="show">
              {sortedEntreprises.map((e) => (
                <motion.div key={e.id} variants={listItem}>
                  <EntrepriseCard entreprise={e} />
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
              rowClassName={(r: Entreprise) => {
                if (r.revenueCumule > 20000) return 'bg-emerald-50/40';
                if (r.revenueCumule === 0 && r.mandatsHistoriques === 0) return 'text-neutral-400';
                return '';
              }}
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
