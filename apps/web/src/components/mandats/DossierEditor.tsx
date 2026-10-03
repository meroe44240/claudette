// Fiche mandat : dossier de préparation remis aux candidats du mandat dans leur
// espace (visible à partir de « Envoi client »). Brouillon rédigé depuis le brief,
// relu ici, puis publié ; une rubrique sans source ne se publie pas.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { toast } from '../ui/Toast';
import Modal from '../ui/Modal';

interface Section { id: string; title: string; body: string; facts: Array<{ label: string; value: string }>; sources: string; confirmedBody: string }
interface Photo { url: string; caption: string }
interface Dossier {
  sections: Section[]; photos: Photo[];
  publishedAt: string | null; publishedBy: string | null; dirty: boolean; missingSources: string[];
}

const NAVY = '#22177A';
const LIME = '#E6E9AF';
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontFamily: "'Manrope',sans-serif", fontSize: 13, padding: '9px 11px', borderRadius: 9, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', color: '#1A1533', outline: 'none' };
const lab: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#4A4568' };
const primary: React.CSSProperties = { background: NAVY, color: LIME, border: 'none', borderRadius: 10, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const ghost: React.CSSProperties = { background: '#F2F3D8', color: NAVY, border: '1px solid rgba(34,23,122,.14)', borderRadius: 10, padding: '8px 13px', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const link: React.CSSProperties = { background: 'none', border: 'none', color: '#8A8699', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', padding: 0 };

const factsToText = (f: Section['facts']) => f.map((x) => `${x.label}: ${x.value}`).join('\n');
const textToFacts = (t: string) => t.split('\n').map((l) => { const i = l.indexOf(':'); return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : null; }).filter((x): x is { label: string; value: string } => !!x && !!x.label && !!x.value);
const filled = (s: Section) => !!(s.body.trim() || s.facts.length || s.confirmedBody.trim());
const fmt = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

export default function DossierEditor({ mandatId }: { mandatId: string }) {
  const qc = useQueryClient();
  const key = ['mandat-dossier', mandatId];
  const base = `/candidate-space/mandats/${mandatId}/dossier`;
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<Dossier>(base) });
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<Section[]>([]);
  const [factsText, setFactsText] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [brief, setBrief] = useState('');
  const [profile, setProfile] = useState<'TECH' | 'SALES'>('TECH');
  const [showBrief, setShowBrief] = useState(false);

  const load = (d: { sections: Section[]; photos?: Photo[] }) => {
    setSections(d.sections);
    setFactsText(Object.fromEntries(d.sections.map((s) => [s.id, factsToText(s.facts)])));
    if (d.photos) setPhotos(d.photos);
  };
  useEffect(() => { if (data && !open) load(data); }, [data, open]);

  const payload = () => ({
    sections: sections.map((s) => ({ ...s, facts: textToFacts(factsText[s.id] ?? '') })),
    photos: photos.filter((p) => p.url.trim()),
  });
  const done = (msg: string) => (d: Dossier) => { qc.setQueryData(key, d); load(d); toast('success', msg); };
  const fail = (e: any) => toast('error', e?.message || 'Erreur');

  const save = useMutation({ mutationFn: () => api.put<Dossier>(base, payload()), onSuccess: done('Brouillon enregistré'), onError: fail });
  const publish = useMutation({
    mutationFn: async () => { await api.put<Dossier>(base, payload()); return api.post<Dossier>(`${base}/publish`); },
    onSuccess: (d) => { done('Dossier publié pour les candidats du mandat')(d); setOpen(false); },
    onError: fail,
  });
  const unpublish = useMutation({ mutationFn: () => api.post<Dossier>(`${base}/unpublish`), onSuccess: done('Dossier retiré'), onError: fail });
  const generate = useMutation({
    mutationFn: () => api.post<{ sections: Section[] }>(`${base}/generate`, { brief, profile }),
    onSuccess: (d) => { load(d); setShowBrief(false); toast('success', 'Brouillon rédigé : relis chaque rubrique avant de publier'); },
    onError: fail,
  });

  if (!data) return null;
  const set = (i: number, patch: Partial<Section>) => setSections((l) => l.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const count = data.sections.filter(filled).length;
  const busy = save.isPending || publish.isPending;

  return (
    <div>
      <div style={{ fontSize: 12.5, color: '#6E6A85', lineHeight: 1.5 }}>
        Le dossier de préparation que voient les candidats de ce mandat dans leur espace, à partir de « Envoi client ».
      </div>
      <div style={{ marginTop: 14, fontSize: 13, color: '#1A1533', fontWeight: 700 }}>
        {data.publishedAt
          ? `Publié le ${fmt(data.publishedAt)}${data.publishedBy ? ` par ${data.publishedBy}` : ''}`
          : count ? 'Brouillon, pas encore visible des candidats' : 'Pas encore de dossier'}
      </div>
      {data.publishedAt && data.dirty && <div style={{ marginTop: 4, fontSize: 12.5, color: '#8A1C1C', fontWeight: 700 }}>Des modifications ne sont pas encore publiées.</div>}
      {count > 0 && <div style={{ marginTop: 4, fontSize: 12.5, color: '#6E6A85' }}>{count} rubrique{count > 1 ? 's' : ''} remplie{count > 1 ? 's' : ''}{data.missingSources.length ? `, source manquante sur ${data.missingSources.length}` : ''}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => { load(data); setShowBrief(!count); setOpen(true); }} style={primary}>{count ? 'Relire et modifier' : 'Préparer le dossier'}</button>
        {data.publishedAt && <button onClick={() => { if (confirm('Retirer le dossier ? Les candidats ne le verront plus.')) unpublish.mutate(); }} style={link}>Retirer</button>}
      </div>

      {/* Hors du rail (animé, donc bloc conteneur) pour que la fenêtre prenne tout l'écran. */}
      {createPortal(
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Dossier de préparation" size="xl">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <p style={{ margin: 0, fontSize: 13.5, color: '#4A4568' }}>
            Rédigé en anglais, c'est ce que lit le candidat. Les rubriques vides ne sont pas affichées. Pas d'honoraires, de fourchette interne ni de retour brut du client.
          </p>

          <div style={{ border: '1px solid rgba(34,23,122,.12)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#1A1533' }}>Rédiger un brouillon depuis le brief</span>
              <button onClick={() => setShowBrief(!showBrief)} style={{ ...link, color: NAVY }}>{showBrief ? 'Replier' : 'Ouvrir'}</button>
            </div>
            {showBrief && (
              <>
                <textarea rows={6} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Colle ici la fiche de poste, le compte rendu ou le transcript du brief client. La fiche du mandat est déjà prise en compte." style={{ ...inp, resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {(['TECH', 'SALES'] as const).map((p) => (
                    <button key={p} onClick={() => setProfile(p)} style={{ ...ghost, ...(profile === p ? { background: NAVY, color: LIME } : {}) }}>{p === 'TECH' ? 'Tech' : 'Sales'}</button>
                  ))}
                  <button onClick={() => { if (!sections.some(filled) || confirm('Remplacer le brouillon actuel ?')) generate.mutate(); }} disabled={generate.isPending} style={{ ...primary, marginLeft: 'auto', opacity: generate.isPending ? 0.6 : 1 }}>
                    {generate.isPending ? 'Rédaction en cours…' : 'Rédiger le brouillon'}
                  </button>
                </div>
              </>
            )}
          </div>

          {sections.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 14, borderTop: '1px solid rgba(34,23,122,.09)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input aria-label="Titre de la rubrique" value={s.title} onChange={(e) => set(i, { title: e.target.value })} style={{ ...inp, fontWeight: 800 }} />
                <button onClick={() => setSections((l) => l.filter((_, j) => j !== i))} style={link}>Retirer</button>
              </div>
              <textarea aria-label="Texte" rows={Math.min(14, Math.max(4, Math.ceil(s.body.length / 110)))} value={s.body} onChange={(e) => set(i, { body: e.target.value })} placeholder="Texte de la rubrique. Une ligne qui commence par un tiret devient une puce." style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
              {s.id === 'company' && (
                <label style={lab}>Chiffres clés, un par ligne (Founded: 2017)
                  <textarea rows={3} value={factsText[s.id] ?? ''} onChange={(e) => setFactsText({ ...factsText, [s.id]: e.target.value })} style={{ ...inp, resize: 'vertical' }} />
                </label>
              )}
              {(s.id === 'people' || s.confirmedBody) && (
                <label style={lab}>Noms et parcours des interlocuteurs, affichés seulement quand l'entretien client est calé
                  <textarea rows={4} value={s.confirmedBody} onChange={(e) => set(i, { confirmedBody: e.target.value })} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
                </label>
              )}
              <label style={{ ...lab, color: filled(s) && !s.sources.trim() ? '#8A1C1C' : '#4A4568' }}>Sources{filled(s) && !s.sources.trim() ? ' (obligatoire pour publier)' : ''}
                <input value={s.sources} onChange={(e) => set(i, { sources: e.target.value })} placeholder="Role page on Paraform, intake call with the hiring team" style={inp} />
              </label>
            </div>
          ))}
          <button onClick={() => { const id = `s${Date.now()}`; setSections((l) => [...l, { id, title: '', body: '', facts: [], sources: '', confirmedBody: '' }]); }} style={{ ...link, color: NAVY, alignSelf: 'flex-start' }}>Ajouter une rubrique</button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 14, borderTop: '1px solid rgba(34,23,122,.09)' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#1A1533' }}>Photos en tête du dossier</span>
            {photos.map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 6, alignItems: 'center' }}>
                <input aria-label="Lien de l'image" placeholder="Lien de l'image (https)" value={p.url} onChange={(e) => setPhotos(photos.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} style={inp} />
                <input aria-label="Légende" placeholder="Légende et source" value={p.caption} onChange={(e) => setPhotos(photos.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} style={inp} />
                <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} style={link}>Retirer</button>
              </div>
            ))}
            {photos.length < 6 && <button onClick={() => setPhotos([...photos, { url: '', caption: '' }])} style={{ ...link, color: NAVY, alignSelf: 'flex-start' }}>Ajouter une photo</button>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center', position: 'sticky', bottom: -32, background: '#fff', padding: '12px 0', borderTop: '1px solid rgba(34,23,122,.09)' }}>
            <button onClick={() => setOpen(false)} style={{ ...link, color: '#4A4568' }}>Fermer</button>
            <button onClick={() => save.mutate()} disabled={busy} style={ghost}>Enregistrer le brouillon</button>
            <button onClick={() => publish.mutate()} disabled={busy} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>{publish.isPending ? 'Publication…' : data.publishedAt ? 'Publier les modifications' : 'Publier'}</button>
          </div>
        </div>
      </Modal>,
      document.body)}
    </div>
  );
}
