-- AlterTable
ALTER TABLE "pushes" ADD COLUMN "gmail_sent_at" TIMESTAMPTZ;
ALTER TABLE "pushes" ADD COLUMN "gmail_thread_id" VARCHAR(100);
ALTER TABLE "pushes" ADD COLUMN "gmail_message_id" VARCHAR(100);

-- CreateIndex
CREATE INDEX "pushes_gmail_thread_id_idx" ON "pushes"("gmail_thread_id");
