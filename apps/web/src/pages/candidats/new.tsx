import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  FileText,
  Loader2,
  Upload,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Input, { Textarea } from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { toast } from '../../components/ui/Toast';

const sourceOptions = [
  { value: '', label: 'Sélectionner...' },
  { value: 'LINKEDIN', label: 'LinkedIn' },
  { value: 'COOPTATION', label: 'Cooptation' },
  { value: 'CANDIDATURE_SPONTANEE', label: 'Candidature spontanée' },
  { value: 'JOBBOARD', label: 'Jobboard' },
  { value: 'CHASSE', label: 'Chasse' },
  { value: 'SITE_WEB', label: 'Site web' },
  { value: 'AUTRE', label: 'Autre' },
];

interface FormData {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  linkedinUrl: string;
  posteActuel: string;
  entrepriseActuelle: string;
  localisation: string;
  salaireActuel: string;
  salaireSouhaite: string;
  anneesExperience: string;
  disponibilite: string;
  mobilite: string;
  source: string;
  notes: string;
}

const initialForm: FormData = {
  nom: '',
  prenom: '',
  email: '',
  telephone: '',
  linkedinUrl: '',
  posteActuel: '',
  entrepriseActuelle: '',
  localisation: '',
  salaireActuel: '',
  salaireSouhaite: '',
  anneesExperience: '',
  disponibilite: '',
  mobilite: '',
  source: '',
  notes: '',
};

interface MandatOption {
  id: string;
  titrePoste: string;
  entreprise?: { nom: string };
}

interface CvParsingResult {
  candidate: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    city: string | null;
    current_title: string;
    current_company: string;
    linkedin_url: string | null;
    years_experience: number;
    languages: string[];
    skills: string[];
    education: { school: string; degree: string; year: number | null }[];
    experience: {
      title: string;
      company: string;
      start_year: number;
      end_year: number | null;
      highlights: string[];
    }[];
    sector: string;
    seniority: string;
  };
  pitch: {
    short: string;
    long: string;
    key_selling_points: string[];
    ideal_for: string;
  };
  anonymized_profile: {
    title: string;
    summary: string;
    bullet_points: string[];
  };
}

interface AiFields {
  aiPitchShort: string;
  aiPitchLong: string;
  aiSellingPoints: string[];
  aiIdealFor: string;
  aiAnonymizedProfile: {
    title: string;
    summary: string;
    bullet_points: string[];
  };
  aiParsedAt: string;
}

export default function CandidatNewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedMandatId = searchParams.get('mandatId') || '';
  const [form, setForm] = useState<FormData>(initialForm);
  const [selectedMandatId, setSelectedMandatId] = useState(preselectedMandatId);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  // CV parsing state
  const [cvParsed, setCvParsed] = useState<CvParsingResult | null>(null);
  const [aiFields, setAiFields] = useState<AiFields | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pitch editing state
  const [pitchShort, setPitchShort] = useState('');
  const [pitchLong, setPitchLong] = useState('');
  const [sellingPoints, setSellingPoints] = useState<string[]>([]);
  const [idealFor, setIdealFor] = useState('');
  const [showAnonymized, setShowAnonymized] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Entreprise autocomplete
  const { data: entrepriseSuggestions } = useQuery({
    queryKey: ['entreprises', 'names'],
    queryFn: async () => {
      const res = await api.get<{ data: { id: string; nom: string }[] }>('/entreprises?perPage=500&fields=id,nom');
      return res.data.map((e: { nom: string }) => e.nom);
    },
    staleTime: 5 * 60_000,
  });

  // Duplicate detection
  const [duplicateMatch, setDuplicateMatch] = useState<{ id: string; nom: string; prenom?: string; email?: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const email = form.email.trim();
    if (!email || !email.includes('@')) {
      setDuplicateMatch(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await api.get<{ exists: boolean; match?: { id: string; nom: string; prenom?: string; email?: string } }>(
          `/candidats/check-duplicate?email=${encodeURIComponent(email)}`,
        );
        if (result.exists && result.match) {
          setDuplicateMatch(result.match);
        } else {
          setDuplicateMatch(null);
        }
      } catch {
        setDuplicateMatch(null);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form.email]);

  // Fetch open mandats for linking
  const { data: mandatsData } = useQuery({
    queryKey: ['mandats', 'open-list'],
    queryFn: () => api.get<{ data: MandatOption[] }>('/mandats?perPage=100'),
  });

  const mandatOptions = [
    { value: '', label: 'Aucun mandat (optionnel)' },
    ...(mandatsData?.data || []).map((m) => ({
      value: m.id,
      label: `${m.titrePoste}${m.entreprise ? ` - ${m.entreprise.nom}` : ''}`,
    })),
  ];

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  // CV upload mutation
  const cvUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/v1/ai/parse-cv', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Erreur ${response.status}`);
      }

      return response.json() as Promise<{ data: CvParsingResult }>;
    },
    onSuccess: (result) => {
      const parsed = result.data;
      setCvParsed(parsed);

      // Populate form fields from parsed CV
      setForm((prev) => ({
        ...prev,
        nom: parsed.candidate.last_name || prev.nom,
        prenom: parsed.candidate.first_name || prev.prenom,
        email: parsed.candidate.email || prev.email,
        telephone: parsed.candidate.phone || prev.telephone,
        posteActuel: parsed.candidate.current_title || prev.posteActuel,
        entrepriseActuelle: parsed.candidate.current_company || prev.entrepriseActuelle,
        localisation: parsed.candidate.city || prev.localisation,
        linkedinUrl: parsed.candidate.linkedin_url || prev.linkedinUrl,
        anneesExperience: parsed.candidate.years_experience ? String(parsed.candidate.years_experience) : prev.anneesExperience,
      }));

      // Set pitch fields
      setPitchShort(parsed.pitch.short);
      setPitchLong(parsed.pitch.long);
      setSellingPoints(parsed.pitch.key_selling_points);
      setIdealFor(parsed.pitch.ideal_for);

      // Build AI fields for save
      setAiFields({
        aiPitchShort: parsed.pitch.short,
        aiPitchLong: parsed.pitch.long,
        aiSellingPoints: parsed.pitch.key_selling_points,
        aiIdealFor: parsed.pitch.ideal_for,
        aiAnonymizedProfile: parsed.anonymized_profile,
        aiParsedAt: new Date().toISOString(),
      });

      toast('success', 'CV analysé avec succès ! Les champs ont été pré-remplis.');
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de l\'analyse du CV');
    },
  });

  const handleFileUpload = useCallback((file: File) => {
    if (!file) return;

    // Validate file type
    if (file.type !== 'application/pdf') {
      toast('error', 'Seuls les fichiers PDF sont acceptés.');
      return;
    }

    // Validate file size (10 MB)
    if (file.size > 10 * 1024 * 1024) {
      toast('error', 'Le fichier est trop volumineux. Taille maximale : 10 Mo.');
      return;
    }

    setUploadedFileName(file.name);
    cvUploadMutation.mutate(file);
  }, [cvUploadMutation]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  }, [handleFileUpload]);

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

  const updateSellingPoint = (index: number, value: string) => {
    setSellingPoints((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  // Create candidature after candidate is created
  const candidatureMutation = useMutation({
    mutationFn: (payload: { candidatId: string; mandatId: string }) =>
      api.post('/candidatures', { ...payload, stage: 'SOURCING' }),
  });

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<{ id: string }>('/candidats', payload),
    onSuccess: async (created) => {
      // If a mandat is selected, create the candidature
      if (selectedMandatId) {
        try {
          await candidatureMutation.mutateAsync({
            candidatId: created.id,
            mandatId: selectedMandatId,
          });
        } catch {
          // continue even if candidature linking fails
        }
      }

      // Save parsed experiences from CV
      if (cvParsed?.candidate.experience && cvParsed.candidate.experience.length > 0) {
        try {
          for (const exp of cvParsed.candidate.experience) {
            await api.post(`/candidats/${created.id}/experiences`, {
              titre: exp.title,
              entreprise: exp.company,
              anneeDebut: exp.start_year,
              anneeFin: exp.end_year ?? null,
              highlights: exp.highlights || [],
              source: 'cv',
            });
          }
        } catch {
          // experiences are non-critical, continue navigation
        }
      }

      toast('success', selectedMandatId ? 'Candidat créé et affilié au mandat' : 'Candidat créé');
      navigate(`/candidats/${created.id}`);
    },
    onError: (error: any) => {
      if (error.data?.details) {
        const errs: Partial<Record<keyof FormData, string>> = {};
        for (const [key, msgs] of Object.entries(error.data.details)) {
          errs[key as keyof FormData] = (msgs as string[])[0];
        }
        setErrors(errs);
      } else {
        toast('error', error.message || 'Erreur lors de la création');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.nom.trim()) {
      setErrors({ nom: 'Le nom est requis' });
      return;
    }

    const payload: Record<string, unknown> = { nom: form.nom.trim() };
    if (form.prenom.trim()) payload.prenom = form.prenom.trim();
    if (form.email.trim()) payload.email = form.email.trim();
    if (form.telephone.trim()) payload.telephone = form.telephone.trim();
    if (form.linkedinUrl.trim()) payload.linkedinUrl = form.linkedinUrl.trim();
    if (form.posteActuel.trim()) payload.posteActuel = form.posteActuel.trim();
    if (form.entrepriseActuelle.trim()) payload.entrepriseActuelle = form.entrepriseActuelle.trim();
    if (form.localisation.trim()) payload.localisation = form.localisation.trim();
    if (form.salaireActuel) payload.salaireActuel = parseInt(form.salaireActuel, 10);
    if (form.salaireSouhaite) payload.salaireSouhaite = parseInt(form.salaireSouhaite, 10);
    if (form.anneesExperience) payload.anneesExperience = parseInt(form.anneesExperience, 10);
    if (form.disponibilite.trim()) payload.disponibilite = form.disponibilite.trim();
    if (form.mobilite.trim()) payload.mobilite = form.mobilite.trim();
    if (form.source) payload.source = form.source;
    if (form.notes.trim()) payload.notes = form.notes.trim();

    // Include AI tags from skills
    if (cvParsed?.candidate.skills && cvParsed.candidate.skills.length > 0) {
      payload.tags = cvParsed.candidate.skills;
    }

    // Include AI fields if CV was parsed (use edited values)
    if (aiFields) {
      payload.aiPitchShort = pitchShort;
      payload.aiPitchLong = pitchLong;
      payload.aiSellingPoints = sellingPoints;
      payload.aiIdealFor = idealFor;
      payload.aiAnonymizedProfile = cvParsed?.anonymized_profile || aiFields.aiAnonymizedProfile;
      payload.aiParsedAt = aiFields.aiParsedAt;
    }

    mutation.mutate(payload);
  };

  return (
    <div>
      <PageHeader
        title="Nouveau candidat"
        breadcrumbs={[
          { label: 'Candidats', href: '/candidats' },
          { label: 'Nouveau' },
        ]}
      />

      {/* CV Upload Dropzone */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring' as const, stiffness: 260, damping: 25 }}
        className="mb-6"
      >
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !cvUploadMutation.isPending && fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300 ${
            isDragging
              ? 'border-primary-500 bg-primary-50/50 scale-[1.01]'
              : cvUploadMutation.isPending
                ? 'border-primary-300 bg-primary-50/30'
                : uploadedFileName && cvParsed
                  ? 'border-green-300 bg-green-50/30'
                  : 'border-neutral-200 bg-white hover:border-primary-300 hover:bg-primary-50/20'
          } p-8`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileInputChange}
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
                    L'IA extrait les informations et génère le pitch commercial
                  </p>
                </div>
              </>
            ) : uploadedFileName && cvParsed ? (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100">
                  <Check size={28} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-700">
                    CV analysé : {uploadedFileName}
                  </p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    Les champs ont été pré-remplis. Vous pouvez déposer un autre CV pour remplacer.
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
                    L'IA extraira les informations automatiquement et générera un pitch commercial
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
      </motion.div>

      <div className={cvParsed ? 'grid grid-cols-1 gap-6 lg:grid-cols-3' : ''}>
        {/* Form Column */}
        <div className={cvParsed ? 'lg:col-span-2' : ''}>
          <form onSubmit={handleSubmit}>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring' as const, stiffness: 260, damping: 25 }}>
            <Card>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Input
                  label="Nom *"
                  value={form.nom}
                  onChange={set('nom')}
                  placeholder="Nom de famille"
                  required
                  error={errors.nom}
                />
                <Input
                  label="Prénom"
                  value={form.prenom}
                  onChange={set('prenom')}
                  placeholder="Prénom"
                />

                <Input
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  placeholder="email@exemple.com"
                  error={errors.email}
                />
                <Input
                  label="Téléphone"
                  type="tel"
                  value={form.telephone}
                  onChange={set('telephone')}
                  placeholder="+33 6 12 34 56 78"
                />

                <Input
                  label="LinkedIn"
                  value={form.linkedinUrl}
                  onChange={set('linkedinUrl')}
                  placeholder="https://linkedin.com/in/..."
                />
                <Input
                  label="Localisation"
                  value={form.localisation}
                  onChange={set('localisation')}
                  placeholder="Paris, France"
                />

                <Input
                  label="Poste actuel"
                  value={form.posteActuel}
                  onChange={set('posteActuel')}
                  placeholder="Développeur Senior"
                />
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">Entreprise actuelle</label>
                  <input
                    type="text"
                    list="entreprise-suggestions"
                    value={form.entrepriseActuelle}
                    onChange={(e) => set('entrepriseActuelle')(e as React.ChangeEvent<HTMLInputElement>)}
                    placeholder="Nom de l'entreprise"
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors"
                  />
                  <datalist id="entreprise-suggestions">
                    {(entrepriseSuggestions || []).map((nom: string) => (
                      <option key={nom} value={nom} />
                    ))}
                  </datalist>
                </div>

                <Input
                  label="Salaire actuel (EUR)"
                  type="number"
                  value={form.salaireActuel}
                  onChange={set('salaireActuel')}
                  placeholder="55000"
                />
                <Input
                  label="Salaire souhaité (EUR)"
                  type="number"
                  value={form.salaireSouhaite}
                  onChange={set('salaireSouhaite')}
                  placeholder="65000"
                />

                <Input
                  label="Années d'expérience"
                  type="number"
                  value={form.anneesExperience}
                  onChange={set('anneesExperience')}
                  placeholder="5"
                />

                <Select
                  label="Disponibilité"
                  options={[
                    { value: '', label: 'Sélectionner...' },
                    { value: 'Immédiate', label: 'Immédiate' },
                    { value: '1 mois', label: '1 mois' },
                    { value: '3 mois', label: '3 mois' },
                    { value: 'En poste', label: 'En poste' },
                  ]}
                  value={form.disponibilite}
                  onChange={(val) => setForm((prev) => ({ ...prev, disponibilite: val }))}
                  placeholder="Sélectionner..."
                />
                <Input
                  label="Mobilité"
                  value={form.mobilite}
                  onChange={set('mobilite')}
                  placeholder="Île-de-France, Remote..."
                />

                <Select
                  label="Source"
                  options={sourceOptions}
                  value={form.source}
                  onChange={(val) => setForm((prev) => ({ ...prev, source: val }))}
                  placeholder="Sélectionner une source"
                />
                <Select
                  label="Affilier à un mandat"
                  options={mandatOptions}
                  value={selectedMandatId}
                  onChange={setSelectedMandatId}
                  placeholder="Sélectionner un mandat"
                />

                <div className="sm:col-span-2">
                  <Textarea
                    label="Notes"
                    value={form.notes}
                    onChange={set('notes')}
                    placeholder="Notes libres sur le candidat..."
                  />
                </div>
              </div>

              {/* Tags from CV parsing */}
              {cvParsed && cvParsed.candidate.skills.length > 0 && (
                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-text-primary">
                    Compétences extraites du CV
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {cvParsed.candidate.skills.map((skill) => (
                      <Badge key={skill} variant="primary" size="sm">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {duplicateMatch && (
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
                  <div className="text-sm text-amber-800">
                    <span>Un candidat avec cet email existe déjà : </span>
                    <Link
                      to={`/candidats/${duplicateMatch.id}`}
                      className="font-medium underline hover:text-amber-900"
                    >
                      {duplicateMatch.prenom ? `${duplicateMatch.prenom} ` : ''}{duplicateMatch.nom} ({duplicateMatch.email})
                    </Link>
                  </div>
                </div>
              )}

              <div className="mt-6 flex items-center justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => navigate('/candidats')}>
                  Annuler
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Création...' : 'Créer'}
                </Button>
              </div>
            </Card>
            </motion.div>
          </form>
        </div>

        {/* Pitch Section (shown after CV parsing) */}
        <AnimatePresence>
          {cvParsed && (
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ type: 'spring' as const, stiffness: 260, damping: 25, delay: 0.1 }}
              className="space-y-6"
            >
              {/* Pitch Short */}
              <Card>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <Sparkles size={16} className="text-primary-500" />
                    Pitch court
                  </h3>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(pitchShort, 'pitchShort')}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-tertiary hover:bg-neutral-50 hover:text-text-primary transition-all"
                  >
                    {copiedField === 'pitchShort' ? <Check size={12} /> : <Copy size={12} />}
                    {copiedField === 'pitchShort' ? 'Copié' : 'Copier'}
                  </button>
                </div>
                <textarea
                  value={pitchShort}
                  onChange={(e) => setPitchShort(e.target.value)}
                  className="w-full resize-none rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2 text-sm text-text-primary focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100 transition-all"
                  rows={3}
                />
              </Card>

              {/* Pitch Long */}
              <Card>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <Sparkles size={16} className="text-primary-500" />
                    Pitch commercial
                  </h3>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(pitchLong, 'pitchLong')}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-tertiary hover:bg-neutral-50 hover:text-text-primary transition-all"
                  >
                    {copiedField === 'pitchLong' ? <Check size={12} /> : <Copy size={12} />}
                    {copiedField === 'pitchLong' ? 'Copié' : 'Copier'}
                  </button>
                </div>
                <textarea
                  value={pitchLong}
                  onChange={(e) => setPitchLong(e.target.value)}
                  className="w-full resize-none rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2 text-sm text-text-primary focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100 transition-all"
                  rows={8}
                />
              </Card>

              {/* Key Selling Points */}
              <Card>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Sparkles size={16} className="text-primary-500" />
                  Points forts
                </h3>
                <div className="space-y-2">
                  {sellingPoints.map((point, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-600">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={point}
                        onChange={(e) => updateSellingPoint(idx, e.target.value)}
                        className="flex-1 rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-1.5 text-sm text-text-primary focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100 transition-all"
                      />
                    </div>
                  ))}
                </div>
              </Card>

              {/* Ideal For */}
              <Card>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Sparkles size={16} className="text-primary-500" />
                  Idéal pour
                </h3>
                <input
                  type="text"
                  value={idealFor}
                  onChange={(e) => setIdealFor(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2 text-sm text-text-primary focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100 transition-all"
                />
              </Card>

              {/* Anonymized Profile (collapsible) */}
              <Card>
                <button
                  type="button"
                  onClick={() => setShowAnonymized(!showAnonymized)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <Sparkles size={16} className="text-primary-500" />
                    Profil anonymisé
                  </h3>
                  {showAnonymized ? <ChevronUp size={16} className="text-text-tertiary" /> : <ChevronDown size={16} className="text-text-tertiary" />}
                </button>

                <AnimatePresence>
                  {showAnonymized && cvParsed.anonymized_profile && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 space-y-3">
                        <div>
                          <p className="text-xs font-medium text-text-tertiary">Titre</p>
                          <p className="text-sm text-text-primary">{cvParsed.anonymized_profile.title}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-text-tertiary">Résumé</p>
                          <p className="whitespace-pre-wrap text-sm text-text-primary">{cvParsed.anonymized_profile.summary}</p>
                        </div>
                        <div>
                          <p className="mb-2 text-xs font-medium text-text-tertiary">Points clés</p>
                          <ul className="space-y-1">
                            {cvParsed.anonymized_profile.bullet_points.map((point, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-sm text-text-primary">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
                                {point}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const text = [
                              cvParsed.anonymized_profile.title,
                              '',
                              cvParsed.anonymized_profile.summary,
                              '',
                              ...cvParsed.anonymized_profile.bullet_points.map((p) => `- ${p}`),
                            ].join('\n');
                            copyToClipboard(text, 'anonymized');
                          }}
                          className="mt-2 flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-text-tertiary hover:bg-neutral-50 hover:text-text-primary transition-all"
                        >
                          {copiedField === 'anonymized' ? <Check size={12} /> : <Copy size={12} />}
                          {copiedField === 'anonymized' ? 'Copié' : 'Copier le profil'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>

              {/* Copy full pitch button */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    const fullPitch = [
                      pitchLong,
                      '',
                      'Points forts :',
                      ...sellingPoints.map((p, i) => `${i + 1}. ${p}`),
                      '',
                      `Idéal pour : ${idealFor}`,
                    ].join('\n');
                    copyToClipboard(fullPitch, 'fullPitch');
                  }}
                >
                  {copiedField === 'fullPitch' ? <Check size={14} /> : <Copy size={14} />}
                  {copiedField === 'fullPitch' ? 'Copié !' : 'Copier le pitch complet'}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
