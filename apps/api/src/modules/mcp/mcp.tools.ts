import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMcpUser } from './mcp.auth.js';
import { checkToolAccess, getToolPermission } from './mcp.permissions.js';
import { logMcpAction } from './mcp.logging.js';
import { runWithContext } from '../../lib/request-context.js';
import { writeAudit } from '../../lib/audit-trash.js';
import { rawPrisma } from '../../lib/db.js';
import { registerTrashAuditTools } from './tools/trash-audit.js';
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
  return async (args: Record<string, unknown>) => {
    const start = Date.now();
    let user: ReturnType<typeof getMcpUser>;
    try {
      user = getMcpUser();
    } catch {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Not authenticated. Please sign in via OAuth.' }) }] };
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
        const result = await handler(args, user);
        const durationMs = Date.now() - start;
        _lastToolCallAt = new Date().toISOString();
        await logMcpAction({ userId: user.userId, toolName, level: access.level, input: args, output: result, success: true, durationMs, externe });
        // Une action externe qui a échoué (ex. : Gmail non branché) n'est pas journalisée comme faite.
        const failed = !!result && typeof result === 'object' && 'error' in (result as Record<string, unknown>);
        if (externe && !failed) {
          await writeAudit(rawPrisma, [{ action: 'EXTERNAL', model: 'MCP_TOOL', label: toolName, metadata: { input: args as Record<string, unknown> } }]);
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
]);

export function registerAllTools(server: McpServer) {
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
  registerBlockedTools(server);
}
