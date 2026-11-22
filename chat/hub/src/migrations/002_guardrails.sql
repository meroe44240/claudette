-- Phase 3: kill switch and counters.
alter table agents add column paused_at timestamptz, add column paused_by text;
create index audit_actor_ts on audit_log (actor, ts);
