import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Mail, Phone, MapPin, Linkedin, Briefcase, Building2,
  Calendar, Send, Pencil, Trash2, Save, X, FileText, Loader2,
  Upload, Copy, Check, Sparkles, ChevronDown, ChevronUp, Bot,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input, { Textarea } from '../../components/ui/Input';
import Skeleton, { SkeletonCard } from '../../components/ui/Skeleton';
import Modal from '../../components/ui/Modal';
import EmailComposer from '../../components/email/EmailComposer';
import ScheduleMeeting from '../../components/calendar/ScheduleMeeting';
import ActivityJournal from '../../components/activity/ActivityJournal';
import Avatar from '../../components/ui/Avatar';
import DeleteConfirmModal from '../../components/ui/DeleteConfirmModal';
import CallBriefPanel from '../../components/ai/CallBriefPanel';
import { toast } from '../../components/ui/Toast';

interface Candidature {
  id: string;
  stage: string;
  mandat: {
    id: string;
    titrePoste: string;
    entreprise: { id: string; nom: string };
    statut: string;
  };
  createdAt: string;
}

interface CandidatDetail {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  linkedinUrl: string | null;
  photoUrl: string | null;
  cvUrl: string | null;
  posteActuel: string | null;
  entrepriseActuelle: string | null;
  localisation: string | null;
  salaireActuel: number | null;
  salaireSouhaite: number | null;
  disponibilite: string | null;
  mobilite: string | null;
  source: string | null;
  tags: string[];
  notes: string | null;
  consentementRgpd: boolean;
  candidatures: Candidature[];
  // AI fields
  aiPitchShort: string | null;
  aiPitchLong: string | null;
  aiSellingPoints: string[] | null;
  aiIdealFor: string | null;
  aiAnonymizedProfile: {
    title: string;
    summary: string;
    bullet_points: string[];
  } | null;
  aiParsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EditForm {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  posteActuel: string;
  entrepriseActuelle: string;
  localisation: string;
  linkedinUrl: string;
  salaireActuel: string;
  salaireSouhaite: string;
  disponibilite: string;
  mobilite: string;
  tags: string;
  notes: string;
}

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

const detailStagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const detailItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
};

function buildEditForm(candidat: CandidatDetail): EditForm {
  return {
    nom: candidat.nom || '',
    prenom: candidat.prenom || '',
    email: candidat.email || '',
    telephone: candidat.telephone || '',
    posteActuel: candidat.posteActuel || '',
    entrepriseActuelle: candidat.entrepriseActuelle || '',
    localisation: candidat.localisation || '',
    linkedinUrl: candidat.linkedinUrl || '',
    salaireActuel: candidat.salaireActuel ? String(candidat.salaireActuel) : '',
    salaireSouhaite: candidat.salaireSouhaite ? String(candidat.salaireSouhaite) : '',
    disponibilite: candidat.disponibilite || '',
    mobilite: candidat.mobilite || '',
    tags: candidat.tags.join(', '),
    notes: candidat.notes || '',
  };
}

export default function CandidatDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [showScheduleMeeting, setShowScheduleMeeting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCallBrief, setShowCallBrief] = useState(false);

  // CV upload modal state
  const [showCvUploadModal, setShowCvUploadModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const cvFileInputRef = useRef<HTMLInputElement>(null);

  // Pitch IA section state
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showAnonymized, setShowAnonymized] = useState(false);

  const { data: candidat, isLoading, isError } = useQuery({
    queryKey: ['candidat', id],
    queryFn: () => api.get<CandidatDetail>(`/candidats/${id}`),
    enabled: !!id,
    retry: (failureCount, error: any) => {
      if (error?.status === 404) return false;
      return failureCount < 2;
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.put<CandidatDetail>(`/candidats/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidat', id] });
      toast('success', 'Modifications enregistrées');
      setIsEditing(false);
      setEditForm(null);
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de la mise à jour');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/candidats/${id}`),
    onSuccess: () => {
      toast('success', 'Supprimé avec succès');
      navigate('/candidats');
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de la suppression');
    },
  });

  // CV upload mutation
  const cvUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('candidatId', id!);

      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/ai/update-from-cv', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Erreur ${response.status}`);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidat', id] });
      toast('success', 'CV analysé et candidat mis à jour !');
      setShowCvUploadModal(false);
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de l\'analyse du CV');
    },
  });

  const handleCvFileUpload = useCallback((file: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast('error', 'Seuls les fichiers PDF sont acceptés.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast('error', 'Le fichier est trop volumineux. Taille maximale : 10 Mo.');
      return;
    }
    cvUploadMutation.mutate(file);
  }, [cvUploadMutation]);

  const handleCvDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleCvDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleCvDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleCvFileUpload(file);
  }, [handleCvFileUpload]);

  const handleCvFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCvFileUpload(file);
    e.target.value = '';
  }, [handleCvFileUpload]);

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast('success', 'Copié dans le presse-papiers');
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast('error', 'Erreur lors de la copie');
    }
  };

  const handleStartEdit = () => {
    if (candidat) {
      setEditForm(buildEditForm(candidat));
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm(null);
  };

  const handleSave = () => {
    if (!editForm) return;
    const payload: Record<string, unknown> = {};
    payload.nom = editForm.nom.trim() || undefined;
    if (editForm.prenom.trim()) payload.prenom = editForm.prenom.trim();
    else payload.prenom = null;
    if (editForm.email.trim()) payload.email = editForm.email.trim();
    else payload.email = null;
    if (editForm.telephone.trim()) payload.telephone = editForm.telephone.trim();
    else payload.telephone = null;
    if (editForm.posteActuel.trim()) payload.posteActuel = editForm.posteActuel.trim();
    else payload.posteActuel = null;
    if (editForm.entrepriseActuelle.trim()) payload.entrepriseActuelle = editForm.entrepriseActuelle.trim();
    else payload.entrepriseActuelle = null;
    if (editForm.localisation.trim()) payload.localisation = editForm.localisation.trim();
    else payload.localisation = null;
    if (editForm.linkedinUrl.trim()) payload.linkedinUrl = editForm.linkedinUrl.trim();
    else payload.linkedinUrl = null;
    if (editForm.salaireActuel) payload.salaireActuel = parseInt(editForm.salaireActuel, 10);
    else payload.salaireActuel = null;
    if (editForm.salaireSouhaite) payload.salaireSouhaite = parseInt(editForm.salaireSouhaite, 10);
    else payload.salaireSouhaite = null;
    if (editForm.disponibilite.trim()) payload.disponibilite = editForm.disponibilite.trim();
    else payload.disponibilite = null;
    if (editForm.mobilite.trim()) payload.mobilite = editForm.mobilite.trim();
    else payload.mobilite = null;
    payload.tags = editForm.tags
      ? editForm.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    if (editForm.notes.trim()) payload.notes = editForm.notes.trim();
    else payload.notes = null;

    updateMutation.mutate(payload);
  };

  const setField = (field: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setEditForm((prev) => prev ? { ...prev, [field]: e.target.value } : prev);
  };

  // Check if AI pitch data exists
  const hasAiPitch = candidat && (candidat.aiPitchShort || candidat.aiPitchLong);

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
          </div>
        </div>
      </div>
    );
  }

  if (!candidat || isError) {
    return (
      <div className="text-center py-16">
        <p className="text-text-secondary">Candidat introuvable.</p>
        <Button variant="ghost" onClick={() => navigate('/candidats')} className="mt-4">
          Retour aux candidats
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <Avatar src={candidat.photoUrl} nom={candidat.nom} prenom={candidat.prenom} size="lg" />
            {`${candidat.prenom || ''} ${candidat.nom}`.trim()}
          </span>
        }
        breadcrumbs={[
          { label: 'Candidats', href: '/candidats' },
          { label: `${candidat.prenom || ''} ${candidat.nom}`.trim() },
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
                <Button variant="secondary" size="sm" onClick={() => setShowCvUploadModal(true)}>
                  <Upload size={14} /> Mettre à jour depuis un CV
                </Button>
                <Button variant="secondary" size="sm" onClick={handleStartEdit}>
                  <Pencil size={14} /> Modifier
                </Button>
                <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
                  <Trash2 size={14} /> Supprimer
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowEmailComposer(true)}>
                  <Send size={14} /> Envoyer un email
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowScheduleMeeting(true)}>
                  <Calendar size={14} /> Planifier un RDV
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowCallBrief(true)}>
                  <Bot size={14} /> Brief pre-appel
                </Button>
                <Button variant="ghost" onClick={() => navigate('/candidats')}>
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
            <h2 className="mb-4 text-lg font-semibold text-text-primary">Informations</h2>
            {isEditing && editForm ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Nom" value={editForm.nom} onChange={setField('nom')} placeholder="Nom" />
                <Input label="Prénom" value={editForm.prenom} onChange={setField('prenom')} placeholder="Prénom" />
                <Input label="Email" type="email" value={editForm.email} onChange={setField('email')} placeholder="email@exemple.com" />
                <Input label="Téléphone" value={editForm.telephone} onChange={setField('telephone')} placeholder="+33 6 12 34 56 78" />
                <Input label="Poste actuel" value={editForm.posteActuel} onChange={setField('posteActuel')} placeholder="Poste actuel" />
                <Input label="Entreprise actuelle" value={editForm.entrepriseActuelle} onChange={setField('entrepriseActuelle')} placeholder="Entreprise" />
                <Input label="Localisation" value={editForm.localisation} onChange={setField('localisation')} placeholder="Paris, France" />
                <Input label="LinkedIn" value={editForm.linkedinUrl} onChange={setField('linkedinUrl')} placeholder="https://linkedin.com/in/..." />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {candidat.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail size={14} className="text-text-tertiary" />
                    <a href={`mailto:${candidat.email}`} className="text-accent hover:underline">
                      {candidat.email}
                    </a>
                  </div>
                )}
                {candidat.telephone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone size={14} className="text-text-tertiary" />
                    <span className="text-text-primary">{candidat.telephone}</span>
                  </div>
                )}
                {candidat.localisation && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin size={14} className="text-text-tertiary" />
                    <span className="text-text-primary">{candidat.localisation}</span>
                  </div>
                )}
                {candidat.linkedinUrl && (
                  <div className="flex items-center gap-2 text-sm">
                    <Linkedin size={14} className="text-text-tertiary" />
                    <a href={candidat.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      LinkedIn
                    </a>
                  </div>
                )}
                {candidat.posteActuel && (
                  <div className="flex items-center gap-2 text-sm">
                    <Briefcase size={14} className="text-text-tertiary" />
                    <span className="text-text-primary">{candidat.posteActuel}</span>
                  </div>
                )}
                {candidat.entrepriseActuelle && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 size={14} className="text-text-tertiary" />
                    <span className="text-text-primary">{candidat.entrepriseActuelle}</span>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Pitch IA Section */}
          <AnimatePresence>
            {hasAiPitch && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ type: 'spring' as const, stiffness: 260, damping: 24 }}
              >
                <Card>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                      <Sparkles size={18} className="text-primary-500" />
                      Pitch IA
                    </h2>
                    <div className="flex items-center gap-2">
                      {candidat.aiParsedAt && (
                        <span className="text-xs text-text-tertiary">
                          Analysé le {new Date(candidat.aiParsedAt).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const fullPitch = [
                            candidat.aiPitchLong || candidat.aiPitchShort || '',
                            '',
                            ...(candidat.aiSellingPoints || []).map((p, i) => `${i + 1}. ${p}`),
                            '',
                            candidat.aiIdealFor ? `Idéal pour : ${candidat.aiIdealFor}` : '',
                          ].filter(Boolean).join('\n');
                          copyToClipboard(fullPitch, 'fullPitch');
                        }}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 transition-all"
                      >
                        {copiedField === 'fullPitch' ? <Check size={12} /> : <Copy size={12} />}
                        {copiedField === 'fullPitch' ? 'Copié !' : 'Copier le pitch'}
                      </button>
                    </div>
                  </div>

                  {/* Pitch Short */}
                  {candidat.aiPitchShort && (
                    <div className="mb-4">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-xs font-medium text-text-tertiary">Pitch court</p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(candidat.aiPitchShort!, 'pitchShort')}
                          className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary transition-all"
                        >
                          {copiedField === 'pitchShort' ? <Check size={10} /> : <Copy size={10} />}
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap rounded-lg bg-primary-50/50 px-3 py-2 text-sm text-text-primary">
                        {candidat.aiPitchShort}
                      </p>
                    </div>
                  )}

                  {/* Pitch Long */}
                  {candidat.aiPitchLong && (
                    <div className="mb-4">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-xs font-medium text-text-tertiary">Pitch commercial</p>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(candidat.aiPitchLong!, 'pitchLong')}
                          className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary transition-all"
                        >
                          {copiedField === 'pitchLong' ? <Check size={10} /> : <Copy size={10} />}
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap rounded-lg bg-primary-50/50 px-3 py-2 text-sm text-text-primary">
                        {candidat.aiPitchLong}
                      </p>
                    </div>
                  )}

                  {/* Key Selling Points */}
                  {candidat.aiSellingPoints && candidat.aiSellingPoints.length > 0 && (
                    <div className="mb-4">
                      <p className="mb-2 text-xs font-medium text-text-tertiary">Points forts</p>
                      <div className="space-y-1.5">
                        {candidat.aiSellingPoints.map((point, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-600">
                              {idx + 1}
                            </span>
                            <span className="text-sm text-text-primary">{point}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Ideal For */}
                  {candidat.aiIdealFor && (
                    <div className="mb-4">
                      <p className="mb-1 text-xs font-medium text-text-tertiary">Idéal pour</p>
                      <p className="text-sm font-medium text-primary-600">{candidat.aiIdealFor}</p>
                    </div>
                  )}

                  {/* Anonymized Profile (collapsible) */}
                  {candidat.aiAnonymizedProfile && (
                    <div className="border-t border-neutral-100 pt-3">
                      <button
                        type="button"
                        onClick={() => setShowAnonymized(!showAnonymized)}
                        className="flex w-full items-center justify-between text-left"
                      >
                        <p className="text-xs font-medium text-text-tertiary">Profil anonymisé</p>
                        {showAnonymized ? (
                          <ChevronUp size={14} className="text-text-tertiary" />
                        ) : (
                          <ChevronDown size={14} className="text-text-tertiary" />
                        )}
                      </button>

                      <AnimatePresence>
                        {showAnonymized && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-3 space-y-2 rounded-lg bg-neutral-50 p-3">
                              <p className="text-sm font-semibold text-text-primary">
                                {candidat.aiAnonymizedProfile.title}
                              </p>
                              <p className="whitespace-pre-wrap text-sm text-text-secondary">
                                {candidat.aiAnonymizedProfile.summary}
                              </p>
                              {candidat.aiAnonymizedProfile.bullet_points?.length > 0 && (
                                <ul className="space-y-1">
                                  {candidat.aiAnonymizedProfile.bullet_points.map((pt, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-sm text-text-primary">
                                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
                                      {pt}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  const text = [
                                    candidat.aiAnonymizedProfile!.title,
                                    '',
                                    candidat.aiAnonymizedProfile!.summary,
                                    '',
                                    ...(candidat.aiAnonymizedProfile!.bullet_points || []).map((p) => `- ${p}`),
                                  ].join('\n');
                                  copyToClipboard(text, 'anonymized');
                                }}
                                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-tertiary hover:bg-neutral-100 hover:text-text-primary transition-all"
                              >
                                {copiedField === 'anonymized' ? <Check size={10} /> : <Copy size={10} />}
                                {copiedField === 'anonymized' ? 'Copié !' : 'Copier le profil anonymisé'}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Utiliser dans Adchase link */}
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/adchase?candidatId=${candidat.id}`)}
                    >
                      <Send size={14} /> Utiliser dans Adchase
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <Card>
            <h2 className="mb-4 text-lg font-semibold text-text-primary">Candidatures</h2>
            {candidat.candidatures.length === 0 ? (
              <p className="text-sm text-text-secondary">Aucune candidature pour le moment.</p>
            ) : (
              <div className="space-y-3">
                {candidat.candidatures.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-primary-50/30 cursor-pointer"
                    onClick={() => navigate(`/mandats/${c.mandat.id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium text-text-primary">{c.mandat.titrePoste}</p>
                      <p className="text-xs text-text-secondary">{c.mandat.entreprise.nom}</p>
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
            {isEditing && editForm ? (
              <div className="space-y-4">
                <Input label="Salaire actuel (EUR)" type="number" value={editForm.salaireActuel} onChange={setField('salaireActuel')} placeholder="55000" />
                <Input label="Salaire souhaité (EUR)" type="number" value={editForm.salaireSouhaite} onChange={setField('salaireSouhaite')} placeholder="65000" />
                <Input label="Disponibilité" value={editForm.disponibilite} onChange={setField('disponibilite')} placeholder="Immédiate, 1 mois..." />
                <Input label="Mobilité" value={editForm.mobilite} onChange={setField('mobilite')} placeholder="Île-de-France, Remote..." />
              </div>
            ) : (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-text-tertiary">Salaire actuel</dt>
                  <dd className="font-medium text-text-primary">{formatSalary(candidat.salaireActuel)}</dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">Salaire souhaité</dt>
                  <dd className="font-medium text-text-primary">{formatSalary(candidat.salaireSouhaite)}</dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">Disponibilité</dt>
                  <dd className="font-medium text-text-primary">{candidat.disponibilite || '\u2014'}</dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">Mobilité</dt>
                  <dd className="font-medium text-text-primary">{candidat.mobilite || '\u2014'}</dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">Source</dt>
                  <dd>{candidat.source ? <Badge>{candidat.source}</Badge> : '\u2014'}</dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">RGPD</dt>
                  <dd>
                    <Badge variant={candidat.consentementRgpd ? 'success' : 'warning'}>
                      {candidat.consentementRgpd ? 'Consentement donné' : 'Non consenti'}
                    </Badge>
                  </dd>
                </div>
              </dl>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">Tags</h2>
            {isEditing && editForm ? (
              <Input
                label="Tags (séparés par des virgules)"
                value={editForm.tags}
                onChange={setField('tags')}
                placeholder="React, Node.js, Senior..."
              />
            ) : candidat.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {candidat.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-secondary">Aucun tag.</p>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">Notes</h2>
            {isEditing && editForm ? (
              <Textarea
                value={editForm.notes}
                onChange={setField('notes')}
                placeholder="Notes sur le candidat..."
              />
            ) : candidat.notes ? (
              <p className="whitespace-pre-wrap text-sm text-text-secondary">{candidat.notes}</p>
            ) : (
              <p className="text-sm text-text-secondary">Aucune note.</p>
            )}
          </Card>
        </motion.div>
      </motion.div>

      <div className="mt-8">
        <ActivityJournal entiteType="CANDIDAT" entiteId={candidat.id} />
      </div>

      <EmailComposer
        isOpen={showEmailComposer}
        onClose={() => setShowEmailComposer(false)}
        defaultTo={candidat.email || ''}
        defaultSubject=""
        entiteType="candidat"
        entiteId={candidat.id}
        candidatId={candidat.id}
      />

      <ScheduleMeeting
        isOpen={showScheduleMeeting}
        onClose={() => setShowScheduleMeeting(false)}
        defaultTitle={`Entretien - ${candidat.prenom || ''} ${candidat.nom}`.trim()}
        defaultParticipants={candidat.email ? [candidat.email] : []}
        entiteType="candidat"
        entiteId={candidat.id}
      />

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => deleteMutation.mutate()}
        entityName={`le candidat ${candidat.prenom || ''} ${candidat.nom}`.trim()}
        isLoading={deleteMutation.isPending}
      />

      {/* CV Upload Modal */}
      <Modal
        isOpen={showCvUploadModal}
        onClose={() => !cvUploadMutation.isPending && setShowCvUploadModal(false)}
        title="Mettre à jour depuis un CV"
        size="md"
      >
        <div
          onDragOver={handleCvDragOver}
          onDragLeave={handleCvDragLeave}
          onDrop={handleCvDrop}
          onClick={() => !cvUploadMutation.isPending && cvFileInputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300 ${
            isDragging
              ? 'border-primary-500 bg-primary-50/50 scale-[1.01]'
              : cvUploadMutation.isPending
                ? 'border-primary-300 bg-primary-50/30'
                : 'border-neutral-200 bg-white hover:border-primary-300 hover:bg-primary-50/20'
          } p-8`}
        >
          <input
            ref={cvFileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleCvFileInputChange}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-3 text-center">
            {cvUploadMutation.isPending ? (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100">
                  <Loader2 size={28} className="animate-spin text-primary-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-primary-600">Analyse du CV en cours...</p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    L'IA extrait les informations et met à jour la fiche candidat
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50">
                  <FileText size={28} className="text-primary-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    <span className="text-primary-500">Déposez un CV ici</span> (PDF)
                  </p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    L'IA analysera le CV et mettra à jour les informations du candidat ainsi que le pitch commercial.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="info" size="sm">PDF</Badge>
                  <span className="text-xs text-text-tertiary">Max 10 Mo</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCvUploadModal(false)}
            disabled={cvUploadMutation.isPending}
          >
            Fermer
          </Button>
        </div>
      </Modal>

      <CallBriefPanel
        entityType="CANDIDAT"
        entityId={candidat.id}
        entityName={`${candidat.prenom || ''} ${candidat.nom}`.trim()}
        isOpen={showCallBrief}
        onClose={() => setShowCallBrief(false)}
      />
    </div>
  );
}
