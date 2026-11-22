// Humanup Chat seed: teams, humans, agent bots, channels, DMs and sidebars.
// Idempotent: re-run after editing humans.yaml / agents.yaml.
//
//   MM_URL=http://localhost:8065 MM_ADMIN_TOKEN=... npx tsx src/seed.ts [--welcome]
//   (or MM_ADMIN_TOKEN read from $SECRETS_DIR/admin-token)

import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { MM, MMError } from './mm.js';
import { loadConfig, dmHumansFor, type Agent, type Human } from './config.js';

const args = new Set(process.argv.slice(2));
const WELCOME = args.has('--welcome');

const CONFIG_DIR = resolve(process.env.CONFIG_DIR ?? join(import.meta.dirname, '..', '..'));
const SECRETS_DIR = resolve(process.env.SECRETS_DIR ?? join(CONFIG_DIR, 'infra', '.secrets'));
const MM_URL = process.env.MM_URL ?? 'http://localhost:8065';

const TEAM = { name: 'humanup', display_name: 'Humanup' };
const PRIVATE_TEAM = { name: 'private', display_name: 'Private' };
const SYSTEM_BOTS = [
  { username: 'humanup', display_name: 'Humanup', description: 'Humanup Chat system: questions, reminders, approvals' },
  { username: 'propium', display_name: 'Propium', description: 'Announcements from Propium' },
];

type Secrets = {
  bots: Record<string, { user_id: string; token_id: string; token: string }>;
  initial_passwords: Record<string, string>;
};

const log = (...a: unknown[]) => console.log('[seed]', ...a);

async function main() {
  const adminToken = process.env.MM_ADMIN_TOKEN ?? readIf(join(SECRETS_DIR, 'admin-token'));
  if (!adminToken) throw new Error(`No admin token: set MM_ADMIN_TOKEN or run infra/bootstrap.sh (looked in ${SECRETS_DIR})`);
  const mm = new MM(MM_URL, adminToken.trim());
  const { humans, agents } = loadConfig(CONFIG_DIR);
  const secrets = loadSecrets();

  // ── Teams ────────────────────────────────────────────────────────────────
  const team = await ensureTeam(mm, TEAM);
  const privateTeam = await ensureTeam(mm, PRIVATE_TEAM);

  // ── Humans ───────────────────────────────────────────────────────────────
  const humanIds: Record<string, string> = {};
  for (const h of humans) {
    humanIds[h.key] = await ensureHuman(mm, h, secrets);
    await addToTeam(mm, team.id, humanIds[h.key]);
  }
  const meroe = humans.find((h) => h.admin);
  if (meroe) await addToTeam(mm, privateTeam.id, humanIds[meroe.key]);

  // ── Bots ─────────────────────────────────────────────────────────────────
  const botIds: Record<string, string> = {};
  for (const b of SYSTEM_BOTS) {
    botIds[b.username] = await ensureBot(mm, b, secrets);
    await addToTeam(mm, team.id, botIds[b.username]);
    await addToTeam(mm, privateTeam.id, botIds[b.username]);
  }
  for (const a of agents) {
    botIds[a.key] = await ensureBot(
      mm,
      { username: a.key, display_name: a.name, description: `${a.title} · AI agent` },
      secrets,
      a.key,
    );
    await addToTeam(mm, a.hidden_from_team ? privateTeam.id : team.id, botIds[a.key]);
  }
  saveSecrets(secrets);

  // ── Channels ─────────────────────────────────────────────────────────────
  const general = await mm.get(`/teams/${team.id}/channels/name/town-square`);
  await mm.put(`/channels/${general.id}/patch`, {
    display_name: 'general',
    purpose: 'The team. Agents do not post here.',
  });
  const offTopic = await mm.find(`/teams/${team.id}/channels/name/off-topic?include_deleted=true`);
  if (offTopic && !offTopic.delete_at) {
    await mm.del(`/channels/${offTopic.id}`);
    log('archived off-topic');
  }
  const news = await ensureChannel(mm, team.id, 'news', 'news', 'O',
    'Propium announcements only: client meetings, presentations, closed won.');
  const performance = await ensureChannel(mm, team.id, 'performance', 'performance', 'O',
    "Maya's daily report at 11:00 (Ho Chi Minh). Nothing else.");
  const agentsOps = await ensureChannel(mm, team.id, 'agents-ops', 'agents-ops', 'P',
    'Coordination between agents and supervision.');
  const approvals = await ensureChannel(mm, team.id, 'approvals', 'approvals', 'P',
    'What Méroë needs to approve.');
  // Private team default channel: rename so it does not look like a second #general.
  const privGeneral = await mm.get(`/teams/${privateTeam.id}/channels/name/town-square`);
  await mm.put(`/channels/${privGeneral.id}/patch`, { display_name: 'private', purpose: 'Méroë and private agents.' });
  const privOffTopic = await mm.find(`/teams/${privateTeam.id}/channels/name/off-topic?include_deleted=true`);
  if (privOffTopic && !privOffTopic.delete_at) await mm.del(`/channels/${privOffTopic.id}`);

  for (const h of humans) {
    await addToChannel(mm, news.id, humanIds[h.key]);
    await addToChannel(mm, performance.id, humanIds[h.key]);
  }
  await addToChannel(mm, news.id, botIds.propium);
  const maya = agents.find((a) => a.report?.channel === 'performance');
  if (maya) await addToChannel(mm, performance.id, botIds[maya.key]);
  if (meroe) {
    await addToChannel(mm, agentsOps.id, humanIds[meroe.key]);
    await addToChannel(mm, approvals.id, humanIds[meroe.key]);
  }
  await addToChannel(mm, agentsOps.id, botIds.humanup);
  await addToChannel(mm, approvals.id, botIds.humanup);
  for (const a of agents) if (!a.hidden_from_team) await addToChannel(mm, agentsOps.id, botIds[a.key]);

  // ── DMs (one per person and agent) ───────────────────────────────────────
  const dmsByHuman: Record<string, { agent: Agent; channelId: string }[]> = {};
  for (const a of agents) {
    for (const hk of dmHumansFor(a, humans)) {
      const ch = await mm.post('/channels/direct', [humanIds[hk], botIds[a.key]]);
      (dmsByHuman[hk] ??= []).push({ agent: a, channelId: ch.id });
      await mm.put(`/users/${humanIds[hk]}/preferences`, [
        { user_id: humanIds[hk], category: 'direct_channel_show', name: botIds[a.key], value: 'true' },
      ]);
      if (WELCOME) await welcome(mm, secrets, a, humans.find((h) => h.key === hk)!, ch.id);
    }
  }

  // ── Sidebars: "Team" then "Agents" ───────────────────────────────────────
  for (const h of humans) {
    const teamChannels = [general.id, news.id, performance.id];
    if (h.admin) teamChannels.push(approvals.id, agentsOps.id);
    const agentChannels = (dmsByHuman[h.key] ?? [])
      .sort((x, y) => x.agent.name.localeCompare(y.agent.name))
      .map((d) => d.channelId);
    await setSidebar(mm, humanIds[h.key], team.id, teamChannels, agentChannels);
    if (h.admin) {
      await setSidebar(mm, humanIds[h.key], privateTeam.id, [privGeneral.id], agentChannels);
    }
  }

  // The seed account becomes a member of what it creates; take it out so it shows nowhere.
  const me = await mm.get('/users/me');
  for (const c of [news, performance, agentsOps, approvals]) await leave(mm, `/channels/${c.id}/members/${me.id}`);
  for (const t of [team, privateTeam]) await leave(mm, `/teams/${t.id}/members/${me.id}`);

  log(`done: ${humans.length} humans, ${agents.length} agents + ${SYSTEM_BOTS.length} system bots, `
    + `${Object.values(dmsByHuman).reduce((n, l) => n + l.length, 0)} DMs`);
  log(`secrets in ${SECRETS_DIR} (bot tokens, initial passwords): keep them off chat and email`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ensureTeam(mm: MM, t: { name: string; display_name: string }) {
  const found = await mm.find(`/teams/name/${t.name}`);
  if (found) return found;
  log('create team', t.name);
  return mm.post('/teams', { ...t, type: 'I' });
}

async function addToTeam(mm: MM, teamId: string, userId: string) {
  await mm.post(`/teams/${teamId}/members`, { team_id: teamId, user_id: userId });
}

async function addToChannel(mm: MM, channelId: string, userId: string) {
  await mm.post(`/channels/${channelId}/members`, { user_id: userId });
}

async function leave(mm: MM, path: string) {
  try {
    await mm.del(path);
  } catch (e) {
    if (!(e instanceof MMError && (e.status === 404 || e.status === 400))) throw e;
  }
}

async function ensureHuman(mm: MM, h: Human, secrets: Secrets): Promise<string> {
  const profile = {
    first_name: h.first_name,
    last_name: h.last_name,
    position: h.position ?? '',
    locale: h.ui_locale,
    timezone: { useAutomaticTimezone: 'false', automaticTimezone: '', manualTimezone: h.timezone },
  };
  // By username first, so fixing an email in humans.yaml updates the account instead of duplicating it.
  let user = (await mm.find(`/users/username/${h.key}`)) ?? (await mm.find(`/users/email/${encodeURIComponent(h.email)}`));
  if (user?.is_bot) throw new Error(`Username ${h.key} is taken by a bot`);
  if (user && user.email !== h.email) {
    await mm.put(`/users/${user.id}/patch`, { email: h.email });
    log('email updated', h.key);
  }
  if (!user) {
    const password = randomBytes(18).toString('base64url') + 'Aa1!';
    user = await mm.post('/users', { email: h.email, username: h.key, password, ...profile });
    secrets.initial_passwords[h.key] = password;
    log('create human', h.key);
  }
  await mm.put(`/users/${user.id}/patch`, profile);
  await mm.put(`/users/${user.id}/roles`, { roles: h.admin ? 'system_user system_admin' : 'system_user' });
  return user.id;
}

async function ensureBot(
  mm: MM,
  b: { username: string; display_name: string; description: string },
  secrets: Secrets,
  avatarKey?: string,
): Promise<string> {
  const existing = await mm.find(`/users/username/${b.username}`);
  let userId: string;
  if (existing) {
    if (!existing.is_bot) throw new Error(`Username ${b.username} is taken by a human account`);
    userId = existing.id;
    try {
      await mm.put(`/bots/${userId}`, b);
    } catch (e) {
      if (e instanceof MMError && e.status === 404) {
        await mm.post(`/bots/${userId}/enable`);
        await mm.put(`/bots/${userId}`, b);
      } else throw e;
    }
    if (existing.delete_at) await mm.post(`/bots/${userId}/enable`);
  } else {
    const bot = await mm.post('/bots', b);
    userId = bot.user_id;
    log('create bot', b.username);
  }
  if (!secrets.bots[b.username]) {
    const t = await mm.post(`/users/${userId}/tokens`, { description: 'Agent Hub' });
    secrets.bots[b.username] = { user_id: userId, token_id: t.id, token: t.token };
  }
  const avatar = findAvatar(avatarKey ?? b.username);
  if (avatar) await mm.uploadProfileImage(userId, readFileSync(avatar), avatar);
  return userId;
}

async function ensureChannel(mm: MM, teamId: string, name: string, display: string, type: 'O' | 'P', purpose: string) {
  let ch = await mm.find(`/teams/${teamId}/channels/name/${name}?include_deleted=true`);
  if (ch?.delete_at) {
    await mm.post(`/channels/${ch.id}/restore`);
  }
  if (!ch) {
    ch = await mm.post('/channels', { team_id: teamId, name, display_name: display, type, purpose });
    log('create channel', name);
  } else {
    await mm.put(`/channels/${ch.id}/patch`, { display_name: display, purpose });
  }
  return ch;
}

/** Custom "Team" and "Agents" categories on top; our channels removed from every other category. */
async function setSidebar(mm: MM, userId: string, teamId: string, teamChannels: string[], agentChannels: string[]) {
  const base = `/users/${userId}/teams/${teamId}/channels/categories`;
  const get = () => mm.get<{ categories: any[]; order: string[] }>(base);
  let { categories } = await get();
  for (const name of ['Team', 'Agents']) {
    if (!categories.some((c) => c.type === 'custom' && c.display_name === name)) {
      await mm.post(base, { user_id: userId, team_id: teamId, display_name: name, type: 'custom', channel_ids: [] });
    }
  }
  ({ categories } = await get());
  const ours = new Set([...teamChannels, ...agentChannels]);
  const updated = categories.map((c) => {
    if (c.type === 'custom' && c.display_name === 'Team') return { ...c, channel_ids: teamChannels, sorting: 'manual' };
    if (c.type === 'custom' && c.display_name === 'Agents') return { ...c, channel_ids: agentChannels, sorting: 'manual' };
    return { ...c, channel_ids: c.channel_ids.filter((id: string) => !ours.has(id)) };
  });
  await mm.put(base, updated);
  const teamCat = updated.find((c) => c.type === 'custom' && c.display_name === 'Team')!;
  const agentsCat = updated.find((c) => c.type === 'custom' && c.display_name === 'Agents')!;
  const rest = updated.filter((c) => c !== teamCat && c !== agentsCat).map((c) => c.id);
  await mm.put(`${base}/order`, [teamCat.id, agentsCat.id, ...rest]);
}

async function welcome(mm: MM, secrets: Secrets, a: Agent, h: Human, channelId: string) {
  const posts = await mm.get(`/channels/${channelId}/posts?per_page=1`);
  if (posts.order?.length) return;
  const text = h.agent_lang === 'fr'
    ? `Bonjour ${h.first_name}, je suis ${a.name} (${a.title}). Écris-moi ici pour tout ce qui concerne : ${a.scope}. C'est aussi ici que je te poserai mes questions.`
    : `Hi ${h.first_name}, I'm ${a.name} (${a.title}). Write to me here about: ${a.scope}. I'll also ask you my questions here.`;
  await mm.withToken(secrets.bots[a.key].token).post('/posts', { channel_id: channelId, message: text });
}

function findAvatar(key: string): string | null {
  for (const ext of ['png', 'jpg', 'jpeg']) {
    const p = join(CONFIG_DIR, 'avatars', `${key}.${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

function readIf(p: string): string | undefined {
  return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
}

function loadSecrets(): Secrets {
  const p = join(SECRETS_DIR, 'seed-secrets.json');
  const s = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  return { bots: s.bots ?? {}, initial_passwords: s.initial_passwords ?? {} };
}

function saveSecrets(s: Secrets) {
  mkdirSync(SECRETS_DIR, { recursive: true });
  const p = join(SECRETS_DIR, 'seed-secrets.json');
  writeFileSync(p, JSON.stringify(s, null, 2), { mode: 0o600 });
  try { chmodSync(p, 0o600); } catch { /* Windows */ }
}

main().catch((e) => {
  console.error('[seed] FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
