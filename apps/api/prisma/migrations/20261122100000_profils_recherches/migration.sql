-- Profils recherchés : profils que chaque société recrute (déduits de ses offres), résumé sur la société, comptes agents
-- CreateEnum
CREATE TYPE "FonctionProfil" AS ENUM ('ENGINEERING', 'SALES');

-- CreateEnum
CREATE TYPE "SenioriteProfil" AS ENUM ('JUNIOR', 'CONFIRME', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTION');

-- CreateEnum
CREATE TYPE "RemoteProfil" AS ENUM ('ONSITE', 'HYBRID', 'REMOTE');

-- CreateEnum
CREATE TYPE "MarcheProfil" AS ENUM ('FRANCE', 'EUROPE', 'UK', 'US', 'CANADA', 'APAC');

-- CreateEnum
CREATE TYPE "LienMandatProfil" AS ENUM ('CONCURRENT_DIRECT', 'SIMILAIRE', 'VOISINE');

-- CreateEnum
CREATE TYPE "SegmentClient" AS ENUM ('SMB', 'MID_MARKET', 'ENTERPRISE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "MotionVente" AS ENUM ('OUTBOUND', 'INBOUND', 'PLG', 'PARTENAIRES', 'FIELD_SALES');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "est_agent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "entreprises" ADD COLUMN     "resume_profils" TEXT,
ADD COLUMN     "resume_profils_date" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "profils_recherches" (
    "id" UUID NOT NULL,
    "entreprise_id" UUID NOT NULL,
    "fonction" "FonctionProfil" NOT NULL,
    "intitule_type" VARCHAR(255) NOT NULL,
    "intitule_cle" VARCHAR(255) NOT NULL,
    "seniorite" "SenioriteProfil",
    "pays" VARCHAR(100),
    "ville" VARCHAR(150),
    "remote" "RemoteProfil",
    "langues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "salaire_min" INTEGER,
    "salaire_max" INTEGER,
    "devise" VARCHAR(3),
    "ote" VARCHAR(255),
    "equity" VARCHAR(255),
    "marche" "MarcheProfil",
    "offres_sources" JSONB NOT NULL DEFAULT '[]',
    "date_analyse" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analyse_par_id" UUID,
    "analyse_par_nom" VARCHAR(100),
    "mandat_lie_id" UUID,
    "type_lien" "LienMandatProfil",
    "experience_attendue" TEXT,
    "technos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "perimetre" TEXT,
    "projets" TEXT,
    "segments" "SegmentClient"[] DEFAULT ARRAY[]::"SegmentClient"[],
    "secteurs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "acheteur_type" VARCHAR(255),
    "cycle_de_vente" VARCHAR(100),
    "panier_moyen_acv" VARCHAR(100),
    "motion" "MotionVente"[] DEFAULT ARRAY[]::"MotionVente"[],
    "territoire" VARCHAR(255),
    "quota" VARCHAR(255),
    "outils_methodo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "profils_recherches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profils_recherches_fonction_idx" ON "profils_recherches"("fonction");

-- CreateIndex
CREATE INDEX "profils_recherches_date_analyse_idx" ON "profils_recherches"("date_analyse");

-- CreateIndex
CREATE UNIQUE INDEX "profils_recherches_entreprise_id_fonction_intitule_cle_key" ON "profils_recherches"("entreprise_id", "fonction", "intitule_cle");

-- AddForeignKey
ALTER TABLE "profils_recherches" ADD CONSTRAINT "profils_recherches_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profils_recherches" ADD CONSTRAINT "profils_recherches_analyse_par_id_fkey" FOREIGN KEY ("analyse_par_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profils_recherches" ADD CONSTRAINT "profils_recherches_mandat_lie_id_fkey" FOREIGN KEY ("mandat_lie_id") REFERENCES "mandats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

