import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, Building2, Briefcase, ExternalLink, Printer,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import { t } from '../../lib/i18n';

// ─── Types ──────────────────────────────────────────

type ReportType = 'client' | 'mandat';

interface ClientOption {
  id: string;
  nom: string;
  prenom: string | null;
  entreprise: { nom: string };
}

interface MandatOption {
  id: string;
  titrePoste: string;
  entreprise: { nom: string };
  statut: string;
}

interface PaginatedClients {
  data: ClientOption[];
  total: number;
}

interface PaginatedMandats {
  data: MandatOption[];
  total: number;
}

// ─── Component ──────────────────────────────────────

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('client');
  const [selectedId, setSelectedId] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch clients for dropdown
  const { data: clientsData } = useQuery({
    queryKey: ['reports-clients'],
    queryFn: () => api.get<PaginatedClients>('/clients?perPage=200'),
    enabled: reportType === 'client',
  });

  // Fetch mandats for dropdown
  const { data: mandatsData } = useQuery({
    queryKey: ['reports-mandats'],
    queryFn: () => api.get<PaginatedMandats>('/mandats?perPage=200'),
    enabled: reportType === 'mandat',
  });

  const clients = clientsData?.data ?? [];
  const mandats = mandatsData?.data ?? [];

  function handleGenerate() {
    if (!selectedId) return;

    setIsGenerating(true);

    const token = localStorage.getItem('accessToken');
    const baseUrl = '/api/v1/reports';
    const url =
      reportType === 'client'
        ? `${baseUrl}/client/${selectedId}?format=html`
        : `${baseUrl}/mandat/${selectedId}?format=html`;

    // Open in new tab with auth
    const newTab = window.open('', '_blank');
    if (newTab) {
      fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      })
        .then((res) => res.text())
        .then((html) => {
          newTab.document.write(html);
          newTab.document.close();
          setIsGenerating(false);
        })
        .catch((err) => {
          newTab.document.write(
            `<html><body><h1>${t('Erreur')}</h1><p>${t('Impossible de générer le rapport.')}</p></body></html>`,
          );
          newTab.document.close();
          setIsGenerating(false);
        });
    } else {
      setIsGenerating(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t('Rapports')}
        breadcrumbs={[{ label: t('Rapports') }]}
      />

      <div className="max-w-2xl">
        {/* Report type selection */}
        <div className="mb-6">
          <label className="block text-[13px] font-semibold text-neutral-700 mb-2">
            {t('Type de rapport')}
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setReportType('client');
                setSelectedId('');
              }}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl border-2 text-[14px] font-medium transition-all ${
                reportType === 'client'
                  ? 'border-brand-500 bg-brand-500/5 text-brand-500'
                  : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
              }`}
            >
              <Building2 size={18} />
              {t('Rapport Client')}
            </button>
            <button
              onClick={() => {
                setReportType('mandat');
                setSelectedId('');
              }}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl border-2 text-[14px] font-medium transition-all ${
                reportType === 'mandat'
                  ? 'border-brand-500 bg-brand-500/5 text-brand-500'
                  : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
              }`}
            >
              <Briefcase size={18} />
              {t('Rapport Mandat')}
            </button>
          </div>
        </div>

        {/* Entity selection */}
        <div className="mb-6">
          <label className="block text-[13px] font-semibold text-neutral-700 mb-2">
            {reportType === 'client' ? t('Sélectionner un client') : t('Sélectionner un mandat')}
          </label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-[14px] text-neutral-900 outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 appearance-none cursor-pointer"
          >
            <option value="">
              {reportType === 'client'
                ? t('-- Choisir un client --')
                : t('-- Choisir un mandat --')}
            </option>

            {reportType === 'client' &&
              clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.prenom ?? ''} {c.nom} - {c.entreprise?.nom ?? t('Sans entreprise')}
                </option>
              ))}

            {reportType === 'mandat' &&
              mandats.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.titrePoste} - {m.entreprise?.nom ?? t('Sans entreprise')} ({m.statut})
                </option>
              ))}
          </select>
        </div>

        {/* Generate button */}
        <div className="mb-8">
          <button
            onClick={handleGenerate}
            disabled={!selectedId || isGenerating}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-[14px] font-semibold text-white hover:bg-primary-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileText size={18} />
            {isGenerating ? t('Génération en cours...') : t('Générer le rapport')}
            <ExternalLink size={14} className="ml-1" />
          </button>
        </div>

        {/* Info box */}
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
          <div className="flex items-start gap-3">
            <Printer size={18} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-[14px] font-semibold text-amber-800 mb-1">
                {t('Imprimer ou sauvegarder en PDF')}
              </p>
              <p className="text-[13px] text-amber-700">
                {t("Le rapport s'ouvre dans un nouvel onglet au format A4 optimisé pour l'impression. Utilisez Ctrl+P (ou Cmd+P sur Mac) pour imprimer ou sauvegarder en PDF via l'option « Enregistrer en PDF » de votre navigateur.")}
              </p>
            </div>
          </div>
        </div>

        {/* Description of report contents */}
        <div className="mt-8 space-y-4">
          <h3 className="text-[16px] font-semibold text-neutral-900">
            {t('Contenu des rapports')}
          </h3>

          <div className="rounded-xl bg-white border border-neutral-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={16} className="text-blue-500" />
              <h4 className="text-[14px] font-semibold text-neutral-900">
                {t('Rapport Client')}
              </h4>
            </div>
            <ul className="text-[13px] text-neutral-600 space-y-1 ml-6 list-disc">
              <li>{t("Informations du client et de l'entreprise")}</li>
              <li>{t('Statistiques globales (mandats, candidatures, placements, fees)')}</li>
              <li>{t('Liste des mandats avec statut et candidatures')}</li>
              <li>{t('Pipeline des mandats actifs')}</li>
              <li>{t('Timeline des 10 dernières activités')}</li>
            </ul>
          </div>

          <div className="rounded-xl bg-white border border-neutral-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Briefcase size={16} className="text-purple-500" />
              <h4 className="text-[14px] font-semibold text-neutral-900">
                {t('Rapport Mandat')}
              </h4>
            </div>
            <ul className="text-[13px] text-neutral-600 space-y-1 ml-6 list-disc">
              <li>{t('Informations du mandat (poste, salaire, fee, dates)')}</li>
              <li>{t('KPIs (jours ouvert, candidats sourcés, taux entretien/offre)')}</li>
              <li>{t('Pipeline visuel des candidats par étape')}</li>
              <li>{t('Liste détaillée des candidats avec étape et notes')}</li>
              <li>{t('Timeline des activités récentes')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
