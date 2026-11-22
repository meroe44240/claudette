-- AlterTable
ALTER TABLE IF EXISTS "users" ADD COLUMN IF NOT EXISTS "api_key_created_at" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "api_key_hash" VARCHAR(64),
ADD COLUMN IF NOT EXISTS "api_key_prefix" VARCHAR(16),
ADD COLUMN IF NOT EXISTS "limite_par_minute" INTEGER NOT NULL DEFAULT 120;

-- AlterTable
ALTER TABLE IF EXISTS "audit_logs" ADD COLUMN IF NOT EXISTS "after" JSONB,
ADD COLUMN IF NOT EXISTS "batch_id" UUID,
ADD COLUMN IF NOT EXISTS "before" JSONB,
ADD COLUMN IF NOT EXISTS "externe" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "source" VARCHAR(10) NOT NULL DEFAULT 'WEB',
ADD COLUMN IF NOT EXISTS "tool_name" VARCHAR(100),
ALTER COLUMN "entityId" DROP NOT NULL;

-- AlterTable
ALTER TABLE IF EXISTS "mcp_action_logs" ADD COLUMN IF NOT EXISTS "externe" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "trash_entries" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "model" VARCHAR(60) NOT NULL,
    "record_id" UUID NOT NULL,
    "is_root" BOOLEAN NOT NULL DEFAULT false,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "label" VARCHAR(500),
    "data" JSONB NOT NULL,
    "detached" JSONB,
    "deleted_by_id" UUID,
    "deleted_by_label" VARCHAR(255),
    "source" VARCHAR(10) NOT NULL DEFAULT 'WEB',
    "tool_name" VARCHAR(100),
    "deleted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restored_at" TIMESTAMPTZ,
    "restored_by_id" UUID,

    CONSTRAINT "trash_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trash_entries_batch_id_idx" ON "trash_entries"("batch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trash_entries_deleted_at_idx" ON "trash_entries"("deleted_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trash_entries_model_record_id_idx" ON "trash_entries"("model", "record_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_api_key_hash_key" ON "users"("api_key_hash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_batch_id_idx" ON "audit_logs"("batch_id");


-- Le journal garde ses lignes quand un utilisateur est supprimé (l'auteur passe à vide)
ALTER TABLE IF EXISTS "audit_logs" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE IF EXISTS "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_userId_fkey";
ALTER TABLE IF EXISTS "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
