import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Search, User, Building2, MapPin, Briefcase, ChevronRight,
  Plus, Minus, Eye, EyeOff, Sparkles, Mail, Clock, CheckCircle2,
  AlertCircle, MailOpen, MessageSquare, Loader2, Calendar,
  ArrowLeft, ArrowRight, Zap, X, Filter,
} from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '../../lib/api-client';
import { toast } from '../../components/ui/Toast';
import ProspectDetectionTab from '../../components/ai/ProspectDetectionTab';
import type { SelectedProspect } from '../../components/ai/ProspectDetectionTab';

// ─── TYPES ──────────────────────────────────────────

interface Candidat {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  posteActuel: string | null;
  entrepriseActuelle: string | null;
  localisation: string | null;
}

interface Client {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  poste: string | null;
  entrepriseId: string;
  entreprise: { nom: string; secteur: string | null; localisation: string | null };
  createdAt: string;
}

interface Sequence {
  id: string;
  nom: string;
  description: string | null;
  targetType: string;
}

interface Campaign {
  id: string;
  candidatId: string;
  anonymizedProfile: Record<string, unknown>;
  emailSubject: string;
  emailBody: string;
  totalProspects: number;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  candidatName: string;
  candidatPoste: string | null;
  stats: {
    total: number;
    sent: number;
    opened: number;
    replied: number;
    interested: number;
  };
}

interface CampaignsResponse {
  draft: Campaign[];
  active: Campaign[];
  completed: Campaign[];
}

type Tab = 'new' | 'active' | 'completed';

// ─── STEPPER ────────────────────────────────────────

const STEPS = [
  { label: 'Candidat', icon: User },
  { label: 'Pitch', icon: Mail },
  { label: 'Prospects', icon: Building2 },
  { label: 'Envoi', icon: Send },
];

function Stepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0 py-6">
      {STEPS.map((step, i) => {
        const StepIcon = step.icon;
        const isActive = i === currentStep;
        const isDone = i < currentStep;
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 ${
                  isActive
                    ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30'
                    : isDone
                      ? 'bg-primary-100 text-primary-600'
                      : 'bg-neutral-100 text-neutral-400'
                }`}
              >
                {isDone ? <CheckCircle2 size={18} /> : <StepIcon size={18} />}
              </div>
              <span
                className={`text-xs font-medium ${
                  isActive ? 'text-primary-600' : isDone ? 'text-primary-500' : 'text-neutral-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-3 h-0.5 w-12 rounded-full transition-all duration-300 ${
                  i < currentStep ? 'bg-primary-400' : 'bg-neutral-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── STEP 1: SELECT CANDIDAT ────────────────────────

function StepSelectCandidat({
  selected,
  onSelect,
  onNext,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
  onNext: () => void;
}) {
  const [search, setSearch] = useState('');

  const { data: candidats = [], isLoading } = useQuery<Candidat[]>({
    queryKey: ['candidats-list'],
    queryFn: async () => {
      const res = await api.get<{ data: Candidat[] }>('/candidats?limit=200');
      return res.data;
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return candidats;
    const q = search.toLowerCase();
    return candidats.filter(
      (c) =>
        c.nom.toLowerCase().includes(q) ||
        (c.prenom && c.prenom.toLowerCase().includes(q)) ||
        (c.posteActuel && c.posteActuel.toLowerCase().includes(q)) ||
        (c.entrepriseActuelle && c.entrepriseActuelle.toLowerCase().includes(q)) ||
        (c.localisation && c.localisation.toLowerCase().includes(q)),
    );
  }, [candidats, search]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h2 className="text-lg font-semibold text-neutral-800">Choisir un candidat</h2>
      <p className="text-sm text-neutral-500">
        Sélectionnez le candidat dont vous souhaitez pousser le profil anonymisé à des prospects.
      </p>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          placeholder="Rechercher par nom, poste, entreprise..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
        />
      </div>

      {/* List */}
      <div className="max-h-[400px] space-y-1 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-neutral-400" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">Aucun candidat trouvé</p>
        ) : (
          filtered.map((c) => (
            <label
              key={c.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-all ${
                selected === c.id
                  ? 'bg-primary-50 ring-1 ring-primary-300'
                  : 'hover:bg-neutral-50'
              }`}
            >
              <input
                type="radio"
                name="candidat"
                value={c.id}
                checked={selected === c.id}
                onChange={() => onSelect(c.id)}
                className="accent-primary-500"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-neutral-800 text-sm">
                  {c.prenom} {c.nom}
                </div>
                <div className="flex items-center gap-3 text-xs text-neutral-500">
                  {c.posteActuel && (
                    <span className="flex items-center gap-1">
                      <Briefcase size={12} /> {c.posteActuel}
                    </span>
                  )}
                  {c.entrepriseActuelle && (
                    <span className="flex items-center gap-1">
                      <Building2 size={12} /> {c.entrepriseActuelle}
                    </span>
                  )}
                  {c.localisation && (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} /> {c.localisation}
                    </span>
                  )}
                </div>
              </div>
            </label>
          ))
        )}
      </div>

      {/* Next */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onNext}
          disabled={!selected}
          className="flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Suivant <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ─── STEP 2: PREPARE PITCH ──────────────────────────

interface AnonymizedProfile {
  titre: string;
  points: string[];
  ville: string;
  secteur: string;
  experience: string;
}

function StepPreparePitch({
  candidatId,
  profile,
  onProfileChange,
  emailSubject,
  onSubjectChange,
  emailBody,
  onBodyChange,
  onBack,
  onNext,
}: {
  candidatId: string;
  profile: AnonymizedProfile;
  onProfileChange: (p: AnonymizedProfile) => void;
  emailSubject: string;
  onSubjectChange: (s: string) => void;
  emailBody: string;
  onBodyChange: (b: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [maskName, setMaskName] = useState(true);
  const [maskCompany, setMaskCompany] = useState(true);
  const [maskCity, setMaskCity] = useState(false);

  // Load candidat profile
  const { data: candidat } = useQuery({
    queryKey: ['adchase-candidat', candidatId],
    queryFn: () => api.get<Candidat>(`/adchase/candidat/${candidatId}/profile`),
    enabled: !!candidatId,
  });

  // Seed profile from candidat data when loaded
  useEffect(() => {
    if (candidat && !profile.titre) {
      onProfileChange({
        titre: candidat.posteActuel || 'Profil senior',
        points: [
          candidat.posteActuel ? `Poste actuel : ${candidat.posteActuel}` : '',
          candidat.entrepriseActuelle ? `Entreprise : ${maskCompany ? '[Confidentiel]' : candidat.entrepriseActuelle}` : '',
          'Disponible sous 1 mois',
        ].filter(Boolean),
        ville: candidat.localisation || '',
        secteur: '',
        experience: '',
      });
    }
  }, [candidat]);

  const addPoint = () => {
    onProfileChange({ ...profile, points: [...profile.points, ''] });
  };

  const removePoint = (idx: number) => {
    onProfileChange({ ...profile, points: profile.points.filter((_, i) => i !== idx) });
  };

  const updatePoint = (idx: number, value: string) => {
    const newPoints = [...profile.points];
    newPoints[idx] = value;
    onProfileChange({ ...profile, points: newPoints });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h2 className="text-lg font-semibold text-neutral-800">Préparer le pitch</h2>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Anonymized profile card */}
        <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
            <User size={16} /> Profil anonymisé
          </h3>

          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Titre du profil</label>
            <input
              type="text"
              value={profile.titre}
              onChange={(e) => onProfileChange({ ...profile, titre: e.target.value })}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              placeholder="ex: Directeur Commercial SaaS"
            />
          </div>

          {/* Sector */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Secteur</label>
            <input
              type="text"
              value={profile.secteur}
              onChange={(e) => onProfileChange({ ...profile, secteur: e.target.value })}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              placeholder="ex: SaaS / Tech"
            />
          </div>

          {/* City */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Ville</label>
            <input
              type="text"
              value={profile.ville}
              onChange={(e) => onProfileChange({ ...profile, ville: e.target.value })}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              placeholder="ex: Paris"
            />
          </div>

          {/* Experience */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Expérience</label>
            <input
              type="text"
              value={profile.experience}
              onChange={(e) => onProfileChange({ ...profile, experience: e.target.value })}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              placeholder="ex: 8 ans"
            />
          </div>

          {/* Bullet points */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Points clés</label>
            <div className="space-y-2">
              {profile.points.map((point, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-neutral-400 text-xs">•</span>
                  <input
                    type="text"
                    value={point}
                    onChange={(e) => updatePoint(idx, e.target.value)}
                    className="flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  />
                  <button
                    onClick={() => removePoint(idx)}
                    className="text-neutral-400 hover:text-red-500 transition-colors"
                  >
                    <Minus size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={addPoint}
                className="flex items-center gap-1.5 text-xs font-medium text-primary-500 hover:text-primary-600 transition-colors"
              >
                <Plus size={14} /> Ajouter un point
              </button>
            </div>
          </div>

          {/* Masking checkboxes */}
          <div className="space-y-2 rounded-lg bg-neutral-50 p-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={maskName}
                onChange={(e) => setMaskName(e.target.checked)}
                className="accent-primary-500"
              />
              <EyeOff size={14} className="text-neutral-500" />
              Masquer le nom
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={maskCompany}
                onChange={(e) => setMaskCompany(e.target.checked)}
                className="accent-primary-500"
              />
              <EyeOff size={14} className="text-neutral-500" />
              Masquer l'entreprise
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={maskCity}
                onChange={(e) => setMaskCity(e.target.checked)}
                className="accent-primary-500"
              />
              {maskCity ? <EyeOff size={14} className="text-neutral-500" /> : <Eye size={14} className="text-neutral-500" />}
              Masquer la ville
            </label>
          </div>
        </div>

        {/* Right: Email editor */}
        <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
            <Mail size={16} /> Email de présentation
          </h3>

          {/* Subject */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Objet</label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => onSubjectChange(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              placeholder="ex: Profil senior disponible — {{client_company}}"
            />
          </div>

          {/* Body */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Corps du message</label>
            <textarea
              value={emailBody}
              onChange={(e) => onBodyChange(e.target.value)}
              rows={12}
              className="w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              placeholder={`Bonjour {{client_first_name}},\n\nJ'ai identifié un profil qui pourrait vous intéresser...\n\nCordialement`}
            />
          </div>

          {/* Variable hints */}
          <div className="rounded-lg bg-blue-50 p-3">
            <p className="text-xs font-medium text-blue-700 mb-1">Variables disponibles :</p>
            <div className="flex flex-wrap gap-1.5">
              {['{{client_first_name}}', '{{client_company}}'].map((v) => (
                <span
                  key={v}
                  className="rounded bg-blue-100 px-2 py-0.5 text-xs font-mono text-blue-700"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>

          {/* AI generate email */}
          <button
            onClick={async () => {
              try {
                const res = await api.post<{ data: { subject: string; body: string } }>('/ai/adchase/generate-pitch-email', {
                  candidatId,
                  profile,
                });
                if (res.data) {
                  onSubjectChange(res.data.subject);
                  onBodyChange(res.data.body);
                  toast('success', 'Email genere par IA');
                }
              } catch (err: any) {
                const msg = err?.data?.message || err?.message || '';
                if (msg.includes('non configur') || msg.includes('ANTHROPIC')) {
                  toast('error', 'Cle API Anthropic non configuree');
                } else {
                  toast('error', msg || 'Erreur lors de la generation IA');
                }
              }
            }}
            className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-all hover:bg-purple-100"
          >
            <Sparkles size={16} /> Générer avec IA
          </button>
        </div>
      </div>

      {/* Nav buttons */}
      <div className="flex justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-lg border border-neutral-200 px-5 py-2.5 text-sm font-medium text-neutral-600 transition-all hover:bg-neutral-50"
        >
          <ArrowLeft size={16} /> Retour
        </button>
        <button
          onClick={onNext}
          disabled={!emailSubject.trim() || !emailBody.trim()}
          className="flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Suivant <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ─── STEP 3: SELECT PROSPECTS ───────────────────────

interface AiRecommendation {
  clientId: string;
  clientName: string;
  entreprise: string;
  score: number;
  reason: string;
}

function StepSelectProspects({
  candidatId,
  selectedIds,
  onSelectedChange,
  sequenceId,
  onSequenceChange,
  aiProspectCount,
  onAiProspectCountChange,
  onBack,
  onNext,
}: {
  candidatId: string | null;
  selectedIds: string[];
  onSelectedChange: (ids: string[]) => void;
  sequenceId: string | null;
  onSequenceChange: (id: string | null) => void;
  aiProspectCount: number;
  onAiProspectCountChange: (count: number) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [prospectTab, setProspectTab] = useState<'clients' | 'ai'>('clients');
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [aiRecommendations, setAiRecommendations] = useState<AiRecommendation[] | null>(null);

  const recommendMutation = useMutation({
    mutationFn: () =>
      api.post<{ data: AiRecommendation[] }>('/ai/adchase/recommend', { candidatId }),
    onSuccess: (result) => {
      const recs = result.data || [];
      setAiRecommendations(recs);
      if (recs.length > 0) {
        // Pre-select top recommended prospects
        const topIds = recs.filter((r) => r.score >= 50).map((r) => r.clientId);
        if (topIds.length > 0) {
          const newIds = [...new Set([...selectedIds, ...topIds])];
          onSelectedChange(newIds);
        }
        toast('success', `${recs.length} recommandation(s) IA generee(s)`);
      } else {
        toast('info', 'Aucune recommandation trouvee');
      }
    },
    onError: (error: any) => {
      const msg = error?.data?.message || error?.message || 'Erreur lors de la recommandation IA';
      if (msg.includes('non configuree') || msg.includes('not configured')) {
        toast('error', 'IA non configuree. Allez dans Parametres > Integrations pour configurer votre cle API.');
      } else {
        toast('error', msg);
      }
    },
  });

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['clients-adchase'],
    queryFn: async () => {
      const res = await api.get<{ data: Client[] }>('/clients?limit=500');
      return res.data;
    },
  });

  const { data: sequences = [] } = useQuery<Sequence[]>({
    queryKey: ['sequences-adchase'],
    queryFn: async () => {
      const res = await api.get<Sequence[]>('/sequences');
      return Array.isArray(res) ? res : [];
    },
  });

  // Derive filter options from clients data
  const sectors = useMemo(
    () => [...new Set(clients.map((c) => c.entreprise?.secteur).filter(Boolean))].sort() as string[],
    [clients],
  );
  const cities = useMemo(
    () => [...new Set(clients.map((c) => c.entreprise?.localisation).filter(Boolean))].sort() as string[],
    [clients],
  );

  // Check recently contacted
  const sevenDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }, []);

  const filtered = useMemo(() => {
    let list = clients;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.nom.toLowerCase().includes(q) ||
          (c.prenom && c.prenom.toLowerCase().includes(q)) ||
          c.entreprise?.nom.toLowerCase().includes(q) ||
          (c.poste && c.poste.toLowerCase().includes(q)),
      );
    }
    if (sectorFilter) {
      list = list.filter((c) => c.entreprise?.secteur === sectorFilter);
    }
    if (cityFilter) {
      list = list.filter((c) => c.entreprise?.localisation === cityFilter);
    }
    return list;
  }, [clients, search, sectorFilter, cityFilter]);

  const toggleClient = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectedChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectedChange([...selectedIds, id]);
    }
  };

  const toggleAll = () => {
    if (selectedIds.length === filtered.length) {
      onSelectedChange([]);
    } else {
      onSelectedChange(filtered.map((c) => c.id));
    }
  };

  const clientSequences = sequences.filter((s) => s.targetType === 'client');

  // Helper to get recommendation score for a client
  const getRecommendationScore = (clientId: string) => {
    if (!aiRecommendations) return null;
    return aiRecommendations.find((r) => r.clientId === clientId) || null;
  };

  const handleAiProspectsSelected = (prospects: SelectedProspect[]) => {
    onAiProspectCountChange(prospects.length);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-800">Selectionner les prospects</h2>
        <div className="flex items-center gap-3">
          {prospectTab === 'clients' && (
            <button
              onClick={() => recommendMutation.mutate()}
              disabled={!candidatId || recommendMutation.isPending}
              className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-all hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {recommendMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}
              Recommandation IA
            </button>
          )}
          <span className="rounded-full bg-primary-100 px-3 py-1 text-sm font-medium text-primary-700">
            {selectedIds.length} client{selectedIds.length > 1 ? 's' : ''}
            {aiProspectCount > 0 && ` + ${aiProspectCount} prospect${aiProspectCount > 1 ? 's' : ''} IA`}
          </span>
        </div>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setProspectTab('clients')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            prospectTab === 'clients'
              ? 'bg-primary-500 text-white shadow-sm'
              : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
          }`}
        >
          <Building2 size={14} />
          Mes clients ({clients.length})
        </button>
        <button
          onClick={() => setProspectTab('ai')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            prospectTab === 'ai'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
          }`}
        >
          <Sparkles size={14} />
          Prospects IA
        </button>
      </div>

      {/* CLIENTS TAB */}
      {prospectTab === 'clients' && (
        <>
          {/* AI Recommendations banner */}
          {aiRecommendations && aiRecommendations.length > 0 && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-purple-700 flex items-center gap-1.5">
                  <Sparkles size={14} /> Recommandations IA
                </p>
                <button
                  onClick={() => setAiRecommendations(null)}
                  className="text-xs text-purple-500 hover:text-purple-700 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="space-y-1.5">
                {aiRecommendations.slice(0, 5).map((rec) => (
                  <div key={rec.clientId} className="flex items-center justify-between rounded-md bg-white/60 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-neutral-800 truncate">{rec.clientName}</span>
                      {rec.entreprise && (
                        <span className="text-xs text-neutral-500 flex items-center gap-1">
                          <Building2 size={11} /> {rec.entreprise}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          rec.score >= 70
                            ? 'bg-emerald-100 text-emerald-700'
                            : rec.score >= 50
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {rec.score}%
                      </span>
                      <span className="text-[11px] text-neutral-500 max-w-[200px] truncate">{rec.reason}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Rechercher un client..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400"
            >
              <option value="">Tous les secteurs</option>
              {sectors.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400"
            >
              <option value="">Toutes les villes</option>
              {cities.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Client list */}
          <div className="max-h-[350px] overflow-y-auto rounded-lg border border-neutral-200 bg-white">
            {/* Header */}
            <div className="sticky top-0 flex items-center gap-3 border-b border-neutral-100 bg-neutral-50 px-4 py-2">
              <input
                type="checkbox"
                checked={filtered.length > 0 && selectedIds.length === filtered.length}
                onChange={toggleAll}
                className="accent-primary-500"
              />
              <span className="text-xs font-medium text-neutral-500">Tout selectionner ({filtered.length})</span>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-neutral-400" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-400">Aucun client trouve</p>
            ) : (
              filtered.map((c) => {
                const isRecent = c.createdAt > sevenDaysAgo;
                const rec = getRecommendationScore(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex cursor-pointer items-center gap-3 border-b border-neutral-50 px-4 py-2.5 transition-all ${
                      selectedIds.includes(c.id) ? 'bg-primary-50/50' : 'hover:bg-neutral-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(c.id)}
                      onChange={() => toggleClient(c.id)}
                      className="accent-primary-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-neutral-800">
                          {c.prenom} {c.nom}
                        </span>
                        {isRecent && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            Contact recent
                          </span>
                        )}
                        {rec && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              rec.score >= 70
                                ? 'bg-purple-100 text-purple-700'
                                : rec.score >= 50
                                  ? 'bg-purple-50 text-purple-600'
                                  : 'bg-neutral-100 text-neutral-500'
                            }`}
                          >
                            IA {rec.score}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-neutral-500">
                        {c.poste && <span>{c.poste}</span>}
                        <span className="flex items-center gap-1">
                          <Building2 size={11} /> {c.entreprise?.nom}
                        </span>
                        {c.entreprise?.secteur && (
                          <span className="text-neutral-400">{c.entreprise.secteur}</span>
                        )}
                        {c.entreprise?.localisation && (
                          <span className="flex items-center gap-1 text-neutral-400">
                            <MapPin size={11} /> {c.entreprise.localisation}
                          </span>
                        )}
                      </div>
                    </div>
                    {c.email && <span className="text-xs text-neutral-400">{c.email}</span>}
                  </label>
                );
              })
            )}
          </div>
        </>
      )}

      {/* AI PROSPECTS TAB */}
      {prospectTab === 'ai' && candidatId && (
        <ProspectDetectionTab
          candidatId={candidatId}
          onProspectsSelected={handleAiProspectsSelected}
        />
      )}

      {/* Sequence selector */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-700 mb-2">
          <Zap size={16} className="text-amber-500" /> Sequence de relance (optionnel)
        </h3>
        <p className="text-xs text-neutral-500 mb-3">
          Associer une sequence de suivi pour les prospects qui ne repondent pas.
        </p>
        <select
          value={sequenceId || ''}
          onChange={(e) => onSequenceChange(e.target.value || null)}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400"
        >
          <option value="">Aucune sequence</option>
          {clientSequences.map((s) => (
            <option key={s.id} value={s.id}>{s.nom}</option>
          ))}
        </select>
      </div>

      {/* Nav buttons */}
      <div className="flex justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-lg border border-neutral-200 px-5 py-2.5 text-sm font-medium text-neutral-600 transition-all hover:bg-neutral-50"
        >
          <ArrowLeft size={16} /> Retour
        </button>
        <button
          onClick={onNext}
          disabled={selectedIds.length === 0 && aiProspectCount === 0}
          className="flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Suivant <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ─── STEP 4: CONFIRM & SEND ─────────────────────────

interface PersonalizedMessage {
  prospectClientId: string;
  clientName: string;
  entreprise: string;
  subject: string;
  body: string;
}

function StepConfirmSend({
  candidatId,
  profile,
  emailSubject,
  emailBody,
  prospectCount,
  aiProspectCount,
  prospectClientIds,
  sequenceId,
  onBack,
  onSend,
  isSending,
}: {
  candidatId: string;
  profile: AnonymizedProfile;
  emailSubject: string;
  emailBody: string;
  prospectCount: number;
  aiProspectCount: number;
  prospectClientIds: string[];
  sequenceId: string | null;
  onBack: () => void;
  onSend: (scheduled: boolean, scheduledAt?: string) => void;
  isSending: boolean;
}) {
  const [sendMode, setSendMode] = useState<'now' | 'scheduled'>('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [personalizedMessages, setPersonalizedMessages] = useState<PersonalizedMessage[] | null>(null);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);

  const { data: candidat } = useQuery({
    queryKey: ['adchase-candidat', candidatId],
    queryFn: () => api.get<Candidat>(`/adchase/candidat/${candidatId}/profile`),
    enabled: !!candidatId,
  });

  const candidatName = candidat
    ? `${candidat.prenom || ''} ${candidat.nom}`.trim()
    : 'Candidat';

  const personalizeMutation = useMutation({
    mutationFn: () =>
      api.post<{ data: PersonalizedMessage[] }>('/ai/adchase/personalize', {
        candidatId,
        emailSubject,
        emailBody,
        prospectClientIds,
      }),
    onSuccess: (result) => {
      const msgs = result.data || [];
      setPersonalizedMessages(msgs);
      if (msgs.length > 0) {
        toast('success', `${msgs.length} message(s) personnalise(s)`);
      } else {
        toast('info', 'Aucune personnalisation generee');
      }
    },
    onError: (error: any) => {
      const msg = error?.data?.message || error?.message || 'Erreur lors de la personnalisation IA';
      if (msg.includes('non configuree') || msg.includes('not configured')) {
        toast('error', 'IA non configuree. Allez dans Parametres > Integrations pour configurer votre cle API.');
      } else {
        toast('error', msg);
      }
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-lg font-semibold text-neutral-800">Confirmer et envoyer</h2>

      {/* Summary card */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold text-neutral-700">Recapitulatif</h3>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-neutral-500">Candidat</span>
            <p className="font-medium text-neutral-800">{profile.titre || candidatName}</p>
          </div>
          <div>
            <span className="text-neutral-500">Prospects</span>
            <p className="font-medium text-neutral-800">
              {prospectCount} client{prospectCount > 1 ? 's' : ''} existant{prospectCount > 1 ? 's' : ''}
              {aiProspectCount > 0 && ` + ${aiProspectCount} nouveau${aiProspectCount > 1 ? 'x' : ''} prospect${aiProspectCount > 1 ? 's' : ''} IA`}
            </p>
          </div>
          <div className="col-span-2">
            <span className="text-neutral-500">Objet email</span>
            <p className="font-medium text-neutral-800">{emailSubject}</p>
          </div>
          {sequenceId && (
            <div className="col-span-2">
              <span className="text-neutral-500">Sequence de relance</span>
              <p className="flex items-center gap-1.5 font-medium text-amber-600">
                <Zap size={14} /> Sequence associee
              </p>
            </div>
          )}
        </div>
      </div>

      {/* AI Personalization Section */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-700">Personnalisation des messages</h3>
          <button
            onClick={() => personalizeMutation.mutate()}
            disabled={personalizeMutation.isPending || prospectClientIds.length === 0}
            className="flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-all hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {personalizeMutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Sparkles size={16} />
            )}
            Personnaliser par client
          </button>
        </div>

        {!personalizedMessages && (
          <p className="text-xs text-neutral-500">
            Utilisez l'IA pour generer un message personnalise pour chaque prospect. Le template de base sera adapte au contexte de chaque client.
          </p>
        )}

        {personalizedMessages && personalizedMessages.length > 0 && (
          <div className="space-y-2">
            {personalizedMessages.map((msg) => (
              <div key={msg.prospectClientId} className="rounded-lg border border-purple-100 bg-purple-50/30">
                <button
                  onClick={() =>
                    setExpandedMessageId(
                      expandedMessageId === msg.prospectClientId ? null : msg.prospectClientId,
                    )
                  }
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-purple-500" />
                    <span className="text-sm font-medium text-neutral-800">{msg.clientName}</span>
                    {msg.entreprise && (
                      <span className="text-xs text-neutral-500">{msg.entreprise}</span>
                    )}
                  </div>
                  <ChevronRight
                    size={14}
                    className={`text-neutral-400 transition-transform ${
                      expandedMessageId === msg.prospectClientId ? 'rotate-90' : ''
                    }`}
                  />
                </button>
                {expandedMessageId === msg.prospectClientId && (
                  <div className="border-t border-purple-100 px-4 py-3 space-y-2">
                    <div>
                      <span className="text-[10px] font-semibold uppercase text-neutral-500">Objet</span>
                      <p className="text-sm text-neutral-800">{msg.subject}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold uppercase text-neutral-500">Corps</span>
                      <p className="text-sm text-neutral-700 whitespace-pre-line">{msg.body}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Send options */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold text-neutral-700">Options d'envoi</h3>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            name="sendMode"
            checked={sendMode === 'now'}
            onChange={() => setSendMode('now')}
            className="accent-primary-500"
          />
          <span className="text-sm font-medium text-neutral-700">Envoyer maintenant</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            name="sendMode"
            checked={sendMode === 'scheduled'}
            onChange={() => setSendMode('scheduled')}
            className="accent-primary-500"
          />
          <span className="text-sm font-medium text-neutral-700">Planifier</span>
        </label>

        {sendMode === 'scheduled' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <input
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
            />
          </motion.div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-lg border border-neutral-200 px-5 py-2.5 text-sm font-medium text-neutral-600 transition-all hover:bg-neutral-50"
        >
          <ArrowLeft size={16} /> Retour
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={() => toast('info', 'Email de test envoyé (simulation)')}
            className="flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-600 transition-all hover:bg-neutral-50"
          >
            <Mail size={16} /> Envoyer un test
          </button>
          <button
            onClick={() => onSend(sendMode === 'scheduled', scheduledDate || undefined)}
            disabled={isSending || (sendMode === 'scheduled' && !scheduledDate)}
            className="flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
            Lancer la campagne
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CAMPAIGN CARD (for active/completed tabs) ──────

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const { stats } = campaign;
  const openRate = stats.sent > 0 ? Math.round((stats.opened / stats.sent) * 100) : 0;
  const replyRate = stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 transition-all hover:shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-800">{campaign.emailSubject}</h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            {campaign.candidatName}
            {campaign.candidatPoste && ` — ${campaign.candidatPoste}`}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
            campaign.status === 'active'
              ? 'bg-emerald-100 text-emerald-700'
              : campaign.status === 'completed'
                ? 'bg-neutral-100 text-neutral-600'
                : 'bg-blue-100 text-blue-700'
          }`}
        >
          {campaign.status === 'active' ? 'En cours' : campaign.status === 'completed' ? 'Terminée' : campaign.status}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="text-center">
          <div className="text-lg font-bold text-neutral-800">{stats.sent}</div>
          <div className="text-[10px] text-neutral-500 flex items-center justify-center gap-1">
            <Send size={10} /> Envoyés
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-blue-600">{stats.opened}</div>
          <div className="text-[10px] text-neutral-500 flex items-center justify-center gap-1">
            <MailOpen size={10} /> Ouverts
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-emerald-600">{stats.replied}</div>
          <div className="text-[10px] text-neutral-500 flex items-center justify-center gap-1">
            <MessageSquare size={10} /> Réponses
          </div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-purple-600">{stats.interested}</div>
          <div className="text-[10px] text-neutral-500 flex items-center justify-center gap-1">
            <CheckCircle2 size={10} /> Intéressés
          </div>
        </div>
      </div>

      {/* Progress bars */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>Ouverture {openRate}%</span>
          <div className="flex-1 h-1.5 rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-blue-400 transition-all" style={{ width: `${openRate}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>Réponse {replyRate}%</span>
          <div className="flex-1 h-1.5 rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${replyRate}%` }} />
          </div>
        </div>
      </div>

      {campaign.sentAt && (
        <p className="mt-3 text-[11px] text-neutral-400">
          Envoyé le {format(new Date(campaign.sentAt), 'dd MMM yyyy à HH:mm', { locale: fr })}
        </p>
      )}
    </div>
  );
}

// ─── MAIN PAGE ──────────────────────────────────────

export default function AdchasePage() {
  const queryClient = useQueryClient();

  // Tab state
  const [tab, setTab] = useState<Tab>('new');

  // Wizard state
  const [step, setStep] = useState(0);
  const [selectedCandidatId, setSelectedCandidatId] = useState<string | null>(null);
  const [profile, setProfile] = useState<AnonymizedProfile>({
    titre: '',
    points: [],
    ville: '',
    secteur: '',
    experience: '',
  });
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [selectedProspectIds, setSelectedProspectIds] = useState<string[]>([]);
  const [sequenceId, setSequenceId] = useState<string | null>(null);
  const [aiProspectCount, setAiProspectCount] = useState(0);

  // Fetch campaigns
  const { data: campaigns, isLoading: loadingCampaigns } = useQuery<CampaignsResponse>({
    queryKey: ['adchase-campaigns'],
    queryFn: () => api.get<CampaignsResponse>('/adchase'),
  });

  // Create + launch mutation
  const createAndLaunchMutation = useMutation({
    mutationFn: async ({ scheduled, scheduledAt }: { scheduled: boolean; scheduledAt?: string }) => {
      // Create campaign
      const campaign = await api.post<{ id: string }>('/adchase', {
        candidatId: selectedCandidatId,
        anonymizedProfile: profile,
        emailSubject,
        emailBody,
        prospectClientIds: selectedProspectIds,
        sequenceId: sequenceId || undefined,
      });

      if (scheduled && scheduledAt) {
        // Just update with scheduled date, don't launch
        await api.put(`/adchase/${campaign.id}`, { scheduledAt });
        return campaign;
      }

      // Launch immediately
      await api.post(`/adchase/${campaign.id}/launch`);
      return campaign;
    },
    onSuccess: () => {
      toast('success', 'Campagne Adchase lancée avec succès !');
      queryClient.invalidateQueries({ queryKey: ['adchase-campaigns'] });
      resetWizard();
      setTab('active');
    },
    onError: (err: any) => {
      toast('error', err?.data?.message || 'Erreur lors de la création de la campagne');
    },
  });

  const resetWizard = () => {
    setStep(0);
    setSelectedCandidatId(null);
    setProfile({ titre: '', points: [], ville: '', secteur: '', experience: '' });
    setEmailSubject('');
    setEmailBody('');
    setSelectedProspectIds([]);
    setSequenceId(null);
    setAiProspectCount(0);
  };

  const activeCount = campaigns?.active?.length ?? 0;

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <div className="border-b border-neutral-200 bg-white px-8 pt-6 pb-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100">
            <Send size={20} className="text-primary-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-800">Adchase</h1>
            <p className="text-sm text-neutral-500">Push candidat anonymisé vers des prospects</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0">
          {[
            { key: 'new' as Tab, label: 'Nouvelle campagne' },
            { key: 'active' as Tab, label: `En cours (${activeCount})` },
            { key: 'completed' as Tab, label: 'Terminées' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative px-5 py-3 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'text-primary-600'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {t.label}
              {tab === t.key && (
                <motion.div
                  layoutId="adchase-tab"
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary-500"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-8 py-6">
        <AnimatePresence mode="wait">
          {tab === 'new' && (
            <motion.div
              key="new"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Stepper currentStep={step} />

              {step === 0 && (
                <StepSelectCandidat
                  selected={selectedCandidatId}
                  onSelect={setSelectedCandidatId}
                  onNext={() => setStep(1)}
                />
              )}

              {step === 1 && selectedCandidatId && (
                <StepPreparePitch
                  candidatId={selectedCandidatId}
                  profile={profile}
                  onProfileChange={setProfile}
                  emailSubject={emailSubject}
                  onSubjectChange={setEmailSubject}
                  emailBody={emailBody}
                  onBodyChange={setEmailBody}
                  onBack={() => setStep(0)}
                  onNext={() => setStep(2)}
                />
              )}

              {step === 2 && (
                <StepSelectProspects
                  candidatId={selectedCandidatId}
                  selectedIds={selectedProspectIds}
                  onSelectedChange={setSelectedProspectIds}
                  sequenceId={sequenceId}
                  onSequenceChange={setSequenceId}
                  aiProspectCount={aiProspectCount}
                  onAiProspectCountChange={setAiProspectCount}
                  onBack={() => setStep(1)}
                  onNext={() => setStep(3)}
                />
              )}

              {step === 3 && selectedCandidatId && (
                <StepConfirmSend
                  candidatId={selectedCandidatId}
                  profile={profile}
                  emailSubject={emailSubject}
                  emailBody={emailBody}
                  prospectCount={selectedProspectIds.length}
                  aiProspectCount={aiProspectCount}
                  prospectClientIds={selectedProspectIds}
                  sequenceId={sequenceId}
                  onBack={() => setStep(2)}
                  onSend={(scheduled, scheduledAt) =>
                    createAndLaunchMutation.mutate({ scheduled, scheduledAt })
                  }
                  isSending={createAndLaunchMutation.isPending}
                />
              )}
            </motion.div>
          )}

          {tab === 'active' && (
            <motion.div
              key="active"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {loadingCampaigns ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 size={32} className="animate-spin text-neutral-400" />
                </div>
              ) : campaigns?.active && campaigns.active.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {campaigns.active.map((c) => (
                    <CampaignCard key={c.id} campaign={c} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
                  <Send size={40} strokeWidth={1.5} className="mb-3" />
                  <p className="text-sm font-medium">Aucune campagne en cours</p>
                  <p className="text-xs mt-1">Créez une nouvelle campagne pour commencer.</p>
                </div>
              )}
            </motion.div>
          )}

          {tab === 'completed' && (
            <motion.div
              key="completed"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {loadingCampaigns ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 size={32} className="animate-spin text-neutral-400" />
                </div>
              ) : campaigns?.completed && campaigns.completed.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {campaigns.completed.map((c) => (
                    <CampaignCard key={c.id} campaign={c} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
                  <CheckCircle2 size={40} strokeWidth={1.5} className="mb-3" />
                  <p className="text-sm font-medium">Aucune campagne terminée</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
