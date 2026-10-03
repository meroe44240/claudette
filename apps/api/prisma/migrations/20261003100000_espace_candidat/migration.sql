-- Espace candidat : compte du candidat (ouvert par le recruteur après le premier call).
CREATE TABLE IF NOT EXISTS "candidate_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "candidat_id" UUID NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "password_hash" TEXT,
  "profile" VARCHAR(10) NOT NULL DEFAULT 'TECH',
  "expectations" JSONB NOT NULL DEFAULT '{}',
  "other_processes" JSONB NOT NULL DEFAULT '[]',
  "activation_version" INTEGER NOT NULL DEFAULT 1,
  "invited_at" TIMESTAMPTZ,
  "invited_by_id" UUID,
  "activated_at" TIMESTAMPTZ,
  "consent_at" TIMESTAMPTZ,
  "last_login_at" TIMESTAMPTZ,
  "notif_seen_at" TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "candidate_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_accounts_candidat_id_fkey" FOREIGN KEY ("candidat_id") REFERENCES "candidats"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "candidate_accounts_candidat_id_key" ON "candidate_accounts"("candidat_id");
CREATE UNIQUE INDEX IF NOT EXISTS "candidate_accounts_email_key" ON "candidate_accounts"("email");

-- Message au candidat attaché à un changement d'étape (écrit en français, traduit en anglais).
ALTER TABLE "stage_history" ADD COLUMN IF NOT EXISTS "candidate_message" TEXT;
ALTER TABLE "stage_history" ADD COLUMN IF NOT EXISTS "candidate_message_en" TEXT;
