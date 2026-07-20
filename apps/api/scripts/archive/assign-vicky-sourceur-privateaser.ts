/**
 * Assign Vicky Deletang as `sourceur` on every Privateaser mandate.
 *
 * Usage:  npx tsx scripts/assign-vicky-sourceur-privateaser.ts
 *
 * - Matches entreprise by name (case-insensitive, contains "privateaser")
 * - Matches recruiter by email vicky@humanup.io
 * - Sets `sourceurId = Vicky.id` on every matching mandat (idempotent)
 * - Skips mandats already sourced by Vicky
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const vicky = await prisma.user.findUnique({ where: { email: 'vicky@humanup.io' } });
  if (!vicky) {
    throw new Error('User vicky@humanup.io introuvable. Lance create-user-vicky.ts d\'abord.');
  }

  const entreprises = await prisma.entreprise.findMany({
    where: { nom: { contains: 'Privateaser', mode: 'insensitive' } },
    select: { id: true, nom: true },
  });
  if (!entreprises.length) {
    throw new Error('Aucune entreprise Privateaser trouvee.');
  }

  const mandats = await prisma.mandat.findMany({
    where: { entrepriseId: { in: entreprises.map((e) => e.id) } },
    select: { id: true, titrePoste: true, sourceurId: true, assignedToId: true },
  });

  if (!mandats.length) {
    console.log(`Aucun mandat trouve pour ${entreprises.map((e) => e.nom).join(', ')}.`);
    return;
  }

  console.log(`${mandats.length} mandat(s) Privateaser trouve(s) :`);
  for (const m of mandats) {
    const already = m.sourceurId === vicky.id ? ' [deja sourceur Vicky]' : '';
    console.log(`  - ${m.titrePoste} (${m.id})${already}`);
  }

  const toUpdate = mandats.filter((m) => m.sourceurId !== vicky.id);
  if (!toUpdate.length) {
    console.log('\nRien a faire — Vicky est deja sourceuse sur tous ces mandats.');
    return;
  }

  const result = await prisma.mandat.updateMany({
    where: { id: { in: toUpdate.map((m) => m.id) } },
    data: { sourceurId: vicky.id },
  });

  console.log(`\nVicky Deletang (${vicky.id}) ajoutee comme sourceuse sur ${result.count} mandat(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
