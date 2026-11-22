import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';

const BLOCKED_TOOLS = [
  { name: 'export_database', desc: 'Export the database' },
  { name: 'modify_settings', desc: 'Change system settings' },
];

export function registerBlockedTools(server: McpServer) {
  for (const tool of BLOCKED_TOOLS) {
    server.tool(
      tool.name,
      `[BLOCKED] ${tool.desc}. This action is blocked over MCP for security reasons. The user has to do it directly in the web app.`,
      { reason: z.string().optional() },
      wrapTool(tool.name, async () => {
        return { error: `Action not allowed: ${tool.desc}. Please use the HumanUp web app for this.` };
      }),
    );
  }
}
