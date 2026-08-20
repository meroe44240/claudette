import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { callClaude } from '../../services/claudeAI.js';

/**
 * Carte de qualification (socle standard) d'un candidat.
 * Stockée en JSON sur `Candidat.qualification` : { <key>: { v, src, at } }.
 *  - src 'ia'      → rempli depuis les transcripts de meeting (écrasable par un nouveau fill)
 *  - src 'manuel'  → édité à la main → JAMAIS écrasé par l'IA
 * `feedbackRecruteur` n'est jamais rempli par l'IA (jugement du recruteur).
 */

export interface QualifField { key: string; label: string; hint: string; ai: boolean; long?: boolean }
export interface QualifValue { v: string; src: 'ia' | 'manuel'; at: string }
export type Qualification = Record<string, QualifValue>;

export const QUALIF_FIELDS: QualifField[] = [
  { key: 'package', label: 'Package', hint: 'fixe / OTE / structure', ai: true },
  { key: 'experience', label: 'Expérience', hint: 'années + domaines', ai: true },
  { key: 'performance', label: 'Performance & réalisations', hint: 'chiffres : quota, ARR, résultats', ai: true, long: true },
  { key: 'marche', label: 'Marché / séniorité', hint: 'segment, taille de deals, cycles', ai: true },
  { key: 'disponibilite', label: 'Disponibilité', hint: 'préavis / date', ai: true },
  { key: 'localisation', label: 'Localisation / mobilité', hint: 'ville, remote, mobilité', ai: true },
  { key: 'recherche', label: 'Ce qu’il recherche', hint: 'poste / mission visés', ai: true, long: true },
  { key: 'veut', label: 'Ce qu’il veut', hint: 'ses must-have', ai: true },
  { key: 'neVeutPas', label: 'Ce qu’il ne veut pas', hint: 'deal-breakers', ai: true },
  { key: 'vigilance', label: 'Points de vigilance', hint: 'red flags à surveiller', ai: true, long: true },
  { key: 'feedbackRecruteur', label: 'Feedback recruteur', hint: 'ton avis post-entretien (manuel)', ai: false, long: true },
];
const AI_FIELDS = QUALIF_FIELDS.filter((f) => f.ai);

export function getFields() { return QUALIF_FIELDS; }

export async function getQualification(candidatId: string): Promise<Qualification> {
  const c = (await prisma.candidat.findUnique({ where: { id: candidatId }, select: { qualification: true } as any })) as any;
  if (!c) throw new NotFoundError('Candidat', candidatId);
  return (c.qualification ?? {}) as Qualification;
}

/** Édition manuelle : chaque champ passé est marqué `manuel` (protégé de l'IA). Valeur vide → champ retiré. */
export async function updateQualification(candidatId: string, patch: Record<string, string | null>): Promise<Qualification> {
  const current = await getQualification(candidatId);
  const now = new Date().toISOString();
  const next: Qualification = { ...current };
  for (const [key, val] of Object.entries(patch)) {
    if (!QUALIF_FIELDS.some((f) => f.key === key)) continue;
    const v = (val ?? '').toString().trim();
    if (v) next[key] = { v, src: 'manuel', at: now };
    else delete next[key];
  }
  await prisma.candidat.update({ where: { id: candidatId }, data: { qualification: next as any } as any });
  return next;
}

const FILL_SYSTEM = `Tu es un assistant recruteur. À partir des transcriptions d'appels et d'entretiens fournies, tu remplis une fiche de qualification standardisée sur LE CANDIDAT. Pour chaque champ, réponds UNIQUEMENT avec ce qui est dit ou fortement impliqué par les transcriptions. Si un champ n'est pas couvert, mets null. Sois factuel et concis (une phrase ou une liste courte). Conserve les CHIFFRES (montants, quotas, ARR, pourcentages, durées de cycle) tels quels. Réponds en français.`;

/** Remplit les champs IA du socle depuis les transcripts du candidat. Préserve les champs `manuel`. */
export async function fillFromTranscripts(candidatId: string, userId: string) {
  const cand = await prisma.candidat.findUnique({ where: { id: candidatId }, select: { id: true, nom: true, prenom: true } });
  if (!cand) throw new NotFoundError('Candidat', candidatId);

  const acts = await prisma.activite.findMany({
    where: { entiteType: 'CANDIDAT', entiteId: candidatId, type: { in: ['APPEL', 'TRANSCRIPT', 'MEETING'] } },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { type: true, contenu: true, metadata: true, createdAt: true },
  });
  const transcripts = acts
    .map((a) => {
      const meta = (a.metadata ?? {}) as Record<string, unknown>;
      const txt = (meta.transcript as string) || a.contenu || '';
      return txt ? `[${a.type} · ${new Date(a.createdAt).toLocaleDateString('fr-FR')}]\n${txt}` : '';
    })
    .filter(Boolean)
    .join('\n\n---\n\n');
  if (!transcripts.trim()) throw new ValidationError('Aucun transcript (appel ou entretien) trouvé pour ce candidat.');

  const userPrompt = `Candidat : ${[cand.prenom, cand.nom].filter(Boolean).join(' ').trim()}

TRANSCRIPTIONS :
${transcripts.slice(0, 20000)}

Remplis chaque champ ci-dessous uniquement depuis les transcriptions (null si non abordé) :
${AI_FIELDS.map((f) => `- ${f.key} : ${f.label} (${f.hint})`).join('\n')}

Retourne UNIQUEMENT ce JSON, sans texte autour :
{ "fields": { ${AI_FIELDS.map((f) => `"${f.key}": "<valeur ou null>"`).join(', ')} } }`;

  const response = await callClaude({ feature: 'qualif_fill', systemPrompt: FILL_SYSTEM, userPrompt, maxTokens: 2048, temperature: 0, userId });
  const raw = (response as any).content ?? (response as any).rawText ?? '';
  let parsed: { fields?: Record<string, string | null> };
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    const m = String(raw).match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { fields: {} };
  }
  const extracted = parsed.fields ?? {};

  const current = await getQualification(candidatId);
  const now = new Date().toISOString();
  const next: Qualification = { ...current };
  let filled = 0;
  for (const f of AI_FIELDS) {
    if (current[f.key]?.src === 'manuel') continue; // ne jamais écraser une saisie manuelle
    const val = (extracted[f.key] ?? '').toString().trim();
    if (val && val.toLowerCase() !== 'null') { next[f.key] = { v: val, src: 'ia', at: now }; filled++; }
  }
  await prisma.candidat.update({ where: { id: candidatId }, data: { qualification: next as any } as any });
  return { qualification: next, filled, transcriptsUsed: acts.length };
}
