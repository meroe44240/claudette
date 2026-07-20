import { PrismaClient } from '@prisma/client';
import { hash } from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const users = [
    { email: 'meroe@humanup.io', nom: 'Nguimbi', prenom: 'Meroe', role: 'ADMIN' as const },
    { email: 'guillermo@humanup.io', nom: 'Sanchez', prenom: 'Guillermo', role: 'RECRUTEUR' as const },
    { email: 'valentin@humanup.io', nom: 'Dumont', prenom: 'Valentin', role: 'RECRUTEUR' as const },
    { email: 'marie@humanup.io', nom: 'Laurent', prenom: 'Marie', role: 'RECRUTEUR' as const },
  ];

  for (const u of users) {
    const passwordHash = await hash('Humanup2026!', 12);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash,
        nom: u.nom,
        prenom: u.prenom,
        role: u.role,
        mustChangePassword: true,
      },
    });
    console.log(`Created/verified user: ${u.email}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
