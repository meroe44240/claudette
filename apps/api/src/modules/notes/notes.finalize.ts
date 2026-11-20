// Après le call : notes au format du type de call, mise à jour directe de Propium
// (sans validation) et email au(x) membre(s) dans les 5 minutes.
import prisma from '../../lib/db.js';
import { callClaude } from '../../services/claudeAI.js';
import { aiAvailable as isAiConfigured } from './notes.types.js';
import { buildContext } from './notes.context.js';
import { getUserLocale, promptLanguageLine, type Lang } from '../../lib/locale.js';
import { sendNotesEmail } from './notes.emails.js';
import { isInternalEmail, PUBLIC_DOMAINS } from './notes.detect.js';
import { appUrl, CALL_TYPE_LABEL, type Attendee, type CallType, type NoteQuestion, type PropiumLink, type TranscriptSegment } from './notes.types.js';

const finalizing = new Set<string>();

export async function finalizeCall(callId: string): Promise<void> {
  if (finalizing.has(callId)) return;
  finalizing.add(callId);
  try {
    const call = await prisma.noteCall.findUnique({ where: { id: callId } });
    if (!call || call.status === 'DONE' || call.status === 'CANCELLED') return;
    await prisma.noteCall.update({ where: { id: callId }, data: { status: 'PROCESSING', endedAt: call.endedAt ?? new Date() } });

    const transcript = (call.transcript as unknown as TranscriptSegment[]) || [];
    if (!transcript.length) {
      await prisma.noteCall.update({ where: { id: callId }, data: { status: 'FAILED', error: 'Aucun transcript reçu (bot refusé, call annulé ou personne n’a parlé).' } });
      return;
    }

    // Notes écrites dans la langue du membre propriétaire du call (lues par lui, rangées dans Propium).
    const { lang: writeLang } = await getUserLocale(call.userId);
    const notes = await generateNotes(call, transcript, writeLang);
    const questions = mergeFinalAnswers((call.questions as unknown as NoteQuestion[]) || [], notes);
    const markdown = renderMarkdown(call.callType as CallType, call.titre, questions, notes, writeLang);

    let links: PropiumLink[] = [];
    let duplicates: any[] = [];
    let tasks: any[] = [];
    try {
      ({ links, duplicates, tasks } = await writeToPropium({ ...call, questions }, notes, markdown, transcript));
    } catch (err) {
      console.error(`[Notes] Écriture Propium ${callId}:`, err);
      duplicates.push({ label: 'Écriture Propium', reason: `Erreur : ${(err as Error).message}`, url: `${appUrl()}/notes/${callId}` });
    }

    const updated = await prisma.noteCall.update({
      where: { id: callId },
      data: {
        status: 'DONE',
        questions: questions as any,
        notes: notes as any,
        notesMarkdown: markdown,
        language: notes.language === 'en' ? 'en' : 'fr',
        propiumLinks: links as any,
        duplicateFlags: duplicates as any,
        tasksCreated: tasks as any,
      },
    });

    await sendNotesEmail(updated).catch((err) => console.error('[Notes] Email notes:', (err as Error).message));
    await prisma.noteCall.update({ where: { id: callId }, data: { notesSentAt: new Date() } });
  } catch (err) {
    console.error(`[Notes] Finalisation ${callId}:`, err);
    await prisma.noteCall.update({ where: { id: callId }, data: { status: 'FAILED', error: (err as Error).message } }).catch(() => null);
  } finally {
    finalizing.delete(callId);
  }
}

// ─── Génération des notes ────────────────────────────

const SECTIONS: Record<CallType, string> = {
  QUALIF: 'Réponses aux questions du brief, dealbreakers OK ou KO, scorecard, salaire, préavis, localisation, prochaine étape',
  INTAKE: 'Poste, profil cible, salaire, process, délais, dealbreakers, infos sur la boîte',
  PROSPECT: 'Besoin, enjeux, budget, décideurs, objections, prochaine étape',
  INTERNE: 'Décisions, actions avec responsable et date, points ouverts',
};

const SYSTEM = `Tu rédiges les notes d'un call pour l'équipe Humanup (cabinet de recrutement). Les notes sont lues par le membre et rangées dans le CRM Propium.
Règles :
- {{LANGUE}}
- "language" = langue PARLÉE dans le call, "fr" ou "en" (indépendante de la langue de rédaction).
- Factuel, concis, chiffres exacts. N'invente rien : ce qui n'a pas été dit reste null.
- Pour une qualif, croise le CV / la fiche avec les réponses et signale les écarts dans une section.
- Les salaires sont des montants annuels bruts en euros (entiers, ex. 55000).
- Les dates au format AAAA-MM-JJ. Aujourd'hui : {{TODAY}}.
- "answers" : une entrée par question du brief, avec la réponse la plus complète donnée sur TOUT le call (une réponse vague au début puis précisée plus tard = la version précise, "covered"). "partial" si la réponse reste incomplète, "answer": null si la question n'a pas été abordée.
- "sections" ne répète PAS les réponses aux questions, les dealbreakers, la scorecard ni la prochaine étape (ils ont leurs propres champs) : seulement ce qui s'ajoute (écarts avec le CV, points d'attention, infos sur la boîte, objections…).
- Pour une qualif, remplis "qualif.preavis" (ex. "3 mois, négociable à 2") et "qualif.localisation" dès qu'ils sont mentionnés.
Réponds UNIQUEMENT en JSON avec ce format :
{
 "language": "fr",
 "summary": "2 à 3 phrases",
 "sections": [{"title": "...", "items": ["..."]}],
 "answers": [{"questionId": "...", "answer": "réponse en une ligne ou null", "status": "covered|partial"}],
 "dealbreakers": [{"questionId": "...", "ok": true, "detail": "..."}],
 "person": {"prenom": null, "nom": null, "email": null, "entreprise": null, "poste": null, "linkedinUrl": null},
 "qualif": {"salaireActuel": null, "salaireSouhaite": null, "preavis": null, "localisation": null, "scorecard": [{"critere": "...", "note": "1-5 ou OK/KO", "commentaire": "..."}]},
 "company": {"nom": null, "secteur": null, "infos": null},
 "mandat": {"titrePoste": null, "localisation": null, "salaireMin": null, "salaireMax": null, "ficheDePoste": null},
 "nextStep": {"text": null, "dueDate": null},
 "actions": [{"text": "...", "owner": "prénom ou null", "dueDate": null}]
}
"person" = la personne externe principale du call (candidat, client ou prospect). "mandat" seulement pour un intake. "actions" surtout pour une réunion interne.`;

export interface GeneratedNotes {
  language: 'fr' | 'en';
  summary: string;
  sections: { title: string; items: string[] }[];
  answers: { questionId: string; answer: string | null; status?: 'covered' | 'partial' }[];
  dealbreakers: { questionId: string; ok: boolean | null; detail?: string }[];
  person: Record<string, string | null>;
  qualif: { salaireActuel?: number | null; salaireSouhaite?: number | null; preavis?: string | null; localisation?: string | null; scorecard?: { critere: string; note: string; commentaire?: string }[] };
  company: { nom?: string | null; secteur?: string | null; infos?: string | null };
  mandat: { titrePoste?: string | null; localisation?: string | null; salaireMin?: number | null; salaireMax?: number | null; ficheDePoste?: string | null };
  nextStep: { text?: string | null; dueDate?: string | null };
  actions: { text: string; owner?: string | null; dueDate?: string | null }[];
}

async function generateNotes(call: any, transcript: TranscriptSegment[], writeLang: Lang): Promise<GeneratedNotes> {
  const type = call.callType as CallType;
  const questions = (call.questions as NoteQuestion[]) || [];
  const empty: GeneratedNotes = {
    language: call.language === 'en' ? 'en' : 'fr', summary: '', sections: [], answers: [], dealbreakers: [], person: {}, qualif: {}, company: {}, mandat: {}, nextStep: {}, actions: [],
  };
  if (!isAiConfigured()) {
    return { ...empty, summary: 'IA non configurée : notes non générées. Le transcript complet est rattaché.', sections: [] };
  }
  const ctx = await buildContext(call);
  let text = transcript.map((s) => `${s.speaker} : ${s.text}`).join('\n');
  if (text.length > 120_000) text = `${text.slice(0, 60_000)}\n[…]\n${text.slice(-60_000)}`;
  const res = await callClaude({
    feature: 'notes_final',
    preferAnthropic: true,
    userId: call.userId,
    systemPrompt: SYSTEM.replace('{{TODAY}}', new Date().toISOString().slice(0, 10)).replace('{{LANGUE}}', promptLanguageLine(writeLang, 'toutes les notes (résumé, sections, réponses, détails, actions)')),
    userPrompt: [
      `Type de call : ${CALL_TYPE_LABEL[type]}. Sections attendues : ${SECTIONS[type]}.`,
      `Participants : ${((call.attendees as Attendee[]) || []).map((a) => `${a.name || a.email} <${a.email}> (${a.role})`).join(', ')}`,
      `QUESTIONS DU BRIEF :\n${questions.map((q) => `[${q.id}]${q.dealbreaker ? ' (dealbreaker)' : ''} ${q.text} | statut live : ${q.status}${q.answer ? ` | ${q.answer}` : ''}`).join('\n')}`,
      `CONTEXTE PROPIUM :\n${ctx.text.slice(0, 15000)}`,
      `TRANSCRIPT :\n${text}`,
    ].join('\n\n'),
    maxTokens: 4000,
    temperature: 0.1,
  });
  const c = res.content && typeof res.content === 'object' ? res.content : {};
  return {
    ...empty,
    ...c,
    language: c.language === 'en' ? 'en' : 'fr',
    sections: Array.isArray(c.sections) ? c.sections : [],
    answers: Array.isArray(c.answers) ? c.answers : [],
    dealbreakers: Array.isArray(c.dealbreakers) ? c.dealbreakers : [],
    actions: Array.isArray(c.actions) ? c.actions : [],
    person: c.person || {}, qualif: c.qualif || {}, company: c.company || {}, mandat: c.mandat || {}, nextStep: c.nextStep || {},
  };
}

/**
 * Les réponses finales, écrites avec tout le transcript, remplacent le cochage live
 * (une réponse vague au début peut avoir été précisée plus tard). Un choix manuel
 * du membre n'est jamais écrasé.
 */
function mergeFinalAnswers(questions: NoteQuestion[], notes: GeneratedNotes): NoteQuestion[] {
  return questions.map((q) => {
    if (q.manual) return q;
    const a = notes.answers.find((x) => x.questionId === q.id);
    if (!a || typeof a.answer !== 'string' || !a.answer.trim()) return q;
    const status = a.status === 'partial' || a.status === 'covered' ? a.status : 'covered';
    return { ...q, status, answer: a.answer.trim().slice(0, 400) };
  });
}

export function uncoveredQuestions(questions: NoteQuestion[]): NoteQuestion[] {
  return questions
    .filter((q) => q.status !== 'covered')
    .sort((a, b) => Number(b.dealbreaker) - Number(a.dealbreaker));
}

export function renderMarkdown(type: CallType, titre: string, questions: NoteQuestion[], n: GeneratedNotes, lang: Lang): string {
  const en = lang === 'en';
  const L = (fr: string, e: string) => (en ? e : fr);
  const colon = en ? ':' : ' :'; // typographie française : espace avant les deux-points
  const out: string[] = [];
  const unc = uncoveredQuestions(questions);
  if (unc.length) {
    out.push(`## ${L('Questions non couvertes', 'Questions not covered')}`);
    for (const q of unc) out.push(`- ${q.dealbreaker ? `**Dealbreaker**${colon} ` : ''}${q.text}${q.status === 'partial' && q.answer ? ` (${L('partiel', 'partial')}${colon} ${q.answer})` : ''}`);
    out.push('');
  }
  out.push(`## ${L('Résumé', 'Summary')}`, n.summary || '-', '');
  if (type === 'QUALIF' && n.dealbreakers.length) {
    out.push(`## Dealbreakers`);
    for (const d of n.dealbreakers) {
      const q = questions.find((x) => x.id === d.questionId);
      out.push(`- ${d.ok === true ? 'OK' : d.ok === false ? 'KO' : '?'}${colon} ${q?.text ?? d.questionId}${d.detail ? ` (${d.detail})` : ''}`);
    }
    out.push('');
  }
  const answered = questions.filter((q) => q.answer);
  if (answered.length && type !== 'INTERNE') {
    out.push(`## ${L('Réponses aux questions', 'Answers')}`);
    for (const q of answered) out.push(`- **${q.text}** ${q.answer}`);
    out.push('');
  }
  for (const s of n.sections) {
    if (!s?.title || !Array.isArray(s.items) || !s.items.length) continue;
    out.push(`## ${s.title}`, ...s.items.map((i) => `- ${i}`), '');
  }
  if (type === 'QUALIF' && n.qualif?.scorecard?.length) {
    out.push('## Scorecard', ...n.qualif.scorecard.map((s) => `- ${s.critere}${colon} ${s.note}${s.commentaire ? ` (${s.commentaire})` : ''}`), '');
  }
  if (n.actions.length) {
    out.push(`## ${L('Actions', 'Actions')}`, ...n.actions.map((a) => `- ${a.text}${a.owner ? ` (${a.owner})` : ''}${a.dueDate ? `, ${L('pour le', 'due')} ${a.dueDate}` : ''}`), '');
  }
  if (n.nextStep?.text) out.push(`## ${L('Prochaine étape', 'Next step')}`, `${n.nextStep.text}${n.nextStep.dueDate ? ` (${n.nextStep.dueDate})` : ''}`, '');
  return `# ${titre}\n\n${out.join('\n')}`.trim();
}

// ─── Écriture dans Propium ───────────────────────────

const link = (kind: PropiumLink['kind'], id: string, label: string, action: PropiumLink['action']): PropiumLink => {
  const path = { CANDIDAT: 'candidats', CLIENT: 'clients', MANDAT: 'mandats', LEAD: 'leads', TACHE: 'taches' }[kind];
  return { kind, id, label, action, url: `${appUrl()}/${path}${kind === 'LEAD' || kind === 'TACHE' ? '' : `/${id}`}` };
};

const clean = (s: unknown) => (typeof s === 'string' && s.trim() ? s.trim() : null);
const toInt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

function transcriptText(t: TranscriptSegment[]): string {
  return t.map((s) => `${s.speaker} : ${s.text}`).join('\n');
}

function dueDate(s: string | null | undefined, fallbackDays: number): Date {
  const d = s ? new Date(`${s}T09:00:00`) : null;
  if (d && !Number.isNaN(d.getTime()) && d.getTime() > Date.now() - 86_400_000) return d;
  const f = new Date();
  f.setDate(f.getDate() + fallbackDays);
  f.setHours(9, 0, 0, 0);
  return f;
}

async function writeToPropium(call: any, n: GeneratedNotes, markdown: string, transcript: TranscriptSegment[]) {
  const type = call.callType as CallType;
  const links: PropiumLink[] = [];
  const duplicates: { label: string; reason: string; url: string }[] = [];
  const tasks: { id: string; titre: string; dueDate: string }[] = [];
  const ownerId: string = call.userId;
  const attendees = ((call.attendees as Attendee[]) || []).filter((a) => !isInternalEmail(a.email));
  const main = attendees.find((a) => a.role === 'candidat' || a.role === 'client' || a.role === 'lead') || attendees[0];
  const email = (clean(n.person?.email) || main?.email || '').toLowerCase() || null;
  const dateLabel = new Date(call.startAt).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  const meta = { source: 'humanup_notes', noteCallId: call.id };

  const addActivities = async (entiteType: 'CANDIDAT' | 'CLIENT' | 'MANDAT', entiteId: string) => {
    await prisma.activite.create({
      data: { type: 'MEETING', entiteType, entiteId, userId: ownerId, titre: `Notes visio : ${call.titre}`.slice(0, 500), contenu: markdown, source: 'AGENT_IA', metadata: meta },
    });
    await prisma.activite.create({
      data: { type: 'TRANSCRIPT', entiteType, entiteId, userId: ownerId, titre: `Transcript visio du ${dateLabel}`, contenu: transcriptText(transcript), source: 'AGENT_IA', metadata: meta },
    });
  };

  const createTask = async (titre: string, due: Date, extra: { entiteType?: 'CANDIDAT' | 'CLIENT' | 'MANDAT'; entiteId?: string; leadId?: string; userId?: string } = {}) => {
    const t = await prisma.activite.create({
      data: {
        type: 'TACHE', isTache: true, tacheDueDate: due, userId: extra.userId ?? ownerId, titre: titre.slice(0, 500), source: 'AGENT_IA',
        entiteType: extra.entiteType ?? null, entiteId: extra.entiteId ?? null, metadata: { ...meta, ...(extra.leadId ? { leadId: extra.leadId } : {}) },
      },
    });
    tasks.push({ id: t.id, titre: t.titre ?? titre, dueDate: due.toISOString() });
  };

  // ── Qualif candidat ──
  if (type === 'QUALIF') {
    const found = await findCandidat(call.candidatId, email, clean(n.person?.linkedinUrl), clean(n.person?.prenom), clean(n.person?.nom), clean(n.person?.entreprise));
    let candidatId = found?.id ?? null;
    if (found?.doubt) duplicates.push({ label: `${n.person?.prenom ?? ''} ${n.person?.nom ?? ''}`.trim() || email || 'Candidat', reason: found.doubt, url: `${appUrl()}/candidats/${found.id}` });

    const fields: Record<string, unknown> = {};
    if (candidatId) {
      const c = await prisma.candidat.findUnique({ where: { id: candidatId } });
      if (c) {
        if (!c.localisation && clean(n.qualif?.localisation)) fields.localisation = clean(n.qualif.localisation);
        if (!c.disponibilite && clean(n.qualif?.preavis)) fields.disponibilite = clean(n.qualif.preavis)!.slice(0, 100);
        if (!c.salaireActuel && toInt(n.qualif?.salaireActuel)) fields.salaireActuel = toInt(n.qualif.salaireActuel);
        if (!c.salaireSouhaite && toInt(n.qualif?.salaireSouhaite)) fields.salaireSouhaite = toInt(n.qualif.salaireSouhaite);
        if (!c.email && email && !isInternalEmail(email)) fields.email = email;
        if (Object.keys(fields).length) await prisma.candidat.update({ where: { id: candidatId }, data: fields });
        links.push(link('CANDIDAT', candidatId, `${c.prenom ?? ''} ${c.nom}`.trim(), 'updated'));
      }
    } else {
      const nom = clean(n.person?.nom) || main?.name?.split(' ').slice(1).join(' ') || main?.name || email?.split('@')[0] || 'Candidat';
      const created = await prisma.candidat.create({
        data: {
          nom, prenom: clean(n.person?.prenom) || (main?.name?.includes(' ') ? main.name.split(' ')[0] : null),
          email, linkedinUrl: clean(n.person?.linkedinUrl), posteActuel: clean(n.person?.poste), entrepriseActuelle: clean(n.person?.entreprise),
          localisation: clean(n.qualif?.localisation), disponibilite: clean(n.qualif?.preavis)?.slice(0, 100) ?? null,
          salaireActuel: toInt(n.qualif?.salaireActuel), salaireSouhaite: toInt(n.qualif?.salaireSouhaite),
          source: 'Humanup Notes', createdById: ownerId, assignedToId: ownerId,
        },
      });
      candidatId = created.id;
      links.push(link('CANDIDAT', created.id, `${created.prenom ?? ''} ${created.nom}`.trim(), 'created'));
    }

    if (candidatId) {
      await addActivities('CANDIDAT', candidatId);
      // Debrief sur la fiche (onglet Entretiens) : l'ATS en tire une proposition de mise à jour.
      try {
        const { addSyntheseText } = await import('../candidats/synthese.service.js');
        await addSyntheseText(candidatId, markdown, `Notes visio ${dateLabel}`, ownerId);
      } catch (err) {
        console.warn('[Notes] Debrief non ajouté:', (err as Error).message);
      }
      if (call.mandatId) {
        const existing = await prisma.candidature.findUnique({ where: { mandatId_candidatId: { mandatId: call.mandatId, candidatId } } });
        const trameAnswers = (call.questions as NoteQuestion[])
          .filter((q) => q.trameId && q.answer)
          .map((q) => ({ questionId: q.trameId, answer: q.answer, source: 'humanup_notes', filledAt: new Date().toISOString() }));
        if (existing) {
          const prev = ((existing as any).trameAnswers as any[]) || [];
          const merged = [...prev.filter((a) => !trameAnswers.some((t) => t.questionId === a.questionId)), ...trameAnswers];
          await prisma.candidature.update({
            where: { id: existing.id },
            data: { ...(trameAnswers.length ? { trameAnswers: merged as any } : {}), ...(existing.stage === 'SOURCING' ? { stage: 'CONTACTE' } : {}) },
          });
        } else {
          await prisma.candidature.create({
            data: { mandatId: call.mandatId, candidatId, stage: 'CONTACTE', createdById: ownerId, ...(trameAnswers.length ? { trameAnswers: trameAnswers as any } : {}) },
          });
        }
        const m = await prisma.mandat.findUnique({ where: { id: call.mandatId }, select: { titrePoste: true } });
        if (m) links.push(link('MANDAT', call.mandatId, m.titrePoste, 'updated'));
      }
      if (n.nextStep?.text) await createTask(n.nextStep.text, dueDate(n.nextStep.dueDate, 2), { entiteType: 'CANDIDAT', entiteId: candidatId });
      await prisma.noteCall.update({ where: { id: call.id }, data: { candidatId } });
    }
  }

  // ── Intake client ──
  if (type === 'INTAKE') {
    const cl = await findOrCreateClient(call.clientId, email, main, n, ownerId, duplicates);
    if (cl) {
      links.push(link('CLIENT', cl.id, cl.label, cl.action));
      await addActivities('CLIENT', cl.id);
      let mandatId: string | null = call.mandatId;
      const md = n.mandat || {};
      if (mandatId) {
        const m = await prisma.mandat.findUnique({ where: { id: mandatId } });
        if (m) {
          await prisma.mandat.update({
            where: { id: mandatId },
            data: {
              notes: `${m.notes ? `${m.notes}\n\n` : ''}Intake du ${dateLabel} :\n${n.summary}`,
              ...(!m.ficheDePoste && clean(md.ficheDePoste) ? { ficheDePoste: clean(md.ficheDePoste) } : {}),
              ...(!m.localisation && clean(md.localisation) ? { localisation: clean(md.localisation) } : {}),
              ...(!m.salaireMin && toInt(md.salaireMin) ? { salaireMin: toInt(md.salaireMin) } : {}),
              ...(!m.salaireMax && toInt(md.salaireMax) ? { salaireMax: toInt(md.salaireMax) } : {}),
            },
          });
          links.push(link('MANDAT', mandatId, m.titrePoste, 'updated'));
        }
      } else if (clean(md.titrePoste)) {
        const m = await prisma.mandat.create({
          data: {
            titrePoste: clean(md.titrePoste)!, entrepriseId: cl.entrepriseId, clientId: cl.id,
            ficheDePoste: clean(md.ficheDePoste), description: n.summary || null, localisation: clean(md.localisation),
            salaireMin: toInt(md.salaireMin), salaireMax: toInt(md.salaireMax), notes: `Créé depuis l'intake du ${dateLabel}.`,
            createdById: ownerId, assignedToId: ownerId, salesId: ownerId,
          },
        });
        mandatId = m.id;
        links.push(link('MANDAT', m.id, m.titrePoste, 'created'));
        await prisma.noteCall.update({ where: { id: call.id }, data: { mandatId: m.id } });
      }
      if (mandatId) await prisma.activite.create({ data: { type: 'MEETING', entiteType: 'MANDAT', entiteId: mandatId, userId: ownerId, titre: `Intake : ${call.titre}`.slice(0, 500), contenu: markdown, source: 'AGENT_IA', metadata: meta } });
      if (n.nextStep?.text) await createTask(n.nextStep.text, dueDate(n.nextStep.dueDate, 2), { entiteType: 'CLIENT', entiteId: cl.id });
      await prisma.noteCall.update({ where: { id: call.id }, data: { clientId: cl.id } });
    }
  }

  // ── Prospect / sales ──
  if (type === 'PROSPECT') {
    const clientAtt = attendees.find((a) => a.role === 'client');
    if (clientAtt?.entityId && !call.leadId) {
      // Contact déjà client : interaction sur sa fiche.
      await addActivities('CLIENT', clientAtt.entityId);
      const c = await prisma.client.findUnique({ where: { id: clientAtt.entityId }, select: { prenom: true, nom: true } });
      links.push(link('CLIENT', clientAtt.entityId, `${c?.prenom ?? ''} ${c?.nom ?? ''}`.trim(), 'updated'));
      await createTask(n.nextStep?.text || `Relancer ${c?.prenom ?? ''} ${c?.nom ?? ''}`.trim(), dueDate(n.nextStep?.dueDate, 3), { entiteType: 'CLIENT', entiteId: clientAtt.entityId });
    } else {
      let lead = call.leadId ? await prisma.lead.findUnique({ where: { id: call.leadId } }) : null;
      if (!lead && email) lead = await prisma.lead.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
      const contact = `${clean(n.person?.prenom) ?? ''} ${clean(n.person?.nom) ?? ''}`.trim() || main?.name || email || 'Contact';
      const domain = email?.split('@')[1];
      const company = clean(n.company?.nom) || clean(n.person?.entreprise) || (domain && !PUBLIC_DOMAINS.has(domain) ? domain.split('.')[0] : 'Inconnue');
      if (lead) {
        await prisma.lead.update({ where: { id: lead.id }, data: { lastContactAt: new Date(), ...(['nouveau', 'contacte'].includes(lead.stage) ? { stage: 'rdv' } : {}) } });
        links.push(link('LEAD', lead.id, `${lead.contact} (${lead.company})`, 'updated'));
      } else {
        lead = await prisma.lead.create({
          data: { company, contact, email, role: clean(n.person?.poste), sector: clean(n.company?.secteur), src: 'call', stage: 'rdv', source: 'Humanup Notes (visio)', ownerId, lastContactAt: new Date() },
        });
        links.push(link('LEAD', lead.id, `${lead.contact} (${lead.company})`, 'created'));
      }
      await prisma.leadInteraction.create({ data: { leadId: lead.id, type: 'note', text: markdown, createdById: ownerId } });
      await createTask(n.nextStep?.text || `Relancer ${lead.contact} (${lead.company})`, dueDate(n.nextStep?.dueDate, 3), { leadId: lead.id });
      await prisma.noteCall.update({ where: { id: call.id }, data: { leadId: lead.id } });
    }
  }

  // Réunion interne : notes par email uniquement (rien dans Propium).
  for (const t of tasks) links.push(link('TACHE', t.id, t.titre, 'created'));
  return { links, duplicates, tasks };
}

/** Dédoublonnage : email, puis profil LinkedIn, puis nom + entreprise. */
async function findCandidat(knownId: string | null, email: string | null, linkedin: string | null, prenom: string | null, nom: string | null, entreprise: string | null): Promise<{ id: string; doubt?: string } | null> {
  if (knownId) return { id: knownId };
  if (email && !isInternalEmail(email)) {
    const c = await prisma.candidat.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
    if (c) return { id: c.id };
  }
  if (linkedin) {
    const slug = linkedin.replace(/\/$/, '').split('/').pop();
    if (slug) {
      const c = await prisma.candidat.findFirst({ where: { linkedinUrl: { contains: slug, mode: 'insensitive' } }, select: { id: true } });
      if (c) return { id: c.id };
    }
  }
  if (nom) {
    const matches = await prisma.candidat.findMany({
      where: { nom: { equals: nom, mode: 'insensitive' }, ...(prenom ? { prenom: { equals: prenom, mode: 'insensitive' } } : {}) },
      select: { id: true, entrepriseActuelle: true },
      take: 5,
    });
    const sameCompany = entreprise ? matches.filter((m) => m.entrepriseActuelle?.toLowerCase() === entreprise.toLowerCase()) : [];
    if (sameCompany.length === 1) return { id: sameCompany[0].id };
    if (matches.length) {
      return { id: (sameCompany[0] ?? matches[0]).id, doubt: `Correspondance par le nom uniquement (${matches.length} fiche${matches.length > 1 ? 's' : ''} possible${matches.length > 1 ? 's' : ''}) : fiche existante mise à jour, à vérifier.` };
    }
  }
  return null;
}

async function findOrCreateClient(knownId: string | null, email: string | null, main: Attendee | undefined, n: GeneratedNotes, ownerId: string, duplicates: { label: string; reason: string; url: string }[]) {
  if (knownId) {
    const c = await prisma.client.findUnique({ where: { id: knownId }, select: { id: true, prenom: true, nom: true, entrepriseId: true } });
    if (c) return { id: c.id, entrepriseId: c.entrepriseId, label: `${c.prenom ?? ''} ${c.nom}`.trim(), action: 'updated' as const };
  }
  if (email) {
    const c = await prisma.client.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true, prenom: true, nom: true, entrepriseId: true } });
    if (c) return { id: c.id, entrepriseId: c.entrepriseId, label: `${c.prenom ?? ''} ${c.nom}`.trim(), action: 'updated' as const };
  }
  const nom = clean(n.person?.nom);
  const prenom = clean(n.person?.prenom);
  const companyName = clean(n.company?.nom) || clean(n.person?.entreprise);
  if (nom && companyName) {
    const c = await prisma.client.findFirst({
      where: { nom: { equals: nom, mode: 'insensitive' }, entreprise: { nom: { equals: companyName, mode: 'insensitive' } } },
      select: { id: true, prenom: true, nom: true, entrepriseId: true },
    });
    if (c) {
      duplicates.push({ label: `${c.prenom ?? ''} ${c.nom}`.trim(), reason: 'Client retrouvé par le nom et l’entreprise : fiche existante mise à jour, à vérifier.', url: `${appUrl()}/clients/${c.id}` });
      return { id: c.id, entrepriseId: c.entrepriseId, label: `${c.prenom ?? ''} ${c.nom}`.trim(), action: 'updated' as const };
    }
  }
  const domain = email?.split('@')[1]?.toLowerCase();
  const entName = companyName || (domain && !PUBLIC_DOMAINS.has(domain) ? domain.split('.')[0] : null);
  if (!entName) return null;
  let ent = await prisma.entreprise.findFirst({
    where: { OR: [{ nom: { equals: entName, mode: 'insensitive' } }, ...(domain && !PUBLIC_DOMAINS.has(domain) ? [{ domaine: { equals: domain, mode: 'insensitive' as const } }] : [])] },
    select: { id: true },
  });
  if (!ent) ent = await prisma.entreprise.create({ data: { nom: entName, domaine: domain && !PUBLIC_DOMAINS.has(domain) ? domain : null, secteur: clean(n.company?.secteur), notes: clean(n.company?.infos), createdById: ownerId }, select: { id: true } });
  const created = await prisma.client.create({
    data: {
      nom: nom || main?.name?.split(' ').slice(1).join(' ') || main?.name || email?.split('@')[0] || 'Contact',
      prenom: prenom || (main?.name?.includes(' ') ? main.name.split(' ')[0] : null),
      email, poste: clean(n.person?.poste), linkedinUrl: clean(n.person?.linkedinUrl), entrepriseId: ent.id, createdById: ownerId, assignedToId: ownerId,
    },
  });
  return { id: created.id, entrepriseId: ent.id, label: `${created.prenom ?? ''} ${created.nom}`.trim(), action: 'created' as const };
}
