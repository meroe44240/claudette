// Coordination channels, invisible to the team:
//   #agents-ops    every visible agent (cross-domain coordination, supervision)
//   #d-<domain>    the agents of one domain + Méroë (and the activity feed)
// Agents post through the Hub; an @mention hands the message to the agents named (members of that channel only).

import { q } from './db.js';
import { type Agent, ToolError, admin, postAs, audit, enqueue, permalink } from './core.js';
import { channelId, guardSend, guardLoop, systemBot } from './guard.js';

export function mentionedKeys(text: string): string[] {
  return [...new Set([...text.matchAll(/@([a-z][a-z0-9._-]{1,21})/g)].map((m) => m[1]))];
}

async function botIds() {
  const agents = new Set((await q<{ mm_user_id: string }>('select mm_user_id from agents')).map((r) => r.mm_user_id));
  const system = new Set<string>();
  for (const b of ['humanup', 'propium'] as const) {
    const bot = await systemBot(b);
    if (bot) system.add(bot.user_id);
  }
  return { agents, system };
}

/** Channel name → which agents belong to it ('agents-ops' or 'd-<domain>'). */
async function membersOf(channel: string): Promise<string[]> {
  if (channel === 'agents-ops') return (await q<{ key: string }>('select key from agents where not hidden')).map((r) => r.key);
  const domain = channel.replace(/^d-/, '');
  return (await q<{ key: string }>(`select key from agents where not hidden and rules->>'domain' = $1`, [domain])).map((r) => r.key);
}

/** The coordination channel a Mattermost channel id is, if any. */
export async function coordinationChannel(id: string): Promise<string | null> {
  if (id === (await channelId('agents-ops'))) return 'agents-ops';
  const domains = await q<{ d: string }>(`select distinct rules->>'domain' as d from agents where rules ? 'domain'`);
  for (const { d } of domains) if (id === (await channelId(`d-${d}`))) return `d-${d}`;
  return null;
}

/** Hands a coordination message to the agents it mentions (members of that channel only). */
export async function deliverMentions(channel: string, text: string, from: { agent?: string; human?: string }, postId: string,
  rootId: string | null, only?: string) {
  const members = new Set(await membersOf(channel));
  const keys = mentionedKeys(text).filter((k) => k !== from.agent && members.has(k) && (!only || k === only));
  for (const k of keys) {
    await enqueue(k, 'ops', from.human ?? null, {
      from_agent: from.agent ?? null, from_human: from.human ?? null, text, post_id: postId, thread_root_id: rootId,
      channel, permalink: permalink(postId),
    });
  }
  return keys;
}

async function postIn(agent: Agent, channel: string, input: { text: string; reply_to_post_id?: string }) {
  if (agent.hidden) throw new ToolError(403, 'Private agents have no coordination channel');
  if (!(await membersOf(channel)).includes(agent.key)) throw new ToolError(403, `You are not in #${channel}`);
  const chId = await channelId(channel);
  if (!chId) throw new ToolError(500, `#${channel} not found`);
  let rootId: string | null = null;
  if (input.reply_to_post_id) {
    const p = await admin().get(`/posts/${input.reply_to_post_id}`).catch(() => null);
    if (!p || p.channel_id !== chId) throw new ToolError(404, `That post is not in #${channel}`);
    rootId = p.root_id || p.id;
  }
  await guardSend(agent, { initiate: false, what: channel });
  const ids = await botIds();
  await guardLoop(agent, chId, rootId, ids.agents, ids.system);
  const post = await postAs(agent, chId, input.text, { rootId: rootId ?? undefined });
  await audit('agent', agent.key, 'ops.post', channel, { post_id: post.id });
  const notified = await deliverMentions(channel, input.text, { agent: agent.key }, post.id, rootId);
  return { post_id: post.id, channel, notified };
}

export const postInOps = (agent: Agent, input: { text: string; reply_to_post_id?: string }) => postIn(agent, 'agents-ops', input);

export function postInDomain(agent: Agent, input: { text: string; reply_to_post_id?: string }) {
  const domain = agent.rules.domain as string | undefined;
  if (!domain) throw new ToolError(403, 'You have no domain channel');
  return postIn(agent, `d-${domain}`, input);
}
