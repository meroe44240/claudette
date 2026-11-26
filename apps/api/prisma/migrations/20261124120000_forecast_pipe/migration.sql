-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('POURCENTAGE_PACKAGE', 'POURCENTAGE_FIXE', 'MONTANT_FIXE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "acces_finance" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "entreprises" ADD COLUMN     "delai_paiement_jours" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "mandats" ADD COLUMN     "devise" VARCHAR(3) NOT NULL DEFAULT 'EUR',
ADD COLUMN     "fee_montant_fixe" INTEGER,
ADD COLUMN     "fee_type" "FeeType" NOT NULL DEFAULT 'POURCENTAGE_PACKAGE',
ADD COLUMN     "nb_postes" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "paraform_nb_versements" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "process_entretien" JSONB,
ADD COLUMN     "source_deal" VARCHAR(30),
ADD COLUMN     "split_sales_pct" INTEGER NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "candidatures" ADD COLUMN     "date_prochain_entretien" TIMESTAMPTZ,
ADD COLUMN     "fee_override_eur" INTEGER,
ADD COLUMN     "mois_facturation_override" DATE,
ADD COLUMN     "override_at" TIMESTAMPTZ,
ADD COLUMN     "override_by_id" UUID,
ADD COLUMN     "package_fixe" INTEGER,
ADD COLUMN     "package_variable" INTEGER,
ADD COLUMN     "proba_override" DECIMAL(5,2),
ADD COLUMN     "process_etape" INTEGER,
ADD COLUMN     "retour_attente_depuis" DATE;

-- CreateTable
CREATE TABLE "deals_perdus" (
    "id" UUID NOT NULL,
    "mandat_id" UUID NOT NULL,
    "candidature_id" UUID,
    "fee_perdu_eur" INTEGER NOT NULL,
    "raison" TEXT NOT NULL,
    "date_perte" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deals_perdus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taux_change" (
    "id" UUID NOT NULL,
    "devise" VARCHAR(3) NOT NULL,
    "taux_vers_eur" DECIMAL(12,6) NOT NULL,
    "date_effet" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taux_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_settings" (
    "id" VARCHAR(20) NOT NULL DEFAULT 'default',
    "proba_envoye_client" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "proba_premiere_etape" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "proba_derniere_etape" DECIMAL(5,2) NOT NULL DEFAULT 60,
    "proba_sans_process" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "proba_offre" DECIMAL(5,2) NOT NULL DEFAULT 85,
    "bonus_autres_candidats" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "objectif_facture_annuel" INTEGER,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "forecast_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_snapshots" (
    "id" UUID NOT NULL,
    "date_snapshot" DATE NOT NULL,
    "fee_total_eur" INTEGER NOT NULL,
    "pondere_eur" INTEGER NOT NULL,
    "placements_attendus" DECIMAL(8,2) NOT NULL,
    "facture_prevu_eur" INTEGER,
    "scenario_normal_eur" INTEGER,
    "nb_postes" INTEGER NOT NULL,
    "nb_probas_forcees" INTEGER NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deals_perdus_date_perte_idx" ON "deals_perdus"("date_perte");

-- CreateIndex
CREATE UNIQUE INDEX "taux_change_devise_date_effet_key" ON "taux_change"("devise", "date_effet");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_snapshots_date_snapshot_key" ON "forecast_snapshots"("date_snapshot");

-- AddForeignKey
ALTER TABLE "deals_perdus" ADD CONSTRAINT "deals_perdus_mandat_id_fkey" FOREIGN KEY ("mandat_id") REFERENCES "mandats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals_perdus" ADD CONSTRAINT "deals_perdus_candidature_id_fkey" FOREIGN KEY ("candidature_id") REFERENCES "candidatures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

