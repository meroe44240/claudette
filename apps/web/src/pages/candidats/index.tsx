import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Search, LayoutGrid, List, MapPin, Building2, Linkedin, Mail, Zap, ArrowRightLeft, Download, Users, Banknote, Clock, Phone } from 'lucide-react';
import { toast } from '../../components/ui/Toast';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Pagination from '../../components/ui/Pagination';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton, { SkeletonCard } from '../../components/ui/Skeleton';
import Avatar from '../../components/ui/Avatar';
import FilterBar from '../../components/ui/FilterBar';
import type { FilterConfig } from '../../components/ui/FilterBar';
import SelectionBar from '../../components/ui/SelectionBar';
import type { SelectionAction } from '../../components/ui/SelectionBar';
import SortableHeader, { toggleSort } from '../../components/ui/SortableHeader';
import type { SortConfig } from '../../components/ui/SortableHeader';

interface Candidat {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  photoUrl: string | null;
  posteActuel: string | null;
  entrepriseActuelle: string | null;
  localisation: string | null;
  salaireActuel: number | null;
  salaireSouhaite: number | null;
  anneesExperience: number | null;
  source: string | null;
  tags: string[];
  linkedinUrl?: string | null;
  disponibilite?: string | null;
  createdAt?: string | null;
  stage?: string | null;
  mandatId?: string | null;
  assignedTo?: { id: string; nom: string; prenom: string | null } | null;
  _count?: { candidatures: number };
}

interface PaginatedResponse {
  data: Candidat[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

// ── Avatar helpers ──────────────────────────────────────────────
const AVATAR_BG = ['#7C5CFC','#10B981','#F59E0B','#3B82F6','#EC4899','#14B8A6','#8B5CF6','#EF4444'];

function getAvatarColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % AVATAR_BG.length;
}

function getInitials(prenom: string | null, nom: string): string {
  const p = prenom?.charAt(0)?.toUpperCase() || '';
  const n = nom.charAt(0).toUpperCase();
  return p + n || n;
}

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
const SOURCE_OPTIONS = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'candidature', label: 'Candidature' },
  { value: 'cooptation', label: 'Cooptation' },
  { value: 'sdr_import', label: 'SDR Import' },
  { value: 'autre', label: 'Autre' },
];

const STAGE_OPTIONS = [
  { value: 'SOURCING', label: 'Sourcing' },
  { value: 'CONTACTE', label: 'Contacté' },
  { value: 'ENTRETIEN_1', label: 'Entretien 1' },
  { value: 'ENTRETIEN_CLIENT', label: 'Entretien client' },
  { value: 'OFFRE', label: 'Offre' },
  { value: 'PLACE', label: 'Placé' },
  { value: 'REFUSE', label: 'Refusé' },
];

const DISPONIBILITE_OPTIONS = [
  { value: 'immediate', label: 'Immédiate' },
  { value: '1mois', label: '1 mois' },
  { value: '3mois', label: '3 mois' },
  { value: 'en_poste', label: 'En poste' },
];

const DATE_ADDED_OPTIONS = [
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: '3months', label: '3 derniers mois' },
  { value: 'year', label: 'Cette année' },
];

// ── Selection actions ───────────────────────────────────────────
const SELECTION_ACTIONS: SelectionAction[] = [
  { key: 'email', label: 'Email groupe', icon: Mail, variant: 'primary' },
  { key: 'sequence', label: 'Lancer sequence', icon: Zap, variant: 'secondary' },
  { key: 'stage', label: 'Changer etape', icon: ArrowRightLeft, variant: 'secondary' },
  { key: 'export', label: 'Exporter', icon: Download, variant: 'ghost' },
];

// ── URL helpers ─────────────────────────────────────────────────
function parseFiltersFromURL(params: URLSearchParams): Record<string, any> {
  const result: Record<string, any> = {};
  const multiKeys = ['city', 'source', 'stage'];
  for (const key of multiKeys) {
    const val = params.get(key);
    if (val) result[key] = val.split(',');
  }
  const singleKeys = ['mandat', 'assigned_to', 'disponibilite', 'date_added'];
  for (const key of singleKeys) {
    const val = params.get(key);
    if (val) result[key] = val;
  }
  const textKeys = ['poste', 'entreprise'];
  for (const key of textKeys) {
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

export default function CandidatsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('grid');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
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

  // ── Data fetching ─────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['candidats', page, search, filterValues, sortConfig],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('perPage', '20');
      if (search) params.set('search', search);
      // Pass filter values as query params
      if (filterValues.poste) params.set('poste', filterValues.poste);
      if (filterValues.entreprise) params.set('entreprise', filterValues.entreprise);
      if (filterValues.city?.length) params.set('localisation', filterValues.city.join(','));
      if (filterValues.source?.length) params.set('source', filterValues.source.join(','));
      if (filterValues.stage?.length) params.set('stage', filterValues.stage.join(','));
      if (filterValues.assigned_to) params.set('assignedToId', filterValues.assigned_to);
      if (filterValues.disponibilite) params.set('disponibilite', filterValues.disponibilite);
      if (filterValues.date_added) params.set('dateAddedPeriod', filterValues.date_added);
      // Pass sort params to server
      if (sortConfig) {
        const sortKeyMap: Record<string, string> = {
          nom: 'nom',
          poste: 'posteActuel',
          entreprise: 'entrepriseActuelle',
          localisation: 'localisation',
        };
        const apiSortKey = sortKeyMap[sortConfig.key] || sortConfig.key;
        params.set('sortBy', apiSortKey);
        params.set('sortDir', sortConfig.direction);
      }
      return api.get<PaginatedResponse>(`/candidats?${params.toString()}`);
    },
  });

  const total = data?.meta?.total ?? 0;

  // ── Fetch team members for "Assigné à" filter ───────────────
  const { data: teamUsers } = useQuery({
    queryKey: ['settings', 'team'],
    queryFn: () => api.get<{ id: string; nom: string; prenom: string | null }[]>('/settings/team'),
    staleTime: 5 * 60 * 1000,
  });

  const userOptions = useMemo(() =>
    (teamUsers || []).map((u) => ({
      value: u.id,
      label: `${u.prenom || ''} ${u.nom}`.trim(),
    })),
  [teamUsers]);

  // ── Dynamic filter options ────────────────────────────────────
  const dynamicCityOptions = useMemo(() => {
    if (!data?.data) return [];
    const cities = new Set<string>();
    data.data.forEach((c) => {
      if (c.localisation) cities.add(c.localisation);
    });
    return Array.from(cities).sort().map((city) => ({ value: city, label: city }));
  }, [data?.data]);

  const filterConfigs: FilterConfig[] = useMemo(() => [
    { key: 'poste', label: 'Poste', type: 'text', placeholder: 'Rechercher un poste...' },
    { key: 'entreprise', label: 'Entreprise', type: 'text', placeholder: 'Rechercher une entreprise...' },
    { key: 'city', label: 'Ville', type: 'multi-select', options: dynamicCityOptions },
    { key: 'source', label: 'Source', type: 'multi-select', options: SOURCE_OPTIONS },
    { key: 'stage', label: 'Étape', type: 'multi-select', options: STAGE_OPTIONS },
    { key: 'mandat', label: 'Mandat', type: 'single-select', options: [{ value: 'vivier', label: 'Vivier (aucun)' }] },
    { key: 'assigned_to', label: 'Assigné à', type: 'single-select', options: userOptions },
    { key: 'disponibilite', label: 'Disponibilité', type: 'single-select', options: DISPONIBILITE_OPTIONS },
    { key: 'date_added', label: 'Date ajout', type: 'single-select', options: DATE_ADDED_OPTIONS },
  ], [dynamicCityOptions, userOptions]);

  // ── Data (server-side sorting) ──
  const allCandidats = data?.data ?? [];
  const sortedCandidats = allCandidats; // sorting is now server-side

  const handleSelectionAction = useCallback((key: string) => {
    const ids = Array.from(selectedIds);
    const selected = allCandidats.filter((c) => ids.includes(c.id));

    switch (key) {
      case 'export': {
        const headers = ['Nom', 'Prénom', 'Email', 'Poste', 'Entreprise', 'Localisation', 'Salaire souhaité', 'Source', 'LinkedIn'];
        const rows = selected.map((c) => [
          c.nom,
          c.prenom || '',
          c.email || '',
          c.posteActuel || '',
          c.entrepriseActuelle || '',
          c.localisation || '',
          c.salaireSouhaite ? String(c.salaireSouhaite) : '',
          c.source || '',
          c.linkedinUrl || '',
        ]);
        const csvContent = [headers, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `candidats-export-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast('success', `${selected.length} candidat(s) exporté(s)`);
        break;
      }
      case 'email':
        toast('info', `Action email groupé pour ${selected.length} candidat(s) — bientôt disponible`);
        break;
      case 'sequence':
        toast('info', `Lancer séquence pour ${selected.length} candidat(s) — bientôt disponible`);
        break;
      case 'stage':
        toast('info', `Changement d'étape pour ${selected.length} candidat(s) — bientôt disponible`);
        break;
      default:
        break;
    }
  }, [selectedIds, allCandidats]);

  const allSelected = sortedCandidats.length > 0 && sortedCandidats.every((c) => selectedIds.has(c.id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedCandidats.map((c) => c.id)));
    }
  }, [allSelected, sortedCandidats]);

  // ── Table columns (for table view) ────────────────────────────
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
      render: (r: Candidat) => (
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
      render: (r: Candidat) => (
          <div className="flex items-center gap-3">
            <Avatar src={r.photoUrl} nom={r.nom} prenom={r.prenom} size="sm" />
            <span className="font-medium">
              {r.prenom} {r.nom}
            </span>
          </div>
        ),
    },
    {
      key: 'telephone',
      header: 'Téléphone',
      render: (r: Candidat) => r.telephone ? (
        <span className="flex items-center gap-1 text-neutral-600">
          <Phone size={12} className="text-neutral-400" />
          {r.telephone}
        </span>
      ) : '—',
    },
    {
      key: 'poste',
      header: (<SortableHeader label="Poste" sortKey="poste" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Candidat) => (
        <span className="text-text-secondary">{r.posteActuel || '—'}</span>
      ),
    },
    {
      key: 'entreprise',
      header: (<SortableHeader label="Entreprise" sortKey="entreprise" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Candidat) => r.entrepriseActuelle || '—',
    },
    {
      key: 'localisation',
      header: (<SortableHeader label="Ville" sortKey="localisation" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Candidat) => r.localisation || '—',
    },
    {
      key: 'salaire',
      header: 'Salaire',
      render: (r: Candidat) =>
        r.salaireSouhaite ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
            {(r.salaireSouhaite / 1000).toFixed(0)}k€
          </span>
        ) : '—',
    },
    {
      key: 'source',
      header: 'Source',
      render: (r: Candidat) => (r.source ? <Badge>{r.source}</Badge> : '—'),
    },
    {
      key: 'candidatures',
      header: 'Mandats',
      render: (r: Candidat) => (
        <Badge variant="info">{r._count?.candidatures || 0}</Badge>
      ),
    },
  ];

  // ── Card component for grid view ──────────────────────────────
  function CandidatCard({ candidat, index }: { candidat: Candidat; index: number }) {
    const fullName = `${candidat.prenom || ''} ${candidat.nom}`.trim();
    const isSelected = selectedIds.has(candidat.id);
    const salaire = candidat.salaireSouhaite || candidat.salaireActuel;
    return (
      <div
        onClick={() => navigate(`/candidats/${candidat.id}`)}
        className={`group relative cursor-pointer rounded-xl border bg-white overflow-hidden transition-all duration-200 hover:shadow-md hover:border-[#7C5CFC]/30 ${
          isSelected ? 'border-[#7C5CFC] ring-2 ring-[#7C5CFC]/20 shadow-md' : 'border-neutral-100 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-4 px-4 py-3">
          {/* Checkbox */}
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => { e.stopPropagation(); toggleSelect(candidat.id); }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-neutral-300 text-[#7C5CFC] focus:ring-[#7C5CFC]/30 cursor-pointer flex-shrink-0"
          />

          {/* Avatar */}
          <Avatar src={candidat.photoUrl} nom={candidat.nom} prenom={candidat.prenom} size="md" />

          {/* Name + Poste */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-neutral-900">
              {fullName}
            </p>
            {candidat.posteActuel && (
              <p className="mt-0.5 truncate text-[12px] font-medium text-[#7C5CFC]">
                {candidat.posteActuel}
              </p>
            )}
          </div>

          {/* Info columns: Entreprise, Ville, Salaire, Téléphone */}
          <div className="hidden lg:flex items-center gap-6 flex-shrink-0">
            {/* Entreprise */}
            <div className="w-[130px]">
              {candidat.entrepriseActuelle ? (
                <div className="flex items-center gap-1.5 text-[12px] text-neutral-600">
                  <Building2 size={12} className="flex-shrink-0 text-neutral-400" />
                  <span className="truncate">{candidat.entrepriseActuelle}</span>
                </div>
              ) : (
                <span className="text-[12px] text-neutral-300">—</span>
              )}
            </div>

            {/* Ville */}
            <div className="w-[110px]">
              {candidat.localisation ? (
                <div className="flex items-center gap-1.5 text-[12px] text-neutral-600">
                  <MapPin size={12} className="flex-shrink-0 text-neutral-400" />
                  <span className="truncate">{candidat.localisation}</span>
                </div>
              ) : (
                <span className="text-[12px] text-neutral-300">—</span>
              )}
            </div>

            {/* Salaire */}
            <div className="w-[80px] text-right">
              {salaire ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 border border-emerald-100">
                  <Banknote size={11} />
                  {(salaire / 1000).toFixed(0)}k€
                </span>
              ) : (
                <span className="text-[12px] text-neutral-300">—</span>
              )}
            </div>

            {/* Téléphone */}
            <div className="w-[120px]">
              {candidat.telephone ? (
                <div className="flex items-center gap-1.5 text-[12px] text-neutral-500">
                  <Phone size={11} className="flex-shrink-0 text-neutral-400" />
                  <span className="truncate">{candidat.telephone}</span>
                </div>
              ) : (
                <span className="text-[12px] text-neutral-300">—</span>
              )}
            </div>
          </div>

          {/* Badges: mandats + source */}
          <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
            {(candidat._count?.candidatures ?? 0) > 0 && (
              <Badge variant="info" size="sm">{candidat._count!.candidatures}</Badge>
            )}
            {candidat.linkedinUrl && (
              <span className="inline-flex items-center justify-center rounded-full bg-blue-50 w-6 h-6 text-blue-600 border border-blue-100">
                <Linkedin size={11} />
              </span>
            )}
          </div>
        </div>

        {/* Mobile info row (visible on small screens only) */}
        <div className="lg:hidden px-4 pb-3 flex flex-wrap gap-2">
          {candidat.entrepriseActuelle && (
            <div className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
              <Building2 size={10} className="text-neutral-400" />
              {candidat.entrepriseActuelle}
            </div>
          )}
          {candidat.localisation && (
            <div className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
              <MapPin size={10} className="text-neutral-400" />
              {candidat.localisation}
            </div>
          )}
          {salaire && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
              {(salaire / 1000).toFixed(0)}k€
            </span>
          )}
          {candidat.telephone && (
            <div className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
              <Phone size={10} className="text-neutral-400" />
              {candidat.telephone}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Candidats"
        breadcrumbs={[{ label: 'Candidats' }]}
        actions={
          <div className="flex items-center gap-3">
            {/* Counter badge */}
            {!isLoading && (
              <Badge variant="neutral" size="md">
                {total} candidat{total > 1 ? 's' : ''}
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
            <Button onClick={() => navigate('/candidats/new')}>
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
            placeholder="Rechercher un candidat..."
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
      ) : !sortedCandidats.length ? (
        <EmptyState
          title="Aucun candidat"
          description="Commencez à constituer votre vivier de talents en ajoutant votre premier candidat."
          actionLabel="Ajouter un candidat"
          onAction={() => navigate('/candidats/new')}
          icon={<Users size={48} strokeWidth={1} />}
        />
      ) : (
        <>
          {view === 'grid' ? (
            <motion.div className="grid grid-cols-1 gap-2" variants={listStagger} initial="hidden" animate="show">
              {sortedCandidats.map((c, index) => (
                <motion.div key={c.id} variants={listItem}>
                  <CandidatCard candidat={c} index={index} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <Table
              columns={columns}
              data={sortedCandidats}
              keyExtractor={(r) => r.id}
              onRowClick={(r) => navigate(`/candidats/${r.id}`)}
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
        entityLabel="candidats"
        actions={SELECTION_ACTIONS}
        onAction={handleSelectionAction}
        onCancel={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
