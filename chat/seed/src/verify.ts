// Checks that the server matches humans.yaml / agents.yaml after a seed.
//   MM_URL=... npx tsx src/verify.ts      (exit code 1 if any check fails)

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MM, MMError } from './mm.js';
import { loadConfig, dmHumansFor } from './config.js';

const CONFIG_DIR = resolve(process.env.CONFIG_DIR ?? join(import.meta.dirname, '..', '..'));
const SECRETS_DIR = resolve(process.env.SECRETS_DIR ?? join(CONFIG_DIR, 'infra', '.secrets'));
const MM_URL = process.env.MM_URL ?? 'http://localhost:8065';

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failures++;
};

async function main() {
  const token = (process.env.MM_ADMIN_TOKEN ?? readFileSync(join(SECRETS_DIR, 'admin-token'), 'utf8')).trim();
  const mm = new MM(MM_URL, token);
  const secretsPath = join(SECRETS_DIR, 'seed-secrets.json');
  const secrets = existsSync(secretsPath) ? JSON.parse(readFileSync(secretsPath, 'utf8')) : { bots: {}, initial_passwords: {} };
  const { humans, agents, domains } = loadConfig(CONFIG_DIR);

  const team = await mm.get('/teams/name/humanup');
  const priv = await mm.get('/teams/name/private');
  const ch = async (name: string) => mm.get(`/teams/${team.id}/channels/name/${name}`);
  const members = async (id: string) => {
    const list = await mm.get<any[]>(`/channels/${id}/members?per_page=200`);
    return new Set(list.map((m) => m.user_id));
  };
  const uid: Record<string, string> = {};
  for (const h of humans) uid[h.key] = (await mm.get(`/users/username/${h.key}`)).id;
  for (const a of [...agents.map((x) => x.key), 'humanup', 'propium']) uid[a] = (await mm.get(`/users/username/${a}`)).id;
  const admin = humans.find((h) => h.admin)!;
  const others = humans.filter((h) => !h.admin);

  // Humans
  for (const h of humans) {
    const u = await mm.get(`/users/${uid[h.key]}`);
    check(u.timezone?.manualTimezone === h.timezone && u.timezone?.useAutomaticTimezone === 'false', `${h.key}: timezone ${h.timezone}`);
    check(u.roles.includes('system_admin') === h.admin, `${h.key}: ${h.admin ? 'is' : 'is not'} system admin`);
  }

  // Bots
  for (const a of agents) {
    const bot = await mm.get(`/bots/${uid[a.key]}`);
    check(bot.display_name === a.name && bot.description.includes(a.title), `bot ${a.key}: name and title`);
    const t = secrets.bots[a.key]?.token;
    let ok = false;
    if (t) { try { ok = (await new MM(MM_URL, t).get('/users/me')).id === uid[a.key]; } catch { ok = false; } }
    check(ok, `bot ${a.key}: stored token works`);
  }

  // Channels
  const general = await ch('town-square');
  check(general.display_name === 'general', '#general is the renamed Town Square');
  const offTopic = await mm.find(`/teams/${team.id}/channels/name/off-topic?include_deleted=true`);
  check(!offTopic || offTopic.delete_at > 0, 'off-topic archived');
  const news = await ch('news'), perf = await ch('performance'), ops = await ch('agents-ops'), appr = await ch('approvals');
  check(ops.type === 'P' && appr.type === 'P', '#agents-ops and #approvals are private');
  const newsM = await members(news.id), perfM = await members(perf.id), opsM = await members(ops.id), apprM = await members(appr.id);
  check(humans.every((h) => newsM.has(uid[h.key])) && newsM.has(uid.propium), '#news: every human + Propium bot');
  check(agents.every((a) => !newsM.has(uid[a.key])), '#news: no agent');
  const maya = agents.find((a) => a.report?.channel === 'performance');
  check(humans.every((h) => perfM.has(uid[h.key])) && (!maya || perfM.has(uid[maya.key])), '#performance: every human + Maya');
  check(agents.filter((a) => a !== maya).every((a) => !perfM.has(uid[a.key])), '#performance: no other agent');
  check(others.every((h) => !opsM.has(uid[h.key])), '#agents-ops: invisible to the team');
  check(agents.filter((a) => !a.hidden_from_team).every((a) => opsM.has(uid[a.key])), '#agents-ops: every visible agent');
  check(apprM.size === 2 && apprM.has(uid[admin.key]) && apprM.has(uid.humanup), '#approvals: Méroë + Humanup bot only');

  // DMs and sidebars
  for (const h of humans) {
    const expected = agents.filter((a) => dmHumansFor(a, humans).includes(h.key));
    const { categories, order } = await mm.get(`/users/${uid[h.key]}/teams/${team.id}/channels/categories`);
    const byId = Object.fromEntries(categories.map((c: any) => [c.id, c]));
    const wantOrder = h.admin && domains.length ? ['Team', 'Domains', 'Agents'] : ['Team', 'Agents'];
    const got = order.slice(0, wantOrder.length).map((id: string) => byId[id]?.display_name);
    check(got.join() === wantOrder.join(), `${h.key}: sidebar starts with ${wantOrder.join(', ')}`);
    const first = byId[order[0]], second = byId[order[wantOrder.length - 1]];
    if (h.admin && domains.length) {
      check((byId[order[1]]?.channel_ids ?? []).length === domains.length, `${h.key}: Domains has ${domains.length} channels`);
    }
    const teamSet = new Set(first?.channel_ids ?? []);
    const wantTeam = [general.id, news.id, perf.id, ...(h.admin ? [appr.id, ops.id] : [])];
    check(wantTeam.every((id) => teamSet.has(id)) && teamSet.size === wantTeam.length, `${h.key}: Team has ${wantTeam.length} channels`);
    check((second?.channel_ids ?? []).length === expected.length, `${h.key}: Agents has ${expected.length} DMs`);
  }

  // Hidden agents: a team member can't find or DM them
  const hidden = agents.filter((a) => a.hidden_from_team);
  const probe = others.find((h) => secrets.initial_passwords[h.key]);
  if (hidden.length && probe) {
    const login = await fetch(`${MM_URL}/api/v4/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login_id: probe.email, password: secrets.initial_passwords[probe.key] }),
    });
    const session = login.headers.get('token');
    if (login.ok && session) {
      const as = new MM(MM_URL, session);
      for (const a of hidden) {
        const found = await as.get(`/users/autocomplete?in_team=${team.id}&name=${a.key}`);
        check(!(found.users ?? []).some((u: any) => u.id === uid[a.key]), `${a.key}: not found by ${probe.key} in user search`);
        let blocked = false;
        try { await as.post('/channels/direct', [uid[probe.key], uid[a.key]]); } catch (e) { blocked = e instanceof MMError; }
        check(blocked, `${a.key}: ${probe.key} cannot open a DM`);
      }
      await as.post('/users/logout').catch(() => {});
    } else {
      check(false, `log in as ${probe.key} to test hidden agents (password changed?)`);
    }
  }
  const privM = await mm.get<any[]>(`/teams/${priv.id}/members?per_page=200`);
  const privSet = new Set(privM.map((m) => m.user_id));
  check(others.every((h) => !privSet.has(uid[h.key])), 'Private team: no team member except Méroë');

  // Domain channels: private, Méroë + Humanup bot + the domain's agents only
  for (const d of domains) {
    const ch = await mm.find(`/teams/${team.id}/channels/name/d-${d.key}`);
    if (!ch) { check(false, `#d-${d.key} exists`); continue; }
    const m = await members(ch.id);
    const want = new Set([uid[admin.key], uid.humanup, ...agents.filter((a) => a.domain === d.key).map((a) => uid[a.key])]);
    check(ch.type === 'P' && m.size === want.size && [...want].every((id) => m.has(id)), `#d-${d.key}: private, Méroë + ${want.size - 2} agent(s)`);
  }

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error('[verify] ERROR:', e instanceof Error ? e.message : e);
  process.exit(1);
});
