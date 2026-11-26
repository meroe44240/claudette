-- CreateEnum
CREATE TYPE "EntiteFacturation" AS ENUM ('COURTSIDE_CAPITAL_HK', 'HUMANUP_LONDON', 'HUMANUP_VIET');

-- CreateEnum
CREATE TYPE "StatutFacture" AS ENUM ('A_FACTURER', 'EMISE', 'PAYEE_PARTIEL', 'PAYEE', 'ANNULEE');

-- AlterTable
ALTER TABLE "entreprises" ADD COLUMN     "entite_facturation" "EntiteFacturation";

-- AlterTable
ALTER TABLE "forecast_settings" ADD COLUMN     "objectif_scenario_eur" INTEGER;

-- CreateTable
CREATE TABLE "factures" (
    "id" UUID NOT NULL,
    "numero" VARCHAR(50),
    "libelle" VARCHAR(255),
    "entreprise_id" UUID,
    "mandat_id" UUID,
    "candidature_id" UUID,
    "entite" "EntiteFacturation" NOT NULL,
    "statut" "StatutFacture" NOT NULL DEFAULT 'A_FACTURER',
    "montant" DECIMAL(12,2) NOT NULL,
    "devise" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "taux_vers_eur" DECIMAL(12,6),
    "montant_eur" INTEGER NOT NULL,
    "montant_paye_eur" INTEGER NOT NULL DEFAULT 0,
    "mois_facturation_prevu" DATE,
    "date_emission" DATE,
    "date_echeance" DATE,
    "date_paiement" DATE,
    "mois_encaissement_prevu" DATE,
    "a_risque" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "factures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenus_recurrents" (
    "id" UUID NOT NULL,
    "libelle" VARCHAR(255) NOT NULL,
    "montant_mensuel_eur" INTEGER NOT NULL,
    "date_debut" DATE NOT NULL,
    "date_fin" DATE,
    "entite" "EntiteFacturation",
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "revenus_recurrents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comptes_tresorerie" (
    "id" UUID NOT NULL,
    "nom" VARCHAR(100) NOT NULL,
    "entite" "EntiteFacturation",
    "solde_eur" INTEGER NOT NULL,
    "date_solde" DATE NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "comptes_tresorerie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charges_mensuelles" (
    "id" UUID NOT NULL,
    "libelle" VARCHAR(255) NOT NULL,
    "categorie" VARCHAR(50),
    "montant_eur" INTEGER NOT NULL,
    "date_debut" DATE NOT NULL,
    "date_fin" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "charges_mensuelles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prelevements_dirigeant" (
    "id" UUID NOT NULL,
    "libelle" VARCHAR(255) NOT NULL,
    "montant_eur" INTEGER NOT NULL,
    "mois" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "prelevements_dirigeant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "factures_numero_key" ON "factures"("numero");

-- CreateIndex
CREATE INDEX "factures_statut_idx" ON "factures"("statut");

-- CreateIndex
CREATE INDEX "factures_date_emission_idx" ON "factures"("date_emission");

-- CreateIndex
CREATE INDEX "factures_entreprise_id_idx" ON "factures"("entreprise_id");

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_entreprise_id_fkey" FOREIGN KEY ("entreprise_id") REFERENCES "entreprises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_mandat_id_fkey" FOREIGN KEY ("mandat_id") REFERENCES "mandats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_candidature_id_fkey" FOREIGN KEY ("candidature_id") REFERENCES "candidatures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

