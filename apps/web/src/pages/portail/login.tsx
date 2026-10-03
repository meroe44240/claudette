/**
 * Portail client : page de connexion.
 * URL : /portail/login?m=<mandatId>
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Eye, EyeOff } from 'lucide-react';
import { portalStore, hasValidSession } from './portal-store';
import { BG, BRAND, BTN, CARD, CREAM, FONT, INK, LOGO, MUTED, SHARED_CSS, SOFT, PersonAvatar, useInterFont } from './portal-ui';

interface LoginResponse { token: string; access: { id: string; mandatId: string; email: string } }
interface PublicInfo { titrePoste: string; entreprise: string | null; consultant: string | null; consultantPhoto?: string | null; commercial: string | null; commercialPhoto?: string | null }

export default function PortalLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mandatId = params.get('m') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [mode, setMode] = useState<'login' | 'reset' | 'reset-sent'>('login');
  const expired = params.get('expired') === '1';
  useInterFont();

  useEffect(() => {
    document.title = 'Connexion | Humanup';
    // Déjà connecté (ex. lien ouvert depuis un email) : on entre directement.
    if (hasValidSession(mandatId || null)) { navigate(mandatId ? `/portail/mandat/${mandatId}` : '/portail/offres', { replace: true }); return; }
    if (!mandatId) return;
    void fetch(`/api/v1/portal/public/mandat/${mandatId}`).then((r) => (r.ok ? r.json() : null)).then(setInfo).catch(() => {});
  }, [mandatId, navigate]);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/v1/portal/password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(mandatId ? { mandatId } : {}), email }) });
    } finally { setLoading(false); setMode('reset-sent'); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/portal/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(mandatId ? { mandatId } : {}), email, password }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || 'Identifiants invalides'); }
      const data = (await res.json()) as LoginResponse;
      portalStore.set('portal_token', data.token);
      portalStore.set('portal_mandat_id', data.access.mandatId);
      portalStore.set('portal_email', data.access.email);
      navigate(`/portail/mandat/${data.access.mandatId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally { setLoading(false); }
  }

  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontFamily: FONT, fontSize: 14, padding: '10px 12px', borderRadius: 10, border: '1px solid #D1D5DB', background: '#fff', color: INK };
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: INK };
  const link: React.CSSProperties = { fontFamily: FONT, fontSize: 14, fontWeight: 600, color: BRAND, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 };
  const team = info ? ([[info.commercial, info.commercialPhoto, 'Votre contact Humanup'], [info.consultant, info.consultantPhoto, 'Consultant sur le poste']] as const).filter(([n]) => n) : [];

  return (
    <div className="pm-page" style={{ minHeight: '100vh', background: BG, fontFamily: FONT, padding: '56px 20px', boxSizing: 'border-box', display: 'flex', justifyContent: 'center' }}>
      <style>{SHARED_CSS}</style>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={LOGO} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />
          <span style={{ fontWeight: 700, color: INK, fontSize: 16 }}>Humanup</span>
          <span style={{ color: MUTED, fontSize: 14 }}>Espace client</span>
        </div>

        <form onSubmit={mode === 'login' ? handleSubmit : handleReset} style={{ ...CARD, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{ fontSize: 22, color: INK, letterSpacing: '-0.02em' }}>{mode === 'login' ? 'Suivez vos recrutements' : 'Mot de passe oublié'}</h1>
            {mode === 'login' && info && <p style={{ fontSize: 14, color: MUTED }}>{info.titrePoste}{info.entreprise ? ` chez ${info.entreprise}` : ''}</p>}
            {mode === 'reset' && <p style={{ fontSize: 14, color: MUTED }}>Un nouveau mot de passe vous sera envoyé par email.</p>}
          </div>

          {expired && mode === 'login' && (
            <div role="status" style={{ borderRadius: 10, background: CREAM, padding: '10px 12px', fontSize: 14, color: BRAND }}>
              Votre session a expiré, reconnectez-vous.
            </div>
          )}

          {mode === 'reset-sent' ? (
            <div role="status" style={{ borderRadius: 10, background: SOFT, padding: 12, fontSize: 14, lineHeight: 1.5 }}>
              Si un accès existe pour <strong style={{ color: INK }}>{email}</strong>, un nouveau mot de passe vient d’y être envoyé.
            </div>
          ) : (<>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="pl-email" style={label}>Email</label>
              <input id="pl-email" type="email" autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} required autoFocus style={field} />
            </div>

            {mode === 'login' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label htmlFor="pl-pwd" style={label}>Mot de passe</label>
                <div style={{ position: 'relative' }}>
                  <input id="pl-pwd" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} required style={{ ...field, paddingRight: 44 }} />
                  <button type="button" aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={show} onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', color: MUTED }}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </div>
            )}

            {error && <div role="alert" style={{ fontSize: 14, color: '#B42318', fontWeight: 600 }}>{error}</div>}

            <button type="submit" disabled={loading} style={{ ...BTN, fontSize: 15, padding: '12px 16px', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {mode === 'login' ? (loading ? 'Connexion…' : 'Se connecter') : (loading ? 'Envoi…' : 'Envoyer')}
            </button>
          </>)}

          {mode === 'login'
            ? <button type="button" onClick={() => { setMode('reset'); setError(''); }} style={{ ...link, alignSelf: 'center' }}>Mot de passe oublié</button>
            : <button type="button" onClick={() => setMode('login')} style={{ ...link, alignSelf: 'center' }}>Retour à la connexion</button>}
        </form>

        {team.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
            {team.map(([n, photo, role]) => (
              <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <PersonAvatar name={n ?? ''} photo={photo} size={36} ring />
                <span style={{ display: 'flex', flexDirection: 'column', fontSize: 13, lineHeight: 1.3 }}>
                  <span style={{ fontWeight: 600, color: INK }}>{n}</span>
                  <span style={{ color: MUTED }}>{role}</span>
                </span>
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize: 14, color: MUTED }}>Un souci pour vous connecter ? Écrivez à <a href="mailto:meroe@humanup.io" style={{ color: BRAND }}>meroe@humanup.io</a></p>
      </div>
    </div>
  );
}
