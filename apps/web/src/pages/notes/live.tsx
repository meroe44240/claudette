// Panneau live : ouvert à côté de la visio, visible du seul membre Humanup.
// Interroge l'API toutes les 2,5 s (le cochage par l'IA tourne toutes les 20 s).
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { AlertTriangle, Check, CircleDashed, CircleDot, Clock, Loader2, MessageCircleQuestion, Pin, Radio, Square, UserX, X } from 'lucide-react';
import { api } from '../../lib/api-client';
import { t } from '../../lib/i18n';
import { usePageTitle } from '../../hooks/usePageTitle';
import { typeLabel, type LiveAlert, type NoteQuestion, type QStatus, type PropiumLink } from './shared';

interface LiveState {
  id: string; titre: string; status: string; callType: string; platform: string; startAt: string; endAt: string; startedAt: string | null; endedAt: string | null;
  questions: NoteQuestion[]; alerts: LiveAlert[]; lastAnalyzedAt: string | null; transcriptTail: { speaker: string; text: string }[]; transcriptCount: number;
  targetMinutes: number; recallConfigured: boolean; hasBot: boolean; meetingUrl: string; propiumLinks: PropiumLink[]; error: string | null;
}

const NEXT: Record<QStatus, QStatus> = { todo: 'covered', covered: 'partial', partial: 'todo' };

export default function NotesLivePanel() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const key = ['notes', 'live', id];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.get<LiveState>(`/notes/calls/${id}/live`),
    refetchInterval: (q) => (['DONE', 'CANCELLED', 'FAILED'].includes((q.state.data as LiveState | undefined)?.status ?? '') ? false : 2500),
  });
  usePageTitle(data ? `${data.status === 'IN_CALL' ? '● ' : ''}${data.titre}` : t('Panneau live'));

  const setStatus = useMutation({
    mutationFn: ({ qid, status }: { qid: string; status: QStatus }) => api.post(`/notes/calls/${id}/questions/${qid}/status`, { status }),
    onMutate: async ({ qid, status }) => {
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<LiveState>(key, (old) => old && { ...old, questions: old.questions.map((q) => (q.id === qid ? { ...q, status, manual: true } : q)) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
  const dismiss = useMutation({ mutationFn: (aid: string) => api.delete(`/notes/calls/${id}/alerts/${aid}`), onSettled: () => qc.invalidateQueries({ queryKey: key }) });
  const removeBot = useMutation({ mutationFn: () => api.post(`/notes/calls/${id}/remove-bot`), onSettled: () => qc.invalidateQueries({ queryKey: key }) });
  const end = useMutation({ mutationFn: () => api.post(`/notes/calls/${id}/end`), onSettled: () => qc.invalidateQueries({ queryKey: key }) });

  const now = useNow(1000);
  const timer = useMemo(() => {
    if (!data) return null;
    const start = new Date(data.startedAt ?? data.startAt).getTime();
    const stop = data.endedAt ? new Date(data.endedAt).getTime() : now;
    const elapsed = Math.max(0, Math.floor((stop - start) / 1000));
    const remaining = data.targetMinutes * 60 - elapsed;
    return { elapsed, remaining };
  }, [data, now]);

  if (isLoading || !data) return <div className="flex h-screen items-center justify-center bg-[#FCFCF5]"><Loader2 className="animate-spin text-[#22177A]" /></div>;

  const live = data.status === 'IN_CALL';
  const qs = data.questions || [];
  const pinned = qs.filter((q) => q.dealbreaker && q.status !== 'covered');
  const others = qs.filter((q) => !(q.dealbreaker && q.status !== 'covered'));
  const done = qs.filter((q) => q.status === 'covered').length;
  const lowTime = live && timer && timer.remaining <= 300 && pinned.length > 0;

  return (
    <div className="min-h-screen bg-[#FCFCF5] text-[#1A1533]">
      {/* En-tête */}
      <div className="sticky top-0 z-10 border-b border-[#eceaf2] bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{data.titre}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
              {live ? <><Radio size={12} className="animate-pulse text-red-600" /><span className="font-medium text-red-600">{t('En direct')}</span></> : <span>{statusText(data.status)}</span>}
              <span>· {typeLabel(data.callType)}</span>
            </div>
          </div>
          {timer && (
            <div className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-sm font-semibold ${lowTime ? 'bg-red-50 text-red-700' : timer.remaining < 0 ? 'bg-amber-50 text-amber-800' : 'bg-[#F2F3D8] text-[#22177A]'}`}>
              <Clock size={14} />{fmtClock(timer.elapsed)}<span className="font-normal opacity-60">/{data.targetMinutes}′</span>
            </div>
          )}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-[#22177A] transition-all" style={{ width: `${qs.length ? (done / qs.length) * 100 : 0}%` }} />
        </div>
        <div className="mt-1 text-[11px] text-neutral-500">{t('{done}/{total} questions couvertes', { done, total: qs.length })}</div>
      </div>

      <div className="space-y-3 p-3">
        {lowTime && (
          <div className="flex items-start gap-2 rounded-xl bg-red-600 px-3 py-2.5 text-sm text-white">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {t('Moins de 5 minutes et {n} dealbreaker(s) sans réponse.', { n: pinned.length })}
          </div>
        )}
        {data.status === 'SCHEDULED' && (
          <div className="rounded-xl border border-[#eceaf2] bg-white px-3 py-2.5 text-sm text-neutral-600">
            {data.hasBot ? t('Le bot rejoindra le call à l’heure prévue. Les questions se cocheront ici au fil de la conversation.') : data.recallConfigured ? t('Le bot sera programmé avant le début du call.') : t('Mode simulation : lancez la démo depuis la page du call.')}
          </div>
        )}
        {data.status === 'JOINING' && <div className="rounded-xl bg-white px-3 py-2.5 text-sm text-neutral-600">{t('Le bot rejoint le call… Acceptez-le s’il est en salle d’attente.')}</div>}
        {data.status === 'PROCESSING' && <div className="flex items-center gap-2 rounded-xl bg-[#F2F3D8] px-3 py-2.5 text-sm text-[#22177A]"><Loader2 size={15} className="animate-spin" />{t('Call terminé : rédaction des notes…')}</div>}
        {data.status === 'DONE' && (
          <div className="rounded-xl bg-[#E3F1EA] px-3 py-2.5 text-sm text-[#1F6B45]">
            {t('Notes envoyées par email et Propium mis à jour.')} <a href={`/notes/${data.id}`} target="_blank" rel="noreferrer" className="font-semibold underline">{t('Voir les notes')}</a>
          </div>
        )}
        {data.status === 'CANCELLED' && <div className="rounded-xl bg-neutral-100 px-3 py-2.5 text-sm text-neutral-600">{data.error || t('Call annulé.')}</div>}
        {data.status === 'FAILED' && <div className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">{data.error || t('Pas de notes pour ce call.')}</div>}

        {/* Alertes : relances et contradictions */}
        {(data.alerts || []).slice().reverse().slice(0, 3).map((a) => (
          <div key={a.id} className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${a.kind === 'CONTRADICTION' ? 'bg-amber-50 text-amber-900' : 'bg-[#EAE8F7] text-[#22177A]'}`}>
            {a.kind === 'CONTRADICTION' ? <AlertTriangle size={15} className="mt-0.5 shrink-0" /> : <MessageCircleQuestion size={15} className="mt-0.5 shrink-0" />}
            <div className="flex-1"><span className="font-semibold">{a.kind === 'CONTRADICTION' ? t('Écart avec le dossier') : t('Relance')} : </span>{a.text}</div>
            <button onClick={() => dismiss.mutate(a.id)} className="opacity-50 hover:opacity-100"><X size={14} /></button>
          </div>
        ))}

        {pinned.length > 0 && (
          <section>
            <h4 className="mb-1.5 flex items-center gap-1 px-1 text-[11px] font-semibold text-red-700"><Pin size={11} />{t('Dealbreakers à couvrir')}</h4>
            <div className="space-y-1.5">{pinned.map((q) => <QRow key={q.id} q={q} onClick={() => setStatus.mutate({ qid: q.id, status: NEXT[q.status] })} />)}</div>
          </section>
        )}
        <section>
          {pinned.length > 0 && <h4 className="mb-1.5 mt-2 px-1 text-[11px] font-semibold text-neutral-500">{t('Questions')}</h4>}
          <div className="space-y-1.5">{others.map((q) => <QRow key={q.id} q={q} onClick={() => setStatus.mutate({ qid: q.id, status: NEXT[q.status] })} />)}</div>
          {!qs.length && <p className="px-1 py-4 text-center text-sm text-neutral-500">{t('Aucune question : le template du type de call s’appliquera au début du call.')}</p>}
        </section>

        {live && data.transcriptTail.length > 0 && (
          <section className="rounded-xl border border-[#eceaf2] bg-white p-3">
            <h4 className="mb-1 text-[11px] font-semibold text-neutral-500">{t('Derniers échanges')}</h4>
            {data.transcriptTail.map((s, i) => <p key={i} className="text-xs leading-relaxed text-neutral-600"><span className="font-semibold text-neutral-800">{s.speaker}</span> : {s.text}</p>)}
          </section>
        )}

        {(live || data.status === 'JOINING' || data.status === 'SCHEDULED') && (
          <div className="flex gap-2 pt-2">
            {live && <button onClick={() => end.mutate()} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#22177A] px-3 py-2 text-sm font-medium text-[#E6E9AF]"><Square size={13} />{t('Terminer le call')}</button>}
            <button
              onClick={() => { if (window.confirm(t('Retirer le bot ? Le transcript est supprimé et aucune note ne sera conservée.'))) removeBot.mutate(); }}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
              <UserX size={14} />{t('Retirer le bot')}
            </button>
          </div>
        )}
        <p className="px-1 pt-1 text-[11px] leading-snug text-neutral-400">{t('Cliquez sur une question pour la cocher à la main : votre choix prime sur l’IA. Si vous partagez votre écran, partagez un onglet ou une fenêtre, pas l’écran entier.')}</p>
      </div>
    </div>
  );
}

function QRow({ q, onClick }: { q: NoteQuestion; onClick: () => void }) {
  const style = q.status === 'covered' ? 'border-[#cfe6d9] bg-[#F1F8F4]' : q.status === 'partial' ? 'border-amber-200 bg-amber-50/60' : q.dealbreaker ? 'border-red-200 bg-white' : 'border-[#eceaf2] bg-white';
  return (
    <button onClick={onClick} className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition hover:shadow-sm ${style}`}>
      <span className="mt-0.5 shrink-0">
        {q.status === 'covered' ? <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#1F6B45] text-white"><Check size={12} strokeWidth={3} /></span>
          : q.status === 'partial' ? <CircleDot size={18} className="text-amber-600" /> : <CircleDashed size={18} className="text-neutral-300" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm leading-snug ${q.status === 'covered' ? 'text-neutral-500' : 'text-[#1A1533]'}`}>{q.text}</span>
        {q.answer && <span className={`mt-0.5 block text-xs ${q.status === 'partial' ? 'text-amber-800' : 'text-[#1F6B45]'}`}>{q.answer}</span>}
      </span>
      {q.manual && <span className="mt-0.5 shrink-0 text-[10px] text-neutral-400">{t('manuel')}</span>}
    </button>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return now;
}

function fmtClock(s: number) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function statusText(s: string) {
  return ({ SCHEDULED: t('Pas encore commencé'), JOINING: t('Le bot rejoint'), PROCESSING: t('Notes en cours'), DONE: t('Terminé'), FAILED: t('Sans notes'), CANCELLED: t('Annulé') } as Record<string, string>)[s] ?? s;
}
