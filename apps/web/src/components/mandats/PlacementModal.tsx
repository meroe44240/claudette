import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface PlacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { feeMontantFacture: number; dateDemarrage: string }) => void;
  isPending?: boolean;
  candidatName?: string | null;
  defaultFee?: number | null;
}

export default function PlacementModal({
  isOpen,
  onClose,
  onConfirm,
  isPending,
  candidatName,
  defaultFee,
}: PlacementModalProps) {
  const [fee, setFee] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFee(defaultFee != null ? String(defaultFee) : '');
      setDate('');
      setTouched(false);
    }
  }, [isOpen, defaultFee]);

  const feeNum = Number(fee);
  const feeValid = fee !== '' && Number.isFinite(feeNum) && feeNum >= 0;
  const dateValid = date !== '' && !Number.isNaN(Date.parse(date));
  const canSubmit = feeValid && dateValid && !isPending;

  function handleConfirm() {
    setTouched(true);
    if (!canSubmit) return;
    onConfirm({
      feeMontantFacture: Math.round(feeNum),
      dateDemarrage: new Date(`${date}T00:00:00`).toISOString(),
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirmer le placement" size="sm">
      <div className="space-y-5">
        <p className="text-sm text-text-secondary">
          {candidatName
            ? `Closing won pour ${candidatName} ! Confirme le montant de la facture et la date de démarrage.`
            : 'Confirme le montant de la facture et la date de démarrage du candidat.'}
        </p>

        <Input
          label="Montant de la facture (€)"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          error={touched && !feeValid ? 'Montant requis' : undefined}
        />

        <Input
          label="Date de démarrage"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={touched && !dateValid ? 'Date requise' : undefined}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Annuler
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!canSubmit}>
            Confirmer le placement
          </Button>
        </div>
      </div>
    </Modal>
  );
}
