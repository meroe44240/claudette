import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router';
import {
  ArrowLeft, ArrowDown, ArrowUp, Bot, BotOff, ExternalLink, FileUp, Loader2, Play, Plus, RefreshCw, Sparkles, Square, Trash2, AlertTriangle, CheckCircle2, X,
  Mail,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { t, LOCALE } from '../../lib/i18n';
import { renderMarkdown } from '../../lib/markdown';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useGoBack } from '../../hooks/useGoBack';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { CALL_TYPES, fmtTime, statusLabel, typeColor, typeLabel, type Attendee, type NoteQuestion, type PropiumLink } from './shared';

interface Linked { id: string; label: string; sub?: string; hasCv?: boolean }
interface CallDetail {
  id: string; titre: string; startAt: string; endAt: string; platform: string; meetingUrl: string; callType: string; typeSource: string;
  needsReview: boolean; reviewReason: string | null; excluded: boolean; status: string; attendees: Attendee[]; brief: string | null;
  briefDocs: { name: string; at: string }[]; questions: NoteQuestion[]; questionsSource: string | null; notesMarkdown: string | null;
  propiumLinks: PropiumLink[]; duplicateFlags: { label: string; reason: string; url: string }[]; error: string | null; language: string | null;
  missing: string[]; hasTrame: boolean; targetMinutes: number; recallConfigured: boolean; recallBotId: string | null; transcriptCount: number;
  retentionDays: number; transcriptPurgedAt: string | null;
  linked: { candidat: Linked | null; client: Linked | null; mandat: Linked | null; lead: Linked | null };
}

const card = 'rounded-2xl border border-neutral-200 bg-white p-5';

export default function NoteCallPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const { goBack } = useGoBack('/notes');
  const qc = useQueryClient();
  const key = ['notes', 'call', id];
  const { data: call, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.get<CallDetail>(`/notes/calls/${id}`),
    refetchInterval: (q) => (['IN_CALL', 'JOINING', 'PROCESSING'].includes((q.state.data as CallDetail | undefined)?.status ?? '') ? 3000 : false),
  });
  usePageTitle(call?.titre ?? t('Notes visio'));

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/notes/calls/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: any) => toast('error', e.message),
  });

  // Lien « choisir en un clic » de l'email du soir : ?type=QUALIF
  const applied = useRef(false);
  useEffect(() => {
    const ty = params.get('type');
    if (call && ty && !applied.current && CALL_TYPES.includes(ty as any)) {
      applied.current = true;
      patch.mutate({ callType: ty });
      params.delete('type');
      setParams(params, { replace: true });
      toast('success', t('Type de call enregistré : {type}', { type: typeLabel(ty) }));
    }
  }, [call]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lien « Langue du call ? » des emails : ?lang=fr | en
  const appliedLang = useRef(false);
  useEffect(() => {
    const lg = params.get('lang');
    if (call && (lg === 'fr' || lg === 'en') && !appliedLang.current) {
      appliedLang.current = true;
      patch.mutate({ language: lg });
      params.delete('lang');
      setParams(params, { replace: true });
      toast('success', lg === 'fr' ? t('Langue du call : français') : t('Langue du call : anglais'));
    }
  }, [call]); // eslint-disable-line react-hooks/exhaustive-deps

  const demo = useMutation({
    mutationFn: () => api.post(`/notes/calls/${id}/demo`),
    onSuccess: () => { window.open(`/notes/live/${id}`, `notes-live-${id}`, 'width=460,height=900'); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: any) => toast('error', e.message),
  });
  const end = useMutation({ mutationFn: () => api.post(`/notes/calls/${id}/end`), onSuccess: () => qc.invalidateQueries({ queryKey: key }) });

  if (isLoading || !call) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full" /></div>;

  const ext = call.attendees.filter((a) => a.role !== 'internal');
  const inCall = call.status === 'IN_CALL' || call.status === 'JOINING';
  const before = call.status === 'SCHEDULED';

  return (
    <div className="mx-auto max-w-5xl">
      <button onClick={goBack} className="mb-3 flex items-center gap-1 text-sm text-neutral-500 hover:text-[#22177A]"><ArrowLeft size={15} />{t('Retour')}</button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 26, letterSpacing: '-0.02em', color: '#1A1533' }}>{call.titre}</h1>
          <div className="mt-1 text-sm text-neutral-500">
            {new Date(call.startAt).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })} · {fmtTime(call.startAt)} - {fmtTime(call.endAt)} · {call.platform === 'TEAMS' ? 'Teams' : 'Meet'}
            {' · '}<span className="font-medium">{statusLabel(call.status, call.excluded)}</span>
          </div>
          <div className="mt-1 text-sm text-neutral-600">{ext.length ? ext.map((a) => `${a.name || a.email}${a.role !== 'external' ? ` (${a.role})` : ''}`).join(', ') : call.attendees.length ? t('Réunion interne') : ''}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(before || inCall) && !call.excluded && (
            <Button variant="secondary" onClick={() => window.open(`/notes/live/${id}`, `notes-live-${id}`, 'width=460,height=900')}>
              <ExternalLink size={15} className="mr-1.5" />{t('Panneau live')}
            </Button>
          )}
          {(before || call.status === 'DONE' || call.status === 'FAILED') && !call.recallBotId && (
            <Button variant="secondary" onClick={() => demo.mutate()} loading={demo.isPending}><Play size={15} className="mr-1.5" />{t('Lancer la démo')}</Button>
          )}
          {inCall && <Button variant="danger" onClick={() => end.mutate()} loading={end.isPending}><Square size={14} className="mr-1.5" />{t('Terminer le call')}</Button>}
          {before && (
            <Button variant="ghost" onClick={() => patch.mutate({ excluded: !call.excluded })}>
              {call.excluded ? <><Bot size={15} className="mr-1.5" />{t('Réactiver le bot')}</> : <><BotOff size={15} className="mr-1.5" />{t('Pas de bot sur ce call')}</>}
            </Button>
          )}
        </div>
      </div>

      {call.error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{call.error}</div>}
      {call.status === 'PROCESSING' && <div className="mb-4 flex items-center gap-2 rounded-xl bg-[#F2F3D8] px-4 py-3 text-sm text-[#22177A]"><Loader2 size={16} className="animate-spin" />{t('Rédaction des notes et mise à jour de Propium…')}</div>}

      {(call.status === 'DONE' || call.notesMarkdown) && <Results call={call} />}

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-2">
          <TypeCard call={call} onPatch={(b) => patch.mutate(b)} />
          <BriefCard call={call} onSaved={() => qc.invalidateQueries({ queryKey: key })} />
        </div>
        <div className="lg:col-span-3">
          <QuestionsCard call={call} onSaved={() => qc.invalidateQueries({ queryKey: key })} />
        </div>
      </div>
    </div>
  );
}

// ─── Type et rattachement ───────────────────────────

function TypeCard({ call, onPatch }: { call: CallDetail; onPatch: (b: Record<string, unknown>) => void }) {
  const kinds: { key: 'candidat' | 'mandat' | 'client' | 'lead'; label: string; show: boolean }[] = [
    { key: 'candidat', label: t('Candidat'), show: call.callType === 'QUALIF' },
    { key: 'mandat', label: t('Mandat'), show: call.callType === 'QUALIF' || call.callType === 'INTAKE' },
    { key: 'client', label: t('Client'), show: call.callType === 'INTAKE' || call.callType === 'PROSPECT' },
    { key: 'lead', label: t('Lead'), show: call.callType === 'PROSPECT' },
  ];
  return (
    <div className={card}>
      <h3 className="mb-3 font-semibold text-[#1A1533]">{t('Type de call')}</h3>
      {call.needsReview && (
        <div className="mb-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{call.reviewReason || t('À préciser')}</div>
      )}
      <div className="flex flex-wrap gap-2">
        {CALL_TYPES.map((ty) => (
          <button key={ty} onClick={() => onPatch({ callType: ty })}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${call.callType === ty ? `${typeColor[ty]} ring-2 ring-[#22177A]/30` : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'}`}>
            {typeLabel(ty)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-neutral-500">{call.typeSource === 'AUTO' ? t('Détecté automatiquement depuis l’invitation.') : t('Choisi à la main.')}</p>
      {call.callType !== 'INTERNE' && (call.status === 'SCHEDULED' || call.status === 'JOINING') && (
        <div className="mt-4">
          <div className="mb-1.5 text-sm font-medium text-[#1A1533]">{t('Langue du call')}</div>
          {!call.language && (
            <div className="mb-2 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{t('Langue inconnue : choisis-la pour que le bot sous-titre dans la bonne langue.')}</div>
          )}
          <div className="flex gap-2">
            {(['fr', 'en'] as const).map((lg) => (
              <button key={lg} onClick={() => onPatch({ language: lg })}
                className={`rounded-full px-3 py-1 text-sm font-medium transition ${call.language === lg ? 'bg-[#22177A] text-white' : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100'}`}>
                {lg === 'fr' ? t('Français') : t('Anglais')}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 space-y-3">
        {kinds.filter((k) => k.show).map((k) => (
          <EntityPicker key={k.key} kind={k.key} label={k.label} value={call.linked[k.key]} onChange={(v) => onPatch({ [`${k.key}Id`]: v })} />
        ))}
      </div>
    </div>
  );
}

const ROUTES: Record<string, string> = { candidat: '/candidats', mandat: '/mandats', client: '/clients', lead: '/leads' };

function EntityPicker({ kind, label, value, onChange }: { kind: 'candidat' | 'mandat' | 'client' | 'lead'; label: string; value: Linked | null; onChange: (id: string | null) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { data: results = [], isFetching } = useQuery({
    queryKey: ['notes', 'pick', kind, q],
    enabled: open && q.trim().length >= 2,
    queryFn: async (): Promise<Linked[]> => {
      const s = encodeURIComponent(q.trim());
      if (kind === 'candidat') return ((await api.get<any>(`/candidats?search=${s}&perPage=8`)).data || []).map((c: any) => ({ id: c.id, label: `${c.prenom ?? ''} ${c.nom}`.trim(), sub: [c.posteActuel, c.entrepriseActuelle].filter(Boolean).join(' · ') }));
      if (kind === 'client') return ((await api.get<any>(`/clients?search=${s}&perPage=8`)).data || []).map((c: any) => ({ id: c.id, label: `${c.prenom ?? ''} ${c.nom}`.trim(), sub: c.entreprise?.nom }));
      if (kind === 'mandat') return ((await api.get<any>(`/mandats?search=${s}&perPage=8`)).data || []).map((m: any) => ({ id: m.id, label: m.titrePoste, sub: m.entreprise?.nom }));
      const leads = await api.get<any[]>('/leads');
      const n = q.trim().toLowerCase();
      return (Array.isArray(leads) ? leads : []).filter((l) => `${l.contact} ${l.company} ${l.email ?? ''}`.toLowerCase().includes(n)).slice(0, 8).map((l) => ({ id: l.id, label: l.contact, sub: l.company }));
    },
  });
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-neutral-500">{label}</div>
      {value && !open ? (
        <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 text-sm">
          <a href={`${ROUTES[kind]}${kind === 'lead' ? '' : `/${value.id}`}`} className="min-w-0 truncate font-medium text-[#22177A] hover:underline">
            {value.label}{value.sub ? <span className="ml-1 font-normal text-neutral-500">· {value.sub}</span> : null}
          </a>
          <div className="flex shrink-0 gap-1">
            <button onClick={() => setOpen(true)} className="text-xs text-neutral-500 hover:text-[#22177A]">{t('Changer')}</button>
            <button onClick={() => onChange(null)} className="text-neutral-400 hover:text-red-600"><X size={14} /></button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={t('Rechercher…')}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#22177A]" />
          {open && q.trim().length >= 2 && (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-neutral-200 bg-white shadow-lg">
              {isFetching && <div className="px-3 py-2 text-xs text-neutral-400">{t('Recherche…')}</div>}
              {!isFetching && !results.length && <div className="px-3 py-2 text-xs text-neutral-400">{t('Aucun résultat')}</div>}
              {results.map((r) => (
                <button key={r.id} onClick={() => { onChange(r.id); setOpen(false); setQ(''); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-[#FCFCF5]">
                  <span className="font-medium">{r.label}</span>{r.sub ? <span className="ml-1 text-neutral-500">· {r.sub}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Brief et documents ─────────────────────────────

function BriefCard({ call, onSaved }: { call: CallDetail; onSaved: () => void }) {
  const [brief, setBrief] = useState(call.brief ?? '');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => setBrief(call.brief ?? ''), [call.brief]);
  const save = useMutation({
    mutationFn: () => api.patch(`/notes/calls/${call.id}`, { brief }),
    onSuccess: () => { toast('success', t('Brief enregistré')); onSaved(); },
  });
  const upload = async (f: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch(`/api/v1/notes/calls/${call.id}/documents`, { method: 'POST', body: fd, headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || t('Envoi impossible'));
      toast('success', t('{name} ajouté au brief', { name: f.name }));
      onSaved();
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setUploading(false);
    }
  };
  const placeholder = {
    QUALIF: t('Collez le dossier de qualif, la JD ou le lien LinkedIn du candidat…'),
    INTAKE: t('Notes sur le client, contexte du besoin…'),
    PROSPECT: t('Profil LinkedIn du contact, site de la boîte, contexte…'),
    INTERNE: t('Ordre du jour : un point par ligne'),
  }[call.callType] ?? '';
  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-[#1A1533]">{call.callType === 'INTERNE' ? t('Ordre du jour') : t('Brief et contexte')}</h3>
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-1 text-sm font-medium text-[#22177A] hover:underline">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}{t('Ajouter un PDF')}
        </button>
        <input ref={fileRef} type="file" accept="application/pdf,text/plain" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
      </div>
      {call.missing.length > 0 && (
        <div className="mb-3 text-sm text-amber-800">{t('À charger')} : {call.missing.join(', ')}</div>
      )}
      {call.linked.candidat?.hasCv && <div className="mb-2 flex items-center gap-1 text-xs text-[#1F6B45]"><CheckCircle2 size={13} />{t('CV récupéré depuis la fiche Propium')}</div>}
      {call.hasTrame && <div className="mb-2 flex items-center gap-1 text-xs text-[#1F6B45]"><CheckCircle2 size={13} />{t('Trame de qualification du mandat récupérée')}</div>}
      {call.briefDocs.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{call.briefDocs.map((d, i) => <span key={i} className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{d.name}</span>)}</div>}
      <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={8} placeholder={placeholder}
        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#22177A]" />
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={brief === (call.brief ?? '')}>{t('Enregistrer')}</Button>
      </div>
    </div>
  );
}

// ─── Questions ──────────────────────────────────────

function QuestionsCard({ call, onSaved }: { call: CallDetail; onSaved: () => void }) {
  const [list, setList] = useState<{ id?: string; text: string; dealbreaker: boolean; status?: string; answer?: string | null }[]>(call.questions);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setList(call.questions); }, [call.questions]); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (fn: (l: typeof list) => typeof list) => { setList(fn); setDirty(true); };
  const save = useMutation({
    mutationFn: () => api.put(`/notes/calls/${call.id}/questions`, { questions: list.map((q) => ({ id: q.id, text: q.text, dealbreaker: q.dealbreaker })) }),
    onSuccess: () => { setDirty(false); toast('success', t('Questions enregistrées')); onSaved(); },
  });
  const regen = useMutation({
    mutationFn: () => api.post(`/notes/calls/${call.id}/questions/prepare`),
    onSuccess: () => { setDirty(false); onSaved(); },
    onError: (e: any) => toast('error', e.message),
  });
  const sendBrief = useMutation({
    mutationFn: () => api.post(`/notes/calls/${call.id}/brief/send`),
    onSuccess: () => { toast('success', t('Brief envoyé sur ta boîte mail')); onSaved(); },
    onError: (e: any) => toast('error', e.message),
  });
  const move = (i: number, d: number) => edit((l) => { const c = [...l]; const [x] = c.splice(i, 1); c.splice(i + d, 0, x); return c; });
  const sourceLabel = { TEMPLATE: t('template du type de call'), IA: t('préparées par l’IA'), TRAME: t('trame du mandat'), MANUEL: t('saisies à la main') }[call.questionsSource ?? ''];

  return (
    <div className={card}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-[#1A1533]">{t('Questions du call')}</h3>
          <p className="text-xs text-neutral-500">
            {list.length ? `${list.length} ${t('questions')}${sourceLabel ? ` · ${sourceLabel}` : ''} · ` : ''}{t('{n} min', { n: call.targetMinutes })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => regen.mutate()} loading={regen.isPending}>
            {list.length ? <RefreshCw size={13} className="mr-1" /> : <Sparkles size={13} className="mr-1" />}{list.length ? t('Régénérer') : t('Préparer les questions')}
          </Button>
          {call.callType !== 'INTERNE' && (
            <Button size="sm" variant="secondary" onClick={() => sendBrief.mutate()} loading={sendBrief.isPending} disabled={dirty}>
              <Mail size={13} className="mr-1" />{t('M’envoyer le brief')}
            </Button>
          )}
          {dirty && <Button size="sm" onClick={() => save.mutate()} loading={save.isPending}>{t('Enregistrer')}</Button>}
        </div>
      </div>
      {!list.length ? (
        <p className="py-6 text-center text-sm text-neutral-500">{t('Chargez le brief puis préparez les questions. Sans brief, le template du type de call s’applique au début du call.')}</p>
      ) : (
        <ol className="space-y-1.5">
          {list.map((q, i) => (
            <li key={q.id ?? `new-${i}`} className="group flex items-start gap-2 rounded-lg border border-transparent px-1 py-1 hover:border-neutral-100 hover:bg-[#FCFCF5]">
              <span className="mt-2 w-5 shrink-0 text-right text-xs text-neutral-400">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <textarea value={q.text} rows={1} onChange={(e) => edit((l) => l.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  className="w-full resize-none rounded-md border-0 bg-transparent px-1 py-1 text-sm outline-none focus:bg-white focus:ring-1 focus:ring-[#22177A]/30" style={{ fieldSizing: 'content' } as any} />
                {q.answer && <div className="px-1 text-xs text-[#1F6B45]">{q.answer}</div>}
              </div>
              <button onClick={() => edit((l) => l.map((x, j) => (j === i ? { ...x, dealbreaker: !x.dealbreaker } : x)))}
                title={t('Dealbreaker : question obligatoire')}
                className={`mt-1 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${q.dealbreaker ? 'bg-red-50 text-red-700' : 'text-neutral-300 hover:text-neutral-500'}`}>
                {t('Dealbreaker')}
              </button>
              <div className="mt-1 flex shrink-0 opacity-0 transition group-hover:opacity-100">
                <button disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-neutral-400 hover:text-[#22177A] disabled:opacity-30"><ArrowUp size={14} /></button>
                <button disabled={i === list.length - 1} onClick={() => move(i, 1)} className="p-1 text-neutral-400 hover:text-[#22177A] disabled:opacity-30"><ArrowDown size={14} /></button>
                <button onClick={() => edit((l) => l.filter((_, j) => j !== i))} className="p-1 text-neutral-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <button onClick={() => edit((l) => [...l, { text: '', dealbreaker: false }])} className="mt-3 flex items-center gap-1 text-sm font-medium text-[#22177A] hover:underline">
        <Plus size={14} />{t('Ajouter une question')}
      </button>
    </div>
  );
}

// ─── Après le call ──────────────────────────────────

function Results({ call }: { call: CallDetail }) {
  const [showT, setShowT] = useState(false);
  const { data: tr } = useQuery({
    queryKey: ['notes', 'transcript', call.id],
    enabled: showT,
    queryFn: () => api.get<{ transcript: { speaker: string; text: string }[]; purgedAt: string | null }>(`/notes/calls/${call.id}/transcript`),
  });
  const people = call.propiumLinks.filter((l) => l.kind !== 'TACHE');
  const tasks = call.propiumLinks.filter((l) => l.kind === 'TACHE');
  return (
    <div className="mb-5 grid gap-5 lg:grid-cols-5">
      <div className={`${card} lg:col-span-3`}>
        <h3 className="mb-2 font-semibold text-[#1A1533]">{t('Notes')}</h3>
        {call.notesMarkdown
          ? <div className="prose-sm text-sm leading-relaxed text-neutral-800" dangerouslySetInnerHTML={{ __html: renderMarkdown(call.notesMarkdown.replace(/^# .*\n/, '')) }} />
          : <p className="text-sm text-neutral-500">{t('Pas encore de notes.')}</p>}
        <button onClick={() => setShowT((v) => !v)} className="mt-4 text-sm font-medium text-[#22177A] hover:underline">
          {showT ? t('Masquer le transcript') : t('Voir le transcript ({n} échanges)', { n: call.transcriptCount })}
        </button>
        {showT && (
          <div className="mt-2 max-h-96 space-y-1 overflow-auto rounded-lg bg-neutral-50 p-3 text-sm">
            {tr?.purgedAt && <p className="text-neutral-500">{t('Transcript supprimé (conservation {n} jours).', { n: call.retentionDays })}</p>}
            {(tr?.transcript ?? []).map((s, i) => <p key={i}><span className="font-semibold text-[#22177A]">{s.speaker}</span> : {s.text}</p>)}
          </div>
        )}
      </div>
      <div className={`${card} lg:col-span-2`}>
        <h3 className="mb-2 font-semibold text-[#1A1533]">{t('Dans Propium')}</h3>
        {!people.length && !tasks.length && <p className="text-sm text-neutral-500">{call.callType === 'INTERNE' ? t('Réunion interne : notes envoyées par email uniquement.') : t('Rien n’a été écrit.')}</p>}
        <div className="space-y-1.5">
          {people.map((l) => (
            <a key={l.kind + l.id} href={new URL(l.url).pathname} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-[#FCFCF5]">
              <span><span className="text-neutral-500">{l.kind === 'CANDIDAT' ? t('Candidat') : l.kind === 'CLIENT' ? t('Client') : l.kind === 'MANDAT' ? t('Mandat') : t('Lead')}</span> · <span className="font-medium text-[#22177A]">{l.label}</span></span>
              <span className={`text-xs ${l.action === 'created' ? 'text-[#1F6B45]' : 'text-neutral-500'}`}>{l.action === 'created' ? t('créé') : t('mis à jour')}</span>
            </a>
          ))}
        </div>
        {tasks.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-xs font-medium text-neutral-500">{t('Tâches créées')}</div>
            {tasks.map((l) => <div key={l.id} className="px-2 py-1 text-sm">{l.label}</div>)}
          </div>
        )}
        {call.duplicateFlags.length > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {call.duplicateFlags.map((d, i) => <div key={i}><a href={new URL(d.url).pathname} className="font-medium underline">{d.label}</a> : {d.reason}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
