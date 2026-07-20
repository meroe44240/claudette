-- ═══════════════════════════════════════════════════════════════════════════
-- Recap 1/7 : Fonction + binome sales/recruteur + RecapRun
--
-- Additive migration — pas de destruction de colonne.
-- assignedToId et sourceurId (Mandat) restent pour compat ; salesId/recruteurId
-- deviennent la source de verite pour le recap et les futures attributions.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Fonction enum ─────────────────────────────────────
CREATE TYPE "Fonction" AS ENUM ('SALES', 'RECRUTEUR', 'LES_DEUX');

-- ── User : fonction + excludeFromTeamStats ────────────
ALTER TABLE "users"
  ADD COLUMN "fonction" "Fonction" NOT NULL DEFAULT 'RECRUTEUR',
  ADD COLUMN "excludeFromTeamStats" BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Mandat : salesId + recruteurId ────────────────────
ALTER TABLE "mandats"
  ADD COLUMN "salesId" UUID,
  ADD COLUMN "recruteurId" UUID;

ALTER TABLE "mandats"
  ADD CONSTRAINT "mandats_salesId_fkey"
    FOREIGN KEY ("salesId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "mandats_recruteurId_fkey"
    FOREIGN KEY ("recruteurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "mandats_salesId_idx" ON "mandats"("salesId");
CREATE INDEX "mandats_recruteurId_idx" ON "mandats"("recruteurId");

-- ── Backfill : salesId <- assignedToId, recruteurId <- sourceurId ─────
-- assignedToId etait le "owner" historique = celui qui a chasse le mandat = sales.
-- sourceurId a ete ajoute au chantier sourceur = celui qui source les candidats = recruteur.
UPDATE "mandats" SET "salesId" = "assignedToId" WHERE "assignedToId" IS NOT NULL;
UPDATE "mandats" SET "recruteurId" = "sourceurId" WHERE "sourceurId" IS NOT NULL;

-- ── RecapRun ──────────────────────────────────────────
CREATE TABLE "recap_runs" (
    "id" UUID NOT NULL,
    "sentAt" TIMESTAMPTZ NOT NULL,
    "windowStart" TIMESTAMPTZ NOT NULL,
    "windowEnd" TIMESTAMPTZ NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recap_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "recap_runs_sentAt_idx" ON "recap_runs"("sentAt");
