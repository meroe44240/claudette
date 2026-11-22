// Imports humans.yaml / agents.yaml + the seed's bot tokens into the Hub database.
// Delivery settings live in SECRETS_DIR/agents.secrets.json (never in git):
//   { "linh": { "delivery_mode": "doorbell", "wake_url": "...", "wake_key": "crsr_..." },
//     "hugo": { "delivery_mode": "webhook", "webhook_url": "...", "webhook_secret": "..." },
//     "khoa": { "delivery_mode": "claude-test" } }
// New agent API keys are written once to SECRETS_DIR/agent-keys.json (only their SHA-256 is stored).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { env } from './env.js';
import { q, one } from './db.js';
import { MM } from './mm.js';
import { loadConfig, dmHumansFor } from './config.js';

const readJson = (p: string) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {});
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function syncConfig() {
  const { humans, agents } = loadConfig(env.CONFIG_DIR);
  const seedSecrets = readJson(join(env.SECRETS_DIR, 'seed-secrets.json'));
  const delivery = readJson(join(env.SECRETS_DIR, 'agents.secrets.json'));
  const keysPath = join(env.SECRETS_DIR, 'agent-keys.json');
  const newKeys: Record<string, string> = readJson(keysPath);
  const mm = new MM(env.MM_URL, env.MM_ADMIN_TOKEN);

  for (const h of humans) {
    const u = await mm.get(`/users/username/${h.key}`);
    await q(
      `insert into humans (key, mm_user_id, first_name, name, lang, timezone, is_admin, propium_user_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (key) do update set mm_user_id=$2, first_name=$3, name=$4, lang=$5, timezone=$6,
         is_admin=$7, propium_user_id=$8, updated_at=now()`,
      [h.key, u.id, h.first_name, `${h.first_name} ${h.last_name}`, h.agent_lang, h.timezone, h.admin, h.propium_user_id ?? null],
    );
  }

  for (const a of agents) {
    const bot = seedSecrets.bots?.[a.key];
    if (!bot) throw new Error(`No bot token for ${a.key}: run the seed first`);
    const d = delivery[a.key] ?? {};
    const mode = d.delivery_mode ?? (a as any).delivery_mode ?? 'doorbell';
    const { key, name, title, scope, ...rules } = a;
    await q(
      `insert into agents (key, name, title, scope, mm_user_id, mm_token, provider, delivery_mode,
         wake_url, wake_key, webhook_url, webhook_secret, rules, hidden)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       on conflict (key) do update set name=$2, title=$3, scope=$4, mm_user_id=$5, mm_token=$6, provider=$7,
         delivery_mode=$8, wake_url=$9, wake_key=$10, webhook_url=$11, webhook_secret=$12, rules=$13, hidden=$14,
         updated_at=now()`,
      [key, name, title, scope, bot.user_id, bot.token, d.provider ?? (mode === 'claude-test' ? 'claude-test' : (a as any).provider ?? 'grok'),
        mode, d.wake_url ?? null, d.wake_key ?? null, d.webhook_url ?? null, d.webhook_secret ?? null,
        JSON.stringify(rules), a.hidden_from_team],
    );
    const row = await one<{ api_key_sha256: string | null }>('select api_key_sha256 from agents where key=$1', [key]);
    if (!row?.api_key_sha256) {
      const apiKey = `hub_${key}_${randomBytes(24).toString('base64url')}`;
      await q('update agents set api_key_sha256=$2 where key=$1', [key, sha256(apiKey)]);
      newKeys[key] = apiKey;
    }
    for (const hk of dmHumansFor(a, humans)) {
      const human = await one<{ mm_user_id: string }>('select mm_user_id from humans where key=$1', [hk]);
      const ch = await mm.post('/channels/direct', [human!.mm_user_id, bot.user_id]);
      await q(
        `insert into access (agent_key, human_key, dm_channel_id) values ($1,$2,$3)
         on conflict (agent_key, human_key) do update set dm_channel_id=$3`,
        [key, hk, ch.id],
      );
    }
  }
  writeFileSync(keysPath, JSON.stringify(newKeys, null, 2), { mode: 0o600 });
  return { humans: humans.length, agents: agents.length };
}
