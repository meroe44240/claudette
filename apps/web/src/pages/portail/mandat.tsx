/**
 * Portail client — vue « Suivi Client » d'un mandat (design pack).
 * URL : /portail/mandat/:mandatId — session portail (sessionStorage, 4h).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { useNavigate, useParams } from 'react-router';
import { LogOut, X, Check, MessageSquare, AtSign, Banknote, CalendarClock, ArrowRight, Sparkles, MessageCircle, Inbox } from 'lucide-react';

type Stage = 'SOURCING' | 'CONTACTE' | 'ENTRETIEN_1' | 'ENVOYE_CLIENT' | 'ENTRETIEN_CLIENT' | 'PROCESS' | 'OFFRE' | 'PLACE' | 'REFUSE';
type Decision = 'RENCONTRER' | 'A_DISCUTER' | 'ECARTER';

interface Candidature {
  id: string; stage: Stage; dateEntretienClient: string | null;
  candidat: { id: string; nom: string; prenom: string | null; posteActuel: string | null; entrepriseActuelle: string | null; salaireSouhaite: number | null; photoUrl: string | null; aiPitchShort: string | null; aiAnonymizedProfile: any };
  portalDecisions: Array<{ decision: Decision; createdAt: string }>;
  _count?: { portalComments: number };
}
interface KanbanResponse {
  mandat: { id: string; titrePoste: string; visibleStages: Stage[]; entreprise: { nom: string }; client: { nom: string; prenom: string | null }; consultant: { nom: string; prenom: string | null } | null };
  stages: Stage[];
  byStage: Record<Stage, Candidature[]>;
}

// Libellés côté client : Screening / Case / Culture Fit / Offre / Engagé / Perdu.
const STAGE_LABELS: Record<Stage, string> = {
  SOURCING: 'Sourcing', CONTACTE: 'Contactés', ENTRETIEN_1: 'Entretien recruteur', ENVOYE_CLIENT: 'Screening',
  ENTRETIEN_CLIENT: 'Case', PROCESS: 'Culture Fit', OFFRE: 'Offre', PLACE: 'Engagé', REFUSE: 'Perdu',
};
const STAGE_ACCENT: Record<Stage, string> = {
  SOURCING: '#8E7CC3', CONTACTE: '#8E7CC3', ENTRETIEN_1: '#22177A', ENVOYE_CLIENT: '#2A6BD8',
  ENTRETIEN_CLIENT: '#E08A2B', PROCESS: '#7A5BD1', OFFRE: '#C9A227', PLACE: '#3B9A54', REFUSE: '#B3261E',
};
const STAGE_TINT: Record<Stage, string> = {
  SOURCING: '#F3F1FA', CONTACTE: '#F3F1FA', ENTRETIEN_1: '#EFEEF7', ENVOYE_CLIENT: '#EDF3FC',
  ENTRETIEN_CLIENT: '#FCF3E9', PROCESS: '#F3EFFC', OFFRE: '#FBF7E6', PLACE: '#EBF5EE', REFUSE: '#FBEDEB',
};
const DECISION_LABEL: Record<Decision, string> = { RENCONTRER: 'À rencontrer', A_DISCUTER: 'À discuter', ECARTER: 'Écarté' };
const DECISION_TONE: Record<Decision, { bg: string; fg: string }> = {
  RENCONTRER: { bg: '#EAF3EC', fg: '#2C6B3F' }, A_DISCUTER: { bg: '#FBF3E7', fg: '#8A6A2E' }, ECARTER: { bg: '#F9ECE9', fg: '#B0361F' },
};

const INK = '#1A1533';
const MUTED = '#6E6A85';
const FAINT = '#9A96AE';
const LINE = 'rgba(26,21,51,.08)';
const LABEL: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: FAINT };

function portalFetch(path: string, init?: RequestInit) {
  const token = sessionStorage.getItem('portal_token');
  return fetch(`/api/v1/portal${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers as Record<string, string> | undefined) } });
}
function fullName(c: Candidature) { return `${c.candidat.prenom || ''} ${c.candidat.nom}`.trim() || '(profil)'; }
function initials(c: Candidature) { return `${(c.candidat.prenom?.[0] ?? '')}${c.candidat.nom?.[0] ?? ''}`.toUpperCase() || '?'; }
function initialsOf(name: string) { return name.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }

// Salaire affiché sur la carte : prétentions / rémunération du debrief, sinon salaire souhaité.
function salaryOf(c: Candidature): string | null {
  const infos: Array<{ label: string; value: string }> = Array.isArray(c.candidat.aiAnonymizedProfile?.infos) ? c.candidat.aiAnonymizedProfile.infos : [];
  const hit = infos.find((i) => /pr[ée]tention|r[ée]mun|salaire|package/i.test(i.label));
  // Version courte pour la carte : « 70-75 K€ package (55 K€ fixe + variable) » → « 70-75 K€ package ».
  if (hit?.value) return hit.value.replace(/\s*\(.*\)\s*$/, '');
  if (c.candidat.salaireSouhaite) return `${Math.round(c.candidat.salaireSouhaite / 1000)} K€`;
  return null;
}

// Photo du candidat si dispo, sinon initiales.
function Avatar({ c, size, radius, bg, fg, fontSize }: { c: Candidature; size: number; radius: number | string; bg: string; fg: string; fontSize: number }) {
  const [broken, setBroken] = useState(false);
  const box: React.CSSProperties = { flexShrink: 0, width: size, height: size, borderRadius: radius, overflow: 'hidden' };
  if (c.candidat.photoUrl && !broken) {
    return <img src={c.candidat.photoUrl} alt="" onError={() => setBroken(true)} style={{ ...box, objectFit: 'cover', display: 'block' }} />;
  }
  return <span style={{ ...box, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black',sans-serif", fontSize }}>{initials(c)}</span>;
}

function relTime(iso: string | Date) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min >= 0 && min < 1) return 'à l’instant';
  if (min >= 0 && min < 60) return `il y a ${min} min`;
  if (min >= 0 && min < 60 * 24) return `il y a ${Math.round(min / 60)} h`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
    + ` · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function PortalMandatPage() {
  const { mandatId } = useParams<{ mandatId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<KanbanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Candidature | null>(null);
  const [pendingMove, setPendingMove] = useState<{ c: Candidature; to: Stage } | null>(null);
  const [dragging, setDragging] = useState<Candidature | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    const token = sessionStorage.getItem('portal_token');
    if (!token) { navigate(`/portail/login?m=${mandatId ?? ''}`); return; }
    document.title = 'Portail client — HumanUp';
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandatId]);

  async function reload(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await portalFetch('/kanban');
      if (res.status === 401) { sessionStorage.clear(); navigate(`/portail/login?m=${mandatId ?? ''}`); return; }
      setData((await res.json()) as KanbanResponse);
    } finally { setLoading(false); }
  }
  const repFirst = data?.mandat.consultant?.prenom || data?.mandat.consultant?.nom || '';
  function flash(msg: string) { setToast(msg); window.setTimeout(() => setToast(null), 3800); }
  const allCards = () => (data ? Object.values(data.byStage).flat() : []);

  function onDragStart(e: DragStartEvent) {
    setDragging(allCards().find((x) => x.id === e.active.id) ?? null);
  }
  // Déplacement : certaines colonnes demandent une précision avant d'enregistrer.
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (!data || !e.over) return;
    const to = e.over.id as Stage;
    const c = allCards().find((x) => x.id === e.active.id);
    if (!c || c.stage === to) return;
    if (to === 'ENTRETIEN_CLIENT' || to === 'REFUSE' || to === 'PLACE') { setPendingMove({ c, to }); return; }
    void doMove(c, to, {});
  }

  async function doMove(c: Candidature, to: Stage, extra: { reason?: string; dateEntretienClient?: string; interlocuteurClient?: string }) {
    if (!data) return;
    const snapshot = data;
    if (to !== 'PLACE') {
      // Optimiste : la carte change de colonne tout de suite.
      const byStage = Object.fromEntries(Object.entries(data.byStage).map(([k, arr]) => [k, arr.filter((x) => x.id !== c.id)])) as Record<Stage, Candidature[]>;
      byStage[to] = [{ ...c, stage: to }, ...(byStage[to] ?? [])];
      setData({ ...data, byStage });
    }
    const res = await portalFetch(`/candidatures/${c.id}/move`, { method: 'POST', body: JSON.stringify({ stage: to, ...extra }) });
    if (!res.ok) {
      setData(snapshot);
      const err = await res.json().catch(() => null);
      flash(err?.message || 'Le déplacement n’a pas pu être enregistré.');
      return;
    }
    const out = await res.json().catch(() => ({}));
    flash(out?.pending
      ? `C'est noté ! ${repFirst || 'Votre consultant'} est prévenu(e) et finalise l'embauche de ${fullName(c)}.`
      : `${fullName(c)} → ${STAGE_LABELS[to]}. ${repFirst || 'Votre consultant'} est prévenu(e).`);
    void reload(true);
  }

  function handleLogout() { sessionStorage.clear(); navigate(`/portail/login?m=${mandatId ?? ''}`); }

  if (loading || !data) return <div style={{ background: '#F6F5EF', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: FAINT, fontFamily: "'Manrope',sans-serif" }}>Chargement…</div>;

  const consultant = data.mandat.consultant;
  const rep = consultant ? `${consultant.prenom ? consultant.prenom + ' ' : ''}${consultant.nom}`.trim() : '';
  const enCours = data.stages.filter((s) => s !== 'REFUSE' && s !== 'PLACE').reduce((n, s) => n + (data.byStage[s]?.length ?? 0), 0);

  return (
    <div style={{ background: '#F6F5EF', minHeight: '100vh', fontFamily: "'Manrope',sans-serif", display: 'flex', flexDirection: 'column', color: INK }}>
      <style>{`
        .pm-card{ transition:transform .18s cubic-bezier(.16,1,.3,1), box-shadow .2s ease, border-color .18s ease; }
        .pm-card:hover{ transform:translateY(-2px); box-shadow:0 14px 28px -18px rgba(26,21,51,.35) !important; border-color:rgba(34,23,122,.18) !important; }
        .pm-dec{ transition:transform .15s ease, box-shadow .15s ease; }
        .pm-dec:hover{ transform:translateY(-1px); box-shadow:0 8px 18px -12px rgba(26,21,51,.35); }
        .pm-tab{ transition:background .15s ease, color .15s ease; }
        .pm-scroll::-webkit-scrollbar{ height:8px; width:8px; }
        .pm-scroll::-webkit-scrollbar-thumb{ background:rgba(26,21,51,.14); border-radius:99px; }
        @media (max-width: 860px){ .pm-drawer-body{ grid-template-columns: 1fr !important; overflow-y:auto; } .pm-drawer-side{ border-left:none !important; border-top:1px solid ${LINE}; min-height:520px; } .pm-drawer-main{ overflow:visible !important; } }
      `}</style>

      {/* TOP BAR */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 28px', background: '#22177A' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <img src="/brand/logo-mark-cream.png" alt="" style={{ width: 26, height: 26 }} />
          <span style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 18, letterSpacing: '.01em', color: '#E6E9AF' }}>HUMANUP</span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(230,233,175,.55)' }}>Portail client</span>
        </div>
        <button onClick={handleLogout} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'rgba(230,233,175,.85)', background: 'rgba(230,233,175,.12)', border: '1px solid rgba(230,233,175,.2)', borderRadius: 9, padding: '7px 13px', cursor: 'pointer' }}><LogOut size={14} />Déconnexion</button>
      </header>

      {/* HERO */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, padding: '28px 34px 8px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: FAINT, fontWeight: 600 }}>Suivi de recrutement · {data.mandat.entreprise.nom}</div>
          <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 30, letterSpacing: '-.03em', color: INK, marginTop: 5 }}>{data.mandat.titrePoste}</h1>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: MUTED, marginTop: 8, maxWidth: 620 }}>Cliquez sur un profil pour ouvrir son dossier, glissez une carte pour la faire avancer.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: '10px 14px' }}>
            <div style={LABEL}>En cours</div>
            <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 20, marginTop: 2 }}>{enCours}</div>
          </div>
          {rep && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: '10px 14px' }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#22177A', color: '#E6E9AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black',sans-serif", fontSize: 12 }}>{initialsOf(rep)}</span>
              <div>
                <div style={LABEL}>Votre consultant</div>
                <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 2 }}>{rep}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOARD */}
      <main className="pm-scroll" style={{ flex: 1, overflowX: 'auto', padding: '18px 34px 36px' }}>
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', minHeight: 'calc(100vh - 250px)' }}>
            {data.stages.map(stage => (
              <StageColumn key={stage} stage={stage} count={(data.byStage[stage] ?? []).length} dragging={!!dragging}>
                {(data.byStage[stage] ?? []).map(c => (
                  <DraggableCard key={c.id} c={c} onOpen={() => { setSelected(c); void portalFetch(`/candidatures/${c.id}/view`, { method: 'POST' }); }} />
                ))}
              </StageColumn>
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.16,1,.3,1)' }}>
            {dragging ? <CardBody c={dragging} lifted /> : null}
          </DragOverlay>
        </DndContext>
      </main>

      {pendingMove && (
        <MoveDialog
          c={pendingMove.c} to={pendingMove.to} repName={rep}
          onCancel={() => setPendingMove(null)}
          onConfirm={(extra) => { const m = pendingMove; setPendingMove(null); void doMove(m.c, m.to, extra); }}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 80, background: INK, color: '#F4F4EA', fontSize: 13.5, fontWeight: 600, padding: '12px 18px', borderRadius: 12, boxShadow: '0 18px 40px -18px rgba(26,21,51,.6)', maxWidth: '90vw' }}>{toast}</div>
      )}

      {selected && (
        <ProfileDrawer
          candidature={selected}
          repName={rep}
          onClose={() => { setSelected(null); void reload(true); }}
          onDecision={async (decision, reason) => {
            const res = await portalFetch(`/candidatures/${selected.id}/decision`, { method: 'POST', body: JSON.stringify({ decision, reason }) });
            if (res.ok) {
              setSelected({ ...selected, portalDecisions: [{ decision, createdAt: new Date().toISOString() }, ...selected.portalDecisions] });
              flash(`Avis enregistré. ${repFirst || 'Votre consultant'} est prévenu(e).`);
              void reload(true);
            }
          }}
        />
      )}
    </div>
  );
}

// ─── BOARD : colonnes + cartes déplaçables ─────────────
function StageColumn({ stage, count, dragging, children }: { stage: Stage; count: number; dragging: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const accent = STAGE_ACCENT[stage];
  return (
    <section style={{ flex: '1 0 250px', maxWidth: 330, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 10px' }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: accent, boxShadow: `0 0 0 4px ${STAGE_TINT[stage]}` }} />
        <span style={{ fontWeight: 800, fontSize: 13.5, letterSpacing: '-.005em' }}>{STAGE_LABELS[stage]}</span>
        <span style={{ marginLeft: 'auto', minWidth: 24, textAlign: 'center', fontSize: 11.5, fontWeight: 800, color: accent, background: STAGE_TINT[stage], borderRadius: 999, padding: '2px 8px' }}>{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className="pm-scroll"
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: 10, borderRadius: 16,
          background: isOver ? STAGE_TINT[stage] : 'rgba(255,255,255,.55)',
          border: `1.5px ${isOver ? 'solid' : dragging ? 'dashed' : 'solid'} ${isOver ? accent : dragging ? 'rgba(26,21,51,.16)' : LINE}`,
          borderTop: `3px solid ${accent}`,
          transition: 'background .15s ease, border-color .15s ease',
        }}
      >
        {count === 0 && (
          <div style={{ flex: 1, minHeight: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#B4B0C4', fontSize: 12, textAlign: 'center' }}>
            <Inbox size={18} strokeWidth={1.8} />
            {dragging ? 'Déposez le profil ici' : 'Aucun profil pour l’instant'}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

function CardBody({ c, lifted }: { c: Candidature; lifted?: boolean }) {
  const last = c.portalDecisions[0]?.decision;
  const salary = salaryOf(c);
  const nbComments = c._count?.portalComments ?? 0;
  return (
    <div
      className={lifted ? undefined : 'pm-card'}
      style={{
        background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 14,
        boxShadow: lifted ? '0 26px 50px -20px rgba(26,21,51,.5)' : '0 1px 2px rgba(26,21,51,.05)',
        transform: lifted ? 'rotate(1.5deg)' : undefined,
        cursor: lifted ? 'grabbing' : 'grab',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <Avatar c={c} size={42} radius={12} bg="#22177A" fg="#E6E9AF" fontSize={13} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(c)}</div>
          {c.candidat.posteActuel && <div style={{ fontSize: 12.5, lineHeight: 1.4, color: MUTED, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{c.candidat.posteActuel}</div>}
        </div>
      </div>
      {(salary || last || nbComments > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 11, borderTop: `1px dashed ${LINE}` }}>
          {salary && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, fontSize: 11.5, fontWeight: 800, color: '#22177A', background: '#F2F3D8', borderRadius: 8, padding: '4px 8px' }}>
              <Banknote size={13} strokeWidth={2.2} style={{ flexShrink: 0 }} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{salary}</span>
            </span>
          )}
          {last && <span style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 8, padding: '4px 8px', background: DECISION_TONE[last].bg, color: DECISION_TONE[last].fg, whiteSpace: 'nowrap' }}>{DECISION_LABEL[last]}</span>}
          {nbComments > 0 && (
            <span title={`${nbComments} commentaire${nbComments > 1 ? 's' : ''}`} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: FAINT }}>
              <MessageCircle size={13} strokeWidth={2.2} />{nbComments}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function DraggableCard({ c, onOpen }: { c: Candidature; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={onOpen} style={{ touchAction: 'none', opacity: isDragging ? 0.35 : 1, outline: 'none' }}>
      <CardBody c={c} />
    </div>
  );
}

// ─── FICHE CANDIDAT : dossier + panneau latéral (Activité / Commentaires) ──
function ProfileDrawer({ candidature: c, repName, onClose, onDecision }: {
  candidature: Candidature; repName: string;
  onClose: () => void;
  onDecision: (d: Decision, reason?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'activite' | 'commentaires'>('activite');
  const [nbComments, setNbComments] = useState(c._count?.portalComments ?? 0);
  const [activityKey, setActivityKey] = useState(0);
  const last = c.portalDecisions[0]?.decision;
  const profile = c.candidat.aiAnonymizedProfile;
  const bullets: string[] = Array.isArray(profile?.bulletPoints) ? profile.bulletPoints : Array.isArray(profile?.highlights) ? profile.highlights : [];
  // Debrief structuré (optionnel) : infos clés + sections titrées.
  const infos: Array<{ label: string; value: string }> = Array.isArray(profile?.infos) ? profile.infos : [];
  const sections: Array<{ title: string; items: string[] }> = Array.isArray(profile?.sections) ? profile.sections : [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const decide = async (d: Decision) => {
    if (d === 'ECARTER' && !reason.trim()) { return; }
    setBusy(true);
    try { await onDecision(d, d === 'ECARTER' ? reason.trim() : undefined); setActivityKey((k) => k + 1); } finally { setBusy(false); }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(26,21,51,.42)' }} />
      <aside style={{ position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 61, width: 1000, maxWidth: '96vw', background: '#FCFCF7', boxShadow: '-26px 0 70px -30px rgba(26,21,51,.55)', display: 'flex', flexDirection: 'column' }}>
        {/* En-tête */}
        <div style={{ flexShrink: 0, background: '#22177A', padding: '18px 22px', position: 'relative', overflow: 'hidden' }}>
          <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(230,233,175,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(230,233,175,.05) 1px,transparent 1px)', backgroundSize: '36px 36px' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar c={c} size={58} radius={16} bg="#E6E9AF" fg="#22177A" fontSize={18} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 19, color: '#fff' }}>{fullName(c)}</div>
              {(c.candidat.posteActuel || c.candidat.entrepriseActuelle) && <div style={{ fontSize: 12.5, color: '#E6E9AF', fontWeight: 600, marginTop: 3 }}>{[c.candidat.posteActuel, c.candidat.entrepriseActuelle].filter(Boolean).join(' · ')}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: '3px 10px', background: 'rgba(230,233,175,.14)', color: '#E6E9AF' }}>{STAGE_LABELS[c.stage]}</span>
                {last && <span style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: '3px 10px', background: DECISION_TONE[last].bg, color: DECISION_TONE[last].fg }}>{DECISION_LABEL[last]}</span>}
              </div>
            </div>
            <button onClick={onClose} aria-label="Fermer" style={{ alignSelf: 'flex-start', width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(230,233,175,.25)', background: 'transparent', color: '#E6E9AF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} strokeWidth={2.4} /></button>
          </div>
        </div>

        <div className="pm-drawer-body" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px' }}>
          {/* Dossier */}
          <div className="pm-drawer-main pm-scroll" style={{ minHeight: 0, overflowY: 'auto', padding: '22px 24px 28px' }}>
            {c.candidat.aiPitchShort && (
              <>
                <div style={LABEL}>Synthèse</div>
                <p style={{ fontSize: 13.5, lineHeight: 1.65, color: '#4A4568', marginTop: 9 }}>{c.candidat.aiPitchShort}</p>
              </>
            )}
            {infos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginTop: 18 }}>
                {infos.map((it, i) => (
                  <div key={i} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ ...LABEL, fontSize: 9.5, letterSpacing: '.1em' }}>{it.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginTop: 3, lineHeight: 1.4 }}>{it.value}</div>
                  </div>
                ))}
              </div>
            )}
            {bullets.length > 0 && (sections.length > 0 || infos.length > 0) && <div style={{ ...LABEL, marginTop: 24 }}>Adéquation au poste</div>}
            {bullets.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {bullets.slice(0, 8).map((b, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 6, background: '#F2F3D8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}><Check size={11} color="#22177A" strokeWidth={2.6} /></span>
                    <span style={{ fontSize: 13, lineHeight: 1.55, color: '#4A4568' }}>{b}</span>
                  </div>
                ))}
              </div>
            )}
            {sections.map((sec, i) => (
              <div key={i} style={{ marginTop: 24 }}>
                <div style={LABEL}>{sec.title}</div>
                <ul style={{ margin: '9px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sec.items.map((it, j) => <li key={j} style={{ fontSize: 13, lineHeight: 1.55, color: '#4A4568' }}>{it}</li>)}
                </ul>
              </div>
            ))}
            {!c.candidat.aiPitchShort && bullets.length === 0 && sections.length === 0 && <p style={{ fontSize: 13.5, color: '#8A8699' }}>Le dossier détaillé sera disponible sous peu.</p>}

            {/* AVIS — inutile une fois le process terminé (Engagé / Perdu) */}
            {c.stage !== 'PLACE' && c.stage !== 'REFUSE' && (
              <div style={{ marginTop: 28, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 16 }}>
                <div style={LABEL}>Votre avis</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 10 }}>
                  <button className="pm-dec" disabled={busy} onClick={() => decide('RENCONTRER')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', borderRadius: 12, border: `1.5px solid ${last === 'RENCONTRER' ? '#2C6B3F' : 'rgba(59,154,84,.28)'}`, background: '#EAF3EC', color: '#2C6B3F', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}><Check size={17} />Rencontrer</button>
                  <button className="pm-dec" disabled={busy} onClick={() => decide('A_DISCUTER')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', borderRadius: 12, border: `1.5px solid ${last === 'A_DISCUTER' ? '#8A6A2E' : 'rgba(201,162,39,.3)'}`, background: '#FBF3E7', color: '#8A6A2E', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}><MessageSquare size={17} />À discuter</button>
                  <button className="pm-dec" disabled={busy || !reason.trim()} onClick={() => decide('ECARTER')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', borderRadius: 12, border: `1.5px solid ${last === 'ECARTER' ? '#B0361F' : 'rgba(176,54,31,.28)'}`, background: '#F9ECE9', color: '#B0361F', cursor: reason.trim() ? 'pointer' : 'default', fontWeight: 800, fontSize: 12, opacity: reason.trim() ? 1 : 0.55 }}><X size={17} />Écarter</button>
                </div>
                <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motif (obligatoire pour écarter)…" style={{ width: '100%', marginTop: 10, fontSize: 13, padding: '11px 13px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,.14)', background: '#fff', outline: 'none', fontFamily: "'Manrope',sans-serif" }} />
              </div>
            )}
          </div>

          {/* Panneau latéral : Activité / Commentaires */}
          <div className="pm-drawer-side" style={{ minHeight: 0, display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${LINE}`, background: '#F7F6F0' }}>
            <div style={{ flexShrink: 0, display: 'flex', gap: 6, padding: '14px 16px', borderBottom: `1px solid ${LINE}`, background: '#FCFCF7' }}>
              {([['activite', 'Activité'], ['commentaires', 'Commentaires']] as const).map(([k, label]) => {
                const on = tab === k;
                return (
                  <button key={k} className="pm-tab" onClick={() => setTab(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: on ? 800 : 600, padding: '7px 13px', borderRadius: 9, border: 'none', cursor: 'pointer', background: on ? '#FDE4EC' : 'transparent', color: on ? '#D1356B' : MUTED }}>
                    {label}
                    {k === 'commentaires' && nbComments > 0 && <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 99, padding: '0 6px', background: on ? '#fff' : 'rgba(26,21,51,.07)', color: on ? '#D1356B' : MUTED }}>{nbComments}</span>}
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {tab === 'activite'
                ? <ActivityFeed key={activityKey} candidatureId={c.id} />
                : <CommentThread candidatureId={c.id} repName={repName} onCount={setNbComments} onPosted={() => setActivityKey((k) => k + 1)} />}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Onglet Activité ─────────────────────────────────
interface ActivityItem { kind: 'STAGE' | 'MOVE' | 'DECISION' | 'COMMENT' | 'INTERVIEW'; at: string; actor: string; text: string; detail?: string | null; stage?: Stage }

function ActivityFeed({ candidatureId }: { candidatureId: string }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  useEffect(() => {
    void (async () => {
      const res = await portalFetch(`/candidatures/${candidatureId}/activity`);
      setItems(res.ok ? await res.json() : []);
    })();
  }, [candidatureId]);

  const icon = (it: ActivityItem) => {
    const s = { size: 14, strokeWidth: 2.3 } as const;
    if (it.kind === 'COMMENT') return { el: <MessageCircle {...s} />, bg: '#EDEBFA', fg: '#22177A' };
    if (it.kind === 'DECISION') return { el: <Check {...s} />, bg: '#EAF3EC', fg: '#2C6B3F' };
    if (it.kind === 'INTERVIEW') return { el: <CalendarClock {...s} />, bg: '#FCF3E9', fg: '#B86A12' };
    if (it.kind === 'STAGE' && it.text.includes('présenté')) return { el: <Sparkles {...s} />, bg: '#EDF3FC', fg: '#2A6BD8' };
    const st = it.stage && STAGE_ACCENT[it.stage] ? it.stage : 'ENVOYE_CLIENT';
    return { el: <ArrowRight {...s} />, bg: STAGE_TINT[st], fg: STAGE_ACCENT[st] };
  };

  if (!items) return <div style={{ padding: 20, fontSize: 13, color: FAINT }}>Chargement…</div>;
  if (items.length === 0) return <div style={{ padding: 20, fontSize: 13, color: FAINT }}>Pas encore d’activité sur ce profil.</div>;
  return (
    <div className="pm-scroll" style={{ flex: 1, overflowY: 'auto', padding: '18px 18px 24px' }}>
      {items.map((it, i) => {
        const ic = icon(it);
        const lastItem = i === items.length - 1;
        const upcoming = it.kind === 'INTERVIEW' && new Date(it.at) > new Date();
        return (
          <div key={i} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: lastItem ? 0 : 18 }}>
            {!lastItem && <span aria-hidden style={{ position: 'absolute', left: 14, top: 30, bottom: 2, width: 2, background: 'rgba(26,21,51,.07)', borderRadius: 2 }} />}
            <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 10, background: ic.bg, color: ic.fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ic.el}</span>
            <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
              <div style={{ fontSize: 13, lineHeight: 1.45, color: '#4A4568' }}>
                {it.actor && <strong style={{ color: INK }}>{it.actor} </strong>}{it.text}
                {it.kind === 'INTERVIEW' && <strong style={{ color: INK }}> · {new Date(it.at).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong>}
              </div>
              {it.detail && <div style={{ fontSize: 12.5, lineHeight: 1.5, color: MUTED, marginTop: 5, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '7px 10px' }}>{it.detail}</div>}
              <div style={{ fontSize: 11.5, color: FAINT, marginTop: 4 }}>{upcoming ? 'À venir' : relTime(it.at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Précision demandée avant certains déplacements ─────
function MoveDialog({ c, to, repName, onCancel, onConfirm }: {
  c: Candidature; to: Stage; repName: string;
  onCancel: () => void;
  onConfirm: (extra: { reason?: string; dateEntretienClient?: string; interlocuteurClient?: string }) => void;
}) {
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [who, setWho] = useState('');
  const ok = to === 'REFUSE' ? reason.trim().length > 0 : to === 'ENTRETIEN_CLIENT' ? !!date && who.trim().length > 0 : true;
  const field: React.CSSProperties = { width: '100%', marginTop: 6, fontSize: 13.5, padding: '11px 13px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,.14)', background: '#fff', outline: 'none', fontFamily: "'Manrope',sans-serif" };
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: FAINT, marginTop: 14, display: 'block' };
  const title = to === 'REFUSE' ? `Ne pas retenir ${fullName(c)} ?` : to === 'PLACE' ? `Annoncer l'embauche de ${fullName(c)} ?` : `Case avec ${fullName(c)}`;
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(26,21,51,.42)' }} />
      <div role="dialog" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 71, width: 420, maxWidth: '92vw', background: '#FCFCF5', borderRadius: 18, padding: 24, boxShadow: '0 30px 80px -30px rgba(26,21,51,.6)', fontFamily: "'Manrope',sans-serif" }}>
        <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 18, color: INK, letterSpacing: '-.01em' }}>{title}</div>
        {to === 'REFUSE' && (
          <>
            <label style={label}>Pourquoi ? (visible par votre consultant)</label>
            <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex. : expérience trop éloignée des grands comptes…" style={{ ...field, minHeight: 84, resize: 'vertical' }} />
          </>
        )}
        {to === 'ENTRETIEN_CLIENT' && (
          <>
            <label style={label}>Date et heure de l'entretien</label>
            <input type="datetime-local" autoFocus value={date} onChange={e => setDate(e.target.value)} style={field} />
            <label style={label}>Avec qui chez vous ?</label>
            <input value={who} onChange={e => setWho(e.target.value)} placeholder="Prénom Nom, fonction" style={field} />
          </>
        )}
        {to === 'PLACE' && (
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#4A4568', marginTop: 12 }}>
            {repName || 'Votre consultant'} est prévenu(e) immédiatement et finalise l'embauche avec vous (date de démarrage, contrat). La carte passera en « Engagé » dès validation.
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ flex: 1, fontSize: 13.5, fontWeight: 700, background: 'transparent', color: MUTED, border: '1.5px solid rgba(34,23,122,.14)', borderRadius: 11, padding: 11, cursor: 'pointer' }}>Annuler</button>
          <button
            disabled={!ok}
            onClick={() => onConfirm(to === 'REFUSE' ? { reason: reason.trim() } : to === 'ENTRETIEN_CLIENT' ? { dateEntretienClient: new Date(date).toISOString(), interlocuteurClient: who.trim() } : {})}
            style={{ flex: 1, fontSize: 13.5, fontWeight: 800, background: ok ? '#22177A' : '#C4C1D0', color: '#E6E9AF', border: 'none', borderRadius: 11, padding: 11, cursor: ok ? 'pointer' : 'default' }}
          >Confirmer</button>
        </div>
      </div>
    </>
  );
}

// ─── Onglet Commentaires (avec @mentions) ──────────────
type Mentionable = { key: string; label: string; sub: string; mention: { kind: 'internal'; id: string } | { kind: 'external'; email: string; name?: string } };
interface PortalCommentRow { id: string; content: string; createdAt: string; author: string; mentions: Array<{ name: string; kind: string }> }

function CommentThread({ candidatureId, repName, onCount, onPosted }: { candidatureId: string; repName: string; onCount: (n: number) => void; onPosted: () => void }) {
  const [rows, setRows] = useState<PortalCommentRow[] | null>(null);
  const [people, setPeople] = useState<Mentionable[]>([]);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Mentionable[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const listEnd = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await portalFetch(`/candidatures/${candidatureId}/comments`);
    const list: PortalCommentRow[] = res.ok ? await res.json() : [];
    setRows(list);
    onCount(list.length);
    window.setTimeout(() => listEnd.current?.scrollIntoView({ block: 'end' }), 0);
  }
  useEffect(() => {
    void load();
    void (async () => {
      const res = await portalFetch('/mentionables');
      if (!res.ok) return;
      const m = await res.json() as { internal: Array<{ id: string; name: string; role: string }>; external: Array<{ email: string; name: string }> };
      setPeople([
        ...m.internal.map((u) => ({ key: u.id, label: u.name, sub: `HumanUp · ${u.role}`, mention: { kind: 'internal' as const, id: u.id } })),
        ...m.external.map((x) => ({ key: x.email, label: x.name, sub: x.email, mention: { kind: 'external' as const, email: x.email, name: x.name } })),
      ]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatureId]);

  // Suggestions pour le mot en cours après « @ ».
  const suggestions = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    const list = people.filter((p) => p.label.toLowerCase().includes(q) || p.sub.toLowerCase().includes(q)).slice(0, 6);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query) && !list.some((p) => p.sub.toLowerCase() === q)) {
      list.push({ key: q, label: query, sub: 'Inviter par email', mention: { kind: 'external', email: query } });
    }
    return list;
  }, [query, people]);

  function onChange(v: string) {
    setText(v);
    const caret = ta.current?.selectionStart ?? v.length;
    const m = /(^|\s)@([^\s@]*(?:@[^\s]*)?)$/.exec(v.slice(0, caret));
    setQuery(m ? m[2] : null);
  }
  function pick(p: Mentionable) {
    const caret = ta.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([^\s@]*(?:@[^\s]*)?)$/, `@${p.label} `);
    setText(before + text.slice(caret));
    setPicked((prev) => (prev.some((x) => x.key === p.key) ? prev : [...prev, p]));
    setQuery(null);
    window.setTimeout(() => { ta.current?.focus(); ta.current?.setSelectionRange(before.length, before.length); }, 0);
  }
  function startMention() {
    const v = text && !/\s$/.test(text) ? `${text} @` : `${text}@`;
    setText(v); setQuery('');
    window.setTimeout(() => { ta.current?.focus(); ta.current?.setSelectionRange(v.length, v.length); }, 0);
  }
  async function send() {
    const content = text.trim();
    if (!content) return;
    const mentions = picked.filter((p) => content.includes(`@${p.label}`)).map((p) => p.mention);
    setBusy(true);
    const res = await portalFetch(`/candidatures/${candidatureId}/comment`, { method: 'POST', body: JSON.stringify({ content, mentions }) });
    setBusy(false);
    if (res.ok) { setText(''); setPicked([]); setQuery(null); void load(); onPosted(); }
  }

  const renderContent = (content: string, mentions: PortalCommentRow['mentions']) => {
    const names = (mentions ?? []).map((m) => m.name).filter(Boolean).sort((a, b) => b.length - a.length);
    if (names.length === 0) return content;
    const re = new RegExp(`(${names.map((n) => '@' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
    return content.split(re).map((part, i) => names.some((n) => part === '@' + n)
      ? <span key={i} style={{ color: '#22177A', fontWeight: 800, background: '#F2F3D8', borderRadius: 5, padding: '0 3px' }}>{part}</span>
      : <span key={i}>{part}</span>);
  };

  return (
    <>
      <div className="pm-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows === null && <p style={{ fontSize: 13, color: FAINT }}>Chargement…</p>}
        {rows?.length === 0 && (
          <div style={{ margin: 'auto 0', textAlign: 'center', color: FAINT, fontSize: 13, lineHeight: 1.6, padding: '24px 8px' }}>
            <MessageCircle size={22} strokeWidth={1.8} style={{ display: 'block', margin: '0 auto 8px' }} />
            Aucun commentaire pour l’instant.<br />Tapez <strong style={{ color: MUTED }}>@</strong> pour identifier {repName || 'votre consultant'} ou un collègue.
          </div>
        )}
        {rows?.map((r) => (
          <div key={r.id} style={{ display: 'flex', gap: 10 }}>
            <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: '#22177A', color: '#E6E9AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800 }}>{initialsOf(r.author)}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.author}</span>
                <span style={{ fontSize: 11, color: FAINT, whiteSpace: 'nowrap' }}>{relTime(r.createdAt)}</span>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.55, color: '#4A4568', marginTop: 4, whiteSpace: 'pre-wrap', background: '#fff', border: `1px solid ${LINE}`, borderRadius: '4px 12px 12px 12px', padding: '8px 11px' }}>{renderContent(r.content, r.mentions)}</div>
            </div>
          </div>
        ))}
        <div ref={listEnd} />
      </div>

      <div style={{ flexShrink: 0, padding: '12px 16px 16px', borderTop: `1px solid ${LINE}`, background: '#FCFCF7' }}>
        <div style={{ position: 'relative' }}>
          <textarea
            ref={ta} value={text}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setQuery(null); e.stopPropagation(); }
              if (e.key === 'Enter' && suggestions.length > 0 && query !== null) { e.preventDefault(); pick(suggestions[0]); return; }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
            }}
            placeholder="Écrire un commentaire… (@ pour identifier quelqu’un)"
            style={{ width: '100%', minHeight: 76, resize: 'vertical', fontFamily: "'Manrope',sans-serif", fontSize: 13.5, lineHeight: 1.5, padding: '11px 13px', borderRadius: 12, border: '1.5px solid rgba(34,23,122,.14)', background: '#fff', outline: 'none' }}
          />
          {query !== null && suggestions.length > 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', marginBottom: 6, background: '#fff', border: '1px solid rgba(34,23,122,.12)', borderRadius: 12, boxShadow: '0 18px 40px -20px rgba(26,21,51,.45)', overflow: 'hidden', zIndex: 5 }}>
              {suggestions.map((p) => (
                <button key={p.key} onMouseDown={(e) => { e.preventDefault(); pick(p); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(34,23,122,.06)', cursor: 'pointer' }}>
                  <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: p.mention.kind === 'internal' ? '#22177A' : '#F2F3D8', color: p.mention.kind === 'internal' ? '#E6E9AF' : '#22177A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>{initialsOf(p.label)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: INK }}>{p.label}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: FAINT }}>{p.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={startMention} title="Identifier quelqu'un" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, background: '#F2F3D8', color: '#22177A', border: 'none', borderRadius: 11, padding: '0 14px', cursor: 'pointer' }}><AtSign size={14} />Identifier</button>
          <button disabled={busy || !text.trim()} onClick={send} style={{ flex: 1, fontSize: 13.5, fontWeight: 800, background: text.trim() ? '#22177A' : '#C4C1D0', color: '#E6E9AF', border: 'none', borderRadius: 11, padding: 11, cursor: text.trim() ? 'pointer' : 'default' }}>Envoyer</button>
        </div>
        <p style={{ fontSize: 11.5, color: FAINT, marginTop: 8, lineHeight: 1.5 }}>Les personnes identifiées reçoivent votre commentaire par email.</p>
      </div>
    </>
  );
}
