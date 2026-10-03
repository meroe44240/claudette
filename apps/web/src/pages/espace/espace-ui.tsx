// Espace candidat : session, appels API et éléments d'interface partagés.
// Même DA que les pages de poste humanup.io : Inter, fond gris clair, cartes
// blanches, indigo pour l'action, vert pâle pour ce qui demande l'attention.
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

export const C = {
  bg: '#F7F7F8', card: '#FFFFFF', ink: '#111827', body: '#374151', muted: '#4B5563', line: '#E5E7EB', soft: '#F3F4F6',
  accent: '#22177A', green: '#E6E9AF', error: '#B42318', ok: '#166534',
};
export const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const KEY = 'espace_token';
export const espaceStore = {
  get(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(t: string) { try { localStorage.setItem(KEY, t); } catch { /* navigation privée */ } },
  clear() { try { localStorage.removeItem(KEY); } catch { /* noop */ } },
};

export class EspaceError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Appel à l'API de l'espace candidat ; lève EspaceError (status 401 = session expirée). */
export async function espaceFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const token = espaceStore.get();
  const res = await fetch(`/api/v1/candidate-space${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new EspaceError(data?.message || 'Something went wrong. Please try again.', res.status);
  return data as T;
}

/** Redirige vers la connexion si la session a expiré. */
export function useAuthGuard(error: unknown) {
  const navigate = useNavigate();
  useEffect(() => {
    if (error instanceof EspaceError && error.status === 401) {
      espaceStore.clear();
      navigate('/espace/login', { replace: true });
    }
  }, [error, navigate]);
}

function useInterFont() {
  useEffect(() => {
    if (document.getElementById('espace-inter')) return;
    const l = document.createElement('link');
    l.id = 'espace-inter';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }, []);
}

export const LOGO = 'https://humanup.io/careers/logo.png';

const CSS = `
.esp a{color:${C.accent}}
.esp a:hover{color:#150e52}
.esp input:focus-visible,.esp textarea:focus-visible,.esp button:focus-visible,.esp a:focus-visible{outline:2px solid #6366F1;outline-offset:2px}
.esp-grid{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}
.esp-main{flex:999 1 560px;min-width:0;display:flex;flex-direction:column;gap:24px}
.esp-side{flex:1 1 300px;display:flex;flex-direction:column;gap:20px}
@media (max-width:640px){.esp-hide-sm{display:none}}
`;

export function Page({ children, header = true, unread = 0, name }: { children: ReactNode; header?: boolean; unread?: number; name?: string }) {
  useInterFont();
  return (
    <div className="esp" style={{ minHeight: '100vh', background: C.bg, fontFamily: FONT, color: C.body, fontSize: 15, lineHeight: 1.6 }}>
      <style>{CSS}</style>
      {header && (
        <header style={{ background: C.card, borderBottom: `1px solid ${C.line}` }}>
          <div style={{ maxWidth: 1080, margin: '0 auto', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <Link to="/espace" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <img src={LOGO} alt="Humanup logo" style={{ width: 34, height: 34, borderRadius: '50%' }} />
              <span style={{ fontWeight: 700, color: C.ink, fontSize: 16 }}>Humanup</span>
              <span className="esp-hide-sm" style={{ color: C.muted, fontSize: 14 }}>Candidate space</span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
              <Link to="/espace/notifications" aria-label={unread ? `Updates, ${unread} new` : 'Updates'} style={{ position: 'relative', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.body, border: `1px solid ${C.line}` }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                {unread > 0 && <span style={{ position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, background: C.accent, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unread}</span>}
              </Link>
              {name && <span className="esp-hide-sm" style={{ color: C.muted }}>{name}</span>}
              <button onClick={() => { espaceStore.clear(); window.location.href = '/espace/login'; }} style={{ ...linkBtn, fontSize: 14 }}>Sign out</button>
            </div>
          </div>
        </header>
      )}
      {children}
    </div>
  );
}

export const card: CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '20px 22px' };
export const h2: CSSProperties = { margin: 0, fontSize: 15, color: C.ink, fontWeight: 700 };
export const btn: CSSProperties = { fontFamily: FONT, fontSize: 14, fontWeight: 600, background: C.accent, color: '#fff', border: 0, borderRadius: 10, padding: '11px 18px', cursor: 'pointer', textAlign: 'center', textDecoration: 'none', display: 'inline-block' };
export const btnGhost: CSSProperties = { ...btn, background: C.card, color: C.accent, border: `1px solid ${C.accent}` };
export const linkBtn: CSSProperties = { fontFamily: FONT, background: 'none', border: 0, padding: 0, color: C.accent, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' };
export const input: CSSProperties = { fontFamily: FONT, fontSize: 14, color: C.ink, background: C.card, border: '1px solid #D1D5DB', borderRadius: 10, padding: '10px 12px', width: '100%', boxSizing: 'border-box' };
export const label: CSSProperties = { fontSize: 13, fontWeight: 600, color: C.ink };
export const chip = (on = false): CSSProperties => ({ background: on ? C.green : C.soft, color: on ? C.accent : C.body, borderRadius: 999, padding: '2px 10px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' });

export interface TeamMember { id: string; name: string; firstName: string; role: string; email: string; avatarUrl: string | null }

export function Avatar({ name, url, size = 48 }: { name: string; url?: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  const base: CSSProperties = { width: size, height: size, borderRadius: '50%', border: `3px solid ${C.green}`, boxSizing: 'border-box', flex: 'none' };
  return url
    ? <img src={url} alt={name} style={{ ...base, objectFit: 'cover' }} />
    : <span aria-hidden="true" style={{ ...base, background: C.accent, color: C.green, fontWeight: 700, fontSize: Math.round(size / 3.4), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials}</span>;
}

export function TeamCard({ team }: { team: TeamMember[] }) {
  if (!team.length) return null;
  const emails = team.map((t) => t.email).join(',');
  return (
    <section style={{ ...card, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={h2}>Your Humanup team</h2>
      {team.map((t) => (
        <div key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Avatar name={t.name} url={t.avatarUrl} />
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 14 }}>
            <span style={{ fontWeight: 700, color: C.ink }}>{t.name}</span>
            <span style={{ color: C.muted }}>{t.role}</span>
          </div>
        </div>
      ))}
      {team.length > 1 && <p style={{ margin: 0, fontSize: 14, color: C.muted }}>Both of them follow your file. One message reaches them both.</p>}
      <a href={`mailto:${emails}`} style={{ ...btn, padding: '10px 12px' }}>Message the team</a>
    </section>
  );
}

export function fmtDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-US', opts).format(new Date(d));
}
export function fmtDateTime(d: string | Date) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(d));
}

export function Loading() {
  return <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Loading...</div>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p role="alert" style={{ margin: 0, color: C.error, fontSize: 14 }}>{children}</p>;
}
