// #agents-ops: coordination between agents (and supervision), invisible to the team.
// Agents post through the Hub; an @mention hands the message to the agents named.

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

/** Hands an #agents-ops message to the agents it mentions. */
export async function deliverMentions(text: string, from: { agent?: string; human?: string }, postId: string, rootId: string | null,
  only?: string) {
  const keys = mentionedKeys(text).filter((k) => k !== from.agent && (!only || k === only));
  if (!keys.length) return [];
  const targets = await q<{ key: string }>(`select key from agents where key = any($1) and not hidden`, [keys]);
  for (const t of targets) {
    await enqueue(t.key, 'ops', from.human ?? null, {
      from_agent: from.agent ?? null, from_human: from.human ?? null, text, post_id: postId, thread_root_id: rootId,
      channel: 'agents-ops', permalink: permalink(postId),
    });
  }
  return targets.map((t) => t.key);
}

export async function postInOps(agent: Agent, input: { text: string; reply_to_post_id?: string }) {
  if (agent.hidden) throw new ToolError(403, 'Private agents do not use #agents-ops');
  const ops = await channelId('agents-ops');
  if (!ops) throw new ToolError(500, '#agents-ops not found');
  let rootId: string | null = null;
  if (input.reply_to_post_id) {
    const p = await admin().get(`/posts/${input.reply_to_post_id}`).catch(() => null);
    if (!p || p.channel_id !== ops) throw new ToolError(404, 'That post is not in #agents-ops');
    rootId = p.root_id || p.id;
  }
  await guardSend(agent, { initiate: false, what: 'ops' });
  const ids = await botIds();
  await guardLoop(agent, ops, rootId, ids.agents, ids.system);
  const post = await postAs(agent, ops, input.text, { rootId: rootId ?? undefined });
  await audit('agent', agent.key, 'ops.post', 'agents-ops', { post_id: post.id });
  const notified = await deliverMentions(input.text, { agent: agent.key }, post.id, rootId);
  return { post_id: post.id, notified };
}
