// Contexte d'un call : tout ce que Propium sait déjà (mandat, CV, client, lead)
// plus le brief chargé par le membre. Sert à préparer les questions, à repérer
// les contradictions en live et à rédiger les notes.
import prisma from '../../lib/db.js';

export interface CallContext {
  /** Texte prêt à donner à Claude. */
  text: string;
  /** Ce qui manque pour une bonne préparation (affiché dans l'email du soir). */
  missing: string[];
  hasBrief: boolean;
  /** Questions de la trame du mandat lié, si elle existe. */
  trame: { id: string; text: string }[];
  scorecard: unknown;
}

const clip = (s: string | null | undefined, n: number) => (s ? (s.length > n ? `${s.slice(0, n)}…` : s) : '');

export async function buildContext(call: {
  callType: string; brief: string | null; candidatId: string | null; clientId: string | null; mandatId: string | null; leadId: string | null; titre: string; description: string | null;
}): Promise<CallContext> {
  const parts: string[] = [`Titre de l'invitation : ${call.titre}`];
  if (call.description) parts.push(`Description de l'invitation :\n${clip(stripHtml(call.description), 3000)}`);
  const missing: string[] = [];
  let trame: { id: string; text: string }[] = [];
  let scorecard: unknown = null;

  if (call.mandatId) {
    const m = (await prisma.mandat.findUnique({
      where: { id: call.mandatId },
      include: { entreprise: { select: { nom: true, secteur: true } } },
    })) as any;
    if (m) {
      trame = Array.isArray(m.trame) ? m.trame : [];
      scorecard = m.scorecard ?? null;
      parts.push([
        `MANDAT : ${m.titrePoste} chez ${m.entreprise?.nom ?? ''}${m.entreprise?.secteur ? ` (${m.entreprise.secteur})` : ''}`,
        m.localisation ? `Localisation : ${m.localisation}` : '',
        m.salaireMin || m.salaireMax ? `Salaire : ${m.salaireMin ?? '?'} - ${m.salaireMax ?? '?'}` : '',
        m.ficheDePoste || m.description ? `Fiche de poste :\n${clip(m.ficheDePoste || m.description, 6000)}` : '',
        m.scorecard ? `Scorecard : ${clip(JSON.stringify(m.scorecard), 3000)}` : '',
        trame.length ? `Trame de qualification du mandat :\n${trame.map((q) => `- ${q.text}`).join('\n')}` : '',
        m.notes ? `Notes mandat : ${clip(m.notes, 2000)}` : '',
      ].filter(Boolean).join('\n'));
      if (call.callType === 'QUALIF' && !m.ficheDePoste && !m.description && !trame.length) missing.push('Brief du mandat (JD ou dossier de qualif)');
    }
  } else if (call.callType === 'QUALIF') {
    missing.push('Mandat lié');
  }

  if (call.candidatId) {
    const c = await prisma.candidat.findUnique({
      where: { id: call.candidatId },
      include: { experiences: { orderBy: { anneeDebut: 'desc' }, take: 8 } },
    }).catch(() => null) as any;
    if (c) {
      const xp = (c.experiences || []).map((e: any) => `- ${e.titre} chez ${e.entreprise} (${e.anneeDebut} → ${e.anneeFin ?? 'aujourd’hui'})${e.highlights?.length ? ` : ${e.highlights.join(' ; ')}` : ''}`).join('\n');
      parts.push([
        `CANDIDAT : ${c.prenom ?? ''} ${c.nom}`,
        c.posteActuel ? `Poste actuel : ${c.posteActuel} chez ${c.entrepriseActuelle ?? '?'}` : '',
        c.localisation ? `Localisation : ${c.localisation}` : '',
        c.salaireActuel ? `Salaire actuel (fiche) : ${c.salaireActuel}` : '',
        c.salaireSouhaite ? `Salaire souhaité (fiche) : ${c.salaireSouhaite}` : '',
        c.disponibilite ? `Disponibilité (fiche) : ${c.disponibilite}` : '',
        xp ? `Expériences :\n${xp}` : '',
        c.cvTexte ? `CV :\n${clip(c.cvTexte, 8000)}` : '',
        c.notes ? `Notes : ${clip(c.notes, 1500)}` : '',
      ].filter(Boolean).join('\n'));
      if (!c.cvTexte && !(c.experiences || []).length) missing.push('CV du candidat');
    }
  } else if (call.callType === 'QUALIF') {
    missing.push('CV du candidat');
  }

  if (call.clientId) {
    const cl = await prisma.client.findUnique({
      where: { id: call.clientId },
      include: { entreprise: { select: { nom: true, secteur: true, taille: true, notes: true } }, mandats: { select: { titrePoste: true, statut: true }, take: 10, orderBy: { updatedAt: 'desc' } } },
    });
    if (cl) {
      const acts = await prisma.activite.findMany({
        where: { entiteType: 'CLIENT', entiteId: cl.id, type: { in: ['NOTE', 'MEETING', 'APPEL', 'TRANSCRIPT'] } },
        orderBy: { createdAt: 'desc' }, take: 5, select: { titre: true, contenu: true, createdAt: true },
      });
      parts.push([
        `CLIENT : ${cl.prenom ?? ''} ${cl.nom}${cl.poste ? `, ${cl.poste}` : ''} chez ${cl.entreprise.nom}`,
        cl.entreprise.secteur ? `Secteur : ${cl.entreprise.secteur}` : '',
        cl.mandats.length ? `Mandats existants : ${cl.mandats.map((m) => `${m.titrePoste} (${m.statut})`).join(', ')}` : '',
        cl.notes ? `Notes client : ${clip(cl.notes, 1500)}` : '',
        acts.length ? `Échanges précédents :\n${acts.map((a) => `- ${fmtDate(a.createdAt)} ${a.titre ?? ''} : ${clip(a.contenu, 600)}`).join('\n')}` : '',
      ].filter(Boolean).join('\n'));
    }
  }

  if (call.leadId) {
    const l = await prisma.lead.findUnique({ where: { id: call.leadId }, include: { interactions: { orderBy: { createdAt: 'desc' }, take: 5 } } });
    if (l) {
      parts.push([
        `LEAD : ${l.contact}${l.role ? `, ${l.role}` : ''} chez ${l.company}`,
        l.sector ? `Secteur : ${l.sector}` : '',
        l.headcount ? `Effectif : ${l.headcount}` : '',
        l.interactions.length ? `Interactions :\n${l.interactions.map((i) => `- ${fmtDate(i.createdAt)} ${clip(i.text, 400)}`).join('\n')}` : '',
      ].filter(Boolean).join('\n'));
    }
  }

  const hasBrief = !!call.brief?.trim();
  if (hasBrief) parts.push(`BRIEF CHARGÉ PAR LE MEMBRE :\n${clip(call.brief, 15000)}`);
  if (call.callType === 'INTAKE' && !call.clientId && !hasBrief) missing.push('Fiche client');
  if (call.callType === 'PROSPECT' && !call.leadId && !hasBrief) missing.push('Profil LinkedIn du contact et site de la boîte');
  if (call.callType === 'INTERNE' && !hasBrief) missing.push('Ordre du jour');

  return { text: parts.join('\n\n'), missing: hasBrief ? missing.filter((m) => m !== 'CV du candidat' || !/CV/i.test(call.brief || '')) : missing, hasBrief, trame, scorecard };
}

export function stripHtml(s: string): string {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').trim();
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '?';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '?' : dt.toISOString().slice(0, 7);
}
