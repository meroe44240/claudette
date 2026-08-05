import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, Mail, Phone, Globe, Building2, MapPin, Briefcase, Banknote,
  Users, FileText, ExternalLink, Hash,
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { usePageTitle } from '../../hooks/usePageTitle';
import NoteContent from '../../components/activity/NoteContent';

// ─── TYPES ──────────────────────────────────────────
interface Contact { id: string; nom: string; prenom: string | null; email: string | null; telephone: string | null; poste: string | null }
interface Mandat { id: string; titrePoste: string; statut: string; createdAt: string; feeMontantFacture: number | null; feeMontantEstime: number | null; feeStatut: string | null; _count: { candidatures: number } }
interface Entreprise {
  id: string; nom: string; secteur: string | null; siteWeb: string | null; taille: string | null;
  localisation: string | null; logoUrl: string | null; siren: string | null; formeJuridique: string | null;
  chiffreAffaires: number | null; effectif: string | null; dateCreation: string | null; adresseComplete: string | null; pappersUrl: string | null;
  _count: { clients: number; mandats: number };
  clients: Contact[]; mandats: Mandat[];
}
interface Activite { id: string; type: string; titre: string | null; contenu: string | null; createdAt: string; isTache: boolean; user: { nom: string; prenom: string | null } | null }

const MANDAT_STATUT: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  OUVERT: { label: 'Ouvert', bg: '#E8EEF9', fg: '#2A4A8A', dot: '#2A6BD8' },
  EN_COURS: { label: 'En cours', bg: '#FBF3E7', fg: '#8A6A2E', dot: '#E08A2B' },
  GAGNE: { label: 'Gagné', bg: '#EAF3EC', fg: '#2C6B3F', dot: '#3B9A54' },
  PERDU: { label: 'Perdu', bg: '#F7DEDB', fg: '#B3261E', dot: '#B3261E' },
  ANNULE: { label: 'Annulé', bg: 'rgba(34,23,122,.06)', fg: '#8A8699', dot: '#C4C1D0' },
  CLOTURE: { label: 'Clôturé', bg: 'rgba(34,23,122,.06)', fg: '#6E6A85', dot: '#8E7CC3' },
};
const TAILLE_LABELS: Record<string, string> = { TPE: 'TPE', PME: 'PME', ETI: 'ETI', GRAND_GROUPE: 'Grand groupe', STARTUP: 'Start-up' };

function mono(name: string) { return name.split(/\s+/).map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase(); }
function initials(prenom: string | null, nom: string) { return `${(prenom?.[0] ?? '')}${nom?.[0] ?? ''}`.toUpperCase() || '?'; }
function relTime(iso: string) { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); if (d <= 0) return "aujourd'hui"; if (d === 1) return 'hier'; if (d < 30) return `il y a ${d} j`; return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); }
function fmtEur(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k€` : `${n}€`; }
const AV: Array<[string, string]> = [['#22177A', '#E6E9AF'], ['#3B9A54', '#fff'], ['#8E7CC3', '#fff'], ['#2A6BD8', '#fff']];

// ═════════════════════════════════════════════════════
export default function EntrepriseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  usePageTitle('Fiche société');
  const [railTab, setRailTab] = useState<'rel' | 'notes'>('rel');
  const [note, setNote] = useState('');

  const { data: e, isLoading } = useQuery({ queryKey: ['entreprise', id], queryFn: () => api.get<Entreprise>(`/entreprises/${id}`), enabled: !!id });
  const { data: actsRaw } = useQuery({ queryKey: ['activites', 'entreprise', id], queryFn: () => api.get<{ data: Activite[] }>(`/activites?entiteType=ENTREPRISE&entiteId=${id}&perPage=50`), enabled: !!id });
  const notes = actsRaw?.data ?? [];
  const noteMut = useMutation({ mutationFn: (contenu: string) => api.post('/activites', { entiteType: 'ENTREPRISE', entiteId: id, type: 'NOTE', contenu }), onSuccess: () => qc.invalidateQueries({ queryKey: ['activites', 'entreprise', id] }) });

  const { revenue, actifs } = useMemo(() => {
    const m = e?.mandats ?? [];
    return {
      revenue: m.filter(x => x.feeStatut === 'PAYE').reduce((s, x) => s + (x.feeMontantFacture ?? 0), 0),
      actifs: m.filter(x => ['OUVERT', 'EN_COURS'].includes(x.statut)).length,
    };
  }, [e]);

  if (isLoading || !e) return <div style={{ padding: 40, color: '#8A8699' }}>Chargement…</div>;

  const siteHost = e.siteWeb ? e.siteWeb.replace(/^https?:\/\//, '').replace(/\/$/, '') : null;
  const infos = [
    { label: 'SIREN', value: e.siren, Icon: Hash },
    { label: 'Forme juridique', value: e.formeJuridique, Icon: Building2 },
    { label: 'Effectif', value: e.effectif || (e.taille ? TAILLE_LABELS[e.taille] : null), Icon: Users },
    { label: "Chiffre d'affaires", value: e.chiffreAffaires ? fmtEur(e.chiffreAffaires) : null, Icon: Banknote },
    { label: 'Création', value: e.dateCreation, Icon: FileText },
    { label: 'Adresse', value: e.adresseComplete || e.localisation, Icon: MapPin },
  ].filter(i => i.value);

  const submitNote = () => { const t = note.trim(); if (!t) return; noteMut.mutate(t); setNote(''); };

  return (
    <div>
      <style>{`
        .fmcard:hover{ box-shadow:0 20px 40px -28px rgba(34,23,122,.4); border-color:rgba(34,23,122,.16) !important; }
        .fmcard{ transition:box-shadow .22s ease, border-color .22s ease; }
        .fs-grid{ display:grid; grid-template-columns:minmax(0,1fr) 400px; gap:22px; align-items:start; }
        @media (max-width:1180px){ .fs-grid{ grid-template-columns:minmax(0,1fr) 340px; } }
        @media (max-width:1024px){ .fs-grid{ grid-template-columns:1fr; } .fs-rail{ position:static !important; max-height:none !important; } }
      `}</style>

      {/* TOPBAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
        <button onClick={() => navigate('/entreprises')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#4A4568', border: '1px solid rgba(34,23,122,.14)', background: '#fff', borderRadius: 10, padding: '8px 13px', cursor: 'pointer' }}><ArrowLeft size={14} strokeWidth={2.4} />Entreprises</button>
        {e.pappersUrl && <a href={e.pappersUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#22177A', border: '1px solid rgba(34,23,122,.16)', background: '#fff', borderRadius: 10, padding: '8px 14px', textDecoration: 'none' }}><ExternalLink size={14} />Fiche Pappers</a>}
      </div>

      <div className="fs-grid">
        {/* MAIN */}
        <div>
          {/* BANDEAU */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
            <span style={{ flexShrink: 0, width: 72, height: 72, borderRadius: 18, background: '#fff', border: '1px solid rgba(34,23,122,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 8, boxShadow: '0 10px 28px -16px rgba(34,23,122,.5)' }}>
              {e.logoUrl ? <img src={e.logoUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 22, color: '#22177A' }}>{mono(e.nom)}</span>}
            </span>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
              <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 29, letterSpacing: '-.035em', color: '#1A1533' }}>{e.nom}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap', fontSize: 13.5, color: '#6E6A85' }}>
                {e.secteur && <span style={{ fontWeight: 700, color: '#4A4568' }}>{e.secteur}</span>}
                {(e.effectif || e.taille) && <><span style={{ color: '#C4C1D0' }}>·</span><span>{e.effectif || TAILLE_LABELS[e.taille!]}</span></>}
                {e.localisation && <><span style={{ color: '#C4C1D0' }}>·</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MapPin size={13} color="#9A96AE" />{e.localisation}</span></>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 13, flexWrap: 'wrap' }}>
                {siteHost && <a href={e.siteWeb!.startsWith('http') ? e.siteWeb! : `https://${e.siteWeb}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,.16)', borderRadius: 9, padding: '7px 13px', textDecoration: 'none' }}><Globe size={13} />{siteHost}</a>}
                <button onClick={() => navigate(`/clients/new?entrepriseId=${e.id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,.16)', borderRadius: 9, padding: '7px 13px', cursor: 'pointer' }}><Plus size={13} />Contact</button>
                <button onClick={() => navigate(`/mandats/new?entrepriseId=${e.id}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: '#E6E9AF', background: '#22177A', border: 'none', borderRadius: 9, padding: '8px 14px', cursor: 'pointer' }}><Plus size={13} strokeWidth={2.4} />Nouveau mandat</button>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 22 }}>
            {[{ label: 'CA généré', value: fmtEur(revenue), Icon: Banknote, color: '#2C6B3F' }, { label: 'Mandats actifs', value: String(actifs), Icon: Briefcase, color: '#22177A' }, { label: 'Total mandats', value: String(e._count.mandats), Icon: FileText, color: '#1A1533' }, { label: 'Contacts', value: String(e._count.clients), Icon: Users, color: '#1A1533' }].map(k => (
              <div key={k.label} style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9A96AE' }}><k.Icon size={12} color="#22177A" />{k.label}</div>
                <div style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 22, letterSpacing: '-.03em', color: k.color, marginTop: 8 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* CONTACTS */}
          <div style={{ marginTop: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 17, color: '#1A1533' }}>Contacts</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#22177A', background: '#E6E9AF', borderRadius: 999, padding: '3px 10px' }}>{e._count.clients}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 11 }}>
              {e.clients.length === 0 && <div style={{ border: '1.5px dashed rgba(34,23,122,.2)', borderRadius: 14, padding: 18, textAlign: 'center', color: '#8A8699', fontSize: 13.5 }}>Aucun contact enregistré.</div>}
              {e.clients.map(ct => {
                const [bg, fg] = AV[Math.abs([...ct.nom].reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)) % AV.length];
                return (
                  <div key={ct.id} className="fmcard" onClick={() => navigate(`/clients/${ct.id}`)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: '1px solid rgba(34,23,122,.09)', borderRadius: 13, padding: '12px 14px' }}>
                    <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 12 }}>{initials(ct.prenom, ct.nom)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`${ct.prenom ? ct.prenom + ' ' : ''}${ct.nom}`.trim()}</div>
                      <div style={{ fontSize: 12, color: '#8A8699', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ct.poste || '—'}</div>
                    </div>
                    {ct.email && <a href={`mailto:${ct.email}`} onClick={ev => ev.stopPropagation()} style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: 'rgba(34,23,122,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Mail size={13} color="#22177A" /></a>}
                    {ct.telephone && <a href={`tel:${ct.telephone}`} onClick={ev => ev.stopPropagation()} style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: 'rgba(34,23,122,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Phone size={13} color="#22177A" /></a>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* MANDATS */}
          <div style={{ marginTop: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 17, color: '#1A1533' }}>Mandats de la société</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#22177A', background: '#E6E9AF', borderRadius: 999, padding: '3px 10px' }}>{e._count.mandats}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {e.mandats.length === 0 && <div style={{ border: '1.5px dashed rgba(34,23,122,.2)', borderRadius: 15, padding: 20, textAlign: 'center', color: '#8A8699', fontSize: 13.5 }}>Aucun mandat pour cette société.</div>}
              {e.mandats.map(m => {
                const ms = MANDAT_STATUT[m.statut] ?? MANDAT_STATUT.OUVERT;
                const fee = m.feeMontantFacture ?? m.feeMontantEstime;
                return (
                  <div key={m.id} className="fmcard" onClick={() => navigate(`/mandats/${m.id}`)} style={{ cursor: 'pointer', background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 15, padding: '15px 18px', boxShadow: '0 1px 2px rgba(34,23,122,.04)', display: 'flex', alignItems: 'center', gap: 13 }}>
                    <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 11, background: '#F2F3D8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Briefcase size={17} color="#22177A" /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.titrePoste}</div>
                      <div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 2 }}>{m._count.candidatures} candidat{m._count.candidatures > 1 ? 's' : ''} · ouvert {relTime(m.createdAt)}{fee ? ` · fee ${fmtEur(fee)}` : ''}</div>
                    </div>
                    <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 800, color: ms.fg, background: ms.bg, borderRadius: 999, padding: '5px 12px' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: ms.dot }} />{ms.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* INFOS */}
          {infos.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <span style={{ fontWeight: 800, fontSize: 17, color: '#1A1533' }}>Informations légales</span>
              <div style={{ marginTop: 12, background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 15, padding: '6px 4px' }}>
                {infos.map(i => (
                  <div key={i.label} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, alignItems: 'center', padding: '11px 16px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 13.5, color: '#6E6A85' }}><i.Icon size={15} color="#8A8699" />{i.label}</span>
                    <span style={{ fontSize: 13.5, color: '#1A1533', fontWeight: 600 }}>{i.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RAIL */}
        <aside className="fs-rail" style={{ position: 'sticky', top: 12, alignSelf: 'start', maxHeight: 'calc(100vh - 90px)', background: '#fff', border: '1px solid rgba(34,23,122,.1)', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flexShrink: 0, display: 'flex', gap: 5, padding: '14px 16px 12px', borderBottom: '1px solid rgba(34,23,122,.09)' }}>
            {([['rel', 'Relation'], ['notes', 'Notes']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setRailTab(k)} style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', background: railTab === k ? '#22177A' : 'transparent', color: railTab === k ? '#E6E9AF' : '#8A8699' }}>{l}</button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px 22px' }}>
            {railTab === 'rel' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[['CA généré', fmtEur(revenue)], ['Mandats actifs', String(actifs)], ['Total mandats', String(e._count.mandats)], ['Contacts', String(e._count.clients)], ['Secteur', e.secteur || '—'], ['Effectif', e.effectif || (e.taille ? TAILLE_LABELS[e.taille] : '—')]].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px', background: '#FBFBF3', border: '1px solid rgba(34,23,122,.08)', borderRadius: 11 }}>
                    <span style={{ fontSize: 12.5, color: '#6E6A85' }}>{k}</span><span style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1533' }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            {railTab === 'notes' && (
              <>
                {notes.length === 0 && <div style={{ color: '#9A96AE', fontSize: 13, textAlign: 'center', padding: 14 }}>Aucune note.</div>}
                {notes.map(n => (
                  <div key={n.id} style={{ background: '#FBFBF3', border: '1px solid rgba(34,23,122,.08)', borderRadius: 12, padding: '12px 14px', marginBottom: 9 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 12.5, fontWeight: 800, color: '#1A1533' }}>{`${n.user?.prenom ?? ''} ${n.user?.nom ?? ''}`.trim() || 'Vous'}</span><span style={{ fontSize: 11.5, color: '#B4B0C4' }}>{relTime(n.createdAt)}</span></div>
                    <div style={{ marginTop: 6 }}>
                      {n.titre && <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1533' }}>{n.titre}</div>}
                      {n.contenu && <NoteContent text={n.contenu} />}
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <input value={note} onChange={ev => setNote(ev.target.value)} onKeyDown={ev => ev.key === 'Enter' && submitNote()} placeholder="Ajouter une note…" style={{ flex: 1, fontSize: 13, padding: '10px 13px', borderRadius: 10, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none' }} />
                  <button onClick={submitNote} style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 10, padding: '10px 15px', cursor: 'pointer' }}>Ajouter</button>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
