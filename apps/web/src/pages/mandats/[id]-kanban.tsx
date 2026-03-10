import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { ArrowLeft, LayoutGrid, Search, UserPlus, Loader2, GripVertical, Zap } from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from '../../components/ui/Toast';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import Skeleton from '../../components/ui/Skeleton';

// ── Types ────────────────────────────────────────────

type StageCandidature =
  | 'SOURCING'
  | 'CONTACTE'
  | 'ENTRETIEN_1'
  | 'ENTRETIEN_CLIENT'
  | 'OFFRE'
  | 'PLACE'
  | 'REFUSE';

type MotifRefus =
  | 'SALAIRE'
  | 'PROFIL_PAS_ALIGNE'
  | 'CANDIDAT_DECLINE'
  | 'CLIENT_REFUSE'
  | 'TIMING'
  | 'POSTE_POURVU'
  | 'AUTRE';

interface KanbanCandidat {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  posteActuel: string | null;
  entrepriseActuelle: string | null;
  localisation: string | null;
}

interface KanbanCandidature {
  id: string;
  stage: StageCandidature;
  notes: string | null;
  candidat: KanbanCandidat;
  createdAt: string;
  updatedAt: string;
}

type KanbanData = Record<StageCandidature, KanbanCandidature[]>;

interface MandatInfo {
  id: string;
  titrePoste: string;
  entreprise: { id: string; nom: string };
}

interface SearchCandidatResult {
  id: string;
  nom: string;
  prenom: string | null;
  posteActuel: string | null;
  entrepriseActuelle: string | null;
}

interface PaginatedCandidats {
  data: SearchCandidatResult[];
  meta: { total: number; page: number; perPage: number; totalPages: number };
}

// ── Constants ────────────────────────────────────────

const STAGES: StageCandidature[] = [
  'SOURCING',
  'CONTACTE',
  'ENTRETIEN_1',
  'ENTRETIEN_CLIENT',
  'OFFRE',
  'PLACE',
  'REFUSE',
];

const STAGE_LABELS: Record<StageCandidature, string> = {
  SOURCING: 'Sourcing',
  CONTACTE: 'Contacté',
  ENTRETIEN_1: 'Entretien 1',
  ENTRETIEN_CLIENT: 'Entretien Client',
  OFFRE: 'Offre',
  PLACE: 'Placé',
  REFUSE: 'Refusé',
};

const STAGE_COLORS: Record<StageCandidature, string> = {
  SOURCING: '#F5F5F4',
  CONTACTE: '#DBEAFE',
  ENTRETIEN_1: '#E0E7FF',
  ENTRETIEN_CLIENT: '#FEF3C7',
  OFFRE: '#D1FAE5',
  PLACE: '#16A34A',
  REFUSE: '#FEE2E2',
};

const MOTIF_REFUS_OPTIONS: { value: MotifRefus; label: string }[] = [
  { value: 'SALAIRE', label: 'Salaire' },
  { value: 'PROFIL_PAS_ALIGNE', label: 'Profil pas aligné' },
  { value: 'CANDIDAT_DECLINE', label: 'Candidat décline' },
  { value: 'CLIENT_REFUSE', label: 'Client refuse' },
  { value: 'TIMING', label: 'Timing' },
  { value: 'POSTE_POURVU', label: 'Poste pourvu' },
  { value: 'AUTRE', label: 'Autre' },
];

// ── Helpers ──────────────────────────────────────────

/** Returns a French relative time string (e.g. "il y a 2j", "il y a 3h") */
function formatRelativeTimeFr(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "à l'instant";

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (months > 0) return `il y a ${months}mo`;
  if (weeks > 0) return `il y a ${weeks}sem`;
  if (days > 0) return `il y a ${days}j`;
  if (hours > 0) return `il y a ${hours}h`;
  if (minutes > 0) return `il y a ${minutes}min`;
  return "à l'instant";
}

/** Calculate days in current stage */
function daysInStage(updatedAt: string): number {
  const now = Date.now();
  const then = new Date(updatedAt).getTime();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

/** Get initials from name */
function getInitials(prenom: string | null, nom: string): string {
  const first = (prenom?.[0] || '').toUpperCase();
  const last = (nom[0] || '').toUpperCase();
  return `${first}${last}`;
}

/** Deterministic color from string */
function initialsColor(name: string): string {
  const colors = [
    '#7C5CFC', '#F59E0B', '#10B981', '#EF4444', '#3B82F6',
    '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/** Find the stage a candidature belongs to, given the kanban data */
function findStageForCandidature(kanban: KanbanData, candidatureId: string): StageCandidature | null {
  for (const stage of STAGES) {
    if (kanban[stage]?.some((c) => c.id === candidatureId)) {
      return stage;
    }
  }
  return null;
}

const columnStagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const columnItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
};

// ── Sortable Kanban Card ─────────────────────────────

interface SortableCardProps {
  candidature: KanbanCandidature;
  onClick: () => void;
}

function SortableKanbanCard({ candidature, onClick }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: candidature.id,
    data: {
      type: 'card',
      candidature,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const fullName = `${candidature.candidat.prenom || ''} ${candidature.candidat.nom}`.trim();
  const days = daysInStage(candidature.updatedAt);
  const initials = getInitials(candidature.candidat.prenom, candidature.candidat.nom);
  const avatarBg = initialsColor(fullName);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group cursor-pointer rounded-xl border border-neutral-100 bg-white p-3.5 shadow-[0_1px_2px_rgba(26,26,46,0.04)] transition-all duration-200 hover:shadow-[0_4px_16px_rgba(124,92,252,0.08)] hover:-translate-y-[1px] ${isDragging ? 'shadow-lg ring-2 ring-primary-300' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2.5">
        {/* Drag handle */}
        <button
          className="mt-0.5 shrink-0 cursor-grab rounded p-0.5 text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={14} />
        </button>

        {/* Avatar initials */}
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: avatarBg }}
        >
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          {/* Full name */}
          <p className="text-sm font-semibold text-neutral-900 truncate">{fullName}</p>

          {/* Current position + company */}
          {(candidature.candidat.posteActuel || candidature.candidat.entrepriseActuelle) && (
            <p className="mt-0.5 text-xs text-neutral-500 truncate">
              {[candidature.candidat.posteActuel, candidature.candidat.entrepriseActuelle].filter(Boolean).join(' \u2022 ')}
            </p>
          )}
        </div>

        {/* Days in stage badge */}
        {days > 0 && (
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              days > 14
                ? 'bg-red-50 text-red-600'
                : days > 7
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-neutral-100 text-neutral-500'
            }`}
          >
            {days}j
          </span>
        )}
      </div>
    </div>
  );
}

// ── Drag Overlay Card (visual clone while dragging) ──

function DragOverlayCard({ candidature }: { candidature: KanbanCandidature }) {
  const fullName = `${candidature.candidat.prenom || ''} ${candidature.candidat.nom}`.trim();
  const days = daysInStage(candidature.updatedAt);
  const initials = getInitials(candidature.candidat.prenom, candidature.candidat.nom);
  const avatarBg = initialsColor(fullName);

  return (
    <div className="w-[260px] cursor-grabbing rounded-xl border border-primary-200 bg-white p-3.5 shadow-[0_12px_40px_rgba(124,92,252,0.2)] ring-2 ring-primary-400/50">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0 p-0.5 text-primary-400">
          <GripVertical size={14} />
        </div>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: avatarBg }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-900 truncate">{fullName}</p>
          {(candidature.candidat.posteActuel || candidature.candidat.entrepriseActuelle) && (
            <p className="mt-0.5 text-xs text-neutral-500 truncate">
              {[candidature.candidat.posteActuel, candidature.candidat.entrepriseActuelle].filter(Boolean).join(' \u2022 ')}
            </p>
          )}
        </div>
        {days > 0 && (
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              days > 14
                ? 'bg-red-50 text-red-600'
                : days > 7
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-neutral-100 text-neutral-500'
            }`}
          >
            {days}j
          </span>
        )}
      </div>
    </div>
  );
}

// ── Droppable Column ─────────────────────────────────

interface DroppableColumnProps {
  stage: StageCandidature;
  items: KanbanCandidature[];
  isOver: boolean;
  children: React.ReactNode;
}

function DroppableColumn({ stage, items, isOver, children }: DroppableColumnProps) {
  const { setNodeRef } = useDroppable({
    id: stage,
    data: { type: 'column', stage },
  });

  const color = STAGE_COLORS[stage];
  const label = STAGE_LABELS[stage];

  return (
    <div
      className={`flex w-[300px] flex-shrink-0 flex-col rounded-2xl p-4 transition-colors duration-200 ${
        isOver ? 'bg-primary-50/60 ring-2 ring-primary-300/50' : 'bg-neutral-50'
      }`}
    >
      {/* Color bar */}
      <div
        className={`mb-3 h-[3px] rounded-full transition-all duration-200 ${isOver ? 'h-[4px]' : ''}`}
        style={{ backgroundColor: color }}
      />
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-neutral-900">{label}</h3>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-neutral-700 shadow-sm">
          {items.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 min-h-[100px] rounded-xl p-1 transition-colors duration-200 ${
          isOver ? 'bg-primary-100/30' : ''
        }`}
      >
        {children}
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────

export default function MandatKanbanPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Search state
  const [search, setSearch] = useState('');

  // Drag state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);

  // Refusal modal state
  const [refusalModal, setRefusalModal] = useState<{
    open: boolean;
    candidatureId: string | null;
    sourceStage: StageCandidature | null;
  }>({ open: false, candidatureId: null, sourceStage: null });
  const [selectedMotif, setSelectedMotif] = useState<string>('');

  // Add candidate modal state
  const [addCandidatOpen, setAddCandidatOpen] = useState(false);
  const [candidatSearch, setCandidatSearch] = useState('');
  const [debouncedCandidatSearch, setDebouncedCandidatSearch] = useState('');

  // Debounce the candidate search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCandidatSearch(candidatSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [candidatSearch]);

  // Configure dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before drag starts (allows clicks)
      },
    }),
    useSensor(KeyboardSensor),
  );

  // Fetch mandat details (title + entreprise)
  const { data: mandat } = useQuery({
    queryKey: ['mandat', id],
    queryFn: () => api.get<MandatInfo>(`/mandats/${id}`),
    enabled: !!id,
  });

  // Fetch kanban data
  const { data: kanban, isLoading } = useQuery({
    queryKey: ['mandat-kanban', id],
    queryFn: () => api.get<KanbanData>(`/mandats/${id}/kanban`),
    enabled: !!id,
  });

  // Search candidates for the add-candidate modal
  const { data: candidatResults, isLoading: isSearchingCandidats } = useQuery({
    queryKey: ['candidats-search', debouncedCandidatSearch],
    queryFn: () => {
      const params = new URLSearchParams({ perPage: '10' });
      if (debouncedCandidatSearch.trim()) params.set('search', debouncedCandidatSearch.trim());
      return api.get<PaginatedCandidats>(`/candidats?${params}`);
    },
    enabled: addCandidatOpen,
  });

  // Mutation to create a candidature (link a candidate to this mandat)
  const addCandidatureMutation = useMutation({
    mutationFn: (candidatId: string) =>
      api.post('/candidatures', {
        mandatId: id,
        candidatId,
        stage: 'SOURCING',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mandat-kanban', id] });
      setAddCandidatOpen(false);
      setCandidatSearch('');
      toast('success', 'Candidat ajouté au mandat');
    },
    onError: () => {
      toast('error', "Erreur lors de l'ajout du candidat");
    },
  });

  // Filtered kanban data based on search
  const filteredKanban = useMemo(() => {
    if (!kanban) return null;
    if (!search.trim()) return kanban;

    const q = search.trim().toLowerCase();
    const filtered = {} as KanbanData;

    for (const stage of STAGES) {
      filtered[stage] = (kanban[stage] || []).filter((c) => {
        const fullName = `${c.candidat.prenom || ''} ${c.candidat.nom}`.toLowerCase();
        const poste = (c.candidat.posteActuel || '').toLowerCase();
        return fullName.includes(q) || poste.includes(q);
      });
    }

    return filtered;
  }, [kanban, search]);

  // Mutation for updating candidature stage
  const updateStageMutation = useMutation({
    mutationFn: (params: { candidatureId: string; stage: StageCandidature; motifRefus?: MotifRefus }) =>
      api.put(`/candidatures/${params.candidatureId}`, {
        stage: params.stage,
        ...(params.motifRefus ? { motifRefus: params.motifRefus } : {}),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['mandat-kanban', id] });
      toast('success', `Candidat déplacé vers ${STAGE_LABELS[variables.stage]}`);
    },
    onError: () => {
      // Revert optimistic update by refetching
      queryClient.invalidateQueries({ queryKey: ['mandat-kanban', id] });
      toast('error', 'Erreur lors du déplacement du candidat');
    },
  });

  // ── Drag & Drop Handlers ──

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (!over) {
      setOverColumnId(null);
      return;
    }

    // Determine which column we're over
    const overData = over.data.current;
    if (overData?.type === 'column') {
      setOverColumnId(over.id as string);
    } else if (overData?.type === 'card' && filteredKanban) {
      // We're over another card - find its column
      const candidature = overData.candidature as KanbanCandidature;
      setOverColumnId(candidature.stage);
    }
  }, [filteredKanban]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    setActiveDragId(null);
    setOverColumnId(null);

    if (!over || !kanban) return;

    const candidatureId = active.id as string;

    // Determine the target stage
    let targetStage: StageCandidature | null = null;

    const overData = over.data.current;
    if (overData?.type === 'column') {
      targetStage = over.id as StageCandidature;
    } else if (overData?.type === 'card') {
      const overCandidature = overData.candidature as KanbanCandidature;
      targetStage = overCandidature.stage;
    }

    if (!targetStage) return;

    // Find source stage
    const sourceStage = findStageForCandidature(kanban, candidatureId);
    if (!sourceStage || sourceStage === targetStage) return;

    // If moving to REFUSE, show the refusal modal
    if (targetStage === 'REFUSE') {
      setRefusalModal({ open: true, candidatureId, sourceStage });
      setSelectedMotif('');
      return;
    }

    // Optimistic update
    const updatedKanban = { ...kanban };
    const sourceItems = [...updatedKanban[sourceStage]];
    const sourceIndex = sourceItems.findIndex((c) => c.id === candidatureId);

    if (sourceIndex === -1) return;

    const [movedItem] = sourceItems.splice(sourceIndex, 1);
    const destItems = [...updatedKanban[targetStage]];
    const updatedItem = { ...movedItem, stage: targetStage, updatedAt: new Date().toISOString() };
    destItems.push(updatedItem);

    updatedKanban[sourceStage] = sourceItems;
    updatedKanban[targetStage] = destItems;

    queryClient.setQueryData(['mandat-kanban', id], updatedKanban);

    // Fire the mutation
    updateStageMutation.mutate({ candidatureId, stage: targetStage });
  }, [kanban, id, queryClient, updateStageMutation]);

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
    setOverColumnId(null);
  }, []);

  // Get the active candidature for drag overlay
  const activeCandidature = useMemo(() => {
    if (!activeDragId || !filteredKanban) return null;
    for (const stage of STAGES) {
      const found = filteredKanban[stage]?.find((c) => c.id === activeDragId);
      if (found) return found;
    }
    return null;
  }, [activeDragId, filteredKanban]);

  // Confirm refusal
  function handleConfirmRefusal() {
    if (!refusalModal.candidatureId || !selectedMotif || !kanban) return;

    // Optimistic update
    const sourceStage = refusalModal.sourceStage;
    if (sourceStage) {
      const updatedKanban = { ...kanban };
      const sourceItems = [...updatedKanban[sourceStage]];
      const sourceIndex = sourceItems.findIndex((c) => c.id === refusalModal.candidatureId);

      if (sourceIndex !== -1) {
        const [movedItem] = sourceItems.splice(sourceIndex, 1);
        const destItems = [...updatedKanban.REFUSE];
        const updatedItem = { ...movedItem, stage: 'REFUSE' as StageCandidature, updatedAt: new Date().toISOString() };
        destItems.push(updatedItem);

        updatedKanban[sourceStage] = sourceItems;
        updatedKanban.REFUSE = destItems;

        queryClient.setQueryData(['mandat-kanban', id], updatedKanban);
      }
    }

    updateStageMutation.mutate({
      candidatureId: refusalModal.candidatureId,
      stage: 'REFUSE',
      motifRefus: selectedMotif as MotifRefus,
    });

    setRefusalModal({ open: false, candidatureId: null, sourceStage: null });
    setSelectedMotif('');
  }

  // Cancel refusal
  function handleCancelRefusal() {
    setRefusalModal({ open: false, candidatureId: null, sourceStage: null });
    setSelectedMotif('');
  }

  // Compute summary counts (based on unfiltered data)
  const stageCounts = useMemo(() => {
    if (!kanban) return null;
    const counts: Record<StageCandidature, number> = {} as Record<StageCandidature, number>;
    let total = 0;
    for (const stage of STAGES) {
      const count = (kanban[stage] || []).length;
      counts[stage] = count;
      total += count;
    }
    return { counts, total };
  }, [kanban]);

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="flex gap-4 overflow-x-auto">
          {STAGES.map((s) => (
            <Skeleton key={s} className="h-96 w-72 flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (!filteredKanban) {
    return (
      <div className="text-center py-16">
        <p className="text-text-secondary">Mandat introuvable.</p>
        <Button variant="ghost" onClick={() => navigate('/mandats')} className="mt-4">
          Retour aux mandats
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={mandat ? `Kanban \u2014 ${mandat.titrePoste}` : 'Vue Kanban'}
        subtitle={mandat?.entreprise?.nom}
        breadcrumbs={[
          { label: 'Mandats', href: '/mandats' },
          { label: mandat?.titrePoste || 'Détail', href: `/mandats/${id}` },
          { label: 'Kanban' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => setAddCandidatOpen(true)}>
              <UserPlus size={16} /> Ajouter un candidat
            </Button>
            <Link to={`/mandats/${id}/review`}>
              <Button variant="secondary">
                <Zap size={16} /> Fast Review
              </Button>
            </Link>
            <Button variant="ghost" onClick={() => navigate(`/mandats/${id}`)}>
              <ArrowLeft size={16} /> Détail
            </Button>
            <Button variant="secondary" disabled>
              <LayoutGrid size={16} /> Kanban
            </Button>
          </div>
        }
      />

      {/* Summary bar */}
      {stageCounts && stageCounts.total > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <span className="shrink-0 text-xs font-medium text-text-secondary">
            {stageCounts.total} candidat{stageCounts.total > 1 ? 's' : ''}
          </span>
          <div className="flex h-3 flex-1 overflow-hidden rounded-full">
            {STAGES.map((stage, i) => {
              const count = stageCounts.counts[stage];
              if (count === 0) return null;
              const pct = (count / stageCounts.total) * 100;
              return (
                <div
                  key={stage}
                  title={`${STAGE_LABELS[stage]}: ${count}`}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: STAGE_COLORS[stage],
                    borderTopLeftRadius: i === 0 || STAGES.slice(0, i).every((s) => stageCounts.counts[s] === 0) ? '9999px' : 0,
                    borderBottomLeftRadius: i === 0 || STAGES.slice(0, i).every((s) => stageCounts.counts[s] === 0) ? '9999px' : 0,
                    borderTopRightRadius: i === STAGES.length - 1 || STAGES.slice(i + 1).every((s) => stageCounts.counts[s] === 0) ? '9999px' : 0,
                    borderBottomRightRadius: i === STAGES.length - 1 || STAGES.slice(i + 1).every((s) => stageCounts.counts[s] === 0) ? '9999px' : 0,
                  }}
                  className="border border-border/20"
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Search input */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un candidat..."
            className="w-full rounded-xl border border-border/50 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-4 focus:ring-accent/10 focus:border-accent"
          />
        </div>
      </div>

      {/* Kanban Board with @dnd-kit */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <motion.div
          className="flex gap-4 overflow-x-auto pb-4"
          variants={columnStagger}
          initial="hidden"
          animate="show"
        >
          {STAGES.map((stage) => {
            const items = filteredKanban[stage] || [];
            const itemIds = items.map((c) => c.id);

            return (
              <motion.div key={stage} variants={columnItem}>
                <DroppableColumn
                  stage={stage}
                  items={items}
                  isOver={overColumnId === stage && activeDragId !== null}
                >
                  <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                    {items.map((candidature) => (
                      <SortableKanbanCard
                        key={candidature.id}
                        candidature={candidature}
                        onClick={() => navigate(`/candidats/${candidature.candidat.id}`)}
                      />
                    ))}
                  </SortableContext>

                  {/* Empty state */}
                  {items.length === 0 && !activeDragId && (
                    <div className="flex items-center justify-center py-8 text-xs text-neutral-300">
                      Aucun candidat
                    </div>
                  )}
                </DroppableColumn>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Drag Overlay - shows a visual copy of the card being dragged */}
        <DragOverlay dropAnimation={{
          duration: 200,
          easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
        }}>
          {activeCandidature ? (
            <DragOverlayCard candidature={activeCandidature} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Refusal Modal */}
      <Modal
        isOpen={refusalModal.open}
        onClose={handleCancelRefusal}
        title="Motif de refus"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Veuillez sélectionner le motif de refus pour cette candidature.
          </p>
          <Select
            label="Motif de refus"
            options={MOTIF_REFUS_OPTIONS}
            value={selectedMotif}
            onChange={setSelectedMotif}
            placeholder="Sélectionner un motif..."
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={handleCancelRefusal}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmRefusal}
              disabled={!selectedMotif || updateStageMutation.isPending}
            >
              Confirmer le refus
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Candidate Modal */}
      <Modal
        isOpen={addCandidatOpen}
        onClose={() => { setAddCandidatOpen(false); setCandidatSearch(''); }}
        title="Ajouter un candidat"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Recherchez un candidat existant pour l'ajouter au mandat en tant que candidature.
          </p>

          {/* Search input */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              value={candidatSearch}
              onChange={(e) => setCandidatSearch(e.target.value)}
              placeholder="Rechercher par nom, poste..."
              className="w-full rounded-xl border border-border/50 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-4 focus:ring-accent/10 focus:border-accent"
              autoFocus
            />
          </div>

          {/* Results list */}
          <div className="max-h-64 overflow-y-auto rounded-xl border border-border/50">
            {isSearchingCandidats ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-text-tertiary" />
              </div>
            ) : !candidatResults?.data?.length ? (
              <div className="py-8 text-center text-sm text-text-tertiary">
                Aucun candidat trouvé
              </div>
            ) : (
              candidatResults.data.map((c) => (
                <button
                  key={c.id}
                  onClick={() => addCandidatureMutation.mutate(c.id)}
                  disabled={addCandidatureMutation.isPending}
                  className="flex w-full items-center gap-3 border-b border-border/30 px-4 py-3 text-left transition-colors hover:bg-bg-secondary last:border-b-0 disabled:opacity-50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
                    {(c.prenom?.[0] || '').toUpperCase()}{c.nom[0]?.toUpperCase() || ''}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {c.prenom} {c.nom}
                    </p>
                    {(c.posteActuel || c.entrepriseActuelle) && (
                      <p className="text-xs text-text-tertiary truncate">
                        {[c.posteActuel, c.entrepriseActuelle].filter(Boolean).join(' \u2022 ')}
                      </p>
                    )}
                  </div>
                  <UserPlus size={14} className="shrink-0 text-text-tertiary" />
                </button>
              ))
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="ghost" onClick={() => { setAddCandidatOpen(false); setCandidatSearch(''); }}>
              Fermer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
