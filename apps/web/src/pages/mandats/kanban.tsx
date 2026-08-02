import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Plus, LayoutGrid, List } from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from '../../components/ui/Toast';

// ─── BRAND TOKENS ───────────────────────────────────
const NAVY = '#22177A';
const INK = '#1A1533';
const FAINT = '#9A96AE';
const MANROPE = "'Manrope', sans-serif";
const ARCHIVO = "'Archivo Black', sans-serif";

// Étapes du cycle de vie (persistées via mandat.etapeCycle)
const STAGES: { title: string; accent: string; bg: string; pill: string }[] = [
  { title: 'Prospection', accent: '#8E7CC3', bg: '#F6F4FB', pill: '#EDE8F7' },
  { title: '1er rendez-vous', accent: '#3B6FE0', bg: '#F2F5FC', pill: '#E6EDFA' },
  { title: 'Signature du mandat', accent: '#E08A2B', bg: '#FCF6EE', pill: '#F7ECDA' },
  { title: 'Sourcing', accent: '#C9A227', bg: '#FBF9EE', pill: '#F4EFD5' },
  { title: 'Placé', accent: '#3B9A54', bg: '#F0F7F2', pill: '#E2F0E6' },
  { title: 'Perdu', accent: '#B3261E', bg: '#FBF1EF', pill: '#F5DED9' },
];
const STAGE_TITLES = STAGES.map((s) => s.title);

interface MandatCard {
  id: string;
  titrePoste: string;
  statut: string;
  priorite: string;
  feeMontantEstime: number | null;
  etapeCycle: string | null;
  entreprise: { id: string; nom: string } | null;
  client: { id: string; nom: string; prenom: string | null } | null;
  _count?: { candidatures: number };
}

// Étape par défaut d'un mandat sans etapeCycle : déduite du statut.
function defaultStage(m: MandatCard): string {
  if (m.etapeCycle && STAGE_TITLES.includes(m.etapeCycle)) return m.etapeCycle;
  if (m.statut === 'GAGNE' || m.statut === 'CLOTURE') return 'Placé';
  if (m.statut === 'PERDU' || m.statut === 'ANNULE') return 'Perdu';
  return 'Sourcing';
}

const fmtEuro = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('fr-FR').replace(/[  ]/g, ' ')} €`);
const initials = (nom: string, prenom?: string | null) => `${(prenom || '').charAt(0)}${(nom || '').charAt(0)}`.toUpperCase();

export default function MandatsKanbanPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['mandats', 'kanban'],
    queryFn: () => api.get<{ data: MandatCard[] }>('/mandats?perPage=200'),
  });

  const moveMutation = useMutation({
    mutationFn: (p: { id: string; etapeCycle: string }) =>
      api.put(`/mandats/${p.id}`, { etapeCycle: p.etapeCycle }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mandats', 'kanban'] });
    },
    onError: () => {
      toast('error', 'Déplacement impossible');
      queryClient.invalidateQueries({ queryKey: ['mandats', 'kanban'] });
    },
  });

  const mandats = data?.data || [];
  const columns = useMemo(() => {
    const map: Record<string, MandatCard[]> = {};
    STAGE_TITLES.forEach((t) => { map[t] = []; });
    for (const m of mandats) map[defaultStage(m)].push(m);
    return map;
  }, [mandats]);

  const onDragEnd = (res: DropResult) => {
    if (!res.destination) return;
    const target = res.destination.droppableId;
    const id = res.draggableId;
    const m = mandats.find((x) => x.id === id);
    if (!m || defaultStage(m) === target) return;
    moveMutation.mutate({ id, etapeCycle: target });
    toast('success', `Déplacé en « ${target} »`);
  };

  return (
    <div style={{ fontFamily: MANROPE, color: INK }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, color: FAINT, fontWeight: 600 }}>Mandats</div>
          <h1 style={{ fontFamily: ARCHIVO, fontSize: 28, letterSpacing: '-0.02em', color: INK, marginTop: 4 }}>Cycle de vie</h1>
          <div style={{ fontSize: 13, color: '#8A8699', marginTop: 4 }}>{mandats.length} mandats · glisse une carte pour changer d'étape</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => navigate('/mandats')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: MANROPE, fontWeight: 700, fontSize: 13, background: '#fff', color: NAVY, border: '1.5px solid rgba(34,23,122,.18)', borderRadius: 11, padding: '9px 14px', cursor: 'pointer' }}
          >
            <List size={15} /> Vue liste
          </button>
          <button
            onClick={() => navigate('/mandats/new')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: MANROPE, fontWeight: 700, fontSize: 13, background: NAVY, color: '#E6E9AF', border: 'none', borderRadius: 11, padding: '10px 16px', cursor: 'pointer', boxShadow: '0 10px 22px -14px rgba(34,23,122,.7)' }}
          >
            <Plus size={15} /> Nouveau mandat
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: FAINT, fontSize: 14, padding: 40 }}>
          <LayoutGrid size={18} /> Chargement du board…
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STAGES.length},minmax(0,1fr))`, gap: 12, minWidth: 1180, alignItems: 'start' }}>
              {STAGES.map((stage) => {
                const cards = columns[stage.title] || [];
                return (
                  <Droppable droppableId={stage.title} key={stage.title}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        style={{
                          background: snapshot.isDraggingOver ? stage.pill : stage.bg,
                          border: `1px solid ${snapshot.isDraggingOver ? stage.accent : 'rgba(34,23,122,.10)'}`,
                          borderRadius: 14, padding: '12px 11px 16px', minHeight: 480, transition: 'background .18s ease, border-color .18s ease',
                        }}
                      >
                        {/* Column header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 11 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.accent, flexShrink: 0 }} />
                            <span style={{ fontFamily: MANROPE, fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: '#6E6A85', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stage.title}</span>
                          </span>
                          <span style={{ fontFamily: MANROPE, fontWeight: 800, fontSize: 12, color: '#fff', background: stage.accent, borderRadius: 999, minWidth: 20, textAlign: 'center', padding: '1px 7px', flexShrink: 0 }}>{cards.length}</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {cards.map((m, i) => (
                            <Draggable draggableId={m.id} index={i} key={m.id}>
                              {(prov, snap) => (
                                <div
                                  ref={prov.innerRef}
                                  {...prov.draggableProps}
                                  {...prov.dragHandleProps}
                                  onClick={() => navigate(`/mandats/${m.id}`)}
                                  style={{
                                    background: '#fff', border: '1px solid rgba(34,23,122,.1)', borderRadius: 11, padding: '11px 12px',
                                    boxShadow: snap.isDragging ? '0 18px 36px -20px rgba(34,23,122,.5)' : '0 1px 2px rgba(34,23,122,.05)',
                                    cursor: 'grab', ...prov.draggableProps.style,
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                    <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, background: '#F2F3D8', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ARCHIVO, fontSize: 10 }}>{initials(m.entreprise?.nom || m.titrePoste)}</span>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                      <div style={{ fontSize: 13, fontWeight: 800, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.titrePoste}</div>
                                      <div style={{ fontSize: 11, color: '#8A8699', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{m.entreprise?.nom || '—'}</div>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 9 }}>
                                    <span style={{ fontSize: 11, color: '#6E6A85', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {m.client ? `${m.client.prenom || ''} ${m.client.nom}`.trim() : '—'}
                                    </span>
                                    <span style={{ fontFamily: MANROPE, fontWeight: 800, fontSize: 11.5, color: NAVY, flexShrink: 0 }}>{fmtEuro(m.feeMontantEstime)}</span>
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                          {cards.length === 0 && (
                            <span style={{ display: 'block', height: 52, border: '1px dashed rgba(34,23,122,.14)', borderRadius: 11 }} />
                          )}
                        </div>
                      </div>
                    )}
                  </Droppable>
                );
              })}
            </div>
          </div>
        </DragDropContext>
      )}
    </div>
  );
}
