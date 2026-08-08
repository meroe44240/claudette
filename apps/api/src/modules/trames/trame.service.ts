import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { callClaude } from '../../services/claudeAI.js';

interface Question { id: string; text: string }
interface Answer { questionId: string; answer: string | null; source: string; filledAt: string }

// ── Bibliothèque de trames ──────────────────────────
export async function listTemplates() {
  return (prisma as any).questionTemplate.findMany({ orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
}

export async function createTemplate(data: { name: string; description?: string; category?: string; questions: Question[] }, userId: string) {
  return (prisma as any).questionTemplate.create({
    data: { name: data.name, description: data.description ?? null, category: data.category ?? null, questions: (data.questions ?? []) as any, isSystem: false, createdById: userId } as any,
  });
}

// ── Trame d'un mandat ───────────────────────────────
export async function getMandatTrame(mandatId: string) {
  const m = (await prisma.mandat.findUnique({ where: { id: mandatId } })) as any;
  if (!m) throw new NotFoundError('Mandat', mandatId);
  return { trame: (m.trame ?? []) as Question[] };
}

export async function getAnswers(candidatureId: string) {
  const c = (await prisma.candidature.findUnique({ where: { id: candidatureId } })) as any;
  if (!c) throw new NotFoundError('Candidature', candidatureId);
  return { trameAnswers: (c.trameAnswers ?? []) as Answer[] };
}

export async function setMandatTrame(mandatId: string, questions: Question[]) {
  const m = await prisma.mandat.findUnique({ where: { id: mandatId }, select: { id: true } });
  if (!m) throw new NotFoundError('Mandat', mandatId);
  const clean = (questions ?? []).filter((q) => q.text?.trim()).map((q, i) => ({ id: q.id || `q${i + 1}`, text: q.text.trim() }));
  return prisma.mandat.update({ where: { id: mandatId }, data: { trame: clean as any } as any });
}

// ── Auto-remplissage IA depuis les transcripts ──────
const FILL_SYSTEM = `Tu es un assistant recruteur. À partir des transcriptions d'appels et d'entretiens fournies, tu réponds à une liste de questions de qualification portant sur LE CANDIDAT. Réponds uniquement avec ce qui est dit ou fortement impliqué par les transcriptions. Si une question n'a pas de réponse dans les transcriptions, mets "answer": null. Sois factuel, concis (1-2 phrases max par réponse), en français.`;

export async function fillTrame(candidatureId: string, userId: string) {
  const cand = await prisma.candidature.findUnique({
    where: { id: candidatureId },
    include: {
      mandat: { select: { id: true, titrePoste: true } },
      candidat: { select: { id: true, nom: true, prenom: true } },
    },
  });
  if (!cand) throw new NotFoundError('Candidature', candidatureId);
  const mandatFull = (await prisma.mandat.findUnique({ where: { id: cand.mandat.id } })) as any;
  const trame = (mandatFull?.trame ?? []) as Question[];
  if (!trame.length) throw new ValidationError('Ce mandat n’a pas encore de trame de qualification.');

  // Transcripts du candidat : appels Allo + transcripts Meet/Drive + meetings
  const acts = await prisma.activite.findMany({
    where: { entiteType: 'CANDIDAT', entiteId: cand.candidat.id, type: { in: ['APPEL', 'TRANSCRIPT', 'MEETING'] } },
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

  const userPrompt = `Poste : ${cand.mandat.titrePoste}
Candidat : ${[cand.candidat.prenom, cand.candidat.nom].filter(Boolean).join(' ').trim()}

TRANSCRIPTIONS :
${transcripts.slice(0, 20000)}

QUESTIONS (réponds à chacune uniquement depuis les transcriptions ci-dessus) :
${trame.map((q, i) => `${i + 1}. [${q.id}] ${q.text}`).join('\n')}

Retourne UNIQUEMENT ce JSON, sans texte autour :
{ "answers": [ { "questionId": "<id de la question>", "answer": "<réponse concise, ou null si non abordé>" } ] }`;

  const response = await callClaude({ feature: 'trame_fill', systemPrompt: FILL_SYSTEM, userPrompt, maxTokens: 2048, temperature: 0, userId });
  const raw = (response as any).content ?? (response as any).rawText ?? '';
  let parsed: { answers?: { questionId: string; answer: string | null }[] };
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    const m = String(raw).match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { answers: [] };
  }

  const now = new Date().toISOString();
  const answers: Answer[] = trame.map((q) => {
    const a = parsed.answers?.find((x) => x.questionId === q.id);
    return { questionId: q.id, answer: a?.answer ?? null, source: 'transcript', filledAt: now };
  });
  await prisma.candidature.update({ where: { id: candidatureId }, data: { trameAnswers: answers as any } as any });
  return { answers, transcriptsUsed: acts.length };
}
