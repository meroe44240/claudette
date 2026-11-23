import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { Download, ExternalLink, MessagesSquare } from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import { t, LOCALE } from '../../lib/i18n';

// Registre des questions posées par les agents sur Humanup Chat (remplace le Google Sheet de suivi).

interface RegistryRow {
  id: string;
  agent: string;
  agent_name: string;
  asked_to: string;
  asked_to_name: string;
  subject: string;
  object_type: string | null;
  object_label: string | null;
  object_url: string | null;
  question: string;
  choices: string[] | null;
  asked_at: string;
  deadline: string | null;
  status: string;
  answer_choice: string | null;
  answer_text: string | null;
  answered_at: string | null;
  response_minutes: number | null;
  answered_by: string | null;
  reminded_at: string | null;
  escalated_at: string | null;
  escalated_to: string | null;
  resolution: string | null;
  propium_action: string | null;
  resolved_at: string | null;
}
interface HubAgent { key: string; name: string; status: string; sent_today: number; budget: number; open_questions: number }

const STATUS_LABEL: Record<string, string> = {
  open: t('En attente'), answered: t('Répondue'), resolved: t('Résolue'), cancelled: t('Annulée'), expired: t('Expirée'),
};
const STATUS_STYLE: Record<string, string> = {
  open: 'bg-amber-100 text-amber-800', answered: 'bg-sky-100 text-sky-700', resolved: 'bg-green-100 text-green-700',
  cancelled: 'bg-neutral-200 text-neutral-600', expired: 'bg-neutral-200 text-neutral-600',
};

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString(LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const fmtDelay = (m: number | null) => {
  if (m === null || m === undefined) return '';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${Math.round(h / 24)} j`;
};

function toCsv(rows: RegistryRow[]): string {
  const cols: Array<[string, (r: RegistryRow) => unknown]> = [
    ['asked_at', (r) => r.asked_at], ['agent', (r) => r.agent_name], ['asked_to', (r) => r.asked_to_name], ['subject', (r) => r.subject],
    ['about', (r) => r.object_label], ['about_url', (r) => r.object_url], ['question', (r) => r.question], ['deadline', (r) => r.deadline],
    ['status', (r) => r.status], ['answer', (r) => r.answer_choice ?? r.answer_text], ['answered_by', (r) => r.answered_by],
    ['answered_at', (r) => r.answered_at], ['response_minutes', (r) => r.response_minutes], ['escalated_to', (r) => r.escalated_to],
    ['propium_action', (r) => r.propium_action], ['resolved_at', (r) => r.resolved_at],
  ];
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map(([c]) => c).join(','), ...rows.map((r) => cols.map(([, f]) => cell(f(r))).join(','))].join('\n');
}

export default function ChatRegistryPage() {
  const [params, setParams] = useSearchParams();
  const f = {
    agent: params.get('agent') ?? '', human: params.get('human') ?? '', status: params.get('status') ?? '',
    from: params.get('from') ?? '', to: params.get('to') ?? '', escalated: params.get('escalated') === '1',
  };
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const qs = new URLSearchParams();
  if (f.agent) qs.set('agent', f.agent);
  if (f.human) qs.set('human', f.human);
  if (f.status) qs.set('status', f.status);
  if (f.from) qs.set('since', new Date(`${f.from}T00:00:00`).toISOString());
  if (f.to) qs.set('until', new Date(`${f.to}T23:59:59`).toISOString());

  const { data: agents } = useQuery({ queryKey: ['chat', 'agents'], queryFn: () => api.get<{ agents: HubAgent[] }>('/admin/chat/agents') });
  const { data, isLoading, error } = useQuery({
    queryKey: ['chat', 'registry', qs.toString()],
    queryFn: () => api.get<{ questions: RegistryRow[] }>(`/admin/chat/registry?${qs}`),
  });
  const rows = useMemo(() => (data?.questions ?? []).filter((r) => !f.escalated || r.escalated_at), [data, f.escalated]);
  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data?.questions ?? []) m.set(r.asked_to, r.asked_to_name);
    if (f.human && !m.has(f.human)) m.set(f.human, f.human);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data, f.human]);
  const open = rows.filter((r) => r.status === 'open').length;
  const answered = rows.filter((r) => r.response_minutes !== null);
  const median = answered.length
    ? [...answered].sort((a, b) => a.response_minutes! - b.response_minutes!)[Math.floor(answered.length / 2)].response_minutes
    : null;

  const exportCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `agents-registry-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const sel = 'rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm';

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-2"><MessagesSquare size={26} className="text-primary-500" />{t('Registre des agents')}</span>}
        subtitle={t('Chaque question posée par un agent sur Humanup Chat : à qui, quand, la réponse, le délai et ce qui a été fait dans Propium.')}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className={sel} value={f.agent} onChange={(e) => set('agent', e.target.value)} aria-label={t('Agent')}>
          <option value="">{t('Tous les agents')}</option>
          {(agents?.agents ?? []).map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
        </select>
        <select className={sel} value={f.human} onChange={(e) => set('human', e.target.value)} aria-label={t('Personne')}>
          <option value="">{t('Toutes les personnes')}</option>
          {people.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
        </select>
        <select className={sel} value={f.status} onChange={(e) => set('status', e.target.value)} aria-label={t('Statut')}>
          <option value="">{t('Tous les statuts')}</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.escalated} onChange={(e) => set('escalated', e.target.checked ? '1' : '')} />
          {t('Escaladées seulement')}
        </label>
        <label className="flex items-center gap-1 text-sm text-neutral-500">{t('Du')}
          <input type="date" className={sel} value={f.from} onChange={(e) => set('from', e.target.value)} />
        </label>
        <label className="flex items-center gap-1 text-sm text-neutral-500">{t('au')}
          <input type="date" className={sel} value={f.to} onChange={(e) => set('to', e.target.value)} />
        </label>
        <button type="button" onClick={exportCsv} disabled={!rows.length}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
          <Download size={14} />{t('Exporter en CSV')}
        </button>
      </div>

      {!error && (
        <div className="mb-3 flex flex-wrap gap-4 text-sm text-neutral-600">
          <span>{t('{n} question(s)', { n: rows.length })}</span>
          <span>{t('{n} en attente', { n: open })}</span>
          {median !== null && <span>{t('Délai de réponse médian : {d}', { d: fmtDelay(median) })}</span>}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <th className="px-3 py-3">{t('Date')}</th>
              <th className="px-3 py-3">{t('Agent')}</th>
              <th className="px-3 py-3">{t('À qui')}</th>
              <th className="px-3 py-3">{t('Question')}</th>
              <th className="px-3 py-3">{t('Statut')}</th>
              <th className="px-3 py-3">{t('Réponse')}</th>
              <th className="px-3 py-3">{t('Délai')}</th>
              <th className="px-3 py-3">{t('Action dans Propium')}</th>
            </tr>
          </thead>
          <tbody>
            {error && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-neutral-500">
                {t("Le registre n'est pas joignable : Humanup Chat n'est pas connecté à Propium.")}
              </td></tr>
            )}
            {isLoading && <tr><td colSpan={8} className="px-4 py-8 text-center text-neutral-400">{t('Chargement…')}</td></tr>}
            {!isLoading && !error && !rows.length && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-neutral-500">{t('Aucune question ne correspond à ces filtres.')}</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-neutral-50 align-top hover:bg-neutral-50">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-neutral-600">{fmtDate(r.asked_at)}</td>
                <td className="px-3 py-2 font-medium">{r.agent_name}</td>
                <td className="px-3 py-2">{r.asked_to_name}</td>
                <td className="max-w-md px-3 py-2">
                  <div className="font-medium">{r.subject}</div>
                  <div className="text-xs text-neutral-500">{r.question}</div>
                  {r.object_label && (
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {r.object_url
                        ? <a href={r.object_url} className="inline-flex items-center gap-1 text-primary-600">{r.object_label}<ExternalLink size={11} /></a>
                        : r.object_label}
                    </div>
                  )}
                  {r.deadline && <div className="text-xs text-neutral-400">{t('Échéance {d}', { d: fmtDate(r.deadline) })}</div>}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status] ?? 'bg-neutral-100'}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                  {r.escalated_at && <div className="mt-1 text-xs text-amber-700">{t('Escaladée à {p}', { p: r.escalated_to ?? '' })}</div>}
                </td>
                <td className="max-w-xs px-3 py-2">
                  {r.answer_choice ?? r.answer_text ?? ''}
                  {r.answered_by && r.answered_by !== r.asked_to && <div className="text-xs text-neutral-400">{t('par {p}', { p: r.answered_by })}</div>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-neutral-600">{fmtDelay(r.response_minutes)}</td>
                <td className="max-w-xs px-3 py-2 text-xs text-neutral-600">{r.propium_action ?? r.resolution ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
