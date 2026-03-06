-- CreateTable
CREATE TABLE "ai_calendar_suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "calendarEventId" VARCHAR(255) NOT NULL,
    "eventTitle" VARCHAR(500) NOT NULL,
    "eventDate" TIMESTAMPTZ NOT NULL,
    "suggestionType" VARCHAR(20) NOT NULL,
    "suggestedData" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "createdEntityId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ,

    CONSTRAINT "ai_calendar_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_calendar_suggestions_userId_status_idx" ON "ai_calendar_suggestions"("userId", "status");

-- CreateIndex
CREATE INDEX "ai_calendar_suggestions_calendarEventId_idx" ON "ai_calendar_suggestions"("calendarEventId");

-- AddForeignKey
ALTER TABLE "ai_calendar_suggestions" ADD CONSTRAINT "ai_calendar_suggestions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
