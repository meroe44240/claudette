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
