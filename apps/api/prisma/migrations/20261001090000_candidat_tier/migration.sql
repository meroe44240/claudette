-- Niveau du candidat (A, B ou C), choisi par le recruteur sur la fiche.
ALTER TABLE "candidats" ADD COLUMN IF NOT EXISTS "tier" VARCHAR(1);
