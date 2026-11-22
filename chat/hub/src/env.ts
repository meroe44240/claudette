import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const here = import.meta.dirname;
const CONFIG_DIR = resolve(process.env.CONFIG_DIR ?? join(here, '..', '..'));
const SECRETS_DIR = resolve(process.env.SECRETS_DIR ?? join(CONFIG_DIR, 'infra', '.secrets'));

function read(p: string) {
  return existsSync(p) ? readFileSync(p, 'utf8').trim() : undefined;
}

/** A random secret kept in SECRETS_DIR so it survives restarts. */
function persistentSecret(name: string): string {
  const p = join(SECRETS_DIR, name);
  const v = read(p);
  if (v) return v;
  mkdirSync(SECRETS_DIR, { recursive: true });
  const s = randomBytes(32).toString('hex');
  writeFileSync(p, s, { mode: 0o600 });
  return s;
}

export const env = {
  PORT: Number(process.env.PORT ?? 3100),
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://mmuser:localtestonly123@127.0.0.1:5433/agenthub',
  MM_URL: (process.env.MM_URL ?? 'http://localhost:8065').replace(/\/$/, ''),
  /** Address people use in their browser (links in messages). */
  MM_PUBLIC_URL: (process.env.MM_PUBLIC_URL ?? process.env.MM_URL ?? 'http://localhost:8065').replace(/\/$/, ''),
  MM_TEAM: process.env.MM_TEAM ?? 'humanup',
  /** Address Mattermost uses to call the Hub (buttons, slash commands). */
  HUB_URL_FOR_MM: (process.env.HUB_URL_FOR_MM ?? 'http://localhost:3100').replace(/\/$/, ''),
  /** Address agents use (REST, MCP). */
  HUB_PUBLIC_URL: (process.env.HUB_PUBLIC_URL ?? 'http://localhost:3100').replace(/\/$/, ''),
  CONFIG_DIR,
  SECRETS_DIR,
  get MM_ADMIN_TOKEN() {
    const t = process.env.MM_ADMIN_TOKEN ?? read(join(SECRETS_DIR, 'admin-token'));
    if (!t) throw new Error(`No Mattermost admin token (MM_ADMIN_TOKEN or ${SECRETS_DIR}/admin-token)`);
    return t;
  },
  ACTION_SECRET: process.env.HUB_ACTION_SECRET ?? persistentSecret('hub-action-secret'),
  /** Admin token for the registry and admin endpoints (Méroë, Propium admin pages). */
  ADMIN_TOKEN: process.env.HUB_ADMIN_TOKEN ?? persistentSecret('hub-admin-token'),
  CLAUDE_MODEL: process.env.CLAUDE_TEST_MODEL ?? 'claude-opus-5-5',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
};
