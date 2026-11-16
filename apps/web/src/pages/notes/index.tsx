import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { RefreshCw, Video, Plus, AlertTriangle, Radio, FileText, BotOff } from 'lucide-react';
import { api } from '../../lib/api-client';
import { t } from '../../lib/i18n';
import { usePageTitle } from '../../hooks/usePageTitle';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import { toast } from '../../components/ui/Toast';
import { CALL_TYPES, fmtDay, fmtTime, statusLabel, typeColor, typeLabel, type Attendee, type PropiumLink } from './shared';

interface CallRow {
  id: string; titre: string; startAt: string; endAt: string; platform: string; callType: string; needsReview: boolean; reviewReason: string | null;
  excluded: boolean; status: string; attendees: Attendee[]; hasBrief: boolean; questionCount: number; uncoveredDealbreakers: number;
  owner: string | null; error: string | null; propiumLinks: PropiumLink[];
}
interface Settings { enabled: boolean; timezone: string; googleConnected: boolean; recallConfigured: boolean; botName: string; retentionDays: number }

export default function NotesPage() {
  usePageTitle(t('Notes visio'));
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['notes', 'calls', tab],
    queryFn: () => api.get<{ recallConfigured: boolean; calls: CallRow[] }>(`/notes/calls?range=${tab}`),
    refetchInterval: 30_000,
  });
  const { data: settings } = useQuery({ queryKey: ['notes', 'settings'], queryFn: () => api.get<Settings>('/notes/settings') });

  const sync = useMutation({
    mutationFn: () => api.post<{ count: number }>('/notes/sync'),
    onSuccess: (r) => { toast('success', t('{n} visio(s) trouvée(s) dans votre agenda', { n: r.count })); qc.invalidateQueries({ queryKey: ['notes'] }); },
    onError: (e: any) => toast('error', e.message || t('Synchronisation impossible')),
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.put<Settings>('/notes/settings', { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', 'settings'] }),
  });
  const recapTest = useMutation({
    mutationFn: () => api.post<{ sent: number }>('/notes/recap/test'),
    onSuccess: () => toast('success', t('Email du soir envoyé dans votre boîte')),
    onError: (e: any) => toast('error', e.message),
  });

  const groups = useMemo(() => {
    const m = new Map<string, CallRow[]>();
    for (const c of data?.calls ?? []) {
      const k = new Date(c.startAt).toDateString();
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m.values()];
  }, [data]);

  return (
    <div>
      <PageHeader
        title={t('Notes visio')}
        subtitle={t('Le bot {name} rejoint vos visios Meet et Teams, coche les questions du brief en direct et range les notes dans Propium.', { name: settings?.botName ?? 'Humanup Notes' })}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowNew(true)}><Plus size={15} className="mr-1.5" />{t('Ajouter un call')}</Button>
            <Button onClick={() => sync.mutate()} loading={sync.isPending}><RefreshCw size={15} className="mr-1.5" />{t('Lire mon agenda')}</Button>
          </div>
        }
      />

      {settings && !settings.recallConfigured && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>{t('Mode simulation : Recall.ai n’est pas encore branché, aucun bot ne rejoint les calls. Ouvrez un call et lancez la démo pour tester le panneau live et les notes.')}</div>
        </div>
      )}
      {settings && !settings.googleConnected && (
        <div className="mb-4 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm">
          {t('Votre agenda Google n’est pas connecté.')} <Link to="/settings/integrations" className="font-semibold text-[#22177A] underline">{t('Connecter Google')}</Link>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl bg-neutral-100 p-1">
          {(['upcoming', 'past'] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${tab === k ? 'bg-white text-[#22177A] shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}>
              {k === 'upcoming' ? t('À venir') : t('Passés')}
            </button>
          ))}
        </div>
        {settings && (
          <div className="flex items-center gap-4 text-sm text-neutral-600">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={settings.enabled} onChange={(e) => toggle.mutate(e.target.checked)} className="h-4 w-4 accent-[#22177A]" />
              {t('Bot activé sur mes visios')}
            </label>
            <button onClick={() => recapTest.mutate()} className="text-[#22177A] underline-offset-2 hover:underline" disabled={recapTest.isPending}>{t('Recevoir le récap du soir maintenant')}</button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !groups.length ? (
        <EmptyState
          icon={<Video size={28} />}
          title={tab === 'upcoming' ? t('Aucune visio à venir') : t('Aucun call passé')}
          description={tab === 'upcoming' ? t('Les visios Meet et Teams de votre agenda apparaissent ici. Ajoutez « [no-bot] » au titre d’un événement pour l’exclure.') : undefined}
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g[0].startAt}>
              <h2 className="mb-2 text-xs font-semibold capitalize tracking-wide text-neutral-500">{fmtDay(g[0].startAt)}</h2>
              <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                {g.map((c) => <CallLine key={c.id} c={c} onOpen={() => navigate(`/notes/${c.id}`)} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      <NewCallModal open={showNew} onClose={() => setShowNew(false)} onCreated={(id) => navigate(`/notes/${id}`)} />
    </div>
  );
}

function CallLine({ c, onOpen }: { c: CallRow; onOpen: () => void }) {
  const ext = c.attendees.filter((a) => a.role !== 'internal');
  const live = c.status === 'IN_CALL' || c.status === 'JOINING';
  return (
    <div onClick={onOpen} className="flex cursor-pointer items-center gap-4 px-4 py-3 transition hover:bg-[#FCFCF5]">
      <div className="w-14 shrink-0 text-sm font-semibold text-[#1A1533]">{fmtTime(c.startAt)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-[#1A1533]">{c.titre}</span>
          {c.excluded && <BotOff size={14} className="shrink-0 text-neutral-400" />}
        </div>
        <div className="mt-0.5 truncate text-xs text-neutral-500">
          {c.platform === 'TEAMS' ? 'Teams' : 'Meet'}{ext.length ? ` · ${ext.map((a) => a.name || a.email).join(', ')}` : c.attendees.length ? ` · ${t('interne')}` : ''}
          {c.owner ? ` · ${c.owner}` : ''}
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        {c.needsReview && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">{t('À préciser')}</span>}
        {!c.hasBrief && c.status === 'SCHEDULED' && !c.excluded && (c.callType === 'QUALIF' || c.callType === 'INTAKE') && (
          <span className="flex items-center gap-1 text-xs text-neutral-500"><FileText size={13} />{t('Brief à charger')}</span>
        )}
        {c.status === 'DONE' && c.uncoveredDealbreakers > 0 && (
          <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">{t('{n} dealbreaker(s) sans réponse', { n: c.uncoveredDealbreakers })}</span>
        )}
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${typeColor[c.callType]}`}>{typeLabel(c.callType)}</span>
        <span className={`flex items-center gap-1 text-xs ${live ? 'font-semibold text-red-600' : c.status === 'FAILED' ? 'text-red-600' : 'text-neutral-500'}`}>
          {live && <Radio size={13} className="animate-pulse" />}{statusLabel(c.status, c.excluded)}
        </span>
      </div>
    </div>
  );
}

function NewCallModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [titre, setTitre] = useState('');
  const [url, setUrl] = useState('');
  const [start, setStart] = useState(() => {
    const d = new Date(Date.now() + 10 * 60_000);
    d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const [type, setType] = useState('QUALIF');
  const create = useMutation({
    mutationFn: () => api.post<{ id: string }>('/notes/calls', { titre, meetingUrl: url.trim() || 'demo', startAt: new Date(start).toISOString(), callType: type }),
    onSuccess: (c) => { onClose(); onCreated(c.id); },
    onError: (e: any) => toast('error', e.message),
  });
  return (
    <Modal isOpen={open} onClose={onClose} title={t('Ajouter un call')}>
      <div className="space-y-3">
        <Input label={t('Titre')} value={titre} onChange={(e) => setTitre(e.target.value)} placeholder={t('Qualif Julien Martin')} />
        <Input label={t('Lien Meet ou Teams (vide = call de démonstration)')} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://meet.google.com/abc-defg-hij" />
        <Input label={t('Début')} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        <Select label={t('Type de call')} value={type} onChange={setType} options={CALL_TYPES.map((c) => ({ value: c, label: typeLabel(c) }))} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>{t('Annuler')}</Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!titre.trim()}>{t('Créer')}</Button>
        </div>
      </div>
    </Modal>
  );
}
