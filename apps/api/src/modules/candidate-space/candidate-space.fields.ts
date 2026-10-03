// Champs d'attentes de l'espace candidat, selon le profil (Tech ou Sales).
// Les libellés sont en anglais : c'est ce que voit le candidat.

export type CandidateProfile = 'TECH' | 'SALES';

export interface ExpectationField { id: string; label: string }

const COMMON_END: ExpectationField[] = [
  { id: 'workSetup', label: 'Work setup' },
  { id: 'availability', label: 'Available' },
  { id: 'workAuth', label: 'Work authorization' },
  { id: 'matters', label: 'What matters most' },
  { id: 'dealBreakers', label: 'Deal-breakers' },
];

export const EXPECTATION_FIELDS: Record<CandidateProfile, ExpectationField[]> = {
  TECH: [
    { id: 'baseMin', label: 'Base salary, minimum' },
    { id: 'baseTarget', label: 'Base salary, target' },
    { id: 'equity', label: 'Equity' },
    { id: 'level', label: 'Level' },
    { id: 'domain', label: 'Domain' },
    { id: 'stack', label: 'Stack' },
    { id: 'onCall', label: 'On-call' },
    { id: 'companyStage', label: 'Company stage' },
    ...COMMON_END,
  ],
  SALES: [
    { id: 'ote', label: 'OTE target' },
    { id: 'baseMin', label: 'Base salary, minimum' },
    { id: 'split', label: 'Base and variable split' },
    { id: 'role', label: 'Role' },
    { id: 'segment', label: 'Segment' },
    { id: 'dealSize', label: 'Deal size' },
    { id: 'motion', label: 'Sales motion' },
    { id: 'territory', label: 'Territory' },
    { id: 'travel', label: 'Travel' },
    ...COMMON_END,
  ],
};

/** Champs résumés sur le dashboard du candidat. */
export const SUMMARY_FIELDS: Record<CandidateProfile, string[]> = {
  TECH: ['baseTarget', 'workSetup', 'availability'],
  SALES: ['ote', 'workSetup', 'availability'],
};

export interface OtherProcess { company: string; stage: string; deadline: string }

export function asProfile(v: unknown): CandidateProfile {
  return v === 'SALES' ? 'SALES' : 'TECH';
}

/** Ne garde que les champs connus du profil, en texte court. */
export function cleanExpectations(profile: CandidateProfile, input: unknown): Record<string, string> {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const f of EXPECTATION_FIELDS[profile]) {
    const v = src[f.id];
    if (typeof v === 'string' && v.trim()) out[f.id] = v.trim().slice(0, 300);
  }
  return out;
}

export function cleanOtherProcesses(input: unknown): OtherProcess[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 10)
    .map((x) => {
      const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
      const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string).trim().slice(0, 120) : '');
      return { company: s('company'), stage: s('stage'), deadline: s('deadline') };
    })
    .filter((p) => p.company);
}
