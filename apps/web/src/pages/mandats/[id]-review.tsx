import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, ArrowUp, ArrowDown,
  ChevronLeft, X, ThumbsUp, Clock, Eye,
  Briefcase, MapPin, Mail, Phone, Star,
  Keyboard, Zap, Users,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { toast } from '../../components/ui/Toast';
import PageHeader from '../../components/ui/PageHeader';

interface Candidature {
  id: string;
  stage: string;
  candidat: {
    id: string;
    nom: string;
    prenom: string | null;
    email: string | null;
    telephone: string | null;
    posteActuel: string | null;
    entrepriseActuelle: string | null;
    localisation: string | null;
    linkedinUrl: string | null;
    tags: string[];
    competences: string[];
    salaireActuel: number | null;
    salaireVise: number | null;
    disponibilite: string | null;
    experiences: Array<{
      id: string;
      titre: string | null;
      entreprise: string | null;
      dateDebut: string | null;
      dateFin: string | null;
    }>;
  };
  createdAt: string;
}

interface MandatInfo {
  id: string;
  titrePoste: string;
  entreprise?: { nom: string } | null;
}

const REVIEW_STAGES = {
  REJECT: 'REFUSE',
  SHORTLIST: 'SHORTLIST',
  MAYBE: 'SOURCING', // keep in current stage
};

const swipeVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 600 : -600,
    opacity: 0,
    scale: 0.8,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 30 },
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -600 : 600,
    opacity: 0,
    scale: 0.8,
    transition: { duration: 0.2 },
  }),
};

export default function FastReviewPage() {
  const { id: mandatId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [stats, setStats] = useState({ reviewed: 0, shortlisted: 0, rejected: 0, skipped: 0 });

  // Fetch mandat info
  const { data: mandat } = useQuery({
    queryKey: ['mandat', mandatId],
    queryFn: () => api.get<MandatInfo>(`/mandats/${mandatId}`),
    enabled: !!mandatId,
  });

  // Fetch candidatures in SOURCING stage for this mandat
  const { data: candidatures, isLoading } = useQuery({
    queryKey: ['review-candidatures', mandatId],
    queryFn: () => api.get<{ data: Candidature[] }>(`/candidatures?mandatId=${mandatId}&stage=SOURCING&include=candidat`),
    enabled: !!mandatId,
  });

  const candidates = candidatures?.data || [];
  const current = candidates[currentIndex];
  const remaining = candidates.length - currentIndex;

  // Stage change mutation
  const stageMutation = useMutation({
    mutationFn: ({ candidatureId, stage, motifRefus }: { candidatureId: string; stage: string; motifRefus?: string }) =>
      api.put(`/candidatures/${candidatureId}`, { stage, motifRefus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-candidatures', mandatId] });
    },
  });

  const handleAction = useCallback((action: 'reject' | 'shortlist' | 'maybe') => {
    if (!current) return;

    if (action === 'reject') {
      setDirection(-1);
      stageMutation.mutate({
        candidatureId: current.id,
        stage: REVIEW_STAGES.REJECT,
        motifRefus: 'Profil non retenu (fast review)',
      });
      setStats(s => ({ ...s, reviewed: s.reviewed + 1, rejected: s.rejected + 1 }));
    } else if (action === 'shortlist') {
      setDirection(1);
      stageMutation.mutate({ candidatureId: current.id, stage: REVIEW_STAGES.SHORTLIST });
      setStats(s => ({ ...s, reviewed: s.reviewed + 1, shortlisted: s.shortlisted + 1 }));
    } else {
      setDirection(0);
      setStats(s => ({ ...s, reviewed: s.reviewed + 1, skipped: s.skipped + 1 }));
    }

    setShowDetails(false);
    setTimeout(() => setCurrentIndex(i => i + 1), 200);
  }, [current, stageMutation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          handleAction('reject');
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleAction('shortlist');
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleAction('maybe');
          break;
        case 'ArrowDown':
          e.preventDefault();
          setShowDetails(d => !d);
          break;
        case '?':
          setShowShortcuts(s => !s);
          break;
        case 'Escape':
          if (showDetails) setShowDetails(false);
          else if (showShortcuts) setShowShortcuts(false);
          else navigate(`/mandats/${mandatId}/kanban`);
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleAction, showDetails, showShortcuts, navigate, mandatId]);

  // Done state
  if (!isLoading && currentIndex >= candidates.length && candidates.length > 0) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center font-['Plus_Jakarta_Sans']">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-6"
        >
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <ThumbsUp size={36} className="text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-neutral-900">Review terminée !</h2>
          <div className="flex justify-center gap-8 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-600">{stats.shortlisted}</div>
              <div className="text-neutral-500">Shortlistés</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500">{stats.rejected}</div>
              <div className="text-neutral-500">Refusés</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-500">{stats.skipped}</div>
              <div className="text-neutral-500">Passés</div>
            </div>
          </div>
          <div className="flex justify-center gap-3 pt-4">
            <Button variant="secondary" onClick={() => navigate(`/mandats/${mandatId}/kanban`)}>
              Voir le kanban
            </Button>
            <Button onClick={() => { setCurrentIndex(0); setStats({ reviewed: 0, shortlisted: 0, rejected: 0, skipped: 0 }); }}>
              Recommencer
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="font-['Plus_Jakarta_Sans'] min-h-[80vh]">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Link to={`/mandats/${mandatId}/kanban`} className="rounded-lg p-2 hover:bg-neutral-100 transition-colors">
              <ChevronLeft size={20} className="text-neutral-500" />
            </Link>
            <Zap size={18} className="text-amber-500" />
            Fast Review
          </span>
        }
        subtitle={`${mandat?.titrePoste || ''}${mandat?.entreprise?.nom ? ` — ${mandat.entreprise.nom}` : ''}`}
        breadcrumbs={[{ label: 'Mandats', href: '/mandats' }, { label: mandat?.titrePoste || 'Mandat', href: `/mandats/${mandatId}` }, { label: 'Fast Review' }]}
        actions={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Users size={16} />
              <span>{remaining} restant{remaining > 1 ? 's' : ''}</span>
            </div>
            <button
              onClick={() => setShowShortcuts(true)}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-50 transition-colors"
            >
              <Keyboard size={14} /> Raccourcis
            </button>
          </div>
        }
      />

      {/* Progress bar */}
      <div className="mb-8 h-1.5 overflow-hidden rounded-full bg-neutral-100">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
          initial={{ width: 0 }}
          animate={{ width: candidates.length > 0 ? `${(currentIndex / candidates.length) * 100}%` : '0%' }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Stats bar */}
      <div className="mb-6 flex justify-center gap-6">
        <div className="flex items-center gap-2 text-sm">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-neutral-500">Shortlistés: <strong className="text-neutral-900">{stats.shortlisted}</strong></span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-neutral-500">Refusés: <strong className="text-neutral-900">{stats.rejected}</strong></span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="text-neutral-500">Passés: <strong className="text-neutral-900">{stats.skipped}</strong></span>
        </div>
      </div>

      {/* Card */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        </div>
      ) : current ? (
        <div className="mx-auto max-w-2xl">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={current.id}
              custom={direction}
              variants={swipeVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="rounded-2xl bg-white shadow-lg border border-neutral-100 overflow-hidden"
            >
              {/* Card header */}
              <div className="bg-gradient-to-r from-violet-50 to-indigo-50 px-8 py-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-neutral-900">
                      {current.candidat.prenom} {current.candidat.nom}
                    </h2>
                    <p className="mt-1 text-lg text-neutral-600">
                      {current.candidat.posteActuel || 'Poste non renseigné'}
                    </p>
                    {current.candidat.entrepriseActuelle && (
                      <p className="flex items-center gap-1.5 mt-1 text-neutral-500">
                        <Briefcase size={14} />
                        {current.candidat.entrepriseActuelle}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {current.candidat.localisation && (
                      <span className="flex items-center gap-1 text-sm text-neutral-500">
                        <MapPin size={14} />
                        {current.candidat.localisation}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Card body */}
              <div className="px-8 py-6 space-y-5">
                {/* Tags / Competences */}
                {(current.candidat.tags?.length > 0 || current.candidat.competences?.length > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {[...(current.candidat.tags || []), ...(current.candidat.competences || [])].slice(0, 12).map((tag, i) => (
                      <span key={i} className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Contact info */}
                <div className="flex flex-wrap gap-4 text-sm text-neutral-500">
                  {current.candidat.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail size={14} /> {current.candidat.email}
                    </span>
                  )}
                  {current.candidat.telephone && (
                    <span className="flex items-center gap-1.5">
                      <Phone size={14} /> {current.candidat.telephone}
                    </span>
                  )}
                </div>

                {/* Salary */}
                {(current.candidat.salaireActuel || current.candidat.salaireVise) && (
                  <div className="flex gap-6 text-sm">
                    {current.candidat.salaireActuel && (
                      <div>
                        <span className="text-neutral-400">Actuel: </span>
                        <strong className="text-neutral-700">{(current.candidat.salaireActuel / 1000).toFixed(0)}k$</strong>
                      </div>
                    )}
                    {current.candidat.salaireVise && (
                      <div>
                        <span className="text-neutral-400">Visé: </span>
                        <strong className="text-neutral-700">{(current.candidat.salaireVise / 1000).toFixed(0)}k$</strong>
                      </div>
                    )}
                  </div>
                )}

                {/* Experiences (top 3) */}
                {current.candidat.experiences?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-neutral-700">Expériences</h3>
                    {current.candidat.experiences.slice(0, 3).map((exp) => (
                      <div key={exp.id} className="flex items-start gap-3 text-sm">
                        <div className="mt-1 h-2 w-2 rounded-full bg-violet-400 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-neutral-800">{exp.titre || 'Poste non renseigné'}</p>
                          <p className="text-neutral-500">{exp.entreprise}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Expanded details */}
                <AnimatePresence>
                  {showDetails && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-neutral-100 pt-4 space-y-3"
                    >
                      {current.candidat.disponibilite && (
                        <p className="text-sm"><span className="text-neutral-400">Disponibilité:</span> <strong>{current.candidat.disponibilite}</strong></p>
                      )}
                      {current.candidat.linkedinUrl && (
                        <a href={current.candidat.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-violet-600 hover:underline">
                          Voir le profil LinkedIn →
                        </a>
                      )}
                      <Link to={`/candidats/${current.candidat.id}`} className="block text-sm text-violet-600 hover:underline">
                        Ouvrir la fiche complète →
                      </Link>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-center gap-4 border-t border-neutral-100 px-8 py-5 bg-neutral-50">
                <button
                  onClick={() => handleAction('reject')}
                  className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-red-200 bg-white text-red-500 shadow-sm transition-all hover:bg-red-50 hover:scale-110 hover:shadow-md active:scale-95"
                  title="Rejeter (←)"
                >
                  <X size={24} />
                </button>
                <button
                  onClick={() => handleAction('maybe')}
                  className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-amber-200 bg-white text-amber-500 shadow-sm transition-all hover:bg-amber-50 hover:scale-110 hover:shadow-md active:scale-95"
                  title="Passer (↑)"
                >
                  <Clock size={20} />
                </button>
                <button
                  onClick={() => setShowDetails(d => !d)}
                  className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-blue-200 bg-white text-blue-500 shadow-sm transition-all hover:bg-blue-50 hover:scale-110 hover:shadow-md active:scale-95"
                  title="Détails (↓)"
                >
                  <Eye size={20} />
                </button>
                <button
                  onClick={() => handleAction('shortlist')}
                  className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-200 bg-white text-emerald-500 shadow-sm transition-all hover:bg-emerald-50 hover:scale-110 hover:shadow-md active:scale-95"
                  title="Shortlister (→)"
                >
                  <ThumbsUp size={24} />
                </button>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Keyboard hint */}
          <div className="mt-6 flex justify-center gap-6 text-xs text-neutral-400">
            <span className="flex items-center gap-1"><kbd className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono">←</kbd> Rejeter</span>
            <span className="flex items-center gap-1"><kbd className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono">→</kbd> Shortlist</span>
            <span className="flex items-center gap-1"><kbd className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono">↑</kbd> Passer</span>
            <span className="flex items-center gap-1"><kbd className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono">↓</kbd> Détails</span>
          </div>
        </div>
      ) : (
        <div className="flex justify-center py-20">
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
              <Users size={28} className="text-neutral-400" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-700">Aucun candidat à reviewer</h3>
            <p className="text-sm text-neutral-500">Ajoutez des candidats en stage "Sourcing" pour commencer</p>
          </div>
        </div>
      )}

      {/* Shortcuts modal */}
      <AnimatePresence>
        {showShortcuts && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowShortcuts(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-80 rounded-2xl bg-white p-6 shadow-xl"
            >
              <h3 className="text-lg font-bold text-neutral-900 mb-4">Raccourcis clavier</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-neutral-600">Rejeter</span><kbd className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs">←</kbd></div>
                <div className="flex justify-between"><span className="text-neutral-600">Shortlister</span><kbd className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs">→</kbd></div>
                <div className="flex justify-between"><span className="text-neutral-600">Passer / Plus tard</span><kbd className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs">↑</kbd></div>
                <div className="flex justify-between"><span className="text-neutral-600">Voir détails</span><kbd className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs">↓</kbd></div>
                <div className="flex justify-between"><span className="text-neutral-600">Aide raccourcis</span><kbd className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs">?</kbd></div>
                <div className="flex justify-between"><span className="text-neutral-600">Retour</span><kbd className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs">Esc</kbd></div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
