import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { LayoutGrid, List, Plus, Search, Building2, Mail, Send, Download } from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import Pagination from '../../components/ui/Pagination';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton, { SkeletonCard } from '../../components/ui/Skeleton';
import FilterBar from '../../components/ui/FilterBar';
import type { FilterConfig } from '../../components/ui/FilterBar';
import SelectionBar from '../../components/ui/SelectionBar';
import type { SelectionAction } from '../../components/ui/SelectionBar';
import SortableHeader, { toggleSort, applySortToData } from '../../components/ui/SortableHeader';
import type { SortConfig } from '../../components/ui/SortableHeader';

type RoleContact = 'HIRING_MANAGER' | 'DRH' | 'PROCUREMENT' | 'CEO' | 'AUTRE';
type StatutClient =
  | 'LEAD'
  | 'PREMIER_CONTACT'
  | 'BESOIN_QUALIFIE'
  | 'PROPOSITION_ENVOYEE'
  | 'MANDAT_SIGNE'
  | 'RECURRENT'
  | 'INACTIF';

interface Client {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  poste: string | null;
  roleContact: RoleContact | null;
  statutClient: StatutClient;
  entreprise: { id: string; nom: string; localisation?: string | null; secteur?: string | null };
  mandats?: { id: string; statut: string }[];
  assignedTo?: { id: string; nom: string; prenom: string | null } | null;
  lastActivity?: string | null;
}

interface PaginatedResponse {
  data: Client[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  };
}

const roleLabels: Record<RoleContact, string> = {
  HIRING_MANAGER: 'Hiring Manager',
  DRH: 'DRH',
  PROCUREMENT: 'Procurement',
  CEO: 'CEO',
  AUTRE: 'Autre',
};

const statutLabels: Record<StatutClient, string> = {
  LEAD: 'Lead',
  PREMIER_CONTACT: 'Premier contact',
  BESOIN_QUALIFIE: 'Besoin qualifie',
  PROPOSITION_ENVOYEE: 'Proposition envoyee',
  MANDAT_SIGNE: 'Mandat signe',
  RECURRENT: 'Recurrent',
  INACTIF: 'Inactif',
};

const statutVariant: Record<StatutClient, 'default' | 'info' | 'warning' | 'success' | 'error' | 'primary' | 'teal' | 'indigo'> = {
  LEAD: 'warning',
  PREMIER_CONTACT: 'info',
  BESOIN_QUALIFIE: 'teal',
  PROPOSITION_ENVOYEE: 'primary',
  MANDAT_SIGNE: 'success',
  RECURRENT: 'indigo',
  INACTIF: 'error',
};

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

type ViewMode = 'grid' | 'table';

// ── Filter config ─────────────────────────────────────────────
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

const STATUS_OPTIONS: { value: StatutClient; label: string }[] = [
  { value: 'LEAD', label: 'Lead' },
  { value: 'PREMIER_CONTACT', label: 'Premier contact' },
  { value: 'BESOIN_QUALIFIE', label: 'Besoin qualifie' },
  { value: 'PROPOSITION_ENVOYEE', label: 'Proposition envoyee' },
  { value: 'MANDAT_SIGNE', label: 'Mandat signe' },
  { value: 'RECURRENT', label: 'Recurrent' },
  { value: 'INACTIF', label: 'Inactif' },
];

const ROLE_OPTIONS = [
  { value: 'DRH', label: 'DRH' },
  { value: 'CEO', label: 'CEO' },
  { value: 'HIRING_MANAGER', label: 'Hiring Manager' },
  { value: 'PROCUREMENT', label: 'Procurement' },
  { value: 'VP_SALES', label: 'VP Sales' },
  { value: 'CRO', label: 'CRO' },
  { value: 'HEAD_OF_TALENT', label: 'Head of Talent' },
  { value: 'AUTRE', label: 'Autre' },
];

const LAST_ACTIVITY_OPTIONS = [
  { value: '7', label: 'Moins de 7j' },
  { value: '30', label: '7-30j' },
  { value: '90', label: '30-90j' },
  { value: '90+', label: 'Plus de 90j' },
  { value: 'never', label: 'Jamais' },
];

// ── Selection actions ─────────────────────────────────────────
const SELECTION_ACTIONS: SelectionAction[] = [
  { key: 'email', label: 'Email groupe', icon: Mail, variant: 'primary' },
  { key: 'relance', label: 'Relance', icon: Send, variant: 'secondary' },
  { key: 'export', label: 'Exporter CSV', icon: Download, variant: 'ghost' },
];

// ── Helper: parse filter values from URL ──────────────────────
function parseFiltersFromURL(params: URLSearchParams): Record<string, any> {
  const result: Record<string, any> = {};
  const multiKeys = ['sector', 'status', 'city', 'role'];
  for (const key of multiKeys) {
    const val = params.get(key);
    if (val) result[key] = val.split(',');
  }
  const singleKeys = ['assigned_to', 'last_activity'];
  for (const key of singleKeys) {
    const val = params.get(key);
    if (val) result[key] = val;
  }
  if (params.get('has_active_mandate') === 'true') result.has_active_mandate = true;
  return result;
}

function serializeFiltersToURL(values: Record<string, any>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(values)) {
    if (Array.isArray(val) && val.length > 0) result[key] = val.join(',');
    else if (val === true) result[key] = 'true';
    else if (typeof val === 'string' && val) result[key] = val;
  }
  return result;
}

export default function ClientsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('grid');
  const [searchParams, setSearchParams] = useSearchParams();
  const entrepriseId = searchParams.get('entrepriseId') || undefined;
  const navigate = useNavigate();
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const handleSort = useCallback((key: string) => {
    setSortConfig((prev) => toggleSort(prev, key));
  }, []);

  // ── Filter state from URL ─────────────────────────────────────
  const [filterValues, setFilterValues] = useState<Record<string, any>>(() =>
    parseFiltersFromURL(searchParams),
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync filters to URL with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const serialized = serializeFiltersToURL(filterValues);
      const newParams = new URLSearchParams();
      if (entrepriseId) newParams.set('entrepriseId', entrepriseId);
      for (const [k, v] of Object.entries(serialized)) newParams.set(k, v);
      setSearchParams(newParams, { replace: true });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [filterValues, entrepriseId, setSearchParams]);

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
    // Placeholder for action handling
    console.log('Selection action:', key, 'on ids:', Array.from(selectedIds));
  }, [selectedIds]);

  // ── Data fetching ─────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['clients', page, search, entrepriseId, filterValues],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('perPage', '20');
      if (search) params.set('search', search);
      if (entrepriseId) params.set('entrepriseId', entrepriseId);
      // Pass filter values as query params
      if (filterValues.sector?.length) params.set('sector', filterValues.sector.join(','));
      if (filterValues.status?.length) params.set('statutClient', filterValues.status.join(','));
      if (filterValues.city?.length) params.set('city', filterValues.city.join(','));
      if (filterValues.role?.length) params.set('role', filterValues.role.join(','));
      if (filterValues.assigned_to) params.set('assignedToId', filterValues.assigned_to);
      return api.get<PaginatedResponse>(`/clients?${params.toString()}`);
    },
  });

  // ── Dynamic filter options (cities from data) ─────────────────
  const dynamicCityOptions = useMemo(() => {
    if (!data?.data) return [];
    const cities = new Set<string>();
    data.data.forEach((c) => {
      if (c.entreprise.localisation) cities.add(c.entreprise.localisation);
    });
    return Array.from(cities).sort().map((city) => ({ value: city, label: city }));
  }, [data?.data]);

  // ── Build filter config ───────────────────────────────────────
  const filterConfigs: FilterConfig[] = useMemo(() => [
    { key: 'sector', label: 'Secteur', type: 'multi-select', options: SECTOR_OPTIONS },
    { key: 'status', label: 'Statut', type: 'multi-select', options: STATUS_OPTIONS },
    { key: 'city', label: 'Ville', type: 'multi-select', options: dynamicCityOptions },
    { key: 'role', label: 'Role', type: 'multi-select', options: ROLE_OPTIONS },
    { key: 'assigned_to', label: 'Assigne a', type: 'single-select', options: [] },
    { key: 'last_activity', label: 'Derniere activite', type: 'single-select', options: LAST_ACTIVITY_OPTIONS },
    { key: 'has_active_mandate', label: 'Mandat actif', type: 'toggle' },
  ], [dynamicCityOptions]);

  // ── Sorting (server handles filtering, client handles sort of current page) ──
  const allClients = data?.data ?? [];

  const sortedClients = useMemo(
    () => applySortToData(allClients, sortConfig, (row, key) => {
      switch (key) {
        case 'nom': return `${row.prenom || ''} ${row.nom}`.trim();
        case 'entreprise': return row.entreprise.nom;
        case 'role': return row.roleContact ? roleLabels[row.roleContact] : null;
        case 'statut': return statutLabels[row.statutClient];
        default: return null;
      }
    }),
    [allClients, sortConfig],
  );

  const total = data?.meta?.total ?? 0;
  const allSelected = sortedClients.length > 0 && sortedClients.every((c) => selectedIds.has(c.id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedClients.map((c) => c.id)));
    }
  }, [allSelected, sortedClients]);

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
      render: (r: Client) => (
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
      header: (<SortableHeader label="Nom complet" sortKey="nom" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Client) => {
        const idx = getAvatarColorIndex(r.nom);
        return (
          <div className="flex items-center gap-3">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: AVATAR_BG[idx] }}
            >
              {getInitials(r.prenom, r.nom)}
            </div>
            <span className="font-medium">
              {r.prenom} {r.nom}
            </span>
          </div>
        );
      },
    },
    {
      key: 'email',
      header: 'Email',
      render: (r: Client) => (
        <span className="text-text-secondary">{r.email || '—'}</span>
      ),
    },
    {
      key: 'poste',
      header: 'Poste',
      render: (r: Client) => r.poste || '—',
    },
    {
      key: 'entreprise',
      header: (<SortableHeader label="Entreprise" sortKey="entreprise" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Client) => (
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
      key: 'role',
      header: (<SortableHeader label="Role" sortKey="role" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Client) =>
        r.roleContact ? <Badge variant="neutral">{roleLabels[r.roleContact]}</Badge> : '—',
    },
    {
      key: 'statut',
      header: (<SortableHeader label="Statut" sortKey="statut" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Client) => (
        <Badge variant={statutVariant[r.statutClient]}>
          {statutLabels[r.statutClient]}
        </Badge>
      ),
    },
    {
      key: 'assignedTo',
      header: 'Prise en charge',
      render: (r: Client) =>
        r.assignedTo ? (
          <div className="flex items-center gap-1.5">
            <Avatar nom={r.assignedTo.nom} prenom={r.assignedTo.prenom} size="xs" />
            <span className="text-xs truncate">{r.assignedTo.prenom?.[0]}. {r.assignedTo.nom}</span>
          </div>
        ) : (
          <Badge variant="success" size="sm">Disponible</Badge>
        ),
    },
  ];

  // ── Grid card ─────────────────────────────────────────────────
  function ClientCard({ client, index }: { client: Client; index: number }) {
    const fullName = `${client.prenom || ''} ${client.nom}`.trim();
    const colorIdx = getAvatarColorIndex(client.nom);
    const isSelected = selectedIds.has(client.id);
    const statutColor = {
      LEAD: 'from-amber-400 to-orange-400',
      PREMIER_CONTACT: 'from-blue-400 to-cyan-400',
      BESOIN_QUALIFIE: 'from-teal-400 to-emerald-400',
      PROPOSITION_ENVOYEE: 'from-[#7C5CFC] to-[#A78BFA]',
      MANDAT_SIGNE: 'from-emerald-400 to-green-500',
      RECURRENT: 'from-indigo-400 to-violet-400',
      INACTIF: 'from-neutral-300 to-neutral-400',
    }[client.statutClient] || 'from-neutral-300 to-neutral-400';

    return (
      <div
        onClick={() => navigate(`/clients/${client.id}`)}
        className={`group relative cursor-pointer rounded-2xl border bg-white overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
          isSelected ? 'border-[#7C5CFC] ring-2 ring-[#7C5CFC]/20 shadow-md' : 'border-neutral-100 shadow-sm'
        }`}
      >
        {/* Top accent bar — color based on status */}
        <div className={`h-1 w-full bg-gradient-to-r ${statutColor}`} />

        <div className="p-5">
          {/* Header: Checkbox + Avatar + Name */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => { e.stopPropagation(); toggleSelect(client.id); }}
              onClick={(e) => e.stopPropagation()}
              className="mt-1 h-4 w-4 rounded border-neutral-300 text-[#7C5CFC] focus:ring-[#7C5CFC]/30 cursor-pointer flex-shrink-0"
            />
            <div
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: AVATAR_BG[colorIdx] }}
            >
              {getInitials(client.prenom, client.nom)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-neutral-900">{fullName}</p>
              {client.poste && (
                <p className="mt-0.5 truncate text-[13px] text-neutral-500">{client.poste}</p>
              )}
            </div>
          </div>

          {/* Entreprise chip */}
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-neutral-50 px-2.5 py-1 text-[12px] font-medium text-neutral-600 border border-neutral-100">
            <Building2 size={12} className="text-neutral-400" />
            <span className="truncate max-w-[160px]">{client.entreprise.nom}</span>
          </div>

          {/* Status + Role badges */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge variant={statutVariant[client.statutClient]} size="sm">
              {statutLabels[client.statutClient]}
            </Badge>
            {client.roleContact && (
              <Badge variant="neutral" size="sm">{roleLabels[client.roleContact]}</Badge>
            )}
          </div>

          {/* Owner indicator */}
          <div className="mt-3 pt-3 border-t border-neutral-50 flex items-center gap-1.5">
            {client.assignedTo ? (
              <>
                <Avatar nom={client.assignedTo.nom} prenom={client.assignedTo.prenom} size="xs" />
                <span className="text-[12px] text-neutral-500 truncate">{client.assignedTo.prenom?.[0]}. {client.assignedTo.nom}</span>
              </>
            ) : (
              <Badge variant="success" size="sm">Disponible</Badge>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Clients"
        breadcrumbs={[{ label: 'Clients' }]}
        actions={
          <div className="flex items-center gap-3">
            {/* Counter badge */}
            {!isLoading && (
              <Badge variant="neutral" size="md">
                {total} client{total > 1 ? 's' : ''}
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
            <Button variant="secondary" onClick={() => navigate('/clients/pipeline')}>
              <LayoutGrid size={16} /> Pipeline
            </Button>
            <Button onClick={() => navigate('/clients/new')}>
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
            placeholder="Rechercher un client..."
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <Skeleton className="h-12 w-full" count={5} />
        )
      ) : !sortedClients.length ? (
        <EmptyState
          title="Aucun client"
          description="Gérez vos contacts clients et suivez vos relations commerciales en ajoutant votre premier client."
          actionLabel="Ajouter un client"
          onAction={() => navigate('/clients/new')}
          icon={<Building2 size={48} strokeWidth={1} />}
        />
      ) : (
        <>
          {view === 'grid' ? (
            <motion.div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" variants={listStagger} initial="hidden" animate="show">
              {sortedClients.map((c, index) => (
                <motion.div key={c.id} variants={listItem}>
                  <ClientCard client={c} index={index} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <Table
              columns={columns}
              data={sortedClients}
              keyExtractor={(r) => r.id}
              onRowClick={(r) => navigate(`/clients/${r.id}`)}
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
        entityLabel="clients"
        actions={SELECTION_ACTIONS}
        onAction={handleSelectionAction}
        onCancel={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
