import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Check } from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from '../ui/Toast';

interface Q { id: string; text: string }
interface Answer { questionId: string; answer: string | null; source: string; filledAt: string }

const NAVY = '#22177A';
const LIME = '#E6E9AF';

/** Trame de qualification remplie pour une candidature (réponses IA depuis transcripts). */
export default function TrameAnswers({ candidatureId, mandatId }: { candidatureId: string; mandatId: string }) {
  const qc = useQueryClient();
  const { data: trame } = useQuery({ queryKey: ['trame', mandatId], queryFn: () => api.get<{ trame: Q[] }>(`/trames/mandat/${mandatId}`) });
  const { data: ans } = useQuery({ queryKey: ['trame-answers', candidatureId], queryFn: () => api.get<{ trameAnswers: Answer[] }>(`/trames/answers/${candidatureId}`) });

  const fill = useMutation({
    mutationFn: () => api.post<{ answers: Answer[]; transcriptsUsed: number }>(`/trames/fill/${candidatureId}`),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['trame-answers', candidatureId] }); toast('success', `Trame remplie depuis ${r.transcriptsUsed} transcript(s)`); },
    onError: (e: any) => toast('error', e?.message || 'Erreur lors du remplissage'),
  });

  const questions = trame?.trame ?? [];
  const answers = ans?.trameAnswers ?? [];
  const answerFor = (qid: string) => answers.find((a) => a.questionId === qid)?.answer;

  if (questions.length === 0) {
    return <div style={{ fontSize: 12.5, color: '#8A8699', lineHeight: 1.6 }}>Aucune trame définie sur ce mandat. Ouvre le mandat → onglet <strong>Trame</strong> pour créer les questions, puis reviens ici pour remplir automatiquement depuis les transcripts.</div>;
  }

  const filledCount = questions.filter((q) => answerFor(q.id)).length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: '#6E6A85' }}>{filledCount}/{questions.length} réponse(s) remplie(s) depuis les transcripts.</div>
        <button onClick={() => fill.mutate()} disabled={fill.isPending} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 800, color: LIME, background: NAVY, border: 'none', borderRadius: 10, padding: '8px 15px', cursor: fill.isPending ? 'wait' : 'pointer', opacity: fill.isPending ? 0.6 : 1 }}>
          <Sparkles size={14} />{fill.isPending ? 'Analyse des transcripts…' : 'Remplir depuis les transcripts (IA)'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        {questions.map((q, i) => {
          const a = answerFor(q.id);
          return (
            <div key={q.id} style={{ border: '1px solid rgba(34,23,122,.1)', borderRadius: 12, padding: '12px 14px', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: a ? '#EAF3EC' : '#F2F3D8', color: a ? '#2C6B3F' : NAVY, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 800, marginTop: 1 }}>{a ? <Check size={11} /> : i + 1}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1533' }}>{q.text}</div>
                  <div style={{ fontSize: 13, color: a ? '#3A3550' : '#B4B0C4', marginTop: 4, lineHeight: 1.5, fontStyle: a ? 'normal' : 'italic' }}>{a || 'Non abordé dans les transcripts'}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
