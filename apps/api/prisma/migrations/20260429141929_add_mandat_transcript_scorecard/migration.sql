-- Catch-up: these columns existed in schema.prisma but had no migration,
-- so prisma migrate deploy was a no-op and any SELECT/UPDATE on these
-- mandats columns failed with P2022 column does not exist.
-- AlterTable
ALTER TABLE "mandats" ADD COLUMN IF NOT EXISTS "transcript" TEXT;
ALTER TABLE "mandats" ADD COLUMN IF NOT EXISTS "ficheDePoste" TEXT;
ALTER TABLE "mandats" ADD COLUMN IF NOT EXISTS "scorecard" JSONB;
ALTER TABLE "mandats" ADD COLUMN IF NOT EXISTS "scorecardGeneratedAt" TIMESTAMPTZ;
