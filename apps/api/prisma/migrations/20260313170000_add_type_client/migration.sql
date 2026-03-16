-- CreateEnum
CREATE TYPE "TypeClient" AS ENUM ('INBOUND', 'OUTBOUND', 'RESEAU', 'CLIENT_ACTIF', 'RECURRENT');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN "typeClient" "TypeClient" NOT NULL DEFAULT 'INBOUND';

-- Data migration: Auto-set CLIENT_ACTIF pour clients avec 1+ mandat actif
UPDATE "clients" SET "typeClient" = 'CLIENT_ACTIF'
WHERE id IN (
  SELECT DISTINCT c.id FROM "clients" c
  JOIN "mandats" m ON m."clientId" = c.id
  WHERE m."statut" IN ('OUVERT', 'EN_COURS')
);

-- Data migration: Auto-set RECURRENT pour clients avec 2+ mandats historiques (override)
UPDATE "clients" SET "typeClient" = 'RECURRENT'
WHERE id IN (
  SELECT c.id FROM "clients" c
  JOIN "mandats" m ON m."clientId" = c.id
  GROUP BY c.id
  HAVING COUNT(m.id) >= 2
);
