// End-to-end test against a running Mattermost + Hub, acting as real people (Léa) and agents.
// Expects agents.secrets.json with: khoa, theo, maya = poll; hugo = webhook (http://localhost:3199/hook, secret "test-secret");
// nathan = doorbell (http://localhost:3199/wake, key "test-wake-key"); linh = claude-test (optional, needs ANTHROPIC_API_KEY).
//   MM_URL=http://localhost:8065 HUB=http://localhost:3100 npx tsx test/e2e.ts

import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MM } from '../src/mm.js';
import { env } from '../src/env.js';
import { pool } from '../src/db.js';
import { inWindow } from '../src/guard.js';

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
  await fetch(`${HUB}/v1/admin/agents/all/resume`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } });
  for (const a of ['khoa', 'theo', 'maya', 'hugo', 'nathan', 'ines', 'awa']) await pending(a); // drain leftovers from earlier runs

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

  srv.close();
  await pool.end();
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error('[e2e] ERROR', e);
  process.exit(1);
});
