/**
 * Portail client : page de connexion.
 * URL : /portail/login?m=<mandatId>
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Eye, EyeOff, AlertCircle, ArrowLeft, MailCheck } from 'lucide-react';
import { portalStore, hasValidSession } from './portal-store';

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

  useEffect(() => {
    document.title = 'Connexion | HumanUp';
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

  const field: React.CSSProperties = { width: '100%', fontSize: 14, padding: '11px 13px', borderRadius: 10, border: '1px solid rgba(26,21,51,.16)', background: '#fff', color: '#1A1533' };
  const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, color: '#453F63', marginBottom: 6 };

  return (
    <div style={{ minHeight: '100vh', background: '#F6F5EF', fontFamily: "'Manrope',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
      <style>{`
        .pl-fld{ transition:border-color .15s ease, box-shadow .15s ease; }
        .pl-fld:focus{ outline:none; border-color:#22177A; box-shadow:0 0 0 3px rgba(34,23,122,.12); }
        .pl-card button:focus-visible{ outline:2.5px solid #22177A; outline-offset:2px; border-radius:8px; }
        .pl-cta{ transition:background .15s ease; }
        .pl-cta:hover:not(:disabled){ background:#1A1260 !important; }
      `}</style>

      <div className="pl-card" style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 22 }}>
          <img src="/brand/logo-mark-navy.png" alt="" style={{ width: 28, height: 28 }} />
          <span style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 20, letterSpacing: '.01em', color: '#22177A' }}>HUMANUP</span>
        </div>

        <form onSubmit={mode === 'login' ? handleSubmit : handleReset} style={{ background: '#fff', border: '1px solid rgba(26,21,51,.09)', borderRadius: 16, padding: 28 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1A1533' }}>{mode === 'login' ? 'Connexion' : 'Mot de passe oublié'}</h1>

          {info && mode === 'login' && (
            <div style={{ marginTop: 14, paddingBottom: 16, borderBottom: '1px solid rgba(26,21,51,.08)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1533' }}>{info.titrePoste}</div>
              {info.entreprise && <div style={{ fontSize: 13, color: '#5C5875', marginTop: 2 }}>{info.entreprise}</div>}
              {(info.consultant || info.commercial) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12 }}>
                  {([[info.commercial, info.commercialPhoto, 'Commercial'], [info.consultant, info.consultantPhoto, 'Consultant']] as const).filter(([n]) => n).map(([n, photo, role]) => (
                    <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {photo
                        ? <img src={photo} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                        : <span aria-hidden style={{ width: 28, height: 28, borderRadius: '50%', background: '#22177A', color: '#E6E9AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{(n ?? '').split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>}
                      <div style={{ lineHeight: 1.25 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1533' }}>{n}</div>
                        <div style={{ fontSize: 12, color: '#5C5875' }}>{role}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {mode === 'reset' && <p style={{ fontSize: 13.5, color: '#5C5875', marginTop: 6 }}>Un nouveau mot de passe vous sera envoyé par email.</p>}

          {expired && mode === 'login' && (
            <div role="status" style={{ marginTop: 14, borderRadius: 10, background: '#EDEBFA', padding: '10px 12px', fontSize: 13, color: '#22177A' }}>
              Votre session a expiré, reconnectez-vous.
            </div>
          )}

          {mode === 'reset-sent' ? (
            <div role="status" style={{ display: 'flex', gap: 10, marginTop: 16, borderRadius: 10, background: '#E7F3EA', padding: 12, fontSize: 13.5, lineHeight: 1.5, color: '#256238' }}>
              <MailCheck size={18} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
              <span>Si un accès existe pour <strong>{email}</strong>, un nouveau mot de passe vient d’y être envoyé.</span>
            </div>
          ) : (<>
            <div style={{ marginTop: 18 }}>
              <label htmlFor="pl-email" style={label}>Email</label>
              <input id="pl-email" className="pl-fld" type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="prenom@entreprise.com" required autoFocus style={field} />
            </div>

            {mode === 'login' && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <label htmlFor="pl-pwd" style={label}>Mot de passe</label>
                  <button type="button" onClick={() => { setMode('reset'); setError(''); }} style={{ fontSize: 13, fontWeight: 600, color: '#22177A', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Mot de passe oublié ?</button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input id="pl-pwd" className="pl-fld" type={show ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError(''); }} required style={{ ...field, paddingRight: 42 }} />
                  <button type="button" aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={show} onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: '#5C5875' }}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </div>
            )}

            {error && <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: '#B3261E', fontWeight: 600 }}><AlertCircle size={15} style={{ flexShrink: 0 }} />{error}</div>}

            <button type="submit" disabled={loading} className="pl-cta" style={{ width: '100%', marginTop: 20, fontWeight: 700, fontSize: 14.5, background: '#22177A', color: '#fff', border: 'none', borderRadius: 10, padding: 12, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {mode === 'login' ? (loading ? 'Connexion…' : 'Se connecter') : (loading ? 'Envoi…' : 'Envoyer')}
            </button>
          </>)}

          {mode !== 'login' && (
            <button type="button" onClick={() => setMode('login')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16, fontSize: 13.5, fontWeight: 600, color: '#22177A', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}><ArrowLeft size={15} aria-hidden />Retour</button>
          )}
        </form>
      </div>
    </div>
  );
}
