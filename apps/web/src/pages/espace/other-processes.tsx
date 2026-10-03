// Éditeur des « autres process en cours » du candidat (entreprise, étape, échéance).
import { C, input, linkBtn } from './espace-ui';

export interface OtherProcess { company: string; stage: string; deadline: string }

export function OtherProcessesEditor({ value, onChange }: { value: OtherProcess[]; onChange: (v: OtherProcess[]) => void }) {
  const set = (i: number, k: keyof OtherProcess, v: string) => onChange(value.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {value.length === 0 && <span style={{ fontSize: 14, color: C.muted }}>No other process for now.</span>}
      {value.map((p, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr)) auto', gap: 8, alignItems: 'center' }}>
          <input aria-label="Company" placeholder="Company" value={p.company} onChange={(e) => set(i, 'company', e.target.value)} style={input} />
          <input aria-label="Stage" placeholder="Stage, e.g. final round" value={p.stage} onChange={(e) => set(i, 'stage', e.target.value)} style={input} />
          <input aria-label="Deadline" placeholder="Deadline, e.g. Oct 20" value={p.deadline} onChange={(e) => set(i, 'deadline', e.target.value)} style={input} />
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} style={{ ...linkBtn, color: C.muted, fontSize: 14 }}>Remove</button>
        </div>
      ))}
      {value.length < 10 && (
        <button type="button" onClick={() => onChange([...value, { company: '', stage: '', deadline: '' }])} style={{ ...linkBtn, alignSelf: 'flex-start', textDecoration: 'none', fontSize: 14 }}>
          Add a process or an offer
        </button>
      )}
    </div>
  );
}
