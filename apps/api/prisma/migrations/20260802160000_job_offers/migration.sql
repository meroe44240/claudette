-- Job board : offres publiees (consommees par la landing via l'API publique).
CREATE TABLE "job_offers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" VARCHAR(255) NOT NULL,
  "titre" VARCHAR(255) NOT NULL,
  "description" TEXT NOT NULL,
  "localisation" VARCHAR(255),
  "contractType" VARCHAR(50),
  "remote" VARCHAR(50),
  "salaireMin" INTEGER,
  "salaireMax" INTEGER,
  "secteur" VARCHAR(100),
  "entrepriseNom" VARCHAR(255),
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "published" BOOLEAN NOT NULL DEFAULT false,
  "mandatId" UUID,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "job_offers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "job_offers_slug_key" ON "job_offers"("slug");
CREATE INDEX "job_offers_published_idx" ON "job_offers"("published");
