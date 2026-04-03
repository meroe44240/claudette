-- AlterTable sequences
ALTER TABLE "sequences" ADD COLUMN "is_system" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sequences" ADD COLUMN "auto_trigger" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sequences" ADD COLUMN "trigger_event" VARCHAR(100);

-- AlterTable sequence_runs
ALTER TABLE "sequence_runs" ADD COLUMN "push_id" UUID;

-- CreateTable sequence_daily_research
CREATE TABLE "sequence_daily_research" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sequence_run_id" UUID NOT NULL,
    "research_date" DATE NOT NULL,
    "research_data" JSONB NOT NULL DEFAULT '{}',
    "generated_content" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sequence_daily_research_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sequence_daily_research_sequence_run_id_research_date_key" ON "sequence_daily_research"("sequence_run_id", "research_date");

-- AddForeignKey
ALTER TABLE "sequence_daily_research" ADD CONSTRAINT "sequence_daily_research_sequence_run_id_fkey" FOREIGN KEY ("sequence_run_id") REFERENCES "sequence_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
