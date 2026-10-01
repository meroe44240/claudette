import { createRequire } from 'module';
import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { callClaude } from '../../services/claudeAI.js';
import * as documentService from '../documents/document.service.js';
import * as dossierService from './dossier.service.js';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

// ─── SYNTHÈSES D'ENTRETIEN (PDF) ────────────────────
// Le PDF est rangé avec les documents du candidat ; une activité NOTE porte
// metadata.synthese = true (+ url, proposition IA, statut). L'IA lit le texte et
// PROPOSE : champs de la fiche, expériences, dossier client. Rien n'est appliqué
// sans validation du recruteur (applySynthese).

export interface SyntheseProposal {
  fields: {
    localisation?: string | null;
    salaireActuel?: number | null;
    salaireSouhaite?: number | null;
    anneesExperience?: number | null;
    disponibilite?: string | null;
    mobilite?: string | null;
  };
  experiences: Array<{ titre: string; entreprise: string; anneeDebut: number; anneeFin: number | null; highlights: string[] }>;
  dossier: {
    synthese: string;
    infos: Array<{ label: string; value: string }>;
    adequation: string[];
    sections: Array<{ title: string; items: string[] }>;
  };
  resume: string;
}

const PROMPT = (client: string | null) => `Tu es recruteur senior chez HumanUp (cabinet de recrutement sales). Tu lis la synthèse d'un entretien candidat rédigée par un consultant et tu prépares :
1. les champs de la fiche candidat ;
2. ses expériences ;
3. le dossier client, c'est-à-dire ce que le client${client ? ` (${client})` : ''} verra sur son portail.

Réponds UNIQUEMENT en JSON valide, sans markdown :
{
  "fields": { "localisation": string|null, "salaireActuel": entier en euros annuels|null, "salaireSouhaite": entier en euros annuels|null, "anneesExperience": entier|null, "disponibilite": string court|null, "mobilite": string court|null },
  "experiences": [ { "titre": string, "entreprise": string, "anneeDebut": entier, "anneeFin": entier|null, "highlights": [string, 5 max] } ],
  "dossier": {
    "synthese": "paragraphe de 480 caractères MAXIMUM",
    "infos": [ { "label": "Localisation"|"Disponibilité"|"Expérience"|"Prétentions"|"Langues"|"Méthodes"…, "value": string } ] (4 à 6 cartes),
    "adequation": [ 8 points maximum, concrets et chiffrés ],
    "sections": [
      { "title": "Parcours", "items": [une ligne par poste : "AAAA-AAAA : poste, entreprise (activité) : réalisation"] },
      { "title": "Motivation", "items": [...] },
      { "title": "${client ? `Qualification ${client}` : 'Qualification'}", "items": [produit vendu ; pourquoi les clients l'achètent ; portefeuille et mix de revenu ; expansion et chasse ; clients ; acheteurs et utilisateurs ; cycles et négociation ; performance ; binôme CSM et méthode ; interlocuteurs RSSI/DSI ; besoin de cadre ; comptes avec un historique difficile ; connaissance du client] },
      { "title": "${client ? `Grille de fit ${client}` : 'Grille de fit'}", "items": ["critère : validé|partiel|à valider|compatible, preuve"] },
      { "title": "Points à valider ensemble", "items": [...] }
    ]
  },
  "resume": "3 lignes pour le recruteur : avis du consultant, points forts, points en suspens"
}

Règles générales :
- N'invente rien. Si un point de qualification n'a pas été abordé, écris-le et termine par « à creuser ».
- "resume" est OBLIGATOIRE : 3 lignes pour l'équipe (avis du consultant, points forts, points en suspens). C'est le seul endroit où mettre les informations internes.
- Style : français, phrases simples, pas de tiret long, pas de majuscules décoratives.
- Montants en K€ dans le dossier ; en euros entiers dans "fields".

Rémunération :
- "salaireActuel" = le fixe actuel du candidat.
- "salaireSouhaite" = uniquement un montant demandé par le candidat lui-même. Un montant proposé par le recruteur ou l'enveloppe du client n'est PAS une prétention : dans ce cas mets null.
- Dans le dossier, la carte s'appelle « Prétentions » si le candidat a donné un chiffre, sinon « Rémunération actuelle ». Jamais l'enveloppe du client, jamais un montant avancé par le recruteur.

Le dossier client ("dossier") est lu par le client. Il ne contient JAMAIS :
- la santé, la situation familiale, un rôle d'aidant ;
- un plan de départ volontaire, un plan social ou les difficultés de l'employeur actuel du candidat : pour la disponibilité, écris seulement « Rapide », « Immédiate » ou la durée du préavis, sans la raison ;
- l'enveloppe budgétaire du client, la marge de négociation du candidat ;
- les avis internes (« second rang », « à présenter en priorité », « à avancer ») ;
- les autres process du candidat avec le nom des entreprises ;
- un numéro de téléphone ou un email.
- "synthese" : 450 caractères maximum, phrases complètes, à la troisième personne sans répéter le nom complet.`;

async function extractText(buffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ verbosity: 0, data: buffer });
    await parser.load();
    const result = await parser.getText();
    await parser.destroy();
    return (typeof result === 'string' ? result : result?.text || '').trim();
  } catch {
    return '';
  }
}

const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

// Filet de sécurité sur le dossier client : même si l'IA oublie la consigne, ces
// sujets ne partent pas chez le client. On retire la parenthèse ou la phrase fautive.
const INTERDIT = /plan de d[ée]part|plan social|\bPSE\b|aidant|maladie|enveloppe|second rang|pr[ée]senter en priorit[ée]|[àa] avancer\b/i;
function scrub(text: string): string {
  if (!text || !INTERDIT.test(text)) return text;
  const sansParentheses = text.replace(/\s*\([^)]*\)/g, (m) => (INTERDIT.test(m) ? '' : m));
  if (!INTERDIT.test(sansParentheses)) return sansParentheses.trim();
  const phrases = sansParentheses.split(/(?<=[.;!?])\s+/).filter((ph) => !INTERDIT.test(ph));
  return phrases.join(' ').trim();
}

function clean(raw: any): SyntheseProposal {
  if (!raw || typeof raw !== 'object') throw new Error("L'IA n'a pas renvoyé de proposition exploitable");
  const f = raw.fields || {};
  const d = raw.dossier || {};
  let synthese = scrub(str(d.synthese, 2000));
  // Trop longue : on coupe à la dernière phrase complète qui tient dans 500 caractères.
  if (synthese.length > 500) {
    const cut = synthese.slice(0, 500);
    const end = cut.lastIndexOf('. ');
    synthese = end > 200 ? cut.slice(0, end + 1) : cut.slice(0, 497).replace(/\s+\S*$/, '') + '…';
  }
  return {
    fields: {
      localisation: str(f.localisation, 255) || null,
      salaireActuel: int(f.salaireActuel),
      salaireSouhaite: int(f.salaireSouhaite),
      anneesExperience: int(f.anneesExperience),
      disponibilite: str(f.disponibilite, 100) || null,
      mobilite: str(f.mobilite, 255) || null,
    },
    experiences: (Array.isArray(raw.experiences) ? raw.experiences : [])
      .map((e: any) => ({ titre: str(e?.titre, 255), entreprise: str(e?.entreprise, 255), anneeDebut: int(e?.anneeDebut) ?? 0, anneeFin: int(e?.anneeFin), highlights: (Array.isArray(e?.highlights) ? e.highlights : []).map((h: unknown) => str(h, 300)).filter(Boolean).slice(0, 5) }))
      .filter((e: any) => e.titre && e.entreprise && e.anneeDebut >= 1950 && e.anneeDebut <= 2100),
    dossier: {
      synthese,
      infos: (Array.isArray(d.infos) ? d.infos : []).map((i: any) => ({ label: str(i?.label, 80), value: scrub(str(i?.value, 300)) })).filter((i: any) => i.label && i.value).slice(0, 8),
      adequation: (Array.isArray(d.adequation) ? d.adequation : []).map((a: unknown) => scrub(str(a))).filter(Boolean).slice(0, 10),
      sections: (Array.isArray(d.sections) ? d.sections : []).map((s: any) => ({ title: str(s?.title, 120), items: (Array.isArray(s?.items) ? s.items : []).map((x: unknown) => scrub(str(x))).filter(Boolean).slice(0, 20) })).filter((s: any) => s.title && s.items.length),
    },
    resume: str(raw.resume, 1500),
  };
}

async function clientName(candidatId: string): Promise<string | null> {
  const ca = await prisma.candidature.findFirst({
    where: { candidatId, stage: { not: 'REFUSE' } },
    orderBy: { updatedAt: 'desc' },
    select: { mandat: { select: { entreprise: { select: { nom: true } } } } },
  });
  return ca?.mandat?.entreprise?.nom ?? null;
}

export async function listSyntheses(candidatId: string) {
  const rows = await prisma.activite.findMany({
    where: { entiteType: 'CANDIDAT', entiteId: candidatId, metadata: { path: ['synthese'], equals: true } },
    select: { id: true, titre: true, metadata: true, createdAt: true, user: { select: { nom: true, prenom: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => {
    const m = (r.metadata || {}) as any;
    return {
      id: r.id, createdAt: r.createdAt, user: r.user,
      filename: m.filename as string, url: m.url as string, size: m.size as number,
      status: m.status as 'propose' | 'applique' | 'erreur',
      error: (m.error as string) || null,
      appliedAt: (m.appliedAt as string) || null,
      proposal: (m.proposal as SyntheseProposal) || null,
    };
  });
}

async function analyse(candidatId: string, buffer: Buffer, filename: string, userId: string): Promise<SyntheseProposal> {
  const text = await extractText(buffer);
  if (text.length < 80) throw new Error("Le PDF ne contient pas de texte lisible (PDF scanné ?)");
  const client = await clientName(candidatId);
  const res = await callClaude({
    feature: 'synthese_entretien',
    systemPrompt: PROMPT(client),
    userPrompt: `Synthèse d'entretien (fichier : ${filename}).\n\n--- DÉBUT ---\n${text.slice(0, 40000)}\n--- FIN ---`,
    userId,
    maxTokens: 6000,
  });
  return clean(res.content);
}

export async function uploadSynthese(candidatId: string, buffer: Buffer, filename: string, mime: string, userId: string) {
  if (mime !== 'application/pdf' && !/\.pdf$/i.test(filename)) throw new ValidationError('La synthèse doit être un PDF');
  const exists = await prisma.candidat.findUnique({ where: { id: candidatId }, select: { id: true } });
  if (!exists) throw new NotFoundError('Candidat', candidatId);

  const doc = await documentService.upload('candidat', candidatId, buffer, filename, 'application/pdf');
  const base = { synthese: true, url: doc.url, filename: doc.originalName, size: doc.size };
  let metadata: Record<string, unknown>;
  try {
    metadata = { ...base, status: 'propose', proposal: await analyse(candidatId, buffer, filename, userId) };
  } catch (e: any) {
    metadata = { ...base, status: 'erreur', error: e?.message || 'Analyse impossible' };
  }
  await prisma.activite.create({
    data: {
      type: 'NOTE', entiteType: 'CANDIDAT', entiteId: candidatId, userId,
      titre: `Synthèse d'entretien ajoutée : ${doc.originalName}`,
      contenu: (metadata.proposal as SyntheseProposal | undefined)?.resume || null,
      metadata: metadata as any,
    },
  });
  return (await listSyntheses(candidatId))[0];
}

export async function reanalyse(candidatId: string, activiteId: string, userId: string) {
  const act = await prisma.activite.findFirst({ where: { id: activiteId, entiteId: candidatId } });
  const m = (act?.metadata || {}) as any;
  if (!act || !m.synthese) throw new NotFoundError('Synthèse', activiteId);
  const fs = await import('fs/promises');
  const path = await import('path');
  const buffer = await fs.readFile(path.join(process.cwd(), m.url.replace(/^\//, '')));
  let next: Record<string, unknown>;
  try { next = { ...m, status: 'propose', error: null, proposal: await analyse(candidatId, buffer, m.filename, userId) }; }
  catch (e: any) { next = { ...m, status: 'erreur', error: e?.message || 'Analyse impossible' }; }
  await prisma.activite.update({ where: { id: activiteId }, data: { metadata: next as any } });
  return (await listSyntheses(candidatId)).find((s) => s.id === activiteId);
}

export interface ApplyInput {
  fields?: Partial<SyntheseProposal['fields']>;
  experiences?: SyntheseProposal['experiences'];
  dossier?: dossierService.DossierInput;
}

export async function applySynthese(candidatId: string, activiteId: string, input: ApplyInput) {
  const act = await prisma.activite.findFirst({ where: { id: activiteId, entiteId: candidatId } });
  const m = (act?.metadata || {}) as any;
  if (!act || !m.synthese) throw new NotFoundError('Synthèse', activiteId);

  const applied: string[] = [];
  const fields = Object.fromEntries(Object.entries(input.fields || {}).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  if (Object.keys(fields).length) {
    await prisma.candidat.update({ where: { id: candidatId }, data: fields });
    applied.push('champs');
  }
  if (input.experiences?.length) {
    const existing = await prisma.candidatExperience.findMany({ where: { candidatId }, select: { entreprise: true, anneeDebut: true } });
    const key = (e: { entreprise: string; anneeDebut: number }) => `${e.entreprise.toLowerCase().trim()}|${e.anneeDebut}`;
    const seen = new Set(existing.map(key));
    const fresh = input.experiences.filter((e) => !seen.has(key(e)));
    if (fresh.length) {
      await prisma.candidatExperience.createMany({ data: fresh.map((e) => ({ candidatId, titre: e.titre, entreprise: e.entreprise, anneeDebut: e.anneeDebut, anneeFin: e.anneeFin, highlights: e.highlights, source: 'manual' })) });
      applied.push(`${fresh.length} expérience(s)`);
    }
  }
  if (input.dossier && Object.keys(input.dossier).length) {
    await dossierService.updateDossier(candidatId, { ...input.dossier, manuel: true });
    applied.push('dossier client');
  }
  await prisma.activite.update({ where: { id: activiteId }, data: { metadata: { ...m, status: 'applique', appliedAt: new Date().toISOString() } } });
  return { applied };
}

export async function removeSynthese(candidatId: string, activiteId: string) {
  const act = await prisma.activite.findFirst({ where: { id: activiteId, entiteId: candidatId } });
  if (!act || !(act.metadata as any)?.synthese) throw new NotFoundError('Synthèse', activiteId);
  await prisma.activite.delete({ where: { id: activiteId } });
  return { success: true };
}

// ─── Résumé portail client (colonne de droite de la fiche) ───
export async function portailSummary(candidatId: string) {
  const [cand, rows] = await Promise.all([
    prisma.candidat.findUnique({ where: { id: candidatId }, select: { aiAnonymizedProfile: true } }),
    prisma.candidature.findMany({
      where: { candidatId },
      select: {
        id: true, stage: true,
        mandat: { select: { id: true, titrePoste: true, visibleStages: true, entrepriseId: true, entreprise: { select: { nom: true } } } },
        portalDecisions: { select: { decision: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { portalComments: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);
  // Un contact voit toutes les offres de son entreprise : le portail est actif dès
  // qu'un accès non révoqué existe sur un mandat de la même entreprise.
  const entrepriseIds = [...new Set(rows.map((r) => r.mandat.entrepriseId).filter(Boolean))] as string[];
  const accesses = entrepriseIds.length
    ? await prisma.portalAccess.findMany({ where: { revokedAt: null, mandat: { entrepriseId: { in: entrepriseIds } } }, select: { mandatId: true, mandat: { select: { entrepriseId: true } } } })
    : [];
  const actif = (mandatId: string, entrepriseId: string | null) => accesses.some((a) => a.mandatId === mandatId || (entrepriseId && a.mandat.entrepriseId === entrepriseId));
  return {
    coordonneesVisibles: (cand?.aiAnonymizedProfile as any)?.coordonneesVisibles === true,
    mandats: rows.map((r) => ({
      candidatureId: r.id,
      mandatId: r.mandat.id,
      titre: r.mandat.titrePoste,
      entreprise: r.mandat.entreprise?.nom ?? '',
      portailActif: actif(r.mandat.id, r.mandat.entrepriseId),
      visible: actif(r.mandat.id, r.mandat.entrepriseId) && r.stage !== 'REFUSE' && r.mandat.visibleStages.includes(r.stage),
      decision: r.portalDecisions[0]?.decision ?? null,
      commentaires: r._count.portalComments,
    })),
  };
}
