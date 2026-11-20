-- Rattrapage : les migrations étaient en retard sur schema.prisma (la production a été
-- mise à jour par `prisma db push`). Chaque instruction est idempotente : sans effet sur
-- une base déjà à jour (production), elle construit le schéma complet sur une base neuve.
-- Les valeurs par défaut côté base retirées ici sont fournies par Prisma (@default(uuid()), @updatedAt).

-- DropForeignKey
ALTER TABLE "mandats" DROP CONSTRAINT IF EXISTS "mandats_clientId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "booking_settings_userId_key";

-- AlterTable
ALTER TABLE "booking_settings" ADD COLUMN IF NOT EXISTS "kind" VARCHAR(20) NOT NULL DEFAULT 'GENERIC',
ADD COLUMN IF NOT EXISTS "mandatId" UUID,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "bookings" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "candidat_experiences" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "candidate_accounts" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "candidats" ADD COLUMN IF NOT EXISTS "cv_consent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "cv_consent_date" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "qualification" JSONB;

-- AlterTable
ALTER TABLE "candidatures" ADD COLUMN IF NOT EXISTS "google_event_id" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "interet_confirme" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "interet_confirme_date" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "interlocuteur_client" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "presentation_no_show" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "qualif_fit" JSONB,
ADD COLUMN IF NOT EXISTS "trameAnswers" JSONB;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "photoUrl" VARCHAR(1000);

-- AlterTable
ALTER TABLE "job_offers" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) DEFAULT 'EUR',
ADD COLUMN IF NOT EXISTS "description_en" TEXT,
ADD COLUMN IF NOT EXISTS "description_societe" TEXT,
ADD COLUMN IF NOT EXISTS "description_societe_en" TEXT,
ADD COLUMN IF NOT EXISTS "localisation_en" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "missions" TEXT,
ADD COLUMN IF NOT EXISTS "missions_en" TEXT,
ADD COLUMN IF NOT EXISTS "package_info" TEXT,
ADD COLUMN IF NOT EXISTS "package_info_en" TEXT,
ADD COLUMN IF NOT EXISTS "titre_en" VARCHAR(255),
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "mandats" ADD COLUMN IF NOT EXISTS "is_dormant" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "nature_contrat" VARCHAR(20),
ADD COLUMN IF NOT EXISTS "trame" JSONB;

-- AlterTable
ALTER TABLE "market_list_establishments" ADD COLUMN IF NOT EXISTS "contact" JSONB,
ADD COLUMN IF NOT EXISTS "contexte" JSONB;

-- AlterTable
ALTER TABLE "market_lists" ADD COLUMN IF NOT EXISTS "candidatCtx" JSONB,
ADD COLUMN IF NOT EXISTS "candidatId" UUID;

-- AlterTable
ALTER TABLE "note_calls" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "webhook_secret" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "note_user_settings" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_data" TEXT,
ADD COLUMN IF NOT EXISTS "date_sortie" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS "telephone" VARCHAR(50);

-- CreateTable
CREATE TABLE IF NOT EXISTS "question_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(80),
    "questions" JSONB NOT NULL DEFAULT '[]',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "question_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "mcp_action_logs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "toolName" VARCHAR(100) NOT NULL,
    "level" VARCHAR(20) NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "recruiter_objectives" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "period" VARCHAR(20) NOT NULL,
    "metric" VARCHAR(50) NOT NULL,
    "target" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "recruiter_objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "report_thresholds" (
    "id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "metric" VARCHAR(40) NOT NULL,
    "period" VARCHAR(20) NOT NULL,
    "target" INTEGER NOT NULL,

    CONSTRAINT "report_thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ai_pending_validations" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sourceType" VARCHAR(20) NOT NULL,
    "activiteId" UUID,
    "entiteType" VARCHAR(50),
    "entiteId" UUID,
    "analysisJson" JSONB NOT NULL,
    "proposedUpdates" JSONB,
    "proposedTasks" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "validatedAt" TIMESTAMPTZ,
    "modificationsJson" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_pending_validations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "oauth_codes" (
    "id" UUID NOT NULL,
    "code" VARCHAR(255) NOT NULL,
    "userId" UUID NOT NULL,
    "clientId" VARCHAR(255) NOT NULL,
    "redirectUri" VARCHAR(1000) NOT NULL,
    "codeChallenge" VARCHAR(255),
    "codeChallengeMethod" VARCHAR(10),
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "post_linkedin" (
    "id" UUID NOT NULL,
    "auteur_id" UUID NOT NULL,
    "date_post" TIMESTAMPTZ NOT NULL,
    "texte" TEXT NOT NULL DEFAULT '',
    "image_url" VARCHAR(500),
    "statut" VARCHAR(20) NOT NULL DEFAULT 'IDEE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "post_linkedin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "post_linkedin_comment" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "auteur_id" UUID NOT NULL,
    "texte" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_linkedin_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "mcp_action_logs_userId_idx" ON "mcp_action_logs"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "mcp_action_logs_toolName_idx" ON "mcp_action_logs"("toolName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "mcp_action_logs_createdAt_idx" ON "mcp_action_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "recruiter_objectives_userId_period_metric_key" ON "recruiter_objectives"("userId", "period", "metric");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "report_thresholds_role_metric_period_key" ON "report_thresholds"("role", "metric", "period");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_pending_validations_userId_status_idx" ON "ai_pending_validations"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_codes_code_key" ON "oauth_codes"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "oauth_codes_code_idx" ON "oauth_codes"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "post_linkedin_date_post_idx" ON "post_linkedin"("date_post");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "post_linkedin_auteur_id_idx" ON "post_linkedin"("auteur_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "post_linkedin_comment_post_id_idx" ON "post_linkedin_comment"("post_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "booking_settings_userId_idx" ON "booking_settings"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "market_lists_candidatId_idx" ON "market_lists"("candidatId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mandats_clientId_fkey') THEN
    ALTER TABLE "mandats" ADD CONSTRAINT "mandats_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_decisions_candidatureId_fkey') THEN
    ALTER TABLE "portal_decisions" ADD CONSTRAINT "portal_decisions_candidatureId_fkey" FOREIGN KEY ("candidatureId") REFERENCES "candidatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_comments_candidatureId_fkey') THEN
    ALTER TABLE "portal_comments" ADD CONSTRAINT "portal_comments_candidatureId_fkey" FOREIGN KEY ("candidatureId") REFERENCES "candidatures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mcp_action_logs_userId_fkey') THEN
    ALTER TABLE "mcp_action_logs" ADD CONSTRAINT "mcp_action_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recruiter_objectives_userId_fkey') THEN
    ALTER TABLE "recruiter_objectives" ADD CONSTRAINT "recruiter_objectives_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_pending_validations_userId_fkey') THEN
    ALTER TABLE "ai_pending_validations" ADD CONSTRAINT "ai_pending_validations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_linkedin_auteur_id_fkey') THEN
    ALTER TABLE "post_linkedin" ADD CONSTRAINT "post_linkedin_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_linkedin_comment_post_id_fkey') THEN
    ALTER TABLE "post_linkedin_comment" ADD CONSTRAINT "post_linkedin_comment_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post_linkedin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'post_linkedin_comment_auteur_id_fkey') THEN
    ALTER TABLE "post_linkedin_comment" ADD CONSTRAINT "post_linkedin_comment_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;


-- Index des colonnes de rattachement des mandats : déclarés dans schema.prisma, à recréer
-- là où `db push` les avait retirés.
CREATE INDEX IF NOT EXISTS "mandats_sourceurId_idx" ON "mandats"("sourceurId");
CREATE INDEX IF NOT EXISTS "mandats_salesId_idx" ON "mandats"("salesId");
CREATE INDEX IF NOT EXISTS "mandats_recruteurId_idx" ON "mandats"("recruteurId");
