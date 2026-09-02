/**
 * Page publique d'annulation de rendez-vous.
 * URL : /annuler-rdv?token=<jwt booking-cancel>
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertCircle, CalendarX, Check } from 'lucide-react';

interface Ctx { prenom: string; date: string; alreadyCancelled: boolean }

export default function AnnulerRdvPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'sending' | 'done'>('loading');

  useEffect(() => { document.title = 'Annuler le rendez-vous — HumanUp'; }, []);

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    (async () => {
      try {
        const res = await fetch(`/api/v1/public/booking/cancel?token=${encodeURIComponent(token)}`);
        if (!res.ok) throw new Error('invalid');
        const data = (await res.json()) as Ctx;
        setCtx(data);
        setState(data.alreadyCancelled ? 'done' : 'ready');
      } catch { setState('invalid'); }
    })();
  }, [token]);

  async function handleCancel() {
    setState('sending');
    try {
      const res = await fetch('/api/v1/public/booking/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      if (!res.ok) throw new Error('fail');
      setState('done');
    } catch { setState('ready'); }
  }

  const card: React.CSSProperties = { width: '100%', maxWidth: 460, background: '#fff', border: '1px solid rgba(34,23,122,.1)', borderRadius: 20, boxShadow: '0 30px 70px -40px rgba(34,23,122,.5)', overflow: 'hidden' };

  return (
    <div style={{ minHeight: '100vh', background: '#FCFCF5', fontFamily: "'Manrope',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
      <div style={card}>
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
                <p style={{ fontSize: 14, color: '#6E6A85', marginTop: 8 }}>Écrivez-nous à meroe@humanup.io et nous nous en occupons.</p>
              </div>
            </div>
          )}

          {(state === 'ready' || state === 'sending') && ctx && (
            <>
              <h2 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 23, letterSpacing: '-.02em', color: '#1A1533', margin: 0 }}>Annuler votre rendez-vous ?</h2>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: '#4A4568', marginTop: 12 }}>
                Vous êtes sur le point d'annuler l'échange prévu le <strong>{ctx.date}</strong>. Le créneau sera libéré.
              </p>
              <button onClick={handleCancel} disabled={state === 'sending'} style={{ width: '100%', marginTop: 20, fontWeight: 700, fontSize: 16, background: '#B3261E', color: '#fff', border: 'none', borderRadius: 13, padding: 15, cursor: state === 'sending' ? 'default' : 'pointer' }}>{state === 'sending' ? 'Annulation…' : "Confirmer l'annulation"}</button>
              <p style={{ fontSize: 12.5, color: '#9A96AE', marginTop: 14, textAlign: 'center' }}>Changé d'avis ? Fermez simplement cette page, le rendez-vous reste confirmé.</p>
            </>
          )}

          {state === 'done' && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#F7DEDB', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}><CalendarX size={30} color="#B3261E" /></div>
              <h2 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 22, color: '#1A1533', marginTop: 18 }}>Rendez-vous annulé</h2>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#6E6A85', marginTop: 10 }}>C'est noté{ctx ? `, ${ctx.prenom}` : ''}. Le créneau a été libéré. Vous pouvez en réserver un autre quand vous le souhaitez.</p>
              <a href="https://humanup.io" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 18, fontSize: 13.5, fontWeight: 700, color: '#22177A', textDecoration: 'none', borderBottom: '2px solid #E6E9AF', paddingBottom: 2 }}><Check size={14} />Retour sur humanup.io</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
