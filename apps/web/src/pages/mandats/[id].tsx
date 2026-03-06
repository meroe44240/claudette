import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, Building2, User, MapPin, Calendar, Euro, LayoutGrid, Pencil, Trash2, Save, X } from 'lucide-react';
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
  createdAt: string;
  updatedAt: string;
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
  GAGNE: 'Gagn\u00e9',
  PERDU: 'Perdu',
  ANNULE: 'Annul\u00e9',
  CLOTURE: 'Cl\u00f4tur\u00e9',
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
  { value: 'GAGNE', label: 'Gagn\u00e9' },
  { value: 'PERDU', label: 'Perdu' },
  { value: 'ANNULE', label: 'Annul\u00e9' },
  { value: 'CLOTURE', label: 'Cl\u00f4tur\u00e9' },
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
  NON_FACTURE: 'Non factur\u00e9',
  FACTURE: 'Factur\u00e9',
  PAYE: 'Pay\u00e9',
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
  CONTACTE: 'Contact\u00e9',
  ENTRETIEN_1: 'Entretien 1',
  ENTRETIEN_CLIENT: 'Entretien Client',
  OFFRE: 'Offre',
  PLACE: 'Plac\u00e9',
  REFUSE: 'Refus\u00e9',
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

export default function MandatDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

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
      toast('success', 'Modifications enregistr\u00e9es');
      setIsEditing(false);
      setEditForm(null);
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de la mise \u00e0 jour');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/mandats/${id}`),
    onSuccess: () => {
      toast('success', 'Supprim\u00e9 avec succ\u00e8s');
      navigate('/mandats');
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de la suppression');
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
                  label="Priorit\u00e9"
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

          <Card>
            <h2 className="mb-4 text-lg font-semibold text-text-primary">
              Candidatures ({mandat.candidatures.length})
            </h2>
            {mandat.candidatures.length === 0 ? (
              <p className="text-sm text-text-secondary">Aucun candidat associ\u00e9 pour le moment.</p>
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
                          .join(' @ ') || 'Aucun poste renseign\u00e9'}
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
            <h2 className="mb-4 text-lg font-semibold text-text-primary">D\u00e9tails</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-text-tertiary">Priorit\u00e9</dt>
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
                  <dt className="text-text-tertiary">Date de cl\u00f4ture</dt>
                  <dd className="font-medium text-text-primary">{formatDate(mandat.dateCloture)}</dd>
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
                <dt className="text-text-tertiary">Fee estim\u00e9</dt>
                <dd className="font-medium text-text-primary">{formatSalary(mandat.feeMontantEstime)}</dd>
              </div>
              <div>
                <dt className="text-text-tertiary">Fee factur\u00e9</dt>
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
