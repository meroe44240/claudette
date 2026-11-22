import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { ChevronDown, ChevronRight, ExternalLink, ScrollText } from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import { t, LOCALE } from '../../lib/i18n';

interface AuditEntry {
  id: string;
  at: string;
  action: string;
  entity: string;
  entity_id: string | null;
  label: string | null;
  by: { id: string; name: string; is_agent: boolean } | null;
  source: string;
  tool: string | null;
  externe: boolean;
  batch_id: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}
interface Facets { entities: string[]; tools: string[]; users: Array<{ id: string; name: string; is_agent: boolean }> }

const ACTION_LABEL: Record<string, string> = {
  CREATE: t('Création'), UPDATE: t('Modification'), DELETE: t('Suppression'), RESTORE: t('Restauration'), EXTERNAL: t('Action externe'),
};
const ACTION_STYLE: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700', UPDATE: 'bg-sky-100 text-sky-700', DELETE: 'bg-red-100 text-red-700',
  RESTORE: 'bg-violet-100 text-violet-700', EXTERNAL: 'bg-amber-100 text-amber-800',
};
const ENTITY_LABEL: Record<string, string> = {
  CANDIDAT: t('Candidat'), CLIENT: t('Client'), ENTREPRISE: t('Société'), MANDAT: t('Mandat'), CANDIDATURE: t('Candidature'),
  ACTIVITE: t('Activité'), LEAD: t('Lead'), LEADINTERACTION: t('Interaction lead'), JOBOFFER: t('Offre'), PROFILRECHERCHE: t('Profil recherché'),
  NOTECALL: t("Note d'appel"), POSTLINKEDIN: t('Post LinkedIn'), BOOKING: t('Rendez-vous'), MCP_TOOL: t('Outil MCP'),
  CANDIDATEXPERIENCE: t('Expérience'), FICHIERACTIVITE: t('Fichier'), PORTALACCESS: t('Accès portail'), CONTRACTAPPROVAL: t('Validation de contrat'),
};
const ENTITY_ROUTE: Record<string, string> = { CANDIDAT: '/candidats/', CLIENT: '/clients/', ENTREPRISE: '/entreprises/', MANDAT: '/mandats/' };

const fmtVal = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

function Detail({ e }: { e: AuditEntry }) {
  const changes = e.changes ? Object.entries(e.changes) : [];
  const snapshot = e.action === 'DELETE' ? e.before : e.action === 'CREATE' ? e.after : null;
  return (
    <div className="flex flex-col gap-3 bg-neutral-50 px-6 py-4 text-xs">
      {changes.length > 0 && (
        <table className="w-full max-w-3xl">
          <thead><tr className="text-left text-neutral-500"><th className="py-1 pr-4">{t('Champ')}</th><th className="py-1 pr-4">{t('Avant')}</th><th className="py-1">{t('Après')}</th></tr></thead>
          <tbody>
            {changes.map(([k, c]) => (
              <tr key={k} className="align-top">
                <td className="py-1 pr-4 font-semibold text-neutral-700">{k}</td>
                <td className="max-w-xs break-words py-1 pr-4 text-red-700">{fmtVal(c.old)}</td>
                <td className="max-w-xs break-words py-1 text-green-700">{fmtVal(c.new)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {snapshot && (
        <pre className="max-h-64 max-w-3xl overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-[11px] text-neutral-700">{JSON.stringify(snapshot, null, 2)}</pre>
      )}
      {e.metadata && <div className="text-neutral-500">{JSON.stringify(e.metadata)}</div>}
      {e.batch_id && <div className="text-neutral-400">{t('Lot')} {e.batch_id}</div>}
    </div>
  );
}

export default function JournalPage() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);
  const filters = {
    user: params.get('user') ?? '',
    agents: params.get('agents') === '1',
    entity: params.get('entity') ?? '',
    action: params.get('action') ?? '',
    externe: params.get('externe') === '1',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    q: params.get('q') ?? '',
    page: Number(params.get('page') ?? '1'),
  };
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const qs = new URLSearchParams();
  if (filters.user) qs.set('user_id', filters.user);
  if (filters.agents) qs.set('agents_only', 'true');
  if (filters.entity) qs.set('entity_type', filters.entity);
  if (filters.action) qs.set('action', filters.action);
  if (filters.externe) qs.set('externe', 'true');
  if (filters.from) qs.set('from', filters.from);
  if (filters.to) qs.set('to', filters.to);
  if (filters.q) qs.set('q', filters.q);
  qs.set('page', String(filters.page));

  const { data: facets } = useQuery({ queryKey: ['audit', 'facets'], queryFn: () => api.get<Facets>('/audit/facets') });
  const { data, isLoading } = useQuery({
    queryKey: ['audit', qs.toString()],
    queryFn: () => api.get<{ data: AuditEntry[]; meta: { total: number; page: number; totalPages: number } }>(`/audit?${qs}`),
  });
  const sel = 'rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm';

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-2"><ScrollText size={26} className="text-primary-500" />{t('Journal')}</span>}
        subtitle={t('Chaque création, modification, suppression et action externe, avec son auteur, son outil et les valeurs avant et après.')}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select id="f-user" className={sel} value={filters.agents ? '__agents' : filters.user} onChange={(e) => {
          const next = new URLSearchParams(params); next.delete('page');
          if (e.target.value === '__agents') { next.set('agents', '1'); next.delete('user'); }
          else { next.delete('agents'); if (e.target.value) next.set('user', e.target.value); else next.delete('user'); }
          setParams(next, { replace: true });
        }} aria-label={t('Auteur')}>
          <option value="">{t('Tous les auteurs')}</option>
          <option value="__agents">{t('Tous les agents')}</option>
          {(facets?.users ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select id="f-entity" className={sel} value={filters.entity} onChange={(e) => set('entity', e.target.value)} aria-label={t('Entité')}>
          <option value="">{t('Toutes les entités')}</option>
          {(facets?.entities ?? []).map((x) => <option key={x} value={x}>{ENTITY_LABEL[x] ?? x}</option>)}
        </select>
        <select id="f-action" className={sel} value={filters.action} onChange={(e) => set('action', e.target.value)} aria-label={t('Action')}>
          <option value="">{t('Toutes les actions')}</option>
          {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input id="f-externe" type="checkbox" checked={filters.externe} onChange={(e) => set('externe', e.target.checked ? '1' : '')} />
          {t('Externes seulement')}
        </label>
        <label className="flex items-center gap-1 text-sm text-neutral-500">{t('Du')}
          <input id="f-from" type="date" className={sel} value={filters.from} onChange={(e) => set('from', e.target.value)} />
        </label>
        <label className="flex items-center gap-1 text-sm text-neutral-500">{t('au')}
          <input id="f-to" type="date" className={sel} value={filters.to} onChange={(e) => set('to', e.target.value)} />
        </label>
        <input id="f-q" className={`${sel} min-w-0 flex-1`} placeholder={t('Chercher une fiche…')} defaultValue={filters.q}
          onKeyDown={(e) => { if (e.key === 'Enter') set('q', (e.target as HTMLInputElement).value.trim()); }} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <th className="w-8 px-2 py-3" />
              <th className="px-3 py-3">{t('Date')}</th>
              <th className="px-3 py-3">{t('Auteur')}</th>
              <th className="px-3 py-3">{t('Action')}</th>
              <th className="px-3 py-3">{t('Fiche')}</th>
              <th className="px-3 py-3">{t('Outil')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">{t('Chargement…')}</td></tr>}
            {!isLoading && !data?.data.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-neutral-500">{t('Aucune action ne correspond à ces filtres.')}</td></tr>}
            {data?.data.map((e) => {
              const route = e.entity_id && ENTITY_ROUTE[e.entity];
              const isOpen = open === e.id;
              return (
                <Fragment key={e.id}>
                  <tr className="cursor-pointer border-b border-neutral-50 hover:bg-neutral-50" onClick={() => setOpen(isOpen ? null : e.id)}>
                    <td className="px-2 py-2 text-neutral-400">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-neutral-600">{new Date(e.at).toLocaleString(LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{e.by?.name ?? t('Système')}</span>
                      
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ACTION_STYLE[e.action] ?? 'bg-neutral-100'}`}>{ACTION_LABEL[e.action] ?? e.action}</span>
                      {e.externe && e.action !== 'EXTERNAL' && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{t('externe')}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-neutral-500">{ENTITY_LABEL[e.entity] ?? e.entity}</span>
                      {e.label && <span className="ml-1 font-medium">{e.label}</span>}
                      {route && e.action !== 'DELETE' && (
                        <Link to={`${route}${e.entity_id}`} onClick={(ev) => ev.stopPropagation()} className="ml-1 inline-flex align-middle text-primary-600"><ExternalLink size={12} /></Link>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-500">{e.tool ?? (e.source === 'WEB' ? t('Interface') : e.source === 'API' ? t('API') : t('Système'))}</td>
                  </tr>
                  {isOpen && <tr><td colSpan={6} className="p-0"><Detail e={e} /></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {data && data.meta.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-neutral-500">{t('{n} actions', { n: data.meta.total })}</span>
          <span className="flex items-center gap-2">
            <button disabled={filters.page <= 1} onClick={() => set('page', String(filters.page - 1))} className="rounded-lg border px-3 py-1 disabled:opacity-40">{t('Précédent')}</button>
            <span className="tabular-nums">{t('Page {p} sur {n}', { p: filters.page, n: data.meta.totalPages })}</span>
            <button disabled={filters.page >= data.meta.totalPages} onClick={() => set('page', String(filters.page + 1))} className="rounded-lg border px-3 py-1 disabled:opacity-40">{t('Suivant')}</button>
          </span>
        </div>
      )}
    </div>
  );
}
