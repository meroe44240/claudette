// Time-driven work, once a minute: halfway reminders, escalations, scheduled reports (Maya at 11:00), scheduled messages.
// Every step takes `now` so it can be tested (POST /v1/admin/tick?now=... with the admin token).

import { q, one } from './db.js';
import {
  type Agent, type Human, type Question, getAgent, getHuman, dmChannel, postAs, refreshCard, questionProps,
  enqueue, audit, ToolError, newId, permalink,
} from './core.js';
import { TEAM_TZ, alertOps, channelId, guardSend } from './guard.js';
import { cronToday, duration, localParts } from './time.js';
import { t, fmtDate } from './i18n.js';

const REPORT_WAKE_BEFORE_MS = 15 * 60_000;
const REPORT_GRACE_MS = 5 * 60_000;

export function startScheduler() {
  const run = () => void runScheduler(new Date()).catch((e) => console.error('[scheduler]', e));
  setInterval(run, 60_000);
  run();
}

export async function runScheduler(now: Date) {
  const done = { reminded: 0, escalated: 0, reports: 0, messages: 0 };
  done.reminded = await reminders(now);
  done.escalated = await escalations(now);
  done.reports = await reports(now);
  done.messages = await scheduledMessages(now);
  return done;
}

// ── Reminders and escalations ────────────────────────────────────────────────

async function reminders(now: Date) {
  const due = await q<Question>(
    `select * from questions where status='open' and reminded_at is null and deadline is not null and root_post_id is not null
       and created_at + (deadline - created_at) / 2 <= $1`, [now]);
  for (const qn of due) {
    const [agent, human] = await Promise.all([getAgent(qn.agent_key), getHuman(qn.human_key)]);
    if (!agent || !human || agent.status !== 'active') continue;
    await postAs(agent, qn.dm_channel_id, t(human.lang, 'reminder', { agent: agent.name, date: fmtDate(qn.deadline!, human.lang, human.timezone) }),
      { rootId: qn.root_post_id! }).catch((e) => console.error('[scheduler] reminder', e.message));
    await q('update questions set reminded_at=$2 where id=$1', [qn.id, now]);
    await refreshCard({ ...qn, reminded_at: now });
    await audit('hub', 'scheduler', 'question.remind', qn.human_key, { question_id: qn.id });
  }
  return due.length;
}

/** Who gets a question nobody answered: the agent's escalation person, else its human manager, else the admin. */
async function escalationTarget(agent: Agent, asked: Human): Promise<Human | null> {
  const candidates = [agent.rules.escalation, agent.rules.reports_to].filter(Boolean) as string[];
  for (const key of candidates) {
    const h = await getHuman(key);
    if (h && h.key !== asked.key) return h;
  }
  const admin = await one<Human>('select * from humans where is_admin order by key limit 1');
  return admin && admin.key !== asked.key ? admin : null;
}

async function escalations(now: Date) {
  const open = await q<Question>(
    `select * from questions where status='open' and escalated_at is null and root_post_id is not null`);
  let n = 0;
  for (const qn of open) {
    const agent = await getAgent(qn.agent_key);
    if (!agent || agent.status !== 'active') continue;
    const after = duration(agent.rules.escalate_after, 24 * 3_600_000);
    const at = Math.min(qn.created_at.getTime() + after, qn.deadline?.getTime() ?? Infinity);
    if (now.getTime() < at) continue;
    const asked = (await getHuman(qn.human_key))!;
    const target = await escalationTarget(agent, asked);
    if (!target) {
      await q(`update questions set escalated_at=$2 where id=$1`, [qn.id, now]); // nobody above: stop checking
      continue;
    }
    const channel = await dmChannel(agent.key, target.key);
    if (!channel) {
      await alertOps(`${agent.name}'s question to ${asked.first_name} is unanswered, but ${agent.name} has no conversation with ${target.first_name} to escalate.`,
        `esc-nodm:${qn.id}`);
      await q(`update questions set escalated_at=$2 where id=$1`, [qn.id, now]);
      continue;
    }
    const updated: Question = { ...qn, escalated_at: now, escalated_to: target.key };
    const copy = await postAs(agent, channel, '', { props: questionProps(updated, agent, target, { asked }) });
    await q(`update questions set escalated_at=$2, escalated_to=$3, escalation_post_id=$4 where id=$1`, [qn.id, now, target.key, copy.id]);
    await postAs(agent, qn.dm_channel_id, t(asked.lang, 'escalated_note', { person: target.first_name }), { rootId: qn.root_post_id! })
      .catch(() => {});
    await refreshCard({ ...updated, escalation_post_id: copy.id });
    await audit('hub', 'scheduler', 'question.escalate', target.key, { question_id: qn.id, asked: asked.key, post_id: copy.id });
    n++;
  }
  return n;
}

// ── Scheduled reports (Maya in #performance) ─────────────────────────────────

type ReportRow = { id: string; text: string | null; woken_at: Date | null; submitted_at: Date | null; posted_at: Date | null;
  missing_alerted_at: Date | null };

async function reportRow(agentKey: string, channel: string, day: string) {
  await q(`insert into reports (agent_key, channel, day) values ($1,$2,$3) on conflict do nothing`, [agentKey, channel, day]);
  return (await one<ReportRow>(`select * from reports where agent_key=$1 and channel=$2 and day=$3`, [agentKey, channel, day]))!;
}

async function publishReport(agent: Agent, channel: string, id: string, text: string, now: Date) {
  const chId = await channelId(channel);
  if (!chId) throw new ToolError(500, `#${channel} not found`);
  const post = await postAs(agent, chId, text);
  await q(`update reports set posted_at=$2, post_id=$3 where id=$1`, [id, now, post.id]);
  await audit('agent', agent.key, 'report.post', channel, { post_id: post.id });
  return post;
}

async function reports(now: Date) {
  const agents = await q<Agent>(`select * from agents where status='active' and rules ? 'report'`);
  let n = 0;
  for (const agent of agents) {
    const { channel, cron } = agent.rules.report ?? {};
    if (!channel || !cron) continue;
    const at = cronToday(cron, now, TEAM_TZ);
    if (!at) continue;
    const day = localParts(now, TEAM_TZ).date;
    if (now.getTime() < at.getTime() - REPORT_WAKE_BEFORE_MS) continue;
    const r = await reportRow(agent.key, channel, day);
    if (!r.woken_at) {
      await enqueue(agent.key, 'task', null, {
        task: 'daily_report', channel, day, publish_at: at.toISOString(),
        text: `Prepare today's report for #${channel} and send it with post_report. It is published at ${fmtDate(at, 'en', TEAM_TZ)} (Ho Chi Minh).`,
      });
      await q(`update reports set woken_at=$2 where id=$1`, [r.id, now]);
      n++;
    }
    if (r.submitted_at && !r.posted_at && now >= at) {
      await publishReport(agent, channel, r.id, r.text!, now);
      n++;
    }
    if (!r.submitted_at && !r.missing_alerted_at && now.getTime() >= at.getTime() + REPORT_GRACE_MS) {
      await alertOps(`${agent.name}'s report for #${channel} (due ${fmtDate(at, 'en', TEAM_TZ)}) has not arrived.`);
      await q(`update reports set missing_alerted_at=$2 where id=$1`, [r.id, now]);
    }
  }
  return n;
}

/** Tool post_report: the agent hands over its report; published at the scheduled time (or now if that time has passed). */
export async function submitReport(agent: Agent, input: { text: string; day?: string }, now = new Date()) {
  const { channel, cron } = agent.rules.report ?? {};
  if (!channel || !cron) throw new ToolError(403, 'You have no scheduled report');
  const day = input.day ?? localParts(now, TEAM_TZ).date;
  const r = await reportRow(agent.key, channel, day);
  if (r.posted_at) throw new ToolError(409, `Today's report is already published in #${channel}`);
  await q(`update reports set text=$2, submitted_at=$3 where id=$1`, [r.id, input.text, now]);
  await audit('agent', agent.key, 'report.submit', channel, { day });
  const at = cronToday(cron, now, TEAM_TZ);
  if (!at || now >= at) {
    const post = await publishReport(agent, channel, r.id, input.text, now);
    return { status: 'published', post_id: post.id, permalink: permalink(post.id) };
  }
  return { status: 'scheduled', publish_at: at.toISOString() };
}

// ── Scheduled messages ───────────────────────────────────────────────────────

export async function scheduleMessage(agent: Agent, input: { to: string; text: string; send_at: string }) {
  const human = await getHuman(input.to);
  if (!human) throw new ToolError(404, `Unknown person "${input.to}"`);
  if (!(await dmChannel(agent.key, human.key))) throw new ToolError(403, `You have no conversation with ${human.key}`);
  const at = new Date(input.send_at);
  if (Number.isNaN(at.getTime())) throw new ToolError(400, 'send_at must be an ISO date');
  if (at.getTime() > Date.now() + 90 * 86_400_000) throw new ToolError(400, 'At most 90 days ahead');
  const id = newId('m');
  await q(`insert into scheduled_messages (id, agent_key, human_key, text, send_at) values ($1,$2,$3,$4,$5)`,
    [id, agent.key, human.key, input.text, at]);
  await audit('agent', agent.key, 'message.schedule', human.key, { id, send_at: at.toISOString() });
  return { scheduled_id: id, send_at: at.toISOString() };
}

export async function cancelScheduled(agent: Agent, input: { scheduled_id: string }) {
  const r = await q(`update scheduled_messages set status='cancelled' where id=$1 and agent_key=$2 and status='pending' returning id`,
    [input.scheduled_id, agent.key]);
  if (!r.length) throw new ToolError(404, 'No pending scheduled message with that id');
  return { cancelled: input.scheduled_id };
}

async function scheduledMessages(now: Date) {
  const due = await q<{ id: string; agent_key: string; human_key: string; text: string }>(
    `select id, agent_key, human_key, text from scheduled_messages where status='pending' and send_at <= $1 order by send_at`, [now]);
  for (const m of due) {
    const [agent, human] = await Promise.all([getAgent(m.agent_key), getHuman(m.human_key)]);
    if (!agent || !human) continue;
    if (agent.status !== 'active') continue; // waits until the agent is resumed
    try {
      // Rules apply at sending time (who it may write to, time window, budget).
      await guardSend(agent, { initiate: true, human, what: 'scheduled message' });
      const channel = (await dmChannel(agent.key, human.key))!;
      const post = await postAs(agent, channel, m.text);
      await q(`update scheduled_messages set status='sent', post_id=$2 where id=$1`, [m.id, post.id]);
      await audit('agent', agent.key, 'message', human.key, { post_id: post.id, scheduled_id: m.id });
    } catch (e: any) {
      await q(`update scheduled_messages set status='failed', error=$2 where id=$1`, [m.id, String(e.message).slice(0, 300)]);
      await enqueue(agent.key, 'alert', null, { reason: 'scheduled_message_failed', scheduled_id: m.id, error: e.message,
        text: `Your scheduled message to ${human.first_name} was not sent: ${e.message}` });
    }
  }
  return due.length;
}
