-- AlterTable: Add push detection fields to pushes
ALTER TABLE "pushes" ADD COLUMN "auto_detected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pushes" ADD COLUMN "detection_confidence" DOUBLE PRECISION;
ALTER TABLE "pushes" ADD COLUMN "followup_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "pushes" ADD COLUMN "last_touchpoint_at" TIMESTAMPTZ;
ALTER TABLE "pushes" ADD COLUMN "has_duplicate_warning" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add domaine to entreprises
ALTER TABLE "entreprises" ADD COLUMN IF NOT EXISTS "domaine" VARCHAR(255);

-- CreateIndex: Push candidate+prospect compound index
CREATE INDEX "pushes_candidatId_prospectId_idx" ON "pushes"("candidatId", "prospectId");

-- CreateTable: PushEvent (table push_events, columns camelCase per Prisma)
CREATE TABLE "push_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pushId" UUID NOT NULL,
    "eventType" VARCHAR(50) NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" VARCHAR(20),
    "actorId" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: PushEvent indexes
CREATE INDEX "push_events_pushId_occurredAt_idx" ON "push_events"("pushId", "occurredAt" DESC);
CREATE INDEX "push_events_eventType_idx" ON "push_events"("eventType");

-- AddForeignKey
ALTER TABLE "push_events" ADD CONSTRAINT "push_events_pushId_fkey" FOREIGN KEY ("pushId") REFERENCES "pushes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: PushDetectionLog (table push_detection_logs, columns camelCase per Prisma)
CREATE TABLE "push_detection_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gmailMessageId" VARCHAR(255) NOT NULL,
    "recruiterId" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "rejectionReason" TEXT,
    "extractedData" JSONB,
    "candidateMatchScore" DOUBLE PRECISION,
    "isPushConfidence" DOUBLE PRECISION,
    "finalConfidence" DOUBLE PRECISION,
    "pushId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_detection_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: PushDetectionLog indexes
CREATE INDEX "push_detection_logs_recruiterId_idx" ON "push_detection_logs"("recruiterId");
CREATE INDEX "push_detection_logs_status_idx" ON "push_detection_logs"("status");
CREATE INDEX "push_detection_logs_createdAt_idx" ON "push_detection_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "push_detection_logs" ADD CONSTRAINT "push_detection_logs_pushId_fkey" FOREIGN KEY ("pushId") REFERENCES "pushes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
