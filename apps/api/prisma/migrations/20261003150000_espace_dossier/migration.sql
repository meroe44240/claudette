-- Espace candidat, lot 2 : dossier de préparation, un par mandat.
-- "sections" et "photos" = brouillon du recruteur ; "published" = ce que voient les candidats.
CREATE TABLE IF NOT EXISTS "mandat_dossiers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "mandat_id" UUID NOT NULL,
  "sections" JSONB NOT NULL DEFAULT '[]',
  "photos" JSONB NOT NULL DEFAULT '[]',
  "published" JSONB,
  "published_at" TIMESTAMPTZ,
  "published_by_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "mandat_dossiers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mandat_dossiers_mandat_id_fkey" FOREIGN KEY ("mandat_id") REFERENCES "mandats"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "mandat_dossiers_mandat_id_key" ON "mandat_dossiers"("mandat_id");

-- Rubriques lues par le candidat : { [mandatId]: [sectionId, ...] }.
ALTER TABLE "candidate_accounts" ADD COLUMN IF NOT EXISTS "dossier_read" JSONB NOT NULL DEFAULT '{}';
