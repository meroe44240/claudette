-- Portail client : lien d'agenda du client, créneaux proposés, débrief d'entretien, relances.
ALTER TABLE "mandats" ADD COLUMN "client_booking_url" VARCHAR(500);
ALTER TABLE "candidatures" ADD COLUMN "portal_slots" JSONB;
ALTER TABLE "candidatures" ADD COLUMN "portal_debrief" JSONB;
ALTER TABLE "candidatures" ADD COLUMN "portal_reminded_at" TIMESTAMPTZ;
