import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ChevronDown, Plus, Mail, Phone, Linkedin, Building2, MapPin, Globe,
  FileText, MessageSquare, CheckSquare, Briefcase, Banknote,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { usePageTitle } from '../../hooks/usePageTitle';
import { toast } from '../../components/ui/Toast';

// ─── TYPES ──────────────────────────────────────────
interface Mandat {
  id: string; titrePoste: string; statut: string;
  feeMontantEstime: number | null; feeMontantFacture: number | null; feeStatut: string | null;
  createdAt: string;
}
interface ClientDetail {
  id: string; nom: string; prenom: string | null; email: string | null; telephone: string | null;
  poste: string | null; roleContact: string | null; linkedinUrl: string | null;
  statutClient: string; typeClient: string | null; notes: string | null;
  entreprise: { id: string; nom: string; secteur: string | null; localisation: string | null; logoUrl: string | null; siteWeb: string | null } | null;
  mandats: Mandat[];
  assignedTo: { id: string; nom: string; prenom: string | null } | null;
  lastActivityAt: string | null;
}
interface Activite {
  id: string; type: string; titre: string | null; contenu: string | null; createdAt: string;
  isTache: boolean; tacheCompleted: boolean; tacheDueDate: string | null;
  user: { nom: string; prenom: string | null } | null;
}

// ─── META ───────────────────────────────────────────
const STATUT_META: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  LEAD: { label: 'Lead', bg: 'rgba(34,23,122,.06)', fg: '#22177A', dot: '#8E7CC3' },
  PREMIER_CONTACT: { label: 'Premier contact', bg: '#E8EEF9', fg: '#2A4A8A', dot: '#2A6BD8' },
  BESOIN_QUALIFIE: { label: 'Besoin qualifié', bg: '#FBF3E7', fg: '#8A6A2E', dot: '#E08A2B' },
  PROPOSITION_ENVOYEE: { label: 'Proposition', bg: '#F0EFC4', fg: '#8A6A2E', dot: '#C9A227' },
  MANDAT_SIGNE: { label: 'Client actif', bg: '#EAF3EC', fg: '#2C6B3F', dot: '#3B9A54' },
  RECURRENT: { label: 'Récurrent', bg: '#EAF3EC', fg: '#2C6B3F', dot: '#3B9A54' },
  INACTIF: { label: 'Inactif', bg: '#F7DEDB', fg: '#B3261E', dot: '#B3261E' },
};
const MANDAT_STATUT: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  OUVERT: { label: 'Ouvert', bg: '#E8EEF9', fg: '#2A4A8A', dot: '#2A6BD8' },
  EN_COURS: { label: 'En cours', bg: '#FBF3E7', fg: '#8A6A2E', dot: '#E08A2B' },
  GAGNE: { label: 'Gagné', bg: '#EAF3EC', fg: '#2C6B3F', dot: '#3B9A54' },
  PERDU: { label: 'Perdu', bg: '#F7DEDB', fg: '#B3261E', dot: '#B3261E' },
  ANNULE: { label: 'Annulé', bg: 'rgba(34,23,122,.06)', fg: '#8A8699', dot: '#C4C1D0' },
  CLOTURE: { label: 'Clôturé', bg: 'rgba(34,23,122,.06)', fg: '#6E6A85', dot: '#8E7CC3' },
};
const ROLE_LABELS: Record<string, string> = { HIRING_MANAGER: 'Hiring Manager', DRH: 'DRH', PROCUREMENT: 'Procurement', CEO: 'CEO', AUTRE: 'Autre' };

function initials(prenom: string | null, nom: string) { return `${(prenom?.[0] ?? '')}${nom?.[0] ?? ''}`.toUpperCase() || '?'; }
function relTime(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 0) return "aujourd'hui"; if (d === 1) return 'hier'; if (d < 30) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtEur(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k€` : `${n}€`; }

// ═════════════════════════════════════════════════════
export default function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  usePageTitle('Fiche client');

  const [detOpen, setDetOpen] = useState(true);
  const [railTab, setRailTab] = useState<'act' | 'com' | 'task' | 'opp'>('act');
  const [comment, setComment] = useState('');
  const [taskText, setTaskText] = useState('');

  const { data: c, isLoading } = useQuery({ queryKey: ['client', id], queryFn: () => api.get<ClientDetail>(`/clients/${id}`), enabled: !!id });
  const { data: actsRaw } = useQuery({ queryKey: ['activites', 'client', id], queryFn: () => api.get<{ data: Activite[] }>(`/activites?entiteType=CLIENT&entiteId=${id}&perPage=100`), enabled: !!id });

  const acts = actsRaw?.data ?? [];
  const feed = acts.filter(a => !a.isTache);
  const comments = acts.filter(a => a.type === 'NOTE' && !a.isTache);
  const tasks = acts.filter(a => a.isTache);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['activites', 'client', id] }); };
  const actMut = useMutation({ mutationFn: (body: Record<string, unknown>) => api.post('/activites', { entiteType: 'CLIENT', entiteId: id, ...body }), onSuccess: invalidate });
  const toggleTaskMut = useMutation({ mutationFn: ({ actId, done }: { actId: string; done: boolean }) => api.put(`/activites/${actId}`, { tacheCompleted: done }), onSuccess: invalidate });

  const { revenue, actifs, activeMandats, pastMandats } = useMemo(() => {
    const m = c?.mandats ?? [];
    return {
      revenue: m.filter(x => x.feeStatut === 'PAYE').reduce((s, x) => s + (x.feeMontantFacture ?? 0), 0),
      actifs: m.filter(x => ['OUVERT', 'EN_COURS'].includes(x.statut)).length,
      activeMandats: m.filter(x => ['OUVERT', 'EN_COURS'].includes(x.statut)),
      pastMandats: m.filter(x => !['OUVERT', 'EN_COURS'].includes(x.statut)),
    };
  }, [c]);

  if (isLoading || !c) return <div style={{ padding: 40, color: '#8A8699' }}>Chargement…</div>;

  const fullName = `${c.prenom ? c.prenom + ' ' : ''}${c.nom}`.trim();
  const st = STATUT_META[c.statutClient] ?? STATUT_META.LEAD;
  const submitComment = () => { const t = comment.trim(); if (!t) return; actMut.mutate({ type: 'NOTE', contenu: t }); setComment(''); };
  const submitTask = () => { const t = taskText.trim(); if (!t) return; actMut.mutate({ type: 'TACHE', isTache: true, titre: t }); setTaskText(''); };

  const details: { label: string; Icon: typeof Mail; value: string | null; href?: string }[] = [
    { label: 'E-mail', Icon: Mail, value: c.email, href: c.email ? `mailto:${c.email}` : undefined },
    { label: 'Téléphone', Icon: Phone, value: c.telephone, href: c.telephone ? `tel:${c.telephone}` : undefined },
    { label: 'LinkedIn', Icon: Linkedin, value: c.linkedinUrl, href: c.linkedinUrl ?? undefined },
    { label: 'Rôle', Icon: Briefcase, value: c.roleContact ? (ROLE_LABELS[c.roleContact] ?? c.roleContact) : null },
    { label: 'Société', Icon: Building2, value: c.entreprise?.nom ?? null },
    { label: 'Secteur', Icon: MapPin, value: c.entreprise?.secteur ?? null },
  ];

  const actions = [
    { label: 'Appeler', Icon: Phone, run: () => { if (c.telephone) window.location.href = `tel:${c.telephone}`; else toast('error', 'Pas de numéro'); } },
    { label: 'Email', Icon: Mail, run: () => { if (c.email) window.location.href = `mailto:${c.email}`; else toast('error', "Pas d'email"); } },
    { label: 'Commentaire', Icon: MessageSquare, run: () => setRailTab('com') },
    { label: 'Tâche', Icon: CheckSquare, run: () => setRailTab('task') },
    { label: 'Nouveau mandat', Icon: Plus, run: () => navigate(`/mandats/new?clientId=${c.id}`) },
  ];

  return (
    <div>
      <style>{`
        .fmcard:hover{ box-shadow:0 20px 40px -28px rgba(34,23,122,.4); border-color:rgba(34,23,122,.16) !important; }
        .fmcard{ transition:box-shadow .22s ease, border-color .22s ease; }
        .sec-h{ cursor:pointer; } .sec-h:hover .chev{ color:#22177A; }
        .abtn:hover{ background:rgba(230,233,175,.12) !important; }
        .fc-grid{ display:grid; grid-template-columns:minmax(0,1fr) 400px; gap:22px; align-items:start; }
        @media (max-width:1180px){ .fc-grid{ grid-template-columns:minmax(0,1fr) 340px; } }
        @media (max-width:1024px){ .fc-grid{ grid-template-columns:1fr; } .fc-rail{ position:static !important; max-height:none !important; } }
      `}</style>

      {/* TOPBAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
        <button onClick={() => navigate('/clients')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#4A4568', border: '1px solid rgba(34,23,122,.14)', background: '#fff', borderRadius: 10, padding: '8px 13px', cursor: 'pointer' }}><ArrowLeft size={14} strokeWidth={2.4} />Clients</button>
        {c.entreprise && <button onClick={() => navigate(`/entreprises/${c.entreprise!.id}`)} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#22177A', border: '1px solid rgba(34,23,122,.16)', background: '#fff', borderRadius: 10, padding: '8px 14px', cursor: 'pointer' }}><Building2 size={14} />Voir la société</button>}
      </div>

      <div className="fc-grid">
        {/* MAIN */}
        <div>
          {/* IDENTITY */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 22 }}>
            <span style={{ flexShrink: 0, width: 96, height: 96, borderRadius: '50%', background: '#22177A', color: '#E6E9AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black',sans-serif", fontSize: 32, boxShadow: '0 16px 36px -18px rgba(34,23,122,.6)' }}>{initials(c.prenom, c.nom)}</span>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 31, letterSpacing: '-.035em', color: '#1A1533' }}>{fullName}</h1>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: '5px 12px', background: st.bg, color: st.fg }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />{st.label}</span>
              </div>
              <div style={{ fontSize: 15, color: '#4A4568', marginTop: 5 }}>
                {c.poste || c.roleContact ? `${c.poste || ROLE_LABELS[c.roleContact!] || ''}` : 'Contact'}
                {c.entreprise && <> chez <span onClick={() => navigate(`/entreprises/${c.entreprise!.id}`)} style={{ color: '#22177A', fontWeight: 700, borderBottom: '1.5px solid rgba(34,23,122,.25)', cursor: 'pointer' }}>{c.entreprise.nom}</span></>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 15, flexWrap: 'wrap' }}>
                <button onClick={() => navigate(`/mandats/new?clientId=${c.id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#E6E9AF', background: '#22177A', border: 'none', borderRadius: 9, padding: '9px 15px', cursor: 'pointer' }}><Plus size={14} strokeWidth={2.2} />Nouveau mandat</button>
                {c.email && <a href={`mailto:${c.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,.18)', borderRadius: 9, padding: '8px 14px', textDecoration: 'none' }}><Mail size={14} />Email</a>}
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 24 }}>
            {[{ label: 'CA cumulé', value: fmtEur(revenue), Icon: Banknote, color: '#2C6B3F' }, { label: 'Mandats actifs', value: String(actifs), Icon: Briefcase, color: '#22177A' }, { label: 'Total mandats', value: String(c.mandats.length), Icon: FileText, color: '#1A1533' }].map(k => (
              <div key={k.label} style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 14, padding: '15px 18px', boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A96AE' }}><k.Icon size={13} color="#22177A" />{k.label}</div>
                <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 24, letterSpacing: '-.03em', color: k.color, marginTop: 9 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* DÉTAILS */}
          <div style={{ marginTop: 26 }}>
            <div onClick={() => setDetOpen(o => !o)} className="sec-h" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <ChevronDown className="chev" size={14} color="#8A8699" strokeWidth={2.6} style={{ transform: detOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .3s' }} />
              <span style={{ fontWeight: 800, fontSize: 17, color: '#1A1533' }}>Coordonnées</span>
            </div>
            {detOpen && (
              <div style={{ marginTop: 12 }}>
                {details.map(d => (
                  <div key={d.label} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, alignItems: 'center', padding: '9px 12px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 13.5, color: '#6E6A85' }}><d.Icon size={15} color="#8A8699" />{d.label}</span>
                    {d.value ? (d.href ? <a href={d.href} target={d.label === 'LinkedIn' ? '_blank' : undefined} rel="noreferrer" style={{ fontSize: 13.5, color: '#22177A', fontWeight: 600, wordBreak: 'break-all' }}>{d.value}</a> : <span style={{ fontSize: 13.5, color: '#1A1533', fontWeight: 600 }}>{d.value}</span>)
                      : <span style={{ display: 'block', maxWidth: 420, fontSize: 13.5, color: '#B4B0C4', background: '#F7F7F0', border: '1px solid rgba(34,23,122,.09)', borderRadius: 8, padding: '8px 12px' }}>Vide</span>}
                  </div>
                ))}
                {c.entreprise?.siteWeb && (
                  <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, alignItems: 'center', padding: '9px 12px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 13.5, color: '#6E6A85' }}><Globe size={15} color="#8A8699" />Site web</span>
                    <a href={c.entreprise.siteWeb.startsWith('http') ? c.entreprise.siteWeb : `https://${c.entreprise.siteWeb}`} target="_blank" rel="noreferrer" style={{ fontSize: 13.5, color: '#22177A', fontWeight: 600 }}>{c.entreprise.siteWeb}</a>
                  </div>
                )}
                {c.notes && <div style={{ marginTop: 10, padding: '13px 15px', background: '#FBFBF3', border: '1px solid rgba(34,23,122,.08)', borderRadius: 12, fontSize: 13, color: '#4A4568', lineHeight: 1.55 }}>{c.notes}</div>}
              </div>
            )}
          </div>

          {/* MANDATS */}
          <div style={{ marginTop: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 17, color: '#1A1533' }}>Mandats</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#22177A', background: '#E6E9AF', borderRadius: 999, padding: '3px 10px' }}>{c.mandats.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {c.mandats.length === 0 && <div style={{ border: '1.5px dashed rgba(34,23,122,.2)', borderRadius: 15, padding: 20, textAlign: 'center', color: '#8A8699', fontSize: 13.5 }}>Aucun mandat pour ce client.</div>}
              {[...activeMandats, ...pastMandats].map(m => {
                const ms = MANDAT_STATUT[m.statut] ?? MANDAT_STATUT.OUVERT;
                const fee = m.feeMontantFacture ?? m.feeMontantEstime;
                return (
                  <div key={m.id} className="fmcard" onClick={() => navigate(`/mandats/${m.id}`)} style={{ cursor: 'pointer', background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 15, padding: '15px 18px', boxShadow: '0 1px 2px rgba(34,23,122,.04)', display: 'flex', alignItems: 'center', gap: 13 }}>
                    <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 11, background: '#F2F3D8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Briefcase size={17} color="#22177A" /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.titrePoste}</div>
                      <div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 2 }}>ouvert {relTime(m.createdAt)}{fee ? ` · fee ${fmtEur(fee)}` : ''}</div>
                    </div>
                    <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 800, color: ms.fg, background: ms.bg, borderRadius: 999, padding: '5px 12px' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: ms.dot }} />{ms.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ACTION BAR */}
          <div style={{ position: 'sticky', bottom: 22, margin: '26px auto 0', width: 'max-content', zIndex: 30, display: 'flex', alignItems: 'center', gap: 2, background: '#1A1533', borderRadius: 16, padding: 8, boxShadow: '0 24px 50px -20px rgba(26,21,51,.65)' }}>
            {actions.map(a => (
              <button key={a.label} className="abtn" onClick={a.run} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 78, background: 'transparent', border: 'none', borderRadius: 11, padding: '9px 8px', cursor: 'pointer', color: '#fff' }}>
                <a.Icon size={18} /><span style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* RAIL */}
        <aside className="fc-rail" style={{ position: 'sticky', top: 12, alignSelf: 'start', maxHeight: 'calc(100vh - 90px)', background: '#fff', border: '1px solid rgba(34,23,122,.1)', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flexShrink: 0, display: 'flex', gap: 5, padding: '14px 16px 12px', borderBottom: '1px solid rgba(34,23,122,.09)', overflowX: 'auto' }}>
            {([['act', 'Activité'], ['com', 'Commentaires'], ['task', 'Tâches'], ['opp', 'Opportunités']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setRailTab(k)} style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', background: railTab === k ? '#22177A' : 'transparent', color: railTab === k ? '#E6E9AF' : '#8A8699' }}>{l}</button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px 22px' }}>
            {railTab === 'act' && (feed.length === 0 ? <div style={{ color: '#9A96AE', fontSize: 13, textAlign: 'center', padding: 20 }}>Aucune activité.</div> :
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {feed.map(f => (
                  <div key={f.id} style={{ display: 'flex', gap: 11, padding: '10px 8px' }}>
                    <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9, background: '#E6E9AF', color: '#22177A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black',sans-serif", fontSize: 10 }}>{initials(f.user?.prenom ?? null, f.user?.nom ?? '?')}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}><span style={{ fontSize: 13, fontWeight: 800, color: '#1A1533' }}>{`${f.user?.prenom ?? ''} ${f.user?.nom ?? ''}`.trim() || 'Système'}</span><span style={{ fontSize: 12.5, color: '#6E6A85' }}>· {f.type.toLowerCase()}</span><span style={{ fontSize: 11.5, color: '#B4B0C4' }}>{relTime(f.createdAt)}</span></div>
                      {(f.titre || f.contenu) && <div style={{ fontSize: 13, lineHeight: 1.5, color: '#4A4568', marginTop: 4 }}>{f.titre ? <strong>{f.titre}</strong> : null}{f.titre && f.contenu ? ' — ' : ''}{f.contenu}</div>}
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
                      <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: t.tacheCompleted ? '#B4B0C4' : '#1A1533', textDecoration: t.tacheCompleted ? 'line-through' : 'none' }}>{t.titre || t.contenu}</div><div style={{ fontSize: 11.5, color: late ? '#B3261E' : '#9A96AE', marginTop: 2 }}>{t.tacheDueDate ? new Date(t.tacheDueDate).toLocaleDateString('fr-FR') : 'Sans échéance'}</div></div>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <input value={taskText} onChange={e => setTaskText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitTask()} placeholder="Nouvelle tâche…" style={{ flex: 1, fontSize: 13, padding: '10px 13px', borderRadius: 10, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none' }} />
                  <button onClick={submitTask} style={{ flexShrink: 0, fontSize: 15, fontWeight: 700, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 10, padding: '10px 16px', cursor: 'pointer' }}>+</button>
                </div>
              </>
            )}
            {railTab === 'opp' && (
              <>
                {activeMandats.length === 0 && <div style={{ color: '#9A96AE', fontSize: 13, textAlign: 'center', padding: 14 }}>Aucun mandat en cours.</div>}
                {activeMandats.map(m => {
                  const ms = MANDAT_STATUT[m.statut] ?? MANDAT_STATUT.OUVERT;
                  return (
                    <div key={m.id} onClick={() => navigate(`/mandats/${m.id}`)} style={{ cursor: 'pointer', padding: '11px 13px', border: '1px solid rgba(34,23,122,.1)', borderRadius: 11, marginBottom: 8 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1A1533' }}>{m.titrePoste}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: ms.fg }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: ms.dot }} />{ms.label}</span>
                        {(m.feeMontantFacture ?? m.feeMontantEstime) ? <span style={{ fontSize: 12, fontWeight: 700, color: '#2C6B3F' }}>{fmtEur(m.feeMontantFacture ?? m.feeMontantEstime!)}</span> : null}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
