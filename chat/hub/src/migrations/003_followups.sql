-- Phase 4: reminders, escalations, approvals, scheduled reports and messages.

alter table questions
  add column reminded_at timestamptz,
  add column escalated_at timestamptz,
  add column escalated_to text references humans,
  add column escalation_post_id text,
  add column answered_by text references humans;

create table approvals (
  id text primary key,
  agent_key text not null references agents,
  kind text not null,                                -- email | sequence | transfer | other
  title text not null,
  summary text,
  draft text,
  payload jsonb,
  related_label text, related_url text,
  post_id text,
  status text not null default 'pending',           -- pending | approved | edited | rejected
  decided_by text references humans,
  decided_at timestamptz,
  edited_draft text,
  comment text,
  created_at timestamptz not null default now()
);

-- Scheduled channel reports (Maya in #performance): submitted by the agent, published at the set time.
create table reports (
  id bigserial primary key,
  agent_key text not null references agents,
  channel text not null,
  day date not null,
  text text,
  woken_at timestamptz,
  submitted_at timestamptz,
  posted_at timestamptz,
  post_id text,
  missing_alerted_at timestamptz,
  unique (agent_key, channel, day)
);

create table scheduled_messages (
  id text primary key,
  agent_key text not null references agents,
  human_key text not null references humans,
  text text not null,
  send_at timestamptz not null,
  status text not null default 'pending',            -- pending | sent | cancelled | failed
  post_id text,
  error text,
  created_at timestamptz not null default now()
);
create index scheduled_due on scheduled_messages (status, send_at);
