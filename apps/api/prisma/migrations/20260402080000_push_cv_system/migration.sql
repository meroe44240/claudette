-- CreateEnum
CREATE TYPE "PushCanal" AS ENUM ('EMAIL', 'LINKEDIN');

-- CreateEnum
CREATE TYPE "PushStatus" AS ENUM ('ENVOYE', 'OUVERT', 'REPONDU', 'RDV_BOOK', 'CONVERTI_MANDAT', 'SANS_SUITE');

-- CreateTable
CREATE TABLE "prospects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyName" VARCHAR(255) NOT NULL,
    "contactName" VARCHAR(255),
    "contactEmail" VARCHAR(255),
    "contactLinkedin" VARCHAR(500),
    "sector" VARCHAR(100),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pushes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "candidatId" UUID NOT NULL,
    "prospectId" UUID NOT NULL,
    "recruiterId" UUID NOT NULL,
    "canal" "PushCanal" NOT NULL,
    "status" "PushStatus" NOT NULL DEFAULT 'ENVOYE',
    "message" TEXT,
    "sentAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pushes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pushes_recruiterId_sentAt_idx" ON "pushes"("recruiterId", "sentAt");

-- CreateIndex
CREATE INDEX "pushes_status_idx" ON "pushes"("status");

-- AddForeignKey
ALTER TABLE "pushes" ADD CONSTRAINT "pushes_candidatId_fkey" FOREIGN KEY ("candidatId") REFERENCES "candidats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pushes" ADD CONSTRAINT "pushes_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pushes" ADD CONSTRAINT "pushes_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
