import { useEffect, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { t } from '../../lib/i18n';

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
  { value: 'LinkedIn (organique)', label: t('LinkedIn (organique)') },
  { value: 'Cooptation', label: t('Cooptation / Référence') },
  { value: 'Approche directe', label: t('Approche directe') },
  { value: 'Database interne', label: t('Database interne') },
  { value: 'Autre', label: t('Autre…') },
];

const SOURCE_LEAD_OPTIONS = [
  { value: 'Cold call', label: 'Cold call' },
  { value: 'Cooptation', label: t('Cooptation / Recommandation') },
  { value: 'LinkedIn', label: t('LinkedIn (réseau)') },
  { value: 'Inbound', label: t('Inbound (site web, demande entrante)') },
  { value: 'Email outbound', label: 'Email outbound (cold mail)' },
  { value: 'Salon', label: t('Salon / Événement') },
  { value: 'Partenariat', label: t('Partenariat') },
  { value: 'Autre', label: t('Autre…') },
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
    <Modal isOpen={isOpen} onClose={onClose} title={t('Confirmer le placement')} size="sm">
      <div className="space-y-5">
        <p className="text-sm text-text-secondary">
          {candidatName
            ? t('Closing won pour {nom} ! Confirme les infos ci-dessous.', { nom: candidatName })
            : t('Confirme les infos ci-dessous pour finaliser le placement.')}
        </p>

        <Input
          label={t('Montant de la facture (€)')}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          error={touched && !feeValid ? t('Montant requis') : undefined}
        />

        <Input
          label={t('Date de démarrage')}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={touched && !dateValid ? t('Date requise') : undefined}
        />

        <div className="space-y-2">
          <Select
            label={t('Source du profil placé')}
            options={SOURCE_PROFIL_OPTIONS}
            value={sourceProfil}
            onChange={setSourceProfil}
            placeholder={t('Sélectionner…')}
            error={touched && !sourceProfilValid ? t('Source requise') : undefined}
          />
          {sourceProfil === 'Autre' && (
            <Input
              placeholder={t('Préciser la source…')}
              value={sourceProfilOther}
              onChange={(e) => setSourceProfilOther(e.target.value)}
            />
          )}
        </div>

        <div className="space-y-2">
          <Select
            label={t('Source du lead (mandat)')}
            options={SOURCE_LEAD_OPTIONS}
            value={sourceLead}
            onChange={setSourceLead}
            placeholder={t('Sélectionner…')}
            error={touched && !sourceLeadValid ? t('Source requise') : undefined}
          />
          {sourceLead === 'Autre' && (
            <Input
              placeholder={t('Préciser la source…')}
              value={sourceLeadOther}
              onChange={(e) => setSourceLeadOther(e.target.value)}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            {t('Annuler')}
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!canSubmit}>
            {t('Confirmer le placement')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
