import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerAllTools } from './mcp.tools.js';
import { getToolPermission } from './mcp.permissions.js';
import { EVENT_TYPES } from '../../lib/events.js';
import { STAGE_LABEL_EN } from './labels.js';

/**
 * Génère AGENTS.md (racine du dépôt) à partir des outils réellement enregistrés sur le serveur
 * MCP. Un test vérifie que le fichier est à jour : `pnpm --filter @humanup/api gen:agents-md`.
 */

export interface ToolInfo { name: string; description: string; params: Array<{ name: string; required: boolean }> }

export function collectTools(): ToolInfo[] {
  const tools: ToolInfo[] = [];
  const fake = {
    tool: (name: string, ...rest: unknown[]) => {
      const description = typeof rest[0] === 'string' ? rest[0] : '';
      const shape = rest.find((x) => !!x && typeof x === 'object' && !Array.isArray(x) && typeof x !== 'function') as Record<string, z.ZodType> | undefined;
      const params = Object.entries(shape ?? {}).map(([k, s]) => ({ name: k, required: !(s as any).isOptional?.() }));
      tools.push({ name, description, params });
    },
  } as unknown as McpServer;
  registerAllTools(fake);
  return tools;
}

const GROUPS: Array<[string, RegExp]> = [
  ['Start here', /^(describe_schema|search_all|get_events|get_daily_brief|plan_my_day)$/],
  ['Undo, trash and history', /^(undo|list_trash|restore_record|get_record_history)$/],
  ['Any entity (generic tools)', /_records?$|^(export_records_csv|import_records_csv)$/],
  ['Ownership', /owner/],
  ['Presentations and push', /presentation|presented|push_status/],
  ['Candidates', /candidate|cv|dossier|debrief|talent|kalent|duplicates|merge_candidates/],
  ['Mandates and pipeline', /mandate|stage|pipeline|job_offer|contract/],
  ['Companies and target profiles', /compan|target_profile|profiles_summary/],
  ['Client contacts and portal', /client|portal/],
  ['Leads (sales prospecting)', /lead/],
  ['Tasks, meetings, notes, calls', /task|rdv|calendar|note|call|relance/],
  ['Email and SMS', /email|sms/],
  ['Enrichment and external search', /enrich|external|credits/],
  ['Stats and team', /stats|team|brief|report/],
  ['Webhooks', /webhook/],
];

function firstSentence(d: string) {
  const clean = d.replace(/\s+/g, ' ').replace(/^\[[A-Z ]+\]\s*/, '').trim().replace(/\be\.g\./g, 'e·g·');
  const cut = clean.search(/\.\s|\. ?Example|\s→/);
  let out = (cut > 0 ? clean.slice(0, cut + 1) : clean).replace(/e·g·/g, 'e.g.').replace(/\|/g, '/');
  if (out.length > 300) out = out.slice(0, out.lastIndexOf(' ', 297)) + '…';
  return out;
}

export function buildAgentsMd(): string {
  const tools = collectTools().sort((a, b) => a.name.localeCompare(b.name));
  const used = new Set<string>();
  const sections: string[] = [];
  for (const [title, re] of [...GROUPS, ['Other', /.*/] as [string, RegExp]]) {
    const inGroup = tools.filter((t) => !used.has(t.name) && re.test(t.name));
    if (!inGroup.length) continue;
    inGroup.forEach((t) => used.add(t.name));
    const rows = inGroup.map((t) => {
      const perm = getToolPermission(t.name);
      const params = t.params.filter((p) => p.name !== 'idempotency_key').map((p) => (p.required ? `**${p.name}**` : p.name)).join(', ') || '(none)';
      const note = perm.level === 'blocked' ? ' Blocked over MCP.' : '';
      return `| \`${t.name}\` | ${firstSentence(t.description)}${note} | ${params} |`;
    });
    sections.push(`### ${title}\n\n| Tool | Use it to | Parameters (bold = required) |\n|---|---|---|\n${rows.join('\n')}`);
  }

  const stages = Object.entries(STAGE_LABEL_EN).map(([k, v]) => `\`${k}\` ${v}`).join(', ');
  const events = Object.entries(EVENT_TYPES).map(([k, v]) => `- \`${k}\`: ${v}`).join('\n');

  return `# AGENTS.md

How AI agents work in Propium (HumanUp's ATS) through its MCP server. This file is generated from the code by \`pnpm --filter @humanup/api gen:agents-md\`; a test fails when it is out of date.

## Connect

- MCP endpoint: \`https://ats.propium.co/mcp\` (Streamable HTTP).
- Authentication: \`Authorization: Bearer <agent key>\`. Each agent has its own key (\`pk_agent_…\`), created on the Agents page by an admin. Everything you do is recorded as "<Name> (agent)".
- Rate limit: per agent, set on the Agents page. Over the limit you get a clear error with the number of seconds to wait.

## Rules of the house

1. **Read before you write.** Start with \`describe_schema\` to learn the entities, fields and codes, and \`search_all\` / \`list_records\` to find records. Never create a record without checking it does not exist.
2. **Check ownership before working an account.** \`get_owner\` on a company, lead or client contact; take it with \`claim_owner\`. If it belongs to someone else you get a conflict with the current owner: talk to them, do not work it.
3. **Check before pushing a candidate.** \`is_candidate_presented\` before presenting a candidate to a company, and \`get_candidate_push_status\` to know if the candidate can be pushed.
4. **Make retries safe.** Every write tool accepts \`idempotency_key\`: reuse the same key when you retry the same action and it will not be done twice (no duplicate record, no second email).
5. **Try first when unsure.** Generic writes, bulk tools, imports and deletions accept \`dry_run: true\`: you see the result, nothing is saved.
6. **Everything can be undone.** Every call that writes returns a \`batch_id\`; \`undo {"batch_id"}\` reverts it. Deleted records stay 30 days in the trash (\`list_trash\`, \`restore_record\`). External actions (email, SMS, call, portal access) cannot be undone: they are marked "external" in the journal.
7. **Use the business tools for business actions.** Pipeline stages change with \`move_candidate_stage\` / \`bulk_move_candidate_stage\`, lead stages with \`move_lead_stage\`, ownership with \`claim_owner\`. The generic tools refuse these fields and tell you which tool to use.
8. **React to events instead of polling everything.** \`get_events\` with \`since\`, then keep the \`next_cursor\`. Admins can also subscribe a URL with \`create_webhook\`.

## Conventions

- Answers are in English. Ids are UUIDs and are always returned.
- Lists are compact by default; ask for more with \`fields\` and \`include\`. Pages use \`cursor\` / \`next_cursor\`.
- Pipeline stages come as a code plus an English name: ${stages}. Talk to people with the English name.
- Errors say what to do: missing field, expected values, closest field name, owner in place.
- Field names of the data model are French (\`nom\`, \`prenom\`, \`entrepriseId\`…): \`describe_schema\` lists them with their meaning.

## Events

${events}

Each event gives its type, the record (type, id, label), who did it (\`null\` for automations), when, and details. Webhooks receive the same JSON, signed with \`X-Propium-Signature: sha256=<HMAC-SHA256 of the raw body>\`.

## Tools (${tools.length})

${sections.join('\n\n')}
`;
}
