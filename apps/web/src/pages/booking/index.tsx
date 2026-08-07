import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Video, Link2, Copy, Check, Calendar, ExternalLink, Plus, Trash2, Users, Building2, CalendarClock } from 'lucide-react';
import { api } from '../../lib/api-client';
import { usePageTitle } from '../../hooks/usePageTitle';
import { toast } from '../../components/ui/Toast';

interface Window { day: number; start: string; end: string }
interface Settings { id?: string; kind: string; mandatId: string | null; slug: string; title: string; durationMin: number; timezone: string; availability: Window[]; bufferMin: number; advanceDays: number; isActive: boolean }
interface Booking { id: string; slotStart: string; slotEnd: string; inviteeName: string; inviteeEmail: string; meetLink: string | null }
interface MandatOpt { id: string; titrePoste: string; entreprise?: { nom: string } | null }

const DAYS = [{ n: 1, l: 'Lundi' }, { n: 2, l: 'Mardi' }, { n: 3, l: 'Mercredi' }, { n: 4, l: 'Jeudi' }, { n: 5, l: 'Vendredi' }, { n: 6, l: 'Samedi' }, { n: 0, l: 'Dimanche' }];
const DEFAULT_WINDOW = { start: '09:00', end: '18:00' };

const KINDS: Record<string, { label: string; sub: string; icon: any; title: string }> = {
  DISCOVERY: { label: 'Discovery call', sub: 'Pour un client / prospect', icon: Building2, title: 'Discovery call' },
  QUALIFICATION: { label: 'Qualification', sub: 'Pour un candidat', icon: Users, title: 'Qualification candidat' },
  GENERIC: { label: 'Général', sub: 'RDV standard', icon: CalendarClock, title: 'Prendre rendez-vous' },
};

function template(kind: string): Settings {
  return { kind, mandatId: null, slug: '', title: KINDS[kind]?.title ?? 'Prendre rendez-vous', durationMin: 30, timezone: 'Europe/Paris', availability: [1, 2, 3, 4, 5].map(day => ({ day, ...DEFAULT_WINDOW })), bufferMin: 0, advanceDays: 14, isActive: true };
}

export default function BookingSettingsPage() {
  usePageTitle('Rendez-vous');
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [f, setF] = useState<Settings | null>(null);
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);

  const { data: types } = useQuery({ queryKey: ['booking', 'settings'], queryFn: () => api.get<Settings[]>('/booking/settings') });
  const { data: bookings } = useQuery({ queryKey: ['booking', 'my-bookings'], queryFn: () => api.get<Booking[]>('/booking/my-bookings') });
  const { data: mandatsData } = useQuery({ queryKey: ['mandats', 'forBooking'], queryFn: () => api.get<{ data: MandatOpt[] }>('/mandats?perPage=100') });
  const mandats = mandatsData?.data ?? [];

  // Sélectionne le 1er type au chargement (ou un template si aucun)
  useEffect(() => {
    if (!types || selectedId !== null) return;
    if (types.length > 0) { setSelectedId(types[0].id!); setF(types[0]); }
    else { setSelectedId('new'); setF(template('DISCOVERY')); }
  }, [types, selectedId]);

  const selectType = (t: Settings) => { setSelectedId(t.id!); setF(t); };
  const newType = () => { setSelectedId('new'); setF(template('DISCOVERY')); };

  const saveMut = useMutation({
    mutationFn: (body: Settings) => body.id ? api.put<Settings>(`/booking/settings/${body.id}`, body) : api.post<Settings>('/booking/settings', body),
    onSuccess: (s) => { qc.invalidateQueries({ queryKey: ['booking', 'settings'] }); setF(s); setSelectedId(s.id!); toast('success', 'Type de réservation enregistré'); },
    onError: (e: any) => toast('error', e?.message || 'Erreur'),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/booking/settings/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['booking', 'settings'] }); setSelectedId(null); setF(null); toast('info', 'Type supprimé'); },
    onError: (e: any) => toast('error', e?.message || 'Erreur'),
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
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, color: '#9A96AE', fontWeight: 600 }}>Rendez-vous</div>
          <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 38, letterSpacing: '-0.035em', color: '#1A1533', marginTop: 4 }}>Mes pages de réservation</h1>
        </div>
        {f.id && f.slug && <a href={publicUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,.16)', borderRadius: 11, padding: '10px 16px', textDecoration: 'none' }}><ExternalLink size={15} />Voir cette page</a>}
      </div>

      {/* Onglets des types */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
        {(types ?? []).map(t => {
          const K = KINDS[t.kind] ?? KINDS.GENERIC; const Icon = K.icon; const on = selectedId === t.id;
          return (
            <button key={t.id} onClick={() => selectType(t)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, padding: '9px 14px', borderRadius: 11, border: `1.5px solid ${on ? '#22177A' : 'rgba(34,23,122,.14)'}`, background: on ? '#22177A' : '#fff', color: on ? '#E6E9AF' : '#4A4568', cursor: 'pointer' }}>
              <Icon size={14} />{t.title}{!t.isActive && <span style={{ fontSize: 10, opacity: .7 }}>(inactif)</span>}
            </button>
          );
        })}
        <button onClick={newType} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, padding: '9px 14px', borderRadius: 11, border: '1.5px dashed rgba(34,23,122,.28)', background: '#fff', color: '#22177A', cursor: 'pointer' }}><Plus size={14} />Nouveau type</button>
      </div>

      {/* Lien public */}
      {f.slug && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, padding: '13px 18px', background: '#F2F3D8', border: '1px solid rgba(34,23,122,.14)', borderRadius: 14 }}>
          <Link2 size={17} color="#22177A" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#22177A' }}>Lien de réservation de ce type — à partager</div>
            <code style={{ fontSize: 12, color: '#4A4568', wordBreak: 'break-all' }}>{publicUrl}</code>
          </div>
          <button onClick={() => { navigator.clipboard?.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,.18)', borderRadius: 9, padding: '7px 12px', cursor: 'pointer' }}>{copied ? <><Check size={13} />Copié</> : <><Copy size={13} />Copier</>}</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 20, marginTop: 18, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 16, padding: 22, boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
          {/* Type */}
          <label style={lbl}>Type de page</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 18 }}>
            {Object.entries(KINDS).map(([k, K]) => { const Icon = K.icon; const on = f.kind === k; return (
              <button key={k} onClick={() => setF({ ...f, kind: k, title: f.title || K.title })} style={{ textAlign: 'left', padding: '11px 12px', borderRadius: 12, border: `1.5px solid ${on ? '#22177A' : 'rgba(34,23,122,.14)'}`, background: on ? '#F3F0FA' : '#fff', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, color: '#1A1533' }}><Icon size={14} color="#22177A" />{K.label}</div>
                <div style={{ fontSize: 11, color: '#8A8699', marginTop: 2 }}>{K.sub}</div>
              </button>
            ); })}
          </div>

          {/* Mandat lié (Qualification) */}
          {f.kind === 'QUALIFICATION' && (
            <div style={{ marginBottom: 18 }}>
              <label style={lbl}>Mandat rattaché (optionnel)</label>
              <select value={f.mandatId ?? ''} onChange={e => setF({ ...f, mandatId: e.target.value || null })} style={{ ...inp, width: '100%', cursor: 'pointer' }}>
                <option value="">— Aucun (qualification générale) —</option>
                {mandats.map(m => <option key={m.id} value={m.id}>{m.titrePoste}{m.entreprise?.nom ? ` · ${m.entreprise.nom}` : ''}</option>)}
              </select>
              <div style={{ fontSize: 11, color: '#9A96AE', marginTop: 6 }}>Si un mandat est choisi, le candidat qui réserve est automatiquement rattaché à ce mandat (étape Contacté).</div>
            </div>
          )}

          <div style={{ fontWeight: 800, fontSize: 16, color: '#1A1533' }}>Réglages</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px', gap: 12, marginTop: 16 }}>
            <div><label style={lbl}>Titre</label><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} style={{ ...inp, width: '100%' }} /></div>
            <div><label style={lbl}>Durée (min)</label><input value={f.durationMin} onChange={e => setF({ ...f, durationMin: parseInt(e.target.value) || 30 })} style={{ ...inp, width: '100%' }} /></div>
            <div><label style={lbl}>Réservable (j)</label><input value={f.advanceDays} onChange={e => setF({ ...f, advanceDays: parseInt(e.target.value) || 14 })} style={{ ...inp, width: '100%' }} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Identifiant du lien (slug)</label><input value={f.slug} onChange={e => setF({ ...f, slug: e.target.value })} style={{ ...inp, width: '100%' }} placeholder="auto si vide" /></div>
          </div>

          <div style={{ fontWeight: 800, fontSize: 14, color: '#1A1533', marginTop: 22 }}>Disponibilités</div>
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
            <button disabled={saveMut.isPending} onClick={() => saveMut.mutate(f)} style={{ fontSize: 14, fontWeight: 700, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 11, padding: '12px 24px', cursor: 'pointer' }}>{saveMut.isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#4A4568', cursor: 'pointer' }}>
              <span onClick={() => setF({ ...f, isActive: !f.isActive })} style={{ width: 19, height: 19, borderRadius: 6, border: `1.5px solid ${f.isActive ? '#22177A' : 'rgba(34,23,122,.25)'}`, background: f.isActive ? '#E6E9AF' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{f.isActive && <Check size={12} color="#22177A" />}</span>
              Active
            </label>
            {f.id && <button onClick={() => { if (confirm('Supprimer ce type de page ?')) delMut.mutate(f.id!); }} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#B3261E', background: '#FBF1EF', border: 'none', borderRadius: 10, padding: '9px 14px', cursor: 'pointer' }}><Trash2 size={13} />Supprimer</button>}
          </div>
          <div style={{ fontSize: 11.5, color: '#9A96AE', marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Video size={13} />Lien Google Meet + invitation envoyés automatiquement à chaque réservation.</div>
        </div>

        {/* Prochains RDV */}
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
