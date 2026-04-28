-- Catch-up: column existed in schema.prisma but had no migration, breaking
-- prisma migrate deploy and any user.upsert in tests.
-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "calendlyUrl" VARCHAR(500);
