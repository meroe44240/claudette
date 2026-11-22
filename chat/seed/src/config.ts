// Loads and validates humans.yaml and agents.yaml.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export type Human = {
  key: string;
  first_name: string;
  last_name: string;
  email: string;
  position?: string;
  admin: boolean;
  timezone: string;
  ui_locale: string;
  agent_lang: string;
  propium_user_id?: string;
};

export type Recipients = 'all' | 'team' | 'team-except-meroe' | string[];

export type Agent = {
  key: string;
  name: string;
  title: string;
  scope: string;
  reports_to?: string;
  escalation?: string;
  recipients: Recipients;
  dm?: Recipients;
  hidden_from_team: boolean;
  registry: 'team' | 'admin-only';
  report?: { channel: string; cron: string };
  [k: string]: unknown;
};

const USERNAME = /^[a-z][a-z0-9._-]{2,21}$/;

export function loadConfig(dir: string): { humans: Human[]; agents: Agent[] } {
  const h = parse(readFileSync(join(dir, 'humans.yaml'), 'utf8'));
  const a = parse(readFileSync(join(dir, 'agents.yaml'), 'utf8'));

  const humans: Human[] = Object.entries<any>(h.humans ?? {}).map(([key, v]) => ({
    key,
    admin: false,
    ...h.defaults,
    ...v,
  }));
  const agents: Agent[] = Object.entries<any>(a.agents ?? {}).map(([key, v]) => ({
    key,
    hidden_from_team: false,
    ...a.defaults,
    ...v,
  }));

  const errors: string[] = [];
  const humanKeys = new Set(humans.map((x) => x.key));
  const allKeys = new Set([...humanKeys, ...agents.map((x) => x.key)]);
  for (const x of humans) {
    if (!USERNAME.test(x.key)) errors.push(`human key "${x.key}" is not a valid username`);
    if (!x.email?.includes('@')) errors.push(`human ${x.key}: email missing`);
  }
  for (const x of agents) {
    if (!USERNAME.test(x.key)) errors.push(`agent key "${x.key}" is not a valid username`);
    if (!x.name || !x.title || !x.scope) errors.push(`agent ${x.key}: name, title and scope are required`);
    for (const ref of [x.reports_to, x.escalation].filter(Boolean) as string[]) {
      if (!allKeys.has(ref)) errors.push(`agent ${x.key}: unknown "${ref}"`);
    }
    for (const field of ['recipients', 'dm'] as const) {
      const v = x[field];
      if (Array.isArray(v)) for (const r of v) if (!humanKeys.has(r)) errors.push(`agent ${x.key}.${field}: unknown human "${r}"`);
    }
    if (x.hidden_from_team && !Array.isArray(x.recipients)) {
      errors.push(`agent ${x.key}: a hidden agent needs an explicit recipients list`);
    }
  }
  const humanAgentClash = humans.filter((x) => agents.some((y) => y.key === x.key));
  for (const x of humanAgentClash) errors.push(`"${x.key}" is both a human and an agent`);
  if (humans.filter((x) => x.admin).length !== 1) errors.push('exactly one human must have admin: true');
  if (errors.length) throw new Error('Invalid config:\n  ' + errors.join('\n  '));
  return { humans, agents };
}

/** Humans who get a DM with this agent. */
export function dmHumansFor(a: Agent, humans: Human[]): string[] {
  const spec: Recipients = a.dm ?? (a.hidden_from_team ? a.recipients : 'all');
  if (Array.isArray(spec)) return spec;
  return humans.map((h) => h.key);
}
