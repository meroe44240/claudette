import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, ChevronDown, X, List, Columns3 } from 'lucide-react';
import { usePageTitle } from '../../hooks/usePageTitle';
import { api } from '../../lib/api-client';

// ─── TYPES ──────────────────────────────────────────
interface Mandat {
  id: string;
  titrePoste: string;
  statut: string;
  priorite: string;
  salaireMin: number | null;
  salaireMax: number | null;
  feeMontantEstime: number | null;
  createdAt?: string;
  entreprise: { id: string; nom: string };
  client: { id: string; nom: string; prenom: string | null } | null;
  _count?: { candidatures: number };
}
interface PaginatedResponse { data: Mandat[]; meta: { total: number; page: number; perPage: number; totalPages: number } }

// ─── META ───────────────────────────────────────────
const STATUT_META: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  OUVERT: { label: 'Ouvert', bg: '#E8EEF9', fg: '#2A4A8A', dot: '#2A6BD8' },
  EN_COURS: { label: 'En cours', bg: '#FBF3E7', fg: '#8A6A2E', dot: '#E08A2B' },
  GAGNE: { label: 'Gagné', bg: '#EAF3EC', fg: '#2C6B3F', dot: '#3B9A54' },
  PERDU: { label: 'Perdu', bg: '#F7DEDB', fg: '#B3261E', dot: '#B3261E' },
  ANNULE: { label: 'Annulé', bg: 'rgba(34,23,122,.06)', fg: '#8A8699', dot: '#C4C1D0' },
  CLOTURE: { label: 'Clôturé', bg: 'rgba(34,23,122,.06)', fg: '#6E6A85', dot: '#8E7CC3' },
};
const PRIO_META: Record<string, { label: string; bg: string; fg: string }> = {
  BASSE: { label: 'Basse', bg: 'rgba(34,23,122,.06)', fg: '#8A8699' },
  NORMALE: { label: 'Normale', bg: '#E8EEF9', fg: '#2A4A8A' },
  HAUTE: { label: 'Haute', bg: '#FBF3E7', fg: '#8A6A2E' },
  URGENTE: { label: 'Urgente', bg: '#F7DEDB', fg: '#B3261E' },
};
const STATUT_OPTIONS = Object.entries(STATUT_META).map(([value, m]) => ({ value, label: m.label }));
const PRIO_OPTIONS = Object.entries(PRIO_META).map(([value, m]) => ({ value, label: m.label }));

const GRID = '1.6fr 1.2fr 1.1fr 0.85fr 0.85fr 0.9fr 0.7fr 0.6fr auto';

// ─── HELPERS ────────────────────────────────────────
function salaire(min: number | null, max: number | null): string {
  if (min && max) return `${(min / 1000).toFixed(0)}–${(max / 1000).toFixed(0)}k€`;
  if (min) return `≥ ${(min / 1000).toFixed(0)}k€`;
  if (max) return `≤ ${(max / 1000).toFixed(0)}k€`;
  return '—';
}
function fee(v: number | null): string { return v ? `${(v / 1000).toFixed(0)}k€` : '—'; }
function clientName(c: Mandat['client']): string { return c ? `${c.prenom ? c.prenom + ' ' : ''}${c.nom}`.trim() : '—'; }

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
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 41, minWidth: 190, background: '#fff', border: '1px solid rgba(34,23,122,0.12)', borderRadius: 12, boxShadow: '0 20px 44px -20px rgba(34,23,122,0.4)', padding: 6 }}>
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
export default function MandatsPage() {
  usePageTitle('Mandats');
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debSearch, setDebSearch] = useState('');
  const [openChip, setOpenChip] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string[]>>({});

  useEffect(() => { const t = setTimeout(() => { setDebSearch(search); setPage(1); }, 350); return () => clearTimeout(t); }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['mandats', page, debSearch, filters],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set('page', String(page)); p.set('perPage', '20'); p.set('scope', 'all');
      if (debSearch) p.set('search', debSearch);
      if (filters.statut?.length) p.set('statut', filters.statut.join(','));
      if (filters.priorite?.length) p.set('priorite', filters.priorite.join(','));
      return api.get<PaginatedResponse>(`/mandats?${p.toString()}`);
    },
  });

  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;
  const rows = data?.data ?? [];

  const setFilter = (key: string, v: string[]) => { setFilters(prev => { const n = { ...prev }; if (!v.length) delete n[key]; else n[key] = v; return n; }); setPage(1); };
  const activeChips: { key: string; label: string; onRemove: () => void }[] = [];
  for (const [k, arr] of Object.entries(filters)) arr.forEach(v => {
    const opt = (k === 'statut' ? STATUT_OPTIONS : PRIO_OPTIONS).find(o => o.value === v);
    activeChips.push({ key: k + v, label: opt?.label ?? v, onRemove: () => setFilter(k, (filters[k] ?? []).filter(x => x !== v)) });
  });

  return (
    <div>
      <style>{`
        .crow{ position:relative; transition:background .16s ease, padding-left .2s cubic-bezier(.16,1,.3,1); }
        .crow::before{ content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:#22177A; transform:scaleY(0); transition:transform .22s cubic-bezier(.16,1,.3,1); }
        .crow:hover{ background:#FBFBF3; padding-left:26px; }
        .crow:hover::before{ transform:scaleY(1); }
        .crow:hover .kbl{ color:#22177A !important; }
        .chip:hover{ border-color:rgba(34,23,122,0.3) !important; transform:translateY(-1px); }
        .chip{ transition:border-color .16s ease, transform .15s ease; }
        .kw:hover{ background:#E6E9AF !important; }
      `}</style>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, color: '#9A96AE', fontWeight: 600 }}>Recrutement</div>
          <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 38, letterSpacing: '-0.035em', color: '#1A1533', marginTop: 4 }}>Mandats</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,0.12)', borderRadius: 999, padding: '8px 15px' }}>{total.toLocaleString('fr-FR')} mandats</span>
          <div style={{ display: 'flex', background: '#fff', border: '1px solid rgba(34,23,122,0.14)', borderRadius: 11, overflow: 'hidden' }}>
            <button title="Liste" style={{ width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#22177A', border: 'none', cursor: 'pointer' }}><List size={16} color="#E6E9AF" /></button>
            <button title="Kanban" onClick={() => navigate('/mandats/kanban')} style={{ width: 38, height: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: 'none', cursor: 'pointer' }}><Columns3 size={16} color="#8A8699" /></button>
          </div>
          <button onClick={() => navigate('/mandats/new')} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontWeight: 700, fontSize: 14, background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 12, padding: '12px 20px', cursor: 'pointer', boxShadow: '0 10px 22px -14px rgba(34,23,122,0.7)' }}><Plus size={16} strokeWidth={2.4} />Nouveau mandat</button>
        </div>
      </div>

      {/* FILTERS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 22 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 360 }}>
          <Search size={15} color="#9A96AE" strokeWidth={2.2} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un poste, une entreprise…" style={{ width: '100%', fontSize: 13.5, padding: '10px 12px 10px 36px', borderRadius: 11, border: '1px solid rgba(34,23,122,0.14)', background: '#fff', outline: 'none' }} />
        </div>
        <ChipDropdown label="Statut" options={STATUT_OPTIONS} value={filters.statut} open={openChip === 'statut'} onToggle={() => setOpenChip(openChip === 'statut' ? null : 'statut')} onChange={v => setFilter('statut', v)} />
        <ChipDropdown label="Priorité" options={PRIO_OPTIONS} value={filters.priorite} open={openChip === 'prio'} onToggle={() => setOpenChip(openChip === 'prio' ? null : 'prio')} onChange={v => setFilter('priorite', v)} />
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
          <span>Poste</span><span>Entreprise</span><span>Client</span><span>Statut</span><span>Priorité</span><span>Salaire</span><span>Fee</span><span style={{ textAlign: 'center' }}>Cand.</span><span />
        </div>
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ height: 62, borderBottom: '1px solid rgba(34,23,122,0.05)', background: i % 2 ? '#fff' : '#FCFCF5' }} />)
        ) : rows.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: '#8A8699' }}>Aucun mandat ne correspond aux filtres.</div>
        ) : rows.map(m => {
          const st = STATUT_META[m.statut] ?? STATUT_META.OUVERT;
          const pr = PRIO_META[m.priorite] ?? PRIO_META.NORMALE;
          const cand = m._count?.candidatures ?? 0;
          return (
            <div key={m.id} className="crow" onClick={() => navigate(`/mandats/${m.id}`)} style={{ cursor: 'pointer', display: 'grid', gridTemplateColumns: GRID, gap: 14, alignItems: 'center', padding: '15px 22px', borderBottom: '1px solid rgba(34,23,122,0.05)' }}>
              <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.titrePoste}</div></div>
              <span onClick={(e) => { e.stopPropagation(); navigate(`/entreprises/${m.entreprise.id}`); }} style={{ fontSize: 13, color: '#22177A', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.entreprise.nom}</span>
              <span onClick={(e) => { if (m.client) { e.stopPropagation(); navigate(`/clients/${m.client.id}`); } }} style={{ fontSize: 13, color: '#4A4568', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: m.client ? 'pointer' : 'default' }}>{clientName(m.client)}</span>
              <span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, borderRadius: 999, padding: '4px 11px', background: st.bg, color: st.fg, whiteSpace: 'nowrap' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />{st.label}</span></span>
              <span><span style={{ display: 'inline-flex', fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '4px 11px', background: pr.bg, color: pr.fg, whiteSpace: 'nowrap' }}>{pr.label}</span></span>
              <span style={{ fontSize: 12.5, color: '#4A4568', whiteSpace: 'nowrap' }}>{salaire(m.salaireMin, m.salaireMax)}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#22177A' }}>{fee(m.feeMontantEstime)}</span>
              <span style={{ textAlign: 'center' }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 26, height: 24, padding: '0 8px', fontSize: 12.5, fontWeight: 800, borderRadius: 999, background: 'rgba(34,23,122,0.08)', color: '#22177A' }}>{cand}</span></span>
              <span onClick={(e) => { e.stopPropagation(); navigate(`/mandats/${m.id}/kanban`); }} className="kbl" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#8A8699', cursor: 'pointer', transition: 'color .16s' }}><Columns3 size={14} />Kanban</span>
            </div>
          );
        })}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', fontSize: 13, color: '#8A8699' }}>
            <span>Page {page} / {totalPages} · {total.toLocaleString('fr-FR')} mandats</span>
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
