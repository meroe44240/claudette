import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Check, ArrowUp, Camera, Lock } from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from '../ui/Toast';

// Éditeur du dossier que le client voit sur le portail (synthèse, cartes d'infos,
// adéquation au poste, sections, photo). Aperçu à droite = rendu du portail.

interface Info { label: string; value: string }
interface Section { title: string; items: string[] }
interface Dossier {
  candidatId: string; nom: string; prenom: string | null;
  posteActuel: string | null; entrepriseActuelle: string | null;
  photoUrl: string | null; synthese: string;
  contact: { email: string | null; telephone: string | null; linkedinUrl: string | null; cvUrl: string | null };
  coordonneesVisibles: boolean;
  infos: Info[]; adequation: string[]; sections: Section[];
  manuel: boolean; modifieLe: string | null;
}
interface Prefill { localisation?: string | null; disponibilite?: string | null; salaireSouhaite?: number | null; anneesExperience?: number | null }

const BRAND = '#22177A', CREAM = '#E6E9AF', INK = '#1A1533', TEXT = '#4A4568', MUTED = '#8A8699', LINE = 'rgba(34,23,122,.12)';
const SYNTHESE_MAX = 500; // colonne candidats.ai_pitch_short en VarChar(500)
const PREVIEW_LABEL: React.CSSProperties = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: MUTED };
const input: React.CSSProperties = { width: '100%', fontFamily: "'Manrope',sans-serif", fontSize: 13.5, padding: '9px 11px', borderRadius: 10, border: '1.5px solid rgba(34,23,122,.16)', background: '#FCFCF5', color: INK, outline: 'none' };
const iconBtn: React.CSSProperties = { flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(34,23,122,.14)', background: '#fff', color: MUTED, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const addBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: BRAND, background: 'transparent', border: '1px dashed rgba(34,23,122,.3)', borderRadius: 9, padding: '7px 12px', cursor: 'pointer' };

const authHeader = (): Record<string, string> => { const t = localStorage.getItem('accessToken'); return t ? { Authorization: `Bearer ${t}` } : {}; };
const move = <T,>(arr: T[], i: number) => { if (i <= 0) return arr; const a = [...arr]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; };

function Block({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function DossierClientModal({ candidatId, prefill, onClose }: { candidatId: string; prefill?: Prefill; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['candidat-dossier', candidatId], queryFn: () => api.get<Dossier>(`/candidats/${candidatId}/dossier`) });
  const [synthese, setSynthese] = useState('');
  const [infos, setInfos] = useState<Info[]>([]);
  const [adequation, setAdequation] = useState<string[]>([]);
  const [sections, setSections] = useState<{ title: string; text: string }[]>([]);
  const [manuel, setManuel] = useState(true);
  const [coordonnees, setCoordonnees] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!data) return;
    setSynthese(data.synthese);
    setInfos(data.infos);
    setAdequation(data.adequation);
    setSections(data.sections.map((s) => ({ title: s.title, text: s.items.join('\n') })));
    setManuel(data.modifieLe ? data.manuel : true);
    setPhotoUrl(data.photoUrl);
    setCoordonnees(data.coordonneesVisibles);
  }, [data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['candidat-dossier', candidatId] });
    qc.invalidateQueries({ queryKey: ['candidat', candidatId] });
  };

  const sectionsOut = sections.map((s) => ({ title: s.title.trim(), items: s.text.split('\n').map((l) => l.replace(/^\s*[-•·]\s*/, '').trim()).filter(Boolean) }));

  const saveMut = useMutation({
    mutationFn: () => api.put<Dossier>(`/candidats/${candidatId}/dossier`, {
      synthese, infos, adequation, sections: sectionsOut, manuel, coordonneesVisibles: coordonnees,
    }),
    onSuccess: () => { refresh(); toast('success', 'Dossier client enregistré'); onClose(); },
    onError: (e: any) => toast('error', e?.message || "Échec de l'enregistrement"),
  });

  const uploadPhoto = async (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    setPhotoBusy(true);
    try {
      const res = await fetch(`/api/v1/candidats/${candidatId}/photo`, { method: 'POST', headers: { ...authHeader() }, body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || body?.error || 'upload');
      setPhotoUrl(body.photoUrl); refresh(); toast('success', 'Photo mise à jour');
    } catch (e: any) { toast('error', e?.message && e.message !== 'upload' ? e.message : "Échec de l'envoi de la photo"); }
    finally { setPhotoBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const removePhoto = async () => {
    try { await api.delete(`/candidats/${candidatId}/photo`); setPhotoUrl(null); refresh(); }
    catch { toast('error', 'Échec de la suppression'); }
  };

  const prefillInfos = () => {
    const rows: Info[] = [];
    if (prefill?.localisation) rows.push({ label: 'Localisation', value: prefill.localisation });
    if (prefill?.disponibilite) rows.push({ label: 'Disponibilité', value: prefill.disponibilite });
    if (prefill?.anneesExperience) rows.push({ label: 'Expérience', value: `${prefill.anneesExperience} ans` });
    if (prefill?.salaireSouhaite) rows.push({ label: 'Prétentions', value: `${prefill.salaireSouhaite.toLocaleString('fr-FR')} €` });
    const base = rows.length ? rows : [{ label: 'Localisation', value: '' }, { label: 'Disponibilité', value: '' }, { label: 'Expérience', value: '' }, { label: 'Prétentions', value: '' }];
    setInfos(base);
  };

  const fullName = data ? `${data.prenom ? data.prenom + ' ' : ''}${data.nom}` : '';
  const initials = data ? `${(data.prenom || '')[0] || ''}${data.nom[0] || ''}`.toUpperCase() : '';
  const poste = data ? [data.posteActuel, data.entrepriseActuelle].filter(Boolean).join(' · ') : '';
  const pInfos = infos.filter((i) => i.label.trim() && i.value.trim());
  const pBullets = adequation.map((b) => b.trim()).filter(Boolean);
  const pSections = sectionsOut.filter((s) => s.title && s.items.length);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 92, background: 'rgba(26,21,51,.42)' }} />
      <div role="dialog" aria-modal="true" aria-label="Dossier client" className="fmodal dcm" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 93, width: 1120, maxWidth: '96vw', height: '90vh', background: '#fff', borderRadius: 22, boxShadow: '0 44px 96px -40px rgba(0,0,0,.55)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <style>{`
          .dcm-body{ display:grid; grid-template-columns:minmax(0,1fr) 420px; flex:1; min-height:0; }
          @media (max-width:900px){ .dcm-body{ grid-template-columns:1fr; } .dcm-preview{ display:none; } }
        `}</style>
        {/* En-tête */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '18px 24px', borderBottom: `1px solid ${LINE}` }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17.5, letterSpacing: '-.015em', color: INK }}>Dossier client</div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>Ce que le client voit sur le portail pour {fullName || 'ce candidat'}</div>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={iconBtn}><X size={16} /></button>
        </div>

        {isLoading || !data ? <div style={{ padding: 40, color: MUTED }}>Chargement…</div> : (
          <div className="dcm-body">
            {/* Formulaire */}
            <div style={{ overflowY: 'auto', padding: '6px 24px 24px' }}>
              <Block title="Photo">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {photoUrl
                    ? <img src={photoUrl} alt="" style={{ width: 64, height: 64, borderRadius: 16, objectFit: 'cover', background: '#F2F3D8' }} />
                    : <span style={{ width: 64, height: 64, borderRadius: 16, background: '#F2F3D8', color: BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>{initials}</span>}
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
                  <button onClick={() => fileRef.current?.click()} disabled={photoBusy} style={{ ...addBtn, borderStyle: 'solid' }}><Camera size={14} />{photoBusy ? 'Envoi…' : photoUrl ? 'Changer la photo' : 'Ajouter une photo'}</button>
                  {photoUrl && <button onClick={removePhoto} style={{ fontSize: 12.5, fontWeight: 700, color: MUTED, background: 'transparent', border: 'none', cursor: 'pointer' }}>Retirer</button>}
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 7 }}>JPG, PNG ou WebP, 5 Mo max. Enregistrée tout de suite.</div>
              </Block>

              <Block title="Synthèse">
                <textarea value={synthese} onChange={(e) => setSynthese(e.target.value)} maxLength={SYNTHESE_MAX} rows={6} placeholder="Qui est le candidat, ce qu'il a fait, pourquoi il colle au poste" style={{ ...input, resize: 'vertical', lineHeight: 1.55 }} />
                <div style={{ fontSize: 12, color: synthese.length >= SYNTHESE_MAX ? '#B5552B' : MUTED, marginTop: 5, textAlign: 'right' }}>{synthese.length} / {SYNTHESE_MAX}</div>
              </Block>

              <Block title="Cartes d'infos" right={infos.length === 0 ? <button onClick={prefillInfos} style={addBtn}>Pré-remplir depuis la fiche</button> : undefined}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {infos.map((it, i) => (
                    <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      <input value={it.label} onChange={(e) => setInfos(infos.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} placeholder="Intitulé" style={{ ...input, flex: '0 0 34%' }} />
                      <input value={it.value} onChange={(e) => setInfos(infos.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} placeholder="Valeur" style={{ ...input, flex: 1 }} />
                      <button onClick={() => setInfos(move(infos, i))} disabled={i === 0} aria-label="Monter" style={{ ...iconBtn, opacity: i === 0 ? 0.35 : 1 }}><ArrowUp size={14} /></button>
                      <button onClick={() => setInfos(infos.filter((_, j) => j !== i))} aria-label="Supprimer" style={iconBtn}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setInfos([...infos, { label: '', value: '' }])} style={{ ...addBtn, marginTop: 8 }}><Plus size={14} />Ajouter une carte</button>
              </Block>

              <Block title="Adéquation au poste">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {adequation.map((b, i) => (
                    <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                      <textarea value={b} onChange={(e) => setAdequation(adequation.map((x, j) => j === i ? e.target.value : x))} rows={2} style={{ ...input, flex: 1, resize: 'vertical', lineHeight: 1.5 }} />
                      <button onClick={() => setAdequation(move(adequation, i))} disabled={i === 0} aria-label="Monter" style={{ ...iconBtn, opacity: i === 0 ? 0.35 : 1 }}><ArrowUp size={14} /></button>
                      <button onClick={() => setAdequation(adequation.filter((_, j) => j !== i))} aria-label="Supprimer" style={iconBtn}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
                {adequation.length > 8 && <div style={{ fontSize: 12, color: '#B5552B', marginTop: 7 }}>Le portail n'affiche que les 8 premiers points.</div>}
                <button onClick={() => setAdequation([...adequation, ''])} style={{ ...addBtn, marginTop: 8 }}><Plus size={14} />Ajouter un point</button>
              </Block>

              <Block title="Sections (parcours, motivations…)">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {sections.map((s, i) => (
                    <div key={i} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 10, background: '#FDFDF8' }}>
                      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                        <input value={s.title} onChange={(e) => setSections(sections.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} placeholder="Titre (ex. Parcours)" style={{ ...input, flex: 1, fontWeight: 700 }} />
                        <button onClick={() => setSections(move(sections, i))} disabled={i === 0} aria-label="Monter" style={{ ...iconBtn, opacity: i === 0 ? 0.35 : 1 }}><ArrowUp size={14} /></button>
                        <button onClick={() => setSections(sections.filter((_, j) => j !== i))} aria-label="Supprimer la section" style={iconBtn}><Trash2 size={14} /></button>
                      </div>
                      <textarea value={s.text} onChange={(e) => setSections(sections.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} rows={4} placeholder="Une ligne par élément" style={{ ...input, marginTop: 7, resize: 'vertical', lineHeight: 1.5 }} />
                    </div>
                  ))}
                </div>
                <button onClick={() => setSections([...sections, { title: sections.length === 0 ? 'Parcours' : '', text: '' }])} style={{ ...addBtn, marginTop: 8 }}><Plus size={14} />Ajouter une section</button>
              </Block>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 24, padding: '12px 14px', borderRadius: 12, background: '#F6F5EC', cursor: 'pointer' }}>
                <input type="checkbox" checked={coordonnees} onChange={(e) => setCoordonnees(e.target.checked)} style={{ marginTop: 3 }} />
                <span>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK }}>Montrer les coordonnées au client</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: MUTED, marginTop: 2 }}>
                    {[data.contact.email, data.contact.telephone, data.contact.linkedinUrl ? 'LinkedIn' : null].filter(Boolean).join(' · ') || 'Aucune coordonnée sur la fiche'}
                  </span>
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 10, padding: '12px 14px', borderRadius: 12, background: '#F6F5EC', cursor: 'pointer' }}>
                <input type="checkbox" checked={manuel} onChange={(e) => setManuel(e.target.checked)} style={{ marginTop: 3 }} />
                <span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, color: INK }}><Lock size={13} />Protéger ce dossier</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: MUTED, marginTop: 2 }}>Un nouveau CV importé ne remplacera pas la synthèse ni le dossier.</span>
                </span>
              </label>
            </div>

            {/* Aperçu portail */}
            <div className="dcm-preview" style={{ overflowY: 'auto', background: '#F4F3EC', borderLeft: `1px solid ${LINE}`, padding: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 10 }}>Aperçu côté client</div>
              <div style={{ borderRadius: 16, overflow: 'hidden', background: '#FCFCF7', boxShadow: '0 18px 40px -28px rgba(26,21,51,.5)' }}>
                <div style={{ background: BRAND, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  {photoUrl
                    ? <img src={photoUrl} alt="" style={{ width: 52, height: 52, borderRadius: 14, objectFit: 'cover', background: CREAM }} />
                    : <span style={{ width: 52, height: 52, borderRadius: 14, background: CREAM, color: BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17 }}>{initials}</span>}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 17, color: '#fff' }}>{fullName}</div>
                    {poste && <div style={{ fontSize: 12.5, color: CREAM, fontWeight: 600, marginTop: 2 }}>{poste}</div>}
                  </div>
                </div>
                <div style={{ padding: '16px 18px 20px' }}>
                  {((coordonnees && (data.contact.email || data.contact.telephone || data.contact.linkedinUrl)) || data.contact.cvUrl) && (
                    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 11, padding: '9px 11px', marginBottom: 14 }}>
                      <div style={PREVIEW_LABEL}>{coordonnees ? 'Coordonnées' : 'CV'}</div>
                      <div style={{ fontSize: 12.5, color: INK, fontWeight: 600, marginTop: 4, lineHeight: 1.6 }}>
                        {coordonnees && data.contact.email && <div>{data.contact.email}</div>}
                        {coordonnees && data.contact.telephone && <div>{data.contact.telephone}</div>}
                        {coordonnees && data.contact.linkedinUrl && <div>Profil LinkedIn</div>}
                        {data.contact.cvUrl && <div>Télécharger le CV</div>}
                      </div>
                    </div>
                  )}
                  {synthese.trim() && (<><div style={PREVIEW_LABEL}>Synthèse</div><p style={{ fontSize: 13.5, lineHeight: 1.6, color: TEXT, marginTop: 6, whiteSpace: 'pre-line' }}>{synthese.trim()}</p></>)}
                  {pInfos.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 7, marginTop: 14 }}>
                      {pInfos.map((it, i) => (
                        <div key={i} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 11, padding: '8px 10px' }}>
                          <div style={PREVIEW_LABEL}>{it.label}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginTop: 2, lineHeight: 1.35 }}>{it.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {pBullets.length > 0 && (pSections.length > 0 || pInfos.length > 0) && <div style={{ ...PREVIEW_LABEL, marginTop: 18 }}>Adéquation au poste</div>}
                  {pBullets.length > 0 && (
                    <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {pBullets.slice(0, 8).map((b, i) => (
                        <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 5, background: '#F2F3D8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}><Check size={10} color={BRAND} strokeWidth={2.6} /></span>
                          <span style={{ fontSize: 13, lineHeight: 1.5, color: TEXT }}>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {pSections.map((s, i) => (
                    <div key={i} style={{ marginTop: 18 }}>
                      <div style={PREVIEW_LABEL}>{s.title}</div>
                      <ul style={{ margin: '7px 0 0', paddingLeft: 17, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {s.items.map((it, j) => <li key={j} style={{ fontSize: 13, lineHeight: 1.5, color: TEXT }}>{it}</li>)}
                      </ul>
                    </div>
                  ))}
                  {!synthese.trim() && pBullets.length === 0 && pSections.length === 0 && <p style={{ fontSize: 13.5, color: MUTED }}>Le dossier détaillé sera disponible sous peu.</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Pied */}
        <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 24px', borderTop: `1px solid ${LINE}` }}>
          <button onClick={onClose} style={{ fontSize: 13.5, fontWeight: 700, color: TEXT, background: '#fff', border: '1px solid rgba(34,23,122,.16)', borderRadius: 10, padding: '10px 16px', cursor: 'pointer' }}>Annuler</button>
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !data} style={{ fontSize: 13.5, fontWeight: 800, color: CREAM, background: BRAND, border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', opacity: saveMut.isPending ? 0.7 : 1 }}>{saveMut.isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </>
  );
}
