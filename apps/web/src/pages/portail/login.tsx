/**
 * Portail client — page de login publique (design pack).
 * URL : /portail/login?m=<mandatId>
 */

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Eye, EyeOff, Check, AlertCircle, Lock } from 'lucide-react';

interface LoginResponse { token: string; access: { id: string; mandatId: string; email: string } }

export default function PortalLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mandatId = params.get('m') || '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { document.title = 'Portail client — HumanUp'; }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/portal/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mandatId, email, password }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || 'Identifiants invalides'); }
      const data = (await res.json()) as LoginResponse;
      sessionStorage.setItem('portal_token', data.token);
      sessionStorage.setItem('portal_mandat_id', data.access.mandatId);
      sessionStorage.setItem('portal_email', data.access.email);
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
        .pl-fld:focus{ outline:none; border-color:#22177A; box-shadow:0 0 0 3px rgba(34,23,122,.1); }
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
          <form onSubmit={handleSubmit} className="pl-rise" style={{ position: 'relative', width: '100%', maxWidth: 400 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 30 }}>
              <span style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 22, letterSpacing: '.01em', color: '#22177A' }}>HUMANUP</span>
            </div>
            <h2 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 28, letterSpacing: '-.02em', color: '#1A1533' }}>Connexion</h2>
            <p style={{ fontSize: 14.5, color: '#6E6A85', marginTop: 8 }}>Accédez à votre espace de suivi candidats.</p>

            {!mandatId && (
              <div style={{ marginTop: 18, borderRadius: 12, border: '1px solid rgba(201,162,39,.3)', background: '#FBF3E7', padding: 12, fontSize: 13, color: '#8A6A2E' }}>
                Ce lien est incomplet — demandez à votre contact HumanUp de vous renvoyer l'URL exacte.
              </div>
            )}

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#4A4568', margin: '26px 0 7px' }}>Email professionnel</label>
            <input className="pl-fld" type="email" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="prenom@entreprise.com" required autoFocus style={{ width: '100%', fontSize: 14.5, padding: '13px 15px', borderRadius: 12, border: '1.5px solid rgba(34,23,122,.14)', background: '#fff', color: '#1A1533' }} />

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#4A4568', margin: '16px 0 7px' }}>Mot de passe</label>
            <div style={{ position: 'relative' }}>
              <input className="pl-fld" type={show ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError(''); }} placeholder="Votre mot de passe" required style={{ width: '100%', fontSize: 14.5, padding: '13px 44px 13px 15px', borderRadius: 12, border: '1.5px solid rgba(34,23,122,.14)', background: '#fff', color: '#1A1533' }} />
              <button type="button" onClick={() => setShow(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: '#8A8699' }}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>

            {error && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, color: '#B3261E', fontWeight: 600 }}><AlertCircle size={15} style={{ flexShrink: 0 }} />{error}</div>}

            <button type="submit" disabled={loading || !mandatId} className="pl-cta" style={{ width: '100%', marginTop: 22, fontWeight: 700, fontSize: 16, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 13, padding: 15, cursor: loading || !mandatId ? 'default' : 'pointer', opacity: loading || !mandatId ? 0.6 : 1 }}>{loading ? 'Connexion…' : 'Se connecter'}</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 20, padding: '13px 15px', background: '#F2F3D8', borderRadius: 12 }}>
              <Lock size={16} color="#22177A" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, lineHeight: 1.5, color: '#5A5470' }}>Session sécurisée · valable 4h · réservée à votre entreprise.</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
