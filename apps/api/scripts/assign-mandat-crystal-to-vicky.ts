/**
 * Assign all mandates of "Crystal Placement" to Vicky Deletang.
 *
 * Usage:  npx tsx scripts/assign-mandat-crystal-to-vicky.ts
 *
 * - Matches entreprise by name (case-insensitive, contains "crystal placement")
 * - Matches recruiter by email vicky@humanup.io
 * - Reassigns every mandate of that entreprise to Vicky
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const vicky = await prisma.user.findUnique({ where: { email: 'vicky@humanup.io' } });
  if (!vicky) {
    throw new Error('User vicky@humanup.io introuvable. Lance d\'abord create-user-vicky.ts.');
  }

  const entreprise = await prisma.entreprise.findFirst({
    where: { nom: { contains: 'Crystal Placement', mode: 'insensitive' } },
  });
  if (!entreprise) {
    throw new Error('Entreprise "Crystal Placement" introuvable.');
  }

  const mandats = await prisma.mandat.findMany({
    where: { entrepriseId: entreprise.id },
    select: { id: true, titrePoste: true, assignedToId: true },
  });

  if (!mandats.length) {
    console.log(`Aucun mandat trouve pour ${entreprise.nom}.`);
    return;
  }

  console.log(`${mandats.length} mandat(s) trouve(s) pour ${entreprise.nom} :`);
  for (const m of mandats) {
    console.log(`  - ${m.titrePoste} (${m.id})${m.assignedToId ? ` [deja assigne a ${m.assignedToId}]` : ''}`);
  }

  const result = await prisma.mandat.updateMany({
    where: { entrepriseId: entreprise.id },
    data: { assignedToId: vicky.id },
  });

  console.log(`\nReassigne ${result.count} mandat(s) a Vicky Deletang (${vicky.id}).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
