// End-to-end test against a running Mattermost + Hub, acting as real people (Léa) and agents.
// Expects agents.secrets.json with: khoa, theo, maya = poll; hugo = webhook (http://localhost:3199/hook, secret "test-secret");
// nathan = doorbell (http://localhost:3199/wake, key "test-wake-key"); linh = claude-test (optional, needs ANTHROPIC_API_KEY).
//   MM_URL=http://localhost:8065 HUB=http://localhost:3100 npx tsx test/e2e.ts

import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MM } from '../src/mm.js';
import { env } from '../src/env.js';
import { pool } from '../src/db.js';
import { inWindow, TEAM_TZ } from '../src/guard.js';
import { sign } from '../src/core.js';
import { localParts, zonedTime } from '../src/time.js';

const HUB = process.env.HUB ?? 'http://localhost:3100';
const seed = JSON.parse(readFileSync(join(env.SECRETS_DIR, 'seed-secrets.json'), 'utf8'));
const keys = JSON.parse(readFileSync(join(env.SECRETS_DIR, 'agent-keys.json'), 'utf8'));
const adminToken = readFileSync(join(env.SECRETS_DIR, 'hub-admin-token'), 'utf8').trim();

let failures = 0;
function check(ok: unknown, what: string, extra?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && extra !== undefined ? `  → ${JSON.stringify(extra).slice(0, 300)}` : ''}`);
  if (!ok) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, ms = 15_000, every = 400): Promise<T | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn().catch(() => null);
    if (v) return v as T;
    await sleep(every);
  }
  return null;
}

async function login(user: string) {
  const res = await fetch(`${env.MM_URL}/api/v4/users/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_id: user, password: seed.initial_passwords[user] }),
  });
  if (!res.ok) throw new Error(`login ${user}: ${res.status}`);
  const me = await res.json();
  return { mm: new MM(env.MM_URL, res.headers.get('token')!), id: me.id as string };
}

async function tool(agent: string, name: string, input: unknown = {}) {
  const res = await fetch(`${HUB}/v1/tools/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys[agent]}` },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body as any };
}

async function pending(agent: string) {
  const res = await fetch(`${HUB}/v1/agents/me/pending`, { headers: { Authorization: `Bearer ${keys[agent]}` } });
  return (((await res.json()) as any).events ?? []) as any[]; // a paused agent gets an error, i.e. nothing
}

async function main() {
  const lea = await login('lea');
  const teamId = (await lea.mm.get('/teams/name/humanup')).id as string;
  const dm = async (agent: string) => (await lea.mm.post('/channels/direct', [lea.id, seed.bots[agent].user_id])).id as string;
  const say = async (agent: string, message: string, root_id = '') =>
    lea.mm.post('/posts', { channel_id: await dm(agent), message, root_id });
  const lastPostBy = async (agent: string, channel: string) => {
    const r = await lea.mm.get(`/channels/${channel}/posts?per_page=20`);
    return (r.order as string[]).map((id) => r.posts[id]).find((p: any) => p.user_id === seed.bots[agent].user_id) ?? null;
  };
  // Test database only: make earlier runs of today count as yesterday (daily caps, once-a-day alerts), resume everyone.
  await pool.query(`update questions set created_at = created_at - interval '2 days' where created_at > now() - interval '2 days'`);
  await pool.query(`update audit_log set ts = ts - interval '2 days' where ts > now() - interval '2 days'`);
  await pool.query(`delete from kv where key like 'alert:%'`);
  await pool.query(`update questions set status='cancelled' where status='open'`);
  await pool.query(`delete from reports`);
  await pool.query(`update scheduled_messages set status='cancelled' where status='pending'`);
  await fetch(`${HUB}/v1/admin/agents/all/resume`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } });
  for (const a of ['khoa', 'theo', 'maya', 'hugo', 'nathan', 'ines', 'awa', 'bastien', 'antoine', 'victor']) await pending(a); // drain leftovers from earlier runs

  // Local endpoint standing in for agents' webhook / wake URLs
  const wakes: any[] = [];
  const srv = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.url === '/wake') {
        wakes.push({ auth: req.headers.authorization, body: JSON.parse(body) });
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"success":true}');
        return;
      }
      const sig = String(req.headers['x-hub-signature'] ?? '');
      const [, ts, v1] = sig.match(/^t=(\d+),v1=([0-9a-f]+)$/) ?? [];
      const expected = createHmac('sha256', 'test-secret').update(`${ts}.${body}`).digest('hex');
      if (v1 !== expected) {
        res.writeHead(401).end();
        return;
      }
      const data = JSON.parse(body);
      const replies = data.events.filter((e: any) => e.type === 'message')
        .map((e: any) => ({ reply_to_post_id: e.post_id, text: `Hugo here (webhook). Got: ${e.text}` }));
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ replies }));
    });
  });
  await new Promise<void>((r) => srv.listen(3199, r));

  // 1. A person writes to an agent; the agent pulls it (poll mode)
  const p1 = await say('khoa', 'Bonjour Khoa, peux-tu vérifier la fiche de Anh Tran ?');
  const ev1 = await waitFor(async () => (await pending('khoa')).find((e) => e.post_id === p1.id));
  check(ev1 && ev1.from?.key === 'lea' && ev1.from?.lang === 'fr' && ev1.type === 'message', 'poll: Khoa receives Léa\'s message with her language', ev1);

  // 2. Reply in the conversation (not in a thread), event acked
  const r2 = await tool('khoa', 'reply', { reply_to_post_id: p1.id, text: 'Je regarde la fiche tout de suite.' });
  const post2 = r2.body.post_id ? await lea.mm.get(`/posts/${r2.body.post_id}`) : null;
  check(r2.status === 200 && post2 && post2.root_id === '' && post2.user_id === seed.bots.khoa.user_id, 'reply: posted as Khoa in the conversation', r2);
  check((await pending('khoa')).every((e) => e.post_id !== p1.id), 'reply acks the event');

  // 3. Question card with Yes / No
  const ask = await tool('khoa', 'ask_human', {
    to: 'lea', subject: 'Email for Anh Tran', question: 'Is anh.tran@bnp.com her current work email?',
    choices: ['Yes', 'No'], object: { type: 'candidate', label: 'Anh Tran', url: 'https://ats.propium.co/candidats/test' },
  });
  const card = ask.body.post_id ? await lea.mm.get(`/posts/${ask.body.post_id}`) : null;
  const actions = card?.props?.attachments?.[0]?.actions ?? [];
  check(ask.status === 200 && actions.length === 2 && actions[0].name === 'Yes', 'ask_human: card with 2 buttons', ask.body);
  check(/Anh Tran/.test(card?.props?.attachments?.[0]?.text ?? ''), 'card shows the Propium object');

  // 4. /inbox lists it
  const inbox1 = await lea.mm.post('/commands/execute', { channel_id: await dm('khoa'), command: '/inbox', team_id: teamId });
  check((inbox1.text ?? '').includes(ask.body.post_id), '/inbox lists the open question', inbox1.text);

  // 5. One click on Yes (through Mattermost, which calls the Hub)
  await lea.mm.post(`/posts/${ask.body.post_id}/actions/${actions[0].id}`, {});
  const ev5 = await waitFor(async () => (await pending('khoa')).find((e) => e.type === 'answer' && e.question_id === ask.body.question_id));
  check(ev5?.choice === 'Yes', 'button click → Khoa gets the answer "Yes"', ev5);
  const card5 = await lea.mm.get(`/posts/${ask.body.post_id}`);
  check(!card5.props.attachments[0].actions?.length && /Khoa/.test(card5.props.attachments[0].text), 'card shows the answer, buttons gone');

  // 6. Resolve: confirmation in the thread, card resolved, inbox empty
  const res6 = await tool('khoa', 'resolve_question', {
    question_id: ask.body.question_id, confirmation: 'C\'est noté, email mis à jour dans Propium.', propium_action: 'Updated Anh Tran work email',
  });
  const thread6 = await lea.mm.get(`/posts/${ask.body.post_id}/thread`);
  const card6 = await lea.mm.get(`/posts/${ask.body.post_id}`);
  check(res6.status === 200 && Object.keys(thread6.posts).length === 2, 'resolve: one-line confirmation in the thread');
  check(/✅/.test(card6.props.attachments[0].text), 'card turns to resolved');
  const inbox6 = await lea.mm.post('/commands/execute', { channel_id: await dm('khoa'), command: '/inbox', team_id: teamId });
  check(!(inbox6.text ?? '').includes(ask.body.post_id), '/inbox no longer lists it', inbox6.text);

  // 7. Free-text answer in the thread
  const ask7 = await tool('khoa', 'ask_human', { to: 'lea', subject: 'Current company', question: 'Where does Anh Tran work now?' });
  await say('khoa', 'Chez Techcombank depuis septembre.', ask7.body.post_id);
  const ev7 = await waitFor(async () => (await pending('khoa')).find((e) => e.type === 'answer' && e.question_id === ask7.body.question_id));
  check(ev7?.text === 'Chez Techcombank depuis septembre.', 'free-text answer in the thread → answer event', ev7);

  // 8. Out of scope → redirect → one click forwards to Théo
  const p8 = await say('khoa', 'C\'est quoi ma commission ce mois-ci ?');
  await waitFor(async () => (await pending('khoa')).find((e) => e.post_id === p8.id));
  const red = await tool('khoa', 'redirect_to_agent', { reply_to_post_id: p8.id, to_agent: 'theo', reason: 'Commissions' });
  const offer = red.body.post_id ? await lea.mm.get(`/posts/${red.body.post_id}`) : null;
  check(red.status === 200 && /Théo/.test(offer?.message ?? ''), 'redirect: one line naming Théo', red.body);
  await lea.mm.post(`/posts/${red.body.post_id}/actions/fwd`, {});
  const ev8 = await waitFor(async () => (await pending('theo')).find((e) => e.forwarded_from === 'khoa'));
  check(ev8?.text === 'C\'est quoi ma commission ce mois-ci ?', 'forward button → Théo receives the question', ev8);
  const fwdPost = ev8 ? await lea.mm.get(`/posts/${ev8.post_id}`) : null;
  check(fwdPost?.user_id === seed.bots.theo.user_id && /Khoa/.test(fwdPost?.message ?? ''), 'quoted in Léa\'s conversation with Théo');

  // 9. Rules: who an agent may write to
  const r9a = await tool('khoa', 'ask_human', { to: 'meroe', subject: 'x', question: 'y' });
  check(r9a.status === 403, 'Khoa cannot ask Méroë (recipients: recruiters and sales)', r9a);
  const r9b = await tool('maya', 'reply', { to: 'meroe', text: 'hello' });
  check(r9b.status === 403, 'Maya cannot write to Méroë on her own', r9b);
  const r9c = await tool('camille', 'reply', { to: 'lea', text: 'hello' });
  check(r9c.status === 403, 'Camille (private) has no conversation with Léa', r9c);
  const r9d = await fetch(`${HUB}/v1/tools/reply`, { method: 'POST', headers: { Authorization: 'Bearer hub_fake' } });
  check(r9d.status === 401, 'unknown agent key refused');

  // 10. Registry
  const reg = await fetch(`${HUB}/v1/registry`, { headers: { Authorization: `Bearer ${keys.ines}` } });
  const regBody: any = await reg.json();
  const row = regBody.questions?.find((x: any) => x.id === ask.body.question_id);
  check(reg.status === 200 && row?.status === 'resolved' && row?.answer_choice === 'Yes' && row?.propium_action,
    'registry (Inès): question with answer, delay and Propium action', row);
  const regTheo = await fetch(`${HUB}/v1/registry`, { headers: { Authorization: `Bearer ${keys.theo}` } });
  check(regTheo.status === 403, 'registry refused to other agents');
  const csv = await fetch(`${HUB}/v1/registry?format=csv`, { headers: { Authorization: `Bearer ${adminToken}` } });
  check(csv.ok && (await csv.text()).startsWith('id,agent,'), 'registry CSV export (admin)');

  // 11. MCP: same tools
  const mcp = new Client({ name: 'e2e', version: '1.0.0' });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(`${HUB}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${keys.nathan}` } },
  }));
  const listed = await mcp.listTools();
  check(listed.tools.some((t) => t.name === 'ask_human') && !listed.tools.some((t) => t.name === 'query_registry'),
    'MCP: tools listed (no registry for Nathan)');
  const dir: any = await mcp.callTool({ name: 'list_agents', arguments: {} });
  check(/"linh"/.test(dir.content?.[0]?.text ?? '') && !/"camille"/.test(dir.content?.[0]?.text ?? ''), 'MCP: directory without private agents');

  // 12. Doorbell (Nathan): wake with the routine key, then pull over MCP
  const p12 = await say('nathan', 'Nathan, on a un RDV avec Acme jeudi, tu peux préparer un brief ?');
  const wake = await waitFor(async () => wakes.find((w) => w.body.agent === 'nathan'));
  check(wake?.auth === 'Bearer test-wake-key' && wake?.body.count >= 1, 'doorbell: routine woken with its key', wake);
  const pulled: any = await mcp.callTool({ name: 'get_pending_messages', arguments: {} });
  check((pulled.content?.[0]?.text ?? '').includes(p12.id), 'doorbell: Nathan pulls the message over MCP');
  await mcp.close();

  // 13. Webhook (Hugo): signed push, reply in the HTTP response
  const p13 = await say('hugo', 'Hugo, un post LinkedIn sur notre placement de la semaine ?');
  const hugoReply = await waitFor(async () => {
    const p = await lastPostBy('hugo', p13.channel_id);
    return p && p.create_at > p13.create_at ? p : null;
  });
  check(/webhook/.test(hugoReply?.message ?? ''), 'webhook: signed push, Hugo\'s reply posted', hugoReply?.message);

  // 14. Claude test adapter (Linh)
  if (process.env.ANTHROPIC_API_KEY) {
    const p14 = await say('linh', 'Linh, la candidature de Anh Tran pour le poste CFO chez BNP est en "Entretien client" mais le client a refusé hier. Je la passe en quel stage ?');
    const linh1 = await waitFor(async () => {
      const p = await lastPostBy('linh', p14.channel_id);
      return p && p.create_at > p14.create_at ? p : null;
    }, 120_000, 2000);
    check(!!linh1, 'Claude test agent (Linh) answers an in-scope question', linh1?.message);
    console.log(`      Linh: ${linh1?.message ?? linh1?.props?.attachments?.[0]?.title}`);
    const p15 = await say('linh', 'Linh, combien je vais toucher de prime ce trimestre ?');
    const linh2 = await waitFor(async () => {
      const p = await lastPostBy('linh', p15.channel_id);
      return p && p.create_at > p15.create_at ? p : null;
    }, 120_000, 2000);
    const fwd = linh2?.props?.attachments?.[0]?.actions?.[0];
    check(fwd?.id === 'fwd' && /Théo/.test(linh2?.message ?? ''), 'out of scope: Linh redirects to Théo with a forward button', linh2?.message);
    console.log(`      Linh: ${linh2?.message}`);
  } else {
    console.log('SKIP  Claude test agent (no ANTHROPIC_API_KEY)');
  }

  // ── Phase 3: guardrails ───────────────────────────────────────────────────
  const meroe = await login('meroe');
  const chan = async (name: string) => (await lea.mm.get(`/teams/${teamId}/channels/name/${name}`)).id as string;
  const asBot = (agent: string) => new MM(env.MM_URL, seed.bots[agent].token);
  const rejected = async (fn: () => Promise<unknown>) => {
    try { await fn(); return false; } catch (e: any) { return e.status >= 400; }
  };
  const [newsId, perfId, generalId] = [await chan('news'), await chan('performance'), await chan('town-square')];
  const opsId = (await meroe.mm.get(`/teams/${teamId}/channels/name/agents-ops`)).id as string;

  // 15. Plugin: read-only channels, no agents in #general
  check(await rejected(() => lea.mm.post('/posts', { channel_id: newsId, message: 'hello news' })), 'plugin: Léa cannot post in #news');
  check(await rejected(() => lea.mm.post('/posts', { channel_id: perfId, message: 'hello perf' })), 'plugin: Léa cannot post in #performance');
  const mayaPerf = await asBot('maya').post('/posts', { channel_id: perfId, message: 'Daily report test (Maya)' }).catch(() => null);
  check(!!mayaPerf, 'plugin: Maya can post in #performance');
  check(await rejected(() => asBot('khoa').post('/posts', { channel_id: perfId, message: 'x' })), 'plugin: Khoa cannot post in #performance');
  check(await rejected(() => asBot('khoa').post('/posts', { channel_id: generalId, message: 'x' })), 'plugin: agents cannot post in #general');
  const leaGeneral = await lea.mm.post('/posts', { channel_id: generalId, message: 'Test: people still post in #general' }).catch(() => null);
  check(!!leaGeneral, 'people still post in #general');
  const pluginAudit = await waitFor(async () => {
    const rows: any = await (await fetch(`${HUB}/v1/admin/audit`, { headers: { Authorization: `Bearer ${adminToken}` } })).json();
    return rows.entries?.some((e: any) => e.action === 'plugin.read_only' && e.actor === 'lea');
  });
  check(pluginAudit, 'plugin blocks are in the audit log');

  // 16. Kill switch
  const khoaDm = await dm('khoa');
  const pauseRes = await meroe.mm.post('/commands/execute', { channel_id: opsId, command: '/agents pause khoa', team_id: teamId });
  check(/Khoa/.test(pauseRes.text ?? ''), '/agents pause khoa (Méroë)', pauseRes.text);
  const leaPause = await lea.mm.post('/commands/execute', { channel_id: await dm('khoa'), command: '/agents pause theo', team_id: teamId });
  check(/admin/i.test(leaPause.text ?? ''), 'only an admin can pause', leaPause.text);
  const r16 = await tool('khoa', 'reply', { to: 'lea', text: 'still here?' });
  check(r16.status === 423, 'paused agent: the Hub refuses its actions', r16);
  const blockedDirect = await waitFor(async () => (await rejected(() => asBot('khoa').post('/posts', { channel_id: khoaDm, message: 'direct' }))) || null, 40_000, 3000);
  check(blockedDirect, 'paused agent: the plugin blocks its bot account too');
  const p16 = await say('khoa', 'Message pendant la pause');
  await sleep(1500);
  check((await pending('khoa')).length === 0, 'paused agent: nothing delivered');
  const status16 = await meroe.mm.post('/commands/execute', { channel_id: opsId, command: '/agents', team_id: teamId });
  check(/⏸/.test(status16.text ?? '') && /\/ 200/.test(status16.text ?? ''), '/agents (admin): status and messages sent today / budget', status16.text?.slice(0, 200));
  await meroe.mm.post('/commands/execute', { channel_id: opsId, command: '/agents resume Khoa', team_id: teamId });
  const ev16 = await waitFor(async () => (await pending('khoa')).find((e) => e.post_id === p16.id));
  check(!!ev16, 'resume: the message written during the pause is delivered');
  await waitFor(async () => !(await rejected(() => asBot('khoa').post('/posts', { channel_id: khoaDm, message: 'back' }))) || null, 40_000, 3000);

  // 17. Question cap: the 11th question is not posted, Inès is told
  let capped: any = null;
  for (let i = 0; i < 12 && !capped; i++) {
    const r = await tool('awa', 'ask_human', { to: 'vicky', subject: `Invoice check ${i + 1}`, question: 'Paid?', choices: ['Yes', 'No'] });
    if (r.status === 429) capped = { i, r };
  }
  check(capped?.i === 10, 'question cap: 10 questions to Vicky, the 11th refused', capped);
  const inesAlert = await waitFor(async () => (await pending('ines')).find((e) => e.type === 'alert' && e.reason === 'question_cap'));
  check(inesAlert?.agent === 'awa' && inesAlert?.asked_to === 'vicky', 'question cap: Inès gets the extra question', inesAlert);

  // 18. #agents-ops: @mention hands the message over; anti-loop after 6 agent messages
  const o1 = await tool('khoa', 'post_in_agents_ops', { text: '@theo can you confirm the commission rule for Léa?' });
  const ev18 = await waitFor(async () => (await pending('theo')).find((e) => e.type === 'ops' && e.from_agent === 'khoa'));
  check(o1.status === 200 && ev18?.post_id === o1.body.post_id, '#agents-ops: @theo gets Khoa\'s message', o1.body);
  let n = 1;
  let loop: any = null;
  for (let i = 0; i < 7 && !loop; i++) {
    const r = await tool(i % 2 ? 'khoa' : 'theo', 'post_in_agents_ops', { text: `reply ${i}`, reply_to_post_id: o1.body.post_id });
    if (r.status === 429) loop = r; else n++;
  }
  check(n === 6 && loop?.body?.error?.includes('Loop'), 'anti-loop: 6 agent messages in a row, the 7th refused', { n, loop });
  const opsPosts = await meroe.mm.get(`/channels/${opsId}/posts?per_page=10`);
  check(Object.values<any>(opsPosts.posts).some((p) => /Loop stopped/.test(p.message)), 'anti-loop: alert in #agents-ops');
  await meroe.mm.post('/posts', { channel_id: opsId, root_id: o1.body.post_id, message: 'OK, I am looking at it. @maya can you add the numbers?' });
  const after = await tool('theo', 'post_in_agents_ops', { text: 'Thanks', reply_to_post_id: o1.body.post_id });
  check(after.status === 200, 'anti-loop: a person steps in, agents can post again', after);
  const ev18b = await waitFor(async () => (await pending('maya')).find((e) => e.type === 'ops' && e.from_human === 'meroe'));
  check(!!ev18b, '#agents-ops: Méroë\'s @maya reaches Maya');

  // 19. Time window: Théo writes first only on Monday 09:00-12:00 (Ho Chi Minh)
  const r19 = await tool('theo', 'reply', { to: 'lea', text: 'Your commission statement is ready.' });
  const open = inWindow('MON 09:00-12:00');
  check(open ? r19.status === 200 : r19.status === 403 && /MON 09:00-12:00/.test(r19.body.error), `time window (${open ? 'open now' : 'closed now'})`, r19);

  // ── Phase 4: reminders, escalations, approvals, reports, scheduled messages ──
  const tick = async (now?: Date) => {
    const r = await fetch(`${HUB}/v1/admin/tick${now ? `?now=${now.toISOString()}` : ''}`, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } });
    return r.json() as Promise<any>;
  };
  const meroeDm = async (agent: string) => (await meroe.mm.post('/channels/direct', [meroe.id, seed.bots[agent].user_id])).id as string;
  const threadOf = async (root: string) => Object.values<any>((await lea.mm.get(`/posts/${root}/thread`)).posts);

  // 20. Halfway reminder, then escalation to Méroë, who answers on Léa's behalf
  const q20 = await tool('khoa', 'ask_human', { to: 'lea', subject: 'Phone for Anh Tran', question: 'Is +84 90 123 4567 still hers?',
    choices: ['Yes', 'No'], deadline: new Date(Date.now() + 2 * 3600_000).toISOString() });
  await pool.query(`update questions set created_at = now() - interval '2 hours 5 minutes' where id=$1`, [q20.body.question_id]);
  await tick();
  await tick();
  const reminders20 = (await threadOf(q20.body.post_id)).filter((p) => /⏰/.test(p.message));
  check(reminders20.length === 1 && reminders20[0].user_id === seed.bots.khoa.user_id, 'halfway reminder in the thread, once', reminders20.length);
  await pool.query(`update questions set created_at = now() - interval '3 hours', deadline = now() - interval '1 minute' where id=$1`, [q20.body.question_id]);
  await tick();
  const row20 = (await pool.query(`select escalated_to, escalation_post_id from questions where id=$1`, [q20.body.question_id])).rows[0];
  check(row20?.escalated_to === 'meroe' && row20?.escalation_post_id, 'escalation: no answer by the deadline → Méroë (Khoa reports to an agent)', row20);
  const copy = row20?.escalation_post_id ? await meroe.mm.get(`/posts/${row20.escalation_post_id}`) : null;
  check(copy?.channel_id === await meroeDm('khoa') && /Léa/.test(copy?.props?.attachments?.[0]?.text ?? '')
    && copy?.props?.attachments?.[0]?.actions?.length === 2, 'escalation: copy of the card with the buttons in Méroë\'s chat with Khoa');
  check((await threadOf(q20.body.post_id)).some((p) => /Méroë/.test(p.message) && p.user_id === seed.bots.khoa.user_id),
    'escalation: Léa\'s thread says it went to Méroë');
  const inbox20 = await meroe.mm.post('/commands/execute', { channel_id: opsId, command: '/inbox', team_id: teamId });
  check((inbox20.text ?? '').includes(row20?.escalation_post_id), 'escalation: in Méroë\'s /inbox, linked to her copy', inbox20.text);
  await meroe.mm.post(`/posts/${row20.escalation_post_id}/actions/c0`, {});
  const ev20 = await waitFor(async () => (await pending('khoa')).find((e) => e.type === 'answer' && e.question_id === q20.body.question_id));
  check(ev20?.choice === 'Yes' && ev20?.from?.key === 'meroe' && ev20?.on_behalf_of === 'lea', 'Méroë answers on Léa\'s behalf → Khoa gets it', ev20);
  const orig20 = await lea.mm.get(`/posts/${q20.body.post_id}`);
  check(!orig20.props.attachments[0].actions?.length, 'Léa\'s card is closed too');

  // 21. Approvals: approve, edit, reject
  const apprId = (await meroe.mm.get(`/teams/${teamId}/channels/name/approvals`)).id as string;
  const a1 = await tool('antoine', 'request_approval', { kind: 'transfer', title: 'Bonus transfer to Vicky',
    summary: 'Q4 placement bonus', draft: 'Transfer 8,000,000 VND to Vicky Deletang', payload: { amount: 8000000, currency: 'VND' } });
  const card21 = a1.body.permalink ? await meroe.mm.get(`/posts/${a1.body.permalink.split('/').pop()}`) : null;
  const acts21 = card21?.props?.attachments?.[0]?.actions ?? [];
  check(a1.status === 200 && card21?.channel_id === apprId && acts21.map((a: any) => a.id).join() === 'approve,edit,reject',
    'approval card in #approvals with Approve / Edit / Reject', a1.body);
  check(await rejected(() => lea.mm.get(`/channels/${apprId}`)), '#approvals is invisible to Léa');
  await meroe.mm.post(`/posts/${card21.id}/actions/approve`, {});
  const ev21 = await waitFor(async () => (await pending('antoine')).find((e) => e.type === 'approval' && e.approval_id === a1.body.approval_id));
  check(ev21?.decision === 'approved' && ev21?.payload?.amount === 8000000, 'Approve → Antoine gets "approved" with his payload', ev21);
  const card21b = await meroe.mm.get(`/posts/${card21.id}`);
  check(!card21b.props.attachments[0].actions?.length && /✅/.test(card21b.props.attachments[0].text), 'card shows the decision, buttons gone');

  const submitDialog = (aid: string, mode: string, submission: Record<string, string>) => meroe.mm.post('/actions/dialogs/submit', {
    url: `${process.env.HUB_URL_FOR_MM ?? HUB}/mm/dialog`, callback_id: aid, channel_id: apprId, team_id: teamId,
    state: JSON.stringify({ aid, mode, sig: sign('dialog', aid, mode) }), submission, cancelled: false });
  const a2 = await tool('ines', 'request_approval', { kind: 'email', title: 'Reply to Acme about fees',
    draft: 'Dear Sarah, our fee is 20% of the first-year salary.' });
  const a2post = a2.body.permalink.split('/').pop();
  await meroe.mm.post(`/posts/${a2post}/actions/edit`, {}); // opens the dialog in Méroë's app
  await submitDialog(a2.body.approval_id, 'edit', { draft: 'Dear Sarah, our fee is 18% of the first-year salary.', comment: 'Use the Q4 rate' });
  const ev21b = await waitFor(async () => (await pending('ines')).find((e) => e.type === 'approval' && e.approval_id === a2.body.approval_id));
  check(ev21b?.decision === 'edited' && /18%/.test(ev21b?.edited_draft ?? '') && ev21b?.comment === 'Use the Q4 rate',
    'Edit → Inès gets the edited text and the note', ev21b);
  const a3 = await tool('victor', 'request_approval', { kind: 'sequence', title: 'Sequence: CFOs in Lyon', draft: 'Step 1: ...' });
  await submitDialog(a3.body.approval_id, 'reject', { comment: 'Wrong segment' });
  const ev21c = await waitFor(async () => (await pending('victor')).find((e) => e.type === 'approval' && e.approval_id === a3.body.approval_id));
  check(ev21c?.decision === 'rejected' && ev21c?.comment === 'Wrong segment', 'Reject → Victor gets "rejected" and the reason', ev21c);

  // 22. Maya's report: woken at 10:45, published at 11:00 in #performance, alert when missing
  const today = localParts(new Date(), TEAM_TZ);
  const at = (h: number, mi: number, plusDays = 0) => new Date(zonedTime(today.y, today.mo, today.d, h, mi, TEAM_TZ).getTime() + plusDays * 86_400_000);
  await tick(at(10, 46));
  const task22 = await waitFor(async () => (await pending('maya')).find((e) => e.type === 'task' && e.task === 'daily_report'));
  check(task22?.channel === 'performance', 'report: Maya is woken before 11:00 with the task', task22);
  const rep = await tool('maya', 'post_report', { text: `📊 Daily performance ${today.date} (test)` });
  check(rep.status === 200, `report handed over (${rep.body.status})`, rep.body);
  await tick(at(11, 1));
  const perf22 = await lea.mm.get(`/channels/${perfId}/posts?per_page=5`);
  const published = Object.values<any>(perf22.posts).find((p) => p.message.includes(`Daily performance ${today.date}`));
  check(published?.user_id === seed.bots.maya.user_id, 'report published in #performance by Maya');
  const again = await tool('maya', 'post_report', { text: 'second' });
  check(again.status === 409, 'one report per day', again.body);
  await tick(at(11, 6, 1)); // tomorrow, nothing sent
  const opsTail = await meroe.mm.get(`/channels/${opsId}/posts?per_page=5`);
  check(Object.values<any>(opsTail.posts).some((p) => /report for #performance/.test(p.message)), 'missing report → alert in #agents-ops');
  await pool.query(`delete from reports where day > $1`, [today.date]);

  // 23. Scheduled messages
  const s1 = await tool('khoa', 'schedule_message', { to: 'lea', text: 'Rappel planifié : relance Anh Tran.', send_at: new Date(Date.now() + 3600_000).toISOString() });
  const s2 = await tool('khoa', 'schedule_message', { to: 'lea', text: 'Message annulé.', send_at: new Date(Date.now() + 3600_000).toISOString() });
  const c2 = await tool('khoa', 'cancel_scheduled_message', { scheduled_id: s2.body.scheduled_id });
  await tick(new Date(Date.now() + 3601_000));
  const dm23 = await lea.mm.get(`/channels/${khoaDm}/posts?per_page=10`);
  const msgs23 = Object.values<any>(dm23.posts).map((p) => p.message);
  check(s1.status === 200 && msgs23.includes('Rappel planifié : relance Anh Tran.'), 'scheduled message sent at its time');
  check(c2.status === 200 && !msgs23.includes('Message annulé.'), 'cancelled scheduled message not sent');

  // ── Domains: activity feed and coordination in #d-<domain> ─────────────────
  const delivery = (await meroe.mm.get(`/teams/${teamId}/channels/name/d-delivery`)).id as string;
  const finance = (await meroe.mm.get(`/teams/${teamId}/channels/name/d-finance`)).id as string;
  const recentIn = async (ch: string, n = 15) => {
    const r = await meroe.mm.get(`/channels/${ch}/posts?per_page=${n}`);
    return (r.order as string[]).map((id) => r.posts[id]);
  };
  check(await rejected(() => lea.mm.get(`/channels/${delivery}`)), 'domain channels are invisible to the team');

  // 24. Feed: question, answer, resolution, approval
  const subj = `Feed check ${Date.now()}`;
  const q24 = await tool('khoa', 'ask_human', { to: 'lea', subject: subj, question: 'OK?', choices: ['Yes', 'No'],
    object: { type: 'candidate', label: 'Anh Tran' } });
  await lea.mm.post(`/posts/${q24.body.post_id}/actions/c0`, {});
  await waitFor(async () => (await pending('khoa')).find((e) => e.question_id === q24.body.question_id));
  await tool('khoa', 'resolve_question', { question_id: q24.body.question_id, confirmation: 'Noté.', propium_action: 'Checked Anh Tran record' });
  const feed24 = await waitFor(async () => {
    const posts = (await recentIn(delivery)).filter((p) => p.message.includes(subj));
    return posts.length >= 3 ? posts : null;
  });
  const lines = (feed24 ?? []).map((p: any) => p.message).join('\n');
  check(/❓ Khoa .*Léa.*Anh Tran/.test(lines), 'feed: question asked (who, to whom, about what)', lines);
  check(/💬 Léa .*Khoa.*Yes/.test(lines), 'feed: answer');
  check(/✅ Khoa .*Propium: Checked Anh Tran record/.test(lines), 'feed: resolution with the Propium action');
  check((feed24 ?? []).every((p: any) => p.user_id === seed.bots.humanup.user_id), 'feed lines come from the Humanup bot');
  const a24 = await tool('antoine', 'request_approval', { kind: 'transfer', title: `Feed approval ${Date.now()}` });
  const feedA = await waitFor(async () => (await recentIn(finance)).find((p) => p.message.includes('🔏') && p.message.includes('Antoine')));
  check(a24.status === 200 && !!feedA, 'feed: approval request shows in #d-finance');

  // 25. Coordination inside the domain
  const c25 = await tool('khoa', 'post_in_domain', { text: '@bastien the BNP pipeline has 3 stale candidates, can you look?' });
  const ev25 = await waitFor(async () => (await pending('bastien')).find((e) => e.type === 'ops' && e.channel === 'd-delivery'));
  check(c25.status === 200 && ev25?.from_agent === 'khoa', 'post_in_domain: @bastien gets Khoa\'s message', c25.body);
  const c25b = await tool('khoa', 'post_in_domain', { text: '@theo commission question' });
  check(c25b.status === 200 && c25b.body.notified?.length === 0, '@mention outside the domain is not delivered (use #agents-ops)', c25b.body);
  await meroe.mm.post('/posts', { channel_id: delivery, message: '@khoa merci, tiens-moi au courant' });
  const ev25c = await waitFor(async () => (await pending('khoa')).find((e) => e.type === 'ops' && e.from_human === 'meroe' && e.channel === 'd-delivery'));
  check(!!ev25c, 'Méroë\'s @khoa in #d-delivery reaches Khoa');
  const c25d = await tool('camille', 'post_in_domain', { text: 'hi' });
  check(c25d.status === 403, 'private agents have no domain channel', c25d.body);

  // ── Phase 5: Propium → #news ───────────────────────────────────────────────
  const propiumSecret = 'test-propium-secret';
  writeFileSync(join(env.SECRETS_DIR, 'propium-webhook-secret'), propiumSecret);
  const sendPropium = async (payload: object, sig?: string) => {
    const raw = JSON.stringify(payload);
    const res = await fetch(`${HUB}/v1/propium/events`, { method: 'POST', body: raw, headers: {
      'Content-Type': 'application/json',
      'X-Propium-Signature': sig ?? `sha256=${createHmac('sha256', propiumSecret).update(raw).digest('hex')}`,
    } });
    return { status: res.status, body: await res.json().catch(() => ({})) as any };
  };
  const stamp = Date.now();
  const bad = await sendPropium({ id: `bad-${stamp}`, type: 'announcement.closed_won', details: {} }, 'sha256=deadbeef');
  check(bad.status === 401, '#news: unsigned / badly signed Propium call refused', bad);
  const m26 = await sendPropium({ id: `m-${stamp}`, type: 'announcement.client_meeting', by: { name: 'Valentin Murcia' },
    details: { by: 'Valentin', contact: 'Sarah Lee', company: 'Acme', relationship: 'prospect', date: '2026-11-27T03:00:00Z',
      location: 'Google Meet', url: 'https://ats.propium.co/clients/x' } });
  const p26 = await sendPropium({ id: `p-${stamp}`, type: 'announcement.presentation',
    details: { by: 'Léa', candidate: 'Anh Tran', company: 'Acme', contact: 'Sarah Lee', mandate: 'CFO Vietnam', date: '2026-11-27T08:00:00Z' } });
  const w26 = await sendPropium({ id: `w-${stamp}`, type: 'announcement.closed_won',
    details: { by: 'Vicky', candidate: 'Anh Tran', company: 'Acme', mandate: 'CFO Vietnam', fee: 18000, fee_percent: 20, start_date: '2027-01-05T00:00:00Z' } });
  const news26 = await lea.mm.get(`/channels/${newsId}/posts?per_page=10`);
  const newsText = (id: string) => news26.posts[id]?.message ?? '';
  check(/📅 \*\*Valentin\*\* booked a meeting with \*\*Sarah Lee\*\* \(Acme, prospect\) · Fri 27 Nov, 10:00 · Google Meet · \[Propium\]/.test(newsText(m26.body.post_id)),
    '#news: client meeting line (who, contact, company, prospect, date in Ho Chi Minh time, link)', newsText(m26.body.post_id));
  check(/🤝 \*\*Léa\*\* presents \*\*Anh Tran\*\* to \*\*Acme\*\* \(Sarah Lee\) for CFO Vietnam · Fri 27 Nov, 15:00/.test(newsText(p26.body.post_id)),
    '#news: presentation line', newsText(p26.body.post_id));
  check(/🎉 Closed won: \*\*Anh Tran\*\* placed at \*\*Acme\*\* as CFO Vietnam · Vicky · €18,000 \(20%\) · starts 5 Jan 2027/.test(newsText(w26.body.post_id)),
    '#news: closed won line', newsText(w26.body.post_id));
  check(news26.posts[m26.body.post_id]?.user_id === seed.bots.propium.user_id, '#news: posted by the Propium bot');
  const dup = await sendPropium({ id: `w-${stamp}`, type: 'announcement.closed_won', details: { candidate: 'Anh Tran' } });
  check(dup.body.duplicate === true, '#news: the same event twice is posted once', dup.body);
  const other = await sendPropium({ id: `s-${stamp}`, type: 'stage.changed', details: {} });
  check(other.status === 200 && other.body.ignored === 'stage.changed', '#news: any other Propium event is ignored', other.body);

  srv.close();
  await pool.end();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error('[e2e] ERROR', e);
  process.exit(1);
});
