/**
 * Portail client — « Candidats » : tous les profils présentés, toutes offres confondues.
 * URL : /portail/candidats — un clic ouvre la fiche dans le tableau de l'offre.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, Banknote } from 'lucide-react';
import { portalStore } from './portal-store';
import {
  BG, BRAND, COL_ACCENT, COL_LABELS, COL_ORDER, COL_TINT, DECISION_LABEL, DECISION_TONE, DISPLAY, FAINT, FONT, FS, INK, LABEL, LINE, MUTED, SHARED_CSS,
  PersonAvatar, PortalTopBar, portalFetch, relTime, useIsMobile, type Col, type Decision,
} from './portal-ui';

interface Row {
  id: string; mandatId: string; mandatTitre: string; stage: string; column: Col | null; decision: Decision | null;
  stageSince: string; updatedAt: string;
  candidat: { id: string; nom: string; prenom: string | null; posteActuel: string | null; entrepriseActuelle: string | null; photoUrl: string | null; salary: string | null };
}
const fullName = (r: Row) => `${r.candidat.prenom ?? ''} ${r.candidat.nom}`.trim();

export default function PortalCandidatsPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [offre, setOffre] = useState('');
  const [col, setCol] = useState<'' | Col | 'ACTIFS'>('ACTIFS');

  useEffect(() => {
    if (!portalStore.get('portal_token')) { navigate('/portail/login'); return; }
    document.title = 'Candidats — HumanUp';
    void portalFetch('/candidats').then(async (r) => {
      if (r.status === 401) { portalStore.clear(); navigate('/portail/login?expired=1'); return; }
      setRows(r.ok ? await r.json() : []);
    });
  }, [navigate]);

  const offres = useMemo(() => Array.from(new Map((rows ?? []).map((r) => [r.mandatId, r.mandatTitre])).entries()), [rows]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) =>
      (!offre || r.mandatId === offre) &&
      (col === '' || (col === 'ACTIFS' ? r.column !== 'PERDU' : r.column === col)) &&
      (!s || [fullName(r), r.candidat.posteActuel, r.candidat.entrepriseActuelle, r.mandatTitre].some((v) => v?.toLowerCase().includes(s))));
  }, [rows, q, offre, col]);
  const open = (r: Row) => navigate(`/portail/mandat/${r.mandatId}?c=${r.id}`);

  const selectStyle: React.CSSProperties = { fontFamily: FONT, fontSize: FS.base, fontWeight: 600, color: INK, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 10, padding: '9px 12px', minWidth: 0 };

  return (
    <div className="pm-page" style={{ background: BG, minHeight: '100vh', fontFamily: FONT, color: INK }}>
      <style>{SHARED_CSS}</style>
      <PortalTopBar active="candidats" />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '22px 16px 40px' : '32px 32px 56px' }}>
        <h1 style={{ fontFamily: DISPLAY, fontSize: isMobile ? 22 : FS.xxl, letterSpacing: '-.025em' }}>Candidats</h1>
        <p style={{ fontSize: FS.md, color: MUTED, marginTop: 6 }}>Tous les profils présentés par HumanUp, toutes offres confondues.</p>

        {/* Recherche + filtres */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
          <label style={{ position: 'relative', flex: '1 1 240px', minWidth: 0 }}>
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Rechercher un candidat</span>
            <Search size={16} aria-hidden style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: FAINT }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un nom, un poste, une entreprise…" style={{ ...selectStyle, width: '100%', paddingLeft: 36, fontWeight: 500 }} />
          </label>
          <select aria-label="Filtrer par offre" value={offre} onChange={(e) => setOffre(e.target.value)} style={{ ...selectStyle, flex: '0 1 240px' }}>
            <option value="">Toutes les offres</option>
            {offres.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
          </select>
          <select aria-label="Filtrer par étape" value={col} onChange={(e) => setCol(e.target.value as '' | Col | 'ACTIFS')} style={{ ...selectStyle, flex: '0 1 190px' }}>
            <option value="ACTIFS">En cours (hors Perdu)</option>
            <option value="">Toutes les étapes</option>
            {COL_ORDER.map((c) => <option key={c} value={c}>{COL_LABELS[c]}</option>)}
          </select>
        </div>

        {rows === null && <p style={{ marginTop: 24, fontSize: FS.base, color: FAINT }}>Chargement…</p>}
        {rows !== null && (
          <p style={{ ...LABEL, marginTop: 20 }}>{filtered.length} candidat{filtered.length > 1 ? 's' : ''}</p>
        )}
        {rows !== null && filtered.length === 0 && (
          <div style={{ marginTop: 10, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 28, textAlign: 'center', color: MUTED, fontSize: FS.md }}>
            Aucun candidat ne correspond à ces critères.
          </div>
        )}

        {filtered.length > 0 && (isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {filtered.map((r) => (
              <button key={r.id} onClick={() => open(r)} className="pm-row" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 14, padding: 13, cursor: 'pointer', fontFamily: FONT }}>
                <PersonAvatar name={fullName(r)} photo={r.candidat.photoUrl} size={42} radius={12} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: FS.md, fontWeight: 800, color: INK }}>{fullName(r)}</span>
                  {r.candidat.posteActuel && <span style={{ display: 'block', fontSize: FS.base, color: MUTED, marginTop: 2 }}>{r.candidat.posteActuel}</span>}
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}><StageTag c={r.column} /><DecisionTag d={r.decision} /></span>
                  <span style={{ display: 'block', fontSize: FS.sm, color: FAINT, marginTop: 6 }}>{r.mandatTitre}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 10, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FS.base }}>
              <thead>
                <tr style={{ background: '#FAFAF6', borderBottom: `1px solid ${LINE}` }}>
                  {['Candidat', 'Offre', 'Étape', 'Avis', 'Salaire', 'Mis à jour'].map((h) => (
                    <th key={h} scope="col" style={{ ...LABEL, letterSpacing: '.08em', textAlign: 'left', padding: '11px 14px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="pm-row" tabIndex={0} onClick={() => open(r)} onKeyDown={(e) => { if (e.key === 'Enter') open(r); }}
                    aria-label={`${fullName(r)} — ${r.mandatTitre}. Ouvrir le dossier`} style={{ borderBottom: `1px solid ${LINE}`, cursor: 'pointer' }}>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <PersonAvatar name={fullName(r)} photo={r.candidat.photoUrl} size={36} radius={10} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: FS.md, fontWeight: 800, color: INK }}>{fullName(r)}</span>
                          {r.candidat.posteActuel && <span style={{ display: 'block', fontSize: FS.sm, color: MUTED, maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.candidat.posteActuel}</span>}
                        </span>
                      </span>
                    </td>
                    <td style={{ padding: '11px 14px', color: MUTED, maxWidth: 240 }}>{r.mandatTitre}</td>
                    <td style={{ padding: '11px 14px' }}><StageTag c={r.column} /></td>
                    <td style={{ padding: '11px 14px' }}><DecisionTag d={r.decision} /></td>
                    <td style={{ padding: '11px 14px', color: INK, whiteSpace: 'nowrap' }}>
                      {r.candidat.salary ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Banknote size={13} aria-hidden color={BRAND} />{r.candidat.salary}</span> : <span style={{ color: FAINT }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 14px', color: MUTED, whiteSpace: 'nowrap' }}>{relTime(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </main>
    </div>
  );
}

function StageTag({ c }: { c: Col | null }) {
  if (!c) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: FS.sm, fontWeight: 800, color: INK, background: COL_TINT[c], borderRadius: 8, padding: '3px 9px', whiteSpace: 'nowrap' }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: COL_ACCENT[c] }} />{COL_LABELS[c]}
    </span>
  );
}
function DecisionTag({ d }: { d: Decision | null }) {
  if (!d) return <span style={{ fontSize: FS.sm, color: FAINT }}>—</span>;
  return <span style={{ fontSize: FS.sm, fontWeight: 800, borderRadius: 8, padding: '3px 9px', background: DECISION_TONE[d].bg, color: DECISION_TONE[d].fg, whiteSpace: 'nowrap' }}>{DECISION_LABEL[d]}</span>;
}
