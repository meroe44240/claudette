import { useState, useMemo, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Search, Building2, MapPin, ExternalLink, Copy, Loader2,
  Sparkles, CheckSquare, Globe, TrendingUp, DoorOpen,
  Briefcase, RefreshCw, ChevronDown, ChevronUp, X,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { toast } from '../../components/ui/Toast';

// ─── TYPES ──────────────────────────────────────────

interface SuggestedContact {
  title: string;
  linkedin_search_hint: string;
}

interface DetectedProspect {
  company_name: string;
  company_website: string | null;
  company_sector: string;
  company_size: string;
  company_city: string;
  company_country: string;
  signal_type: 'job_posting' | 'fundraising' | 'growth' | 'departure' | 'expansion' | 'restructuring';
  signal_detail: string;
  signal_source: string;
  signal_date: string;
  relevance_score: number;
  approach_angle: string;
  suggested_contacts: SuggestedContact[];
}

interface ProspectDetectionResult {
  prospects: DetectedProspect[];
  search_summary: string;
}

interface DetectionResponse {
  data: ProspectDetectionResult;
  cached: boolean;
  searchId: string;
}

interface CachedResponse {
  data: {
    searchId: string;
    data: ProspectDetectionResult;
    searchParams: Record<string, unknown>;
    resultCount: number;
    createdAt: string;
    expiresAt: string;
  };
}

export interface SelectedProspect {
  companyName: string;
  sector?: string;
  location?: string;
  website?: string;
  isNew: boolean;
}

interface ProspectDetectionTabProps {
  candidatId: string;
  onProspectsSelected: (prospects: SelectedProspect[]) => void;
}

// ─── CONSTANTS ──────────────────────────────────────

const SIGNAL_ICONS: Record<string, typeof Briefcase> = {
  job_posting: Briefcase,
  fundraising: TrendingUp,
  growth: TrendingUp,
  departure: DoorOpen,
  expansion: Globe,
  restructuring: RefreshCw,
};

const SIGNAL_LABELS: Record<string, string> = {
  job_posting: 'Offre d\'emploi',
  fundraising: 'Levee de fonds',
  growth: 'Croissance',
  departure: 'Depart',
  expansion: 'Expansion',
  restructuring: 'Restructuration',
};

const SIGNAL_EMOJI: Record<string, string> = {
  job_posting: '\uD83D\uDCBC',
  fundraising: '\uD83D\uDCB0',
  growth: '\uD83D\uDCC8',
  departure: '\uD83D\uDEAA',
  expansion: '\uD83D\uDCC8',
  restructuring: '\uD83D\uDD04',
};

const AVAILABLE_SECTORS = [
  'SaaS', 'Tech', 'FinTech', 'HealthTech', 'E-commerce', 'Industrie',
  'Consulting', 'Immobilier', 'Assurance', 'EdTech', 'GreenTech',
  'Cybersecurite', 'Logistique', 'Telecom', 'Media',
];

const AVAILABLE_LOCATIONS = [
  'France', 'Paris', 'Lyon', 'Marseille', 'Toulouse', 'Bordeaux',
  'Nantes', 'Lille', 'UK', 'London', 'Belgique', 'Suisse',
  'Allemagne', 'Espagne',
];

const COMPANY_SIZES = [
  { value: '1-50', label: '1-50 (Startup)' },
  { value: '50-200', label: '50-200 (PME)' },
  { value: '200-1000', label: '200-1000 (ETI)' },
  { value: '1000+', label: '1000+ (Grand groupe)' },
];

const SIGNAL_TYPES = [
  { value: 'job_posting', label: 'Offres d\'emploi' },
  { value: 'fundraising', label: 'Levees de fonds' },
  { value: 'growth', label: 'Croissance / Expansion' },
  { value: 'departure', label: 'Departs' },
  { value: 'restructuring', label: 'Restructurations' },
];

// ─── COMPONENT ──────────────────────────────────────

export default function ProspectDetectionTab({
  candidatId,
  onProspectsSelected,
}: ProspectDetectionTabProps) {
  // Search parameters state
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [companySize, setCompanySize] = useState('');
  const [selectedSignals, setSelectedSignals] = useState<string[]>([
    'job_posting', 'fundraising', 'departure',
  ]);

  // Results state
  const [results, setResults] = useState<ProspectDetectionResult | null>(null);
  const [wasCached, setWasCached] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [showParams, setShowParams] = useState(true);

  // Check for cached results on mount
  const { data: cachedData, isLoading: loadingCache } = useQuery({
    queryKey: ['prospect-detection-cache', candidatId],
    queryFn: () => api.get<CachedResponse>(`/ai/prospect-detection/${candidatId}`),
    enabled: !!candidatId,
    retry: false,
  });

  // Handle cached data when it arrives
  useEffect(() => {
    if (!cachedData) return;
    const cached = cachedData as any;
    if (cached?.data?.data) {
      setResults(cached.data.data);
      setWasCached(true);
      setShowParams(false);
      // Pre-select all high-score prospects
      const highScoreIndices = new Set<number>();
      (cached.data.data.prospects || []).forEach((p: DetectedProspect, i: number) => {
        if (p.relevance_score >= 7) highScoreIndices.add(i);
      });
      setSelectedIndices(highScoreIndices);
    }
  }, [cachedData]);

  // Detection mutation
  const detectMutation = useMutation({
    mutationFn: () =>
      api.post<DetectionResponse>('/ai/prospect-detection', {
        candidatId,
        searchParams: {
          sectors: selectedSectors.length > 0 ? selectedSectors : undefined,
          locations: selectedLocations.length > 0 ? selectedLocations : undefined,
          companySize: companySize || undefined,
          signalTypes: selectedSignals.length > 0 ? selectedSignals : undefined,
        },
      }),
    onSuccess: (response: any) => {
      const data = response.data || response;
      setResults(data);
      setWasCached(!!response.cached);
      setShowParams(false);
      // Pre-select prospects with score >= 7
      const highScoreIndices = new Set<number>();
      (data.prospects || []).forEach((p: DetectedProspect, i: number) => {
        if (p.relevance_score >= 7) highScoreIndices.add(i);
      });
      setSelectedIndices(highScoreIndices);
      toast(
        'success',
        response.cached
          ? `${data.prospects?.length || 0} prospect(s) trouves (cache)`
          : `${data.prospects?.length || 0} prospect(s) detectes par l'IA`,
      );
    },
    onError: (error: any) => {
      const msg = error?.data?.message || error?.message || 'Erreur lors de la detection IA';
      toast('error', msg);
    },
  });

  // Create companies mutation
  const createCompaniesMutation = useMutation({
    mutationFn: (prospects: Array<{ companyName: string; sector?: string; location?: string; website?: string }>) =>
      api.post<{ data: any[]; count: number; newCount: number }>('/ai/prospect-detection/create-companies', {
        prospects,
      }),
    onSuccess: (response: any) => {
      const newCount = response.newCount ?? response.data?.length ?? 0;
      toast('success', `${newCount} entreprise(s) creee(s) dans l'ATS`);
    },
    onError: (error: any) => {
      const msg = error?.data?.message || error?.message || 'Erreur lors de la creation des entreprises';
      toast('error', msg);
    },
  });

  // Computed
  const prospects = results?.prospects || [];

  const selectedProspects = useMemo(() => {
    return Array.from(selectedIndices).map((i) => prospects[i]).filter(Boolean);
  }, [selectedIndices, prospects]);

  // ─── HANDLERS ──────────────────────────────────────

  const toggleSector = (s: string) => {
    setSelectedSectors((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const toggleLocation = (l: string) => {
    setSelectedLocations((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
    );
  };

  const toggleSignal = (s: string) => {
    setSelectedSignals((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const toggleProspect = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleAllProspects = () => {
    if (selectedIndices.size === prospects.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(prospects.map((_, i) => i)));
    }
  };

  const handleCreateCompanies = () => {
    const toCreate = selectedProspects.map((p) => ({
      companyName: p.company_name,
      sector: p.company_sector,
      location: `${p.company_city}, ${p.company_country}`,
      website: p.company_website || undefined,
    }));
    createCompaniesMutation.mutate(toCreate);
  };

  const handleCopyLinkedInQueries = () => {
    const queries = selectedProspects
      .flatMap((p) =>
        p.suggested_contacts.map(
          (c) => `${c.linkedin_search_hint} - ${p.company_name}`,
        ),
      )
      .join('\n');

    navigator.clipboard.writeText(queries).then(() => {
      toast('success', 'Requetes LinkedIn copiees dans le presse-papier');
    }).catch(() => {
      toast('error', 'Impossible de copier dans le presse-papier');
    });
  };

  const handlePassToParent = () => {
    const mapped: SelectedProspect[] = selectedProspects.map((p) => ({
      companyName: p.company_name,
      sector: p.company_sector,
      location: `${p.company_city}, ${p.company_country}`,
      website: p.company_website || undefined,
      isNew: true,
    }));
    onProspectsSelected(mapped);
    toast('success', `${mapped.length} prospect(s) IA ajoutes`);
  };

  const getScoreColor = (score: number) => {
    if (score >= 9) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (score >= 7) return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-neutral-100 text-neutral-600 border-neutral-200';
  };

  const getSignalIcon = (signalType: string) => {
    const Icon = SIGNAL_ICONS[signalType] || Briefcase;
    return <Icon size={14} />;
  };

  // ─── RENDER ────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Search Parameters */}
      <div className="rounded-xl border border-neutral-200 bg-white">
        <button
          onClick={() => setShowParams(!showParams)}
          className="flex w-full items-center justify-between px-5 py-3"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
            <Search size={16} className="text-purple-500" />
            Parametres de recherche
          </h3>
          {showParams ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
        </button>

        {showParams && (
          <div className="border-t border-neutral-100 px-5 py-4 space-y-4">
            {/* Sectors */}
            <div>
              <label className="text-xs font-medium text-neutral-500 mb-1.5 block">Secteurs</label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_SECTORS.map((s) => (
                  <button
                    key={s}
                    onClick={() => toggleSector(s)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      selectedSectors.includes(s)
                        ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-300'
                        : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Locations */}
            <div>
              <label className="text-xs font-medium text-neutral-500 mb-1.5 block">Geographie</label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_LOCATIONS.map((l) => (
                  <button
                    key={l}
                    onClick={() => toggleLocation(l)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      selectedLocations.includes(l)
                        ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                        : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Company Size + Signal Types row */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-neutral-500 mb-1.5 block">Taille d'entreprise</label>
                <select
                  value={companySize}
                  onChange={(e) => setCompanySize(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                >
                  <option value="">Toutes tailles</option>
                  {COMPANY_SIZES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-500 mb-1.5 block">Types de signaux</label>
                <div className="flex flex-wrap gap-1.5">
                  {SIGNAL_TYPES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => toggleSignal(s.value)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                        selectedSignals.includes(s.value)
                          ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
                          : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      {SIGNAL_EMOJI[s.value]} {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Launch button */}
            <button
              onClick={() => detectMutation.mutate()}
              disabled={detectMutation.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {detectMutation.isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Recherche en cours...
                </>
              ) : (
                <>
                  <Search size={16} />
                  Lancer la recherche IA
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Loading state */}
      {(detectMutation.isPending || loadingCache) && !results && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-8">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Loader2 size={32} className="animate-spin text-purple-500" />
              <Sparkles size={14} className="absolute -right-1 -top-1 text-purple-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-purple-700">Analyse en cours...</p>
              <p className="text-xs text-purple-500 mt-1">
                L'IA recherche des signaux faibles sur le web (offres, levees de fonds, expansions...)
              </p>
            </div>
            {/* Progress bar animation */}
            <div className="w-full max-w-xs h-1.5 bg-purple-200 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {results && prospects.length > 0 && (
        <>
          {/* Summary */}
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-purple-700">
                <Sparkles size={14} />
                Resultat : {prospects.length} entreprise{prospects.length > 1 ? 's' : ''} detectee{prospects.length > 1 ? 's' : ''}
                {wasCached && (
                  <span className="rounded-full bg-purple-200 px-2 py-0.5 text-[10px] font-medium text-purple-600">
                    cache
                  </span>
                )}
              </p>
              <button
                onClick={() => {
                  setResults(null);
                  setSelectedIndices(new Set());
                  setShowParams(true);
                  setWasCached(false);
                }}
                className="text-xs text-purple-500 hover:text-purple-700 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            {results.search_summary && (
              <p className="text-xs text-purple-600 italic">
                "{results.search_summary}"
              </p>
            )}
          </div>

          {/* Select all header */}
          <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIndices.size === prospects.length && prospects.length > 0}
                onChange={toggleAllProspects}
                className="accent-purple-500"
              />
              <span className="text-xs font-medium text-neutral-500">
                Tout selectionner ({prospects.length})
              </span>
            </label>
            <span className="text-xs text-purple-600 font-medium">
              {selectedIndices.size} selectionne{selectedIndices.size > 1 ? 's' : ''}
            </span>
          </div>

          {/* Prospect cards */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {prospects.map((prospect, index) => {
              const isSelected = selectedIndices.has(index);
              const isExpanded = expandedIndex === index;
              const SignalIcon = SIGNAL_ICONS[prospect.signal_type] || Briefcase;

              return (
                <div
                  key={`${prospect.company_name}-${index}`}
                  className={`rounded-lg border transition-all ${
                    isSelected
                      ? 'border-purple-300 bg-purple-50/50'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
                  }`}
                >
                  {/* Main row */}
                  <div className="flex items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleProspect(index)}
                      className="mt-1 accent-purple-500"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-neutral-800">
                          {prospect.company_name}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {prospect.company_sector}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-neutral-400">
                          <MapPin size={11} />
                          {prospect.company_city}
                        </span>
                      </div>

                      {/* Signal */}
                      <div className="mt-1.5 flex items-start gap-2">
                        <span className="shrink-0 mt-0.5 text-purple-500">
                          <SignalIcon size={14} />
                        </span>
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-neutral-600">
                            Signal : {prospect.signal_detail}
                          </span>
                          {prospect.signal_source && (
                            <span className="ml-2 text-[10px] text-neutral-400">
                              ({prospect.signal_date || 'recent'})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Approach angle */}
                      <div className="mt-1 flex items-start gap-2">
                        <span className="shrink-0 mt-0.5 text-amber-500">
                          <Sparkles size={12} />
                        </span>
                        <span className="text-xs text-neutral-500 italic">
                          "{prospect.approach_angle}"
                        </span>
                      </div>
                    </div>

                    {/* Score badge + expand */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${getScoreColor(prospect.relevance_score)}`}>
                        {prospect.relevance_score}/10
                      </span>
                      <button
                        onClick={() => setExpandedIndex(isExpanded ? null : index)}
                        className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-neutral-100 px-4 py-3 bg-neutral-50/50 space-y-2">
                      {/* Company details */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                        <span className="flex items-center gap-1">
                          <Building2 size={12} />
                          {prospect.company_size}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin size={12} />
                          {prospect.company_city}, {prospect.company_country}
                        </span>
                        {prospect.company_website && (
                          <a
                            href={prospect.company_website.startsWith('http') ? prospect.company_website : `https://${prospect.company_website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-500 hover:text-blue-700 transition-colors"
                          >
                            <ExternalLink size={12} />
                            {prospect.company_website}
                          </a>
                        )}
                      </div>

                      {/* Signal source */}
                      <div className="text-xs text-neutral-500">
                        <span className="font-medium">Source :</span>{' '}
                        {prospect.signal_source.startsWith('http') ? (
                          <a
                            href={prospect.signal_source}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-700 transition-colors"
                          >
                            {prospect.signal_source}
                          </a>
                        ) : (
                          prospect.signal_source
                        )}
                      </div>

                      {/* Signal type badge */}
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-600">
                          {SIGNAL_EMOJI[prospect.signal_type]} {SIGNAL_LABELS[prospect.signal_type] || prospect.signal_type}
                        </span>
                        {prospect.signal_date && (
                          <span className="text-[10px] text-neutral-400">
                            {prospect.signal_date}
                          </span>
                        )}
                      </div>

                      {/* Suggested contacts */}
                      {prospect.suggested_contacts && prospect.suggested_contacts.length > 0 && (
                        <div>
                          <p className="text-[11px] font-medium text-neutral-500 mb-1">
                            Contacts suggeres :
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {prospect.suggested_contacts.map((contact, ci) => (
                              <span
                                key={ci}
                                className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] text-blue-600 border border-blue-100"
                              >
                                {contact.title}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions bar */}
          {selectedIndices.size > 0 && (
            <div className="rounded-xl border border-purple-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleCreateCompanies}
                  disabled={createCompaniesMutation.isPending}
                  className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createCompaniesMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Building2 size={14} />
                  )}
                  Creer {selectedIndices.size} entreprise{selectedIndices.size > 1 ? 's' : ''} dans l'ATS
                </button>

                <button
                  onClick={handleCopyLinkedInQueries}
                  className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-all hover:bg-blue-100"
                >
                  <Copy size={14} />
                  Copier requetes LinkedIn
                </button>

                <button
                  onClick={handlePassToParent}
                  className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-all hover:bg-emerald-100"
                >
                  <CheckSquare size={14} />
                  Utiliser ces prospects
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty results */}
      {results && prospects.length === 0 && !detectMutation.isPending && (
        <div className="rounded-xl border border-neutral-200 bg-white p-8">
          <div className="flex flex-col items-center gap-3 text-neutral-400">
            <Search size={32} strokeWidth={1.5} />
            <p className="text-sm font-medium">Aucun prospect detecte</p>
            <p className="text-xs text-center max-w-sm">
              Essayez de modifier les parametres de recherche (secteurs, geographie, signaux)
              pour obtenir plus de resultats.
            </p>
            <button
              onClick={() => {
                setResults(null);
                setShowParams(true);
              }}
              className="mt-2 rounded-lg border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
            >
              Modifier les parametres
            </button>
          </div>
        </div>
      )}

      {/* Initial state (no search yet) */}
      {!results && !detectMutation.isPending && !loadingCache && (
        <div className="rounded-xl border border-dashed border-purple-300 bg-purple-50/50 p-8">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
              <Sparkles size={24} className="text-purple-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-purple-700">Detection IA de prospects</p>
              <p className="text-xs text-purple-500 mt-1 max-w-sm">
                L'IA va rechercher sur le web des entreprises qui pourraient avoir besoin
                de ce profil candidat, en se basant sur des signaux faibles (offres d'emploi,
                levees de fonds, expansions...).
              </p>
            </div>
            <button
              onClick={() => setShowParams(true)}
              className="mt-2 flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white transition-all hover:bg-purple-700"
            >
              <Search size={16} />
              Configurer et lancer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
