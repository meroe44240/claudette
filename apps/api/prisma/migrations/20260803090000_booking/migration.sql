-- Pages booking natives (remplace Calendly) + lien Google Meet auto.
CREATE TABLE "booking_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "slug" VARCHAR(120) NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "durationMin" INTEGER NOT NULL DEFAULT 30,
  "timezone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Paris',
  "availability" JSONB NOT NULL DEFAULT '[]',
  "bufferMin" INTEGER NOT NULL DEFAULT 0,
  "advanceDays" INTEGER NOT NULL DEFAULT 14,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "booking_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "booking_settings_userId_key" ON "booking_settings"("userId");
CREATE UNIQUE INDEX "booking_settings_slug_key" ON "booking_settings"("slug");
CREATE TABLE "bookings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "slotStart" TIMESTAMPTZ NOT NULL,
  "slotEnd" TIMESTAMPTZ NOT NULL,
  "inviteeName" VARCHAR(200) NOT NULL,
  "inviteeEmail" VARCHAR(255) NOT NULL,
  "inviteeNote" TEXT,
  "meetLink" VARCHAR(500),
  "googleEventId" VARCHAR(255),
  "status" VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
  "candidatId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bookings_userId_slotStart_idx" ON "bookings"("userId","slotStart");
