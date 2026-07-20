/**
 * Create recruiter user Vicky Deletang.
 *
 * Usage:  npx tsx scripts/create-user-vicky.ts
 */

import { PrismaClient } from '@prisma/client';
import { hash } from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'vicky@humanup.io';
  const passwordHash = await hash('Humanup2026', 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      nom: 'Deletang',
      prenom: 'Vicky',
      role: 'RECRUTEUR',
      mustChangePassword: true,
    },
  });

  console.log(`Created/verified user: ${user.email} (${user.id})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
