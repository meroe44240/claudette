import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Copy, Save } from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from '../ui/Toast';

interface Q { id: string; text: string }
interface Template { id: string; name: string; category: string | null; questions: Q[]; isSystem: boolean }

const NAVY = '#22177A';
const LIME = '#E6E9AF';

/** Éditeur de la trame de qualification d'un mandat (questions). */
export default function TrameEditor({ mandatId }: { mandatId: string }) {
  const qc = useQueryClient();
  const [questions, setQuestions] = useState<Q[]>([]);
  const [loaded, setLoaded] = useState(false);

  const { data: trameData } = useQuery({ queryKey: ['trame', mandatId], queryFn: () => api.get<{ trame: Q[] }>(`/trames/mandat/${mandatId}`) });
  const { data: templates } = useQuery({ queryKey: ['trame-templates'], queryFn: () => api.get<Template[]>('/trames/templates') });

  useEffect(() => { if (trameData && !loaded) { setQuestions(trameData.trame ?? []); setLoaded(true); } }, [trameData, loaded]);

  const save = useMutation({
    mutationFn: () => api.put(`/trames/mandat/${mandatId}`, { questions: questions.filter((q) => q.text.trim()) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trame', mandatId] }); toast('success', 'Trame enregistrée'); },
    onError: (e: any) => toast('error', e?.message || 'Erreur'),
  });

  const addQ = () => setQuestions((qs) => [...qs, { id: `q${Date.now()}`, text: '' }]);
  const setQ = (i: number, text: string) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, text } : q)));
  const delQ = (i: number) => setQuestions((qs) => qs.filter((_, j) => j !== i));
  const copyTemplate = (t: Template) => { setQuestions(t.questions.map((q, i) => ({ id: `q${i + 1}`, text: q.text }))); toast('info', `« ${t.name} » copiée — ajuste puis enregistre`); };

  const inp: React.CSSProperties = { flex: 1, fontFamily: "'Manrope',sans-serif", fontSize: 13, padding: '9px 11px', borderRadius: 9, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', color: '#1A1533', outline: 'none' };

  return (
    <div>
      <div style={{ fontSize: 12.5, color: '#6E6A85', lineHeight: 1.5 }}>
        La grille de questions posées aux candidats de ce mandat. L'IA la remplira automatiquement depuis leurs transcripts d'appels/entretiens (bouton sur chaque candidat).
      </div>

      {/* Bibliothèque */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8A8699', marginBottom: 7 }}>Copier depuis un template</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(templates ?? []).map((t) => (
            <button key={t.id} onClick={() => copyTemplate(t)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: NAVY, background: '#F2F3D8', border: '1px solid rgba(34,23,122,.14)', borderRadius: 999, padding: '5px 11px', cursor: 'pointer' }} title={`${t.questions.length} questions`}>
              <Copy size={11} />{t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Questions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {questions.length === 0 && <div style={{ fontSize: 12.5, color: '#9A96AE', fontStyle: 'italic', padding: '10px 0' }}>Aucune question. Copie un template ou ajoute-en une.</div>}
        {questions.map((q, i) => (
          <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: NAVY, color: LIME, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>{i + 1}</span>
            <input value={q.text} onChange={(e) => setQ(i, e.target.value)} style={inp} placeholder="Votre question…" />
            <button onClick={() => delQ(i)} style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: 'none', background: '#FBF1EF', color: '#B3261E', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        <button onClick={addQ} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: NAVY, background: '#fff', border: '1.5px solid rgba(34,23,122,.18)', borderRadius: 10, padding: '9px 14px', cursor: 'pointer' }}><Plus size={14} />Ajouter une question</button>
        <button onClick={() => save.mutate()} disabled={save.isPending} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, color: LIME, background: NAVY, border: 'none', borderRadius: 10, padding: '9px 18px', cursor: 'pointer', marginLeft: 'auto' }}><Save size={14} />{save.isPending ? 'Enregistrement…' : 'Enregistrer la trame'}</button>
      </div>
    </div>
  );
}
