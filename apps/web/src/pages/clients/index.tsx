import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, ChevronDown, X, Phone, Mail } from 'lucide-react';
import { usePageTitle } from '../../hooks/usePageTitle';
import { api } from '../../lib/api-client';

// ─── TYPES ──────────────────────────────────────────
interface Client {
  id: string;
  nom: string;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  poste: string | null;
  roleContact: string | null;
  typeClient: string | null;
  computedType: string | null;
  statutClient: string;
  entreprise: { id: string; nom: string; secteur?: string | null; localisation?: string | null; logoUrl?: string | null } | null;
  mandatsActifs: number;
  revenueCumule: number;
  lastActivityAt: string | null;
}
interface PaginatedResponse { data: Client[]; meta: { total: number; page: number; perPage: number; totalPages: number } }

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
const TYPE_META: Record<string, { label: string; bg: string; fg: string }> = {
  INBOUND: { label: 'Inbound', bg: '#F2F3D8', fg: '#22177A' },
  OUTBOUND: { label: 'Outbound', bg: '#EDEAF9', fg: '#5B4B9E' },
};
const STATUT_OPTIONS = Object.entries(STATUT_META).map(([value, m]) => ({ value, label: m.label }));
const TYPE_OPTIONS = [{ value: 'INBOUND', label: 'Inbound' }, { value: 'OUTBOUND', label: 'Outbound' }];

const GRID = 'minmax(200px,1.5fr) minmax(130px,1.1fr) minmax(150px,1.05fr) minmax(74px,.72fr) minmax(84px,.72fr) minmax(110px,.72fr) minmax(104px,.6fr)';

// ─── HELPERS ────────────────────────────────────────
function fullName(c: Client) { return `${c.prenom ? c.prenom + ' ' : ''}${c.nom}`.trim(); }
function initials(c: Client) { return `${(c.prenom?.[0] ?? '')}${c.nom?.[0] ?? ''}`.toUpperCase() || '?'; }
function mono(name: string) { return name.split(/\s+/).map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase(); }
const AV: Array<[string, string]> = [['#22177A', '#E6E9AF'], ['#3B9A54', '#fff'], ['#8E7CC3', '#fff'], ['#2A6BD8', '#fff'], ['#E05A9C', '#fff']];
function avColor(name: string): [string, string] { let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h); return AV[Math.abs(h) % AV.length]; }
function isStale(c: Client) { return !!c.lastActivityAt && (Date.now() - new Date(c.lastActivityAt).getTime()) > 30 * 86400000; }

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
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 41, minWidth: 200, maxHeight: 280, overflowY: 'auto', background: '#fff', border: '1px solid rgba(34,23,122,0.12)', borderRadius: 12, boxShadow: '0 20px 44px -20px rgba(34,23,122,0.4)', padding: 6 }}>
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
export default function ClientsPage() {
  usePageTitle('Clients');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const entrepriseId = searchParams.get('entrepriseId') || undefined;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debSearch, setDebSearch] = useState('');
  const [openChip, setOpenChip] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [secteurSel, setSecteurSel] = useState<string[]>([]);

  useEffect(() => { const t = setTimeout(() => { setDebSearch(search); setPage(1); }, 350); return () => clearTimeout(t); }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['clients', page, debSearch, entrepriseId, filters],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set('page', String(page)); p.set('perPage', '20');
      if (debSearch) p.set('search', debSearch);
      if (entrepriseId) p.set('entrepriseId', entrepriseId);
      if (filters.typeClient?.length) p.set('typeClient', filters.typeClient.join(','));
      if (filters.statutClient?.length) p.set('statutClient', filters.statutClient.join(','));
      if (filters.city?.length) p.set('city', filters.city.join(','));
      return api.get<PaginatedResponse>(`/clients?${p.toString()}`);
    },
  });

  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;
  let rows = data?.data ?? [];
  if (secteurSel.length) rows = rows.filter(c => c.entreprise?.secteur && secteurSel.includes(c.entreprise.secteur));

  const cityOptions = useMemo(() => {
    const s = new Set<string>(); (data?.data ?? []).forEach(c => { if (c.entreprise?.localisation) s.add(c.entreprise.localisation); });
    return Array.from(s).sort().map(v => ({ value: v, label: v }));
  }, [data?.data]);
  const secteurOptions = useMemo(() => {
    const s = new Set<string>(); (data?.data ?? []).forEach(c => { if (c.entreprise?.secteur) s.add(c.entreprise.secteur); });
    return Array.from(s).sort().map(v => ({ value: v, label: v }));
  }, [data?.data]);

  const setFilter = (key: string, v: string[]) => { setFilters(prev => { const n = { ...prev }; if (!v.length) delete n[key]; else n[key] = v; return n; }); setPage(1); };

  const activeChips: { key: string; value: string; label: string; onRemove: () => void }[] = [];
  for (const [k, arr] of Object.entries(filters)) arr.forEach(v => {
    const opt = (k === 'typeClient' ? TYPE_OPTIONS : k === 'statutClient' ? STATUT_OPTIONS : cityOptions).find(o => o.value === v);
    activeChips.push({ key: k, value: v, label: opt?.label ?? v, onRemove: () => setFilter(k, (filters[k] ?? []).filter(x => x !== v)) });
  });
  secteurSel.forEach(v => activeChips.push({ key: 'secteur', value: v, label: v, onRemove: () => setSecteurSel(s => s.filter(x => x !== v)) }));

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
          <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 38, letterSpacing: '-0.035em', color: '#1A1533', marginTop: 4 }}>Clients</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,0.12)', borderRadius: 999, padding: '8px 15px' }}>{total.toLocaleString('fr-FR')} clients</span>
          <button onClick={() => navigate('/clients/new')} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontWeight: 700, fontSize: 14, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 12, padding: '12px 20px', cursor: 'pointer', boxShadow: '0 10px 22px -14px rgba(34,23,122,0.7)' }}><Plus size={16} strokeWidth={2.4} />Nouveau client</button>
        </div>
      </div>

      {/* FILTERS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 22 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={15} color="#9A96AE" strokeWidth={2.2} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un client, une société…" style={{ width: '100%', fontSize: 13.5, padding: '10px 12px 10px 36px', borderRadius: 11, border: '1px solid rgba(34,23,122,0.14)', background: '#FCFCF5', outline: 'none' }} />
        </div>
        <ChipDropdown label="Type" options={TYPE_OPTIONS} value={filters.typeClient} open={openChip === 'type'} onToggle={() => setOpenChip(openChip === 'type' ? null : 'type')} onChange={v => setFilter('typeClient', v)} />
        <ChipDropdown label="Statut" options={STATUT_OPTIONS} value={filters.statutClient} open={openChip === 'statut'} onToggle={() => setOpenChip(openChip === 'statut' ? null : 'statut')} onChange={v => setFilter('statutClient', v)} />
        <ChipDropdown label="Secteur" options={secteurOptions} value={secteurSel} open={openChip === 'secteur'} onToggle={() => setOpenChip(openChip === 'secteur' ? null : 'secteur')} onChange={setSecteurSel} />
        <ChipDropdown label="Ville" options={cityOptions} value={filters.city} open={openChip === 'city'} onToggle={() => setOpenChip(openChip === 'city' ? null : 'city')} onChange={v => setFilter('city', v)} />
      </div>

      {/* ACTIVE CHIPS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 11 }}>
        <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE' }}>Filtres</span>
        {activeChips.length === 0 && <span style={{ fontSize: 12, color: '#C4C1D0' }}>aucun</span>}
        {activeChips.map(ch => (
          <span key={ch.key + ch.value} className="kw" onClick={ch.onRemove} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: '#22177A', background: '#F2F3D8', border: '1px solid rgba(34,23,122,0.14)', borderRadius: 999, padding: '5px 11px', cursor: 'pointer' }}>{ch.label}<X size={11} strokeWidth={2.8} /></span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8A8699' }}>{rows.length} affichés · {total.toLocaleString('fr-FR')} au total</span>
      </div>

      {/* TABLE */}
      <div style={{ marginTop: 18, background: '#fff', border: '1px solid rgba(34,23,122,0.08)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 2px rgba(34,23,122,0.04)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 14, padding: '14px 22px', background: '#F7F7EE', borderBottom: '1px solid rgba(34,23,122,0.08)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#8A8699' }}>
          <span>Client</span><span>Société</span><span>Contact</span><span>Mandats</span><span>Secteur</span><span>Statut</span><span style={{ textAlign: 'right' }}>Type</span>
        </div>
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ height: 67, borderBottom: '1px solid rgba(34,23,122,0.05)', background: i % 2 ? '#fff' : '#FCFCF5' }} />)
        ) : rows.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#8A8699' }}>Aucun client ne correspond aux filtres.</div>
        ) : rows.map(c => {
          const st = STATUT_META[c.statutClient] ?? STATUT_META.LEAD;
          const ty = TYPE_META[(c.computedType || c.typeClient || '') as string];
          const [avBg, avFg] = avColor(fullName(c));
          return (
            <div key={c.id} className="crow" onClick={() => navigate(`/clients/${c.id}`)} style={{ cursor: 'pointer', display: 'grid', gridTemplateColumns: GRID, gap: 14, alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid rgba(34,23,122,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: '50%', background: avBg, color: avFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 12 }}>{initials(c)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(c)}</div>
                  <div style={{ fontSize: 12, color: '#8A8699', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.poste || c.roleContact || '—'}</div>
                </div>
              </div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                {c.entreprise?.logoUrl
                  ? <span style={{ flexShrink: 0, width: 34, height: 26, borderRadius: 7, background: '#fff', border: '1px solid rgba(34,23,122,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 3 }}><img src={c.entreprise.logoUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /></span>
                  : <span style={{ flexShrink: 0, width: 34, height: 26, borderRadius: 7, background: '#F2F3D8', border: '1px solid rgba(34,23,122,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, color: '#22177A' }}>{c.entreprise ? mono(c.entreprise.nom) : '—'}</span>}
                <span onClick={(e) => { if (c.entreprise) { e.stopPropagation(); navigate(`/entreprises/${c.entreprise.id}`); } }} style={{ fontSize: 13, color: '#22177A', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.entreprise?.nom || '—'}</span>
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#22177A', whiteSpace: 'nowrap' }}><Phone size={12} color="#9A96AE" style={{ flexShrink: 0 }} />{c.telephone || '—'}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8A8699', minWidth: 0 }}><Mail size={12} color="#9A96AE" style={{ flexShrink: 0 }} /><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email || '—'}</span></span>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 800, fontSize: 15, color: c.mandatsActifs > 0 ? '#1A1533' : '#C4C1D0' }}>{c.mandatsActifs}</span>
                {isStale(c) && <span title="Client dormant" style={{ width: 7, height: 7, borderRadius: '50%', background: '#B3261E' }} />}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#4A4568', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.entreprise?.secteur || '—'}</span>
              <span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: '4px 11px', background: st.bg, color: st.fg, whiteSpace: 'nowrap' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />{st.label}</span></span>
              <span style={{ textAlign: 'right' }}>{ty ? <span style={{ display: 'inline-flex', fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '4px 11px', background: ty.bg, color: ty.fg, whiteSpace: 'nowrap' }}>{ty.label}</span> : <span style={{ color: '#C4C1D0' }}>—</span>}</span>
            </div>
          );
        })}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', fontSize: 13, color: '#8A8699' }}>
            <span>Page {page} / {totalPages} · {total.toLocaleString('fr-FR')} clients</span>
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
