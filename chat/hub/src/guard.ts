// Guardrails applied before an agent posts anything: initiative, time windows, daily budget, anti-loop.
// Blocks are audited; the first block of a kind per agent per day raises an alert in #agents-ops.

import { env } from './env.js';
import { q, one } from './db.js';
import { MM } from './mm.js';
import { type Agent, type Human, ToolError, audit, enqueue, admin, getAgent, bus } from './core.js';
import { feed } from './feed.js';

export const TEAM_TZ = process.env.TEAM_TZ ?? 'Asia/Ho_Chi_Minh';
/** Audit actions that count as a message sent by an agent. */
export const SEND_ACTIONS = ['reply', 'message', 'question.ask', 'redirect', 'ops.post'];
const LOOP_LIMIT = 6;

// ── System bot, channels ─────────────────────────────────────────────────────

type SystemBot = { user_id: string; token: string };
export async function systemBot(name: 'humanup' | 'propium'): Promise<SystemBot | null> {
  return (await one<{ value: Record<string, SystemBot> }>(`select value from kv where key='system_bots'`))?.value?.[name] ?? null;
}

const channelCache = new Map<string, string>();
export async function channelId(name: string): Promise<string | null> {
  if (channelCache.has(name)) return channelCache.get(name)!;
  const team = await admin().find(`/teams/name/${env.MM_TEAM}`);
  const ch = team ? await admin().find(`/teams/${team.id}/channels/name/${name}`) : null;
  if (ch) channelCache.set(name, ch.id);
  return ch?.id ?? null;
}

// ── Alerts ───────────────────────────────────────────────────────────────────

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TEAM_TZ }).format(new Date());

/** Posts in #agents-ops as the system bot and tells the supervision agent. onceKey: at most once per day. */
export async function alertOps(text: string, onceKey?: string, detail?: Record<string, unknown>): Promise<boolean> {
  if (onceKey) {
    const key = `alert:${today()}:${onceKey}`;
    const r = await q(`insert into kv (key, value) values ($1, 'true') on conflict do nothing returning key`, [key]);
    if (!r.length) return false;
  }
  const bot = await systemBot('humanup');
  const ops = await channelId('agents-ops');
  if (bot && ops) await new MM(env.MM_URL, bot.token).post('/posts', { channel_id: ops, message: `⚠️ ${text}` });
  const sentinel = await getAgent('sentinel');
  if (sentinel && sentinel.status === 'active') await enqueue('sentinel', 'alert', null, { text, ...detail });
  await audit('hub', 'guard', 'alert', onceKey, { text });
  return true;
}

// ── Counters ─────────────────────────────────────────────────────────────────

export async function sentToday(agentKey: string): Promise<number> {
  const r = await one<{ n: string }>(
    `select count(*) n from audit_log where actor_type='agent' and actor=$1 and action = any($2)
       and (ts at time zone $3)::date = (now() at time zone $3)::date`,
    [agentKey, SEND_ACTIONS, TEAM_TZ]);
  return Number(r!.n);
}

// ── Checks ───────────────────────────────────────────────────────────────────

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** "MON 09:00-12:00; THU 14:00-16:00" in the team's time zone. */
export function inWindow(spec: string, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TEAM_TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now);
  const day = parts.find((p) => p.type === 'weekday')!.value.slice(0, 3).toUpperCase();
  const minutes = Number(parts.find((p) => p.type === 'hour')!.value) * 60 + Number(parts.find((p) => p.type === 'minute')!.value);
  return spec.split(/[;,]/).map((s) => s.trim()).filter(Boolean).some((w) => {
    const m = w.match(/^([A-Z]{3})(?:-([A-Z]{3}))?\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/i);
    if (!m) return false;
    const from = DAYS.indexOf(m[1].toUpperCase());
    const to = m[2] ? DAYS.indexOf(m[2].toUpperCase()) : from;
    const d = DAYS.indexOf(day);
    const dayOk = from <= to ? d >= from && d <= to : d >= from || d <= to;
    const start = Number(m[3]) * 60 + Number(m[4]);
    const end = Number(m[5]) * 60 + Number(m[6]);
    return dayOk && minutes >= start && minutes < end;
  });
}

/** May the agent write to this person on its own (not as a reply)? */
export function mayInitiate(agent: Agent, human: Human): boolean {
  const r = agent.rules.recipients ?? 'all';
  if (Array.isArray(r)) return r.includes(human.key);
  if (r === 'all' || r === 'team') return true;
  if (r === 'team-except-meroe') return !human.is_admin;
  return false;
}

/**
 * Before any post by an agent.
 * initiate: the agent writes on its own (new message or question), not in answer to someone.
 */
export async function guardSend(agent: Agent, opts: { initiate: boolean; human?: Human; what: string }) {
  if (agent.status !== 'active') throw new ToolError(423, 'You are paused');
  if (opts.initiate) {
    if (agent.rules.can_initiate === false) {
      await audit('agent', agent.key, 'blocked.initiative', opts.human?.key, { what: opts.what });
      throw new ToolError(403, 'Your rules only let you reply, not write first');
    }
    if (opts.human && !mayInitiate(agent, opts.human)) {
      await audit('agent', agent.key, 'blocked.recipient', opts.human.key, { what: opts.what });
      throw new ToolError(403, `Your rules do not let you write to ${opts.human.key} on your own`);
    }
    const window = agent.rules.initiate_window as string | undefined;
    if (window && !inWindow(window)) {
      await audit('agent', agent.key, 'blocked.window', opts.human?.key, { what: opts.what, window });
      throw new ToolError(403, `You may write first only during ${window} (Ho Chi Minh time)`);
    }
  }
  const budget = Number(agent.rules.daily_message_budget ?? 200);
  const sent = await sentToday(agent.key);
  if (sent >= budget) {
    await audit('agent', agent.key, 'blocked.budget', opts.human?.key, { what: opts.what, budget });
    const first = await alertOps(`${agent.name} reached its daily budget of ${budget} messages. Further messages are refused until tomorrow.`,
      `budget:${agent.key}`, { reason: 'budget', agent: agent.key, budget });
    if (first) void feed(agent.key, 'feed_budget', { agent: agent.name, budget });
    throw new ToolError(429, `Daily message budget reached (${budget})`);
  }
}

/** Over the per-person question cap: Inès is told instead of the question being posted. */
export async function questionCapExceeded(agent: Agent, human: Human, cap: number, question: { subject: string; question: string }) {
  await audit('agent', agent.key, 'blocked.question_cap', human.key, { cap, subject: question.subject });
  const ines = await getAgent('ines');
  if (ines && ines.status === 'active' && ines.key !== agent.key) {
    await enqueue('ines', 'alert', null, {
      reason: 'question_cap', agent: agent.key, asked_to: human.key, cap, subject: question.subject, question: question.question,
      text: `${agent.name} wanted to ask ${human.first_name} a ${cap + 1}th question today. Not posted.`,
    });
  }
  const first = await alertOps(`${agent.name} hit the cap of ${cap} questions to ${human.first_name} today. Inès has the extra questions.`,
    `qcap:${agent.key}:${human.key}`, { reason: 'question_cap', agent: agent.key, human: human.key });
  if (first) void feed(agent.key, 'feed_cap', { agent: agent.name, cap, person: human.first_name });
}

/**
 * Anti-loop for #agents-ops: refuse a 7th agent message in a row with no person in between
 * (in the thread when replying, otherwise in the whole channel). Hub alerts (system bots) neither count nor reset.
 */
export async function guardLoop(agent: Agent, channel: string, rootId: string | null, agentIds: Set<string>, systemIds: Set<string>) {
  const mm = admin();
  let posts: any[];
  if (rootId) {
    posts = Object.values<any>((await mm.get(`/posts/${rootId}/thread`)).posts);
  } else {
    const r = await mm.get(`/channels/${channel}/posts?per_page=60`);
    posts = Object.values<any>(r.posts);
  }
  const recent = posts.filter((p) => !p.type && !systemIds.has(p.user_id))
    .sort((a, b) => b.create_at - a.create_at).slice(0, LOOP_LIMIT);
  if (recent.length >= LOOP_LIMIT && recent.every((p) => agentIds.has(p.user_id))) {
    await audit('agent', agent.key, 'blocked.loop', channel, { root_id: rootId });
    await alertOps(`Loop stopped: ${LOOP_LIMIT} agent messages in a row without anyone in #agents-ops${rootId ? ' (thread)' : ''}. `
      + `${agent.name}'s next message was refused. A person must step in.`, `loop:${rootId ?? channel}`, { reason: 'loop', agent: agent.key });
    throw new ToolError(429, `Loop guard: ${LOOP_LIMIT} agent messages in a row, wait for a person`);
  }
}

/** Makes the Mattermost plugin reload its rules now instead of within 30 s. */
export async function refreshPlugin() {
  await fetch(`${env.MM_URL}/plugins/humanup-agents/refresh`, {
    method: 'POST', headers: { 'X-Hub-Secret': env.PLUGIN_SECRET }, signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

// ── Kill switch ──────────────────────────────────────────────────────────────

export async function setPaused(keys: string[] | 'all', paused: boolean, by: string) {
  const rows = await q<{ key: string; name: string }>(
    `update agents set status=$2, paused_at=case when $3 then now() else null end, paused_by=case when $3 then $4 else null end
      where ($1::text[] is null or key = any($1)) returning key, name`,
    [keys === 'all' ? null : keys, paused ? 'paused' : 'active', paused, by]);
  await audit('human', by, paused ? 'agents.pause' : 'agents.resume', keys === 'all' ? 'all' : keys.join(','));
  await refreshPlugin();
  if (!paused) for (const r of rows) bus.emit('enqueued', r.key);
  const byName = (await one<{ first_name: string }>('select first_name from humans where key=$1', [by]))?.first_name ?? by;
  for (const r of rows) void feed(r.key, paused ? 'feed_paused' : 'feed_resumed', { agent: r.name, by: byName });
  if (rows.length) {
    const who = keys === 'all' ? 'All agents' : rows.map((r) => r.name).join(', ');
    await alertOps(`${who} ${paused ? 'paused' : 'resumed'} by ${byName}.`);
  }
  return rows;
}
