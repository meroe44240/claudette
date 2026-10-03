/**
 * Portail client : offres d'emploi de l'entreprise suivies par Humanup.
 * URL : /portail/offres
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { portalStore } from './portal-store';
import {
  BG, CARD, COL_LABELS, COL_ORDER, FONT, INK, LINE, MUTED, SHARED_CSS, TEXT,
  PersonAvatar, Pill, PortalTopBar, portalFetch, relTime, useIsMobile, type Col,
} from './portal-ui';

interface Person { nom: string; prenom: string | null; avatarUrl?: string | null }
interface Offre {
  id: string; titrePoste: string; localisation: string | null; statut: string; createdAt: string; salaryRange: string | null;
  entreprise: { nom: string; logoUrl: string | null } | null;
  consultant: Person | null; commercial: Person | null;
  total: number; toReview: number; byColumn: Partial<Record<Col, number>>; lastActivity: string | null;
}
const nameOf = (p: Person) => `${p.prenom ? p.prenom + ' ' : ''}${p.nom}`.trim();
const OPEN = ['OUVERT', 'EN_COURS'];

export default function PortalOffresPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [offres, setOffres] = useState<Offre[] | null>(null);

  useEffect(() => {
    if (!portalStore.get('portal_token')) { navigate('/portail/login'); return; }
    document.title = 'Offres d’emploi | Humanup';
    void portalFetch('/offres').then(async (r) => {
      if (r.status === 401) { portalStore.clear(); navigate('/portail/login?expired=1'); return; }
      setOffres(r.ok ? await r.json() : []);
    });
  }, [navigate]);

  const open = (offres ?? []).filter((o) => OPEN.includes(o.statut));
  const closed = (offres ?? []).filter((o) => !OPEN.includes(o.statut));

  return (
    <div className="pm-page" style={{ background: BG, minHeight: '100vh', fontFamily: FONT }}>
      <style>{SHARED_CSS}{`
        .pm-offer{ transition:border-color .15s ease, box-shadow .15s ease; }
        .pm-offer:hover{ border-color:#C7C9D1 !important; box-shadow:0 4px 14px -8px rgba(17,24,39,.25); }
      `}</style>
      <PortalTopBar active="offres" />
      <main style={{ maxWidth: 1080, margin: '0 auto', padding: isMobile ? '22px 16px 40px' : '32px 24px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: isMobile ? 22 : 26, color: INK, letterSpacing: '-0.02em' }}>Vos offres avec Humanup</h1>

        {offres === null && <p style={{ fontSize: 14, color: MUTED }}>Chargement…</p>}
        {offres?.length === 0 && <div style={{ ...CARD, padding: 28, color: MUTED, fontSize: 14 }}>Aucune offre en cours.</div>}

        {open.map((o) => <OfferCard key={o.id} o={o} />)}
        {closed.length > 0 && <h2 style={{ fontSize: 16, color: INK, marginTop: 12 }}>Offres terminées</h2>}
        {closed.map((o) => <OfferCard key={o.id} o={o} closed />)}
      </main>
    </div>
  );
}

function OfferCard({ o, closed }: { o: Offre; closed?: boolean }) {
  const cols = COL_ORDER.filter((c) => c !== 'PERDU');
  const active = cols.reduce((n, c) => n + (o.byColumn[c] ?? 0), 0);
  const people = [o.commercial, o.consultant].filter(Boolean) as Person[];
  const meta = [o.localisation, `${active} profil${active > 1 ? 's' : ''} en cours`, o.lastActivity ? `mise à jour ${relTime(o.lastActivity)}` : null].filter(Boolean).join(' · ');
  return (
    <Link to={`/portail/mandat/${o.id}`} className="pm-offer" style={{ ...CARD, padding: '20px 22px', textDecoration: 'none', color: TEXT, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontWeight: 700, color: INK, fontSize: 17 }}>{o.titrePoste}</span>
          <span style={{ fontSize: 14, color: MUTED }}>{meta}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {closed ? <Pill>{o.statut === 'GAGNE' ? 'Pourvue' : 'Terminée'}</Pill> : o.toReview > 0 ? <Pill strong>{o.toReview} à traiter</Pill> : <Pill>À jour</Pill>}
          {people.length > 0 && (
            <span style={{ display: 'flex', alignItems: 'center' }} title={people.map(nameOf).join(' · ')}>
              {people.map((p, i) => (
                <span key={i} style={{ marginLeft: i ? -8 : 0, border: '2px solid #fff', borderRadius: '50%', display: 'flex' }}>
                  <PersonAvatar name={nameOf(p)} photo={p.avatarUrl} size={30} />
                </span>
              ))}
            </span>
          )}
        </span>
      </span>
      {/* Mini pipeline : nombre de profils par étape */}
      <span style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8 }}>
        {cols.map((c) => {
          const n = o.byColumn[c] ?? 0;
          return (
            <span key={c} style={{ background: BG, borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', border: `1px solid ${n ? LINE : 'transparent'}` }}>
              <span style={{ fontSize: 12, color: MUTED }}>{COL_LABELS[c]}</span>
              <span style={{ fontWeight: 700, color: n ? INK : MUTED }}>{n}</span>
            </span>
          );
        })}
      </span>
    </Link>
  );
}
