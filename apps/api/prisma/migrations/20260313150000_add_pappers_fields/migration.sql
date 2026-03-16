-- AlterTable: Add Pappers fields to entreprises
ALTER TABLE "entreprises" ADD COLUMN "siren" VARCHAR(9);
ALTER TABLE "entreprises" ADD COLUMN "siret" VARCHAR(14);
ALTER TABLE "entreprises" ADD COLUMN "formeJuridique" VARCHAR(100);
ALTER TABLE "entreprises" ADD COLUMN "capitalSocial" DOUBLE PRECISION;
ALTER TABLE "entreprises" ADD COLUMN "chiffreAffaires" DOUBLE PRECISION;
ALTER TABLE "entreprises" ADD COLUMN "effectif" VARCHAR(50);
ALTER TABLE "entreprises" ADD COLUMN "dateCreation" VARCHAR(10);
ALTER TABLE "entreprises" ADD COLUMN "codeNAF" VARCHAR(10);
ALTER TABLE "entreprises" ADD COLUMN "libelleNAF" VARCHAR(255);
ALTER TABLE "entreprises" ADD COLUMN "adresseComplete" VARCHAR(500);
ALTER TABLE "entreprises" ADD COLUMN "pappersUrl" VARCHAR(500);
ALTER TABLE "entreprises" ADD COLUMN "pappersEnrichedAt" TIMESTAMPTZ;
ALTER TABLE "entreprises" ADD COLUMN "pappersRawData" JSONB;
