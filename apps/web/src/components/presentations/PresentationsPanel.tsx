import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Send, Plus, Check, X, FileText, Bot } from 'lucide-react';
import { api } from '../../lib/api-client';
import { t, LOCALE } from '../../lib/i18n';
import { toast } from '../ui/Toast';

// Présentations d'un candidat (fiche candidat) ou à une société (fiche société).

export interface Presentation {
  id: string;
  candidate: { id: string; name?: string; title?: string | null };
  company: { id: string; name?: string };
  channel: string; status: string; candidate_consent: boolean; anonymous: boolean;
  cv_url: string | null; note: string | null; source: string;
  presented_by: { id: string; name: string; is_agent: boolean } | null;
  presented_at: string;
}
interface PushStatus {
  status: 'not_ready' | 'ready' | 'pushed' | 'placed'; missing: string[]; anonymized_cv_url: string;
  presentations: { count: number; companies: Array<{ id: string; name?: string }> };
}

export const STATUTS: Record<string, { label: string; bg: string; fg: string }> = {
  ENVOYEE: { label: t('Envoyée'), bg: '#E8EEF9', fg: '#2A4A8A' },
  SANS_REPONSE: { label: t('Sans réponse'), bg: 'rgba(34,23,122,.06)', fg: '#6E6A85' },
  INTERESSE: { label: t('Intéressé'), bg: '#FBF3E7', fg: '#8A6A2E' },
  ENTRETIEN: { label: t('Entretien'), bg: '#EFEAF9', fg: '#5B3FA0' },
  REFUSEE: { label: t('Refusée'), bg: '#F7DEDB', fg: '#B3261E' },
  EMBAUCHE: { label: t('Embauché'), bg: '#EAF3EC', fg: '#2C6B3F' },
};
const CANAUX: Record<string, string> = {
  EMAIL: t('Email'), LINKEDIN: 'LinkedIn', TELEPHONE: t('Téléphone'), PORTAIL: t('Portail'), RDV: t('Rendez-vous'), AUTRE: t('Autre'),
};
const SOURCES: Record<string, string> = { PIPELINE: t('Pipeline'), LIST_PUSH: 'List Push', GMAIL: 'Gmail', REPRISE: t('Historique'), MANUEL: t('Manuel') };
const MISSING: Record<string, string> = { cv: t('CV'), cv_consent: t('accord pour transmettre le CV') };

const card: React.CSSProperties = { background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 15, padding: 18, boxShadow: '0 1px 2px rgba(34,23,122,.04)' };
const input: React.CSSProperties = { fontSize: 13, padding: '9px 11px', borderRadius: 9, border: '1.5px solid rgba(34,23,122,.14)', background: '#FCFCF5', outline: 'none', color: '#1A1533', minWidth: 0 };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: '#22177A', background: '#fff', border: '1px solid rgba(34,23,122,.16)', borderRadius: 9, padding: '7px 13px', cursor: 'pointer' };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });

export function usePresentations(mode: 'candidat' | 'entreprise', id?: string) {
  return useQuery({
    queryKey: ['presentations', mode, id],
    queryFn: () => api.get<{ total: number; data: Presentation[] }>(`/presentations?${mode === 'candidat' ? 'candidatId' : 'entrepriseId'}=${id}`),
    enabled: !!id,
  });
}

function PushStatusBox({ candidatId }: { candidatId: string }) {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ['push-status', candidatId], queryFn: () => api.get<PushStatus>(`/presentations/push-status/${candidatId}`) });
  if (!data) return null;
  const label = data.status === 'placed' ? t('Placé')
    : data.status === 'not_ready' ? t('Pas prêt à pousser')
    : data.status === 'ready' ? t('Prêt à pousser')
    : t('Poussé à {n} société(s)', { n: data.presentations.companies.length });
  const color = data.status === 'not_ready' ? '#B3261E' : data.status === 'ready' ? '#2C6B3F' : '#22177A';
  const link = new URL(data.anonymized_cv_url, window.location.origin);
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <span style={{ width: 38, height: 38, borderRadius: 11, background: '#F2F3D8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Send size={17} color="#22177A" /></span>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color }}>{label}</div>
        {data.missing.length > 0 && <div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 2 }}>{t('Manque : {liste}', { liste: data.missing.map((m) => MISSING[m] ?? m).join(', ') })}</div>}
      </div>
      <button style={btn} onClick={() => navigate(link.pathname + link.search)}><FileText size={13} />{t('One-pager anonymisé')}</button>
    </div>
  );
}

function AddForm({ mode, id, onDone }: { mode: 'candidat' | 'entreprise'; id: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [debQ, setDebQ] = useState('');
  const [target, setTarget] = useState<{ id: string; label: string } | null>(null);
  const [canal, setCanal] = useState('EMAIL');
  const [accord, setAccord] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => { const h = setTimeout(() => setDebQ(q), 300); return () => clearTimeout(h); }, [q]);
  const other = mode === 'candidat' ? 'entreprises' : 'candidats';
  const { data: found } = useQuery({
    queryKey: ['presentation-target', other, debQ],
    queryFn: () => api.get<{ data: any[] }>(`/${other}?perPage=6&search=${encodeURIComponent(debQ)}`),
    enabled: debQ.trim().length >= 2 && !target,
  });
  const mut = useMutation({
    mutationFn: () => api.post('/presentations', {
      candidatId: mode === 'candidat' ? id : target!.id,
      entrepriseId: mode === 'entreprise' ? id : target!.id,
      canal, accordCandidat: accord, note: note.trim() || null,
    }),
    onSuccess: () => {
      toast('success', t('Présentation enregistrée'));
      qc.invalidateQueries({ queryKey: ['presentations'] });
      qc.invalidateQueries({ queryKey: ['push-status'] });
      onDone();
    },
    onError: (e: any) => toast('error', e?.message || t('Échec de l’enregistrement')),
  });
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {target ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1533' }}>{target.label}</span>
          <button onClick={() => setTarget(null)} aria-label={t('Changer')} style={{ ...btn, padding: '4px 8px' }}><X size={12} /></button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === 'candidat' ? t('Société…') : t('Candidat…')} style={{ ...input, width: '100%' }} aria-label={mode === 'candidat' ? t('Société') : t('Candidat')} />
          {(found?.data?.length ?? 0) > 0 && (
            <div style={{ position: 'absolute', zIndex: 5, top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid rgba(34,23,122,.14)', borderRadius: 10, boxShadow: '0 12px 30px -18px rgba(34,23,122,.5)', overflow: 'hidden' }}>
              {found!.data.map((r) => {
                const label = mode === 'candidat' ? r.nom : [r.prenom, r.nom].filter(Boolean).join(' ');
                return <button key={r.id} onClick={() => { setTarget({ id: r.id, label }); setQ(''); }} style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 13, padding: '9px 12px', border: 'none', background: '#fff', cursor: 'pointer', color: '#1A1533' }}>{label}</button>;
              })}
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={canal} onChange={(e) => setCanal(e.target.value)} style={input} aria-label={t('Canal')}>
          {Object.entries(CANAUX).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#4A4568' }}>
          <input type="checkbox" checked={accord} onChange={(e) => setAccord(e.target.checked)} />{t('Accord du candidat')}
        </label>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Note (facultatif)')} style={input} aria-label={t('Note')} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button style={btn} onClick={onDone}>{t('Annuler')}</button>
        <button disabled={!target || mut.isPending} onClick={() => mut.mutate()} style={{ ...btn, background: '#22177A', color: '#E6E9AF', border: 'none', opacity: target ? 1 : 0.5 }}>{t('Enregistrer')}</button>
      </div>
    </div>
  );
}

export default function PresentationsPanel({ mode, id }: { mode: 'candidat' | 'entreprise'; id: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const { data } = usePresentations(mode, id);
  const rows = data?.data ?? [];
  const statusMut = useMutation({
    mutationFn: ({ pid, statut }: { pid: string; statut: string }) => api.put(`/presentations/${pid}`, { statut }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['presentations'] }); qc.invalidateQueries({ queryKey: ['push-status'] }); },
    onError: (e: any) => toast('error', e?.message || t('Échec de la mise à jour')),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {mode === 'candidat' && <PushStatusBox candidatId={id} />}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: '#1A1533' }}>{mode === 'candidat' ? t('Présenté à') : t('Candidats présentés')}</span>
        {!adding && <button style={btn} onClick={() => setAdding(true)}><Plus size={13} />{t('Ajouter')}</button>}
      </div>
      {adding && <AddForm mode={mode} id={id} onDone={() => setAdding(false)} />}
      {rows.length === 0 && !adding && <div style={{ ...card, textAlign: 'center', color: '#8A8699', fontSize: 13.5 }}>{t('Aucune présentation.')}</div>}
      {rows.map((p) => {
        const st = STATUTS[p.status] ?? STATUTS.ENVOYEE;
        const other = mode === 'candidat' ? p.company : p.candidate;
        return (
          <div key={p.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <a onClick={() => navigate(mode === 'candidat' ? `/entreprises/${p.company.id}` : `/candidats/${p.candidate.id}`)} style={{ fontSize: 14.5, fontWeight: 800, color: '#1A1533', cursor: 'pointer' }}>{other.name ?? '?'}</a>
              <div style={{ fontSize: 12.5, color: '#8A8699', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span>{fmtDate(p.presented_at)}</span>
                <span>· {CANAUX[p.channel] ?? p.channel}</span>
                {p.presented_by && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>· {p.presented_by.is_agent && <Bot size={12} />}{p.presented_by.name}</span>}
                <span>· {SOURCES[p.source] ?? p.source}</span>
                {p.candidate_consent && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#2C6B3F', fontWeight: 700 }}>· <Check size={12} />{t('accord')}</span>}
              </div>
              {p.note && <div style={{ fontSize: 13, color: '#4A4568', marginTop: 6 }}>{p.note}</div>}
            </div>
            <select
              value={p.status}
              onChange={(e) => statusMut.mutate({ pid: p.id, statut: e.target.value })}
              aria-label={t('Statut')}
              style={{ fontSize: 12, fontWeight: 800, color: st.fg, background: st.bg, border: 'none', borderRadius: 999, padding: '6px 12px', cursor: 'pointer' }}
            >
              {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}
