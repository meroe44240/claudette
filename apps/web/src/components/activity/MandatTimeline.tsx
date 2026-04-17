import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Phone,
  Mail,
  Send,
  MailOpen,
  Calendar,
  FileText,
  StickyNote,
  Mic,
  ArrowRight,
  Zap,
  UserPlus,
  CheckCircle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from '../../lib/api-client';
import Skeleton from '../ui/Skeleton';

// ─── Types ────────────────────────────────────────────

type TimelineItem =
  | {
      kind: 'stage_change';
      id: string;
      date: string;
      fromStage: string | null;
      toStage: string;
      candidat: { id: string; nom: string; prenom: string | null };
      user: { nom: string; prenom: string | null } | null;
    }
  | {
      kind: 'candidature_created';
      id: string;
      date: string;
      stage: string;
      candidat: { id: string; nom: string; prenom: string | null };
    }
  | {
      kind: 'activite';
      id: string;
      date: string;
      type: string;
      direction: string | null;
      titre: string | null;
      contenu: string | null;
      source: string;
      entiteType: string | null;
      entiteId: string | null;
      candidat: { id: string; nom: string; prenom: string | null } | null;
      user: { nom: string; prenom: string | null } | null;
    };

// ─── Config ───────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  SOURCING: 'Sourcing',
  CONTACTE: 'Contacté',
  ENTRETIEN_1: 'Entretien 1',
  ENTRETIEN_CLIENT: 'Entretien client',
  OFFRE: 'Offre',
  PLACE: 'Placé',
  REFUSE: 'Refusé',
};

const STAGE_COLORS: Record<string, string> = {
  SOURCING: '#94A3B8',
  CONTACTE: '#3B82F6',
  ENTRETIEN_1: '#8B5CF6',
  ENTRETIEN_CLIENT: '#F59E0B',
  OFFRE: '#10B981',
  PLACE: '#059669',
  REFUSE: '#EF4444',
};

const ACTIVITY_ICONS: Record<
  string,
  { icon: React.ElementType; bg: string; color: string; label: string }
> = {
  APPEL: { icon: Phone, bg: '#EFF6FF', color: '#3B82F6', label: 'Appel' },
  EMAIL_SORTANT: { icon: Send, bg: '#EFF6FF', color: '#3B82F6', label: 'Email envoyé' },
  EMAIL_ENTRANT: { icon: MailOpen, bg: '#F5F3FF', color: '#7C5CFC', label: 'Email reçu' },
  EMAIL: { icon: Mail, bg: '#EFF6FF', color: '#3B82F6', label: 'Email' },
  MEETING: { icon: Calendar, bg: '#F0FDFA', color: '#14B8A6', label: 'RDV' },
  NOTE: { icon: StickyNote, bg: '#FFF7ED', color: '#F59E0B', label: 'Note' },
  TACHE: { icon: CheckCircle, bg: '#ECFDF5', color: '#059669', label: 'Tâche' },
  TRANSCRIPT: { icon: Mic, bg: '#F5F3FF', color: '#7C5CFC', label: 'Transcript' },
  SEQUENCE_STEP: { icon: Zap, bg: '#F5F3FF', color: '#7C5CFC', label: 'Séquence' },
  DOCUMENT: { icon: FileText, bg: '#F8F8FC', color: '#6B7194', label: 'Document' },
};

function getActivityConfig(type: string, direction?: string | null) {
  if (type === 'EMAIL' && direction === 'SORTANT') return ACTIVITY_ICONS.EMAIL_SORTANT;
  if (type === 'EMAIL' && direction === 'ENTRANT') return ACTIVITY_ICONS.EMAIL_ENTRANT;
  return ACTIVITY_ICONS[type] ?? { icon: FileText, bg: '#F1F2F6', color: '#6B7194', label: type };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return 'à l’instant';
  if (diffMin < 60) return `il y a ${diffMin} min`;
  if (diffH < 24) return `il y a ${diffH} h`;
  if (diffD < 7) return `il y a ${diffD} j`;
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

function displayName(p: { nom: string; prenom: string | null }): string {
  return p.prenom ? `${p.prenom} ${p.nom}` : p.nom;
}

// ─── Component ────────────────────────────────────────

type FilterKind = 'all' | 'stages' | 'activities' | 'candidatures';

interface Props {
  mandatId: string;
}

export default function MandatTimeline({ mandatId }: Props) {
  const [filter, setFilter] = useState<FilterKind>('all');

  const { data, isLoading } = useQuery<TimelineItem[]>({
    queryKey: ['mandat-timeline', mandatId],
    queryFn: () => api.get<TimelineItem[]>(`/mandats/${mandatId}/timeline`),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data;
    if (filter === 'stages') return data.filter((i) => i.kind === 'stage_change');
    if (filter === 'candidatures') return data.filter((i) => i.kind === 'candidature_created');
    if (filter === 'activities') return data.filter((i) => i.kind === 'activite');
    return data;
  }, [data, filter]);

  const counts = useMemo(() => {
    const stages = data?.filter((i) => i.kind === 'stage_change').length ?? 0;
    const cands = data?.filter((i) => i.kind === 'candidature_created').length ?? 0;
    const acts = data?.filter((i) => i.kind === 'activite').length ?? 0;
    return { total: data?.length ?? 0, stages, cands, acts };
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">Historique du mandat</h3>
        <div className="flex gap-2">
          <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
            Tout ({counts.total})
          </FilterButton>
          <FilterButton active={filter === 'stages'} onClick={() => setFilter('stages')}>
            Stages ({counts.stages})
          </FilterButton>
          <FilterButton
            active={filter === 'candidatures'}
            onClick={() => setFilter('candidatures')}
          >
            Ajouts ({counts.cands})
          </FilterButton>
          <FilterButton
            active={filter === 'activities'}
            onClick={() => setFilter('activities')}
          >
            Activités ({counts.acts})
          </FilterButton>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-border p-6 text-center text-sm text-text-secondary">
          Aucun événement pour ce filtre.
        </div>
      ) : (
        <div className="relative border-l-2 border-border pl-6">
          {filtered.map((item, idx) => (
            <motion.div
              key={`${item.kind}-${item.id}`}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18, delay: Math.min(idx * 0.01, 0.2) }}
              className="relative mb-4"
            >
              <TimelineRow item={item} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? 'bg-primary text-white'
          : 'bg-surface text-text-secondary hover:bg-surface-hover'
      }`}
    >
      {children}
    </button>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  if (item.kind === 'stage_change') {
    const fromLabel = item.fromStage ? STAGE_LABELS[item.fromStage] ?? item.fromStage : null;
    const toLabel = STAGE_LABELS[item.toStage] ?? item.toStage;
    const color = STAGE_COLORS[item.toStage] ?? '#3B82F6';
    return (
      <div className="flex items-start gap-3">
        <span
          className="absolute -left-[9px] top-2 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white"
          style={{ backgroundColor: color }}
        />
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}20`, color }}
        >
          <ArrowRight size={16} />
        </div>
        <div className="flex-1">
          <div className="text-sm text-text-primary">
            <strong>{displayName(item.candidat)}</strong>{' '}
            {fromLabel ? (
              <>
                passe de <em>{fromLabel}</em> à{' '}
              </>
            ) : (
              'ajouté en '
            )}
            <span
              className="inline-block rounded px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: `${color}20`, color }}
            >
              {toLabel}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-text-secondary">
            {formatDate(item.date)}
            {item.user && ` · par ${displayName(item.user)}`}
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === 'candidature_created') {
    const color = STAGE_COLORS[item.stage] ?? '#3B82F6';
    return (
      <div className="flex items-start gap-3">
        <span
          className="absolute -left-[9px] top-2 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white"
          style={{ backgroundColor: color }}
        />
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}20`, color }}
        >
          <UserPlus size={16} />
        </div>
        <div className="flex-1">
          <div className="text-sm text-text-primary">
            <strong>{displayName(item.candidat)}</strong> ajouté au mandat
          </div>
          <div className="mt-0.5 text-xs text-text-secondary">{formatDate(item.date)}</div>
        </div>
      </div>
    );
  }

  // activite
  const cfg = getActivityConfig(item.type, item.direction);
  const Icon = cfg.icon;
  return (
    <div className="flex items-start gap-3">
      <span
        className="absolute -left-[9px] top-2 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white"
        style={{ backgroundColor: cfg.color }}
      />
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: cfg.bg, color: cfg.color }}
      >
        <Icon size={16} />
      </div>
      <div className="flex-1">
        <div className="text-sm text-text-primary">
          <span className="font-medium">{cfg.label}</span>
          {item.titre && <> — {item.titre}</>}
          {item.candidat && (
            <span className="text-text-secondary">
              {' '}
              · {displayName(item.candidat)}
            </span>
          )}
        </div>
        {item.contenu && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-text-secondary line-clamp-3">
            {item.contenu}
          </p>
        )}
        <div className="mt-0.5 text-xs text-text-secondary">
          {formatDate(item.date)}
          {item.user && ` · par ${displayName(item.user)}`}
          {item.source && item.source !== 'MANUAL' && ` · ${item.source.toLowerCase()}`}
        </div>
      </div>
    </div>
  );
}
