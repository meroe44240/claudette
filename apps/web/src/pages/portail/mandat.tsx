/**
 * Portail client — vue « Suivi Client » d'un mandat (design pack).
 * URL : /portail/mandat/:mandatId — session portail (localStorage, 8h).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { useNavigate, useParams } from 'react-router';
import { LogOut, X, Check, MessageSquare, AtSign, Banknote, CalendarClock, ArrowRight, Sparkles, MessageCircle, Inbox, Lock, BellRing, PartyPopper, ChevronDown } from 'lucide-react';
import { portalStore } from './portal-store';

type Stage = 'SOURCING' | 'CONTACTE' | 'ENTRETIEN_1' | 'ENVOYE_CLIENT' | 'ENTRETIEN_CLIENT' | 'PROCESS' | 'OFFRE' | 'PLACE' | 'REFUSE';
type Decision = 'RENCONTRER' | 'A_DISCUTER' | 'ECARTER';

interface Candidature {
  id: string; stage: Stage; dateEntretienClient: string | null;
  candidat: { id: string; nom: string; prenom: string | null; posteActuel: string | null; entrepriseActuelle: string | null; salaireSouhaite: number | null; photoUrl: string | null; aiPitchShort: string | null; aiAnonymizedProfile: any };
  portalDecisions: Array<{ decision: Decision; createdAt: string }>;
  _count?: { portalComments: number };
  seen?: boolean;
  stageSince?: string;
  hireAnnounced?: boolean;
}
interface KanbanResponse {
  mandat: { id: string; titrePoste: string; visibleStages: Stage[]; entreprise: { nom: string }; client: { nom: string; prenom: string | null }; consultant: { nom: string; prenom: string | null } | null; commercial: { nom: string; prenom: string | null } | null };
  stages: Stage[];
  byStage: Record<Stage, Candidature[]>;
}
type MoveExtra = { reason?: string; dateEntretienClient?: string; interlocuteurClient?: string };

// Libellés côté client : Screening / Case / Culture Fit / Offre / Engagé / Perdu.
const STAGE_LABELS: Record<Stage, string> = {
  SOURCING: 'Sourcing', CONTACTE: 'Contactés', ENTRETIEN_1: 'Entretien recruteur', ENVOYE_CLIENT: 'Screening',
  ENTRETIEN_CLIENT: 'Case', PROCESS: 'Culture Fit', OFFRE: 'Offre', PLACE: 'Engagé', REFUSE: 'Perdu',
};
const STAGE_ACCENT: Record<Stage, string> = {
  SOURCING: '#8E7CC3', CONTACTE: '#8E7CC3', ENTRETIEN_1: '#22177A', ENVOYE_CLIENT: '#2A6BD8',
  ENTRETIEN_CLIENT: '#D97F1E', PROCESS: '#7A5BD1', OFFRE: '#B8921A', PLACE: '#2F8A4A', REFUSE: '#8A8699',
};
const STAGE_TINT: Record<Stage, string> = {
  SOURCING: '#F3F1FA', CONTACTE: '#F3F1FA', ENTRETIEN_1: '#EFEEF7', ENVOYE_CLIENT: '#EAF1FC',
  ENTRETIEN_CLIENT: '#FCF1E4', PROCESS: '#F1ECFC', OFFRE: '#FAF4DE', PLACE: '#E7F3EA', REFUSE: '#F0EFF3',
};
const DECISION_LABEL: Record<Decision, string> = { RENCONTRER: 'À rencontrer', A_DISCUTER: 'À discuter', ECARTER: 'Écarté' };
const DECISION_TONE: Record<Decision, { bg: string; fg: string }> = {
  RENCONTRER: { bg: '#E6F2E9', fg: '#256238' }, A_DISCUTER: { bg: '#FAF0DF', fg: '#7A5A1E' }, ECARTER: { bg: '#F7E8E5', fg: '#9E2F1A' },
};

// Palette + échelle typographique (contrastes ≥ 4,5:1 sur le fond).
const INK = '#1A1533';
const TEXT = '#453F63';
const MUTED = '#5C5875';
const FAINT = '#6E6A85';
const LINE = 'rgba(26,21,51,.09)';
const BRAND = '#22177A';
const CREAM = '#E6E9AF';
const BG = '#F6F5EF';
const FS = { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 20, xxl: 28 } as const;
const DISPLAY = "'Archivo Black',sans-serif";
const LABEL: React.CSSProperties = { fontSize: FS.xs, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: FAINT };

function portalFetch(path: string, init?: RequestInit) {
  const token = portalStore.get('portal_token');
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
function daysIn(c: Candidature): string | null {
  if (!c.stageSince) return null;
  const d = Math.floor((Date.now() - new Date(c.stageSince).getTime()) / 86400000);
  return d <= 0 ? 'Aujourd’hui' : d === 1 ? 'Depuis 1 j' : `Depuis ${d} j`;
}
const needsReview = (c: Candidature) => c.stage === 'ENVOYE_CLIENT' && c.portalDecisions.length === 0;

// Photo du candidat si dispo, sinon initiales.
function Avatar({ c, size, radius, bg, fg, fontSize }: { c: Candidature; size: number; radius: number | string; bg: string; fg: string; fontSize: number }) {
  const [broken, setBroken] = useState(false);
  const box: React.CSSProperties = { flexShrink: 0, width: size, height: size, borderRadius: radius, overflow: 'hidden' };
  if (c.candidat.photoUrl && !broken) {
    return <img src={c.candidat.photoUrl} alt="" onError={() => setBroken(true)} style={{ ...box, objectFit: 'cover', display: 'block' }} />;
  }
  return <span aria-hidden style={{ ...box, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize }}>{initials(c)}</span>;
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
function fmtInterview(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function useIsMobile() {
  const q = '(max-width: 760px)';
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
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
      const f = Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, select, [tabindex="0"]')).filter((n) => n.offsetParent !== null);
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
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [data, setData] = useState<KanbanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<{ tab: 'activite' | 'commentaires'; prefill?: boolean }>({ tab: 'activite' });
  const [pendingMove, setPendingMove] = useState<{ c: Candidature; to: Stage; fromDecision?: boolean } | null>(null);
  const [dragging, setDragging] = useState<Candidature | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (!portalStore.get('portal_token')) { navigate(`/portail/login?m=${mandatId ?? ''}`); return; }
    document.title = 'Portail client — HumanUp';
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandatId]);

  async function reload(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await portalFetch('/kanban');
      if (res.status === 401) { portalStore.clear(); navigate(`/portail/login?m=${mandatId ?? ''}&expired=1`); return; }
      setData((await res.json()) as KanbanResponse);
    } finally { setLoading(false); }
  }
  const repFirst = data?.mandat.consultant?.prenom || data?.mandat.consultant?.nom || '';
  function flash(t: Toast) {
    window.clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = window.setTimeout(() => setToast(null), t.undo ? 6500 : 4000);
  }
  const allCards = useCallback(() => (data ? Object.values(data.byStage).flat() : []), [data]);
  const selected = selectedId ? allCards().find((c) => c.id === selectedId) ?? null : null;

  function openCard(c: Candidature, tab: 'activite' | 'commentaires' = 'activite', prefill = false) {
    setSelectedId(c.id);
    setDrawerTab({ tab, prefill });
    if (!c.seen) void portalFetch(`/candidatures/${c.id}/view`, { method: 'POST', body: '{}' });
  }

  // Toute demande de déplacement passe par ici (drag, fiche, boutons d'avis).
  function requestMove(c: Candidature, to: Stage) {
    if (c.stage === to) return;
    if (c.stage === 'PLACE') { flash({ msg: `L'embauche de ${fullName(c)} est validée : contactez ${repFirst || 'votre consultant'} pour la modifier.` }); return; }
    if (to === 'ENTRETIEN_CLIENT' || to === 'REFUSE' || to === 'PLACE') { setPendingMove({ c, to }); return; }
    void doMove(c, to, {});
  }
  function onDragStart(e: DragStartEvent) { setDragging(allCards().find((x) => x.id === e.active.id) ?? null); }
  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    if (!e.over) return;
    const c = allCards().find((x) => x.id === e.active.id);
    if (c) requestMove(c, e.over.id as Stage);
  }

  async function doMove(c: Candidature, to: Stage, extra: MoveExtra, isUndo = false) {
    if (!data) return;
    const snapshot = data;
    const from = c.stage;
    if (to !== 'PLACE') {
      // Optimiste : la carte change de colonne tout de suite.
      const byStage = Object.fromEntries(Object.entries(data.byStage).map(([k, arr]) => [k, arr.filter((x) => x.id !== c.id)])) as Record<Stage, Candidature[]>;
      byStage[to] = [{ ...c, stage: to, stageSince: new Date().toISOString() }, ...(byStage[to] ?? [])];
      setData({ ...data, byStage });
    }
    const res = await portalFetch(`/candidatures/${c.id}/move`, { method: 'POST', body: JSON.stringify({ stage: to, ...extra }) });
    if (!res.ok) {
      setData(snapshot);
      const err = await res.json().catch(() => null);
      flash({ msg: err?.message || 'Le déplacement n’a pas pu être enregistré.' });
      return;
    }
    const out = await res.json().catch(() => ({}));
    if (out?.pending) {
      flash({ msg: out.already
        ? `${repFirst || 'Votre consultant'} a déjà été prévenu(e) de l'embauche de ${fullName(c)}.`
        : `C'est noté ! ${repFirst || 'Votre consultant'} est prévenu(e) et finalise l'embauche de ${fullName(c)}.` });
    } else if (isUndo) {
      flash({ msg: `${fullName(c)} est revenu(e) en « ${STAGE_LABELS[to]} ».` });
    } else {
      flash({
        msg: `${fullName(c)} → ${STAGE_LABELS[to]}. ${repFirst || 'Votre consultant'} est prévenu(e).`,
        undo: () => { setToast(null); void doMove({ ...c, stage: to }, from, {}, true); },
      });
    }
    void reload(true);
  }

  async function decide(c: Candidature, d: Decision) {
    // Rencontrer depuis Screening = planifier le Case ; Écarter = Perdu (avec motif).
    if (d === 'RENCONTRER' && c.stage === 'ENVOYE_CLIENT') { setPendingMove({ c, to: 'ENTRETIEN_CLIENT', fromDecision: true }); return; }
    if (d === 'ECARTER') { setPendingMove({ c, to: 'REFUSE' }); return; }
    const res = await portalFetch(`/candidatures/${c.id}/decision`, { method: 'POST', body: JSON.stringify({ decision: d }) });
    if (!res.ok) { flash({ msg: 'Votre avis n’a pas pu être enregistré.' }); return; }
    if (d === 'A_DISCUTER') {
      setDrawerTab({ tab: 'commentaires', prefill: true });
      flash({ msg: `Dites à ${repFirst || 'votre consultant'} ce que vous voulez creuser : il/elle est notifié(e).` });
    } else {
      flash({ msg: `Avis enregistré. ${repFirst || 'Votre consultant'} est prévenu(e).` });
    }
    void reload(true);
  }
  async function decideOnly(c: Candidature, d: Decision) {
    const res = await portalFetch(`/candidatures/${c.id}/decision`, { method: 'POST', body: JSON.stringify({ decision: d }) });
    if (res.ok) { flash({ msg: `Noté : ${repFirst || 'votre consultant'} organise la rencontre avec ${fullName(c)}.` }); void reload(true); }
  }

  function handleLogout() { portalStore.clear(); navigate(`/portail/login?m=${mandatId ?? ''}`); }

  if (loading || !data) return <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: FAINT, fontFamily: "'Manrope',sans-serif" }}>Chargement…</div>;

  const consultant = data.mandat.consultant;
  const rep = consultant ? `${consultant.prenom ? consultant.prenom + ' ' : ''}${consultant.nom}`.trim() : '';
  const com = data.mandat.commercial;
  const commercial = com ? `${com.prenom ? com.prenom + ' ' : ''}${com.nom}`.trim() : '';
  const cards = allCards();
  const enCours = cards.filter((c) => c.stage !== 'REFUSE' && c.stage !== 'PLACE').length;
  const toReview = cards.filter(needsReview);
  const nextInterview = cards
    .filter((c) => c.dateEntretienClient && new Date(c.dateEntretienClient) > new Date() && c.stage !== 'REFUSE')
    .sort((a, b) => new Date(a.dateEntretienClient!).getTime() - new Date(b.dateEntretienClient!).getTime())[0];

  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Manrope',sans-serif", display: 'flex', flexDirection: 'column', color: INK }}>
      <style>{`
        .pm-card{ transition:transform .18s cubic-bezier(.16,1,.3,1), box-shadow .2s ease, border-color .18s ease; }
        .pm-card:hover{ transform:translateY(-2px); box-shadow:0 14px 28px -18px rgba(26,21,51,.35) !important; border-color:rgba(34,23,122,.2) !important; }
        .pm-focus:focus{ outline:none; }
        .pm-focus:focus-visible, .pm-btn:focus-visible, .pm-tab:focus-visible, .pm-chip:focus-visible{ outline:2.5px solid ${BRAND}; outline-offset:2px; border-radius:14px; }
        .pm-btn{ transition:transform .15s ease, box-shadow .15s ease, background .15s ease; }
        .pm-btn:hover:not(:disabled){ transform:translateY(-1px); box-shadow:0 8px 18px -12px rgba(26,21,51,.35); }
        .pm-chip{ transition:background .15s ease, border-color .15s ease; }
        .pm-chip:hover:not(:disabled){ border-color:rgba(34,23,122,.3) !important; }
        .pm-scroll::-webkit-scrollbar{ height:8px; width:8px; }
        .pm-scroll::-webkit-scrollbar-thumb{ background:rgba(26,21,51,.16); border-radius:99px; }
        @media (max-width: 760px){ .pm-hide-sm{ display:none !important; } }
        @media (max-width: 860px){
          .pm-drawer{ width:100vw !important; max-width:100vw !important; }
          .pm-drawer-body{ display:block !important; overflow-y:auto; }
          .pm-drawer-main{ overflow:visible !important; }
          .pm-drawer-side{ border-left:none !important; border-top:1px solid ${LINE}; }
          .pm-thread-list{ overflow:visible !important; max-height:none !important; }
        }
      `}</style>

      {/* TOP BAR */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: isMobile ? '12px 16px' : '14px 28px', background: BRAND }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          <img src="/brand/logo-mark-cream.png" alt="" style={{ width: 26, height: 26 }} />
          <span style={{ fontFamily: DISPLAY, fontSize: 18, letterSpacing: '.01em', color: CREAM }}>HUMANUP</span>
          <span className="pm-hide-sm" style={{ fontSize: FS.xs, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(230,233,175,.7)', whiteSpace: 'nowrap' }}>Portail client</span>
        </div>
        <button className="pm-btn" onClick={handleLogout} aria-label="Déconnexion" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: FS.base, fontWeight: 600, color: CREAM, background: 'rgba(230,233,175,.12)', border: '1px solid rgba(230,233,175,.25)', borderRadius: 9, padding: '7px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}><LogOut size={14} aria-hidden />{!isMobile && 'Déconnexion'}</button>
      </header>

      {/* HERO */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, padding: isMobile ? '20px 16px 4px' : '28px 34px 6px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: FS.base, color: FAINT, fontWeight: 600 }}>Suivi de recrutement · {data.mandat.entreprise.nom}</div>
          <h1 style={{ fontFamily: DISPLAY, fontSize: isMobile ? 22 : FS.xxl, lineHeight: 1.15, letterSpacing: '-.025em', color: INK, marginTop: 5 }}>{data.mandat.titrePoste}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: '9px 14px' }}>
            <div style={LABEL}>En cours</div>
            <div style={{ fontFamily: DISPLAY, fontSize: FS.xl, marginTop: 2 }}>{enCours}</div>
          </div>
          {(rep || commercial) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: '9px 14px' }}>
              {([[rep, 'Votre consultant', BRAND, CREAM], [commercial, 'Votre commercial', '#F2F3D8', BRAND]] as const).filter(([n]) => n).map(([n, label, bg, fg]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span aria-hidden style={{ width: 34, height: 34, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: FS.sm }}>{initialsOf(n)}</span>
                  <div>
                    <div style={LABEL}>{label}</div>
                    <div style={{ fontSize: FS.md, fontWeight: 800, marginTop: 2 }}>{n}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* À TRAITER */}
      <div style={{ padding: isMobile ? '12px 16px 0' : '14px 34px 0' }}>
        {toReview.length > 0 ? (
          <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, background: '#fff', border: `1px solid ${LINE}`, borderLeft: `4px solid ${BRAND}`, borderRadius: 14, padding: '12px 14px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: FS.md, fontWeight: 800, color: INK }}>
              <BellRing size={17} color={BRAND} />
              {toReview.length} profil{toReview.length > 1 ? 's attendent' : ' attend'} votre avis
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {toReview.map((c) => (
                <button key={c.id} className="pm-chip" onClick={() => openCard(c)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: FS.base, fontWeight: 700, color: INK, background: BG, border: `1px solid ${LINE}`, borderRadius: 999, padding: '4px 12px 4px 4px', cursor: 'pointer' }}>
                  <Avatar c={c} size={24} radius="50%" bg={BRAND} fg={CREAM} fontSize={9} />{fullName(c)}
                  {!c.seen && <span style={{ fontSize: FS.xs, fontWeight: 800, color: BRAND }}>· Nouveau</span>}
                </button>
              ))}
            </div>
            {nextInterview && <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: FS.base, color: MUTED }}><CalendarClock size={15} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} /><span>Prochain entretien : <strong style={{ color: INK }}>{fullName(nextInterview)}</strong>, {fmtInterview(nextInterview.dateEntretienClient!)}</span></span>}
          </div>
        ) : cards.length > 0 ? (
          <div role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, fontSize: FS.base, color: MUTED }}>
            <span style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}><Check size={16} color="#2F8A4A" strokeWidth={2.6} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} /><span><strong style={{ color: INK }}>Vous êtes à jour.</strong> {rep ? `${rep.split(' ')[0]} vous préviendra` : 'Vous serez prévenu'} dès qu’un nouveau profil arrive.</span></span>
            {nextInterview && <span style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}><CalendarClock size={15} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} /><span>Prochain entretien : <strong style={{ color: INK }}>{fullName(nextInterview)}</strong>, {fmtInterview(nextInterview.dateEntretienClient!)}</span></span>}
          </div>
        ) : (
          <div style={{ fontSize: FS.base, color: MUTED }}>Les premiers profils arrivent bientôt. {rep ? `${rep.split(' ')[0]} vous préviendra par email.` : ''}</div>
        )}
        {!isMobile && cards.length > 0 && <p style={{ fontSize: FS.base, color: FAINT, marginTop: 10 }}>Cliquez sur un profil pour ouvrir son dossier, glissez une carte pour la faire avancer.</p>}
      </div>

      {/* BOARD (ordinateur) / LISTE (mobile) */}
      {isMobile ? (
        <MobileList data={data} onOpen={openCard} />
      ) : (
        <main className="pm-scroll" style={{ overflowX: 'auto', padding: '14px 34px 40px' }}>
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
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

      {pendingMove && (
        <MoveDialog
          c={pendingMove.c} to={pendingMove.to} repName={rep} fromDecision={pendingMove.fromDecision}
          onCancel={() => setPendingMove(null)}
          onConfirm={(extra) => { const m = pendingMove; setPendingMove(null); void doMove(m.c, m.to, extra); }}
          onSkip={() => { const m = pendingMove; setPendingMove(null); void decideOnly(m.c, 'RENCONTRER'); }}
        />
      )}

      {toast && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 90, display: 'flex', alignItems: 'center', gap: 14, background: INK, color: '#F4F4EA', fontSize: FS.md, fontWeight: 600, padding: '12px 14px 12px 18px', borderRadius: 12, boxShadow: '0 18px 40px -18px rgba(26,21,51,.6)', maxWidth: 'calc(100vw - 32px)' }}>
          <span>{toast.msg}</span>
          {toast.undo && <button className="pm-btn" onClick={toast.undo} style={{ flexShrink: 0, fontSize: FS.base, fontWeight: 800, color: INK, background: CREAM, border: 'none', borderRadius: 8, padding: '6px 11px', cursor: 'pointer' }}>Annuler</button>}
        </div>
      )}

      {selected && (
        <ProfileDrawer
          key={selected.id}
          candidature={selected}
          stages={data.stages}
          repName={rep}
          tab={drawerTab.tab}
          prefillMention={drawerTab.prefill}
          onTab={(tab) => setDrawerTab({ tab })}
          onClose={() => { setSelectedId(null); void reload(true); }}
          onDecision={(d) => void decide(selected, d)}
          onMove={(to) => requestMove(selected, to)}
        />
      )}
    </div>
  );
}

// ─── BOARD : colonnes + cartes déplaçables ─────────────
function StageColumn({ stage, count, dragging, children }: { stage: Stage; count: number; dragging: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const accent = STAGE_ACCENT[stage];
  const empty = count === 0;
  return (
    <section aria-label={`${STAGE_LABELS[stage]}, ${count} profil${count > 1 ? 's' : ''}`} style={{ flex: empty ? '0 1 170px' : '1 1 250px', minWidth: empty ? 140 : 215, maxWidth: 340, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 9px' }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: accent }} />
        <span style={{ fontWeight: 800, fontSize: FS.md, color: INK }}>{STAGE_LABELS[stage]}</span>
        <span style={{ marginLeft: 'auto', minWidth: 24, textAlign: 'center', fontSize: FS.sm, fontWeight: 800, color: MUTED, background: 'rgba(26,21,51,.06)', borderRadius: 999, padding: '1px 8px' }}>{count}</span>
      </div>
      <div
        ref={setNodeRef}
        style={{
          flex: 1, minHeight: 300, display: 'flex', flexDirection: 'column', gap: 10, padding: 10, borderRadius: 16,
          background: isOver ? STAGE_TINT[stage] : 'rgba(255,255,255,.6)',
          border: `1.5px ${dragging && !isOver ? 'dashed' : 'solid'} ${isOver ? accent : dragging ? 'rgba(26,21,51,.18)' : LINE}`,
          transition: 'background .15s ease, border-color .15s ease',
        }}
      >
        {empty && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: FAINT, fontSize: FS.sm, textAlign: 'center', padding: '0 6px' }}>
            <Inbox size={18} strokeWidth={1.8} aria-hidden />
            {dragging ? 'Déposez le profil ici' : 'Aucun profil'}
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
  const since = daysIn(c);
  const locked = c.stage === 'PLACE';
  const isNew = !c.seen && c.stage !== 'REFUSE';
  return (
    <div
      className={lifted ? undefined : 'pm-card'}
      style={{
        position: 'relative', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 13,
        boxShadow: lifted ? '0 26px 50px -20px rgba(26,21,51,.5)' : '0 1px 2px rgba(26,21,51,.05)',
        transform: lifted ? 'rotate(1.5deg)' : undefined,
        cursor: lifted ? 'grabbing' : locked ? 'pointer' : 'grab',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <Avatar c={c} size={42} radius={12} bg={BRAND} fg={CREAM} fontSize={13} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: FS.md, fontWeight: 800, lineHeight: 1.3, color: INK, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{fullName(c)}</div>
          {c.candidat.posteActuel && <div style={{ fontSize: FS.base, lineHeight: 1.4, color: MUTED, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{c.candidat.posteActuel}</div>}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 11 }}>
        {salary && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%', fontSize: FS.sm, fontWeight: 800, color: BRAND, background: '#F2F3D8', borderRadius: 8, padding: '3px 8px' }}>
            <Banknote size={13} strokeWidth={2.2} aria-hidden style={{ flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{salary}</span>
          </span>
        )}
        {c.hireAnnounced && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: FS.sm, fontWeight: 800, borderRadius: 8, padding: '3px 8px', background: '#E7F3EA', color: '#256238' }}><PartyPopper size={13} aria-hidden />Embauche annoncée</span>}
        {locked && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: FS.sm, fontWeight: 800, borderRadius: 8, padding: '3px 8px', background: '#E7F3EA', color: '#256238' }}><Lock size={12} aria-hidden />Embauche validée</span>}
        {!c.hireAnnounced && !locked && last && <span style={{ fontSize: FS.sm, fontWeight: 800, borderRadius: 8, padding: '3px 8px', background: DECISION_TONE[last].bg, color: DECISION_TONE[last].fg, whiteSpace: 'nowrap' }}>{DECISION_LABEL[last]}</span>}
      </div>
      {(since || nbComments > 0 || isNew) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 9, borderTop: `1px solid ${LINE}`, fontSize: FS.sm, color: FAINT }}>
          {isNew && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 800, color: BRAND }}><span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: BRAND }} />Nouveau</span>}
          {since && <span>{since}</span>}
          {nbComments > 0 && <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700 }}><MessageCircle size={13} strokeWidth={2.2} aria-hidden />{nbComments}<span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}> commentaire{nbComments > 1 ? 's' : ''}</span></span>}
        </div>
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
      style={{ touchAction: 'none', opacity: isDragging ? 0.35 : 1, borderRadius: 14 }}
    >
      <CardBody c={c} />
    </div>
  );
}

// ─── Liste mobile (pas de glisser-déposer au doigt) ────
function MobileList({ data, onOpen }: { data: KanbanResponse; onOpen: (c: Candidature) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(data.stages.map((s) => [s, (data.byStage[s]?.length ?? 0) > 0 && s !== 'REFUSE'])));
  return (
    <main style={{ padding: '14px 16px 36px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.stages.map((s) => {
        const items = data.byStage[s] ?? [];
        const isOpen = !!open[s];
        return (
          <section key={s} style={{ background: 'rgba(255,255,255,.6)', border: `1px solid ${LINE}`, borderRadius: 14 }}>
            <button className="pm-tab" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [s]: !o[s] }))} disabled={items.length === 0} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', background: 'transparent', border: 'none', cursor: items.length ? 'pointer' : 'default', color: INK }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: STAGE_ACCENT[s] }} />
              <span style={{ fontWeight: 800, fontSize: FS.md }}>{STAGE_LABELS[s]}</span>
              <span style={{ fontSize: FS.sm, fontWeight: 800, color: MUTED, background: 'rgba(26,21,51,.06)', borderRadius: 999, padding: '1px 8px' }}>{items.length}</span>
              {items.length > 0 && <ChevronDown size={16} aria-hidden style={{ marginLeft: 'auto', transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .15s ease', color: MUTED }} />}
            </button>
            {isOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 10px 10px' }}>
                {items.map((c) => (
                  <div key={c.id} role="button" tabIndex={0} className="pm-focus" aria-label={`${fullName(c)}. Ouvrir le dossier`} onClick={() => onOpen(c)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(c); } }} style={{ borderRadius: 14 }}>
                    <CardBody c={c} />
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}

// ─── FICHE CANDIDAT : dossier + panneau latéral (Activité / Commentaires) ──
function ProfileDrawer({ candidature: c, stages, repName, tab, prefillMention, onTab, onClose, onDecision, onMove }: {
  candidature: Candidature; stages: Stage[]; repName: string;
  tab: 'activite' | 'commentaires'; prefillMention?: boolean;
  onTab: (t: 'activite' | 'commentaires') => void;
  onClose: () => void;
  onDecision: (d: Decision) => void;
  onMove: (to: Stage) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, onClose);
  const [nbComments, setNbComments] = useState(c._count?.portalComments ?? 0);
  const [activityKey, setActivityKey] = useState(0);
  const last = c.portalDecisions[0]?.decision;
  const locked = c.stage === 'PLACE';
  const profile = c.candidat.aiAnonymizedProfile;
  const bullets: string[] = Array.isArray(profile?.bulletPoints) ? profile.bulletPoints : Array.isArray(profile?.highlights) ? profile.highlights : [];
  // Debrief structuré (optionnel) : infos clés + sections titrées.
  const infos: Array<{ label: string; value: string }> = Array.isArray(profile?.infos) ? profile.infos : [];
  const sections: Array<{ title: string; items: string[] }> = Array.isArray(profile?.sections) ? profile.sections : [];
  useEffect(() => { setActivityKey((k) => k + 1); }, [c.stage, last]);
  // Étape actuelle visible dans la barre d'étapes (défile sur mobile).
  useEffect(() => {
    const chip = ref.current?.querySelector<HTMLElement>('[aria-current="step"]');
    const bar = chip?.parentElement;
    if (chip && bar) bar.scrollLeft = chip.offsetLeft - (bar.clientWidth - chip.clientWidth) / 2;
  }, [c.stage]);

  const decisionBtn = (d: Decision, icon: React.ReactNode, label: string, tone: { bg: string; fg: string }) => (
    <button className="pm-btn" onClick={() => onDecision(d)} aria-pressed={last === d} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', borderRadius: 12, border: `1.5px solid ${last === d ? tone.fg : 'transparent'}`, background: tone.bg, color: tone.fg, cursor: 'pointer', fontWeight: 800, fontSize: FS.sm }}>{icon}{label}</button>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(26,21,51,.42)' }} />
      <aside ref={ref} role="dialog" aria-modal="true" aria-label={`Dossier de ${fullName(c)}`} className="pm-drawer" style={{ position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 61, width: 1000, maxWidth: '96vw', background: '#FCFCF7', boxShadow: '-26px 0 70px -30px rgba(26,21,51,.55)', display: 'flex', flexDirection: 'column' }}>
        {/* En-tête */}
        <div style={{ flexShrink: 0, background: BRAND, padding: '18px 20px 14px', position: 'relative', overflow: 'hidden' }}>
          <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(230,233,175,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(230,233,175,.05) 1px,transparent 1px)', backgroundSize: '36px 36px' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar c={c} size={56} radius={16} bg={CREAM} fg={BRAND} fontSize={18} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 style={{ fontWeight: 800, fontSize: FS.xl, color: '#fff', lineHeight: 1.2 }}>{fullName(c)}</h2>
              {(c.candidat.posteActuel || c.candidat.entrepriseActuelle) && <div style={{ fontSize: FS.base, color: CREAM, fontWeight: 600, marginTop: 3 }}>{[c.candidat.posteActuel, c.candidat.entrepriseActuelle].filter(Boolean).join(' · ')}</div>}
            </div>
            <button className="pm-btn" data-autofocus onClick={onClose} aria-label="Fermer le dossier" style={{ alignSelf: 'flex-start', width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(230,233,175,.3)', background: 'transparent', color: CREAM, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} strokeWidth={2.4} /></button>
          </div>
          {/* Étapes : cliquer pour faire avancer (alternative au glisser-déposer) */}
          <div role="group" aria-label="Étape du recrutement" className="pm-scroll" style={{ position: 'relative', display: 'flex', gap: 6, marginTop: 14, overflowX: 'auto', paddingBottom: 2 }}>
            {stages.map((s) => {
              const on = c.stage === s;
              return (
                <button key={s} className="pm-chip" disabled={locked || on} aria-current={on ? 'step' : undefined} onClick={() => onMove(s)}
                  aria-label={on ? `${STAGE_LABELS[s]}, étape actuelle` : locked ? STAGE_LABELS[s] : `Passer en « ${STAGE_LABELS[s]} »`}
                  title={locked ? 'Embauche validée' : on ? 'Étape actuelle' : `Passer en « ${STAGE_LABELS[s]} »`}
                  style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: FS.sm, fontWeight: 800, padding: '6px 11px', borderRadius: 999, cursor: locked || on ? 'default' : 'pointer', border: `1px solid ${on ? CREAM : 'rgba(230,233,175,.28)'}`, background: on ? CREAM : 'transparent', color: on ? BRAND : CREAM, opacity: locked && !on ? 0.5 : 1 }}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: on ? STAGE_ACCENT[s] : 'rgba(230,233,175,.6)' }} />{STAGE_LABELS[s]}
                </button>
              );
            })}
          </div>
          {locked && <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: FS.sm, color: CREAM }}><Lock size={13} aria-hidden />Embauche validée : contactez {repName || 'votre consultant'} pour toute modification.</div>}
          {c.hireAnnounced && <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: FS.sm, color: CREAM }}><PartyPopper size={13} aria-hidden />Embauche annoncée : {repName || 'votre consultant'} finalise avec vous.</div>}
        </div>

        <div className="pm-drawer-body" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px' }}>
          {/* Dossier */}
          <div className="pm-drawer-main pm-scroll" style={{ minHeight: 0, overflowY: 'auto', padding: '22px 24px 28px' }}>
            {/* AVIS — en premier : c'est l'action attendue */}
            {c.stage !== 'PLACE' && c.stage !== 'REFUSE' && (
              <div style={{ marginBottom: 24, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <div style={LABEL}>Votre avis</div>
                  {last && <span style={{ fontSize: FS.sm, color: MUTED }}>Actuel : <strong style={{ color: DECISION_TONE[last].fg }}>{DECISION_LABEL[last]}</strong></span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 10 }}>
                  {decisionBtn('RENCONTRER', <Check size={17} aria-hidden />, 'Rencontrer', DECISION_TONE.RENCONTRER)}
                  {decisionBtn('A_DISCUTER', <MessageSquare size={17} aria-hidden />, 'À discuter', DECISION_TONE.A_DISCUTER)}
                  {decisionBtn('ECARTER', <X size={17} aria-hidden />, 'Écarter', DECISION_TONE.ECARTER)}
                </div>
                <p style={{ fontSize: FS.sm, color: FAINT, marginTop: 10, lineHeight: 1.5 }}>
                  {c.stage === 'ENVOYE_CLIENT' ? 'Rencontrer : vous planifiez le Case. ' : ''}Écarter : le profil passe en « Perdu ». À discuter : écrivez à {repName || 'votre consultant'}.
                </p>
              </div>
            )}

            {c.candidat.aiPitchShort && (
              <>
                <div style={LABEL}>Synthèse</div>
                <p style={{ fontSize: FS.md, lineHeight: 1.65, color: TEXT, marginTop: 8 }}>{c.candidat.aiPitchShort}</p>
              </>
            )}
            {infos.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8, marginTop: 18 }}>
                {infos.map((it, i) => (
                  <div key={i} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 12px' }}>
                    <div style={{ ...LABEL, letterSpacing: '.08em' }}>{it.label}</div>
                    <div style={{ fontSize: FS.base, fontWeight: 700, color: INK, marginTop: 3, lineHeight: 1.4 }}>{it.value}</div>
                  </div>
                ))}
              </div>
            )}
            {bullets.length > 0 && (sections.length > 0 || infos.length > 0) && <div style={{ ...LABEL, marginTop: 24 }}>Adéquation au poste</div>}
            {bullets.length > 0 && (
              <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {bullets.slice(0, 8).map((b, i) => (
                  <li key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <span aria-hidden style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 6, background: '#F2F3D8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}><Check size={11} color={BRAND} strokeWidth={2.6} /></span>
                    <span style={{ fontSize: FS.base, lineHeight: 1.55, color: TEXT }}>{b}</span>
                  </li>
                ))}
              </ul>
            )}
            {sections.map((sec, i) => (
              <div key={i} style={{ marginTop: 24 }}>
                <div style={LABEL}>{sec.title}</div>
                <ul style={{ margin: '9px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sec.items.map((it, j) => <li key={j} style={{ fontSize: FS.base, lineHeight: 1.55, color: TEXT }}>{it}</li>)}
                </ul>
              </div>
            ))}
            {!c.candidat.aiPitchShort && bullets.length === 0 && sections.length === 0 && <p style={{ fontSize: FS.md, color: MUTED }}>Le dossier détaillé sera disponible sous peu.</p>}
          </div>

          {/* Panneau latéral : Activité / Commentaires */}
          <div className="pm-drawer-side" style={{ minHeight: 0, display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${LINE}`, background: '#F7F6F0' }}>
            <div role="tablist" aria-label="Suivi du profil" style={{ flexShrink: 0, display: 'flex', gap: 6, padding: '12px 16px', borderBottom: `1px solid ${LINE}`, background: '#FCFCF7' }}>
              {([['activite', 'Activité'], ['commentaires', 'Commentaires']] as const).map(([k, label]) => {
                const on = tab === k;
                return (
                  <button key={k} role="tab" aria-selected={on} className="pm-tab" onClick={() => onTab(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: FS.md, fontWeight: on ? 800 : 600, padding: '7px 13px', borderRadius: 9, border: 'none', cursor: 'pointer', background: on ? '#EDEBFA' : 'transparent', color: on ? BRAND : MUTED }}>
                    {label}
                    {k === 'commentaires' && nbComments > 0 && <span style={{ fontSize: FS.xs, fontWeight: 800, borderRadius: 99, padding: '1px 7px', background: on ? '#fff' : 'rgba(26,21,51,.07)', color: on ? BRAND : MUTED }}>{nbComments}</span>}
                  </button>
                );
              })}
            </div>
            <div role="tabpanel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {tab === 'activite'
                ? <ActivityFeed key={activityKey} candidatureId={c.id} />
                : <CommentThread candidatureId={c.id} repName={repName} prefillMention={prefillMention} onCount={setNbComments} onPosted={() => setActivityKey((k) => k + 1)} />}
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
    const s = { size: 14, strokeWidth: 2.3, 'aria-hidden': true } as const;
    if (it.kind === 'COMMENT') return { el: <MessageCircle {...s} />, bg: '#EDEBFA', fg: BRAND };
    if (it.kind === 'DECISION') return { el: <Check {...s} />, bg: '#E6F2E9', fg: '#256238' };
    if (it.kind === 'INTERVIEW') return { el: <CalendarClock {...s} />, bg: '#FCF1E4', fg: '#9A5A12' };
    if (it.kind === 'STAGE' && it.text.includes('présenté')) return { el: <Sparkles {...s} />, bg: '#EAF1FC', fg: '#1F58B8' };
    const st = it.stage && STAGE_ACCENT[it.stage] ? it.stage : 'ENVOYE_CLIENT';
    return { el: <ArrowRight {...s} />, bg: STAGE_TINT[st], fg: STAGE_ACCENT[st] };
  };

  if (!items) return <div style={{ padding: 20, fontSize: FS.base, color: FAINT }}>Chargement…</div>;
  if (items.length === 0) return <div style={{ padding: 20, fontSize: FS.base, color: FAINT }}>Pas encore d’activité sur ce profil.</div>;
  return (
    <ol className="pm-scroll pm-thread-list" style={{ listStyle: 'none', margin: 0, flex: 1, overflowY: 'auto', padding: '18px 18px 24px' }}>
      {items.map((it, i) => {
        const ic = icon(it);
        const lastItem = i === items.length - 1;
        const upcoming = it.kind === 'INTERVIEW' && new Date(it.at) > new Date();
        return (
          <li key={i} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: lastItem ? 0 : 18 }}>
            {!lastItem && <span aria-hidden style={{ position: 'absolute', left: 14, top: 30, bottom: 2, width: 2, background: 'rgba(26,21,51,.08)', borderRadius: 2 }} />}
            <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 10, background: ic.bg, color: ic.fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ic.el}</span>
            <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
              <div style={{ fontSize: FS.base, lineHeight: 1.45, color: TEXT }}>
                {it.actor && <strong style={{ color: INK }}>{it.actor} </strong>}{it.text}
                {it.kind === 'INTERVIEW' && <strong style={{ color: INK }}> · {fmtInterview(it.at)}</strong>}
              </div>
              {it.detail && <div style={{ fontSize: FS.base, lineHeight: 1.5, color: MUTED, marginTop: 5, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '7px 10px' }}>{it.detail}</div>}
              <div style={{ fontSize: FS.sm, color: FAINT, marginTop: 4 }}>{upcoming ? 'À venir' : relTime(it.at)}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Précision demandée avant certains déplacements ─────
function MoveDialog({ c, to, repName, fromDecision, onCancel, onConfirm, onSkip }: {
  c: Candidature; to: Stage; repName: string; fromDecision?: boolean;
  onCancel: () => void;
  onConfirm: (extra: MoveExtra) => void;
  onSkip: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onCancel);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [who, setWho] = useState('');
  const ok = to === 'REFUSE' ? reason.trim().length > 0 : to === 'ENTRETIEN_CLIENT' ? !!date && who.trim().length > 0 : true;
  const field: React.CSSProperties = { width: '100%', marginTop: 6, fontSize: FS.md, padding: '11px 13px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,.18)', background: '#fff', outline: 'none', fontFamily: "'Manrope',sans-serif", color: INK };
  const label: React.CSSProperties = { fontSize: FS.sm, fontWeight: 800, color: MUTED, marginTop: 14, display: 'block' };
  const title = to === 'REFUSE' ? `Écarter ${fullName(c)} ?` : to === 'PLACE' ? `Annoncer l'embauche de ${fullName(c)} ?` : `Planifier le Case avec ${fullName(c)}`;
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(26,21,51,.42)' }} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="pm-move-title" style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 71, width: 440, maxWidth: 'calc(100vw - 32px)', background: '#FCFCF5', borderRadius: 18, padding: 24, boxShadow: '0 30px 80px -30px rgba(26,21,51,.6)', fontFamily: "'Manrope',sans-serif" }}>
        <h3 id="pm-move-title" style={{ fontFamily: DISPLAY, fontSize: FS.lg + 2, color: INK, letterSpacing: '-.01em', lineHeight: 1.25 }}>{title}</h3>
        {to === 'REFUSE' && (
          <>
            <p style={{ fontSize: FS.base, color: MUTED, marginTop: 8 }}>Le profil passe en « Perdu ». {repName || 'Votre consultant'} en tient compte pour la suite du sourcing.</p>
            <label htmlFor="pm-reason" style={label}>Pourquoi ?</label>
            <textarea id="pm-reason" data-autofocus value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex. : expérience trop éloignée des grands comptes…" style={{ ...field, minHeight: 84, resize: 'vertical' }} />
          </>
        )}
        {to === 'ENTRETIEN_CLIENT' && (
          <>
            <label htmlFor="pm-date" style={label}>Date et heure de l'entretien</label>
            <input id="pm-date" data-autofocus type="datetime-local" value={date} onChange={e => setDate(e.target.value)} style={field} />
            <label htmlFor="pm-who" style={label}>Avec qui chez vous ?</label>
            <input id="pm-who" value={who} onChange={e => setWho(e.target.value)} placeholder="Prénom Nom, fonction" style={field} />
          </>
        )}
        {to === 'PLACE' && (
          <p style={{ fontSize: FS.md, lineHeight: 1.6, color: TEXT, marginTop: 12 }}>
            {repName || 'Votre consultant'} est prévenu(e) immédiatement et finalise l'embauche avec vous (date de démarrage, contrat). La carte passera en « Engagé » dès validation.
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="pm-btn" onClick={onCancel} style={{ flex: 1, fontSize: FS.md, fontWeight: 700, background: 'transparent', color: MUTED, border: '1.5px solid rgba(34,23,122,.18)', borderRadius: 11, padding: 11, cursor: 'pointer' }}>Annuler</button>
          <button
            className="pm-btn"
            disabled={!ok}
            onClick={() => onConfirm(to === 'REFUSE' ? { reason: reason.trim() } : to === 'ENTRETIEN_CLIENT' ? { dateEntretienClient: new Date(date).toISOString(), interlocuteurClient: who.trim() } : {})}
            style={{ flex: 1, fontSize: FS.md, fontWeight: 800, background: ok ? BRAND : '#C4C1D0', color: CREAM, border: 'none', borderRadius: 11, padding: 11, cursor: ok ? 'pointer' : 'default' }}
          >{to === 'REFUSE' ? 'Écarter' : to === 'PLACE' ? 'Annoncer' : 'Planifier'}</button>
        </div>
        {to === 'ENTRETIEN_CLIENT' && fromDecision && (
          <button className="pm-btn" onClick={onSkip} style={{ width: '100%', marginTop: 10, fontSize: FS.base, fontWeight: 700, background: 'transparent', color: BRAND, border: 'none', padding: 8, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Pas encore de date : {repName ? repName.split(' ')[0] : 'mon consultant'} organise la rencontre
          </button>
        )}
      </div>
    </>
  );
}

// ─── Onglet Commentaires (avec @mentions) ──────────────
type Mentionable = { key: string; label: string; sub: string; mention: { kind: 'internal'; id: string } | { kind: 'external'; email: string; name?: string } };
interface PortalCommentRow { id: string; content: string; createdAt: string; author: string; mentions: Array<{ name: string; kind: string }> }

function CommentThread({ candidatureId, repName, prefillMention, onCount, onPosted }: { candidatureId: string; repName: string; prefillMention?: boolean; onCount: (n: number) => void; onPosted: () => void }) {
  const [rows, setRows] = useState<PortalCommentRow[] | null>(null);
  const [people, setPeople] = useState<Mentionable[]>([]);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Mentionable[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ta = useRef<HTMLTextAreaElement>(null);
  const listEnd = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await portalFetch(`/candidatures/${candidatureId}/comments`);
    const list: PortalCommentRow[] = res.ok ? await res.json() : [];
    setRows(list);
    onCount(list.length);
    window.setTimeout(() => listEnd.current?.scrollIntoView({ block: 'nearest' }), 0);
  }
  useEffect(() => {
    void load();
    void (async () => {
      const res = await portalFetch('/mentionables');
      if (!res.ok) return;
      const m = await res.json() as { internal: Array<{ id: string; name: string; role: string }>; external: Array<{ email: string; name: string }> };
      const list: Mentionable[] = [
        ...m.internal.map((u) => ({ key: u.id, label: u.name, sub: `HumanUp · ${u.role}`, mention: { kind: 'internal' as const, id: u.id } })),
        ...m.external.map((x) => ({ key: x.email, label: x.name, sub: x.email, mention: { kind: 'external' as const, email: x.email, name: x.name } })),
      ];
      setPeople(list);
      // « À discuter » : on prépare le message pour le consultant.
      const consultant = list.find((p) => p.label === repName) ?? list.find((p) => p.mention.kind === 'internal');
      if (prefillMention && consultant) {
        const v = `@${consultant.label} `;
        setText(v); setPicked([consultant]);
        window.setTimeout(() => { ta.current?.focus(); ta.current?.setSelectionRange(v.length, v.length); }, 0);
      }
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
      ? <span key={i} style={{ color: BRAND, fontWeight: 800, background: '#F2F3D8', borderRadius: 5, padding: '0 3px' }}>{part}</span>
      : <span key={i}>{part}</span>);
  };

  return (
    <>
      <div className="pm-scroll pm-thread-list" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows === null && <p style={{ fontSize: FS.base, color: FAINT }}>Chargement…</p>}
        {rows?.length === 0 && (
          <div style={{ margin: 'auto 0', textAlign: 'center', color: FAINT, fontSize: FS.base, lineHeight: 1.6, padding: '24px 8px' }}>
            <MessageCircle size={22} strokeWidth={1.8} aria-hidden style={{ display: 'block', margin: '0 auto 8px' }} />
            Aucun commentaire pour l’instant.<br />Tapez <strong style={{ color: MUTED }}>@</strong> pour identifier {repName || 'votre consultant'} ou un collègue.
          </div>
        )}
        {rows?.map((r) => (
          <div key={r.id} style={{ display: 'flex', gap: 10 }}>
            <span aria-hidden style={{ flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: BRAND, color: CREAM, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: FS.xs, fontWeight: 800 }}>{initialsOf(r.author)}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: FS.base, fontWeight: 800, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.author}</span>
                <span style={{ fontSize: FS.sm, color: FAINT, whiteSpace: 'nowrap' }}>{relTime(r.createdAt)}</span>
              </div>
              <div style={{ fontSize: FS.base, lineHeight: 1.55, color: TEXT, marginTop: 4, whiteSpace: 'pre-wrap', background: '#fff', border: `1px solid ${LINE}`, borderRadius: '4px 12px 12px 12px', padding: '8px 11px' }}>{renderContent(r.content, r.mentions)}</div>
            </div>
          </div>
        ))}
        <div ref={listEnd} />
      </div>

      <div style={{ flexShrink: 0, padding: '12px 16px 16px', borderTop: `1px solid ${LINE}`, background: '#FCFCF7' }}>
        <div style={{ position: 'relative' }}>
          <label htmlFor="pm-comment" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Écrire un commentaire</label>
          <textarea
            id="pm-comment" ref={ta} value={text}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query !== null) { setQuery(null); e.stopPropagation(); }
              if (e.key === 'Enter' && suggestions.length > 0 && query !== null) { e.preventDefault(); pick(suggestions[0]); return; }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
            }}
            placeholder="Écrire un commentaire… (@ pour identifier quelqu’un)"
            style={{ width: '100%', minHeight: 76, resize: 'vertical', fontFamily: "'Manrope',sans-serif", fontSize: FS.md, lineHeight: 1.5, padding: '11px 13px', borderRadius: 12, border: '1.5px solid rgba(34,23,122,.18)', background: '#fff', outline: 'none', color: INK }}
          />
          {query !== null && suggestions.length > 0 && (
            <div role="listbox" aria-label="Personnes à identifier" style={{ position: 'absolute', left: 0, right: 0, bottom: '100%', marginBottom: 6, background: '#fff', border: '1px solid rgba(34,23,122,.14)', borderRadius: 12, boxShadow: '0 18px 40px -20px rgba(26,21,51,.45)', overflow: 'hidden', zIndex: 5 }}>
              {suggestions.map((p) => (
                <button key={p.key} role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); pick(p); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(34,23,122,.06)', cursor: 'pointer' }}>
                  <span aria-hidden style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: p.mention.kind === 'internal' ? BRAND : '#F2F3D8', color: p.mention.kind === 'internal' ? CREAM : BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: FS.xs, fontWeight: 800 }}>{initialsOf(p.label)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: FS.base, fontWeight: 700, color: INK }}>{p.label}</span>
                    <span style={{ display: 'block', fontSize: FS.sm, color: FAINT }}>{p.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {error && <p role="alert" style={{ fontSize: FS.sm, color: '#9E2F1A', fontWeight: 700, marginTop: 8 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="pm-btn" onClick={startMention} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: FS.base, fontWeight: 700, background: '#F2F3D8', color: BRAND, border: 'none', borderRadius: 11, padding: '0 14px', cursor: 'pointer' }}><AtSign size={14} aria-hidden />Identifier</button>
          <button className="pm-btn" disabled={busy || !text.trim()} onClick={send} style={{ flex: 1, fontSize: FS.md, fontWeight: 800, background: text.trim() ? BRAND : '#C4C1D0', color: CREAM, border: 'none', borderRadius: 11, padding: 11, cursor: text.trim() ? 'pointer' : 'default' }}>Envoyer</button>
        </div>
        <p style={{ fontSize: FS.sm, color: FAINT, marginTop: 8, lineHeight: 1.5 }}>Les personnes identifiées reçoivent votre commentaire par email.</p>
      </div>
    </>
  );
}
