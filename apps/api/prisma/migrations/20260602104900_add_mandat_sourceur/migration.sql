-- AlterTable
ALTER TABLE "mandats" ADD COLUMN "sourceurId" UUID;

-- AddForeignKey
ALTER TABLE "mandats" ADD CONSTRAINT "mandats_sourceurId_fkey"
  FOREIGN KEY ("sourceurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "mandats_sourceurId_idx" ON "mandats"("sourceurId");
