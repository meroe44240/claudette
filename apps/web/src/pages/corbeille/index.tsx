import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import { useAuthStore } from '../../stores/auth-store';
import { t, LOCALE } from '../../lib/i18n';

interface TrashRow {
  batch_id: string;
  deleted_at: string;
  expires_at: string;
  deleted_by: { id: string; name: string | null; is_agent: boolean } | null;
  source: string;
  tool: string | null;
  items: Array<{ entry_id: string; entity: string; id: string; label: string | null }>;
  also_removed: Record<string, number>;
}

const MODEL_LABEL: Record<string, string> = {
  Candidat: t('Candidat'), Client: t('Client'), Entreprise: t('Société'), Mandat: t('Mandat'), Candidature: t('Candidature'),
  Activite: t('Activité'), Lead: t('Lead'), LeadInteraction: t('Interaction lead'), JobOffer: t('Offre'), ProfilRecherche: t('Profil recherché'),
  NoteCall: t("Note d'appel"), PostLinkedin: t('Post LinkedIn'), Booking: t('Rendez-vous'), CandidatExperience: t('Expérience'),
  FichierActivite: t('Fichier'), StageHistory: t("Changement d'étape"), PortalAccess: t('Accès portail'), MarketList: t('Liste marché'),
};

export default function CorbeillePage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [q, setQ] = useState('');
  const [model, setModel] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const qs = new URLSearchParams({ limit: '50' });
  if (q) qs.set('q', q);
  if (model) qs.set('model', model);
  const { data, isLoading } = useQuery({ queryKey: ['corbeille', qs.toString()], queryFn: () => api.get<{ data: TrashRow[]; meta: { total: number } }>(`/corbeille?${qs}`) });

  const restore = useMutation({
    mutationFn: (r: TrashRow) => api.post<{ restored: unknown[] }>(`/corbeille/${r.batch_id}/restore`).then((res) => ({ res, r })),
    onSuccess: ({ res, r }) => {
      setMessage({ ok: true, text: t('Restauré : {label} ({n} éléments).', { label: r.items.map((i) => i.label).filter(Boolean).join(', ') || '—', n: res.restored.length }) });
      qc.invalidateQueries();
    },
    onError: (e) => setMessage({ ok: false, text: (e as Error).message }),
  });
  const empty = useMutation({
    mutationFn: () => api.delete<{ deleted: number }>('/corbeille'),
    onSuccess: (r) => { setMessage({ ok: true, text: t('Corbeille vidée ({n} éléments supprimés définitivement).', { n: r.deleted }) }); setConfirmEmpty(false); qc.invalidateQueries({ queryKey: ['corbeille'] }); },
    onError: (e) => setMessage({ ok: false, text: (e as Error).message }),
  });

  const daysLeft = (d: string) => Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000));

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-2"><Trash2 size={26} className="text-primary-500" />{t('Corbeille')}</span>}
        subtitle={t('Tout ce qui a été supprimé reste ici 30 jours. Une restauration remet la fiche et tout ce qui a été supprimé avec elle.')}
        actions={user?.role === 'ADMIN' ? (confirmEmpty ? (
          <span className="flex items-center gap-2">
            <span className="text-sm text-red-700">{t('Supprimer définitivement tout le contenu ?')}</span>
            <button onClick={() => empty.mutate()} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white">{t('Oui, vider')}</button>
            <button onClick={() => setConfirmEmpty(false)} className="px-2 text-sm text-neutral-500">{t('Annuler')}</button>
          </span>
        ) : (
          <button onClick={() => setConfirmEmpty(true)} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600">{t('Vider la corbeille')}</button>
        )) : undefined}
      />

      {message && <div className={`mb-4 rounded-lg px-4 py-2 text-sm ${message.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>{message.text}</div>}

      <div className="mb-4 flex flex-wrap gap-2">
        <input id="trash-q" className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm" placeholder={t('Chercher un élément supprimé…')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select id="trash-model" className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm" value={model} onChange={(e) => setModel(e.target.value)} aria-label={t('Type')}>
          <option value="">{t('Tous les types')}</option>
          {['Candidat', 'Client', 'Entreprise', 'Mandat', 'Candidature', 'Lead', 'Activite', 'JobOffer', 'ProfilRecherche'].map((m) => <option key={m} value={m}>{MODEL_LABEL[m]}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3">{t('Élément')}</th>
              <th className="px-4 py-3">{t('Supprimé avec')}</th>
              <th className="px-4 py-3">{t('Par')}</th>
              <th className="px-4 py-3">{t('Le')}</th>
              <th className="px-4 py-3">{t('Reste')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-neutral-400">{t('Chargement…')}</td></tr>}
            {!isLoading && !data?.data.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-neutral-500">{t('La corbeille est vide.')}</td></tr>}
            {data?.data.map((r) => (
              <tr key={r.batch_id} className="border-b border-neutral-50 last:border-0">
                <td className="px-4 py-3">
                  {r.items.map((i) => (
                    <div key={i.entry_id}><span className="text-neutral-500">{MODEL_LABEL[i.entity] ?? i.entity}</span> <span className="font-semibold">{i.label ?? '—'}</span></div>
                  ))}
                </td>
                <td className="px-4 py-3 text-xs text-neutral-500">
                  {Object.entries(r.also_removed).map(([m, n]) => `${n} ${(MODEL_LABEL[m] ?? m).toLowerCase()}`).join(', ') || '—'}
                </td>
                <td className="px-4 py-3">
                  {r.deleted_by?.name ?? t('Système')}
                  
                  {r.tool && <div className="text-xs text-neutral-400">{r.tool}</div>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-neutral-600">{new Date(r.deleted_at).toLocaleString(LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="px-4 py-3 tabular-nums text-neutral-600">{t('{n} j', { n: daysLeft(r.expires_at) })}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => restore.mutate(r)} disabled={restore.isPending} className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                    <RotateCcw size={13} />{t('Restaurer')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
