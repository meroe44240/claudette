/**
 * Portail client : tous les profils présentés, toutes offres confondues.
 * URL : /portail/candidats — un clic ouvre la fiche dans le tableau de l'offre.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { portalStore } from './portal-store';
import {
  BG, CARD, COL_LABELS, COL_ORDER, CREAM, BRAND, DECISION_LABEL, FONT, INK, LINE, MUTED, SHARED_CSS, SOFT, TEXT,
  PersonAvatar, Pill, PortalTopBar, portalFetch, relTime, useIsMobile, type Col, type Decision,
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
    document.title = 'Candidats | Humanup';
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

  const control: React.CSSProperties = { fontFamily: FONT, fontSize: 14, color: INK, background: '#fff', border: '1px solid #D1D5DB', borderRadius: 10, padding: '10px 12px', minWidth: 0 };
  const cell: React.CSSProperties = { padding: '12px 18px', borderTop: `1px solid ${SOFT}`, verticalAlign: 'middle' };
  const head: React.CSSProperties = { padding: '12px 18px', color: MUTED, fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', fontSize: 14 };

  return (
    <div className="pm-page" style={{ background: BG, minHeight: '100vh', fontFamily: FONT }}>
      <style>{SHARED_CSS}</style>
      <PortalTopBar active="candidats" />
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: isMobile ? '22px 16px 40px' : '32px 24px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: isMobile ? 22 : 26, color: INK, letterSpacing: '-0.02em' }}>Tous les candidats</h1>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #D1D5DB', borderRadius: 10, padding: '0 12px', flex: isMobile ? '1 1 100%' : '0 1 300px' }}>
            <Search size={16} aria-hidden color={MUTED} />
            <span style={{ position: 'absolute', left: -9999 }}>Rechercher un candidat</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un candidat" style={{ fontFamily: FONT, fontSize: 14, border: 0, padding: '10px 0', flex: 1, minWidth: 0, background: 'transparent', color: INK, outline: 'none' }} />
          </label>
        </div>

        {/* Filtres */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select aria-label="Filtrer par offre" value={offre} onChange={(e) => setOffre(e.target.value)} style={{ ...control, flex: '0 1 260px' }}>
            <option value="">Toutes les offres</option>
            {offres.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
          </select>
          <select aria-label="Filtrer par étape" value={col} onChange={(e) => setCol(e.target.value as '' | Col | 'ACTIFS')} style={{ ...control, flex: '0 1 200px' }}>
            <option value="ACTIFS">En cours</option>
            <option value="">Toutes les étapes</option>
            {COL_ORDER.map((c) => <option key={c} value={c}>{COL_LABELS[c]}</option>)}
          </select>
          {rows !== null && <span style={{ fontSize: 14, color: MUTED, marginLeft: 'auto' }}>{filtered.length} candidat{filtered.length > 1 ? 's' : ''}</span>}
        </div>

        {rows === null && <p style={{ fontSize: 14, color: MUTED }}>Chargement…</p>}
        {rows !== null && filtered.length === 0 && (
          <div style={{ ...CARD, padding: 28, color: MUTED, fontSize: 14 }}>Aucun candidat ne correspond à ces critères.</div>
        )}

        {filtered.length > 0 && (isMobile ? (
          <div style={CARD}>
            {filtered.map((r, i) => (
              <button key={r.id} onClick={() => open(r)} className="pm-row" style={{ width: '100%', display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', background: 'transparent', border: 'none', borderTop: i ? `1px solid ${SOFT}` : 'none', padding: '12px 14px', cursor: 'pointer', fontFamily: FONT, color: TEXT, minHeight: 48 }}>
                <PersonAvatar name={fullName(r)} photo={r.candidat.photoUrl} size={38} bg={r.column === 'PERDU' ? LINE : CREAM} fg={r.column === 'PERDU' ? MUTED : BRAND} />
                <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>{fullName(r)}</span>
                  <span style={{ fontSize: 13, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.mandatTitre}</span>
                </span>
                {r.column && <Pill>{COL_LABELS[r.column]}</Pill>}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ ...CARD, overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>{['Candidat', 'Offre', 'Étape', 'Votre avis', 'Dernière action'].map((h) => <th key={h} scope="col" style={head}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="pm-row" tabIndex={0} onClick={() => open(r)} onKeyDown={(e) => { if (e.key === 'Enter') open(r); }}
                    aria-label={`${fullName(r)}, ${r.mandatTitre}. Ouvrir le dossier`} style={{ cursor: 'pointer' }}>
                    <td style={cell}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <PersonAvatar name={fullName(r)} photo={r.candidat.photoUrl} size={32} bg={r.column === 'PERDU' ? LINE : CREAM} fg={r.column === 'PERDU' ? MUTED : BRAND} />
                        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
                          <span style={{ fontWeight: 600, color: INK }}>{fullName(r)}</span>
                          {r.candidat.posteActuel && <span style={{ fontSize: 13, color: MUTED, maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.candidat.posteActuel}</span>}
                        </span>
                      </span>
                    </td>
                    <td style={cell}>{r.mandatTitre}</td>
                    <td style={cell}>{r.column && <Pill>{COL_LABELS[r.column]}</Pill>}</td>
                    <td style={{ ...cell, color: r.decision ? TEXT : MUTED }}>{r.decision ? DECISION_LABEL[r.decision] : 'Pas encore'}</td>
                    <td style={{ ...cell, color: MUTED, whiteSpace: 'nowrap' }}>{relTime(r.updatedAt)}</td>
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
