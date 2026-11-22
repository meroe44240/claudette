// Hands queued events to agents, by delivery mode:
//   doorbell    → POST a small wake to the agent's routine URL (Grok Bot); the agent then pulls (MCP or REST).
//   webhook     → POST the events, signed X-Hub-Signature: t=<unix>,v1=<hex hmac-sha256(secret, "<t>.<body>")>.
//                 The response may carry replies: {"replies":[{"reply_to_post_id":"...","text":"..."}]}
//   poll        → nothing to push; the agent calls get_pending_messages when it runs.
//   claude-test → the built-in Claude adapter handles the events.

import { createHmac } from 'node:crypto';
import { env } from './env.js';
import { q } from './db.js';
import { bus, getAgent, type Agent, takePending, reply, audit } from './core.js';
import { runClaudeAgent } from './claude.js';

const busy = new Set<string>();
const WAKE_COOLDOWN_MS = 15_000;
const REWAKE_AFTER_MS = 120_000;

export function startDelivery() {
  bus.on('enqueued', (agentKey: string) => void kick(agentKey));
  // Retries, re-wakes for agents that did not come and pull, delivery after a restart.
  setInterval(() => void tick().catch((e) => console.error('[delivery] tick', e)), 20_000);
  void tick();
}

async function tick() {
  const rows = await q<{ agent_key: string }>(
    `select distinct agent_key from events where status='pending' and next_attempt_at <= now()`);
  for (const r of rows) await kick(r.agent_key);
}

async function kick(agentKey: string) {
  if (busy.has(agentKey)) return;
  busy.add(agentKey);
  try {
    const agent = await getAgent(agentKey);
    if (!agent || agent.status !== 'active') return;
    switch (agent.delivery_mode) {
      case 'doorbell': return await doorbell(agent);
      case 'webhook': return await webhook(agent);
      case 'claude-test': return await runClaudeAgent(agent);
      default: return; // poll
    }
  } catch (e) {
    console.error(`[delivery] ${agentKey}`, e);
  } finally {
    busy.delete(agentKey);
  }
}

async function backoff(agentKey: string, error: string) {
  await q(`update events set attempts=attempts+1, last_error=$2,
             next_attempt_at = now() + least(interval '1 hour', interval '30 seconds' * power(2, least(attempts, 7)))
           where agent_key=$1 and status='pending'`, [agentKey, error.slice(0, 500)]);
}

async function doorbell(agent: Agent) {
  if (!agent.wake_url) return; // no routine configured: behaves like poll
  const pending = await q<{ n: string; oldest: Date }>(
    `select count(*) n, min(created_at) oldest from events where agent_key=$1 and status='pending' and next_attempt_at <= now()`,
    [agent.key]);
  const n = Number(pending[0].n);
  if (!n) return;
  const since = agent.last_wake_at ? Date.now() - agent.last_wake_at.getTime() : Infinity;
  // One wake per burst; ring again only if the agent did not come and pull.
  if (since < WAKE_COOLDOWN_MS) return;
  if (since < REWAKE_AFTER_MS && pending[0].oldest.getTime() < agent.last_wake_at!.getTime()) return;
  const body = JSON.stringify({
    event: 'pending_messages', agent: agent.key, count: n,
    instructions: 'Call get_pending_messages on the Humanup Chat MCP server, handle every event, reply with reply / ask_human / redirect_to_agent.',
    mcp_url: `${env.HUB_PUBLIC_URL}/mcp`, rest_url: `${env.HUB_PUBLIC_URL}/v1/agents/me/pending`,
  });
  try {
    const res = await fetch(agent.wake_url, {
      method: 'POST', body, signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json', ...(agent.wake_key ? { Authorization: `Bearer ${agent.wake_key}` } : {}) },
    });
    await q('update agents set last_wake_at=now() where key=$1', [agent.key]);
    if (!res.ok) {
      await backoff(agent.key, `wake HTTP ${res.status}`);
      await audit('hub', 'delivery', 'wake.failed', agent.key, { status: res.status });
    } else {
      await audit('hub', 'delivery', 'wake', agent.key, { count: n });
    }
  } catch (e: any) {
    await backoff(agent.key, `wake error: ${e.message}`);
  }
}

export function signBody(secret: string, body: string, ts = Math.floor(Date.now() / 1000)) {
  return `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;
}

async function webhook(agent: Agent) {
  if (!agent.webhook_url || !agent.webhook_secret) return;
  const events = await takePending(agent.key, 20);
  if (!events.length) return;
  const body = JSON.stringify({ agent: agent.key, events });
  try {
    const res = await fetch(agent.webhook_url, {
      method: 'POST', body, signal: AbortSignal.timeout(60_000),
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature': signBody(agent.webhook_secret, body) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ids = events.map((e) => e.event_id);
    await q(`update events set status='acked', acked_at=now() where id = any($1::bigint[])`, [ids]);
    const data: any = await res.json().catch(() => null);
    for (const r of data?.replies ?? []) {
      try {
        await reply(agent, r);
      } catch (e: any) {
        await audit('hub', 'delivery', 'webhook.reply_failed', agent.key, { error: e.message });
      }
    }
  } catch (e: any) {
    // Put them back in the queue with a delay.
    await q(`update events set status='pending', delivered_at=null where id = any($1::bigint[])`, [events.map((e) => e.event_id)]);
    await backoff(agent.key, `webhook: ${e.message}`);
  }
}
