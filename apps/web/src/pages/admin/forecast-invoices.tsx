import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import { t, LOCALE } from '../../lib/i18n';
import ForecastTabs, { eur, monthLabel, dayLabel, ENTITY_LABEL, STATUS_LABEL, STATUS_STYLE } from './forecast-tabs';

interface Invoice {
  id: string; number: string | null; label: string | null;
  company: { id: string; name: string } | null; mandate: { id: string; title: string } | null;
  candidature_id: string | null; candidate: string | null;
  entity: string; status: string; amount: number; currency: string; fx_rate: number | null; amount_eur: number; paid_eur: number;
  planned_billing_month: string | null; issued_at: string | null; due_at: string | null; paid_at: string | null;
  planned_cash_month: string | null; expected_cash_month: string | null; days_late: number; at_risk: boolean; notes: string | null;
}
interface Suggestion {
  candidature_id: string; candidate: string; mandate: { id: string; title: string }; company: { id: string; name: string } | null;
  won_at: string | null; start_date: string | null; fee_eur: number; entity: string; billing_month: string;
}
interface Receivables {
  open_invoices: Array<{ invoice_id: string; number: string | null; client: string; remaining_eur: number; due_at: string | null; days_late: number }>;
  totals: { open_eur: number; overdue_eur: number; overdue_count: number };
  by_client: Array<{ client: string; paid_invoices: number; avg_payment_days: number | null; open_eur: number; overdue_eur: number }>;
}

const input = 'w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[13px] outline-none focus:border-[#22177A]';
const today = () => new Date().toISOString().slice(0, 10);

type Draft = Record<string, any>;

function L({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return <label className={`flex flex-col gap-1 text-[12px] text-neutral-600 ${span ? 'col-span-2' : ''}`}>{t(label)}{children}</label>;
}

function InvoiceForm({ initial, onClose }: { initial: Draft & { id?: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(initial);
  const set = (k: string, v: any) => setD((x) => ({ ...x, [k]: v }));
  const { data: companies } = useQuery({ queryKey: ['entreprises', 'all-names'], queryFn: () => api.get<{ data: { id: string; nom: string }[] }>('/entreprises?perPage=500&fields=id,nom'), staleTime: 5 * 60 * 1000 });
  const save = useMutation({
    mutationFn: () => {
      const body: Draft = {};
      for (const k of ['numero', 'libelle', 'entrepriseId', 'entite', 'statut', 'montant', 'devise', 'montantEur', 'montantPayeEur', 'moisFacturationPrevu', 'dateEmission', 'dateEcheance', 'datePaiement', 'moisEncaissementPrevu', 'aRisque', 'notes', 'mandatId', 'candidatureId']) {
        if (d[k] === undefined) continue;
        body[k] = d[k] === '' ? null : d[k];
      }
      if (body.montant != null) body.montant = Number(body.montant);
      for (const k of ['montantEur', 'montantPayeEur']) if (body[k] != null) body[k] = Number(body[k]);
      if (!body.devise) delete body.devise;
      if (!body.statut) delete body.statut;
      return initial.id ? api.patch(`/forecast/invoices/${initial.id}`, body) : api.post('/forecast/invoices', body);
    },
    onSuccess: () => {
      for (const k of ['invoices', 'invoice-suggestions', 'receivables', 'cashflow']) qc.invalidateQueries({ queryKey: [k] });
      onClose();
    },
  });
  const statut = d.statut ?? 'A_FACTURER';
  const foreign = (d.devise ?? 'EUR').toUpperCase() !== 'EUR';

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/30 px-6 pb-6 pt-20" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 text-[15px] font-semibold text-neutral-900">{initial.id ? t('Modifier la facture') : t('Nouvelle facture')}</div>
        <div className="mb-4 text-[12px] text-neutral-500">{t('Propium suit les factures, il ne les émet pas : le numéro vient de l’outil de facturation.')}</div>
        <div className="grid grid-cols-2 gap-3">
          <L label="Statut">
            <select value={statut} onChange={(e) => set('statut', e.target.value)} className={input}>
              {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
            </select>
          </L>
          <L label="Numéro">
            <input value={d.numero ?? ''} onChange={(e) => set('numero', e.target.value)} placeholder="INV-021" className={input} />
          </L>
          <L label="Client">
            <select value={d.entrepriseId ?? ''} onChange={(e) => set('entrepriseId', e.target.value)} className={input}>
              <option value="">{t('Aucun (libellé libre)')}</option>
              {(companies?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </L>
          <L label="Libellé">
            <input value={d.libelle ?? ''} onChange={(e) => set('libelle', e.target.value)} className={input} />
          </L>
          <L label="Entité qui facture">
            <select value={d.entite ?? ''} onChange={(e) => set('entite', e.target.value)} className={input}>
              <option value="">{t('Par défaut selon le client')}</option>
              {Object.entries(ENTITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </L>
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <L label="Montant">
              <input type="number" min={0} value={d.montant ?? ''} onChange={(e) => set('montant', e.target.value)} className={`${input} text-right`} />
            </L>
            <L label="Devise">
              <input value={d.devise ?? 'EUR'} maxLength={3} onChange={(e) => set('devise', e.target.value.toUpperCase())} className={input} />
            </L>
          </div>
          {foreign && (
            <L label="Montant en € (vide = taux du jour d’émission)" span>
              <input type="number" min={0} value={d.montantEur ?? ''} onChange={(e) => set('montantEur', e.target.value)} className={`${input} text-right`} />
            </L>
          )}
          {statut === 'A_FACTURER' ? (
            <L label="Mois de facturation prévu">
              <input type="month" value={(d.moisFacturationPrevu ?? '').slice(0, 7)} onChange={(e) => set('moisFacturationPrevu', e.target.value)} className={input} />
            </L>
          ) : (
            <>
              <L label="Émise le">
                <input type="date" value={d.dateEmission ?? ''} onChange={(e) => set('dateEmission', e.target.value)} className={input} />
              </L>
              <L label="Échéance (vide = délai du client)">
                <input type="date" value={d.dateEcheance ?? ''} onChange={(e) => set('dateEcheance', e.target.value)} className={input} />
              </L>
            </>
          )}
          {(statut === 'PAYEE' || statut === 'PAYEE_PARTIEL') && (
            <>
              <L label="Payée le">
                <input type="date" value={d.datePaiement ?? ''} onChange={(e) => set('datePaiement', e.target.value)} className={input} />
              </L>
              <L label={statut === 'PAYEE' ? 'Montant reçu en € (vide = total)' : 'Montant reçu en €'}>
                <input type="number" min={0} value={d.montantPayeEur ?? ''} onChange={(e) => set('montantPayeEur', e.target.value)} className={`${input} text-right`} />
              </L>
            </>
          )}
          <L label="Encaissement prévu (forcé)">
            <input type="month" value={(d.moisEncaissementPrevu ?? '').slice(0, 7)} onChange={(e) => set('moisEncaissementPrevu', e.target.value)} className={input} />
          </L>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-neutral-700">
            <input type="checkbox" checked={!!d.aRisque} onChange={(e) => set('aRisque', e.target.checked)} />
            {t('À risque')}
          </label>
          <L label="Notes" span>
            <textarea rows={2} value={d.notes ?? ''} onChange={(e) => set('notes', e.target.value)} className={input} />
          </L>
        </div>
        {save.error && <div className="mt-3 text-[12.5px] text-red-600">{(save.error as Error).message}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[13px] text-neutral-600 hover:bg-neutral-100">{t('Annuler')}</button>
          <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className="rounded-lg bg-[#22177A] px-3 py-1.5 text-[13px] font-semibold text-[#E6E9AF] disabled:opacity-50">{t('Enregistrer')}</button>
        </div>
      </div>
    </div>
  );
}

const toDraft = (i: Invoice): Draft & { id: string } => ({
  id: i.id, numero: i.number, libelle: i.label, entrepriseId: i.company?.id ?? '', entite: i.entity, statut: i.status,
  montant: i.amount, devise: i.currency, montantEur: i.currency !== 'EUR' ? i.amount_eur : undefined, montantPayeEur: i.paid_eur || undefined,
  moisFacturationPrevu: i.planned_billing_month, dateEmission: i.issued_at, dateEcheance: i.due_at, datePaiement: i.paid_at,
  moisEncaissementPrevu: i.planned_cash_month, aRisque: i.at_risk, notes: i.notes,
});

export default function ForecastInvoicesPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [form, setForm] = useState<(Draft & { id?: string }) | null>(null);
  const { data: invoices = [], isLoading, error } = useQuery({ queryKey: ['invoices', status], queryFn: () => api.get<Invoice[]>(`/forecast/invoices${status ? `?status=${status}` : ''}`) });
  const { data: suggestions = [] } = useQuery({ queryKey: ['invoice-suggestions'], queryFn: () => api.get<Suggestion[]>('/forecast/invoices/suggestions') });
  const { data: rec } = useQuery({ queryKey: ['receivables'], queryFn: () => api.get<Receivables>('/forecast/receivables') });
  const refresh = () => { for (const k of ['invoices', 'invoice-suggestions', 'receivables', 'cashflow']) qc.invalidateQueries({ queryKey: [k] }); };
  const fromPlacement = useMutation({ mutationFn: (id: string) => api.post(`/forecast/invoices/from-candidature/${id}`, {}), onSuccess: refresh });
  const markPaid = useMutation({ mutationFn: (id: string) => api.patch(`/forecast/invoices/${id}`, { statut: 'PAYEE', datePaiement: today() }), onSuccess: refresh });
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/forecast/invoices/${id}`), onSuccess: refresh });

  const totals = useMemo(() => {
    const live = invoices.filter((i) => i.status !== 'ANNULEE');
    return { count: live.length, eur: live.reduce((s, i) => s + i.amount_eur, 0) };
  }, [invoices]);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6 text-[13px]">
      <PageHeader title={t('Factures')} subtitle={t('Factures suivies, créances et placements à facturer.')} actions={<ForecastTabs />} />

      {suggestions.length > 0 && (
        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50/50">
          <div className="border-b border-amber-100 px-4 py-2.5 font-semibold text-neutral-800">{t('Placements gagnés sans facture')}</div>
          <table className="w-full">
            <tbody>
              {suggestions.map((s) => (
                <tr key={s.candidature_id} className="border-t border-amber-100">
                  <td className="px-4 py-2">
                    <Link to={`/mandats/${s.mandate.id}`} className="font-medium text-neutral-800 hover:text-[#22177A]">{s.company?.name} · {s.mandate.title}</Link>
                    <span className="ml-2 text-neutral-500">{s.candidate}</span>
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{s.won_at ? t('Gagné le {d}', { d: dayLabel(s.won_at) }) : ''}</td>
                  <td className="px-4 py-2 text-neutral-500">{ENTITY_LABEL[s.entity]}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums">{eur(s.fee_eur)}</td>
                  <td className="px-4 py-2 text-right">
                    <button type="button" disabled={fromPlacement.isPending} onClick={() => fromPlacement.mutate(s.candidature_id)}
                      className="rounded-lg bg-[#22177A] px-3 py-1 text-[12px] font-semibold text-[#E6E9AF] disabled:opacity-50">
                      {t('Créer « à facturer » ({m})', { m: monthLabel(s.billing_month) })}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {fromPlacement.error && <div className="px-4 py-2 text-red-600">{(fromPlacement.error as Error).message}</div>}
        </section>
      )}

      {rec && (
        <section className="mb-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
              <span className="font-semibold text-neutral-800">{t('Créances')}</span>
              <span className="text-neutral-600">
                {t('{o} en attente', { o: eur(rec.totals.open_eur) })}
                {rec.totals.overdue_count > 0 && <span className="ml-2 font-semibold text-red-700">{t('{n} en retard ({e})', { n: rec.totals.overdue_count, e: eur(rec.totals.overdue_eur) })}</span>}
              </span>
            </div>
            <table className="w-full">
              <tbody>
                {rec.open_invoices.map((o) => (
                  <tr key={o.invoice_id} className="border-t border-neutral-100">
                    <td className="px-4 py-2">{o.client}{o.number && <span className="ml-1 text-neutral-500">({o.number})</span>}</td>
                    <td className="px-4 py-2 text-neutral-500">{o.due_at ? t('échéance {d}', { d: dayLabel(o.due_at) }) : ''}</td>
                    <td className={`whitespace-nowrap px-4 py-2 ${o.days_late > 0 ? 'font-semibold text-red-700' : 'text-neutral-400'}`}>{o.days_late > 0 ? t('{n} j de retard', { n: o.days_late }) : t('à l’heure')}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{eur(o.remaining_eur)}</td>
                  </tr>
                ))}
                {rec.open_invoices.length === 0 && <tr><td className="px-4 py-3 text-neutral-400">{t('Aucune facture en attente de paiement.')}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white">
            <div className="border-b border-neutral-100 px-4 py-2.5 font-semibold text-neutral-800">{t('Délai de paiement réel par client')}</div>
            <table className="w-full">
              <thead><tr className="text-left text-neutral-500"><th className="px-4 py-2 font-medium">{t('Client')}</th><th className="px-4 py-2 text-right font-medium">{t('Délai moyen')}</th><th className="px-4 py-2 text-right font-medium">{t('Payées')}</th><th className="px-4 py-2 text-right font-medium">{t('En attente')}</th></tr></thead>
              <tbody>
                {rec.by_client.map((c) => (
                  <tr key={c.client} className="border-t border-neutral-100">
                    <td className="px-4 py-2">{c.client}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{c.avg_payment_days != null ? t('{n} j', { n: c.avg_payment_days }) : <span className="text-neutral-300">·</span>}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.paid_invoices}</td>
                    <td className={`whitespace-nowrap px-4 py-2 text-right tabular-nums ${c.overdue_eur > 0 ? 'text-red-700' : ''}`}>{eur(c.open_eur)}</td>
                  </tr>
                ))}
                {rec.by_client.length === 0 && <tr><td colSpan={4} className="px-4 py-3 text-neutral-400">{t('Pas encore de facture payée.')}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-neutral-800">{t('Toutes les factures')}</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-neutral-200 px-2 py-1 text-[13px]">
              <option value="">{t('Tous les statuts')}</option>
              {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
            </select>
            <span className="text-neutral-500">{t('{n} factures, {e}', { n: totals.count, e: eur(totals.eur) })}</span>
          </div>
          <button type="button" onClick={() => setForm({ statut: 'EMISE', devise: 'EUR', dateEmission: today() })} className="rounded-lg bg-[#22177A] px-3 py-1.5 text-[13px] font-semibold text-[#E6E9AF]">{t('Nouvelle facture')}</button>
        </div>
        {error && <div className="px-4 py-3 text-red-700">{(error as Error).message}</div>}
        {isLoading && <div className="px-4 py-3 text-neutral-500">{t('Chargement…')}</div>}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="px-4 py-2 font-medium">{t('Numéro')}</th>
                <th className="px-4 py-2 font-medium">{t('Client')}</th>
                <th className="px-4 py-2 font-medium">{t('Entité')}</th>
                <th className="px-4 py-2 font-medium">{t('Statut')}</th>
                <th className="px-4 py-2 font-medium">{t('Facturation')}</th>
                <th className="px-4 py-2 font-medium">{t('Encaissement')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('Montant')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('En €')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="group border-t border-neutral-100">
                  <td className="whitespace-nowrap px-4 py-2 font-medium">{i.number ?? <span className="text-neutral-300">·</span>}</td>
                  <td className="px-4 py-2">
                    <div>{i.company?.name ?? i.label}{i.at_risk && <span className="ml-1.5 rounded bg-red-50 px-1.5 text-[10.5px] font-semibold text-red-700">{t('à risque')}</span>}</div>
                    {i.mandate && <Link to={`/mandats/${i.mandate.id}`} className="text-[12px] text-neutral-500 hover:text-[#22177A]">{i.mandate.title}{i.candidate ? ` · ${i.candidate}` : ''}</Link>}
                  </td>
                  <td className="px-4 py-2 text-[12px] text-neutral-500">{ENTITY_LABEL[i.entity]}</td>
                  <td className="px-4 py-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${STATUS_STYLE[i.status]}`}>{t(STATUS_LABEL[i.status])}</span></td>
                  <td className="whitespace-nowrap px-4 py-2">{i.issued_at ? dayLabel(i.issued_at) : i.planned_billing_month ? t('prévu {m}', { m: monthLabel(i.planned_billing_month) }) : ''}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    {i.status === 'PAYEE' ? dayLabel(i.paid_at) : i.expected_cash_month ? monthLabel(i.expected_cash_month) : ''}
                    {i.days_late > 0 && <div className="text-[11.5px] font-semibold text-red-700">{t('{n} j de retard', { n: i.days_late })}</div>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{i.currency === 'EUR' ? '' : `${Math.round(i.amount).toLocaleString(LOCALE)} ${i.currency}`}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums">{eur(i.amount_eur)}{i.paid_eur > 0 && i.paid_eur < i.amount_eur && <div className="text-[11.5px] font-normal text-neutral-500">{t('{p} reçus', { p: eur(i.paid_eur) })}</div>}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right opacity-0 group-hover:opacity-100">
                    {['EMISE', 'PAYEE_PARTIEL'].includes(i.status) && (
                      <button type="button" onClick={() => markPaid.mutate(i.id)} className="rounded px-2 py-0.5 text-[12px] text-emerald-700 hover:bg-emerald-50">{t('Payée')}</button>
                    )}
                    <button type="button" onClick={() => setForm(toDraft(i))} className="rounded px-2 py-0.5 text-[12px] text-neutral-600 hover:bg-neutral-100">{t('Modifier')}</button>
                    <button type="button" onClick={() => { if (window.confirm(t('Supprimer cette facture ? Pour garder l’historique, passe-la plutôt en « Annulée ».'))) del.mutate(i.id); }} className="rounded px-2 py-0.5 text-[12px] text-red-600 hover:bg-red-50">{t('Supprimer')}</button>
                  </td>
                </tr>
              ))}
              {!isLoading && invoices.length === 0 && <tr><td colSpan={9} className="px-4 py-4 text-neutral-400">{t('Aucune facture.')}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {form && <InvoiceForm initial={form} onClose={() => setForm(null)} />}
    </div>
  );
}
