-- CreateTable
CREATE TABLE "ai_pipeline_suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "candidatureId" UUID NOT NULL,
    "mandatId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "currentStage" VARCHAR(50) NOT NULL,
    "suggestedStage" VARCHAR(50) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT,
    "triggerType" VARCHAR(50) NOT NULL,
    "triggerData" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "appliedStage" VARCHAR(50),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ,

    CONSTRAINT "ai_pipeline_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_pipeline_suggestions_userId_status_idx" ON "ai_pipeline_suggestions"("userId", "status");

-- CreateIndex
CREATE INDEX "ai_pipeline_suggestions_candidatureId_idx" ON "ai_pipeline_suggestions"("candidatureId");

-- AddForeignKey
ALTER TABLE "ai_pipeline_suggestions" ADD CONSTRAINT "ai_pipeline_suggestions_candidatureId_fkey" FOREIGN KEY ("candidatureId") REFERENCES "candidatures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_pipeline_suggestions" ADD CONSTRAINT "ai_pipeline_suggestions_mandatId_fkey" FOREIGN KEY ("mandatId") REFERENCES "mandats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_pipeline_suggestions" ADD CONSTRAINT "ai_pipeline_suggestions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
