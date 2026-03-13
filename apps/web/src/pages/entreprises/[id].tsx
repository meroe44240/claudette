import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, Globe, MapPin, Linkedin, Users, FileText, Pencil, Trash2, Save, X, Building } from 'lucide-react';
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

type TailleEntreprise = 'STARTUP' | 'PME' | 'ETI' | 'GRAND_GROUPE';

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
  _count?: { clients: number; mandats: number };
  createdAt: string;
  updatedAt: string;
}

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

  const { data: entreprise, isLoading } = useQuery({
    queryKey: ['entreprise', id],
    queryFn: () => api.get<EntrepriseDetail>(`/entreprises/${id}`),
    enabled: !!id,
  });

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
                {entreprise.secteur && (
                  <div className="text-sm">
                    <span className="text-text-tertiary">Secteur : </span>
                    <span className="text-text-primary">{entreprise.secteur}</span>
                  </div>
                )}
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
                {entreprise.siteWeb && (
                  <div className="flex items-center gap-2 text-sm">
                    <Globe size={14} className="text-text-tertiary" />
                    <a href={entreprise.siteWeb} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {entreprise.siteWeb}
                    </a>
                  </div>
                )}
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
        </motion.div>

        {/* Sidebar */}
        <motion.div className="space-y-6" variants={detailItem}>
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
