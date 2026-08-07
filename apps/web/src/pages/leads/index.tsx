import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Plus, Phone, X, ArrowRight, Send, PhoneCall, SkipForward, Check, Mail } from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from '../../components/ui/Toast';

const NAVY = '#22177A';
const INK = '#1A1533';
const FAINT = '#9A96AE';
const LIME = '#E6E9AF';
const MANROPE = "'Manrope', sans-serif";
const ARCHIVO = "'Archivo Black', sans-serif";

// Étapes du pipeline (clés = valeurs stage côté back-end)
const STAGES: { key: string; title: string; accent: string; bg: string }[] = [
  { key: 'nouveau', title: 'Nouveau', accent: '#8E7CC3', bg: '#F6F4FB' },
  { key: 'contacte', title: 'Contacté', accent: '#3B6FE0', bg: '#F2F5FC' },
  { key: 'r1', title: 'Relance 1', accent: '#C9A227', bg: '#FBF9EE' },
  { key: 'r2', title: 'Relance 2', accent: '#C9A227', bg: '#FBF9EE' },
  { key: 'r3', title: 'Relance 3', accent: '#D9901F', bg: '#FCF6EE' },
  { key: 'r4', title: 'Relance 4', accent: '#D9901F', bg: '#FCF6EE' },
  { key: 'r5', title: 'Relance 5', accent: '#E0781B', bg: '#FCF4EB' },
  { key: 'r6', title: 'Relance 6', accent: '#E0781B', bg: '#FCF4EB' },
  { key: 'r7', title: 'Relance 7', accent: '#D7671A', bg: '#FBF1E9' },
  { key: 'rdv', title: 'RDV obtenu', accent: '#2C9A47', bg: '#F0F7F2' },
  { key: 'perdu', title: 'Perdu', accent: '#B3261E', bg: '#FBF1EF' },
];

const LOST_REASONS = ['Pas de besoin actuellement', 'Travaille déjà avec un cabinet', 'Recrute en direct', 'Budget insuffisant', 'Jamais de retour', 'Mauvais interlocuteur', 'Autre'];

interface Lead {
  id: string;
  company: string;
  contact: string;
  role: string | null;
  city: string | null;
  sector: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  src: string;
  stage: string;
  pushedCandidat: { name?: string; role?: string; score?: string } | null;
  _count?: { interactions: number };
}

const initials = (s: string) => s.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

export default function LeadsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ company: '', contact: '', email: '', phone: '', role: '' });
  const [loseFor, setLoseFor] = useState<Lead | null>(null);
  const [loseReason, setLoseReason] = useState(LOST_REASONS[0]);
  // Enchaînement (session d'appels façon lead)
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionIdx, setSessionIdx] = useState(0);
  const [queue, setQueue] = useState<Lead[]>([]);
  const [note, setNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: () => api.get<Lead[]>('/leads'),
  });
  const leads = data || [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['leads'] });

  const stageKeys = STAGES.map((s) => s.key);
  const nextRelanceStage = (cur: string) => { const i = stageKeys.indexOf(cur); const r7 = stageKeys.indexOf('r7'); return stageKeys[Math.min(i + 1, r7)]; };
  const current = sessionOpen ? queue[sessionIdx] : null;
  const startSession = () => {
    const q = leads.filter((l) => l.stage !== 'rdv' && l.stage !== 'perdu');
    if (!q.length) { toast('info', 'Aucun lead à traiter'); return; }
    setQueue(q); setSessionIdx(0); setNote(''); setSessionOpen(true);
  };
  const advance = () => {
    setNote('');
    if (sessionIdx + 1 >= queue.length) { setSessionOpen(false); toast('success', 'Session terminée 🎉'); }
    else setSessionIdx((i) => i + 1);
  };

  const moveMutation = useMutation({
    mutationFn: (p: { id: string; stage: string }) => api.put(`/leads/${p.id}`, { stage: p.stage }),
    onSuccess: invalidate,
    onError: () => { toast('error', 'Déplacement impossible'); invalidate(); },
  });
  const createMutation = useMutation({
    mutationFn: () => api.post('/leads', { company: form.company.trim(), contact: form.contact.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null, role: form.role.trim() || null, src: 'cold' }),
    onSuccess: () => { toast('success', 'Lead créé'); setCreateOpen(false); setForm({ company: '', contact: '', email: '', phone: '', role: '' }); invalidate(); },
    onError: () => toast('error', 'Création impossible'),
  });
  const convertMutation = useMutation({
    mutationFn: (id: string) => api.post(`/leads/${id}/convert`, {}),
    onSuccess: () => { toast('success', 'Lead converti en client 🎉'); invalidate(); },
    onError: () => toast('error', 'Conversion impossible'),
  });
  const loseMutation = useMutation({
    mutationFn: (p: { id: string; lostReason: string }) => api.post(`/leads/${p.id}/lose`, { lostReason: p.lostReason }),
    onSuccess: () => { toast('info', 'Lead marqué perdu'); setLoseFor(null); invalidate(); if (sessionOpen) advance(); },
    onError: () => toast('error', 'Action impossible'),
  });
  // Traiter le lead courant en session : log l'interaction + avance l'étape, puis suivant
  const treat = useMutation({
    mutationFn: async (p: { lead: Lead; action: 'relance' | 'rdv'; note: string }) => {
      if (p.note.trim()) await api.post(`/leads/${p.lead.id}/interactions`, { type: 'appel', text: p.note.trim() });
      const stage = p.action === 'rdv' ? 'rdv' : nextRelanceStage(p.lead.stage);
      if (stage !== p.lead.stage) await api.put(`/leads/${p.lead.id}`, { stage });
    },
    onSuccess: (_d, v) => { toast('success', v.action === 'rdv' ? 'RDV obtenu 🎯' : 'Relance enregistrée'); invalidate(); advance(); },
    onError: () => toast('error', 'Action impossible'),
  });

  const columns = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    STAGES.forEach((s) => { map[s.key] = []; });
    for (const l of leads) { if (map[l.stage]) map[l.stage].push(l); }
    return map;
  }, [leads]);

  const onDragEnd = (res: DropResult) => {
    if (!res.destination) return;
    const target = res.destination.droppableId;
    const l = leads.find((x) => x.id === res.draggableId);
    if (!l || l.stage === target) return;
    if (target === 'perdu') { setLoseFor(l); return; }
    moveMutation.mutate({ id: l.id, stage: target });
  };

  const input: React.CSSProperties = { width: '100%', fontFamily: MANROPE, fontSize: 14, padding: '11px 13px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,0.14)', background: '#FCFCF5', color: INK, outline: 'none' };

  return (
    <div style={{ fontFamily: MANROPE, color: INK }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, color: FAINT, fontWeight: 600 }}>Prospection commerciale</div>
          <h1 style={{ fontFamily: ARCHIVO, fontSize: 28, letterSpacing: '-0.02em', color: INK, marginTop: 4 }}>Leads</h1>
          <div style={{ fontSize: 13, color: '#8A8699', marginTop: 4 }}>{leads.length} leads · glisse une carte pour relancer, jusqu'à « RDV obtenu »</div>
        </div>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
          <button onClick={startSession} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: MANROPE, fontWeight: 700, fontSize: 13, background: '#fff', color: NAVY, border: '1.5px solid rgba(34,23,122,.18)', borderRadius: 11, padding: '10px 16px', cursor: 'pointer' }}>
            <PhoneCall size={15} /> Session d'appels
          </button>
          <button onClick={() => setCreateOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: MANROPE, fontWeight: 700, fontSize: 13, background: NAVY, color: LIME, border: 'none', borderRadius: 11, padding: '10px 16px', cursor: 'pointer', boxShadow: '0 10px 22px -14px rgba(34,23,122,.7)' }}>
            <Plus size={15} /> Nouveau lead
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ color: FAINT, padding: 40 }}>Chargement…</div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
            <div style={{ display: 'flex', gap: 11, minWidth: 1800, alignItems: 'flex-start' }}>
              {STAGES.map((stage) => {
                const cards = columns[stage.key] || [];
                return (
                  <Droppable droppableId={stage.key} key={stage.key}>
                    {(provided, snapshot) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} style={{ width: 210, flexShrink: 0, background: snapshot.isDraggingOver ? '#fff' : stage.bg, border: `1px solid ${snapshot.isDraggingOver ? stage.accent : 'rgba(34,23,122,.10)'}`, borderRadius: 14, padding: '11px 9px 14px', minHeight: 440, transition: 'background .18s, border-color .18s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 10 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.accent }} />
                            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6E6A85', whiteSpace: 'nowrap' }}>{stage.title}</span>
                          </span>
                          <span style={{ fontFamily: MANROPE, fontWeight: 800, fontSize: 11.5, color: '#fff', background: stage.accent, borderRadius: 999, minWidth: 18, textAlign: 'center', padding: '1px 6px' }}>{cards.length}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          {cards.map((l, i) => (
                            <Draggable draggableId={l.id} index={i} key={l.id}>
                              {(prov, snap) => (
                                <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps} style={{ background: '#fff', border: '1px solid rgba(34,23,122,.1)', borderRadius: 11, padding: '10px 11px', boxShadow: snap.isDragging ? '0 18px 36px -20px rgba(34,23,122,.5)' : '0 1px 2px rgba(34,23,122,.05)', cursor: 'grab', ...prov.draggableProps.style }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: '#F2F3D8', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ARCHIVO, fontSize: 9.5 }}>{initials(l.company)}</span>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                      <div style={{ fontSize: 12.5, fontWeight: 800, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.company}</div>
                                      <div style={{ fontSize: 10.5, color: '#8A8699', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.contact}{l.role ? ` · ${l.role}` : ''}</div>
                                    </div>
                                  </div>
                                  {l.pushedCandidat?.name && (
                                    <div style={{ marginTop: 7, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: '#5B4B9E', background: '#EDEAF9', borderRadius: 999, padding: '2px 8px' }}>
                                      <Send size={10} /> {l.pushedCandidat.name}
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 8 }}>
                                    {l.phone ? <a href={`tel:${l.phone}`} onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: NAVY, textDecoration: 'none' }}><Phone size={11} /> {l.phone}</a> : <span style={{ fontSize: 10.5, color: FAINT }}>{l.source || '—'}</span>}
                                    {stage.key === 'rdv' && (
                                      <button onClick={(e) => { e.stopPropagation(); convertMutation.mutate(l.id); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 800, color: '#fff', background: '#2C9A47', border: 'none', borderRadius: 8, padding: '3px 8px', cursor: 'pointer' }}>Client <ArrowRight size={10} /></button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                          {cards.length === 0 && <span style={{ display: 'block', height: 44, border: '1px dashed rgba(34,23,122,.14)', borderRadius: 10 }} />}
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

      {/* Modale création */}
      {createOpen && (
        <div onClick={() => setCreateOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,21,51,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: '100%', background: '#fff', borderRadius: 20, boxShadow: '0 40px 90px -40px rgba(26,21,51,0.6)', padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontFamily: ARCHIVO, fontSize: 19, color: INK }}>Nouveau lead</div>
              <button onClick={() => setCreateOpen(false)} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#F5F4EA', color: '#8A8699', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="Entreprise *" style={input} />
              <input value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} placeholder="Contact (nom & prénom) *" style={input} />
              <input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder="Fonction" style={input} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" style={input} />
                <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Téléphone" style={input} />
              </div>
            </div>
            <button onClick={() => { if (!form.company.trim() || !form.contact.trim()) { toast('error', 'Entreprise et contact requis'); return; } createMutation.mutate(); }} disabled={createMutation.isPending} style={{ width: '100%', marginTop: 16, fontFamily: MANROPE, fontWeight: 700, fontSize: 15, background: NAVY, color: LIME, border: 'none', borderRadius: 12, padding: 13, cursor: 'pointer', opacity: createMutation.isPending ? 0.6 : 1 }}>{createMutation.isPending ? 'Création…' : 'Créer le lead'}</button>
          </div>
        </div>
      )}

      {/* Modale perdu */}
      {loseFor && (
        <div onClick={() => setLoseFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,21,51,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: '100%', background: '#fff', borderRadius: 20, boxShadow: '0 40px 90px -40px rgba(26,21,51,0.6)', padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontFamily: ARCHIVO, fontSize: 18, color: INK }}>Lead perdu</div>
              <button onClick={() => setLoseFor(null)} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#F5F4EA', color: '#8A8699', cursor: 'pointer' }}><X size={15} /></button>
            </div>
            <div style={{ fontSize: 13, color: '#8A8699', marginBottom: 14 }}>{loseFor.company} · {loseFor.contact}</div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#8A8699', marginBottom: 8 }}>Pourquoi ?</div>
            <select value={loseReason} onChange={(e) => setLoseReason(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={() => loseMutation.mutate({ id: loseFor.id, lostReason: loseReason })} disabled={loseMutation.isPending} style={{ width: '100%', marginTop: 16, fontFamily: MANROPE, fontWeight: 700, fontSize: 15, background: '#B3261E', color: '#fff', border: 'none', borderRadius: 12, padding: 13, cursor: 'pointer', opacity: loseMutation.isPending ? 0.6 : 1 }}>Marquer perdu</button>
          </div>
        </div>
      )}

      {/* Session d'appels — enchaînement lead par lead */}
      {sessionOpen && current && !loseFor && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 320, background: 'rgba(26,21,51,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: 560, maxWidth: '100%', background: '#fff', borderRadius: 22, boxShadow: '0 40px 90px -40px rgba(26,21,51,.6)', overflow: 'hidden' }}>
            <div style={{ background: NAVY, color: '#fff', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: LIME }}>Session d'appels</div>
                <div style={{ fontFamily: ARCHIVO, fontSize: 18, marginTop: 2 }}>{sessionIdx + 1} / {queue.length}</div>
              </div>
              <button onClick={() => setSessionOpen(false)} style={{ width: 32, height: 32, borderRadius: 9, border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ height: 3, background: 'rgba(34,23,122,.1)' }}><div style={{ height: '100%', width: `${(sessionIdx / queue.length) * 100}%`, background: '#2C9A47', transition: 'width .3s' }} /></div>
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, background: '#F2F3D8', color: NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ARCHIVO, fontSize: 14 }}>{initials(current.company)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>{current.company}</div>
                  <div style={{ fontSize: 13, color: '#8A8699' }}>{current.contact}{current.role ? ` · ${current.role}` : ''}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                {current.phone && <a href={`tel:${current.phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700, color: '#fff', background: '#2C9A47', borderRadius: 11, padding: '10px 16px', textDecoration: 'none' }}><Phone size={15} /> Appeler {current.phone}</a>}
                {current.email && <a href={`mailto:${current.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: NAVY, background: '#F5F4EA', borderRadius: 11, padding: '10px 14px', textDecoration: 'none' }}><Mail size={14} /> {current.email}</a>}
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note d'appel — ce qui s'est dit, objection, prochaine étape…" style={{ ...input, minHeight: 90, resize: 'vertical', marginTop: 16 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 14 }}>
                <button onClick={() => treat.mutate({ lead: current, action: 'relance', note })} disabled={treat.isPending} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontWeight: 800, fontSize: 14, color: NAVY, background: '#F2F3D8', border: 'none', borderRadius: 12, padding: 13, cursor: 'pointer' }}><ArrowRight size={15} /> Relancer & suivant</button>
                <button onClick={() => treat.mutate({ lead: current, action: 'rdv', note })} disabled={treat.isPending} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontWeight: 800, fontSize: 14, color: '#fff', background: '#2C9A47', border: 'none', borderRadius: 12, padding: 13, cursor: 'pointer' }}><Check size={15} /> RDV obtenu</button>
                <button onClick={() => setLoseFor(current)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontWeight: 800, fontSize: 13, color: '#B3261E', background: '#FBF1EF', border: 'none', borderRadius: 12, padding: 12, cursor: 'pointer' }}><X size={14} /> Perdu</button>
                <button onClick={advance} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontWeight: 700, fontSize: 13, color: '#6E6A85', background: '#fff', border: '1.5px solid rgba(34,23,122,.14)', borderRadius: 12, padding: 12, cursor: 'pointer' }}><SkipForward size={14} /> Passer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
