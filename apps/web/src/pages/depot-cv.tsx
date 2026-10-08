/**
 * Page de dépôt d'un CV (PDF) sur une fiche candidat.
 * URL : /depot-cv?token=<jeton émis par l'outil MCP get_cv_upload_link>
 * Claude ne peut pas transmettre un fichier joint à l'ATS : il donne ce lien, on y glisse le PDF.
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

interface Ctx { recruteur: string; candidat: { nom: string; poste: string | null; hasCv: boolean } | null }
interface Done { candidatId: string; candidat: string; created: boolean; filename: string; replaced: boolean; profileUpdated: boolean; ficheUrl: string }

const INK = '#111827', TEXT = '#374151', MUTED = '#4B5563', LINE = '#E5E7EB', BRAND = '#22177A', CREAM = '#E6E9AF', BG = '#F7F7F8';
const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const LOGO = 'https://humanup.io/careers/logo.png';
const MAX = 10 * 1024 * 1024;

export default function DepotCvPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [invalid, setInvalid] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [update, setUpdate] = useState(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Déposer un CV | Humanup';
    if (!document.getElementById('espace-inter')) {
      const l = document.createElement('link');
      l.id = 'espace-inter'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
      document.head.appendChild(l);
    }
    if (!token) { setInvalid('Ce lien de dépôt est incomplet.'); return; }
    void fetch(`/api/v1/public/cv-depot?token=${encodeURIComponent(token)}`).then(async (r) => {
      const d = await r.json().catch(() => null);
      if (r.ok) setCtx(d as Ctx);
      else setInvalid(d?.message || 'Ce lien de dépôt a expiré ou est invalide.');
    }).catch(() => setInvalid('Impossible de joindre l’ATS. Réessayez dans un instant.'));
  }, [token]);

  function pick(f: File | undefined | null) {
    setError('');
    if (!f) return;
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) { setError('Seuls les CV au format PDF sont acceptés.'); return; }
    if (f.size > MAX) { setError('Fichier trop volumineux (10 Mo maximum).'); return; }
    setFile(f);
  }

  async function send() {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const body = new FormData();
      body.append('file', file, file.name);
      const res = await fetch(`/api/v1/public/cv-depot?token=${encodeURIComponent(token)}${update ? '&update=1' : ''}`, { method: 'POST', body });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.message || 'Le dépôt a échoué. Réessayez.');
      setDone(d as Done);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  const card: React.CSSProperties = { background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 };
  const btn: React.CSSProperties = { fontFamily: FONT, fontSize: 15, fontWeight: 600, background: BRAND, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', cursor: 'pointer' };
  const creating = ctx && !ctx.candidat;

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FONT, color: TEXT, fontSize: 15, lineHeight: 1.55, padding: '56px 20px', boxSizing: 'border-box', display: 'flex', justifyContent: 'center' }}>
      <style>{`.dcv h1,.dcv p{margin:0;font-family:inherit} .dcv button:focus-visible,.dcv a:focus-visible,.dcv input:focus-visible{outline:2px solid #6366F1;outline-offset:2px}`}</style>
      <div className="dcv" style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={LOGO} alt="" style={{ width: 36, height: 36, borderRadius: '50%' }} />
          <span style={{ fontWeight: 700, color: INK, fontSize: 16 }}>Humanup</span>
          <span style={{ color: MUTED, fontSize: 14 }}>Dépôt de CV</span>
        </div>

        {invalid && (
          <section style={card}>
            <h1 style={{ fontSize: 22, color: INK, letterSpacing: '-0.02em' }}>Lien expiré</h1>
            <p role="alert">{invalid}</p>
          </section>
        )}

        {!invalid && !ctx && <p style={{ color: MUTED }}>Chargement…</p>}

        {ctx && done && (
          <section style={card}>
            <h1 style={{ fontSize: 22, color: INK, letterSpacing: '-0.02em' }}>{done.created ? 'Candidat créé' : 'CV déposé'}</h1>
            <p role="status">
              <b style={{ color: INK }}>{done.filename}</b> est {done.replaced ? 'le nouveau CV' : 'attaché à la fiche'} de <b style={{ color: INK }}>{done.candidat}</b>.
              {done.created ? ' La fiche a été remplie à partir du CV.' : done.profileUpdated ? ' La fiche a été mise à jour à partir du CV.' : ''}
            </p>
            <a href={done.ficheUrl} style={{ ...btn, textAlign: 'center', textDecoration: 'none' }}>Ouvrir la fiche</a>
            <button onClick={() => { setDone(null); setFile(null); }} style={{ fontFamily: FONT, fontSize: 14, fontWeight: 600, color: BRAND, background: 'none', border: 'none', cursor: 'pointer', padding: 0, alignSelf: 'center' }}>Déposer un autre fichier</button>
          </section>
        )}

        {ctx && !done && (
          <section style={card}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h1 style={{ fontSize: 22, color: INK, letterSpacing: '-0.02em' }}>{creating ? 'Créer un candidat depuis un CV' : `CV de ${ctx.candidat!.nom}`}</h1>
              <p style={{ fontSize: 14, color: MUTED }}>
                {creating ? 'La fiche sera créée et remplie à partir du CV.' : ctx.candidat!.hasCv ? 'Ce fichier remplacera le CV actuel de la fiche.' : [ctx.candidat!.poste, 'Aucun CV sur la fiche pour l’instant.'].filter(Boolean).join(' · ')}
              </p>
            </div>

            <div
              role="button" tabIndex={0} aria-label="Choisir un fichier PDF"
              onClick={() => input.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
              style={{ border: `2px dashed ${over ? BRAND : '#C7C9D1'}`, background: over ? '#F3F4D9' : BG, borderRadius: 12, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {file ? (
                <>
                  <span style={{ fontWeight: 600, color: INK, overflowWrap: 'anywhere' }}>{file.name}</span>
                  <span style={{ fontSize: 13, color: MUTED }}>{Math.max(1, Math.round(file.size / 1024))} Ko · cliquer pour changer</span>
                </>
              ) : (
                <>
                  <span style={{ fontWeight: 600, color: INK }}>Glissez le CV ici</span>
                  <span style={{ fontSize: 13, color: MUTED }}>ou cliquez pour choisir un fichier · PDF, 10 Mo maximum</span>
                </>
              )}
              <input ref={input} type="file" accept="application/pdf,.pdf" onChange={(e) => pick(e.target.files?.[0])} style={{ display: 'none' }} />
            </div>

            {!creating && (
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={update} onChange={(e) => setUpdate(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: BRAND }} />
                <span>Mettre aussi la fiche à jour à partir du CV (poste, expériences, synthèse). Un dossier client protégé n’est pas modifié.</span>
              </label>
            )}

            {error && <p role="alert" style={{ fontSize: 14, color: '#B42318', fontWeight: 600 }}>{error}</p>}

            <button onClick={send} disabled={!file || busy} style={{ ...btn, background: file ? BRAND : '#9CA3AF', cursor: file && !busy ? 'pointer' : 'default', opacity: busy ? 0.7 : 1 }}>
              {busy ? (creating || update ? 'Lecture du CV…' : 'Envoi…') : creating ? 'Créer le candidat' : 'Déposer le CV'}
            </button>
          </section>
        )}

        {ctx && <p style={{ fontSize: 13, color: MUTED }}>Lien personnel de {ctx.recruteur || 'votre compte'}, valable 2 heures. <span style={{ background: CREAM, color: BRAND, borderRadius: 999, padding: '1px 8px', fontWeight: 600 }}>Ne le partagez pas</span></p>}
      </div>
    </div>
  );
}
