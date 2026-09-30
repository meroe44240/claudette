/**
 * Portail client — éléments partagés : charte, libellés des colonnes, appels API,
 * avatars et barre de navigation (Candidatures / Offres d'emploi / Candidats + cloche).
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bell, ChevronDown, LogOut, Check, Sparkles, ArrowRight, MessageCircle, AtSign, Columns3, Briefcase, Users } from 'lucide-react';
import { portalStore } from './portal-store';

// ── Charte (contrastes ≥ 4,5:1 sur le fond) ──
export const INK = '#1A1533';
export const TEXT = '#453F63';
export const MUTED = '#5C5875';
export const FAINT = '#6E6A85';
export const LINE = 'rgba(26,21,51,.09)';
export const BRAND = '#22177A';
export const CREAM = '#E6E9AF';
export const BG = '#F6F5EF';
export const FS = { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 20, xxl: 28 } as const;
export const DISPLAY = "'Archivo Black',sans-serif";
export const FONT = "'Manrope',sans-serif";
export const LABEL: React.CSSProperties = { fontSize: FS.xs, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: FAINT };

// ── Colonnes du portail ──
export type Col = 'INBOX' | 'SCREENING' | 'CASE' | 'CULTURE_FIT' | 'OFFRE' | 'ENGAGE' | 'PERDU';
export const COL_LABELS: Record<Col, string> = {
  INBOX: 'Inbox', SCREENING: 'Screening', CASE: 'Case', CULTURE_FIT: 'Culture Fit', OFFRE: 'Offre', ENGAGE: 'Engagé', PERDU: 'Perdu',
};
export const COL_ACCENT: Record<Col, string> = {
  INBOX: '#475467', SCREENING: '#2A6BD8', CASE: '#D97F1E', CULTURE_FIT: '#7A5BD1', OFFRE: '#B8921A', ENGAGE: '#2F8A4A', PERDU: '#8A8699',
};
export const COL_TINT: Record<Col, string> = {
  INBOX: '#EEF0F3', SCREENING: '#EAF1FC', CASE: '#FCF1E4', CULTURE_FIT: '#F1ECFC', OFFRE: '#FAF4DE', ENGAGE: '#E7F3EA', PERDU: '#F0EFF3',
};
export const COL_ORDER: Col[] = ['INBOX', 'SCREENING', 'CASE', 'CULTURE_FIT', 'OFFRE', 'ENGAGE', 'PERDU'];

export type Decision = 'RENCONTRER' | 'A_DISCUTER' | 'ECARTER';
export const DECISION_LABEL: Record<Decision, string> = { RENCONTRER: 'À rencontrer', A_DISCUTER: 'À discuter', ECARTER: 'Écarté' };
export const DECISION_TONE: Record<Decision, { bg: string; fg: string }> = {
  RENCONTRER: { bg: '#E6F2E9', fg: '#256238' }, A_DISCUTER: { bg: '#FAF0DF', fg: '#7A5A1E' }, ECARTER: { bg: '#F7E8E5', fg: '#9E2F1A' },
};

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

// Photo (candidat ou membre HumanUp), sinon initiales.
export function PersonAvatar({ name, photo, size, radius = '50%', bg = BRAND, fg = CREAM }: { name: string; photo?: string | null; size: number; radius?: number | string; bg?: string; fg?: string }) {
  const [broken, setBroken] = useState(false);
  const box: React.CSSProperties = { flexShrink: 0, width: size, height: size, borderRadius: radius, overflow: 'hidden' };
  if (photo && !broken) return <img src={photo} alt="" onError={() => setBroken(true)} style={{ ...box, objectFit: 'cover', display: 'block' }} />;
  return <span aria-hidden style={{ ...box, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: DISPLAY, fontSize: Math.max(9, Math.round(size * 0.34)) }}>{initialsOf(name)}</span>;
}

export const SHARED_CSS = `
  .pm-focus:focus{ outline:none; }
  .pm-focus:focus-visible, .pm-btn:focus-visible, .pm-tab:focus-visible, .pm-chip:focus-visible, .pm-nav:focus-visible, .pm-row:focus-visible{ outline:2.5px solid ${BRAND}; outline-offset:2px; border-radius:12px; }
  .pm-btn{ transition:transform .15s ease, box-shadow .15s ease, background .15s ease; }
  .pm-btn:hover:not(:disabled){ transform:translateY(-1px); box-shadow:0 8px 18px -12px rgba(26,21,51,.35); }
  .pm-chip{ transition:background .15s ease, border-color .15s ease; }
  .pm-chip:hover:not(:disabled){ border-color:rgba(34,23,122,.3) !important; }
  .pm-nav{ transition:background .15s ease, color .15s ease; }
  .pm-nav:hover{ background:rgba(34,23,122,.06); color:${INK} !important; }
  .pm-icon{ transition:background .15s ease; }
  .pm-icon:hover{ background:rgba(34,23,122,.06); }
  .pm-row{ transition:background .12s ease; }
  .pm-row:hover{ background:#FAFAF6; }
  .pm-scroll::-webkit-scrollbar{ height:8px; width:8px; }
  .pm-scroll::-webkit-scrollbar-thumb{ background:rgba(26,21,51,.16); border-radius:99px; }
  @media (max-width: 760px){ .pm-hide-sm{ display:none !important; } .pm-page{ padding-bottom:72px; } }
`;

// ── Barre de navigation ──
type Tab = 'candidatures' | 'offres' | 'candidats';
interface Me { email: string; name: string; entreprise: string | null; homeMandatId: string }

export function PortalTopBar({ active, mandatId }: { active: Tab; mandatId?: string }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [me, setMe] = useState<Me | null>(null);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    void portalFetch('/me').then(async (r) => {
      if (r.status === 401) { portalStore.clear(); navigate(`/portail/login?expired=1${lastMandat.get() ? `&m=${lastMandat.get()}` : ''}`); return; }
      if (r.ok) setMe(await r.json());
    });
  }, [navigate]);
  const candidaturesHref = `/portail/mandat/${mandatId || lastMandat.get() || me?.homeMandatId || ''}`;
  const items: Array<[Tab, string, string, React.ReactNode]> = [
    ['candidatures', 'Candidatures', candidaturesHref, <Columns3 size={19} aria-hidden />],
    ['offres', 'Offres d’emploi', '/portail/offres', <Briefcase size={19} aria-hidden />],
    ['candidats', 'Candidats', '/portail/candidats', <Users size={19} aria-hidden />],
  ];
  function logout() { const m = lastMandat.get(); portalStore.clear(); navigate(`/portail/login${m ? `?m=${m}` : ''}`); }

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 18, height: 58, padding: isMobile ? '0 12px' : '0 24px', background: '#fff', borderBottom: `1px solid ${LINE}` }}>
      <Link to="/portail/offres" aria-label="HumanUp — accueil" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <span style={{ width: 32, height: 32, borderRadius: 9, background: BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="/brand/logo-mark-cream.png" alt="" style={{ width: 19, height: 19 }} />
        </span>
      </Link>
      {isMobile && <span style={{ fontFamily: DISPLAY, fontSize: 15, color: BRAND, letterSpacing: '.01em' }}>HUMANUP</span>}
      {/* Mobile : barre d'onglets en bas de l'écran */}
      {isMobile && (
        <nav aria-label="Navigation principale" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 45, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', background: '#fff', borderTop: `1px solid ${LINE}`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {items.map(([key, label, href, icon]) => {
            const on = active === key;
            return (
              <Link key={key} to={href} className="pm-nav" aria-current={on ? 'page' : undefined}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '9px 4px 8px', fontSize: FS.xs, fontWeight: on ? 800 : 600, color: on ? BRAND : MUTED, textDecoration: 'none' }}>
                {icon}{label === 'Offres d’emploi' ? 'Offres' : label}
              </Link>
            );
          })}
        </nav>
      )}
      <nav aria-label="Navigation principale" className="pm-scroll pm-hide-sm" style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', minWidth: 0 }}>
        {items.map(([key, label, href]) => {
          const on = active === key;
          return (
            <Link key={key} to={href} className="pm-nav" aria-current={on ? 'page' : undefined}
              style={{ flexShrink: 0, fontSize: FS.md, fontWeight: on ? 800 : 600, color: on ? BRAND : MUTED, background: on ? '#EDEBFA' : 'transparent', borderRadius: 9, padding: '7px 12px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              {label}
            </Link>
          );
        })}
      </nav>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 10 }}>
        <NotificationsBell />
        <div style={{ position: 'relative' }}>
          <button className="pm-icon" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu}
            style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', borderRadius: 10, padding: '5px 8px', cursor: 'pointer', color: INK }}>
            <PersonAvatar name={me?.name || '?'} size={28} radius={8} />
            {!isMobile && <span style={{ fontSize: FS.base, fontWeight: 700, maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me?.name ?? ''}</span>}
            <ChevronDown size={15} aria-hidden color={MUTED} />
          </button>
          {menu && (
            <>
              <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
              <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 51, width: 240, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, boxShadow: '0 18px 40px -20px rgba(26,21,51,.45)', padding: 6 }}>
                <div style={{ padding: '8px 10px 10px', borderBottom: `1px solid ${LINE}`, marginBottom: 4 }}>
                  <div style={{ fontSize: FS.base, fontWeight: 800, color: INK }}>{me?.name}</div>
                  <div style={{ fontSize: FS.sm, color: FAINT, marginTop: 2 }}>{me?.email}</div>
                  {me?.entreprise && <div style={{ fontSize: FS.sm, color: MUTED, marginTop: 2 }}>{me.entreprise}</div>}
                </div>
                <button role="menuitem" onClick={logout} className="pm-icon" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, fontSize: FS.base, fontWeight: 600, color: INK, background: 'transparent', border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', textAlign: 'left' }}>
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
  const icon = (k: Notif['kind']) => (k === 'NEW' ? <Sparkles size={12} /> : k === 'STAGE' ? <ArrowRight size={12} /> : k === 'MENTION' ? <AtSign size={12} /> : <MessageCircle size={12} />);
  const unread = data?.unread ?? 0;

  return (
    <div style={{ position: 'relative' }}>
      <button className="pm-icon" onClick={() => (open ? close() : setOpen(true))} aria-haspopup="dialog" aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications'}
        style={{ position: 'relative', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: open ? 'rgba(34,23,122,.06)' : 'transparent', borderRadius: 10, cursor: 'pointer', color: INK }}>
        <Bell size={19} aria-hidden />
        {unread > 0 && <span aria-hidden style={{ position: 'absolute', top: 5, right: 5, minWidth: 16, height: 16, borderRadius: 99, background: '#D1356B', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '2px solid #fff' }}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div ref={panel} role="dialog" aria-label="Notifications" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 51, width: 380, maxWidth: 'calc(100vw - 24px)', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, boxShadow: '0 24px 50px -24px rgba(26,21,51,.5)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${LINE}` }}>
              <span style={{ fontSize: FS.md, fontWeight: 800, color: INK }}>Notifications</span>
              {unread > 0 && <span style={{ fontSize: FS.sm, color: FAINT }}>{unread} nouvelle{unread > 1 ? 's' : ''}</span>}
            </div>
            <div className="pm-scroll" style={{ maxHeight: 440, overflowY: 'auto' }}>
              {!data && <p style={{ padding: 16, fontSize: FS.base, color: FAINT }}>Chargement…</p>}
              {data?.items.length === 0 && (
                <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: FS.base, color: FAINT }}>
                  <Check size={20} aria-hidden style={{ display: 'block', margin: '0 auto 8px' }} />Rien de nouveau pour l’instant.
                </div>
              )}
              {data?.items.map((n) => (
                <button key={n.id} onClick={() => go(n)} className="pm-row" style={{ width: '100%', display: 'flex', gap: 11, alignItems: 'flex-start', textAlign: 'left', padding: '11px 14px', background: n.unread ? '#F7F6FD' : '#fff', border: 'none', borderBottom: `1px solid ${LINE}`, cursor: 'pointer' }}>
                  <span style={{ position: 'relative', flexShrink: 0 }}>
                    <PersonAvatar name={n.who || n.title} photo={n.photo} size={34} radius={10} />
                    <span aria-hidden style={{ position: 'absolute', right: -4, bottom: -4, width: 18, height: 18, borderRadius: 99, background: '#fff', border: `1px solid ${LINE}`, color: BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon(n.kind)}</span>
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: FS.base, fontWeight: n.unread ? 800 : 600, color: INK, lineHeight: 1.35 }}>{n.title}</span>
                    {n.body && <span style={{ display: 'block', fontSize: FS.sm, color: MUTED, marginTop: 2, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</span>}
                    <span style={{ display: 'block', fontSize: FS.xs, color: FAINT, marginTop: 3 }}>{relTime(n.at)}</span>
                  </span>
                  {n.unread && <span aria-label="Non lue" style={{ flexShrink: 0, width: 8, height: 8, borderRadius: 99, background: '#D1356B', marginTop: 6 }} />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
