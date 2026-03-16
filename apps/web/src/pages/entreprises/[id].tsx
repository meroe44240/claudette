import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, Globe, MapPin, Linkedin, Users, FileText, Pencil, Trash2, Save, X, Building, Building2, Phone, Mail, ChevronDown, ChevronUp, Briefcase, ExternalLink, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
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
import DeleteConfirmModal from '../../components/ui/DeleteConfirmModal';
import InlineEdit from '../../components/ui/InlineEdit';
import ProfileCompleteness from '../../components/ui/ProfileCompleteness';
import { toast } from '../../components/ui/Toast';

type TailleEntreprise = 'STARTUP' | 'PME' | 'ETI' | 'GRAND_GROUPE';

interface ClientContact {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  poste: string | null;
}

interface MandatInfo {
  id: string;
  titrePoste: string;
  statut: string;
  createdAt: string;
  _count?: { candidatures: number };
}

interface EntrepriseDetail {
  id: string;
  nom: string;
  secteur: string | null;
  siteWeb: string | null;
  taille: TailleEntreprise | null;
  localisation: string | null;
  linkedinUrl: string | null;
  logoUrl: string | null;
  notes: string | null;
  // Pappers fields
  siren: string | null;
  siret: string | null;
  formeJuridique: string | null;
  capitalSocial: number | null;
  chiffreAffaires: number | null;
  effectif: string | null;
  dateCreation: string | null;
  codeNAF: string | null;
  libelleNAF: string | null;
  adresseComplete: string | null;
  pappersUrl: string | null;
  pappersEnrichedAt: string | null;
  pappersRawData: unknown | null;
  _count?: { clients: number; mandats: number };
  clients?: ClientContact[];
  mandats?: MandatInfo[];
  createdAt: string;
  updatedAt: string;
}

const STATUT_COLORS: Record<string, string> = {
  OUVERT: 'bg-blue-50 text-blue-600',
  EN_COURS: 'bg-violet-50 text-violet-600',
  GAGNE: 'bg-emerald-50 text-emerald-600',
  PERDU: 'bg-red-50 text-red-600',
  ANNULE: 'bg-neutral-100 text-neutral-500',
  CLOTURE: 'bg-neutral-100 text-neutral-500',
};

const STATUT_LABELS: Record<string, string> = {
  OUVERT: 'Ouvert',
  EN_COURS: 'En cours',
  GAGNE: 'Gagné',
  PERDU: 'Perdu',
  ANNULE: 'Annulé',
  CLOTURE: 'Clôturé',
};

interface EntrepriseStats {
  revenueCumule: number;
  nombrePlacements: number;
  feeMoyen: number;
}

interface EditForm {
  nom: string;
  secteur: string;
  siteWeb: string;
  taille: string;
  localisation: string;
  linkedinUrl: string;
  notes: string;
}

const tailleLabels: Record<TailleEntreprise, string> = {
  STARTUP: 'Startup',
  PME: 'PME',
  ETI: 'ETI',
  GRAND_GROUPE: 'Grand Groupe',
};

const tailleOptions = [
  { value: '', label: 'Aucune' },
  { value: 'STARTUP', label: 'Startup' },
  { value: 'PME', label: 'PME' },
  { value: 'ETI', label: 'ETI' },
  { value: 'GRAND_GROUPE', label: 'Grand Groupe' },
];

function formatCurrency(value: number): string {
  if (value === 0) return '0\u20ac';
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k\u20ac`;
  return `${value}\u20ac`;
}

function formatEuro(value: number | null | undefined): string {
  if (value == null) return '\u2014';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

function formatDateFR(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u2014';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

const detailStagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const detailItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
};

function buildEditForm(entreprise: EntrepriseDetail): EditForm {
  return {
    nom: entreprise.nom || '',
    secteur: entreprise.secteur || '',
    siteWeb: entreprise.siteWeb || '',
    taille: entreprise.taille || '',
    localisation: entreprise.localisation || '',
    linkedinUrl: entreprise.linkedinUrl || '',
    notes: entreprise.notes || '',
  };
}

export default function EntrepriseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pappersOpen, setPappersOpen] = useState(true);

  const { data: entreprise, isLoading } = useQuery({
    queryKey: ['entreprise', id],
    queryFn: () => api.get<EntrepriseDetail>(`/entreprises/${id}`),
    enabled: !!id,
  });

  usePageTitle(entreprise ? entreprise.nom : 'Entreprise');

  const completenessFields = useMemo(() => {
    if (!entreprise) return [];
    return [
      { key: 'nom', label: 'Nom', filled: !!entreprise.nom },
      { key: 'secteur', label: 'Secteur', filled: !!entreprise.secteur },
      { key: 'siteWeb', label: 'Site web', filled: !!entreprise.siteWeb },
      { key: 'taille', label: 'Taille', filled: !!entreprise.taille },
      { key: 'localisation', label: 'Localisation', filled: !!entreprise.localisation },
      { key: 'linkedinUrl', label: 'LinkedIn', filled: !!entreprise.linkedinUrl },
      { key: 'siren', label: 'SIREN', filled: !!entreprise.siren },
    ];
  }, [entreprise]);

  const { data: stats } = useQuery({
    queryKey: ['entreprise-stats', id],
    queryFn: () => api.get<EntrepriseStats>(`/entreprises/${id}/stats`),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.put<EntrepriseDetail>(`/entreprises/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entreprise', id] });
      toast('success', 'Modifications enregistrées');
      setIsEditing(false);
      setEditForm(null);
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de la mise à jour');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/entreprises/${id}`),
    onSuccess: () => {
      toast('success', 'Supprimé avec succès');
      navigate('/entreprises');
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de la suppression');
    },
  });

  const pappersEnrichMutation = useMutation({
    mutationFn: () => api.post(`/integrations/pappers/enrich/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entreprise', id] });
      toast('success', 'Données Pappers mises à jour');
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de l\'enrichissement Pappers');
    },
  });

  const handleStartEdit = () => {
    if (entreprise) {
      setEditForm(buildEditForm(entreprise));
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
    if (editForm.secteur.trim()) payload.secteur = editForm.secteur.trim();
    else payload.secteur = null;
    if (editForm.siteWeb.trim()) payload.siteWeb = editForm.siteWeb.trim();
    else payload.siteWeb = null;
    if (editForm.taille) payload.taille = editForm.taille;
    else payload.taille = null;
    if (editForm.localisation.trim()) payload.localisation = editForm.localisation.trim();
    else payload.localisation = null;
    if (editForm.linkedinUrl.trim()) payload.linkedinUrl = editForm.linkedinUrl.trim();
    else payload.linkedinUrl = null;
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
          </div>
        </div>
      </div>
    );
  }

  if (!entreprise) {
    return (
      <div className="text-center py-16">
        <p className="text-text-secondary">Entreprise introuvable.</p>
        <Button variant="ghost" onClick={() => navigate('/entreprises')} className="mt-4">
          Retour aux entreprises
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={
          <div className="flex items-center gap-3">
            {(() => {
              const logoSrc = entreprise.logoUrl || (entreprise.siteWeb ? (() => {
                try {
                  const h = new URL(entreprise.siteWeb.startsWith('http') ? entreprise.siteWeb : `https://${entreprise.siteWeb}`).hostname;
                  return h && h !== 'localhost' ? `https://www.google.com/s2/favicons?domain=${h}&sz=128` : null;
                } catch { return null; }
              })() : null);
              return logoSrc ? (
                <img
                  src={logoSrc}
                  alt={entreprise.nom}
                  className="h-10 w-10 rounded-lg object-contain border border-neutral-100 bg-white p-0.5"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-50 border border-neutral-100">
                  <Building size={20} className="text-neutral-400" />
                </div>
              );
            })()}
            <span>{entreprise.nom}</span>
          </div>
        }
        breadcrumbs={[
          { label: 'Entreprises', href: '/entreprises' },
          { label: entreprise.nom },
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
                <Button variant="secondary" size="sm" onClick={handleStartEdit}>
                  <Pencil size={14} /> Modifier
                </Button>
                <Button variant="danger" size="sm" onClick={() => setShowDeleteModal(true)}>
                  <Trash2 size={14} /> Supprimer
                </Button>
                <Button variant="ghost" onClick={() => navigate('/entreprises')}>
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
                <Input label="Nom" value={editForm.nom} onChange={setField('nom')} placeholder="Nom de l'entreprise" />
                <Select
                  label="Secteur"
                  options={[
                    { value: '', label: 'Aucun' },
                    { value: 'Tech / SaaS', label: 'Tech / SaaS' },
                    { value: 'Finance / Banque', label: 'Finance / Banque' },
                    { value: 'Conseil', label: 'Conseil' },
                    { value: 'Industrie', label: 'Industrie' },
                    { value: 'Santé / Pharma', label: 'Santé / Pharma' },
                    { value: 'E-commerce / Retail', label: 'E-commerce / Retail' },
                    { value: 'Immobilier', label: 'Immobilier' },
                    { value: 'Énergie', label: 'Énergie' },
                    { value: 'Média / Communication', label: 'Média / Communication' },
                    { value: 'Assurance', label: 'Assurance' },
                    { value: 'Autre', label: 'Autre' },
                  ]}
                  value={editForm.secteur}
                  onChange={(val) => setEditForm((prev) => prev ? { ...prev, secteur: val } : prev)}
                  searchable
                />
                <Input label="Site web" value={editForm.siteWeb} onChange={setField('siteWeb')} placeholder="https://www.exemple.com" />
                <Select
                  label="Taille"
                  options={tailleOptions}
                  value={editForm.taille}
                  onChange={(val) => setEditForm((prev) => prev ? { ...prev, taille: val } : prev)}
                />
                <Input label="Localisation" value={editForm.localisation} onChange={setField('localisation')} placeholder="Paris, France" />
                <Input label="LinkedIn" value={editForm.linkedinUrl} onChange={setField('linkedinUrl')} placeholder="https://linkedin.com/company/..." />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <InlineEdit
                    value={entreprise.nom || ''}
                    onSave={async (v) => { if (v) updateMutation.mutateAsync({ nom: v }); }}
                    placeholder="Nom de l'entreprise"
                    label="Nom"
                  />
                </div>
                <div className="text-sm">
                  <InlineEdit
                    value={entreprise.secteur || ''}
                    onSave={async (v) => { updateMutation.mutateAsync({ secteur: v || null }); }}
                    placeholder="Secteur"
                    label="Secteur"
                  />
                </div>
                {entreprise.taille && (
                  <div className="text-sm">
                    <span className="text-text-tertiary">Taille : </span>
                    <Badge>{tailleLabels[entreprise.taille]}</Badge>
                  </div>
                )}
                {entreprise.localisation && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin size={14} className="text-text-tertiary" />
                    <span className="text-text-primary">{entreprise.localisation}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Globe size={14} className="shrink-0 text-text-tertiary" />
                  <InlineEdit
                    value={entreprise.siteWeb || ''}
                    onSave={async (v) => { updateMutation.mutateAsync({ siteWeb: v || null }); }}
                    placeholder="https://www.exemple.com"
                    type="url"
                  />
                </div>
                {entreprise.linkedinUrl && (
                  <div className="flex items-center gap-2 text-sm">
                    <Linkedin size={14} className="text-text-tertiary" />
                    <a href={entreprise.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      LinkedIn
                    </a>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">Notes</h2>
            {isEditing && editForm ? (
              <Textarea
                value={editForm.notes}
                onChange={setField('notes')}
                placeholder="Notes sur l'entreprise..."
              />
            ) : entreprise.notes ? (
              <p className="whitespace-pre-wrap text-sm text-text-secondary">{entreprise.notes}</p>
            ) : (
              <p className="text-sm text-text-secondary">Aucune note.</p>
            )}
          </Card>

          {/* Données Pappers */}
          <Card>
            <button
              type="button"
              className="flex w-full items-center justify-between"
              onClick={() => setPappersOpen(!pappersOpen)}
            >
              <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                <Building2 size={18} className="text-blue-500" />
                Données Pappers
              </h2>
              <div className="flex items-center gap-2">
                {entreprise.pappersEnrichedAt ? (
                  <Badge variant="success" size="sm">Enrichi le {formatDateFR(entreprise.pappersEnrichedAt)}</Badge>
                ) : (
                  <Badge variant="warning" size="sm">Non enrichi</Badge>
                )}
                {pappersOpen ? <ChevronUp size={16} className="text-text-tertiary" /> : <ChevronDown size={16} className="text-text-tertiary" />}
              </div>
            </button>

            {pappersOpen && (
              <div className="mt-4">
                {entreprise.pappersEnrichedAt ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="text-sm">
                      <dt className="text-text-tertiary text-xs uppercase tracking-wide mb-0.5">SIREN</dt>
                      <dd className="font-medium text-text-primary">{entreprise.siren || '\u2014'}</dd>
                    </div>
                    <div className="text-sm">
                      <dt className="text-text-tertiary text-xs uppercase tracking-wide mb-0.5">SIRET</dt>
                      <dd className="font-medium text-text-primary">{entreprise.siret || '\u2014'}</dd>
                    </div>
                    <div className="text-sm">
                      <dt className="text-text-tertiary text-xs uppercase tracking-wide mb-0.5">Forme juridique</dt>
                      <dd className="font-medium text-text-primary">{entreprise.formeJuridique || '\u2014'}</dd>
                    </div>
                    <div className="text-sm">
                      <dt className="text-text-tertiary text-xs uppercase tracking-wide mb-0.5">Capital social</dt>
                      <dd className="font-medium text-text-primary">{entreprise.capitalSocial != null ? formatEuro(entreprise.capitalSocial) : '\u2014'}</dd>
                    </div>
                    <div className="text-sm">
                      <dt className="text-text-tertiary text-xs uppercase tracking-wide mb-0.5">Chiffre d'affaires</dt>
                      <dd className="font-medium text-text-primary">{entreprise.chiffreAffaires != null ? formatEuro(entreprise.chiffreAffaires) : '\u2014'}</dd>
                    </div>
                    <div className="text-sm">
                      <dt className="text-text-tertiary text-xs uppercase tracking-wide mb-0.5">Effectif</dt>
                      <dd className="font-medium text-text-primary">{entreprise.effectif || '\u2014'}</dd>
                    </div>
                    <div className="text-sm">
                      <dt className="text-text-tertiary text-xs uppercase tracking-wide mb-0.5">Date de création</dt>
                      <dd className="font-medium text-text-primary">{formatDateFR(entreprise.dateCreation)}</dd>
                    </div>
                    <div className="text-sm">
                      <dt className="text-text-tertiary text-xs uppercase tracking-wide mb-0.5">Code NAF</dt>
                      <dd className="font-medium text-text-primary">
                        {entreprise.codeNAF || '\u2014'}
                        {entreprise.libelleNAF && <span className="text-text-secondary font-normal"> — {entreprise.libelleNAF}</span>}
                      </dd>
                    </div>
                    <div className="text-sm sm:col-span-2">
                      <dt className="text-text-tertiary text-xs uppercase tracking-wide mb-0.5">Adresse complète</dt>
                      <dd className="font-medium text-text-primary">{entreprise.adresseComplete || '\u2014'}</dd>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-text-secondary">
                    Aucune donnée Pappers. Cliquez sur le bouton ci-dessous pour enrichir cette fiche.
                  </p>
                )}

                <div className="mt-4 flex items-center gap-3 border-t border-neutral-50 pt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => pappersEnrichMutation.mutate()}
                    loading={pappersEnrichMutation.isPending}
                  >
                    {pappersEnrichMutation.isPending ? (
                      <>Enrichissement...</>
                    ) : entreprise.pappersEnrichedAt ? (
                      <><RefreshCw size={14} /> Rafraîchir via Pappers</>
                    ) : (
                      <><Building2 size={14} /> Enrichir via Pappers</>
                    )}
                  </Button>
                  {entreprise.pappersUrl && (
                    <a
                      href={entreprise.pappersUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                    >
                      <ExternalLink size={14} />
                      Voir la fiche Pappers
                    </a>
                  )}
                </div>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Sidebar */}
        <motion.div className="space-y-6" variants={detailItem}>
          <ProfileCompleteness fields={completenessFields} />
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-text-primary">Statistiques</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-text-tertiary">
                  <Users size={14} /> Clients
                </dt>
                <dd>
                  <Badge variant="info">{entreprise._count?.clients || 0}</Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="flex items-center gap-2 text-text-tertiary">
                  <FileText size={14} /> Mandats
                </dt>
                <dd>
                  <Badge variant="info">{entreprise._count?.mandats || 0}</Badge>
                </dd>
              </div>
              {stats && (
                <>
                  <div className="border-t border-border pt-3">
                    <dt className="text-text-tertiary">Placements</dt>
                    <dd className="mt-1 text-lg font-semibold text-text-primary">{stats.nombrePlacements}</dd>
                  </div>
                  <div>
                    <dt className="text-text-tertiary">Revenue cumulé</dt>
                    <dd className="mt-1 text-lg font-semibold text-text-primary">{formatCurrency(stats.revenueCumule)}</dd>
                  </div>
                  <div>
                    <dt className="text-text-tertiary">Fee moyen</dt>
                    <dd className="mt-1 text-lg font-semibold text-text-primary">{formatCurrency(stats.feeMoyen)}</dd>
                  </div>
                </>
              )}
            </dl>
          </Card>
        </motion.div>
      </motion.div>

      {/* Contacts section */}
      {entreprise.clients && entreprise.clients.length > 0 && (
        <motion.div className="mt-6" variants={detailItem}>
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                <Users size={18} className="text-violet-500" />
                Contacts ({entreprise.clients.length})
              </h2>
            </div>
            <div className="divide-y divide-neutral-50">
              {entreprise.clients.map((c) => (
                <Link
                  key={c.id}
                  to={`/clients/${c.id}`}
                  className="flex items-center gap-3 py-3 px-1 rounded-lg hover:bg-neutral-50 transition-colors group"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-600">
                    {(c.prenom?.[0] || '').toUpperCase()}{(c.nom[0] || '').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900 group-hover:text-violet-600 transition-colors">
                      {c.prenom} {c.nom}
                    </p>
                    {c.poste && <p className="text-xs text-neutral-500">{c.poste}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.telephone && (
                      <a
                        href={`tel:${c.telephone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] text-emerald-600 hover:bg-emerald-100 transition-colors"
                      >
                        <Phone size={11} />
                        {c.telephone}
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-100 transition-colors"
                      >
                        <Mail size={11} />
                      </a>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </motion.div>
      )}

      {/* Mandats section */}
      {entreprise.mandats && entreprise.mandats.length > 0 && (
        <motion.div className="mt-6" variants={detailItem}>
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                <Briefcase size={18} className="text-violet-500" />
                Mandats ({entreprise.mandats.length})
              </h2>
            </div>
            <div className="divide-y divide-neutral-50">
              {entreprise.mandats.map((m) => (
                <Link
                  key={m.id}
                  to={`/mandats/${m.id}`}
                  className="flex items-center gap-3 py-3 px-1 rounded-lg hover:bg-neutral-50 transition-colors group"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <FileText size={16} className="text-blue-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900 group-hover:text-violet-600 transition-colors">
                      {m.titrePoste}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUT_COLORS[m.statut] || 'bg-neutral-100 text-neutral-500'}`}>
                        {STATUT_LABELS[m.statut] || m.statut}
                      </span>
                      {m._count?.candidatures !== undefined && m._count.candidatures > 0 && (
                        <span className="text-[11px] text-neutral-400">
                          {m._count.candidatures} candidat{m._count.candidatures > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </motion.div>
      )}

      <div className="mt-8">
        <ActivityJournal entiteType="ENTREPRISE" entiteId={entreprise.id} />
      </div>

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => deleteMutation.mutate()}
        entityName={`l'entreprise ${entreprise.nom}`}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
