import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, ChevronDown, X, Users } from 'lucide-react';
import { usePageTitle } from '../../hooks/usePageTitle';
import { api } from '../../lib/api-client';
import CompanyLogo from '../../components/entreprises/CompanyLogo';

// ─── TYPES ──────────────────────────────────────────
interface Entreprise {
  id: string;
  nom: string;
  secteur: string | null;
  siteWeb: string | null;
  taille: string | null;
  localisation: string | null;
  logoUrl: string | null;
  effectif: string | null;
  pappersEnriched: boolean;
  _count?: { clients: number; mandats: number };
  mandatsActifs: number;
  mandatsHistoriques: number;
  dernierMandat: string | null;
}
interface PaginatedResponse { data: Entreprise[]; meta: { total: number; page: number; perPage: number; totalPages: number } }

// ─── META ───────────────────────────────────────────
const REL_META: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  client: { label: 'Client', bg: '#EAF3EC', fg: '#2C6B3F', dot: '#3B9A54' },
  prospect: { label: 'Prospect', bg: '#EDEAF9', fg: '#5B4B9E', dot: '#8E7CC3' },
  cible: { label: 'Cible', bg: '#F2F3D8', fg: '#22177A', dot: '#C9A227' },
  dormant: { label: 'Dormant', bg: '#F7DEDB', fg: '#B3261E', dot: '#B3261E' },
};
const REL_OPTIONS = Object.entries(REL_META).map(([value, m]) => ({ value, label: m.label }));

const GRID = 'minmax(210px,1.7fr) minmax(120px,1fr) minmax(96px,.8fr) minmax(110px,.8fr) minmax(84px,.72fr) minmax(112px,.8fr) minmax(118px,.85fr)';

// ─── HELPERS ────────────────────────────────────────
function mono(name: string) { return name.split(/\s+/).map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase(); }
function relationOf(e: Entreprise): string {
  if (e.mandatsActifs > 0) return 'client';
  if (e.mandatsHistoriques > 0) return 'dormant';
  if ((e._count?.clients ?? 0) > 0) return 'prospect';
  return 'cible';
}
function lastContact(iso: string | null): { txt: string; late: boolean } {
  if (!iso) return { txt: 'jamais', late: false };
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const late = d > 30;
  if (d <= 0) return { txt: "aujourd'hui", late: false };
  if (d === 1) return { txt: 'hier', late: false };
  if (d < 30) return { txt: `il y a ${d} j`, late };
  if (d < 60) return { txt: `il y a ${Math.floor(d / 7)} sem.`, late };
  return { txt: `il y a ${Math.floor(d / 30)} mois`, late: true };
}

// ─── CHIP DROPDOWN ──────────────────────────────────
function ChipDropdown({ label, options, value, open, onToggle, onChange }: {
  label: string; options: { value: string; label: string }[]; value: string[] | undefined;
  open: boolean; onToggle: () => void; onChange: (v: string[]) => void;
}) {
  const sel = value ?? [];
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={onToggle} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: sel.length ? '#22177A' : '#4A4568', background: sel.length ? '#F2F3D8' : '#fff', border: `1px solid ${sel.length ? 'rgba(34,23,122,0.24)' : 'rgba(34,23,122,0.14)'}`, borderRadius: 10, padding: '9px 13px', cursor: 'pointer' }}>
        {label}{sel.length > 0 && <span style={{ fontWeight: 800, fontSize: 11 }}>{sel.length}</span>}<ChevronDown size={13} color="#8A8699" strokeWidth={2.4} />
      </button>
      {open && (
        <>
          <div onClick={onToggle} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 41, minWidth: 190, maxHeight: 280, overflowY: 'auto', background: '#fff', border: '1px solid rgba(34,23,122,0.12)', borderRadius: 12, boxShadow: '0 20px 44px -20px rgba(34,23,122,0.4)', padding: 6 }}>
            {options.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12.5, color: '#9A96AE' }}>Aucune option</div>}
            {options.map(o => {
              const checked = sel.includes(o.value);
              return (
                <button key={o.value} onClick={() => onChange(checked ? sel.filter(x => x !== o.value) : [...sel, o.value])} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, border: 'none', background: checked ? '#F2F3D8' : 'transparent', color: '#1A1533', fontSize: 13, fontWeight: checked ? 700 : 500, cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${checked ? '#22177A' : 'rgba(34,23,122,0.3)'}`, background: checked ? '#22177A' : '#fff', flexShrink: 0 }} />{o.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════
export default function EntreprisesPage() {
  usePageTitle('Entreprises');
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debSearch, setDebSearch] = useState('');
  const [openChip, setOpenChip] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [relSel, setRelSel] = useState<string[]>([]);
  const [pappersOnly, setPappersOnly] = useState(false);

  useEffect(() => { const t = setTimeout(() => { setDebSearch(search); setPage(1); }, 350); return () => clearTimeout(t); }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['entreprises', page, debSearch, filters, pappersOnly],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set('page', String(page)); p.set('perPage', '20');
      if (debSearch) p.set('search', debSearch);
      if (filters.secteur?.length) p.set('secteur', filters.secteur.join(','));
      if (filters.city?.length) p.set('localisation', filters.city.join(','));
      if (pappersOnly) p.set('enriched', 'true');
      return api.get<PaginatedResponse>(`/entreprises?${p.toString()}`);
    },
  });

  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;
  let rows = data?.data ?? [];
  if (relSel.length) rows = rows.filter(e => relSel.includes(relationOf(e)));

  const secteurOptions = useMemo(() => {
    const s = new Set<string>(); (data?.data ?? []).forEach(e => { if (e.secteur) s.add(e.secteur); });
    return Array.from(s).sort().map(v => ({ value: v, label: v }));
  }, [data?.data]);
  const cityOptions = useMemo(() => {
    const s = new Set<string>(); (data?.data ?? []).forEach(e => { if (e.localisation) s.add(e.localisation); });
    return Array.from(s).sort().map(v => ({ value: v, label: v }));
  }, [data?.data]);

  const setFilter = (key: string, v: string[]) => { setFilters(prev => { const n = { ...prev }; if (!v.length) delete n[key]; else n[key] = v; return n; }); setPage(1); };

  const activeChips: { label: string; onRemove: () => void; key: string }[] = [];
  for (const [k, arr] of Object.entries(filters)) arr.forEach(v => {
    const opt = (k === 'secteur' ? secteurOptions : cityOptions).find(o => o.value === v);
    activeChips.push({ key: k + v, label: opt?.label ?? v, onRemove: () => setFilter(k, (filters[k] ?? []).filter(x => x !== v)) });
  });
  relSel.forEach(v => activeChips.push({ key: 'rel' + v, label: REL_META[v]?.label ?? v, onRemove: () => setRelSel(s => s.filter(x => x !== v)) }));
  if (pappersOnly) activeChips.push({ key: 'pappers', label: 'Pappers', onRemove: () => setPappersOnly(false) });

  return (
    <div>
      <style>{`
        .crow{ position:relative; transition:background .16s ease, padding-left .2s cubic-bezier(.16,1,.3,1); }
        .crow::before{ content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:#22177A; transform:scaleY(0); transition:transform .22s cubic-bezier(.16,1,.3,1); }
        .crow:hover{ background:#FBFBF3; padding-left:26px; }
        .crow:hover::before{ transform:scaleY(1); }
        .chip:hover{ border-color:rgba(34,23,122,0.3) !important; transform:translateY(-1px); }
        .chip{ transition:border-color .16s ease, transform .15s ease; }
        .kw:hover{ background:#E6E9AF !important; }
      `}</style>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, color: '#9A96AE', fontWeight: 600 }}>CRM</div>
          <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 38, letterSpacing: '-0.035em', color: '#1A1533', marginTop: 4 }}>Entreprises</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,0.12)', borderRadius: 999, padding: '8px 15px' }}>{total.toLocaleString('fr-FR')} entreprises</span>
          <button onClick={() => navigate('/entreprises/new')} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontWeight: 700, fontSize: 14, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 12, padding: '12px 20px', cursor: 'pointer', boxShadow: '0 10px 22px -14px rgba(34,23,122,0.7)' }}><Plus size={16} strokeWidth={2.4} />Ajouter</button>
        </div>
      </div>

      {/* FILTERS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 22 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 340 }}>
          <Search size={15} color="#9A96AE" strokeWidth={2.2} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher une entreprise…" style={{ width: '100%', fontSize: 13.5, padding: '10px 12px 10px 36px', borderRadius: 11, border: '1px solid rgba(34,23,122,0.14)', background: '#fff', outline: 'none' }} />
        </div>
        <ChipDropdown label="Relation" options={REL_OPTIONS} value={relSel} open={openChip === 'rel'} onToggle={() => setOpenChip(openChip === 'rel' ? null : 'rel')} onChange={setRelSel} />
        <ChipDropdown label="Secteur" options={secteurOptions} value={filters.secteur} open={openChip === 'secteur'} onToggle={() => setOpenChip(openChip === 'secteur' ? null : 'secteur')} onChange={v => setFilter('secteur', v)} />
        <ChipDropdown label="Ville" options={cityOptions} value={filters.city} open={openChip === 'city'} onToggle={() => setOpenChip(openChip === 'city' ? null : 'city')} onChange={v => setFilter('city', v)} />
        <button onClick={() => { setPappersOnly(p => !p); setPage(1); }} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#22177A', background: pappersOnly ? '#F0EFC4' : '#fff', border: `1px solid ${pappersOnly ? 'transparent' : 'rgba(34,23,122,0.14)'}`, borderRadius: 10, padding: '9px 13px', cursor: 'pointer' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22177A' }} />Pappers</button>
      </div>

      {/* ACTIVE CHIPS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 11 }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE' }}>Filtres</span>
        {activeChips.length === 0 && <span style={{ fontSize: 12, color: '#C4C1D0' }}>aucun</span>}
        {activeChips.map(ch => <span key={ch.key} className="kw" onClick={ch.onRemove} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: '#22177A', background: '#F2F3D8', border: '1px solid rgba(34,23,122,0.14)', borderRadius: 999, padding: '5px 11px', cursor: 'pointer' }}>{ch.label}<X size={11} strokeWidth={2.8} /></span>)}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8A8699' }}>{rows.length} affichés · {total.toLocaleString('fr-FR')} au total</span>
      </div>

      {/* TABLE */}
      <div style={{ marginTop: 18, background: '#fff', border: '1px solid rgba(34,23,122,0.08)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 2px rgba(34,23,122,0.04)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14, padding: '14px 22px', background: '#F7F7EE', borderBottom: '1px solid rgba(34,23,122,0.08)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#8A8699' }}>
          <span>Entreprise</span><span>Secteur</span><span>Ville</span><span>Contacts</span><span style={{ textAlign: 'center' }}>Mandats</span><span>Relation</span><span style={{ textAlign: 'right' }}>Dernier contact</span>
        </div>
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ height: 65, borderBottom: '1px solid rgba(34,23,122,0.05)', background: i % 2 ? '#fff' : '#FCFCF5' }} />)
        ) : rows.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#8A8699' }}>Aucune entreprise ne correspond aux filtres.</div>
        ) : rows.map(e => {
          const rel = REL_META[relationOf(e)];
          const contacts = e._count?.clients ?? 0;
          const mandats = e._count?.mandats ?? 0;
          const stale = e.mandatsActifs === 0 && e.mandatsHistoriques > 0;
          const last = lastContact(e.dernierMandat);
          return (
            <div key={e.id} className="crow" onClick={() => navigate(`/entreprises/${e.id}`)} style={{ cursor: 'pointer', display: 'grid', gridTemplateColumns: GRID, gap: 14, alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid rgba(34,23,122,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <CompanyLogo nom={e.nom} domaine={(e as any).domaine} siteWeb={e.siteWeb} logoUrl={e.logoUrl} size={36} height={28} />
                {false && <span>{mono(e.nom)}</span>}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.nom}</div>
                  <div style={{ fontSize: 11.5, color: '#8A8699', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.effectif || e.taille || '—'}</div>
                </div>
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#4A4568', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.secteur || '—'}</span>
              <span style={{ fontSize: 13, color: '#8A8699', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.localisation || '—'}</span>
              <span>
                {contacts > 0
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#22177A', background: 'rgba(34,23,122,.06)', borderRadius: 999, padding: '4px 11px' }}><Users size={12} />{contacts}</span>
                  : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#8A8699', border: '1px dashed rgba(34,23,122,.22)', borderRadius: 999, padding: '4px 10px' }}><Plus size={11} strokeWidth={2.6} />Ajouter</span>}
              </span>
              <span style={{ textAlign: 'center' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 14, color: mandats > 0 ? '#1A1533' : '#C4C1D0' }}>{mandats}</span>{stale && <span title="Mandat dormant" style={{ width: 7, height: 7, borderRadius: '50%', background: '#B3261E' }} />}</span></span>
              <span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: '4px 11px', background: rel.bg, color: rel.fg, whiteSpace: 'nowrap' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: rel.dot }} />{rel.label}</span></span>
              <span style={{ textAlign: 'right', fontSize: 12.5, color: last.late ? '#B3261E' : '#8A8699', whiteSpace: 'nowrap' }}>{last.txt}</span>
            </div>
          );
        })}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', fontSize: 13, color: '#8A8699' }}>
            <span>Page {page} / {totalPages} · {total.toLocaleString('fr-FR')} entreprises</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(34,23,122,0.14)', background: '#fff', color: page <= 1 ? '#C4C1D0' : '#22177A', cursor: page <= 1 ? 'default' : 'pointer' }}>‹</button>
              <span style={{ minWidth: 32, height: 32, borderRadius: 9, background: '#22177A', color: '#E6E9AF', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{page}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid rgba(34,23,122,0.14)', background: '#fff', color: page >= totalPages ? '#C4C1D0' : '#22177A', cursor: page >= totalPages ? 'default' : 'pointer' }}>›</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
