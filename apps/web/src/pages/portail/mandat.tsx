/**
 * Portail client : tableau des candidatures d'une offre.
 * URL : /portail/mandat/:mandatId — session portail (localStorage, 8h).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { MessageCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { portalStore } from './portal-store';
import {
  BG, BRAND, BTN, BTN_GHOST, CARD, COL_HINT, COL_LABELS, CREAM, DECISION_LABEL, FONT, FS, INK, LINE, LOGO, MUTED, SHARED_CSS, SOFT, TEXT,
  PersonAvatar, Pill, PortalTopBar, lastMandat, portalFetch, useIsMobile, type Col, type Decision,
} from './portal-ui';

type Stage = 'SOURCING' | 'CONTACTE' | 'ENTRETIEN_1' | 'ENVOYE_CLIENT' | 'ENTRETIEN_CLIENT' | 'PROCESS' | 'OFFRE' | 'PLACE' | 'REFUSE';
// Colonnes du portail (Case et Culture Fit = étape PROCESS dans l'ATS).
const COL_STAGE: Record<Col, Stage> = { INBOX: 'ENVOYE_CLIENT', SCREENING: 'ENTRETIEN_CLIENT', CASE: 'PROCESS', CULTURE_FIT: 'PROCESS', OFFRE: 'OFFRE', ENGAGE: 'PLACE', PERDU: 'REFUSE' };

interface Person { nom: string; prenom: string | null; avatarUrl?: string | null }
interface Candidature {
  id: string; stage: Stage; column: Col; dateEntretienClient: string | null;
  candidat: { id: string; nom: string; prenom: string | null; posteActuel: string | null; entrepriseActuelle: string | null; salaireSouhaite: number | null; photoUrl: string | null; aiPitchShort: string | null; aiAnonymizedProfile: any;
    contact?: { email: string | null; telephone: string | null; linkedinUrl: string | null; cvUrl: string | null } | null };
  portalDecisions: Array<{ decision: Decision; createdAt: string }>;
  _count?: { portalComments: number };
  seen?: boolean;
  stageSince?: string;
  hireAnnounced?: boolean;
}
interface KanbanResponse {
  mandat: { id: string; titrePoste: string; visibleStages: Stage[]; entreprise: { nom: string; logoUrl?: string | null }; client: { nom: string; prenom: string | null }; consultant: Person | null; commercial: Person | null };
  stages: Col[];
  byStage: Record<Col, Candidature[]>;
}
type MoveExtra = { reason?: string; dateEntretienClient?: string; interlocuteurClient?: string };
type TeamMember = { name: string; role: string; photo: string | null };
type PanelTab = 'activite' | 'commentaires';

const personName = (p: Person | null) => (p ? `${p.prenom ? p.prenom + ' ' : ''}${p.nom}`.trim() : '');
function fullName(c: Candidature) { return `${c.candidat.prenom || ''} ${c.candidat.nom}`.trim() || '(profil)'; }

// Salaire affiché sur la carte : prétentions / rémunération du debrief, sinon salaire souhaité.
function salaryOf(c: Candidature): string | null {
  const infos: Array<{ label: string; value: string }> = Array.isArray(c.candidat.aiAnonymizedProfile?.infos) ? c.candidat.aiAnonymizedProfile.infos : [];
  const hit = infos.find((i) => /pr[ée]tention|r[ée]mun|salaire|package/i.test(i.label));
  // Version courte pour la carte : « 70-75 K€ package (55 K€ fixe + variable) » → « 70-75 K€ package ».
  if (hit?.value) return hit.value.replace(/\s*\(.*\)\s*$/, '');
  if (c.candidat.salaireSouhaite) return `${Math.round(c.candidat.salaireSouhaite / 1000)} K€`;
  return null;
}
function daysIn(c: Candidature): string | null {
  if (!c.stageSince) return null;
  const d = Math.floor((Date.now() - new Date(c.stageSince).getTime()) / 86400000);
  return d <= 0 ? 'depuis aujourd’hui' : d === 1 ? 'depuis 1 jour' : `depuis ${d} jours`;
}
const needsReview = (c: Candidature) => c.column === 'INBOX' && c.portalDecisions.length === 0;
// L'entretien daté est celui du Screening : une fois le profil plus loin, on ne l'affiche plus.
const upcomingInterview = (c: Candidature) => c.column === 'SCREENING' && !!c.dateEntretienClient && new Date(c.dateEntretienClient) > new Date();

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
function fmtInterview(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
// Ligne d'information de la carte : l'entretien à venir prime, sinon salaire et ancienneté dans l'étape.
function metaOf(c: Candidature): string {
  if (upcomingInterview(c)) return `Entretien ${fmtInterview(c.dateEntretienClient!)}`;
  if (c.stage === 'REFUSE') return ['Écarté', daysIn(c)].filter(Boolean).join(' ');
  return [salaryOf(c), daysIn(c)].filter(Boolean).join(' · ');
}

// Garde le focus clavier dans une fenêtre (dialogue / fiche) + Échap pour fermer.
function useDialogFocus(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const el = ref.current;
    const prev = document.activeElement as HTMLElement | null;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>('button, input, textarea, [tabindex="0"]');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !el) return;
      const f = Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, textarea, select, [tabindex="0"]')).filter((n) => n.offsetParent !== null);
      if (f.length === 0) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    el?.addEventListener('keydown', onKey);
    return () => { el?.removeEventListener('keydown', onKey); prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

type Toast = { msg: string; undo?: () => void };

export default function PortalMandatPage() {
  const { mandatId } = useParams<{ mandatId: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [data, setData] = useState<KanbanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<{ tab: PanelTab; prefill?: boolean }>({ tab: 'commentaires' });
  const [pendingMove, setPendingMove] = useState<{ c: Candidature; to: Col; fromDecision?: boolean } | null>(null);
  const [dragging, setDragging] = useState<Candidature | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (!portalStore.get('portal_token')) { navigate(`/portail/login?m=${mandatId ?? ''}`); return; }
    document.title = 'Candidatures | Humanup';
    setSelectedId(null);
    if (mandatId) lastMandat.set(mandatId);
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandatId]);

  async function reload(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await portalFetch(`/kanban?mandatId=${mandatId ?? ''}`);
      if (res.status === 401) { portalStore.clear(); navigate(`/portail/login?m=${mandatId ?? ''}&expired=1`); return; }
      if (res.status === 403 || res.status === 404) { navigate('/portail/offres', { replace: true }); return; }
      setData((await res.json()) as KanbanResponse);
    } finally { setLoading(false); }
  }
  // Interlocuteur du client côté Humanup : le commercial (à défaut le consultant).
  const contactUser = data?.mandat.commercial ?? data?.mandat.consultant ?? null;
  const repFirst = contactUser?.prenom || contactUser?.nom || '';
  function flash(t: Toast) {
    window.clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = window.setTimeout(() => setToast(null), t.undo ? 6500 : 4000);
  }
  const allCards = useCallback(() => (data ? Object.values(data.byStage).flat() : []), [data]);
  const selected = selectedId ? allCards().find((c) => c.id === selectedId) ?? null : null;

  // Lien direct vers une fiche (page Candidats, notifications) : ?c=<candidature>&t=commentaires
  useEffect(() => {
    const cid = params.get('c');
    if (!data || !cid) return;
    const c = allCards().find((x) => x.id === cid);
    if (c) openCard(c);
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function openCard(c: Candidature, tab: PanelTab = 'commentaires', prefill = false) {
    setSelectedId(c.id);
    setPanelTab({ tab, prefill });
    if (!c.seen) void portalFetch(`/candidatures/${c.id}/view`, { method: 'POST', body: '{}' });
  }

  // Toute demande de déplacement passe par ici (drag, fiche, boutons d'avis).
  function requestMove(c: Candidature, to: Col) {
    if (c.column === to) return;
    if (c.stage === 'PLACE') { flash({ msg: `L'embauche de ${fullName(c)} est validée : contactez ${repFirst || 'votre interlocuteur Humanup'} pour la modifier.` }); return; }
    if (to === 'SCREENING' || to === 'PERDU' || to === 'ENGAGE') { setPendingMove({ c, to }); return; }
    void doMove(c, to, {});
  }
  function onDragStart(e: DragStartEvent) { setDragging(allCards().find((x) => x.id === e.active.id) ?? null); }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (!e.over) return;
    const c = allCards().find((x) => x.id === e.active.id);
    if (c) requestMove(c, e.over.id as Col);
  }

  async function doMove(c: Candidature, to: Col, extra: MoveExtra, isUndo = false) {
    if (!data) return;
    const snapshot = data;
    const from = c.column;
    if (to !== 'ENGAGE') {
      // Optimiste : la carte change de colonne tout de suite.
      const byStage = Object.fromEntries(Object.entries(data.byStage).map(([k, arr]) => [k, arr.filter((x) => x.id !== c.id)])) as Record<Col, Candidature[]>;
      byStage[to] = [{ ...c, column: to, stage: COL_STAGE[to], stageSince: new Date().toISOString() }, ...(byStage[to] ?? [])];
      setData({ ...data, byStage });
    }
    const res = await portalFetch(`/candidatures/${c.id}/move`, { method: 'POST', body: JSON.stringify({ column: to, ...extra }) });
    if (!res.ok) {
      setData(snapshot);
      const err = await res.json().catch(() => null);
      flash({ msg: err?.message || 'Le déplacement n’a pas pu être enregistré.' });
      return;
    }
    const out = await res.json().catch(() => ({}));
    if (out?.pending) {
      flash({ msg: out.already
        ? `Embauche déjà signalée à ${repFirst || 'Humanup'}.`
        : `Embauche signalée à ${repFirst || 'Humanup'}.` });
    } else if (isUndo) {
      flash({ msg: 'Déplacement annulé.' });
    } else {
      flash({
        msg: `${fullName(c)} : ${COL_LABELS[to]}`,
        undo: () => { setToast(null); void doMove({ ...c, column: to, stage: COL_STAGE[to] }, from, {}, true); },
      });
    }
    void reload(true);
  }

  async function decide(c: Candidature, d: Decision) {
    // Rencontrer depuis Inbox = planifier le Screening ; Écarter = Perdu (avec motif).
    if (d === 'RENCONTRER' && c.column === 'INBOX') { setPendingMove({ c, to: 'SCREENING', fromDecision: true }); return; }
    if (d === 'ECARTER') { setPendingMove({ c, to: 'PERDU' }); return; }
    const res = await portalFetch(`/candidatures/${c.id}/decision`, { method: 'POST', body: JSON.stringify({ decision: d }) });
    if (!res.ok) { flash({ msg: 'Votre avis n’a pas pu être enregistré.' }); return; }
    if (d === 'A_DISCUTER') setPanelTab({ tab: 'commentaires', prefill: true });
    flash({ msg: 'Avis enregistré.' });
    void reload(true);
  }
  async function decideOnly(c: Candidature, d: Decision) {
    const res = await portalFetch(`/candidatures/${c.id}/decision`, { method: 'POST', body: JSON.stringify({ decision: d }) });
    if (res.ok) { flash({ msg: 'Avis enregistré.' }); void reload(true); }
  }

  if (loading || !data) return (
    <div className="pm-page" style={{ background: BG, minHeight: '100vh', fontFamily: FONT }}>
      <style>{SHARED_CSS}</style>
      <PortalTopBar active="candidatures" mandatId={mandatId} />
      <p style={{ padding: 40, textAlign: 'center', color: MUTED }}>Chargement…</p>
    </div>
  );

  const rep = personName(data.mandat.consultant);
  const commercial = personName(data.mandat.commercial);
  const contact = commercial || rep;
  const team: TeamMember[] = [
    commercial ? { name: commercial, role: 'Votre contact Humanup', photo: data.mandat.commercial?.avatarUrl ?? null } : null,
    rep && rep !== commercial ? { name: rep, role: 'Consultant sur le poste', photo: data.mandat.consultant?.avatarUrl ?? null } : null,
  ].filter(Boolean) as TeamMember[];
  const cards = allCards();
  const presented = cards.length;
  const toReview = cards.filter(needsReview);
  const nextInterview = cards.filter(upcomingInterview)
    .sort((a, b) => new Date(a.dateEntretienClient!).getTime() - new Date(b.dateEntretienClient!).getTime())[0];
  const pad = isMobile ? '18px 16px 0' : '28px 32px 0';

  return (
    <div className="pm-page" style={{ background: BG, minHeight: '100vh', fontFamily: FONT, display: 'flex', flexDirection: 'column' }}>
      <style>{SHARED_CSS}{`
        .pm-card{ transition:border-color .15s ease, box-shadow .15s ease; }
        .pm-card:hover{ border-color:#C7C9D1 !important; box-shadow:0 4px 14px -8px rgba(17,24,39,.25); }
        .pm-step:hover:not(:disabled) .pm-step-bar{ background:#B9B6DC; }
      `}</style>

      <PortalTopBar active="candidatures" mandatId={mandatId} />

      {/* En-tête de l'offre */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, padding: pad }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <OfferSwitcher current={data.mandat.id} title={data.mandat.titrePoste} compact={isMobile} />
          <span style={{ fontSize: 14, color: MUTED }}>{data.mandat.entreprise.nom} · {presented} profil{presented > 1 ? 's' : ''} présenté{presented > 1 ? 's' : ''}</span>
        </div>
        {team.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            {team.map((t) => (
              <div key={t.role} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <PersonAvatar name={t.name} photo={t.photo} size={36} ring />
                <span style={{ display: 'flex', flexDirection: 'column', fontSize: 13, lineHeight: 1.3 }}>
                  <span style={{ fontWeight: 600, color: INK }}>{t.name}</span>
                  <span style={{ color: MUTED }}>{t.role}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* À traiter */}
      {(toReview.length > 0 || nextInterview) && (
        <div style={{ padding: isMobile ? '16px 16px 0' : '18px 32px 0' }}>
          <div role="status" style={{ background: toReview.length > 0 ? CREAM : '#fff', border: toReview.length > 0 ? 'none' : `1px solid ${LINE}`, color: toReview.length > 0 ? BRAND : TEXT, borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 14 }}>
            <span>
              {toReview.length > 0 && <><span style={{ fontWeight: 700 }}>À traiter :</span> {toReview.length} profil{toReview.length > 1 ? 's attendent' : ' attend'} votre avis</>}
              {toReview.length > 0 && nextInterview && ' · '}
              {nextInterview && <>{toReview.length > 0 ? 'prochain entretien' : 'Prochain entretien'} avec {fullName(nextInterview)}, {fmtInterview(nextInterview.dateEntretienClient!)}</>}
            </span>
            <button onClick={() => openCard(toReview[0] ?? nextInterview!)} style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: BRAND, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>Voir</button>
          </div>
        </div>
      )}

      {/* Tableau (ordinateur) / liste (mobile) */}
      {isMobile ? (
        <MobileList data={data} onOpen={openCard} />
      ) : (
        <main className="pm-scroll" style={{ overflowX: 'auto', padding: '18px 32px 40px' }}>
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.stages.length}, minmax(220px, 1fr))`, gap: 12, alignItems: 'stretch' }}>
              {data.stages.map(stage => (
                <StageColumn key={stage} stage={stage} count={(data.byStage[stage] ?? []).length} dragging={!!dragging}>
                  {(data.byStage[stage] ?? []).map(c => <DraggableCard key={c.id} c={c} onOpen={() => openCard(c)} />)}
                </StageColumn>
              ))}
            </div>
            <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.16,1,.3,1)' }}>
              {dragging ? <CardBody c={dragging} lifted /> : null}
            </DragOverlay>
          </DndContext>
        </main>
      )}

      {selected && (
        <ProfilePage
          key={selected.id}
          candidature={selected}
          stages={data.stages}
          repName={contact}
          team={team}
          offerTitle={data.mandat.titrePoste}
          tab={panelTab.tab}
          prefillMention={panelTab.prefill}
          onTab={(tab) => setPanelTab({ tab })}
          onClose={() => { setSelectedId(null); void reload(true); }}
          onDecision={(d) => void decide(selected, d)}
          onMove={(to) => requestMove(selected, to)}
          locked={!!pendingMove}
        />
      )}

      {pendingMove && (
        <MoveDialog
          c={pendingMove.c} to={pendingMove.to} repName={contact} fromDecision={pendingMove.fromDecision}
          onCancel={() => setPendingMove(null)}
          onConfirm={(extra) => { const m = pendingMove; setPendingMove(null); void doMove(m.c, m.to, extra); }}
          onSkip={() => { const m = pendingMove; setPendingMove(null); void decideOnly(m.c, 'RENCONTRER'); }}
        />
      )}

      {toast && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', left: '50%', bottom: isMobile ? 84 : 24, transform: 'translateX(-50%)', zIndex: 90, display: 'flex', alignItems: 'center', gap: 14, background: INK, color: '#fff', fontSize: 14, fontWeight: 500, padding: '12px 14px 12px 18px', borderRadius: 12, boxShadow: '0 16px 40px -16px rgba(17,24,39,.5)', maxWidth: 'calc(100vw - 32px)' }}>
          <span>{toast.msg}</span>
          {toast.undo && <button onClick={toast.undo} style={{ flexShrink: 0, fontFamily: FONT, fontSize: 14, fontWeight: 600, color: BRAND, background: CREAM, border: 'none', borderRadius: 8, padding: '6px 11px', cursor: 'pointer' }}>Annuler</button>}
        </div>
      )}
    </div>
  );
}

// ─── Tableau : colonnes + cartes déplaçables ─────────────
function StageColumn({ stage, count, dragging, children }: { stage: Col; count: number; dragging: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const empty = count === 0;
  return (
    <section ref={setNodeRef} aria-label={`${COL_LABELS[stage]}, ${count} profil${count > 1 ? 's' : ''}`}
      style={{ background: isOver ? '#E4E5F0' : '#EEEFF2', outline: isOver ? `2px solid ${BRAND}` : 'none', borderRadius: 14, padding: 10, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 520, transition: 'background .15s ease' }}>
      <div style={{ padding: '4px 6px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: INK }}>{COL_LABELS[stage]}</h2>
          <span style={{ fontSize: 12, fontWeight: 700, color: MUTED, background: '#fff', borderRadius: 999, padding: '1px 8px' }}>{count}</span>
        </div>
        <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 2 }}>{COL_HINT[stage]}</span>
      </div>
      {children}
      {empty && (
        <div style={{ border: '1px dashed #C7C9D1', borderRadius: 12, padding: '18px 10px', textAlign: 'center', fontSize: 13, color: MUTED }}>
          {dragging ? 'Déposez le profil ici' : 'Aucun profil pour l’instant'}
        </div>
      )}
    </section>
  );
}

function CardBody({ c, lifted }: { c: Candidature; lifted?: boolean }) {
  const last = c.portalDecisions[0]?.decision;
  const nbComments = c._count?.portalComments ?? 0;
  const locked = c.stage === 'PLACE';
  const lost = c.stage === 'REFUSE';
  const isNew = !c.seen && !lost;
  const meta = metaOf(c);
  const tag = c.hireAnnounced ? 'Embauche annoncée' : locked ? 'Embauche validée' : last && !lost ? DECISION_LABEL[last] : null;
  return (
    <div
      className={lifted ? undefined : 'pm-card'}
      style={{
        background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, color: TEXT,
        boxShadow: lifted ? '0 20px 40px -16px rgba(17,24,39,.4)' : 'none',
        transform: lifted ? 'rotate(1.5deg)' : undefined,
        cursor: lifted ? 'grabbing' : locked ? 'pointer' : 'grab',
      }}
    >
      <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <PersonAvatar name={fullName(c)} photo={c.candidat.photoUrl} size={36} bg={lost ? LINE : CREAM} fg={lost ? MUTED : BRAND} />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.3 }}>
          <span style={{ fontWeight: 600, color: INK, fontSize: 14 }}>{fullName(c)}</span>
          {c.candidat.posteActuel && <span style={{ fontSize: 13, color: MUTED, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{c.candidat.posteActuel}</span>}
        </span>
      </span>
      {meta && <span style={{ fontSize: 13, color: MUTED }}>{meta}</span>}
      {(isNew || tag || nbComments > 0) && (
        <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {isNew && <span style={{ background: BRAND, color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 12, fontWeight: 600 }}>Nouveau</span>}
          {tag && <Pill strong={c.hireAnnounced || locked}>{tag}</Pill>}
          {nbComments > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: MUTED }}>
              <MessageCircle size={13} aria-hidden />{nbComments}
              <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}> commentaire{nbComments > 1 ? 's' : ''}</span>
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function DraggableCard({ c, onOpen }: { c: Candidature; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id, disabled: c.stage === 'PLACE' });
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      role="button" tabIndex={0}
      aria-label={`${fullName(c)}, ${c.candidat.posteActuel ?? ''}. Ouvrir le dossier`}
      className="pm-focus"
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      style={{ touchAction: 'none', opacity: isDragging ? 0.35 : 1, borderRadius: 12 }}
    >
      <CardBody c={c} />
    </div>
  );
}

// ─── Liste mobile (pas de glisser-déposer au doigt) ────
function MobileList({ data, onOpen }: { data: KanbanResponse; onOpen: (c: Candidature) => void }) {
  const groups = data.stages.filter((s) => (data.byStage[s]?.length ?? 0) > 0);
  return (
    <main style={{ padding: '16px 16px 36px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {groups.length === 0 && <p style={{ fontSize: 14, color: MUTED }}>Aucun profil pour l’instant.</p>}
      {groups.map((s) => {
        const items = data.byStage[s] ?? [];
        return (
          <section key={s} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: INK, display: 'flex', justifyContent: 'space-between' }}>{COL_LABELS[s]} <span style={{ color: MUTED, fontWeight: 600 }}>{items.length}</span></h2>
            <div style={CARD}>
              {items.map((c, i) => {
                const lost = c.stage === 'REFUSE';
                return (
                  <button key={c.id} className="pm-row" onClick={() => onOpen(c)} aria-label={`${fullName(c)}. Ouvrir le dossier`}
                    style={{ width: '100%', display: 'flex', gap: 12, padding: '12px 14px', alignItems: 'center', textAlign: 'left', background: 'transparent', border: 'none', borderTop: i ? `1px solid ${SOFT}` : 'none', cursor: 'pointer', fontFamily: FONT, color: TEXT, minHeight: 48 }}>
                    <PersonAvatar name={fullName(c)} photo={c.candidat.photoUrl} size={38} bg={lost ? LINE : CREAM} fg={lost ? MUTED : BRAND} />
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, color: INK, fontSize: 14 }}>{fullName(c)}</span>
                      <span style={{ fontSize: 13, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{metaOf(c) || c.candidat.posteActuel}</span>
                    </span>
                    {!c.seen && !lost ? <span style={{ background: BRAND, color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 12, fontWeight: 600 }}>Nouveau</span> : <ChevronRight size={16} aria-hidden color={MUTED} />}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}

// ─── Coordonnées du candidat (si Humanup les a rendues visibles) ──
function ContactBlock({ contact }: { contact: NonNullable<Candidature['candidat']['contact']> }) {
  const linkedin = contact.linkedinUrl ? (/^https?:\/\//i.test(contact.linkedinUrl) ? contact.linkedinUrl : `https://${contact.linkedinUrl}`) : null;
  const rows = [
    contact.cvUrl && { label: 'Voir le CV', href: contact.cvUrl, ext: true },
    linkedin && { label: 'LinkedIn', href: linkedin, ext: true },
    contact.email && { label: contact.email, href: `mailto:${contact.email}` },
    contact.telephone && { label: contact.telephone, href: `tel:${contact.telephone.replace(/\s+/g, '')}` },
  ].filter(Boolean) as Array<{ label: string; href: string; ext?: boolean }>;
  if (rows.length === 0) return null;
  return (
    <div style={{ background: BG, borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', flexDirection: 'column', fontSize: 14 }}>
        <span style={{ fontWeight: 600, color: INK }}>Coordonnées et CV</span>
        <span style={{ color: MUTED }}>Partagés avec vous par Humanup</span>
      </span>
      <span style={{ display: 'flex', gap: 14, fontSize: 14, fontWeight: 600, flexWrap: 'wrap' }}>
        {rows.map(({ label, href, ext }) => (
          <a key={href} href={href} {...(ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})} style={{ color: BRAND }}>{label}</a>
        ))}
      </span>
    </div>
  );
}

// ─── Fiche candidat : page plein écran (dossier + commentaires / activité) ──
function ProfilePage({ candidature: c, stages, repName, team, offerTitle, tab, prefillMention, onTab, onClose, onDecision, onMove, locked: frozen }: {
  candidature: Candidature; stages: Col[]; repName: string; team: TeamMember[]; offerTitle: string;
  tab: PanelTab; prefillMention?: boolean;
  onTab: (t: PanelTab) => void;
  onClose: () => void;
  onDecision: (d: Decision) => void;
  onMove: (to: Col) => void;
  locked?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, () => { if (!frozen) onClose(); });
  const isMobile = useIsMobile();
  const [nbComments, setNbComments] = useState(c._count?.portalComments ?? 0);
  const [activityKey, setActivityKey] = useState(0);
  const last = c.portalDecisions[0]?.decision;
  const hired = c.stage === 'PLACE';
  const lost = c.stage === 'REFUSE';
  const profile = c.candidat.aiAnonymizedProfile;
  const bullets: string[] = Array.isArray(profile?.bulletPoints) ? profile.bulletPoints : Array.isArray(profile?.highlights) ? profile.highlights : [];
  // Debrief structuré (optionnel) : infos clés + sections titrées.
  const infos: Array<{ label: string; value: string }> = Array.isArray(profile?.infos) ? profile.infos : [];
  const sections: Array<{ title: string; items: string[] }> = Array.isArray(profile?.sections) ? profile.sections : [];
  useEffect(() => { setActivityKey((k) => k + 1); }, [c.stage, last]);

  const steps: Col[] = stages.filter((s) => s !== 'PERDU');
  const idx = steps.indexOf(c.column);
  const next = idx >= 0 && idx < steps.length - 1 ? steps[idx + 1] : null;
  const subtitle = [[c.candidat.posteActuel, c.candidat.entrepriseActuelle].filter(Boolean).join(', '), offerTitle].filter(Boolean).join(' · ');
  const sectionCard: React.CSSProperties = { ...CARD, padding: isMobile ? 18 : 24, display: 'flex', flexDirection: 'column', gap: 18 };
  const h3: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: INK };
  const tabBtn = (on: boolean): React.CSSProperties => ({ fontFamily: FONT, fontSize: 14, fontWeight: 600, background: 'none', border: 0, borderBottom: `2px solid ${on ? BRAND : 'transparent'}`, color: on ? BRAND : MUTED, padding: '14px 10px 12px', cursor: 'pointer' });

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={`Dossier de ${fullName(c)}`} className="pm-page pm-scroll" style={{ position: 'fixed', inset: 0, zIndex: 60, background: BG, overflowY: 'auto', fontFamily: FONT, paddingBottom: 0 }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 2, background: '#fff', borderBottom: `1px solid ${LINE}` }}>
        <div style={{ padding: isMobile ? '0 16px' : '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, minHeight: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <img src={LOGO} alt="" style={{ width: 34, height: 34, borderRadius: '50%' }} />
            <span style={{ fontWeight: 700, color: INK, fontSize: 16 }}>Humanup</span>
            {!isMobile && <span style={{ color: MUTED, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{offerTitle}</span>}
          </div>
          <button data-autofocus onClick={onClose} style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: BRAND, background: 'none', border: 'none', padding: '8px 0', cursor: 'pointer' }}>Retour au tableau</button>
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '18px 16px 40px' : '28px 32px 48px', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: '999 1 640px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

          <section style={{ ...sectionCard, gap: 20 }}>
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
              <PersonAvatar name={fullName(c)} photo={c.candidat.photoUrl} size={isMobile ? 60 : 76} ring />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 220 }}>
                <h1 style={{ fontSize: isMobile ? 22 : 26, lineHeight: 1.2, color: INK, letterSpacing: '-0.02em' }}>{fullName(c)}</h1>
                {subtitle && <span style={{ fontSize: 14, color: MUTED }}>{subtitle}</span>}
              </div>
              {!hired && !lost && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {c.column === 'INBOX'
                    ? <button onClick={() => onDecision('RENCONTRER')} style={BTN}>Rencontrer</button>
                    : next && <button onClick={() => onMove(next)} style={BTN}>{next === 'ENGAGE' ? 'Annoncer l’embauche' : `Passer en ${COL_LABELS[next]}`}</button>}
                  <button onClick={() => onDecision('A_DISCUTER')} style={BTN_GHOST}>À discuter</button>
                  <button onClick={() => onDecision('ECARTER')} style={BTN_GHOST}>Écarter</button>
                </div>
              )}
            </div>

            {/* Étapes : cliquer pour déplacer (alternative au glisser-déposer) */}
            <ol aria-label="Étapes du recrutement" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: 6 }}>
              {steps.map((s, i) => {
                const on = c.column === s;
                const done = idx >= 0 && i <= idx;
                const date = on && upcomingInterview(c) ? fmtInterview(c.dateEntretienClient!) : null;
                return (
                  <li key={s}>
                    <button className="pm-step" disabled={hired || on} aria-current={on ? 'step' : undefined} onClick={() => onMove(s)}
                      aria-label={on ? `${COL_LABELS[s]}, étape actuelle` : hired ? COL_LABELS[s] : `Passer en ${COL_LABELS[s]}`}
                      style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left', background: 'none', border: 'none', padding: 0, fontFamily: FONT, cursor: hired || on ? 'default' : 'pointer' }}>
                      <span className="pm-step-bar" style={{ height: 6, borderRadius: 3, background: done ? BRAND : LINE, transition: 'background .15s ease' }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: on ? BRAND : done ? INK : MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{COL_LABELS[s]}</span>
                      {date && <span style={{ fontSize: 12, color: BRAND }}>{date}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>

            {(lost || hired || c.hireAnnounced || last) && (
              <div style={{ background: SOFT, borderRadius: 10, padding: '12px 14px', fontSize: 14 }}>
                {lost ? <><b style={{ color: INK }}>Profil écarté.</b> Vous pouvez le remettre dans le process en cliquant sur une étape.</>
                  : hired ? <><b style={{ color: INK }}>Embauche validée.</b> Contactez {repName || 'Humanup'} pour toute modification.</>
                  : c.hireAnnounced ? <><b style={{ color: INK }}>Embauche annoncée.</b> {repName || 'Humanup'} la finalise avec vous.</>
                  : <>Votre avis : <b style={{ color: INK }}>{DECISION_LABEL[last!]}</b></>}
              </div>
            )}
          </section>

          <section style={sectionCard}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: INK }}>Le dossier Humanup</h2>
            {c.candidat.aiPitchShort && <p style={{ lineHeight: 1.6 }}>{c.candidat.aiPitchShort}</p>}
            {infos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                {infos.map((it, i) => (
                  <div key={i} style={{ background: BG, borderRadius: 10, padding: 12 }}>
                    <span style={{ display: 'block', fontSize: 12, color: MUTED }}>{it.label}</span>
                    <span style={{ fontWeight: 600, color: INK, fontSize: 14 }}>{it.value}</span>
                  </div>
                ))}
              </div>
            )}
            {bullets.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={h3}>Pourquoi ce profil pour votre poste</h3>
                <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {bullets.slice(0, 8).map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </div>
            )}
            {sections.map((sec, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={h3}>{sec.title}</h3>
                <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sec.items.map((it, j) => <li key={j}>{it}</li>)}
                </ul>
              </div>
            ))}
            {!c.candidat.aiPitchShort && bullets.length === 0 && sections.length === 0 && infos.length === 0 && <p style={{ color: MUTED }}>Le dossier détaillé sera disponible sous peu.</p>}
            {c.candidat.contact && <ContactBlock contact={c.candidat.contact} />}
          </section>
        </div>

        <aside style={{ flex: '1 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section style={{ ...CARD, display: 'flex', flexDirection: 'column' }}>
            <div role="tablist" aria-label="Suivi du profil" style={{ display: 'flex', borderBottom: `1px solid ${LINE}`, padding: '0 16px' }}>
              <button role="tab" aria-selected={tab === 'commentaires'} onClick={() => onTab('commentaires')} style={tabBtn(tab === 'commentaires')}>Commentaires{nbComments > 0 ? ` (${nbComments})` : ''}</button>
              <button role="tab" aria-selected={tab === 'activite'} onClick={() => onTab('activite')} style={tabBtn(tab === 'activite')}>Activité</button>
            </div>
            <div role="tabpanel">
              {tab === 'activite'
                ? <ActivityFeed key={activityKey} candidatureId={c.id} />
                : <CommentThread candidatureId={c.id} repName={repName} prefillMention={prefillMention} onCount={setNbComments} onPosted={() => setActivityKey((k) => k + 1)} />}
            </div>
          </section>

          {team.length > 0 && (
            <section style={{ ...CARD, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>Votre équipe Humanup</span>
              {team.map((t) => (
                <div key={t.role} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}>
                  <PersonAvatar name={t.name} photo={t.photo} size={40} ring />
                  <span><span style={{ fontWeight: 600, color: INK }}>{t.name}</span><br /><span style={{ color: MUTED }}>{t.role}</span></span>
                </div>
              ))}
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}

// ─── Onglet Activité ─────────────────────────────────
interface ActivityItem { kind: 'STAGE' | 'MOVE' | 'DECISION' | 'COMMENT' | 'INTERVIEW'; at: string; actor: string; text: string; detail?: string | null; stage?: Col }

function ActivityFeed({ candidatureId }: { candidatureId: string }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  useEffect(() => {
    void (async () => {
      const res = await portalFetch(`/candidatures/${candidatureId}/activity`);
      setItems(res.ok ? await res.json() : []);
    })();
  }, [candidatureId]);

  if (!items) return <p style={{ padding: 16, fontSize: 14, color: MUTED }}>Chargement…</p>;
  if (items.length === 0) return <p style={{ padding: 16, fontSize: 14, color: MUTED }}>Pas encore d’activité sur ce profil.</p>;
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, fontSize: 14 }}>
      {items.map((it, i) => {
        const upcoming = it.kind === 'INTERVIEW' && new Date(it.at) > new Date();
        // Point indigo : ce qui fait avancer le process ; gris : consultations, avis, commentaires.
        const strong = it.kind === 'STAGE' || it.kind === 'MOVE' || it.kind === 'INTERVIEW';
        return (
          <li key={i} style={{ display: 'flex', gap: 10 }}>
            <span aria-hidden style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: strong ? BRAND : '#9CA3AF', marginTop: 8 }} />
            <span style={{ minWidth: 0 }}>
              <span>{it.actor && <span style={{ fontWeight: 600, color: INK }}>{it.actor} </span>}{it.text}{it.kind === 'INTERVIEW' && <span style={{ fontWeight: 600, color: INK }}> · {fmtInterview(it.at)}</span>}</span>
              {it.detail && <span style={{ display: 'block', color: MUTED, marginTop: 2 }}>{it.detail}</span>}
              <span style={{ display: 'block', color: MUTED, fontSize: 13 }}>{upcoming ? 'À venir' : relTime(it.at)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Précision demandée avant certains déplacements ─────
function MoveDialog({ c, to, repName, fromDecision, onCancel, onConfirm, onSkip }: {
  c: Candidature; to: Col; repName: string; fromDecision?: boolean;
  onCancel: () => void;
  onConfirm: (extra: MoveExtra) => void;
  onSkip: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onCancel);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [who, setWho] = useState('');
  const ok = to === 'PERDU' ? reason.trim().length > 0 : to === 'SCREENING' ? !!date && who.trim().length > 0 : true;
  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontFamily: FONT, fontSize: 14, padding: '10px 12px', borderRadius: 10, border: '1px solid #D1D5DB', background: '#fff', color: INK };
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: INK, marginBottom: 4, display: 'block' };
  const title = to === 'PERDU' ? `Écarter ${fullName(c)} ?` : to === 'ENGAGE' ? `Annoncer l'embauche de ${fullName(c)} ?` : `Planifier le Screening avec ${fullName(c)}`;
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(17,24,39,.45)' }} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="pm-move-title" className="pm-page" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 71, width: 440, maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box', background: '#fff', borderRadius: 14, padding: 24, paddingBottom: 24, boxShadow: '0 24px 60px -24px rgba(17,24,39,.5)', fontFamily: FONT, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 id="pm-move-title" style={{ fontSize: 18, fontWeight: 700, color: INK, lineHeight: 1.3 }}>{title}</h3>
        {to === 'PERDU' && (
          <div>
            <label htmlFor="pm-reason" style={label}>Pourquoi ?</label>
            <textarea id="pm-reason" data-autofocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Exemple : expérience trop éloignée des grands comptes" style={{ ...field, minHeight: 84, resize: 'vertical' }} />
          </div>
        )}
        {to === 'SCREENING' && (
          <>
            <div>
              <label htmlFor="pm-date" style={label}>Date et heure de l'entretien</label>
              <input id="pm-date" data-autofocus type="datetime-local" value={date} onChange={e => setDate(e.target.value)} style={field} />
            </div>
            <div>
              <label htmlFor="pm-who" style={label}>Avec qui chez vous ?</label>
              <input id="pm-who" value={who} onChange={e => setWho(e.target.value)} placeholder="Prénom Nom, fonction" style={field} />
            </div>
          </>
        )}
        {to === 'ENGAGE' && (
          <p style={{ fontSize: 14, lineHeight: 1.6 }}>
            {repName || 'Humanup'} finalise l’embauche avec vous (date de démarrage, contrat). La carte passera en « Engagé » une fois validée.
          </p>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ ...BTN_GHOST, flex: 1 }}>Annuler</button>
          <button
            disabled={!ok}
            onClick={() => onConfirm(to === 'PERDU' ? { reason: reason.trim() } : to === 'SCREENING' ? { dateEntretienClient: new Date(date).toISOString(), interlocuteurClient: who.trim() } : {})}
            style={{ ...BTN, flex: 1, background: ok ? BRAND : '#9CA3AF', cursor: ok ? 'pointer' : 'default' }}
          >{to === 'PERDU' ? 'Écarter' : to === 'ENGAGE' ? 'Annoncer' : 'Planifier'}</button>
        </div>
        {to === 'SCREENING' && fromDecision && (
          <button onClick={onSkip} style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, background: 'transparent', color: BRAND, border: 'none', padding: 4, cursor: 'pointer' }}>
            Je n’ai pas encore de date
          </button>
        )}
      </div>
    </>
  );
}

// ─── Onglet Commentaires (avec @mentions) ──────────────
type Mentionable = { key: string; label: string; sub: string; photo?: string | null; mention: { kind: 'internal'; id: string } | { kind: 'external'; email: string; name?: string } };
interface PortalCommentRow { id: string; content: string; createdAt: string; author: string; mentions: Array<{ name: string; kind: string }> }

function CommentThread({ candidatureId, repName, prefillMention, onCount, onPosted }: { candidatureId: string; repName: string; prefillMention?: boolean; onCount: (n: number) => void; onPosted: () => void }) {
  const [rows, setRows] = useState<PortalCommentRow[] | null>(null);
  const [people, setPeople] = useState<Mentionable[]>([]);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Mentionable[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { mandatId: mandatIdParam } = useParams<{ mandatId: string }>();
  const ta = useRef<HTMLTextAreaElement>(null);

  async function load() {
    const res = await portalFetch(`/candidatures/${candidatureId}/comments`);
    const list: PortalCommentRow[] = res.ok ? await res.json() : [];
    setRows(list);
    onCount(list.length);
  }
  useEffect(() => {
    void load();
    void (async () => {
      const res = await portalFetch(`/mentionables?mandatId=${mandatIdParam ?? ''}`);
      if (!res.ok) return;
      const m = await res.json() as { internal: Array<{ id: string; name: string; role: string; avatarUrl?: string | null }>; external: Array<{ email: string; name: string }> };
      const list: Mentionable[] = [
        ...m.internal.map((u) => ({ key: u.id, label: u.name, sub: `Humanup · ${u.role}`, photo: u.avatarUrl, mention: { kind: 'internal' as const, id: u.id } })),
        ...m.external.map((x) => ({ key: x.email, label: x.name, sub: x.email, mention: { kind: 'external' as const, email: x.email, name: x.name } })),
      ];
      setPeople(list);
      // « À discuter » : on prépare le message pour le consultant.
      const target = list.find((p) => p.label === repName) ?? list.find((p) => p.mention.kind === 'internal');
      if (prefillMention && target) {
        const v = `@${target.label} `;
        setText(v); setPicked([target]);
        window.setTimeout(() => { ta.current?.focus(); ta.current?.setSelectionRange(v.length, v.length); }, 0);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatureId, prefillMention]);

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
  const photoOf = (author: string) => people.find((p) => p.label === author)?.photo ?? null;

  function onChange(v: string) {
    setText(v); setError('');
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
    else { const err = await res.json().catch(() => null); setError(err?.message || 'Le commentaire n’a pas pu être envoyé.'); }
  }

  const renderContent = (content: string, mentions: PortalCommentRow['mentions']) => {
    const names = (mentions ?? []).map((m) => m.name).filter(Boolean).sort((a, b) => b.length - a.length);
    if (names.length === 0) return content;
    const re = new RegExp(`(${names.map((n) => '@' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
    return content.split(re).map((part, i) => names.some((n) => part === '@' + n)
      ? <span key={i} style={{ color: BRAND, fontWeight: 600 }}>{part}</span>
      : <span key={i}>{part}</span>);
  };

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {rows === null && <p style={{ fontSize: 14, color: MUTED }}>Chargement…</p>}
      {rows?.length === 0 && <p style={{ fontSize: 14, color: MUTED }}>Aucun commentaire pour l’instant.</p>}
      {rows?.map((r) => (
        <div key={r.id} style={{ display: 'flex', gap: 10 }}>
          <PersonAvatar name={r.author} photo={photoOf(r.author)} size={32} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 14, minWidth: 0 }}>
            <span><span style={{ fontWeight: 600, color: INK }}>{r.author}</span> <span style={{ color: MUTED, fontSize: 13 }}>· {relTime(r.createdAt)}</span></span>
            <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{renderContent(r.content, r.mentions)}</span>
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor="pm-comment" style={{ fontSize: 13, fontWeight: 600, color: INK }}>Votre commentaire</label>
        <div style={{ position: 'relative' }}>
          <textarea
            id="pm-comment" ref={ta} value={text} rows={3}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query !== null) { setQuery(null); e.stopPropagation(); }
              if (e.key === 'Enter' && suggestions.length > 0 && query !== null) { e.preventDefault(); pick(suggestions[0]); return; }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
            }}
            placeholder="Écrivez @ pour mentionner un collègue ou l'équipe Humanup"
            style={{ width: '100%', boxSizing: 'border-box', display: 'block', resize: 'vertical', fontFamily: FONT, fontSize: 14, lineHeight: 1.5, padding: '10px 12px', borderRadius: 10, border: '1px solid #D1D5DB', background: '#fff', color: INK }}
          />
          {query !== null && suggestions.length > 0 && (
            <div role="listbox" aria-label="Personnes à mentionner" style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', marginBottom: 6, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, boxShadow: '0 12px 32px -12px rgba(17,24,39,.3)', overflow: 'hidden', zIndex: 5 }}>
              {suggestions.map((p, i) => (
                <button key={p.key} role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); pick(p); }} className="pm-row" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 12px', background: '#fff', border: 'none', borderTop: i ? `1px solid ${SOFT}` : 'none', cursor: 'pointer', fontFamily: FONT }}>
                  <PersonAvatar name={p.label} photo={p.photo} size={28} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: INK }}>{p.label}</span>
                    <span style={{ display: 'block', fontSize: 13, color: MUTED }}>{p.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {error && <p role="alert" style={{ fontSize: 13, color: '#B42318', fontWeight: 600 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={startMention} style={{ ...BTN_GHOST, padding: '9px 14px' }}>Mentionner</button>
          <button disabled={busy || !text.trim()} onClick={send} style={{ ...BTN, padding: '9px 16px', background: text.trim() ? BRAND : '#9CA3AF', cursor: text.trim() ? 'pointer' : 'default' }}>Envoyer</button>
        </div>
      </div>
    </div>
  );
}

// ─── Titre de l'offre + changement d'offre ───
function OfferSwitcher({ current, title, compact }: { current: string; title: string; compact?: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [offres, setOffres] = useState<Array<{ id: string; titrePoste: string; statut: string; toReview: number }> | null>(null);
  useEffect(() => {
    if (!open || offres) return;
    void portalFetch('/offres').then(async (r) => setOffres(r.ok ? await r.json() : []));
  }, [open, offres]);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}
        style={{ fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 8, maxWidth: '100%', background: 'none', border: 0, padding: 0, cursor: 'pointer', color: INK, textAlign: 'left' }}>
        <h1 style={{ fontSize: compact ? 22 : 26, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, minWidth: 0 }}>{title}</h1>
        <ChevronDown size={18} aria-hidden style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s ease' }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div role="listbox" aria-label="Changer d'offre" style={{ position: 'absolute', left: 0, top: 'calc(100% + 8px)', zIndex: 51, width: 360, maxWidth: 'calc(100vw - 32px)', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, boxShadow: '0 12px 32px -12px rgba(17,24,39,.3)', padding: 6 }}>
            {!offres && <p style={{ padding: 10, fontSize: 14, color: MUTED }}>Chargement…</p>}
            {offres?.map((o) => (
              <button key={o.id} role="option" aria-selected={o.id === current} className="pm-row" onClick={() => { setOpen(false); if (o.id !== current) navigate(`/portail/mandat/${o.id}`); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', background: o.id === current ? SOFT : '#fff', border: 'none', borderRadius: 8, padding: '9px 10px', cursor: 'pointer', fontFamily: FONT }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: o.id === current ? BRAND : INK }}>{o.titrePoste}</span>
                  {!['OUVERT', 'EN_COURS'].includes(o.statut) && <span style={{ display: 'block', fontSize: 13, color: MUTED }}>{o.statut === 'GAGNE' ? 'Pourvue' : 'Terminée'}</span>}
                </span>
                {o.toReview > 0 && <Pill strong>{o.toReview} à traiter</Pill>}
              </button>
            ))}
            <button onClick={() => { setOpen(false); navigate('/portail/offres'); }} style={{ width: '100%', textAlign: 'left', fontFamily: FONT, fontSize: 14, fontWeight: 600, color: BRAND, background: 'transparent', border: 'none', borderTop: `1px solid ${LINE}`, marginTop: 4, padding: '10px 10px 6px', cursor: 'pointer' }}>Voir toutes les offres</button>
          </div>
        </>
      )}
    </div>
  );
}
