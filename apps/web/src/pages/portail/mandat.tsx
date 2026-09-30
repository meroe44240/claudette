/**
 * Portail client — vue « Suivi Client » d'un mandat (design pack).
 * URL : /portail/mandat/:mandatId — session portail (sessionStorage, 4h).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useNavigate, useParams } from 'react-router';
import { LogOut, X, Check, MessageSquare, Users, AtSign, GripVertical } from 'lucide-react';

type Stage = 'SOURCING' | 'CONTACTE' | 'ENTRETIEN_1' | 'ENVOYE_CLIENT' | 'ENTRETIEN_CLIENT' | 'PROCESS' | 'OFFRE' | 'PLACE' | 'REFUSE';
type Decision = 'RENCONTRER' | 'A_DISCUTER' | 'ECARTER';

interface Candidature {
  id: string; stage: Stage; dateEntretienClient: string | null;
  candidat: { id: string; nom: string; prenom: string | null; posteActuel: string | null; entrepriseActuelle: string | null; salaireSouhaite: number | null; photoUrl: string | null; aiPitchShort: string | null; aiAnonymizedProfile: any };
  portalDecisions: Array<{ decision: Decision; createdAt: string }>;
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
const STAGE_BG: Record<Stage, string> = {
  SOURCING: '#F6F4FB', CONTACTE: '#F6F4FB', ENTRETIEN_1: 'rgba(34,23,122,.05)', ENVOYE_CLIENT: '#F2F3D8',
  ENTRETIEN_CLIENT: '#FBF7F0', PROCESS: '#F5F2FC', OFFRE: '#FBFAEC', PLACE: '#EFF6F0', REFUSE: '#FBF1EF',
};
const DECISION_LABEL: Record<Decision, string> = { RENCONTRER: 'À rencontrer', A_DISCUTER: 'À discuter', ECARTER: 'Écarté' };
const DECISION_TONE: Record<Decision, { bg: string; fg: string }> = {
  RENCONTRER: { bg: '#EAF3EC', fg: '#2C6B3F' }, A_DISCUTER: { bg: '#FBF3E7', fg: '#8A6A2E' }, ECARTER: { bg: '#F9ECE9', fg: '#B0361F' },
};

function portalFetch(path: string, init?: RequestInit) {
  const token = sessionStorage.getItem('portal_token');
  return fetch(`/api/v1/portal${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers as Record<string, string> | undefined) } });
}
function fullName(c: Candidature) { return `${c.candidat.prenom || ''} ${c.candidat.nom}`.trim() || '(profil)'; }
function initials(c: Candidature) { return `${(c.candidat.prenom?.[0] ?? '')}${c.candidat.nom?.[0] ?? ''}`.toUpperCase() || '?'; }

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

export default function PortalMandatPage() {
  const { mandatId } = useParams<{ mandatId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<KanbanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Candidature | null>(null);
  const [pendingMove, setPendingMove] = useState<{ c: Candidature; to: Stage } | null>(null);
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

  // Déplacement : certaines colonnes demandent une précision avant d'enregistrer.
  function onDragEnd(e: DragEndEvent) {
    if (!data || !e.over) return;
    const to = e.over.id as Stage;
    const c = Object.values(data.byStage).flat().find((x) => x.id === e.active.id);
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

  if (loading || !data) return <div style={{ background: '#F4F4EA', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9A96AE', fontFamily: "'Manrope',sans-serif" }}>Chargement…</div>;

  // Le message part vers le consultant HumanUp du mandat (pas vers le client lui-même).
  const consultant = data.mandat.consultant;
  const rep = consultant ? `${consultant.prenom ? consultant.prenom + ' ' : ''}${consultant.nom}`.trim() : '';

  return (
    <div style={{ background: '#F4F4EA', minHeight: '100vh', fontFamily: "'Manrope',sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .pm-card{ transition:transform .18s cubic-bezier(.16,1,.3,1), box-shadow .2s ease, border-color .18s ease; }
        .pm-card:hover{ transform:translateY(-2px); box-shadow:0 16px 30px -20px rgba(34,23,122,.4); border-color:rgba(34,23,122,.2) !important; }
        .pm-dec:hover{ transform:translateY(-1px); }
        .pm-dec{ transition:transform .15s ease; }
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
      <div style={{ padding: '26px 34px 6px' }}>
        <div style={{ fontSize: 13, color: '#9A96AE', fontWeight: 600 }}>Suivi de recrutement · {data.mandat.entreprise.nom}</div>
        <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 30, letterSpacing: '-.03em', color: '#1A1533', marginTop: 5 }}>{data.mandat.titrePoste}</h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: '#6E6A85', marginTop: 8, maxWidth: 660 }}>Cliquez un profil pour voir le dossier complet, glissez une carte pour la faire avancer — votre consultant HumanUp est notifié immédiatement.</p>
      </div>

      {/* BOARD */}
      <main style={{ flex: 1, overflowX: 'auto', padding: '20px 34px 40px' }}>
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div style={{ display: 'flex', gap: 16, minHeight: 0 }}>
            {data.stages.map(stage => (
              <StageColumn key={stage} stage={stage} count={(data.byStage[stage] ?? []).length}>
                {(data.byStage[stage] ?? []).map(c => (
                  <DraggableCard key={c.id} c={c} onOpen={() => { setSelected(c); void portalFetch(`/candidatures/${c.id}/view`, { method: 'POST' }); }} />
                ))}
              </StageColumn>
            ))}
          </div>
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
        <div style={{ position: 'fixed', left: '50%', bottom: 28, transform: 'translateX(-50%)', zIndex: 80, background: '#1A1533', color: '#F4F4EA', fontSize: 13.5, fontWeight: 600, padding: '12px 18px', borderRadius: 12, boxShadow: '0 18px 40px -18px rgba(26,21,51,.6)', maxWidth: '90vw' }}>{toast}</div>
      )}

      {selected && (
        <ProfileDrawer
          candidature={selected}
          repName={rep}
          onClose={() => setSelected(null)}
          onDecision={async (decision, reason) => {
            const res = await portalFetch(`/candidatures/${selected.id}/decision`, { method: 'POST', body: JSON.stringify({ decision, reason }) });
            if (res.ok) { setSelected(null); void reload(); }
          }}
        />
      )}
    </div>
  );
}

// ─── DRAWER ─────────────────────────────────────────
function ProfileDrawer({ candidature: c, repName, onClose, onDecision }: {
  candidature: Candidature; repName: string;
  onClose: () => void;
  onDecision: (d: Decision, reason?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const last = c.portalDecisions[0]?.decision;
  const profile = c.candidat.aiAnonymizedProfile;
  const bullets: string[] = Array.isArray(profile?.bulletPoints) ? profile.bulletPoints : Array.isArray(profile?.highlights) ? profile.highlights : [];
  // Debrief structuré (optionnel) : infos clés + sections titrées.
  const infos: Array<{ label: string; value: string }> = Array.isArray(profile?.infos) ? profile.infos : [];
  const sections: Array<{ title: string; items: string[] }> = Array.isArray(profile?.sections) ? profile.sections : [];

  const decide = async (d: Decision) => {
    if (d === 'ECARTER' && !reason.trim()) { return; }
    setBusy(true);
    try { await onDecision(d, d === 'ECARTER' ? reason.trim() : undefined); } finally { setBusy(false); }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(26,21,51,.42)' }} />
      <aside style={{ position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 61, width: 460, maxWidth: '94vw', background: '#FCFCF5', boxShadow: '-26px 0 70px -30px rgba(26,21,51,.55)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flexShrink: 0, background: '#22177A', padding: '20px 22px', position: 'relative', overflow: 'hidden' }}>
          <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(230,233,175,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(230,233,175,.05) 1px,transparent 1px)', backgroundSize: '36px 36px' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(230,233,175,.7)' }}>Dossier candidat</span>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(230,233,175,.25)', background: 'transparent', color: '#E6E9AF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} strokeWidth={2.4} /></button>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 13, marginTop: 16 }}>
            <Avatar c={c} size={54} radius={16} bg="#E6E9AF" fg="#22177A" fontSize={18} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: '#fff' }}>{fullName(c)}</div>
              {(c.candidat.posteActuel || c.candidat.entrepriseActuelle) && <div style={{ fontSize: 12.5, color: '#E6E9AF', fontWeight: 600, marginTop: 3 }}>{[c.candidat.posteActuel, c.candidat.entrepriseActuelle].filter(Boolean).join(' · ')}</div>}
              {last && <span style={{ display: 'inline-flex', marginTop: 7, fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: '3px 10px', background: DECISION_TONE[last].bg, color: DECISION_TONE[last].fg }}>{DECISION_LABEL[last]}</span>}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 22px 24px' }}>
          {c.candidat.aiPitchShort && (
            <>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE' }}>Synthèse</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#4A4568', marginTop: 9 }}>{c.candidat.aiPitchShort}</p>
            </>
          )}
          {infos.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginTop: 18 }}>
              {infos.map((it, i) => (
                <div key={i} style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 11, padding: '9px 11px' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A96AE' }}>{it.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1533', marginTop: 3, lineHeight: 1.4 }}>{it.value}</div>
                </div>
              ))}
            </div>
          )}
          {bullets.length > 0 && (sections.length > 0 || infos.length > 0) && (
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE', marginTop: 22 }}>Adéquation au poste</div>
          )}
          {bullets.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bullets.slice(0, 8).map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 6, background: '#F2F3D8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}><Check size={11} color="#22177A" strokeWidth={2.6} /></span>
                  <span style={{ fontSize: 13, lineHeight: 1.5, color: '#4A4568' }}>{b}</span>
                </div>
              ))}
            </div>
          )}
          {sections.map((sec, i) => (
            <div key={i} style={{ marginTop: 22 }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE' }}>{sec.title}</div>
              <ul style={{ margin: '9px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sec.items.map((it, j) => <li key={j} style={{ fontSize: 13, lineHeight: 1.55, color: '#4A4568' }}>{it}</li>)}
              </ul>
            </div>
          ))}
          {!c.candidat.aiPitchShort && bullets.length === 0 && sections.length === 0 && <p style={{ fontSize: 13.5, color: '#8A8699' }}>Le dossier détaillé sera disponible sous peu.</p>}

          {/* DECISION — inutile une fois le process terminé (Engagé / Perdu) */}
          {c.stage !== 'PLACE' && c.stage !== 'REFUSE' && (<>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE', marginTop: 24 }}>Votre avis</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 10 }}>
            <button className="pm-dec" disabled={busy} onClick={() => decide('RENCONTRER')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', borderRadius: 12, border: '1.5px solid rgba(59,154,84,.28)', background: '#EAF3EC', color: '#2C6B3F', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}><Check size={17} />Rencontrer</button>
            <button className="pm-dec" disabled={busy} onClick={() => decide('A_DISCUTER')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', borderRadius: 12, border: '1.5px solid rgba(201,162,39,.3)', background: '#FBF3E7', color: '#8A6A2E', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}><MessageSquare size={17} />À discuter</button>
            <button className="pm-dec" disabled={busy || !reason.trim()} onClick={() => decide('ECARTER')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', borderRadius: 12, border: '1.5px solid rgba(176,54,31,.28)', background: '#F9ECE9', color: '#B0361F', cursor: reason.trim() ? 'pointer' : 'default', fontWeight: 800, fontSize: 12, opacity: reason.trim() ? 1 : 0.55 }}><X size={17} />Écarter</button>
          </div>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motif (obligatoire pour écarter)…" style={{ width: '100%', marginTop: 10, fontSize: 13, padding: '11px 13px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,.14)', background: '#fff', outline: 'none' }} />
          </>)}

          {/* COMMENTAIRES + @mentions */}
          <CommentThread candidatureId={c.id} repName={repName} />
        </div>
      </aside>
    </>
  );
}

// ─── BOARD : colonnes + cartes déplaçables ─────────────
function StageColumn({ stage, count, children }: { stage: Stage; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div ref={setNodeRef} style={{ flex: '1 0 215px', maxWidth: 320, background: STAGE_BG[stage], border: `1px solid ${isOver ? STAGE_ACCENT[stage] : 'rgba(34,23,122,.07)'}`, borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'border-color .15s ease, box-shadow .15s ease', boxShadow: isOver ? `0 0 0 3px ${STAGE_ACCENT[stage]}22` : 'none' }}>
      <div style={{ height: 4, background: STAGE_ACCENT[stage] }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 15px 10px' }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: STAGE_ACCENT[stage] }} />
        <span style={{ fontWeight: 800, fontSize: 13.5, color: '#1A1533' }}>{STAGE_LABELS[stage]}</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: STAGE_ACCENT[stage], background: 'rgba(255,255,255,.7)', borderRadius: 999, padding: '2px 9px' }}>{count}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 12px 14px', minHeight: 90 }}>
        {count === 0 && <div style={{ padding: '24px 10px', textAlign: 'center', fontSize: 12, color: '#B4B0C4' }}>Aucun profil pour l'instant</div>}
        {children}
      </div>
    </div>
  );
}

function DraggableCard({ c, onOpen }: { c: Candidature; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: c.id });
  const last = c.portalDecisions[0]?.decision;
  const salary = salaryOf(c);
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      className="pm-card"
      onClick={onOpen}
      style={{
        background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 13, padding: 13,
        boxShadow: isDragging ? '0 22px 40px -18px rgba(34,23,122,.55)' : '0 1px 2px rgba(34,23,122,.05)',
        cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none',
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        position: 'relative', zIndex: isDragging ? 50 : 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar c={c} size={38} radius="50%" bg="#22177A" fg="#E6E9AF" fontSize={12} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(c)}</div>
          {c.candidat.posteActuel && <div style={{ fontSize: 12, lineHeight: 1.35, color: '#6E6A85', marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{c.candidat.posteActuel}</div>}
        </div>
        <GripVertical size={14} color="#C4C1D0" style={{ flexShrink: 0 }} />
      </div>
      {(salary || last) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {salary && <span style={{ fontSize: 11, fontWeight: 800, color: '#22177A', background: '#F2F3D8', borderRadius: 999, padding: '3px 10px' }}>{salary}</span>}
          {last && <span style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: '3px 10px', background: DECISION_TONE[last].bg, color: DECISION_TONE[last].fg }}>{DECISION_LABEL[last]}</span>}
        </div>
      )}
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
  const label: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9A96AE', marginTop: 14, display: 'block' };
  const title = to === 'REFUSE' ? `Ne pas retenir ${fullName(c)} ?` : to === 'PLACE' ? `Annoncer l'embauche de ${fullName(c)} ?` : `Case avec ${fullName(c)}`;
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(26,21,51,.42)' }} />
      <div role="dialog" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 71, width: 420, maxWidth: '92vw', background: '#FCFCF5', borderRadius: 18, padding: 24, boxShadow: '0 30px 80px -30px rgba(26,21,51,.6)', fontFamily: "'Manrope',sans-serif" }}>
        <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 18, color: '#1A1533', letterSpacing: '-.01em' }}>{title}</div>
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
          <button onClick={onCancel} style={{ flex: 1, fontSize: 13.5, fontWeight: 700, background: 'transparent', color: '#6E6A85', border: '1.5px solid rgba(34,23,122,.14)', borderRadius: 11, padding: 11, cursor: 'pointer' }}>Annuler</button>
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

// ─── Fil de commentaires avec @mentions ────────────────
type Mentionable = { key: string; label: string; sub: string; mention: { kind: 'internal'; id: string } | { kind: 'external'; email: string; name?: string } };
interface PortalCommentRow { id: string; content: string; createdAt: string; author: string; mentions: Array<{ name: string; kind: string }> }

function CommentThread({ candidatureId, repName }: { candidatureId: string; repName: string }) {
  const [rows, setRows] = useState<PortalCommentRow[]>([]);
  const [people, setPeople] = useState<Mentionable[]>([]);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Mentionable[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  async function load() {
    const res = await portalFetch(`/candidatures/${candidatureId}/comments`);
    if (res.ok) setRows(await res.json());
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
    if (res.ok) { setText(''); setPicked([]); setQuery(null); void load(); }
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
    <div style={{ marginTop: 26 }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE' }}>Commentaires</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
        {rows.length === 0 && <p style={{ fontSize: 12.5, color: '#9A96AE' }}>Aucun commentaire pour l'instant.</p>}
        {rows.map((r) => (
          <div key={r.id} style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#1A1533' }}>{r.author}</span>
              <span style={{ fontSize: 11, color: '#9A96AE' }}>{new Date(r.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: '#4A4568', marginTop: 4, whiteSpace: 'pre-wrap' }}>{renderContent(r.content, r.mentions)}</div>
          </div>
        ))}
      </div>

      <div style={{ position: 'relative', marginTop: 12 }}>
        <textarea
          ref={ta} value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setQuery(null); if (e.key === 'Enter' && suggestions.length > 0 && query !== null) { e.preventDefault(); pick(suggestions[0]); } }}
          placeholder={`Un avis, une question ? Tapez @ pour identifier ${repName || 'votre consultant'} ou un collègue…`}
          style={{ width: '100%', minHeight: 84, resize: 'vertical', fontFamily: "'Manrope',sans-serif", fontSize: 13.5, lineHeight: 1.5, padding: '11px 13px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,.14)', background: '#fff', outline: 'none' }}
        />
        {query !== null && suggestions.length > 0 && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', marginBottom: 6, background: '#fff', border: '1px solid rgba(34,23,122,.12)', borderRadius: 12, boxShadow: '0 18px 40px -20px rgba(26,21,51,.45)', overflow: 'hidden', zIndex: 5 }}>
            {suggestions.map((p) => (
              <button key={p.key} onMouseDown={(e) => { e.preventDefault(); pick(p); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(34,23,122,.06)', cursor: 'pointer' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1533' }}>{p.label}</span>
                <span style={{ fontSize: 11.5, color: '#9A96AE' }}>{p.sub}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={startMention} title="Identifier quelqu'un" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, background: '#F2F3D8', color: '#22177A', border: 'none', borderRadius: 11, padding: '0 14px', cursor: 'pointer' }}><AtSign size={14} />Identifier</button>
        <button disabled={busy || !text.trim()} onClick={send} style={{ flex: 1, fontSize: 13.5, fontWeight: 800, background: text.trim() ? '#22177A' : '#C4C1D0', color: '#E6E9AF', border: 'none', borderRadius: 11, padding: 12, cursor: text.trim() ? 'pointer' : 'default' }}>Envoyer</button>
      </div>
      <p style={{ fontSize: 11.5, color: '#9A96AE', marginTop: 8, lineHeight: 1.5 }}>Les personnes identifiées reçoivent votre commentaire par email.</p>
    </div>
  );
}
