import { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Building2, User, MapPin, Calendar, Euro, LayoutGrid, Pencil, Trash2, Save, X, Link2, Check, Sparkles, Loader2, ChevronDown, ChevronUp, Plus, AlertTriangle, ClipboardList, MessageSquare, Target, Copy, Zap, Star, Search, Phone, Mail as MailIcon, Clock } from 'lucide-react';
import { api } from '../../lib/api-client';
import { usePageTitle } from '../../hooks/usePageTitle';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input, { Textarea } from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Skeleton, { SkeletonCard } from '../../components/ui/Skeleton';
import ActivityJournal from '../../components/activity/ActivityJournal';
import MandatTimeline from '../../components/activity/MandatTimeline';
import DeleteConfirmModal from '../../components/ui/DeleteConfirmModal';
import { toast } from '../../components/ui/Toast';

type StatutMandat = 'OUVERT' | 'EN_COURS' | 'GAGNE' | 'PERDU' | 'ANNULE' | 'CLOTURE';
type Priorite = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE';
type FeeStatut = 'NON_FACTURE' | 'FACTURE' | 'PAYE';

interface CandidatureCandidat {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  posteActuel: string | null;
  entrepriseActuelle: string | null;
  localisation: string | null;
  linkedinUrl: string | null;
}

interface Candidature {
  id: string;
  stage: string;
  notes: string | null;
  candidat: CandidatureCandidat;
  createdAt: string;
}

interface MandatDetail {
  id: string;
  titrePoste: string;
  slug: string | null;
  description: string | null;
  localisation: string | null;
  salaireMin: number | null;
  salaireMax: number | null;
  feePourcentage: string;
  feeMontantEstime: number | null;
  feeMontantFacture: number | null;
  feeStatut: FeeStatut;
  statut: StatutMandat;
  priorite: Priorite;
  dateOuverture: string;
  dateCloture: string | null;
  notes: string | null;
  entreprise: {
    id: string;
    nom: string;
    secteur: string | null;
    localisation: string | null;
  };
  client: {
    id: string;
    nom: string;
    prenom: string | null;
    email: string | null;
    telephone: string | null;
  };
  candidatures: Candidature[];
  transcript: string | null;
  ficheDePoste: string | null;
  scorecard: Scorecard | null;
  scorecardGeneratedAt: string | null;
  salesId: string | null;
  sales: { id: string; nom: string; prenom: string | null } | null;
  recruteurId: string | null;
  recruteur: { id: string; nom: string; prenom: string | null } | null;
  // Contrat (chantier 4)
  contractStatus?: 'DRAFT' | 'SENT' | 'SIGNED' | 'EXPIRED';
  contractSentAt?: string | null;
  contractSignedAt?: string | null;
  paymentTerms?: string | null;
  applicableCountry?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TeamMember {
  id: string;
  nom: string;
  prenom: string | null;
}

interface ScorecardCompetence {
  nom: string;
  poids: number;
  description: string;
}

interface ScorecardCritere {
  nom: string;
  obligatoire?: boolean;
  description?: string;
}

interface ScorecardQuestion {
  question: string;
  competenceVisee: string;
}

interface Scorecard {
  competencesCles: ScorecardCompetence[];
  criteresTechniques: ScorecardCritere[];
  criteresComportementaux: ScorecardCritere[];
  questionsEntretien: ScorecardQuestion[];
  profilIdeal: string;
  redFlags: string[];
}

interface AiMatch {
  candidatId: string;
  nom: string;
  prenom: string | null;
  score: number;
  reasons: string[];
  posteActuel: string | null;
  entrepriseActuelle: string | null;
  localisation: string | null;
}

interface EditForm {
  titrePoste: string;
  description: string;
  localisation: string;
  salaireMin: string;
  salaireMax: string;
  feePourcentage: string;
  priorite: string;
  statut: string;
  notes: string;
  salesId: string;
  recruteurId: string;
}

const statutLabels: Record<StatutMandat, string> = {
  OUVERT: 'Ouvert',
  EN_COURS: 'En cours',
  GAGNE: 'Gagné',
  PERDU: 'Perdu',
  ANNULE: 'Annulé',
  CLOTURE: 'Clôturé',
};

const statutVariant: Record<StatutMandat, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  OUVERT: 'info',
  EN_COURS: 'warning',
  GAGNE: 'success',
  PERDU: 'error',
  ANNULE: 'error',
  CLOTURE: 'default',
};

const statutOptions = [
  { value: 'OUVERT', label: 'Ouvert' },
  { value: 'EN_COURS', label: 'En cours' },
  { value: 'GAGNE', label: 'Gagné' },
  { value: 'PERDU', label: 'Perdu' },
  { value: 'ANNULE', label: 'Annulé' },
  { value: 'CLOTURE', label: 'Clôturé' },
];

const prioriteLabels: Record<Priorite, string> = {
  BASSE: 'Basse',
  NORMALE: 'Normale',
  HAUTE: 'Haute',
  URGENTE: 'Urgente',
};

const prioriteVariant: Record<Priorite, 'default' | 'info' | 'warning' | 'error'> = {
  BASSE: 'default',
  NORMALE: 'info',
  HAUTE: 'warning',
  URGENTE: 'error',
};

const prioriteOptions = [
  { value: 'BASSE', label: 'Basse' },
  { value: 'NORMALE', label: 'Normale' },
  { value: 'HAUTE', label: 'Haute' },
  { value: 'URGENTE', label: 'Urgente' },
];

const feeStatutLabels: Record<FeeStatut, string> = {
  NON_FACTURE: 'Non facturé',
  FACTURE: 'Facturé',
  PAYE: 'Payé',
};

const feeStatutVariant: Record<FeeStatut, 'default' | 'warning' | 'success'> = {
  NON_FACTURE: 'default',
  FACTURE: 'warning',
  PAYE: 'success',
};

const stageBadgeVariant: Record<string, 'sourcing' | 'contacte' | 'entretien1' | 'envoyeClient' | 'entretienClient' | 'offre' | 'place' | 'refuse'> = {
  SOURCING: 'sourcing',
  CONTACTE: 'contacte',
  ENTRETIEN_1: 'entretien1',
  ENVOYE_CLIENT: 'envoyeClient',
  ENTRETIEN_CLIENT: 'entretienClient',
  OFFRE: 'offre',
  PLACE: 'place',
  REFUSE: 'refuse',
};

const stageLabels: Record<string, string> = {
  SOURCING: 'Sourcing',
  CONTACTE: 'Contacté',
  ENTRETIEN_1: 'Entretien 1',
  ENVOYE_CLIENT: 'Envoyé client',
  ENTRETIEN_CLIENT: 'Entretien Client',
  OFFRE: 'Offre',
  PLACE: 'Placé',
  REFUSE: 'Refusé',
};

function formatSalary(value: number | null): string {
  if (!value) return '\u2014';
  return `${(value / 1000).toFixed(0)}k\u20ac`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function daysBetween(from: string, to?: string): number {
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / (24 * 60 * 60 * 1000)));
}

function formatEuros(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toLocaleString('fr-FR')} €`;
}

const detailStagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const detailItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
};

function buildEditForm(mandat: MandatDetail): EditForm {
  return {
    titrePoste: mandat.titrePoste || '',
    description: mandat.description || '',
    localisation: mandat.localisation || '',
    salaireMin: mandat.salaireMin ? String(mandat.salaireMin) : '',
    salaireMax: mandat.salaireMax ? String(mandat.salaireMax) : '',
    feePourcentage: mandat.feePourcentage ? String(Number(mandat.feePourcentage)) : '20',
    priorite: mandat.priorite || 'NORMALE',
    statut: mandat.statut || 'OUVERT',
    notes: mandat.notes || '',
    salesId: mandat.salesId || '',
    recruteurId: mandat.recruteurId || '',
  };
}

// ─── BRIEF CLIENT + SCORECARD SECTION ────────────────

function BriefClientSection({
  mandatId,
  transcript: initialTranscript,
  ficheDePoste: initialFicheDePoste,
  scorecard: initialScorecard,
  scorecardGeneratedAt,
}: {
  mandatId: string;
  transcript: string | null;
  ficheDePoste: string | null;
  scorecard: Scorecard | null;
  scorecardGeneratedAt: string | null;
}) {
  const queryClient = useQueryClient();
  const [briefOpen, setBriefOpen] = useState(true);
  const [scorecardOpen, setScorecardOpen] = useState(true);
  const [transcript, setTranscript] = useState(initialTranscript || '');
  const [ficheDePoste, setFicheDePoste] = useState(initialFicheDePoste || '');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Save transcript/fiche de poste
  const handleSaveBrief = async () => {
    setSaving(true);
    try {
      await api.put(`/mandats/${mandatId}`, { transcript, ficheDePoste });
      queryClient.invalidateQueries({ queryKey: ['mandat', mandatId] });
      toast('success', 'Brief sauvegardé');
    } catch (err: any) {
      toast('error', err?.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  // Generate scorecard
  const handleGenerateScorecard = async () => {
    if (!transcript.trim() && !ficheDePoste.trim()) {
      toast('error', 'Ajoutez un transcript ou une fiche de poste avant de générer');
      return;
    }
    setGenerating(true);
    try {
      await api.post(`/ai/mandat/${mandatId}/generate-scorecard`, {
        transcript: transcript || undefined,
        ficheDePoste: ficheDePoste || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['mandat', mandatId] });
      toast('success', 'Scorecard générée avec succès');
    } catch (err: any) {
      toast('error', err?.data?.message || err?.message || 'Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast('success', 'Copié dans le presse-papier');
  };

  return (
    <>
      {/* Brief Client */}
      <Card>
        <button
          onClick={() => setBriefOpen(!briefOpen)}
          className="flex w-full items-center justify-between"
        >
          <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
            <MessageSquare size={18} /> Brief Client
          </h2>
          {briefOpen ? <ChevronUp size={18} className="text-text-tertiary" /> : <ChevronDown size={18} className="text-text-tertiary" />}
        </button>

        {briefOpen && (
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-primary">Transcript du call</label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={6}
                className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                placeholder="Collez le transcript de votre call avec le client ici..."
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-primary">Fiche de poste</label>
              <textarea
                value={ficheDePoste}
                onChange={(e) => setFicheDePoste(e.target.value)}
                rows={6}
                className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                placeholder="Collez la fiche de poste / job description ici..."
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveBrief}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary transition-all hover:bg-primary-50 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Sauvegarder
              </button>
              <button
                onClick={handleGenerateScorecard}
                disabled={generating || (!transcript.trim() && !ficheDePoste.trim())}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2 text-sm font-medium text-white transition-all hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Générer la scorecard IA
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Scorecard */}
      {initialScorecard && (
        <Card>
          <button
            onClick={() => setScorecardOpen(!scorecardOpen)}
            className="flex w-full items-center justify-between"
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
              <Target size={18} /> Scorecard
              {scorecardGeneratedAt && (
                <span className="text-xs font-normal text-text-tertiary">
                  — générée le {new Date(scorecardGeneratedAt).toLocaleDateString('fr-FR')}
                </span>
              )}
            </h2>
            {scorecardOpen ? <ChevronUp size={18} className="text-text-tertiary" /> : <ChevronDown size={18} className="text-text-tertiary" />}
          </button>

          {scorecardOpen && (
            <div className="mt-4 space-y-6">
              {/* Profil Idéal */}
              <div className="rounded-lg border border-primary-200 bg-primary-50 p-4">
                <h3 className="mb-2 text-sm font-semibold text-primary-700 flex items-center gap-1.5">
                  <User size={14} /> Profil idéal
                </h3>
                <p className="text-sm text-primary-800">{initialScorecard.profilIdeal}</p>
              </div>

              {/* Compétences clés */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-text-primary">Compétences clés</h3>
                <div className="space-y-2">
                  {initialScorecard.competencesCles.map((comp, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-text-primary">{comp.nom}</span>
                          <span className="text-xs text-text-tertiary">{comp.poids}/5</span>
                        </div>
                        <div className="h-2 rounded-full bg-neutral-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all"
                            style={{ width: `${(comp.poids / 5) * 100}%` }}
                          />
                        </div>
                        <p className="mt-0.5 text-xs text-text-tertiary">{comp.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Critères techniques */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-text-primary">Critères techniques</h3>
                <div className="flex flex-wrap gap-2">
                  {initialScorecard.criteresTechniques.map((crit, i) => (
                    <span
                      key={i}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        crit.obligatoire
                          ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
                          : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {crit.nom}
                      {crit.obligatoire && ' *'}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-text-tertiary">* = obligatoire</p>
              </div>

              {/* Critères comportementaux */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-text-primary">Critères comportementaux</h3>
                <div className="space-y-2">
                  {initialScorecard.criteresComportementaux.map((crit, i) => (
                    <div key={i} className="rounded-md border border-border p-3">
                      <span className="text-sm font-medium text-text-primary">{crit.nom}</span>
                      {crit.description && (
                        <p className="mt-0.5 text-xs text-text-tertiary">{crit.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Questions d'entretien */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-text-primary flex items-center gap-1.5">
                  <ClipboardList size={14} /> Questions d'entretien suggérées
                </h3>
                <div className="space-y-2">
                  {initialScorecard.questionsEntretien.map((q, i) => (
                    <div key={i} className="group flex items-start gap-2 rounded-md border border-border p-3 hover:bg-primary-50/30 transition-colors">
                      <span className="text-xs font-bold text-text-tertiary mt-0.5">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text-primary">{q.question}</p>
                        <p className="text-xs text-text-tertiary mt-0.5">Compétence visée : {q.competenceVisee}</p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(q.question)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-text-tertiary hover:text-primary-500"
                        title="Copier"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Red Flags */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-text-primary flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-red-500" /> Red Flags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {initialScorecard.redFlags.map((flag, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200"
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Regenerate button */}
              <div className="border-t border-border pt-4">
                <button
                  onClick={handleGenerateScorecard}
                  disabled={generating}
                  className="flex items-center gap-2 text-sm font-medium text-primary-500 hover:text-primary-600 transition-colors disabled:opacity-50"
                >
                  {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Regénérer la scorecard
                </button>
              </div>
            </div>
          )}
        </Card>
      )}
    </>
  );
}

export default function MandatDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [bookingCopied, setBookingCopied] = useState(false);
  const [showMatching, setShowMatching] = useState(false);
  const [matchResults, setMatchResults] = useState<AiMatch[]>([]);
  const [showAddCandidat, setShowAddCandidat] = useState(false);
  const [candidatSearch, setCandidatSearch] = useState('');
  const [candidatResults, setCandidatResults] = useState<{ id: string; nom: string; prenom: string | null; posteActuel: string | null; entrepriseActuelle: string | null }[]>([]);
  const [candidatSearchLoading, setCandidatSearchLoading] = useState(false);
  const addCandidatDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch booking settings to get current user's slug
  const { data: bookingSettings } = useQuery({
    queryKey: ['booking', 'settings'],
    queryFn: () => api.get<{ slug: string; isActive: boolean }>('/booking/settings'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const { data: mandat, isLoading } = useQuery({
    queryKey: ['mandat', id],
    queryFn: () => api.get<MandatDetail>(`/mandats/${id}`),
    enabled: !!id,
  });

  const { data: teamMembers } = useQuery({
    queryKey: ['settings', 'team'],
    queryFn: () => api.get<TeamMember[]>('/settings/team'),
    staleTime: 10 * 60 * 1000,
  });

  const teamOptions = [
    { value: '', label: '—' },
    ...(teamMembers ?? []).map((t) => ({
      value: t.id,
      label: [t.prenom, t.nom].filter(Boolean).join(' ') || t.nom,
    })),
  ];

  usePageTitle(mandat ? `${mandat.titrePoste} — ${mandat.entreprise.nom}` : 'Mandat');

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.put<MandatDetail>(`/mandats/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mandat', id] });
      toast('success', 'Modifications enregistrées');
      setIsEditing(false);
      setEditForm(null);
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de la mise à jour');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/mandats/${id}`),
    onSuccess: () => {
      toast('success', 'Supprimé avec succès');
      navigate('/mandats');
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de la suppression');
    },
  });

  const cloneMutation = useMutation({
    mutationFn: () => api.post<{ id: string }>(`/mandats/${id}/clone`, {}),
    onSuccess: (data) => {
      toast('success', 'Mandat dupliqué !');
      navigate(`/mandats/${data.id}`);
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de la duplication');
    },
  });

  const matchingMutation = useMutation({
    mutationFn: () => api.post<{ matches: AiMatch[] }>(`/ai/matching/${id}`, {}),
    onSuccess: (data) => {
      const matches = data?.matches || [];
      setMatchResults(matches);
      setShowMatching(true);
      toast('success', `${matches.length} candidats trouvés`);
    },
    onError: (error: any) => {
      toast('error', error?.message || 'Erreur lors du matching IA');
    },
  });

  // --- Add candidat to mandat ---
  const existingCandidatIds = new Set(mandat?.candidatures.map((c) => c.candidat.id) || []);

  const addCandidatMutation = useMutation({
    mutationFn: (candidatId: string) =>
      api.post('/candidatures', { candidatId, mandatId: id, stage: 'SOURCING' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mandat', id] });
      toast('success', 'Candidat ajouté au mandat !');
      setShowAddCandidat(false);
      setCandidatSearch('');
      setCandidatResults([]);
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de l\'ajout');
    },
  });

  // Search candidats with debounce
  useEffect(() => {
    if (!candidatSearch || candidatSearch.length < 2) {
      setCandidatResults([]);
      return;
    }
    setCandidatSearchLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await api.get<{ data: any[] }>(`/candidats?search=${encodeURIComponent(candidatSearch)}&perPage=10&scope=all`);
        const results = (res.data || []).filter((c: any) => !existingCandidatIds.has(c.id));
        setCandidatResults(results);
      } catch {
        setCandidatResults([]);
      } finally {
        setCandidatSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [candidatSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showAddCandidat) return;
    const handler = (e: MouseEvent) => {
      if (addCandidatDropdownRef.current && !addCandidatDropdownRef.current.contains(e.target as Node)) {
        setShowAddCandidat(false);
        setCandidatSearch('');
        setCandidatResults([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAddCandidat]);

  const handleStartEdit = () => {
    if (mandat) {
      setEditForm(buildEditForm(mandat));
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm(null);
  };

  const handleCopyBookingLink = useCallback(() => {
    if (!bookingSettings?.slug || !mandat?.slug) return;
    const link = `https://ats.propium.co/book/${bookingSettings.slug}/${mandat.slug}`;
    navigator.clipboard.writeText(link).then(() => {
      toast('success', 'Lien booking copie !');
      setBookingCopied(true);
      setTimeout(() => setBookingCopied(false), 2000);
    });
  }, [bookingSettings?.slug, mandat?.slug]);

  const handleSave = () => {
    if (!editForm) return;
    const payload: Record<string, unknown> = {};
    if (editForm.titrePoste.trim()) payload.titrePoste = editForm.titrePoste.trim();
    if (editForm.description.trim()) payload.description = editForm.description.trim();
    else payload.description = null;
    if (editForm.localisation.trim()) payload.localisation = editForm.localisation.trim();
    else payload.localisation = null;
    if (editForm.salaireMin) payload.salaireMin = parseInt(editForm.salaireMin, 10);
    else payload.salaireMin = null;
    if (editForm.salaireMax) payload.salaireMax = parseInt(editForm.salaireMax, 10);
    else payload.salaireMax = null;
    if (editForm.feePourcentage) payload.feePourcentage = parseFloat(editForm.feePourcentage);
    if (editForm.priorite) payload.priorite = editForm.priorite;
    if (editForm.statut) payload.statut = editForm.statut;
    if (editForm.notes.trim()) payload.notes = editForm.notes.trim();
    else payload.notes = null;
    payload.salesId = editForm.salesId || null;
    payload.recruteurId = editForm.recruteurId || null;

    updateMutation.mutate(payload);
  };

  const setField = (field: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setEditForm((prev) => prev ? { ...prev, [field]: e.target.value } : prev);
  };

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <div className="space-y-6">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  if (!mandat) {
    return (
      <div className="text-center py-16">
        <p className="text-text-secondary">Mandat introuvable.</p>
        <Button variant="ghost" onClick={() => navigate('/mandats')} className="mt-4">
          Retour aux mandats
        </Button>
      </div>
    );
  }

  const statutColor: Record<StatutMandat, { bg: string; fg: string; dot: string }> = {
    OUVERT:  { bg: 'rgba(59,154,84,0.12)', fg: '#2C6B3F', dot: '#3B9A54' },
    EN_COURS:{ bg: 'rgba(180,120,20,0.12)', fg: '#8A6A2E', dot: '#B47814' },
    GAGNE:   { bg: 'rgba(59,154,84,0.12)', fg: '#2C6B3F', dot: '#3B9A54' },
    PERDU:   { bg: 'rgba(179,38,30,0.12)',  fg: '#B3261E', dot: '#B0361F' },
    ANNULE:  { bg: 'rgba(179,38,30,0.12)',  fg: '#B3261E', dot: '#B0361F' },
    CLOTURE: { bg: 'rgba(34,23,122,0.06)',  fg: '#5A5470', dot: '#8A8699' },
  };
  const st = statutColor[mandat.statut];

  const daysOpen = daysBetween(mandat.dateOuverture);
  const candidatsCount = mandat.candidatures?.length ?? 0;
  const salaireMax = mandat.salaireMax ?? mandat.salaireMin ?? 0;
  const feePercent = Number(mandat.feePourcentage || '0');

  return (
    <div className="rise-stagger">
      {/* ── BREADCRUMB ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: '#9A96AE', fontWeight: 600 }}>
        <a onClick={() => navigate('/mandats')} style={{ color: '#8A8699', cursor: 'pointer' }}>Mandats</a>
        <span style={{ color: '#C4C1D0' }}>›</span>
        <span style={{ color: '#22177A', fontWeight: 700 }}>{mandat.titrePoste}</span>
      </div>

      {/* ── HEADER : titre + chips + actions ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginTop: 8 }}>
        <div>
          <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 30, letterSpacing: '-0.03em', color: '#1A1533', lineHeight: 1.05 }}>
            {mandat.titrePoste}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 8, flexWrap: 'wrap' }}>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#4A4568', cursor: 'pointer' }}
              onClick={() => navigate(`/entreprises/${mandat.entreprise.id}`)}
            >
              <Building2 size={14} color="#22177A" strokeWidth={2} />
              {mandat.entreprise.nom}
            </span>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#C4C1D0' }} />
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '4px 11px',
                background: st.bg, color: st.fg,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.dot }} />
              {statutLabels[mandat.statut]}
            </span>
            <span
              style={{
                fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '4px 11px',
                background: 'rgba(34,23,122,0.06)', color: '#5A5470',
              }}
            >
              Priorité {prioriteLabels[mandat.priorite].toLowerCase()}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer', border: 'none' }}
              >
                <Save size={15} />
                Enregistrer
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={updateMutation.isPending}
                className="btn-secondary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}
              >
                <X size={15} />
                Annuler
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate(`/mandats/${id}/kanban`)}
                className="btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer', border: 'none' }}
              >
                <LayoutGrid size={15} />
                Voir le Kanban
              </button>
              {bookingSettings?.isActive && bookingSettings?.slug && mandat.slug && (
                <button
                  onClick={handleCopyBookingLink}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700,
                    background: '#F0EFC4', color: '#22177A', border: '1px solid transparent',
                    borderRadius: 11, padding: '10px 15px', cursor: 'pointer',
                  }}
                >
                  {bookingCopied ? <Check size={15} className="text-green-500" /> : <Link2 size={15} />}
                  {bookingCopied ? 'Copié !' : 'Lien booking'}
                </button>
              )}
              <button
                onClick={handleStartEdit}
                title="Modifier"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 40, height: 40, background: '#fff', color: '#4A4568',
                  border: '1px solid rgba(34,23,122,0.16)', borderRadius: 11, cursor: 'pointer',
                }}
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => cloneMutation.mutate()}
                disabled={cloneMutation.isPending}
                title="Dupliquer"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 40, height: 40, background: '#fff', color: '#4A4568',
                  border: '1px solid rgba(34,23,122,0.16)', borderRadius: 11, cursor: 'pointer',
                }}
              >
                <Copy size={15} />
              </button>
              <button
                onClick={() => setShowDeleteModal(true)}
                title="Supprimer"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 40, height: 40, background: '#fff', color: '#B3261E',
                  border: '1px solid rgba(179,38,30,0.2)', borderRadius: 11, cursor: 'pointer',
                }}
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── STATS BAR : 5 KPI horizontaux (Fee/Salaire/Candidats/Ouvert depuis/Échéance) ── */}
      <div
        style={{
          display: 'flex', alignItems: 'stretch',
          background: '#fff', border: '1px solid rgba(34,23,122,0.08)',
          borderRadius: 14, boxShadow: '0 1px 2px rgba(34,23,122,0.04)',
          marginTop: 12, overflow: 'hidden',
        }}
      >
        <StatsCell
          label="Fee estimé"
          value={formatEuros(mandat.feeMontantEstime)}
          valueColor="#22177A"
          foot={feePercent > 0 ? `${feePercent} % du package` : '—'}
        />
        <StatsCellDivider />
        <StatsCell
          label="Salaire"
          value={salaireMax ? formatEuros(salaireMax) : '—'}
          valueColor="#1A1533"
          foot="package annuel"
        />
        <StatsCellDivider />
        <StatsCell
          label="Candidats"
          value={String(candidatsCount)}
          valueColor="#1A1533"
          foot="en pipeline"
        />
        <StatsCellDivider />
        <StatsCell
          label="Ouvert depuis"
          value={`${daysOpen} j`}
          valueColor="#1A1533"
          foot={`créé le ${formatDateShort(mandat.dateOuverture)}`}
        />
        <StatsCellDivider />
        <StatsCell
          label="Échéance"
          value={mandat.dateCloture ? formatDateShort(mandat.dateCloture) : '—'}
          valueColor={mandat.dateCloture ? '#B4791A' : '#8A8699'}
          foot={mandat.dateCloture ? `deadline` : 'pas de deadline'}
        />
      </div>

      {/* ══════════════════════════════════════════════════
       * BODY : mock-fidelity 3-column layout (1.45fr / 1fr / 1fr)
       * ══════════════════════════════════════════════════ */}
      {!isEditing && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr 1fr', gap: 14, marginTop: 14, alignItems: 'start' }}>
          {/* ── COL 1 · LE POSTE ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <LeBriefCard mandat={mandat} onStartEdit={handleStartEdit} />
            <ProcessRecrutementCard mandat={mandat} onOpenKanban={() => navigate(`/mandats/${id}/kanban`)} />
          </div>

          {/* ── COL 2 · NOTES + CLIENT ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <NotesInternesCard mandat={mandat} onSave={(notes) => updateMutation.mutate({ notes })} saving={updateMutation.isPending} />
            <ContactClientCardMock client={mandat.client} entrepriseNom={mandat.entreprise.nom} onOpen={() => navigate(`/clients/${mandat.client.id}`)} />
          </div>

          {/* ── COL 3 · ACTIVITÉ ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ClientActivityCard
              client={mandat.client}
              entrepriseNom={mandat.entreprise.nom}
              onOpenClient={() => navigate(`/clients/${mandat.client.id}`)}
            />
            <ActiviteInterneMockCard mandatId={mandat.id} />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
       * ADVANCED SECTIONS (stackées sous le body — préservées)
       * ══════════════════════════════════════════════════ */}
      <motion.div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mt-8" variants={detailStagger} initial="hidden" animate="show">
        {/* Main info */}
        <motion.div className="lg:col-span-2 space-y-6" variants={detailItem}>
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-text-primary">Informations du mandat</h2>
            {isEditing && editForm ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Input label="Titre du poste" value={editForm.titrePoste} onChange={setField('titrePoste')} placeholder="Titre du poste" />
                </div>
                <Input label="Localisation" value={editForm.localisation} onChange={setField('localisation')} placeholder="Paris, France" />
                <Input label="Salaire min (EUR)" type="number" value={editForm.salaireMin} onChange={setField('salaireMin')} placeholder="45000" />
                <Input label="Salaire max (EUR)" type="number" value={editForm.salaireMax} onChange={setField('salaireMax')} placeholder="65000" />
                <Input label="Fee %" type="number" value={editForm.feePourcentage} onChange={setField('feePourcentage')} placeholder="20" />
                <Select
                  label="Priorité"
                  options={prioriteOptions}
                  value={editForm.priorite}
                  onChange={(val) => setEditForm((prev) => prev ? { ...prev, priorite: val } : prev)}
                />
                <Select
                  label="Statut"
                  options={statutOptions}
                  value={editForm.statut}
                  onChange={(val) => setEditForm((prev) => prev ? { ...prev, statut: val } : prev)}
                />
                <Select
                  label="Sales (chasse le mandat)"
                  options={teamOptions}
                  value={editForm.salesId}
                  onChange={(val) => setEditForm((prev) => prev ? { ...prev, salesId: val } : prev)}
                />
                <Select
                  label="Recruteur (source les candidats)"
                  options={teamOptions}
                  value={editForm.recruteurId}
                  onChange={(val) => setEditForm((prev) => prev ? { ...prev, recruteurId: val } : prev)}
                />
                <div className="sm:col-span-2">
                  <Textarea
                    label="Description"
                    value={editForm.description}
                    onChange={setField('description')}
                    placeholder="Description du poste..."
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 size={14} className="text-text-tertiary" />
                    <span className="text-text-tertiary">Entreprise : </span>
                    <span
                      className="text-accent hover:underline cursor-pointer"
                      onClick={() => navigate(`/entreprises/${mandat.entreprise.id}`)}
                    >
                      {mandat.entreprise.nom}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <User size={14} className="text-text-tertiary" />
                    <span className="text-text-tertiary">Client : </span>
                    <span
                      className="text-accent hover:underline cursor-pointer"
                      onClick={() => navigate(`/clients/${mandat.client.id}`)}
                    >
                      {mandat.client.prenom} {mandat.client.nom}
                    </span>
                  </div>
                  {mandat.localisation && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin size={14} className="text-text-tertiary" />
                      <span className="text-text-primary">{mandat.localisation}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar size={14} className="text-text-tertiary" />
                    <span className="text-text-primary">Ouvert le {formatDate(mandat.dateOuverture)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <User size={14} className="text-text-tertiary" />
                    <span className="text-text-tertiary">Sales : </span>
                    <span className="text-text-primary">
                      {mandat.sales
                        ? [mandat.sales.prenom, mandat.sales.nom].filter(Boolean).join(' ')
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <User size={14} className="text-text-tertiary" />
                    <span className="text-text-tertiary">Recruteur : </span>
                    <span className="text-text-primary">
                      {mandat.recruteur
                        ? [mandat.recruteur.prenom, mandat.recruteur.nom].filter(Boolean).join(' ')
                        : '—'}
                    </span>
                  </div>
                </div>

                {mandat.description && (
                  <div className="mt-4 border-t border-border pt-4">
                    <h3 className="mb-2 text-sm font-medium text-text-primary">Description</h3>
                    <p className="whitespace-pre-wrap text-sm text-text-secondary">{mandat.description}</p>
                  </div>
                )}
              </>
            )}
          </Card>

          {/* Brief Client Section */}
          <BriefClientSection
            mandatId={mandat.id}
            transcript={mandat.transcript}
            ficheDePoste={mandat.ficheDePoste}
            scorecard={mandat.scorecard}
            scorecardGeneratedAt={mandat.scorecardGeneratedAt}
          />

          {/* AI Matching Section */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                <Zap size={18} className="text-violet-500" /> AI Matching
              </h2>
              <button
                onClick={() => matchingMutation.mutate()}
                disabled={matchingMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2 text-sm font-medium text-white transition-all hover:from-violet-600 hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {matchingMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Lancer le matching IA
              </button>
            </div>

            {showMatching && matchResults.length > 0 && (
              <div className="space-y-2">
                {matchResults.map((match, idx) => (
                  <div
                    key={match.candidatId}
                    className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-primary-50/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/candidats/${match.candidatId}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary">
                        {match.prenom} {match.nom}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {[match.posteActuel, match.entrepriseActuelle].filter(Boolean).join(' @ ') || 'Aucun poste renseigné'}
                      </p>
                      {match.reasons.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {match.reasons.slice(0, 3).map((r, i) => (
                            <span key={i} className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-600">{r}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="ml-3 flex items-center gap-1.5">
                      <Star size={14} className="text-amber-400" />
                      <span className="text-sm font-bold text-text-primary">{match.score}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showMatching && matchResults.length === 0 && !matchingMutation.isPending && (
              <p className="text-sm text-text-secondary">Aucun candidat correspondant trouvé. Essayez d'enrichir la scorecard.</p>
            )}

            {!showMatching && !matchingMutation.isPending && (
              <p className="text-sm text-text-secondary">Lancez le matching IA pour trouver les meilleurs candidats de votre base pour ce mandat.</p>
            )}
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">
                Candidatures ({mandat.candidatures.length})
              </h2>
              <div className="relative" ref={addCandidatDropdownRef}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setShowAddCandidat(!showAddCandidat); setCandidatSearch(''); setCandidatResults([]); }}
                >
                  <Plus size={14} /> Ajouter un candidat
                </Button>

                <AnimatePresence>
                  {showAddCandidat && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-border bg-white shadow-xl"
                    >
                      <div className="p-2">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                          <input
                            autoFocus
                            type="text"
                            value={candidatSearch}
                            onChange={(e) => setCandidatSearch(e.target.value)}
                            placeholder="Rechercher un candidat..."
                            className="w-full rounded-lg border border-border bg-neutral-50 py-2 pl-9 pr-3 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                          />
                        </div>
                      </div>
                      <div className="max-h-56 overflow-y-auto px-1 pb-1">
                        {candidatSearchLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 size={16} className="animate-spin text-neutral-400" />
                          </div>
                        ) : candidatSearch.length < 2 ? (
                          <p className="px-3 py-4 text-center text-xs text-neutral-400">Tapez au moins 2 caractères</p>
                        ) : candidatResults.length === 0 ? (
                          <p className="px-3 py-4 text-center text-sm text-neutral-400">Aucun résultat</p>
                        ) : (
                          candidatResults.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              disabled={addCandidatMutation.isPending}
                              onClick={() => addCandidatMutation.mutate(c.id)}
                              className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-primary-50 transition-colors group disabled:opacity-50"
                            >
                              <p className="text-sm font-medium text-text-primary group-hover:text-primary-700">
                                {c.prenom} {c.nom}
                              </p>
                              <p className="text-xs text-text-secondary">
                                {[c.posteActuel, c.entrepriseActuelle].filter(Boolean).join(' @ ') || 'Aucun poste'}
                              </p>
                            </button>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            {mandat.candidatures.length === 0 ? (
              <p className="text-sm text-text-secondary">Aucun candidat associé pour le moment.</p>
            ) : (
              <div className="space-y-3">
                {mandat.candidatures.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-primary-50/30 cursor-pointer"
                    onClick={() => navigate(`/candidats/${c.candidat.id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {c.candidat.prenom} {c.candidat.nom}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {[c.candidat.posteActuel, c.candidat.entrepriseActuelle]
                          .filter(Boolean)
                          .join(' @ ') || 'Aucun poste renseigné'}
                      </p>
                    </div>
                    <Badge variant={stageBadgeVariant[c.stage] || 'default'}>
                      {stageLabels[c.stage] || c.stage}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Sidebar */}
        <motion.div className="space-y-6" variants={detailItem}>
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-text-primary">Détails</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-text-tertiary">Priorité</dt>
                <dd className="mt-1">
                  <Badge variant={prioriteVariant[mandat.priorite]}>
                    {prioriteLabels[mandat.priorite]}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-text-tertiary">Salaire min</dt>
                <dd className="font-medium text-text-primary">{formatSalary(mandat.salaireMin)}</dd>
              </div>
              <div>
                <dt className="text-text-tertiary">Salaire max</dt>
                <dd className="font-medium text-text-primary">{formatSalary(mandat.salaireMax)}</dd>
              </div>
              {mandat.dateCloture && (
                <div>
                  <dt className="text-text-tertiary">Date de clôture</dt>
                  <dd className="font-medium text-text-primary">{formatDate(mandat.dateCloture)}</dd>
                </div>
              )}
              {bookingSettings?.isActive && bookingSettings?.slug && mandat.slug && (
                <div>
                  <dt className="text-text-tertiary">Lien booking</dt>
                  <dd className="mt-1">
                    <button
                      onClick={handleCopyBookingLink}
                      className="inline-flex items-center gap-1.5 text-[13px] text-violet-600 hover:text-violet-700 font-medium transition-colors"
                    >
                      <Link2 size={13} />
                      ats.propium.co/book/{bookingSettings.slug}/{mandat.slug}
                    </button>
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <ContractCard mandat={mandat} />

          <PortalAccessCard mandatId={mandat.id} clientId={mandat.client.id} clientEmail={mandat.client.email} />

          <Card>
            <h2 className="mb-4 text-lg font-semibold text-text-primary">Facturation</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-text-tertiary">Fee %</dt>
                <dd className="font-medium text-text-primary">{Number(mandat.feePourcentage)}%</dd>
              </div>
              <div>
                <dt className="text-text-tertiary">Fee estimé</dt>
                <dd className="font-medium text-text-primary">{formatSalary(mandat.feeMontantEstime)}</dd>
              </div>
              <div>
                <dt className="text-text-tertiary">Fee facturé</dt>
                <dd className="font-medium text-text-primary">{formatSalary(mandat.feeMontantFacture)}</dd>
              </div>
              <div>
                <dt className="text-text-tertiary">Statut facturation</dt>
                <dd className="mt-1">
                  <Badge variant={feeStatutVariant[mandat.feeStatut]}>
                    {feeStatutLabels[mandat.feeStatut]}
                  </Badge>
                </dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">Notes</h2>
            {isEditing && editForm ? (
              <Textarea
                value={editForm.notes}
                onChange={setField('notes')}
                placeholder="Notes sur le mandat..."
              />
            ) : mandat.notes ? (
              <p className="whitespace-pre-wrap text-sm text-text-secondary">{mandat.notes}</p>
            ) : (
              <p className="text-sm text-text-secondary">Aucune note.</p>
            )}
          </Card>
        </motion.div>
      </motion.div>

      <div className="mt-8 rounded-lg border border-border bg-white p-6">
        <MandatTimeline mandatId={mandat.id} />
      </div>

      <div className="mt-8">
        <ActivityJournal entiteType="MANDAT" entiteId={mandat.id} />
      </div>

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => deleteMutation.mutate()}
        entityName={`le mandat ${mandat.titrePoste}`}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

// ── Client Activity Card ─────────────────────────────
//
// Widget en tete de sidebar sur la fiche mandat : contact client + last
// 5 activites liees a ce contact (source Activite entiteType=CLIENT).
// Placeholder pour les evenements portail a venir (chantier 3 :
// LOGIN | VIEW_PROFILE | MOVE | DECISION | COMMENT).

interface ClientContact {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
}

interface ClientActivity {
  id: string;
  type: string;
  titre: string | null;
  contenu: string | null;
  source: string;
  createdAt: string;
}

function ClientActivityCard({
  client,
  entrepriseNom,
  onOpenClient,
}: {
  client: ClientContact;
  entrepriseNom: string;
  onOpenClient: () => void;
}) {
  const { data: activitiesResp } = useQuery({
    queryKey: ['activites', 'CLIENT', client.id, 5],
    queryFn: () =>
      api.get<{ data: ClientActivity[]; meta?: unknown }>(
        `/activites?entiteType=CLIENT&entiteId=${client.id}&perPage=5`,
      ),
  });
  const activities = activitiesResp?.data;

  const contactLabel =
    [client.prenom, client.nom].filter(Boolean).join(' ').trim() || 'Contact client';
  const initials = `${(client.prenom || '')[0] ?? ''}${(client.nom || '')[0] ?? ''}`
    .toUpperCase() || '?';

  return (
    <Card>
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          style={{ background: '#E6E9AF', color: '#22177A', fontFamily: "'Archivo Black', sans-serif" }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenClient}
            className="text-left text-[15px] font-semibold text-text-primary hover:text-primary-800 hover:underline"
          >
            {contactLabel}
          </button>
          <p className="text-xs text-text-secondary">{entrepriseNom}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1.5 text-[13px]">
        {client.email && (
          <a
            href={`mailto:${client.email}`}
            className="inline-flex items-center gap-1.5 text-text-secondary hover:text-primary-800"
          >
            <MailIcon size={13} strokeWidth={2} className="text-text-tertiary" />
            <span className="truncate">{client.email}</span>
          </a>
        )}
        {client.telephone && (
          <a
            href={`tel:${client.telephone}`}
            className="inline-flex items-center gap-1.5 text-text-secondary hover:text-primary-800"
          >
            <Phone size={13} strokeWidth={2} className="text-text-tertiary" />
            <span>{client.telephone}</span>
          </a>
        )}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          <Clock size={11} strokeWidth={2} /> Activité client
        </h3>
        {!activities ? (
          <Skeleton className="h-12 w-full" />
        ) : activities.length === 0 ? (
          <p className="text-[12px] italic text-text-tertiary">
            Aucune activité sur ce contact. Le portail client (à venir) remontera ici
            les connexions, déplacements de cartes et commentaires.
          </p>
        ) : (
          <ul className="space-y-2">
            {activities.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-start gap-2 text-[12px]">
                <span
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: activityColor(a.type) }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-text-primary">{a.titre ?? a.type}</p>
                  <p className="text-[11px] text-text-tertiary">
                    {new Date(a.createdAt).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {a.source && a.source !== 'MANUEL' && ` · ${a.source.toLowerCase()}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function activityColor(type: string): string {
  switch (type) {
    case 'APPEL':      return '#2a6bd8';
    case 'EMAIL':      return '#22177A';
    case 'MEETING':    return '#3b9a54';
    case 'NOTE':       return '#6e6a85';
    case 'TACHE':      return '#b47814';
    case 'TRANSCRIPT': return '#8e7cc3';
    default:           return '#c4c1d0';
  }
}

// ── Portal Access Card ───────────────────────────────
// Gère les accès portail client d'un mandat (créer / lister / révoquer)
// et affiche l'URL à envoyer au client.

interface PortalAccessRow {
  id: string;
  email: string;
  lastLoginAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  client: { id: string; nom: string; prenom: string | null };
}

function PortalAccessCard({
  mandatId,
  clientId,
  clientEmail,
}: {
  mandatId: string;
  clientId: string;
  clientEmail: string | null;
}) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState(clientEmail ?? '');
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: accesses } = useQuery({
    queryKey: ['portal-accesses', mandatId],
    queryFn: () => api.get<PortalAccessRow[]>(`/portal/mandat/${mandatId}/accesses`),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const password = generateRandomPassword();
      const created = await api.post<PortalAccessRow>('/portal/access', {
        mandatId,
        clientId,
        email: newEmail.trim(),
        password,
      });
      return { created, password };
    },
    onSuccess: ({ password }) => {
      setGeneratedPassword(password);
      qc.invalidateQueries({ queryKey: ['portal-accesses', mandatId] });
      toast('success', 'Accès portail créé');
    },
    onError: (err: any) => {
      toast('error', err?.data?.message || "Erreur lors de la création");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (accessId: string) => api.post(`/portal/access/${accessId}/revoke`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-accesses', mandatId] });
      toast('success', 'Accès révoqué');
    },
  });

  const portalUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/portail/login?m=${mandatId}`;

  const activeAccesses = (accesses ?? []).filter((a) => !a.revokedAt);

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Accès portail client</h2>
        <button
          onClick={() => { setModalOpen(true); setGeneratedPassword(null); }}
          className="rounded-md p-1 text-primary-800 hover:bg-primary-50"
          title="Créer un accès"
        >
          <Plus size={16} strokeWidth={2} />
        </button>
      </div>

      {activeAccesses.length === 0 ? (
        <p className="text-[13px] italic text-text-tertiary">
          Aucun accès actif. Crée un accès pour partager le kanban en lecture avec le client.
        </p>
      ) : (
        <ul className="space-y-2">
          {activeAccesses.map((a) => (
            <li key={a.id} className="flex items-start justify-between rounded-lg border border-neutral-100 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-text-primary">{a.email}</p>
                <p className="mt-0.5 text-[11px] text-text-tertiary">
                  {a.lastLoginAt
                    ? `Dernière connexion : ${new Date(a.lastLoginAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`
                    : 'Jamais connecté'}
                </p>
              </div>
              <button
                onClick={() => revokeMutation.mutate(a.id)}
                className="ml-2 shrink-0 rounded p-1 text-neutral-300 hover:bg-error-100 hover:text-error"
                title="Révoquer"
              >
                <X size={14} strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {activeAccesses.length > 0 && (
        <div className="mt-3 border-t border-neutral-100 pt-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            URL portail à envoyer
          </p>
          <div className="flex items-center gap-1 rounded-md bg-neutral-50 px-2 py-1.5">
            <code className="flex-1 truncate text-[11px] text-text-secondary">{portalUrl}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(portalUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="rounded p-1 text-primary-800 hover:bg-white"
              title="Copier"
            >
              {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2} />}
            </button>
          </div>
        </div>
      )}

      {/* Modal Création */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModalOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h3 style={{ fontFamily: "'Archivo Black', sans-serif", letterSpacing: '-0.01em' }} className="text-xl text-neutral-900">
              Nouvel accès portail
            </h3>
            <p className="mt-1 text-sm text-neutral-500">
              Un email + mot de passe pour permettre au contact client de voir le kanban en lecture.
            </p>

            {generatedPassword ? (
              <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
                <p className="text-sm font-semibold text-green-800">Accès créé — copie ces credentials, ils ne seront plus affichés.</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-green-700">URL</dt>
                    <dd className="mt-0.5 truncate rounded bg-white px-2 py-1 font-mono text-[12px] text-green-900">{portalUrl}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-green-700">Email</dt>
                    <dd className="mt-0.5 rounded bg-white px-2 py-1 font-mono text-[12px] text-green-900">{newEmail}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wider text-green-700">Mot de passe (à envoyer manuellement)</dt>
                    <dd className="mt-0.5 rounded bg-white px-2 py-1 font-mono text-[12px] text-green-900">{generatedPassword}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="primary"
                    onClick={() => {
                      const text = `Portail HumanUp\n\nURL : ${portalUrl}\nEmail : ${newEmail}\nMot de passe : ${generatedPassword}`;
                      navigator.clipboard.writeText(text);
                      toast('success', 'Credentials copiés');
                    }}
                  >
                    <Copy size={13} /> Copier les 3 lignes
                  </Button>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button variant="ghost" onClick={() => { setModalOpen(false); setGeneratedPassword(null); setNewEmail(clientEmail ?? ''); }}>
                    Fermer
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Email du contact
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="alice@acme.com"
                    className="w-full rounded-xl border-[1.5px] border-neutral-100 bg-white px-3 py-2 text-sm outline-none focus:border-primary-800"
                  />
                  <p className="mt-1 text-[11px] text-neutral-400">
                    Un mot de passe aléatoire sécurisé sera généré. Tu pourras le copier + envoyer au client manuellement (l'envoi email automatique arrive plus tard).
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
                  <Button
                    variant="primary"
                    onClick={() => createMutation.mutate()}
                    disabled={!newEmail.trim() || createMutation.isPending}
                  >
                    {createMutation.isPending ? 'Création…' : "Créer l'accès"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function generateRandomPassword(length = 12): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghjkmnpqrstuvwxyz';
  let out = '';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) out += alphabet[arr[i] % alphabet.length];
  return out;
}

// ── Contract Card + Modal ────────────────────────────

const FEE_FLOOR = 18;
const FEE_OPTIONS = [25, 24, 22, 20, 18] as const;
const PAYMENT_OPTIONS = [
  { value: 'reception', label: 'À réception' },
  { value: 'signature', label: 'À la signature' },
  { value: '30j',       label: '30 jours' },
  { value: '45j_fdm',   label: '45 jours FDM' },
  { value: '60j',       label: '60 jours' },
] as const;
const COUNTRY_OPTIONS = [
  { value: 'FR', label: '🇫🇷 France' },
  { value: 'GB', label: '🇬🇧 Royaume-Uni' },
  { value: 'HK', label: '🇭🇰 Hong Kong' },
  { value: 'US', label: '🇺🇸 États-Unis' },
  { value: 'BE', label: '🇧🇪 Belgique' },
  { value: 'CH', label: '🇨🇭 Suisse' },
] as const;

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  DRAFT:  'Brouillon',
  SENT:   'Envoyé pour signature',
  SIGNED: 'Signé',
  EXPIRED: 'Expiré',
};
const CONTRACT_STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  DRAFT:   { bg: '#f6f5fa', fg: '#4a4568' },
  SENT:    { bg: '#eef4fb', fg: '#2a6bd8' },
  SIGNED:  { bg: '#eaf3ec', fg: '#3b9a54' },
  EXPIRED: { bg: '#f9ece9', fg: '#b0361f' },
};

function ContractCard({ mandat }: { mandat: MandatDetail }) {
  const [modalOpen, setModalOpen] = useState(false);
  const qc = useQueryClient();
  const status = mandat.contractStatus ?? 'DRAFT';
  const tone = CONTRACT_STATUS_TONE[status];

  return (
    <>
      <Card>
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Contrat</h2>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: tone.bg, color: tone.fg }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.fg }} />
            {CONTRACT_STATUS_LABEL[status] || status}
          </span>
        </div>
        <dl className="mt-3 space-y-2.5 text-sm">
          <div className="flex items-baseline justify-between">
            <dt className="text-text-tertiary">Fee</dt>
            <dd className="font-semibold text-text-primary tabular-nums">
              {Number(mandat.feePourcentage)}%
              {Number(mandat.feePourcentage) < FEE_FLOOR && (
                <span
                  className="ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                  style={{ background: '#fbf3e7', color: '#b47814' }}
                >
                  Sous plancher
                </span>
              )}
            </dd>
          </div>
          {mandat.paymentTerms && (
            <div className="flex items-baseline justify-between">
              <dt className="text-text-tertiary">Conditions paiement</dt>
              <dd className="font-medium text-text-primary">
                {PAYMENT_OPTIONS.find((p) => p.value === mandat.paymentTerms)?.label ?? mandat.paymentTerms}
              </dd>
            </div>
          )}
          {mandat.applicableCountry && (
            <div className="flex items-baseline justify-between">
              <dt className="text-text-tertiary">Droit applicable</dt>
              <dd className="font-medium text-text-primary">
                {COUNTRY_OPTIONS.find((c) => c.value === mandat.applicableCountry)?.label ?? mandat.applicableCountry}
              </dd>
            </div>
          )}
          {mandat.contractSentAt && (
            <div className="flex items-baseline justify-between">
              <dt className="text-text-tertiary">Envoyé le</dt>
              <dd className="font-medium text-text-primary">
                {new Date(mandat.contractSentAt).toLocaleDateString('fr-FR', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </dd>
            </div>
          )}
        </dl>

        {status === 'DRAFT' && (
          <Button variant="primary" onClick={() => setModalOpen(true)} className="mt-4 w-full">
            <Sparkles size={14} /> Envoyer pour signature
          </Button>
        )}
        {status === 'SENT' && (
          <p className="mt-4 text-xs text-text-tertiary">
            En attente de signature du client. Le webhook signature (à brancher) marquera automatiquement en <strong>SIGNED</strong>.
          </p>
        )}
      </Card>

      <ContractSendModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        mandat={mandat}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['mandat', mandat.id] });
          setModalOpen(false);
        }}
      />
    </>
  );
}

function ContractSendModal({
  isOpen,
  onClose,
  mandat,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  mandat: MandatDetail;
  onSuccess: () => void;
}) {
  const [fee, setFee] = useState<number>(Number(mandat.feePourcentage) || 20);
  const [customFee, setCustomFee] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<string>(mandat.paymentTerms || '30j');
  const [country, setCountry] = useState<string>(mandat.applicableCountry || 'FR');
  const [approvalReason, setApprovalReason] = useState('');

  const effectiveFee = customFee.trim() ? Number(customFee) : fee;
  const needsApproval = effectiveFee > 0 && effectiveFee < FEE_FLOOR;

  // Query : y a-t-il déjà une approval APPROVED pour ce mandat au fee demandé ?
  const { data: pendingApprovals } = useQuery({
    queryKey: ['contract-approvals', mandat.id],
    queryFn: () => api.get<Array<{ id: string; status: string; feeRequested: string }>>('/contracts/pending'),
    enabled: isOpen && needsApproval,
  });
  const approvalMatch = pendingApprovals?.find(
    (a) => a.status === 'PENDING' && Number(a.feeRequested) === effectiveFee,
  );

  const requestApprovalMutation = useMutation({
    mutationFn: () =>
      api.post('/contracts/request-approval', {
        mandatId: mandat.id,
        feeRequested: effectiveFee,
        reason: approvalReason.trim(),
      }),
    onSuccess: () => {
      toast('success', 'Demande envoyée aux admins via Slack. On te ping dès validation.');
      onClose();
    },
    onError: (err: any) => {
      toast('error', err?.data?.message || 'Erreur lors de la demande');
    },
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      api.post(`/contracts/mandat/${mandat.id}/send`, {
        feePourcentage: effectiveFee,
        paymentTerms,
        applicableCountry: country,
      }),
    onSuccess: () => {
      toast('success', 'Contrat envoyé pour signature — trace posée sur la fiche.');
      onSuccess();
    },
    onError: (err: any) => {
      toast('error', err?.data?.message || "Erreur lors de l'envoi");
    },
  });

  return (
    <div>{isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
        >
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h3 style={{ fontFamily: "'Archivo Black', sans-serif", letterSpacing: '-0.01em' }} className="text-xl text-neutral-900">
                Envoyer le contrat
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                {mandat.entreprise.nom} — {mandat.titrePoste}
              </p>
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            {/* Fee */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Success fee (%)
              </label>
              <div className="flex flex-wrap gap-2">
                {FEE_OPTIONS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => { setFee(f); setCustomFee(''); }}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold tabular-nums ${
                      fee === f && !customFee
                        ? 'border-primary-800 bg-primary-50 text-primary-800'
                        : 'border-neutral-200 text-neutral-600 hover:border-primary-300'
                    }`}
                  >
                    {f}%
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={customFee}
                    onChange={(e) => setCustomFee(e.target.value)}
                    placeholder="Autre"
                    className="w-20 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-primary-800"
                  />
                  <span className="text-sm text-neutral-500">%</span>
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-neutral-400">
                Défaut 20% · plancher <strong>{FEE_FLOOR}%</strong> · sous ce plancher : validation admin requise.
              </p>
            </div>

            {/* Sous plancher : demande d'approbation */}
            {needsApproval && !approvalMatch && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-800">
                  Fee sous le plancher {FEE_FLOOR}% — validation admin requise
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  Explique pourquoi (contexte client, volume mandat, exception…). Les admins reçoivent une notif Slack.
                </p>
                <textarea
                  value={approvalReason}
                  onChange={(e) => setApprovalReason(e.target.value)}
                  rows={3}
                  placeholder="Ex : Client historique, 4 mandats déjà signés sur l'année. Il pousse pour 15%."
                  className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-amber-400 focus:border-amber-500"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    variant="primary"
                    onClick={() => requestApprovalMutation.mutate()}
                    disabled={!approvalReason.trim() || requestApprovalMutation.isPending}
                  >
                    Demander la validation
                  </Button>
                </div>
              </div>
            )}
            {needsApproval && approvalMatch && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                Demande en attente d'approbation admin — envoi bloqué jusqu'à validation.
              </div>
            )}

            {/* Conditions de paiement */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Conditions de paiement
              </label>
              <select
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-800"
              >
                {PAYMENT_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Droit applicable */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Droit applicable
              </label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-800"
              >
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-neutral-400">
                La clause « Litiges » du contrat sera adaptée au pays choisi.
              </p>
            </div>

            {/* Send */}
            <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
              <p className="text-[12px] text-neutral-400">
                Aucun provider de signature branché — cet envoi trace en base et log une activité sur la fiche.
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>Annuler</Button>
                <Button
                  variant="primary"
                  onClick={() => sendMutation.mutate()}
                  disabled={
                    sendMutation.isPending ||
                    !effectiveFee ||
                    !paymentTerms ||
                    !country ||
                    needsApproval  // sous plancher : bloque
                  }
                >
                  {sendMutation.isPending ? 'Envoi…' : 'Envoyer pour signature'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}</div>
  );
}

// ─── Stats bar cell (fiche mandat header) ──────────

function StatsCell({
  label, value, valueColor, foot,
}: {
  label: string;
  value: string;
  valueColor: string;
  foot?: string;
}) {
  return (
    <div style={{ flex: 1, padding: '12px 18px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#8A8699' }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Archivo Black', sans-serif",
          fontSize: 19,
          color: valueColor,
          marginTop: 5,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {foot && <div style={{ fontSize: 11, color: '#9A96AE', marginTop: 1 }}>{foot}</div>}
    </div>
  );
}

function StatsCellDivider() {
  return <div style={{ width: 1, background: 'rgba(34,23,122,0.08)' }} />;
}

// ═════════════════════════════════════════════════════════════════
// MOCK-FIDELITY BODY COMPONENTS (fiche mandat 3-col body)
// ═════════════════════════════════════════════════════════════════

// ── COL 1 · Le brief ─────────────────────────────────

function LeBriefCard({ mandat, onStartEdit }: { mandat: MandatDetail; onStartEdit: () => void }) {
  const skills: string[] = mandat.scorecard?.competencesCles?.map((c) => c.nom) ?? [];
  const localisation = mandat.localisation ?? '—';
  return (
    <div
      className="rise"
      style={{
        background: '#fff', border: '1px solid rgba(34,23,122,0.08)',
        borderRadius: 16, padding: '18px 20px', boxShadow: '0 1px 2px rgba(34,23,122,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 16, color: '#1A1533' }}>Le brief</div>
        <button
          onClick={onStartEdit}
          className="chip"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11.5, fontWeight: 700, color: '#22177A',
            background: '#F7F7EF', border: '1px solid rgba(34,23,122,0.12)',
            borderRadius: 9, padding: '5px 11px', cursor: 'pointer',
          }}
        >
          <Pencil size={12} /> Éditer
        </button>
      </div>

      <p style={{ fontSize: 14.5, lineHeight: 1.68, color: '#4A4568', marginTop: 12, whiteSpace: 'pre-wrap' }}>
        {mandat.description || 'Pas de brief renseigné. Clique sur Éditer pour ajouter la description du poste.'}
      </p>

      <div
        style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px',
          marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(34,23,122,0.07)',
        }}
      >
        <BriefField label="Localisation" value={localisation} />
        <BriefField label="Contrat" value="CDI · temps plein" />
        <BriefField label="Expérience" value="—" />
        <BriefField label="Télétravail" value={mandat.localisation?.toLowerCase().includes('remote') ? 'Oui' : '—'} />
      </div>

      {skills.length > 0 && (
        <>
          <div
            style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#8A8699', marginTop: 18,
            }}
          >
            Compétences clés
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 11 }}>
            {skills.map((s, i) => (
              <span
                key={i}
                style={{
                  fontSize: 12.5, fontWeight: 600, borderRadius: 999,
                  padding: '6px 12px', background: 'rgba(34,23,122,0.06)', color: '#22177A',
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </>
      )}

      {mandat.ficheDePoste && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            marginTop: 18, padding: '11px 13px',
            background: '#FCFCF5', border: '1px solid rgba(34,23,122,0.1)',
            borderRadius: 12, cursor: 'pointer',
          }}
        >
          <span
            style={{
              width: 38, height: 38, borderRadius: 10, background: '#F1EDF9',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <ClipboardList size={17} color="#8E7CC3" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1A1533' }}>Fiche de poste</div>
            <div style={{ fontSize: 12, color: '#9A96AE' }}>Texte importé · Brief IA</div>
          </div>
        </div>
      )}
    </div>
  );
}

function BriefField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9A96AE' }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1A1533', marginTop: 3 }}>{value}</div>
    </div>
  );
}

// ── COL 1 · Process de recrutement ───────────────────

function ProcessRecrutementCard({ mandat, onOpenKanban }: { mandat: MandatDetail; onOpenKanban: () => void }) {
  const stageDefs: Array<{ key: string; label: string; color: string }> = [
    { key: 'SOURCING',         label: 'Sourcing',        color: '#8E7CC3' },
    { key: 'CONTACTE',         label: 'Contacté',        color: '#3B6FE0' },
    { key: 'ENTRETIEN_1',      label: 'Entretien 1',     color: '#22177A' },
    { key: 'ENVOYE_CLIENT',    label: 'Envoyé client',   color: '#E08A2B' },
    { key: 'ENTRETIEN_CLIENT', label: 'Entretien client', color: '#C9A227' },
    { key: 'OFFRE',            label: 'Offre',           color: '#3B9A54' },
    { key: 'PLACE',            label: 'Placé',           color: '#2C9A47' },
  ];
  const counts: Record<string, number> = {};
  for (const c of mandat.candidatures) counts[c.stage] = (counts[c.stage] ?? 0) + 1;
  const total = mandat.candidatures.length;
  const max = Math.max(1, ...stageDefs.map((s) => counts[s.key] ?? 0));

  return (
    <div
      className="rise"
      style={{
        background: '#fff', border: '1px solid rgba(34,23,122,0.08)',
        borderRadius: 16, padding: '18px 20px', boxShadow: '0 1px 2px rgba(34,23,122,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <a
          onClick={onOpenKanban}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            textDecoration: 'none', fontFamily: "'Archivo Black', sans-serif",
            fontSize: 15, color: '#1A1533',
          }}
        >
          Process de recrutement
          <ArrowLeft size={14} strokeWidth={2.4} color="#22177A" style={{ transform: 'rotate(180deg)' }} />
        </a>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#9A96AE' }}>{total} candidat{total > 1 ? 's' : ''}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 15 }}>
        {stageDefs.map((s) => {
          const c = counts[s.key] ?? 0;
          const pct = Math.round((c / max) * 100);
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13, color: '#4A4568' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{s.label}</span>
                  </span>
                  <strong style={{ color: s.color, flexShrink: 0 }}>{c}</strong>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: 'rgba(34,23,122,0.08)', marginTop: 6 }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: s.color, transition: 'width 0.6s cubic-bezier(.16,1,.3,1)' }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── COL 2 · Notes internes ───────────────────────────

function NotesInternesCard({ mandat, onSave, saving }: { mandat: MandatDetail; onSave: (notes: string) => void; saving: boolean }) {
  const [draft, setDraft] = useState(mandat.notes ?? '');
  useEffect(() => {
    setDraft(mandat.notes ?? '');
  }, [mandat.notes]);
  const dirty = draft !== (mandat.notes ?? '');
  return (
    <div
      className="rise"
      style={{
        background: '#fff', border: '1px solid rgba(34,23,122,0.08)',
        borderRadius: 16, padding: '18px 20px', boxShadow: '0 1px 2px rgba(34,23,122,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Pencil size={15} color="#22177A" strokeWidth={2} />
        <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 15, color: '#1A1533' }}>Notes internes</span>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Ajoutez une note sur ce mandat : contexte, exigences du client, points d'attention…"
        style={{
          width: '100%', minHeight: 110, resize: 'vertical',
          marginTop: 12, fontFamily: "'Manrope', sans-serif",
          fontSize: 13.5, lineHeight: 1.55, padding: '12px 14px',
          borderRadius: 12, border: '1.5px solid rgba(34,23,122,0.14)',
          background: '#FCFCF5', color: '#1A1533', outline: 'none',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10 }}>
        <span style={{ fontSize: 11.5, color: '#9A96AE' }}>Visible par l'équipe HumanUp uniquement.</span>
        <button
          onClick={() => onSave(draft)}
          disabled={saving || !dirty}
          style={{
            fontFamily: "'Manrope', sans-serif", fontWeight: 700, fontSize: 13,
            background: dirty ? '#22177A' : 'rgba(34,23,122,0.35)',
            color: '#E6E9AF', border: 'none', borderRadius: 10,
            padding: '9px 18px', cursor: dirty && !saving ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}

// ── COL 2 · Contact client ───────────────────────────

function ContactClientCardMock({
  client, entrepriseNom, onOpen,
}: {
  client: { id: string; nom: string; prenom: string | null; email: string | null; telephone: string | null };
  entrepriseNom: string;
  onOpen: () => void;
}) {
  const initials = `${client.prenom?.[0] ?? ''}${client.nom?.[0] ?? ''}`.toUpperCase() || '·';
  return (
    <a
      className="rise clk"
      onClick={onOpen}
      style={{
        background: '#fff', border: '1px solid rgba(34,23,122,0.08)',
        borderRadius: 16, padding: '18px 20px', boxShadow: '0 1px 2px rgba(34,23,122,0.04)',
        textDecoration: 'none', display: 'block', cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 15, color: '#1A1533' }}>Contact client</div>
        <ArrowLeft size={15} strokeWidth={2.4} color="#22177A" style={{ transform: 'rotate(180deg)' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
        <span
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: '#8E7CC3', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Archivo Black', sans-serif", fontSize: 14,
          }}
        >
          {initials}
        </span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1533' }}>
            {[client.prenom, client.nom].filter(Boolean).join(' ')}
          </div>
          <div style={{ fontSize: 12.5, color: '#8A8699' }}>{entrepriseNom}</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(34,23,122,0.07)' }}>
        {client.email && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: '#4A4568' }}>
            <MailIcon size={14} color="#22177A" strokeWidth={2} />
            {client.email}
          </span>
        )}
        {client.telephone && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: '#4A4568' }}>
            <Phone size={14} color="#22177A" strokeWidth={2} />
            {client.telephone}
          </span>
        )}
        {!client.email && !client.telephone && (
          <span style={{ fontSize: 12.5, color: '#9A96AE' }}>Aucun contact renseigné</span>
        )}
      </div>
    </a>
  );
}

// ── COL 3 · Activité interne (timeline verticale) ────

interface InternalActivity {
  id: string;
  type: string;
  titre: string | null;
  contenu: string | null;
  source: string;
  createdAt: string;
  auteur?: { prenom: string | null; nom: string } | null;
}

function ActiviteInterneMockCard({ mandatId }: { mandatId: string }) {
  const { data } = useQuery({
    queryKey: ['activites', 'MANDAT', mandatId, 'internal'],
    queryFn: () => api.get<{ data: InternalActivity[]; meta?: unknown }>(`/activites?entiteType=MANDAT&entiteId=${mandatId}&perPage=8`),
  });
  const items = data?.data ?? [];

  const dotColor = (type: string): string => {
    if (type.startsWith('EMAIL')) return '#3B6FE0';
    if (type.startsWith('CALL') || type.includes('APPEL')) return '#22177A';
    if (type.includes('CREATED') || type.includes('CREE')) return '#3B9A54';
    if (type.includes('DEPLACE') || type.includes('MOVE') || type.includes('STAGE')) return '#E08A2B';
    return '#8E7CC3';
  };

  const rel = (t: string): string => {
    const then = new Date(t).getTime();
    const now = Date.now();
    const s = Math.floor((now - then) / 1000);
    if (s < 60) return 'à l’instant';
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    const d = new Date(then);
    return `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
  };

  return (
    <div
      className="rise"
      style={{
        background: '#fff', border: '1px solid rgba(34,23,122,0.08)',
        borderRadius: 16, padding: '18px 20px', boxShadow: '0 1px 2px rgba(34,23,122,0.04)',
      }}
    >
      <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 15, color: '#1A1533' }}>Activité interne</div>
      <div style={{ marginTop: 15, display: 'flex', flexDirection: 'column' }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#9A96AE' }}>Aucune activité pour le moment.</div>
        ) : (
          items.map((ev, i) => {
            const isLast = i === items.length - 1;
            const authorName = ev.auteur ? [ev.auteur.prenom, ev.auteur.nom].filter(Boolean).join(' ') : null;
            return (
              <div
                key={ev.id}
                style={{
                  display: 'flex', gap: 14,
                  paddingBottom: isLast ? 0 : 15,
                  borderLeft: isLast ? 'none' : '2px solid rgba(34,23,122,0.12)',
                  marginLeft: 5, paddingLeft: 16, position: 'relative',
                }}
              >
                <span
                  style={{
                    position: 'absolute', left: -6, top: 2,
                    width: 10, height: 10, borderRadius: '50%',
                    background: dotColor(ev.type),
                  }}
                />
                <div>
                  <div style={{ fontSize: 12.5, color: '#1A1533' }}>
                    {ev.titre || ev.type}
                  </div>
                  <div style={{ fontSize: 11, color: '#9A96AE', marginTop: 2 }}>
                    {rel(ev.createdAt)}
                    {authorName ? ` · ${authorName}` : ''}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
