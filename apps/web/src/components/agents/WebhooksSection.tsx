import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Pause, Play, Send, Trash2, Webhook } from 'lucide-react';
import { api } from '../../lib/api-client';
import { t, LOCALE } from '../../lib/i18n';

// Webhooks sortants : Propium envoie les événements choisis (POST JSON signé) à une URL.

interface Hook {
  id: string; url: string; event_types: string[]; description: string | null; active: boolean;
  last_delivery_at: string | null; last_status: number | null; last_error: string | null; consecutive_failures: number;
}

const EVENT_LABELS: Record<string, string> = {
  'mandate.created': t('Nouveau mandat'),
  'mandate.closed': t('Mandat fermé'),
  'candidate.created': t('Candidat créé'),
  'candidate.tag_added': t('Tag posé'),
  'candidate.tag_removed': t('Tag retiré'),
  'stage.changed': t('Étape changée'),
  'lead.created': t('Lead créé'),
  'meeting.created': t('Rendez-vous créé'),
  'presentation.created': t('Présentation créée'),
  'company.created': t('Société créée'),
  'owner.changed': t('Propriétaire changé'),
  'document.added': t('Document ajouté'),
};

const fmt = (d: string) => new Date(d).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function WebhooksSection() {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [desc, setDesc] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { data } = useQuery({ queryKey: ['webhooks'], queryFn: () => api.get<{ data: Hook[] }>('/webhooks') });
  const hooks = data?.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['webhooks'] });
  const onErr = (e: unknown) => setMsg({ ok: false, text: (e as Error).message });

  const create = useMutation({
    mutationFn: () => api.post<{ secret: string }>('/webhooks', { url: url.trim(), eventTypes: types, description: desc.trim() || null }),
    onSuccess: (r) => { setSecret(r.secret); setUrl(''); setDesc(''); setTypes([]); setMsg(null); refresh(); },
    onError: onErr,
  });
  const toggle = useMutation({ mutationFn: (h: Hook) => api.put(`/webhooks/${h.id}`, { active: !h.active }), onSuccess: refresh, onError: onErr });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/webhooks/${id}`), onSuccess: refresh, onError: onErr });
  const test = useMutation({
    mutationFn: (id: string) => api.post<{ delivered: boolean; status: number | null; error: string | null }>(`/webhooks/${id}/test`),
    onSuccess: (r) => { setMsg(r.delivered ? { ok: true, text: t('Test reçu (HTTP {s}).', { s: r.status ?? '?' }) } : { ok: false, text: t('Échec du test : {e}', { e: r.error ?? '?' }) }); refresh(); },
    onError: onErr,
  });

  return (
    <section className="mt-8">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-neutral-900"><Webhook size={18} className="text-primary-500" />{t('Webhooks')}</h2>
      <p className="mb-3 text-sm text-neutral-500">{t('Propium envoie les événements choisis à une URL, signés avec un secret.')}</p>

      {secret && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <div className="font-semibold text-amber-900">{t('Secret du webhook, affiché une seule fois')}</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="break-all text-xs">{secret}</code>
            <button onClick={() => navigator.clipboard.writeText(secret)} aria-label={t('Copier')} className="rounded p-1 hover:bg-amber-100"><Copy size={14} /></button>
            <button onClick={() => setSecret(null)} className="ml-auto text-xs font-semibold text-amber-900">{t("C'est noté")}</button>
          </div>
        </div>
      )}
      {msg && <div className={`mb-3 rounded-lg px-4 py-2 text-sm ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

      {hooks.length > 0 && (
        <div className="mb-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <tbody>
              {hooks.map((h) => (
                <tr key={h.id} className="border-b border-neutral-50 last:border-0">
                  <td className="px-3 py-2.5">
                    <div className="font-mono text-xs text-neutral-900">{h.url}</div>
                    {h.description && <div className="text-xs text-neutral-500">{h.description}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-neutral-600">
                    {h.event_types[0] === '*' ? t('Tous les événements') : h.event_types.map((e) => EVENT_LABELS[e] ?? e).join(', ')}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${h.active ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>{h.active ? t('Actif') : t('En pause')}</span>
                    {h.last_delivery_at && (
                      <span className={`ml-2 ${h.last_error ? 'text-red-600' : 'text-neutral-500'}`} title={h.last_error ?? undefined}>
                        {fmt(h.last_delivery_at)} · {h.last_error ? t('échec') : `HTTP ${h.last_status}`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                      <button onClick={() => test.mutate(h.id)} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-primary-600 hover:bg-neutral-100"><Send size={13} />{t('Tester')}</button>
                      <button onClick={() => toggle.mutate(h)} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100">
                        {h.active ? <><Pause size={13} />{t('Pause')}</> : <><Play size={13} />{t('Reprendre')}</>}
                      </button>
                      <button onClick={() => { if (confirm(t('Supprimer ce webhook ?'))) remove.mutate(h.id); }} aria-label={t('Supprimer')} className="rounded-md p-1.5 text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="rounded-xl border border-neutral-200 bg-white p-4" onSubmit={(e) => { e.preventDefault(); if (url.trim()) create.mutate(); }}>
        <div className="flex flex-wrap gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" aria-label={t('URL du webhook')} className="min-w-[280px] flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t('Description (facultatif)')} aria-label={t('Description')} className="w-60 rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
          <button type="submit" disabled={!url.trim() || create.isPending} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t('Ajouter le webhook')}</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {Object.entries(EVENT_LABELS).map(([k, label]) => (
            <label key={k} className="flex items-center gap-1.5 text-sm text-neutral-700">
              <input type="checkbox" checked={types.includes(k)} onChange={(e) => setTypes((cur) => (e.target.checked ? [...cur, k] : cur.filter((x) => x !== k)))} />
              {label}
            </label>
          ))}
        </div>
        <div className="mt-2 text-xs text-neutral-500">{t('Aucune case cochée : tous les événements.')}</div>
      </form>
    </section>
  );
}
