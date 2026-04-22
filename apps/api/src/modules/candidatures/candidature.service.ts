import prisma from '../../lib/db.js';
import { NotFoundError, ConflictError, ValidationError } from '../../lib/errors.js';
import type { CreateCandidatureInput, UpdateCandidatureInput } from './candidature.schema.js';
import type { StageCandidature } from '@prisma/client';
import {
  notifyPresentation,
  notifyRdvClient,
  notifyCloseWon,
} from '../slack/slack.service.js';
import { logActivity } from '../../lib/activity-logger.js';

/**
 * Fetch full context for a candidature (candidat, mandat, entreprise, client, recruteur)
 * and fire the appropriate Slack notification based on the new stage.
 * All calls are fire-and-forget so they never block mutations.
 */
async function fireSlackStageNotification(
  candidatureId: string,
  newStage: string,
  dateEntretienClient?: Date | null,
): Promise<void> {
  const candidature = await prisma.candidature.findUnique({
    where: { id: candidatureId },
    include: {
      candidat: { select: { nom: true, prenom: true } },
      mandat: {
        include: {
          entreprise: { select: { nom: true } },
          client: { select: { nom: true, prenom: true } },
          assignedTo: { select: { prenom: true } },
        },
      },
    },
  });
  if (!candidature) return;

  const { candidat, mandat } = candidature;
  const contactNom = mandat.client
    ? [mandat.client.prenom, mandat.client.nom].filter(Boolean).join(' ')
    : null;

  if (newStage === 'ENTRETIEN_CLIENT') {
    await notifyPresentation({
      candidatPrenom: candidat.prenom,
      candidatNom: candidat.nom,
      entrepriseNom: mandat.entreprise?.nom || 'N/A',
      contactNom,
      mandatTitre: mandat.titrePoste,
      recruteurPrenom: mandat.assignedTo?.prenom || null,
    });
  } else if (newStage === 'ENTRETIEN_1') {
    await notifyRdvClient({
      candidatPrenom: candidat.prenom,
      candidatNom: candidat.nom,
      entrepriseNom: mandat.entreprise?.nom || 'N/A',
      contactNom,
      mandatTitre: mandat.titrePoste,
      dateEntretien: dateEntretienClient || candidature.dateEntretienClient || null,
      recruteurPrenom: mandat.assignedTo?.prenom || null,
    });
  } else if (newStage === 'PLACE') {
    await notifyCloseWon({
      candidatPrenom: candidat.prenom,
      candidatNom: candidat.nom,
      entrepriseNom: mandat.entreprise?.nom || 'N/A',
      mandatTitre: mandat.titrePoste,
      feeMontant: mandat.feeMontantFacture || mandat.feeMontantEstime || null,
      recruteurPrenom: mandat.assignedTo?.prenom || null,
    });
  }
}

export async function list(filters: {
  mandatId?: string;
  stage?: StageCandidature;
  include?: string;
}) {
  const where: any = {};
  if (filters.mandatId) where.mandatId = filters.mandatId;
  if (filters.stage) where.stage = filters.stage;

  const candidatures = await prisma.candidature.findMany({
    where,
    include: {
      candidat: filters.include === 'candidat' ? {
        select: {
          id: true,
          nom: true,
          prenom: true,
          email: true,
          telephone: true,
          posteActuel: true,
          entrepriseActuelle: true,
          linkedinUrl: true,
          localisation: true,
          tags: true,
          source: true,
          anneesExperience: true,
          aiPitchShort: true,
        },
      } : false,
      mandat: {
        select: { id: true, titrePoste: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return { data: candidatures };
}

export async function create(data: CreateCandidatureInput, createdById: string) {
  // Check for duplicate (mandatId + candidatId must be unique)
  const existing = await prisma.candidature.findUnique({
    where: {
      mandatId_candidatId: {
        mandatId: data.mandatId,
        candidatId: data.candidatId,
      },
    },
  });

  if (existing) {
    throw new ConflictError('Ce candidat est deja associe a ce mandat');
  }

  // Create candidature with initial stage history entry
  const candidature = await prisma.candidature.create({
    data: {
      mandatId: data.mandatId,
      candidatId: data.candidatId,
      stage: data.stage,
      notes: data.notes,
      createdById,
    },
  });

  // Create initial StageHistory entry
  await prisma.stageHistory.create({
    data: {
      candidatureId: candidature.id,
      fromStage: null,
      toStage: data.stage,
      changedById: createdById,
    },
  });

  // Fire-and-forget: log "candidat added to mandat" activity
  prisma.mandat
    .findUnique({ where: { id: data.mandatId }, select: { titrePoste: true } })
    .then((mandat) => {
      const titre = mandat?.titrePoste || data.mandatId;
      logActivity({
        type: 'NOTE',
        entiteType: 'CANDIDAT',
        entiteId: data.candidatId,
        userId: createdById,
        titre: `Ajouté au mandat ${titre}`,
        source: 'SYSTEME',
        metadata: { candidatureId: candidature.id, mandatId: data.mandatId },
      });
    })
    .catch(() => {});

  // If the candidature is created DIRECTLY at an advanced stage
  // (ENTRETIEN_1 / ENTRETIEN_CLIENT / PLACE), fire the matching Slack notif —
  // this happens e.g. when a recruiter drops a candidat straight into the
  // client-interview column of the kanban.
  if (['ENTRETIEN_1', 'ENTRETIEN_CLIENT', 'PLACE'].includes(data.stage)) {
    fireSlackStageNotification(candidature.id, data.stage, null).catch(() => {});
  }

  return candidature;
}

export async function update(id: string, data: UpdateCandidatureInput, changedById: string) {
  const existing = await prisma.candidature.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Candidature', id);

  // If stage is REFUSE, require motifRefus
  if (data.stage === 'REFUSE' && !data.motifRefus && !existing.motifRefus) {
    throw new ValidationError('Le motif de refus est requis lorsque le stage est REFUSE');
  }

  const updateData: any = {};

  if (data.stage !== undefined) updateData.stage = data.stage;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.motifRefus !== undefined) updateData.motifRefus = data.motifRefus;
  if (data.motifRefusDetail !== undefined) updateData.motifRefusDetail = data.motifRefusDetail;
  if (data.datePresentation !== undefined) updateData.datePresentation = new Date(data.datePresentation);
  if (data.dateEntretienClient !== undefined) updateData.dateEntretienClient = new Date(data.dateEntretienClient);

  const candidature = await prisma.candidature.update({
    where: { id },
    data: updateData,
  });

  // If stage changed, create StageHistory entry
  if (data.stage && data.stage !== existing.stage) {
    await prisma.stageHistory.create({
      data: {
        candidatureId: id,
        fromStage: existing.stage as StageCandidature,
        toStage: data.stage as StageCandidature,
        changedById,
      },
    });

    // Log activity for stage change (audit trail)
    const stageLabels: Record<string, string> = {
      SOURCING: 'Sourcing', CONTACTE: 'Contacté', ENTRETIEN_1: 'Entretien 1',
      ENTRETIEN_CLIENT: 'Entretien Client', SHORTLIST: 'Shortlist',
      OFFRE: 'Offre', PLACE: 'Placé', REFUSE: 'Refusé',
    };
    await prisma.activite.create({
      data: {
        type: 'NOTE',
        titre: `Pipeline : ${stageLabels[existing.stage] || existing.stage} → ${stageLabels[data.stage as string] || data.stage}`,
        entiteType: 'CANDIDAT',
        entiteId: existing.candidatId,
        userId: changedById,
        source: 'SYSTEME',
        metadata: { stageChange: true, candidatureId: id, mandatId: existing.mandatId, fromStage: existing.stage, toStage: data.stage },
      },
    });

    // Auto-create follow-up tasks based on stage
    const stageTaskMap: Record<string, string[]> = {
      'CONTACTE': ['Préparer le brief candidat'],
      'ENTRETIEN': ['Préparer le candidat pour l\'entretien', 'Confirmer la date d\'entretien'],
      'ENTRETIEN_CLIENT': ['Envoyer le brief au client', 'Préparer le candidat pour le client'],
      'SHORTLIST': ['Envoyer la shortlist au client'],
      'OFFRE': ['Négocier les conditions', 'Préparer le contrat'],
      'PLACE': ['Planifier le check-in à 1 mois', 'Envoyer la facturation'],
    };

    const tasksToCreate = stageTaskMap[data.stage as string] || [];
    for (const taskTitle of tasksToCreate) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3); // Default: 3 days
      await prisma.activite.create({
        data: {
          type: 'TACHE',
          isTache: true,
          tacheCompleted: false,
          titre: taskTitle,
          entiteType: 'CANDIDAT',
          entiteId: existing.candidatId,
          userId: changedById,
          source: 'SYSTEME',
          tacheDueDate: dueDate,
          metadata: { autoCreated: true, candidatureId: id, mandatId: existing.mandatId, triggerStage: data.stage },
        },
      });
    }

    // Fire-and-forget Slack notification for key stage changes
    const dateEntretien = data.dateEntretienClient ? new Date(data.dateEntretienClient) : null;
    fireSlackStageNotification(id, data.stage, dateEntretien).catch(() => {});
  }

  return candidature;
}

export async function remove(id: string) {
  const existing = await prisma.candidature.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Candidature', id);

  // StageHistory will be cascade-deleted due to onDelete: Cascade in schema
  return prisma.candidature.delete({ where: { id } });
}

export async function getHistory(id: string) {
  const existing = await prisma.candidature.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Candidature', id);

  return prisma.stageHistory.findMany({
    where: { candidatureId: id },
    orderBy: { changedAt: 'desc' },
  });
}

export async function bulkUpdateStage(
  ids: string[],
  stage: string,
  changedById: string,
  motifRefus?: string,
  motifRefusDetail?: string
) {
  if (stage === 'REFUSE' && !motifRefus) {
    throw new ValidationError('Le motif de refus est requis pour le stage REFUSE');
  }

  const results = [];
  for (const id of ids) {
    const existing = await prisma.candidature.findUnique({ where: { id } });
    if (!existing) continue;
    if (existing.stage === stage) continue;

    const updateData: any = { stage };
    if (motifRefus) updateData.motifRefus = motifRefus;
    if (motifRefusDetail) updateData.motifRefusDetail = motifRefusDetail;

    const updated = await prisma.candidature.update({
      where: { id },
      data: updateData,
    });

    await prisma.stageHistory.create({
      data: {
        candidatureId: id,
        fromStage: existing.stage as StageCandidature,
        toStage: stage as StageCandidature,
        changedById,
      },
    });

    // Auto-create activity for stage change
    await prisma.activite.create({
      data: {
        type: 'NOTE',
        titre: `Stage changé: ${existing.stage} → ${stage}`,
        entiteType: 'CANDIDAT',
        entiteId: existing.candidatId,
        userId: changedById,
        source: 'SYSTEME',
        metadata: { stageChange: true, candidatureId: id, mandatId: existing.mandatId, fromStage: existing.stage, toStage: stage },
      },
    });

    // Fire-and-forget Slack notification for key stage changes
    fireSlackStageNotification(id, stage, null).catch(() => {});

    results.push(updated);
  }
  return { updated: results.length, results };
}
