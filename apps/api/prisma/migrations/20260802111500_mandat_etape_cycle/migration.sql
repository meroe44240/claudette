-- Ajout additif du champ etapeCycle (board cycle-de-vie mandats)
ALTER TABLE "mandats" ADD COLUMN "etapeCycle" VARCHAR(60);
