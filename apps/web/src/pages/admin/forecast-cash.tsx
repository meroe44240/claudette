import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import { t, LOCALE } from '../../lib/i18n';
import ForecastTabs, { eur, signedEur, monthLabel, dayLabel, ENTITY_LABEL } from './forecast-tabs';

interface CountedItem { label: string; amount_eur: number; kind: string }
interface Scenario { key: string; label: string; cash_eur: number; billed_added_eur?: number; gap_to_normal_eur?: number; counted: string; items: CountedItem[] }
interface MonthRow { month: string; billed_invoices_eur: number; billed_recurring_eur: number; billed_total_eur: number; cash_in_eur: number; expenses_eur: number; owner_draws_eur: number; net_eur: number }
interface Cashflow {
  as_of: string;
  target_month: string;
  balance: { total_eur: number; date: string; accounts: Array<{ id: string; name: string; balance_eur: number; balance_date: string }> };
  billed_ytd: { year: number; to_month: string; issued_eur: number; to_bill_eur: number; recurring_eur: number; total_eur: number; target_eur: number | null; gap_to_target_eur: number | null };
  months: MonthRow[];
  scenarios: Scenario[];
  owner_draws: { total_eur: number };
  pipe: { weighted_eur: number; deals: number };
  warnings: string[];
}
interface Invoice { id: string; number: string | null; label: string | null; company: { name: string } | null; status: string; amount_eur: number; paid_eur: number; expected_cash_month: string | null; at_risk: boolean }
interface Deal { deal_id: string; company: string; mandate_title: string; position_index: number; positions_total: number; fee_eur: number; weighted_eur: number; proba: number; billing_month: string }

const thisYearDec = () => `${new Date().getFullYear()}-12`;
const input = 'rounded border border-neutral-200 px-2 py-1 text-[13px] text-blue-700 outline-none focus:border-[#22177A]';

// ─── Hypothèses : comptes, charges, récurrent, prélèvements ───────────

type Kind = 'cash_account' | 'expense' | 'recurring_revenue' | 'owner_draw';
interface Col { key: string; label: string; type: 'text' | 'eur' | 'month' | 'date' | 'entity'; required?: boolean; width?: string }

const KINDS: Record<Kind, { title: string; hint?: string; cols: Col[]; total?: (rows: any[]) => string }> = {
  cash_account: {
    title: 'Comptes de trésorerie',
    hint: 'Solde en € saisi à la main. La projection part de la date de solde la plus récente.',
    cols: [
      { key: 'name', label: 'Compte', type: 'text', required: true },
      { key: 'entity', label: 'Entité', type: 'entity' },
      { key: 'balance_eur', label: 'Solde', type: 'eur', required: true, width: 'w-28' },
      { key: 'balance_date', label: 'Au', type: 'date', width: 'w-36' },
    ],
    total: (rows) => eur(rows.filter((r) => r.active !== false).reduce((s, r) => s + r.balance_eur, 0)),
  },
  expense: {
    title: 'Charges pro mensuelles',
    hint: 'Les charges du mois du solde sont supposées déjà payées.',
    cols: [
      { key: 'label', label: 'Poste', type: 'text', required: true },
      { key: 'category', label: 'Catégorie', type: 'text', width: 'w-28' },
      { key: 'monthly_eur', label: 'Par mois', type: 'eur', required: true, width: 'w-28' },
      { key: 'start_month', label: 'Depuis', type: 'month', width: 'w-32' },
      { key: 'end_month', label: 'Jusqu’à', type: 'month', width: 'w-32' },
    ],
    total: (rows) => {
      const now = new Date().toISOString().slice(0, 7);
      return `${eur(rows.filter((r) => (!r.start_month || r.start_month <= now) && (!r.end_month || r.end_month >= now)).reduce((s, r) => s + r.monthly_eur, 0))} ${t('par mois')}`;
    },
  },
  recurring_revenue: {
    title: 'Revenus récurrents',
    hint: 'Comptés en facturé et en encaissé chaque mois actif. Ne saisis pas aussi leurs factures mois par mois.',
    cols: [
      { key: 'label', label: 'Libellé', type: 'text', required: true },
      { key: 'monthly_eur', label: 'Par mois', type: 'eur', required: true, width: 'w-28' },
      { key: 'start_month', label: 'Depuis', type: 'month', required: true, width: 'w-32' },
      { key: 'end_month', label: 'Dernier mois', type: 'month', width: 'w-32' },
    ],
  },
  owner_draw: {
    title: 'Prélèvements dirigeant',
    hint: 'Visible par les admins seulement. Les agents n’en voient que le total.',
    cols: [
      { key: 'label', label: 'Libellé', type: 'text', required: true },
      { key: 'amount_eur', label: 'Montant', type: 'eur', required: true, width: 'w-28' },
      { key: 'month', label: 'Mois', type: 'month', required: true, width: 'w-32' },
    ],
    total: (rows) => eur(rows.reduce((s, r) => s + r.amount_eur, 0)),
  },
};

function display(col: Col, v: any) {
  if (v == null || v === '') return <span className="text-neutral-300">·</span>;
  if (col.type === 'eur') return eur(v);
  if (col.type === 'month') return monthLabel(v);
  if (col.type === 'date') return dayLabel(v);
  if (col.type === 'entity') return ENTITY_LABEL[v] ?? v;
  return v;
}

function Field({ col, value, onChange }: { col: Col; value: any; onChange: (v: any) => void }) {
  if (col.type === 'entity') {
    return (
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={`${input} ${col.width ?? 'w-full'}`}>
        <option value="">·</option>
        {Object.entries(ENTITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    );
  }
  const type = col.type === 'eur' ? 'number' : col.type === 'text' ? 'text' : col.type;
  return <input type={type} value={value ?? ''} onChange={(e) => onChange(col.type === 'eur' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} className={`${input} ${col.width ?? 'w-full'} ${col.type === 'eur' ? 'text-right' : ''}`} />;
}

function FinanceList({ kind }: { kind: Kind }) {
  const cfg = KINDS[kind];
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({ queryKey: ['finance', kind], queryFn: () => api.get<any[]>(`/forecast/finance/${kind}`) });
  const [edit, setEdit] = useState<{ id: string | null; draft: Record<string, any> } | null>(null);
  const done = () => { setEdit(null); qc.invalidateQueries({ queryKey: ['finance', kind] }); qc.invalidateQueries({ queryKey: ['cashflow'] }); };
  const save = useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: Record<string, any> }) => {
      const body: Record<string, any> = {};
      for (const c of cfg.cols) {
        const v = draft[c.key];
        if (v === undefined) continue;
        body[c.key] = v === '' ? (c.required ? undefined : null) : v;
      }
      return id ? api.patch(`/forecast/finance/${kind}/${id}`, body) : api.post(`/forecast/finance/${kind}`, body);
    },
    onSuccess: done,
  });
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/forecast/finance/${kind}/${id}`), onSuccess: done });

  const editRow = (id: string | null) => (
    <tr key={id ?? 'new'} className="border-t border-neutral-100 bg-blue-50/40">
      {cfg.cols.map((c) => (
        <td key={c.key} className="px-3 py-1.5"><Field col={c} value={edit!.draft[c.key]} onChange={(v) => setEdit({ id, draft: { ...edit!.draft, [c.key]: v } })} /></td>
      ))}
      <td className="whitespace-nowrap px-3 py-1.5 text-right">
        <button type="button" disabled={save.isPending} onClick={() => save.mutate(edit!)} className="rounded bg-[#22177A] px-2.5 py-1 text-[12px] font-semibold text-[#E6E9AF] disabled:opacity-50">{t('Enregistrer')}</button>
        <button type="button" onClick={() => setEdit(null)} className="ml-1 rounded px-2 py-1 text-[12px] text-neutral-500 hover:bg-neutral-100">{t('Annuler')}</button>
      </td>
    </tr>
  );

  return (
    <div className="rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-2.5">
        <div>
          <div className="text-[13px] font-semibold text-neutral-800">{t(cfg.title)}</div>
          {cfg.hint && <div className="text-[11.5px] text-neutral-500">{t(cfg.hint)}</div>}
        </div>
        <div className="flex items-center gap-3">
          {cfg.total && rows.length > 0 && <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-neutral-800">{cfg.total(rows)}</span>}
          <button type="button" onClick={() => setEdit({ id: null, draft: {} })} className="rounded-lg border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50">{t('Ajouter')}</button>
        </div>
      </div>
      {save.error && <div className="px-4 py-2 text-[12px] text-red-600">{(save.error as Error).message}</div>}
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-neutral-500">
            {cfg.cols.map((c) => <th key={c.key} className={`whitespace-nowrap px-3 py-1.5 font-medium ${c.type === 'eur' ? 'text-right' : ''}`}>{t(c.label)}</th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (edit?.id === r.id ? editRow(r.id) : (
            <tr key={r.id} className="group border-t border-neutral-100">
              {cfg.cols.map((c) => (
                <td key={c.key} className={`px-3 py-1.5 ${c.type === 'eur' ? 'whitespace-nowrap text-right tabular-nums text-blue-700' : ''}`}>{display(c, r[c.key])}</td>
              ))}
              <td className="whitespace-nowrap px-3 py-1.5 text-right opacity-0 group-hover:opacity-100">
                <button type="button" onClick={() => setEdit({ id: r.id, draft: { ...r } })} className="rounded px-2 py-0.5 text-[12px] text-neutral-600 hover:bg-neutral-100">{t('Modifier')}</button>
                <button type="button" onClick={() => { if (window.confirm(t('Supprimer cette ligne ?'))) del.mutate(r.id); }} className="rounded px-2 py-0.5 text-[12px] text-red-600 hover:bg-red-50">{t('Supprimer')}</button>
              </td>
            </tr>
          )))}
          {edit?.id === null && editRow(null)}
          {rows.length === 0 && !edit && (
            <tr><td colSpan={cfg.cols.length + 1} className="px-3 py-3 text-neutral-400">{t('Rien de saisi.')}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <div className="text-[12px] text-neutral-500">{label}</div>
      <div className={`mt-0.5 whitespace-nowrap text-[20px] font-semibold tabular-nums ${tone === 'bad' ? 'text-red-700' : tone === 'good' ? 'text-emerald-700' : 'text-neutral-900'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-neutral-500">{sub}</div>}
    </div>
  );
}

export default function ForecastCashPage() {
  const [target, setTarget] = useState(thisYearDec());
  const [delay, setDelay] = useState<string[]>([]);
  const [force, setForce] = useState<string[]>([]);
  const [objective, setObjective] = useState('');
  const [openScenario, setOpenScenario] = useState<string | null>(null);

  const params = new URLSearchParams({ targetMonth: target });
  if (delay.length) params.set('delay', delay.join(','));
  if (force.length) params.set('force', force.join(','));
  if (objective !== '') params.set('objective', objective);
  const { data, error, isLoading } = useQuery({
    queryKey: ['cashflow', params.toString()],
    queryFn: () => api.get<Cashflow>(`/forecast/cash?${params.toString()}`),
    placeholderData: (prev) => prev,
  });
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices', 'open'], queryFn: () => api.get<Invoice[]>('/forecast/invoices') });
  const { data: forecast } = useQuery({ queryKey: ['forecast', ''], queryFn: () => api.get<{ deals: Deal[] }>('/forecast') });

  const openInvoices = useMemo(() => invoices.filter((i) => !['PAYEE', 'ANNULEE'].includes(i.status) && i.amount_eur > i.paid_eur), [invoices]);
  const deals = useMemo(() => [...(forecast?.deals ?? [])].filter((d) => d.fee_eur > 0).sort((a, b) => b.weighted_eur - a.weighted_eur), [forecast]);
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const normal = data?.scenarios.find((s) => s.key === 'normal');
  const horizon = data?.scenarios.find((s) => s.key === 'horizon');
  const b = data?.billed_ytd;

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6 text-[13px]">
      <PageHeader
        title={t('Trésorerie')}
        subtitle={data ? t('Facturé et encaissé toujours séparés. Trésorerie au {date}.', { date: dayLabel(data.balance.date) }) : undefined}
        actions={<ForecastTabs />}
      />
      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-red-700">{(error as Error).message}</div>}
      {isLoading && !data && <div className="text-neutral-500">{t('Chargement…')}</div>}
      {data?.warnings.map((w) => <div key={w} className="mb-3 rounded-lg bg-amber-50 px-4 py-2 text-amber-800">{w}</div>)}

      {data && b && normal && horizon && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={t('Trésorerie au {date}', { date: dayLabel(data.balance.date) })} value={eur(data.balance.total_eur)}
              sub={data.balance.accounts.map((a) => a.name).join(', ') || t('Aucun compte saisi')} />
            <Kpi label={t('Facturé {year} (fin {m})', { year: b.year, m: monthLabel(b.to_month) })} value={eur(b.total_eur)}
              sub={b.target_eur != null ? t('Objectif {o}, écart {g}', { o: eur(b.target_eur), g: signedEur(-(b.gap_to_target_eur ?? 0)) }) : t('Objectif annuel à définir dans les réglages')}
              tone={b.target_eur != null ? (b.total_eur >= b.target_eur ? 'good' : undefined) : undefined} />
            <Kpi label={t('Trésorerie fin {m}, scénario normal', { m: monthLabel(data.target_month) })} value={eur(normal.cash_eur)} tone={normal.cash_eur < 0 ? 'bad' : undefined} />
            <Kpi label={horizon.label} value={eur(horizon.cash_eur)} sub={t('avec {w} de pipe pondéré', { w: eur(data.pipe.weighted_eur) })} />
          </div>

          {/* Bloc 2 : facturé et encaissé mois par mois */}
          <section className="mb-6 rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
              <div className="font-semibold text-neutral-800">{t('Facturé et encaissé, mois par mois')}</div>
              <div className="text-[12px] text-neutral-500">
                {t('Facturé {y} : {i} émis, {tb} à facturer, {r} récurrent', { y: b.year, i: eur(b.issued_eur), tb: eur(b.to_bill_eur), r: eur(b.recurring_eur) })}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-neutral-500">
                    <th className="px-4 py-2 font-medium">{t('Mois')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Facturé (factures)')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Facturé (récurrent)')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Total facturé')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Encaissements attendus')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Charges')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Prélèvements')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Solde du mois')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.months.map((m) => (
                    <tr key={m.month} className={`border-t border-neutral-100 ${m.month === data.target_month ? 'bg-[#F2F3D8]/50' : ''}`}>
                      <td className="px-4 py-2 capitalize">{monthLabel(m.month)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{eur(m.billed_invoices_eur)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{eur(m.billed_recurring_eur)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums">{eur(m.billed_total_eur)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{eur(m.cash_in_eur)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-neutral-600">{m.expenses_eur ? `-${eur(m.expenses_eur)}` : eur(0)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-neutral-600">{m.owner_draws_eur ? `-${eur(m.owner_draws_eur)}` : eur(0)}</td>
                      <td className={`whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums ${m.net_eur < 0 ? 'text-red-700' : ''}`}>{signedEur(m.net_eur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Bloc 3 : scénarios */}
          <section className="mb-6 grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="rounded-xl border border-neutral-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-2.5">
                <div className="font-semibold text-neutral-800">{t('Projection et scénarios')}</div>
                <label className="flex items-center gap-2 text-neutral-600">{t('Fin du mois')}
                  <input type="month" value={target} onChange={(e) => e.target.value && setTarget(e.target.value)} className={input} />
                </label>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-left text-neutral-500">
                    <th className="px-4 py-2 font-medium">{t('Scénario')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Trésorerie')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Écart')}</th>
                    <th className="px-4 py-2 font-medium">{t('Ce qui est compté')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.scenarios.map((s) => (
                    <Fragment key={s.key}>
                      <tr className="cursor-pointer border-t border-neutral-100 align-top hover:bg-neutral-50" onClick={() => setOpenScenario(openScenario === s.key ? null : s.key)}>
                        <td className="px-4 py-2 font-medium text-neutral-800">{s.key === 'normal' ? t('Normal') : s.label}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums">{eur(s.cash_eur)}</td>
                        <td className={`whitespace-nowrap px-4 py-2 text-right tabular-nums ${(s.gap_to_normal_eur ?? 0) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                          {s.gap_to_normal_eur != null ? signedEur(s.gap_to_normal_eur) : ''}
                          {s.billed_added_eur ? <div className="text-[11.5px] text-neutral-500">{t('+{n} facturé', { n: eur(s.billed_added_eur) })}</div> : null}
                        </td>
                        <td className="px-4 py-2 text-neutral-600">{s.counted}</td>
                      </tr>
                      {openScenario === s.key && s.items.length > 0 && (
                        <tr className="bg-neutral-50/70">
                          <td colSpan={4} className="px-4 py-2">
                            <table className="w-full max-w-xl text-[12.5px]">
                              <tbody>
                                {s.items.map((it, i) => (
                                  <tr key={i}><td className="py-0.5 text-neutral-600">{it.label}</td><td className={`whitespace-nowrap py-0.5 text-right tabular-nums ${it.amount_eur < 0 ? 'text-red-700' : ''}`}>{signedEur(it.amount_eur)}</td></tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="mb-1 font-semibold text-neutral-800">{t('Objectif')}</div>
                <div className="mb-2 text-[12px] text-neutral-500">{t('Trésorerie visée fin {m}. Vide = réglage par défaut.', { m: monthLabel(target) })}</div>
                <input type="number" step={1000} min={0} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="ex. 240000" className={`${input} w-40 text-right`} />
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="mb-1 font-semibold text-neutral-800">{t('Si un client paie en retard')}</div>
                <div className="mb-2 text-[12px] text-neutral-500">{t('Coche les factures qui glissent après le mois cible. Ne change que l’encaissé.')}</div>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {openInvoices.map((i) => (
                    <label key={i.id} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" checked={delay.includes(i.id)} onChange={() => toggle(delay, setDelay, i.id)} />
                        <span>{i.company?.name ?? i.label}{i.number ? ` (${i.number})` : ''}{i.at_risk && <span className="ml-1 rounded bg-red-50 px-1 text-[10.5px] text-red-700">{t('à risque')}</span>}</span>
                      </span>
                      <span className="whitespace-nowrap tabular-nums text-neutral-600">{eur(i.amount_eur - i.paid_eur)}</span>
                    </label>
                  ))}
                  {openInvoices.length === 0 && <div className="text-neutral-400">{t('Aucune facture en attente.')}</div>}
                </div>
              </div>
              <div className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="mb-1 font-semibold text-neutral-800">{t('Avec tel deal signé')}</div>
                <div className="mb-2 text-[12px] text-neutral-500">{t('Compté à 100 % : en facturé au mois prévu, en encaissé selon le délai de paiement.')}</div>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {deals.map((d) => (
                    <label key={d.deal_id} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <input type="checkbox" checked={force.includes(d.deal_id)} onChange={() => toggle(force, setForce, d.deal_id)} />
                        <span>{d.company} <span className="text-neutral-500">{d.mandate_title}{d.positions_total > 1 ? ` #${d.position_index}` : ''}</span></span>
                      </span>
                      <span className="whitespace-nowrap tabular-nums text-neutral-600">{eur(d.fee_eur)} <span className="text-[11px] text-neutral-400">{d.proba.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} %</span></span>
                    </label>
                  ))}
                  {deals.length === 0 && <div className="text-neutral-400">{t('Aucun deal avec un fee dans le pipe.')}</div>}
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Hypothèses (toujours visibles pour pouvoir saisir les premiers soldes) */}
      <div className="mb-2 mt-2 font-semibold text-neutral-800">{t('Hypothèses')}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        <FinanceList kind="cash_account" />
        <FinanceList kind="expense" />
        <FinanceList kind="recurring_revenue" />
        <FinanceList kind="owner_draw" />
      </div>
    </div>
  );
}
