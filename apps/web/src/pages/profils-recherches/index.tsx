import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ChevronDown, Download, Search, X, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api-client';
import { t } from '../../lib/i18n';
import { usePageTitle } from '../../hooks/usePageTitle';
import { toast } from '../../components/ui/Toast';
import CompanyLogo from '../../components/entreprises/CompanyLogo';
import {
  ProfilCard, Chip, fmtDate, fmtLieu, type Profil,
  FONCTION_LABEL, SENIORITE_LABEL, REMOTE_LABEL, MARCHE_LABEL, SEGMENT_LABEL, MOTION_LABEL,
} from '../../components/profils-recherches/shared';

interface Facets { technos: string[]; secteurs: string[]; pays: string[]; companies: { id: string; name: string }[]; mandats: { id: string; titre: string }[] }
interface ListResp { data: Profil[]; meta: { total: number; page: number; perPage: number; totalPages: number } }

interface Filters {
  q: string; fonction: string; seniorite: string[]; technos: string[]; segments: string[]; secteurs: string[]; motion: string[];
  cycle_de_vente: string; marche: string[]; pays: string; remote: string[]; date_from: string; date_to: string; company_id: string; mandat_lie_id: string;
}
const EMPTY: Filters = { q: '', fonction: '', seniorite: [], technos: [], segments: [], secteurs: [], motion: [], cycle_de_vente: '', marche: [], pays: '', remote: [], date_from: '', date_to: '', company_id: '', mandat_lie_id: '' };

function toParams(f: Filters, extra?: Record<string, string>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (Array.isArray(v)) { if (v.length) p.set(k, v.join(',')); }
    else if (v) p.set(k, v);
  }
  for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
  return p.toString();
}

// ─── Liste déroulante à choix multiples ─────────────────────────────────────
function Multi({ label, options, value, onChange, searchable }: { label: string; options: Array<{ v: string; l: string }>; value: string[]; onChange: (v: string[]) => void; searchable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const shown = q ? options.filter(o => o.l.toLowerCase().includes(q.toLowerCase())) : options;
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ ...pill, ...(value.length ? pillOn : {}) }}>
        {label}{value.length > 0 && <span style={{ fontSize: 11, fontWeight: 800, background: '#E6E9AF', color: '#22177A', borderRadius: 999, padding: '0 7px' }}>{value.length}</span>}
        <ChevronDown size={13} />
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 30, top: 'calc(100% + 6px)', left: 0, minWidth: 230, maxWidth: 300, background: '#fff', border: '1px solid rgba(34,23,122,.12)', borderRadius: 12, boxShadow: '0 18px 40px -20px rgba(34,23,122,.45)', padding: 8 }}>
          {searchable && <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t('Chercher…')} style={{ width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(34,23,122,.14)', marginBottom: 6, outline: 'none' }} />}
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {shown.length === 0 && <div style={{ fontSize: 12.5, color: '#9A96AE', padding: 8 }}>{t('Aucune valeur.')}</div>}
            {shown.map(o => (
              <label key={o.v} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1A1533', padding: '6px 8px', borderRadius: 7, cursor: 'pointer' }}>
                <input type="checkbox" checked={value.includes(o.v)} onChange={() => toggle(o.v)} />{o.l}
              </label>
            ))}
          </div>
          {value.length > 0 && <button onClick={() => onChange([])} style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: '#8A8699', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>{t('Effacer')}</button>}
        </div>
      )}
    </div>
  );
}

const pill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#4A4568', background: '#fff', border: '1px solid rgba(34,23,122,.14)', borderRadius: 9, padding: '7px 11px', cursor: 'pointer', whiteSpace: 'nowrap' };
const pillOn: React.CSSProperties = { borderColor: '#22177A', color: '#22177A' };
const field: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: '#1A1533', background: '#fff', border: '1px solid rgba(34,23,122,.14)', borderRadius: 9, padding: '7px 10px', outline: 'none' };
const opts = (m: Record<string, string>) => Object.entries(m).map(([v, l]) => ({ v, l }));

// ═════════════════════════════════════════════════════
export default function ProfilsRecherchesPage() {
  usePageTitle(t('Profils recherchés'));
  const navigate = useNavigate();
  const [f, setF] = useState<Filters>(EMPTY);
  const [qInput, setQInput] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => { setF(prev => ({ ...prev, [k]: v })); setPage(1); };

  useEffect(() => { const h = setTimeout(() => set('q', qInput.trim()), 300); return () => clearTimeout(h); }, [qInput]);

  const { data: facets } = useQuery({ queryKey: ['profils-recherches', 'facets'], queryFn: () => api.get<Facets>('/profils-recherches/facets') });
  const qs = useMemo(() => toParams(f, { page: String(page), per_page: '50' }), [f, page]);
  const { data, isLoading, isFetching } = useQuery({ queryKey: ['profils-recherches', 'list', qs], queryFn: () => api.get<ListResp>(`/profils-recherches?${qs}`), placeholderData: keepPreviousData });

  const showEng = f.fonction !== 'SALES';
  const showSales = f.fonction !== 'ENGINEERING';
  const actifs = Object.entries(f).filter(([, v]) => (Array.isArray(v) ? v.length : v)).length;

  const exportCsv = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const r = await fetch(`/api/v1/profils-recherches/export?${toParams(f)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) throw new Error(String(r.status));
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `profils-recherches-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { toast('error', t("L'export a échoué.")); }
  };

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 27, letterSpacing: '-.035em', color: '#1A1533' }}>{t('Profils recherchés')}</h1>
          <div style={{ fontSize: 13.5, color: '#6E6A85', marginTop: 4 }}>{t('Ce que les sociétés recrutent, déduit de leurs offres, à la date de chaque analyse.')}</div>
        </div>
        <button onClick={exportCsv} style={{ ...pill, background: '#22177A', color: '#E6E9AF', border: 'none', padding: '9px 14px' }}><Download size={14} />{t('Export CSV')}</button>
      </div>

      {/* Recherche + filtres */}
      <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.09)', borderRadius: 15, padding: 14, marginBottom: 16 }}>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={15} color="#9A96AE" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={qInput} onChange={e => setQInput(e.target.value)} placeholder={t('Rechercher un intitulé, une techno, une société…')} style={{ width: '100%', fontSize: 13.5, padding: '10px 12px 10px 36px', borderRadius: 10, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', border: '1px solid rgba(34,23,122,.14)', borderRadius: 9, overflow: 'hidden' }}>
            {[['', t('Tous')], ['ENGINEERING', 'Engineering'], ['SALES', 'Sales']].map(([v, l]) => (
              <button key={v} onClick={() => set('fonction', v)} style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 11px', border: 'none', cursor: 'pointer', background: f.fonction === v ? '#22177A' : '#fff', color: f.fonction === v ? '#E6E9AF' : '#4A4568' }}>{l}</button>
            ))}
          </div>
          <Multi label={t('Séniorité')} options={opts(SENIORITE_LABEL)} value={f.seniorite} onChange={v => set('seniorite', v)} />
          {showEng && <Multi label={t('Technos')} options={(facets?.technos ?? []).map(v => ({ v, l: v }))} value={f.technos} onChange={v => set('technos', v)} searchable />}
          {showSales && <Multi label={t('Type de clients')} options={opts(SEGMENT_LABEL)} value={f.segments} onChange={v => set('segments', v)} />}
          {showSales && <Multi label={t('Secteurs')} options={(facets?.secteurs ?? []).map(v => ({ v, l: v }))} value={f.secteurs} onChange={v => set('secteurs', v)} searchable />}
          {showSales && <Multi label={t('Motion')} options={opts(MOTION_LABEL)} value={f.motion} onChange={v => set('motion', v)} />}
          {showSales && <input value={f.cycle_de_vente} onChange={e => set('cycle_de_vente', e.target.value)} placeholder={t('Cycle de vente')} style={{ ...field, width: 130 }} />}
          <Multi label={t('Marché')} options={opts(MARCHE_LABEL)} value={f.marche} onChange={v => set('marche', v)} />
          <select value={f.pays} onChange={e => set('pays', e.target.value)} style={field}>
            <option value="">{t('Pays')}</option>
            {(facets?.pays ?? []).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <Multi label={t('Remote')} options={opts(REMOTE_LABEL)} value={f.remote} onChange={v => set('remote', v)} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#6E6A85' }}>
            {t('Analysé du')}<input type="date" value={f.date_from} onChange={e => set('date_from', e.target.value)} style={field} />
            {t('au')}<input type="date" value={f.date_to} onChange={e => set('date_to', e.target.value)} style={field} />
          </span>
          <select value={f.company_id} onChange={e => set('company_id', e.target.value)} style={{ ...field, maxWidth: 200 }}>
            <option value="">{t('Société')}</option>
            {(facets?.companies ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={f.mandat_lie_id} onChange={e => set('mandat_lie_id', e.target.value)} style={{ ...field, maxWidth: 200 }}>
            <option value="">{t('Mandat lié')}</option>
            {(facets?.mandats ?? []).map(m => <option key={m.id} value={m.id}>{m.titre}</option>)}
          </select>
          {actifs > 0 && <button onClick={() => { setF(EMPTY); setQInput(''); setPage(1); }} style={{ ...pill, border: 'none', color: '#8A8699' }}><X size={13} />{t('Réinitialiser')}</button>}
        </div>
      </div>

      <div style={{ fontSize: 13, color: '#6E6A85', marginBottom: 10, opacity: isFetching ? 0.6 : 1 }}>
        {meta ? t(meta.total > 1 ? '{n} profils' : '{n} profil', { n: meta.total }) : ''}
      </div>

      {/* Tableau */}
      <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.09)', borderRadius: 15, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 900 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#8A8699', fontSize: 12 }}>
              {['', t('Société'), t('Profil'), t('Fonction'), t('Séniorité'), t('Points clés'), t('Lieu'), t('Analysé le')].map((h, i) => <th key={i} style={{ fontWeight: 700, padding: '11px 12px', borderBottom: '1px solid rgba(34,23,122,.08)' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} style={{ padding: 24, color: '#8A8699' }}>{t('Chargement…')}</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={8} style={{ padding: 28, textAlign: 'center', color: '#8A8699' }}>{actifs ? t('Aucun profil ne correspond à ces filtres.') : t("Aucun profil recherché pour l'instant.")}</td></tr>}
            {rows.map(p => {
              const isOpen = open === p.id;
              const keys = p.fonction === 'ENGINEERING'
                ? (p.technos ?? []).slice(0, 5)
                : [...(p.type_clients?.segments ?? []).map(s => SEGMENT_LABEL[s]), ...(p.motion ?? []).map(m => MOTION_LABEL[m]), ...(p.cycle_de_vente ? [p.cycle_de_vente] : [])].slice(0, 5);
              return (
                <FragmentRow key={p.id}>
                  <tr onClick={() => setOpen(isOpen ? null : p.id)} style={{ cursor: 'pointer', borderTop: '1px solid rgba(34,23,122,.06)', background: isOpen ? '#FBFBF3' : undefined }}>
                    <td style={{ padding: '10px 6px 10px 12px', width: 22 }}><ChevronRight size={14} color="#9A96AE" style={{ transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }} /></td>
                    <td style={{ padding: '10px 12px' }}>
                      <a onClick={ev => { ev.stopPropagation(); navigate(`/entreprises/${p.company.id}?onglet=profils`); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontWeight: 800, color: '#1A1533', cursor: 'pointer' }}>
                        <CompanyLogo nom={p.company.name} domaine={p.company.domaine} siteWeb={p.company.siteWeb} logoUrl={p.company.logoUrl} size={26} height={26} radius={7} />
                        {p.company.name}
                      </a>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1A1533' }}>{p.intitule_type}</td>
                    <td style={{ padding: '10px 12px' }}><Chip tone={p.fonction === 'SALES' ? 'soft' : 'neutral'}>{FONCTION_LABEL[p.fonction]}</Chip></td>
                    <td style={{ padding: '10px 12px', color: '#4A4568' }}>{p.seniorite ? SENIORITE_LABEL[p.seniorite] : ''}</td>
                    <td style={{ padding: '10px 12px' }}><div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{keys.map(k => <Chip key={k}>{k}</Chip>)}</div></td>
                    <td style={{ padding: '10px 12px', color: '#4A4568' }}>{fmtLieu(p.localisation)}</td>
                    <td style={{ padding: '10px 12px', color: '#6E6A85', whiteSpace: 'nowrap' }}>{fmtDate(p.date_analyse)}</td>
                  </tr>
                  {isOpen && <tr><td colSpan={8} style={{ padding: '4px 14px 16px', background: '#FBFBF3' }}><ProfilCard p={p} /></td></tr>}
                </FragmentRow>
              );
            })}
          </tbody>
        </table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 13, color: '#4A4568' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ ...pill, opacity: page <= 1 ? 0.4 : 1 }}>{t('Précédent')}</button>
          {t('Page {p} sur {n}', { p: meta.page, n: meta.totalPages })}
          <button disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)} style={{ ...pill, opacity: page >= meta.totalPages ? 0.4 : 1 }}>{t('Suivant')}</button>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) { return <>{children}</>; }
