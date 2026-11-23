// Listens to Mattermost with each agent's bot account and hands what people write to the Hub.

import WebSocket from 'ws';
import { env } from './env.js';
import { q } from './db.js';
import { accessByChannel, humanByMmId, onHumanPost } from './core.js';
import { coordinationChannel, deliverMentions, mentionedKeys } from './ops.js';

const sockets = new Map<string, WebSocket>();

export async function startListeners() {
  const agents = await q<{ key: string; mm_token: string; mm_user_id: string }>(
    `select key, mm_token, mm_user_id from agents where key in (select agent_key from access)`);
  for (const a of agents) connect(a);
}

export function stopListeners() {
  for (const ws of sockets.values()) ws.removeAllListeners().close();
  sockets.clear();
}

function connect(a: { key: string; mm_token: string; mm_user_id: string }, delay = 0) {
  setTimeout(() => {
    const url = env.MM_URL.replace(/^http/, 'ws') + '/api/v4/websocket';
    const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${a.mm_token}` } });
    sockets.set(a.key, ws);
    let alive = true;
    const ping = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 30_000);
    ws.on('pong', () => (alive = true));
    ws.on('open', () => ws.send(JSON.stringify({ seq: 1, action: 'authentication_challenge', data: { token: a.mm_token } })));
    ws.on('message', (raw) => void handle(a, raw.toString()).catch((e) => console.error(`[listener] ${a.key}`, e)));
    ws.on('close', () => {
      clearInterval(ping);
      if (sockets.get(a.key) === ws) connect(a, 5_000);
    });
    ws.on('error', (e) => console.error(`[listener] ${a.key} socket: ${e.message}`));
  }, delay);
}

async function handle(a: { key: string; mm_user_id: string }, raw: string) {
  const msg = JSON.parse(raw);
  if (msg.event !== 'posted') return;
  const post = JSON.parse(msg.data.post);
  if (post.user_id === a.mm_user_id || (post.type && post.type !== '')) return;
  if (msg.data.channel_type === 'P') {
    // A person in #agents-ops or a domain channel: each mentioned agent's listener hands it over once.
    if (!mentionedKeys(post.message).includes(a.key)) return;
    const channel = await coordinationChannel(post.channel_id);
    const person = channel ? await humanByMmId(post.user_id) : null;
    if (!channel || !person) return;
    await deliverMentions(channel, post.message, { human: person.key }, post.id, post.root_id || null, a.key);
    return;
  }
  if (msg.data.channel_type !== 'D') return;
  const acc = await accessByChannel(post.channel_id);
  if (!acc || acc.agent_key !== a.key) return;
  const human = await humanByMmId(post.user_id);
  if (!human || human.key !== acc.human_key) return;
  await onHumanPost(a.key, human, post);
}
