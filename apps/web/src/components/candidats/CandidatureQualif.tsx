import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Pencil, Check, X } from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from '../ui/Toast';
import TrameAnswers from '../mandats/TrameAnswers';

interface Field { key: string; label: string; hint: string; ai: boolean; long?: boolean }
interface Value { v: string; src: 'ia' | 'manuel'; at: string }
type Fit = Record<string, Value>;

const GONOGO = ['GO', 'À creuser', 'NO-GO'];

/** Onglet Qualification (par candidature) : fit sur le mandat + trame, un seul remplissage IA. */
export default function CandidatureQualif({ candidatureId, mandatId, mandatLabel }: { candidatureId: string; mandatId: string; mandatLabel?: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const { data: fields } = useQuery({ queryKey: ['fit-fields'], queryFn: () => api.get<Field[]>('/qualification/fit-fields'), staleTime: 60 * 60 * 1000 });
  const { data: fit } = useQuery({ queryKey: ['qualif-fit', candidatureId], queryFn: () => api.get<Fit>(`/qualification/candidature/${candidatureId}`), enabled: !!candidatureId });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['qualif-fit', candidatureId] });
    qc.invalidateQueries({ queryKey: ['trame-answers', candidatureId] });
  };

  const fill = useMutation({
    mutationFn: async () => {
      const [fitRes] = await Promise.allSettled([
        api.post<{ filled: number }>(`/qualification/fit-fill/${candidatureId}`, {}),
        api.post(`/trames/fill/${candidatureId}`, {}).catch(() => null), // pas de trame = on ignore
      ]);
      if (fitRes.status === 'rejected') throw fitRes.reason;
    },
    onSuccess: () => { invalidate(); toast('success', 'Fit et trame remplis depuis le meeting'); },
    onError: (e: any) => toast('error', e?.message || 'Aucun transcript exploitable'),
  });
  const save = useMutation({
    mutationFn: (payload: Record<string, string | null>) => api.put(`/qualification/candidature/${candidatureId}`, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['qualif-fit', candidatureId] }); setEditing(null); },
    onError: (e: any) => toast('error', e?.message || 'Échec de la sauvegarde'),
  });

  const list = fields ?? [];
  const f = fit ?? {};
  const startEdit = (fld: Field) => { setEditing(fld.key); setDraft(f[fld.key]?.v ?? ''); };
  const commit = (fld: Field, val?: string) => save.mutate({ [fld.key]: (val ?? draft).trim() || null });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, fontSize: 12, color: '#6E6A85' }}>Fit & trame pour <strong style={{ color: '#22177A' }}>{mandatLabel || 'ce mandat'}</strong>, depuis les meetings.</div>
        <button onClick={() => fill.mutate()} disabled={fill.isPending} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 800, color: '#E6E9AF', background: '#22177A', border: 'none', borderRadius: 10, padding: '8px 15px', cursor: fill.isPending ? 'wait' : 'pointer', opacity: fill.isPending ? 0.6 : 1 }}>
          <Sparkles size={14} />{fill.isPending ? 'Analyse…' : 'Remplir depuis le meeting'}
        </button>
      </div>

      {/* Fit */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((fld) => {
          const val = f[fld.key];
          const isEditing = editing === fld.key;
          const isGoNoGo = fld.key === 'goNoGo';
          return (
            <div key={fld.key} style={{ background: '#FCFCF5', border: '1px solid rgba(34,23,122,.08)', borderRadius: 12, padding: '11px 13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8A8699', flex: 1 }}>{fld.label}</span>
                {val && <span title={val.src === 'ia' ? 'Rempli par l’IA' : 'Saisi manuellement'} style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: val.src === 'ia' ? '#2A4A8A' : '#7A5E1E', background: val.src === 'ia' ? '#E8EEF9' : '#F2F3D8', borderRadius: 5, padding: '2px 6px' }}>{val.src === 'ia' ? 'IA' : 'Manuel'}</span>}
                {!isEditing && !isGoNoGo && <button onClick={() => startEdit(fld)} title="Modifier" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, color: '#B4B0C4', display: 'flex' }}><Pencil size={12.5} /></button>}
              </div>

              {isGoNoGo ? (
                <div style={{ display: 'flex', gap: 7 }}>
                  {GONOGO.map((g) => {
                    const active = val?.v === g;
                    const col = g === 'GO' ? '#2C6B3F' : g === 'NO-GO' ? '#B3261E' : '#8A6A2E';
                    const bg = g === 'GO' ? '#EAF3EC' : g === 'NO-GO' ? '#F7DEDB' : '#FBF3E7';
                    return <button key={g} onClick={() => commit(fld, active ? '' : g)} style={{ fontSize: 12, fontWeight: 800, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', border: `1.5px solid ${active ? col : 'rgba(34,23,122,.14)'}`, background: active ? bg : '#fff', color: active ? col : '#8A8699' }}>{g}</button>;
                  })}
                </div>
              ) : isEditing ? (
                <div>
                  <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={fld.hint} rows={3} style={{ width: '100%', resize: 'vertical', fontFamily: "'Manrope',sans-serif", fontSize: 13, lineHeight: 1.5, padding: '8px 10px', borderRadius: 9, border: '1.5px solid rgba(34,23,122,.18)', background: '#fff', outline: 'none' }} />
                  <div style={{ display: 'flex', gap: 7, marginTop: 7, justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditing(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#4A4568', background: '#F5F4EA', border: 'none', borderRadius: 8, padding: '6px 11px', cursor: 'pointer' }}><X size={12} />Annuler</button>
                    <button onClick={() => commit(fld)} disabled={save.isPending} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#E6E9AF', background: '#22177A', border: 'none', borderRadius: 8, padding: '6px 11px', cursor: 'pointer' }}><Check size={12} />Enregistrer</button>
                  </div>
                </div>
              ) : (
                <div onClick={() => startEdit(fld)} style={{ fontSize: 13, lineHeight: 1.5, color: val ? '#1A1533' : '#B4B0C4', cursor: 'pointer', whiteSpace: 'pre-wrap' }}>{val?.v || (fld.ai ? '— à qualifier' : '— à renseigner')}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Trame du mandat (bouton unifié ci-dessus) */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(34,23,122,.08)' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8A8699', marginBottom: 12 }}>Trame du mandat</div>
        <TrameAnswers candidatureId={candidatureId} mandatId={mandatId} hideFill />
      </div>
    </div>
  );
}
