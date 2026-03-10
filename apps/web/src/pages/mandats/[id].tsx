import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, Building2, User, MapPin, Calendar, Euro, LayoutGrid, Pencil, Trash2, Save, X, Link2, Check, Megaphone, Sparkles, Loader2, ChevronDown, ChevronUp, Plus, AlertTriangle, ClipboardList, MessageSquare, Target, Copy, Zap, Star } from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input, { Textarea } from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Skeleton, { SkeletonCard } from '../../components/ui/Skeleton';
import ActivityJournal from '../../components/activity/ActivityJournal';
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
  createdAt: string;
  updatedAt: string;
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

const stageBadgeVariant: Record<string, 'sourcing' | 'contacte' | 'entretien1' | 'entretienClient' | 'offre' | 'place' | 'refuse'> = {
  SOURCING: 'sourcing',
  CONTACTE: 'contacte',
  ENTRETIEN_1: 'entretien1',
  ENTRETIEN_CLIENT: 'entretienClient',
  OFFRE: 'offre',
  PLACE: 'place',
  REFUSE: 'refuse',
};

const stageLabels: Record<string, string> = {
  SOURCING: 'Sourcing',
  CONTACTE: 'Contacté',
  ENTRETIEN_1: 'Entretien 1',
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

  return (
    <div>
      <PageHeader
        title={mandat.titrePoste}
        breadcrumbs={[
          { label: 'Mandats', href: '/mandats' },
          { label: mandat.titrePoste },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button variant="primary" size="sm" onClick={handleSave} loading={updateMutation.isPending}>
                  <Save size={14} /> Enregistrer
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCancelEdit} disabled={updateMutation.isPending}>
                  <X size={14} /> Annuler
                </Button>
              </>
            ) : (
              <>
                <Badge variant={statutVariant[mandat.statut]} className="text-sm">
                  {statutLabels[mandat.statut]}
                </Badge>
                {bookingSettings?.isActive && bookingSettings?.slug && mandat.slug && (
                  <Button variant="secondary" size="sm" onClick={handleCopyBookingLink}>
                    {bookingCopied ? <Check size={14} className="text-green-500" /> : <Link2 size={14} />}
                    {bookingCopied ? 'Copie !' : 'Lien booking'}
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => navigate(`/job-board/new?mandatId=${id}`)}>
                  <Megaphone size={14} /> Job Board
                </Button>
                <Button variant="secondary" size="sm" onClick={handleStartEdit}>
                  <Pencil size={14} /> Modifier
                </Button>
                <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
                  <Trash2 size={14} /> Supprimer
                </Button>
                <Button variant="secondary" onClick={() => navigate(`/mandats/${id}/kanban`)}>
                  <LayoutGrid size={16} /> Vue Kanban
                </Button>
                <Button variant="ghost" onClick={() => navigate('/mandats')}>
                  <ArrowLeft size={16} /> Retour
                </Button>
              </>
            )}
          </div>
        }
      />

      <motion.div className="grid grid-cols-1 gap-6 lg:grid-cols-3" variants={detailStagger} initial="hidden" animate="show">
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
            <h2 className="mb-4 text-lg font-semibold text-text-primary">
              Candidatures ({mandat.candidatures.length})
            </h2>
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
