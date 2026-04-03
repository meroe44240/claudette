import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMcpUser } from './mcp.auth.js';
import { checkToolAccess, getToolPermission } from './mcp.permissions.js';
import { logMcpAction } from './mcp.logging.js';
// Track last tool call for health check
let _lastToolCallAt: string | null = null;
export function getLastToolCallAt() { return _lastToolCallAt; }

import { registerCandidateTools } from './tools/candidates.js';
import { registerClientTools } from './tools/clients.js';
import { registerCompanyTools } from './tools/companies.js';
import { registerMandateTools } from './tools/mandates.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerSequenceTools } from './tools/sequences.js';
import { registerEmailTools } from './tools/email.js';
import { registerStatsTools } from './tools/stats.js';
import { registerAiTools } from './tools/ai.js';
import { registerNoteTools } from './tools/notes.js';
import { registerBlockedTools } from './tools/blocked.js';
import { registerPushTools } from './tools/pushes.js';
import { registerEnrichTools } from './tools/enrich.js';
import { registerAutoPushTools } from './tools/auto-push.js';

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
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Non authentifie. Veuillez vous connecter via OAuth.' }) }] };
    }

    const access = checkToolAccess(toolName, user.userRole);
    if (!access.allowed) {
      await logMcpAction({ userId: user.userId, toolName, level: access.level, input: args, success: false, error: access.reason });
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: access.reason }) }] };
    }

    try {
      const result = await handler(args, user);
      const durationMs = Date.now() - start;
      _lastToolCallAt = new Date().toISOString();
      await logMcpAction({ userId: user.userId, toolName, level: access.level, input: args, output: result, success: true, durationMs });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    } catch (err: any) {
      const durationMs = Date.now() - start;
      await logMcpAction({ userId: user.userId, toolName, level: access.level, input: args, success: false, error: err.message, durationMs });
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: err.message || 'Erreur interne' }) }] };
    }
  };
}

export function registerAllTools(server: McpServer) {
  registerCandidateTools(server);
  registerClientTools(server);
  registerCompanyTools(server);
  registerMandateTools(server);
  registerTaskTools(server);
  registerSequenceTools(server);
  registerEmailTools(server);
  registerStatsTools(server);
  registerAiTools(server);
  registerNoteTools(server);
  registerPushTools(server);
  registerEnrichTools(server);
  registerAutoPushTools(server);
  registerBlockedTools(server);
}
