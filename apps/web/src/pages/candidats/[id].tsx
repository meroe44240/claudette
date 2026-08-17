import { useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, ChevronDown, Plus, Star, Mail, Phone, Linkedin, MapPin,
  Trash2, X, FileText, Upload, Download, Calendar, Send, MessageSquare,
  CheckSquare, Ban, Clock, Building2, Euro, Briefcase,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { usePageTitle } from '../../hooks/usePageTitle';
import { toast } from '../../components/ui/Toast';
import NoteContent from '../../components/activity/NoteContent';
import TrameAnswers from '../../components/mandats/TrameAnswers';
import MentionTextarea from '../../components/activity/MentionTextarea';

// ─── TYPES ──────────────────────────────────────────
interface Candidature {
  id: string; stage: string;
  mandat: { id: string; titrePoste: string; slug: string | null; entreprise: { id: string; nom: string }; statut: string };
  createdAt: string;
}
interface Experience { id: string; titre: string; entreprise: string; anneeDebut: number; anneeFin: number | null; highlights: string[]; source: string }
interface CandidatDetail {
  id: string; nom: string; prenom: string | null; email: string | null; telephone: string | null;
  linkedinUrl: string | null; photoUrl: string | null; cvUrl: string | null;
  posteActuel: string | null; entrepriseActuelle: string | null; localisation: string | null;
  salaireSouhaite: number | null; disponibilite: string | null; source: string | null;
  tags: string[]; aiPitchLong: string | null; aiPitchShort: string | null;
  candidatures: Candidature[]; experiences: Experience[];
}
interface Activite {
  id: string; type: string; titre: string | null; contenu: string | null; createdAt: string;
  isTache: boolean; tacheCompleted: boolean; tacheDueDate: string | null;
  user: { nom: string; prenom: string | null } | null;
}

// ─── STAGES ─────────────────────────────────────────
const STAGES = ['SOURCING', 'CONTACTE', 'ENTRETIEN_1', 'ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE'];
const STAGE_META: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  SOURCING: { label: 'Sourcing', bg: 'rgba(34,23,122,.07)', fg: '#22177A', dot: '#8E7CC3' },
  CONTACTE: { label: 'Contacté', bg: 'rgba(34,23,122,.07)', fg: '#22177A', dot: '#8E7CC3' },
  ENTRETIEN_1: { label: 'Entretien', bg: 'rgba(34,23,122,.09)', fg: '#22177A', dot: '#22177A' },
  ENVOYE_CLIENT: { label: 'Envoyé client', bg: '#E8EEF9', fg: '#2A4A8A', dot: '#2A6BD8' },
  ENTRETIEN_CLIENT: { label: 'Entr. client', bg: '#FBF3E7', fg: '#8A6A2E', dot: '#E08A2B' },
  OFFRE: { label: 'Offre', bg: '#F0EFC4', fg: '#8A6A2E', dot: '#C9A227' },
  PLACE: { label: 'Placé', bg: '#EAF3EC', fg: '#2C6B3F', dot: '#3B9A54' },
  REFUSE: { label: 'Perdu', bg: '#F7DEDB', fg: '#B3261E', dot: '#B3261E' },
};
const SEG_COLORS = ['#8E7CC3', '#8E7CC3', '#22177A', '#2A6BD8', '#E08A2B', '#C9A227', '#3B9A54'];
const SOURCE_OPTIONS = ['LinkedIn', 'Kalent', 'List Push', 'Candidature spontanée', 'Cooptation', 'Indeed', 'Jobboard client', 'Réseau', 'Autre'];
const LOST_REASONS = ['Ne convient pas au poste', 'Prétentions trop élevées', 'Refus du candidat', 'Contre-offre acceptée', 'Process trop long', 'Autre'];

// ─── HELPERS ────────────────────────────────────────
function initials(prenom: string | null, nom: string) { return `${(prenom?.[0] ?? '')}${nom?.[0] ?? ''}`.toUpperCase() || '?'; }

function relTime(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "aujourd'hui"; if (d === 1) return 'hier'; if (d < 30) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
const authHeader = (): Record<string, string> => { const t = localStorage.getItem('accessToken'); return t ? { Authorization: `Bearer ${t}` } : {}; };

// ═════════════════════════════════════════════════════
export default function CandidatDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  usePageTitle('Fiche candidat');

  const [detOpen, setDetOpen] = useState(true);
  const [cvOpen, setCvOpen] = useState(true);
  const [cvTab, setCvTab] = useState<'synth' | 'chrono' | 'full'>('synth');
  const [railTab, setRailTab] = useState<'act' | 'com' | 'task' | 'eval' | 'msg' | 'trame'>('act');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [taskText, setTaskText] = useState('');
  const [linkSel, setLinkSel] = useState('');
  const [lost, setLost] = useState<{ candId: string; titre: string; company: string } | null>(null);
  const [lostReason, setLostReason] = useState('');
  const [lostNote, setLostNote] = useState('');
  const [lostMail, setLostMail] = useState(true);
  const [planOpen, setPlanOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const cvInputRef = useRef<HTMLInputElement>(null);

  const { data: c, isLoading } = useQuery({ queryKey: ['candidat', id], queryFn: () => api.get<CandidatDetail>(`/candidats/${id}`), enabled: !!id });
  const { data: actsRaw } = useQuery({ queryKey: ['activites', 'candidat', id], queryFn: () => api.get<{ data: Activite[] }>(`/activites?entiteType=CANDIDAT&entiteId=${id}&perPage=100`), enabled: !!id });
  const { data: mandatsData } = useQuery({ queryKey: ['mandats', 'open'], queryFn: () => api.get<{ data: { id: string; titrePoste: string; entreprise: { nom: string } }[] }>('/mandats?statut=OUVERT&perPage=200&scope=all'), staleTime: 5 * 60 * 1000 });

  const acts = actsRaw?.data ?? [];
  const feed = acts.filter(a => !a.isTache);
  const comments = acts.filter(a => a.type === 'NOTE' && !a.isTache);
  const tasks = acts.filter(a => a.isTache);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['candidat', id] }); qc.invalidateQueries({ queryKey: ['activites', 'candidat', id] }); };

  const advanceMut = useMutation({ mutationFn: ({ candId, stage }: { candId: string; stage: string }) => api.put(`/candidatures/${candId}`, { stage }), onSuccess: () => { invalidate(); toast('success', 'Étape mise à jour'); } });
  const loseMut = useMutation({ mutationFn: ({ candId, motifRefus, motifRefusDetail }: { candId: string; motifRefus: string; motifRefusDetail?: string }) => api.put(`/candidatures/${candId}`, { stage: 'REFUSE', motifRefus, motifRefusDetail }), onSuccess: () => { invalidate(); setLost(null); setLostReason(''); setLostNote(''); toast('success', 'Marqué perdu'); } });
  const removeMut = useMutation({ mutationFn: (candId: string) => api.delete(`/candidatures/${candId}`), onSuccess: () => { invalidate(); toast('success', 'Retiré du mandat'); } });
  const noShowMut = useMutation({ mutationFn: (candId: string) => api.put(`/candidatures/${candId}`, { presentationNoShow: true }), onSuccess: () => { invalidate(); toast('success', 'Présentation marquée no-show'); } });
  const linkMut = useMutation({ mutationFn: (mandatId: string) => api.post('/candidatures', { candidatId: id, mandatId, stage: 'SOURCING' }), onSuccess: () => { invalidate(); setLinkSel(''); toast('success', 'Relié au mandat'); } });
  const sourceMut = useMutation({ mutationFn: (source: string) => api.put(`/candidats/${id}`, { source }), onSuccess: () => { invalidate(); toast('success', 'Source mise à jour'); } });
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

  if (isLoading || !c) {
    return <div style={{ padding: 40, color: '#8A8699' }}>Chargement…</div>;
  }

  const fullName = `${c.prenom ? c.prenom + ' ' : ''}${c.nom}`.trim();
  const firstCand = c.candidatures.find(x => x.stage !== 'REFUSE') ?? c.candidatures[0];
  const sourcedFor = firstCand?.mandat.titrePoste;

  const submitComment = () => { const t = comment.trim(); if (!t) return; actMut.mutate({ type: 'NOTE', contenu: t, mentionedUserIds: mentionIds }); setComment(''); setMentionIds([]); };
  const submitTask = () => { const t = taskText.trim(); if (!t) return; actMut.mutate({ type: 'TACHE', isTache: true, titre: t }); setTaskText(''); };
  const submitEval = () => { if (!rating) { toast('error', 'Choisissez une note'); return; } actMut.mutate({ type: 'NOTE', titre: `Évaluation ${'★'.repeat(rating)}`, contenu: comment.trim() || `Note ${rating}/5` }); setComment(''); toast('success', 'Évaluation ajoutée'); };
  const advance = (cand: Candidature) => { const i = STAGES.indexOf(cand.stage); if (i < 0 || i >= STAGES.length - 1) { toast('error', 'Déjà à la dernière étape'); return; } advanceMut.mutate({ candId: cand.id, stage: STAGES[i + 1] }); };

  const railTabs: [typeof railTab, string][] = [['act', 'Activité'], ['com', 'Commentaires'], ['task', 'Tâches'], ['eval', 'Évaluation'], ['trame', 'Trame'], ['msg', 'Messages']];
  const actions: { label: string; Icon: typeof Ban; color: string; run: () => void }[] = [
    { label: 'Rejeter', Icon: Ban, color: '#F3A6A0', run: () => { if (firstCand) setLost({ candId: firstCand.id, titre: firstCand.mandat.titrePoste, company: firstCand.mandat.entreprise.nom }); else toast('error', 'Aucun mandat'); } },
    { label: 'Étape suivante', Icon: ArrowRight, color: '#E6E9AF', run: () => { if (firstCand) advance(firstCand); else toast('error', 'Aucun mandat'); } },
    { label: 'Planifier', Icon: Calendar, color: '#fff', run: () => setPlanOpen(true) },
    { label: 'Commentaire', Icon: MessageSquare, color: '#fff', run: () => setRailTab('com') },
    { label: 'Tâche', Icon: CheckSquare, color: '#fff', run: () => setRailTab('task') },
    { label: 'Message', Icon: Send, color: '#fff', run: () => { if (c.email) window.location.href = `mailto:${c.email}`; else toast('error', "Pas d'email"); } },
  ];

  const pretentions = c.salaireSouhaite ? `${c.salaireSouhaite.toLocaleString('fr-FR')} €` : null;
  const posteActuelLabel = c.posteActuel ? `${c.posteActuel}${c.entrepriseActuelle ? ` · ${c.entrepriseActuelle}` : ''}` : (c.entrepriseActuelle || null);
  const details: { label: string; Icon: typeof Mail; value: string | null; href?: string; select?: boolean }[] = [
    { label: 'Prétentions', Icon: Euro, value: pretentions },
    { label: 'Disponibilité', Icon: Clock, value: c.disponibilite },
    { label: 'Poste actuel', Icon: Briefcase, value: posteActuelLabel },
    { label: 'E-mail', Icon: Mail, value: c.email, href: c.email ? `mailto:${c.email}` : undefined },
    { label: 'Téléphone', Icon: Phone, value: c.telephone, href: c.telephone ? `tel:${c.telephone}` : undefined },
    { label: 'LinkedIn', Icon: Linkedin, value: c.linkedinUrl, href: c.linkedinUrl ?? undefined },
    { label: 'Localisation', Icon: MapPin, value: c.localisation },
    { label: 'Source du profil', Icon: FileText, value: c.source, select: true },
  ];

  return (
    <div>
      <style>{`
        @keyframes fmIn{ from{ transform:translateY(14px); opacity:0; } to{ transform:none; opacity:1; } }
        .fmcard:hover{ box-shadow:0 20px 40px -28px rgba(34,23,122,.4); border-color:rgba(34,23,122,.16) !important; }
        .fmcard{ transition:box-shadow .22s ease, border-color .22s ease; }
        .sec-h{ cursor:pointer; }
        .sec-h:hover .chev{ color:#22177A; }
        .abtn:hover{ background:rgba(230,233,175,.12) !important; }
        .drop:hover{ background:#F2F3D8 !important; border-color:rgba(34,23,122,.4) !important; }
        .fmodal{ animation:fmIn .3s cubic-bezier(.16,1,.3,1) both; }
        .fiche-grid{ display:grid; grid-template-columns:minmax(0,1fr) 400px; gap:22px; align-items:start; }
        @media (max-width:1180px){ .fiche-grid{ grid-template-columns:minmax(0,1fr) 340px; } }
        @media (max-width:1024px){ .fiche-grid{ grid-template-columns:1fr; } .fiche-rail{ position:static !important; max-height:none !important; } }
      `}</style>

      {/* TOPBAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
        <button onClick={() => navigate('/candidats')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#4A4568', border: '1px solid rgba(34,23,122,.14)', background: '#fff', borderRadius: 10, padding: '8px 13px', cursor: 'pointer' }}><ArrowLeft size={14} strokeWidth={2.4} />Candidats</button>
        <button onClick={() => setExportOpen(true)} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#22177A', border: '1px solid rgba(34,23,122,.16)', background: '#fff', borderRadius: 10, padding: '8px 14px', cursor: 'pointer' }}><Download size={14} strokeWidth={2.2} />Exporter</button>
      </div>

      <div className="fiche-grid">
        {/* ─── MAIN ─── */}
        <div style={{ position: 'relative' }}>
          {/* IDENTITY */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 22 }}>
            <span style={{ flexShrink: 0 }}>
              {c.photoUrl
                ? <img src={c.photoUrl} alt="" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', background: '#F2F3D8', boxShadow: '0 16px 36px -18px rgba(34,23,122,.6)' }} />
                : <span style={{ width: 96, height: 96, borderRadius: '50%', background: '#22177A', color: '#E6E9AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black',sans-serif", fontSize: 32, boxShadow: '0 16px 36px -18px rgba(34,23,122,.6)' }}>{initials(c.prenom, c.nom)}</span>}
            </span>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
              <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 31, letterSpacing: '-.035em', color: '#1A1533' }}>{fullName}</h1>
              <div style={{ fontSize: 15, color: '#4A4568', marginTop: 5 }}>
                {sourcedFor ? <>Sourcé pour <span onClick={() => navigate(`/mandats/${firstCand!.mandat.id}`)} style={{ color: '#22177A', fontWeight: 700, borderBottom: '1.5px solid rgba(34,23,122,.25)', cursor: 'pointer' }}>{sourcedFor}</span>{c.posteActuel ? ` en tant que ${c.posteActuel}` : ''}</> : (c.posteActuel || 'Dans le vivier')}
              </div>
              {c.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 11 }}>
                  {c.tags.slice(0, 6).map((t, i) => <span key={t} style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 6, padding: '4px 10px', background: i % 2 ? '#EDEAF9' : '#F2F3D8', color: i % 2 ? '#5B4B9E' : '#22177A' }}>{t}</span>)}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 15, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 3 }}>
                  {[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setRating(n)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }}><Star size={21} fill={n <= rating ? '#E6C64A' : 'none'} color={n <= rating ? '#E6C64A' : '#C4C1D0'} /></button>)}
                </div>
                <button onClick={() => setRailTab('eval')} style={{ fontSize: 13, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,.18)', borderRadius: 9, padding: '8px 14px', cursor: 'pointer' }}>Ajouter une évaluation</button>
                <button onClick={() => setEditOpen(true)} style={{ fontSize: 13, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,.18)', borderRadius: 9, padding: '8px 14px', cursor: 'pointer' }}>Modifier les infos</button>
                <button onClick={() => setPlanOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#E6E9AF', background: '#22177A', border: 'none', borderRadius: 9, padding: '9px 15px', cursor: 'pointer' }}><Plus size={14} strokeWidth={2.2} />Prévoir une action</button>
              </div>
            </div>
          </div>

          {/* FACTS — infos clés en un coup d'œil */}
          {(pretentions || c.disponibilite || posteActuelLabel || c.localisation) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
              {[
                { label: 'Prétentions', value: pretentions, hi: true },
                { label: 'Disponibilité', value: c.disponibilite, hi: false },
                { label: 'Poste actuel', value: posteActuelLabel, hi: false },
                { label: 'Localisation', value: c.localisation, hi: false },
              ].filter(f => f.value).map(f => (
                <div key={f.label} style={{ flex: '1 1 150px', minWidth: 140, background: f.hi ? '#22177A' : '#fff', border: `1px solid ${f.hi ? '#22177A' : 'rgba(34,23,122,.1)'}`, borderRadius: 13, padding: '11px 14px', boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: f.hi ? 'rgba(230,233,175,.75)' : '#9A96AE' }}>{f.label}</div>
                  <div style={{ fontSize: f.hi ? 19 : 14, fontWeight: 800, color: f.hi ? '#E6E9AF' : '#1A1533', marginTop: 3, fontFamily: f.hi ? "'Archivo Black',sans-serif" : undefined, letterSpacing: f.hi ? '-.01em' : undefined, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* DÉTAILS */}
          <div style={{ marginTop: 32 }}>
            <div onClick={() => setDetOpen(o => !o)} className="sec-h" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <ChevronDown className="chev" size={14} color="#8A8699" strokeWidth={2.6} style={{ transform: detOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .3s' }} />
              <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-.015em', color: '#1A1533' }}>Détails du candidat</span>
            </div>
            {detOpen && (
              <div style={{ marginTop: 14 }}>
                {details.map(d => (
                  <div key={d.label} style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 16, alignItems: 'center', padding: '9px 12px', borderRadius: 9 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 13.5, color: '#6E6A85' }}><d.Icon size={15} color="#8A8699" />{d.label}</span>
                    {d.select ? (
                      <div style={{ position: 'relative', maxWidth: 300 }}>
                        <select value={c.source ?? ''} onChange={e => sourceMut.mutate(e.target.value)} style={{ appearance: 'none', width: '100%', fontFamily: "'Manrope',sans-serif", fontSize: 13.5, fontWeight: 600, color: '#1A1533', background: '#fff', border: '1px solid rgba(34,23,122,.14)', borderRadius: 9, padding: '9px 32px 9px 12px', cursor: 'pointer', outline: 'none' }}>
                          <option value="">— Source —</option>
                          {SOURCE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <ChevronDown size={13} color="#8A8699" style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                      </div>
                    ) : d.value ? (
                      d.href ? <a href={d.href} target={d.label === 'LinkedIn' ? '_blank' : undefined} rel="noreferrer" style={{ fontSize: 13.5, color: '#22177A', fontWeight: 600, wordBreak: 'break-all' }}>{d.value}</a>
                        : <span style={{ fontSize: 13.5, color: '#1A1533', fontWeight: 600 }}>{d.value}</span>
                    ) : (
                      <span style={{ display: 'block', maxWidth: 420, fontSize: 13.5, color: '#B4B0C4', background: '#F7F7F0', border: '1px solid rgba(34,23,122,.09)', borderRadius: 8, padding: '8px 12px' }}>Vide</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MANDATS */}
          <div style={{ marginTop: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-.015em', color: '#1A1533' }}>Mandats</span>
              <span style={{ fontFamily: "'Manrope'", fontSize: 11, fontWeight: 800, color: '#22177A', background: '#E6E9AF', borderRadius: 999, padding: '3px 10px' }}>{c.candidatures.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {c.candidatures.length === 0 && <div style={{ border: '1.5px dashed rgba(34,23,122,.2)', borderRadius: 15, padding: 20, textAlign: 'center', color: '#8A8699', fontSize: 13.5 }}>Dans le vivier — aucun process en cours.</div>}
              {c.candidatures.map(cand => {
                const st = STAGE_META[cand.stage] ?? STAGE_META.SOURCING;
                const idx = STAGES.indexOf(cand.stage);
                const lostState = cand.stage === 'REFUSE';
                return (
                  <div key={cand.id} className="fmcard" style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 15, padding: '15px 18px', boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                      <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 11, background: '#F2F3D8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Building2 size={17} color="#22177A" /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a onClick={() => navigate(`/mandats/${cand.mandat.id}`)} style={{ fontSize: 14.5, fontWeight: 800, color: '#1A1533', cursor: 'pointer' }}>{cand.mandat.titrePoste}</a>
                        <div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 2 }}>{cand.mandat.entreprise.nom} · relié {relTime(cand.createdAt)}</div>
                      </div>
                      <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 800, color: st.fg, background: st.bg, borderRadius: 999, padding: '5px 12px' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />{st.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 13, borderTop: '1px solid rgba(34,23,122,.07)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          {STAGES.map((s, i) => <span key={s} style={{ height: 5, flex: 1, borderRadius: 3, background: lostState ? (i === 0 ? '#B3261E' : 'rgba(34,23,122,.1)') : (i <= idx ? SEG_COLORS[i] : 'rgba(34,23,122,.1)') }} />)}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#9A96AE', marginTop: 7 }}>{lostState ? 'Process clôturé' : <>Étape <strong style={{ color: '#22177A' }}>{idx + 1}</strong>/7 · relié {relTime(cand.createdAt)}</>}</div>
                      </div>
                      {!lostState && (
                        <>
                          <button onClick={() => advance(cand)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: '#22177A', background: '#F0EFC4', border: '1px solid transparent', borderRadius: 10, padding: '8px 13px', cursor: 'pointer' }}>Faire avancer<ArrowRight size={13} strokeWidth={2.4} /></button>
                          {cand.stage === 'ENTRETIEN_CLIENT' && (
                            <button onClick={() => { if (confirm('Marquer cette présentation comme no-show ? (le RDV reste compté, mais pas comme présentation réalisée)')) noShowMut.mutate(cand.id); }} title="No-show : le client/candidat ne s'est pas présenté" style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: '#8A6A2E', background: '#fff', border: '1px solid rgba(201,162,39,.35)', borderRadius: 10, padding: '8px 13px', cursor: 'pointer' }}>No‑show</button>
                          )}
                          <button onClick={() => setLost({ candId: cand.id, titre: cand.mandat.titrePoste, company: cand.mandat.entreprise.nom })} style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: '#B3261E', background: '#fff', border: '1px solid rgba(176,54,31,.2)', borderRadius: 10, padding: '8px 13px', cursor: 'pointer' }}>Perdu</button>
                        </>
                      )}
                      <button onClick={() => { if (confirm('Retirer du mandat ?')) removeMut.mutate(cand.id); }} title="Retirer" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 10, color: '#B3261E', background: '#fff', border: '1px solid rgba(176,54,31,.18)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11, padding: '11px 13px', border: '1.5px dashed rgba(34,23,122,.22)', borderRadius: 15, background: '#FCFCF5' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                <select value={linkSel} onChange={e => setLinkSel(e.target.value)} style={{ appearance: 'none', width: '100%', fontSize: 13.5, fontWeight: 600, color: '#4A4568', background: '#fff', border: '1px solid rgba(34,23,122,.14)', borderRadius: 11, padding: '11px 34px 11px 14px', cursor: 'pointer', outline: 'none' }}>
                  <option value="">Relier à un autre mandat…</option>
                  {mandatOptions.map(m => <option key={m.id} value={m.id}>{m.titrePoste} · {m.entreprise.nom}</option>)}
                </select>
                <ChevronDown size={14} color="#8A8699" style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              </div>
              <button disabled={!linkSel} onClick={() => linkSel && linkMut.mutate(linkSel)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, background: linkSel ? '#22177A' : '#C4C1D0', color: '#E6E9AF', border: 'none', borderRadius: 11, padding: '11px 18px', cursor: linkSel ? 'pointer' : 'default' }}><Plus size={14} strokeWidth={2.8} />Relier</button>
            </div>
          </div>

          {/* CV */}
          <div style={{ marginTop: 30 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div onClick={() => setCvOpen(o => !o)} className="sec-h" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <ChevronDown className="chev" size={14} color="#8A8699" strokeWidth={2.6} style={{ transform: cvOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .3s' }} />
                <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-.015em', color: '#1A1533' }}>CV</span>
              </div>
              {c.cvUrl && <a href={c.cvUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,.16)', borderRadius: 9, padding: '8px 13px', textDecoration: 'none' }}><FileText size={14} color="#B0361F" />Afficher au format PDF</a>}
            </div>
            {cvOpen && (
              <>
                <div style={{ display: 'flex', gap: 4, background: '#EFEFE6', borderRadius: 11, padding: 4, marginTop: 14 }}>
                  {([['synth', 'Synthèse'], ['chrono', 'Chronologie'], ['full', 'CV complet']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setCvTab(k)} style={{ flex: 1, fontFamily: "'Manrope'", fontWeight: 700, fontSize: 12.5, padding: 9, borderRadius: 9, border: 'none', cursor: 'pointer', background: cvTab === k ? '#22177A' : 'transparent', color: cvTab === k ? '#E6E9AF' : '#8A8699' }}>{l}</button>
                  ))}
                </div>
                {cvTab === 'synth' && (
                  <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.09)', borderRadius: 14, padding: '20px 22px', marginTop: 12 }}>
                    <p style={{ fontSize: 14, lineHeight: 1.65, color: '#4A4568' }}>{c.aiPitchLong || c.aiPitchShort || 'Aucune synthèse générée pour ce candidat.'}</p>
                    {c.tags.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 15 }}>{c.tags.map(t => <span key={t} style={{ fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '5px 12px', background: '#F2F3D8', color: '#22177A' }}>{t}</span>)}</div>}
                  </div>
                )}
                {cvTab === 'chrono' && (
                  <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.09)', borderRadius: 14, padding: '18px 22px', marginTop: 12 }}>
                    {c.experiences.length === 0 && <div style={{ color: '#8A8699', fontSize: 13.5 }}>Aucune expérience renseignée.</div>}
                    {c.experiences.map(e => (
                      <div key={e.id} style={{ display: 'flex', gap: 16, paddingBottom: 20 }}>
                        <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 11, background: '#F2F3D8', border: '2.5px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px -6px rgba(34,23,122,.5)' }}><Building2 size={16} color="#22177A" /></span>
                        <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: '#1A1533' }}>{e.titre}</span>
                            <span style={{ flexShrink: 0, fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11, fontWeight: 600, color: '#8A8699', background: '#F7F7F0', borderRadius: 6, padding: '3px 9px' }}>{e.anneeDebut} → {e.anneeFin ?? 'auj.'}</span>
                          </div>
                          <div style={{ fontSize: 12.5, color: '#22177A', fontWeight: 600, marginTop: 3 }}>{e.entreprise}</div>
                          {e.highlights.length > 0 && <div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 5 }}>{e.highlights[0]}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {cvTab === 'full' && (
                  <div style={{ marginTop: 12 }}>
                    {c.cvUrl ? (
                      <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.09)', borderRadius: 14, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span style={{ flexShrink: 0, width: 44, height: 54, borderRadius: 8, background: '#F9ECE9', border: '1px solid rgba(176,54,31,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={19} color="#B0361F" /></span>
                        <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 800, color: '#1A1533' }}>CV — {fullName}.pdf</div><div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 2 }}>Document importé</div></div>
                        <a href={c.cvUrl} target="_blank" rel="noreferrer" style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#E6E9AF', background: '#22177A', border: 'none', borderRadius: 10, padding: '10px 16px', textDecoration: 'none' }}>Ouvrir</a>
                      </div>
                    ) : null}
                    <input ref={cvInputRef} type="file" accept=".pdf,.docx" hidden onChange={e => { const f = e.target.files?.[0]; if (f) cvUpload(f); }} />
                    <div onClick={() => cvInputRef.current?.click()} className="drop" style={{ marginTop: 14, border: '1.5px dashed rgba(34,23,122,.26)', borderRadius: 14, background: '#FCFCF5', padding: 22, textAlign: 'center', cursor: 'pointer', transition: 'background .18s, border-color .18s' }}>
                      <span style={{ display: 'inline-flex', width: 42, height: 42, borderRadius: 12, background: '#F2F3D8', alignItems: 'center', justifyContent: 'center' }}><Upload size={20} color="#22177A" /></span>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1533', marginTop: 11 }}>Glissez un nouveau CV ici</div>
                      <div style={{ fontSize: 12, color: '#8A8699', marginTop: 3 }}>ou <span style={{ color: '#22177A', fontWeight: 700, textDecoration: 'underline' }}>parcourir</span> · PDF, DOCX · 10 Mo max</div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* FLOATING ACTION BAR */}
          <div style={{ position: 'sticky', bottom: 22, margin: '26px auto 0', width: 'max-content', zIndex: 30, display: 'flex', alignItems: 'center', gap: 2, background: '#1A1533', borderRadius: 16, padding: 8, boxShadow: '0 24px 50px -20px rgba(26,21,51,.65)' }}>
            {actions.map(a => (
              <button key={a.label} className="abtn" onClick={a.run} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 74, background: 'transparent', border: 'none', borderRadius: 11, padding: '9px 8px', cursor: 'pointer', color: a.color }}>
                <a.Icon size={18} />
                <span style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ─── RAIL ─── */}
        <aside className="fiche-rail" style={{ position: 'sticky', top: 12, alignSelf: 'start', maxHeight: 'calc(100vh - 90px)', background: '#fff', border: '1px solid rgba(34,23,122,.1)', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flexShrink: 0, display: 'flex', gap: 5, padding: '14px 16px 12px', borderBottom: '1px solid rgba(34,23,122,.09)', overflowX: 'auto' }}>
            {railTabs.map(([k, l]) => (
              <button key={k} onClick={() => setRailTab(k)} style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', background: railTab === k ? '#22177A' : 'transparent', color: railTab === k ? '#E6E9AF' : '#8A8699' }}>{l}</button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px 22px' }}>
            {railTab === 'act' && (
              feed.length === 0 ? <div style={{ color: '#9A96AE', fontSize: 13, textAlign: 'center', padding: 20 }}>Aucune activité.</div> :
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {feed.map(f => (
                    <div key={f.id} style={{ display: 'flex', gap: 11, padding: '10px 8px' }}>
                      <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, background: '#E6E9AF', color: '#22177A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black',sans-serif", fontSize: 10 }}>{initials(f.user?.prenom ?? null, f.user?.nom ?? '?')}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#1A1533' }}>{`${f.user?.prenom ?? ''} ${f.user?.nom ?? ''}`.trim() || 'Système'}</span>
                          <span style={{ fontSize: 12.5, color: '#6E6A85' }}>· {f.type.toLowerCase()}</span>
                          <span style={{ fontSize: 11.5, color: '#B4B0C4' }}>{relTime(f.createdAt)}</span>
                        </div>
                        {(f.titre || f.contenu) && (
                          <div style={{ marginTop: 4 }}>
                            {f.titre && <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1533' }}>{f.titre}</div>}
                            {f.contenu && <NoteContent text={f.contenu} />}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
            )}
            {railTab === 'com' && (
              <>
                {comments.length === 0 && <div style={{ color: '#9A96AE', fontSize: 13, textAlign: 'center', padding: 14 }}>Aucun commentaire.</div>}
                {comments.map(cm => (
                  <div key={cm.id} style={{ background: '#FBFBF3', border: '1px solid rgba(34,23,122,.08)', borderRadius: 12, padding: '13px 15px', marginBottom: 9 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 12.5, fontWeight: 800, color: '#1A1533' }}>{`${cm.user?.prenom ?? ''} ${cm.user?.nom ?? ''}`.trim() || 'Vous'}</span><span style={{ fontSize: 11.5, color: '#B4B0C4' }}>{relTime(cm.createdAt)}</span></div>
                    <div style={{ fontSize: 13, lineHeight: 1.55, color: '#4A4568', marginTop: 6 }}>{cm.contenu}</div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <input value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitComment()} placeholder="Écrire un commentaire…" style={{ flex: 1, fontSize: 13, padding: '10px 13px', borderRadius: 10, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none' }} />
                  <button onClick={submitComment} style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 10, padding: '10px 15px', cursor: 'pointer' }}>Envoyer</button>
                </div>
              </>
            )}
            {railTab === 'task' && (
              <>
                {tasks.length === 0 && <div style={{ color: '#9A96AE', fontSize: 13, textAlign: 'center', padding: 14 }}>Aucune tâche.</div>}
                {tasks.map(t => {
                  const late = t.tacheDueDate && !t.tacheCompleted && new Date(t.tacheDueDate) < new Date();
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', border: '1px solid rgba(34,23,122,.1)', borderRadius: 11, marginBottom: 8 }}>
                      <span onClick={() => toggleTaskMut.mutate({ actId: t.id, done: !t.tacheCompleted })} style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${t.tacheCompleted ? '#22177A' : 'rgba(34,23,122,.25)'}`, background: t.tacheCompleted ? '#E6E9AF' : '#fff' }}>{t.tacheCompleted && <CheckSquare size={12} color="#22177A" />}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: t.tacheCompleted ? '#B4B0C4' : '#1A1533', textDecoration: t.tacheCompleted ? 'line-through' : 'none' }}>{t.titre || t.contenu}</div>
                        <div style={{ fontSize: 11.5, color: late ? '#B3261E' : '#9A96AE', marginTop: 2 }}>{t.tacheDueDate ? new Date(t.tacheDueDate).toLocaleDateString('fr-FR') : 'Sans échéance'}</div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <input value={taskText} onChange={e => setTaskText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitTask()} placeholder="Nouvelle tâche…" style={{ flex: 1, fontSize: 13, padding: '10px 13px', borderRadius: 10, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none' }} />
                  <button onClick={submitTask} style={{ flexShrink: 0, fontSize: 15, fontWeight: 700, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 10, padding: '10px 16px', cursor: 'pointer' }}>+</button>
                </div>
              </>
            )}
            {railTab === 'eval' && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: '#8A8699' }}>Nouvelle évaluation</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 11 }}>
                  {[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setRating(n)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }}><Star size={22} fill={n <= rating ? '#E6C64A' : 'none'} color={n <= rating ? '#E6C64A' : '#C4C1D0'} /></button>)}
                  <span style={{ fontSize: 12, color: '#8A8699', marginLeft: 8 }}>{rating ? `${rating}/5` : 'Notez'}</span>
                </div>
                <div style={{ marginTop: 12 }}><MentionTextarea value={comment} onChange={(v, ids) => { setComment(v); setMentionIds(ids); }} placeholder="Votre débrief… (tapez @ pour mentionner un collègue)" /></div>
                <button onClick={submitEval} style={{ width: '100%', marginTop: 10, fontSize: 13.5, fontWeight: 800, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 11, padding: 11, cursor: 'pointer' }}>Enregistrer l'évaluation</button>
              </>
            )}
            {railTab === 'trame' && (firstCand
              ? <TrameAnswers candidatureId={firstCand.id} mandatId={firstCand.mandat.id} />
              : <div style={{ fontSize: 12.5, color: '#8A8699', lineHeight: 1.6 }}>Ce candidat n'est rattaché à aucun mandat — la trame de qualification est définie par mandat.</div>)}
            {railTab === 'msg' && <MessagesTab candidat={c} />}
          </div>
        </aside>
      </div>

      {/* LOST MODAL */}
      {lost && (
        <>
          <div onClick={() => setLost(null)} style={{ position: 'fixed', inset: 0, zIndex: 92, background: 'rgba(26,21,51,.42)' }} />
          <div className="fmodal" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 93, width: 560, maxWidth: '94vw', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 22, boxShadow: '0 44px 96px -40px rgba(0,0,0,.55)', padding: '26px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 12, background: '#F7DEDB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} color="#B3261E" strokeWidth={2.2} /></span>
              <div><div style={{ fontWeight: 800, fontSize: 17.5, letterSpacing: '-.015em', color: '#1A1533' }}>Mandat perdu</div><div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 2 }}>{lost.titre} · {lost.company}</div></div>
            </div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: '#8A8699', margin: '22px 0 7px' }}>Pourquoi ?</label>
            <div style={{ position: 'relative' }}>
              <select value={lostReason} onChange={e => setLostReason(e.target.value)} style={{ appearance: 'none', width: '100%', fontFamily: "'Manrope'", fontSize: 13.5, padding: '12px 34px 12px 14px', borderRadius: 12, border: '1.5px solid rgba(34,23,122,.16)', background: '#FCFCF5', color: '#1A1533', cursor: 'pointer', outline: 'none' }}>
                <option value="">Sélectionnez un motif…</option>
                {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <ChevronDown size={13} color="#8A8699" style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
            <label style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase', color: '#8A8699', margin: '16px 0 7px' }}>Détail (optionnel)</label>
            <textarea value={lostNote} onChange={e => setLostNote(e.target.value)} placeholder="Contexte utile pour la prochaine fois…" style={{ width: '100%', minHeight: 76, resize: 'vertical', fontFamily: "'Manrope',sans-serif", fontSize: 13.5, lineHeight: 1.55, padding: '12px 14px', borderRadius: 12, border: '1.5px solid rgba(34,23,122,.16)', background: '#FCFCF5', outline: 'none' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, padding: '12px 14px', background: '#FCFCF5', border: '1px solid rgba(34,23,122,.1)', borderRadius: 12, cursor: 'pointer' }}>
              <span onClick={() => setLostMail(m => !m)} style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: `1.5px solid ${lostMail ? '#22177A' : 'rgba(34,23,122,.25)'}`, background: lostMail ? '#E6E9AF' : '#fff' }}>{lostMail && <CheckSquare size={12} color="#22177A" />}</span>
              <Mail size={15} color="#5B4B9E" /><span style={{ fontSize: 13, color: '#4A4568' }}>Envoyer le <strong style={{ color: '#1A1533' }}>feedback no-go</strong> au candidat</span>
            </label>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setLost(null)} style={{ flex: 1, fontSize: 14, fontWeight: 700, background: '#F5F4EA', color: '#4A4568', border: 'none', borderRadius: 12, padding: 12, cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => { if (!lostReason) { toast('error', 'Sélectionnez un motif'); return; } loseMut.mutate({ candId: lost.candId, motifRefus: lostReason, motifRefusDetail: lostNote || undefined }); }} style={{ flex: 1.4, fontSize: 14, fontWeight: 700, background: '#B3261E', color: '#fff', border: 'none', borderRadius: 12, padding: 12, cursor: 'pointer' }}>Marquer perdu</button>
            </div>
          </div>
        </>
      )}

      {/* PLAN MODAL */}
      {planOpen && <PlanModal candidat={c} mandats={mandatsData?.data ?? []} onClose={() => setPlanOpen(false)} onSaved={(body) => { actMut.mutate(body); setPlanOpen(false); toast('success', 'Action planifiée'); }} />}

      {/* EXPORT MODAL */}
      {exportOpen && <ExportModal name={fullName} onClose={() => setExportOpen(false)} />}

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
