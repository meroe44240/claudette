-- CreateEnum
CREATE TYPE "JobPostingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "JobPostingVisibility" AS ENUM ('PUBLIC', 'PRIVATE_LINK');

-- CreateEnum
CREATE TYPE "JobApplicationStatus" AS ENUM ('NEW', 'REVIEWED', 'SHORTLISTED', 'REJECTED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'MANAGER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TypeNotification" ADD VALUE 'AI_SUMMARY_READY';
ALTER TYPE "TypeNotification" ADD VALUE 'AI_BRIEF_READY';
ALTER TYPE "TypeNotification" ADD VALUE 'JOB_APPLICATION_NEW';

-- AlterTable
ALTER TABLE "ai_calendar_suggestions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ai_pipeline_suggestions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "booking_reminders" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "booking_settings" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "bookings" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "candidats" ADD COLUMN     "aiAnonymizedProfile" JSONB,
ADD COLUMN     "aiIdealFor" TEXT,
ADD COLUMN     "aiParsedAt" TIMESTAMPTZ,
ADD COLUMN     "aiPitchLong" TEXT,
ADD COLUMN     "aiPitchShort" VARCHAR(500),
ADD COLUMN     "aiSellingPoints" JSONB;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "monthlySalary" DOUBLE PRECISION,
ADD COLUMN     "startDate" TIMESTAMPTZ,
ADD COLUMN     "variableRate" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "sequences" (
    "id" UUID NOT NULL,
    "nom" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "persona" VARCHAR(255),
    "targetType" VARCHAR(50) NOT NULL,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "stopOnReply" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_runs" (
    "id" UUID NOT NULL,
    "sequenceId" UUID NOT NULL,
    "targetType" VARCHAR(50) NOT NULL,
    "targetId" UUID NOT NULL,
    "mandatId" UUID,
    "assignedToId" UUID,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextActionAt" TIMESTAMPTZ,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sequence_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_step_logs" (
    "id" UUID NOT NULL,
    "sequenceRunId" UUID NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "actionType" VARCHAR(50) NOT NULL,
    "channel" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "taskId" UUID,
    "executedAt" TIMESTAMPTZ,
    "responseDetectedAt" TIMESTAMPTZ,
    "result" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sequence_step_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sdr_lists" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "totalContacts" INTEGER NOT NULL DEFAULT 0,
    "processedContacts" INTEGER NOT NULL DEFAULT 0,
    "sequenceId" UUID,
    "assignedToId" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'imported',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sdr_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sdr_contacts" (
    "id" UUID NOT NULL,
    "sdrListId" UUID NOT NULL,
    "candidatId" UUID,
    "companyId" UUID,
    "rawData" JSONB NOT NULL DEFAULT '{}',
    "firstName" VARCHAR(255),
    "lastName" VARCHAR(255),
    "email" VARCHAR(255),
    "phone" VARCHAR(100),
    "company" VARCHAR(255),
    "jobTitle" VARCHAR(255),
    "callResult" VARCHAR(30) NOT NULL DEFAULT 'pending',
    "sequenceRunId" UUID,
    "notes" TEXT,
    "processedAt" TIMESTAMPTZ,
    "orderInList" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sdr_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adchase_campaigns" (
    "id" UUID NOT NULL,
    "candidatId" UUID NOT NULL,
    "anonymizedProfile" JSONB NOT NULL DEFAULT '{}',
    "anonymizedCvUrl" VARCHAR(500),
    "emailSubject" VARCHAR(500) NOT NULL,
    "emailBody" TEXT NOT NULL,
    "sequenceId" UUID,
    "totalProspects" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    "scheduledAt" TIMESTAMPTZ,
    "sentAt" TIMESTAMPTZ,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "adchase_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adchase_prospects" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "emailStatus" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "replySentiment" VARCHAR(20),
    "sequenceRunId" UUID,
    "sentAt" TIMESTAMPTZ,
    "openedAt" TIMESTAMPTZ,
    "repliedAt" TIMESTAMPTZ,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adchase_prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" UUID NOT NULL,
    "entityLabel" VARCHAR(500),
    "changes" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "entityType" VARCHAR(50),
    "entityId" UUID,
    "titre" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "triggerAt" TIMESTAMPTZ NOT NULL,
    "fired" BOOLEAN NOT NULL DEFAULT false,
    "firedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" UUID NOT NULL,
    "feature" VARCHAR(50) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "userId" UUID NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_call_summaries" (
    "id" UUID NOT NULL,
    "activiteId" UUID NOT NULL,
    "entityType" VARCHAR(20) NOT NULL,
    "entityId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "summaryJson" JSONB NOT NULL DEFAULT '{}',
    "actionsAccepted" JSONB NOT NULL DEFAULT '[]',
    "updatesApplied" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ai_call_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_call_briefs" (
    "id" UUID NOT NULL,
    "entityType" VARCHAR(20) NOT NULL,
    "entityId" UUID NOT NULL,
    "calendarEventId" VARCHAR(255),
    "userId" UUID NOT NULL,
    "briefJson" JSONB NOT NULL DEFAULT '{}',
    "webResultsRaw" JSONB,
    "generatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ai_call_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_prospect_searches" (
    "id" UUID NOT NULL,
    "candidatId" UUID NOT NULL,
    "campaignId" UUID,
    "userId" UUID NOT NULL,
    "searchParams" JSONB NOT NULL DEFAULT '{}',
    "resultsJson" JSONB NOT NULL DEFAULT '[]',
    "prospectsSelected" JSONB NOT NULL DEFAULT '[]',
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ai_prospect_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_postings" (
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
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
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
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sequence_runs_status_nextActionAt_idx" ON "sequence_runs"("status", "nextActionAt");

-- CreateIndex
CREATE INDEX "sdr_contacts_sdrListId_orderInList_idx" ON "sdr_contacts"("sdrListId", "orderInList");

-- CreateIndex
CREATE INDEX "sdr_contacts_callResult_idx" ON "sdr_contacts"("callResult");

-- CreateIndex
CREATE INDEX "adchase_prospects_campaignId_idx" ON "adchase_prospects"("campaignId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "reminders_userId_fired_idx" ON "reminders"("userId", "fired");

-- CreateIndex
CREATE INDEX "reminders_triggerAt_idx" ON "reminders"("triggerAt");

-- CreateIndex
CREATE INDEX "ai_usage_logs_userId_idx" ON "ai_usage_logs"("userId");

-- CreateIndex
CREATE INDEX "ai_usage_logs_feature_idx" ON "ai_usage_logs"("feature");

-- CreateIndex
CREATE INDEX "ai_usage_logs_createdAt_idx" ON "ai_usage_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_call_summaries_activiteId_key" ON "ai_call_summaries"("activiteId");

-- CreateIndex
CREATE INDEX "ai_call_summaries_activiteId_idx" ON "ai_call_summaries"("activiteId");

-- CreateIndex
CREATE INDEX "ai_call_summaries_userId_idx" ON "ai_call_summaries"("userId");

-- CreateIndex
CREATE INDEX "ai_call_briefs_entityType_entityId_idx" ON "ai_call_briefs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ai_call_briefs_expiresAt_idx" ON "ai_call_briefs"("expiresAt");

-- CreateIndex
CREATE INDEX "ai_prospect_searches_candidatId_idx" ON "ai_prospect_searches"("candidatId");

-- CreateIndex
CREATE INDEX "ai_prospect_searches_expiresAt_idx" ON "ai_prospect_searches"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_postings_slug_key" ON "job_postings"("slug");

-- CreateIndex
CREATE INDEX "job_postings_status_publishedAt_idx" ON "job_postings"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "job_applications_jobPostingId_status_idx" ON "job_applications"("jobPostingId", "status");

-- CreateIndex
CREATE INDEX "job_applications_email_idx" ON "job_applications"("email");

-- AddForeignKey
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_runs" ADD CONSTRAINT "sequence_runs_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_step_logs" ADD CONSTRAINT "sequence_step_logs_sequenceRunId_fkey" FOREIGN KEY ("sequenceRunId") REFERENCES "sequence_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sdr_contacts" ADD CONSTRAINT "sdr_contacts_sdrListId_fkey" FOREIGN KEY ("sdrListId") REFERENCES "sdr_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adchase_prospects" ADD CONSTRAINT "adchase_prospects_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "adchase_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_mandatId_fkey" FOREIGN KEY ("mandatId") REFERENCES "mandats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_postings" ADD CONSTRAINT "job_postings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "job_postings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_candidatId_fkey" FOREIGN KEY ("candidatId") REFERENCES "candidats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

