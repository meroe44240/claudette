/**
 * One-shot : configure la Fonction de chaque user et exclut Meroe des stats
 * d'equipe. A lancer sur chaque environnement APRES la migration
 * 20260720100934_recap_binome_and_fonction (car il faut la colonne fonction).
 *
 * Idempotent (upsert-like via findFirst + update).
 *
 * Usage : docker compose exec api npx tsx scripts/setup-recap-team-config.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface UserSetup {
  emailMatch: string; // ILIKE, so "meroe" matches "meroe@humanup.io"
  fonction: 'SALES' | 'RECRUTEUR' | 'LES_DEUX';
  excludeFromTeamStats: boolean;
}

const SETUP: UserSetup[] = [
  { emailMatch: 'meroe',    fonction: 'LES_DEUX',  excludeFromTeamStats: true  },
  { emailMatch: 'valentin', fonction: 'SALES',     excludeFromTeamStats: false },
  { emailMatch: 'alexis',   fonction: 'SALES',     excludeFromTeamStats: false },
  { emailMatch: 'vicky',    fonction: 'RECRUTEUR', excludeFromTeamStats: false },
];

async function main() {
  for (const setup of SETUP) {
    const user = await prisma.user.findFirst({
      where: { email: { contains: setup.emailMatch, mode: 'insensitive' } },
      select: { id: true, email: true, prenom: true, nom: true },
    });
    if (!user) {
      console.warn(`⚠ User matching "${setup.emailMatch}" introuvable — skip`);
      continue;
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        fonction: setup.fonction,
        excludeFromTeamStats: setup.excludeFromTeamStats,
      },
    });
    console.log(
      `✅ ${user.prenom || ''} ${user.nom} (${user.email}) → fonction=${setup.fonction}` +
        (setup.excludeFromTeamStats ? ', excludeFromTeamStats=true' : ''),
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
