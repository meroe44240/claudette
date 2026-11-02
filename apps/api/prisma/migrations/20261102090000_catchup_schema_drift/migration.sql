-- Rattrapage : aligne l'historique des migrations sur schema.prisma.
-- Ces colonnes / tables existent déjà en prod (appliquées hors migrations),
-- donc tout est idempotent : rien n'est supprimé ni réécrit côté données.

-- ── Contraintes / index ─────────────────────────────────────────────────

-- mandats.clientId : ON DELETE RESTRICT -> SET NULL (client optionnel).
-- On ne recrée la FK que si elle n'a pas déjà la bonne règle.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mandats_clientId_fkey' AND confdeltype = 'n'
  ) THEN
    ALTER TABLE "mandats" DROP CONSTRAINT IF EXISTS "mandats_clientId_fkey";
    ALTER TABLE "mandats" ADD CONSTRAINT "mandats_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Plusieurs pages de réservation par utilisateur (kind / mandatId) :
-- l'unicité sur userId devient un simple index.
DROP INDEX IF EXISTS "booking_settings_userId_key";
CREATE INDEX IF NOT EXISTS "booking_settings_userId_idx" ON "booking_settings"("userId");

CREATE INDEX IF NOT EXISTS "mandats_sourceurId_idx" ON "mandats"("sourceurId");
CREATE INDEX IF NOT EXISTS "mandats_salesId_idx" ON "mandats"("salesId");
CREATE INDEX IF NOT EXISTS "mandats_recruteurId_idx" ON "mandats"("recruteurId");

-- ── Colonnes ────────────────────────────────────────────────────────────

-- Les id sont générés par Prisma (uuid()), plus par la base.
ALTER TABLE "booking_settings" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "bookings" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "candidat_experiences" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "candidate_accounts" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "candidate_accounts" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "job_offers" ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "booking_settings" ADD COLUMN IF NOT EXISTS "kind" VARCHAR(20) NOT NULL DEFAULT 'GENERIC';
ALTER TABLE "booking_settings" ADD COLUMN IF NOT EXISTS "mandatId" UUID;

ALTER TABLE "candidats" ADD COLUMN IF NOT EXISTS "cv_consent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "candidats" ADD COLUMN IF NOT EXISTS "cv_consent_date" TIMESTAMPTZ;
ALTER TABLE "candidats" ADD COLUMN IF NOT EXISTS "qualification" JSONB;

ALTER TABLE "candidatures" ADD COLUMN IF NOT EXISTS "google_event_id" VARCHAR(255);
ALTER TABLE "candidatures" ADD COLUMN IF NOT EXISTS "interet_confirme" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "candidatures" ADD COLUMN IF NOT EXISTS "interet_confirme_date" TIMESTAMPTZ;
ALTER TABLE "candidatures" ADD COLUMN IF NOT EXISTS "interlocuteur_client" VARCHAR(255);
ALTER TABLE "candidatures" ADD COLUMN IF NOT EXISTS "presentation_no_show" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "candidatures" ADD COLUMN IF NOT EXISTS "qualif_fit" JSONB;
ALTER TABLE "candidatures" ADD COLUMN IF NOT EXISTS "trameAnswers" JSONB;

ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "photoUrl" VARCHAR(1000);

ALTER TABLE "job_offers" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) DEFAULT 'EUR';
ALTER TABLE "job_offers" ADD COLUMN IF NOT EXISTS "description_en" TEXT;
ALTER TABLE "job_offers" ADD COLUMN IF NOT EXISTS "description_societe" TEXT;
ALTER TABLE "job_offers" ADD COLUMN IF NOT EXISTS "description_societe_en" TEXT;
ALTER TABLE "job_offers" ADD COLUMN IF NOT EXISTS "localisation_en" VARCHAR(255);
ALTER TABLE "job_offers" ADD COLUMN IF NOT EXISTS "missions" TEXT;
ALTER TABLE "job_offers" ADD COLUMN IF NOT EXISTS "missions_en" TEXT;
ALTER TABLE "job_offers" ADD COLUMN IF NOT EXISTS "package_info" TEXT;
ALTER TABLE "job_offers" ADD COLUMN IF NOT EXISTS "package_info_en" TEXT;
ALTER TABLE "job_offers" ADD COLUMN IF NOT EXISTS "titre_en" VARCHAR(255);

ALTER TABLE "mandats" ADD COLUMN IF NOT EXISTS "is_dormant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mandats" ADD COLUMN IF NOT EXISTS "nature_contrat" VARCHAR(20);
ALTER TABLE "mandats" ADD COLUMN IF NOT EXISTS "trame" JSONB;

ALTER TABLE "market_list_establishments" ADD COLUMN IF NOT EXISTS "contact" JSONB;
ALTER TABLE "market_list_establishments" ADD COLUMN IF NOT EXISTS "contexte" JSONB;

ALTER TABLE "market_lists" ADD COLUMN IF NOT EXISTS "candidatCtx" JSONB;
ALTER TABLE "market_lists" ADD COLUMN IF NOT EXISTS "candidatId" UUID;
CREATE INDEX IF NOT EXISTS "market_lists_candidatId_idx" ON "market_lists"("candidatId");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_data" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "date_sortie" TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "telephone" VARCHAR(50);

-- ── Tables ──────────────────────────────────────────────────────────────

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
CREATE INDEX IF NOT EXISTS "mcp_action_logs_userId_idx" ON "mcp_action_logs"("userId");
CREATE INDEX IF NOT EXISTS "mcp_action_logs_toolName_idx" ON "mcp_action_logs"("toolName");
CREATE INDEX IF NOT EXISTS "mcp_action_logs_createdAt_idx" ON "mcp_action_logs"("createdAt");

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
CREATE UNIQUE INDEX IF NOT EXISTS "recruiter_objectives_userId_period_metric_key" ON "recruiter_objectives"("userId", "period", "metric");

CREATE TABLE IF NOT EXISTS "report_thresholds" (
    "id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "metric" VARCHAR(40) NOT NULL,
    "period" VARCHAR(20) NOT NULL,
    "target" INTEGER NOT NULL,

    CONSTRAINT "report_thresholds_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "report_thresholds_role_metric_period_key" ON "report_thresholds"("role", "metric", "period");

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
CREATE INDEX IF NOT EXISTS "ai_pending_validations_userId_status_idx" ON "ai_pending_validations"("userId", "status");

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
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_codes_code_key" ON "oauth_codes"("code");
CREATE INDEX IF NOT EXISTS "oauth_codes_code_idx" ON "oauth_codes"("code");

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
CREATE INDEX IF NOT EXISTS "post_linkedin_date_post_idx" ON "post_linkedin"("date_post");
CREATE INDEX IF NOT EXISTS "post_linkedin_auteur_id_idx" ON "post_linkedin"("auteur_id");

CREATE TABLE IF NOT EXISTS "post_linkedin_comment" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "auteur_id" UUID NOT NULL,
    "texte" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_linkedin_comment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "post_linkedin_comment_post_id_idx" ON "post_linkedin_comment"("post_id");

-- ── Clés étrangères ─────────────────────────────────────────────────────
-- Ajoutées seulement si absentes. Si des lignes orphelines existent déjà
-- en prod, la FK est posée en NOT VALID (s'applique aux nouvelles lignes)
-- plutôt que de faire échouer le déploiement.

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN SELECT * FROM (VALUES
    ('portal_decisions', 'portal_decisions_candidatureId_fkey', 'FOREIGN KEY ("candidatureId") REFERENCES "candidatures"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('portal_comments', 'portal_comments_candidatureId_fkey', 'FOREIGN KEY ("candidatureId") REFERENCES "candidatures"("id") ON DELETE SET NULL ON UPDATE CASCADE'),
    ('mcp_action_logs', 'mcp_action_logs_userId_fkey', 'FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE'),
    ('recruiter_objectives', 'recruiter_objectives_userId_fkey', 'FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE'),
    ('ai_pending_validations', 'ai_pending_validations_userId_fkey', 'FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE'),
    ('post_linkedin', 'post_linkedin_auteur_id_fkey', 'FOREIGN KEY ("auteur_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE'),
    ('post_linkedin_comment', 'post_linkedin_comment_post_id_fkey', 'FOREIGN KEY ("post_id") REFERENCES "post_linkedin"("id") ON DELETE CASCADE ON UPDATE CASCADE'),
    ('post_linkedin_comment', 'post_linkedin_comment_auteur_id_fkey', 'FOREIGN KEY ("auteur_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE')
  ) AS t(tbl, name, def)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.name) THEN
      BEGIN
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s', fk.tbl, fk.name, fk.def);
      EXCEPTION WHEN foreign_key_violation THEN
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s NOT VALID', fk.tbl, fk.name, fk.def);
      END;
    END IF;
  END LOOP;
END $$;
