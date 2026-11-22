import { ExternalLink, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router';
import { t, LOCALE } from '../../lib/i18n';

// ─── Types (format renvoyé par /api/v1/profils-recherches) ──────────────────
export interface OffreSource { titre: string; url: string | null; date_vue: string | null; source: string | null }
export interface Profil {
  id: string;
  company: { id: string; name: string; logoUrl: string | null; siteWeb: string | null; domaine: string | null };
  fonction: 'ENGINEERING' | 'SALES';
  intitule_type: string;
  seniorite: string | null;
  localisation: { pays: string | null; ville: string | null; remote: string | null };
  langues: string[];
  remuneration: { salaire_min: number | null; salaire_max: number | null; devise: string | null; ote: string | null; equity: string | null };
  marche: string | null;
  offres_sources: OffreSource[];
  date_analyse: string;
  analyse_par: string | null;
  mandat_lie: { id: string; titre: string; type_lien: string | null } | null;
  experience_attendue: string | null;
  technos?: string[]; perimetre?: string | null; projets?: string | null;
  type_clients?: { segments: string[]; secteurs: string[] };
  acheteur_type?: string | null; cycle_de_vente?: string | null; panier_moyen_acv?: string | null;
  motion?: string[]; territoire?: string | null; quota?: string | null; outils_methodo?: string[];
}

// ─── Libellés ───────────────────────────────────────────────────────────────
export const FONCTION_LABEL: Record<string, string> = { ENGINEERING: 'Engineering', SALES: 'Sales' };
export const SENIORITE_LABEL: Record<string, string> = { JUNIOR: t('Junior'), CONFIRME: t('Confirmé'), SENIOR: t('Senior'), LEAD: t('Lead'), MANAGER: t('Manager'), DIRECTION: t('Direction') };
export const REMOTE_LABEL: Record<string, string> = { ONSITE: t('Sur site'), HYBRID: t('Hybride'), REMOTE: t('Télétravail complet') };
export const MARCHE_LABEL: Record<string, string> = { FRANCE: t('France'), EUROPE: t('Europe'), UK: t('Royaume-Uni'), US: t('États-Unis'), CANADA: t('Canada'), APAC: 'APAC' };
export const SEGMENT_LABEL: Record<string, string> = { SMB: 'SMB', MID_MARKET: 'Mid-market', ENTERPRISE: t('Grands comptes'), PUBLIC: t('Secteur public') };
export const MOTION_LABEL: Record<string, string> = { OUTBOUND: 'Outbound', INBOUND: 'Inbound', PLG: 'PLG', PARTENAIRES: t('Partenaires'), FIELD_SALES: 'Field sales' };
export const LIEN_LABEL: Record<string, string> = { CONCURRENT_DIRECT: t('concurrent direct'), SIMILAIRE: t('similaire'), VOISINE: t('voisine') };

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}
const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
export function fmtSalaire(r: Profil['remuneration']) {
  const cur = r.devise ?? '';
  if (r.salaire_min && r.salaire_max) return `${fmtK(r.salaire_min)} à ${fmtK(r.salaire_max)} ${cur}`.trim();
  if (r.salaire_min) return `${t('dès')} ${fmtK(r.salaire_min)} ${cur}`.trim();
  if (r.salaire_max) return `${t("jusqu'à")} ${fmtK(r.salaire_max)} ${cur}`.trim();
  return null;
}
export function fmtLieu(l: Profil['localisation']) {
  const parts = [l.ville, l.pays].filter(Boolean).join(', ');
  const rem = l.remote ? REMOTE_LABEL[l.remote] : null;
  return [parts, rem].filter(Boolean).join(' · ') || null;
}

// ─── Petits composants ──────────────────────────────────────────────────────
export function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'brand' | 'soft' }) {
  const s = tone === 'brand' ? { background: '#22177A', color: '#E6E9AF' } : tone === 'soft' ? { background: '#F2F3D8', color: '#22177A' } : { background: 'rgba(34,23,122,.06)', color: '#4A4568' };
  return <span style={{ ...s, display: 'inline-flex', alignItems: 'center', fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>{children}</span>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === '' || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr)', gap: 12, padding: '7px 0', borderTop: '1px solid rgba(34,23,122,.06)' }}>
      <span style={{ fontSize: 12.5, color: '#8A8699' }}>{label}</span>
      <div style={{ fontSize: 13, color: '#1A1533', lineHeight: 1.5, minWidth: 0 }}>{children}</div>
    </div>
  );
}
const chips = (arr: string[] | undefined, map?: Record<string, string>) => (arr && arr.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{arr.map(x => <Chip key={x}>{map?.[x] ?? x}</Chip>)}</div> : null);

/** Carte complète d'un profil (fiche société). */
export function ProfilCard({ p }: { p: Profil }) {
  const navigate = useNavigate();
  const eng = p.fonction === 'ENGINEERING';
  const salaire = fmtSalaire(p.remuneration);
  const lieu = fmtLieu(p.localisation);
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.09)', borderRadius: 15, padding: '16px 18px', boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: '#1A1533' }}>{p.intitule_type}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7, alignItems: 'center' }}>
            {p.seniorite && <Chip tone="soft">{SENIORITE_LABEL[p.seniorite]}</Chip>}
            {p.marche && <Chip>{MARCHE_LABEL[p.marche]}</Chip>}
            {lieu && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: '#6E6A85' }}><MapPin size={12} />{lieu}</span>}
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: '#9A96AE', textAlign: 'right' }}>
          {t('Analysé le {date}', { date: fmtDate(p.date_analyse) })}
          {p.analyse_par && <div>{t('par {nom}', { nom: p.analyse_par })}</div>}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {eng ? (
          <>
            <Row label={t('Technos')}>{p.technos?.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{p.technos.map(x => <Chip key={x} tone="soft">{x}</Chip>)}</div> : null}</Row>
            <Row label={t('Périmètre')}>{p.perimetre}</Row>
            <Row label={t('Projets')}>{p.projets}</Row>
          </>
        ) : (
          <>
            <Row label={t('Type de clients')}>{(p.type_clients?.segments.length || p.type_clients?.secteurs.length) ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{p.type_clients!.segments.map(s => <Chip key={s} tone="soft">{SEGMENT_LABEL[s]}</Chip>)}{p.type_clients!.secteurs.map(s => <Chip key={s}>{s}</Chip>)}</div> : null}</Row>
            <Row label={t('Qui signe')}>{p.acheteur_type}</Row>
            <Row label={t('Cycle de vente')}>{p.cycle_de_vente}</Row>
            <Row label={t('Panier moyen / ACV')}>{p.panier_moyen_acv}</Row>
            <Row label={t('Motion')}>{chips(p.motion, MOTION_LABEL)}</Row>
            <Row label={t('Territoire')}>{p.territoire}</Row>
            <Row label={t('Quota')}>{p.quota}</Row>
            <Row label={t('Outils et méthode')}>{chips(p.outils_methodo)}</Row>
          </>
        )}
        <Row label={t('Expérience attendue')}>{p.experience_attendue}</Row>
        <Row label={t('Langues')}>{p.langues.length ? p.langues.join(', ') : null}</Row>
        <Row label={t('Rémunération')}>{[salaire, p.remuneration.ote ? `OTE ${p.remuneration.ote}` : null, p.remuneration.equity ? `${t('Equity')} ${p.remuneration.equity}` : null].filter(Boolean).join(' · ') || null}</Row>
        <Row label={t('Mandat lié')}>{p.mandat_lie ? <a onClick={() => navigate(`/mandats/${p.mandat_lie!.id}`)} style={{ color: '#22177A', fontWeight: 700, cursor: 'pointer' }}>{p.mandat_lie.titre}{p.mandat_lie.type_lien ? ` (${LIEN_LABEL[p.mandat_lie.type_lien]})` : ''}</a> : null}</Row>
        <Row label={t('Offres sources')}>
          {p.offres_sources.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {p.offres_sources.map((o, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {o.url
                    ? <a href={o.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#22177A', fontWeight: 700, textDecoration: 'none' }}>{o.titre}<ExternalLink size={12} /></a>
                    : <span style={{ fontWeight: 700 }}>{o.titre}</span>}
                  {(o.source || o.date_vue) && <span style={{ fontSize: 12, color: '#9A96AE' }}>{[o.source, o.date_vue ? t('vue le {date}', { date: fmtDate(o.date_vue) }) : null].filter(Boolean).join(', ')}</span>}
                </div>
              ))}
            </div>
          ) : null}
        </Row>
      </div>
    </div>
  );
}
