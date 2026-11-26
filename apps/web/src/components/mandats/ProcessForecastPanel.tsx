import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { api } from '../../lib/api-client';
import { t, LOCALE } from '../../lib/i18n';

interface Step { id: string; label: string }
interface MandatLite {
  id: string;
  processEntretien: Step[] | null;
  nbPostes: number;
  feeType: 'POURCENTAGE_PACKAGE' | 'POURCENTAGE_FIXE' | 'MONTANT_FIXE';
  feePourcentage: string | number;
  feeMontantFixe: number | null;
  devise: string;
  sourceDeal: string | null;
  paraformNbVersements: number;
  splitSalesPct: number;
}
interface KanbanCand {
  id: string;
  stage: string;
  processEtape: number | null;
  dateProchainEntretien: string | null;
  retourAttenteDepuis: string | null;
  candidat: { nom: string; prenom: string | null };
}

const CLIENT_STAGES = ['ENTRETIEN_CLIENT', 'PROCESS'];
const STAGE_FR: Record<string, string> = { ENTRETIEN_CLIENT: 'Entretien client', PROCESS: 'Process' };
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CAD', 'SAR', 'AED', 'HKD', 'CHF', 'SGD'];

const input = 'w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[13px] outline-none focus:border-[#22177A]';
const label = 'mb-1 block text-[12px] font-semibold text-neutral-600';

/** Onglet « Process » de la fiche mandat : process d'entretien client, étape de chaque candidat, paramètres du forecast. */
export default function ProcessForecastPanel({ mandatId }: { mandatId: string }) {
  const qc = useQueryClient();
  const { data: mandat } = useQuery({ queryKey: ['mandat-forecast', mandatId], queryFn: () => api.get<MandatLite>(`/mandats/${mandatId}`) });
  const { data: kanban } = useQuery({ queryKey: ['mandat-forecast-kanban', mandatId], queryFn: () => api.get<Record<string, KanbanCand[]>>(`/mandats/${mandatId}/kanban`) });

  const [steps, setSteps] = useState<string[]>([]);
  const [newStep, setNewStep] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (mandat && !dirty) setSteps((mandat.processEntretien ?? []).map((s) => s.label));
  }, [mandat, dirty]);

  const saveProcess = useMutation({
    mutationFn: (list: string[]) => api.put(`/forecast/mandats/${mandatId}/process`, { steps: list }),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['mandat-forecast', mandatId] });
      qc.invalidateQueries({ queryKey: ['mandat-forecast-kanban', mandatId] });
    },
  });
  const saveStep = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`/forecast/candidatures/${id}/process-step`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mandat-forecast-kanban', mandatId] }),
  });
  const saveMandat = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put(`/mandats/${mandatId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mandat-forecast', mandatId] }),
  });

  const edit = (next: string[]) => { setSteps(next); setDirty(true); };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    edit(next);
  };
  const add = () => { if (newStep.trim()) { edit([...steps, newStep.trim()]); setNewStep(''); } };

  const candidates = CLIENT_STAGES.flatMap((s) => kanban?.[s] ?? []);
  const saved = mandat?.processEntretien ?? [];

  if (!mandat) return <div className="p-4 text-[13px] text-neutral-500">{t('Chargement…')}</div>;

  return (
    <div className="space-y-6 p-4 text-[13px]">
      <section>
        <div className="mb-2 font-semibold text-neutral-800">{t("Process d'entretien chez le client")}</div>
        {steps.length === 0 && <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">{t('Process à saisir')}</div>}
        <ol className="space-y-1.5">
          {steps.map((s, i) => (
            <li key={`${i}-${s}`} className="flex items-center gap-1.5">
              <span className="w-5 text-right text-neutral-400">{i + 1}.</span>
              <input value={s} onChange={(e) => edit(steps.map((x, k) => (k === i ? e.target.value : x)))} className={input} />
              <button type="button" onClick={() => move(i, -1)} className="rounded p-1 text-neutral-400 hover:bg-neutral-100" aria-label={t('Monter')}><ArrowUp size={14} /></button>
              <button type="button" onClick={() => move(i, 1)} className="rounded p-1 text-neutral-400 hover:bg-neutral-100" aria-label={t('Descendre')}><ArrowDown size={14} /></button>
              <button type="button" onClick={() => edit(steps.filter((_, k) => k !== i))} className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600" aria-label={t('Supprimer')}><X size={14} /></button>
            </li>
          ))}
        </ol>
        <div className="mt-2 flex gap-1.5">
          <input value={newStep} onChange={(e) => setNewStep(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={t('Ex. Technical interview with Engineering Lead')} className={input} />
          <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-lg bg-[#F0EFC4] px-2.5 text-[#22177A]"><Plus size={14} />{t('Ajouter')}</button>
        </div>
        {dirty && (
          <button type="button" onClick={() => saveProcess.mutate(steps.filter((s) => s.trim()))} disabled={saveProcess.isPending}
            className="mt-2 rounded-lg bg-[#22177A] px-3 py-1.5 font-semibold text-[#E6E9AF] disabled:opacity-60">
            {t('Enregistrer le process')}
          </button>
        )}
        {saveProcess.error && <div className="mt-1 text-red-600">{(saveProcess.error as Error).message}</div>}
      </section>

      <section>
        <div className="mb-2 font-semibold text-neutral-800">{t('Où en sont les candidats')}</div>
        {candidates.length === 0 && <div className="text-neutral-500">{t('Aucun candidat en entretien client ou en process.')}</div>}
        <div className="space-y-3">
          {candidates.map((c) => (
            <div key={c.id} className="rounded-lg border border-neutral-200 p-2.5">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="font-semibold text-neutral-800">{`${c.candidat.prenom ?? ''} ${c.candidat.nom}`.trim()}</span>
                <span className="text-[12px] text-neutral-500">{t(STAGE_FR[c.stage] ?? c.stage)}</span>
              </div>
              <select
                value={c.processEtape ?? ''}
                disabled={saved.length === 0}
                onChange={(e) => saveStep.mutate({ id: c.id, body: { step: e.target.value ? Number(e.target.value) : null } })}
                className={input}
              >
                <option value="">{saved.length ? t('Étape non renseignée') : t("Saisis d'abord le process")}</option>
                {saved.map((s, i) => <option key={s.id} value={i + 1}>{`${i + 1}/${saved.length} · ${s.label}`}</option>)}
              </select>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <label className="text-[12px] text-neutral-500">
                  {t('Prochain entretien')}
                  <input type="datetime-local"
                    defaultValue={c.dateProchainEntretien ? new Date(c.dateProchainEntretien).toISOString().slice(0, 16) : ''}
                    onBlur={(e) => saveStep.mutate({ id: c.id, body: { nextInterviewAt: e.target.value ? new Date(e.target.value).toISOString() : null } })}
                    className={input} />
                </label>
                <label className="text-[12px] text-neutral-500">
                  {t('Retour en attente depuis')}
                  <input type="date"
                    defaultValue={c.retourAttenteDepuis ? c.retourAttenteDepuis.slice(0, 10) : ''}
                    onBlur={(e) => saveStep.mutate({ id: c.id, body: { waitingSince: e.target.value || null } })}
                    className={input} />
                </label>
              </div>
            </div>
          ))}
        </div>
        {saveStep.error && <div className="mt-1 text-red-600">{(saveStep.error as Error).message}</div>}
      </section>

      <section>
        <div className="mb-2 font-semibold text-neutral-800">{t('Forecast')}</div>
        <div className="grid grid-cols-2 gap-2.5">
          <label><span className={label}>{t('Nombre de postes')}</span>
            <input type="number" min={1} defaultValue={mandat.nbPostes} onBlur={(e) => Number(e.target.value) !== mandat.nbPostes && saveMandat.mutate({ nbPostes: Number(e.target.value) })} className={input} />
          </label>
          <label><span className={label}>{t('Devise')}</span>
            <select value={mandat.devise} onChange={(e) => saveMandat.mutate({ devise: e.target.value })} className={input}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="col-span-2"><span className={label}>{t('Type de fee')}</span>
            <select value={mandat.feeType} onChange={(e) => saveMandat.mutate({ feeType: e.target.value })} className={input}>
              <option value="POURCENTAGE_PACKAGE">{t('% du package')}</option>
              <option value="POURCENTAGE_FIXE">{t('% du fixe')}</option>
              <option value="MONTANT_FIXE">{t('Montant fixe')}</option>
            </select>
          </label>
          {mandat.feeType === 'MONTANT_FIXE' ? (
            <label className="col-span-2"><span className={label}>{t('Montant ({devise})', { devise: mandat.devise })}</span>
              <input type="number" min={0} defaultValue={mandat.feeMontantFixe ?? ''} onBlur={(e) => saveMandat.mutate({ feeMontantFixe: e.target.value ? Number(e.target.value) : null })} className={input} />
            </label>
          ) : (
            <div className="col-span-2 text-[12px] text-neutral-500">
              {t('{pct} % appliqué au package du candidat, sinon à son salaire, sinon au milieu de la fourchette.', { pct: Number(mandat.feePourcentage).toLocaleString(LOCALE) })}
            </div>
          )}
          <label><span className={label}>{t('Source du deal')}</span>
            <select value={mandat.sourceDeal ?? ''} onChange={(e) => saveMandat.mutate({ sourceDeal: e.target.value || null })} className={input}>
              <option value="">{t('Direct')}</option>
              <option value="PARAFORM">{t('Paraform')}</option>
            </select>
          </label>
          {mandat.sourceDeal === 'PARAFORM' && (
            <label><span className={label}>{t('Versements Paraform')}</span>
              <input type="number" min={1} max={24} defaultValue={mandat.paraformNbVersements} onBlur={(e) => saveMandat.mutate({ paraformNbVersements: Number(e.target.value) })} className={input} />
            </label>
          )}
          <label className="col-span-2"><span className={label}>{t('Split sales / recruteur')}</span>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={100} defaultValue={mandat.splitSalesPct} onBlur={(e) => saveMandat.mutate({ splitSalesPct: Number(e.target.value) })} className={`${input} w-20`} />
              <span className="text-neutral-500">{t('% sales, le reste au recruteur')}</span>
            </div>
          </label>
        </div>
        {saveMandat.error && <div className="mt-1 text-red-600">{(saveMandat.error as Error).message}</div>}
      </section>
    </div>
  );
}
