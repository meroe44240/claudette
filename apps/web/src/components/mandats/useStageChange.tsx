import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { toast } from '../ui/Toast';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import PlacementModal from './PlacementModal';

/**
 * Hook partagé pour déplacer un candidat entre étapes du pipeline, AVEC les
 * modales obligatoires (Perdu → motif, RDV client → date/heure, Placé →
 * fee/date/source). Réutilisé par le dashboard (mandats en cours) et la fiche
 * mandat, pour ne pas dupliquer la logique du kanban.
 *
 * Usage :
 *   const { requestMove, modals } = useStageChange(() => qc.invalidateQueries(...));
 *   ... onDrop={() => requestMove(candidatureId, targetStage, { candidatName })}
 *   ... {modals}   // rendre une fois dans le JSX
 */

const MOTIF_REFUS_OPTIONS = [
  { value: 'SALAIRE', label: 'Salaire' },
  { value: 'PROFIL_PAS_ALIGNE', label: 'Profil pas aligné' },
  { value: 'CANDIDAT_DECLINE', label: 'Candidat décline' },
  { value: 'CLIENT_REFUSE', label: 'Client refuse' },
  { value: 'TIMING', label: 'Timing' },
  { value: 'POSTE_POURVU', label: 'Poste pourvu' },
  { value: 'AUTRE', label: 'Autre' },
];

interface Ctx {
  candidatureId: string;
  candidatName?: string | null;
  defaultFee?: number | null;
}

export function useStageChange(onMoved?: () => void) {
  const [refusal, setRefusal] = useState<Ctx | null>(null);
  const [motif, setMotif] = useState('');
  const [motifDetail, setMotifDetail] = useState('');
  const [entretien, setEntretien] = useState<Ctx | null>(null);
  const [entretienDate, setEntretienDate] = useState('');
  const [entretienTime, setEntretienTime] = useState('');
  const [placement, setPlacement] = useState<Ctx | null>(null);

  const move = useMutation({
    mutationFn: (p: { candidatureId: string; [k: string]: unknown }) => {
      const { candidatureId, ...body } = p;
      return api.put(`/candidatures/${candidatureId}`, body);
    },
    onSuccess: () => { toast('success', 'Candidat déplacé'); onMoved?.(); },
    onError: (e: any) => toast('error', e?.message || 'Erreur lors du déplacement'),
  });

  /** Déplace un candidat ; ouvre la modale requise si l'étape l'exige. */
  function requestMove(
    candidatureId: string,
    targetStage: string,
    opts?: { candidatName?: string | null; defaultFee?: number | null },
  ) {
    const ctx: Ctx = { candidatureId, candidatName: opts?.candidatName, defaultFee: opts?.defaultFee };
    if (targetStage === 'REFUSE') { setMotif(''); setMotifDetail(''); setRefusal(ctx); return; }
    if (targetStage === 'ENTRETIEN_CLIENT') { setEntretienDate(''); setEntretienTime(''); setEntretien(ctx); return; }
    if (targetStage === 'PLACE') { setPlacement(ctx); return; }
    move.mutate({ candidatureId, stage: targetStage });
  }

  const modals = (
    <>
      {/* Perdu → motif obligatoire */}
      <Modal isOpen={!!refusal} onClose={() => setRefusal(null)} title="Marquer comme perdu" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {refusal?.candidatName ? `Pourquoi ${refusal.candidatName} n'est pas retenu ?` : 'Indique le motif du refus.'}
          </p>
          <Select label="Motif de refus" options={MOTIF_REFUS_OPTIONS} value={motif} onChange={setMotif} placeholder="Sélectionner…" />
          <Input label="Précision (optionnel)" value={motifDetail} onChange={(e) => setMotifDetail(e.target.value)} placeholder="Détail du motif…" />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setRefusal(null)}>Annuler</Button>
            <Button variant="primary" disabled={!motif || move.isPending} onClick={() => {
              if (!refusal) return;
              move.mutate({ candidatureId: refusal.candidatureId, stage: 'REFUSE', motifRefus: motif, ...(motifDetail.trim() ? { motifRefusDetail: motifDetail.trim() } : {}) });
              setRefusal(null);
            }}>Confirmer</Button>
          </div>
        </div>
      </Modal>

      {/* RDV client (RDV obtenu) → date + heure obligatoires */}
      <Modal isOpen={!!entretien} onClose={() => setEntretien(null)} title="RDV client — date & heure" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {entretien?.candidatName ? `Planifie l'entretien client pour ${entretien.candidatName}.` : "Planifie l'entretien client."}
          </p>
          <Input label="Date" type="date" value={entretienDate} onChange={(e) => setEntretienDate(e.target.value)} />
          <Input label="Heure" type="time" value={entretienTime} onChange={(e) => setEntretienTime(e.target.value)} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEntretien(null)}>Annuler</Button>
            <Button variant="primary" disabled={!entretienDate || !entretienTime || move.isPending} onClick={() => {
              if (!entretien) return;
              const iso = new Date(`${entretienDate}T${entretienTime}:00`).toISOString();
              move.mutate({ candidatureId: entretien.candidatureId, stage: 'ENTRETIEN_CLIENT', dateEntretienClient: iso });
              setEntretien(null);
            }}>Confirmer le RDV</Button>
          </div>
        </div>
      </Modal>

      {/* Placé → fee + date + sources obligatoires (composant existant) */}
      <PlacementModal
        isOpen={!!placement}
        onClose={() => setPlacement(null)}
        isPending={move.isPending}
        candidatName={placement?.candidatName}
        defaultFee={placement?.defaultFee}
        onConfirm={(data) => {
          if (!placement) return;
          move.mutate({ candidatureId: placement.candidatureId, stage: 'PLACE', ...data });
          setPlacement(null);
        }}
      />
    </>
  );

  return { requestMove, modals, isMoving: move.isPending };
}
