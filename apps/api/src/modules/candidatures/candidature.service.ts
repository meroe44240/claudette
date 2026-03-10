import prisma from '../../lib/db.js';
import { NotFoundError, ConflictError, ValidationError } from '../../lib/errors.js';
import type { CreateCandidatureInput, UpdateCandidatureInput } from './candidature.schema.js';
import type { StageCandidature } from '@prisma/client';

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

    // Auto-create follow-up tasks based on stage
    const stageTaskMap: Record<string, string[]> = {
      'CONTACTE': ['Pr\u00e9parer le brief candidat'],
      'ENTRETIEN': ['Pr\u00e9parer le candidat pour l\'entretien', 'Confirmer la date d\'entretien'],
      'ENTRETIEN_CLIENT': ['Envoyer le brief au client', 'Pr\u00e9parer le candidat pour le client'],
      'SHORTLIST': ['Envoyer la shortlist au client'],
      'OFFRE': ['N\u00e9gocier les conditions', 'Pr\u00e9parer le contrat'],
      'PLACE': ['Planifier le check-in \u00e0 1 mois', 'Envoyer la facturation'],
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
        titre: `Stage chang\u00e9: ${existing.stage} \u2192 ${stage}`,
        entiteType: 'CANDIDAT',
        entiteId: existing.candidatId,
        userId: changedById,
        source: 'SYSTEME',
        metadata: { stageChange: true, candidatureId: id, mandatId: existing.mandatId, fromStage: existing.stage, toStage: stage },
      },
    });

    results.push(updated);
  }
  return { updated: results.length, results };
}
