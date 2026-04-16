/**
 * Anti-duplicate push check.
 *
 * Before creating a push, verify if the same candidate was already pushed
 * to the same company recently. Prevents embarrassing double-sends.
 *
 * Rules:
 *  - <3 months: hard_block (too recent)
 *  - 3-12 months: warn (can proceed but flag)
 *  - >12 months: allow
 */

import prisma from '../../lib/db.js';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  blockingLevel: 'hard_block' | 'warn' | 'allow';
  existingPush?: {
    id: string;
    sentAt: Date;
    recruiterName: string;
    prospectCompany: string;
    status: string;
  };
  monthsAgo?: number;
}

export async function checkDuplicatePush(
  candidatId: string,
  prospectCompanyName: string,
): Promise<DuplicateCheckResult> {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  // Find recent pushes for same candidate to same company
  const recent = await prisma.push.findFirst({
    where: {
      candidatId,
      prospect: {
        companyName: { equals: prospectCompanyName, mode: 'insensitive' },
      },
      sentAt: { gte: twelveMonthsAgo },
    },
    orderBy: { sentAt: 'desc' },
    include: {
      recruiter: { select: { nom: true, prenom: true } },
      prospect: { select: { companyName: true } },
    },
  });

  if (!recent) {
    return { isDuplicate: false, blockingLevel: 'allow' };
  }

  const now = new Date();
  const monthsAgo = Math.floor(
    (now.getTime() - recent.sentAt.getTime()) / (1000 * 60 * 60 * 24 * 30),
  );

  const existingPush = {
    id: recent.id,
    sentAt: recent.sentAt,
    recruiterName: `${recent.recruiter.prenom || ''} ${recent.recruiter.nom}`.trim(),
    prospectCompany: recent.prospect.companyName,
    status: recent.status,
  };

  if (monthsAgo < 3) {
    return {
      isDuplicate: true,
      blockingLevel: 'hard_block',
      existingPush,
      monthsAgo,
    };
  }

  // 3-12 months: warn
  return {
    isDuplicate: true,
    blockingLevel: 'warn',
    existingPush,
    monthsAgo,
  };
}
