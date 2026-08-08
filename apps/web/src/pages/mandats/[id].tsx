import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Users, Trash2, ArrowRight, Pencil, Check, X, FileText, RefreshCw, ChevronDown, Loader2, Info, Mail, UserPlus, Search } from 'lucide-react';
import { api } from '../../lib/api-client';
import { usePageTitle } from '../../hooks/usePageTitle';
import Input, { Textarea } from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Skeleton, { SkeletonCard } from '../../components/ui/Skeleton';
import MandatTimeline from '../../components/activity/MandatTimeline';
import DeleteConfirmModal from '../../components/ui/DeleteConfirmModal';
import { toast } from '../../components/ui/Toast';
import { useStageChange } from '../../components/mandats/useStageChange';
import TrameEditor from '../../components/mandats/TrameEditor';

// ─── BRAND TOKENS ───────────────────────────────────
const NAVY = '#22177A';
const LIME = '#E6E9AF';
const INK = '#1A1533';
const SECONDARY = '#4A4568';
const MUTED = '#8A8699';
const FAINT = '#9A96AE';
const TERTIARY = '#6E6A85';
const CARD_BORDER = '1px solid rgba(34,23,122,0.08)';
const CARD_SHADOW = '0 1px 2px rgba(34,23,122,0.04)';
const ARCHIVO = "'Archivo Black', sans-serif";
const MANROPE = "'Manrope', sans-serif";

function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ─── TYPES ──────────────────────────────────────────
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

interface UserRef {
  id: string;
  nom: string;
  prenom: string | null;
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
  type?: 'CLIENT' | 'VIVIER';
  client: {
    id: string;
    nom: string;
    prenom: string | null;
    email: string | null;
    telephone: string | null;
  } | null;
  sales?: UserRef | null;
  recruteur?: UserRef | null;
  candidatures: Candidature[];
  ficheDePoste: string | null;
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

interface AccessContact {
  name: string;
  email: string;
  role: string;
  pwd: string;
  sentAt: number | null;
}

// Portail client — formes du vrai back-end (/portal)
interface PortalAccessRow {
  id: string;
  email: string;
  lastLoginAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  client: { id: string; nom: string; prenom: string | null } | null;
}
interface PortalEventRow {
  id: string;
  type: string;
  candidatureId: string | null;
  payload: unknown;
  createdAt: string;
  portalAccess: { email: string; client: { nom: string; prenom: string | null } | null } | null;
}

interface JForm {
  jRef: string;
  jSector: string;
  jTitle: string;
  jCompany: string;
  jContract: string;
  jLoc: string;
  jSen: string;
  jRemote: string;
  jFix: string;
  jVar: string;
  jStart: string;
  jIntro: string;
  jMissions: string;
  jProfile: string;
  jProcess: string;
}

// ─── MAPS ───────────────────────────────────────────
const statutLabels: Record<StatutMandat, string> = {
  OUVERT: 'Ouvert',
  EN_COURS: 'En cours',
  GAGNE: 'Gagné',
  PERDU: 'Perdu',
  ANNULE: 'Annulé',
  CLOTURE: 'Clôturé',
};

const statutPill: Record<StatutMandat, { bg: string; fg: string; dot: string }> = {
  OUVERT: { bg: '#EAF3EC', fg: '#2C6B3F', dot: '#3B9A54' },
  EN_COURS: { bg: '#FBF0DE', fg: '#B4791A', dot: '#E08A2B' },
  GAGNE: { bg: '#EAF3EC', fg: '#2C6B3F', dot: '#3B9A54' },
  PERDU: { bg: '#FDECEA', fg: '#B3261E', dot: '#B3261E' },
  ANNULE: { bg: '#FDECEA', fg: '#B3261E', dot: '#B3261E' },
  CLOTURE: { bg: '#EFEEF4', fg: '#5A5470', dot: '#8A8699' },
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

const prioriteOptions = [
  { value: 'BASSE', label: 'Basse' },
  { value: 'NORMALE', label: 'Normale' },
  { value: 'HAUTE', label: 'Haute' },
  { value: 'URGENTE', label: 'Urgente' },
];

const stageLabels: Record<string, string> = {
  SOURCING: 'Sourcing',
  CONTACTE: 'Contacté',
  ENTRETIEN_1: 'Entretien 1',
  ENTRETIEN_CLIENT: 'Entretien Client',
  OFFRE: 'Offre',
  PLACE: 'Placé',
  REFUSE: 'Refusé',
};

const stageColors: Record<string, string> = {
  SOURCING: '#8E7CC3',
  CONTACTE: '#3B6FE0',
  ENTRETIEN_1: '#22177A',
  ENTRETIEN_CLIENT: '#E08A2B',
  OFFRE: '#C9A227',
  PLACE: '#3B9A54',
  REFUSE: '#B3261E',
};

const pipelineOrder = ['SOURCING', 'CONTACTE', 'ENTRETIEN_1', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE'];

const PIPE_AV: [string, string][] = [['#22177A', '#E6E9AF'], ['#E6E9AF', '#22177A'], ['#8E7CC3', '#fff']];

const ROLE_OPTIONS = ['Hiring manager', 'Talent Acquisition', 'DRH', 'Autre'];
const SEN_OPTIONS = ['Confirmé', 'Senior', 'Manager', 'Direction'];

// ─── HELPERS ────────────────────────────────────────
function formatEuro(value: number | null): string {
  if (value == null) return '—';
  return `${value.toLocaleString('fr-FR')} €`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function getInitials(prenom?: string | null, nom?: string | null): string {
  const i = `${(prenom || '').charAt(0)}${(nom || '').charAt(0)}`.toUpperCase();
  return i || '?';
}

function nameInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase() || '—';
}

function companyInitials(nom: string): string {
  const parts = (nom || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function withCurrent(opts: string[], current: string): string[] {
  const list = [...opts];
  if (current && !list.includes(current)) list.unshift(current);
  return list;
}

function genPwd(): string {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  let p = '';
  for (let i = 0; i < 8; i++) p += a[Math.floor(Math.random() * a.length)];
  return p;
}

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

function computeSalaireLabel(min: number | null, max: number | null): string {
  return min || max
    ? [min ? formatEuro(min) : null, max ? formatEuro(max) : null].filter(Boolean).join(' – ')
    : '—';
}

// ─── SMALL COMPONENTS ───────────────────────────────
function PlainSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', width: '100%', fontFamily: MANROPE, fontSize: 13, fontWeight: 700, padding: '8px 30px 8px 12px', borderRadius: 10, border: '1.5px solid rgba(34,23,122,0.14)', background: '#FCFCF5', color: INK, outline: 'none', cursor: 'pointer' }}
      >
        {!options.includes(value) && <option value="">— Non assigné —</option>}
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={13} color="#8A8699" style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
    </div>
  );
}

const modalInputStyle: React.CSSProperties = { width: '100%', fontFamily: MANROPE, fontSize: 14, padding: '11px 14px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,0.14)', background: '#FCFCF5', color: INK, outline: 'none' };
const pubLabelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 5 };
const pubInputStyle: React.CSSProperties = { width: '100%', fontFamily: MANROPE, fontSize: 13.5, padding: '10px 13px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,0.14)', background: '#fff', color: INK, outline: 'none' };

// ─── PAGE ───────────────────────────────────────────
export default function MandatDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Brief edit
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  // Delete
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  // Rail
  const [railTab, setRailTab] = useState<'brief' | 'notes' | 'int' | 'cli' | 'trame'>('brief');
  const [notesDraft, setNotesDraft] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  // Team (local demo state)
  const [team, setTeam] = useState<{ commercial: string; recruteur: string; signed: boolean } | null>(null);
  const [editTeam, setEditTeam] = useState(false);
  // Ajout de candidats au pipeline
  const [addOpen, setAddOpen] = useState(false);
  const [draggedCandId, setDraggedCandId] = useState<string | null>(null);
  const [addSearch, setAddSearch] = useState('');
  const [addDeb, setAddDeb] = useState('');
  useEffect(() => { const t = setTimeout(() => setAddDeb(addSearch), 300); return () => clearTimeout(t); }, [addSearch]);
  // Access modal
  const [accessOpen, setAccessOpen] = useState(false);
  const [access, setAccess] = useState<AccessContact[]>([]);
  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cRole, setCRole] = useState('Hiring manager');
  const [inviteMail, setInviteMail] = useState(true);
  // Publish modal
  const [pubOpen, setPubOpen] = useState(false);
  const [published, setPublished] = useState(false);
  const [pubDraft, setPubDraft] = useState(true);
  const [jForm, setJForm] = useState<JForm | null>(null);

  const { data: mandat, isLoading } = useQuery({
    queryKey: ['mandat', id],
    queryFn: () => api.get<MandatDetail>(`/mandats/${id}`),
    enabled: !!id,
  });

  usePageTitle(mandat ? `${mandat.titrePoste} — ${mandat.entreprise.nom}` : 'Mandat');

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.put<MandatDetail>(`/mandats/${id}`, payload),
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

  // Vraie equipe (source du binome commercial/recruteur)
  const teamQuery = useQuery({
    queryKey: ['team'],
    queryFn: () => api.get<{ id: string; nom: string; prenom: string | null }[]>('/settings/team'),
  });
  const teamMembers = (teamQuery.data ?? []).map((u) => ({ id: u.id, name: `${u.prenom || ''} ${u.nom || ''}`.trim() }));
  const teamOptions = teamMembers.map((m) => m.name);

  // Persiste le binome en base (salesId / recruteurId) — plus de localStorage
  const assignMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.put<MandatDetail>(`/mandats/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mandat', id] });
      toast('success', 'Binôme mis à jour');
    },
    onError: (error: any) => toast('error', error.message || 'Erreur lors de l\'assignation'),
  });

  // Recherche de candidats à ajouter au pipeline
  const addSearchQuery = useQuery({
    queryKey: ['candidats-search-mandat', addDeb],
    queryFn: () => api.get<{ data: { id: string; prenom: string | null; nom: string; posteActuel: string | null; entrepriseActuelle: string | null }[] }>(`/candidats?perPage=8${addDeb ? `&search=${encodeURIComponent(addDeb)}` : ''}`),
    enabled: addOpen,
  });
  const addCandMut = useMutation({
    mutationFn: (candidatId: string) => api.post('/candidatures', { candidatId, mandatId: id, stage: 'SOURCING' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mandat', id] }); toast('success', 'Candidat ajouté au pipeline'); },
    onError: (e: any) => toast('error', e.message || 'Erreur lors de l\'ajout'),
  });
  // Déplacer un candidat entre colonnes du pipeline (drag & drop), AVEC les
  // modales obligatoires (Perdu / RDV client / Placé) via le hook partagé.
  const { requestMove: requestStageMove, modals: stageModals } = useStageChange(
    () => queryClient.invalidateQueries({ queryKey: ['mandat', id] }),
  );
  const handlePipelineDrop = (targetStage: string) => {
    const candId = draggedCandId;
    setDraggedCandId(null);
    if (!candId) return;
    const cand = mandat?.candidatures.find((c) => c.id === candId);
    if (!cand || cand.stage === targetStage) return;
    requestStageMove(candId, targetStage, { candidatName: `${cand.candidat.prenom || ''} ${cand.candidat.nom}`.trim() });
  };
  // Créer un nouveau candidat depuis la recherche puis l'ajouter au pipeline
  const createCandMut = useMutation({
    mutationFn: async () => {
      const parts = addSearch.trim().split(/\s+/);
      const prenom = parts.length > 1 ? parts[0] : undefined;
      const nom = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
      const created = await api.post<{ id: string }>('/candidats', { nom, prenom });
      await api.post('/candidatures', { candidatId: created.id, mandatId: id, stage: 'SOURCING' });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mandat', id] }); queryClient.invalidateQueries({ queryKey: ['candidats-search-mandat'] }); toast('success', 'Candidat créé et ajouté'); setAddSearch(''); },
    onError: (e: any) => toast('error', e.message || 'Erreur lors de la création'),
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

  // ── Portail client : accès + activité (vrai back-end) ──
  const portalEventsQuery = useQuery({
    queryKey: ['portal-events', id],
    queryFn: () => api.get<PortalEventRow[]>(`/portal/mandat/${id}/events?limit=20`),
    enabled: !!id,
  });
  const portalAccessesQuery = useQuery({
    queryKey: ['portal-accesses', id],
    queryFn: () => api.get<PortalAccessRow[]>(`/portal/mandat/${id}/accesses`),
    enabled: !!id,
  });

  // Client activity (portail) dérivée des vrais events + accès
  const clientActivity = useMemo(() => {
    const evs = portalEventsQuery.data || [];
    const accesses = portalAccessesQuery.data || [];
    const now = Date.now();
    const rel = (t: number) => {
      const s = Math.floor((now - t) / 1000);
      if (s < 60) return "à l'instant";
      if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
      if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
      return `le ${new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
    };
    const hhmm = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const labelFor = (type: string): { label: string; dot: string } => {
      if (type === 'login') return { label: "S'est connecté", dot: '#2C6B3F' };
      if (type === 'view') return { label: 'A consulté un profil', dot: '#22177A' };
      if (type === 'comment') return { label: 'A laissé un commentaire', dot: '#8E7CC3' };
      if (type.indexOf('move') === 0 || type.indexOf('decision:meet') === 0) return { label: 'A déplacé / décidé', dot: '#E08A2B' };
      if (type === 'decision:talk') return { label: 'À discuter', dot: '#B4791A' };
      if (type === 'decision:pass') return { label: 'A écarté un profil', dot: '#B3261E' };
      return { label: type || 'Action', dot: '#8A8699' };
    };
    const items = evs.slice(0, 4).map((e) => {
      const { label, dot } = labelFor(e.type);
      const who = e.portalAccess?.client ? `${e.portalAccess.client.prenom || ''} ${e.portalAccess.client.nom || ''}`.trim() : (e.portalAccess?.email || '');
      return { label, dot, detail: who, hasDetail: !!who && e.type !== 'login', time: hhmm(new Date(e.createdAt).getTime()) };
    });
    const lastLogin = Math.max(0, ...accesses.map((a) => (a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0)));
    const lastEvent = evs.length ? new Date(evs[0].createdAt).getTime() : 0;
    const last = Math.max(lastLogin, lastEvent);
    const online = !!last && now - last < 10 * 60 * 1000;
    return {
      items,
      statusLabel: online ? 'En ligne' : 'Hors ligne',
      statusColor: online ? '#2C9A47' : '#B4B0C4',
      lastSeen: last ? `Vu ${rel(last)}` : 'Jamais connecté',
    };
  }, [portalEventsQuery.data, portalAccessesQuery.data]);

  // Mot de passe généré au dernier grant (affiché une seule fois, non stocké côté serveur)
  const [lastGrantedPwd, setLastGrantedPwd] = useState<{ email: string; pwd: string } | null>(null);

  const grantAccessMutation = useMutation({
    mutationFn: (p: { email: string; password: string }) =>
      api.post('/portal/access', { mandatId: id, clientId: mandat?.client?.id, email: p.email, password: p.password }),
    onSuccess: (_res, p) => {
      queryClient.invalidateQueries({ queryKey: ['portal-accesses', id] });
      setLastGrantedPwd({ email: p.email, pwd: p.password });
      setCEmail('');
      toast('success', `Accès portail créé pour ${p.email}`);
    },
    onError: (e: any) => toast('error', e?.message || "Impossible de créer l'accès"),
  });

  const revokePortalMutation = useMutation({
    mutationFn: (accessId: string) => api.post(`/portal/access/${accessId}/revoke`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-accesses', id] });
      toast('info', 'Accès révoqué');
    },
    onError: (e: any) => toast('error', e?.message || 'Révocation impossible'),
  });

  const submitGrant = () => {
    const email = cEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('error', 'Email invalide'); return; }
    grantAccessMutation.mutate({ email, password: genPwd() });
  };

  // Init team once mandat is loaded
  useEffect(() => {
    if (!id || !mandat || team) return;
    let signed = false;
    try {
      const raw = localStorage.getItem(`hu_mandat_team_${id}`);
      if (raw) signed = !!JSON.parse(raw).signed;
    } catch { /* noop */ }
    const com = mandat.sales ? `${mandat.sales.prenom || ''} ${mandat.sales.nom}`.trim() : '';
    const rec = mandat.recruteur ? `${mandat.recruteur.prenom || ''} ${mandat.recruteur.nom}`.trim() : '';
    setTeam({ commercial: com, recruteur: rec, signed });
  }, [id, mandat, team]);

  // Init access list + published + jForm
  useEffect(() => {
    if (!id) return;
    try {
      const raw = localStorage.getItem(`hu_mandat_access_${id}`);
      if (raw) setAccess(JSON.parse(raw));
    } catch { /* noop */ }
    try {
      const ref = `HU-${id.slice(0, 4)}`.toUpperCase();
      const raw = localStorage.getItem('hu_joboffers_v1');
      const arr = raw ? JSON.parse(raw) : [];
      const live = arr.some((o: any) => (o.ref === ref || o.mandatId === ref) && o.live);
      setPublished(live);
    } catch { /* noop */ }
  }, [id]);

  useEffect(() => {
    if (!mandat || !id || jForm) return;
    const ref = `HU-${id.slice(0, 4)}`.toUpperCase();
    setJForm({
      jRef: ref,
      jSector: mandat.entreprise.secteur || 'Industrie',
      jTitle: mandat.titrePoste,
      jCompany: 'Groupe industriel · 240 personnes · Lyon',
      jContract: 'CDI',
      jLoc: mandat.localisation || '',
      jSen: 'Confirmé',
      jRemote: 'Non',
      jFix: computeSalaireLabel(mandat.salaireMin, mandat.salaireMax),
      jVar: "+ primes d'astreinte · 13e mois",
      jStart: 'ASAP',
      jIntro: "Notre client, groupe industriel en croissance, renforce son équipe maintenance sur son site de production. Vous prenez en charge la mise en service et la fiabilisation de lignes automatisées.",
      jMissions: 'Assurer la mise en service des lignes automatisées.\nDiagnostiquer et résoudre les pannes sur automates Siemens.\nAméliorer la fiabilité des équipements existants.\nFormer les opérateurs aux bonnes pratiques.',
      jProfile: 'BTS CRSA ou équivalent\n3 ans minimum en environnement industriel\nSiemens TIA Portal\nHabilitation électrique',
      jProcess: "Échange HumanUp :: 30 min. On vous dévoile l'entreprise.\nEntretien technique :: Sur votre expertise automatisme.\nVisite de site :: Rencontre de l'équipe et du responsable.\nOffre :: Closing accompagné jusqu'à la signature.",
    });
  }, [mandat, id, jForm]);

  // Sync notesDraft when mandat notes change
  useEffect(() => {
    if (mandat) setNotesDraft(mandat.notes || '');
  }, [mandat?.notes]);

  // ─── Team handlers ────────────────────────────────
  const persistTeam = (t: { commercial: string; recruteur: string; signed: boolean }) => {
    try { localStorage.setItem(`hu_mandat_team_${id}`, JSON.stringify(t)); } catch { /* noop */ }
  };
  const setCommercial = (v: string) => {
    setTeam((prev) => {
      const next = { ...(prev || { recruteur: '', signed: false }), commercial: v } as { commercial: string; recruteur: string; signed: boolean };
      persistTeam(next);
      return next;
    });
    const m = teamMembers.find((t) => t.name === v);
    assignMutation.mutate({ salesId: m ? m.id : null });
  };
  const setRecruteur = (v: string) => {
    setTeam((prev) => {
      const next = { ...(prev || { commercial: '', signed: false }), recruteur: v } as { commercial: string; recruteur: string; signed: boolean };
      persistTeam(next);
      return next;
    });
    const m = teamMembers.find((t) => t.name === v);
    assignMutation.mutate({ recruteurId: m ? m.id : null });
  };
  const toggleSigned = () => {
    if (!team) return;
    const nextSigned = !team.signed;
    const next = { ...team, signed: nextSigned };
    setTeam(next);
    persistTeam(next);
    if (nextSigned) {
      if (!team.recruteur) { setEditTeam(true); toast('success', 'Contrat signé — assigne le recruteur'); }
      else toast('success', 'Contrat signé');
    } else {
      toast('info', 'Signature annulée');
    }
  };

  // ─── Brief edit ───────────────────────────────────
  const handleStartEdit = () => {
    if (mandat) { setEditForm(buildEditForm(mandat)); setIsEditing(true); }
  };
  const handleCancelEdit = () => { setIsEditing(false); setEditForm(null); };
  const setField = (field: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setEditForm((prev) => (prev ? { ...prev, [field]: e.target.value } : prev));
  };
  const handleSave = () => {
    if (!editForm) return;
    const payload: Record<string, unknown> = {};
    if (editForm.titrePoste.trim()) payload.titrePoste = editForm.titrePoste.trim();
    payload.description = editForm.description.trim() || null;
    payload.localisation = editForm.localisation.trim() || null;
    payload.salaireMin = editForm.salaireMin ? parseInt(editForm.salaireMin, 10) : null;
    payload.salaireMax = editForm.salaireMax ? parseInt(editForm.salaireMax, 10) : null;
    if (editForm.feePourcentage) payload.feePourcentage = parseFloat(editForm.feePourcentage);
    if (editForm.priorite) payload.priorite = editForm.priorite;
    if (editForm.statut) payload.statut = editForm.statut;
    payload.notes = editForm.notes.trim() || null;
    updateMutation.mutate(payload);
  };

  // ─── Access handlers ──────────────────────────────
  const persistAccess = (list: AccessContact[]) => {
    try { localStorage.setItem(`hu_mandat_access_${id}`, JSON.stringify(list)); } catch { /* noop */ }
  };
  const logClientEvent = (type: string, who: string) => {
    try {
      const raw = localStorage.getItem('hu_client_events');
      const arr = raw ? JSON.parse(raw) : [];
      arr.push({ type, who, at: Date.now() });
      localStorage.setItem('hu_client_events', JSON.stringify(arr));
    } catch { /* noop */ }
  };
  const addContact = () => {
    const n = cName.trim();
    const e = cEmail.trim().toLowerCase();
    if (!n || !e) { toast('error', 'Nom et email requis'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { toast('error', 'Email invalide'); return; }
    const BLOCK = ['gmail.', 'yahoo.', 'hotmail.', 'outlook.', 'live.', 'icloud.', 'free.fr', 'orange.fr'];
    if (BLOCK.some((b) => e.indexOf(b) !== -1)) { toast('error', 'Email professionnel requis'); return; }
    const sendMail = inviteMail;
    const c: AccessContact = { name: n, email: e, role: cRole, pwd: genPwd(), sentAt: sendMail ? Date.now() : null };
    const next = [...access, c];
    setAccess(next);
    persistAccess(next);
    setCName('');
    setCEmail('');
    if (sendMail) { logClientEvent('invite', `Invitation portail envoyée à ${n} (${e})`); toast('success', `Accès créé — invitation envoyée à ${e}`); }
    else toast('success', 'Accès créé — identifiants à transmettre');
  };
  const resendInvite = (i: number) => {
    const next = access.slice();
    next[i] = { ...next[i], sentAt: Date.now() };
    setAccess(next);
    persistAccess(next);
    logClientEvent('invite', `Invitation portail renvoyée à ${next[i].name}`);
    toast('success', `Invitation renvoyée à ${next[i].email}`);
  };
  const revokeAccess = (i: number) => {
    const next = access.slice();
    next.splice(i, 1);
    setAccess(next);
    persistAccess(next);
    toast('info', 'Accès révoqué');
  };

  // ─── Publish handlers ─────────────────────────────
  const setJField = (field: keyof JForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setJForm((prev) => (prev ? { ...prev, [field]: e.target.value } : prev));
  };
  const savePub = () => {
    if (!jForm) return;
    const on = pubDraft;
    const offer = {
      mandatId: jForm.jRef, live: on, ref: jForm.jRef, secteur: jForm.jSector, title: jForm.jTitle,
      company: jForm.jCompany, contract: jForm.jContract, loc: jForm.jLoc, senior: jForm.jSen,
      remote: jForm.jRemote, fix: jForm.jFix, variable: jForm.jVar, start: jForm.jStart, intro: jForm.jIntro,
      missions: jForm.jMissions, profile: jForm.jProfile, process: jForm.jProcess, at: Date.now(),
    };
    try {
      const raw = localStorage.getItem('hu_joboffers_v1');
      const arr = raw ? JSON.parse(raw) : [];
      const kept = arr.filter((o: any) => o.ref !== offer.ref && o.mandatId !== offer.mandatId);
      kept.unshift(offer);
      localStorage.setItem('hu_joboffers_v1', JSON.stringify(kept));
    } catch { /* noop */ }
    setPublished(on);
    setPubOpen(false);
    logClientEvent('invite', on ? 'Offre publiée sur le job board' : 'Offre retirée du job board');
    toast('success', on ? 'Offre publiée — candidatures ouvertes' : 'Offre retirée du site');
  };

  // ─── Loading / not found ──────────────────────────
  if (isLoading) {
    return (
      <div style={{ padding: '30px 36px' }}>
        <Skeleton className="h-8 w-64 mb-6" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6"><SkeletonCard /><SkeletonCard /></div>
          <div className="space-y-6"><SkeletonCard /><SkeletonCard /></div>
        </div>
      </div>
    );
  }

  if (!mandat) {
    return (
      <div className="text-center" style={{ padding: '64px 0' }}>
        <p style={{ color: SECONDARY }}>Mandat introuvable.</p>
        <button onClick={() => navigate('/mandats')} style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 13.5, background: '#fff', color: NAVY, border: '1px solid rgba(34,23,122,0.16)', borderRadius: 11, padding: '9px 14px', cursor: 'pointer' }}>
          Retour aux mandats
        </button>
      </div>
    );
  }

  // ─── Derived ──────────────────────────────────────
  const daysOpen = Math.max(0, Math.floor((Date.now() - new Date(mandat.dateOuverture).getTime()) / 86400000));
  const salaireLabel = computeSalaireLabel(mandat.salaireMin, mandat.salaireMax);
  const sPill = statutPill[mandat.statut] || statutPill.CLOTURE;
  const teamView = team || { commercial: '', recruteur: '', signed: false };
  const needsRecruteur = teamView.signed && !teamView.recruteur;

  const contract = (() => {
    try { const raw = localStorage.getItem('hu_mandat_contract'); return raw ? JSON.parse(raw) : null; } catch { return null; }
  })();

  const kpis = [
    { label: 'Fee estimé', value: formatEuro(mandat.feeMontantEstime), note: `${Number(mandat.feePourcentage)} % du package`, color: NAVY },
    { label: 'Salaire', value: salaireLabel, note: 'package annuel brut', color: INK },
    { label: 'Candidats', value: String(mandat.candidatures.length), note: 'en pipeline', color: INK },
    { label: 'Ouvert depuis', value: `${daysOpen} j`, note: `créé le ${formatShortDate(mandat.dateOuverture)}`, color: INK },
  ];

  const railTabsDef: [typeof railTab, string][] = [
    ['brief', 'Le brief'], ['trame', 'Trame'], ['notes', 'Notes'], ['int', 'Activité interne'], ['cli', 'Activité client'],
  ];

  const signedBtnStyle: React.CSSProperties = {
    fontFamily: MANROPE, fontWeight: 700, fontSize: 11.5, borderRadius: 999, padding: '5px 12px', cursor: 'pointer', border: 'none',
    background: teamView.signed ? '#EAF3EC' : '#F0EFC4', color: teamView.signed ? '#2C6B3F' : '#8A6A2E',
  };
  const editTeamBtnStyle: React.CSSProperties = {
    fontFamily: MANROPE, fontWeight: 700, fontSize: 11.5, borderRadius: 999, padding: '4px 12px', cursor: 'pointer', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 5,
    background: editTeam ? NAVY : '#F0EFC4', color: editTeam ? LIME : NAVY,
  };

  const inviteSubject = `Votre espace de suivi — ${mandat.titrePoste}`;
  const inviteBody =
    `Bonjour ${(cName.trim().split(/\s+/).slice(-1)[0] || '[Nom]')},\n\n`
    + `Comme convenu, voici votre espace de suivi pour le recrutement du poste de ${mandat.titrePoste}.\n\n`
    + 'Vous y consultez les profils que nous vous présentons, et vous nous dites en un clic si vous souhaitez les rencontrer.\n\n'
    + 'Accès : humanup.io/portail\n'
    + `Identifiant : ${(cEmail.trim() || '[email]')}\n`
    + 'Mot de passe : sera généré à la création\n\n'
    + 'Deux profils vous attendent déjà.\n\n'
    + 'Bien à vous,\nMeroe Nguimbi — HumanUp';

  // ─── Publish preview derived ──────────────────────
  const jMissionList = jForm ? jForm.jMissions.split('\n').map((x) => x.trim()).filter(Boolean).map((t, i) => ({ n: String(i + 1).padStart(2, '0'), t })) : [];
  const jProfileList = jForm ? jForm.jProfile.split('\n').map((x) => x.trim()).filter(Boolean) : [];
  const jProcessList = jForm ? jForm.jProcess.split('\n').map((x) => x.trim()).filter(Boolean).map((l, i) => { const p = l.split('::'); return { n: String(i + 1).padStart(2, '0'), t: (p[0] || '').trim(), d: (p[1] || '').trim() }; }) : [];
  const jChips = jForm ? [jForm.jContract || 'CDI', jForm.jLoc || '—', `Séniorité : ${jForm.jSen || 'Confirmé'}`, 'Maintenance'].filter(Boolean).map((v, i) => ({ v, bg: i === 1 ? LIME : '#fff', fg: NAVY, bd: i === 1 ? 'transparent' : 'rgba(34,23,122,0.16)' })) : [];
  const jFacts = jForm ? [
    { k: 'Localisation', v: jForm.jLoc || '—' },
    { k: 'Contrat', v: jForm.jContract || 'CDI' },
    { k: 'Télétravail', v: jForm.jRemote || 'Non' },
    { k: 'Prise de poste', v: jForm.jStart || 'ASAP' },
  ] : [];

  // ─── Render ───────────────────────────────────────
  return (
    <div className="fiche-root" style={{ position: 'relative', fontFamily: MANROPE, height: '100%', display: 'flex', overflow: 'hidden', background: 'radial-gradient(1100px 460px at 82% -12%, rgba(230,233,175,.5), transparent 60%), radial-gradient(680px 380px at 4% 2%, rgba(34,23,122,.05), transparent 60%), #F4F4EA' }}>
      {/* ═══════════ MAIN ═══════════ */}
      <main className="scrollcol" style={{ flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden', padding: '30px 36px 26px' }}>
        {/* Breadcrumb */}
        <div className="rise" style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: FAINT, fontWeight: 600, animationDelay: '.02s' }}>
          <span onClick={() => navigate('/mandats')} style={{ color: MUTED, cursor: 'pointer' }}>Mandats</span>
          <span style={{ color: '#C4C1D0' }}>›</span>
          <span style={{ color: NAVY, fontWeight: 700 }}>{mandat.titrePoste}</span>
        </div>

        {/* Hero */}
        <div className="rise" style={{ display: 'flex', alignItems: 'flex-start', gap: 20, marginTop: 10, animationDelay: '.06s' }}>
          <span style={{ flexShrink: 0, width: 64, height: 64, borderRadius: 18, background: '#F2F3D8', border: '1px solid rgba(34,23,122,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ARCHIVO, fontSize: 19, letterSpacing: '-.02em', color: NAVY }}>
            {companyInitials(mandat.entreprise.nom)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: ARCHIVO, fontSize: 29, letterSpacing: '-.035em', color: INK, lineHeight: 1.05 }}>{mandat.titrePoste}</h1>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: '5px 12px', background: sPill.bg, color: sPill.fg }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: sPill.dot }} />{statutLabels[mandat.statut]}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 6, padding: '4px 10px', background: '#EDEAF9', color: '#5B4B9E' }}>Priorité {prioriteLabels[mandat.priorite].toLowerCase()}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 6, fontSize: 14, color: TERTIARY, flexWrap: 'wrap' }}>
              <a onClick={() => navigate(`/entreprises/${mandat.entreprise.id}`)} style={{ color: NAVY, fontWeight: 700, borderBottom: '1.5px solid rgba(34,23,122,.25)', cursor: 'pointer' }}>{mandat.entreprise.nom}</a>
              {mandat.localisation && (<><span style={{ width: 3, height: 3, borderRadius: '50%', background: '#C4C1D0' }} /><span>{mandat.localisation}</span></>)}
              {mandat.entreprise.secteur && (<><span style={{ width: 3, height: 3, borderRadius: '50%', background: '#C4C1D0' }} /><span>{mandat.entreprise.secteur}</span></>)}
            </div>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn" onClick={() => setPubOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, background: published ? '#EAF3EC' : '#fff', color: published ? '#2C6B3F' : SECONDARY, border: `1px solid ${published ? 'rgba(59,154,84,.3)' : 'rgba(34,23,122,0.16)'}`, borderRadius: 10, padding: '9px 13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <Globe size={13} /> {published ? 'Publiée' : 'Publier'}
            </button>
            <button className="btn" onClick={() => setAccessOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, background: '#F0EFC4', color: NAVY, border: '1px solid transparent', borderRadius: 10, padding: '9px 13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <Users size={13} /> Gérer l'accès
            </button>
            <button className="btn" onClick={() => setShowDeleteModal(true)} title="Supprimer le mandat" style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(179,38,30,.18)', background: '#fff', color: '#B3261E', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* KPI tiles */}
        <div className="rise" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 11, marginTop: 20, animationDelay: '.1s' }}>
          {kpis.map((k) => (
            <div key={k.label} className="kpi" style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 14, padding: '15px 17px', boxShadow: CARD_SHADOW }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: FAINT }}>{k.label}</div>
              <div style={{ fontFamily: MANROPE, fontWeight: 800, fontSize: 23, letterSpacing: '-.035em', color: k.color, marginTop: 7, whiteSpace: 'nowrap' }}>{k.value}</div>
              <div style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>{k.note}</div>
            </div>
          ))}
        </div>

        {/* Segmented people bar */}
        <div className="rise" style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap', background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 14, boxShadow: CARD_SHADOW, marginTop: 11, padding: 4, animationDelay: '.14s' }}>
          {/* Contact client (absent pour un mandat VIVIER) */}
          <div className="row" onClick={() => mandat.client && navigate(`/clients/${mandat.client.id}`)} style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 11, cursor: mandat.client ? 'pointer' : 'default' }}>
            <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: mandat.client ? '#8E7CC3' : 'rgba(142,124,195,.25)', color: mandat.client ? '#fff' : '#8E7CC3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MANROPE, fontWeight: 800, fontSize: 10.5 }}>{mandat.client ? getInitials(mandat.client.prenom, mandat.client.nom) : 'V'}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 9.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: FAINT }}>Contact client</span>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: mandat.client ? INK : FAINT, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mandat.client ? `${mandat.client.prenom || ''} ${mandat.client.nom}`.trim() : 'Vivier · sans client'}</span>
            </span>
            {mandat.client && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C4C1D0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginLeft: 'auto' }}><path d="m9 6 6 6-6 6" /></svg>}
          </div>
          <span style={{ width: 1, height: 28, background: 'rgba(34,23,122,.09)' }} />

          {!editTeam ? (
            <>
              {/* Commercial */}
              <div className="row" onClick={() => setEditTeam(true)} style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 11, cursor: 'pointer' }}>
                <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: NAVY, color: LIME, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MANROPE, fontWeight: 800, fontSize: 10.5 }}>{nameInitials(teamView.commercial)}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 9.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: FAINT }}>Commercial</span>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: INK, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teamView.commercial || 'Non assigné'}</span>
                </span>
              </div>
              <span style={{ width: 1, height: 28, background: 'rgba(34,23,122,.09)' }} />
              {/* Recruteur */}
              <div className="row" onClick={() => setEditTeam(true)} style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', borderRadius: 11, cursor: 'pointer', background: needsRecruteur ? '#FBF3E7' : undefined }}>
                <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: teamView.recruteur ? '#8E7CC3' : 'rgba(142,124,195,.25)', color: teamView.recruteur ? '#fff' : '#8E7CC3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MANROPE, fontWeight: 800, fontSize: 10.5 }}>{teamView.recruteur ? nameInitials(teamView.recruteur) : '—'}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 9.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: FAINT }}>Recruteur{needsRecruteur ? <span style={{ color: '#B47814' }}> · à assigner</span> : null}</span>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: teamView.recruteur ? INK : (needsRecruteur ? '#8A6A2E' : FAINT), marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{teamView.recruteur || 'Non assigné'}</span>
                </span>
              </div>
            </>
          ) : (
            <div style={{ flex: '1 1 420px', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 13px', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 170 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: FAINT, marginBottom: 4 }}>Commercial</div>
                <PlainSelect value={teamView.commercial} onChange={setCommercial} options={withCurrent(teamOptions, teamView.commercial)} />
              </div>
              <div style={{ minWidth: 170 }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: needsRecruteur ? '#B47814' : FAINT, marginBottom: 4 }}>Recruteur{needsRecruteur ? ' · à assigner' : ''}</div>
                <PlainSelect value={teamView.recruteur} onChange={setRecruteur} options={withCurrent(teamOptions, teamView.recruteur || '')} />
              </div>
            </div>
          )}

          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, paddingRight: 9, marginLeft: 'auto' }}>
            <button onClick={toggleSigned} style={signedBtnStyle}>{teamView.signed ? 'Signé' : 'Non signé'}</button>
            <button onClick={() => setEditTeam((v) => !v)} style={editTeamBtnStyle}>
              {editTeam ? <><Check size={12} /> Terminé</> : <><Pencil size={12} /> Éditer</>}
            </button>
          </div>
        </div>

        {/* Pipeline candidats */}
        <div className="rise" style={{ background: '#fff', border: '1px solid rgba(34,23,122,0.08)', borderRadius: 18, padding: '22px 24px', boxShadow: '0 1px 2px rgba(34,23,122,0.04), 0 20px 44px -36px rgba(34,23,122,.5)', marginTop: 14, animationDelay: '.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <a onClick={() => navigate(`/mandats/${id}/kanban`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: MANROPE, fontWeight: 800, fontSize: 17, letterSpacing: '-.015em', color: INK }}>
              Pipeline candidats <ArrowRight size={14} color={NAVY} />
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => { setAddOpen(true); setAddSearch(''); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: MANROPE, fontWeight: 700, fontSize: 11.5, borderRadius: 999, padding: '6px 13px', cursor: 'pointer', border: 'none', background: NAVY, color: LIME }}><UserPlus size={14} />Ajouter des candidats</button>
              <button onClick={() => navigate(`/mandats/${id}/kanban`)} style={{ fontFamily: MANROPE, fontWeight: 700, fontSize: 11.5, borderRadius: 999, padding: '6px 13px', cursor: 'pointer', border: 'none', background: '#F0EFC4', color: NAVY }}>Voir le Kanban</button>
            </div>
          </div>

          <div className="scrollcol" style={{ overflowX: 'auto', marginTop: 14, paddingBottom: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 12, minWidth: 1180, alignItems: 'start' }}>
              {pipelineOrder.map((stage) => {
                const cands = mandat.candidatures.filter((c) => c.stage === stage);
                const active = cands.length > 0;
                const shown = cands.slice(0, 6);
                const more = Math.max(0, cands.length - shown.length);
                return (
                  <div key={stage}
                    onDragOver={(e) => { if (draggedCandId) e.preventDefault(); }}
                    onDrop={() => handlePipelineDrop(stage)}
                    style={{ background: draggedCandId ? '#F7F7EA' : (active ? '#FCFCF5' : 'rgba(252,252,245,.5)'), border: `1px ${draggedCandId ? 'dashed' : 'solid'} ${draggedCandId ? 'rgba(34,23,122,.3)' : (active ? 'rgba(34,23,122,.11)' : 'rgba(34,23,122,.06)')}`, borderRadius: 14, padding: '14px 13px 16px', minHeight: 520, transition: 'background .15s, border-color .15s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: stageColors[stage], flexShrink: 0 }} />
                        <span style={{ fontFamily: MANROPE, fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: TERTIARY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stageLabels[stage]}</span>
                      </span>
                      <span style={{ fontFamily: MANROPE, fontWeight: 800, fontSize: 13, color: active ? INK : '#C4C1D0', flexShrink: 0 }}>{cands.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 11 }}>
                      {shown.map((c, j) => {
                        const [avBg, avFg] = PIPE_AV[j % 3];
                        return (
                          <div key={c.id} className="kcard"
                            draggable
                            onDragStart={(e) => { setDraggedCandId(c.id); e.dataTransfer.effectAllowed = 'move'; }}
                            onDragEnd={() => setDraggedCandId(null)}
                            onClick={() => { if (!draggedCandId) navigate(`/candidats/${c.candidat.id}`); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid rgba(34,23,122,.1)', borderRadius: 11, padding: '11px 12px', boxShadow: '0 1px 2px rgba(34,23,122,.05)', cursor: 'grab', opacity: draggedCandId === c.id ? 0.4 : 1 }}>
                            <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: avBg, color: avFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MANROPE, fontWeight: 800, fontSize: 11 }}>{getInitials(c.candidat.prenom, c.candidat.nom)}</span>
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`${c.candidat.prenom || ''} ${c.candidat.nom}`.trim()}</span>
                              <span style={{ display: 'block', fontSize: 11, color: '#8A8699', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.candidat.posteActuel || 'Poste non renseigné'}</span>
                            </span>
                          </div>
                        );
                      })}
                      {more > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: '#8A8699', paddingLeft: 3 }}>+{more} autres</span>}
                      {!active && <span style={{ display: 'block', height: 56, border: '1px dashed rgba(34,23,122,.14)', borderRadius: 11 }} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* ═══════════ RAIL ═══════════ */}
      <aside data-rail className="rail" style={{ width: 400, flexShrink: 0, borderLeft: '1px solid rgba(34,23,122,.1)', background: '#fff', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flexShrink: 0, display: 'flex', gap: 5, padding: '16px 18px 13px', borderBottom: '1px solid rgba(34,23,122,.09)', overflowX: 'auto' }}>
          {railTabsDef.map(([k, l]) => (
            <button key={k} onClick={() => setRailTab(k)} style={{ fontFamily: MANROPE, fontWeight: 700, fontSize: 12.5, padding: '7px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', ...(railTab === k ? { background: NAVY, color: LIME } : { background: 'transparent', color: MUTED }) }}>{l}</button>
          ))}
        </div>

        <div className="scrollcol" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px 22px' }}>
          {/* Le brief */}
          {railTab === 'brief' && (
            <div className="rise">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontFamily: ARCHIVO, fontSize: 16, color: INK }}>Le brief</div>
                {!isEditing ? (
                  <button onClick={handleStartEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: NAVY, background: '#F7F7EF', border: '1px solid rgba(34,23,122,0.12)', borderRadius: 9, padding: '5px 11px', cursor: 'pointer' }}><Pencil size={12} /> Éditer</button>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={handleSave} disabled={updateMutation.isPending} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: LIME, background: NAVY, border: 'none', borderRadius: 9, padding: '5px 11px', cursor: 'pointer', opacity: updateMutation.isPending ? 0.6 : 1 }}>{updateMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Enregistrer</button>
                    <button onClick={handleCancelEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: MUTED, background: '#F5F4EA', border: 'none', borderRadius: 9, padding: '5px 11px', cursor: 'pointer' }}><X size={12} /> Annuler</button>
                  </div>
                )}
              </div>

              {isEditing && editForm ? (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Input label="Titre du poste" value={editForm.titrePoste} onChange={setField('titrePoste')} placeholder="Titre du poste" />
                  <Textarea label="Description" value={editForm.description} onChange={setField('description')} placeholder="Description du poste..." />
                  <Input label="Localisation" value={editForm.localisation} onChange={setField('localisation')} placeholder="Lyon (69)" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Input label="Salaire min (EUR)" type="number" value={editForm.salaireMin} onChange={setField('salaireMin')} placeholder="45000" />
                    <Input label="Salaire max (EUR)" type="number" value={editForm.salaireMax} onChange={setField('salaireMax')} placeholder="65000" />
                  </div>
                  <Input label="Fee %" type="number" value={editForm.feePourcentage} onChange={setField('feePourcentage')} placeholder="20" />
                  <Select label="Priorité" options={prioriteOptions} value={editForm.priorite} onChange={(val) => setEditForm((prev) => (prev ? { ...prev, priorite: val } : prev))} />
                  <Select label="Statut" options={statutOptions} value={editForm.statut} onChange={(val) => setEditForm((prev) => (prev ? { ...prev, statut: val } : prev))} />
                </div>
              ) : (
                <>
                  {mandat.description ? (
                    <p style={{ fontSize: 14.5, lineHeight: 1.68, color: SECONDARY, marginTop: 12, whiteSpace: 'pre-wrap' }}>{mandat.description}</p>
                  ) : (
                    <p style={{ fontSize: 13.5, color: FAINT, marginTop: 12 }}>Aucune description renseignée.</p>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '10px 20px', marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(34,23,122,0.07)' }}>
                    <div><div style={fieldLabel}>Localisation</div><div style={fieldValue}>{mandat.localisation || '—'}</div></div>
                    <div><div style={fieldLabel}>Secteur</div><div style={fieldValue}>{mandat.entreprise.secteur || '—'}</div></div>
                    <div><div style={fieldLabel}>Ouvert le</div><div style={fieldValue}>{formatDate(mandat.dateOuverture)}</div></div>
                    <div><div style={fieldLabel}>Salaire</div><div style={fieldValue}>{salaireLabel}</div></div>
                  </div>

                  {mandat.ficheDePoste && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, padding: '11px 13px', background: '#FCFCF5', border: '1px solid rgba(34,23,122,0.1)', borderRadius: 12, cursor: 'pointer' }}>
                      <span style={{ width: 38, height: 38, borderRadius: 10, background: '#F1EDF9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FileText size={17} color="#8E7CC3" /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Fiche de poste</div>
                        <div style={{ fontSize: 12, color: FAINT }}>Document joint</div>
                      </div>
                    </div>
                  )}

                  {contract && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, padding: '11px 13px', background: '#FCFCF5', border: '1px solid rgba(34,23,122,0.1)', borderRadius: 12, cursor: 'pointer' }}>
                      <span style={{ width: 38, height: 38, borderRadius: 10, background: contract.status === 'signed' ? '#EAF3EC' : '#FBF0DE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FileText size={17} color={contract.status === 'signed' ? '#3B9A54' : '#B4791A'} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{contract.name}</div>
                        <div style={{ fontSize: 12, color: FAINT }}>Contrat de mandat · {contract.status === 'signed' ? `Signé le ${new Date(contract.at).toLocaleDateString('fr-FR')}` : `Envoyé le ${new Date(contract.at).toLocaleDateString('fr-FR')}`}</div>
                      </div>
                      <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: '3px 9px', background: contract.status === 'signed' ? '#EAF3EC' : '#FBF0DE', color: contract.status === 'signed' ? '#2C6B3F' : '#B4791A' }}>{contract.status === 'signed' ? 'Signé' : 'En attente'}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Trame de qualification */}
          {railTab === 'trame' && id && (
            <div className="rise" style={{ padding: '16px 18px' }}>
              <TrameEditor mandatId={id} />
            </div>
          )}

          {/* Notes */}
          {railTab === 'notes' && (
            <div className="rise">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Pencil size={15} color={NAVY} />
                <span style={{ fontFamily: ARCHIVO, fontSize: 15, color: INK }}>Notes internes</span>
              </div>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Ajoutez une note sur ce mandat : contexte, exigences du client, points d'attention…"
                style={{ width: '100%', minHeight: 110, resize: 'vertical', marginTop: 12, fontFamily: MANROPE, fontSize: 13.5, lineHeight: 1.55, padding: '12px 14px', borderRadius: 12, border: '1.5px solid rgba(34,23,122,0.14)', background: '#FCFCF5', color: INK, outline: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10 }}>
                <span style={{ fontSize: 11.5, color: FAINT }}>Visible par l'équipe HumanUp uniquement.</span>
                <button onClick={() => updateMutation.mutate({ notes: notesDraft.trim() || null })} disabled={updateMutation.isPending} style={{ fontFamily: MANROPE, fontWeight: 700, fontSize: 13, background: NAVY, color: LIME, border: 'none', borderRadius: 10, padding: '9px 18px', cursor: 'pointer', opacity: updateMutation.isPending ? 0.6 : 1 }}>Enregistrer</button>
              </div>
            </div>
          )}

          {/* Activité interne */}
          {railTab === 'int' && (
            <div className="rise">
              <div style={{ fontFamily: ARCHIVO, fontSize: 15, color: INK, marginBottom: 8 }}>Activité interne</div>
              <MandatTimeline mandatId={mandat.id} />
            </div>
          )}

          {/* Activité client */}
          {railTab === 'cli' && (
            <div className="rise">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontFamily: ARCHIVO, fontSize: 15, color: INK }}>Activité client</div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: clientActivity.statusColor }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: clientActivity.statusColor }} />{clientActivity.statusLabel}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 13 }}>
                <span style={{ width: 36, height: 36, borderRadius: '50%', background: '#8E7CC3', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ARCHIVO, fontSize: 12 }}>{mandat.client ? getInitials(mandat.client.prenom, mandat.client.nom) : 'V'}</span>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{mandat.client ? `${mandat.client.prenom || ''} ${mandat.client.nom}`.trim() : 'Vivier · sans client'}</div>
                  <div style={{ fontSize: 11.5, color: '#8A8699' }}>{clientActivity.lastSeen}</div>
                </div>
              </div>
              {clientActivity.items.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 13, paddingTop: 13, borderTop: '1px solid rgba(34,23,122,0.07)' }}>
                  {clientActivity.items.map((ev, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10 }}>
                      <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: ev.dot, marginTop: 5 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{ev.label}</span>
                          <span style={{ fontSize: 11, color: FAINT, flexShrink: 0 }}>{ev.time}</span>
                        </div>
                        {ev.hasDetail && <div style={{ fontSize: 11.5, color: TERTIARY, marginTop: 1 }}>{ev.detail}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: 13, paddingTop: 13, borderTop: '1px solid rgba(34,23,122,0.07)', fontSize: 12, color: FAINT }}>Le client n'a pas encore ouvert son espace.</div>
              )}
              <button onClick={() => { queryClient.invalidateQueries({ queryKey: ['portal-events', id] }); queryClient.invalidateQueries({ queryKey: ['portal-accesses', id] }); }} style={{ width: '100%', marginTop: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: MANROPE, fontWeight: 700, fontSize: 12, color: NAVY, background: 'transparent', border: '1px solid rgba(34,23,122,0.16)', borderRadius: 10, padding: 8, cursor: 'pointer' }}><RefreshCw size={13} /> Rafraîchir</button>
            </div>
          )}
        </div>
      </aside>

      {/* ═══════════ MODAL · AJOUTER DES CANDIDATS ═══════════ */}
      {addOpen && (
        <div onClick={() => setAddOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,21,51,.42)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '60px 20px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 540, maxWidth: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 20, boxShadow: '0 40px 90px -40px rgba(26,21,51,0.6)', padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontFamily: ARCHIVO, fontSize: 19, letterSpacing: '-0.02em', color: INK }}>Ajouter des candidats</div>
                <div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 3 }}>Ils entrent en colonne <strong>Sourcing</strong> du pipeline.</div>
              </div>
              <button onClick={() => setAddOpen(false)} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#F5F4EA', color: '#8A8699', cursor: 'pointer', flexShrink: 0 }}>✕</button>
            </div>
            <div style={{ position: 'relative', marginTop: 16 }}>
              <Search size={15} color="#9A96AE" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }} />
              <input autoFocus value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder="Rechercher un candidat (nom, poste…)" style={{ width: '100%', fontFamily: MANROPE, fontSize: 14, padding: '11px 14px 11px 38px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,0.14)', background: '#FCFCF5', color: INK, outline: 'none' }} />
            </div>
            <div style={{ marginTop: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {addSearchQuery.isLoading && <div style={{ fontSize: 13, color: FAINT, padding: '10px 4px' }}>Recherche…</div>}
              {!addSearchQuery.isLoading && (addSearchQuery.data?.data ?? []).length === 0 && <div style={{ fontSize: 13, color: FAINT, padding: '10px 4px' }}>Aucun candidat trouvé.</div>}
              {(addSearchQuery.data?.data ?? []).map((c) => {
                const already = mandat.candidatures.some((x) => x.candidat.id === c.id);
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', border: '1px solid rgba(34,23,122,.1)', borderRadius: 12, background: already ? '#FAFAF2' : '#fff' }}>
                    <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: '50%', background: '#8E7CC3', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MANROPE, fontWeight: 800, fontSize: 11 }}>{getInitials(c.prenom, c.nom)}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`${c.prenom || ''} ${c.nom}`.trim()}</div>
                      <div style={{ fontSize: 11.5, color: '#8A8699', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[c.posteActuel, c.entrepriseActuelle].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                    {already ? (
                      <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: '#2C6B3F', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={13} />Dans le pipe</span>
                    ) : (
                      <button disabled={addCandMut.isPending} onClick={() => addCandMut.mutate(c.id)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: MANROPE, fontWeight: 700, fontSize: 12, background: NAVY, color: LIME, border: 'none', borderRadius: 9, padding: '7px 12px', cursor: 'pointer' }}><UserPlus size={13} />Ajouter</button>
                    )}
                  </div>
                );
              })}
            </div>
            {addSearch.trim().length >= 2 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(34,23,122,0.08)' }}>
                <button disabled={createCandMut.isPending} onClick={() => createCandMut.mutate()} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: MANROPE, fontWeight: 700, fontSize: 13, background: '#F0EFC4', color: NAVY, border: '1px dashed rgba(34,23,122,0.3)', borderRadius: 11, padding: '11px', cursor: 'pointer' }}>
                  <UserPlus size={15} />{createCandMut.isPending ? 'Création…' : <>Créer « <strong>{addSearch.trim()}</strong> » et l'ajouter</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ MODAL · GÉRER L'ACCÈS ═══════════ */}
      {accessOpen && (
        <div onClick={() => setAccessOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,21,51,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 20, boxShadow: '0 40px 90px -40px rgba(26,21,51,0.6)', padding: 26 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontFamily: ARCHIVO, fontSize: 20, letterSpacing: '-0.02em', color: INK }}>Gérer l'accès client</div>
                <div style={{ fontSize: 13, color: '#8A8699', marginTop: 4 }}>Plusieurs contacts de {mandat.entreprise.nom} peuvent suivre ce mandat, chacun avec son login.</div>
              </div>
              <button onClick={() => setAccessOpen(false)} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#F5F4EA', color: '#8A8699', cursor: 'pointer', flexShrink: 0 }}>✕</button>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8A8699', marginTop: 22 }}>Accès portail{mandat.client ? ` · client ${`${mandat.client.prenom || ''} ${mandat.client.nom}`.trim()}` : ''}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12 }}>
              {(portalAccessesQuery.data || []).length === 0 && <div style={{ fontSize: 13, color: FAINT }}>Aucun accès portail pour l'instant.</div>}
              {(portalAccessesQuery.data || []).map((a) => {
                const nm = a.client ? `${a.client.prenom || ''} ${a.client.nom}`.trim() : a.email;
                const revoked = !!a.revokedAt;
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid rgba(34,23,122,0.1)', borderRadius: 13, opacity: revoked ? 0.55 : 1 }}>
                    <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: '50%', background: '#8E7CC3', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ARCHIVO, fontSize: 12 }}>{nameInitials(nm)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{nm}</div>
                      <div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 2 }}>{a.email}{lastGrantedPwd && lastGrantedPwd.email === a.email ? <> · mdp : <strong style={{ color: NAVY, fontFamily: 'monospace' }}>{lastGrantedPwd.pwd}</strong></> : null}</div>
                    </div>
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: '4px 10px', background: revoked ? '#F5DED9' : (a.lastLoginAt ? '#EAF3EC' : '#FBF3E7'), color: revoked ? '#B3261E' : (a.lastLoginAt ? '#2C6B3F' : '#8A6A2E'), whiteSpace: 'nowrap' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: revoked ? '#B3261E' : (a.lastLoginAt ? '#3B9A54' : '#E08A2B') }} />{revoked ? 'révoqué' : (a.lastLoginAt ? `connecté ${new Date(a.lastLoginAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}` : 'jamais connecté')}</span>
                      {!revoked && <button onClick={() => revokePortalMutation.mutate(a.id)} disabled={revokePortalMutation.isPending} style={{ fontSize: 12.5, fontWeight: 700, color: '#B3261E', background: 'transparent', border: '1px solid rgba(179,38,30,0.25)', borderRadius: 9, padding: '7px 12px', cursor: 'pointer' }}>Révoquer</button>}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8A8699', marginTop: 22 }}>Inviter un contact</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, marginTop: 12 }}>
              <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Nom & prénom" style={modalInputStyle} />
              <div style={{ position: 'relative' }}>
                <select value={cRole} onChange={(e) => setCRole(e.target.value)} style={{ ...modalInputStyle, appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 34, cursor: 'pointer' }}>
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <ChevronDown size={14} color="#8A8699" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              </div>
              <input value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder="Email professionnel" style={{ ...modalInputStyle, gridColumn: '1 / -1' }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '11px 13px', background: '#FCFCF5', border: '1px solid rgba(34,23,122,0.1)', borderRadius: 11, cursor: 'pointer' }}>
              <span onClick={() => setInviteMail((v) => !v)} style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `1.5px solid ${inviteMail ? NAVY : 'rgba(34,23,122,.25)'}`, background: inviteMail ? LIME : '#fff' }}>{inviteMail && <Check size={12} color={NAVY} strokeWidth={3.2} />}</span>
              <Mail size={15} color="#5B4B9E" />
              <span style={{ fontSize: 13, color: SECONDARY }}>Envoyer l'<strong style={{ color: INK }}>email d'invitation</strong> avec le lien et les identifiants</span>
            </label>

            {inviteMail ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '14px 0 6px' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.11em', textTransform: 'uppercase', color: '#8A8699' }}>Aperçu de l'email</span>
                  <span style={{ fontSize: 11, color: FAINT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>objet : {inviteSubject}</span>
                </div>
                <pre style={{ maxHeight: 150, overflowY: 'auto', margin: 0, fontFamily: MANROPE, fontSize: 12.5, lineHeight: 1.62, color: SECONDARY, whiteSpace: 'pre-wrap', background: '#FCFCF5', border: '1px solid rgba(34,23,122,0.11)', borderRadius: 12, padding: '13px 15px' }}>{inviteBody}</pre>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11, fontSize: 12, color: '#8A8699' }}><Info size={14} /> L'accès est créé mais rien n'est envoyé — à vous de transmettre les identifiants.</div>
            )}
            <button onClick={submitGrant} disabled={grantAccessMutation.isPending} style={{ width: '100%', marginTop: 16, fontFamily: MANROPE, fontWeight: 700, fontSize: 15, background: NAVY, color: LIME, border: 'none', borderRadius: 12, padding: 14, cursor: 'pointer', opacity: grantAccessMutation.isPending ? 0.6 : 1 }}>{grantAccessMutation.isPending ? 'Création…' : "Créer l'accès"}</button>
          </div>
        </div>
      )}

      {/* ═══════════ MODAL · PUBLIER L'OFFRE ═══════════ */}
      {pubOpen && jForm && (
        <div onClick={() => setPubOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,21,51,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 1080, maxWidth: '100%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', background: '#fff', borderRadius: 20, boxShadow: '0 40px 90px -40px rgba(26,21,51,0.6)' }}>
            {/* FORM */}
            <div className="scrollcol" style={{ width: 400, flexShrink: 0, overflowY: 'auto', padding: '24px 26px', borderRight: '1px solid rgba(34,23,122,0.09)', background: '#FCFCF5' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontFamily: ARCHIVO, fontSize: 19, letterSpacing: '-0.02em', color: INK }}>Publier l'offre</div>
                  <div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 3 }}>Annonce anonyme sur humanup.io</div>
                </div>
                <button onClick={() => setPubOpen(false)} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#F5F4EA', color: '#8A8699', cursor: 'pointer', flexShrink: 0 }}>✕</button>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 18, padding: '12px 14px', borderRadius: 12, background: pubDraft ? '#EAF3EC' : '#FCFCF5', border: `1px solid ${pubDraft ? 'rgba(59,154,84,.28)' : 'rgba(34,23,122,.1)'}`, cursor: 'pointer' }}>
                <span onClick={() => setPubDraft((v) => !v)} style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `1.5px solid ${pubDraft ? NAVY : 'rgba(34,23,122,.25)'}`, background: pubDraft ? LIME : '#fff' }}>{pubDraft && <Check size={12} color={NAVY} strokeWidth={3.2} />}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: INK }}>{pubDraft ? 'Offre visible sur le site' : 'Offre hors ligne'}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: pubDraft ? '#2C6B3F' : '#8A8699', marginTop: 2 }}>{pubDraft ? 'Publiée sur humanup.io/job-board, candidatures ouvertes.' : "Rien n'est visible publiquement."}</span>
                </span>
              </label>

              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.11em', textTransform: 'uppercase', color: '#8A7F5A', marginTop: 20 }}>L'annonce</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 11 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
                  <div><label style={pubLabelStyle}>Référence</label><input value={jForm.jRef} onChange={setJField('jRef')} style={pubInputStyle} /></div>
                  <div><label style={pubLabelStyle}>Secteur</label><input value={jForm.jSector} onChange={setJField('jSector')} style={pubInputStyle} /></div>
                </div>
                <div><label style={pubLabelStyle}>Intitulé du poste</label><input value={jForm.jTitle} onChange={setJField('jTitle')} style={pubInputStyle} /></div>
                <div><label style={pubLabelStyle}>Descriptif anonyme de l'entreprise</label><input value={jForm.jCompany} onChange={setJField('jCompany')} style={pubInputStyle} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
                  <div><label style={pubLabelStyle}>Contrat</label><input value={jForm.jContract} onChange={setJField('jContract')} style={pubInputStyle} /></div>
                  <div><label style={pubLabelStyle}>Localisation</label><input value={jForm.jLoc} onChange={setJField('jLoc')} style={pubInputStyle} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
                  <div><label style={pubLabelStyle}>Séniorité</label>
                    <select value={jForm.jSen} onChange={setJField('jSen')} style={{ ...pubInputStyle, cursor: 'pointer' }}>{SEN_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                  </div>
                  <div><label style={pubLabelStyle}>Télétravail</label><input value={jForm.jRemote} onChange={setJField('jRemote')} style={pubInputStyle} /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
                  <div><label style={pubLabelStyle}>Fixe</label><input value={jForm.jFix} onChange={setJField('jFix')} style={pubInputStyle} /></div>
                  <div><label style={pubLabelStyle}>Variable / autres</label><input value={jForm.jVar} onChange={setJField('jVar')} style={pubInputStyle} /></div>
                </div>
                <div><label style={pubLabelStyle}>Prise de poste</label><input value={jForm.jStart} onChange={setJField('jStart')} style={pubInputStyle} /></div>
                <div><label style={pubLabelStyle}>Le poste</label><textarea value={jForm.jIntro} onChange={setJField('jIntro')} style={{ ...pubInputStyle, minHeight: 76, resize: 'vertical', lineHeight: 1.55 }} /></div>
                <div><label style={pubLabelStyle}>Vos missions — une par ligne</label><textarea value={jForm.jMissions} onChange={setJField('jMissions')} style={{ ...pubInputStyle, minHeight: 88, resize: 'vertical', lineHeight: 1.55 }} /></div>
                <div><label style={pubLabelStyle}>Profil recherché — une par ligne</label><textarea value={jForm.jProfile} onChange={setJField('jProfile')} style={{ ...pubInputStyle, minHeight: 76, resize: 'vertical', lineHeight: 1.55 }} /></div>
                <div><label style={pubLabelStyle}>Process — « Étape :: détail », une par ligne</label><textarea value={jForm.jProcess} onChange={setJField('jProcess')} style={{ ...pubInputStyle, minHeight: 88, resize: 'vertical', lineHeight: 1.55 }} /></div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 16, padding: '11px 13px', background: '#F2F3D8', border: '1px solid rgba(34,23,122,0.14)', borderRadius: 11 }}>
                <Info size={14} color={NAVY} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, lineHeight: 1.5, color: SECONDARY }}>Le nom du client n'apparaît jamais. Les candidatures arrivent dans <strong>Sourcing</strong> du Kanban de ce mandat, marquées « Job board ».</span>
              </div>

              <button onClick={savePub} style={{ width: '100%', marginTop: 14, fontFamily: MANROPE, fontWeight: 700, fontSize: 15, background: NAVY, color: LIME, border: 'none', borderRadius: 12, padding: 14, cursor: 'pointer' }}>{published ? "Mettre à jour l'annonce" : "Publier l'offre"}</button>
              {published && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '10px 13px', background: '#fff', border: '1px solid rgba(34,23,122,0.12)', borderRadius: 10 }}>
                  <Globe size={13} color={NAVY} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>humanup.io/job-board/{jForm.jRef.toLowerCase()}</span>
                </div>
              )}
            </div>

            {/* PREVIEW */}
            <div className="scrollcol" style={{ flex: 1, minWidth: 0, overflowX: 'auto', overflowY: 'auto', background: '#FBFBF3', padding: '28px 32px 34px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: FAINT }}>HumanUp <span style={{ color: '#C4C1D0' }}>/</span> Job board <span style={{ color: '#C4C1D0' }}>/</span> <span style={{ color: NAVY }}>{jForm.jTitle.toUpperCase()}</span></div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px,1.5fr) minmax(280px,1fr)', gap: 26, marginTop: 18, alignItems: 'start', minWidth: 706 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', background: LIME, color: NAVY, borderRadius: 999, padding: '5px 12px' }}>{jForm.jSector}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A8699' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: NAVY }} />Réf. {jForm.jRef} · publiée aujourd'hui</span>
                  </div>
                  <h1 style={{ fontFamily: ARCHIVO, fontSize: 38, lineHeight: 1.04, letterSpacing: '-0.035em', color: INK, marginTop: 14 }}>{jForm.jTitle}</h1>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18, padding: '14px 16px', border: '1.5px dashed rgba(34,23,122,0.2)', borderRadius: 14, background: '#F7F7EE' }}>
                    <span style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, background: LIME, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={NAVY} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span>
                    <div style={{ minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 800, color: INK }}>Entreprise confidentielle</div><div style={{ fontSize: 12.5, color: TERTIARY, marginTop: 2 }}>{jForm.jCompany} · dévoilée après échange</div></div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 16 }}>
                    {jChips.map((ch, i) => <span key={i} style={{ fontSize: 12.5, fontWeight: 700, borderRadius: 999, padding: '8px 15px', background: ch.bg, color: ch.fg, border: `1px solid ${ch.bd}` }}>{ch.v}</span>)}
                  </div>

                  <div style={{ fontFamily: ARCHIVO, fontSize: 20, letterSpacing: '-0.02em', color: INK, marginTop: 26 }}>Le poste</div>
                  <span style={{ display: 'block', width: 44, height: 3, borderRadius: 2, background: LIME, marginTop: 7 }} />
                  <p style={{ fontSize: 14.5, lineHeight: 1.68, color: SECONDARY, marginTop: 13 }}>{jForm.jIntro}</p>

                  <div style={{ fontFamily: ARCHIVO, fontSize: 20, letterSpacing: '-0.02em', color: INK, marginTop: 26 }}>Vos missions</div>
                  <span style={{ display: 'block', width: 44, height: 3, borderRadius: 2, background: LIME, marginTop: 7 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', marginTop: 13 }}>
                    {jMissionList.map((ms, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '12px 0', borderBottom: '1px solid rgba(34,23,122,0.08)' }}>
                        <span style={{ flexShrink: 0, fontFamily: MANROPE, fontWeight: 800, fontSize: 10.5, color: NAVY, background: '#F0EFC4', borderRadius: 6, padding: '3px 7px' }}>{ms.n}</span>
                        <span style={{ fontSize: 14, lineHeight: 1.6, color: SECONDARY }}>{ms.t}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontFamily: ARCHIVO, fontSize: 20, letterSpacing: '-0.02em', color: INK, marginTop: 26 }}>Profil recherché</div>
                  <span style={{ display: 'block', width: 44, height: 3, borderRadius: 2, background: LIME, marginTop: 7 }} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 13 }}>
                    {jProfileList.map((pr, i) => <span key={i} style={{ fontSize: 12.5, fontWeight: 700, borderRadius: 999, padding: '8px 15px', background: '#fff', color: SECONDARY, border: '1px solid rgba(34,23,122,0.16)' }}>{pr}</span>)}
                  </div>

                  <div style={{ fontFamily: ARCHIVO, fontSize: 20, letterSpacing: '-0.02em', color: INK, marginTop: 26 }}>Le process</div>
                  <span style={{ display: 'block', width: 44, height: 3, borderRadius: 2, background: LIME, marginTop: 7 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 11, marginTop: 14 }}>
                    {jProcessList.map((pc, i) => (
                      <div key={i} style={{ background: '#fff', border: '1px solid rgba(34,23,122,0.1)', borderRadius: 13, padding: 14 }}>
                        <div style={{ fontFamily: MANROPE, fontWeight: 800, fontSize: 11, color: NAVY }}>{pc.n}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: INK, marginTop: 8 }}>{pc.t}</div>
                        <div style={{ fontSize: 11.5, lineHeight: 1.5, color: '#8A8699', marginTop: 4 }}>{pc.d}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SIDE */}
                <div style={{ minWidth: 0, position: 'relative', background: '#fff', border: '1px solid rgba(34,23,122,0.09)', borderRadius: 18, padding: '22px 24px', boxShadow: '0 24px 56px -40px rgba(34,23,122,0.5)', overflow: 'hidden' }}>
                  <span aria-hidden style={{ position: 'absolute', top: -50, right: -40, width: 170, height: 170, borderRadius: '50%', background: 'radial-gradient(circle, rgba(230,233,175,0.5), transparent 70%)' }} />
                  <div style={{ position: 'relative' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8A8699' }}>Rémunération</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 9 }}><span style={{ fontFamily: ARCHIVO, fontSize: 30, letterSpacing: '-0.03em', color: NAVY, whiteSpace: 'nowrap' }}>{jForm.jFix}</span><span style={{ fontSize: 13, color: '#8A8699' }}>fixe</span></div>
                    <div style={{ fontSize: 12.5, color: TERTIARY, marginTop: 5 }}>{jForm.jVar}</div>

                    <div style={{ height: 1, background: 'rgba(34,23,122,0.1)', margin: '18px 0' }} />
                    {jFacts.map((ft, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '7px 0' }}><span style={{ fontSize: 13, color: TERTIARY }}>{ft.k}</span><span style={{ fontSize: 13, fontWeight: 800, color: INK, textAlign: 'right' }}>{ft.v}</span></div>
                    ))}

                    <button style={{ width: '100%', marginTop: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontFamily: MANROPE, fontWeight: 700, fontSize: 15, background: NAVY, color: LIME, border: 'none', borderRadius: 12, padding: 15, cursor: 'pointer' }}>Postuler à cette offre <ArrowRight size={16} color={LIME} /></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={() => deleteMutation.mutate()}
        entityName={`le mandat ${mandat.titrePoste}`}
        isLoading={deleteMutation.isPending}
      />

      {/* Modales obligatoires de changement d'étape (Perdu / RDV client / Placé) */}
      {stageModals}

      <style>{`
        @keyframes atsRise{ from{ opacity:0; transform:translateY(18px);} to{ opacity:1; transform:none;} }
        .fiche-root .rise{ animation:atsRise .66s cubic-bezier(.16,1,.3,1) both; }
        .fiche-root .kpi{ transition:transform .2s cubic-bezier(.16,1,.3,1), box-shadow .2s ease, border-color .2s ease; }
        .fiche-root .kpi:hover{ transform:translateY(-3px); box-shadow:0 18px 36px -26px rgba(34,23,122,.5); border-color:rgba(34,23,122,.18); }
        .fiche-root .kcard{ transition:transform .18s cubic-bezier(.16,1,.3,1), box-shadow .18s ease, border-color .18s ease; }
        .fiche-root .kcard:hover{ transform:translateY(-2px); box-shadow:0 14px 28px -20px rgba(34,23,122,.5); border-color:rgba(34,23,122,.24); }
        .fiche-root .row{ transition:background .15s ease; }
        .fiche-root .row:hover{ background:#FBFBF3; }
        .fiche-root .btn{ transition:transform .16s cubic-bezier(.16,1,.3,1), background .18s ease, border-color .18s ease, box-shadow .2s ease; }
        .fiche-root .btn:hover{ transform:translateY(-1px); }
        .fiche-root .btn:active{ transform:scale(.97); }
        .fiche-root .scrollcol::-webkit-scrollbar{ width:8px; height:8px; }
        .fiche-root .scrollcol::-webkit-scrollbar-thumb{ background:rgba(34,23,122,.16); border-radius:999px; }
        .fiche-root select:focus, .fiche-root input:focus, .fiche-root textarea:focus{ border-color:#22177A !important; box-shadow:0 0 0 3px rgba(34,23,122,.1); }
        @media (max-width:1320px){ .fiche-root aside[data-rail]{ width:330px !important; } }
        @media (max-width:1180px){ .fiche-root aside[data-rail]{ width:290px !important; } }
        @media (max-width:1080px){ .fiche-root aside[data-rail]{ display:none !important; } .fiche-root main{ min-width:0; } }
        @media (prefers-reduced-motion: reduce){ .fiche-root *{ animation-duration:.001s !important; } }
      `}</style>
    </div>
  );
}

const fieldLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: FAINT };
const fieldValue: React.CSSProperties = { fontSize: 13.5, fontWeight: 600, color: INK, marginTop: 3 };
