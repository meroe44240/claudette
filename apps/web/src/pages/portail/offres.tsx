/**
 * Portail client : offres d'emploi de l'entreprise suivies par HumanUp.
 * URL : /portail/offres
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { MapPin, BellRing } from 'lucide-react';
import { portalStore } from './portal-store';
import {
  BG, BRAND, COL_ACCENT, COL_LABELS, COL_ORDER, CREAM, DISPLAY, FAINT, FONT, FS, INK, LABEL, LINE, MUTED, SHARED_CSS,
  CompanyLogo, PersonAvatar, PortalTopBar, portalFetch, relTime, useIsMobile, type Col,
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
    document.title = 'Offres d’emploi | HumanUp';
    void portalFetch('/offres').then(async (r) => {
      if (r.status === 401) { portalStore.clear(); navigate('/portail/login?expired=1'); return; }
      setOffres(r.ok ? await r.json() : []);
    });
  }, [navigate]);

  const open = (offres ?? []).filter((o) => OPEN.includes(o.statut));
  const closed = (offres ?? []).filter((o) => !OPEN.includes(o.statut));

  return (
    <div className="pm-page" style={{ background: BG, minHeight: '100vh', fontFamily: FONT, color: INK }}>
      <style>{SHARED_CSS}{`
        .pm-offer{ transition:transform .18s cubic-bezier(.16,1,.3,1), box-shadow .2s ease, border-color .18s ease; }
        .pm-offer:hover{ transform:translateY(-2px); box-shadow:0 16px 30px -22px rgba(26,21,51,.4); border-color:rgba(34,23,122,.2) !important; }
        .pm-offer:focus-visible{ outline:2.5px solid ${BRAND}; outline-offset:2px; }
      `}</style>
      <PortalTopBar active="offres" />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '22px 16px 40px' : '32px 32px 56px' }}>
        <h1 style={{ fontFamily: DISPLAY, fontSize: isMobile ? 22 : FS.xxl, letterSpacing: '-.025em' }}>Offres d’emploi</h1>

        {offres === null && <p style={{ marginTop: 28, fontSize: FS.base, color: FAINT }}>Chargement…</p>}
        {offres?.length === 0 && (
          <div style={{ marginTop: 28, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: 28, textAlign: 'center', color: MUTED, fontSize: FS.md }}>
            Aucune offre en cours.
          </div>
        )}

        {open.length > 0 && <OfferList title="En cours" offres={open} />}
        {closed.length > 0 && <OfferList title="Terminées" offres={closed} muted />}
      </main>
    </div>
  );
}

function OfferList({ title, offres, muted }: { title: string; offres: Offre[]; muted?: boolean }) {
  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ ...LABEL, marginBottom: 10 }}>{title} ({offres.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {offres.map((o) => <OfferCard key={o.id} o={o} muted={muted} />)}
      </div>
    </section>
  );
}

function OfferCard({ o, muted }: { o: Offre; muted?: boolean }) {
  const cols = COL_ORDER.filter((c) => c in o.byColumn && c !== 'PERDU');
  const active = cols.reduce((n, c) => n + (o.byColumn[c] ?? 0), 0);
  const people = [o.commercial, o.consultant].filter(Boolean) as Person[];
  return (
    <Link to={`/portail/mandat/${o.id}`} className="pm-offer" style={{ display: 'block', textDecoration: 'none', color: INK, background: '#fff', border: `1px solid ${LINE}`, borderRadius: 16, padding: '16px 18px', opacity: muted ? 0.8 : 1 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
        <CompanyLogo logo={o.entreprise?.logoUrl} text={o.entreprise?.nom || o.titrePoste} size={44} />
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: FS.lg, fontWeight: 800 }}>{o.titrePoste}</span>
            {o.toReview > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: FS.sm, fontWeight: 800, color: BRAND, background: '#EDEBFA', borderRadius: 999, padding: '2px 9px' }}>
                <BellRing size={12} aria-hidden />{o.toReview} à traiter
              </span>
            )}
            {muted && <span style={{ fontSize: FS.sm, fontWeight: 700, color: MUTED, background: 'rgba(26,21,51,.06)', borderRadius: 999, padding: '2px 9px' }}>{o.statut === 'GAGNE' ? 'Pourvue' : 'Terminée'}</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4, fontSize: FS.sm, color: MUTED }}>
            {o.localisation && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={13} aria-hidden />{o.localisation}</span>}
            <span>{active} profil{active > 1 ? 's' : ''} en cours</span>
            {o.lastActivity && <span>Mis à jour {relTime(o.lastActivity)}</span>}
          </div>
        </div>
        {people.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center' }} title={people.map(nameOf).join(' · ')}>
            {people.map((p, i) => (
              <span key={i} style={{ marginLeft: i ? -8 : 0, border: '2px solid #fff', borderRadius: '50%' }}>
                <PersonAvatar name={nameOf(p)} photo={p.avatarUrl} size={30} bg={i ? '#F2F3D8' : BRAND} fg={i ? BRAND : CREAM} />
              </span>
            ))}
          </div>
        )}
      </div>
      {/* Mini pipeline : nombre de profils par colonne */}
      {cols.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
          {cols.map((c) => {
            const n = o.byColumn[c] ?? 0;
            return (
              <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: FS.sm, fontWeight: 700, color: n ? INK : FAINT, background: n ? '#F7F6F0' : 'transparent', border: `1px solid ${n ? LINE : 'transparent'}`, borderRadius: 8, padding: '3px 9px' }}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: 99, background: COL_ACCENT[c], opacity: n ? 1 : 0.45 }} />
                {COL_LABELS[c]} <strong style={{ fontWeight: 800 }}>{n}</strong>
              </span>
            );
          })}
        </div>
      )}
    </Link>
  );
}
