-- CreateTable
CREATE TABLE "candidat_experiences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "candidatId" UUID NOT NULL,
    "titre" VARCHAR(255) NOT NULL,
    "entreprise" VARCHAR(255) NOT NULL,
    "anneeDebut" INTEGER NOT NULL,
    "anneeFin" INTEGER,
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" VARCHAR(20) NOT NULL DEFAULT 'cv',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "candidat_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidat_experiences_candidatId_idx" ON "candidat_experiences"("candidatId");

-- CreateIndex
CREATE INDEX "candidat_experiences_titre_idx" ON "candidat_experiences"("titre");

-- CreateIndex
CREATE INDEX "candidat_experiences_entreprise_idx" ON "candidat_experiences"("entreprise");

-- AddForeignKey
ALTER TABLE "candidat_experiences" ADD CONSTRAINT "candidat_experiences_candidatId_fkey" FOREIGN KEY ("candidatId") REFERENCES "candidats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
