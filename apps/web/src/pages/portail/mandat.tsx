/**
 * Portail client — vue « Suivi Client » d'un mandat (design pack).
 * URL : /portail/mandat/:mandatId — session portail (sessionStorage, 4h).
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { LogOut, X, Check, MessageSquare, Users } from 'lucide-react';

type Stage = 'SOURCING' | 'CONTACTE' | 'ENTRETIEN_1' | 'ENVOYE_CLIENT' | 'ENTRETIEN_CLIENT' | 'OFFRE' | 'PLACE' | 'REFUSE';
type Decision = 'RENCONTRER' | 'A_DISCUTER' | 'ECARTER';

interface Candidature {
  id: string; stage: Stage; dateEntretienClient: string | null;
  candidat: { id: string; nom: string; prenom: string | null; posteActuel: string | null; entrepriseActuelle: string | null; aiPitchShort: string | null; aiAnonymizedProfile: any };
  portalDecisions: Array<{ decision: Decision; createdAt: string }>;
}
interface KanbanResponse {
  mandat: { id: string; titrePoste: string; visibleStages: Stage[]; entreprise: { nom: string }; client: { nom: string; prenom: string | null } };
  stages: Stage[];
  byStage: Record<Stage, Candidature[]>;
}

const STAGE_LABELS: Record<Stage, string> = {
  SOURCING: 'Sourcing', CONTACTE: 'Contactés', ENTRETIEN_1: 'Entretien recruteur', ENVOYE_CLIENT: 'Nouveaux profils',
  ENTRETIEN_CLIENT: 'Entretien avec vous', OFFRE: 'Offre', PLACE: 'Placé', REFUSE: 'Écartés',
};
const STAGE_ACCENT: Record<Stage, string> = {
  SOURCING: '#8E7CC3', CONTACTE: '#8E7CC3', ENTRETIEN_1: '#22177A', ENVOYE_CLIENT: '#2A6BD8',
  ENTRETIEN_CLIENT: '#E08A2B', OFFRE: '#C9A227', PLACE: '#3B9A54', REFUSE: '#B3261E',
};
const STAGE_BG: Record<Stage, string> = {
  SOURCING: '#F6F4FB', CONTACTE: '#F6F4FB', ENTRETIEN_1: 'rgba(34,23,122,.05)', ENVOYE_CLIENT: '#F2F3D8',
  ENTRETIEN_CLIENT: '#FBF7F0', OFFRE: '#FBFAEC', PLACE: '#EFF6F0', REFUSE: '#FBF1EF',
};
const DECISION_LABEL: Record<Decision, string> = { RENCONTRER: 'À rencontrer', A_DISCUTER: 'À discuter', ECARTER: 'Écarté' };
const DECISION_TONE: Record<Decision, { bg: string; fg: string }> = {
  RENCONTRER: { bg: '#EAF3EC', fg: '#2C6B3F' }, A_DISCUTER: { bg: '#FBF3E7', fg: '#8A6A2E' }, ECARTER: { bg: '#F9ECE9', fg: '#B0361F' },
};

function portalFetch(path: string, init?: RequestInit) {
  const token = sessionStorage.getItem('portal_token');
  return fetch(`/api/v1/portal${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers as Record<string, string> | undefined) } });
}
function fullName(c: Candidature) { return `${c.candidat.prenom || ''} ${c.candidat.nom}`.trim() || '(profil)'; }
function initials(c: Candidature) { return `${(c.candidat.prenom?.[0] ?? '')}${c.candidat.nom?.[0] ?? ''}`.toUpperCase() || '?'; }

export default function PortalMandatPage() {
  const { mandatId } = useParams<{ mandatId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<KanbanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Candidature | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem('portal_token');
    if (!token) { navigate(`/portail/login?m=${mandatId ?? ''}`); return; }
    document.title = 'Portail client — HumanUp';
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandatId]);

  async function reload() {
    setLoading(true);
    try {
      const res = await portalFetch('/kanban');
      if (res.status === 401) { sessionStorage.clear(); navigate(`/portail/login?m=${mandatId ?? ''}`); return; }
      setData((await res.json()) as KanbanResponse);
    } finally { setLoading(false); }
  }
  function handleLogout() { sessionStorage.clear(); navigate(`/portail/login?m=${mandatId ?? ''}`); }

  if (loading || !data) return <div style={{ background: '#F4F4EA', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9A96AE', fontFamily: "'Manrope',sans-serif" }}>Chargement…</div>;

  const rep = `${data.mandat.client.prenom ? data.mandat.client.prenom + ' ' : ''}${data.mandat.client.nom}`.trim();

  return (
    <div style={{ background: '#F4F4EA', minHeight: '100vh', fontFamily: "'Manrope',sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .pm-card{ transition:transform .18s cubic-bezier(.16,1,.3,1), box-shadow .2s ease, border-color .18s ease; }
        .pm-card:hover{ transform:translateY(-2px); box-shadow:0 16px 30px -20px rgba(34,23,122,.4); border-color:rgba(34,23,122,.2) !important; }
        .pm-dec:hover{ transform:translateY(-1px); }
        .pm-dec{ transition:transform .15s ease; }
      `}</style>

      {/* TOP BAR */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 28px', background: '#22177A' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <img src="/brand/logo-mark-cream.png" alt="" style={{ width: 26, height: 26 }} />
          <span style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 18, letterSpacing: '.01em', color: '#E6E9AF' }}>HUMANUP</span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(230,233,175,.55)' }}>Portail client</span>
        </div>
        <button onClick={handleLogout} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: 'rgba(230,233,175,.85)', background: 'rgba(230,233,175,.12)', border: '1px solid rgba(230,233,175,.2)', borderRadius: 9, padding: '7px 13px', cursor: 'pointer' }}><LogOut size={14} />Déconnexion</button>
      </header>

      {/* HERO */}
      <div style={{ padding: '26px 34px 6px' }}>
        <div style={{ fontSize: 13, color: '#9A96AE', fontWeight: 600 }}>Suivi de recrutement · {data.mandat.entreprise.nom}</div>
        <h1 style={{ fontFamily: "'Archivo Black',sans-serif", fontSize: 30, letterSpacing: '-.03em', color: '#1A1533', marginTop: 5 }}>{data.mandat.titrePoste}</h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: '#6E6A85', marginTop: 8, maxWidth: 660 }}>Cliquez un profil pour voir le dossier complet et donner votre avis — votre consultant HumanUp est notifié immédiatement.</p>
      </div>

      {/* BOARD */}
      <main style={{ flex: 1, overflowX: 'auto', padding: '20px 34px 40px' }}>
        <div style={{ display: 'flex', gap: 16, minHeight: 0 }}>
          {data.stages.map(stage => {
            const items = data.byStage[stage] ?? [];
            return (
              <div key={stage} style={{ flex: '0 0 300px', background: STAGE_BG[stage], border: '1px solid rgba(34,23,122,.07)', borderRadius: 18, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ height: 4, background: STAGE_ACCENT[stage] }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 15px 10px' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: STAGE_ACCENT[stage] }} />
                  <span style={{ fontWeight: 800, fontSize: 13.5, color: '#1A1533' }}>{STAGE_LABELS[stage]}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: STAGE_ACCENT[stage], background: 'rgba(255,255,255,.7)', borderRadius: 999, padding: '2px 9px' }}>{items.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 12px 14px' }}>
                  {items.length === 0 && <div style={{ padding: '24px 10px', textAlign: 'center', fontSize: 12, color: '#B4B0C4' }}>Aucun profil pour l'instant</div>}
                  {items.map(c => {
                    const last = c.portalDecisions[0]?.decision;
                    return (
                      <div key={c.id} className="pm-card" onClick={() => { setSelected(c); void portalFetch(`/candidatures/${c.id}/view`, { method: 'POST' }); }} style={{ background: '#fff', border: '1px solid rgba(34,23,122,.08)', borderRadius: 13, padding: 14, boxShadow: '0 1px 2px rgba(34,23,122,.05)', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: '50%', background: '#22177A', color: '#E6E9AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black',sans-serif", fontSize: 12 }}>{initials(c)}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1533', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(c)}</div>
                            {(c.candidat.posteActuel || c.candidat.entrepriseActuelle) && <div style={{ fontSize: 12, color: '#8A8699', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[c.candidat.posteActuel, c.candidat.entrepriseActuelle].filter(Boolean).join(' · ')}</div>}
                          </div>
                        </div>
                        {c.candidat.aiPitchShort && <p style={{ fontSize: 12, lineHeight: 1.5, color: '#6E6A85', marginTop: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>{c.candidat.aiPitchShort}</p>}
                        {last && <span style={{ display: 'inline-flex', marginTop: 10, fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: '3px 10px', background: DECISION_TONE[last].bg, color: DECISION_TONE[last].fg }}>{DECISION_LABEL[last]}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {selected && (
        <ProfileDrawer
          candidature={selected}
          repName={rep}
          onClose={() => setSelected(null)}
          onDecision={async (decision, reason) => {
            const res = await portalFetch(`/candidatures/${selected.id}/decision`, { method: 'POST', body: JSON.stringify({ decision, reason }) });
            if (res.ok) { setSelected(null); void reload(); }
          }}
          onComment={async (content) => {
            const res = await portalFetch(`/candidatures/${selected.id}/comment`, { method: 'POST', body: JSON.stringify({ content }) });
            return res.ok;
          }}
        />
      )}
    </div>
  );
}

// ─── DRAWER ─────────────────────────────────────────
function ProfileDrawer({ candidature: c, repName, onClose, onDecision, onComment }: {
  candidature: Candidature; repName: string;
  onClose: () => void;
  onDecision: (d: Decision, reason?: string) => Promise<void>;
  onComment: (content: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const last = c.portalDecisions[0]?.decision;
  const profile = c.candidat.aiAnonymizedProfile;
  const bullets: string[] = Array.isArray(profile?.bulletPoints) ? profile.bulletPoints : Array.isArray(profile?.highlights) ? profile.highlights : [];

  const decide = async (d: Decision) => {
    if (d === 'ECARTER' && !reason.trim()) { return; }
    setBusy(true);
    try { await onDecision(d, d === 'ECARTER' ? reason.trim() : undefined); } finally { setBusy(false); }
  };
  const submitComment = async () => {
    const t = comment.trim(); if (!t) return;
    setBusy(true);
    const ok = await onComment(t);
    setBusy(false);
    if (ok) { setComment(''); setSent(true); setTimeout(() => setSent(false), 2200); }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(26,21,51,.42)' }} />
      <aside style={{ position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 61, width: 460, maxWidth: '94vw', background: '#FCFCF5', boxShadow: '-26px 0 70px -30px rgba(26,21,51,.55)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flexShrink: 0, background: '#22177A', padding: '20px 22px', position: 'relative', overflow: 'hidden' }}>
          <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(230,233,175,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(230,233,175,.05) 1px,transparent 1px)', backgroundSize: '36px 36px' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(230,233,175,.7)' }}>Dossier candidat</span>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(230,233,175,.25)', background: 'transparent', color: '#E6E9AF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} strokeWidth={2.4} /></button>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 13, marginTop: 16 }}>
            <span style={{ flexShrink: 0, width: 54, height: 54, borderRadius: 16, background: '#E6E9AF', color: '#22177A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Archivo Black',sans-serif", fontSize: 18 }}>{initials(c)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 18, color: '#fff' }}>{fullName(c)}</div>
              {(c.candidat.posteActuel || c.candidat.entrepriseActuelle) && <div style={{ fontSize: 12.5, color: '#E6E9AF', fontWeight: 600, marginTop: 3 }}>{[c.candidat.posteActuel, c.candidat.entrepriseActuelle].filter(Boolean).join(' · ')}</div>}
              {last && <span style={{ display: 'inline-flex', marginTop: 7, fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: '3px 10px', background: DECISION_TONE[last].bg, color: DECISION_TONE[last].fg }}>{DECISION_LABEL[last]}</span>}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 22px 24px' }}>
          {c.candidat.aiPitchShort && (
            <>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE' }}>Synthèse</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#4A4568', marginTop: 9 }}>{c.candidat.aiPitchShort}</p>
            </>
          )}
          {bullets.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bullets.slice(0, 6).map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 6, background: '#F2F3D8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}><Check size={11} color="#22177A" strokeWidth={2.6} /></span>
                  <span style={{ fontSize: 13, lineHeight: 1.5, color: '#4A4568' }}>{b}</span>
                </div>
              ))}
            </div>
          )}
          {!c.candidat.aiPitchShort && bullets.length === 0 && <p style={{ fontSize: 13.5, color: '#8A8699' }}>Le dossier détaillé sera disponible sous peu.</p>}

          {/* DECISION */}
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE', marginTop: 24 }}>Votre avis</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 10 }}>
            <button className="pm-dec" disabled={busy} onClick={() => decide('RENCONTRER')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', borderRadius: 12, border: '1.5px solid rgba(59,154,84,.28)', background: '#EAF3EC', color: '#2C6B3F', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}><Check size={17} />Rencontrer</button>
            <button className="pm-dec" disabled={busy} onClick={() => decide('A_DISCUTER')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', borderRadius: 12, border: '1.5px solid rgba(201,162,39,.3)', background: '#FBF3E7', color: '#8A6A2E', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}><MessageSquare size={17} />À discuter</button>
            <button className="pm-dec" disabled={busy || !reason.trim()} onClick={() => decide('ECARTER')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 8px', borderRadius: 12, border: '1.5px solid rgba(176,54,31,.28)', background: '#F9ECE9', color: '#B0361F', cursor: reason.trim() ? 'pointer' : 'default', fontWeight: 800, fontSize: 12, opacity: reason.trim() ? 1 : 0.55 }}><X size={17} />Écarter</button>
          </div>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motif (obligatoire pour écarter)…" style={{ width: '100%', marginTop: 10, fontSize: 13, padding: '11px 13px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,.14)', background: '#fff', outline: 'none' }} />

          {/* COMMENT */}
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.13em', textTransform: 'uppercase', color: '#9A96AE', marginTop: 24 }}>Un message pour {repName || 'votre consultant'} ?</div>
          <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Une question, une remarque…" style={{ width: '100%', minHeight: 80, resize: 'vertical', marginTop: 10, fontFamily: "'Manrope',sans-serif", fontSize: 13.5, lineHeight: 1.5, padding: '11px 13px', borderRadius: 11, border: '1.5px solid rgba(34,23,122,.14)', background: '#fff', outline: 'none' }} />
          <button disabled={busy || !comment.trim()} onClick={submitComment} style={{ width: '100%', marginTop: 10, fontSize: 13.5, fontWeight: 800, background: comment.trim() ? '#22177A' : '#C4C1D0', color: '#E6E9AF', border: 'none', borderRadius: 11, padding: 12, cursor: comment.trim() ? 'pointer' : 'default' }}>{sent ? 'Envoyé ✓' : 'Envoyer'}</button>
        </div>
      </aside>
    </>
  );
}
