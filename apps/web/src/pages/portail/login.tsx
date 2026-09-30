/**
 * Portail client — page de login publique (design pack).
 * URL : /portail/login?m=<mandatId>
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Eye, EyeOff, Check, AlertCircle, Lock, ArrowLeft, MailCheck } from 'lucide-react';
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
    document.title = 'Portail client — HumanUp';
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

  const bullets = [
    'Suivez vos candidats en temps réel, sans relance.',
    'Donnez votre avis en un clic : rencontrer, discuter, passer.',
    'Un espace confidentiel, réservé à votre entreprise.',
  ];

  return (
    <div>
      <style>{`
        @keyframes plRise{ from{ opacity:0; transform:translateY(18px); } to{ opacity:1; transform:none; } }
        @keyframes plFade{ from{ opacity:0; } to{ opacity:1; } }
        .pl-rise{ animation:plRise .7s cubic-bezier(.16,1,.3,1) both; }
        .pl-fade{ animation:plFade .9s ease both; }
        .pl-fld{ transition:border-color .18s ease, box-shadow .2s ease; }
        .pl-fld:focus{ outline:none; border-color:#22177A; box-shadow:0 0 0 3px rgba(34,23,122,.14); }
        .pl-split button:focus-visible{ outline:2.5px solid #22177A; outline-offset:2px; border-radius:8px; }
        .pl-cta{ transition:transform .18s cubic-bezier(.16,1,.3,1), box-shadow .22s ease; }
        .pl-cta:hover{ transform:translateY(-2px); box-shadow:0 18px 34px -18px rgba(34,23,122,.65); }
        @media (max-width:900px){ .pl-split{ grid-template-columns:1fr !important; } .pl-brand{ display:none !important; } }
      `}</style>

      <div className="pl-split" style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', minHeight: '100vh', background: '#FCFCF5', fontFamily: "'Manrope',sans-serif" }}>
        {/* BRAND */}
        <div className="pl-brand" style={{ position: 'relative', overflow: 'hidden', background: '#22177A', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 52 }}>
          <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(230,233,175,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(230,233,175,.045) 1px,transparent 1px)', backgroundSize: '46px 46px' }} />
          <div aria-hidden className="pl-fade" style={{ position: 'absolute', top: -190, right: -130, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(230,233,175,.16), transparent 68%)' }} />
          <div className="pl-rise" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 11 }}>
            <img src="/brand/logo-mark-cream.png" alt="" style={{ width: 32, height: 32 }} />
            <span style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 22, letterSpacing: '.01em', color: '#E6E9AF' }}>HUMANUP</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(230,233,175,.55)' }}>Portail client</span>
          </div>
          <div style={{ position: 'relative' }}>
            <h1 className="pl-rise" style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 40, lineHeight: 1.05, letterSpacing: '-.03em', color: '#fff', animationDelay: '.08s' }}>La bonne personne<br />change tout.</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 32, maxWidth: 380 }}>
              {bullets.map((b, i) => (
                <div key={i} className="pl-rise" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, animationDelay: `${0.12 + i * 0.05}s` }}>
                  <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, background: 'rgba(230,233,175,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={14} color="#E6E9AF" strokeWidth={2.4} /></span>
                  <span style={{ fontSize: 14.5, lineHeight: 1.5, color: 'rgba(230,233,175,.9)' }}>{b}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="pl-rise" style={{ position: 'relative', fontSize: 12.5, color: 'rgba(230,233,175,.6)', animationDelay: '.3s' }}>© 2026 HumanUp · Espace client sécurisé</div>
        </div>

        {/* FORM */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 28px', position: 'relative' }}>
          <div aria-hidden style={{ position: 'absolute', top: 0, right: 0, width: 520, height: 420, background: 'radial-gradient(ellipse at top right, rgba(230,233,175,.4), transparent 62%)', pointerEvents: 'none' }} />
          <form onSubmit={mode === 'login' ? handleSubmit : handleReset} className="pl-rise" style={{ position: 'relative', width: '100%', maxWidth: 400 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 30 }}>
              <img src="/brand/logo-mark-navy.png" alt="" style={{ width: 30, height: 30 }} />
              <span style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 22, letterSpacing: '.01em', color: '#22177A' }}>HUMANUP</span>
            </div>
            {info && (
              <div style={{ marginBottom: 18, background: '#fff', border: '1px solid rgba(26,21,51,.09)', borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#6E6A85' }}>Recrutement{info.entreprise ? ` · ${info.entreprise}` : ''}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1533', marginTop: 3 }}>{info.titrePoste}</div>
                {(info.consultant || info.commercial) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
                    {([[info.consultant, info.consultantPhoto, 'Consultant'], [info.commercial, info.commercialPhoto, 'Commercial']] as const).filter(([n]) => n).map(([n, photo, role]) => (
                      <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {photo
                          ? <img src={photo} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} />
                          : <span aria-hidden style={{ width: 30, height: 30, borderRadius: '50%', background: '#22177A', color: '#E6E9AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{(n ?? '').split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>}
                        <div style={{ lineHeight: 1.25 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6E6A85' }}>{role}</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1533' }}>{n}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <h2 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 28, letterSpacing: '-.02em', color: '#1A1533' }}>{mode === 'login' ? 'Connexion' : 'Mot de passe oublié'}</h2>
            <p style={{ fontSize: 14, color: '#5C5875', marginTop: 8 }}>{mode === 'login' ? 'Accédez à votre espace de suivi candidats.' : 'Recevez un nouveau mot de passe par email.'}</p>

            {expired && mode === 'login' && (
              <div role="status" style={{ marginTop: 18, borderRadius: 12, border: '1px solid rgba(34,23,122,.18)', background: '#EDEBFA', padding: 12, fontSize: 13, color: '#22177A' }}>
                Votre session a expiré : reconnectez-vous pour continuer.
              </div>
            )}


            {mode === 'reset-sent' ? (
              <div role="status" style={{ display: 'flex', gap: 10, marginTop: 22, borderRadius: 12, background: '#E7F3EA', padding: 14, fontSize: 13.5, lineHeight: 1.5, color: '#256238' }}>
                <MailCheck size={18} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
                <span>Si un accès existe pour <strong>{email}</strong>, un nouveau mot de passe vient d’y être envoyé. Pensez à vérifier vos spams.</span>
              </div>
            ) : (<>
            <label htmlFor="pl-email" style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#4A4568', margin: '26px 0 7px' }}>Email professionnel</label>
            <input id="pl-email" className="pl-fld" type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="prenom@entreprise.com" required autoFocus style={{ width: '100%', fontSize: 14.5, padding: '13px 15px', borderRadius: 12, border: '1.5px solid rgba(34,23,122,.14)', background: '#fff', color: '#1A1533' }} />

            {mode === 'login' && (<>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '16px 0 7px' }}>
              <label htmlFor="pl-pwd" style={{ fontSize: 13, fontWeight: 700, color: '#4A4568' }}>Mot de passe</label>
              <button type="button" onClick={() => { setMode('reset'); setError(''); }} style={{ fontSize: 13, fontWeight: 700, color: '#22177A', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3 }}>Mot de passe oublié ?</button>
            </div>
            <div style={{ position: 'relative' }}>
              <input id="pl-pwd" className="pl-fld" type={show ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError(''); }} placeholder="Votre mot de passe" required style={{ width: '100%', fontSize: 14.5, padding: '13px 44px 13px 15px', borderRadius: 12, border: '1.5px solid rgba(34,23,122,.14)', background: '#fff', color: '#1A1533' }} />
              <button type="button" aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={show} onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: '#5C5875' }}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
            </>)}

            {error && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, color: '#B3261E', fontWeight: 600 }}><AlertCircle size={15} style={{ flexShrink: 0 }} />{error}</div>}

            <button type="submit" disabled={loading} className="pl-cta" style={{ width: '100%', marginTop: 22, fontWeight: 700, fontSize: 16, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 13, padding: 15, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}>{mode === 'login' ? (loading ? 'Connexion…' : 'Se connecter') : (loading ? 'Envoi…' : 'Recevoir un nouveau mot de passe')}</button>
            </>)}
            {mode !== 'login' && (
              <button type="button" onClick={() => setMode('login')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16, fontSize: 13.5, fontWeight: 700, color: '#22177A', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}><ArrowLeft size={15} aria-hidden />Retour à la connexion</button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 20, padding: '13px 15px', background: '#F2F3D8', borderRadius: 12 }}>
              <Lock size={16} color="#22177A" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, lineHeight: 1.5, color: '#5A5470' }}>Session sécurisée · valable 8 h · réservée à votre entreprise.</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
