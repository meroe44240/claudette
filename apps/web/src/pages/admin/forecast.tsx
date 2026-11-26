import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import { t, LOCALE } from '../../lib/i18n';
import ForecastTabs from './forecast-tabs';

interface Person { id: string; nom: string }
interface Deal {
  deal_id: string;
  mandate_id: string;
  mandate_title: string;
  company: string;
  position_index: number;
  positions_total: number;
  lead_candidature_id: string | null;
  lead_candidate: string | null;
  step_label: string;
  next_interview_at: string | null;
  waiting_since: string | null;
  other_candidates: number;
  proba_computed: number;
  proba: number;
  proba_overridden: boolean;
  fee_eur: number;
  fee_overridden: boolean;
  weighted_eur: number;
  expected_placements: number;
  billing_month: string;
  billing_month_overridden: boolean;
  source: string | null;
  process_missing: boolean;
  sales: Person | null;
  recruiter: Person | null;
  split_sales_pct: number;
}
interface RecapRow { person_id: string | null; person: string; fee_eur: number; weighted_eur: number; expected_placements: number }
interface LostItem { id: string; mandate_id: string; deal: string; candidate: string | null; fee_eur: number; reason: string; lost_on: string }
interface Forecast {
  label: string;
  generated_at: string;
  totals: { positions: number; fee_eur: number; weighted_eur: number; expected_placements: number; average_proba: number; forced_probas: number; forced_probas_rate: number };
  deals: Deal[];
  recaps: { by_sales: RecapRow[]; by_recruiter: RecapRow[]; by_person: RecapRow[] };
  lost: { since: string; items: LostItem[]; total_fee_eur: number };
  process_missing: Array<{ mandate_id: string; title: string; company: string }>;
  warnings: string[];
}
interface Snapshot { date: string; fee_eur: number; weighted_eur: number; expected_placements: number; forced_probas: number; positions: number }

const eur = (n: number) => `${Math.round(n).toLocaleString(LOCALE)} €`;
const pct = (n: number) => `${n.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} %`;
const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString(LOCALE, { month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const shortDate = (d: string) => new Date(d).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' });
const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

type SortKey = 'weighted_eur' | 'fee_eur' | 'proba' | 'billing_month';

/** Cellule modifiable : texte bleu, comme les saisies du Sheet. */
function EditableCell({
  value, display, forced, disabled, type, onSave, title,
}: {
  value: string; display: string; forced: boolean; disabled?: boolean; type: 'number' | 'month';
  onSave: (v: string | null) => void; title?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (disabled) return <span className="text-neutral-400">{display}</span>;
  if (editing) {
    const commit = () => {
      setEditing(false);
      if (draft !== value) onSave(draft === '' ? null : draft);
    };
    return (
      <input
        autoFocus
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        className="w-24 rounded border border-blue-300 px-1.5 py-0.5 text-right text-[13px] text-blue-700 outline-none focus:ring-2 focus:ring-blue-200"
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => { setDraft(value); setEditing(true); }}
        title={title}
        className="rounded px-1 text-blue-700 hover:bg-blue-50"
      >
        {display}
      </button>
      {forced && (
        <button
          type="button"
          onClick={() => onSave(null)}
          title={t('Revenir à la valeur calculée')}
          className="rounded bg-amber-100 px-1.5 text-[10.5px] font-semibold text-amber-800 hover:bg-amber-200"
        >
          {t('forcé')}
        </button>
      )}
    </span>
  );
}

function RecapTable({ title, rows }: { title: string; rows: RecapRow[] }) {
  const tot = rows.reduce((a, r) => ({ fee: a.fee + r.fee_eur, w: a.w + r.weighted_eur, p: a.p + r.expected_placements }), { fee: 0, w: 0, p: 0 });
  return (
    <div className="rounded-xl border border-neutral-200 bg-white">
      <div className="border-b border-neutral-100 px-4 py-2.5 text-[13px] font-semibold text-neutral-700">{title}</div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-neutral-500">
            <th className="px-4 py-2 font-medium">{t('Responsable')}</th>
            <th className="px-4 py-2 text-right font-medium">{t('Fee')}</th>
            <th className="px-4 py-2 text-right font-medium">{t('Pondéré')}</th>
            <th className="px-4 py-2 text-right font-medium">{t('Placements')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.person_id ?? r.person} className="border-t border-neutral-100">
              <td className="px-4 py-2">{r.person}</td>
              <td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{eur(r.fee_eur)}</td>
              <td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{eur(r.weighted_eur)}</td>
              <td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{r.expected_placements.toLocaleString(LOCALE, { maximumFractionDigits: 1 })}</td>
            </tr>
          ))}
          <tr className="border-t border-neutral-200 font-semibold">
            <td className="px-4 py-2">{t('Total')}</td>
            <td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{eur(tot.fee)}</td>
            <td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{eur(tot.w)}</td>
            <td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{tot.p.toLocaleString(LOCALE, { maximumFractionDigits: 1 })}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function ForecastPage() {
  const qc = useQueryClient();
  const [person, setPerson] = useState('');
  const [source, setSource] = useState('');
  const [lostSince, setLostSince] = useState(firstOfMonth());
  const [sort, setSort] = useState<SortKey>('weighted_eur');

  const params = new URLSearchParams();
  if (person) params.set('personId', person);
  if (source) params.set('source', source);
  if (lostSince) params.set('lostSince', lostSince);

  const { data, isLoading, error } = useQuery({
    queryKey: ['forecast', person, source, lostSince],
    queryFn: () => api.get<Forecast>(`/forecast?${params.toString()}`),
  });
  const { data: snapshots } = useQuery({ queryKey: ['forecast-snapshots'], queryFn: () => api.get<Snapshot[]>('/forecast/snapshots') });

  const override = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`/forecast/deals/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecast'] }),
  });
  const updateLost = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.patch(`/forecast/lost/${id}`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecast'] }),
  });

  // Personnes du filtre : on garde toutes celles déjà vues (la liste ne rétrécit pas quand on filtre)
  const seen = useRef(new Map<string, string>());
  for (const d of data?.deals ?? []) {
    if (d.sales) seen.current.set(d.sales.id, d.sales.nom);
    if (d.recruiter) seen.current.set(d.recruiter.id, d.recruiter.nom);
  }
  const people = [...seen.current.entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const deals = useMemo(() => {
    const list = [...(data?.deals ?? [])];
    list.sort((a, b) => (sort === 'billing_month' ? a.billing_month.localeCompare(b.billing_month) : (b[sort] as number) - (a[sort] as number)));
    return list;
  }, [data?.deals, sort]);

  const save = (d: Deal, body: Record<string, unknown>) => {
    if (d.lead_candidature_id) override.mutate({ id: d.lead_candidature_id, body });
  };

  const SortHead = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th className="px-3 py-2 text-right font-medium">
      <button type="button" onClick={() => setSort(k)} className={sort === k ? 'text-[#22177A] underline underline-offset-4' : 'hover:text-neutral-800'}>
        {children}
      </button>
    </th>
  );

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <PageHeader
        title={t('Pipe partagé')}
        subtitle={data ? t('Au {date}. Fee réparti entre sales et recruteur selon le split de chaque mandat.', { date: new Date(data.generated_at).toLocaleDateString(LOCALE) }) : undefined}
        actions={<ForecastTabs />}
      />

      {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-700">{(error as Error).message}</div>}
      {isLoading && <div className="text-[13px] text-neutral-500">{t('Chargement…')}</div>}

      {data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: t('Fee du pipe'), value: eur(data.totals.fee_eur), sub: t('{n} postes', { n: data.totals.positions }) },
              { label: t('Pondéré'), value: eur(data.totals.weighted_eur), sub: t('proba moyenne {p}', { p: pct(data.totals.average_proba) }) },
              { label: t('Placements attendus'), value: data.totals.expected_placements.toLocaleString(LOCALE, { maximumFractionDigits: 1 }) },
              { label: t('Probas forcées'), value: pct(data.totals.forced_probas_rate), sub: t('{n} sur {total}', { n: data.totals.forced_probas, total: data.totals.positions }) },
              { label: t('Perdus depuis le {date}', { date: shortDate(data.lost.since) }), value: eur(data.lost.total_fee_eur), sub: t('{n} deals', { n: data.lost.items.length }) },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
                <div className="text-[12px] text-neutral-500">{k.label}</div>
                <div className="mt-1 text-[20px] font-semibold tabular-nums text-[#22177A]">{k.value}</div>
                {k.sub && <div className="text-[12px] text-neutral-500">{k.sub}</div>}
              </div>
            ))}
          </div>

          {(data.warnings.length > 0 || data.process_missing.length > 0) && (
            <div className="mb-5 space-y-2">
              {data.warnings.map((w) => (
                <div key={w} className="rounded-lg bg-red-50 px-4 py-2 text-[13px] text-red-700">{t('Mandat exclu du pipe : {w}', { w })}</div>
              ))}
              {data.process_missing.length > 0 && (
                <div className="rounded-lg bg-amber-50 px-4 py-2 text-[13px] text-amber-900">
                  {t('Process à saisir')}{' : '}
                  {data.process_missing.map((m, i) => (
                    <span key={m.mandate_id}>
                      {i > 0 && ', '}
                      <Link to={`/mandats/${m.mandate_id}`} className="underline underline-offset-2">{m.company} {m.title}</Link>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
            <select value={person} onChange={(e) => setPerson(e.target.value)} className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5">
              <option value="">{t('Tous les responsables')}</option>
              {people.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
            </select>
            <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5">
              <option value="">{t('Toutes les sources')}</option>
              <option value="DIRECT">{t('Direct')}</option>
              <option value="PARAFORM">{t('Paraform')}</option>
            </select>
          </div>

          <div className="mb-6 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="px-3 py-2 font-medium">{t('Deal')}</th>
                  <th className="px-3 py-2 font-medium">{t('Étape')}</th>
                  <th className="px-3 py-2 font-medium">{t('Sales / recruteur')}</th>
                  <SortHead k="fee_eur">{t('Fee')}</SortHead>
                  <SortHead k="proba">{t('Proba')}</SortHead>
                  <SortHead k="weighted_eur">{t('Pondéré')}</SortHead>
                  <th className="px-3 py-2 text-right font-medium">{t('Placements')}</th>
                  <SortHead k="billing_month">{t('Facturation')}</SortHead>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => {
                  const noLead = !d.lead_candidature_id;
                  const lockMsg = noLead ? t('Pas de candidat sur ce poste') : undefined;
                  return (
                    <tr key={d.deal_id} className="border-t border-neutral-100 align-top">
                      <td className="px-3 py-2">
                        <Link to={`/mandats/${d.mandate_id}`} className="font-medium text-neutral-800 hover:text-[#22177A]">
                          {d.company}, {d.mandate_title}
                        </Link>
                        {d.positions_total > 1 && <span className="ml-1.5 text-neutral-400">{t('poste {i}/{n}', { i: d.position_index, n: d.positions_total })}</span>}
                        {d.source && <span className="ml-1.5 rounded bg-violet-50 px-1.5 text-[11px] text-violet-700">{d.source === 'PARAFORM' ? 'Paraform' : d.source}</span>}
                        <div className="text-neutral-500">{d.lead_candidate ?? ''}{d.other_candidates > 0 && ` ${t('+ {n} en process', { n: d.other_candidates })}`}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className={noLead ? 'text-neutral-400' : ''}>{d.step_label}</div>
                        {d.next_interview_at && <div className="text-neutral-500">{t('Prochain entretien le {d}', { d: shortDate(d.next_interview_at) })}</div>}
                        {d.waiting_since && <div className="text-amber-700">{t('Retour en attente depuis le {d}', { d: shortDate(d.waiting_since) })}</div>}
                      </td>
                      <td className="px-3 py-2 text-neutral-600">
                        <div>{d.sales?.nom ?? t('Non attribué')} <span className="text-neutral-400">{d.split_sales_pct} %</span></div>
                        <div>{d.recruiter?.nom ?? t('Non attribué')} <span className="text-neutral-400">{100 - d.split_sales_pct} %</span></div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
                        <EditableCell type="number" value={String(d.fee_eur)} display={eur(d.fee_eur)} forced={d.fee_overridden} disabled={noLead} title={lockMsg}
                          onSave={(v) => save(d, { feeEur: v === null ? null : Number(v) })} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">
                        <EditableCell type="number" value={String(d.proba)} display={pct(d.proba)} forced={d.proba_overridden} disabled={noLead}
                          title={d.proba_overridden ? t('Calculée : {p}', { p: pct(d.proba_computed) }) : lockMsg}
                          onSave={(v) => save(d, { proba: v === null ? null : Number(v) })} />
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{d.weighted_eur ? eur(d.weighted_eur) : '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{d.expected_placements.toLocaleString(LOCALE, { maximumFractionDigits: 2 })}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <EditableCell type="month" value={d.billing_month} display={monthLabel(d.billing_month)} forced={d.billing_month_overridden} disabled={noLead} title={lockMsg}
                          onSave={(v) => save(d, { billingMonth: v })} />
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-neutral-200 font-semibold">
                  <td className="px-3 py-2" colSpan={3}>{t('Total')}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{eur(data.totals.fee_eur)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{pct(data.totals.average_proba)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{eur(data.totals.weighted_eur)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums">{data.totals.expected_placements.toLocaleString(LOCALE, { maximumFractionDigits: 1 })}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            <RecapTable title={t('Par responsable (sales + recruteur)')} rows={data.recaps.by_person} />
            <RecapTable title={t('Par recruteur')} rows={data.recaps.by_recruiter} />
            <RecapTable title={t('Par sales')} rows={data.recaps.by_sales} />
          </div>

          <div className="mb-6 rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
              <span className="text-[13px] font-semibold text-neutral-700">{t('Deals perdus')}</span>
              <label className="flex items-center gap-2 text-[13px] text-neutral-600">
                {t('Depuis le')}
                <input type="date" value={lostSince} onChange={(e) => setLostSince(e.target.value)} className="rounded border border-neutral-200 px-2 py-1" />
              </label>
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="px-4 py-2 font-medium">{t('Deal')}</th>
                  <th className="px-4 py-2 font-medium">{t('Date')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('Fee')}</th>
                  <th className="px-4 py-2 font-medium">{t('Raison')}</th>
                </tr>
              </thead>
              <tbody>
                {data.lost.items.map((l) => (
                  <tr key={l.id} className="border-t border-neutral-100">
                    <td className="px-4 py-2">{l.deal}{l.candidate && <span className="text-neutral-500">, {l.candidate}</span>}</td>
                    <td className="px-4 py-2 text-neutral-600">{shortDate(l.lost_on)}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{eur(l.fee_eur)}</td>
                    <td className="px-4 py-2">
                      {l.reason === 'Raison à saisir' ? (
                        <input
                          placeholder={t('Raison à saisir')}
                          onBlur={(e) => e.target.value.trim() && updateLost.mutate({ id: l.id, reason: e.target.value })}
                          className="w-full rounded border border-amber-300 bg-amber-50 px-2 py-1 text-blue-700 placeholder:text-amber-700"
                        />
                      ) : l.reason}
                    </td>
                  </tr>
                ))}
                {data.lost.items.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-3 text-neutral-500">{t('Aucun deal perdu sur la période.')}</td></tr>
                )}
                <tr className="border-t border-neutral-200 font-semibold">
                  <td className="px-4 py-2" colSpan={2}>{t('Total')}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{eur(data.lost.total_fee_eur)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          {snapshots && snapshots.length > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-white">
              <div className="border-b border-neutral-100 px-4 py-2.5 text-[13px] font-semibold text-neutral-700">{t('Photos du lundi')}</div>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-neutral-500">
                    <th className="px-4 py-2 font-medium">{t('Date')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Postes')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Fee')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Pondéré')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Placements attendus')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Probas forcées')}</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => (
                    <tr key={s.date} className="border-t border-neutral-100">
                      <td className="px-4 py-2">{new Date(s.date).toLocaleDateString(LOCALE)}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{s.positions}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{eur(s.fee_eur)}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{eur(s.weighted_eur)}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{s.expected_placements.toLocaleString(LOCALE, { maximumFractionDigits: 1 })}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-right tabular-nums">{s.forced_probas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
