import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Video, Link2, Copy, Check, Calendar, ExternalLink } from 'lucide-react';
import { api } from '../../lib/api-client';
import { usePageTitle } from '../../hooks/usePageTitle';
import { toast } from '../../components/ui/Toast';

interface Window { day: number; start: string; end: string }
interface Settings { slug: string; title: string; durationMin: number; timezone: string; availability: Window[]; bufferMin: number; advanceDays: number; isActive: boolean }
interface Booking { id: string; slotStart: string; slotEnd: string; inviteeName: string; inviteeEmail: string; meetLink: string | null }

const DAYS = [{ n: 1, l: 'Lundi' }, { n: 2, l: 'Mardi' }, { n: 3, l: 'Mercredi' }, { n: 4, l: 'Jeudi' }, { n: 5, l: 'Vendredi' }, { n: 6, l: 'Samedi' }, { n: 0, l: 'Dimanche' }];
const DEFAULT_WINDOW = { start: '09:00', end: '18:00' };

export default function BookingSettingsPage() {
  usePageTitle('Rendez-vous');
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [f, setF] = useState<Settings | null>(null);

  const { data: settings } = useQuery({ queryKey: ['booking', 'settings'], queryFn: () => api.get<Settings | null>('/booking/settings') });
  const { data: bookings } = useQuery({ queryKey: ['booking', 'my-bookings'], queryFn: () => api.get<Booking[]>('/booking/my-bookings') });

  useEffect(() => {
    if (f) return;
    setF(settings ?? { slug: '', title: 'Prendre rendez-vous', durationMin: 30, timezone: 'Europe/Paris', availability: [1, 2, 3, 4, 5].map(day => ({ day, ...DEFAULT_WINDOW })), bufferMin: 0, advanceDays: 14, isActive: true });
  }, [settings, f]);

  const saveMut = useMutation({
    mutationFn: (body: Partial<Settings>) => api.put<Settings>('/booking/settings', body),
    onSuccess: (s) => { qc.setQueryData(['booking', 'settings'], s); setF(s); toast('success', 'Page de réservation enregistrée'); },
  });

  if (!f) return <div style={{ padding: 40, color: '#8A8699' }}>Chargement…</div>;
  const publicUrl = `${window.location.origin}/book/${f.slug || '…'}`;
  const dayOn = (n: number) => f.availability.some(w => w.day === n);
  const toggleDay = (n: number) => setF(p => p ? ({ ...p, availability: dayOn(n) ? p.availability.filter(w => w.day !== n) : [...p.availability, { day: n, ...DEFAULT_WINDOW }] }) : p);
  const setWin = (n: number, k: 'start' | 'end', v: string) => setF(p => p ? ({ ...p, availability: p.availability.map(w => w.day === n ? { ...w, [k]: v } : w) }) : p);

  const inp: React.CSSProperties = { fontSize: 13.5, padding: '9px 11px', borderRadius: 9, border: '1.5px solid rgba(34,23,122,.14)', background: '#fff', color: '#1A1533', outline: 'none' };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: '#6E6A85', marginBottom: 6 };

  return (
    <div>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, color: '#9A96AE', fontWeight: 600 }}>Rendez-vous</div>
          <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 38, letterSpacing: '-0.035em', color: '#1A1533', marginTop: 4 }}>Ma page de réservation</h1>
        </div>
        {settings?.slug && <a href={publicUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,.16)', borderRadius: 11, padding: '10px 16px', textDecoration: 'none' }}><ExternalLink size={15} />Voir ma page</a>}
      </div>

      {/* PUBLIC URL */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, padding: '13px 18px', background: '#F2F3D8', border: '1px solid rgba(34,23,122,.14)', borderRadius: 14 }}>
        <Link2 size={17} color="#22177A" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#22177A' }}>Votre lien de réservation — à partager (remplace Calendly)</div>
          <code style={{ fontSize: 12, color: '#4A4568', wordBreak: 'break-all' }}>{publicUrl}</code>
        </div>
        <button onClick={() => { navigator.clipboard?.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,.18)', borderRadius: 9, padding: '7px 12px', cursor: 'pointer' }}>{copied ? <><Check size={13} />Copié</> : <><Copy size={13} />Copier</>}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 20, marginTop: 20, alignItems: 'start' }}>
        {/* SETTINGS */}
        <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 16, padding: 22, boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#1A1533' }}>Réglages</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px', gap: 12, marginTop: 16 }}>
            <div><label style={lbl}>Titre</label><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} style={{ ...inp, width: '100%' }} /></div>
            <div><label style={lbl}>Durée (min)</label><input value={f.durationMin} onChange={e => setF({ ...f, durationMin: parseInt(e.target.value) || 30 })} style={{ ...inp, width: '100%' }} /></div>
            <div><label style={lbl}>Réservable (j)</label><input value={f.advanceDays} onChange={e => setF({ ...f, advanceDays: parseInt(e.target.value) || 14 })} style={{ ...inp, width: '100%' }} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Identifiant du lien (slug)</label><input value={f.slug} onChange={e => setF({ ...f, slug: e.target.value })} style={{ ...inp, width: '100%' }} placeholder="prenom-nom (auto si vide)" /></div>
          </div>

          <div style={{ fontWeight: 800, fontSize: 14, color: '#1A1533', marginTop: 22 }}>Mes disponibilités</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {DAYS.map(({ n, l }) => {
              const on = dayOn(n); const w = f.availability.find(x => x.day === n);
              return (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 11, border: '1px solid rgba(34,23,122,.1)', background: on ? '#FCFCF5' : '#fff' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', width: 120 }}>
                    <span onClick={() => toggleDay(n)} style={{ width: 19, height: 19, borderRadius: 6, border: `1.5px solid ${on ? '#22177A' : 'rgba(34,23,122,.25)'}`, background: on ? '#E6E9AF' : '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on && <Check size={12} color="#22177A" />}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: on ? '#1A1533' : '#9A96AE' }}>{l}</span>
                  </label>
                  {on && w ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                      <input type="time" value={w.start} onChange={e => setWin(n, 'start', e.target.value)} style={inp} />
                      <span style={{ color: '#8A8699' }}>→</span>
                      <input type="time" value={w.end} onChange={e => setWin(n, 'end', e.target.value)} style={inp} />
                    </div>
                  ) : <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#C4C1D0' }}>Indisponible</span>}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button disabled={saveMut.isPending} onClick={() => saveMut.mutate(f)} style={{ fontSize: 14, fontWeight: 700, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 11, padding: '12px 24px', cursor: 'pointer' }}>{saveMut.isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
            <span style={{ fontSize: 11.5, color: '#9A96AE', alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Video size={13} />Lien Google Meet généré + invitation envoyée automatiquement à chaque réservation.</span>
          </div>
        </div>

        {/* UPCOMING */}
        <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 16, padding: 20, boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 15, color: '#1A1533' }}><Calendar size={16} color="#22177A" />Prochains RDV</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {(bookings ?? []).length === 0 && <div style={{ fontSize: 13, color: '#9A96AE', padding: '14px 4px' }}>Aucune réservation pour l'instant.</div>}
            {(bookings ?? []).map(b => (
              <div key={b.id} style={{ padding: '11px 13px', border: '1px solid rgba(34,23,122,.1)', borderRadius: 11 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1533' }}>{b.inviteeName}</div>
                <div style={{ fontSize: 12, color: '#8A8699', marginTop: 2 }}>{new Date(b.slotStart).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <a href={`mailto:${b.inviteeEmail}`} style={{ fontSize: 11.5, color: '#22177A', fontWeight: 600 }}>{b.inviteeEmail}</a>
                  {b.meetLink && <a href={b.meetLink} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: '#22177A' }}><Video size={12} />Meet</a>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
