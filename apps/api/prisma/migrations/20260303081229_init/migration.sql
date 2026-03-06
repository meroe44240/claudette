-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'RECRUTEUR');

-- CreateEnum
CREATE TYPE "TailleEntreprise" AS ENUM ('STARTUP', 'PME', 'ETI', 'GRAND_GROUPE');

-- CreateEnum
CREATE TYPE "RoleContact" AS ENUM ('HIRING_MANAGER', 'DRH', 'PROCUREMENT', 'CEO', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutClient" AS ENUM ('LEAD', 'PREMIER_CONTACT', 'BESOIN_QUALIFIE', 'PROPOSITION_ENVOYEE', 'MANDAT_SIGNE', 'RECURRENT', 'INACTIF');

-- CreateEnum
CREATE TYPE "FeeStatut" AS ENUM ('NON_FACTURE', 'FACTURE', 'PAYE');

-- CreateEnum
CREATE TYPE "StatutMandat" AS ENUM ('OUVERT', 'EN_COURS', 'GAGNE', 'PERDU', 'ANNULE', 'CLOTURE');

-- CreateEnum
CREATE TYPE "Priorite" AS ENUM ('BASSE', 'NORMALE', 'HAUTE', 'URGENTE');

-- CreateEnum
CREATE TYPE "StageCandidature" AS ENUM ('SOURCING', 'CONTACTE', 'ENTRETIEN_1', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE', 'REFUSE');

-- CreateEnum
CREATE TYPE "MotifRefus" AS ENUM ('SALAIRE', 'PROFIL_PAS_ALIGNE', 'CANDIDAT_DECLINE', 'CLIENT_REFUSE', 'TIMING', 'POSTE_POURVU', 'AUTRE');

-- CreateEnum
CREATE TYPE "TypeActivite" AS ENUM ('APPEL', 'EMAIL', 'MEETING', 'NOTE', 'TACHE', 'TRANSCRIPT');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('ENTRANT', 'SORTANT');

-- CreateEnum
CREATE TYPE "EntiteType" AS ENUM ('CANDIDAT', 'CLIENT', 'ENTREPRISE', 'MANDAT');

-- CreateEnum
CREATE TYPE "SourceActivite" AS ENUM ('MANUEL', 'ALLO', 'GMAIL', 'CALENDAR', 'GOOGLE_DOCS', 'AGENT_IA', 'SYSTEME');

-- CreateEnum
CREATE TYPE "TypeNotification" AS ENUM ('EMAIL_RECU', 'APPEL_ENTRANT', 'TRANSCRIPT_PARSE', 'TACHE_ECHEANCE', 'CANDIDATURE_STAGE_CHANGE', 'RELANCE_CLIENT', 'SYSTEME');

-- CreateEnum
CREATE TYPE "TypeTemplate" AS ENUM ('EMAIL_PRISE_CONTACT', 'EMAIL_RELANCE', 'EMAIL_PRESENTATION_CLIENT', 'NOTE_BRIEF_POSTE', 'NOTE_COMPTE_RENDU', 'AUTRE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "nom" VARCHAR(255) NOT NULL,
    "prenom" VARCHAR(255),
    "avatarUrl" VARCHAR(500),
    "role" "Role" NOT NULL DEFAULT 'RECRUTEUR',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "apiKey" VARCHAR(255),
    "lastLoginAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entreprises" (
    "id" UUID NOT NULL,
    "nom" VARCHAR(255) NOT NULL,
    "secteur" VARCHAR(100),
    "siteWeb" VARCHAR(500),
    "taille" "TailleEntreprise",
    "localisation" VARCHAR(255),
    "linkedinUrl" VARCHAR(500),
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "entreprises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "nom" VARCHAR(255) NOT NULL,
    "prenom" VARCHAR(255),
    "email" VARCHAR(255),
    "telephone" VARCHAR(50),
    "poste" VARCHAR(255),
    "roleContact" "RoleContact",
    "linkedinUrl" VARCHAR(500),
    "entrepriseId" UUID NOT NULL,
    "statutClient" "StatutClient" NOT NULL DEFAULT 'LEAD',
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidats" (
    "id" UUID NOT NULL,
    "nom" VARCHAR(255) NOT NULL,
    "prenom" VARCHAR(255),
    "email" VARCHAR(255),
    "telephone" VARCHAR(50),
    "linkedinUrl" VARCHAR(500),
    "cvUrl" VARCHAR(500),
    "cvTexte" TEXT,
    "posteActuel" VARCHAR(255),
    "entrepriseActuelle" VARCHAR(255),
    "localisation" VARCHAR(255),
    "salaireActuel" INTEGER,
    "salaireSouhaite" INTEGER,
    "disponibilite" VARCHAR(100),
    "mobilite" VARCHAR(255),
    "source" VARCHAR(100),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "consentementRgpd" BOOLEAN NOT NULL DEFAULT false,
    "consentementDate" TIMESTAMPTZ,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "candidats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mandats" (
    "id" UUID NOT NULL,
    "titrePoste" VARCHAR(255) NOT NULL,
    "entrepriseId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "description" TEXT,
    "localisation" VARCHAR(255),
    "salaireMin" INTEGER,
    "salaireMax" INTEGER,
    "feePourcentage" DECIMAL(5,2) NOT NULL DEFAULT 20.00,
    "feeMontantEstime" INTEGER,
    "feeMontantFacture" INTEGER,
    "feeStatut" "FeeStatut" NOT NULL DEFAULT 'NON_FACTURE',
    "statut" "StatutMandat" NOT NULL DEFAULT 'OUVERT',
    "priorite" "Priorite" NOT NULL DEFAULT 'NORMALE',
    "dateOuverture" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateCloture" DATE,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "mandats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidatures" (
    "id" UUID NOT NULL,
    "mandatId" UUID NOT NULL,
    "candidatId" UUID NOT NULL,
    "stage" "StageCandidature" NOT NULL DEFAULT 'SOURCING',
    "notes" TEXT,
    "datePresentation" TIMESTAMPTZ,
    "dateEntretienClient" TIMESTAMPTZ,
    "motifRefus" "MotifRefus",
    "motifRefusDetail" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "candidatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_history" (
    "id" UUID NOT NULL,
    "candidatureId" UUID NOT NULL,
    "fromStage" "StageCandidature",
    "toStage" "StageCandidature" NOT NULL,
    "changedById" UUID,
    "changedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activites" (
    "id" UUID NOT NULL,
    "type" "TypeActivite" NOT NULL,
    "direction" "Direction",
    "entiteType" "EntiteType" NOT NULL,
    "entiteId" UUID NOT NULL,
    "userId" UUID,
    "titre" VARCHAR(500),
    "contenu" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "source" "SourceActivite" NOT NULL DEFAULT 'MANUEL',
    "bookmarked" BOOLEAN NOT NULL DEFAULT false,
    "isTache" BOOLEAN NOT NULL DEFAULT false,
    "tacheCompleted" BOOLEAN NOT NULL DEFAULT false,
    "tacheDueDate" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "activites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fichiers_activites" (
    "id" UUID NOT NULL,
    "activiteId" UUID NOT NULL,
    "nom" VARCHAR(255) NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "mimeType" VARCHAR(100),
    "taille" INTEGER,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fichiers_activites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "TypeNotification" NOT NULL,
    "titre" VARCHAR(500) NOT NULL,
    "contenu" TEXT,
    "entiteType" "EntiteType",
    "entiteId" UUID,
    "lue" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL,
    "nom" VARCHAR(255) NOT NULL,
    "type" "TypeTemplate" NOT NULL,
    "sujet" VARCHAR(500),
    "contenu" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" UUID,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_apiKey_key" ON "users"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "candidatures_mandatId_candidatId_key" ON "candidatures"("mandatId", "candidatId");

-- CreateIndex
CREATE INDEX "stage_history_candidatureId_idx" ON "stage_history"("candidatureId");

-- CreateIndex
CREATE INDEX "activites_entiteType_entiteId_idx" ON "activites"("entiteType", "entiteId");

-- CreateIndex
CREATE INDEX "activites_bookmarked_idx" ON "activites"("bookmarked");

-- CreateIndex
CREATE INDEX "activites_isTache_tacheCompleted_tacheDueDate_idx" ON "activites"("isTache", "tacheCompleted", "tacheDueDate");

-- CreateIndex
CREATE INDEX "notifications_userId_lue_idx" ON "notifications"("userId", "lue");

-- AddForeignKey
ALTER TABLE "entreprises" ADD CONSTRAINT "entreprises_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES "entreprises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidats" ADD CONSTRAINT "candidats_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandats" ADD CONSTRAINT "mandats_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES "entreprises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandats" ADD CONSTRAINT "mandats_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandats" ADD CONSTRAINT "mandats_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidatures" ADD CONSTRAINT "candidatures_mandatId_fkey" FOREIGN KEY ("mandatId") REFERENCES "mandats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidatures" ADD CONSTRAINT "candidatures_candidatId_fkey" FOREIGN KEY ("candidatId") REFERENCES "candidats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidatures" ADD CONSTRAINT "candidatures_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_candidatureId_fkey" FOREIGN KEY ("candidatureId") REFERENCES "candidatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activites" ADD CONSTRAINT "activites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichiers_activites" ADD CONSTRAINT "fichiers_activites_activiteId_fkey" FOREIGN KEY ("activiteId") REFERENCES "activites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
