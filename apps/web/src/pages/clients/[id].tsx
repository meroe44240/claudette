import { useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, Phone, Linkedin, Building2, Briefcase, Calendar, Send, Pencil, Trash2, Save, X, UserPlus, Bot, Link2, Check, CalendarPlus, Copy, ChevronDown, User, RefreshCw, Rocket } from 'lucide-react';
import { Link } from 'react-router';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth-store';
import { usePageTitle } from '../../hooks/usePageTitle';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import Input, { Textarea } from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Skeleton, { SkeletonCard } from '../../components/ui/Skeleton';
import EmailComposer from '../../components/email/EmailComposer';
import ScheduleMeeting from '../../components/calendar/ScheduleMeeting';
import ActivityJournal from '../../components/activity/ActivityJournal';
import DeleteConfirmModal from '../../components/ui/DeleteConfirmModal';
import CallBriefPanel from '../../components/ai/CallBriefPanel';
import InlineEdit from '../../components/ui/InlineEdit';
import ProfileCompleteness from '../../components/ui/ProfileCompleteness';
import { toast } from '../../components/ui/Toast';

type RoleContact = 'HIRING_MANAGER' | 'DRH' | 'PROCUREMENT' | 'CEO' | 'AUTRE';
type StatutClient =
  | 'LEAD'
  | 'PREMIER_CONTACT'
  | 'BESOIN_QUALIFIE'
  | 'PROPOSITION_ENVOYEE'
  | 'MANDAT_SIGNE'
  | 'RECURRENT'
  | 'INACTIF';
type TypeClient = 'INBOUND' | 'OUTBOUND' | 'RESEAU' | 'CLIENT_ACTIF' | 'RECURRENT';

interface PushCV {
  id: string;
  candidat: { id: string; nom: string; prenom: string; posteActuel: string };
  prospect: { companyName: string; contactName: string };
  recruiter: string;
  canal: string;
  status: string;
  sentAt: string;
}

interface Mandat {
  id: string;
  titrePoste: string;
  statut: string;
  priorite: string;
  salaireMin: number | null;
  salaireMax: number | null;
}

interface ClientDetail {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  poste: string | null;
  roleContact: RoleContact | null;
  linkedinUrl: string | null;
  statutClient: StatutClient;
  typeClient: TypeClient;
  computedType?: TypeClient;
  notes: string | null;
  entreprise: {
    id: string;
    nom: string;
    secteur: string | null;
    localisation: string | null;
    siren: string | null;
    effectif: string | null;
    chiffreAffaires: number | null;
    pappersEnrichedAt: string | null;
  };
  assignedTo: {
    id: string;
    nom: string;
    prenom: string | null;
    avatarUrl?: string | null;
  } | null;
  lastActivityAt: string | null;
  mandats: Mandat[];
  createdAt: string;
  updatedAt: string;
}

interface EditForm {
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  poste: string;
  roleContact: string;
  linkedinUrl: string;
  typeClient: string;
  notes: string;
}

const roleLabels: Record<RoleContact, string> = {
  HIRING_MANAGER: 'Hiring Manager',
  DRH: 'DRH',
  PROCUREMENT: 'Procurement',
  CEO: 'CEO',
  AUTRE: 'Autre',
};

const roleContactOptions = [
  { value: '', label: 'Aucun' },
  { value: 'HIRING_MANAGER', label: 'Hiring Manager' },
  { value: 'DRH', label: 'DRH' },
  { value: 'PROCUREMENT', label: 'Procurement' },
  { value: 'CEO', label: 'CEO' },
  { value: 'AUTRE', label: 'Autre' },
];

const statutLabels: Record<StatutClient, string> = {
  LEAD: 'Lead',
  PREMIER_CONTACT: 'Premier contact',
  BESOIN_QUALIFIE: 'Besoin qualifié',
  PROPOSITION_ENVOYEE: 'Proposition envoyée',
  MANDAT_SIGNE: 'Mandat signé',
  RECURRENT: 'Récurrent',
  INACTIF: 'Inactif',
};

const statutVariant: Record<StatutClient, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  LEAD: 'default',
  PREMIER_CONTACT: 'info',
  BESOIN_QUALIFIE: 'info',
  PROPOSITION_ENVOYEE: 'warning',
  MANDAT_SIGNE: 'success',
  RECURRENT: 'success',
  INACTIF: 'error',
};

const typeClientLabels: Record<TypeClient, string> = {
  INBOUND: '📩 Inbound',
  OUTBOUND: '🎯 Outbound',
  RESEAU: '🤝 Réseau',
  CLIENT_ACTIF: '✅ Client actif',
  RECURRENT: '⭐ Récurrent',
};

const typeClientVariant: Record<TypeClient, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  INBOUND: 'success',
  OUTBOUND: 'info',
  RESEAU: 'default',
  CLIENT_ACTIF: 'info',
  RECURRENT: 'warning',
};

const typeClientEditOptions = [
  { value: 'INBOUND', label: '📩 Inbound' },
  { value: 'OUTBOUND', label: '🎯 Outbound' },
  { value: 'RESEAU', label: '🤝 Réseau' },
];

const statutMandatVariant: Record<string, 'default' | 'info' | 'success' | 'error' | 'warning'> = {
  OUVERT: 'info',
  EN_COURS: 'warning',
  GAGNE: 'success',
  PERDU: 'error',
  ANNULE: 'error',
  CLOTURE: 'default',
};

function formatEuroCompact(value: number | null | undefined): string {
  if (value == null) return '\u2014';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

const detailStagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const detailItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 24 } },
};

function buildEditForm(client: ClientDetail): EditForm {
  return {
    nom: client.nom || '',
    prenom: client.prenom || '',
    email: client.email || '',
    telephone: client.telephone || '',
    poste: client.poste || '',
    roleContact: client.roleContact || '',
    linkedinUrl: client.linkedinUrl || '',
    typeClient: client.typeClient || 'INBOUND',
    notes: client.notes || '',
  };
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [emailDefaults, setEmailDefaults] = useState({ subject: '', body: '' });
  const [showScheduleMeeting, setShowScheduleMeeting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCallBrief, setShowCallBrief] = useState(false);
  const [bookingCopied, setBookingCopied] = useState(false);
  const [showBookingDropdown, setShowBookingDropdown] = useState(false);

  const { data: bookingSettings } = useQuery({
    queryKey: ['booking', 'settings'],
    queryFn: () => api.get<{ slug: string; isActive: boolean }>('/booking/settings'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const bookingSlug = bookingSettings?.isActive ? bookingSettings.slug : null;

  const handleCopyBookingLink = useCallback(() => {
    if (!bookingSlug) return;
    const link = `https://ats.propium.co/book/${bookingSlug}`;
    navigator.clipboard.writeText(link).then(() => {
      toast('success', 'Lien booking copié !');
      setBookingCopied(true);
      setTimeout(() => setBookingCopied(false), 2000);
    });
  }, [bookingSlug]);

  const { data: client, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: () => api.get<ClientDetail>(`/clients/${id}`),
    enabled: !!id,
  });

  usePageTitle(client ? `${client.prenom || ''} ${client.nom}`.trim() : 'Client');

  const { data: pushes } = useQuery({
    queryKey: ['pushes-client', client?.id],
    queryFn: () => api.get<PushCV[]>(`/pushes/by-client-email/${encodeURIComponent(client!.email!)}`),
    enabled: !!client?.email,
  });

  const completenessFields = useMemo(() => {
    if (!client) return [];
    return [
      { key: 'nom', label: 'Nom', filled: !!client.nom },
      { key: 'email', label: 'Email', filled: !!client.email },
      { key: 'telephone', label: 'Téléphone', filled: !!client.telephone },
      { key: 'poste', label: 'Poste', filled: !!client.poste },
      { key: 'entreprise', label: 'Entreprise', filled: !!client.entreprise },
      { key: 'roleContact', label: 'Rôle contact', filled: !!client.roleContact },
      { key: 'linkedinUrl', label: 'LinkedIn', filled: !!client.linkedinUrl },
    ];
  }, [client]);

  const handleSendBookingEmail = useCallback(() => {
    if (!bookingSlug || !client) return;
    const firstName = client.prenom || client.nom || '';
    const link = `https://ats.propium.co/book/${bookingSlug}`;
    setEmailDefaults({
      subject: 'Réservez un créneau pour notre échange',
      body: `Bonjour ${firstName},\n\nJe vous propose de choisir un créneau qui vous convient pour notre prochain échange :\n\n👉 ${link}\n\nN'hésitez pas à sélectionner le créneau qui vous arrange le mieux.\n\nCordialement`,
    });
    setShowBookingDropdown(false);
    setShowEmailComposer(true);
  }, [bookingSlug, client]);

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.put<ClientDetail>(`/clients/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      toast('success', 'Modifications enregistrées');
      setIsEditing(false);
      setEditForm(null);
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de la mise à jour');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/clients/${id}`),
    onSuccess: () => {
      toast('success', 'Supprimé avec succès');
      navigate('/clients');
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de la suppression');
    },
  });

  // ── Ownership mutations ──────────────────────────────────
  const assignMutation = useMutation({
    mutationFn: (assignedToId: string | null) =>
      api.put<ClientDetail>(`/clients/${id}/assign`, { assignedToId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast('success', 'Prise en charge mise à jour');
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de la prise en charge');
    },
  });

  const pappersEnrichMutation = useMutation({
    mutationFn: () => api.post(`/integrations/pappers/enrich/${client?.entreprise?.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      toast('success', 'Données Pappers mises à jour');
    },
    onError: (error: any) => {
      toast('error', error.message || 'Erreur lors de l\'enrichissement Pappers');
    },
  });

  const handleClaim = () => {
    if (currentUser) {
      assignMutation.mutate(currentUser.id);
    }
  };

  const handleRelease = () => {
    assignMutation.mutate(null);
  };

  // Compute days until ownership expiry
  const isOwner = client?.assignedTo?.id === currentUser?.id;
  const isAdmin = currentUser?.role === 'ADMIN';
  const daysSinceActivity = client?.lastActivityAt
    ? Math.floor((Date.now() - new Date(client.lastActivityAt).getTime()) / (1000 * 60 * 60 * 24))
    : Infinity;
  const daysUntilExpiry = client?.assignedTo ? Math.max(0, 60 - daysSinceActivity) : null;

  const handleStartEdit = () => {
    if (client) {
      setEditForm(buildEditForm(client));
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
    if (editForm.poste.trim()) payload.poste = editForm.poste.trim();
    else payload.poste = null;
    if (editForm.roleContact) payload.roleContact = editForm.roleContact;
    else payload.roleContact = null;
    if (editForm.linkedinUrl.trim()) payload.linkedinUrl = editForm.linkedinUrl.trim();
    else payload.linkedinUrl = null;
    if (editForm.typeClient) payload.typeClient = editForm.typeClient;
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

  if (!client) {
    return (
      <div className="text-center py-16">
        <p className="text-text-secondary">Client introuvable.</p>
        <Button variant="ghost" onClick={() => navigate('/clients')} className="mt-4">
          Retour aux clients
        </Button>
      </div>
    );
  }

  const fullName = `${client.prenom || ''} ${client.nom}`.trim();

  return (
    <div>
      <PageHeader
        title={fullName}
        breadcrumbs={[
          { label: 'Clients', href: '/clients' },
          { label: fullName },
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
                <Button variant="secondary" size="sm" onClick={() => { setEmailDefaults({ subject: '', body: '' }); setShowEmailComposer(true); }}>
                  <Send size={14} /> Envoyer un email
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowScheduleMeeting(true)}>
                  <Calendar size={14} /> Planifier un RDV
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShowCallBrief(true)}>
                  <Bot size={14} /> Brief pre-appel
                </Button>
                {bookingSlug && (
                  <div className="relative">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowBookingDropdown(!showBookingDropdown)}
                    >
                      <CalendarPlus size={14} /> Lien booking
                      <ChevronDown size={12} />
                    </Button>
                    {showBookingDropdown && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowBookingDropdown(false)} />
                        <div className="absolute right-0 top-full mt-1 z-20 w-96 rounded-xl border border-border bg-white shadow-lg overflow-hidden p-3">
                          <p className="mb-2 text-xs font-semibold text-text-tertiary uppercase tracking-wider">Lien de booking</p>
                          <div className="flex items-center gap-2">
                            <span className="flex-1 truncate rounded-lg bg-neutral-50 px-3 py-1.5 text-xs text-text-secondary font-mono">
                              ats.propium.co/book/{bookingSlug}
                            </span>
                            <button
                              type="button"
                              onClick={handleCopyBookingLink}
                              className="shrink-0 rounded-lg p-1.5 hover:bg-neutral-100 transition-colors"
                              title="Copier le lien"
                            >
                              {bookingCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-text-tertiary" />}
                            </button>
                            {client.email && (
                              <button
                                type="button"
                                onClick={handleSendBookingEmail}
                                className="shrink-0 rounded-lg p-1.5 hover:bg-primary-50 transition-colors"
                                title="Envoyer par email"
                              >
                                <Send size={14} className="text-primary-500" />
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <Button variant="ghost" onClick={() => navigate('/clients')}>
                  <ArrowLeft size={16} /> Retour
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Ownership section */}
      <div className="mb-5 flex items-center gap-3 rounded-xl border border-border/50 bg-white p-4 shadow-card">
        <span className="text-sm font-medium text-text-tertiary">Prise en charge :</span>
        {client.assignedTo ? (
          <>
            <Avatar
              src={client.assignedTo.avatarUrl}
              nom={client.assignedTo.nom}
              prenom={client.assignedTo.prenom}
              size="sm"
            />
            <span className="text-sm font-medium text-text-primary">
              {client.assignedTo.prenom} {client.assignedTo.nom}
            </span>
            {isOwner && <Badge variant="success" size="sm">Mon client</Badge>}
            {daysUntilExpiry !== null && daysUntilExpiry <= 7 && (
              <Badge variant="warning" size="sm">
                Expire dans {daysUntilExpiry}j
              </Badge>
            )}
            {(isOwner || isAdmin) && (
              <button
                onClick={handleRelease}
                disabled={assignMutation.isPending}
                className="ml-auto text-xs text-red-500 hover:underline disabled:opacity-50"
              >
                Libérer
              </button>
            )}
          </>
        ) : (
          <>
            <Badge variant="success" size="sm">Disponible</Badge>
            <Button
              size="sm"
              variant="primary"
              onClick={handleClaim}
              loading={assignMutation.isPending}
            >
              <UserPlus size={14} /> Prendre en charge
            </Button>
          </>
        )}
      </div>

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
                <Input label="Téléphone" value={editForm.telephone} onChange={setField('telephone')} placeholder="+33 1 23 45 67 89" />
                <Input label="Poste" value={editForm.poste} onChange={setField('poste')} placeholder="Directeur des ressources humaines" />
                <Select
                  label="Rôle contact"
                  options={roleContactOptions}
                  value={editForm.roleContact}
                  onChange={(val) => setEditForm((prev) => prev ? { ...prev, roleContact: val } : prev)}
                />
                <Input label="LinkedIn" value={editForm.linkedinUrl} onChange={setField('linkedinUrl')} placeholder="https://linkedin.com/in/..." />
                <Select
                  label="Type client"
                  options={typeClientEditOptions}
                  value={editForm.typeClient}
                  onChange={(val) => setEditForm((prev) => prev ? { ...prev, typeClient: val } : prev)}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-sm sm:col-span-2">
                  <User size={14} className="shrink-0 text-text-tertiary" />
                  <InlineEdit
                    value={client.nom || ''}
                    onSave={async (v) => { if (v) updateMutation.mutateAsync({ nom: v }); }}
                    placeholder="Nom"
                    label="Nom"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail size={14} className="shrink-0 text-text-tertiary" />
                  <InlineEdit
                    value={client.email || ''}
                    onSave={async (v) => { updateMutation.mutateAsync({ email: v || null }); }}
                    placeholder="email@exemple.com"
                    type="email"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone size={14} className="shrink-0 text-text-tertiary" />
                  <InlineEdit
                    value={client.telephone || ''}
                    onSave={async (v) => { updateMutation.mutateAsync({ telephone: v || null }); }}
                    placeholder="+33 1 23 45 67 89"
                    type="tel"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Briefcase size={14} className="shrink-0 text-text-tertiary" />
                  <InlineEdit
                    value={client.poste || ''}
                    onSave={async (v) => { updateMutation.mutateAsync({ poste: v || null }); }}
                    placeholder="Poste"
                  />
                </div>
                {client.linkedinUrl && (
                  <div className="flex items-center gap-2 text-sm">
                    <Linkedin size={14} className="text-text-tertiary" />
                    <a href={client.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      LinkedIn
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Building2 size={14} className="text-text-tertiary" />
                  <span
                    className="text-accent hover:underline cursor-pointer"
                    onClick={() => navigate(`/entreprises/${client.entreprise.id}`)}
                  >
                    {client.entreprise.nom}
                  </span>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold text-text-primary">Mandats</h2>
            {client.mandats.length === 0 ? (
              <p className="text-sm text-text-secondary">Aucun mandat associé.</p>
            ) : (
              <div className="space-y-3">
                {client.mandats.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-primary-50/30 cursor-pointer"
                    onClick={() => navigate(`/mandats/${m.id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium text-text-primary">{m.titrePoste}</p>
                      {m.salaireMin && m.salaireMax && (
                        <p className="text-xs text-text-secondary">
                          {(m.salaireMin / 1000).toFixed(0)}k\u20ac - {(m.salaireMax / 1000).toFixed(0)}k\u20ac
                        </p>
                      )}
                    </div>
                    <Badge variant={statutMandatVariant[m.statut] || 'default'}>
                      {m.statut}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Sidebar */}
        <motion.div className="space-y-6" variants={detailItem}>
          <ProfileCompleteness fields={completenessFields} />

          {/* Mini entreprise card */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={16} className="text-blue-500" />
              <h2 className="text-sm font-semibold text-text-primary">Entreprise</h2>
            </div>
            <div className="space-y-2 text-sm">
              <Link
                to={`/entreprises/${client.entreprise.id}`}
                className="font-medium text-accent hover:underline block"
              >
                {client.entreprise.nom}
              </Link>
              {client.entreprise.siren && (
                <div className="flex items-center justify-between">
                  <span className="text-text-tertiary">SIREN</span>
                  <span className="font-medium text-text-primary">{client.entreprise.siren}</span>
                </div>
              )}
              {client.entreprise.effectif && (
                <div className="flex items-center justify-between">
                  <span className="text-text-tertiary">Effectif</span>
                  <span className="font-medium text-text-primary">{client.entreprise.effectif}</span>
                </div>
              )}
              {client.entreprise.chiffreAffaires != null && (
                <div className="flex items-center justify-between">
                  <span className="text-text-tertiary">CA</span>
                  <span className="font-medium text-text-primary">{formatEuroCompact(client.entreprise.chiffreAffaires)}</span>
                </div>
              )}
              <div className="pt-1">
                {client.entreprise.pappersEnrichedAt ? (
                  <Badge variant="success" size="sm">Enrichi Pappers</Badge>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline disabled:opacity-50"
                    onClick={() => pappersEnrichMutation.mutate()}
                    disabled={pappersEnrichMutation.isPending}
                  >
                    {pappersEnrichMutation.isPending ? (
                      <><RefreshCw size={12} className="animate-spin" /> Enrichissement...</>
                    ) : (
                      <><Building2 size={12} /> Enrichir via Pappers</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold text-text-primary">Détails</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-text-tertiary">Statut</dt>
                <dd className="mt-1">
                  <Badge variant={statutVariant[client.statutClient]}>
                    {statutLabels[client.statutClient]}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-text-tertiary">Type</dt>
                <dd className="mt-1 flex items-center gap-2">
                  {(() => {
                    const displayType = client.computedType || client.typeClient;
                    const isAutoType = displayType === 'CLIENT_ACTIF' || displayType === 'RECURRENT';
                    return (
                      <>
                        <Badge variant={typeClientVariant[displayType]}>
                          {typeClientLabels[displayType]}
                        </Badge>
                        {isAutoType && (
                          <span className="text-[10px] text-text-tertiary italic">auto</span>
                        )}
                      </>
                    );
                  })()}
                </dd>
              </div>
              <div>
                <dt className="text-text-tertiary">Rôle</dt>
                <dd className="mt-1 font-medium text-text-primary">
                  {client.roleContact ? roleLabels[client.roleContact] : '\u2014'}
                </dd>
              </div>
              <div>
                <dt className="text-text-tertiary">Entreprise</dt>
                <dd className="mt-1">
                  <span
                    className="font-medium text-accent hover:underline cursor-pointer"
                    onClick={() => navigate(`/entreprises/${client.entreprise.id}`)}
                  >
                    {client.entreprise.nom}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-text-tertiary">Mandats associés</dt>
                <dd className="mt-1">
                  <Badge variant="info">{client.mandats.length}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-text-tertiary">Assigné à</dt>
                <dd className="mt-1">
                  {client.assignedTo ? (
                    <span className="font-medium text-text-primary">
                      {client.assignedTo.prenom} {client.assignedTo.nom}
                    </span>
                  ) : (
                    <Badge variant="success" size="sm">Disponible</Badge>
                  )}
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
                placeholder="Notes sur le contact client..."
              />
            ) : client.notes ? (
              <p className="whitespace-pre-wrap text-sm text-text-secondary">{client.notes}</p>
            ) : (
              <p className="text-sm text-text-secondary">Aucune note.</p>
            )}
          </Card>
        </motion.div>
      </motion.div>

      {/* Push CV reçus */}
      <div className="mt-8">
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Rocket className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Push CV reçus</h3>
          </div>
          {pushes && pushes.length > 0 ? (
            <div className="divide-y divide-border">
              {pushes.map((push) => {
                const statusColors: Record<string, string> = {
                  ENVOYE: 'bg-blue-100 text-blue-800',
                  OUVERT: 'bg-yellow-100 text-yellow-800',
                  REPONDU: 'bg-green-100 text-green-800',
                  RDV_BOOK: 'bg-purple-100 text-purple-800',
                  CONVERTI_MANDAT: 'bg-emerald-100 text-emerald-800',
                  SANS_SUITE: 'bg-gray-100 text-gray-800',
                };
                return (
                  <div key={push.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {push.candidat.prenom} {push.candidat.nom}
                          {push.candidat.posteActuel && (
                            <span className="text-text-secondary font-normal"> — {push.candidat.posteActuel}</span>
                          )}
                        </p>
                        <p className="text-xs text-text-secondary">{push.prospect.companyName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700">
                        {push.canal}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[push.status] || 'bg-gray-100 text-gray-800'}`}>
                        {push.status}
                      </span>
                      <span className="text-xs text-text-secondary">
                        {format(new Date(push.sentAt), 'dd MMM yyyy', { locale: fr })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-text-secondary">Aucun push CV reçu</p>
          )}
        </Card>
      </div>

      <div className="mt-8">
        <ActivityJournal entiteType="CLIENT" entiteId={client.id} />
      </div>

      <EmailComposer
        isOpen={showEmailComposer}
        onClose={() => setShowEmailComposer(false)}
        defaultTo={client.email || ''}
        defaultSubject={emailDefaults.subject}
        defaultBody={emailDefaults.body}
        entiteType="client"
        entiteId={client.id}
        clientId={client.id}
      />

      <ScheduleMeeting
        isOpen={showScheduleMeeting}
        onClose={() => setShowScheduleMeeting(false)}
        defaultTitle={`Réunion - ${fullName}`}
        defaultParticipants={client.email ? [client.email] : []}
        entiteType="client"
        entiteId={client.id}
      />

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => deleteMutation.mutate()}
        entityName={`le client ${fullName}`}
        isLoading={deleteMutation.isPending}
      />

      <CallBriefPanel
        entityType="CLIENT"
        entityId={client.id}
        entityName={fullName}
        isOpen={showCallBrief}
        onClose={() => setShowCallBrief(false)}
      />
    </div>
  );
}
