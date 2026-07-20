-- ═══════════════════════════════════════════════════════════════════════════
-- Chantier 5 : Drop legacy feature tables
--
-- ⚠️  DESTRUCTIVE MIGRATION — 15 tables + 7 enums removed
--
-- BEFORE APPLYING IN PROD :
--   docker compose -f docker/docker-compose.prod.yml exec postgres \
--     pg_dump -U humanup -Fc \
--       -t templates -t notifications \
--       -t sequences -t sequence_runs -t sequence_step_logs -t sequence_daily_research \
--       -t sdr_lists -t sdr_contacts \
--       -t adchase_campaigns -t adchase_prospects \
--       -t job_postings -t job_applications \
--       -t booking_settings -t booking_types -t bookings -t booking_reminders \
--       -t pushes -t push_events -t prospects -t push_detection_logs \
--       humanup_prod \
--     > /opt/humanup/backups/legacy-features-YYYYMMDD.dump
--
-- If pg_dump fails on any table (already dropped, etc.), that's fine — this
-- migration uses DROP TABLE IF EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Templates (dropped in chantier 4 : commit a775811) ──
DROP TABLE IF EXISTS "templates" CASCADE;
DROP TYPE IF EXISTS "TypeTemplate";

-- ── Notifications (dropped in chantier 4 : commit 8e24a36) ──
-- Note : notification.service.ts stub garde des refs prisma.notification,
-- mais le service a ete stubbe en no-op — plus aucune ecriture. Safe to drop.
DROP TABLE IF EXISTS "notifications" CASCADE;
DROP TYPE IF EXISTS "TypeNotification";

-- ── Sequences (dropped in chantier 4 : commit f038a7e) ──
DROP TABLE IF EXISTS "sequence_daily_research" CASCADE;
DROP TABLE IF EXISTS "sequence_step_logs" CASCADE;
DROP TABLE IF EXISTS "sequence_runs" CASCADE;
DROP TABLE IF EXISTS "sequences" CASCADE;

-- ── SDR Manager (dropped in chantier 4 : commit c956d7f) ──
DROP TABLE IF EXISTS "sdr_contacts" CASCADE;
DROP TABLE IF EXISTS "sdr_lists" CASCADE;

-- ── Adchase (dropped in chantier 4 : commit 8123cb3) ──
DROP TABLE IF EXISTS "adchase_prospects" CASCADE;
DROP TABLE IF EXISTS "adchase_campaigns" CASCADE;

-- ── Job Board (dropped in chantier 4 : commit 79c4d28) ──
DROP TABLE IF EXISTS "job_applications" CASCADE;
DROP TABLE IF EXISTS "job_postings" CASCADE;
DROP TYPE IF EXISTS "JobApplicationStatus";
DROP TYPE IF EXISTS "JobPostingVisibility";
DROP TYPE IF EXISTS "JobPostingStatus";

-- ── Booking (dropped in chantier 4 : commit bfe8d98) ──
DROP TABLE IF EXISTS "booking_reminders" CASCADE;
DROP TABLE IF EXISTS "bookings" CASCADE;
DROP TABLE IF EXISTS "booking_types" CASCADE;
DROP TABLE IF EXISTS "booking_settings" CASCADE;

-- ── Push CV (dropped in chantier 4 : commit 3ed85b8) ──
DROP TABLE IF EXISTS "push_detection_logs" CASCADE;
DROP TABLE IF EXISTS "push_events" CASCADE;
DROP TABLE IF EXISTS "pushes" CASCADE;
DROP TABLE IF EXISTS "prospects" CASCADE;
DROP TYPE IF EXISTS "PushStatus";
DROP TYPE IF EXISTS "PushCanal";
