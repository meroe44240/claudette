/**
 * isActiveClient — determines if an email recipient is an active client
 * (has invoice or active mandate) vs. a prospect (valid push target).
 *
 * Used by the push detection pipeline to filter out emails to active clients.
 */

import prisma from '../../lib/db.js';

export interface ActiveClientResult {
  isActive: boolean;
  reason: 'has_invoice' | 'has_active_mandate' | 'no_match' | 'prospect';
  clientId?: string;
  companyId?: string;
  companyName?: string;
}

/**
 * Check if the email recipient is an "active client" (should NOT create a push).
 *
 * Active client = entreprise linked to the contact has:
 *  - At least one mandat with feeStatut in (FACTURE, PAYE) → has invoice
 *  - OR at least one mandat with statut in (OUVERT, EN_COURS) → active mandate
 *
 * If neither → prospect, even if the contact already exists in clients table.
 */
export async function isActiveClient(email: string): Promise<ActiveClientResult> {
  if (!email) return { isActive: false, reason: 'no_match' };

  const normalizedEmail = email.toLowerCase().trim();

  // 1. Find client by email
  const client = await prisma.client.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    select: {
      id: true,
      entrepriseId: true,
      entreprise: { select: { nom: true } },
    },
  });

  if (!client) {
    return { isActive: false, reason: 'no_match' };
  }

  // 2. Check if company has invoiced mandats (feeStatut = FACTURE or PAYE)
  const hasInvoice = await prisma.mandat.findFirst({
    where: {
      entrepriseId: client.entrepriseId,
      feeStatut: { in: ['FACTURE', 'PAYE'] },
    },
    select: { id: true },
  });

  if (hasInvoice) {
    return {
      isActive: true,
      reason: 'has_invoice',
      clientId: client.id,
      companyId: client.entrepriseId,
      companyName: client.entreprise.nom,
    };
  }

  // 3. Check if company has active mandats
  const hasActiveMandate = await prisma.mandat.findFirst({
    where: {
      entrepriseId: client.entrepriseId,
      statut: { in: ['OUVERT', 'EN_COURS'] },
    },
    select: { id: true },
  });

  if (hasActiveMandate) {
    return {
      isActive: true,
      reason: 'has_active_mandate',
      clientId: client.id,
      companyId: client.entrepriseId,
      companyName: client.entreprise.nom,
    };
  }

  // 4. Contact exists but no invoice and no active mandate → prospect
  return {
    isActive: false,
    reason: 'prospect',
    clientId: client.id,
    companyId: client.entrepriseId,
    companyName: client.entreprise.nom,
  };
}
