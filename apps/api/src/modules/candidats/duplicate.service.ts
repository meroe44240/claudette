import prisma from '../../lib/db.js';

interface DuplicateGroup {
  primary: { id: string; nom: string; prenom: string | null; email: string | null };
  duplicates: Array<{ id: string; nom: string; prenom: string | null; email: string | null; matchReason: string }>;
}

export async function detectDuplicates(): Promise<{ groups: DuplicateGroup[] }> {
  const groups: DuplicateGroup[] = [];

  // 1. Find email duplicates
  const emailDupes = await prisma.$queryRaw<Array<{ email: string; count: bigint }>>`
    SELECT email, COUNT(*) as count
    FROM "Candidat"
    WHERE email IS NOT NULL AND email != ''
    GROUP BY email
    HAVING COUNT(*) > 1
    LIMIT 50
  `;

  for (const dupe of emailDupes) {
    const candidats = await prisma.candidat.findMany({
      where: { email: dupe.email },
      select: { id: true, nom: true, prenom: true, email: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    if (candidats.length > 1) {
      groups.push({
        primary: candidats[0],
        duplicates: candidats.slice(1).map(c => ({
          ...c,
          matchReason: `Email identique: ${dupe.email}`,
        })),
      });
    }
  }

  // 2. Find LinkedIn URL duplicates
  const linkedinDupes = await prisma.$queryRaw<Array<{ linkedinUrl: string; count: bigint }>>`
    SELECT "linkedinUrl", COUNT(*) as count
    FROM "Candidat"
    WHERE "linkedinUrl" IS NOT NULL AND "linkedinUrl" != ''
    GROUP BY "linkedinUrl"
    HAVING COUNT(*) > 1
    LIMIT 50
  `;

  for (const dupe of linkedinDupes) {
    const candidats = await prisma.candidat.findMany({
      where: { linkedinUrl: dupe.linkedinUrl },
      select: { id: true, nom: true, prenom: true, email: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    if (candidats.length > 1) {
      const existingGroup = groups.find(g =>
        g.primary.id === candidats[0].id || g.duplicates.some(d => d.id === candidats[0].id)
      );
      if (!existingGroup) {
        groups.push({
          primary: candidats[0],
          duplicates: candidats.slice(1).map(c => ({
            ...c,
            matchReason: `LinkedIn identique`,
          })),
        });
      }
    }
  }

  return { groups };
}

export async function mergeCandidates(primaryId: string, duplicateId: string) {
  const primary = await prisma.candidat.findUnique({ where: { id: primaryId } });
  const duplicate = await prisma.candidat.findUnique({ where: { id: duplicateId } });

  if (!primary || !duplicate) throw new Error('Candidat not found');

  // Move all candidatures from duplicate to primary
  await prisma.candidature.updateMany({
    where: { candidatId: duplicateId },
    data: { candidatId: primaryId },
  });

  // Move all activities from duplicate to primary
  await prisma.activite.updateMany({
    where: { entiteType: 'CANDIDAT', entiteId: duplicateId },
    data: { entiteId: primaryId },
  });

  // Merge tags
  const mergedTags = [...new Set([...(primary.tags || []), ...(duplicate.tags || [])])];

  // Merge competences (stored as tags in this schema)
  // Update primary with merged data and fill in blanks
  await prisma.candidat.update({
    where: { id: primaryId },
    data: {
      tags: mergedTags,
      telephone: primary.telephone || duplicate.telephone,
      email: primary.email || duplicate.email,
      linkedinUrl: primary.linkedinUrl || duplicate.linkedinUrl,
      localisation: primary.localisation || duplicate.localisation,
      posteActuel: primary.posteActuel || duplicate.posteActuel,
      entrepriseActuelle: primary.entrepriseActuelle || duplicate.entrepriseActuelle,
    },
  });

  // Delete the duplicate
  await prisma.candidat.delete({ where: { id: duplicateId } });

  return { message: 'Candidats fusionnes', primaryId };
}
