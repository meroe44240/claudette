import { useRef, useState } from 'react';
import { Camera, Link2, FileText, Trash2, Upload, Loader2 } from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from '../ui/Toast';

// Photo du candidat : clic sur l'avatar → importer une image, coller un lien
// (l'image est téléchargée et hébergée par l'ATS), prendre la photo du CV, retirer.

const authHeader = (): Record<string, string> => { const t = localStorage.getItem('accessToken'); return t ? { Authorization: `Bearer ${t}` } : {}; };

export default function PhotoMenu({ candidatId, photoUrl, initials, hasCv, size = 104, onChanged }: {
  candidatId: string; photoUrl: string | null; initials: string; hasCv: boolean; size?: number; onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [link, setLink] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const close = () => { setOpen(false); setLinkMode(false); setLink(''); };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast('success', ok); onChanged(); close(); }
    catch (e: any) { toast('error', e?.message || 'Échec'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const upload = (file: File) => run(async () => {
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch(`/api/v1/candidats/${candidatId}/photo`, { method: 'POST', headers: { ...authHeader() }, body: fd });
    if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.message || "Échec de l'envoi"); }
  }, 'Photo mise à jour');

  return (
    <span style={{ position: 'relative', flexShrink: 0, display: 'inline-block' }}>
      <button className="ph-btn" onClick={() => setOpen(o => !o)} aria-label="Changer la photo" title="Changer la photo" style={{ position: 'relative', width: size, height: size, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer', background: 'none', display: 'block' }}>
        {photoUrl
          ? <img src={photoUrl} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', background: '#F2F3D8', display: 'block' }} />
          : <span style={{ width: size, height: size, borderRadius: '50%', background: '#22177A', color: '#E6E9AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black',sans-serif", fontSize: size / 3 }}>{initials}</span>}
        <span className="ph-over" style={{ position: 'absolute', right: 0, bottom: 0, width: 30, height: 30, borderRadius: '50%', background: '#fff', border: '1px solid rgba(34,23,122,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px -8px rgba(26,21,51,.5)' }}>
          {busy ? <Loader2 size={14} color="#22177A" className="spin" /> : <Camera size={14} color="#22177A" />}
        </span>
      </button>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />

      {open && (
        <>
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div className="fc-menu" style={{ position: 'absolute', top: size + 8, left: 0, zIndex: 41, background: '#fff', border: '1px solid rgba(34,23,122,.12)', borderRadius: 12, padding: 5, boxShadow: '0 18px 40px -20px rgba(26,21,51,.45)', width: 270 }}>
            {!linkMode ? (
              <>
                <button disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={14} />Importer une image</button>
                <button disabled={busy} onClick={() => setLinkMode(true)}><Link2 size={14} />Coller un lien</button>
                <button disabled={busy || !hasCv} title={hasCv ? undefined : 'Aucun CV sur la fiche'} style={{ opacity: hasCv ? 1 : 0.45 }} onClick={() => run(() => api.post(`/candidats/${candidatId}/photo/from-cv`), 'Photo du CV appliquée')}><FileText size={14} />{busy ? 'Recherche dans le CV…' : 'Prendre la photo du CV'}</button>
                {photoUrl && <button disabled={busy} style={{ color: '#B3261E' }} onClick={() => run(() => api.delete(`/candidats/${candidatId}/photo`), 'Photo retirée')}><Trash2 size={14} />Retirer la photo</button>}
              </>
            ) : (
              <div style={{ padding: 8 }}>
                <input autoFocus value={link} onChange={e => setLink(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && link.trim()) run(() => api.post(`/candidats/${candidatId}/photo/url`, { url: link.trim() }), 'Photo mise à jour'); }} placeholder="https://… (JPG, PNG ou WebP)" style={{ width: '100%', fontSize: 13, padding: '9px 11px', borderRadius: 9, border: '1.5px solid rgba(34,23,122,.16)', background: '#FCFCF5', outline: 'none' }} />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={() => { setLinkMode(false); setLink(''); }} style={{ justifyContent: 'center', background: '#F5F4EA' }}>Retour</button>
                  <button disabled={busy || !link.trim()} onClick={() => run(() => api.post(`/candidats/${candidatId}/photo/url`, { url: link.trim() }), 'Photo mise à jour')} style={{ justifyContent: 'center', background: '#22177A', color: '#E6E9AF', opacity: link.trim() ? 1 : 0.5 }}>{busy ? 'Envoi…' : 'Valider'}</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </span>
  );
}
