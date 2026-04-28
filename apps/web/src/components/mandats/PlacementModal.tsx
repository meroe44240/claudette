import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';

interface PlacementPayload {
  feeMontantFacture: number;
  dateDemarrage: string;
  sourcePlacement: string;
  sourceLead: string;
}

interface PlacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: PlacementPayload) => void;
  isPending?: boolean;
  candidatName?: string | null;
  defaultFee?: number | null;
}

const SOURCE_PROFIL_OPTIONS = [
  { value: 'Indeed', label: 'Indeed' },
  { value: 'CVTech', label: 'CVTech' },
  { value: 'LinkedIn Recruiter', label: 'LinkedIn Recruiter' },
  { value: 'LinkedIn (organique)', label: 'LinkedIn (organique)' },
  { value: 'Cooptation', label: 'Cooptation / Référence' },
  { value: 'Approche directe', label: 'Approche directe' },
  { value: 'Database interne', label: 'Database interne' },
  { value: 'Autre', label: 'Autre…' },
];

const SOURCE_LEAD_OPTIONS = [
  { value: 'Cold call', label: 'Cold call' },
  { value: 'Cooptation', label: 'Cooptation / Recommandation' },
  { value: 'LinkedIn', label: 'LinkedIn (réseau)' },
  { value: 'Inbound', label: 'Inbound (site web, demande entrante)' },
  { value: 'Email outbound', label: 'Email outbound (cold mail)' },
  { value: 'Salon', label: 'Salon / Événement' },
  { value: 'Partenariat', label: 'Partenariat' },
  { value: 'Autre', label: 'Autre…' },
];

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
  const [sourceProfil, setSourceProfil] = useState<string>('');
  const [sourceProfilOther, setSourceProfilOther] = useState<string>('');
  const [sourceLead, setSourceLead] = useState<string>('');
  const [sourceLeadOther, setSourceLeadOther] = useState<string>('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFee(defaultFee != null ? String(defaultFee) : '');
      setDate('');
      setSourceProfil('');
      setSourceProfilOther('');
      setSourceLead('');
      setSourceLeadOther('');
      setTouched(false);
    }
  }, [isOpen, defaultFee]);

  const feeNum = Number(fee);
  const feeValid = fee !== '' && Number.isFinite(feeNum) && feeNum >= 0;
  const dateValid = date !== '' && !Number.isNaN(Date.parse(date));

  const sourceProfilFinal =
    sourceProfil === 'Autre' ? sourceProfilOther.trim() : sourceProfil;
  const sourceProfilValid = sourceProfilFinal.length > 0;

  const sourceLeadFinal = sourceLead === 'Autre' ? sourceLeadOther.trim() : sourceLead;
  const sourceLeadValid = sourceLeadFinal.length > 0;

  const canSubmit =
    feeValid && dateValid && sourceProfilValid && sourceLeadValid && !isPending;

  function handleConfirm() {
    setTouched(true);
    if (!canSubmit) return;
    onConfirm({
      feeMontantFacture: Math.round(feeNum),
      dateDemarrage: new Date(`${date}T00:00:00`).toISOString(),
      sourcePlacement: sourceProfilFinal,
      sourceLead: sourceLeadFinal,
    });
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirmer le placement" size="sm">
      <div className="space-y-5">
        <p className="text-sm text-text-secondary">
          {candidatName
            ? `Closing won pour ${candidatName} ! Confirme les infos ci-dessous.`
            : 'Confirme les infos ci-dessous pour finaliser le placement.'}
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

        <div className="space-y-2">
          <Select
            label="Source du profil placé"
            options={SOURCE_PROFIL_OPTIONS}
            value={sourceProfil}
            onChange={setSourceProfil}
            placeholder="Sélectionner…"
            error={touched && !sourceProfilValid ? 'Source requise' : undefined}
          />
          {sourceProfil === 'Autre' && (
            <Input
              placeholder="Préciser la source…"
              value={sourceProfilOther}
              onChange={(e) => setSourceProfilOther(e.target.value)}
            />
          )}
        </div>

        <div className="space-y-2">
          <Select
            label="Source du lead (mandat)"
            options={SOURCE_LEAD_OPTIONS}
            value={sourceLead}
            onChange={setSourceLead}
            placeholder="Sélectionner…"
            error={touched && !sourceLeadValid ? 'Source requise' : undefined}
          />
          {sourceLead === 'Autre' && (
            <Input
              placeholder="Préciser la source…"
              value={sourceLeadOther}
              onChange={(e) => setSourceLeadOther(e.target.value)}
            />
          )}
        </div>

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
