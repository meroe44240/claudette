import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { ArrowLeft, LayoutGrid, Search, TrendingUp, DollarSign, Clock, Users, Plus, Archive } from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import KanbanColumn from '../../components/ui/KanbanColumn';
import KanbanCard from '../../components/ui/KanbanCard';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Skeleton from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';

// ── Types ────────────────────────────────────────────

type StatutClient =
  | 'LEAD'
  | 'PREMIER_CONTACT'
  | 'BESOIN_QUALIFIE'
  | 'PROPOSITION_ENVOYEE'
  | 'MANDAT_SIGNE'
  | 'RECURRENT'
  | 'INACTIF';

interface PipelineClient {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  poste: string | null;
  statutClient: StatutClient;
  entreprise: { id: string; nom: string };
  joursEnStage?: number;
  lastActivityDate?: string | null;
  revenuePotentiel?: number;
  mandatsActifs?: number;
}

type PipelineData = Record<StatutClient, { count: number; clients: PipelineClient[] }>;

interface PipelineStatsData {
  totalClients: number;
  totalPipeValue: number;
  conversionRates: Array<{
    fromStatut: StatutClient;
    toStatut: StatutClient;
    rate: number;
  }>;
  avgDaysPerStage: Array<{
    statut: StatutClient;
    avgDays: number;
  }>;
  revenueByStage: Array<{
    statut: StatutClient;
    revenue: number;
  }>;
}

// ── Constants ────────────────────────────────────────

const STATUTS: StatutClient[] = [
  'LEAD',
  'PREMIER_CONTACT',
  'BESOIN_QUALIFIE',
  'PROPOSITION_ENVOYEE',
  'MANDAT_SIGNE',
  'RECURRENT',
  'INACTIF',
];

const STATUT_LABELS: Record<StatutClient, string> = {
  LEAD: 'Lead',
  PREMIER_CONTACT: 'Premier contact',
  BESOIN_QUALIFIE: 'Besoin qualifié',
  PROPOSITION_ENVOYEE: 'Proposition envoyée',
  MANDAT_SIGNE: 'Mandat signé',
  RECURRENT: 'Récurrent',
  INACTIF: 'Inactif',
};

// Palette navy — Lead = accent chartreuse (nouveau), plus la column progresse
// plus on tire vers le vert MANDAT_SIGNE. Archivage (Récurrent/Inactif) reste
// neutre.
const STATUT_COLORS: Record<StatutClient, string> = {
  LEAD:                '#8e7cc3',   // primary-500 (lavande)
  PREMIER_CONTACT:     '#4b3fb0',   // primary-700
  BESOIN_QUALIFIE:     '#b47814',   // amber
  PROPOSITION_ENVOYEE: '#22177A',   // primary-800 (brand)
  MANDAT_SIGNE:        '#3b9a54',   // success green
  RECURRENT:           '#6e6a85',   // muted
  INACTIF:             '#9a96ae',   // muted-2
};

const STATUT_BG_COLORS: Record<StatutClient, string> = {
  LEAD:                '#eceaf2',
  PREMIER_CONTACT:     '#eceaf2',
  BESOIN_QUALIFIE:     '#fbf3e7',
  PROPOSITION_ENVOYEE: '#f6f5fa',
  MANDAT_SIGNE:        '#eaf3ec',
  RECURRENT:           '#f6f5fa',
  INACTIF:             '#f6f5fa',
};

// ── Helpers ──────────────────────────────────────────

function filterClients(clients: PipelineClient[], query: string): PipelineClient[] {
  if (!query.trim()) return clients;
  const q = query.toLowerCase();
  return clients.filter((c) => {
    const fullName = `${c.prenom || ''} ${c.nom}`.toLowerCase();
    const entreprise = c.entreprise.nom.toLowerCase();
    return fullName.includes(q) || entreprise.includes(q);
  });
}

// ── Component ────────────────────────────────────────

function formatCurrency(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M\u20AC`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k\u20AC`;
  return `${n}\u20AC`;
}

function formatDaysAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Aucune';
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  return `Il y a ${days}j`;
}

// Colonnes principales du kanban commercial (LEAD → MANDAT_SIGNE)
// RECURRENT + INACTIF vont dans "archivés" toggle-able
const PRIMARY_STATUTS: StatutClient[] = [
  'LEAD',
  'PREMIER_CONTACT',
  'BESOIN_QUALIFIE',
  'PROPOSITION_ENVOYEE',
  'MANDAT_SIGNE',
];
const ARCHIVED_STATUTS: StatutClient[] = ['RECURRENT', 'INACTIF'];

export default function ClientPipelinePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [newLead, setNewLead] = useState({
    entrepriseNom: '',
    contactNom: '',
    contactPrenom: '',
    poste: '',
    email: '',
    telephone: '',
    note: '',
  });
  const resetNewLead = () =>
    setNewLead({ entrepriseNom: '', contactNom: '', contactPrenom: '', poste: '', email: '', telephone: '', note: '' });

  // Fetch pipeline data
  const { data: pipeline, isLoading } = useQuery({
    queryKey: ['clients-pipeline'],
    queryFn: () => api.get<PipelineData>('/clients/pipeline'),
  });

  // Fetch pipeline stats
  const { data: pipelineStats } = useQuery({
    queryKey: ['clients-pipeline-stats'],
    queryFn: () => api.get<PipelineStatsData>('/clients-pipeline/stats'),
  });

  // Mutation for updating client statutClient
  const updateStatutMutation = useMutation({
    mutationFn: (params: { clientId: string; statutClient: StatutClient }) =>
      api.put(`/clients/${params.clientId}`, { statutClient: params.statutClient }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clients-pipeline'] });
      // Passage en MANDAT_SIGNE = le client signe → il faut ouvrir un mandat.
      // Le contrat modal (chantier 4) automatisera ça ; pour l'instant on
      // toast un rappel actionnable.
      if (variables.statutClient === 'MANDAT_SIGNE') {
        toast('success', 'Lead signé — pense à créer le mandat associé (bouton "Nouveau" sur /mandats).');
      }
    },
  });

  // Mutation for quick-create lead (Client + Entreprise en un shot)
  const quickLeadMutation = useMutation({
    mutationFn: (payload: typeof newLead) =>
      api.post<{ client: PipelineClient; entrepriseCreated: boolean }>('/clients/quick-lead', payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['clients-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['clients-pipeline-stats'] });
      toast(
        'success',
        data.entrepriseCreated
          ? `Lead créé : ${data.client.nom} chez ${data.client.entreprise.nom} (nouvelle entreprise)`
          : `Lead créé : ${data.client.nom} chez ${data.client.entreprise.nom}`,
      );
      resetNewLead();
      setNewLeadOpen(false);
    },
    onError: () => {
      toast('error', 'Erreur lors de la création du lead');
    },
  });

  // Compute filtered pipeline based on search
  const filteredPipeline = useMemo(() => {
    if (!pipeline) return null;
    const result = {} as PipelineData;
    for (const statut of STATUTS) {
      const col = pipeline[statut] || { count: 0, clients: [] };
      const filtered = filterClients(col.clients, search);
      result[statut] = { count: filtered.length, clients: filtered };
    }
    return result;
  }, [pipeline, search]);

  // Compute summary counts from the unfiltered pipeline data
  const summaryTotal = useMemo(() => {
    if (!pipeline) return 0;
    return STATUTS.reduce((sum, s) => sum + (pipeline[s]?.count || 0), 0);
  }, [pipeline]);

  // Handle drag end
  function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatut = destination.droppableId as StatutClient;
    const sourceStatut = source.droppableId as StatutClient;

    // Optimistic update
    if (pipeline) {
      const updatedPipeline = { ...pipeline };

      const sourceClients = [...updatedPipeline[sourceStatut].clients];
      const [movedClient] = sourceClients.splice(source.index, 1);

      if (movedClient) {
        const destClients =
          sourceStatut === newStatut ? sourceClients : [...updatedPipeline[newStatut].clients];
        const updatedClient = { ...movedClient, statutClient: newStatut };
        destClients.splice(destination.index, 0, updatedClient);

        updatedPipeline[sourceStatut] = {
          count: sourceClients.length,
          clients: sourceClients,
        };

        if (sourceStatut !== newStatut) {
          updatedPipeline[newStatut] = {
            count: destClients.length,
            clients: destClients,
          };
        }

        queryClient.setQueryData(['clients-pipeline'], updatedPipeline);
      }
    }

    updateStatutMutation.mutate({ clientId: draggableId, statutClient: newStatut });
  }

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-3 w-full mb-6 rounded-full" />
        <div className="flex gap-4 overflow-x-auto">
          {STATUTS.map((s) => (
            <Skeleton key={s} className="h-96 w-72 flex-shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (!pipeline || !filteredPipeline) {
    return (
      <div className="text-center py-16">
        <p className="text-text-secondary">Impossible de charger le pipeline.</p>
        <Button variant="ghost" onClick={() => navigate('/clients')} className="mt-4">
          Retour aux clients
        </Button>
      </div>
    );
  }

  const visibleStatuts = showArchived ? [...PRIMARY_STATUTS, ...ARCHIVED_STATUTS] : PRIMARY_STATUTS;

  return (
    <div>
      <div className="mb-6">
        <span
          className="inline-block rounded-full bg-highlight px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ backgroundColor: '#E6E9AF', color: '#22177A' }}
        >
          Prospection commerciale
        </span>
        <h1
          className="mt-3 text-3xl text-neutral-900"
          style={{ fontFamily: "'Archivo Black', sans-serif", letterSpacing: '-0.02em' }}
        >
          Pipeline de leads
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          Chaque lead avance du premier contact jusqu'à la signature du mandat. Glisse une carte pour changer de stade. Un lead qui atteint « Mandat signé » devient un mandat côté recrutement.
        </p>
      </div>

      <PageHeader
        title=""
        breadcrumbs={[
          { label: 'Clients', href: '/clients' },
          { label: 'Pipeline' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate('/clients')}>
              <ArrowLeft size={16} /> Liste
            </Button>
            <Button
              variant={showArchived ? 'secondary' : 'ghost'}
              onClick={() => setShowArchived((v) => !v)}
              title={showArchived ? 'Masquer les colonnes archivées' : 'Voir Récurrent + Inactif'}
            >
              <Archive size={16} /> {showArchived ? 'Cacher archivés' : 'Voir archivés'}
            </Button>
            <Button variant="secondary" disabled>
              <LayoutGrid size={16} /> Pipeline
            </Button>
            <Button variant="primary" onClick={() => setNewLeadOpen(true)}>
              <Plus size={16} /> Nouveau lead
            </Button>
          </div>
        }
      />

      {/* Stats bar */}
      {pipelineStats && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white p-4 shadow-sm border border-border/30">
            <div className="flex items-center gap-2 mb-1">
              <Users size={14} className="text-blue-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Clients total</span>
            </div>
            <p className="text-[22px] font-bold text-neutral-900">{pipelineStats.totalClients}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm border border-border/30">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={14} className="text-emerald-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Pipe total</span>
            </div>
            <p className="text-[22px] font-bold text-emerald-600">{formatCurrency(pipelineStats.totalPipeValue)}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm border border-border/30">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={14} className="text-purple-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Conversion Lead&rarr;Mandat</span>
            </div>
            <p className="text-[22px] font-bold text-purple-600">
              {pipelineStats.conversionRates.length >= 4
                ? `${pipelineStats.conversionRates[3].rate}%`
                : '--'}
            </p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm border border-border/30">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={14} className="text-orange-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Moy. jours/stage</span>
            </div>
            <p className="text-[22px] font-bold text-orange-600">
              {pipelineStats.avgDaysPerStage.length > 0
                ? `${Math.round(pipelineStats.avgDaysPerStage.filter(s => s.avgDays > 0).reduce((sum, s) => sum + s.avgDays, 0) / Math.max(pipelineStats.avgDaysPerStage.filter(s => s.avgDays > 0).length, 1))}j`
                : '--'}
            </p>
          </div>
        </div>
      )}

      {/* Conversion funnel */}
      {pipelineStats && pipelineStats.conversionRates.length > 0 && (
        <div className="mb-5 rounded-xl bg-white p-4 shadow-sm border border-border/30">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-neutral-500 mb-3">Taux de conversion par etape</p>
          <div className="flex items-center gap-1 overflow-x-auto">
            {pipelineStats.conversionRates.map((cr, idx) => (
              <div key={idx} className="flex items-center gap-1">
                {idx === 0 && (
                  <span className="text-[11px] font-medium text-neutral-600 whitespace-nowrap">
                    {STATUT_LABELS[cr.fromStatut]}
                  </span>
                )}
                <div className="flex items-center gap-0.5">
                  <span className="text-neutral-300">&rarr;</span>
                  <span
                    className={`text-[12px] font-bold px-1.5 py-0.5 rounded ${
                      cr.rate >= 50
                        ? 'text-emerald-700 bg-emerald-50'
                        : cr.rate >= 25
                        ? 'text-orange-700 bg-orange-50'
                        : 'text-red-700 bg-red-50'
                    }`}
                  >
                    {cr.rate}%
                  </span>
                  <span className="text-neutral-300">&rarr;</span>
                </div>
                <span className="text-[11px] font-medium text-neutral-600 whitespace-nowrap">
                  {STATUT_LABELS[cr.toStatut]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary bar */}
      {summaryTotal > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-1.5">
            <span className="text-xs font-medium text-text-secondary">
              {summaryTotal} client{summaryTotal > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full">
            {STATUTS.map((statut, i) => {
              const count = pipeline[statut]?.count || 0;
              if (count === 0) return null;
              const pct = (count / summaryTotal) * 100;
              return (
                <div
                  key={statut}
                  title={`${STATUT_LABELS[statut]}: ${count}`}
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: STATUT_COLORS[statut],
                    borderTopLeftRadius: i === 0 || STATUTS.slice(0, i).every((s) => (pipeline[s]?.count || 0) === 0) ? '9999px' : 0,
                    borderBottomLeftRadius: i === 0 || STATUTS.slice(0, i).every((s) => (pipeline[s]?.count || 0) === 0) ? '9999px' : 0,
                    borderTopRightRadius: i === STATUTS.length - 1 || STATUTS.slice(i + 1).every((s) => (pipeline[s]?.count || 0) === 0) ? '9999px' : 0,
                    borderBottomRightRadius: i === STATUTS.length - 1 || STATUTS.slice(i + 1).every((s) => (pipeline[s]?.count || 0) === 0) ? '9999px' : 0,
                  }}
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
            placeholder="Rechercher par nom ou entreprise..."
            className="w-full rounded-xl border border-border/50 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-4 focus:ring-accent/10 focus:border-accent"
          />
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {visibleStatuts.map((statut) => {
            const column = filteredPipeline[statut] || { count: 0, clients: [] };

            return (
              <Droppable key={statut} droppableId={statut}>
                {(provided) => (
                  <KanbanColumn
                    title={STATUT_LABELS[statut]}
                    count={column.count}
                    color={STATUT_COLORS[statut]}
                    provided={provided}
                  >
                    {column.clients.map((client, index) => (
                      <Draggable
                        key={client.id}
                        draggableId={client.id}
                        index={index}
                      >
                        {(dragProvided) => (
                          <KanbanCard
                            title={`${client.prenom || ''} ${client.nom}`.trim()}
                            subtitle={client.poste || undefined}
                            meta={client.entreprise.nom}
                            extraLine={
                              [
                                client.revenuePotentiel ? formatCurrency(client.revenuePotentiel) : null,
                                client.joursEnStage !== undefined ? `${client.joursEnStage}j` : null,
                                client.lastActivityDate ? formatDaysAgo(client.lastActivityDate) : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || client.email || undefined
                            }
                            onClick={() => navigate(`/clients/${client.id}`)}
                            provided={dragProvided}
                          />
                        )}
                      </Draggable>
                    ))}
                  </KanbanColumn>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>

      {/* Modal Nouveau lead — quick-create Client + Entreprise en un shot */}
      <Modal
        isOpen={newLeadOpen}
        onClose={() => setNewLeadOpen(false)}
        title="Nouveau lead"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Entrée en tête de colonne « Lead ». Si l'entreprise n'existe pas encore dans le CRM, elle est créée automatiquement.
          </p>
          <Input
            label="Entreprise"
            placeholder="ACME Corp"
            value={newLead.entrepriseNom}
            onChange={(e) => setNewLead((p) => ({ ...p, entrepriseNom: e.target.value }))}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Prénom"
              placeholder="Alice"
              value={newLead.contactPrenom}
              onChange={(e) => setNewLead((p) => ({ ...p, contactPrenom: e.target.value }))}
            />
            <Input
              label="Nom"
              placeholder="Martin"
              value={newLead.contactNom}
              onChange={(e) => setNewLead((p) => ({ ...p, contactNom: e.target.value }))}
              required
            />
          </div>
          <Input
            label="Poste ciblé / rôle contact"
            placeholder="Head of Sales, Chief People Officer…"
            value={newLead.poste}
            onChange={(e) => setNewLead((p) => ({ ...p, poste: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Email (optionnel)"
              type="email"
              placeholder="alice@acme.com"
              value={newLead.email}
              onChange={(e) => setNewLead((p) => ({ ...p, email: e.target.value }))}
            />
            <Input
              label="Téléphone (optionnel)"
              placeholder="+33 6…"
              value={newLead.telephone}
              onChange={(e) => setNewLead((p) => ({ ...p, telephone: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Premier contact (optionnel)
            </label>
            <textarea
              value={newLead.note}
              onChange={(e) => setNewLead((p) => ({ ...p, note: e.target.value }))}
              rows={3}
              placeholder="Ex : Rencontré via LinkedIn, cherche 2 SDR pour Q3."
              className="w-full rounded-xl border-[1.5px] border-neutral-100 bg-white px-3 py-2 text-sm outline-none transition-all placeholder:text-neutral-300 focus:border-primary-800 focus:shadow-[0_0_0_3px_rgba(34,23,122,0.1)]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setNewLeadOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => quickLeadMutation.mutate(newLead)}
              disabled={
                !newLead.entrepriseNom.trim() ||
                !newLead.contactNom.trim() ||
                quickLeadMutation.isPending
              }
            >
              {quickLeadMutation.isPending ? 'Création…' : 'Créer le lead'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
