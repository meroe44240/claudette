-- Ajoute le flag "A-player" (etoile) sur les candidats.
ALTER TABLE "candidats" ADD COLUMN "aPlayer" BOOLEAN NOT NULL DEFAULT false;
