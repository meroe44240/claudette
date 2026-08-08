/**
 * List Push — reverse-sourcing par établissement.
 *
 * Une page unique qui :
 * - liste les MarketList à gauche
 * - affiche le détail de la sélectionnée à droite (établissements + CTA)
 * - modal de création
 */

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Upload, Target, ArrowRight, Trash2, Users, MapPin, Send, X } from 'lucide-react';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth-store';
import { usePageTitle } from '../../hooks/usePageTitle';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import { toast } from '../../components/ui/Toast';

type EstablishmentStatus = 'NEW' | 'EXCLUDED' | 'PROSPECTION' | 'CLIENT_EXISTING';

interface Ctx { materiaux?: string[]; technos?: string[]; production?: string[]; application?: string[] }
interface CandidatRef { id: string; nom: string; prenom: string | null; posteActuel?: string | null; photoUrl?: string | null }

interface MarketList {
  id: string;
  name: string;
  sectorTags: string[];
  zones: string[];
  excludedCompanies: string[];
  candidat?: CandidatRef | null;
  createdAt: string;
  _count: { establishments: number };
}

interface Establishment {
  id: string;
  name: string;
  city: string | null;
  sector: string | null;
  effectif: string | null;
  titles: string[];
  frequency: number;
  status: EstablishmentStatus;
  entrepriseId: string | null;
  contexte?: Ctx | null;
  contact?: { civilite?: string; prenom?: string; nom?: string; email?: string; phone?: string } | null;
}

interface MarketListDetail {
  id: string;
  name: string;
  sectorTags: string[];
  zones: string[];
  excludedCompanies: string[];
  candidat?: CandidatRef | null;
  candidatCtx?: Ctx | null;
  establishments: Establishment[];
}

const STATUS_LABELS: Record<EstablishmentStatus, string> = {
  NEW: 'Nouveau',
  EXCLUDED: 'Exclu',
  PROSPECTION: 'En prospection',
  CLIENT_EXISTING: 'Déjà client',
};
const STATUS_TONE: Record<EstablishmentStatus, { bg: string; fg: string }> = {
  NEW:             { bg: '#eceaf2', fg: '#4b3fb0' },
  EXCLUDED:        { bg: '#f9ece9', fg: '#b0361f' },
  PROSPECTION:     { bg: '#fbf3e7', fg: '#b47814' },
  CLIENT_EXISTING: { bg: '#eaf3ec', fg: '#3b9a54' },
};

// ─── Contexte technique + match (cœur du ciblage) ───
const CTX_CATS: { key: keyof Ctx; label: string; bg: string; fg: string }[] = [
  { key: 'materiaux', label: 'Matériaux', bg: '#FBF3E7', fg: '#8A6A2E' },
  { key: 'technos', label: 'Technologies', bg: '#E8EEF9', fg: '#2A4A8A' },
  { key: 'production', label: 'Production', bg: '#EAF3EC', fg: '#2C6B3F' },
  { key: 'application', label: 'Application', bg: '#EDEAF9', fg: '#5B4B9E' },
];
function ctxValues(ctx?: Ctx | null): string[] {
  if (!ctx) return [];
  return CTX_CATS.flatMap((c) => ctx[c.key] ?? []);
}
function ctxLine(ctx?: Ctx | null): string { return ctxValues(ctx).slice(0, 5).join(' · '); }
/** Match = % des catégories renseignées du candidat recoupées par l'établissement. */
function matchScore(cand?: Ctx | null, est?: Ctx | null): number | null {
  if (!cand || !est) return null;
  const filled = CTX_CATS.filter((c) => (cand[c.key]?.length ?? 0) > 0);
  if (!filled.length) return null;
  let hits = 0;
  for (const c of filled) {
    const cv = (cand[c.key] ?? []).map((s) => s.toLowerCase());
    const ev = (est[c.key] ?? []).map((s) => s.toLowerCase());
    if (cv.some((a) => ev.some((b) => b.includes(a) || a.includes(b)))) hits++;
  }
  return Math.round((hits / filled.length) * 100);
}
function matchTone(score: number): { bg: string; fg: string } {
  if (score >= 75) return { bg: '#EAF3EC', fg: '#2C6B3F' };
  if (score >= 40) return { bg: '#FBF3E7', fg: '#8A6A2E' };
  return { bg: 'rgba(34,23,122,.06)', fg: '#8A8699' };
}
/** Highlights = intersection ctx candidat ∩ ctx établissement (repli sur points forts génériques). */
function intersectionHighlights(cand?: Ctx | null, est?: Ctx | null): string[] {
  if (!cand) return [];
  if (!est) return ctxValues(cand).slice(0, 4);
  const out: string[] = [];
  for (const c of CTX_CATS) {
    const cv = cand[c.key] ?? [];
    const ev = (est[c.key] ?? []).map((s) => s.toLowerCase());
    out.push(...cv.filter((v) => ev.some((e) => e.includes(v.toLowerCase()) || v.toLowerCase().includes(e))));
  }
  return (out.length ? out : ctxValues(cand)).slice(0, 4);
}
/** Email pro déduit : initiale-prénom.nom@societe.fr (sans initiale si prénom inconnu). */
function deduceEmail(prenom: string, nom: string, company: string): string {
  const dom = company.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 24);
  if (!nom || !dom) return '';
  const local = prenom ? `${prenom[0].toLowerCase()}.${nom.toLowerCase()}` : nom.toLowerCase();
  return `${local}@${dom}.fr`;
}
/** Email de push anonyme, orienté décideur. Le nom du candidat n'apparaît JAMAIS. */
function buildPushEmail(o: { role?: string | null; exp?: string | null; dispo?: string | null; accroche: string; highlights: string[]; userName: string }): string {
  const bullets = o.highlights.length ? o.highlights.map((h) => `· ${h}`).join('\n') : '· profil senior, opérationnel rapidement';
  const qual = [o.exp ? `${o.exp} d'expérience` : '', o.dispo ? `disponible ${o.dispo}` : ''].filter(Boolean).join(', ');
  return `Bonjour ${o.accroche || ''},\n\nJ'ai un ${o.role || 'profil'}${qual ? ` (${qual})` : ''} dans mon portefeuille.\n\n${bullets}\n\nJe vous joins son dossier de compétences anonymisé.\n\nÇa vous intéresse ? Répondez-moi et je vous le présente.\n\n${o.userName} — HumanUp`;
}

export default function ListPushPage() {
  usePageTitle('List Push — Sourcing');
  const qc = useQueryClient();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pushFor, setPushFor] = useState<Establishment | null>(null);
  const [serie, setSerie] = useState<{ queue: Establishment[]; idx: number } | null>(null);
  const [pushForm, setPushForm] = useState({ civilite: '', prenom: '', nom: '', email: '', phone: '', highlights: [] as string[], emailBody: '' });
  const { user } = useAuthStore();
  const userName = `${user?.prenom || ''} ${user?.nom || ''}`.trim() || 'HumanUp';
  const [form, setForm] = useState({
    name: '',
    sectorTags: '',
    zones: '',
    excludedCompanies: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [candQuery, setCandQuery] = useState('');
  const [selectedCand, setSelectedCand] = useState<CandidatRef | null>(null);
  const { data: candResults } = useQuery({
    queryKey: ['candidats-search-lp', candQuery],
    queryFn: () => api.get<{ data: CandidatRef[] }>(`/candidats?search=${encodeURIComponent(candQuery)}&perPage=6`),
    enabled: candQuery.trim().length >= 2,
  });

  const { data: lists, isLoading: listsLoading } = useQuery({
    queryKey: ['market-lists'],
    queryFn: () => api.get<MarketList[]>('/sourcing/market-lists'),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['market-lists', selectedListId],
    queryFn: () => api.get<MarketListDetail>(`/sourcing/market-lists/${selectedListId}`),
    enabled: !!selectedListId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; sectorTags: string[]; zones: string[]; excludedCompanies: string[]; candidatId?: string | null }) =>
      api.post<MarketList>('/sourcing/market-lists', data),
    onSuccess: (list) => {
      qc.invalidateQueries({ queryKey: ['market-lists'] });
      setSelectedListId(list.id);
      setCreateOpen(false);
      setForm({ name: '', sectorTags: '', zones: '', excludedCompanies: '' });
      setSelectedCand(null); setCandQuery('');
      toast('success', `Liste "${list.name}" créée`);
    },
    onError: () => toast('error', 'Erreur lors de la création'),
  });

  const ingestMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selectedListId) return;
      const formData = new FormData();
      formData.append('file', file);
      // Note: on utilise fetch direct car api client fait application/json
      const res = await fetch(`/api/v1/sourcing/market-lists/${selectedListId}/ingest-cv`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['market-lists', selectedListId] });
      qc.invalidateQueries({ queryKey: ['market-lists'] });
      toast(
        'success',
        `CV ingéré : ${data.summary.new} nouvelles boîtes, ${data.summary.incremented} incrémentées`,
      );
    },
    onError: () => toast('error', "Erreur lors de l'ingestion CV"),
  });

  const statusMutation = useMutation({
    mutationFn: (params: { id: string; status: EstablishmentStatus }) =>
      api.put(`/sourcing/market-lists/establishments/${params.id}`, { status: params.status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['market-lists', selectedListId] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => api.post<{ created: number; skippedExisting: number }>(
      `/sourcing/market-lists/${selectedListId}/generate-prospection`,
    ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['market-lists', selectedListId] });
      toast('success', `${res.created} leads créés dans le CRM (Prospection)`);
    },
    onError: () => toast('error', 'Erreur lors de la génération des leads'),
  });

  const pushMutation = useMutation({
    mutationFn: (p: { estId: string; body: Record<string, unknown> }) =>
      api.post(`/sourcing/market-lists/establishments/${p.estId}/push`, p.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['market-lists', selectedListId] });
    },
    onError: () => toast('error', 'Erreur lors du push'),
  });

  // Ouvre la modale de push : pré-remplit décideur (depuis e.contact), highlights (∩) et email généré.
  const openPush = (e: Establishment) => {
    const cand = detail?.candidat;
    const contact = e.contact ?? {};
    const civ = contact.civilite ?? '';
    const prenom = contact.prenom ?? '';
    const nom = contact.nom ?? '';
    const highlights = intersectionHighlights(detail?.candidatCtx, e.contexte);
    const accroche = prenom || (civ ? `${civ} ${nom}`.trim() : nom) || '';
    const emailBody = buildPushEmail({ role: cand?.posteActuel, accroche, highlights, userName });
    setPushForm({
      civilite: civ, prenom, nom,
      email: contact.email || deduceEmail(prenom, nom, e.name),
      phone: contact.phone ?? '',
      highlights, emailBody,
    });
    setPushFor(e);
  };

  // Power dialer : enchaîne les établissements à pusher un par un.
  const serieAdvance = () => {
    if (!serie) { setPushFor(null); return; }
    const next = serie.idx + 1;
    if (next >= serie.queue.length) { setSerie(null); setPushFor(null); toast('success', `File terminée — ${serie.queue.length} établissement(s) traité(s)`); return; }
    setSerie({ ...serie, idx: next });
    openPush(serie.queue[next]);
  };
  const startSerie = () => {
    if (!detail?.candidat) { toast('error', 'Rattache un profil à cette liste'); return; }
    const q = detail.establishments.filter((e) => e.status === 'NEW' || e.status === 'PROSPECTION');
    if (!q.length) { toast('info', 'Aucun établissement à pusher'); return; }
    setSerie({ queue: q, idx: 0 });
    openPush(q[0]);
  };

  const submitPush = () => {
    if (!pushFor) return;
    const decideurName = `${pushForm.prenom} ${pushForm.nom}`.trim() || `${pushForm.civilite} ${pushForm.nom}`.trim();
    if (!decideurName.trim()) { toast('error', 'Nom du décideur requis'); return; }
    const cand = detail?.candidat;
    pushMutation.mutate({
      estId: pushFor.id,
      body: {
        decideurName,
        decideurEmail: pushForm.email.trim() || null,
        decideurPhone: pushForm.phone.trim() || null,
        candidat: cand ? { name: `${cand.prenom || ''} ${cand.nom}`.trim(), role: cand.posteActuel ?? null } : null,
      },
    }, {
      onSuccess: () => { toast('success', 'Lead créé — visible dans Leads'); if (serie) serieAdvance(); else setPushFor(null); },
    });
  };

  return (
    <div>
      {/* Header mock-fidelity : kicker "REVERSE SOURCING" + h1 40px + description + Nouvelle liste */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 24 }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 24, height: 2, background: '#22177A', borderRadius: 2 }} />
            <span
              style={{
                fontSize: 11.5, fontWeight: 700, letterSpacing: '0.16em',
                textTransform: 'uppercase', color: '#22177A',
              }}
            >
              Reverse Sourcing
            </span>
          </div>
          <h1
            style={{
              fontFamily: "'Archivo Black', sans-serif",
              fontSize: 40, letterSpacing: '-0.035em', color: '#1A1533',
              marginTop: 12, lineHeight: 1,
            }}
          >
            List Push
          </h1>
          <p style={{ marginTop: 8, fontSize: 14, color: '#6E6A85' }}>
            Uploade des CV — HumanUp extrait les employeurs de chaque candidat et agrège les boîtes cibles pour ta campagne de prospection commerciale.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer', border: 'none', flexShrink: 0 }}
        >
          <Plus size={15} /> Nouvelle liste
        </button>
      </div>

      {/* KPI row — 3 KPI cards (Listes / Établissements / CV traités) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        <div className="kpi">
          <div className="kpi-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Target size={12} style={{ color: '#22177A' }} />
            <span>Listes</span>
          </div>
          <div className="kpi-value" style={{ marginTop: 12 }}>{lists?.length ?? 0}</div>
          <div style={{ fontSize: 12, color: '#9A96AE', marginTop: 3 }}>en portefeuille</div>
        </div>
        <div className="kpi">
          <div className="kpi-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={12} style={{ color: '#22177A' }} />
            <span>Établissements</span>
          </div>
          <div className="kpi-value" style={{ marginTop: 12 }}>
            {(lists ?? []).reduce((sum, l) => sum + (l._count?.establishments ?? 0), 0)}
          </div>
          <div style={{ fontSize: 12, color: '#9A96AE', marginTop: 3 }}>agrégés</div>
        </div>
        <div className="kpi">
          <div className="kpi-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Upload size={12} style={{ color: '#22177A' }} />
            <span>CV traités</span>
          </div>
          <div className="kpi-value" style={{ marginTop: 12 }}>—</div>
          <div style={{ fontSize: 12, color: '#9A96AE', marginTop: 3 }}>via bouton "Alimenter"</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* Colonne gauche : mes listes */}
        <aside className="space-y-2">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            Mes listes
          </h2>
          {listsLoading ? (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          ) : !lists || lists.length === 0 ? (
            <p className="text-sm text-text-tertiary">
              Crée ta première liste pour démarrer.
            </p>
          ) : (
            lists.map((l) => (
              <button
                key={l.id}
                onClick={() => setSelectedListId(l.id)}
                className={`w-full rounded-xl border p-3 text-left transition-all ${
                  selectedListId === l.id
                    ? 'border-primary-800 bg-primary-50'
                    : 'border-neutral-100 bg-white hover:border-primary-100'
                }`}
              >
                <p className="text-sm font-semibold text-text-primary">{l.name}</p>
                <p className="mt-0.5 text-[11px] text-text-tertiary">
                  {l._count.establishments} établissement{l._count.establishments > 1 ? 's' : ''}
                  {l.sectorTags.length > 0 && ` · ${l.sectorTags.join(', ')}`}
                </p>
              </button>
            ))
          )}
        </aside>

        {/* Colonne droite : detail liste */}
        <section>
          {!selectedListId ? (
            <EmptyState
              title="Sélectionne une liste"
              description="Ou crée une nouvelle liste pour commencer une campagne de sourcing."
              actionLabel="+ Nouvelle liste"
              onAction={() => setCreateOpen(true)}
            />
          ) : detailLoading || !detail ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header */}
              <Card>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2
                      className="text-2xl text-neutral-900"
                      style={{ fontFamily: "'Archivo Black', sans-serif", letterSpacing: '-0.01em' }}
                    >
                      {detail.name}
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-text-secondary">
                      {detail.sectorTags.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Target size={12} strokeWidth={2} /> {detail.sectorTags.join(', ')}
                        </span>
                      )}
                      {detail.zones.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} strokeWidth={2} /> {detail.zones.join(', ')}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Users size={12} strokeWidth={2} /> {detail.establishments.length} boîtes
                      </span>
                    </div>

                    {/* Bandeau profil rattaché (lime) ou avertissement (ambre) */}
                    {detail.candidat ? (
                      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, background: '#F2F3D8', border: '1px solid rgba(34,23,122,.14)', borderRadius: 12, padding: '10px 14px' }}>
                        {detail.candidat.photoUrl
                          ? <img src={detail.candidat.photoUrl} alt="" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          : <span style={{ width: 38, height: 38, borderRadius: '50%', background: '#22177A', color: '#E6E9AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{`${(detail.candidat.prenom?.[0] || '')}${detail.candidat.nom[0] || ''}`.toUpperCase()}</span>}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8A6A2E' }}>Profil rattaché — la liste lui appartient</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1533' }}>{`${detail.candidat.prenom || ''} ${detail.candidat.nom}`.trim()}{detail.candidat.posteActuel ? ` · ${detail.candidat.posteActuel}` : ''}</div>
                          {ctxLine(detail.candidatCtx) && <div style={{ fontSize: 12, color: '#5B4B9E', marginTop: 1 }}>{ctxLine(detail.candidatCtx)}</div>}
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: 14, background: '#FBF3E7', border: '1px solid #F0D9B5', borderRadius: 12, padding: '10px 14px', fontSize: 12.5, color: '#8A6A2E' }}>
                        ⚠ Aucun profil rattaché — le matching et le push ciblé sont désactivés. Rattache un A-player à cette liste.
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) ingestMutation.mutate(file);
                        e.target.value = '';
                      }}
                    />
                    <Button
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={ingestMutation.isPending}
                    >
                      <Upload size={14} /> {ingestMutation.isPending ? 'Analyse…' : 'Ingérer un CV'}
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => generateMutation.mutate()}
                      disabled={
                        generateMutation.isPending ||
                        !detail.establishments.some((e) => e.status === 'NEW')
                      }
                    >
                      <ArrowRight size={14} /> Générer les leads
                    </Button>
                    {(() => { const n = detail.establishments.filter((e) => e.status === 'NEW' || e.status === 'PROSPECTION').length; return (
                      <button
                        onClick={startSerie}
                        disabled={!detail.candidat || n === 0}
                        title={!detail.candidat ? 'Rattache un profil à cette liste' : 'Enchaîner les pushs un par un'}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 13.5, background: (!detail.candidat || n === 0) ? '#EDEAF9' : '#E6E9AF', color: '#22177A', border: '1.5px solid rgba(34,23,122,.18)', borderRadius: 11, padding: '9px 15px', cursor: (!detail.candidat || n === 0) ? 'not-allowed' : 'pointer', opacity: (!detail.candidat || n === 0) ? 0.6 : 1 }}
                      >
                        <Send size={14} /> Push en série ({n})
                      </button>
                    ); })()}
                  </div>
                </div>
              </Card>

              {/* Etablissements */}
              <Card>
                <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                  Établissements identifiés ({detail.establishments.length})
                </h3>
                {detail.establishments.length === 0 ? (
                  <p className="py-6 text-center text-sm italic text-text-tertiary">
                    Aucun établissement pour l'instant. Ingère des CV pour peupler cette liste.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-neutral-100 text-left text-[11px] uppercase tracking-wider text-text-tertiary">
                          <th className="py-2 pr-3 font-semibold">Boîte</th>
                          <th className="py-2 pr-3 font-semibold">Ville / Secteur</th>
                          <th className="py-2 pr-3 font-semibold">Postes recrutés</th>
                          <th className="py-2 pr-3 font-semibold">Contexte technique</th>
                          <th className="py-2 pr-3 font-semibold text-right">Cand.</th>
                          <th className="py-2 pr-3 font-semibold">Statut</th>
                          <th className="py-2 font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...detail.establishments].sort((a, b) => (matchScore(detail.candidatCtx, b.contexte) ?? -1) - (matchScore(detail.candidatCtx, a.contexte) ?? -1)).map((e) => (
                          <tr key={e.id} className="border-b border-neutral-50 last:border-0">
                            <td className="py-3 pr-3 font-medium text-text-primary">{e.name}</td>
                            <td className="py-3 pr-3 text-[12px] text-text-secondary">
                              {[e.city, e.sector].filter(Boolean).join(' · ') || '—'}
                            </td>
                            <td className="py-3 pr-3">
                              <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
                                {e.titles.slice(0, 3).map((t) => (
                                  <span key={t} style={{ background: '#EDEAF9', color: '#5B4B9E', borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{t}</span>
                                ))}
                                {e.titles.length > 3 && <span style={{ fontSize: 11, color: '#8A8699', alignSelf: 'center' }}>+{e.titles.length - 3}</span>}
                                {e.titles.length === 0 && <span style={{ fontSize: 12, color: '#C4C1D0' }}>—</span>}
                              </span>
                            </td>
                            <td className="py-3 pr-3">
                              {ctxValues(e.contexte).length === 0 ? (
                                <span style={{ fontSize: 11.5, color: '#C4C1D0' }}>non renseigné</span>
                              ) : (
                                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, maxWidth: 260 }}>
                                  {CTX_CATS.flatMap((c) => (e.contexte?.[c.key] ?? []).slice(0, 2).map((v) => (
                                    <span key={c.key + v} style={{ background: c.bg, color: c.fg, borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{v}</span>
                                  ))).slice(0, 6)}
                                </span>
                              )}
                            </td>
                            <td className="py-3 pr-3 text-right font-bold tabular-nums text-text-primary">
                              {e.frequency}
                            </td>
                            <td className="py-3 pr-3">
                              <span
                                className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                style={{ background: STATUS_TONE[e.status].bg, color: STATUS_TONE[e.status].fg }}
                              >
                                {STATUS_LABELS[e.status]}
                              </span>
                            </td>
                            <td className="py-3">
                              {(() => { const sc = matchScore(detail.candidatCtx, e.contexte); return sc !== null ? (
                                <span title="Recoupement contexte candidat ∩ établissement" style={{ display: 'inline-block', marginRight: 8, borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 800, background: matchTone(sc).bg, color: matchTone(sc).fg }}>Match {sc}%</span>
                              ) : null; })()}
                              {(e.status === 'NEW' || e.status === 'PROSPECTION' || e.status === 'CLIENT_EXISTING') && (
                                <button
                                  onClick={() => openPush(e)}
                                  className="mr-1 inline-flex items-center gap-1 rounded-md bg-primary-800 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-primary-900"
                                  title="Pusher un candidat à cet établissement"
                                >
                                  <Send size={12} /> Pusher
                                </button>
                              )}
                              {e.status === 'NEW' && (
                                <button
                                  onClick={() =>
                                    statusMutation.mutate({ id: e.id, status: 'EXCLUDED' })
                                  }
                                  className="rounded p-1 text-neutral-300 hover:bg-red-50 hover:text-red-500"
                                  title="Exclure de la campagne"
                                >
                                  <Trash2 size={14} strokeWidth={2} />
                                </button>
                              )}
                              {e.status === 'EXCLUDED' && (
                                <button
                                  onClick={() =>
                                    statusMutation.mutate({ id: e.id, status: 'NEW' })
                                  }
                                  className="text-[11px] text-primary-800 hover:underline"
                                >
                                  Réinclure
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}
        </section>
      </div>

      {/* Create List Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nouvelle liste de sourcing"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Une liste = une campagne de reverse-sourcing (ex : "SDR Paris Q3", "CTO SaaS France").
          </p>

          {/* 1. Le profil à placer — choisi en premier (il définit le métier) */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-text-secondary">Profil à placer (A-player)</label>
            {selectedCand ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F2F3D8', border: '1px solid rgba(34,23,122,.16)', borderRadius: 11, padding: '9px 12px' }}>
                <span style={{ width: 30, height: 30, borderRadius: '50%', background: '#22177A', color: '#E6E9AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, flexShrink: 0 }}>{`${(selectedCand.prenom?.[0] || '')}${selectedCand.nom[0] || ''}`.toUpperCase()}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: '#1A1533' }}>{`${selectedCand.prenom || ''} ${selectedCand.nom}`.trim()}{selectedCand.posteActuel ? ` · ${selectedCand.posteActuel}` : ''}</span>
                <button onClick={() => { setSelectedCand(null); setCandQuery(''); }} style={{ border: 'none', background: 'transparent', color: '#8A8699', cursor: 'pointer' }}><X size={15} /></button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input value={candQuery} onChange={(e) => setCandQuery(e.target.value)} placeholder="Rechercher un candidat…" style={pushInputStyle} />
                {candQuery.trim().length >= 2 && (candResults?.data?.length ?? 0) > 0 && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20, background: '#fff', border: '1px solid rgba(34,23,122,.14)', borderRadius: 11, boxShadow: '0 20px 44px -20px rgba(34,23,122,.4)', padding: 5, maxHeight: 220, overflowY: 'auto' }}>
                    {candResults!.data.map((c) => (
                      <button key={c.id} onClick={() => { setSelectedCand(c); if (!form.name.trim()) setForm((f) => ({ ...f, name: `${c.prenom || ''} ${c.nom}`.trim() })); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#F2F3D8', color: '#22177A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 9, flexShrink: 0 }}>{`${(c.prenom?.[0] || '')}${c.nom[0] || ''}`.toUpperCase()}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1533' }}>{`${c.prenom || ''} ${c.nom}`.trim()}{c.posteActuel ? ` · ${c.posteActuel}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-text-tertiary" style={{ marginTop: 4 }}>La liste appartient au candidat — c'est lui qui définit le métier ciblé.</p>
              </div>
            )}
          </div>

          <Input
            label="Nom de la liste"
            placeholder="SDR Paris Q3 2026"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <Input
            label="Secteurs / métiers (séparés par virgule)"
            placeholder="Sales, SaaS, Fintech"
            value={form.sectorTags}
            onChange={(e) => setForm((f) => ({ ...f, sectorTags: e.target.value }))}
          />
          <Input
            label="Zones (villes ou départements, séparés par virgule)"
            placeholder="Paris, 75, 92, Lyon"
            value={form.zones}
            onChange={(e) => setForm((f) => ({ ...f, zones: e.target.value }))}
          />
          <Input
            label="Sociétés exclues (séparées par virgule)"
            placeholder="ACME, Globex, Initech"
            value={form.excludedCompanies}
            onChange={(e) => setForm((f) => ({ ...f, excludedCompanies: e.target.value }))}
          />
          <p className="text-[11px] text-text-tertiary">
            Les sociétés exclues ne remonteront pas dans les cibles quand tu ingères un CV.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button
              variant="primary"
              onClick={() =>
                createMutation.mutate({
                  name: form.name.trim(),
                  sectorTags: form.sectorTags.split(',').map((s) => s.trim()).filter(Boolean),
                  zones: form.zones.split(',').map((s) => s.trim()).filter(Boolean),
                  excludedCompanies: form.excludedCompanies.split(',').map((s) => s.trim()).filter(Boolean),
                  candidatId: selectedCand?.id ?? null,
                })
              }
              disabled={!form.name.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? 'Création…' : 'Créer la liste'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modale push ciblé → crée un vrai Lead */}
      {pushFor && (
        <div onClick={() => { setPushFor(null); setSerie(null); }} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(26,21,51,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: '100%', background: '#fff', borderRadius: 20, boxShadow: '0 40px 90px -40px rgba(26,21,51,0.6)', padding: 24, fontFamily: "'Manrope',sans-serif" }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 19, color: '#1A1533' }}>Pusher un profil</span>
                  {serie && <span style={{ fontSize: 11, fontWeight: 800, color: '#22177A', background: '#E6E9AF', borderRadius: 999, padding: '3px 10px' }}>Push {serie.idx + 1} / {serie.queue.length}</span>}
                </div>
                <div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 3 }}>{pushFor.name}{pushFor.city ? ` · ${pushFor.city}` : ''}</div>
              </div>
              <button onClick={() => { setPushFor(null); setSerie(null); }} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#F5F4EA', color: '#8A8699', cursor: 'pointer' }}><X size={15} /></button>
            </div>
            {(() => { const sc = matchScore(detail?.candidatCtx, pushFor.contexte); return sc !== null ? (
              <div style={{ marginTop: 12, fontSize: 12, color: matchTone(sc).fg, background: matchTone(sc).bg, borderRadius: 10, padding: '8px 12px', fontWeight: 700 }}>Match {sc}% — {sc >= 75 ? 'recoupement fort, les points communs sont repris tels quels.' : sc >= 40 ? 'recoupement partiel, vérifie les highlights.' : 'peu de recoupement — ce profil n\'est peut-être pas le bon.'}</div>
            ) : null; })()}

            {/* Profil poussé = candidat de la liste (verrouillé) */}
            <div style={pushLabel}>Le profil poussé</div>
            {detail?.candidat ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F2F3D8', border: '1px solid rgba(34,23,122,.14)', borderRadius: 11, padding: '10px 13px' }}>
                <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#22177A', color: '#E6E9AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, flexShrink: 0 }}>{`${(detail.candidat.prenom?.[0] || '')}${detail.candidat.nom[0] || ''}`.toUpperCase()}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1533' }}>{`${detail.candidat.prenom || ''} ${detail.candidat.nom}`.trim()}</div>
                  {detail.candidat.posteActuel && <div style={{ fontSize: 12, color: '#8A8699' }}>{detail.candidat.posteActuel}</div>}
                </div>
                <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, color: '#2C6B3F', background: '#EAF3EC', borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>Dossier prêt · anonymisé</span>
              </div>
            ) : (
              <div style={{ background: '#FBF3E7', border: '1px solid #F0D9B5', borderRadius: 11, padding: '10px 13px', fontSize: 12.5, color: '#8A6A2E' }}>Rattache un profil à cette liste pour pouvoir pusher.</div>
            )}

            {/* Décideur */}
            <div style={pushLabel}>Le décideur</div>
            <div style={{ display: 'grid', gridTemplateColumns: '78px 1fr 1fr', gap: 10 }}>
              <input value={pushForm.civilite} onChange={(e) => setPushForm((f) => ({ ...f, civilite: e.target.value }))} placeholder="Civ." style={pushInputStyle} />
              <input value={pushForm.prenom} onChange={(e) => setPushForm((f) => ({ ...f, prenom: e.target.value }))} placeholder="Prénom" style={pushInputStyle} />
              <input value={pushForm.nom} onChange={(e) => setPushForm((f) => ({ ...f, nom: e.target.value }))} placeholder="Nom *" style={pushInputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <input value={pushForm.email} onChange={(e) => setPushForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email pro" style={pushInputStyle} />
              <input value={pushForm.phone} onChange={(e) => setPushForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Téléphone" style={pushInputStyle} />
            </div>

            {/* Highlights */}
            <div style={pushLabel}>Highlights (recoupement)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {pushForm.highlights.length ? pushForm.highlights.map((h) => (
                <span key={h} style={{ background: '#EAF3EC', color: '#2C6B3F', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{h}</span>
              )) : <span style={{ fontSize: 12, color: '#8A8699' }}>Points forts génériques du candidat (pas de contexte établissement).</span>}
            </div>

            {/* Email anonyme généré (éditable) */}
            <div style={pushLabel}>Email de push (anonyme)</div>
            <textarea value={pushForm.emailBody} onChange={(e) => setPushForm((f) => ({ ...f, emailBody: e.target.value }))} style={{ ...pushInputStyle, minHeight: 190, resize: 'vertical', lineHeight: 1.5 }} />
            <div style={{ fontSize: 11, color: '#8A8699', marginTop: 4 }}>Le nom du candidat n'apparaît jamais. Pièce jointe : dossier de compétences anonymisé.</div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => { setPushFor(null); setSerie(null); }} style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 14, background: '#fff', color: '#22177A', border: '1.5px solid rgba(34,23,122,.2)', borderRadius: 12, padding: '12px 18px', cursor: 'pointer' }}>Annuler</button>
              {serie && <button onClick={serieAdvance} style={{ fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 14, background: '#F5F4EA', color: '#6E6A85', border: 'none', borderRadius: 12, padding: '12px 18px', cursor: 'pointer' }}>Passer</button>}
              <button onClick={submitPush} disabled={pushMutation.isPending || !detail?.candidat} style={{ flex: 1, fontFamily: "'Manrope',sans-serif", fontWeight: 700, fontSize: 15, background: detail?.candidat ? '#22177A' : '#C4C1D0', color: '#E6E9AF', border: 'none', borderRadius: 12, padding: 13, cursor: detail?.candidat ? 'pointer' : 'not-allowed', opacity: pushMutation.isPending ? 0.6 : 1 }}>{pushMutation.isPending ? 'Envoi…' : (serie ? 'Envoyer et suivant' : 'Envoyer et créer le lead')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const pushInputStyle: React.CSSProperties = { width: '100%', fontFamily: "'Manrope',sans-serif", fontSize: 14, padding: '10px 12px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,0.14)', background: '#FCFCF5', color: '#1A1533', outline: 'none', boxSizing: 'border-box' };
const pushLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.09em', color: '#8A8699', margin: '18px 0 8px' };
