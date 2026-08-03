/** Page de réservation publique (remplace Calendly). URL : /book/:slug */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { Clock, Video, Calendar, Check, ArrowLeft, AlertCircle } from 'lucide-react';

interface PublicPage { slug: string; title: string; durationMin: number; timezone: string; host: { name: string; avatarUrl: string | null }; slots: string[] }
interface Confirmed { slotStart: string; slotEnd: string; meetLink: string | null; hostName: string; message: string }

function dayKey(iso: string) { return iso.slice(0, 10); }
function fmtDay(iso: string) { return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
function initials(name: string) { return name.split(/\s+/).map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || 'HU'; }

export default function BookPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<PublicPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [selDay, setSelDay] = useState<string | null>(null);
  const [selSlot, setSelSlot] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);

  useEffect(() => {
    document.title = 'Réserver un créneau — HumanUp';
    (async () => {
      try {
        const res = await fetch(`/api/v1/public/booking/${slug}`);
        if (!res.ok) throw new Error('Page introuvable');
        setPage(await res.json() as PublicPage);
      } catch { setErr("Cette page de réservation n'existe pas ou n'est plus active."); }
      finally { setLoading(false); }
    })();
  }, [slug]);

  const days = useMemo(() => {
    if (!page) return [];
    const map = new Map<string, string[]>();
    for (const s of page.slots) { const k = dayKey(s); if (!map.has(k)) map.set(k, []); map.get(k)!.push(s); }
    return Array.from(map.entries()).map(([k, slots]) => ({ key: k, iso: slots[0], slots }));
  }, [page]);

  useEffect(() => { if (days.length && !selDay) setSelDay(days[0].key); }, [days, selDay]);

  const submit = async () => {
    if (!selSlot || !name.trim() || !email.trim()) return;
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/v1/public/booking/${slug}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), note: note.trim() || undefined, slotStart: selSlot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Réservation impossible');
      setConfirmed(data as Confirmed);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const S = { fontFamily: "'Manrope',sans-serif" };
  if (loading) return <div style={{ ...S, minHeight: '100vh', background: '#F4F4EA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9A96AE' }}>Chargement…</div>;
  if (err && !page) return <div style={{ ...S, minHeight: '100vh', background: '#F4F4EA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: '#B3261E' }}><AlertCircle size={26} />{err}</div>;
  if (!page) return null;

  const daySlots = days.find(d => d.key === selDay)?.slots ?? [];

  return (
    <div style={{ ...S, minHeight: '100vh', background: '#F4F4EA', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <style>{`.bk-slot:hover{ border-color:#22177A !important; } .bk-day:hover{ background:#F2F3D8 !important; }`}</style>
      <div style={{ width: 920, maxWidth: '100%', background: '#fff', borderRadius: 22, overflow: 'hidden', boxShadow: '0 40px 90px -40px rgba(34,23,122,.45)', display: 'grid', gridTemplateColumns: confirmed ? '1fr' : '300px 1fr', minHeight: 520 }}>
        {/* LEFT — host */}
        {!confirmed && (
          <div style={{ background: '#22177A', color: '#fff', padding: '30px 28px', position: 'relative', overflow: 'hidden' }}>
            <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(230,233,175,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(230,233,175,.05) 1px,transparent 1px)', backgroundSize: '38px 38px' }} />
            <div style={{ position: 'relative' }}>
              <span style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 17, letterSpacing: '.01em', color: '#E6E9AF' }}>HUMANUP</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 30 }}>
                <span style={{ width: 48, height: 48, borderRadius: '50%', background: '#E6E9AF', color: '#22177A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black',sans-serif", fontSize: 16, overflow: 'hidden' }}>{page.host.avatarUrl ? <img src={page.host.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(page.host.name)}</span>
                <div><div style={{ fontSize: 12.5, color: 'rgba(230,233,175,.7)' }}>{page.host.name}</div><div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 20, marginTop: 2 }}>{page.title}</div></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 26, fontSize: 13.5, color: 'rgba(230,233,175,.9)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Clock size={15} color="#E6E9AF" />{page.durationMin} minutes</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Video size={15} color="#E6E9AF" />Google Meet (lien envoyé automatiquement)</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Calendar size={15} color="#E6E9AF" />Fuseau {page.timezone}</span>
              </div>
            </div>
          </div>
        )}

        {/* RIGHT — content */}
        <div style={{ padding: '30px 32px 34px' }}>
          {confirmed ? (
            <div style={{ textAlign: 'center', maxWidth: 460, margin: '0 auto', paddingTop: 20 }}>
              <span style={{ display: 'inline-flex', width: 66, height: 66, borderRadius: '50%', background: '#EAF3EC', alignItems: 'center', justifyContent: 'center' }}><Check size={30} color="#2C6B3F" strokeWidth={2.6} /></span>
              <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 24, color: '#1A1533', marginTop: 18 }}>C'est réservé !</div>
              <div style={{ fontSize: 15, color: '#4A4568', marginTop: 10 }}>{fmtDay(confirmed.slotStart)} · {fmtTime(confirmed.slotStart)} avec {confirmed.hostName}</div>
              <p style={{ fontSize: 13.5, color: '#6E6A85', lineHeight: 1.6, marginTop: 12 }}>{confirmed.message}</p>
              {confirmed.meetLink && <a href={confirmed.meetLink} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 18, fontSize: 13.5, fontWeight: 700, color: '#E6E9AF', background: '#22177A', borderRadius: 12, padding: '12px 20px', textDecoration: 'none' }}><Video size={15} />Rejoindre le Google Meet</a>}
            </div>
          ) : !selSlot ? (
            <>
              <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 20, color: '#1A1533' }}>Choisissez un créneau</div>
              {days.length === 0 ? (
                <div style={{ marginTop: 20, padding: '30px 16px', textAlign: 'center', color: '#8A8699', fontSize: 14, border: '1.5px dashed rgba(34,23,122,.2)', borderRadius: 14 }}>Aucun créneau disponible pour l'instant.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 18, marginTop: 18 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
                    {days.map(d => (
                      <button key={d.key} className="bk-day" onClick={() => setSelDay(d.key)} style={{ textAlign: 'left', padding: '11px 13px', borderRadius: 11, border: `1px solid ${selDay === d.key ? '#22177A' : 'rgba(34,23,122,.12)'}`, background: selDay === d.key ? '#F2F3D8' : '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: selDay === d.key ? 800 : 600, color: '#1A1533', textTransform: 'capitalize' }}>{fmtDay(d.iso)}<span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: '#8A8699', marginTop: 2 }}>{d.slots.length} créneau{d.slots.length > 1 ? 'x' : ''}</span></button>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(88px,1fr))', gap: 8, alignContent: 'start', maxHeight: 380, overflowY: 'auto' }}>
                    {daySlots.map(s => (
                      <button key={s} className="bk-slot" onClick={() => setSelSlot(s)} style={{ padding: '11px 8px', borderRadius: 10, border: '1.5px solid rgba(34,23,122,.16)', background: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#22177A', transition: 'border-color .15s' }}>{fmtTime(s)}</button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <button onClick={() => { setSelSlot(null); setErr(''); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#4A4568', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}><ArrowLeft size={14} />Changer de créneau</button>
              <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 19, color: '#1A1533', marginTop: 14 }}>Confirmez votre RDV</div>
              <div style={{ fontSize: 14, color: '#22177A', fontWeight: 700, marginTop: 6, textTransform: 'capitalize' }}>{fmtDay(selSlot)} · {fmtTime(selSlot)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18, maxWidth: 420 }}>
                <div><label style={lbl}>Votre nom</label><input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="Jean Dupont" /></div>
                <div><label style={lbl}>Votre email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} placeholder="jean@email.com" /></div>
                <div><label style={lbl}>Message (optionnel)</label><textarea value={note} onChange={e => setNote(e.target.value)} style={{ ...inp, minHeight: 70, resize: 'vertical', fontFamily: "'Manrope',sans-serif" }} placeholder="Un mot pour le recruteur…" /></div>
                {err && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#B3261E', fontWeight: 600 }}><AlertCircle size={14} />{err}</div>}
                <button disabled={busy || !name.trim() || !email.trim()} onClick={submit} style={{ fontSize: 14.5, fontWeight: 800, background: name.trim() && email.trim() ? '#22177A' : '#C4C1D0', color: '#E6E9AF', border: 'none', borderRadius: 12, padding: 14, cursor: 'pointer' }}>{busy ? 'Réservation…' : 'Confirmer le rendez-vous'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8A8699', marginBottom: 6 };
const inp: React.CSSProperties = { width: '100%', fontSize: 14, padding: '11px 13px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', color: '#1A1533', outline: 'none' };
