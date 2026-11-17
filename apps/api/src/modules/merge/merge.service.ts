import type { Prisma, StageCandidature } from '@prisma/client';
import prisma from '../../lib/db.js';

/**
 * Fusion de doublons (candidats, contacts clients, entreprises).
 *
 * La fiche « principale » est conservée, le doublon est absorbé puis supprimé :
 * - toutes les lignes qui pointent vers le doublon sont rattachées à la principale ;
 * - les champs vides de la principale sont complétés par ceux du doublon
 *   (jamais l'inverse : ce qui est renseigné sur la principale reste) ;
 * - une note de fusion est ajoutée sur la principale pour garder la trace.
 *
 * Tout se fait dans une transaction : en cas d'erreur, rien n'est modifié.
 * `previewMerge*` calcule ce qui serait fait sans rien écrire.
 */

type Tx = Prisma.TransactionClient;

export class MergeError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// Ordre d'avancement des étapes : sur un même mandat on garde la candidature la plus avancée.
const STAGE_RANK: Record<StageCandidature, number> = {
  REFUSE: -1,
  SOURCING: 0,
  CONTACTE: 1,
  ENTRETIEN_1: 2,
  ENVOYE_CLIENT: 3,
  ENTRETIEN_CLIENT: 4,
  PROCESS: 5,
  OFFRE: 6,
  PLACE: 7,
};

/** Complète les champs vides de `primary` avec ceux de `dup`. Renvoie seulement les champs à écrire. */
function fillBlanks<T extends Record<string, unknown>>(primary: T, dup: T, fields: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const f of fields) {
    const p = primary[f];
    const d = dup[f];
    const empty = p === null || p === undefined || p === '';
    if (empty && d !== null && d !== undefined && d !== '') out[f] = d;
  }
  return out;
}

function joinNotes(a: string | null, b: string | null): string | null {
  if (!b?.trim()) return a;
  if (!a?.trim()) return b;
  if (a.includes(b.trim())) return a;
  return `${a}\n\n--- Notes de la fiche fusionnée ---\n${b}`;
}

function mergeJson(primary: Prisma.JsonValue | null, dup: Prisma.JsonValue | null): Prisma.InputJsonValue | undefined {
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (isObj(primary) && isObj(dup)) return { ...dup, ...primary } as Prisma.InputJsonValue;
  if ((primary === null || primary === undefined) && dup !== null && dup !== undefined) return dup as Prisma.InputJsonValue;
  return undefined;
}

const label = (p: { prenom?: string | null; nom: string }) => [p.prenom, p.nom].filter(Boolean).join(' ');

/** Rattache les lignes polymorphes (activités, audit, rappels, résumés IA...) à la fiche principale. */
async function movePolymorphic(tx: Tx, entite: 'CANDIDAT' | 'CLIENT' | 'ENTREPRISE', fromId: string, toId: string) {
  const types = [entite, entite.toLowerCase()];
  const activites = await tx.activite.updateMany({ where: { entiteType: entite, entiteId: fromId }, data: { entiteId: toId } });
  await tx.auditLog.updateMany({ where: { entityType: { in: types }, entityId: fromId }, data: { entityId: toId } });
  await tx.reminder.updateMany({ where: { entityType: { in: types }, entityId: fromId }, data: { entityId: toId } });
  await tx.aiCallSummary.updateMany({ where: { entityType: { in: types }, entityId: fromId }, data: { entityId: toId } });
  await tx.aiCallBrief.updateMany({ where: { entityType: { in: types }, entityId: fromId }, data: { entityId: toId } });
  await tx.aiPendingValidation.updateMany({ where: { entiteType: { in: types }, entiteId: fromId }, data: { entiteId: toId } });
  return activites.count;
}

async function logMerge(tx: Tx, entite: 'CANDIDAT' | 'CLIENT' | 'ENTREPRISE', primaryId: string, dupLabel: string, dupId: string, userId?: string, details?: string) {
  await tx.activite.create({
    data: {
      type: 'NOTE',
      entiteType: entite,
      entiteId: primaryId,
      userId: userId ?? null,
      titre: `Fusion avec le doublon « ${dupLabel} »`,
      contenu: details ?? null,
      metadata: { merge: true, mergedId: dupId },
    },
  });
}

// ═══════════════════════════════════════════════════════════
// CANDIDATS
// ═══════════════════════════════════════════════════════════

const CANDIDAT_FILL_FIELDS = [
  'prenom', 'email', 'telephone', 'linkedinUrl', 'photoUrl', 'cvUrl', 'cvTexte', 'posteActuel',
  'entrepriseActuelle', 'localisation', 'salaireActuel', 'salaireSouhaite', 'anneesExperience',
  'disponibilite', 'mobilite', 'source', 'tier', 'consentementDate', 'cvConsentDate',
  'aiPitchShort', 'aiPitchLong', 'aiSellingPoints', 'aiIdealFor', 'aiAnonymizedProfile', 'aiParsedAt',
  'assignedToId',
] as const;

async function loadCandidats(primaryId: string, duplicateId: string) {
  if (primaryId === duplicateId) throw new MergeError('same_id', 'Les deux fiches sont identiques.');
  const include = { candidatures: { include: { mandat: { select: { titrePoste: true, entreprise: { select: { nom: true } } } } } }, candidateAccount: { select: { id: true } }, _count: { select: { experiences: true } } } as const;
  const [primary, dup] = await Promise.all([
    prisma.candidat.findUnique({ where: { id: primaryId }, include }),
    prisma.candidat.findUnique({ where: { id: duplicateId }, include }),
  ]);
  if (!primary) throw new MergeError('not_found', `Candidat principal introuvable (${primaryId}).`);
  if (!dup) throw new MergeError('not_found', `Candidat doublon introuvable (${duplicateId}).`);
  return { primary, dup };
}

export async function previewMergeCandidats(primaryId: string, duplicateId: string) {
  const { primary, dup } = await loadCandidats(primaryId, duplicateId);
  const primaryMandats = new Set(primary.candidatures.map((c) => c.mandatId));
  const filled = fillBlanks(primary as any, dup as any, CANDIDAT_FILL_FIELDS as any);
  return {
    principal: { id: primary.id, nom: label(primary), email: primary.email, linkedin: primary.linkedinUrl, candidatures: primary.candidatures.length },
    doublon: { id: dup.id, nom: label(dup), email: dup.email, linkedin: dup.linkedinUrl, candidatures: dup.candidatures.length },
    candidatures_deplacees: dup.candidatures.filter((c) => !primaryMandats.has(c.mandatId)).map((c) => ({ mandat: c.mandat.titrePoste, entreprise: c.mandat.entreprise.nom, etape: c.stage })),
    candidatures_en_conflit: dup.candidatures.filter((c) => primaryMandats.has(c.mandatId)).map((c) => {
      const p = primary.candidatures.find((x) => x.mandatId === c.mandatId)!;
      return { mandat: c.mandat.titrePoste, entreprise: c.mandat.entreprise.nom, etape_principal: p.stage, etape_doublon: c.stage, etape_gardee: STAGE_RANK[c.stage] > STAGE_RANK[p.stage] ? c.stage : p.stage };
    }),
    champs_completes: Object.keys(filled),
    tags_ajoutes: dup.tags.filter((t) => !primary.tags.includes(t)),
  };
}

export async function mergeCandidats(primaryId: string, duplicateId: string, userId?: string) {
  const { primary, dup } = await loadCandidats(primaryId, duplicateId);

  return prisma.$transaction(async (tx) => {
    // 1. Candidatures : déplacer, ou fusionner quand les deux sont sur le même mandat
    let moved = 0;
    let fused = 0;
    for (const dc of dup.candidatures) {
      const pc = primary.candidatures.find((c) => c.mandatId === dc.mandatId);
      if (!pc) {
        await tx.candidature.update({ where: { id: dc.id }, data: { candidatId: primary.id } });
        moved++;
        continue;
      }
      // Même mandat : on garde la ligne principale, on y rapatrie l'historique du doublon.
      await tx.stageHistory.updateMany({ where: { candidatureId: dc.id }, data: { candidatureId: pc.id } });
      await tx.aiPipelineSuggestion.updateMany({ where: { candidatureId: dc.id }, data: { candidatureId: pc.id } });
      await tx.portalDecision.updateMany({ where: { candidatureId: dc.id }, data: { candidatureId: pc.id } });
      await tx.portalComment.updateMany({ where: { candidatureId: dc.id }, data: { candidatureId: pc.id } });
      await tx.portalEvent.updateMany({ where: { candidatureId: dc.id }, data: { candidatureId: pc.id } });
      const dupAhead = STAGE_RANK[dc.stage] > STAGE_RANK[pc.stage];
      const base = dupAhead ? dc : pc;
      const other = dupAhead ? pc : dc;
      await tx.candidature.update({
        where: { id: pc.id },
        data: {
          stage: base.stage,
          portalStage: base.portalStage ?? other.portalStage,
          motifRefus: base.motifRefus,
          motifRefusDetail: base.motifRefusDetail,
          notes: joinNotes(pc.notes, dc.notes),
          datePresentation: pc.datePresentation ?? dc.datePresentation,
          dateEntretienClient: pc.dateEntretienClient ?? dc.dateEntretienClient,
          interlocuteurClient: pc.interlocuteurClient ?? dc.interlocuteurClient,
          googleEventId: pc.googleEventId ?? dc.googleEventId,
          dateDemarrage: pc.dateDemarrage ?? dc.dateDemarrage,
          sourcePlacement: pc.sourcePlacement ?? dc.sourcePlacement,
          interetConfirme: pc.interetConfirme || dc.interetConfirme,
          interetConfirmeDate: pc.interetConfirmeDate ?? dc.interetConfirmeDate,
          trameAnswers: pc.trameAnswers ?? (dc.trameAnswers as Prisma.InputJsonValue) ?? undefined,
          qualifFit: mergeJson(pc.qualifFit, dc.qualifFit),
        },
      });
      await tx.candidature.delete({ where: { id: dc.id } });
      fused++;
    }

    // 2. Expériences : seulement si la principale n'en a pas (évite les doublons de parcours)
    if (primary._count.experiences === 0 && dup._count.experiences > 0) {
      await tx.candidatExperience.updateMany({ where: { candidatId: dup.id }, data: { candidatId: primary.id } });
    }

    // 3. Compte espace candidat : on le récupère si la principale n'en a pas
    if (!primary.candidateAccount && dup.candidateAccount) {
      await tx.candidateAccount.update({ where: { id: dup.candidateAccount.id }, data: { candidatId: primary.id } });
    }

    // 4. Autres rattachements
    await tx.marketList.updateMany({ where: { candidatId: dup.id }, data: { candidatId: primary.id } });
    await tx.aiProspectSearch.updateMany({ where: { candidatId: dup.id }, data: { candidatId: primary.id } });
    await tx.booking.updateMany({ where: { candidatId: dup.id }, data: { candidatId: primary.id } });
    await tx.noteCall.updateMany({ where: { candidatId: dup.id }, data: { candidatId: primary.id } });
    const activites = await movePolymorphic(tx, 'CANDIDAT', dup.id, primary.id);

    // 5. Champs de la fiche
    await tx.candidat.update({
      where: { id: primary.id },
      data: {
        ...fillBlanks(primary as any, dup as any, CANDIDAT_FILL_FIELDS as any),
        tags: [...new Set([...(primary.tags || []), ...(dup.tags || [])])],
        notes: joinNotes(primary.notes, dup.notes),
        aPlayer: primary.aPlayer || dup.aPlayer,
        consentementRgpd: primary.consentementRgpd || dup.consentementRgpd,
        cvConsent: primary.cvConsent || dup.cvConsent,
        qualification: mergeJson(primary.qualification, dup.qualification),
      },
    });

    // 6. Trace puis suppression du doublon (ses expériences restantes partent en cascade)
    await logMerge(tx, 'CANDIDAT', primary.id, label(dup), dup.id, userId,
      `${moved} candidature(s) déplacée(s), ${fused} fusionnée(s), ${activites} activité(s) rattachée(s).`);
    await tx.candidat.delete({ where: { id: dup.id } });

    return { primaryId: primary.id, candidaturesDeplacees: moved, candidaturesFusionnees: fused, activitesRattachees: activites };
  }, { timeout: 30_000 });
}

// ═══════════════════════════════════════════════════════════
// CLIENTS (contacts)
// ═══════════════════════════════════════════════════════════

const CLIENT_FILL_FIELDS = ['prenom', 'email', 'telephone', 'poste', 'roleContact', 'linkedinUrl', 'photoUrl', 'assignedToId'] as const;

async function loadClients(primaryId: string, duplicateId: string) {
  if (primaryId === duplicateId) throw new MergeError('same_id', 'Les deux fiches sont identiques.');
  const include = { entreprise: { select: { id: true, nom: true } }, _count: { select: { mandats: true, portalAccesses: true } } } as const;
  const [primary, dup] = await Promise.all([
    prisma.client.findUnique({ where: { id: primaryId }, include }),
    prisma.client.findUnique({ where: { id: duplicateId }, include }),
  ]);
  if (!primary) throw new MergeError('not_found', `Client principal introuvable (${primaryId}).`);
  if (!dup) throw new MergeError('not_found', `Client doublon introuvable (${duplicateId}).`);
  return { primary, dup };
}

export async function previewMergeClients(primaryId: string, duplicateId: string) {
  const { primary, dup } = await loadClients(primaryId, duplicateId);
  return {
    principal: { id: primary.id, nom: label(primary), email: primary.email, entreprise: primary.entreprise.nom, mandats: primary._count.mandats },
    doublon: { id: dup.id, nom: label(dup), email: dup.email, entreprise: dup.entreprise.nom, mandats: dup._count.mandats },
    mandats_deplaces: dup._count.mandats,
    acces_portail_deplaces: dup._count.portalAccesses,
    champs_completes: Object.keys(fillBlanks(primary as any, dup as any, CLIENT_FILL_FIELDS as any)),
    attention: primary.entreprise.id !== dup.entreprise.id
      ? `Les deux contacts ne sont pas dans la même entreprise (${primary.entreprise.nom} / ${dup.entreprise.nom}). L'entreprise du principal est gardée.`
      : undefined,
  };
}

export async function mergeClients(primaryId: string, duplicateId: string, userId?: string) {
  const { primary, dup } = await loadClients(primaryId, duplicateId);

  return prisma.$transaction(async (tx) => {
    const mandats = await tx.mandat.updateMany({ where: { clientId: dup.id }, data: { clientId: primary.id } });
    const acces = await tx.portalAccess.updateMany({ where: { clientId: dup.id }, data: { clientId: primary.id } });
    await tx.lead.updateMany({ where: { clientId: dup.id }, data: { clientId: primary.id } });
    await tx.noteCall.updateMany({ where: { clientId: dup.id }, data: { clientId: primary.id } });
    const activites = await movePolymorphic(tx, 'CLIENT', dup.id, primary.id);

    // Statut : on garde le plus avancé dans le cycle commercial
    const STATUT_ORDER = ['INACTIF', 'LEAD', 'PREMIER_CONTACT', 'BESOIN_QUALIFIE', 'PROPOSITION_ENVOYEE', 'MANDAT_SIGNE', 'RECURRENT'];
    const statutClient = STATUT_ORDER.indexOf(dup.statutClient) > STATUT_ORDER.indexOf(primary.statutClient) ? dup.statutClient : primary.statutClient;

    await tx.client.update({
      where: { id: primary.id },
      data: {
        ...fillBlanks(primary as any, dup as any, CLIENT_FILL_FIELDS as any),
        statutClient,
        notes: joinNotes(primary.notes, dup.notes),
      },
    });

    await logMerge(tx, 'CLIENT', primary.id, label(dup), dup.id, userId,
      `${mandats.count} mandat(s), ${acces.count} accès portail et ${activites} activité(s) rattachés.`);
    await tx.client.delete({ where: { id: dup.id } });

    return { primaryId: primary.id, mandatsDeplaces: mandats.count, accesPortailDeplaces: acces.count, activitesRattachees: activites };
  }, { timeout: 30_000 });
}

// ═══════════════════════════════════════════════════════════
// ENTREPRISES
// ═══════════════════════════════════════════════════════════

const ENTREPRISE_FILL_FIELDS = [
  'secteur', 'siteWeb', 'domaine', 'taille', 'localisation', 'linkedinUrl', 'logoUrl',
  'siren', 'siret', 'formeJuridique', 'capitalSocial', 'chiffreAffaires', 'effectif', 'dateCreation',
  'codeNAF', 'libelleNAF', 'adresseComplete', 'pappersUrl', 'pappersEnrichedAt', 'pappersRawData',
] as const;

async function loadEntreprises(primaryId: string, duplicateId: string) {
  if (primaryId === duplicateId) throw new MergeError('same_id', 'Les deux fiches sont identiques.');
  const include = { _count: { select: { clients: true, mandats: true } } } as const;
  const [primary, dup] = await Promise.all([
    prisma.entreprise.findUnique({ where: { id: primaryId }, include }),
    prisma.entreprise.findUnique({ where: { id: duplicateId }, include }),
  ]);
  if (!primary) throw new MergeError('not_found', `Entreprise principale introuvable (${primaryId}).`);
  if (!dup) throw new MergeError('not_found', `Entreprise doublon introuvable (${duplicateId}).`);
  return { primary, dup };
}

export async function previewMergeEntreprises(primaryId: string, duplicateId: string) {
  const { primary, dup } = await loadEntreprises(primaryId, duplicateId);
  return {
    principal: { id: primary.id, nom: primary.nom, site: primary.siteWeb, contacts: primary._count.clients, mandats: primary._count.mandats },
    doublon: { id: dup.id, nom: dup.nom, site: dup.siteWeb, contacts: dup._count.clients, mandats: dup._count.mandats },
    contacts_deplaces: dup._count.clients,
    mandats_deplaces: dup._count.mandats,
    champs_completes: Object.keys(fillBlanks(primary as any, dup as any, ENTREPRISE_FILL_FIELDS as any)),
    attention: primary.siren && dup.siren && primary.siren !== dup.siren
      ? `SIREN différents (${primary.siren} / ${dup.siren}) : ce sont peut-être deux sociétés distinctes.`
      : undefined,
  };
}

export async function mergeEntreprises(primaryId: string, duplicateId: string, userId?: string) {
  const { primary, dup } = await loadEntreprises(primaryId, duplicateId);

  return prisma.$transaction(async (tx) => {
    const clients = await tx.client.updateMany({ where: { entrepriseId: dup.id }, data: { entrepriseId: primary.id } });
    const mandats = await tx.mandat.updateMany({ where: { entrepriseId: dup.id }, data: { entrepriseId: primary.id } });
    await tx.lead.updateMany({ where: { entrepriseId: dup.id }, data: { entrepriseId: primary.id } });
    await tx.marketListEstablishment.updateMany({ where: { entrepriseId: dup.id }, data: { entrepriseId: primary.id } });
    const activites = await movePolymorphic(tx, 'ENTREPRISE', dup.id, primary.id);

    await tx.entreprise.update({
      where: { id: primary.id },
      data: {
        ...fillBlanks(primary as any, dup as any, ENTREPRISE_FILL_FIELDS as any),
        notes: joinNotes(primary.notes, dup.notes),
      },
    });

    await logMerge(tx, 'ENTREPRISE', primary.id, dup.nom, dup.id, userId,
      `${clients.count} contact(s), ${mandats.count} mandat(s) et ${activites} activité(s) rattachés.`);
    await tx.entreprise.delete({ where: { id: dup.id } });

    return { primaryId: primary.id, contactsDeplaces: clients.count, mandatsDeplaces: mandats.count, activitesRattachees: activites };
  }, { timeout: 30_000 });
}
