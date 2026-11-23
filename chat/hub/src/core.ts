// Shared operations: who is who, posting as an agent, the delivery queue, questions, redirects.
// REST, MCP, the Claude test adapter and the Mattermost listener all go through here.

import { EventEmitter } from 'node:events';
import { createHmac, randomBytes } from 'node:crypto';
import { env } from './env.js';
import { q, one } from './db.js';
import { MM } from './mm.js';
import { t, fmtDate } from './i18n.js';
import { guardSend, questionCapExceeded } from './guard.js';

export type Agent = {
  key: string; name: string; title: string; scope: string;
  mm_user_id: string; mm_token: string; provider: string; delivery_mode: string;
  wake_url: string | null; wake_key: string | null; webhook_url: string | null; webhook_secret: string | null;
  rules: Record<string, any>; hidden: boolean; status: string; last_wake_at: Date | null;
};
export type Human = {
  key: string; mm_user_id: string; first_name: string; name: string; lang: string; timezone: string; is_admin: boolean;
};
export type Question = {
  id: string; agent_key: string; human_key: string; dm_channel_id: string; root_post_id: string | null;
  subject: string; object_type: string | null; object_id: string | null; object_label: string | null; object_url: string | null;
  body: string; choices: string[] | null; deadline: Date | null; status: string;
  answer_choice: string | null; answer_text: string | null; answered_via: string | null; answered_at: Date | null;
  resolution: string | null; propium_action: string | null; resolved_at: Date | null; confidential: boolean; created_at: Date;
  reminded_at: Date | null; escalated_at: Date | null; escalated_to: string | null; escalation_post_id: string | null;
  answered_by: string | null;
};

export class ToolError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const bus = new EventEmitter();
export const admin = () => new MM(env.MM_URL, env.MM_ADMIN_TOKEN);
export const asAgent = (a: Agent) => new MM(env.MM_URL, a.mm_token);
export const permalink = (postId: string) => `${env.MM_PUBLIC_URL}/${env.MM_TEAM}/pl/${postId}`;
export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString('base64url')}`;

export const getAgent = (key: string) => one<Agent>('select * from agents where key=$1', [key]);
export const getHuman = (key: string) => one<Human>('select * from humans where key=$1', [key]);
export const humanByMmId = (id: string) => one<Human>('select * from humans where mm_user_id=$1', [id]);
export const dmChannel = async (agentKey: string, humanKey: string) =>
  (await one<{ dm_channel_id: string }>('select dm_channel_id from access where agent_key=$1 and human_key=$2', [agentKey, humanKey]))?.dm_channel_id ?? null;
export const accessByChannel = (channelId: string) =>
  one<{ agent_key: string; human_key: string }>('select agent_key, human_key from access where dm_channel_id=$1', [channelId]);

export async function audit(actorType: 'agent' | 'human' | 'hub', actor: string, action: string, target?: string, detail?: unknown) {
  await q('insert into audit_log (actor_type, actor, action, target, detail) values ($1,$2,$3,$4,$5)',
    [actorType, actor, action, target ?? null, detail === undefined ? null : JSON.stringify(detail)]);
}

export function sign(...parts: string[]) {
  return createHmac('sha256', env.ACTION_SECRET).update(parts.join('|')).digest('hex').slice(0, 32);
}

// ── Delivery queue ───────────────────────────────────────────────────────────

export function humanRef(h: Human) {
  return { key: h.key, name: h.name, first_name: h.first_name, lang: h.lang, timezone: h.timezone };
}

export async function enqueue(agentKey: string, kind: 'message' | 'answer' | 'alert' | 'ops' | 'approval' | 'task', humanKey: string | null, payload: Record<string, unknown>) {
  const row = await one<{ id: string }>(
    'insert into events (agent_key, kind, human_key, payload) values ($1,$2,$3,$4) returning id',
    [agentKey, kind, humanKey, JSON.stringify(payload)],
  );
  bus.emit('enqueued', agentKey);
  return Number(row!.id);
}

export type PendingEvent = { event_id: number; type: string } & Record<string, unknown>;

/** Pending events for an agent (plus delivered ones never acked after 10 min), marked delivered. */
export async function takePending(agentKey: string, limit = 50): Promise<PendingEvent[]> {
  const rows = await q<{ id: string; kind: string; payload: any }>(
    `update events set status='delivered', delivered_at=now(), attempts=attempts+1
     where id in (
       select id from events where agent_key=$1
         and (status='pending' or (status='delivered' and delivered_at < now() - interval '10 minutes'))
       order by id limit $2 for update skip locked)
     returning id, kind, payload`,
    [agentKey, limit],
  );
  return rows.sort((a, b) => Number(a.id) - Number(b.id)).map((r) => ({ event_id: Number(r.id), type: r.kind, ...r.payload }));
}

export async function ack(agentKey: string, ids: number[]) {
  if (!ids.length) return 0;
  const r = await q(`update events set status='acked', acked_at=now() where agent_key=$1 and id = any($2::bigint[]) and status <> 'acked' returning id`,
    [agentKey, ids]);
  return r.length;
}

/** Ack the events about a given Mattermost post (an agent that replied to it is done with it). */
async function ackByPost(agentKey: string, postId: string) {
  await q(`update events set status='acked', acked_at=now()
           where agent_key=$1 and status <> 'acked' and (payload->>'post_id' = $2 or payload->>'thread_root_id' = $2)`,
    [agentKey, postId]);
}

// ── Posting as an agent ──────────────────────────────────────────────────────

export async function postAs(agent: Agent, channelId: string, message: string, opts: { rootId?: string; props?: any } = {}) {
  try {
    return await asAgent(agent).post('/posts', {
      channel_id: channelId, message, root_id: opts.rootId ?? '', props: opts.props ?? {},
    });
  } catch (e: any) {
    // Refused by the channel rules plugin (read-only channel, paused agent...).
    if (e?.status === 400 && /humanup-agents|rejected by plugin/i.test(e.message)) {
      throw new ToolError(403, 'Blocked by the channel rules');
    }
    throw e;
  }
}

/** The DM post an agent refers to, checked to belong to one of its conversations. */
async function ownPost(agent: Agent, postId: string) {
  let post: any;
  try {
    post = await asAgent(agent).get(`/posts/${postId}`);
  } catch {
    throw new ToolError(404, `Post ${postId} not found`);
  }
  const acc = await accessByChannel(post.channel_id);
  if (!acc || acc.agent_key !== agent.key) throw new ToolError(403, 'That post is not in one of your conversations');
  return { post, humanKey: acc.human_key };
}

export async function reply(agent: Agent, input: { text: string; reply_to_post_id?: string; to?: string }) {
  if (!input.text?.trim()) throw new ToolError(400, 'text is required');
  if (input.reply_to_post_id) {
    const { post, humanKey } = await ownPost(agent, input.reply_to_post_id);
    await guardSend(agent, { initiate: false, human: (await getHuman(humanKey))!, what: 'reply' });
    // Stay where the person wrote: in the thread if they wrote in one, otherwise in the conversation.
    const root = post.root_id || (await isQuestionRoot(post.id) ? post.id : '');
    const created = await postAs(agent, post.channel_id, input.text, { rootId: root || undefined });
    await ackByPost(agent.key, post.id);
    await audit('agent', agent.key, 'reply', humanKey, { post_id: created.id });
    return { post_id: created.id, permalink: permalink(created.id) };
  }
  if (!input.to) throw new ToolError(400, 'Give reply_to_post_id (to answer) or to (to start a message)');
  const human = await getHuman(input.to);
  if (!human) throw new ToolError(404, `Unknown person "${input.to}"`);
  const channel = await dmChannel(agent.key, human.key);
  if (!channel) throw new ToolError(403, `You have no conversation with ${human.key}`);
  await guardSend(agent, { initiate: true, human, what: 'message' });
  const created = await postAs(agent, channel, input.text);
  await audit('agent', agent.key, 'message', human.key, { post_id: created.id });
  return { post_id: created.id, permalink: permalink(created.id) };
}

async function isQuestionRoot(postId: string) {
  return !!(await one('select 1 from questions where root_post_id=$1', [postId]));
}

// ── Questions ────────────────────────────────────────────────────────────────

/**
 * The question card as seen by `human` (their language and time zone).
 * opts.asked: this is the escalation copy shown to someone else on behalf of the person asked.
 * opts.escalatedTo: name shown on the original card once escalated.
 */
export function questionProps(qn: Question, agent: Agent, human: Human, opts: { asked?: Human; escalatedTo?: string } = {}) {
  const lang = human.lang;
  const lines: string[] = [];
  if (opts.asked) {
    lines.push(`⚠️ **${t(lang, 'escalated_copy', { person: opts.asked.first_name, agent: agent.name, date: fmtDate(qn.created_at, lang, human.timezone) })}**`);
  }
  lines.push(qn.body);
  if (qn.object_label) {
    const obj = qn.object_url ? `[${qn.object_label}](${qn.object_url})` : qn.object_label;
    lines.push(`**${t(lang, 'about')}:** ${qn.object_type ? `${t(lang, 'obj_' + qn.object_type)} · ` : ''}${obj}`);
  }
  if (qn.deadline) {
    const late = qn.status === 'open' && qn.deadline.getTime() < Date.now();
    lines.push(`_${t(lang, 'due', { date: fmtDate(qn.deadline, lang, human.timezone) })}${late ? ` · ${t(lang, 'overdue')}` : ''}_`);
  }
  if (opts.escalatedTo && qn.status === 'open') lines.push(`_${t(lang, 'escalated_to', { person: opts.escalatedTo })}_`);
  let color = '#E0A526';
  let actions: any[] | undefined;
  if (qn.status === 'open') {
    const choices = qn.choices?.length ? qn.choices : null;
    if (choices) {
      actions = choices.map((c, i) => ({
        id: `c${i}`, name: c, type: 'button', style: i === 0 ? 'primary' : 'default',
        integration: { url: `${env.HUB_URL_FOR_MM}/mm/actions`, context: { kind: 'answer', qid: qn.id, i, sig: sign('answer', qn.id, String(i)) } },
      }));
      lines.push(`_${t(lang, 'reply_hint')}_`);
    }
  } else if (qn.status === 'answered') {
    color = '#4A90D9';
    lines.push(qn.answer_choice
      ? `**${t(lang, 'answered', { answer: qn.answer_choice, agent: agent.name })}**`
      : `**${t(lang, 'answered_text', { agent: agent.name })}**`);
  } else if (qn.status === 'resolved') {
    color = '#3DB887';
    const ans = qn.answer_choice ? ` · ${qn.answer_choice}` : '';
    lines.push(`✅ **${t(lang, 'resolved')}**${ans}${qn.resolution ? ` · ${qn.resolution}` : ''}`);
  } else {
    color = '#999999';
    lines.push(`_${qn.status}_`);
  }
  return { attachments: [{ color, fallback: `❓ ${qn.subject}`, title: `❓ ${qn.subject}`, text: lines.join('\n'), actions }] };
}

export async function refreshCard(qn: Question) {
  if (!qn.root_post_id) return;
  const [agent, human] = await Promise.all([getAgent(qn.agent_key), getHuman(qn.human_key)]);
  const esc = qn.escalated_to ? await getHuman(qn.escalated_to) : null;
  await asAgent(agent!).put(`/posts/${qn.root_post_id}/patch`, { props: questionProps(qn, agent!, human!, { escalatedTo: esc?.first_name }) });
  if (esc && qn.escalation_post_id) {
    await asAgent(agent!).put(`/posts/${qn.escalation_post_id}/patch`, { props: questionProps(qn, agent!, esc, { asked: human! }) });
  }
}

export const getQuestion = (id: string) => one<Question>('select * from questions where id=$1', [id]);

export async function askHuman(agent: Agent, input: {
  to: string; subject: string; question: string; choices?: string[]; deadline?: string;
  object?: { type?: string; id?: string; label: string; url?: string };
}) {
  const human = await getHuman(input.to);
  if (!human) throw new ToolError(404, `Unknown person "${input.to}"`);
  const channel = await dmChannel(agent.key, human.key);
  if (!channel) throw new ToolError(403, `You have no conversation with ${human.key}`);
  await guardSend(agent, { initiate: true, human, what: 'question' });
  if (input.choices && (input.choices.length < 2 || input.choices.length > 4)) throw new ToolError(400, 'choices: 2 to 4 options');
  const cap = Number(agent.rules.daily_question_cap_per_person ?? 10);
  const today = await one<{ n: string }>(
    `select count(*) n from questions where agent_key=$1 and human_key=$2
       and (created_at at time zone $3)::date = (now() at time zone $3)::date`,
    [agent.key, human.key, human.timezone]);
  if (Number(today!.n) >= cap) {
    await questionCapExceeded(agent, human, cap, { subject: input.subject, question: input.question });
    throw new ToolError(429, `Daily cap reached: ${cap} questions to ${human.key} today. Not posted; Inès has been told.`);
  }
  const deadline = input.deadline ? new Date(input.deadline) : new Date(Date.now() + 24 * 3600_000);
  if (Number.isNaN(deadline.getTime())) throw new ToolError(400, 'deadline must be an ISO date');
  const id = newId('q');
  await q(
    `insert into questions (id, agent_key, human_key, dm_channel_id, subject, object_type, object_id, object_label, object_url,
       body, choices, deadline, confidential)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [id, agent.key, human.key, channel, input.subject, input.object?.type ?? null, input.object?.id ?? null,
      input.object?.label ?? null, input.object?.url ?? null, input.question,
      input.choices ? JSON.stringify(input.choices) : null, deadline, agent.rules.registry === 'admin-only'],
  );
  const qn = (await getQuestion(id))!;
  // The card carries everything; the empty message avoids showing the subject twice (push uses the fallback).
  const post = await postAs(agent, channel, '', { props: questionProps(qn, agent, human) });
  await q('update questions set root_post_id=$2 where id=$1', [id, post.id]);
  await audit('agent', agent.key, 'question.ask', human.key, { question_id: id, subject: input.subject });
  return { question_id: id, post_id: post.id, permalink: permalink(post.id), deadline: deadline.toISOString() };
}

/** A person answered (button or free text in the thread). */
export async function answerQuestion(qn: Question, human: Human, answer: { choice?: string; text?: string; via: 'button' | 'thread' | 'escalation'; post_id?: string }) {
  const updated = await one<Question>(
    `update questions set status='answered', answer_choice=$2, answer_text=$3, answered_via=$4, answered_at=now(), answered_by=$5
     where id=$1 and status='open' returning *`,
    [qn.id, answer.choice ?? null, answer.text ?? null, answer.via, human.key]);
  if (!updated) return null;
  await enqueue(qn.agent_key, 'answer', human.key, {
    question_id: qn.id, from: humanRef(human), on_behalf_of: human.key !== qn.human_key ? qn.human_key : undefined, choice: answer.choice ?? null, text: answer.text ?? null,
    post_id: answer.post_id ?? qn.root_post_id, thread_root_id: qn.root_post_id,
    question: { subject: qn.subject, body: qn.body, choices: qn.choices, object: qn.object_label ? {
      type: qn.object_type, id: qn.object_id, label: qn.object_label, url: qn.object_url } : null },
  });
  await audit('human', human.key, 'question.answer', qn.id, { choice: answer.choice, via: answer.via });
  return updated;
}

export async function resolveQuestion(agent: Agent, input: { question_id: string; confirmation?: string; propium_action?: string }) {
  const qn = await getQuestion(input.question_id);
  if (!qn || qn.agent_key !== agent.key) throw new ToolError(404, 'Question not found');
  if (qn.status === 'resolved') return { status: 'resolved' };
  const updated = (await one<Question>(
    `update questions set status='resolved', resolution=$2, propium_action=$3, resolved_at=now() where id=$1 returning *`,
    [qn.id, input.confirmation ?? null, input.propium_action ?? null]))!;
  if (input.confirmation && qn.root_post_id) await postAs(agent, qn.dm_channel_id, input.confirmation, { rootId: qn.root_post_id });
  await refreshCard(updated);
  await q(`update events set status='acked', acked_at=now() where agent_key=$1 and payload->>'question_id'=$2 and status<>'acked'`, [agent.key, qn.id]);
  await audit('agent', agent.key, 'question.resolve', qn.human_key, { question_id: qn.id, propium_action: input.propium_action });
  return { status: 'resolved' };
}

// ── Redirect to another agent ────────────────────────────────────────────────

export async function redirectToAgent(agent: Agent, input: { reply_to_post_id: string; to_agent: string; reason?: string }) {
  const { post, humanKey } = await ownPost(agent, input.reply_to_post_id);
  const target = await getAgent(input.to_agent);
  if (!target || target.hidden) throw new ToolError(404, `Unknown agent "${input.to_agent}"`);
  if (target.key === agent.key) throw new ToolError(400, 'That is you');
  const human = (await getHuman(humanKey))!;
  await guardSend(agent, { initiate: false, human, what: 'redirect' });
  if (!(await dmChannel(target.key, human.key))) throw new ToolError(403, `${human.key} has no conversation with ${target.key}`);
  const id = newId('r');
  await q(`insert into redirects (id, from_agent, to_agent, human_key, original_post_id, original_text, reason) values ($1,$2,$3,$4,$5,$6,$7)`,
    [id, agent.key, target.key, human.key, post.id, post.message, input.reason ?? null]);
  const offer = await postAs(agent, post.channel_id, t(human.lang, 'redirect', { agent: target.name, title: target.title }), {
    rootId: post.root_id || undefined,
    props: { attachments: [{ actions: [{
      id: 'fwd', name: t(human.lang, 'forward', { agent: target.name }), type: 'button', style: 'primary',
      integration: { url: `${env.HUB_URL_FOR_MM}/mm/actions`, context: { kind: 'forward', rid: id, sig: sign('forward', id) } },
    }] }] },
  });
  await q('update redirects set offer_post_id=$2 where id=$1', [id, offer.id]);
  await ackByPost(agent.key, post.id);
  await audit('agent', agent.key, 'redirect', human.key, { to_agent: target.key, redirect_id: id });
  return { redirect_id: id, post_id: offer.id };
}

export async function forwardRedirect(redirectId: string, human: Human) {
  const r = await one<any>('select * from redirects where id=$1', [redirectId]);
  if (!r || r.human_key !== human.key) throw new ToolError(403, 'not_yours');
  const [from, target] = await Promise.all([getAgent(r.from_agent), getAgent(r.to_agent)]);
  if (!r.forwarded_at) {
    const channel = (await dmChannel(target!.key, human.key))!;
    const quoted = r.original_text.split('\n').map((l: string) => `> ${l}`).join('\n');
    const fwd = await postAs(target!, channel, `↪ ${t(human.lang, 'forwarded_from', { agent: from!.name })}\n${quoted}`);
    await q('update redirects set forwarded_at=now() where id=$1', [r.id]);
    await enqueue(target!.key, 'message', human.key, {
      from: humanRef(human), text: r.original_text, post_id: fwd.id, thread_root_id: null,
      forwarded_from: from!.key, created_at: new Date().toISOString(),
    });
    await audit('human', human.key, 'redirect.forward', target!.key, { redirect_id: r.id, from: from!.key });
  }
  return { from: from!, target: target! };
}

// ── Messages from people ─────────────────────────────────────────────────────

/** A person wrote in their DM with an agent. */
export async function onHumanPost(agentKey: string, human: Human, post: any) {
  const agent = await getAgent(agentKey);
  if (!agent) return;
  if (agent.status !== 'active') {
    // Kill switch: the message waits in the queue; tell the person.
    await admin().post('/posts/ephemeral', { user_id: human.mm_user_id, post: { channel_id: post.channel_id,
      message: t(human.lang, 'paused', { agent: agent.name }) } }).catch(() => {});
  }
  if (post.root_id) {
    const qn = await one<Question>('select * from questions where root_post_id=$1', [post.root_id]);
    if (qn && qn.status === 'open') {
      const updated = await answerQuestion(qn, human, { text: post.message, via: 'thread', post_id: post.id });
      if (updated) await refreshCard(updated);
      return;
    }
  }
  await enqueue(agent.key, 'message', human.key, {
    from: humanRef(human), text: post.message, post_id: post.id, thread_root_id: post.root_id || null,
    files: (post.file_ids ?? []).length || undefined, created_at: new Date(post.create_at).toISOString(),
  });
  await audit('human', human.key, 'message', agent.key, { post_id: post.id });
}
