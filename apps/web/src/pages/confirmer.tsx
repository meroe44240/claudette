/**
 * Page publique de confirmation candidat.
 * URL : /confirmer?token=<jwt confirm>
 * Le candidat confirme son intérêt + autorise le transfert de son CV.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Check, AlertCircle, ShieldCheck } from 'lucide-react';

interface Ctx { prenom: string; poste: string | null; alreadyConfirmed: boolean }

export default function ConfirmerPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'sending' | 'done'>('loading');
  const [accepted, setAccepted] = useState(false);

  useEffect(() => { document.title = 'Confirmation — HumanUp'; }, []);

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    (async () => {
      try {
        const res = await fetch(`/api/v1/public/confirmation?token=${encodeURIComponent(token)}`);
        if (!res.ok) throw new Error('invalid');
        const data = (await res.json()) as Ctx;
        setCtx(data);
        setState(data.alreadyConfirmed ? 'done' : 'ready');
      } catch { setState('invalid'); }
    })();
  }, [token]);

  async function handleConfirm() {
    if (!accepted) return;
    setState('sending');
    try {
      const res = await fetch('/api/v1/public/confirmation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      if (!res.ok) throw new Error('fail');
      setState('done');
    } catch { setState('ready'); }
  }

  const card: React.CSSProperties = { width: '100%', maxWidth: 460, background: '#fff', border: '1px solid rgba(34,23,122,.1)', borderRadius: 20, boxShadow: '0 30px 70px -40px rgba(34,23,122,.5)', overflow: 'hidden' };

  return (
    <div style={{ minHeight: '100vh', background: '#FCFCF5', fontFamily: "'Manrope',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
      <div style={card}>
        {/* Header navy */}
        <div style={{ position: 'relative', overflow: 'hidden', background: '#22177A', padding: '26px 30px' }}>
          <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(230,233,175,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(230,233,175,.05) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/brand/logo-mark-cream.png" alt="" style={{ width: 30, height: 30 }} />
            <span style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 20, letterSpacing: '.01em', color: '#E6E9AF' }}>HUMANUP</span>
          </div>
        </div>

        <div style={{ padding: '30px 30px 34px' }}>
          {state === 'loading' && <p style={{ fontSize: 14, color: '#8A8699' }}>Chargement…</p>}

          {state === 'invalid' && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <AlertCircle size={20} color="#B3261E" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <h2 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 20, color: '#1A1533', margin: 0 }}>Lien invalide ou expiré</h2>
                <p style={{ fontSize: 14, color: '#6E6A85', marginTop: 8 }}>Demandez à votre contact HumanUp de vous renvoyer un nouveau lien.</p>
              </div>
            </div>
          )}

          {(state === 'ready' || state === 'sending') && ctx && (
            <>
              <h2 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 24, letterSpacing: '-.02em', color: '#1A1533', margin: 0 }}>Bonjour {ctx.prenom},</h2>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: '#4A4568', marginTop: 12 }}>
                Nous aimerions présenter votre profil{ctx.poste ? <> pour le poste de <strong>{ctx.poste}</strong></> : null} à notre client.
              </p>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 20, padding: '15px 16px', background: '#F2F3D8', border: '1px solid rgba(34,23,122,.14)', borderRadius: 14, cursor: 'pointer' }}>
                <span onClick={() => setAccepted(a => !a)} style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${accepted ? '#22177A' : 'rgba(34,23,122,.3)'}`, background: accepted ? '#E6E9AF' : '#fff' }}>{accepted && <Check size={14} color="#22177A" strokeWidth={3} />}</span>
                <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} style={{ display: 'none' }} />
                <span style={{ fontSize: 13.5, lineHeight: 1.5, color: '#4A4568' }}>Je confirme mon <strong>intérêt pour ce poste</strong> et j'autorise <strong>HumanUp</strong> à transmettre mon CV à ses clients.</span>
              </label>
              <button onClick={handleConfirm} disabled={!accepted || state === 'sending'} style={{ width: '100%', marginTop: 20, fontWeight: 700, fontSize: 16, background: accepted ? '#22177A' : '#C4C1D0', color: '#E6E9AF', border: 'none', borderRadius: 13, padding: 15, cursor: accepted && state !== 'sending' ? 'pointer' : 'default' }}>{state === 'sending' ? 'Envoi…' : 'Confirmer'}</button>
            </>
          )}

          {state === 'done' && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#EAF3EC', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}><ShieldCheck size={30} color="#2C6B3F" /></div>
              <h2 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 22, color: '#1A1533', marginTop: 18 }}>C'est confirmé, merci{ctx ? ` ${ctx.prenom}` : ''} !</h2>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#6E6A85', marginTop: 10 }}>Votre intérêt est enregistré et vous nous autorisez à transmettre votre CV. Nous revenons vers vous très vite.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
