-- Agent Hub: people, agents, who talks to whom, delivery queue, questions, audit.

create table humans (
  key text primary key,
  mm_user_id text unique not null,
  first_name text not null,
  name text not null,
  lang text not null default 'en',
  timezone text not null default 'Asia/Ho_Chi_Minh',
  is_admin boolean not null default false,
  propium_user_id text,
  updated_at timestamptz not null default now()
);

create table agents (
  key text primary key,
  name text not null,
  title text not null,
  scope text not null,
  mm_user_id text unique not null,
  mm_token text not null,
  provider text not null default 'grok',             -- grok | claude | claude-test | other
  delivery_mode text not null default 'doorbell',    -- doorbell | poll | webhook | claude-test
  wake_url text, wake_key text,                      -- doorbell
  webhook_url text, webhook_secret text,             -- webhook
  api_key_sha256 text unique,
  rules jsonb not null default '{}',
  hidden boolean not null default false,
  status text not null default 'active',             -- active | paused
  last_wake_at timestamptz,
  updated_at timestamptz not null default now()
);

-- One DM per person and agent.
create table access (
  agent_key text not null references agents on delete cascade,
  human_key text not null references humans on delete cascade,
  dm_channel_id text not null unique,
  primary key (agent_key, human_key)
);

-- What the Hub has to hand to an agent (messages, answers, forwarded questions).
create table events (
  id bigserial primary key,
  agent_key text not null references agents on delete cascade,
  kind text not null,                                -- message | answer
  human_key text references humans,
  payload jsonb not null,
  status text not null default 'pending',            -- pending | delivered | acked | failed
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  acked_at timestamptz
);
create index events_agent_status on events (agent_key, status);

-- Questions agents ask people. Also the registry.
create table questions (
  id text primary key,
  agent_key text not null references agents,
  human_key text not null references humans,
  dm_channel_id text not null,
  root_post_id text unique,
  subject text not null,
  object_type text, object_id text, object_label text, object_url text,
  body text not null,
  choices jsonb,
  deadline timestamptz,
  status text not null default 'open',               -- open | answered | resolved | cancelled | expired | escalated
  answer_choice text, answer_text text, answered_via text, answered_at timestamptz,
  resolution text, propium_action text, resolved_at timestamptz,
  confidential boolean not null default false,
  created_at timestamptz not null default now()
);
create index questions_human_status on questions (human_key, status);
create index questions_agent_created on questions (agent_key, created_at);

-- Pending "forward to another agent" offers.
create table redirects (
  id text primary key,
  from_agent text not null references agents,
  to_agent text not null references agents,
  human_key text not null references humans,
  original_post_id text not null,
  original_text text not null,
  reason text,
  offer_post_id text,
  forwarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  ts timestamptz not null default now(),
  actor_type text not null,                          -- agent | human | hub
  actor text not null,
  action text not null,
  target text,
  detail jsonb
);
create index audit_ts on audit_log (ts);

create table kv (
  key text primary key,
  value jsonb not null
);
