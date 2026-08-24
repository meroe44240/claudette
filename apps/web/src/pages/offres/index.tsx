import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Eye, EyeOff, Pencil, Trash2, X, Link2, MapPin, Copy, Check } from 'lucide-react';
import { api } from '../../lib/api-client';
import { usePageTitle } from '../../hooks/usePageTitle';
import { toast } from '../../components/ui/Toast';

interface JobOffer {
  id: string; slug: string; titre: string; description: string;
  descriptionSociete: string | null; missions: string | null; packageInfo: string | null;
  localisation: string | null;
  contractType: string | null; remote: string | null; salaireMin: number | null; salaireMax: number | null;
  secteur: string | null; entrepriseNom: string | null; tags: string[]; published: boolean; createdAt: string;
}
type Form = Omit<JobOffer, 'id' | 'slug' | 'createdAt'> & { id?: string };

const CONTRACTS = ['CDI', 'CDD', 'FREELANCE', 'ALTERNANCE', 'STAGE'];
const REMOTES = [{ v: 'ONSITE', l: 'Sur site' }, { v: 'HYBRID', l: 'Hybride' }, { v: 'REMOTE', l: 'Full remote' }];

function empty(): Form { return { titre: '', description: '', descriptionSociete: '', missions: '', packageInfo: '', localisation: '', contractType: 'CDI', remote: 'HYBRID', salaireMin: null, salaireMax: null, secteur: '', entrepriseNom: '', tags: [], published: false }; }
function salaire(min: number | null, max: number | null) { if (min && max) return `${(min / 1000).toFixed(0)}–${(max / 1000).toFixed(0)}k€`; if (min) return `≥ ${(min / 1000).toFixed(0)}k€`; if (max) return `≤ ${(max / 1000).toFixed(0)}k€`; return null; }

export default function OffresPage() {
  usePageTitle('Job board');
  const qc = useQueryClient();
  const [modal, setModal] = useState<Form | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: offers } = useQuery({ queryKey: ['job-offers'], queryFn: () => api.get<JobOffer[]>('/job-offers') });
  const publicUrl = `${window.location.origin.replace(':5173', ':3001')}/api/v1/public/job-offers`;

  const inv = () => qc.invalidateQueries({ queryKey: ['job-offers'] });
  const saveMut = useMutation({
    mutationFn: (f: Form) => f.id ? api.put(`/job-offers/${f.id}`, f) : api.post('/job-offers', f),
    onSuccess: () => { inv(); setModal(null); toast('success', 'Offre enregistrée'); },
  });
  const pubMut = useMutation({ mutationFn: ({ id, published }: { id: string; published: boolean }) => api.patch(`/job-offers/${id}/publish`, { published }), onSuccess: inv });
  const delMut = useMutation({ mutationFn: (id: string) => api.delete(`/job-offers/${id}`), onSuccess: () => { inv(); toast('success', 'Offre supprimée'); } });

  const list = offers ?? [];
  const publishedCount = list.filter(o => o.published).length;

  return (
    <div>
      <style>{`
        .off-card:hover{ box-shadow:0 20px 40px -28px rgba(34,23,122,.4); border-color:rgba(34,23,122,.16) !important; }
        .off-card{ transition:box-shadow .22s ease, border-color .22s ease; }
        .st-in:focus{ outline:none; border-color:#22177A; box-shadow:0 0 0 3px rgba(34,23,122,.1); }
      `}</style>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, color: '#9A96AE', fontWeight: 600 }}>Recrutement</div>
          <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 38, letterSpacing: '-0.035em', color: '#1A1533', marginTop: 4 }}>Job board</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,0.12)', borderRadius: 999, padding: '8px 15px' }}>{publishedCount} publiée{publishedCount > 1 ? 's' : ''} · {list.length} au total</span>
          <button onClick={() => setModal(empty())} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontWeight: 700, fontSize: 14, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 12, padding: '12px 20px', cursor: 'pointer', boxShadow: '0 10px 22px -14px rgba(34,23,122,0.7)' }}><Plus size={16} strokeWidth={2.4} />Nouvelle offre</button>
        </div>
      </div>

      {/* PUBLIC API BANNER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, padding: '13px 18px', background: '#F2F3D8', border: '1px solid rgba(34,23,122,.14)', borderRadius: 14 }}>
        <Link2 size={17} color="#22177A" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#22177A' }}>API publique — à brancher sur le job board de votre landing</div>
          <code style={{ fontSize: 12, color: '#4A4568', wordBreak: 'break-all' }}>{publicUrl}</code>
        </div>
        <button onClick={() => { navigator.clipboard?.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,.18)', borderRadius: 9, padding: '7px 12px', cursor: 'pointer' }}>{copied ? <><Check size={13} />Copié</> : <><Copy size={13} />Copier</>}</button>
      </div>

      {/* LIST */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 14, marginTop: 20 }}>
        {list.length === 0 && <div style={{ gridColumn: '1 / -1', border: '1.5px dashed rgba(34,23,122,.2)', borderRadius: 16, padding: '40px 20px', textAlign: 'center', color: '#8A8699', fontSize: 14 }}>Aucune offre. Créez-en une, puis publiez-la pour qu'elle apparaisse sur votre job board.</div>}
        {list.map(o => (
          <div key={o.id} className="off-card" style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 16, padding: 18, boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: '#1A1533' }}>{o.titre}</div>
                <div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 2 }}>{[o.entrepriseNom || 'Entreprise confidentielle', o.contractType].filter(Boolean).join(' · ')}</div>
              </div>
              <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '4px 10px', background: o.published ? '#EAF3EC' : 'rgba(34,23,122,.06)', color: o.published ? '#2C6B3F' : '#8A8699' }}>{o.published ? 'Publiée' : 'Brouillon'}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, fontSize: 12, color: '#6E6A85' }}>
              {o.localisation && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MapPin size={12} color="#9A96AE" />{o.localisation}</span>}
              {salaire(o.salaireMin, o.salaireMax) && <span style={{ fontWeight: 700, color: '#2C6B3F' }}>{salaire(o.salaireMin, o.salaireMax)}</span>}
              {o.remote && <span>{REMOTES.find(r => r.v === o.remote)?.l ?? o.remote}</span>}
            </div>
            {o.tags.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 11 }}>{o.tags.slice(0, 5).map(t => <span key={t} style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 9px', background: '#F2F3D8', color: '#22177A' }}>{t}</span>)}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(34,23,122,.07)' }}>
              <button onClick={() => pubMut.mutate({ id: o.id, published: !o.published })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: o.published ? '#8A6A2E' : '#22177A', background: o.published ? '#FBF3E7' : '#F0EFC4', border: 'none', borderRadius: 9, padding: '7px 12px', cursor: 'pointer' }}>{o.published ? <><EyeOff size={13} />Dépublier</> : <><Eye size={13} />Publier</>}</button>
              <button onClick={() => setModal({ ...o })} style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(34,23,122,.14)', background: '#fff', color: '#22177A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={14} /></button>
              <button onClick={() => { if (confirm('Supprimer cette offre ?')) delMut.mutate(o.id); }} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(176,54,31,.18)', background: '#fff', color: '#B3261E', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL */}
      {modal && <OfferModal form={modal} onClose={() => setModal(null)} onSave={f => saveMut.mutate(f)} saving={saveMut.isPending} />}
    </div>
  );
}

function OfferModal({ form, onClose, onSave, saving }: { form: Form; onClose: () => void; onSave: (f: Form) => void; saving: boolean }) {
  const [f, setF] = useState<Form>(form);
  const [tagInput, setTagInput] = useState('');
  const set = (k: keyof Form, v: any) => setF(p => ({ ...p, [k]: v }));
  const inStyle: React.CSSProperties = { width: '100%', fontSize: 13.5, padding: '10px 12px', borderRadius: 10, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', color: '#1A1533', outline: 'none' };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: '#6E6A85', marginBottom: 6 };
  const num = (v: string) => v === '' ? null : parseInt(v, 10);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(26,21,51,.42)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 91, width: 620, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 22, boxShadow: '0 44px 96px -40px rgba(0,0,0,.55)', padding: '26px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: '#1A1533' }}>{f.id ? 'Modifier l\'offre' : 'Nouvelle offre'}</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(34,23,122,.14)', background: '#fff', color: '#22177A', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18 }}>
          <div><label style={lbl}>Intitulé du poste *</label><input className="st-in" value={f.titre} onChange={e => set('titre', e.target.value)} style={inStyle} placeholder="Account Executive SaaS" /></div>
          <div><label style={lbl}>Accroche (résumé court) *</label><textarea className="st-in" value={f.description} onChange={e => set('description', e.target.value)} style={{ ...inStyle, minHeight: 62, resize: 'vertical', fontFamily: "'Manrope',sans-serif" }} placeholder="Une ou deux phrases qui donnent envie de lire la suite…" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={lbl}>Entreprise (public)</label><input className="st-in" value={f.entrepriseNom ?? ''} onChange={e => set('entrepriseNom', e.target.value)} style={inStyle} placeholder="ou vide = confidentiel" /></div>
            <div><label style={lbl}>Localisation</label><input className="st-in" value={f.localisation ?? ''} onChange={e => set('localisation', e.target.value)} style={inStyle} placeholder="Paris (75)" /></div>
            <div><label style={lbl}>Contrat</label><select value={f.contractType ?? ''} onChange={e => set('contractType', e.target.value)} style={{ ...inStyle, cursor: 'pointer' }}>{CONTRACTS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label style={lbl}>Télétravail</label><select value={f.remote ?? ''} onChange={e => set('remote', e.target.value)} style={{ ...inStyle, cursor: 'pointer' }}>{REMOTES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</select></div>
            <div><label style={lbl}>Salaire min (€/an)</label><input className="st-in" value={f.salaireMin ?? ''} onChange={e => set('salaireMin', num(e.target.value))} style={inStyle} placeholder="45000" /></div>
            <div><label style={lbl}>Salaire max (€/an)</label><input className="st-in" value={f.salaireMax ?? ''} onChange={e => set('salaireMax', num(e.target.value))} style={inStyle} placeholder="60000" /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Secteur</label><input className="st-in" value={f.secteur ?? ''} onChange={e => set('secteur', e.target.value)} style={inStyle} placeholder="SaaS / Tech" /></div>
          </div>
          <div><label style={lbl}>Description de la société</label><textarea className="st-in" value={f.descriptionSociete ?? ''} onChange={e => set('descriptionSociete', e.target.value)} style={{ ...inStyle, minHeight: 84, resize: 'vertical', fontFamily: "'Manrope',sans-serif" }} placeholder="Qui est l'entreprise, son marché, sa taille, sa culture, sa mission…" /></div>
          <div><label style={lbl}>Missions</label><textarea className="st-in" value={f.missions ?? ''} onChange={e => set('missions', e.target.value)} style={{ ...inStyle, minHeight: 100, resize: 'vertical', fontFamily: "'Manrope',sans-serif" }} placeholder={'Les responsabilités du poste. Une mission par ligne :\n• Prospecter et qualifier…\n• Piloter le cycle de vente…'} /></div>
          <div><label style={lbl}>Package</label><textarea className="st-in" value={f.packageInfo ?? ''} onChange={e => set('packageInfo', e.target.value)} style={{ ...inStyle, minHeight: 84, resize: 'vertical', fontFamily: "'Manrope',sans-serif" }} placeholder={'Rémunération, variable, avantages, BSPCE, télétravail, matériel…\n(le salaire chiffré ci-dessus s\'affiche aussi automatiquement)'} /></div>
          <div>
            <label style={lbl}>Compétences / tags</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="st-in" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const t = tagInput.trim(); if (t) { set('tags', [...f.tags, t]); setTagInput(''); } } }} style={inStyle} placeholder="Entrée pour ajouter…" />
            </div>
            {f.tags.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{f.tags.map((t, i) => <span key={i} onClick={() => set('tags', f.tags.filter((_, j) => j !== i))} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#22177A', background: '#F2F3D8', border: '1px solid rgba(34,23,122,.14)', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>{t}<X size={11} strokeWidth={2.8} /></span>)}</div>}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, padding: '11px 14px', background: '#F2F3D8', border: '1px solid rgba(34,23,122,.14)', borderRadius: 12, cursor: 'pointer' }}>
            <span onClick={() => set('published', !f.published)} style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${f.published ? '#22177A' : 'rgba(34,23,122,.25)'}`, background: f.published ? '#E6E9AF' : '#fff' }}>{f.published && <Check size={12} color="#22177A" />}</span>
            <span style={{ fontSize: 13, color: '#4A4568' }}>Publier sur le job board (visible via l'API publique)</span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, fontSize: 14, fontWeight: 700, background: '#F5F4EA', color: '#4A4568', border: 'none', borderRadius: 12, padding: 12, cursor: 'pointer' }}>Annuler</button>
          <button disabled={saving || !f.titre.trim() || !f.description.trim()} onClick={() => onSave(f)} style={{ flex: 1.4, fontSize: 14, fontWeight: 700, background: f.titre.trim() && f.description.trim() ? '#22177A' : '#C4C1D0', color: '#E6E9AF', border: 'none', borderRadius: 12, padding: 12, cursor: 'pointer' }}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </>
  );
}
