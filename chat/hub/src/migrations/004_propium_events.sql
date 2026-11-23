-- Phase 5: announcements received from Propium (idempotency and log).
create table propium_events (
  event_id text primary key,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  post_id text
);
