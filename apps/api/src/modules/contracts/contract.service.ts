/**
 * Contrat mandat — validation admin sous 18% + envoi signature.
 *
 * Le fee plancher est 18%. Toute demande d'envoi sous ce seuil doit d'abord
 * passer par un ADMIN (endpoint approve/reject). Le trigger côté front
 * bloque déjà l'envoi, mais on re-verifie en service ("defense in depth").
 */

import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../lib/errors.js';
import type { ContractStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { canonicalExceptions, approvalExceptions, type ContractExceptions } from './contract-generate.service.js';
import { notifyContractApprovalRequest } from '../announcements/team-email.service.js';

const FEE_FLOOR = 18; // Plancher %

/**
 * Cree une demande d'approbation sous 18%. Idempotent : si une demande
 * PENDING existe deja sur ce mandat, la retourne au lieu d'en creer une
 * nouvelle.
 */
export async function requestApproval(
  data: { mandatId: string; feeRequested: number; reason: string },
  requestedById: string,
) {
  const mandat = await prisma.mandat.findUnique({ where: { id: data.mandatId } });
  if (!mandat) throw new NotFoundError('Mandat', data.mandatId);

  if (data.feeRequested >= FEE_FLOOR) {
    throw new ValidationError(
      `Le taux demande (${data.feeRequested}%) est superieur ou egal au plancher ${FEE_FLOOR}% — pas besoin de validation admin.`,
    );
  }
  if (data.feeRequested <= 0) {
    throw new ValidationError('Le taux doit etre strictement positif.');
  }
  if (!data.reason?.trim()) {
    throw new ValidationError('Une raison est requise pour justifier le fee sous le plancher.');
  }

  const existing = await prisma.contractApproval.findFirst({
    where: { mandatId: data.mandatId, status: 'PENDING' },
  });
  if (existing) return existing;

  const approval = await prisma.contractApproval.create({
    data: {
      mandatId: data.mandatId,
      feeRequested: data.feeRequested,
      reason: data.reason.trim(),
      requestedById,
      status: 'PENDING',
    },
  });

  // Email fire-and-forget aux admins
  (async () => {
    const context = await prisma.mandat.findUnique({
      where: { id: data.mandatId },
      select: {
        titrePoste: true,
        entreprise: { select: { nom: true } },
      },
    });
    const requester = await prisma.user.findUnique({
      where: { id: requestedById },
      select: { prenom: true },
    });
    if (context) {
      await notifyContractApprovalRequest({
        mandatTitre: context.titrePoste,
        entrepriseNom: context.entreprise?.nom ?? '?',
        feeRequested: Number(approval.feeRequested),
        reason: approval.reason,
        requestedByPrenom: requester?.prenom ?? null,
        approvalId: approval.id,
      });
    }
  })().catch((err) => console.error('[contract] approval email failed:', err));

  return approval;
}

/**
 * Demande de validation pour des conditions hors standard (outil MCP
 * generate_contract) : fee sous 18 %, garantie, propriété, paiement, clause
 * libre. Idempotent : une demande PENDING portant exactement sur les mêmes
 * valeurs est renvoyée telle quelle.
 */
export async function requestContractExceptions(
  data: { mandatId: string; fee: number; exceptions: ContractExceptions; exceptionLabels: string[]; reason: string },
  requestedById: string,
) {
  if (Object.keys(data.exceptions).length === 0) {
    throw new ValidationError('Nothing to approve: these terms are within the standard limits.');
  }
  if (!data.reason?.trim()) throw new ValidationError('A reason is required.');

  const wanted = canonicalExceptions(data.exceptions);
  const pending = await prisma.contractApproval.findMany({ where: { mandatId: data.mandatId, status: 'PENDING' } });
  const same = pending.find((p) => canonicalExceptions(approvalExceptions(p)) === wanted);
  if (same) return { approval: same, created: false };

  const approval = await prisma.contractApproval.create({
    data: {
      mandatId: data.mandatId,
      feeRequested: data.fee,
      reason: data.reason.trim(),
      exceptions: data.exceptions as Prisma.InputJsonObject,
      requestedById,
      status: 'PENDING',
    },
  });

  (async () => {
    const [context, requester] = await Promise.all([
      prisma.mandat.findUnique({ where: { id: data.mandatId }, select: { titrePoste: true, entreprise: { select: { nom: true } } } }),
      prisma.user.findUnique({ where: { id: requestedById }, select: { prenom: true } }),
    ]);
    if (context) {
      await notifyContractApprovalRequest({
        mandatTitre: context.titrePoste,
        entrepriseNom: context.entreprise?.nom ?? '?',
        feeRequested: data.fee,
        reason: approval.reason,
        requestedByPrenom: requester?.prenom ?? null,
        approvalId: approval.id,
        exceptionLabels: data.exceptionLabels,
        customClause: data.exceptions.custom_clause ?? null,
      });
    }
  })().catch((err) => console.error('[contract] approval email failed:', err));

  return { approval, created: true };
}

/**
 * Un ADMIN approuve. Applique le nouveau fee au mandat en meme temps.
 */
export async function approve(approvalId: string, adminId: string, adminRole: string) {
  if (adminRole !== 'ADMIN') throw new ForbiddenError('Seuls les administrateurs peuvent approuver un contrat.');
  const approval = await prisma.contractApproval.findUnique({ where: { id: approvalId } });
  if (!approval) throw new NotFoundError('ContractApproval', approvalId);
  if (approval.status !== 'PENDING') {
    throw new ValidationError(`Cette demande a deja ete traitee (statut ${approval.status}).`);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.contractApproval.update({
      where: { id: approvalId },
      data: { status: 'APPROVED', approvedById: adminId, approvedAt: new Date() },
    });
    await tx.mandat.update({
      where: { id: approval.mandatId },
      data: { feePourcentage: approval.feeRequested },
    });
    return updated;
  });
}

export async function reject(approvalId: string, adminId: string, adminRole: string, note?: string) {
  if (adminRole !== 'ADMIN') throw new ForbiddenError('Seuls les administrateurs peuvent rejeter un contrat.');
  const approval = await prisma.contractApproval.findUnique({ where: { id: approvalId } });
  if (!approval) throw new NotFoundError('ContractApproval', approvalId);
  if (approval.status !== 'PENDING') {
    throw new ValidationError(`Cette demande a deja ete traitee (statut ${approval.status}).`);
  }

  return prisma.contractApproval.update({
    where: { id: approvalId },
    data: { status: 'REJECTED', approvedById: adminId, approvedAt: new Date(), rejectionNote: note ?? null },
  });
}

export async function listPending(adminRole: string) {
  if (adminRole !== 'ADMIN') throw new ForbiddenError('Endpoint reserve aux administrateurs.');
  return prisma.contractApproval.findMany({
    where: { status: 'PENDING' },
    include: {
      mandat: {
        select: {
          id: true,
          titrePoste: true,
          feePourcentage: true,
          entreprise: { select: { nom: true } },
          client: { select: { nom: true, prenom: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Envoie le contrat pour signature. Placeholder — aucun provider (DocuSign,
 * Yousign) n'est branche pour l'instant. On marque `contractStatus=SENT` +
 * `contractSentAt` + on log une Activite sur le mandat.
 *
 * Verifie que si le fee est sous 18%, une approval APPROVED existe pour ce
 * mandat (defense in depth cote back — l'UI bloque deja).
 */
export async function sendForSignature(
  mandatId: string,
  data: {
    feePourcentage: number;
    paymentTerms: string;
    applicableCountry: string;
  },
  userId: string,
) {
  const mandat = await prisma.mandat.findUnique({ where: { id: mandatId } });
  if (!mandat) throw new NotFoundError('Mandat', mandatId);

  if (data.feePourcentage < FEE_FLOOR) {
    const approval = await prisma.contractApproval.findFirst({
      where: { mandatId, status: 'APPROVED' },
      orderBy: { approvedAt: 'desc' },
    });
    if (!approval || Number(approval.feeRequested) !== data.feePourcentage) {
      throw new ForbiddenError(
        `Fee ${data.feePourcentage}% sous le plancher ${FEE_FLOOR}% — necessite une validation admin APPROVED prealable.`,
      );
    }
  }

  const updated = await prisma.mandat.update({
    where: { id: mandatId },
    data: {
      feePourcentage: data.feePourcentage,
      paymentTerms: data.paymentTerms,
      applicableCountry: data.applicableCountry.toUpperCase(),
      contractStatus: 'SENT' as ContractStatus,
      contractSentAt: new Date(),
    },
  });

  // Trace en activite
  await prisma.activite.create({
    data: {
      type: 'NOTE',
      titre: 'Contrat envoyé pour signature',
      contenu: `Fee ${data.feePourcentage}% · ${data.paymentTerms} · droit ${data.applicableCountry.toUpperCase()}`,
      entiteType: 'MANDAT',
      entiteId: mandatId,
      userId,
      source: 'SYSTEME',
      metadata: { contractSent: true, fee: data.feePourcentage, paymentTerms: data.paymentTerms, applicableCountry: data.applicableCountry },
    },
  });

  return updated;
}
