/**
 * Sourcing Kalent — recherche de talents (base +200M profils) façon LinkedIn Recruiter.
 * On choisit un projet (mandat) puis on source : chaque profil ajouté crée le candidat
 * dans l'ATS et le rattache au mandat (stage Sourcing). Enrichissement email/tél via Kalent.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  Search, Sparkles, SlidersHorizontal, Linkedin, MapPin, Building2, Plus, Check,
  Loader2, Mail, Phone, ExternalLink, Users, AlertCircle, Briefcase,
  GraduationCap, Languages, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { usePageTitle } from '../../hooks/usePageTitle';
import { toast } from '../../components/ui/Toast';
import { t, LOCALE } from '../../lib/i18n';

// ── Types ──────────────────────────────────────────
interface Mandat { id: string; titrePoste: string; entreprise?: { nom: string } | null }
interface Org { name?: string; logoUrl?: string }
interface Experience { organizationName?: string; title?: string; startDate?: string; endDate?: string | null; isCurrent?: boolean; organization?: Org }
interface Education { schoolName?: string; degrees?: string[]; majors?: string[]; startDate?: string; endDate?: string }
interface Lang { name?: string; proficiency?: string }
interface Talent {
  id: string; firstname?: string; lastname?: string;
  city?: string; country?: string; state?: string;
  jobTitle?: string; headline?: string; summary?: string; photoUrl?: string; linkedinUrl?: string;
  currentOrganization?: Org; skills?: string[];
  experiences?: Experience[]; educations?: Education[]; languages?: Lang[];
}
interface SearchResult {
  configured?: boolean; error?: string;
  data?: { talents: Talent[]; estimationCount: number; searchTransactionId: string };
}
type LastSearch = { mode: 'prompt' | 'filters'; prompt?: string; filters?: KFilter[] };
interface KFilter { filterType: string; value: string; isRequired?: boolean; isExcluded?: boolean; radius?: number }

interface AddState { status: 'idle' | 'loading' | 'created' | 'exists' | 'inmandat' }
interface EnrichState { loading: boolean; done: boolean; emails: string[]; phones: string[] }

const BRAND = '#22177A';
const LIME = '#E6E9AF';

// ── Valeurs acceptées Kalent (listes fermées) ─────
const YEARS_BANDS = ['0-1', '1-3', '3-5', '5-10', '10-15', '15-20', '20-30', '30-100'];
const SIZE_BANDS = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001-10000', '10001+'];
const DEGREE_OPTS = [{ v: 'bachelors', l: t('Licence') }, { v: 'masters', l: t('Master') }, { v: 'doctorates', l: t('Doctorat') }];

// ── Helpers ────────────────────────────────────────
const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const talentName = (tal: Talent) => `${tal.firstname || ''} ${tal.lastname || ''}`.trim() || t('Profil');
const talentLoc = (tal: Talent) => [tal.city, tal.state, tal.country].filter(Boolean).join(', ');
const initials = (tal: Talent) => `${(tal.firstname || '')[0] || ''}${(tal.lastname || '')[0] || ''}`.toUpperCase() || '?';
const yr = (d?: string | null) => (d ? new Date(d).getFullYear() : null);
const period = (e: Experience) => {
  const s = yr(e.startDate);
  const end = e.isCurrent ? t("aujourd'hui") : (yr(e.endDate) ?? '');
  if (!s && !end) return '';
  return `${s ?? ''}${s || end ? ' – ' : ''}${end}`;
};
const eduLine = (e: Education) => [e.schoolName, [...(e.degrees || []), ...(e.majors || [])].filter(Boolean).join(', ')].filter(Boolean).join(' · ');

// ═══════════════════════════════════════════════════
export default function SourcingKalentPage() {
  usePageTitle(t('Sourcing Kalent'));

  // Projet (mandat) sélectionné — persistant
  const [projectId, setProjectId] = useState<string>(() => localStorage.getItem('kalent-project') || '');
  useEffect(() => { localStorage.setItem('kalent-project', projectId); }, [projectId]);

  // Config Kalent
  const { data: config } = useQuery({
    queryKey: ['kalent-config'],
    queryFn: () => api.get<{ configured: boolean }>('/sourcing/kalent/config'),
  });

  // Mandats ouverts pour le sélecteur de projet
  const { data: mandatsResp } = useQuery({
    queryKey: ['mandats', 'sourcing-picker'],
    queryFn: () => api.get<{ data: Mandat[] }>('/mandats?statut=OUVERT,EN_COURS&perPage=100'),
  });
  const mandats = mandatsResp?.data ?? [];
  const project = mandats.find((m) => m.id === projectId) || null;
  const isVivier = projectId === '__VIVIER__';
  const hasChosen = projectId !== '';          // un projet OU le vivier a été choisi
  const hasMandat = !!projectId && !isVivier;  // un vrai mandat

  // Recherche
  const [prompt, setPrompt] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [f, setF] = useState({
    jobTitle: '', location: '', radius: '30', skills: '', companies: '',
    excludedCompanies: '', seniority: '', industries: '', languages: '', keywords: '',
    schools: '', certifications: '', graduationYear: '',
  });
  const [yearsExp, setYearsExp] = useState<string[]>([]);
  const [companySize, setCompanySize] = useState<string[]>([]);
  const [degrees, setDegrees] = useState<string[]>([]);
  const [durationInJob, setDurationInJob] = useState<string[]>([]);

  const [talents, setTalents] = useState<Talent[]>([]);
  const [estimation, setEstimation] = useState<number | null>(null);
  const [txIds, setTxIds] = useState<string[]>([]);
  const [lastSearch, setLastSearch] = useState<LastSearch | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);

  const [addStates, setAddStates] = useState<Record<string, AddState>>({});
  const [enrichStates, setEnrichStates] = useState<Record<string, EnrichState>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpandedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const buildFilters = (): KFilter[] => {
    const out: KFilter[] = [];
    if (f.jobTitle.trim()) out.push({ filterType: 'JOB_TITLE', value: f.jobTitle.trim(), isRequired: true });
    if (f.location.trim()) out.push({ filterType: 'LOCATION', value: f.location.trim(), isRequired: true, radius: Number(f.radius) || 30 });
    splitList(f.skills).forEach((v) => out.push({ filterType: 'SKILL', value: v, isRequired: true }));
    splitList(f.companies).forEach((v) => out.push({ filterType: 'COMPANY_NAME', value: v }));
    splitList(f.excludedCompanies).forEach((v) => out.push({ filterType: 'COMPANY_NAME', value: v, isExcluded: true }));
    splitList(f.seniority).forEach((v) => out.push({ filterType: 'SENIORITY', value: v }));
    splitList(f.industries).forEach((v) => out.push({ filterType: 'COMPANY_INDUSTRY', value: v }));
    splitList(f.languages).forEach((v) => out.push({ filterType: 'LANGUAGE', value: v }));
    if (f.keywords.trim()) out.push({ filterType: 'KEYWORD', value: f.keywords.trim() });
    yearsExp.forEach((v) => out.push({ filterType: 'YEARS_OF_EXPERIENCE', value: v, isRequired: false }));
    companySize.forEach((v) => out.push({ filterType: 'COMPANY_SIZE', value: v, isRequired: false }));
    degrees.forEach((v) => out.push({ filterType: 'EDUCATION_DEGREE', value: v, isRequired: false }));
    durationInJob.forEach((v) => out.push({ filterType: 'DURATION_IN_JOB', value: v, isRequired: false }));
    splitList(f.schools).forEach((v) => out.push({ filterType: 'EDUCATION_SCHOOL_NAME', value: v }));
    splitList(f.certifications).forEach((v) => out.push({ filterType: 'CERTIFICATION_NAME', value: v }));
    if (f.graduationYear.trim()) out.push({ filterType: 'GRADUATION_YEAR', value: f.graduationYear.trim() });
    return out;
  };

  async function doSearch(search: LastSearch, append: boolean) {
    if (append) setLoadingMore(true); else { setLoading(true); setTalents([]); setEstimation(null); setTxIds([]); }
    setSearched(true);
    try {
      const body = {
        mode: search.mode,
        ...(search.mode === 'prompt' ? { prompt: search.prompt } : { filters: search.filters }),
        relatedTransactionIds: append ? txIds : [],
      };
      const res = await api.post<SearchResult>('/sourcing/kalent/search', body);
      if (res.configured === false) { toast('error', res.error || t('Kalent non configuré')); return; }
      const newTalents = res.data?.talents ?? [];
      setEstimation(res.data?.estimationCount ?? null);
      if (res.data?.searchTransactionId) setTxIds((prev) => [...prev, res.data!.searchTransactionId]);
      setTalents((prev) => {
        const seen = new Set(prev.map((tal) => tal.id));
        const merged = append ? [...prev] : [];
        if (!append) seen.clear();
        for (const tal of newTalents) if (!seen.has(tal.id)) { merged.push(tal); seen.add(tal.id); }
        return merged;
      });
      if (append && newTalents.length === 0) toast('info', t('Plus de nouveaux profils pour cette recherche.'));
    } catch (e) {
      toast('error', e instanceof Error ? e.message : t('Erreur de recherche'));
    } finally { setLoading(false); setLoadingMore(false); }
  }

  function searchByPrompt() {
    if (!prompt.trim()) { toast('error', t('Décris le profil recherché.')); return; }
    const s: LastSearch = { mode: 'prompt', prompt: prompt.trim() };
    setLastSearch(s); doSearch(s, false);
  }
  function searchByFilters() {
    const filters = buildFilters();
    if (!filters.length) { toast('error', t('Renseigne au moins un filtre.')); return; }
    const s: LastSearch = { mode: 'filters', filters };
    setLastSearch(s); doSearch(s, false);
  }

  async function addTalent(tal: Talent) {
    setAddStates((p) => ({ ...p, [tal.id]: { status: 'loading' } }));
    try {
      const en = enrichStates[tal.id];
      const res = await api.post<{ created: boolean; alreadyInMandat: boolean; duplicate: boolean }>(
        '/sourcing/kalent/add',
        {
          mandatId: hasMandat ? projectId : null,
          candidat: {
            nom: tal.lastname || tal.firstname || 'Inconnu',
            prenom: tal.lastname ? tal.firstname : undefined,
            linkedinUrl: tal.linkedinUrl,
            photoUrl: tal.photoUrl,
            posteActuel: tal.jobTitle || tal.headline,
            entrepriseActuelle: tal.currentOrganization?.name,
            localisation: talentLoc(tal),
            email: en?.emails?.[0],
            telephone: en?.phones?.[0],
          },
        },
      );
      const status: AddState['status'] = res.alreadyInMandat ? 'inmandat' : res.duplicate ? 'exists' : 'created';
      setAddStates((p) => ({ ...p, [tal.id]: { status } }));
      toast('success',
        res.alreadyInMandat ? t('Déjà dans ce mandat')
          : res.duplicate ? (hasMandat ? t('Candidat existant → ajouté au mandat') : t('Déjà dans l\'ATS'))
            : (hasMandat ? t('Ajouté au mandat') : t('Ajouté au vivier')));
    } catch (e) {
      setAddStates((p) => ({ ...p, [tal.id]: { status: 'idle' } }));
      toast('error', e instanceof Error ? e.message : t('Erreur'));
    }
  }

  async function enrich(tal: Talent) {
    if (!tal.linkedinUrl) { toast('error', t('Pas d\'URL LinkedIn pour ce profil.')); return; }
    setEnrichStates((p) => ({ ...p, [tal.id]: { loading: true, done: false, emails: [], phones: [] } }));
    try {
      const start = await api.post<{ data?: { talentId: string } }>('/sourcing/kalent/enrich', { linkedinUrl: tal.linkedinUrl });
      const tid = start.data?.talentId;
      if (!tid) throw new Error(t('Enrichissement indisponible'));
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const r = await api.get<{ data?: { emails: string[]; phones: string[]; contactsLoading?: { email: boolean; phone: boolean } } }>(
          `/sourcing/kalent/enrich?talentId=${encodeURIComponent(tid)}`);
        const d = r.data;
        const cl = d?.contactsLoading;
        const stillLoading = cl ? (cl.email || cl.phone) : false;
        if (!stillLoading) {
          setEnrichStates((p) => ({ ...p, [tal.id]: { loading: false, done: true, emails: d?.emails ?? [], phones: d?.phones ?? [] } }));
          if (!(d?.emails?.length) && !(d?.phones?.length)) toast('info', t('Aucune coordonnée trouvée.'));
          return;
        }
      }
      setEnrichStates((p) => ({ ...p, [tal.id]: { loading: false, done: true, emails: [], phones: [] } }));
      toast('info', t('Enrichissement encore en cours, réessaie dans un instant.'));
    } catch (e) {
      setEnrichStates((p) => ({ ...p, [tal.id]: { loading: false, done: false, emails: [], phones: [] } }));
      toast('error', e instanceof Error ? e.message : t('Erreur enrichissement'));
    }
  }

  const notConfigured = config && !config.configured;

  const addLabel = useMemo(
    () => (!hasChosen ? t('Choisis un projet') : hasMandat ? t('Ajouter au mandat') : t('Ajouter au vivier')),
    [hasChosen, hasMandat],
  );

  return (
    <div className="p-4 md:p-6 lg:p-8" style={{ fontFamily: "'Manrope', sans-serif" }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div style={{ width: 42, height: 42, borderRadius: 12, background: BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Users size={22} color={LIME} />
        </div>
        <div>
          <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 22, color: '#1A1533', margin: 0, letterSpacing: '-0.02em' }}>{t('Sourcing Kalent')}</h1>
          <p style={{ fontSize: 13, color: '#8A8699', margin: 0 }}>{t('Recherche dans +200M de profils, puis ajoute au mandat en un clic.')}</p>
        </div>
      </div>

      {notConfigured && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl p-3.5" style={{ background: '#FDF4E3', border: '1px solid #F0D9A8' }}>
          <AlertCircle size={18} color="#9A6B12" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13.5, color: '#7A5510' }}>
            <strong>{t('Intégration Kalent non configurée.')}</strong> {t('La clé API doit être ajoutée côté serveur')} (<code>KALENT_API_KEY</code>) — {t('contacte un admin. La page fonctionnera dès que la clé sera posée.')}
          </div>
        </div>
      )}

      {/* Projet (mandat) */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl p-4" style={{ background: '#fff', border: '1px solid rgba(34,23,122,.1)' }}>
        <div className="flex items-center gap-2" style={{ color: BRAND }}>
          <Briefcase size={18} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>{t('Projet')}</span>
        </div>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="flex-1 min-w-[240px] rounded-xl border px-3 py-2.5 text-[14px]"
          style={{ borderColor: hasChosen ? 'rgba(34,23,122,.16)' : '#E5A93B', background: '#FCFCF5', color: hasChosen ? '#1A1533' : '#9A6B12' }}
        >
          <option value="">— {t('Choisis un mandat pour sourcer')} —</option>
          {mandats.map((m) => (
            <option key={m.id} value={m.id}>{m.titrePoste}{m.entreprise?.nom ? ` — ${m.entreprise.nom}` : ''}</option>
          ))}
          <option value="__VIVIER__">{t('Vivier (sans mandat)')}</option>
        </select>
        {project && (
          <Link to={`/mandats/${project.id}/kanban`} className="text-[13px] font-semibold inline-flex items-center gap-1.5" style={{ color: BRAND }}>
            {t('Voir le pipeline')} <ExternalLink size={13} />
          </Link>
        )}
      </div>

      {/* Barre de recherche prompt */}
      <div className="rounded-2xl p-4 mb-3" style={{ background: '#fff', border: '1px solid rgba(34,23,122,.1)' }}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Sparkles size={17} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9A96AE' }} />
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') searchByPrompt(); }}
              placeholder={t('Décris le profil : « Head of Sales SaaS à Paris, 5+ ans, anglais courant »')}
              className="w-full rounded-xl border py-3 pl-10 pr-3 text-[14.5px]"
              style={{ borderColor: 'rgba(34,23,122,.16)', background: '#FCFCF5', color: '#1A1533' }}
            />
          </div>
          <button
            onClick={searchByPrompt}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold"
            style={{ background: BRAND, color: LIME }}
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />} {t('Rechercher')}
          </button>
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ color: BRAND }}
        >
          <SlidersHorizontal size={14} /> {showFilters ? t('Masquer') : t('Filtres avancés')}
        </button>

        {showFilters && (
          <div className="mt-3 pt-3 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ borderTop: '1px solid rgba(34,23,122,.08)' }}>
            <Field label={t('Intitulé de poste')}><input value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} placeholder="Account Executive" style={inp} /></Field>
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <Field label={t('Localisation')}><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Paris" style={inp} /></Field>
              <Field label={t('Rayon (km)')}><input value={f.radius} onChange={(e) => setF({ ...f, radius: e.target.value })} type="number" style={inp} /></Field>
            </div>
            <Field label={t('Compétences (séparées par ,)')}><input value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} placeholder="SaaS, prospection" style={inp} /></Field>
            <Field label={t('Séniorité (,)')}><input value={f.seniority} onChange={(e) => setF({ ...f, seniority: e.target.value })} placeholder="Senior, Director" style={inp} /></Field>
            <Field label={t('Entreprises (,)')}><input value={f.companies} onChange={(e) => setF({ ...f, companies: e.target.value })} placeholder="Salesforce, HubSpot" style={inp} /></Field>
            <Field label={t('Entreprises exclues (,)')}><input value={f.excludedCompanies} onChange={(e) => setF({ ...f, excludedCompanies: e.target.value })} style={inp} /></Field>
            <Field label={t('Secteur (,)')}><input value={f.industries} onChange={(e) => setF({ ...f, industries: e.target.value })} placeholder={t('Logiciel, SaaS')} style={inp} /></Field>
            <Field label={t('Langues (,)')}><input value={f.languages} onChange={(e) => setF({ ...f, languages: e.target.value })} placeholder={t('Français, Anglais')} style={inp} /></Field>
            <Field label={t('Mots-clés')}><input value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} style={inp} /></Field>
            <div className="md:col-span-2"><Field label={t("Années d'expérience")}><Chips options={YEARS_BANDS.map((b) => ({ v: b, l: t('{b} ans', { b }) }))} value={yearsExp} onChange={setYearsExp} /></Field></div>
            <div className="md:col-span-2"><Field label={t('Ancienneté dans le poste actuel')}><Chips options={YEARS_BANDS.map((b) => ({ v: b, l: t('{b} ans', { b }) }))} value={durationInJob} onChange={setDurationInJob} /></Field></div>
            <div className="md:col-span-2"><Field label={t("Taille d'entreprise (effectif)")}><Chips options={SIZE_BANDS.map((b) => ({ v: b, l: b }))} value={companySize} onChange={setCompanySize} /></Field></div>
            <div className="md:col-span-2"><Field label={t('Diplôme')}><Chips options={DEGREE_OPTS} value={degrees} onChange={setDegrees} /></Field></div>
            <Field label={t('École / université (,)')}><input value={f.schools} onChange={(e) => setF({ ...f, schools: e.target.value })} placeholder="HEC, Polytechnique" style={inp} /></Field>
            <Field label={t('Année de diplôme')}><input value={f.graduationYear} onChange={(e) => setF({ ...f, graduationYear: e.target.value })} placeholder="2018" style={inp} /></Field>
            <div className="md:col-span-2"><Field label={t('Certifications (,)')}><input value={f.certifications} onChange={(e) => setF({ ...f, certifications: e.target.value })} placeholder="AWS Certified, PMP" style={inp} /></Field></div>
            <div className="md:col-span-2 flex justify-end">
              <button onClick={searchByFilters} disabled={loading} className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-bold" style={{ background: BRAND, color: LIME }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} {t('Rechercher avec ces filtres')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Résultats */}
      {estimation != null && (
        <div className="mb-3 text-[13px]" style={{ color: '#6E6A85' }}>
          ~<strong style={{ color: '#1A1533' }}>{estimation.toLocaleString(LOCALE)}</strong> {t('profils estimés')} · {t(talents.length > 1 ? '{n} affichés' : '{n} affiché', { n: talents.length })}
        </div>
      )}

      {loading && (
        <div className="py-16 grid place-items-center" style={{ color: '#8A8699' }}><Loader2 className="animate-spin" /></div>
      )}

      {!loading && searched && talents.length === 0 && (
        <div className="py-16 text-center text-[14px]" style={{ color: '#8A8699' }}>{t('Aucun profil trouvé. Élargis tes critères.')}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {talents.map((tal) => {
          const add = addStates[tal.id]?.status ?? 'idle';
          const en = enrichStates[tal.id];
          const expanded = expandedIds.has(tal.id);
          const exps = tal.experiences || [];
          const edus = tal.educations || [];
          const langs = tal.languages || [];
          return (
            <div key={tal.id} className="rounded-2xl p-4 flex gap-3.5" style={{ background: '#fff', border: '1px solid rgba(34,23,122,.1)' }}>
              {tal.photoUrl ? (
                <img src={tal.photoUrl} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#ECEAF8', color: BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 17, flexShrink: 0 }}>{initials(tal)}</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1A1533' }} className="truncate">{talentName(tal)}</div>
                    <div style={{ fontSize: 13, color: '#4A4568' }} className="truncate">{tal.jobTitle || tal.headline || '—'}</div>
                  </div>
                  {tal.linkedinUrl && (
                    <a href={tal.linkedinUrl} target="_blank" rel="noopener noreferrer" title={t('Voir le profil LinkedIn')} style={{ color: '#2A6BD8', flexShrink: 0 }}><Linkedin size={18} /></a>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px]" style={{ color: '#8A8699' }}>
                  {tal.currentOrganization?.name && <span className="inline-flex items-center gap-1"><Building2 size={12} />{tal.currentOrganization.name}</span>}
                  {talentLoc(tal) && <span className="inline-flex items-center gap-1"><MapPin size={12} />{talentLoc(tal)}</span>}
                </div>
                {/* Résumé */}
                {tal.summary && (
                  <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: '#6E6A85', display: '-webkit-box', WebkitLineClamp: expanded ? 'unset' : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{tal.summary}</p>
                )}

                {/* Parcours */}
                {exps.length > 0 && (
                  <div className="mt-2.5">
                    <div className="text-[10.5px] font-bold uppercase mb-1" style={{ color: '#9A96AE', letterSpacing: '.08em' }}>{t('Parcours')}</div>
                    <div className="flex flex-col gap-1">
                      {(expanded ? exps.slice(0, 6) : exps.slice(0, 1)).map((e, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[12.5px]" style={{ color: '#4A4568' }}>
                          <Briefcase size={12} style={{ marginTop: 2, flexShrink: 0, color: '#B4B0C2' }} />
                          <span><strong style={{ color: '#1A1533', fontWeight: 600 }}>{e.title || '—'}</strong>{(e.organizationName || e.organization?.name) ? ` · ${e.organizationName || e.organization?.name}` : ''}{period(e) ? ` · ${period(e)}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Formation */}
                {edus.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[10.5px] font-bold uppercase mb-1" style={{ color: '#9A96AE', letterSpacing: '.08em' }}>{t('Formation')}</div>
                    <div className="flex flex-col gap-1">
                      {(expanded ? edus.slice(0, 4) : edus.slice(0, 1)).map((e, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[12.5px]" style={{ color: '#4A4568' }}>
                          <GraduationCap size={12} style={{ marginTop: 2, flexShrink: 0, color: '#B4B0C2' }} />
                          <span>{eduLine(e) || '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Langues */}
                {langs.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]" style={{ color: '#6E6A85' }}>
                    <Languages size={12} style={{ color: '#B4B0C2' }} />
                    {langs.slice(0, expanded ? 20 : 4).map((l, i, arr) => (
                      <span key={i}>{l.name}{l.proficiency ? ` (${l.proficiency})` : ''}{i < arr.length - 1 ? ',' : ''}</span>
                    ))}
                  </div>
                )}

                {/* Compétences */}
                {tal.skills && tal.skills.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tal.skills.slice(0, expanded ? 30 : 6).map((s, i) => (
                      <span key={i} className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: '#F1F0F5', color: '#6E6A85' }}>{s}</span>
                    ))}
                  </div>
                )}

                {/* Voir plus / moins */}
                {(exps.length > 1 || edus.length > 1 || (tal.skills?.length ?? 0) > 6 || (tal.summary?.length ?? 0) > 160) && (
                  <button onClick={() => toggleExpand(tal.id)} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold" style={{ color: BRAND }}>
                    {expanded ? <>{t('Voir moins')} <ChevronUp size={13} /></> : <>{t('Voir plus')} <ChevronDown size={13} /></>}
                  </button>
                )}

                {/* Contact enrichi */}
                {en?.done && (en.emails.length > 0 || en.phones.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]" style={{ color: '#1F7A50' }}>
                    {en.emails[0] && <a href={`mailto:${en.emails[0]}`} className="inline-flex items-center gap-1"><Mail size={12} />{en.emails[0]}</a>}
                    {en.phones[0] && <a href={`tel:${en.phones[0]}`} className="inline-flex items-center gap-1"><Phone size={12} />{en.phones[0]}</a>}
                  </div>
                )}

                {/* Actions */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => addTalent(tal)}
                    disabled={add === 'loading' || add === 'created' || add === 'inmandat' || !hasChosen}
                    title={!hasChosen ? t('Choisis d\'abord un projet en haut') : undefined}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold"
                    style={
                      !hasChosen && add === 'idle'
                        ? { background: '#F1F0F5', color: '#9A96AE', cursor: 'not-allowed' }
                        : add === 'created' || add === 'inmandat'
                          ? { background: '#E7F6EE', color: '#1F7A50' }
                          : add === 'exists'
                            ? { background: '#ECEAF8', color: BRAND }
                            : { background: BRAND, color: LIME }
                    }
                  >
                    {add === 'loading' ? <Loader2 size={13} className="animate-spin" />
                      : add === 'created' || add === 'inmandat' ? <Check size={13} />
                        : <Plus size={13} />}
                    {add === 'created' ? (hasMandat ? t('Ajouté au mandat') : t('Ajouté au vivier'))
                      : add === 'inmandat' ? t('Déjà dans le mandat')
                        : add === 'exists' ? t('Existant (relié)')
                          : addLabel}
                  </button>
                  <button
                    onClick={() => enrich(tal)}
                    disabled={!tal.linkedinUrl || en?.loading}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold"
                    style={{ background: '#fff', border: '1px solid rgba(34,23,122,.16)', color: tal.linkedinUrl ? BRAND : '#C4C1D0' }}
                    title={tal.linkedinUrl ? t('Révéler email + téléphone (crédits Kalent)') : t('Pas de LinkedIn')}
                  >
                    {en?.loading ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                    {en?.loading ? t('Enrichissement…') : en?.done ? t('Ré-enrichir') : t('Révéler contact')}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charger plus */}
      {talents.length > 0 && lastSearch && (
        <div className="mt-5 flex justify-center">
          <button
            onClick={() => doSearch(lastSearch, true)}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-bold"
            style={{ background: '#fff', border: `1.5px solid ${BRAND}`, color: BRAND }}
          >
            {loadingMore ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {t('Charger plus de profils')}
          </button>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = {
  width: '100%', fontSize: 13.5, padding: '9px 11px', borderRadius: 10,
  border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none', color: '#1A1533',
};
function Chips({ options, value, onChange }: { options: { v: string; l: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.v);
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => toggle(o.v)}
            style={{
              fontSize: 12, fontWeight: 600, padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
              border: `1.5px solid ${on ? '#22177A' : 'rgba(34,23,122,.16)'}`,
              background: on ? '#22177A' : '#fff', color: on ? '#E6E9AF' : '#4A4568',
            }}
          >{o.l}</button>
        );
      })}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8A8699', marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}
