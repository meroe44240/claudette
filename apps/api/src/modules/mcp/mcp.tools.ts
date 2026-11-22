import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMcpUser } from './mcp.auth.js';
import { checkToolAccess, getToolPermission } from './mcp.permissions.js';
import { logMcpAction } from './mcp.logging.js';
import { createHash } from 'crypto';
import { z } from 'zod';
import { runWithContext, getContext } from '../../lib/request-context.js';
import { writeAudit } from '../../lib/audit-trash.js';
import { rawPrisma } from '../../lib/db.js';
import { registerTrashAuditTools } from './tools/trash-audit.js';
import { registerRecordTools } from './tools/records.js';
// Track last tool call for health check
let _lastToolCallAt: string | null = null;
export function getLastToolCallAt() { return _lastToolCallAt; }

import { registerCandidateTools } from './tools/candidates.js';
import { registerClientTools } from './tools/clients.js';
import { registerCompanyTools } from './tools/companies.js';
import { registerMandateTools } from './tools/mandates.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerEmailTools } from './tools/email.js';
import { registerStatsTools } from './tools/stats.js';
import { registerAiTools } from './tools/ai.js';
import { registerNoteTools } from './tools/notes.js';
import { registerBlockedTools } from './tools/blocked.js';
import { registerEnrichTools } from './tools/enrich.js';
import { registerKalentTools } from './tools/kalent.js';
import { registerJobOfferTools } from './tools/job-offers.js';
import { registerLeadTools } from './tools/leads.js';
import { registerPortalTools } from './tools/portal.js';
import { registerMergeTools } from './tools/merge.js';
import { registerContractTools } from './tools/contracts.js';
import { registerTargetProfileTools } from './tools/target-profiles.js';

export type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;

/**
 * Wraps a tool handler with permission checking and action logging.
 */
export function wrapTool(toolName: string, handler: (args: Record<string, unknown>, user: ReturnType<typeof getMcpUser>) => Promise<unknown>): ToolHandler {
  return async (inputArgs: Record<string, unknown>) => {
    let args = inputArgs ?? {};
    const start = Date.now();
    let user: ReturnType<typeof getMcpUser>;
    try {
      user = getMcpUser();
    } catch {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Not authenticated. Please sign in via OAuth.' }) }] };
    }

    // Clé d'idempotence : retirée des arguments, la réponse du premier appel est rejouée.
    const idemKey = typeof args.idempotency_key === 'string' && args.idempotency_key.trim() ? args.idempotency_key.trim().slice(0, 200) : undefined;
    if ('idempotency_key' in args) { args = { ...args }; delete args.idempotency_key; }
    const argsHash = idemKey ? createHash('sha256').update(toolName + '\n' + stableJson(args)).digest('hex') : '';
    if (idemKey) {
      const prev = await rawPrisma.mcpIdempotencyKey.findUnique({ where: { userId_key: { userId: user.userId, key: idemKey } } });
      if (prev) {
        if (prev.toolName !== toolName || prev.argsHash !== argsHash) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `idempotency_key "${idemKey}" was already used on ${prev.createdAt.toISOString()} for a different call (${prev.toolName}). Use a new key for a new action.` }) }] };
        }
        const replay = prev.response && typeof prev.response === 'object' && !Array.isArray(prev.response)
          ? { ...(prev.response as Record<string, unknown>), idempotent_replay: true }
          : prev.response;
        return { content: [{ type: 'text' as const, text: JSON.stringify(replay) }] };
      }
    }

    const access = checkToolAccess(toolName, user.userRole, user.estAgent);
    const externe = EXTERNAL_TOOLS.has(toolName);
    if (!access.allowed) {
      await logMcpAction({ userId: user.userId, toolName, level: access.level, input: args, success: false, error: access.reason, externe });
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: access.reason }) }] };
    }

    // Un appel d'outil = un contexte : ses écritures partagent un lot (journal, corbeille).
    return runWithContext({ source: 'MCP', userId: user.userId, toolName, externe }, async () => {
      try {
        let result = await handler(args, user);
        const durationMs = Date.now() - start;
        _lastToolCallAt = new Date().toISOString();
        await logMcpAction({ userId: user.userId, toolName, level: access.level, input: args, output: result, success: true, durationMs, externe });
        // Une action externe qui a échoué (ex. : Gmail non branché) n'est pas journalisée comme faite.
        const failed = !!result && typeof result === 'object' && 'error' in (result as Record<string, unknown>);
        if (externe && !failed) {
          await writeAudit(rawPrisma, [{ action: 'EXTERNAL', model: 'MCP_TOOL', label: toolName, metadata: { input: args as Record<string, unknown> } }]);
        }
        // Un appel qui a écrit quelque chose renvoie son lot : undo {"batch_id"} l'annule.
        const batchId = getContext()?.batchId;
        if (batchId && !failed && result && typeof result === 'object' && !Array.isArray(result) && !READ_TOOL.test(toolName)) {
          try {
            const [wrote, trashed] = await Promise.all([
              rawPrisma.auditLog.count({ where: { batchId } }),
              rawPrisma.trashEntry.count({ where: { batchId } }),
            ]);
            if (wrote || trashed) result = { ...(result as Record<string, unknown>), batch_id: batchId };
          } catch { /* le lot est un plus : sa lecture ne fait jamais échouer l'appel */ }
        }
        if (idemKey && !failed) {
          await rawPrisma.mcpIdempotencyKey.create({
            data: { userId: user.userId, key: idemKey, toolName, argsHash, response: JSON.parse(JSON.stringify(result ?? {})) },
          }).catch(() => { /* même clé enregistrée en parallèle : la première gagne */ });
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (err: any) {
        const durationMs = Date.now() - start;
        await logMcpAction({ userId: user.userId, toolName, level: access.level, input: args, success: false, error: err.message, durationMs, externe });
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message || 'Internal error' }) }] };
      }
    });
  };
}

/** Outils qui agissent hors de Propium : autorisés, mais marqués « externe » dans le journal. */
export const EXTERNAL_TOOLS = new Set([
  'send_email', 'grant_portal_access', 'revoke_portal_access', 'click_to_call', 'create_rdv', 'enrich_contact',
  'send_sms', 'request_candidate_confirmation',
]);

/** Outils de lecture : pas de clé d'idempotence, pas de batch_id. */
export const READ_TOOL = /^(get|list|search|find|suggest|plan|match|export)_/;

function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as any)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

const IDEMPOTENCY_PARAM = z.string().max(200).optional()
  .describe('Optional. Any unique string (e.g. a UUID) for this action: calling again with the same key returns the first result instead of doing it twice. Keys are kept 7 days.');

/** Ajoute idempotency_key au schéma de tous les outils d'écriture. */
function withIdempotency(server: McpServer): McpServer {
  return new Proxy(server, {
    get(target, prop, receiver) {
      if (prop !== 'tool') return Reflect.get(target, prop, receiver);
      return (name: string, ...rest: unknown[]) => {
        if (!READ_TOOL.test(name)) {
          const i = rest.findIndex((x) => !!x && typeof x === 'object' && !Array.isArray(x) && Object.values(x as object).every((v) => v instanceof z.ZodType));
          if (i >= 0) rest[i] = { ...(rest[i] as object), idempotency_key: IDEMPOTENCY_PARAM };
        }
        return (target.tool as any).call(target, name, ...rest);
      };
    },
  });
}

export function registerAllTools(rawServer: McpServer) {
  const server = withIdempotency(rawServer);
  registerCandidateTools(server);
  registerClientTools(server);
  registerCompanyTools(server);
  registerMandateTools(server);
  registerTaskTools(server);
  registerEmailTools(server);
  registerStatsTools(server);
  registerAiTools(server);
  registerNoteTools(server);
  registerEnrichTools(server);
  registerKalentTools(server);
  registerJobOfferTools(server);
  registerLeadTools(server);
  registerPortalTools(server);
  registerMergeTools(server);
  registerContractTools(server);
  registerTargetProfileTools(server);
  registerTrashAuditTools(server);
  registerRecordTools(server);
  registerBlockedTools(server);
}
