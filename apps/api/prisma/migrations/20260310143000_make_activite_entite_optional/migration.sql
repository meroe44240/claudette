-- AlterTable: make entiteType and entiteId optional on activites
-- This allows creating activities (calls, transcripts) without a linked entity
-- when the contact hasn't been identified yet.

ALTER TABLE "activites" ALTER COLUMN "entiteType" DROP NOT NULL;
ALTER TABLE "activites" ALTER COLUMN "entiteId" DROP NOT NULL;
