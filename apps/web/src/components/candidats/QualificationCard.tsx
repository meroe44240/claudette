import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Pencil, Check, X } from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from '../ui/Toast';

interface Field { key: string; label: string; hint: string; ai: boolean; long?: boolean }
interface Value { v: string; src: 'ia' | 'manuel'; at: string }
type Qualif = Record<string, Value>;

export default function QualificationCard({ candidatId }: { candidatId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const { data: fields } = useQuery({ queryKey: ['qualif-fields'], queryFn: () => api.get<Field[]>('/qualification/fields'), staleTime: 60 * 60 * 1000 });
  const { data: qualif } = useQuery({ queryKey: ['qualif', candidatId], queryFn: () => api.get<Qualif>(`/qualification/candidat/${candidatId}`), enabled: !!candidatId });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['qualif', candidatId] });

  const fill = useMutation({
    mutationFn: () => api.post<{ filled: number; transcriptsUsed: number }>(`/qualification/fill/${candidatId}`, {}),
    onSuccess: (r) => { invalidate(); toast('success', `${r.filled} champ(s) remplis depuis ${r.transcriptsUsed} échange(s)`); },
    onError: (e: any) => toast('error', e?.message || "Aucun transcript exploitable"),
  });
  const save = useMutation({
    mutationFn: (payload: Record<string, string | null>) => api.put(`/qualification/candidat/${candidatId}`, payload),
    onSuccess: () => { invalidate(); setEditing(null); },
    onError: (e: any) => toast('error', e?.message || 'Échec de la sauvegarde'),
  });

  const list = fields ?? [];
  const q = qualif ?? {};
  const filledCount = list.filter((f) => q[f.key]?.v).length;

  const startEdit = (f: Field) => { setEditing(f.key); setDraft(q[f.key]?.v ?? ''); };
  const commit = (f: Field) => save.mutate({ [f.key]: draft.trim() || null });

  return (
    <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.1)', borderRadius: 18, padding: '18px 20px', boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 15, letterSpacing: '-.02em', color: '#1A1533' }}>Qualification</div>
          <div style={{ fontSize: 11.5, color: '#8A8699', marginTop: 2 }}>{filledCount}/{list.length} champs · les infos clés en un coup d'œil</div>
        </div>
        <button onClick={() => fill.mutate()} disabled={fill.isPending} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: '#E6E9AF', background: '#22177A', border: 'none', borderRadius: 10, padding: '9px 14px', cursor: fill.isPending ? 'default' : 'pointer', opacity: fill.isPending ? 0.6 : 1 }}>
          <Sparkles size={14} />{fill.isPending ? 'Analyse…' : 'Remplir depuis le meeting'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        {list.map((f) => {
          const val = q[f.key];
          const isEditing = editing === f.key;
          const span = f.long || isEditing;
          return (
            <div key={f.key} style={{ gridColumn: span ? '1 / -1' : undefined, background: '#FCFCF5', border: '1px solid rgba(34,23,122,.08)', borderRadius: 12, padding: '11px 13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8A8699', flex: 1 }}>{f.label}</span>
                {val && (
                  <span title={val.src === 'ia' ? 'Rempli par l’IA' : 'Saisi manuellement'} style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: val.src === 'ia' ? '#2A4A8A' : '#7A5E1E', background: val.src === 'ia' ? '#E8EEF9' : '#F2F3D8', borderRadius: 5, padding: '2px 6px' }}>{val.src === 'ia' ? 'IA' : 'Manuel'}</span>
                )}
                {!isEditing && (
                  <button onClick={() => startEdit(f)} title="Modifier" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, color: '#B4B0C4', display: 'flex' }}><Pencil size={12.5} /></button>
                )}
              </div>
              {isEditing ? (
                <div>
                  <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={f.hint} rows={f.long ? 3 : 2}
                    style={{ width: '100%', resize: 'vertical', fontFamily: "'Manrope',sans-serif", fontSize: 13, lineHeight: 1.5, padding: '8px 10px', borderRadius: 9, border: '1.5px solid rgba(34,23,122,.18)', background: '#fff', outline: 'none' }} />
                  <div style={{ display: 'flex', gap: 7, marginTop: 7, justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditing(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#4A4568', background: '#F5F4EA', border: 'none', borderRadius: 8, padding: '6px 11px', cursor: 'pointer' }}><X size={12} />Annuler</button>
                    <button onClick={() => commit(f)} disabled={save.isPending} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#E6E9AF', background: '#22177A', border: 'none', borderRadius: 8, padding: '6px 11px', cursor: 'pointer' }}><Check size={12} />Enregistrer</button>
                  </div>
                </div>
              ) : (
                <div onClick={() => startEdit(f)} style={{ fontSize: 13, lineHeight: 1.5, color: val ? '#1A1533' : '#B4B0C4', cursor: 'pointer', whiteSpace: 'pre-wrap' }}>
                  {val?.v || (f.ai ? '— à qualifier' : '— à renseigner')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
