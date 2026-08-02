import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye, EyeOff, ArrowRight, AlertCircle, Check } from 'lucide-react';
import { useAuthStore } from '../stores/auth-store';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [keep, setKeep] = useState(true);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const em = email.trim().toLowerCase();
    if (!em || !password) { setError('Renseignez votre email et votre mot de passe.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setError('Adresse email invalide.'); return; }
    setIsLoading(true);
    try {
      await login(em, password);
      navigate('/');
    } catch (err: any) {
      setError(err?.data?.message || 'Email ou mot de passe incorrect');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <style>{`
        @keyframes lgRise{ from{ opacity:0; transform:translateY(18px); } to{ opacity:1; transform:none; } }
        @keyframes lgFade{ from{ opacity:0; } to{ opacity:1; } }
        @keyframes lgPulse{ 0%,100%{ transform:scale(1); opacity:1; } 50%{ transform:scale(1.7); opacity:.32; } }
        .lg-rise{ animation:lgRise .7s cubic-bezier(.16,1,.3,1) both; }
        .lg-fade{ animation:lgFade .9s ease both; }
        .lg-fld{ transition:border-color .18s ease, box-shadow .2s ease, background .18s ease; }
        .lg-fld:focus{ outline:none; border-color:#22177A; background:#fff; box-shadow:0 0 0 3px rgba(34,23,122,.1); }
        .lg-cta{ transition:transform .18s cubic-bezier(.16,1,.3,1), box-shadow .22s ease; }
        .lg-cta:hover{ transform:translateY(-2px); box-shadow:0 18px 34px -18px rgba(34,23,122,.65); }
        .lg-cta:active{ transform:translateY(0) scale(.985); }
        .lg-eye:hover{ background:rgba(34,23,122,.06); color:#22177A; }
        .lg-lnk:hover{ color:#22177A !important; }
        @media (max-width:900px){ .lg-split{ grid-template-columns:1fr !important; } .lg-brand{ display:none !important; } }
      `}</style>

      <div className="lg-split" style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', minHeight: '100vh', background: '#FCFCF5', fontFamily: "'Manrope',sans-serif" }}>
        {/* BRAND */}
        <div className="lg-brand" style={{ position: 'relative', overflow: 'hidden', background: '#22177A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 52 }}>
          <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(230,233,175,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(230,233,175,.045) 1px,transparent 1px)', backgroundSize: '46px 46px' }} />
          <div aria-hidden className="lg-fade" style={{ position: 'absolute', top: -190, right: -130, width: 520, height: 520, borderRadius: '50%', background: 'radial-gradient(circle, rgba(230,233,175,.16), transparent 68%)' }} />
          <div aria-hidden className="lg-fade" style={{ position: 'absolute', bottom: -210, left: -120, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(230,233,175,.09), transparent 70%)' }} />

          <div className="lg-rise" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, lineHeight: 1 }}>
            <span style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 46, letterSpacing: '.01em', color: '#E6E9AF' }}>HUMANUP</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.34em', textTransform: 'uppercase', color: 'rgba(230,233,175,.55)' }}>Recruitment Agency</span>
          </div>

          <div style={{ position: 'relative', maxWidth: 430, marginTop: 44 }}>
            <div className="lg-rise" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'rgba(230,233,175,.12)', border: '1px solid rgba(230,233,175,.24)', borderRadius: 999, padding: '6px 15px 6px 12px', animationDelay: '.06s' }}>
              <span style={{ position: 'relative', display: 'inline-flex', width: 7, height: 7 }}>
                <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#E6E9AF', animation: 'lgPulse 2.2s ease-in-out infinite' }} />
                <span style={{ position: 'relative', width: 7, height: 7, borderRadius: '50%', background: '#E6E9AF' }} />
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#E6E9AF' }}>Espace équipe</span>
            </div>

            <h1 className="lg-rise" style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 40, lineHeight: 1.04, letterSpacing: '-.035em', color: '#fff', marginTop: 20, animationDelay: '.1s' }}>
              La bonne personne <span style={{ position: 'relative', display: 'inline-block', padding: '0 9px' }}><span style={{ position: 'absolute', inset: 0, background: '#E6E9AF', borderRadius: 8 }} /><span style={{ position: 'relative', color: '#22177A' }}>change tout</span></span>.
            </h1>
            <p className="lg-rise" style={{ fontSize: 14.5, lineHeight: 1.6, color: 'rgba(230,233,175,.78)', marginTop: 16, animationDelay: '.14s' }}>Mandats, pipeline candidats, portail client et sourcing inversé — tout votre delivery au même endroit.</p>

            <div className="lg-rise" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 26, marginTop: 30, paddingTop: 22, borderTop: '1px solid rgba(230,233,175,.18)', animationDelay: '.18s' }}>
              <div><div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 22, letterSpacing: '-.02em', color: '#fff' }}>300+</div><div style={{ fontSize: 11, color: 'rgba(230,233,175,.6)', marginTop: 3 }}>placements</div></div>
              <span style={{ width: 1, height: 30, background: 'rgba(230,233,175,.2)' }} />
              <div><div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 22, letterSpacing: '-.02em', color: '#fff' }}>21<span style={{ fontSize: 14 }}>j</span></div><div style={{ fontSize: 11, color: 'rgba(230,233,175,.6)', marginTop: 3 }}>délai moyen</div></div>
              <span style={{ width: 1, height: 30, background: 'rgba(230,233,175,.2)' }} />
              <div><div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 22, letterSpacing: '-.02em', color: '#fff' }}>4</div><div style={{ fontSize: 11, color: 'rgba(230,233,175,.6)', marginTop: 3 }}>verticales</div></div>
            </div>
          </div>

          <div className="lg-rise" style={{ position: 'absolute', left: 0, right: 0, bottom: 34, textAlign: 'center', fontSize: 11.5, color: 'rgba(230,233,175,.45)', animationDelay: '.22s' }}>Hong Kong · Londres · Ho Chi Minh City</div>
        </div>

        {/* FORM */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '44px 40px', position: 'relative' }}>
          <div aria-hidden style={{ position: 'absolute', top: 0, right: 0, width: 420, height: 340, background: 'radial-gradient(ellipse at top right, rgba(230,233,175,.5), transparent 64%)', pointerEvents: 'none' }} />
          <form onSubmit={handleSubmit} className="lg-rise" style={{ position: 'relative', width: '100%', maxWidth: 372, animationDelay: '.08s' }}>
            <h2 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 27, letterSpacing: '-.03em', color: '#1A1533' }}>Connexion</h2>
            <p style={{ fontSize: 14, color: '#6E6A85', marginTop: 7 }}>Accédez à votre espace de recrutement.</p>

            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#8A8699', margin: '26px 0 7px' }}>Email professionnel</label>
            <input className="lg-fld" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="vous@humanup.io" autoComplete="username" style={{ width: '100%', fontSize: 14, padding: '13px 15px', borderRadius: 12, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', color: '#1A1533' }} />

            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#8A8699', margin: '18px 0 7px' }}>Mot de passe</label>
            <div style={{ position: 'relative' }}>
              <input className="lg-fld" type={show ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setError(''); }} placeholder="••••••••" autoComplete="current-password" style={{ width: '100%', fontSize: 14, padding: '13px 46px 13px 15px', borderRadius: 12, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', color: '#1A1533' }} />
              <button type="button" onClick={() => setShow(s => !s)} className="lg-eye" title="Afficher le mot de passe" style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', width: 32, height: 32, border: 'none', borderRadius: 9, background: 'transparent', color: '#9A96AE', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>

            {error && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12.5, fontWeight: 600, color: '#B3261E' }}><AlertCircle size={14} style={{ flexShrink: 0 }} />{error}</div>}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                <span onClick={() => setKeep(k => !k)} style={{ flexShrink: 0, width: 19, height: 19, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `1.5px solid ${keep ? '#22177A' : 'rgba(34,23,122,.24)'}`, background: keep ? '#E6E9AF' : '#fff' }}>{keep && <Check size={11} color="#22177A" strokeWidth={3.4} />}</span>
                <span style={{ fontSize: 12.5, color: '#4A4568' }}>Rester connecté</span>
              </label>
              <a href="/forgot-password" className="lg-lnk" style={{ fontSize: 12.5, fontWeight: 700, color: '#8A8699' }}>Mot de passe oublié ?</a>
            </div>

            <button type="submit" disabled={isLoading} className="lg-cta" style={{ width: '100%', marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontWeight: 800, fontSize: 15, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 13, padding: 15, cursor: isLoading ? 'default' : 'pointer', opacity: isLoading ? 0.85 : 1 }}>
              {isLoading ? 'Connexion…' : 'Se connecter'}{!isLoading && <ArrowRight size={16} strokeWidth={2.4} />}
            </button>

            <p style={{ fontSize: 11.5, lineHeight: 1.55, color: '#9A96AE', marginTop: 26, textAlign: 'center' }}>
              Espace réservé à l'équipe HumanUp.<br />Vous êtes client ? <a href="/portail/login" className="lg-lnk" style={{ fontWeight: 700, color: '#22177A' }}>Accéder au portail de suivi</a>.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
