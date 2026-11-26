import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import { t, LOCALE } from '../../lib/i18n';

interface Settings {
  probaEnvoyeClient: string; probaPremiereEtape: string; probaDerniereEtape: string; probaSansProcess: string;
  probaOffre: string; bonusAutresCandidats: string; objectifFactureAnnuel: number | null;
}
interface FxRate { id: string; devise: string; tauxVersEur: string; dateEffet: string }

const FIELDS: Array<[keyof Settings, string]> = [
  ['probaEnvoyeClient', 'Envoi client, pas encore d’entretien'],
  ['probaPremiereEtape', 'Première étape chez le client'],
  ['probaDerniereEtape', 'Dernière étape chez le client'],
  ['probaSansProcess', 'Entretien client sans process saisi'],
  ['probaOffre', 'Offre (et plafond hors offre)'],
  ['bonusAutresCandidats', 'Bonus par autre candidat côté client (% de sa proba)'],
];

const input = 'rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[13px] text-blue-700 outline-none focus:border-[#22177A]';

export default function ForecastSettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['forecast-settings'], queryFn: () => api.get<{ settings: Settings; fx_rates: FxRate[] }>('/forecast/settings') });
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch('/forecast/settings', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['forecast-settings'] }); qc.invalidateQueries({ queryKey: ['forecast'] }); },
  });
  const [fx, setFx] = useState({ devise: 'USD', tauxVersEur: '', dateEffet: new Date().toISOString().slice(0, 10) });
  const saveFx = useMutation({
    mutationFn: () => api.put('/forecast/fx-rates', { ...fx, tauxVersEur: Number(fx.tauxVersEur) }),
    onSuccess: () => { setFx({ ...fx, tauxVersEur: '' }); qc.invalidateQueries({ queryKey: ['forecast-settings'] }); qc.invalidateQueries({ queryKey: ['forecast'] }); },
  });

  if (!data) return <div className="px-6 py-6 text-[13px] text-neutral-500">{t('Chargement…')}</div>;
  const s = data.settings;

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 text-[13px]">
      <PageHeader title={t('Réglages du forecast')} breadcrumbs={[{ label: t('Pipe partagé'), href: '/admin/forecast' }, { label: t('Réglages') }]} />

      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="mb-3 font-semibold text-neutral-800">{t('Barème des probas')}</div>
        <div className="space-y-2">
          {FIELDS.map(([k, l]) => (
            <label key={k} className="flex items-center justify-between gap-4">
              <span className="text-neutral-700">{t(l)}</span>
              <span className="flex items-center gap-1.5">
                <input type="number" min={0} max={100} step={0.5} defaultValue={Number(s[k])}
                  onBlur={(e) => Number(e.target.value) !== Number(s[k]) && save.mutate({ [k]: Number(e.target.value) })}
                  className={`${input} w-20 text-right`} />
                <span className="text-neutral-500">%</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-3 text-[12px] text-neutral-500">
          {t('Entre la première et la dernière étape, la proba monte en ligne droite. Exemple : 3/5 = {p} %.', {
            p: (Number(s.probaPremiereEtape) + (Number(s.probaDerniereEtape) - Number(s.probaPremiereEtape)) / 2).toLocaleString(LOCALE),
          })}
        </div>
      </section>

      <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="mb-3 font-semibold text-neutral-800">{t('Objectif facturé annuel')}</div>
        <label className="flex items-center gap-2">
          <input type="number" min={0} step={1000} defaultValue={s.objectifFactureAnnuel ?? ''}
            onBlur={(e) => save.mutate({ objectifFactureAnnuel: e.target.value ? Number(e.target.value) : null })}
            className={`${input} w-40 text-right`} />
          <span className="text-neutral-500">€</span>
        </label>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="mb-3 font-semibold text-neutral-800">{t('Taux de conversion vers l’euro')}</div>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[12px] text-neutral-600">{t('Devise')}
            <input value={fx.devise} maxLength={3} onChange={(e) => setFx({ ...fx, devise: e.target.value.toUpperCase() })} className={`${input} w-20`} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-neutral-600">{t('1 unité = … €')}
            <input type="number" step="0.0001" value={fx.tauxVersEur} onChange={(e) => setFx({ ...fx, tauxVersEur: e.target.value })} className={`${input} w-28`} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-neutral-600">{t('À partir du')}
            <input type="date" value={fx.dateEffet} onChange={(e) => setFx({ ...fx, dateEffet: e.target.value })} className={input} />
          </label>
          <button type="button" disabled={!fx.tauxVersEur || saveFx.isPending} onClick={() => saveFx.mutate()}
            className="rounded-lg bg-[#22177A] px-3 py-1.5 font-semibold text-[#E6E9AF] disabled:opacity-50">{t('Enregistrer')}</button>
        </div>
        {saveFx.error && <div className="mb-2 text-red-600">{(saveFx.error as Error).message}</div>}
        <table className="w-full">
          <thead><tr className="text-left text-neutral-500"><th className="py-1.5 font-medium">{t('Devise')}</th><th className="py-1.5 font-medium">{t('Taux')}</th><th className="py-1.5 font-medium">{t('À partir du')}</th></tr></thead>
          <tbody>
            {data.fx_rates.map((r) => (
              <tr key={r.id} className="border-t border-neutral-100">
                <td className="py-1.5">{r.devise}</td>
                <td className="py-1.5 tabular-nums">{Number(r.tauxVersEur).toLocaleString(LOCALE, { maximumFractionDigits: 6 })} €</td>
                <td className="py-1.5">{new Date(r.dateEffet).toLocaleDateString(LOCALE)}</td>
              </tr>
            ))}
            {data.fx_rates.length === 0 && <tr><td colSpan={3} className="py-2 text-neutral-500">{t('Aucun taux saisi : les mandats hors euro sont exclus du pipe.')}</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
