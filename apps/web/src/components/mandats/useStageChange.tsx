import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api-client';
import { toast } from '../ui/Toast';
import { t } from '../../lib/i18n';
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
  { value: 'SALAIRE', label: t('Salaire') },
  { value: 'PROFIL_PAS_ALIGNE', label: t('Profil pas aligné') },
  { value: 'CANDIDAT_DECLINE', label: t('Candidat décline') },
  { value: 'CLIENT_REFUSE', label: t('Client refuse') },
  { value: 'TIMING', label: 'Timing' },
  { value: 'POSTE_POURVU', label: t('Poste pourvu') },
  { value: 'AUTRE', label: t('Autre') },
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
  const [entretienInter, setEntretienInter] = useState('');
  const [placement, setPlacement] = useState<Ctx | null>(null);
  // Espace candidat : message au candidat (français, traduit en anglais)
  const [candidateMsg, setCandidateMsg] = useState('');

  const move = useMutation({
    mutationFn: (p: { candidatureId: string; [k: string]: unknown }) => {
      const { candidatureId, ...body } = p;
      return api.put(`/candidatures/${candidatureId}`, body);
    },
    onSuccess: () => { toast('success', t('Candidat déplacé')); onMoved?.(); },
    onError: (e: any) => toast('error', e?.message || t('Erreur lors du déplacement')),
  });

  /** Déplace un candidat ; ouvre la modale requise si l'étape l'exige. */
  function requestMove(
    candidatureId: string,
    targetStage: string,
    opts?: { candidatName?: string | null; defaultFee?: number | null },
  ) {
    const ctx: Ctx = { candidatureId, candidatName: opts?.candidatName, defaultFee: opts?.defaultFee };
    if (targetStage === 'REFUSE') { setMotif(''); setMotifDetail(''); setCandidateMsg(''); setRefusal(ctx); return; }
    if (targetStage === 'ENTRETIEN_CLIENT') { setEntretienDate(''); setEntretienTime(''); setEntretienInter(''); setCandidateMsg(''); setEntretien(ctx); return; }
    if (targetStage === 'PLACE') { setPlacement(ctx); return; }
    move.mutate({ candidatureId, stage: targetStage });
  }

  const candidateMsgField = (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-text-primary">{t('Message au candidat (optionnel)')}</span>
      <textarea
        value={candidateMsg}
        onChange={(e) => setCandidateMsg(e.target.value)}
        rows={3}
        placeholder={t('En français : traduit en anglais pour son espace candidat.')}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
    </label>
  );

  const modals = (
    <>
      {/* Perdu → motif obligatoire */}
      <Modal isOpen={!!refusal} onClose={() => setRefusal(null)} title={t('Marquer comme perdu')} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {refusal?.candidatName ? t("Pourquoi {nom} n'est pas retenu ?", { nom: refusal.candidatName }) : t('Indique le motif du refus.')}
          </p>
          <Select label={t('Motif de refus')} options={MOTIF_REFUS_OPTIONS} value={motif} onChange={setMotif} placeholder={t('Sélectionner…')} />
          <Input label={t('Précision (optionnel)')} value={motifDetail} onChange={(e) => setMotifDetail(e.target.value)} placeholder={t('Détail du motif…')} />
          {candidateMsgField}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setRefusal(null)}>{t('Annuler')}</Button>
            <Button variant="primary" disabled={!motif || move.isPending} onClick={() => {
              if (!refusal) return;
              move.mutate({ candidatureId: refusal.candidatureId, stage: 'REFUSE', motifRefus: motif, ...(motifDetail.trim() ? { motifRefusDetail: motifDetail.trim() } : {}), ...(candidateMsg.trim() ? { candidateMessage: candidateMsg.trim() } : {}) });
              setRefusal(null);
            }}>{t('Confirmer')}</Button>
          </div>
        </div>
      </Modal>

      {/* Présentation client → date + heure + interlocuteur obligatoires */}
      <Modal isOpen={!!entretien} onClose={() => setEntretien(null)} title={t('Présentation client : date et interlocuteur')} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {entretien?.candidatName ? t('Planifie la présentation de {nom} au client.', { nom: entretien.candidatName }) : t('Planifie la présentation au client.')}
          </p>
          <Input label={t('Date')} type="date" value={entretienDate} onChange={(e) => setEntretienDate(e.target.value)} />
          <Input label={t('Heure')} type="time" value={entretienTime} onChange={(e) => setEntretienTime(e.target.value)} />
          <Input label={t('Interlocuteur côté client')} value={entretienInter} onChange={(e) => setEntretienInter(e.target.value)} placeholder={t('Ex. DRH, N+1, dirigeant…')} />
          {candidateMsgField}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEntretien(null)}>{t('Annuler')}</Button>
            <Button variant="primary" disabled={!entretienDate || !entretienTime || !entretienInter.trim() || move.isPending} onClick={() => {
              if (!entretien) return;
              const iso = new Date(`${entretienDate}T${entretienTime}:00`).toISOString();
              move.mutate({ candidatureId: entretien.candidatureId, stage: 'ENTRETIEN_CLIENT', dateEntretienClient: iso, interlocuteurClient: entretienInter.trim(), ...(candidateMsg.trim() ? { candidateMessage: candidateMsg.trim() } : {}) });
              setEntretien(null);
            }}>{t('Confirmer la présentation')}</Button>
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
