import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Plus, Search, LayoutGrid, List, ChevronDown, ChevronRight, X,
  Phone, Mail, Building2, MapPin, Eye, MoreVertical, FileText, Banknote, Maximize2,
} from 'lucide-react';
import { usePageTitle } from '../../hooks/usePageTitle';
import { api } from '../../lib/api-client';

// ─── TYPES ──────────────────────────────────────────
interface Position { stage: string; mandatId: string; mandatTitre: string; entrepriseNom: string | null }
interface Candidat {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  photoUrl: string | null;
  cvUrl: string | null;
  posteActuel: string | null;
  entrepriseActuelle: string | null;
  localisation: string | null;
  salaireSouhaite: number | null;
  disponibilite: string | null;
  source: string | null;
  tags: string[];
  aPlayer: boolean;
  position: Position | null;
  positionsCount: number;
  lastActivityAt: string | null;
}
interface PaginatedResponse {
  data: Candidat[];
  meta: { total: number; page: number; perPage: number; totalPages: number };
}

// ─── STAGE META ─────────────────────────────────────
const STAGE_META: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  SOURCING: { label: 'Sourcing', bg: 'rgba(34,23,122,.07)', fg: '#22177A', dot: '#8E7CC3' },
  CONTACTE: { label: 'Contacté', bg: 'rgba(34,23,122,.07)', fg: '#22177A', dot: '#8E7CC3' },
  ENTRETIEN_1: { label: 'Entr. 1', bg: 'rgba(34,23,122,.09)', fg: '#22177A', dot: '#22177A' },
  ENVOYE_CLIENT: { label: 'Envoyé', bg: '#E8EEF9', fg: '#2A4A8A', dot: '#2A6BD8' },
  ENTRETIEN_CLIENT: { label: 'Entr. client', bg: '#FBF3E7', fg: '#8A6A2E', dot: '#E08A2B' },
  OFFRE: { label: 'Offre', bg: '#F0EFC4', fg: '#8A6A2E', dot: '#C9A227' },
  PLACE: { label: 'Placé', bg: '#EAF3EC', fg: '#2C6B3F', dot: '#3B9A54' },
};
const VIVIER = { label: 'Vivier', fg: '#8A8699', dot: '#C4C1D0' };

const SOURCE_OPTIONS = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'candidature', label: 'Candidature' },
  { value: 'cooptation', label: 'Cooptation' },
  { value: 'list-push', label: 'List Push' },
  { value: 'sdr_import', label: 'SDR Import' },
  { value: 'autre', label: 'Autre' },
];
const STAGE_OPTIONS = Object.entries(STAGE_META).map(([value, m]) => ({ value, label: m.label }));
const DISPO_OPTIONS = ['Immédiate', '1 mois', '3 mois', 'En poste', 'Signé'].map(v => ({ value: v, label: v }));

// ─── HELPERS ────────────────────────────────────────
function fullName(c: Candidat) { return `${c.prenom ? c.prenom + ' ' : ''}${c.nom}`.trim(); }
function initials(c: Candidat) {
  return `${(c.prenom?.[0] ?? '')}${c.nom?.[0] ?? ''}`.toUpperCase() || '?';
}
function salaryTxt(v: number | null) { return v ? `${Math.round(v / 1000)}k€` : '—'; }
function dispoColor(d: string | null) { return d && /imm[ée]diate/i.test(d) ? '#2C6B3F' : '#4A4568'; }
function activity(lastAt: string | null): { txt: string; stale: boolean } {
  if (!lastAt) return { txt: '—', stale: false };
  const days = Math.floor((Date.now() - new Date(lastAt).getTime()) / 86400000);
  const txt = days <= 0 ? "aujourd'hui" : days === 1 ? 'hier' : `il y a ${days} j`;
  return { txt, stale: days > 10 };
}
const AV_PALETTE: Array<[string, string]> = [['#22177A', '#E6E9AF'], ['#3B9A54', '#fff'], ['#8E7CC3', '#fff'], ['#2A6BD8', '#fff'], ['#E05A9C', '#fff']];
function avColor(name: string): [string, string] {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AV_PALETTE[Math.abs(h) % AV_PALETTE.length];
}

const GRID = 'auto auto minmax(0,1.3fr) minmax(0,1fr) minmax(0,0.9fr) minmax(0,0.75fr) minmax(0,0.7fr) minmax(0,1.05fr) auto';

// ─── PHOTO ──────────────────────────────────────────
function Photo({ c, size = 46 }: { c: Candidat; size?: number }) {
  const [bg, fg] = avColor(fullName(c));
  return (
    <span style={{ position: 'relative', width: size, height: size, flexShrink: 0, display: 'inline-block' }}>
      {c.photoUrl ? (
        <img src={c.photoUrl} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', background: '#F2F3D8' }} />
      ) : (
        <span style={{ width: size, height: size, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: size * 0.36 }}>{initials(c)}</span>
      )}
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: 'inset 0 0 0 1.5px rgba(34,23,122,0.12)' }} />
      {c.aPlayer && (
        <span className="cstar" title="A player" style={{ position: 'absolute', bottom: -2, right: -3, width: size * 0.39, height: size * 0.39, borderRadius: '50%', background: '#E6E9AF', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.2, color: '#22177A' }}>★</span>
      )}
    </span>
  );
}

// ─── CHIP DROPDOWN ──────────────────────────────────
function ChipDropdown({ label, options, value, multi, open, onToggle, onChange }: {
  label: string;
  options: { value: string; label: string }[];
  value: string[] | string | undefined;
  multi?: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (v: string[] | string | undefined) => void;
}) {
  const selCount = Array.isArray(value) ? value.length : value ? 1 : 0;
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={onToggle} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: selCount ? '#22177A' : '#4A4568', background: selCount ? '#F2F3D8' : '#fff', border: `1px solid ${selCount ? 'rgba(34,23,122,0.24)' : 'rgba(34,23,122,0.14)'}`, borderRadius: 10, padding: '9px 13px', cursor: 'pointer' }}>
        {label}{selCount > 0 && <span style={{ fontFamily: "'Manrope'", fontWeight: 800, fontSize: 11 }}>{selCount}</span>}
        <ChevronDown size={13} color="#8A8699" strokeWidth={2.4} />
      </button>
      {open && (
        <>
          <div onClick={onToggle} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 41, minWidth: 200, maxHeight: 280, overflowY: 'auto', background: '#fff', border: '1px solid rgba(34,23,122,0.12)', borderRadius: 12, boxShadow: '0 20px 44px -20px rgba(34,23,122,0.4)', padding: 6 }}>
            {options.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12.5, color: '#9A96AE' }}>Aucune option</div>}
            {options.map(o => {
              const checked = Array.isArray(value) ? value.includes(o.value) : value === o.value;
              return (
                <button key={o.value} onClick={() => {
                  if (multi) {
                    const cur = Array.isArray(value) ? value : [];
                    onChange(checked ? cur.filter(x => x !== o.value) : [...cur, o.value]);
                  } else {
                    onChange(checked ? undefined : o.value);
                    onToggle();
                  }
                }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 8, border: 'none', background: checked ? '#F2F3D8' : 'transparent', color: '#1A1533', fontSize: 13, fontWeight: checked ? 700 : 500, cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ width: 15, height: 15, borderRadius: multi ? 4 : '50%', border: `1.5px solid ${checked ? '#22177A' : 'rgba(34,23,122,0.3)'}`, background: checked ? '#22177A' : '#fff', flexShrink: 0 }} />
                  {o.label}
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
export default function CandidatsPage() {
  usePageTitle('Candidats');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [poste, setPoste] = useState('');
  const [view, setView] = useState<'grid' | 'table'>('table');
  const [openChip, setOpenChip] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string[] | string | undefined>>({});

  // Debounce keyword search
  const [debSearch, setDebSearch] = useState(search);
  useEffect(() => { const t = setTimeout(() => { setDebSearch(search); setPage(1); }, 350); return () => clearTimeout(t); }, [search]);
  const [debPoste, setDebPoste] = useState('');
  useEffect(() => { const t = setTimeout(() => { setDebPoste(poste); setPage(1); }, 350); return () => clearTimeout(t); }, [poste]);

  const { data, isLoading } = useQuery({
    queryKey: ['candidats', page, debSearch, debPoste, filters],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set('page', String(page));
      p.set('perPage', '20');
      if (debSearch) p.set('search', debSearch);
      if (debPoste) p.set('poste', debPoste);
      const city = filters.city as string[] | undefined;
      const source = filters.source as string[] | undefined;
      const stage = filters.stage as string[] | undefined;
      if (city?.length) p.set('localisation', city.join(','));
      if (source?.length) p.set('source', source.join(','));
      if (stage?.length) p.set('stage', stage.join(','));
      if (filters.assigned_to) p.set('assignedToId', filters.assigned_to as string);
      if (filters.disponibilite) p.set('disponibilite', filters.disponibilite as string);
      return api.get<PaginatedResponse>(`/candidats?${p.toString()}`);
    },
  });

  const { data: teamUsers } = useQuery({
    queryKey: ['settings', 'team'],
    queryFn: () => api.get<{ id: string; nom: string; prenom: string | null }[]>('/settings/team'),
    staleTime: 5 * 60 * 1000,
  });
  const userOptions = useMemo(() => (teamUsers || []).map(u => ({ value: u.id, label: `${u.prenom || ''} ${u.nom}`.trim() })), [teamUsers]);

  const cityOptions = useMemo(() => {
    const s = new Set<string>();
    (data?.data ?? []).forEach(c => { if (c.localisation) s.add(c.localisation); });
    return Array.from(s).sort().map(v => ({ value: v, label: v }));
  }, [data?.data]);

  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;
  let rows = data?.data ?? [];
  if (filters.mandat === 'vivier') rows = rows.filter(c => !c.position);

  const setFilter = (key: string, v: string[] | string | undefined) => {
    setFilters(prev => { const n = { ...prev }; if (v === undefined || (Array.isArray(v) && !v.length)) delete n[key]; else n[key] = v; return n; });
    setPage(1);
  };

  // Active keyword pills (from multi filters)
  const activeKeywords: { key: string; value: string; label: string }[] = [];
  for (const [k, arr] of Object.entries(filters)) {
    if (Array.isArray(arr)) arr.forEach(v => {
      const opt = (k === 'source' ? SOURCE_OPTIONS : k === 'stage' ? STAGE_OPTIONS : cityOptions).find(o => o.value === v);
      activeKeywords.push({ key: k, value: v, label: opt?.label ?? v });
    });
  }

  const sel = selId ? rows.find(c => c.id === selId) ?? null : null;
  useEffect(() => {
    if (search) setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('q', search); return n; }, { replace: true });
  }, [search, setSearchParams]);

  return (
    <div>
      <style>{`
        @keyframes atsPop2{ from{ transform:scale(.4); opacity:0; } to{ transform:scale(1); opacity:1; } }
        @keyframes drwIn{ from{ transform:translateX(100%); } to{ transform:none; } }
        @keyframes fadeIn{ from{ opacity:0; } to{ opacity:1; } }
        .crow{ position:relative; transition:background .16s ease, padding-left .2s cubic-bezier(.16,1,.3,1); }
        .crow::before{ content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:#22177A; transform:scaleY(0); transition:transform .22s cubic-bezier(.16,1,.3,1); }
        .crow:hover{ background:#FBFBF3; padding-left:24px; }
        .crow:hover::before{ transform:scaleY(1); }
        .crow:hover img,.crow:hover .cavatar{ transform:scale(1.06); }
        .crow img,.crow .cavatar{ transition:transform .26s cubic-bezier(.16,1,.3,1); }
        .crow:hover .cname{ color:#22177A; }
        .cname{ transition:color .16s ease; }
        .crow:hover .cact{ opacity:1; }
        .crow:hover .carr{ transform:translateX(3px); stroke:#22177A; }
        .cact{ opacity:0; transition:opacity .18s ease; }
        .cstar{ animation:atsPop2 .5s cubic-bezier(.16,1,.3,1) both; animation-delay:.4s; }
        .cact button:hover{ background:#22177A !important; }
        .cact button:hover svg{ stroke:#E6E9AF; }
        .chip:hover{ border-color:rgba(34,23,122,0.3) !important; transform:translateY(-1px); }
        .chip{ transition:border-color .16s ease, transform .15s ease; }
        .kw:hover{ background:#E6E9AF !important; }
        .cvcard:hover{ border-color:rgba(34,23,122,.3) !important; background:#F2F3D8 !important; }
        .cvcard{ transition:border-color .18s ease, background .18s ease; }
        .drw{ animation:drwIn .42s cubic-bezier(.16,1,.3,1) both; }
        .drwbg{ animation:fadeIn .3s ease both; }
        .cgcard:hover{ transform:translateY(-3px); box-shadow:0 24px 44px -30px rgba(34,23,122,.45); border-color:rgba(34,23,122,.18); }
        .cgcard{ transition:transform .22s cubic-bezier(.16,1,.3,1), box-shadow .22s ease, border-color .22s ease; }
      `}</style>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, color: '#9A96AE', fontWeight: 600 }}>CRM</div>
          <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 38, letterSpacing: '-0.035em', color: '#1A1533', marginTop: 4 }}>Candidats</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,0.12)', borderRadius: 999, padding: '8px 15px' }}>{total.toLocaleString('fr-FR')} candidats</span>
          <div style={{ display: 'flex', background: '#fff', border: '1px solid rgba(34,23,122,0.14)', borderRadius: 11, overflow: 'hidden' }}>
            <button onClick={() => setView('grid')} style={{ width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: view === 'grid' ? '#22177A' : '#fff', border: 'none', cursor: 'pointer' }}><LayoutGrid size={16} color={view === 'grid' ? '#E6E9AF' : '#8A8699'} /></button>
            <button onClick={() => setView('table')} style={{ width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: view === 'table' ? '#22177A' : '#fff', border: 'none', cursor: 'pointer' }}><List size={16} color={view === 'table' ? '#E6E9AF' : '#8A8699'} /></button>
          </div>
          <button onClick={() => navigate('/candidats/new')} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontWeight: 700, fontSize: 14, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 12, padding: '12px 20px', cursor: 'pointer', boxShadow: '0 10px 22px -14px rgba(34,23,122,0.7)' }}><Plus size={16} strokeWidth={2.4} />Ajouter</button>
        </div>
      </div>

      {/* FILTERS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 22 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={15} color="#9A96AE" strokeWidth={2.2} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Mots-clés : compétence, stack, école, entreprise…" style={{ width: '100%', fontSize: 13.5, padding: '10px 12px 10px 36px', borderRadius: 11, border: '1px solid rgba(34,23,122,0.14)', background: '#FCFCF5', outline: 'none' }} />
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <List size={15} color="#9A96AE" strokeWidth={2.2} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={poste} onChange={e => setPoste(e.target.value)} placeholder="Filtrer par poste…" style={{ width: '100%', fontSize: 13.5, padding: '10px 12px 10px 36px', borderRadius: 11, border: '1px solid rgba(34,23,122,0.14)', background: '#fff', outline: 'none' }} />
        </div>
        <ChipDropdown label="Ville" multi options={cityOptions} value={filters.city} open={openChip === 'city'} onToggle={() => setOpenChip(openChip === 'city' ? null : 'city')} onChange={v => setFilter('city', v)} />
        <ChipDropdown label="Source" multi options={SOURCE_OPTIONS} value={filters.source} open={openChip === 'source'} onToggle={() => setOpenChip(openChip === 'source' ? null : 'source')} onChange={v => setFilter('source', v)} />
        <ChipDropdown label="Étape" multi options={STAGE_OPTIONS} value={filters.stage} open={openChip === 'stage'} onToggle={() => setOpenChip(openChip === 'stage' ? null : 'stage')} onChange={v => setFilter('stage', v)} />
        <ChipDropdown label="Mandat" options={[{ value: 'vivier', label: 'Vivier (aucun)' }]} value={filters.mandat} open={openChip === 'mandat'} onToggle={() => setOpenChip(openChip === 'mandat' ? null : 'mandat')} onChange={v => setFilter('mandat', v)} />
        <ChipDropdown label="Assigné à" options={userOptions} value={filters.assigned_to} open={openChip === 'assigned_to'} onToggle={() => setOpenChip(openChip === 'assigned_to' ? null : 'assigned_to')} onChange={v => setFilter('assigned_to', v)} />
        <ChipDropdown label="Disponibilité" options={DISPO_OPTIONS} value={filters.disponibilite} open={openChip === 'disponibilite'} onToggle={() => setOpenChip(openChip === 'disponibilite' ? null : 'disponibilite')} onChange={v => setFilter('disponibilite', v)} />
      </div>

      {/* ACTIVE KEYWORDS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 11 }}>
        <span style={{ fontFamily: "'Manrope'", fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE' }}>Filtres</span>
        {activeKeywords.length === 0 && <span style={{ fontSize: 12, color: '#C4C1D0' }}>aucun</span>}
        {activeKeywords.map(kw => (
          <span key={kw.key + kw.value} className="kw" onClick={() => { const cur = (filters[kw.key] as string[]) ?? []; setFilter(kw.key, cur.filter(x => x !== kw.value)); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: '#22177A', background: '#F2F3D8', border: '1px solid rgba(34,23,122,0.14)', borderRadius: 999, padding: '5px 11px', cursor: 'pointer' }}>{kw.label}<X size={11} strokeWidth={2.8} /></span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8A8699' }}>{rows.length} affichés · {total.toLocaleString('fr-FR')} au total</span>
      </div>

      {/* TABLE VIEW */}
      {view === 'table' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 13, alignItems: 'center', padding: '10px 20px 9px', marginTop: 18, borderBottom: '1.5px solid rgba(34,23,122,0.12)' }}>
            <span style={{ width: 19 }} /><span style={{ width: 46 }} />
            {['Candidat', 'Étape · mandat', 'Société actuelle', 'Dispo · Ville', 'Prét. · Activité', 'Contact'].map(h => (
              <span key={h} style={{ fontFamily: "'Manrope'", fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE' }}>{h}</span>
            ))}
            <span />
          </div>

          <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 2px rgba(34,23,122,.04), 0 24px 50px -42px rgba(34,23,122,.5)' }}>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ height: 69, borderBottom: '1px solid rgba(34,23,122,0.05)', background: i % 2 ? '#fff' : '#FCFCF5' }} />)
            ) : rows.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: '#8A8699' }}>Aucun candidat ne correspond aux filtres.</div>
            ) : rows.map(c => {
              const st = c.position ? STAGE_META[c.position.stage] : null;
              const act = activity(c.lastActivityAt);
              return (
                <div key={c.id} className="crow" onClick={(e) => { if ((e.target as HTMLElement).closest('button')) return; setSelId(c.id); }} style={{ cursor: 'pointer', display: 'grid', gridTemplateColumns: GRID, gap: 13, alignItems: 'center', background: '#fff', borderBottom: '1px solid rgba(34,23,122,0.07)', padding: '11px 20px' }}>
                  <span onClick={(e) => e.stopPropagation()} style={{ width: 19, height: 19, borderRadius: 6, border: '1.5px solid rgba(34,23,122,0.22)', cursor: 'pointer' }} />
                  <Photo c={c} />
                  <div style={{ minWidth: 0 }}>
                    <div className="cname" style={{ fontSize: 15, fontWeight: 800, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(c)}</div>
                    <div style={{ fontSize: 12.5, color: '#22177A', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.posteActuel || '—'}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    {st ? (
                      <>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '3.5px 10px', background: st.bg, color: st.fg }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: st.dot }} />{st.label}</span>
                        <div style={{ fontSize: 11, color: '#9A96AE', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.position!.mandatTitre}</div>
                      </>
                    ) : (
                      <>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '3.5px 10px', background: 'transparent', color: VIVIER.fg, border: '1px dashed rgba(34,23,122,.25)' }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: VIVIER.dot }} />Vivier</span>
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/candidats/${c.id}`); }} className="cact" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, fontFamily: "'Manrope'", fontSize: 10.5, fontWeight: 800, color: '#22177A', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}><Plus size={11} strokeWidth={2.8} />Positionner</button>
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: c.entrepriseActuelle ? '#4A4568' : '#9A96AE', minWidth: 0 }}>
                    {c.entrepriseActuelle && <Building2 size={14} color="#8A8699" style={{ flexShrink: 0 }} />}
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.entrepriseActuelle || '—'}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: dispoColor(c.disponibilite) }}>{c.disponibilite || '—'}</div>
                    <div style={{ fontSize: 11.5, color: '#8A8699' }}>{c.localisation || '—'}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                    {c.salaireSouhaite ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '4px 10px', background: '#EAF3EC', color: '#2C6B3F' }}><Banknote size={11} />{salaryTxt(c.salaireSouhaite)}</span>
                    ) : <span style={{ color: '#9A96AE', fontSize: 13 }}>—</span>}
                    <span style={{ fontSize: 11, fontWeight: 600, color: act.stale ? '#B3261E' : '#9A96AE' }}>{act.txt}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#22177A', fontWeight: 600, whiteSpace: 'nowrap' }}><Phone size={12} color="#9A96AE" style={{ flexShrink: 0 }} />{c.telephone || '—'}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6E6A85', minWidth: 0 }}><Mail size={12} color="#9A96AE" style={{ flexShrink: 0 }} /><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email || '—'}</span></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="cact" style={{ display: 'flex', gap: 6 }}>
                      <button title="Voir la fiche" onClick={(e) => { e.stopPropagation(); navigate(`/candidats/${c.id}`); }} style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'rgba(34,23,122,0.06)', border: 'none', cursor: 'pointer' }}><Eye size={14} color="#22177A" /></button>
                      <button title="Plus" onClick={(e) => { e.stopPropagation(); navigate(`/candidats/${c.id}`); }} style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: 'rgba(34,23,122,0.06)', border: 'none', cursor: 'pointer' }}><MoreVertical size={14} color="#22177A" /></button>
                    </span>
                    <ChevronRight className="carr" size={16} color="#C4C1D0" strokeWidth={2.2} style={{ flexShrink: 0, transition: 'transform .2s, stroke .2s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* GRID VIEW */}
      {view === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14, marginTop: 18 }}>
          {isLoading ? Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ height: 150, borderRadius: 16, background: '#fff', border: '1px solid rgba(34,23,122,0.06)' }} />)
            : rows.map(c => {
              const st = c.position ? STAGE_META[c.position.stage] : null;
              return (
                <div key={c.id} className="cgcard" onClick={() => setSelId(c.id)} style={{ cursor: 'pointer', background: '#fff', border: '1px solid rgba(34,23,122,0.08)', borderRadius: 16, padding: 16, boxShadow: '0 1px 2px rgba(34,23,122,.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Photo c={c} size={44} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(c)}</div>
                      <div style={{ fontSize: 12, color: '#22177A', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.posteActuel || '—'}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    {st ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '3.5px 10px', background: st.bg, color: st.fg }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: st.dot }} />{st.label}</span>
                      : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '3.5px 10px', color: VIVIER.fg, border: '1px dashed rgba(34,23,122,.25)' }}>Vivier</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, fontSize: 12, color: '#8A8699' }}>
                    <span>{c.localisation || '—'}</span>
                    {c.salaireSouhaite ? <span style={{ fontWeight: 700, color: '#2C6B3F' }}>{salaryTxt(c.salaireSouhaite)}</span> : null}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, fontSize: 13, color: '#8A8699' }}>
          <span>Page {page} / {totalPages} · {total.toLocaleString('fr-FR')} candidats</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(34,23,122,0.14)', background: '#fff', color: page <= 1 ? '#C4C1D0' : '#22177A', cursor: page <= 1 ? 'default' : 'pointer' }}>‹</button>
            <span style={{ minWidth: 34, height: 34, borderRadius: 9, background: '#22177A', color: '#E6E9AF', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{page}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid rgba(34,23,122,0.14)', background: '#fff', color: page >= totalPages ? '#C4C1D0' : '#22177A', cursor: page >= totalPages ? 'default' : 'pointer' }}>›</button>
          </div>
        </div>
      )}

      {/* DRAWER */}
      {sel && (
        <>
          <div className="drwbg" onClick={() => setSelId(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(26,21,51,.38)' }} />
          <aside className="drw" style={{ position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 61, width: 440, maxWidth: '92vw', background: '#FCFCF5', boxShadow: '-26px 0 70px -30px rgba(26,21,51,.55)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flexShrink: 0, background: '#22177A', padding: '20px 22px', position: 'relative', overflow: 'hidden' }}>
              <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(230,233,175,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(230,233,175,.05) 1px,transparent 1px)', backgroundSize: '36px 36px' }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontFamily: "'Manrope'", fontSize: 9.5, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(230,233,175,.7)' }}>Aperçu candidat</span>
                <button onClick={() => setSelId(null)} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(230,233,175,.25)', background: 'transparent', color: '#E6E9AF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} strokeWidth={2.4} /></button>
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 13, marginTop: 16 }}>
                <Photo c={sel} size={58} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 19, letterSpacing: '-.02em', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(sel)}</div>
                  <div style={{ fontSize: 12.5, color: '#E6E9AF', fontWeight: 600, marginTop: 3 }}>{[sel.posteActuel, sel.entrepriseActuelle].filter(Boolean).join(' · ') || '—'}</div>
                  <div style={{ fontSize: 11.5, color: 'rgba(230,233,175,.65)', marginTop: 2 }}>{sel.localisation || '—'}</div>
                </div>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 22px 24px' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={sel.telephone ? `tel:${sel.telephone}` : undefined} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, background: '#22177A', color: '#E6E9AF', borderRadius: 10, padding: 11, textDecoration: 'none', opacity: sel.telephone ? 1 : 0.5 }}><Phone size={13} />{sel.telephone || 'Pas de numéro'}</a>
                <a href={sel.email ? `mailto:${sel.email}` : undefined} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: '#22177A', border: '1.5px solid rgba(34,23,122,.22)', borderRadius: 10, padding: '10px 15px', textDecoration: 'none' }}><Mail size={13} />Email</a>
              </div>
              {sel.email && <div style={{ fontSize: 12, color: '#6E6A85', marginTop: 8, wordBreak: 'break-all' }}>{sel.email}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 18 }}>
                <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.09)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontFamily: "'Manrope'", fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE' }}>Prétentions</div>
                  <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: '-.02em', color: '#22177A', marginTop: 6 }}>{salaryTxt(sel.salaireSouhaite)}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid rgba(34,23,122,.09)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontFamily: "'Manrope'", fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE' }}>Disponibilité</div>
                  <div style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: '-.02em', color: dispoColor(sel.disponibilite), marginTop: 6 }}>{sel.disponibilite || '—'}</div>
                </div>
              </div>

              <div style={{ fontFamily: "'Manrope'", fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE', marginTop: 20 }}>Positionné sur</div>
              {sel.position ? (
                <div onClick={() => navigate(`/mandats/${sel.position!.mandatId}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid rgba(34,23,122,.09)', borderRadius: 12, padding: '12px 14px', marginTop: 9, cursor: 'pointer' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: STAGE_META[sel.position.stage]?.dot, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sel.position.mandatTitre}</span>
                  <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: '4px 10px', background: STAGE_META[sel.position.stage]?.bg, color: STAGE_META[sel.position.stage]?.fg }}>{STAGE_META[sel.position.stage]?.label}</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, border: '1.5px dashed rgba(34,23,122,.2)', borderRadius: 12, padding: 14, marginTop: 9, background: '#fff' }}>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: '#1A1533' }}>Dans le vivier</div><div style={{ fontSize: 11.5, color: '#8A8699', marginTop: 2 }}>Aucun process en cours.</div></div>
                  <button onClick={() => navigate(`/candidats/${sel.id}`)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: "'Manrope'", fontSize: 12, fontWeight: 800, color: '#E6E9AF', background: '#22177A', border: 'none', borderRadius: 9, padding: '8px 13px', cursor: 'pointer' }}><Plus size={12} strokeWidth={2.8} />Positionner</button>
                </div>
              )}

              <div style={{ fontFamily: "'Manrope'", fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE', marginTop: 20 }}>Documents</div>
              <a href={sel.cvUrl || undefined} target="_blank" rel="noreferrer" className="cvcard" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid rgba(34,23,122,.11)', borderRadius: 12, padding: '12px 14px', marginTop: 9, textDecoration: 'none', opacity: sel.cvUrl ? 1 : 0.55, pointerEvents: sel.cvUrl ? 'auto' : 'none' } as React.CSSProperties}>
                <span style={{ flexShrink: 0, width: 38, height: 44, borderRadius: 7, background: '#F9ECE9', border: '1px solid rgba(176,54,31,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={17} color="#B3261E" /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>CV — {fullName(sel)}.pdf</div>
                  <div style={{ fontSize: 11.5, color: '#8A8699', marginTop: 2 }}>{sel.cvUrl ? 'PDF · disponible' : 'Aucun CV importé'}</div>
                </div>
              </a>
              <div onClick={() => navigate(`/candidats/${sel.id}`)} className="cvcard" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid rgba(34,23,122,.11)', borderRadius: 12, padding: '12px 14px', marginTop: 8, cursor: 'pointer' }}>
                <span style={{ flexShrink: 0, width: 38, height: 44, borderRadius: 7, background: '#F2F3D8', border: '1px solid rgba(34,23,122,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={17} color="#22177A" /></span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 800, color: '#1A1533' }}>Dossier HumanUp</div><div style={{ fontSize: 11.5, color: '#8A8699', marginTop: 2 }}>Voir la fiche complète</div></div>
                <ChevronRight size={15} color="#C4C1D0" style={{ flexShrink: 0 }} />
              </div>

              {sel.tags.length > 0 && (
                <>
                  <div style={{ fontFamily: "'Manrope'", fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE', marginTop: 20 }}>Compétences</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 9 }}>
                    {sel.tags.slice(0, 12).map((t, i) => (
                      <span key={t} style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '5px 11px', background: i % 2 ? '#EDEAF9' : '#EEF0C9', color: i % 2 ? '#5B4B9E' : '#22177A' }}>{t}</span>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={{ flexShrink: 0, borderTop: '1px solid rgba(34,23,122,.1)', padding: '14px 22px', background: '#fff' }}>
              <button onClick={() => navigate(`/candidats/${sel.id}`)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontSize: 13.5, fontWeight: 800, color: '#22177A', background: 'transparent', border: '1.5px solid rgba(34,23,122,.22)', borderRadius: 11, padding: 12, cursor: 'pointer' }}><Maximize2 size={15} strokeWidth={2.2} />Ouvrir en pleine page</button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
