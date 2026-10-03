// Fiche candidat : bloc « Espace candidat ». Ouvre l'espace après le premier call
// (attentes pré-remplies par l'IA depuis la fiche et les calls, relues ici), suit
// l'activation, et liste les refus dont le feedback au candidat reste à écrire.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { toast } from '../ui/Toast';
import Modal from '../ui/Modal';

interface Status {
  canOpen: boolean; blocker: string | null;
  account: { email: string; profile: 'TECH' | 'SALES'; invitedAt: string | null; activatedAt: string | null; lastLoginAt: string | null; revokedAt: string | null } | null;
  feedbackMissing: Array<{ candidatureId: string; titre: string; entreprise: string | null }>;
}
interface Prefill {
  profile: 'TECH' | 'SALES';
  expectations: Record<string, string>;
  otherProcesses: Array<{ company: string; stage: string; deadline: string }>;
  fields: Record<'TECH' | 'SALES', Array<{ id: string; label: string }>>;
  hasSources: boolean;
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid rgba(34,23,122,.09)', borderRadius: 16, padding: '18px 20px' };
const h2: React.CSSProperties = { fontSize: 13, fontWeight: 800, letterSpacing: '.02em', color: '#1A1533' };
const inputS: React.CSSProperties = { width: '100%', fontSize: 13.5, border: '1px solid rgba(34,23,122,.15)', borderRadius: 10, padding: '8px 10px', boxSizing: 'border-box' };
const primary: React.CSSProperties = { background: '#22177A', color: '#E6E9AF', border: 'none', borderRadius: 10, padding: '9px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');

export default function EspaceCandidatCard({ candidatId }: { candidatId: string }) {
  const qc = useQueryClient();
  const key = ['espace-candidat', candidatId];
  const { data: st } = useQuery({ queryKey: key, queryFn: () => api.get<Status>(`/candidate-space/candidats/${candidatId}`) });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Prefill | null>(null);
  const [loadingPrefill, setLoadingPrefill] = useState(false);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [manualLink, setManualLink] = useState<string | null>(null);

  async function startInvite() {
    setOpen(true); setDraft(null); setLoadingPrefill(true);
    try {
      setDraft(await api.post<Prefill>(`/candidate-space/candidats/${candidatId}/prefill`));
    } catch (e: any) {
      toast('error', e?.message || 'Pré-remplissage impossible');
      setOpen(false);
    } finally {
      setLoadingPrefill(false);
    }
  }

  const invite = useMutation({
    mutationFn: (d: Prefill) => api.post<{ emailSent: boolean; link: string | null }>(`/candidate-space/candidats/${candidatId}/invite`, {
      profile: d.profile, expectations: d.expectations, otherProcesses: d.otherProcesses.filter((o) => o.company.trim()),
    }),
    onSuccess: (r) => {
      if (r?.emailSent === false && r.link) { setManualLink(r.link); toast('error', "Espace ouvert, mais l'email n'est pas parti : envoie le lien toi-même."); }
      else toast('success', 'Invitation envoyée au candidat');
      setOpen(false); qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast('error', e?.message || 'Envoi impossible'),
  });
  const revoke = useMutation({
    mutationFn: () => api.post(`/candidate-space/candidats/${candidatId}/revoke`),
    onSuccess: () => { toast('success', 'Accès coupé'); setManualLink(null); qc.invalidateQueries({ queryKey: key }); },
  });
  const sendFeedback = useMutation({
    mutationFn: (p: { candidatureId: string; message: string }) => api.post(`/candidate-space/candidatures/${p.candidatureId}/message`, { message: p.message }),
    onSuccess: () => { toast('success', 'Feedback publié et envoyé au candidat'); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: any) => toast('error', e?.message || 'Envoi impossible'),
  });

  if (!st) return null;
  const a = st.account;
  const active = a && !a.revokedAt;

  return (
    <div style={card}>
      <div style={h2}>Espace candidat</div>
      <div style={{ fontSize: 12.5, color: '#4A4568', marginTop: 8 }}>
        {!active && 'Pas encore ouvert. À ouvrir après le premier call, si le candidat est intéressant.'}
        {active && !a!.activatedAt && `Invitation envoyée le ${fmt(a!.invitedAt)}, pas encore activé.`}
        {active && a!.activatedAt && `Actif depuis le ${fmt(a!.activatedAt)}${a!.lastLoginAt ? ` · dernière visite le ${fmt(a!.lastLoginAt)}` : ''} · profil ${a!.profile === 'SALES' ? 'Sales' : 'Tech'}`}
      </div>
      {st.blocker && !active && <div style={{ fontSize: 12, color: '#8A8699', marginTop: 6 }}>{st.blocker}</div>}
      {manualLink && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#8A1C1C' }}>Lien d'activation à envoyer au candidat (valable 7 jours) :</div>
          <input readOnly value={manualLink} onFocus={(e) => e.target.select()} style={inputS} />
          <button onClick={() => { navigator.clipboard?.writeText(manualLink); toast('success', 'Lien copié'); }} style={{ ...primary, alignSelf: 'flex-start' }}>Copier le lien</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {(!active || !a!.activatedAt) && (
          <button onClick={startInvite} disabled={!st.canOpen} style={{ ...primary, opacity: st.canOpen ? 1 : 0.5, cursor: st.canOpen ? 'pointer' : 'default' }}>
            {active ? "Renvoyer l'invitation" : "Ouvrir l'espace candidat"}
          </button>
        )}
        {active && (
          <button onClick={() => { if (confirm("Couper l'accès du candidat à son espace ?")) revoke.mutate(); }} style={{ background: 'none', border: 'none', color: '#8A8699', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Couper l'accès</button>
        )}
      </div>

      {active && st.feedbackMissing.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#8A1C1C' }}>Feedback à écrire (le candidat ne voit pas encore ces refus)</div>
          {st.feedbackMissing.map((f) => (
            <div key={f.candidatureId} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1533' }}>{f.titre}{f.entreprise ? ` · ${f.entreprise}` : ''}</div>
              <textarea rows={3} value={feedback[f.candidatureId] || ''} onChange={(e) => setFeedback({ ...feedback, [f.candidatureId]: e.target.value })} placeholder="L'update et le feedback, en français : traduits en anglais pour le candidat." style={{ ...inputS, resize: 'vertical' }} />
              <button disabled={!feedback[f.candidatureId]?.trim() || sendFeedback.isPending} onClick={() => sendFeedback.mutate({ candidatureId: f.candidatureId, message: feedback[f.candidatureId] })} style={{ ...primary, alignSelf: 'flex-start', opacity: feedback[f.candidatureId]?.trim() ? 1 : 0.5 }}>Publier le feedback</button>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Ouvrir l'espace candidat" size="lg">
        {loadingPrefill && <div style={{ fontSize: 14, color: '#4A4568' }}>Pré-remplissage depuis la fiche et les derniers calls…</div>}
        {draft && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 13.5, color: '#4A4568' }}>
              {draft.hasSources ? "Pré-rempli depuis la fiche et les calls. Relis, corrige, puis envoie : le candidat validera à l'activation." : "Aucun transcript de call trouvé : complète ce que tu sais, le candidat validera à l'activation."} Les valeurs sont en anglais, c'est ce que voit le candidat.
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['TECH', 'SALES'] as const).map((p) => (
                <button key={p} onClick={() => setDraft({ ...draft, profile: p })} style={{ ...primary, background: draft.profile === p ? '#22177A' : '#F2F1EA', color: draft.profile === p ? '#E6E9AF' : '#4A4568' }}>{p === 'TECH' ? 'Tech' : 'Sales'}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {draft.fields[draft.profile].map((f) => (
                <label key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 700, color: '#4A4568' }}>
                  {f.label}
                  <input value={draft.expectations[f.id] || ''} onChange={(e) => setDraft({ ...draft, expectations: { ...draft.expectations, [f.id]: e.target.value } })} style={inputS} />
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1A1533' }}>Autres process en cours</div>
              {draft.otherProcesses.map((o, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 6 }}>
                  {(['company', 'stage', 'deadline'] as const).map((k) => (
                    <input key={k} aria-label={k} placeholder={k === 'company' ? 'Entreprise' : k === 'stage' ? 'Étape' : 'Échéance'} value={o[k]} onChange={(e) => setDraft({ ...draft, otherProcesses: draft.otherProcesses.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })} style={inputS} />
                  ))}
                  <button onClick={() => setDraft({ ...draft, otherProcesses: draft.otherProcesses.filter((_, j) => j !== i) })} style={{ background: 'none', border: 'none', color: '#8A8699', cursor: 'pointer', fontSize: 12.5 }}>Retirer</button>
                </div>
              ))}
              <button onClick={() => setDraft({ ...draft, otherProcesses: [...draft.otherProcesses, { company: '', stage: '', deadline: '' }] })} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#22177A', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Ajouter un process</button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#4A4568', fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => invite.mutate(draft)} disabled={invite.isPending} style={primary}>{invite.isPending ? 'Envoi…' : "Envoyer l'invitation"}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
