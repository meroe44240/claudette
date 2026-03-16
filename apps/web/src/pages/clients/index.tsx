import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Search, LayoutGrid, List, Mail, Phone, ArrowRightLeft, Download, UserCheck, MoreHorizontal, Building2 } from 'lucide-react';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useListNavigation } from '../../hooks/useListNavigation';
import { usePrefetch } from '../../hooks/usePrefetch';
import { toast } from '../../components/ui/Toast';
import { api } from '../../lib/api-client';
import { downloadCSV } from '../../lib/export';
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

// ── Interfaces ────────────────────────────────────────────────
interface Client {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  poste: string | null;
  roleContact: string | null;
  typeClient: string | null;
  computedType: string | null;
  statutClient: string;
  entreprise: {
    id: string;
    nom: string;
    secteur?: string | null;
    localisation?: string | null;
    logoUrl?: string | null;
    siteWeb?: string | null;
  } | null;
  mandatsActifs: number;
  revenueCumule: number;
  lastActivityAt: string | null;
  assignedTo?: { id: string; nom: string; prenom: string | null } | null;
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

// ── Helper functions ──────────────────────────────────────────
function formatRevenue(amount: number): string {
  if (amount === 0) return '\u2014';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
}

function formatRelativeDate(date: string | null): string {
  if (!date) return 'Jamais';
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return `il y a ${days}j`;
  if (days < 30) return `il y a ${Math.floor(days / 7)} sem`;
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`;
  return `il y a ${Math.floor(days / 365)} an(s)`;
}

// ── Label & variant maps ──────────────────────────────────────
const STATUT_LABELS: Record<string, string> = {
  LEAD: 'Lead',
  PREMIER_CONTACT: 'Premier contact',
  BESOIN_QUALIFIE: 'Besoin qualifi\u00e9',
  PROPOSITION_ENVOYEE: 'Proposition',
  MANDAT_SIGNE: 'Mandat sign\u00e9',
  RECURRENT: 'R\u00e9current',
  INACTIF: 'Inactif',
};

const STATUT_BADGE_VARIANT: Record<string, string> = {
  LEAD: 'default',
  PREMIER_CONTACT: 'info',
  BESOIN_QUALIFIE: 'warning',
  PROPOSITION_ENVOYEE: 'warning',
  MANDAT_SIGNE: 'success',
  RECURRENT: 'offre',
  INACTIF: 'error',
};

const ROLE_LABELS: Record<string, string> = {
  HIRING_MANAGER: 'Hiring Manager',
  DRH: 'DRH',
  PROCUREMENT: 'Procurement',
  CEO: 'CEO',
  AUTRE: 'Autre',
};

const ROLE_BADGE_VARIANT: Record<string, string> = {
  HIRING_MANAGER: 'info',
  DRH: 'primary',
  PROCUREMENT: 'warning',
  CEO: 'error',
  AUTRE: 'default',
};

const TYPE_LABELS: Record<string, string> = {
  INBOUND: '\ud83d\udce9 Inbound',
  OUTBOUND: '\ud83c\udfaf Outbound',
  RESEAU: '\ud83e\udd1d R\u00e9seau',
  CLIENT_ACTIF: '\u2705 Client actif',
  RECURRENT: '\u2b50 R\u00e9current',
};

const TYPE_BADGE_VARIANT: Record<string, string> = {
  INBOUND: 'success',
  OUTBOUND: 'info',
  RESEAU: 'primary',
  CLIENT_ACTIF: 'default',
  RECURRENT: 'warning',
};

// ── Animation variants ────────────────────────────────────────
const listStagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const listItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
};

// ── View type ─────────────────────────────────────────────────
type ViewMode = 'grid' | 'table';

// ── Filter options ────────────────────────────────────────────
const TYPE_OPTIONS = [
  { value: 'INBOUND', label: '\ud83d\udce9 Inbound' },
  { value: 'OUTBOUND', label: '\ud83c\udfaf Outbound' },
  { value: 'RESEAU', label: '\ud83e\udd1d R\u00e9seau' },
  { value: 'CLIENT_ACTIF', label: '\u2705 Client actif' },
  { value: 'RECURRENT', label: '\u2b50 R\u00e9current' },
];

const STATUT_OPTIONS = [
  { value: 'LEAD', label: 'Lead' },
  { value: 'PREMIER_CONTACT', label: 'Premier contact' },
  { value: 'BESOIN_QUALIFIE', label: 'Besoin qualifi\u00e9' },
  { value: 'PROPOSITION_ENVOYEE', label: 'Proposition' },
  { value: 'MANDAT_SIGNE', label: 'Mandat sign\u00e9' },
  { value: 'RECURRENT', label: 'R\u00e9current' },
  { value: 'INACTIF', label: 'Inactif' },
];

const ROLE_OPTIONS = [
  { value: 'HIRING_MANAGER', label: 'Hiring Manager' },
  { value: 'DRH', label: 'DRH' },
  { value: 'PROCUREMENT', label: 'Procurement' },
  { value: 'CEO', label: 'CEO' },
  { value: 'AUTRE', label: 'Autre' },
];

// ── Selection actions ─────────────────────────────────────────
const SELECTION_ACTIONS: SelectionAction[] = [
  { key: 'statut', label: 'Changer statut', icon: ArrowRightLeft, variant: 'secondary' },
  { key: 'assign', label: 'Assigner \u00e0', icon: UserCheck, variant: 'secondary' },
  { key: 'email', label: 'Email groupe', icon: Mail, variant: 'primary' },
  { key: 'export', label: 'Exporter', icon: Download, variant: 'ghost' },
];

// ── URL helpers ───────────────────────────────────────────────
function parseFiltersFromURL(params: URLSearchParams): Record<string, any> {
  const result: Record<string, any> = {};
  const multiKeys = ['typeClient', 'statutClient', 'role', 'city'];
  for (const key of multiKeys) {
    const val = params.get(key);
    if (val) result[key] = val.split(',');
  }
  const singleKeys = ['assigned_to'];
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

// ── Main component ────────────────────────────────────────────
export default function ClientsPage() {
  usePageTitle('Clients');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [searchParams, setSearchParams] = useSearchParams();
  const entrepriseId = searchParams.get('entrepriseId') || undefined;
  const navigate = useNavigate();
  const { prefetchOnHover, cancelPrefetch } = usePrefetch();
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: 'revenueCumule', direction: 'desc' });

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

  // ── Selection state ─────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ── Data fetching ───────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['clients', page, search, entrepriseId, filterValues, sortConfig],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('perPage', '20');
      if (search) params.set('search', search);
      if (entrepriseId) params.set('entrepriseId', entrepriseId);
      if (filterValues.typeClient?.length) params.set('typeClient', filterValues.typeClient.join(','));
      if (filterValues.statutClient?.length) params.set('statutClient', filterValues.statutClient.join(','));
      if (filterValues.role?.length) params.set('role', filterValues.role.join(','));
      if (filterValues.city?.length) params.set('city', filterValues.city.join(','));
      if (filterValues.assigned_to) params.set('assignedToId', filterValues.assigned_to);
      if (sortConfig) {
        params.set('sortBy', sortConfig.key);
        params.set('sortDir', sortConfig.direction);
      }
      return api.get<PaginatedResponse>(`/clients?${params.toString()}`);
    },
  });

  const total = data?.meta?.total ?? 0;

  // ── Fetch team members for "Assigne a" filter ─────────────
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

  // ── Dynamic city options from data ──────────────────────────
  const dynamicCityOptions = useMemo(() => {
    if (!data?.data) return [];
    const cities = new Set<string>();
    data.data.forEach((c) => {
      if (c.entreprise?.localisation) cities.add(c.entreprise.localisation);
    });
    return Array.from(cities).sort().map((city) => ({ value: city, label: city }));
  }, [data?.data]);

  // ── Filter config ───────────────────────────────────────────
  const filterConfigs: FilterConfig[] = useMemo(() => [
    { key: 'typeClient', label: 'Type', type: 'multi-select', options: TYPE_OPTIONS },
    { key: 'statutClient', label: 'Statut', type: 'multi-select', options: STATUT_OPTIONS },
    { key: 'role', label: 'R\u00f4le', type: 'multi-select', options: ROLE_OPTIONS },
    { key: 'city', label: 'Ville', type: 'multi-select', options: dynamicCityOptions },
    { key: 'assigned_to', label: 'Assign\u00e9 \u00e0', type: 'single-select', options: userOptions },
  ], [dynamicCityOptions, userOptions]);

  // ── Data (server-side sorting) ──────────────────────────────
  const allClients = data?.data ?? [];
  const sortedClients = allClients; // sorting is server-side

  const { focusedIndex } = useListNavigation(sortedClients.length, {
    onSelect: (index) => navigate(`/clients/${sortedClients[index].id}`),
  });

  // ── Selection actions handler ───────────────────────────────
  const handleSelectionAction = useCallback((key: string) => {
    const ids = Array.from(selectedIds);
    const selected = allClients.filter((c) => ids.includes(c.id));

    switch (key) {
      case 'export': {
        downloadCSV('clients', ids)
          .then(() => toast('success', `${ids.length} client(s) export\u00e9(s)`))
          .catch(() => toast('error', "Erreur lors de l'export"));
        break;
      }
      case 'email': {
        const emails = selected
          .map((c) => c.email)
          .filter((e): e is string => !!e);
        if (emails.length === 0) {
          toast('error', "Aucun client s\u00e9lectionn\u00e9 n'a d'email");
          break;
        }
        const mailto = `mailto:?bcc=${emails.join(',')}`;
        window.open(mailto, '_blank');
        toast('success', `Email group\u00e9 ouvert pour ${emails.length} client(s)`);
        break;
      }
      case 'statut':
        toast('info', `Changement de statut group\u00e9 pour ${selected.length} client(s) \u2014 bient\u00f4t disponible`);
        break;
      case 'assign':
        toast('info', `Assignation group\u00e9e pour ${selected.length} client(s) \u2014 bient\u00f4t disponible`);
        break;
      default:
        break;
    }
  }, [selectedIds, allClients]);

  const allSelected = sortedClients.length > 0 && sortedClients.every((c) => selectedIds.has(c.id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedClients.map((c) => c.id)));
    }
  }, [allSelected, sortedClients]);

  // ── Table columns (12 columns) ──────────────────────────────
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
    // 2. Client (Avatar + name)
    {
      key: 'nom',
      header: (<SortableHeader label="Client" sortKey="nom" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Client) => (
        <div className="flex items-center gap-3">
          <Avatar nom={r.nom} prenom={r.prenom} size="sm" />
          <span className="font-medium">
            {r.prenom} {r.nom}
          </span>
        </div>
      ),
      className: 'min-w-[180px]',
    },
    // 3. Entreprise (logo + name)
    {
      key: 'entreprise',
      header: 'Entreprise',
      render: (r: Client) => r.entreprise ? (
        <span
          className="inline-flex items-center gap-2 text-accent hover:underline cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/entreprises/${r.entreprise!.id}`);
          }}
        >
          {r.entreprise.logoUrl ? (
            <img src={r.entreprise.logoUrl} alt="" className="h-4 w-4 rounded object-contain flex-shrink-0" />
          ) : (
            <Building2 size={14} className="text-neutral-400 flex-shrink-0" />
          )}
          <span className="truncate">{r.entreprise.nom}</span>
        </span>
      ) : '\u2014',
      className: 'min-w-[140px]',
    },
    // 4. Role
    {
      key: 'role',
      header: 'R\u00f4le',
      render: (r: Client) =>
        r.roleContact ? (
          <Badge variant={(ROLE_BADGE_VARIANT[r.roleContact] || 'default') as any}>
            {ROLE_LABELS[r.roleContact] || r.roleContact}
          </Badge>
        ) : '\u2014',
      className: 'w-32',
    },
    // 5. Type (computedType)
    {
      key: 'type',
      header: 'Type',
      render: (r: Client) => {
        const t = r.computedType || r.typeClient;
        if (!t) return '\u2014';
        return (
          <Badge variant={(TYPE_BADGE_VARIANT[t] || 'default') as any}>
            {TYPE_LABELS[t] || t}
          </Badge>
        );
      },
      className: 'w-36',
    },
    // 6. Email
    {
      key: 'email',
      header: 'Email',
      render: (r: Client) => r.email ? (
        <a
          href={`mailto:${r.email}`}
          className="inline-flex items-center gap-1.5 text-neutral-600 hover:text-violet-600 transition-colors truncate max-w-[180px]"
          onClick={(e) => e.stopPropagation()}
          title={r.email}
        >
          <Mail size={12} className="text-neutral-400 flex-shrink-0" />
          <span className="truncate">{r.email}</span>
        </a>
      ) : '\u2014',
      className: 'min-w-[180px]',
    },
    // 7. Telephone
    {
      key: 'telephone',
      header: 'T\u00e9l\u00e9phone',
      render: (r: Client) => r.telephone ? (
        <a
          href={`tel:${r.telephone}`}
          className="inline-flex items-center gap-1.5 text-neutral-600 hover:text-violet-600 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <Phone size={12} className="text-neutral-400 flex-shrink-0" />
          {r.telephone}
        </a>
      ) : '\u2014',
      className: 'w-32',
    },
    // 8. Statut
    {
      key: 'statut',
      header: (<SortableHeader label="Statut" sortKey="statutClient" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Client) => (
        <Badge variant={(STATUT_BADGE_VARIANT[r.statutClient] || 'default') as any}>
          {STATUT_LABELS[r.statutClient] || r.statutClient}
        </Badge>
      ),
      className: 'w-36',
    },
    // 9. Mandats actifs
    {
      key: 'mandatsActifs',
      header: (<SortableHeader label="Mandats" sortKey="mandatsActifs" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Client) => r.mandatsActifs > 0 ? (
        <Badge variant="info">{r.mandatsActifs}</Badge>
      ) : '\u2014',
      className: 'w-20',
    },
    // 10. Revenue
    {
      key: 'revenueCumule',
      header: (<SortableHeader label="Revenue" sortKey="revenueCumule" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Client) => (
        <span className={r.revenueCumule > 0 ? 'font-semibold text-emerald-600' : 'text-neutral-400'}>
          {formatRevenue(r.revenueCumule)}
        </span>
      ),
      className: 'w-28',
    },
    // 11. Derniere interaction
    {
      key: 'lastActivityAt',
      header: (<SortableHeader label="Interaction" sortKey="lastActivityAt" sortConfig={sortConfig} onSort={handleSort} />) as unknown as string,
      render: (r: Client) => (
        <span className="text-neutral-500 text-xs">{formatRelativeDate(r.lastActivityAt)}</span>
      ),
      className: 'w-32',
    },
    // 12. Actions
    {
      key: 'actions',
      header: '',
      render: (r: Client) => (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {r.telephone && (
            <a
              href={`tel:${r.telephone}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-violet-50 hover:text-violet-600 transition-colors"
              title={`Appeler ${r.telephone}`}
            >
              <Phone size={13} />
            </a>
          )}
          {r.email && (
            <a
              href={`mailto:${r.email}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-violet-50 hover:text-violet-600 transition-colors"
              title={`Email ${r.email}`}
            >
              <Mail size={13} />
            </a>
          )}
          {r.entreprise && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/entreprises/${r.entreprise!.id}`);
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-violet-50 hover:text-violet-600 transition-colors cursor-pointer"
              title={`Voir ${r.entreprise.nom}`}
            >
              <Building2 size={13} />
            </span>
          )}
        </div>
      ),
      className: 'w-10',
    },
  ];

  // ── Card component for grid view ────────────────────────────
  function ClientCard({ client, index }: { client: Client; index: number }) {
    const fullName = `${client.prenom || ''} ${client.nom}`.trim();
    const isSelected = selectedIds.has(client.id);
    const t = client.computedType || client.typeClient;

    return (
      <div
        onClick={() => navigate(`/clients/${client.id}`)}
        onMouseEnter={() => prefetchOnHover(['client', client.id], `/clients/${client.id}`)}
        onMouseLeave={cancelPrefetch}
        className={`group relative cursor-pointer rounded-xl border bg-white overflow-hidden transition-all duration-200 hover:shadow-md hover:border-[#7C5CFC]/30 ${
          isSelected ? 'border-[#7C5CFC] ring-2 ring-[#7C5CFC]/20 shadow-md' : 'border-neutral-100 shadow-sm'
        } ${focusedIndex === index ? 'ring-2 ring-primary-200/50 bg-primary-50/30' : ''}`}
      >
        <div className="flex items-center gap-4 px-4 py-3">
          {/* Checkbox */}
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => { e.stopPropagation(); toggleSelect(client.id); }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-neutral-300 text-[#7C5CFC] focus:ring-[#7C5CFC]/30 cursor-pointer flex-shrink-0"
          />

          {/* Avatar */}
          <Avatar nom={client.nom} prenom={client.prenom} size="md" />

          {/* Name + Poste */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-neutral-900">
              {fullName}
            </p>
            {client.poste && (
              <p className="mt-0.5 truncate text-[12px] font-medium text-[#7C5CFC]">
                {client.poste}
              </p>
            )}
          </div>

          {/* Info columns */}
          <div className="hidden lg:flex items-center gap-4 flex-shrink-0">
            {/* Entreprise */}
            <div className="w-[130px]">
              {client.entreprise ? (
                <div className="flex items-center gap-1.5 text-[12px] text-neutral-600">
                  {client.entreprise.logoUrl ? (
                    <img src={client.entreprise.logoUrl} alt="" className="h-3.5 w-3.5 rounded object-contain flex-shrink-0" />
                  ) : (
                    <Building2 size={12} className="flex-shrink-0 text-neutral-400" />
                  )}
                  <span className="truncate">{client.entreprise.nom}</span>
                </div>
              ) : (
                <span className="text-[12px] text-neutral-300">{'\u2014'}</span>
              )}
            </div>

            {/* Type */}
            <div className="w-[100px]">
              {t ? (
                <Badge variant={(TYPE_BADGE_VARIANT[t] || 'default') as any} size="sm">
                  {TYPE_LABELS[t] || t}
                </Badge>
              ) : (
                <span className="text-[12px] text-neutral-300">{'\u2014'}</span>
              )}
            </div>

            {/* Statut */}
            <div className="w-[100px]">
              <Badge variant={(STATUT_BADGE_VARIANT[client.statutClient] || 'default') as any} size="sm">
                {STATUT_LABELS[client.statutClient] || client.statutClient}
              </Badge>
            </div>
          </div>

          {/* Revenue badge */}
          <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
            {client.revenueCumule > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 border border-emerald-100">
                {formatRevenue(client.revenueCumule)}
              </span>
            )}
            {client.mandatsActifs > 0 && (
              <Badge variant="info" size="sm">{client.mandatsActifs}</Badge>
            )}
          </div>
        </div>

        {/* Mobile info row */}
        <div className="lg:hidden px-4 pb-3 flex flex-wrap gap-2">
          {client.entreprise && (
            <div className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
              <Building2 size={10} className="text-neutral-400" />
              {client.entreprise.nom}
            </div>
          )}
          {t && (
            <Badge variant={(TYPE_BADGE_VARIANT[t] || 'default') as any} size="sm">
              {TYPE_LABELS[t] || t}
            </Badge>
          )}
          <Badge variant={(STATUT_BADGE_VARIANT[client.statutClient] || 'default') as any} size="sm">
            {STATUT_LABELS[client.statutClient] || client.statutClient}
          </Badge>
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
            <Button onClick={() => navigate('/clients/new')}>
              <Plus size={16} /> Nouveau client
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
          <div className="grid grid-cols-1 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <Skeleton className="h-12 w-full" count={5} />
        )
      ) : !sortedClients.length ? (
        <EmptyState
          title="Aucun client"
          description="G\u00e9rez vos contacts clients et suivez vos relations commerciales en ajoutant votre premier client."
          actionLabel="Ajouter un client"
          onAction={() => navigate('/clients/new')}
          icon={<Building2 size={48} strokeWidth={1} />}
        />
      ) : (
        <>
          {view === 'grid' ? (
            <motion.div className="grid grid-cols-1 gap-2" variants={listStagger} initial="hidden" animate="show">
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
              onRowMouseEnter={(r) => prefetchOnHover(['client', r.id], `/clients/${r.id}`)}
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
        entityLabel="clients"
        actions={SELECTION_ACTIONS}
        onAction={handleSelectionAction}
        onCancel={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
