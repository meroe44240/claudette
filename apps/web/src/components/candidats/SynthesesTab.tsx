import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload, Check, RefreshCw, Trash2, ChevronDown, Loader2, Calendar } from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from '../ui/Toast';

// Onglet « Entretiens » : synthèses d'entretien en PDF. L'IA lit le PDF et propose
// des mises à jour (champs, expériences, dossier client) que le recruteur coche
// avant de les appliquer. Rien n'est écrit sans validation.

interface Proposal {
  fields: Record<string, string | number | null>;
  experiences: Array<{ titre: string; entreprise: string; anneeDebut: number; anneeFin: number | null; highlights: string[] }>;
  dossier: { synthese: string; infos: Array<{ label: string; value: string }>; adequation: string[]; sections: Array<{ title: string; items: string[] }> };
  resume: string;
}
interface Synthese {
  id: string; createdAt: string; user: { nom: string; prenom: string | null } | null;
  filename: string; url: string | null; size: number; texte?: string | null;
  status: 'propose' | 'applique' | 'erreur'; error: string | null; appliedAt: string | null;
  proposal: Proposal | null;
}
interface Meeting { id: string; titre: string | null; contenu: string | null; createdAt: string }

const BRAND = '#22177A', CREAM = '#E6E9AF', INK = '#1A1533', MUTED = '#8A8699', LINE = 'rgba(34,23,122,.1)';
const FIELD_LABELS: Record<string, string> = {
  localisation: 'Localisation', salaireActuel: 'Rémunération actuelle', salaireSouhaite: 'Rémunération souhaitée',
  anneesExperience: "Années d'expérience", disponibilite: 'Disponibilité', mobilite: 'Mobilité',
};
const fmtField = (k: string, v: string | number | null) => (v == null ? '' : /salaire/.test(k) ? `${Number(v).toLocaleString('fr-FR')} €` : k === 'anneesExperience' ? `${v} ans` : String(v));
const authHeader = (): Record<string, string> => { const t = localStorage.getItem('accessToken'); return t ? { Authorization: `Bearer ${t}` } : {}; };
const dateFr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

export interface SynthesesTabHandle { pick: () => void }

const SynthesesTab = forwardRef<SynthesesTabHandle, { candidatId: string; meetings: Meeting[]; onApplied: () => void }>(function SynthesesTab({ candidatId, meetings, onApplied }, ref) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [textId, setTextId] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({ queryKey: ['syntheses', candidatId], queryFn: () => api.get<Synthese[]>(`/candidats/${candidatId}/syntheses`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['syntheses', candidatId] }); qc.invalidateQueries({ queryKey: ['activites', 'candidat', candidatId] }); };

  useImperativeHandle(ref, () => ({ pick: () => fileRef.current?.click() }));

  const upload = async (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    setUploading(true);
    try {
      const res = await fetch(`/api/v1/candidats/${candidatId}/syntheses`, { method: 'POST', headers: { ...authHeader() }, body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || body?.error || "Échec de l'envoi");
      refresh();
      if (body?.status === 'erreur') toast('error', `Synthèse rangée, mais la lecture a échoué : ${body.error}`);
      else { toast('success', 'Synthèse lue : vérifiez la proposition'); setOpenId(body?.id ?? null); }
    } catch (e: any) { toast('error', e?.message || "Échec de l'envoi"); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const reanalyse = useMutation({ mutationFn: (sid: string) => api.post(`/candidats/${candidatId}/syntheses/${sid}/reanalyse`), onSuccess: () => { refresh(); toast('success', 'Synthèse relue'); }, onError: (e: any) => toast('error', e?.message || 'Échec') });
  const remove = useMutation({ mutationFn: (sid: string) => api.delete(`/candidats/${candidatId}/syntheses/${sid}`), onSuccess: () => refresh() });

  return (
    <div>
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      <button onClick={() => fileRef.current?.click()} disabled={uploading} className="drop" style={{ width: '100%', border: '1.5px dashed rgba(34,23,122,.26)', borderRadius: 14, background: '#FCFCF5', padding: 20, textAlign: 'center', cursor: uploading ? 'wait' : 'pointer' }}>
        <span style={{ display: 'inline-flex', width: 40, height: 40, borderRadius: 12, background: '#F2F3D8', alignItems: 'center', justifyContent: 'center' }}>
          {uploading ? <Loader2 size={19} color={BRAND} className="spin" /> : <Upload size={19} color={BRAND} />}
        </span>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: INK, marginTop: 10 }}>{uploading ? 'Lecture de la synthèse…' : 'Ajouter une synthèse d\'entretien'}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{uploading ? 'Environ 20 secondes' : 'PDF · l\'ATS propose les mises à jour, vous validez'}</div>
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        {isLoading && <div style={{ color: MUTED, fontSize: 13 }}>Chargement…</div>}
        {!isLoading && data.length === 0 && <div style={{ color: MUTED, fontSize: 13, textAlign: 'center', padding: 10 }}>Aucune synthèse pour l'instant.</div>}
        {data.map((s) => (
          <div key={s.id} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px' }}>
              <span style={{ flexShrink: 0, width: 36, height: 44, borderRadius: 8, background: '#F9ECE9', border: '1px solid rgba(176,54,31,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={17} color="#B0361F" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {s.url
                  ? <a href={s.url} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: INK, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.filename}</a>
                  : <button onClick={() => setTextId(textId === s.id ? null : s.id)} title="Voir le texte du débrief" style={{ display: 'block', maxWidth: '100%', fontSize: 13.5, fontWeight: 800, color: INK, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.filename}</button>}
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{dateFr(s.createdAt)}{s.user ? ` · ${s.user.prenom ?? ''} ${s.user.nom}`.trimEnd() : ''}</div>
              </div>
              {s.status === 'applique' && <span style={{ fontSize: 11.5, fontWeight: 800, color: '#2C6B3F', background: '#EAF3EC', borderRadius: 999, padding: '4px 10px' }}>Appliquée</span>}
              {s.status === 'propose' && <span style={{ fontSize: 11.5, fontWeight: 800, color: '#8A6A2E', background: '#FBF3E7', borderRadius: 999, padding: '4px 10px' }}>À valider</span>}
              {s.status === 'erreur' && <span title={s.error ?? ''} style={{ fontSize: 11.5, fontWeight: 800, color: '#B3261E', background: '#F7DEDB', borderRadius: 999, padding: '4px 10px' }}>Lecture échouée</span>}
              {s.proposal && <button onClick={() => setOpenId(openId === s.id ? null : s.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: BRAND, background: '#fff', border: '1px solid rgba(34,23,122,.16)', borderRadius: 9, padding: '7px 11px', cursor: 'pointer' }}>Proposition<ChevronDown size={13} style={{ transform: openId === s.id ? 'rotate(180deg)' : 'none' }} /></button>}
              <button onClick={() => reanalyse.mutate(s.id)} disabled={reanalyse.isPending} title="Relire avec l'IA" style={iconBtn}><RefreshCw size={13} className={reanalyse.isPending && reanalyse.variables === s.id ? 'spin' : ''} /></button>
              <button onClick={() => { if (confirm('Retirer cette synthèse de la fiche ?')) remove.mutate(s.id); }} title="Retirer" style={iconBtn}><Trash2 size={13} /></button>
            </div>
            {textId === s.id && s.texte && <div style={{ borderTop: `1px solid ${LINE}`, padding: '12px 16px', maxHeight: 360, overflowY: 'auto', fontSize: 12.5, lineHeight: 1.6, color: '#4A4568', whiteSpace: 'pre-wrap', background: '#FDFDF8' }}>{s.texte}</div>}
            {openId === s.id && s.proposal && <ProposalReview candidatId={candidatId} synthese={s} onDone={() => { refresh(); onApplied(); setOpenId(null); }} />}
          </div>
        ))}
      </div>

      {meetings.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: INK, marginBottom: 10 }}>Rendez-vous</div>
          {meetings.map((m) => (
            <div key={m.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '10px 4px', borderBottom: `1px solid ${LINE}` }}>
              <Calendar size={15} color={MUTED} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{m.titre || 'Rendez-vous'}</div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{dateFr(m.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
export default SynthesesTab;

const iconBtn: React.CSSProperties = { flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(34,23,122,.14)', background: '#fff', color: MUTED, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

function Tick({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <label onClick={onClick} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', padding: '6px 0' }}>
      <span style={{ flexShrink: 0, marginTop: 1, width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${on ? BRAND : 'rgba(34,23,122,.25)'}`, background: on ? CREAM : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{on && <Check size={11} color={BRAND} strokeWidth={3} />}</span>
      <span style={{ fontSize: 13, color: INK, lineHeight: 1.5, minWidth: 0 }}>{children}</span>
    </label>
  );
}

function ProposalReview({ candidatId, synthese, onDone }: { candidatId: string; synthese: Synthese; onDone: () => void }) {
  const p = synthese.proposal!;
  const fieldKeys = Object.keys(p.fields).filter((k) => p.fields[k] !== null && p.fields[k] !== '');
  const [fields, setFields] = useState<Set<string>>(new Set(fieldKeys));
  const [exps, setExps] = useState<Set<number>>(new Set(p.experiences.map((_, i) => i)));
  const [dossier, setDossier] = useState(true);
  const toggle = <T,>(set: Set<T>, v: T, fn: (s: Set<T>) => void) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); fn(n); };

  const apply = useMutation({
    mutationFn: () => api.post<{ applied: string[] }>(`/candidats/${candidatId}/syntheses/${synthese.id}/apply`, {
      fields: Object.fromEntries(fieldKeys.filter((k) => fields.has(k)).map((k) => [k, p.fields[k]])),
      experiences: p.experiences.filter((_, i) => exps.has(i)),
      dossier: dossier ? p.dossier : undefined,
    }),
    onSuccess: (r) => { toast('success', r.applied.length ? `Appliqué : ${r.applied.join(', ')}` : 'Rien à appliquer'); onDone(); },
    onError: (e: any) => toast('error', e?.message || "Échec de l'application"),
  });

  const h: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: MUTED, margin: '16px 0 4px' };
  return (
    <div style={{ borderTop: `1px solid ${LINE}`, padding: '6px 16px 16px', background: '#FDFDF8', borderRadius: '0 0 14px 14px' }}>
      {p.resume && <><div style={h}>Résumé pour l'équipe</div><p style={{ fontSize: 13, color: '#4A4568', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{p.resume}</p></>}

      {fieldKeys.length > 0 && <><div style={h}>Champs de la fiche</div>
        {fieldKeys.map((k) => <Tick key={k} on={fields.has(k)} onClick={() => toggle(fields, k, setFields)}><strong>{FIELD_LABELS[k] ?? k}</strong> : {fmtField(k, p.fields[k])}</Tick>)}</>}

      {p.experiences.length > 0 && <><div style={h}>Expériences (les doublons sont ignorés)</div>
        {p.experiences.map((e, i) => <Tick key={i} on={exps.has(i)} onClick={() => toggle(exps, i, setExps)}><strong>{e.titre}</strong>, {e.entreprise} · {e.anneeDebut} → {e.anneeFin ?? 'auj.'}</Tick>)}</>}

      <div style={h}>Dossier client (portail)</div>
      <Tick on={dossier} onClick={() => setDossier(!dossier)}>
        Remplacer la synthèse, {p.dossier.infos.length} cartes d'infos, {p.dossier.adequation.length} points d'adéquation et {p.dossier.sections.length} sections ({p.dossier.sections.map((s) => s.title).join(', ')})
      </Tick>
      {dossier && (
        <div style={{ margin: '4px 0 0 27px', padding: '10px 12px', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, fontSize: 12.5, color: '#4A4568', lineHeight: 1.55 }}>
          {p.dossier.synthese}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={() => apply.mutate()} disabled={apply.isPending} style={{ fontSize: 13, fontWeight: 800, color: CREAM, background: BRAND, border: 'none', borderRadius: 10, padding: '10px 16px', cursor: 'pointer', opacity: apply.isPending ? 0.7 : 1 }}>{apply.isPending ? 'Application…' : 'Appliquer la sélection'}</button>
      </div>
    </div>
  );
}
