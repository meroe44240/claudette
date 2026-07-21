/**
 * Portail client — kanban en lecture d'un mandat.
 *
 * URL : /portail/mandat/:mandatId
 * Session portail dans sessionStorage (token expire 4h).
 * Drawer profil au click sur une carte. Actions : rencontrer / à discuter
 * / écarter (avec raison). Commentaire textuel.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, MessageSquare, X, CheckCircle2, HelpCircle, XCircle } from 'lucide-react';

// ── Types ────────────────────────────────────────────

type Stage =
  | 'SOURCING'
  | 'CONTACTE'
  | 'ENTRETIEN_1'
  | 'ENVOYE_CLIENT'
  | 'ENTRETIEN_CLIENT'
  | 'OFFRE'
  | 'PLACE'
  | 'REFUSE';

type Decision = 'RENCONTRER' | 'A_DISCUTER' | 'ECARTER';

interface Candidature {
  id: string;
  stage: Stage;
  dateEntretienClient: string | null;
  candidat: {
    id: string;
    nom: string;
    prenom: string | null;
    posteActuel: string | null;
    entrepriseActuelle: string | null;
    aiPitchShort: string | null;
    aiAnonymizedProfile: any;
  };
  portalDecisions: Array<{ decision: Decision; createdAt: string }>;
}

interface KanbanResponse {
  mandat: {
    id: string;
    titrePoste: string;
    visibleStages: Stage[];
    entreprise: { nom: string };
    client: { nom: string; prenom: string | null };
  };
  stages: Stage[];
  byStage: Record<Stage, Candidature[]>;
}

const STAGE_LABELS: Record<Stage, string> = {
  SOURCING: 'Sourcing',
  CONTACTE: 'Contactés',
  ENTRETIEN_1: 'Entretien recruteur',
  ENVOYE_CLIENT: 'Nouveaux profils',
  ENTRETIEN_CLIENT: 'Entretien avec vous',
  OFFRE: 'Offre',
  PLACE: 'Placé',
  REFUSE: 'Refusé',
};
const STAGE_COLORS: Record<Stage, string> = {
  SOURCING: '#8e7cc3',
  CONTACTE: '#4b3fb0',
  ENTRETIEN_1: '#22177A',
  ENVOYE_CLIENT: '#E6E9AF',
  ENTRETIEN_CLIENT: '#22177A',
  OFFRE: '#2a6bd8',
  PLACE: '#3b9a54',
  REFUSE: '#b0361f',
};
const DECISION_LABEL: Record<Decision, string> = {
  RENCONTRER: 'À rencontrer',
  A_DISCUTER: 'À discuter',
  ECARTER: 'Écarté',
};
const DECISION_TONE: Record<Decision, { bg: string; fg: string }> = {
  RENCONTRER: { bg: '#eaf3ec', fg: '#3b9a54' },
  A_DISCUTER: { bg: '#fbf3e7', fg: '#b47814' },
  ECARTER: { bg: '#f9ece9', fg: '#b0361f' },
};

// ── API helpers ──────────────────────────────────────

function portalFetch(path: string, init?: RequestInit) {
  const token = sessionStorage.getItem('portal_token');
  return fetch(`/api/v1/portal${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

// ── Page ─────────────────────────────────────────────

export default function PortalMandatPage() {
  const { mandatId } = useParams<{ mandatId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<KanbanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Candidature | null>(null);

  useEffect(() => {
    const token = sessionStorage.getItem('portal_token');
    if (!token) {
      navigate(`/portail/login?m=${mandatId ?? ''}`);
      return;
    }
    document.title = 'Portail client — HumanUp';
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mandatId]);

  async function reload() {
    setLoading(true);
    try {
      const res = await portalFetch('/kanban');
      if (res.status === 401) {
        sessionStorage.clear();
        navigate(`/portail/login?m=${mandatId ?? ''}`);
        return;
      }
      const body = (await res.json()) as KanbanResponse;
      setData(body);
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    sessionStorage.clear();
    navigate(`/portail/login?m=${mandatId ?? ''}`);
  }

  if (loading || !data) {
    return (
      <div style={{ background: '#FCFCF5', minHeight: '100vh' }} className="flex items-center justify-center">
        <p className="text-neutral-400">Chargement…</p>
      </div>
    );
  }

  return (
    <div style={{ background: '#FCFCF5', minHeight: '100vh' }} className="flex flex-col">
      {/* Top bar */}
      <header
        className="flex items-center justify-between border-b border-neutral-100 px-6 py-3"
        style={{ background: 'white' }}
      >
        <div className="flex items-center gap-3">
          <img src="/brand/logo-mark-navy.png" alt="HumanUp" className="h-8 w-auto" />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">Portail client</p>
            <p style={{ fontFamily: "'Archivo Black', sans-serif", letterSpacing: '-0.01em', color: '#1A1533' }} className="text-lg leading-tight">
              {data.mandat.entreprise.nom} · {data.mandat.titrePoste}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100"
        >
          <LogOut size={14} /> Déconnexion
        </button>
      </header>

      {/* Body */}
      <main className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4">
          {data.stages.map((stage) => {
            const items = data.byStage[stage] ?? [];
            const color = STAGE_COLORS[stage];
            return (
              <div key={stage} className="flex w-[300px] shrink-0 flex-col rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 h-[3px] rounded-full" style={{ background: color }} />
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-neutral-800">{STAGE_LABELS[stage]}</h3>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-600">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map((c) => {
                    const lastDecision = c.portalDecisions[0]?.decision;
                    const fullName = `${c.candidat.prenom || ''} ${c.candidat.nom}`.trim();
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelected(c);
                          void portalFetch(`/candidatures/${c.id}/view`, { method: 'POST' });
                        }}
                        className="w-full rounded-xl border border-neutral-100 bg-white p-3 text-left transition-all hover:-translate-y-[1px] hover:shadow-md"
                      >
                        <p className="text-sm font-semibold text-neutral-900">{fullName || '(sans nom)'}</p>
                        {(c.candidat.posteActuel || c.candidat.entrepriseActuelle) && (
                          <p className="mt-0.5 line-clamp-1 text-[12px] text-neutral-500">
                            {[c.candidat.posteActuel, c.candidat.entrepriseActuelle].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {c.candidat.aiPitchShort && (
                          <p className="mt-1.5 line-clamp-2 text-[12px] text-neutral-500">
                            {c.candidat.aiPitchShort}
                          </p>
                        )}
                        {lastDecision && (
                          <span
                            className="mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ background: DECISION_TONE[lastDecision].bg, color: DECISION_TONE[lastDecision].fg }}
                          >
                            {DECISION_LABEL[lastDecision]}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {items.length === 0 && (
                    <p className="py-4 text-center text-[12px] text-neutral-300">Aucun profil pour l'instant</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Drawer profil */}
      <AnimatePresence>
        {selected && (
          <ProfileDrawer
            candidature={selected}
            onClose={() => setSelected(null)}
            onDecision={async (decision, reason) => {
              const res = await portalFetch(`/candidatures/${selected.id}/decision`, {
                method: 'POST',
                body: JSON.stringify({ decision, reason }),
              });
              if (res.ok) {
                setSelected(null);
                void reload();
              }
            }}
            onComment={async (content) => {
              const res = await portalFetch(`/candidatures/${selected.id}/comment`, {
                method: 'POST',
                body: JSON.stringify({ content }),
              });
              if (res.ok) return true;
              return false;
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Drawer profil ────────────────────────────────────

function ProfileDrawer({
  candidature: c,
  onClose,
  onDecision,
  onComment,
}: {
  candidature: Candidature;
  onClose: () => void;
  onDecision: (d: Decision, reason?: string) => Promise<void>;
  onComment: (content: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [pendingDecision, setPendingDecision] = useState<Decision | null>(null);
  const [commentSent, setCommentSent] = useState(false);

  const fullName = `${c.candidat.prenom || ''} ${c.candidat.nom}`.trim() || '(sans nom)';
  const lastDecision = c.portalDecisions[0]?.decision;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[440px] flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <header className="sticky top-0 flex items-start justify-between border-b border-neutral-100 bg-white px-6 py-4">
          <div>
            <h2 style={{ fontFamily: "'Archivo Black', sans-serif", letterSpacing: '-0.01em' }} className="text-xl text-neutral-900">
              {fullName}
            </h2>
            {(c.candidat.posteActuel || c.candidat.entrepriseActuelle) && (
              <p className="text-sm text-neutral-500">
                {[c.candidat.posteActuel, c.candidat.entrepriseActuelle].filter(Boolean).join(' · ')}
              </p>
            )}
            {lastDecision && (
              <span
                className="mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: DECISION_TONE[lastDecision].bg, color: DECISION_TONE[lastDecision].fg }}
              >
                {DECISION_LABEL[lastDecision]}
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-6 px-6 py-6">
          {/* Pitch */}
          {c.candidat.aiPitchShort && (
            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Pitch</h3>
              <p className="text-sm text-neutral-700">{c.candidat.aiPitchShort}</p>
            </section>
          )}

          {/* Profil anonymisé */}
          {c.candidat.aiAnonymizedProfile && (
            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Profil</h3>
              <pre className="whitespace-pre-wrap rounded-lg bg-neutral-50 p-3 text-[12px] text-neutral-700">
                {typeof c.candidat.aiAnonymizedProfile === 'string'
                  ? c.candidat.aiAnonymizedProfile
                  : JSON.stringify(c.candidat.aiAnonymizedProfile, null, 2)}
              </pre>
            </section>
          )}

          {/* Décision */}
          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Votre décision</h3>
            <div className="grid grid-cols-3 gap-2">
              <DecisionButton
                icon={<CheckCircle2 size={16} />}
                label="Rencontrer"
                active={pendingDecision === 'RENCONTRER'}
                tone={DECISION_TONE.RENCONTRER}
                onClick={() => setPendingDecision('RENCONTRER')}
              />
              <DecisionButton
                icon={<HelpCircle size={16} />}
                label="À discuter"
                active={pendingDecision === 'A_DISCUTER'}
                tone={DECISION_TONE.A_DISCUTER}
                onClick={() => setPendingDecision('A_DISCUTER')}
              />
              <DecisionButton
                icon={<XCircle size={16} />}
                label="Écarter"
                active={pendingDecision === 'ECARTER'}
                tone={DECISION_TONE.ECARTER}
                onClick={() => setPendingDecision('ECARTER')}
              />
            </div>
            {pendingDecision && (
              <div className="mt-3">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder={
                    pendingDecision === 'RENCONTRER'
                      ? 'Contexte ou dispo (optionnel)'
                      : pendingDecision === 'ECARTER'
                        ? 'Raison (optionnel — nous aide à mieux cibler la suite)'
                        : 'Vos questions (optionnel)'
                  }
                  className="w-full rounded-xl border-[1.5px] border-neutral-100 bg-white px-3 py-2 text-sm outline-none focus:border-[#22177A]"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => { setPendingDecision(null); setReason(''); }}
                    className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => onDecision(pendingDecision, reason.trim() || undefined)}
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
                    style={{ background: '#22177A' }}
                  >
                    Confirmer
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Commentaire libre */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              <MessageSquare size={11} /> Commentaire au recruteur
            </h3>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Ex : Peut-on avoir plus d'infos sur son expérience en X ?"
              className="w-full rounded-xl border-[1.5px] border-neutral-100 bg-white px-3 py-2 text-sm outline-none focus:border-[#22177A]"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              {commentSent ? (
                <span className="inline-flex items-center gap-1 text-[12px] text-green-700">
                  <CheckCircle2 size={13} /> Envoyé
                </span>
              ) : (
                <span />
              )}
              <button
                onClick={async () => {
                  if (!comment.trim()) return;
                  const ok = await onComment(comment.trim());
                  if (ok) {
                    setCommentSent(true);
                    setComment('');
                    setTimeout(() => setCommentSent(false), 3000);
                  }
                }}
                disabled={!comment.trim()}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: '#22177A' }}
              >
                Envoyer
              </button>
            </div>
          </section>
        </div>
      </motion.aside>
    </>
  );
}

function DecisionButton({
  icon,
  label,
  active,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  tone: { bg: string; fg: string };
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-xl border p-3 text-[11px] font-semibold transition-all"
      style={{
        background: active ? tone.bg : 'white',
        borderColor: active ? tone.fg : '#eceaf2',
        color: active ? tone.fg : '#6e6a85',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
