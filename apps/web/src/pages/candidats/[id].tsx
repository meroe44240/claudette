import { useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useGoBack } from '../../hooks/useGoBack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, ChevronDown, Plus, Star, Mail, Phone, Linkedin, MapPin,
  Trash2, X, FileText, Upload, Download, Calendar, Send, MessageSquare,
  CheckSquare, Ban, Clock, Building2, Euro, Briefcase, MailCheck, ShieldCheck,
  ExternalLink, Tag, MoreVertical, Pencil, Eye, EyeOff,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { usePageTitle } from '../../hooks/usePageTitle';
import { toast } from '../../components/ui/Toast';
import NoteContent from '../../components/activity/NoteContent';
import MentionTextarea from '../../components/activity/MentionTextarea';
import QualificationCard from '../../components/candidats/QualificationCard';
import CandidatureQualif from '../../components/candidats/CandidatureQualif';
import DossierClientModal from '../../components/candidats/DossierClientModal';
import SynthesesTab, { type SynthesesTabHandle } from '../../components/candidats/SynthesesTab';
import PhotoMenu from '../../components/candidats/PhotoMenu';
import EspaceCandidatCard from '../../components/candidats/EspaceCandidatCard';
import { useStageChange } from '../../components/mandats/useStageChange';

// ─── TYPES ──────────────────────────────────────────
interface Candidature {
  id: string; stage: string;
  mandat: { id: string; titrePoste: string; slug: string | null; entreprise: { id: string; nom: string }; statut: string };
  createdAt: string; interetConfirme?: boolean;
}
interface Experience { id: string; titre: string; entreprise: string; anneeDebut: number; anneeFin: number | null; highlights: string[]; source: string }
interface CandidatDetail {
  id: string; nom: string; prenom: string | null; email: string | null; telephone: string | null;
  linkedinUrl: string | null; photoUrl: string | null; cvUrl: string | null;
  posteActuel: string | null; entrepriseActuelle: string | null; localisation: string | null;
  salaireSouhaite: number | null; salaireActuel?: number | null; anneesExperience?: number | null; mobilite?: string | null;
  tier?: string | null; disponibilite: string | null; source: string | null;
  tags: string[]; aiPitchLong: string | null; aiPitchShort: string | null;
  cvConsent?: boolean; cvConsentDate?: string | null;
  candidatures: Candidature[]; experiences: Experience[];
}
interface Activite {
  id: string; type: string; titre: string | null; contenu: string | null; createdAt: string;
  isTache: boolean; tacheCompleted: boolean; tacheDueDate: string | null;
  user: { nom: string; prenom: string | null } | null;
  metadata?: Record<string, any> | null;
}

// ─── STAGES ─────────────────────────────────────────
const STAGES = ['SOURCING', 'CONTACTE', 'ENTRETIEN_1', 'ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'PROCESS', 'OFFRE', 'PLACE'];
const STAGE_META: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  SOURCING: { label: 'Sourcing', bg: 'rgba(34,23,122,.07)', fg: '#22177A', dot: '#8E7CC3' },
  CONTACTE: { label: 'Qualification', bg: 'rgba(34,23,122,.07)', fg: '#22177A', dot: '#8E7CC3' },
  ENTRETIEN_1: { label: 'Entretien interne', bg: 'rgba(34,23,122,.09)', fg: '#22177A', dot: '#22177A' },
  ENVOYE_CLIENT: { label: 'Envoi client', bg: '#E8EEF9', fg: '#2A4A8A', dot: '#2A6BD8' },
  ENTRETIEN_CLIENT: { label: 'Entr. client', bg: '#FBF3E7', fg: '#8A6A2E', dot: '#E08A2B' },
  PROCESS: { label: 'Process', bg: '#FDF3D3', fg: '#8A6A2E', dot: '#D9A441' },
  OFFRE: { label: 'Offre', bg: '#F0EFC4', fg: '#8A6A2E', dot: '#C9A227' },
  PLACE: { label: 'Gagné', bg: '#EAF3EC', fg: '#2C6B3F', dot: '#3B9A54' },
  REFUSE: { label: 'Perdu', bg: '#F7DEDB', fg: '#B3261E', dot: '#B3261E' },
};
const SEG_COLORS = ['#8E7CC3', '#8E7CC3', '#22177A', '#2A6BD8', '#E08A2B', '#D9A441', '#C9A227', '#3B9A54'];
const SOURCE_OPTIONS = ['LinkedIn', 'Kalent', 'List Push', 'Candidature spontanée', 'Cooptation', 'Indeed', 'Jobboard client', 'Réseau', 'Autre'];
// value = enum backend (motifRefus), label = affichage
const LOST_REASONS: { value: string; label: string }[] = [
  { value: 'PROFIL_PAS_ALIGNE', label: 'Ne convient pas au poste' },
  { value: 'SALAIRE', label: 'Prétentions trop élevées' },
  { value: 'CANDIDAT_DECLINE', label: 'Refus / désistement du candidat' },
  { value: 'CLIENT_REFUSE', label: 'Refusé par le client' },
  { value: 'TIMING', label: 'Timing / process trop long' },
  { value: 'POSTE_POURVU', label: 'Poste pourvu' },
  { value: 'AUTRE', label: 'Autre' },
];

// ─── HELPERS ────────────────────────────────────────
function initials(prenom: string | null, nom: string) { return `${(prenom?.[0] ?? '')}${nom?.[0] ?? ''}`.toUpperCase() || '?'; }

function relTime(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "aujourd'hui"; if (d === 1) return 'hier'; if (d < 30) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
const authHeader = (): Record<string, string> => { const t = localStorage.getItem('accessToken'); return t ? { Authorization: `Bearer ${t}` } : {}; };

// ═════════════════════════════════════════════════════
type TabKey = 'apercu' | 'mandats' | 'appels' | 'entretiens' | 'cv' | 'notes' | 'messages';
const TIER_META: Record<string, { bg: string; fg: string }> = {
  A: { bg: '#EAF3EC', fg: '#2C6B3F' },
  B: { bg: '#E8EEF9', fg: '#2A4A8A' },
  C: { bg: '#F5F4EA', fg: '#6E6A85' },
};
const DECISION_LABEL: Record<string, string> = { RENCONTRER: 'À rencontrer', A_DISCUTER: 'À discuter', ECARTER: 'Écarté' };
interface PortailSummary {
  coordonneesVisibles: boolean;
  mandats: Array<{ candidatureId: string; mandatId: string; titre: string; entreprise: string; portailActif: boolean; visible: boolean; decision: string | null; commentaires: number }>;
}

export default function CandidatDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { goBack, hasHistory } = useGoBack('/candidats');
  const qc = useQueryClient();
  usePageTitle('Fiche candidat');

  const [tab, setTab] = useState<TabKey>('apercu');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [taskText, setTaskText] = useState('');
  const [linkSel, setLinkSel] = useState('');
  const [lost, setLost] = useState<{ candId: string; titre: string; company: string } | null>(null);
  const [lostReason, setLostReason] = useState('');
  const [lostNote, setLostNote] = useState('');
  const [lostMsg, setLostMsg] = useState('');
  const [lostMail, setLostMail] = useState(true);
  const [planOpen, setPlanOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tierOpen, setTierOpen] = useState(false);
  const [showAllActs, setShowAllActs] = useState(false);
  const [openCall, setOpenCall] = useState<string | null>(null);
  const [trameFor, setTrameFor] = useState<string | null>(null);
  const cvInputRef = useRef<HTMLInputElement>(null);
  const synthRef = useRef<SynthesesTabHandle>(null);

  const { data: c, isLoading } = useQuery({ queryKey: ['candidat', id], queryFn: () => api.get<CandidatDetail>(`/candidats/${id}`), enabled: !!id });
  const { data: actsRaw } = useQuery({ queryKey: ['activites', 'candidat', id], queryFn: () => api.get<{ data: Activite[] }>(`/activites?entiteType=CANDIDAT&entiteId=${id}&perPage=100`), enabled: !!id });
  const { data: mandatsData } = useQuery({ queryKey: ['mandats', 'open'], queryFn: () => api.get<{ data: { id: string; titrePoste: string; entreprise: { nom: string } }[] }>('/mandats?statut=OUVERT&perPage=200&scope=all'), staleTime: 5 * 60 * 1000 });
  const { data: portail } = useQuery({ queryKey: ['candidat-portail', id], queryFn: () => api.get<PortailSummary>(`/candidats/${id}/portail`), enabled: !!id });

  const acts = actsRaw?.data ?? [];
  const feed = acts.filter(a => !a.isTache);
  const calls = acts.filter(a => a.type === 'APPEL');
  const meetings = acts.filter(a => a.type === 'MEETING');
  const notes = acts.filter(a => a.type === 'NOTE' && !a.isTache && !a.metadata?.synthese && !/^(Pipeline :|Ajouté au mandat|Portail client :|Candidat créé auto)/.test(a.titre ?? ''));
  const tasks = acts.filter(a => a.isTache);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['candidat', id] });
    qc.invalidateQueries({ queryKey: ['activites', 'candidat', id] });
    qc.invalidateQueries({ queryKey: ['candidat-portail', id] });
    qc.invalidateQueries({ queryKey: ['espace-candidat', id] });
  };

  // « Entretien client » exige date, heure et interlocuteur : même modale que sur la fiche mandat.
  const { requestMove: requestStageMove, modals: stageModals } = useStageChange(() => invalidate());
  const stageMut = useMutation({ mutationFn: ({ candId, stage }: { candId: string; stage: string }) => api.put(`/candidatures/${candId}`, { stage }), onSuccess: () => { invalidate(); toast('success', 'Étape mise à jour'); }, onError: (e: any) => toast('error', e?.message || 'Échec') });
  const loseMut = useMutation({ mutationFn: ({ candId, motifRefus, motifRefusDetail, candidateMessage }: { candId: string; motifRefus: string; motifRefusDetail?: string; candidateMessage?: string }) => api.put(`/candidatures/${candId}`, { stage: 'REFUSE', motifRefus, motifRefusDetail, candidateMessage }), onSuccess: () => { invalidate(); setLost(null); setLostReason(''); setLostNote(''); setLostMsg(''); toast('success', 'Profil archivé (no-go)'); }, onError: (e: any) => toast('error', e?.message || "Échec de l'archivage") });
  const removeMut = useMutation({ mutationFn: (candId: string) => api.delete(`/candidatures/${candId}`), onSuccess: () => { invalidate(); toast('success', 'Retiré du mandat'); } });
  const noShowMut = useMutation({ mutationFn: (candId: string) => api.put(`/candidatures/${candId}`, { presentationNoShow: true }), onSuccess: () => { invalidate(); toast('success', 'Présentation marquée no-show'); } });
  const linkMut = useMutation({ mutationFn: (mandatId: string) => api.post('/candidatures', { candidatId: id, mandatId, stage: 'SOURCING' }), onSuccess: () => { invalidate(); setLinkSel(''); toast('success', 'Relié au mandat'); } });
  const sourceMut = useMutation({ mutationFn: (source: string) => api.put(`/candidats/${id}`, { source }), onSuccess: () => { invalidate(); toast('success', 'Source mise à jour'); } });
  const tierMut = useMutation({ mutationFn: (tier: string | null) => api.put(`/candidats/${id}`, { tier }), onSuccess: () => { invalidate(); setTierOpen(false); } });
  const confirmMut = useMutation({ mutationFn: () => api.post<{ sentTo: string }>(`/confirmation/request/${id}`), onSuccess: (r) => toast('success', `Email de confirmation envoyé à ${r?.sentTo || 'le candidat'}`), onError: (e: any) => toast('error', e?.message || "Échec de l'envoi (le candidat a-t-il un email ?)") });
  const actMut = useMutation({ mutationFn: (body: Record<string, unknown>) => api.post('/activites', { entiteType: 'CANDIDAT', entiteId: id, ...body }), onSuccess: () => { invalidate(); } });
  const toggleTaskMut = useMutation({ mutationFn: ({ actId, done }: { actId: string; done: boolean }) => api.put(`/activites/${actId}`, { tacheCompleted: done }), onSuccess: () => invalidate() });

  const cvUpload = async (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    try {
      const res = await fetch(`/api/v1/candidats/${id}/cv`, { method: 'POST', headers: { ...authHeader() }, body: fd });
      if (!res.ok) throw new Error('upload');
      invalidate(); toast('success', 'CV importé');
    } catch { toast('error', "Échec de l'import du CV"); }
  };

  const linkedMandatIds = useMemo(() => new Set((c?.candidatures ?? []).map(x => x.mandat.id)), [c]);
  const mandatOptions = (mandatsData?.data ?? []).filter(m => !linkedMandatIds.has(m.id));

  if (isLoading || !c) return <div style={{ padding: 40, color: '#8A8699' }}>Chargement…</div>;

  const fullName = `${c.prenom ? c.prenom + ' ' : ''}${c.nom}`.trim();
  const submitComment = () => { const t = comment.trim(); if (!t) return; actMut.mutate({ type: 'NOTE', contenu: t, mentionedUserIds: mentionIds }); setComment(''); setMentionIds([]); };
  const submitTask = () => { const t = taskText.trim(); if (!t) return; actMut.mutate({ type: 'TACHE', isTache: true, titre: t }); setTaskText(''); };
  const submitEval = () => { if (!rating) { toast('error', 'Choisissez une note'); return; } actMut.mutate({ type: 'NOTE', titre: `Évaluation ${'★'.repeat(rating)}`, contenu: comment.trim() || `Note ${rating}/5` }); setComment(''); setRating(0); toast('success', 'Évaluation ajoutée'); };
  const changeStage = (cand: Candidature, stage: string) => {
    if (stage === cand.stage) return;
    if (stage === 'REFUSE') { setLost({ candId: cand.id, titre: cand.mandat.titrePoste, company: cand.mandat.entreprise.nom }); return; }
    if (stage === 'ENTRETIEN_CLIENT') { requestStageMove(cand.id, stage, { candidatName: c ? `${c.prenom || ''} ${c.nom}`.trim() : null }); return; }
    stageMut.mutate({ candId: cand.id, stage });
  };
  const addSynthese = () => { setTab('entretiens'); setTimeout(() => synthRef.current?.pick(), 50); };

  const linkedinSlug = c.linkedinUrl ? c.linkedinUrl.replace(/^https?:\/\/(www\.)?linkedin\.com/i, '').replace(/\/$/, '') || 'LinkedIn' : null;
  const posteLine = [c.posteActuel, c.entrepriseActuelle].filter(Boolean).join(' chez ');
  const tier = c.tier && TIER_META[c.tier] ? c.tier : null;
  const facts: { label: string; value: string | null; hi?: boolean }[] = [
    { label: 'Prétentions', value: c.salaireSouhaite ? `${c.salaireSouhaite.toLocaleString('fr-FR')} €` : null, hi: true },
    { label: 'Rémunération actuelle', value: c.salaireActuel ? `${c.salaireActuel.toLocaleString('fr-FR')} €` : null },
    { label: 'Disponibilité', value: c.disponibilite },
    { label: 'Expérience', value: c.anneesExperience != null ? `${c.anneesExperience} ans` : null },
    { label: 'Localisation', value: c.localisation },
    { label: 'Mobilité', value: c.mobilite ?? null },
  ];
  const tabs: [TabKey, string, number | null][] = [
    ['apercu', 'Aperçu', null], ['mandats', 'Mandats', c.candidatures.length], ['appels', 'Appels', calls.length],
    ['entretiens', 'Entretiens', null], ['cv', 'CV', null], ['notes', 'Notes', notes.length], ['messages', 'Messages', null],
  ];
  const card: React.CSSProperties = { background: '#fff', border: '1px solid rgba(34,23,122,.09)', borderRadius: 16, padding: '18px 20px' };
  const h2: React.CSSProperties = { fontWeight: 800, fontSize: 15.5, letterSpacing: '-.01em', color: '#1A1533' };
  const linkStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 600, color: '#4A4568', textDecoration: 'none', background: 'none', border: 'none', padding: 0, cursor: 'pointer' };
  const ghostBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,.18)', borderRadius: 10, padding: '9px 14px', cursor: 'pointer' };

  return (
    <div>
      <style>{`
        @keyframes fmIn{ from{ transform:translate(-50%,calc(-50% + 14px)); opacity:0; } to{ transform:translate(-50%,-50%); opacity:1; } }
        @keyframes spin{ to{ transform:rotate(360deg); } }
        .spin{ animation:spin 1s linear infinite; }
        .fmodal{ animation:fmIn .3s cubic-bezier(.16,1,.3,1) both; }
        .drop:hover{ background:#F2F3D8 !important; border-color:rgba(34,23,122,.4) !important; }
        .fc-tab{ position:relative; font-size:14px; font-weight:600; color:#6E6A85; background:none; border:none; padding:12px 2px; cursor:pointer; display:inline-flex; align-items:center; gap:7px; white-space:nowrap; }
        .fc-tab[aria-selected="true"]{ color:#1A1533; font-weight:800; }
        .fc-tab[aria-selected="true"]::after{ content:''; position:absolute; left:0; right:0; bottom:-1px; height:2.5px; border-radius:2px; background:#22177A; }
        .fc-link:hover{ color:#22177A !important; }
        .fc-menu button{ display:flex; align-items:center; gap:9px; width:100%; text-align:left; font-size:13px; font-weight:600; color:#1A1533; background:none; border:none; padding:9px 12px; border-radius:8px; cursor:pointer; }
        .fc-menu button:hover{ background:#F5F4EA; }
        .fc-grid{ display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:22px; align-items:start; }
        @media (max-width:1100px){ .fc-grid{ grid-template-columns:1fr; } .fc-rail{ position:static !important; } }
      `}</style>

      {/* TOPBAR */}
      <button onClick={goBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#4A4568', border: '1px solid rgba(34,23,122,.14)', background: '#fff', borderRadius: 10, padding: '8px 13px', cursor: 'pointer', marginBottom: 14 }}><ArrowLeft size={14} strokeWidth={2.4} />{hasHistory ? 'Retour' : 'Candidats'}</button>

      {/* EN-TÊTE */}
      <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.09)', borderRadius: 18, padding: '24px 26px 0' }}>
        <div className="fc-head" style={{ display: 'flex', alignItems: 'flex-start', gap: 22, flexWrap: 'wrap' }}>
          <PhotoMenu candidatId={c.id} photoUrl={c.photoUrl} initials={initials(c.prenom, c.nom)} hasCv={!!c.cvUrl} onChanged={invalidate} />
          <div style={{ flex: '1 1 300px', minWidth: 0, paddingTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 30, letterSpacing: '-.03em', color: '#1A1533', lineHeight: 1.1 }}>{fullName}</h1>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setTierOpen(o => !o)} title="Niveau du profil" style={{ fontSize: 12, fontWeight: 800, borderRadius: 7, padding: '4px 9px', cursor: 'pointer', border: tier ? 'none' : '1px dashed rgba(34,23,122,.3)', background: tier ? TIER_META[tier].bg : '#fff', color: tier ? TIER_META[tier].fg : '#8A8699' }}>{tier ? `Niveau ${tier}` : 'Niveau ?'}</button>
                {tierOpen && (
                  <>
                    <div onClick={() => setTierOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                    <div className="fc-menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 41, background: '#fff', border: '1px solid rgba(34,23,122,.12)', borderRadius: 12, padding: 5, boxShadow: '0 18px 40px -20px rgba(26,21,51,.45)', minWidth: 150 }}>
                      {(['A', 'B', 'C'] as const).map(t => <button key={t} onClick={() => tierMut.mutate(t)}><span style={{ fontSize: 11.5, fontWeight: 800, borderRadius: 6, padding: '2px 7px', background: TIER_META[t].bg, color: TIER_META[t].fg }}>{t}</span>Niveau {t}</button>)}
                      {tier && <button onClick={() => tierMut.mutate(null)} style={{ color: '#8A8699' }}>Retirer</button>}
                    </div>
                  </>
                )}
              </div>
              {c.cvConsent && <span title={c.cvConsentDate ? `Le ${new Date(c.cvConsentDate).toLocaleDateString('fr-FR')}` : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#2C6B3F', background: '#EAF3EC', borderRadius: 7, padding: '4px 9px' }}><ShieldCheck size={13} />Transfert CV accepté</span>}
            </div>
            {posteLine && <div style={{ fontSize: 15.5, color: '#4A4568', marginTop: 6 }}>{posteLine}</div>}
            {c.localisation && <div style={{ fontSize: 14, color: '#8A8699', marginTop: 3 }}>{c.localisation}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 14, flexWrap: 'wrap' }}>
              {linkedinSlug
                ? <a className="fc-link" href={c.linkedinUrl!} target="_blank" rel="noreferrer" style={linkStyle}><Linkedin size={15} />{linkedinSlug}<ExternalLink size={12} /></a>
                : <button className="fc-link" onClick={() => setEditOpen(true)} style={linkStyle}><Linkedin size={15} />Ajouter le LinkedIn</button>}
              {c.telephone
                ? <a className="fc-link" href={`tel:${c.telephone.replace(/\s+/g, '')}`} style={linkStyle}><Phone size={15} />{c.telephone}</a>
                : <button className="fc-link" onClick={() => setEditOpen(true)} style={linkStyle}><Phone size={15} />Ajouter un téléphone</button>}
              {c.email
                ? <a className="fc-link" href={`mailto:${c.email}`} style={linkStyle}><Mail size={15} />{c.email}</a>
                : <button className="fc-link" onClick={() => setEditOpen(true)} style={linkStyle}><Mail size={15} />Ajouter un email</button>}
              {c.tags.length > 0
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{c.tags.slice(0, 3).map(t => <span key={t} style={{ fontSize: 12, fontWeight: 700, borderRadius: 6, padding: '3px 9px', background: '#F2F3D8', color: '#22177A' }}>{t}</span>)}{c.tags.length > 3 && <button onClick={() => setTab('apercu')} style={{ fontSize: 12, fontWeight: 700, color: '#8A8699', background: 'none', border: 'none', cursor: 'pointer' }}>+{c.tags.length - 3}</button>}</span>
                : <button className="fc-link" onClick={() => setEditOpen(true)} style={{ ...linkStyle, color: '#8A8699' }}><Tag size={15} />Ajouter des tags</button>}
            </div>
          </div>
          <div className="fc-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={addSynthese} style={ghostBtn}><Upload size={14} />Ajouter une synthèse</button>
            <button onClick={() => setDossierOpen(true)} style={ghostBtn}><FileText size={14} />Dossier client</button>
            <button onClick={() => setPlanOpen(true)} style={{ ...ghostBtn, color: '#E6E9AF', background: '#22177A', border: '1px solid #22177A' }}><Plus size={14} strokeWidth={2.4} />Prévoir une action</button>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setMenuOpen(o => !o)} aria-label="Plus d'actions" style={{ ...ghostBtn, padding: '9px 10px' }}><MoreVertical size={16} /></button>
              {menuOpen && (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                  <div className="fc-menu" onClick={() => setMenuOpen(false)} style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41, background: '#fff', border: '1px solid rgba(34,23,122,.12)', borderRadius: 12, padding: 5, boxShadow: '0 18px 40px -20px rgba(26,21,51,.45)', minWidth: 240 }}>
                    <button onClick={() => setEditOpen(true)}><Pencil size={14} />Modifier les infos</button>
                    <button onClick={() => setTab('messages')}><Send size={14} />Écrire un message</button>
                    <button onClick={() => confirmMut.mutate()} disabled={!c.email}><MailCheck size={14} />Demander la confirmation</button>
                    <button onClick={() => setExportOpen(true)}><Download size={14} />Exporter</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ONGLETS */}
        <div role="tablist" style={{ display: 'flex', gap: 26, marginTop: 22, borderTop: '1px solid rgba(34,23,122,.08)', overflowX: 'auto', overflowY: 'hidden', paddingBottom: 1 }}>
          {tabs.map(([k, label, n]) => (
            <button key={k} role="tab" aria-selected={tab === k} className="fc-tab" onClick={() => setTab(k)}>
              {label}
              {n !== null && <span style={{ fontSize: 11, fontWeight: 800, color: '#6E6A85', background: '#F2F1EA', borderRadius: 6, padding: '1px 7px' }}>{n}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="fc-grid" style={{ marginTop: 20 }}>
        {/* ─── CONTENU DE L'ONGLET ─── */}
        <div role="tabpanel" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tab === 'apercu' && (
            <>
              <div style={card}>
                <div style={h2}>Synthèse</div>
                <p style={{ fontSize: 14, lineHeight: 1.65, color: '#4A4568', marginTop: 8 }}>{c.aiPitchLong || c.aiPitchShort || 'Pas encore de synthèse. Ajoutez une synthèse d\'entretien ou un CV pour la générer.'}</p>
                {c.tags.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>{c.tags.map(t => <span key={t} style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '4px 11px', background: '#F2F3D8', color: '#22177A' }}>{t}</span>)}</div>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 10 }}>
                {facts.map(f => (
                  <div key={f.label} style={{ background: f.hi && f.value ? '#22177A' : '#fff', border: `1px solid ${f.hi && f.value ? '#22177A' : 'rgba(34,23,122,.09)'}`, borderRadius: 13, padding: '11px 14px' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: f.hi && f.value ? 'rgba(230,233,175,.8)' : '#8A8699' }}>{f.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: f.value ? (f.hi ? '#E6E9AF' : '#1A1533') : '#C4C1D0', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.value || 'Non renseigné'}</div>
                  </div>
                ))}
                <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.09)', borderRadius: 13, padding: '8px 10px 8px 14px' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#8A8699' }}>Source</div>
                  <div style={{ position: 'relative' }}>
                    <select value={c.source ?? ''} onChange={e => sourceMut.mutate(e.target.value)} style={{ appearance: 'none', width: '100%', fontSize: 14, fontWeight: 800, color: '#1A1533', background: 'transparent', border: 'none', padding: '3px 22px 2px 0', cursor: 'pointer', outline: 'none' }}>
                      <option value="">Non renseigné</option>
                      {[...new Set([...(c.source ? [c.source] : []), ...SOURCE_OPTIONS])].map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <ChevronDown size={13} color="#8A8699" style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  </div>
                </div>
              </div>

              <div style={card}>
                <div style={h2}>Expériences</div>
                {c.experiences.length === 0 && <div style={{ color: '#8A8699', fontSize: 13.5, marginTop: 8 }}>Aucune expérience renseignée.</div>}
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {[...c.experiences].sort((a, b) => b.anneeDebut - a.anneeDebut).map(e => (
                    <div key={e.id} style={{ display: 'flex', gap: 14 }}>
                      <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, background: '#F2F3D8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Building2 size={16} color="#22177A" /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#1A1533' }}>{e.titre}</span>
                          <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: '#8A8699' }}>{e.anneeDebut} → {e.anneeFin ?? "aujourd'hui"}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#22177A', fontWeight: 600, marginTop: 2 }}>{e.entreprise}</div>
                        {e.highlights.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>{e.highlights.map((hl, i) => <li key={i} style={{ fontSize: 12.5, color: '#6E6A85', lineHeight: 1.5 }}>{hl}</li>)}</ul>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <QualificationCard candidatId={c.id} />

              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={h2}>Activité récente</div>
                  {feed.length > 6 && <button onClick={() => setShowAllActs(s => !s)} style={{ fontSize: 12.5, fontWeight: 700, color: '#22177A', background: 'none', border: 'none', cursor: 'pointer' }}>{showAllActs ? 'Réduire' : `Tout voir (${feed.length})`}</button>}
                </div>
                {feed.length === 0 && <div style={{ color: '#8A8699', fontSize: 13, marginTop: 8 }}>Aucune activité.</div>}
                <div style={{ marginTop: 6 }}>
                  {(showAllActs ? feed : feed.slice(0, 6)).map(f => (
                    <div key={f.id} style={{ display: 'flex', gap: 11, padding: '9px 0', borderBottom: '1px solid rgba(34,23,122,.06)' }}>
                      <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: '#E6E9AF', color: '#22177A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black',sans-serif", fontSize: 9.5 }}>{initials(f.user?.prenom ?? null, f.user?.nom ?? '?')}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: '#1A1533' }}><strong>{`${f.user?.prenom ?? ''} ${f.user?.nom ?? ''}`.trim() || 'Système'}</strong> <span style={{ color: '#8A8699' }}>· {relTime(f.createdAt)}</span></div>
                        {f.titre && <div style={{ fontSize: 13, color: '#4A4568', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.titre}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'mandats' && (
            <>
              {c.candidatures.length === 0 && <div style={{ ...card, textAlign: 'center', color: '#8A8699', fontSize: 13.5 }}>Dans le vivier, aucun process en cours.</div>}
              {c.candidatures.map(cand => {
                const st = STAGE_META[cand.stage] ?? STAGE_META.SOURCING;
                const idx = STAGES.indexOf(cand.stage);
                const lostState = cand.stage === 'REFUSE';
                return (
                  <div key={cand.id} style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                      <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 11, background: '#F2F3D8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Building2 size={17} color="#22177A" /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a onClick={() => navigate(`/mandats/${cand.mandat.id}`)} style={{ fontSize: 14.5, fontWeight: 800, color: '#1A1533', cursor: 'pointer' }}>{cand.mandat.titrePoste}</a>
                        <div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 2 }}>{cand.mandat.entreprise.nom} · relié {relTime(cand.createdAt)}{cand.interetConfirme ? <span style={{ color: '#2C6B3F', fontWeight: 700 }}> · intérêt confirmé</span> : null}</div>
                      </div>
                      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 800, color: st.fg, background: st.bg, borderRadius: 999, padding: '5px 12px' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />{st.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 14 }}>
                      {STAGES.map((s, i) => <span key={s} title={STAGE_META[s].label} style={{ height: 5, flex: 1, borderRadius: 3, background: lostState ? 'rgba(179,38,30,.25)' : (i <= idx ? SEG_COLORS[i] : 'rgba(34,23,122,.1)') }} />)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                      <button onClick={() => setTrameFor(trameFor === cand.id ? null : cand.id)} style={ghostBtn}>Trame de qualification<ChevronDown size={13} style={{ transform: trameFor === cand.id ? 'rotate(180deg)' : 'none' }} /></button>
                      {cand.stage === 'ENTRETIEN_CLIENT' && <button onClick={() => { if (confirm('Marquer cette présentation comme no-show ?')) noShowMut.mutate(cand.id); }} style={{ ...ghostBtn, color: '#8A6A2E', borderColor: 'rgba(201,162,39,.35)' }}>No-show</button>}
                      {!lostState && <button onClick={() => setLost({ candId: cand.id, titre: cand.mandat.titrePoste, company: cand.mandat.entreprise.nom })} style={{ ...ghostBtn, color: '#B3261E', borderColor: 'rgba(176,54,31,.2)' }}><Ban size={13} />No-go</button>}
                      <button onClick={() => { if (confirm('Retirer du mandat ?')) removeMut.mutate(cand.id); }} title="Retirer du mandat" style={{ ...ghostBtn, marginLeft: 'auto', color: '#B3261E', borderColor: 'rgba(176,54,31,.18)', padding: '9px 10px' }}><Trash2 size={13} /></button>
                    </div>
                    {trameFor === cand.id && <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(34,23,122,.08)' }}><CandidatureQualif candidatureId={cand.id} mandatId={cand.mandat.id} mandatLabel={cand.mandat.titrePoste} /></div>}
                  </div>
                );
              })}
            </>
          )}

          {tab === 'appels' && (
            <div style={card}>
              <div style={h2}>Appels</div>
              {calls.length === 0 && <div style={{ color: '#8A8699', fontSize: 13.5, marginTop: 8 }}>Aucun appel enregistré. Les appels passés avec Allo apparaissent ici avec leur transcript.</div>}
              {calls.map(a => (
                <div key={a.id} style={{ borderBottom: '1px solid rgba(34,23,122,.07)', padding: '12px 0' }}>
                  <button onClick={() => setOpenCall(openCall === a.id ? null : a.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 9, background: '#E8EEF9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Phone size={14} color="#2A4A8A" /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: '#1A1533' }}>{a.titre || 'Appel'}</span>
                      <span style={{ display: 'block', fontSize: 12, color: '#8A8699', marginTop: 2 }}>{`${a.user?.prenom ?? ''} ${a.user?.nom ?? ''}`.trim() || 'Système'} · {relTime(a.createdAt)}</span>
                    </span>
                    {a.contenu && <ChevronDown size={14} color="#8A8699" style={{ transform: openCall === a.id ? 'rotate(180deg)' : 'none' }} />}
                  </button>
                  {openCall === a.id && a.contenu && <div style={{ marginTop: 10, padding: '12px 14px', background: '#FBFBF3', borderRadius: 11, maxHeight: 420, overflowY: 'auto' }}><NoteContent text={a.contenu} /></div>}
                </div>
              ))}
            </div>
          )}

          {tab === 'entretiens' && <div style={card}><SynthesesTab ref={synthRef} candidatId={c.id} meetings={meetings} onApplied={invalidate} /></div>}

          {tab === 'cv' && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={h2}>CV</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {c.cvUrl && <a href={c.cvUrl} target="_blank" rel="noreferrer" style={{ ...ghostBtn, textDecoration: 'none' }}><ExternalLink size={13} />Ouvrir</a>}
                  <button onClick={() => cvInputRef.current?.click()} style={ghostBtn}><Upload size={13} />{c.cvUrl ? 'Remplacer' : 'Importer'}</button>
                </div>
              </div>
              <input ref={cvInputRef} type="file" accept=".pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) cvUpload(f); }} />
              {c.cvUrl
                ? <iframe title={`CV de ${fullName}`} src={c.cvUrl} style={{ width: '100%', height: '78vh', border: '1px solid rgba(34,23,122,.09)', borderRadius: 12, marginTop: 14, background: '#F7F7F0' }} />
                : <div onClick={() => cvInputRef.current?.click()} className="drop" style={{ marginTop: 14, border: '1.5px dashed rgba(34,23,122,.26)', borderRadius: 14, background: '#FCFCF5', padding: 28, textAlign: 'center', cursor: 'pointer' }}>
                    <Upload size={20} color="#22177A" />
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1533', marginTop: 9 }}>Importer le CV</div>
                    <div style={{ fontSize: 12, color: '#8A8699', marginTop: 3 }}>PDF · 10 Mo max</div>
                  </div>}
            </div>
          )}

          {tab === 'notes' && (
            <>
              <div style={card}>
                <div style={h2}>Ajouter une note</div>
                <div style={{ marginTop: 10 }}><MentionTextarea value={comment} onChange={(v, ids) => { setComment(v); setMentionIds(ids); }} placeholder="Votre note ou débrief… (tapez @ pour mentionner un collègue)" minHeight={80} /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setRating(rating === n ? 0 : n)} title={`${n}/5`} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }}><Star size={19} fill={n <= rating ? '#E6C64A' : 'none'} color={n <= rating ? '#E6C64A' : '#C4C1D0'} /></button>)}
                  </div>
                  <span style={{ fontSize: 12, color: '#8A8699' }}>{rating ? `Évaluation ${rating}/5` : 'Note optionnelle'}</span>
                  <button onClick={rating ? submitEval : submitComment} style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 10, padding: '10px 16px', cursor: 'pointer' }}>{rating ? "Enregistrer l'évaluation" : 'Ajouter la note'}</button>
                </div>
              </div>

              <div style={card}>
                <div style={h2}>Tâches</div>
                {tasks.length === 0 && <div style={{ color: '#8A8699', fontSize: 13, marginTop: 8 }}>Aucune tâche.</div>}
                <div style={{ marginTop: 10 }}>
                  {tasks.map(t => {
                    const late = t.tacheDueDate && !t.tacheCompleted && new Date(t.tacheDueDate) < new Date();
                    return (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid rgba(34,23,122,.06)' }}>
                        <span onClick={() => toggleTaskMut.mutate({ actId: t.id, done: !t.tacheCompleted })} style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${t.tacheCompleted ? '#22177A' : 'rgba(34,23,122,.25)'}`, background: t.tacheCompleted ? '#E6E9AF' : '#fff' }}>{t.tacheCompleted && <CheckSquare size={12} color="#22177A" />}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: t.tacheCompleted ? '#B4B0C4' : '#1A1533', textDecoration: t.tacheCompleted ? 'line-through' : 'none' }}>{t.titre || t.contenu}</div>
                          <div style={{ fontSize: 11.5, color: late ? '#B3261E' : '#9A96AE', marginTop: 2 }}>{t.tacheDueDate ? new Date(t.tacheDueDate).toLocaleDateString('fr-FR') : 'Sans échéance'}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <input value={taskText} onChange={e => setTaskText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitTask()} placeholder="Nouvelle tâche…" style={{ flex: 1, fontSize: 13, padding: '10px 13px', borderRadius: 10, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none' }} />
                  <button onClick={submitTask} aria-label="Ajouter la tâche" style={{ flexShrink: 0, fontSize: 15, fontWeight: 700, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 10, padding: '10px 16px', cursor: 'pointer' }}>+</button>
                </div>
              </div>

              <div style={card}>
                <div style={h2}>Notes</div>
                {notes.length === 0 && <div style={{ color: '#8A8699', fontSize: 13, marginTop: 8 }}>Aucune note.</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
                  {notes.map(n => (
                    <div key={n.id} style={{ background: '#FBFBF3', border: '1px solid rgba(34,23,122,.07)', borderRadius: 12, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 12.5, fontWeight: 800, color: '#1A1533' }}>{`${n.user?.prenom ?? ''} ${n.user?.nom ?? ''}`.trim() || 'Système'}</span><span style={{ fontSize: 11.5, color: '#B4B0C4' }}>{relTime(n.createdAt)}</span></div>
                      {n.titre && n.titre !== 'Note' && <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1533', marginTop: 5 }}>{n.titre}</div>}
                      {n.contenu && <div style={{ marginTop: 5 }}><NoteContent text={n.contenu} /></div>}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'messages' && <div style={card}><MessagesTab candidat={c} /></div>}
        </div>

        {/* ─── COLONNE DROITE ─── */}
        <aside className="fc-rail" style={{ position: 'sticky', top: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={card}>
            <div style={h2}>Étape par mandat</div>
            {c.candidatures.length === 0 && <div style={{ fontSize: 13, color: '#8A8699', marginTop: 8 }}>Rattaché à aucun mandat.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              {c.candidatures.map(cand => {
                const st = STAGE_META[cand.stage] ?? STAGE_META.SOURCING;
                return (
                  <div key={cand.id}>
                    <a onClick={() => navigate(`/mandats/${cand.mandat.id}`)} style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#1A1533', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cand.mandat.titrePoste}</a>
                    <div style={{ fontSize: 12, color: '#8A8699', marginBottom: 6 }}>{cand.mandat.entreprise.nom}</div>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, borderRadius: '50%', background: st.dot, pointerEvents: 'none' }} />
                      <select value={cand.stage} onChange={e => changeStage(cand, e.target.value)} disabled={stageMut.isPending} aria-label={`Étape sur ${cand.mandat.titrePoste}`} style={{ appearance: 'none', width: '100%', fontSize: 13.5, fontWeight: 700, color: st.fg, background: st.bg, border: '1px solid rgba(34,23,122,.1)', borderRadius: 10, padding: '10px 32px 10px 28px', cursor: 'pointer', outline: 'none' }}>
                        {[...STAGES, 'REFUSE'].map(s => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
                      </select>
                      <ChevronDown size={14} color={st.fg} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 7, marginTop: 14 }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <select value={linkSel} onChange={e => setLinkSel(e.target.value)} style={{ appearance: 'none', width: '100%', fontSize: 12.5, fontWeight: 600, color: '#4A4568', background: '#FCFCF5', border: '1px dashed rgba(34,23,122,.25)', borderRadius: 10, padding: '9px 28px 9px 11px', cursor: 'pointer', outline: 'none' }}>
                  <option value="">Relier à un mandat…</option>
                  {mandatOptions.map(m => <option key={m.id} value={m.id}>{m.titrePoste} · {m.entreprise.nom}</option>)}
                </select>
                <ChevronDown size={13} color="#8A8699" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              </div>
              <button disabled={!linkSel} onClick={() => linkSel && linkMut.mutate(linkSel)} aria-label="Relier" style={{ flexShrink: 0, background: linkSel ? '#22177A' : '#C4C1D0', color: '#E6E9AF', border: 'none', borderRadius: 10, padding: '0 12px', cursor: linkSel ? 'pointer' : 'default' }}><Plus size={14} strokeWidth={2.8} /></button>
            </div>
          </div>

          <EspaceCandidatCard candidatId={c.id} />

          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={h2}>Portail client</div>
              <button onClick={() => setDossierOpen(true)} style={{ fontSize: 12.5, fontWeight: 700, color: '#22177A', background: 'none', border: 'none', cursor: 'pointer' }}>Dossier client</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: portail?.coordonneesVisibles ? '#2C6B3F' : '#8A8699', marginTop: 8 }}>
              {portail?.coordonneesVisibles ? <Eye size={14} /> : <EyeOff size={14} />}
              {portail?.coordonneesVisibles ? 'Coordonnées montrées au client' : 'Coordonnées masquées, CV téléchargeable'}
            </div>
            {(portail?.mandats ?? []).length === 0 && <div style={{ fontSize: 13, color: '#8A8699', marginTop: 10 }}>Aucun mandat.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
              {(portail?.mandats ?? []).map(m => (
                <div key={m.candidatureId} style={{ padding: '10px 12px', borderRadius: 11, background: '#FBFBF3', border: '1px solid rgba(34,23,122,.07)' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1533', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.entreprise} · {m.titre}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {!m.portailActif
                      ? <span style={{ fontSize: 11.5, fontWeight: 700, color: '#8A8699' }}>Pas de portail ouvert</span>
                      : m.visible
                        ? <span style={{ fontSize: 11.5, fontWeight: 800, color: '#2C6B3F', background: '#EAF3EC', borderRadius: 999, padding: '3px 9px' }}>Visible par le client</span>
                        : <span style={{ fontSize: 11.5, fontWeight: 800, color: '#6E6A85', background: '#F2F1EA', borderRadius: 999, padding: '3px 9px' }}>Masqué</span>}
                    {m.decision && <span style={{ fontSize: 11.5, fontWeight: 800, color: '#22177A', background: '#EDEBFA', borderRadius: 999, padding: '3px 9px' }}>{DECISION_LABEL[m.decision] ?? m.decision}</span>}
                    {m.commentaires > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: '#6E6A85' }}>{m.commentaires} commentaire{m.commentaires > 1 ? 's' : ''}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {stageModals}

      {/* LOST MODAL */}
      {lost && (
        <>
          <div onClick={() => setLost(null)} style={{ position: 'fixed', inset: 0, zIndex: 92, background: 'rgba(26,21,51,.42)' }} />
          <div className="fmodal" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 93, width: 560, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 22, boxShadow: '0 44px 96px -40px rgba(0,0,0,.55)', padding: '26px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 12, background: '#F7DEDB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} color="#B3261E" strokeWidth={2.2} /></span>
              <div><div style={{ fontWeight: 800, fontSize: 17.5, letterSpacing: '-.015em', color: '#1A1533' }}>No-go sur le profil</div><div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 2 }}>Archivé sur {lost.titre} · {lost.company}</div></div>
            </div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: '#8A8699', margin: '22px 0 7px' }}>Pourquoi ?</label>
            <div style={{ position: 'relative' }}>
              <select value={lostReason} onChange={e => setLostReason(e.target.value)} style={{ appearance: 'none', width: '100%', fontFamily: "'Manrope'", fontSize: 13.5, padding: '12px 34px 12px 14px', borderRadius: 12, border: '1.5px solid rgba(34,23,122,.16)', background: '#FCFCF5', color: '#1A1533', cursor: 'pointer', outline: 'none' }}>
                <option value="">Sélectionnez un motif…</option>
                {LOST_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <ChevronDown size={13} color="#8A8699" style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: '#8A8699', margin: '16px 0 7px' }}>Détail (optionnel)</label>
            <textarea value={lostNote} onChange={e => setLostNote(e.target.value)} placeholder="Contexte utile pour la prochaine fois…" style={{ width: '100%', minHeight: 76, resize: 'vertical', fontFamily: "'Manrope',sans-serif", fontSize: 13.5, lineHeight: 1.55, padding: '12px 14px', borderRadius: 12, border: '1.5px solid rgba(34,23,122,.16)', background: '#FCFCF5', outline: 'none' }} />
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: '#8A8699', margin: '16px 0 7px' }}>Message au candidat (espace candidat)</label>
            <textarea value={lostMsg} onChange={e => setLostMsg(e.target.value)} placeholder="L'update et le feedback, en français : traduits en anglais. Sans message, le candidat ne voit pas le refus dans son espace." style={{ width: '100%', minHeight: 76, resize: 'vertical', fontFamily: "'Manrope',sans-serif", fontSize: 13.5, lineHeight: 1.55, padding: '12px 14px', borderRadius: 12, border: '1.5px solid rgba(34,23,122,.16)', background: '#FCFCF5', outline: 'none' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, padding: '12px 14px', background: '#FCFCF5', border: '1px solid rgba(34,23,122,.1)', borderRadius: 12, cursor: 'pointer' }}>
              <span onClick={() => setLostMail(m => !m)} style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `1.5px solid ${lostMail ? '#22177A' : 'rgba(34,23,122,.25)'}`, background: lostMail ? '#E6E9AF' : '#fff' }}>{lostMail && <CheckSquare size={12} color="#22177A" />}</span>
              <Mail size={15} color="#5B4B9E" /><span style={{ fontSize: 13, color: '#4A4568' }}>Envoyer le <strong style={{ color: '#1A1533' }}>feedback no-go</strong> au candidat</span>
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setLost(null)} style={{ flex: 1, fontSize: 14, fontWeight: 700, background: '#F5F4EA', color: '#4A4568', border: 'none', borderRadius: 12, padding: 12, cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => { if (!lostReason) { toast('error', 'Sélectionnez un motif'); return; } loseMut.mutate({ candId: lost.candId, motifRefus: lostReason, motifRefusDetail: lostNote || undefined, candidateMessage: lostMsg.trim() || undefined }); }} style={{ flex: 1.4, fontSize: 14, fontWeight: 700, background: '#B3261E', color: '#fff', border: 'none', borderRadius: 12, padding: 12, cursor: 'pointer' }}>Archiver le profil</button>
            </div>
          </div>
        </>
      )}

      {/* PLAN MODAL */}
      {planOpen && <PlanModal candidat={c} mandats={mandatsData?.data ?? []} onClose={() => setPlanOpen(false)} onSaved={(body) => { actMut.mutate(body); setPlanOpen(false); toast('success', 'Action planifiée'); }} />}

      {/* EXPORT MODAL */}
      {exportOpen && <ExportModal name={fullName} onClose={() => setExportOpen(false)} />}

      {dossierOpen && <DossierClientModal candidatId={c.id} prefill={{ localisation: c.localisation, disponibilite: c.disponibilite, salaireSouhaite: c.salaireSouhaite }} onClose={() => setDossierOpen(false)} />}

      {/* EDIT MODAL */}
      {editOpen && <EditModal candidat={c} onClose={() => setEditOpen(false)} onSaved={() => { invalidate(); setEditOpen(false); toast('success', 'Fiche mise à jour'); }} />}
    </div>
  );
}

// ─── EDIT MODAL (modifier les infos du candidat) ────────────────
function EditModal({ candidat, onClose, onSaved }: { candidat: CandidatDetail; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    prenom: candidat.prenom ?? '',
    nom: candidat.nom ?? '',
    email: candidat.email ?? '',
    telephone: candidat.telephone ?? '',
    linkedinUrl: candidat.linkedinUrl ?? '',
    posteActuel: candidat.posteActuel ?? '',
    entrepriseActuelle: candidat.entrepriseActuelle ?? '',
    localisation: candidat.localisation ?? '',
    disponibilite: candidat.disponibilite ?? '',
    salaireSouhaite: candidat.salaireSouhaite != null ? String(candidat.salaireSouhaite) : '',
    tags: (candidat.tags ?? []).join(', '),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const saveMut = useMutation({
    mutationFn: () => {
      const sal = form.salaireSouhaite.trim() ? parseInt(form.salaireSouhaite.replace(/[^\d]/g, ''), 10) : null;
      const body: Record<string, unknown> = {
        prenom: form.prenom.trim() || null,
        nom: form.nom.trim(),
        email: form.email.trim() || null,
        telephone: form.telephone.trim() || null,
        linkedinUrl: form.linkedinUrl.trim() || null,
        posteActuel: form.posteActuel.trim() || null,
        entrepriseActuelle: form.entrepriseActuelle.trim() || null,
        localisation: form.localisation.trim() || null,
        disponibilite: form.disponibilite.trim() || null,
        salaireSouhaite: sal && !Number.isNaN(sal) ? sal : null,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      };
      return api.put(`/candidats/${candidat.id}`, body);
    },
    onSuccess: onSaved,
    onError: (e: any) => toast('error', e?.message || 'Échec de la mise à jour'),
  });

  const inputStyle: React.CSSProperties = { width: '100%', fontFamily: "'Manrope',sans-serif", fontSize: 13.5, padding: '11px 13px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,.16)', background: '#FCFCF5', color: '#1A1533', outline: 'none' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: '#8A8699', margin: '0 0 6px' };
  const field = (label: string, k: keyof typeof form, placeholder?: string, span?: boolean) => (
    <div key={k} style={{ gridColumn: span ? '1 / -1' : undefined }}>
      <label style={labelStyle}>{label}</label>
      <input value={form[k]} onChange={set(k)} placeholder={placeholder} style={inputStyle} />
    </div>
  );

  const save = () => { if (!form.nom.trim()) { toast('error', 'Le nom est requis'); return; } saveMut.mutate(); };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 92, background: 'rgba(26,21,51,.42)' }} />
      <div className="fmodal" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 93, width: 620, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 22, boxShadow: '0 44px 96px -40px rgba(0,0,0,.55)', padding: '26px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 17.5, letterSpacing: '-.015em', color: '#1A1533' }}>Modifier la fiche</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}><X size={18} color="#8A8699" /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {field('Prénom', 'prenom', 'Prénom')}
          {field('Nom', 'nom', 'Nom')}
          {field('Email', 'email', 'email@exemple.com')}
          {field('Téléphone', 'telephone', '+33…')}
          {field('Poste actuel', 'posteActuel', 'Intitulé de poste')}
          {field('Entreprise actuelle', 'entrepriseActuelle', 'Société')}
          {field('Localisation', 'localisation', 'Ville, pays')}
          {field('Disponibilité', 'disponibilite', 'Immédiate, 3 mois…')}
          {field('Salaire souhaité (€)', 'salaireSouhaite', '65000')}
          {field('LinkedIn', 'linkedinUrl', 'https://linkedin.com/in/…')}
          {field('Tags (séparés par des virgules)', 'tags', 'React, Senior, Paris', true)}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ flex: 1, fontSize: 14, fontWeight: 700, background: '#F5F4EA', color: '#4A4568', border: 'none', borderRadius: 12, padding: 12, cursor: 'pointer' }}>Annuler</button>
          <button onClick={save} disabled={saveMut.isPending} style={{ flex: 1.4, fontSize: 14, fontWeight: 700, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 12, padding: 12, cursor: saveMut.isPending ? 'default' : 'pointer', opacity: saveMut.isPending ? 0.6 : 1 }}>{saveMut.isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </>
  );
}

// ─── MESSAGES (fil unifié email + SMS avec le candidat) ──────────
interface GmailMsg { id: string; threadId: string; from: { name: string; email: string }; to?: string; subject: string; snippet: string; date: string; isRead: boolean; isSent?: boolean }
interface ActiviteRaw { id: string; type: string; contenu: string | null; direction: string | null; createdAt: string; metadata?: Record<string, any> }
type FilItem = { id: string; kind: 'email' | 'sms'; out: boolean; author: string; subject?: string; text: string; date: string };

function MessagesTab({ candidat }: { candidat: CandidatDetail }) {
  const qc = useQueryClient();
  const email = candidat.email;
  const phone = candidat.telephone;
  const prenom = candidat.prenom || candidat.nom;
  const [channel, setChannel] = useState<'email' | 'sms'>(email ? 'email' : 'sms');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const { data: mailData, isLoading: mailLoading, isError: mailError } = useQuery<{ messages: GmailMsg[] }>({
    queryKey: ['candidat-messages', email],
    queryFn: () => api.get(`/integrations/gmail/messages?q=${encodeURIComponent(email ?? '')}&maxResults=40&filter=all`),
    enabled: !!email,
    retry: false,
  });
  const { data: actData } = useQuery<{ data: ActiviteRaw[] }>({
    queryKey: ['candidat-sms', candidat.id],
    queryFn: () => api.get(`/activites?entiteType=CANDIDAT&entiteId=${candidat.id}&perPage=100`),
    retry: false,
  });

  const fil = useMemo<FilItem[]>(() => {
    const emails: FilItem[] = (mailData?.messages ?? []).map((m) => ({
      id: 'e_' + m.id, kind: 'email', out: !!m.isSent,
      author: m.isSent ? 'Vous' : (m.from?.name || m.from?.email || 'Candidat'),
      subject: m.subject && m.subject !== '(Sans objet)' ? m.subject : undefined,
      text: m.snippet, date: m.date,
    }));
    const sms: FilItem[] = (actData?.data ?? [])
      .filter((a) => (a.metadata as any)?.channel === 'SMS')
      .map((a) => ({
        id: 's_' + a.id, kind: 'sms' as const, out: a.direction === 'SORTANT',
        author: a.direction === 'SORTANT' ? 'Vous' : prenom, text: a.contenu || '', date: a.createdAt,
      }));
    return [...emails, ...sms].sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());
  }, [mailData, actData, prenom]);

  const sendMut = useMutation({
    mutationFn: () => channel === 'email'
      ? api.post('/integrations/gmail/send', { to: email, subject: subject.trim() || `Message pour ${prenom}`, body: body.trim(), entiteType: 'CANDIDAT', entiteId: candidat.id })
      : api.post('/integrations/allo/sms', { to: phone, message: body.trim(), entiteType: 'CANDIDAT', entiteId: candidat.id }),
    onSuccess: () => {
      setBody('');
      toast('success', channel === 'email' ? 'Email envoyé' : 'SMS envoyé');
      qc.invalidateQueries({ queryKey: channel === 'email' ? ['candidat-messages', email] : ['candidat-sms', candidat.id] });
    },
    onError: (e: any) => toast('error', e?.message || "Échec de l'envoi"),
  });

  const canSend = !!body.trim() && !sendMut.isPending && (channel === 'email' ? !!email : !!phone);

  if (!email && !phone) {
    return <div style={{ textAlign: 'center', padding: '30px 12px', color: '#8A8699', fontSize: 13 }}>Aucun email ni téléphone renseigné pour {prenom}. Ajoute un contact pour échanger ici.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {mailLoading && <div style={{ textAlign: 'center', color: '#8A8699', fontSize: 12.5, padding: 20 }}>Chargement des échanges…</div>}
      {mailError && email && (
        <div style={{ background: '#FBF3E7', border: '1px solid #F0D9B5', borderRadius: 12, padding: '12px 14px', fontSize: 12.5, lineHeight: 1.5, color: '#8A6A2E' }}>
          Connecte ta boîte <strong>Gmail</strong> dans <strong>Réglages → Intégrations</strong> pour voir et envoyer les emails ici.
        </div>
      )}
      {!mailLoading && fil.length === 0 && (
        <div style={{ textAlign: 'center', color: '#8A8699', fontSize: 12.5, padding: '18px 10px' }}>Aucun échange pour l'instant. Écris le premier message ci-dessous.</div>
      )}

      {fil.map((m) => {
        const out = m.out;
        const isSms = m.kind === 'sms';
        return (
          <div key={m.id} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '90%', background: isSms ? (out ? '#E4F1E8' : '#EEF6F0') : (out ? '#ECE7FA' : '#F5F4EA'), border: `1px solid ${isSms ? 'rgba(43,107,63,.22)' : (out ? 'rgba(34,23,122,.16)' : 'rgba(34,23,122,.08)')}`, borderRadius: 14, borderBottomRightRadius: out ? 4 : 14, borderBottomLeftRadius: out ? 14 : 4, padding: '10px 13px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, marginBottom: 4, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, color: isSms ? '#2C6B3F' : (out ? '#22177A' : '#4A4568') }}>
                {isSms ? <Phone size={10} /> : <Mail size={10} />}
                <span style={{ textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isSms ? 'SMS' : 'Email'} · {m.author}</span>
              </span>
              <span style={{ flexShrink: 0, color: '#9A96AE' }}>{new Date(m.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
            </div>
            {m.subject && <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1A1533', marginBottom: 3, lineHeight: 1.35 }}>{m.subject}</div>}
            <div style={{ fontSize: 13, lineHeight: 1.5, color: '#3A3550', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
          </div>
        );
      })}

      {/* COMPOSE — Email ou SMS */}
      <div style={{ borderTop: '1px solid rgba(34,23,122,.1)', paddingTop: 12, marginTop: 2 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 9 }}>
          {(['email', 'sms'] as const).map((ch) => {
            const on = channel === ch;
            const disabled = ch === 'email' ? !email : !phone;
            return (
              <button key={ch} disabled={disabled} onClick={() => setChannel(ch)} style={{ flex: 1, fontSize: 12, fontWeight: 800, padding: '8px 0', borderRadius: 9, border: `1.5px solid ${on ? '#22177A' : 'rgba(34,23,122,.14)'}`, background: on ? '#22177A' : '#fff', color: on ? '#E6E9AF' : (disabled ? '#C4C1D0' : '#4A4568'), cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: disabled ? 0.5 : 1 }}>
                {ch === 'email' ? <Mail size={12} /> : <Phone size={12} />}{ch === 'email' ? 'Email' : 'SMS'}
              </button>
            );
          })}
        </div>
        {channel === 'email' && <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Objet (optionnel)" style={{ width: '100%', fontFamily: "'Manrope'", fontSize: 12.5, padding: '9px 11px', borderRadius: 10, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none', marginBottom: 7, boxSizing: 'border-box' }} />}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={channel === 'sms' ? 1000 : undefined} placeholder={channel === 'email' ? `Écrire à ${prenom}…` : `SMS à ${prenom}${phone ? ' (' + phone + ')' : ''}…`} style={{ width: '100%', minHeight: 84, resize: 'vertical', fontFamily: "'Manrope',sans-serif", fontSize: 13, lineHeight: 1.5, padding: '10px 12px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none', boxSizing: 'border-box' }} />
        <button disabled={!canSend} onClick={() => sendMut.mutate()} style={{ width: '100%', marginTop: 8, fontSize: 13.5, fontWeight: 800, background: canSend ? (channel === 'sms' ? '#2C6B3F' : '#22177A') : '#C4C1D0', color: '#E6E9AF', border: 'none', borderRadius: 11, padding: 11, cursor: canSend ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Send size={14} />{sendMut.isPending ? 'Envoi…' : (channel === 'email' ? "Envoyer l'email" : 'Envoyer le SMS')}</button>
        {channel === 'sms' && !phone && <div style={{ fontSize: 11, color: '#B0361F', marginTop: 6 }}>Aucun numéro de téléphone renseigné pour ce candidat.</div>}
      </div>
    </div>
  );
}

// ─── PLAN MODAL ─────────────────────────────────────
function PlanModal({ candidat, mandats, onClose, onSaved }: { candidat: CandidatDetail; mandats: { id: string; titrePoste: string; entreprise: { nom: string } }[]; onClose: () => void; onSaved: (body: Record<string, unknown>) => void }) {
  const linked = candidat.candidatures.map(c => ({ id: c.mandat.id, titrePoste: c.mandat.titrePoste, entreprise: c.mandat.entreprise }));
  const opts = linked.length ? linked : mandats;
  const [type, setType] = useState<'presentation' | 'entretien' | 'email'>('entretien');
  const [mandatId, setMandatId] = useState(opts[0]?.id ?? '');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [self, setSelf] = useState(false);
  const m = opts.find(o => o.id === mandatId);
  const prenom = candidat.prenom || candidat.nom;
  const typeLabel = { presentation: 'Présentation client', entretien: 'Entretien', email: 'Email' }[type];
  const preview = self
    ? `Bonjour ${prenom},\n\nPour aller au plus vite, choisissez directement le créneau qui vous arrange :\nhttps://humanup.io/booking\n\nVous recevrez la confirmation automatiquement.\n\nMeroe — HumanUp`
    : `Bonjour ${prenom},\n\n${type === 'presentation' ? `${m?.entreprise.nom ?? 'Le client'} souhaite vous rencontrer pour ${m?.titrePoste ?? 'le poste'}.` : type === 'entretien' ? `Je vous propose un entretien pour ${m?.titrePoste ?? 'le poste'}.` : `Je reviens vers vous concernant ${m?.titrePoste ?? 'le poste'}.`}\n\n${date ? `Date : ${date.split('-').reverse().join('/')}${time ? ' à ' + time : ''}\n\n` : ''}À très vite,\nMeroe — HumanUp`;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(26,21,51,.42)' }} />
      <div className="fmodal" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 91, width: 620, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 22, boxShadow: '0 44px 96px -40px rgba(0,0,0,.55)', padding: '26px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div><div style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-.015em', color: '#1A1533' }}>Prévoir une action</div><div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 3 }}>{`${candidat.prenom ?? ''} ${candidat.nom}`.trim()}</div></div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(34,23,122,.14)', background: '#fff', color: '#22177A', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, marginTop: 20 }}>
          {([['presentation', 'Présentation client', 'Envoyer le profil au client'], ['entretien', 'Entretien', 'Visio ou téléphone'], ['email', 'Envoyer un email', 'Relance ou documents']] as const).map(([k, l, d]) => (
            <button key={k} onClick={() => setType(k)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '13px 14px', borderRadius: 13, cursor: 'pointer', textAlign: 'left', border: `1.5px solid ${type === k ? '#22177A' : 'rgba(34,23,122,.13)'}`, background: type === k ? 'rgba(34,23,122,.05)' : '#FCFCF5', color: type === k ? '#22177A' : '#4A4568' }}>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{l}</span><span style={{ fontSize: 11, opacity: .75 }}>{d}</span>
            </button>
          ))}
        </div>
        <label style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8A8699', margin: '18px 0 6px' }}>Mandat concerné</label>
        <div style={{ position: 'relative' }}>
          <select value={mandatId} onChange={e => setMandatId(e.target.value)} style={{ appearance: 'none', width: '100%', fontFamily: "'Manrope'", fontSize: 13.5, fontWeight: 600, padding: '11px 34px 11px 13px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,.16)', background: '#FCFCF5', color: '#1A1533', cursor: 'pointer', outline: 'none' }}>
            {opts.length === 0 && <option value="">Aucun mandat</option>}
            {opts.map(o => <option key={o.id} value={o.id}>{o.titrePoste} · {o.entreprise.nom}</option>)}
          </select>
          <ChevronDown size={13} color="#8A8699" style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        </div>
        {!self && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 10, marginTop: 14 }}>
            <div><label style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8A8699', marginBottom: 6 }}>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', fontSize: 13.5, padding: '11px 13px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none' }} /></div>
            <div><label style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8A8699', marginBottom: 6 }}>Heure</label><input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ width: '100%', fontSize: 13.5, padding: '11px 13px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none' }} /></div>
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '11px 14px', background: '#F2F3D8', border: '1px solid rgba(34,23,122,.14)', borderRadius: 12, cursor: 'pointer' }}>
          <span onClick={() => setSelf(s => !s)} style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${self ? '#22177A' : 'rgba(34,23,122,.25)'}`, background: self ? '#E6E9AF' : '#fff' }}>{self && <CheckSquare size={12} color="#22177A" />}</span>
          <Clock size={15} color="#22177A" /><span style={{ fontSize: 12.5, color: '#4A4568' }}>Envoyer mon <strong style={{ color: '#1A1533' }}>lien de réservation</strong> — le candidat choisit son créneau</span>
        </label>
        <label style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8A8699', margin: '16px 0 6px' }}>Aperçu de l'email</label>
        <pre style={{ maxHeight: 220, overflowY: 'auto', margin: 0, fontFamily: "'Manrope',sans-serif", fontSize: 12.5, lineHeight: 1.6, color: '#4A4568', whiteSpace: 'pre-wrap', background: '#FCFCF5', border: '1px solid rgba(34,23,122,.11)', borderRadius: 12, padding: '13px 15px' }}>{preview}</pre>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ flex: 1, fontSize: 14, fontWeight: 700, background: '#F5F4EA', color: '#4A4568', border: 'none', borderRadius: 12, padding: 12, cursor: 'pointer' }}>Annuler</button>
          <button onClick={() => onSaved({ type: type === 'email' ? 'EMAIL' : 'MEETING', titre: typeLabel, contenu: self ? 'Lien de réservation envoyé' : `${typeLabel}${date ? ' le ' + date.split('-').reverse().join('/') : ''}${time ? ' à ' + time : ''}` })} style={{ flex: 1.4, fontSize: 14, fontWeight: 700, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 12, padding: 12, cursor: 'pointer' }}>{self ? 'Envoyer le lien' : 'Planifier'}</button>
        </div>
      </div>
    </>
  );
}

// ─── EXPORT MODAL ───────────────────────────────────
function ExportModal({ name, onClose }: { name: string; onClose: () => void }) {
  const [format, setFormat] = useState<'cv' | 'dossier'>('cv');
  const [lang, setLang] = useState<'fr' | 'en'>('fr');
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(26,21,51,.42)' }} />
      <div className="fmodal" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 91, width: 520, maxWidth: '94vw', background: '#fff', borderRadius: 22, boxShadow: '0 44px 96px -40px rgba(0,0,0,.55)', padding: '26px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div><div style={{ fontWeight: 800, fontSize: 18, color: '#1A1533' }}>Exporter le dossier</div><div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 2 }}>{name}</div></div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(34,23,122,.14)', background: '#fff', color: '#22177A', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 20 }}>
          {([['cv', 'CV HumanUp', 'Feuille unique'], ['dossier', 'Dossier de compétences', '3 pages A4']] as const).map(([k, l, d]) => (
            <button key={k} onClick={() => setFormat(k)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5, padding: '14px 15px', borderRadius: 13, cursor: 'pointer', textAlign: 'left', border: `1.5px solid ${format === k ? '#22177A' : 'rgba(34,23,122,.13)'}`, background: format === k ? 'rgba(34,23,122,.05)' : '#FCFCF5' }}>
              <FileText size={18} color="#22177A" /><span style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1533', marginTop: 4 }}>{l}</span><span style={{ fontSize: 11.5, color: '#8A8699' }}>{d}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <span style={{ fontSize: 12.5, color: '#6E6A85', fontWeight: 600 }}>Langue</span>
          <div style={{ display: 'flex', background: '#EFEFE6', borderRadius: 9, padding: 3 }}>
            {(['fr', 'en'] as const).map(l => <button key={l} onClick={() => setLang(l)} style={{ fontSize: 12.5, fontWeight: 800, padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: lang === l ? '#fff' : 'transparent', color: lang === l ? '#22177A' : '#8A7F5A' }}>{l.toUpperCase()}</button>)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ flex: 1, fontSize: 14, fontWeight: 700, background: '#F5F4EA', color: '#4A4568', border: 'none', borderRadius: 12, padding: 12, cursor: 'pointer' }}>Annuler</button>
          <button onClick={() => { toast('info', `Génération ${format === 'cv' ? 'du CV' : 'du dossier'} (${lang.toUpperCase()}) — bientôt disponible`); onClose(); }} style={{ flex: 1.4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 700, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 12, padding: 12, cursor: 'pointer' }}><Download size={15} />Générer</button>
        </div>
      </div>
    </>
  );
}
