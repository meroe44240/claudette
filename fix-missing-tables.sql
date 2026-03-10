-- Fix missing tables from failed migration
-- Tables job_postings and job_applications were not created

-- Add missing columns to candidats
ALTER TABLE "candidats" ADD COLUMN IF NOT EXISTS "aiAnonymizedProfile" JSONB;
ALTER TABLE "candidats" ADD COLUMN IF NOT EXISTS "aiIdealFor" TEXT;
ALTER TABLE "candidats" ADD COLUMN IF NOT EXISTS "aiParsedAt" TIMESTAMPTZ;
ALTER TABLE "candidats" ADD COLUMN IF NOT EXISTS "aiPitchLong" TEXT;
ALTER TABLE "candidats" ADD COLUMN IF NOT EXISTS "aiPitchShort" VARCHAR(500);
ALTER TABLE "candidats" ADD COLUMN IF NOT EXISTS "aiSellingPoints" JSONB;

-- Add missing columns to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "monthlySalary" DOUBLE PRECISION;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMPTZ;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "variableRate" DOUBLE PRECISION;

-- Create job_postings table
CREATE TABLE IF NOT EXISTS "job_postings" (
    "id" UUID NOT NULL,
    "mandatId" UUID,
    "slug" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "companyDescription" TEXT,
    "location" VARCHAR(255),
    "salaryRange" VARCHAR(100),
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "jobType" VARCHAR(50),
    "sector" VARCHAR(50),
    "status" "JobPostingStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "JobPostingVisibility" NOT NULL DEFAULT 'PUBLIC',
    "isUrgent" BOOLEAN NOT NULL DEFAULT false,
    "assignedToId" UUID,
    "createdById" UUID,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "applicationCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMPTZ,
    "archivedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

-- Create job_applications table
CREATE TABLE IF NOT EXISTS "job_applications" (
    "id" UUID NOT NULL,
    "jobPostingId" UUID,
    "candidatId" UUID,
    "firstName" VARCHAR(255) NOT NULL,
    "lastName" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50),
    "salaryCurrent" VARCHAR(100),
    "currentCompany" VARCHAR(255),
    "availability" VARCHAR(100),
    "cvFileUrl" VARCHAR(500),
    "source" VARCHAR(100) NOT NULL DEFAULT 'job_board',
    "isSpontaneous" BOOLEAN NOT NULL DEFAULT false,
    "jobTypeSought" VARCHAR(100),
    "status" "JobApplicationStatus" NOT NULL DEFAULT 'NEW',
    "reviewedAt" TIMESTAMPTZ,
    "reviewedById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "job_postings_slug_key" ON "job_postings"("slug");
CREATE INDEX IF NOT EXISTS "job_postings_status_publishedAt_idx" ON "job_postings"("status", "publishedAt");
CREATE INDEX IF NOT EXISTS "job_applications_jobPostingId_status_idx" ON "job_applications"("jobPostingId", "status");
CREATE INDEX IF NOT EXISTS "job_applications_email_idx" ON "job_applications"("email");

-- Foreign keys (use DO block to handle if already exists)
DO $$ BEGIN
  ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_mandatId_fkey" FOREIGN KEY ("mandatId") REFERENCES "mandats"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "job_postings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_candidatId_fkey" FOREIGN KEY ("candidatId") REFERENCES "candidats"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
