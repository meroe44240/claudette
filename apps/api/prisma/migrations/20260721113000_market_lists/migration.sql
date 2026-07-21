-- ═══════════════════════════════════════════════════════════════════════════
-- List Push sourcing (chantier 5) — reverse-sourcing par établissement.
-- 2 nouvelles tables + 1 enum. Additif, aucun DROP.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "MarketEstablishmentStatus" AS ENUM ('NEW', 'EXCLUDED', 'PROSPECTION', 'CLIENT_EXISTING');

CREATE TABLE "market_lists" (
    "id"                 UUID NOT NULL,
    "name"               VARCHAR(255) NOT NULL,
    "sectorTags"         TEXT[] DEFAULT ARRAY[]::TEXT[],
    "zones"              TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedCompanies"  TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById"        UUID,
    "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMPTZ NOT NULL,
    CONSTRAINT "market_lists_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "market_lists_createdById_idx" ON "market_lists"("createdById");

CREATE TABLE "market_list_establishments" (
    "id"           UUID NOT NULL,
    "marketListId" UUID NOT NULL,
    "name"         VARCHAR(255) NOT NULL,
    "city"         VARCHAR(120),
    "sector"       VARCHAR(120),
    "effectif"     VARCHAR(60),
    "titles"       TEXT[] DEFAULT ARRAY[]::TEXT[],
    "frequency"    INTEGER NOT NULL DEFAULT 1,
    "status"       "MarketEstablishmentStatus" NOT NULL DEFAULT 'NEW',
    "entrepriseId" UUID,
    "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMPTZ NOT NULL,
    CONSTRAINT "market_list_establishments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "market_list_establishments_marketListId_name_key" ON "market_list_establishments"("marketListId", "name");
CREATE INDEX "market_list_establishments_marketListId_idx" ON "market_list_establishments"("marketListId");
CREATE INDEX "market_list_establishments_status_idx" ON "market_list_establishments"("status");

ALTER TABLE "market_list_establishments"
  ADD CONSTRAINT "market_list_establishments_marketListId_fkey"
    FOREIGN KEY ("marketListId") REFERENCES "market_lists"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
