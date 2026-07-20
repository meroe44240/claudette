import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, User, Briefcase, ArrowRight, Euro, Calendar } from 'lucide-react';
import { api } from '../../lib/api-client';
import { usePageTitle } from '../../hooks/usePageTitle';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';

type Statut = 'OUVERT' | 'EN_COURS' | 'GAGNE' | 'PERDU' | 'ANNULE' | 'CLOTURE';
type Priorite = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE';
type Stage =
  | 'SOURCING'
  | 'CONTACTE'
  | 'ENTRETIEN_1'
  | 'ENVOYE_CLIENT'
  | 'ENTRETIEN_CLIENT'
  | 'OFFRE'
  | 'PLACE'
  | 'REFUSE';

interface UserRef {
  id: string;
  nom: string;
  prenom: string | null;
}

interface MandatMine {
  id: string;
  titrePoste: string;
  statut: Statut;
  priorite: Priorite;
  feeMontantEstime: number | null;
  feeMontantFacture: number | null;
  dateOuverture: string;
  dateCloture: string | null;
  entreprise: { id: string; nom: string };
  client: { id: string; nom: string; prenom: string | null };
  sales: UserRef | null;
  recruteur: UserRef | null;
  candidatures: Array<{ id: string; stage: Stage }>;
}

const STAGE_LABEL: Record<Stage, string> = {
  SOURCING: 'Sourcing',
  CONTACTE: 'Contactés',
  ENTRETIEN_1: 'Entr. recruteur',
  ENVOYE_CLIENT: 'Envoyés client',
  ENTRETIEN_CLIENT: 'Entr. client',
  OFFRE: 'Offres',
  PLACE: 'Placés',
  REFUSE: 'Refusés',
};

const ACTIVE_STAGES: Stage[] = [
  'SOURCING',
  'CONTACTE',
  'ENTRETIEN_1',
  'ENVOYE_CLIENT',
  'ENTRETIEN_CLIENT',
  'OFFRE',
];

const STATUT_LABEL: Record<Statut, string> = {
  OUVERT: 'Ouvert',
  EN_COURS: 'En cours',
  GAGNE: 'Gagné',
  PERDU: 'Perdu',
  ANNULE: 'Annulé',
  CLOTURE: 'Clôturé',
};

const STATUT_TONE: Record<Statut, { bg: string; fg: string }> = {
  OUVERT:   { bg: 'rgba(42,107,216,0.10)',  fg: '#2a6bd8' },
  EN_COURS: { bg: 'rgba(180,120,20,0.10)',  fg: '#b47814' },
  GAGNE:    { bg: 'rgba(59,154,84,0.12)',   fg: '#3b9a54' },
  PERDU:    { bg: 'rgba(176,54,31,0.10)',   fg: '#b0361f' },
  ANNULE:   { bg: 'rgba(140,140,140,0.15)', fg: '#4a4568' },
  CLOTURE:  { bg: '#eceaf2',                fg: '#4a4568' },
};

function userLabel(u: UserRef | null): string {
  if (!u) return '—';
  return [u.prenom, u.nom].filter(Boolean).join(' ').trim() || '—';
}

function initials(u: UserRef | null): string {
  if (!u) return '—';
  const p = (u.prenom || '')[0] ?? '';
  const n = (u.nom || '')[0] ?? '';
  return (p + n).toUpperCase() || '—';
}

function formatEuro(v: number | null): string {
  if (v == null) return '—';
  return `${Math.round(v / 1000)}k€`;
}

function daysBetween(a: string, b: Date = new Date()): number {
  return Math.floor((b.getTime() - new Date(a).getTime()) / 86400000);
}

export default function MesMandatsPage() {
  usePageTitle('Mes Mandats');
  const navigate = useNavigate();
  const [tab, setTab] = useState<'open' | 'closed'>('open');

  const openQuery = useQuery({
    queryKey: ['mes-mandats', 'open'],
    queryFn: () => api.get<MandatMine[]>('/mandats/mine?status=open'),
  });

  const closedQuery = useQuery({
    queryKey: ['mes-mandats', 'closed'],
    queryFn: () => api.get<MandatMine[]>('/mandats/mine?status=closed'),
  });

  const openCount = openQuery.data?.length ?? 0;
  const closedCount = closedQuery.data?.length ?? 0;

  const active = tab === 'open' ? openQuery : closedQuery;
  const mandats = active.data ?? [];

  return (
    <div>
      <PageHeader
        title="Mes Mandats"
        subtitle="Tous les mandats où tu es sales, recruteur, ou co-recruteur."
        breadcrumbs={[{ label: 'Mes Mandats' }]}
      />

      <div className="mb-6 flex items-center gap-2 border-b border-neutral-100">
        <TabButton
          label="Ouverts"
          count={openCount}
          active={tab === 'open'}
          onClick={() => setTab('open')}
          loading={openQuery.isLoading}
        />
        <TabButton
          label="Fermés"
          count={closedCount}
          active={tab === 'closed'}
          onClick={() => setTab('closed')}
          loading={closedQuery.isLoading}
        />
      </div>

      {active.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : mandats.length === 0 ? (
        <EmptyState
          title={tab === 'open' ? 'Aucun mandat ouvert' : 'Aucun mandat fermé'}
          description={
            tab === 'open'
              ? "Tu n'as pas de mandat OUVERT ou EN_COURS pour l'instant."
              : "Aucun mandat GAGNÉ / PERDU / ANNULÉ / CLÔTURÉ à afficher."
          }
        />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          >
            {mandats.map((m) => (
              <MandatCard
                key={m.id}
                mandat={m}
                onOpen={() => navigate(`/mandats/${m.id}/kanban`)}
                scope={tab}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function TabButton({
  label,
  count,
  active,
  onClick,
  loading,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-3 text-sm font-semibold transition-colors ${
        active
          ? 'text-primary-800'
          : 'text-neutral-500 hover:text-neutral-700'
      }`}
    >
      <span>{label}</span>
      <span
        className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
          active
            ? 'bg-primary-800 text-white'
            : 'bg-neutral-100 text-neutral-500'
        }`}
      >
        {loading ? '…' : count}
      </span>
      {active && (
        <motion.div
          layoutId="mes-mandats-tab-underline"
          className="absolute -bottom-px left-2 right-2 h-0.5 rounded-full bg-primary-800"
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        />
      )}
    </button>
  );
}

function MandatCard({
  mandat,
  onOpen,
  scope,
}: {
  mandat: MandatMine;
  onOpen: () => void;
  scope: 'open' | 'closed';
}) {
  const clientLabel =
    [mandat.client.prenom, mandat.client.nom].filter(Boolean).join(' ').trim() || '—';

  const byStage = useMemo(() => {
    const m = new Map<Stage, number>();
    for (const s of ACTIVE_STAGES) m.set(s, 0);
    for (const c of mandat.candidatures) {
      if (ACTIVE_STAGES.includes(c.stage)) {
        m.set(c.stage, (m.get(c.stage) ?? 0) + 1);
      }
    }
    return m;
  }, [mandat.candidatures]);

  const totalActifs = Array.from(byStage.values()).reduce((s, n) => s + n, 0);
  const tone = STATUT_TONE[mandat.statut];

  const ageDays = daysBetween(mandat.dateOuverture);
  const closedDays = mandat.dateCloture ? daysBetween(mandat.dateCloture) : null;

  const feeShown =
    scope === 'closed' && mandat.feeMontantFacture
      ? formatEuro(mandat.feeMontantFacture)
      : formatEuro(mandat.feeMontantEstime);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full flex-col gap-3 rounded-2xl border border-neutral-100 bg-white p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-primary-100 hover:shadow-card-hover"
    >
      {/* Header — statut + fee */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: tone.fg }}
          />
          {STATUT_LABEL[mandat.statut]}
        </span>
        <div className="flex items-center gap-1 text-xs font-semibold text-neutral-700 tabular-nums">
          <Euro size={12} className="text-neutral-400" strokeWidth={2} />
          {feeShown}
        </div>
      </div>

      {/* Title */}
      <div>
        <h3
          className="text-[17px] leading-tight text-neutral-900"
          style={{ fontFamily: "'Archivo Black', sans-serif", letterSpacing: '-0.01em' }}
        >
          {mandat.titrePoste}
        </h3>
        <div className="mt-1 flex items-center gap-1.5 text-[13px] text-neutral-500">
          <Building2 size={13} strokeWidth={2} />
          <span>{mandat.entreprise.nom}</span>
        </div>
      </div>

      {/* Contact + binome */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-neutral-500">
        <span className="inline-flex items-center gap-1">
          <User size={12} strokeWidth={2} />
          {clientLabel}
        </span>
      </div>

      <div className="flex items-center gap-3 text-[11px]">
        <BinomeChip role="Sales" user={mandat.sales} />
        <BinomeChip role="Recruteur" user={mandat.recruteur} />
      </div>

      {/* Pipeline */}
      {scope === 'open' && (
        <div className="mt-1">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Pipeline
            </span>
            <span className="text-[12px] font-bold text-neutral-700 tabular-nums">
              {totalActifs} en process
            </span>
          </div>
          {totalActifs === 0 ? (
            <p className="text-[12px] italic text-neutral-400">Aucun candidat actif.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {ACTIVE_STAGES.map((s) => {
                const n = byStage.get(s) ?? 0;
                if (n === 0) return null;
                return (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-md bg-neutral-75 px-2 py-0.5 text-[11px] text-neutral-700"
                  >
                    <span className="text-neutral-500">{STAGE_LABEL[s]}</span>
                    <span className="font-bold tabular-nums text-neutral-900">{n}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Footer — dates + CTA */}
      <div className="mt-auto flex items-center justify-between border-t border-neutral-100 pt-3">
        <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
          <Calendar size={12} strokeWidth={2} />
          {scope === 'open'
            ? `Ouvert il y a ${ageDays}j`
            : closedDays !== null
              ? `Fermé il y a ${closedDays}j`
              : `Ouvert il y a ${ageDays}j`}
        </div>
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary-800 transition-colors group-hover:text-primary-700">
          Kanban
          <ArrowRight
            size={13}
            strokeWidth={2.5}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </button>
  );
}

function BinomeChip({ role, user }: { role: string; user: UserRef | null }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-primary-800"
        style={{ background: '#E6E9AF' }}
      >
        {initials(user)}
      </span>
      <span className="text-neutral-500">
        <span className="text-neutral-400">{role} : </span>
        <span className="font-medium text-neutral-700">{userLabel(user)}</span>
      </span>
    </span>
  );
}
