/**
 * Portail client : éléments partagés (charte, libellés des colonnes, appels API,
 * avatars et barre de navigation (Candidatures / Offres d'emploi / Candidats + cloche).
 * Même DA que l'espace candidat : Inter, fond gris clair, cartes blanches,
 * indigo pour l'action, vert pâle pour ce qui demande l'attention.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bell, ChevronDown, LogOut, Columns3, Briefcase, Users } from 'lucide-react';
import { portalStore } from './portal-store';

// ── Charte (contrastes ≥ 4,5:1 sur le fond) ──
export const INK = '#111827';
export const TEXT = '#374151';
export const MUTED = '#4B5563';
export const FAINT = '#4B5563';
export const LINE = '#E5E7EB';
export const SOFT = '#F3F4F6';
export const BRAND = '#22177A';
export const CREAM = '#E6E9AF';
export const BG = '#F7F7F8';
export const FS = { xs: 12, sm: 13, base: 14, md: 14, lg: 17, xl: 20, xxl: 26 } as const;
export const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const DISPLAY = FONT;
export const LABEL: React.CSSProperties = { fontSize: FS.sm, fontWeight: 600, color: MUTED };
export const CARD: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14 };
export const BTN: React.CSSProperties = { fontFamily: FONT, fontSize: 14, fontWeight: 600, background: BRAND, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', cursor: 'pointer' };
export const BTN_GHOST: React.CSSProperties = { ...BTN, background: '#fff', color: TEXT, border: '1px solid #D1D5DB' };
export const LOGO = 'https://humanup.io/careers/logo.png';

// ── Colonnes du portail ──
export type Col = 'INBOX' | 'SCREENING' | 'CASE' | 'CULTURE_FIT' | 'OFFRE' | 'ENGAGE' | 'PERDU';
export const COL_LABELS: Record<Col, string> = {
  INBOX: 'Inbox', SCREENING: 'Screening', CASE: 'Case', CULTURE_FIT: 'Culture Fit', OFFRE: 'Offre', ENGAGE: 'Engagé', PERDU: 'Perdu',
};
export const COL_HINT: Record<Col, string> = {
  INBOX: 'Profils présentés par Humanup', SCREENING: 'Premier échange avec vous', CASE: 'Étude de cas', CULTURE_FIT: 'Rencontre avec l’équipe',
  OFFRE: 'Proposition en cours', ENGAGE: 'Recrutement signé', PERDU: 'Profils écartés',
};
export const COL_ORDER: Col[] = ['INBOX', 'SCREENING', 'CASE', 'CULTURE_FIT', 'OFFRE', 'ENGAGE', 'PERDU'];

export type Decision = 'RENCONTRER' | 'A_DISCUTER' | 'ECARTER';
export const DECISION_LABEL: Record<Decision, string> = { RENCONTRER: 'À rencontrer', A_DISCUTER: 'À discuter', ECARTER: 'Écarté' };

// Pastille neutre (étape, avis) : une seule couleur, le libellé porte le sens.
export function Pill({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: FS.sm, fontWeight: 600, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap', background: strong ? CREAM : SOFT, color: strong ? BRAND : TEXT }}>{children}</span>;
}

// ── API ──
export function portalFetch(path: string, init?: RequestInit) {
  const token = portalStore.get('portal_token');
  return fetch(`/api/v1/portal${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers as Record<string, string> | undefined) } });
}
// Dernière offre consultée (lien « Candidatures » de la barre).
export const lastMandat = {
  get: () => portalStore.get('portal_last_mandat') || portalStore.get('portal_mandat_id') || '',
  set: (id: string) => portalStore.set('portal_last_mandat', id),
};

// Page de connexion, en gardant le profil et l'action demandés (liens des emails : ?c=…&a=…).
export function loginUrl(mandatId?: string | null, expired = false) {
  const here = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const q = new URLSearchParams();
  const m = mandatId || lastMandat.get();
  if (m) q.set('m', m);
  if (expired) q.set('expired', '1');
  for (const k of ['c', 'a', 't']) { const v = here.get(k); if (v) q.set(k, v); }
  const qs = q.toString();
  return `/portail/login${qs ? `?${qs}` : ''}`;
}

// ── Petits utilitaires ──
export function initialsOf(name: string) { return name.split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }
export function relTime(iso: string | Date) {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min >= 0 && min < 1) return 'à l’instant';
  if (min >= 0 && min < 60) return `il y a ${min} min`;
  if (min >= 0 && min < 60 * 24) return `il y a ${Math.round(min / 60)} h`;
  if (min >= 0 && min < 60 * 24 * 7) return `il y a ${Math.round(min / 1440)} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}
export function useIsMobile(max = 760) {
  const q = `(max-width: ${max}px)`;
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}
export function useInterFont() {
  useEffect(() => {
    if (document.getElementById('espace-inter')) return;
    const l = document.createElement('link');
    l.id = 'espace-inter';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }, []);
}

// Logo de l'entreprise, sinon première lettre du texte.
export function CompanyLogo({ logo, text, size }: { logo?: string | null; text: string; size: number }) {
  const [broken, setBroken] = useState(false);
  const box: React.CSSProperties = { flexShrink: 0, width: size, height: size, borderRadius: Math.round(size * 0.26), overflow: 'hidden', background: '#fff', border: `1px solid ${LINE}` };
  if (logo && !broken) return <img src={logo} alt="" onError={() => setBroken(true)} style={{ ...box, objectFit: 'contain', display: 'block', padding: Math.round(size * 0.12) }} />;
  return <span aria-hidden style={{ ...box, color: BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: Math.round(size * 0.4) }}>{text.trim()[0]?.toUpperCase()}</span>;
}

// Photo (candidat ou membre Humanup), sinon initiales sur vert pâle. `ring` = liseré vert pâle (équipe Humanup).
export function PersonAvatar({ name, photo, size, radius = '50%', bg = CREAM, fg = BRAND, ring }: { name: string; photo?: string | null; size: number; radius?: number | string; bg?: string; fg?: string; ring?: boolean }) {
  const [broken, setBroken] = useState(false);
  const box: React.CSSProperties = { flexShrink: 0, width: size, height: size, borderRadius: radius, overflow: 'hidden', boxSizing: 'border-box', ...(ring ? { border: `3px solid ${CREAM}` } : {}) };
  if (photo && !broken) return <img src={photo} alt="" onError={() => setBroken(true)} style={{ ...box, objectFit: 'cover', display: 'block' }} />;
  return <span aria-hidden style={{ ...box, background: ring ? BRAND : bg, color: ring ? CREAM : fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: Math.max(10, Math.round(size * 0.36)) }}>{initialsOf(name)}</span>;
}

export const SHARED_CSS = `
  .pm-page{ font-size:15px; line-height:1.55; color:${TEXT}; }
  .pm-page h1, .pm-page h2, .pm-page h3, .pm-page p{ margin:0; }
  .pm-page h1, .pm-page h2, .pm-page h3{ font-family:inherit; font-weight:700; }
  .pm-page ul{ list-style:disc; }
  .pm-focus:focus{ outline:none; }
  .pm-page button:focus-visible, .pm-page a:focus-visible, .pm-page input:focus-visible, .pm-page textarea:focus-visible, .pm-page select:focus-visible, .pm-focus:focus-visible{ outline:2px solid #6366F1; outline-offset:2px; }
  .pm-btn{ transition:background .15s ease, border-color .15s ease; }
  .pm-chip{ transition:background .15s ease, border-color .15s ease; }
  .pm-nav{ transition:color .15s ease; }
  .pm-nav:hover{ color:${BRAND} !important; }
  .pm-icon{ transition:background .15s ease; }
  .pm-icon:hover{ background:${SOFT}; }
  .pm-row{ transition:background .12s ease; }
  .pm-row:hover{ background:#FAFAFB; }
  .pm-scroll::-webkit-scrollbar{ height:8px; width:8px; }
  .pm-scroll::-webkit-scrollbar-thumb{ background:#D1D5DB; border-radius:99px; }
  @media (max-width: 760px){ .pm-hide-sm{ display:none !important; } .pm-page{ padding-bottom:72px; } }
`;

// ── Barre de navigation ──
type Tab = 'candidatures' | 'offres' | 'candidats';
interface Me { email: string; name: string; entreprise: string | null; homeMandatId: string }

export function PortalTopBar({ active, mandatId }: { active: Tab; mandatId?: string }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  useInterFont();
  const [me, setMe] = useState<Me | null>(null);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    // Sans jeton, la page elle-même renvoie vers la connexion (en gardant le lien demandé).
    if (!portalStore.get('portal_token')) return;
    void portalFetch('/me').then(async (r) => {
      if (r.status === 401) { const to = loginUrl(mandatId, true); portalStore.clear(); navigate(to); return; }
      if (r.ok) setMe(await r.json());
    });
  }, [navigate, mandatId]);
  const candidaturesHref = `/portail/mandat/${mandatId || lastMandat.get() || me?.homeMandatId || ''}`;
  const items: Array<[Tab, string, string, React.ReactNode]> = [
    ['candidatures', 'Candidatures', candidaturesHref, <Columns3 size={20} aria-hidden />],
    ['offres', 'Offres d’emploi', '/portail/offres', <Briefcase size={20} aria-hidden />],
    ['candidats', 'Candidats', '/portail/candidats', <Users size={20} aria-hidden />],
  ];
  function logout() { const m = lastMandat.get(); portalStore.clear(); navigate(`/portail/login${m ? `?m=${m}` : ''}`); }

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, minHeight: 64, padding: isMobile ? '0 16px' : '0 32px', background: '#fff', borderBottom: `1px solid ${LINE}`, fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28, minWidth: 0 }}>
        <Link to="/portail/offres" aria-label="Humanup, accueil" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', minWidth: 0 }}>
          <img src={LOGO} alt="" style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0 }} />
          <span style={{ fontWeight: 700, color: INK, fontSize: 16 }}>Humanup</span>
          <span style={{ color: MUTED, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isMobile ? (me?.entreprise ? `· ${me.entreprise}` : '') : `Espace client${me?.entreprise ? ` · ${me.entreprise}` : ''}`}</span>
        </Link>
        <nav aria-label="Navigation principale" className="pm-hide-sm" style={{ display: 'flex', gap: 4, fontSize: 14, fontWeight: 600 }}>
          {items.map(([key, label, href]) => {
            const on = active === key;
            return (
              <Link key={key} to={href} className="pm-nav" aria-current={on ? 'page' : undefined}
                style={{ color: on ? BRAND : MUTED, textDecoration: 'none', padding: '21px 10px 19px', borderBottom: `2px solid ${on ? BRAND : 'transparent'}`, whiteSpace: 'nowrap' }}>
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      {/* Mobile : barre d'onglets en bas de l'écran */}
      {isMobile && (
        <nav aria-label="Navigation principale" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 45, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', background: '#fff', borderTop: `1px solid ${LINE}`, paddingBottom: 'env(safe-area-inset-bottom)', fontSize: 12, fontWeight: 600 }}>
          {items.map(([key, label, href, icon]) => {
            const on = active === key;
            return (
              <Link key={key} to={href} aria-current={on ? 'page' : undefined}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '10px 0', color: on ? BRAND : MUTED, textDecoration: 'none' }}>
                {icon}{label === 'Offres d’emploi' ? 'Offres' : label}
              </Link>
            );
          })}
        </nav>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14, fontSize: 14, flexShrink: 0 }}>
        <NotificationsBell />
        <div style={{ position: 'relative' }}>
          <button className="pm-icon" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu} aria-label={isMobile ? 'Mon compte' : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'transparent', borderRadius: 10, padding: '4px 6px', cursor: 'pointer', color: MUTED, fontFamily: FONT, fontSize: 14 }}>
            {!isMobile && <span style={{ maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me?.name ?? ''}</span>}
            <PersonAvatar name={me?.name || '?'} size={32} />
            <ChevronDown size={15} aria-hidden />
          </button>
          {menu && (
            <>
              <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
              <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 51, width: 240, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, boxShadow: '0 12px 32px -12px rgba(17,24,39,.25)', padding: 6 }}>
                <div style={{ padding: '8px 10px 10px', borderBottom: `1px solid ${LINE}`, marginBottom: 4 }}>
                  <div style={{ fontSize: FS.base, fontWeight: 600, color: INK }}>{me?.name}</div>
                  <div style={{ fontSize: FS.sm, color: MUTED, marginTop: 2 }}>{me?.email}</div>
                  {me?.entreprise && <div style={{ fontSize: FS.sm, color: MUTED, marginTop: 2 }}>{me.entreprise}</div>}
                </div>
                <button role="menuitem" onClick={logout} className="pm-icon" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: FS.base, fontWeight: 600, color: INK, background: 'transparent', border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', textAlign: 'left' }}>
                  <LogOut size={15} aria-hidden />Déconnexion
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Cloche ──
interface Notif { id: string; kind: 'NEW' | 'STAGE' | 'COMMENT' | 'MENTION'; at: string; title: string; body: string; who?: string | null; mandatId: string; candidatureId: string | null; photo: string | null; unread: boolean }

export function NotificationsBell() {
  const navigate = useNavigate();
  const [data, setData] = useState<{ unread: number; items: Notif[] } | null>(null);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  async function load() {
    const r = await portalFetch('/notifications');
    if (r.ok) setData(await r.json());
  }
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (!open) return;
    // À l'ouverture : tout est lu (les points restent visibles jusqu'à la fermeture).
    const t = window.setTimeout(() => { void portalFetch('/notifications/seen', { method: 'POST', body: '{}' }); }, 800);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  function close() { setOpen(false); setData((d) => (d ? { unread: 0, items: d.items.map((i) => ({ ...i, unread: false })) } : d)); }
  function go(n: Notif) {
    close();
    navigate(`/portail/mandat/${n.mandatId}${n.candidatureId ? `?c=${n.candidatureId}${n.kind === 'COMMENT' || n.kind === 'MENTION' ? '&t=commentaires' : ''}` : ''}`);
  }
  const unread = data?.unread ?? 0;

  return (
    <div style={{ position: 'relative' }}>
      <button className="pm-icon" onClick={() => (open ? close() : setOpen(true))} aria-haspopup="dialog" aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} nouvelle${unread > 1 ? 's' : ''}` : 'Notifications'}
        style={{ position: 'relative', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${LINE}`, background: open ? SOFT : '#fff', borderRadius: 10, cursor: 'pointer', color: TEXT }}>
        <Bell size={18} aria-hidden />
        {unread > 0 && <span aria-hidden style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, background: BRAND, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', boxSizing: 'border-box' }}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div ref={panel} role="dialog" aria-label="Notifications" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 51, width: 400, maxWidth: 'calc(100vw - 24px)', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, boxShadow: '0 16px 40px -16px rgba(17,24,39,.3)', overflow: 'hidden', fontFamily: FONT }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: INK }}>Notifications</span>
              {unread > 0 && <span style={{ fontSize: FS.sm, color: MUTED }}>{unread} nouvelle{unread > 1 ? 's' : ''}</span>}
            </div>
            <div className="pm-scroll" style={{ maxHeight: 440, overflowY: 'auto' }}>
              {!data && <p style={{ padding: '16px 20px', fontSize: FS.base, color: MUTED }}>Chargement…</p>}
              {data?.items.length === 0 && <p style={{ padding: '24px 20px', fontSize: FS.base, color: MUTED }}>Aucune notification.</p>}
              {data?.items.map((n, i) => (
                <button key={n.id} onClick={() => go(n)} className="pm-row" style={{ width: '100%', display: 'flex', gap: 14, alignItems: 'flex-start', textAlign: 'left', padding: '14px 20px', background: '#fff', border: 'none', borderTop: i ? `1px solid ${SOFT}` : 'none', cursor: 'pointer', fontFamily: FONT, color: TEXT }}>
                  <span aria-label={n.unread ? 'Non lue' : undefined} style={{ flexShrink: 0, width: 10, height: 10, borderRadius: '50%', marginTop: 6, background: n.unread ? BRAND : LINE }} />
                  <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: FS.base, fontWeight: 600, color: INK, lineHeight: 1.4 }}>{n.title}</span>
                    {n.body && <span style={{ fontSize: FS.base, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{n.body}</span>}
                    <span style={{ fontSize: FS.sm, color: MUTED }}>{relTime(n.at)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
