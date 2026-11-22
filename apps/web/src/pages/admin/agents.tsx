import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Bot, Copy, KeyRound, Pause, Play, Plus, ScrollText, Trash2 } from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import { t, LOCALE } from '../../lib/i18n';
import WebhooksSection from '../../components/agents/WebhooksSection';

interface Agent {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  created_at: string;
  key: { prefix: string; created_at: string } | null;
  rate_limit_per_minute: number;
  last_activity_at: string | null;
  actions_today: number;
  writes_today: number;
  actions_7_days: Array<{ day: string; count: number }>;
}

interface ShownKey { name: string; key: string }

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtAgo(d: string | null) {
  if (!d) return t('Jamais');
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  if (min < 1) return t("À l'instant");
  if (min < 60) return t('Il y a {n} min', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('Il y a {n} h', { n: h });
  return fmtDate(d);
}

function Bars({ days }: { days: Agent['actions_7_days'] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="flex h-7 items-end gap-[3px]" title={days.map((d) => `${d.day} : ${d.count}`).join('\n')}>
      {days.map((d) => (
        <div key={d.day} className="w-[6px] rounded-sm bg-primary-500/70" style={{ height: `${Math.max(2, (d.count / max) * 28)}px`, opacity: d.count ? 1 : 0.25 }} />
      ))}
    </div>
  );
}

function KeyBanner({ shown, onClose }: { shown: ShownKey[]; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (k: string) => {
    try { await navigator.clipboard.writeText(k); setCopied(k); } catch { setCopied(null); }
  };
  return (
    <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="mb-2 flex items-center justify-between gap-4">
        <div className="text-sm font-semibold text-amber-900">
          {shown.length > 1 ? t('Clés créées : copie-les maintenant, elles ne seront plus affichées.') : t('Clé créée : copie-la maintenant, elle ne sera plus affichée.')}
        </div>
        <button onClick={onClose} className="text-sm font-semibold text-amber-900 underline">{t("C'est noté")}</button>
      </div>
      <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {shown.map((s) => (
          <div key={s.key} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm">
            <span className="w-24 shrink-0 font-semibold">{s.name}</span>
            <code className="min-w-0 flex-1 select-all break-all text-xs">{s.key}</code>
            <button onClick={() => copy(s.key)} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary-600">
              <Copy size={13} /> {copied === s.key ? t('Copiée') : t('Copier')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Bouton en deux temps : le premier clic demande confirmation, le second agit. */
function ConfirmButton({ label, confirmLabel, onConfirm, icon, danger }: { label: string; confirmLabel: string; onConfirm: () => void; icon: React.ReactNode; danger?: boolean }) {
  const [armed, setArmed] = useState(false);
  if (armed) {
    return (
      <span className="flex items-center gap-1">
        <button onClick={() => { setArmed(false); onConfirm(); }} className={`rounded-md px-2 py-1 text-xs font-semibold text-white ${danger ? 'bg-red-600' : 'bg-primary-600'}`}>{confirmLabel}</button>
        <button onClick={() => setArmed(false)} className="px-1 text-xs text-neutral-500">{t('Annuler')}</button>
      </span>
    );
  }
  return (
    <button onClick={() => setArmed(true)} title={label} aria-label={label} className={`flex items-center rounded-md p-1.5 hover:bg-neutral-100 ${danger ? 'text-red-600' : 'text-neutral-700'}`}>
      {icon}
    </button>
  );
}

function RateLimitInput({ agent, onSave }: { agent: Agent; onSave: (n: number) => void }) {
  const [v, setV] = useState(String(agent.rate_limit_per_minute));
  const dirty = Number(v) !== agent.rate_limit_per_minute && Number(v) > 0;
  return (
    <span className="flex items-center gap-1">
      <input id={`limit-${agent.id}`} type="number" min={1} max={10000} value={v} onChange={(e) => setV(e.target.value)}
        className="w-16 rounded-md border border-neutral-200 px-2 py-1 text-xs tabular-nums" aria-label={t('Appels par minute')} />
      {dirty && <button onClick={() => onSave(Number(v))} className="text-xs font-semibold text-primary-600">{t('Enregistrer')}</button>}
    </span>
  );
}

export default function AgentsPage() {
  const qc = useQueryClient();
  const [shown, setShown] = useState<ShownKey[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['agents'], queryFn: () => api.get<{ data: Agent[]; defaults: string[] }>('/agents'), refetchInterval: 60_000 });
  const agents = data?.data ?? [];
  const missing = (data?.defaults ?? []).filter((n) => !agents.some((a) => a.name.toLowerCase() === n.toLowerCase())).length;

  const refresh = () => qc.invalidateQueries({ queryKey: ['agents'] });
  const onErr = (e: unknown) => setError((e as Error).message);

  const createOne = useMutation({
    mutationFn: (name: string) => api.post<{ agent: { prenom: string }; key: string }>('/agents', { name }),
    onSuccess: (r) => { setShown([{ name: r.agent.prenom, key: r.key }]); setNewName(''); setError(null); refresh(); },
    onError: onErr,
  });
  const createMissing = useMutation({
    mutationFn: () => api.post<{ created: Array<{ name: string; key: string }> }>('/agents/create-missing'),
    onSuccess: (r) => { setShown(r.created.map((c) => ({ name: c.name, key: c.key }))); setError(null); refresh(); },
    onError: onErr,
  });
  const rotate = useMutation({
    mutationFn: (a: Agent) => api.post<{ key: string }>(`/agents/${a.id}/key`).then((r) => ({ ...r, name: a.name })),
    onSuccess: (r) => { setShown([{ name: r.name, key: r.key }]); refresh(); },
    onError: onErr,
  });
  const revoke = useMutation({ mutationFn: (id: string) => api.delete(`/agents/${id}/key`), onSuccess: refresh, onError: onErr });
  const suspend = useMutation({ mutationFn: (a: Agent) => api.post(`/agents/${a.id}/${a.status === 'ACTIVE' ? 'suspend' : 'reactivate'}`), onSuccess: refresh, onError: onErr });
  const setLimit = useMutation({ mutationFn: (p: { id: string; n: number }) => api.put(`/agents/${p.id}`, { rate_limit_per_minute: p.n }), onSuccess: refresh, onError: onErr });

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-2"><Bot size={26} className="text-primary-500" />{t('Agents')}</span>}
        subtitle={t('Les comptes des agents IA qui travaillent dans Propium par MCP. Chaque action est faite à leur nom et visible dans le journal.')}
        actions={missing > 0 ? (
          <button onClick={() => createMissing.mutate()} disabled={createMissing.isPending}
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            <Plus size={16} /> {t('Créer les {n} agents manquants', { n: missing })}
          </button>
        ) : undefined}
      />

      {shown.length > 0 && <KeyBanner shown={shown} onClose={() => setShown([])} />}
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <form className="mb-4 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) createOne.mutate(newName.trim()); }}>
        <input id="new-agent-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('Prénom du nouvel agent')}
          className="w-56 rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
        <button type="submit" disabled={!newName.trim() || createOne.isPending} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50">
          {t('Ajouter un agent')}
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[1040px] text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <th className="px-3 py-2.5">{t('Agent')}</th>
              <th className="px-3 py-2.5">{t('Statut')}</th>
              <th className="px-3 py-2.5">{t('Clé')}</th>
              <th className="px-3 py-2.5">{t('Créé le')}</th>
              <th className="px-3 py-2.5">{t('Dernière activité')}</th>
              <th className="px-3 py-2.5">{t("Aujourd'hui")}</th>
              <th className="px-3 py-2.5">{t('7 jours')}</th>
              <th className="px-3 py-2.5">{t('Limite / min')}</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={9} className="px-4 py-8 text-center text-neutral-400">{t('Chargement…')}</td></tr>}
            {!isLoading && agents.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-neutral-500">{t("Aucun agent pour l'instant. Crée l'équipe d'un clic avec le bouton en haut à droite.")}</td></tr>
            )}
            {agents.map((a) => (
              <tr key={a.id} className="border-b border-neutral-50 align-middle last:border-0">
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-neutral-900" title={a.email}>{a.name}</div>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${a.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
                    {a.status === 'ACTIVE' ? t('Actif') : t('Suspendu')}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {a.key ? (
                    <div className="whitespace-nowrap"><code className="text-xs">{a.key.prefix}…</code><div className="text-xs text-neutral-400">{fmtDate(a.key.created_at)}</div></div>
                  ) : <span className="text-xs text-red-600">{t('Aucune clé')}</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-neutral-600">{fmtDate(a.created_at)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-neutral-600">{fmtAgo(a.last_activity_at)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                  <span className="font-semibold">{a.actions_today}</span>
                  <span className="text-xs text-neutral-400"> · {t('{n} écritures', { n: a.writes_today })}</span>
                </td>
                <td className="px-3 py-2.5"><Bars days={a.actions_7_days} /></td>
                <td className="px-3 py-2.5"><RateLimitInput agent={a} onSave={(n) => setLimit.mutate({ id: a.id, n })} /></td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
                    <Link to={`/admin/journal?user=${a.id}`} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary-600 hover:bg-neutral-100">
                      <ScrollText size={13} />{t('Activité')}
                    </Link>
                    <ConfirmButton label={a.key ? t('Nouvelle clé') : t('Créer une clé')} confirmLabel={t('Oui, nouvelle clé')} icon={<KeyRound size={15} />} onConfirm={() => rotate.mutate(a)} />
                    {a.key && <ConfirmButton label={t('Révoquer la clé')} confirmLabel={t('Oui, révoquer')} icon={<Trash2 size={15} />} danger onConfirm={() => revoke.mutate(a.id)} />}
                    <button onClick={() => suspend.mutate(a)} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold hover:bg-neutral-100 ${a.status === 'ACTIVE' ? 'text-amber-700' : 'text-green-700'}`}>
                      {a.status === 'ACTIVE' ? <><Pause size={13} />{t('Suspendre')}</> : <><Play size={13} />{t('Réactiver')}</>}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <WebhooksSection />
    </div>
  );
}
