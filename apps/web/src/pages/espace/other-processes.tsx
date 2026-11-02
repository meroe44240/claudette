// Éditeur des « autres process en cours » du candidat (entreprise, étape, échéance).
import { C, input, linkBtn } from './espace-ui';
import { t } from '../../lib/i18n';

export interface OtherProcess { company: string; stage: string; deadline: string }

export function OtherProcessesEditor({ value, onChange }: { value: OtherProcess[]; onChange: (v: OtherProcess[]) => void }) {
  const set = (i: number, k: keyof OtherProcess, v: string) => onChange(value.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {value.length === 0 && <span style={{ fontSize: 14, color: C.muted }}>{t("Aucun autre process pour l'instant.")}</span>}
      {value.map((p, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr)) auto', gap: 8, alignItems: 'center' }}>
          <input aria-label={t('Entreprise')} placeholder={t('Entreprise')} value={p.company} onChange={(e) => set(i, 'company', e.target.value)} style={input} />
          <input aria-label={t('Étape')} placeholder={t('Étape, ex. dernier entretien')} value={p.stage} onChange={(e) => set(i, 'stage', e.target.value)} style={input} />
          <input aria-label={t('Échéance')} placeholder={t('Échéance, ex. 20 oct.')} value={p.deadline} onChange={(e) => set(i, 'deadline', e.target.value)} style={input} />
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} style={{ ...linkBtn, color: C.muted, fontSize: 14 }}>{t('Retirer')}</button>
        </div>
      ))}
      {value.length < 10 && (
        <button type="button" onClick={() => onChange([...value, { company: '', stage: '', deadline: '' }])} style={{ ...linkBtn, alignSelf: 'flex-start', textDecoration: 'none', fontSize: 14 }}>
          {t('Ajouter un process ou une offre')}
        </button>
      )}
    </div>
  );
}
