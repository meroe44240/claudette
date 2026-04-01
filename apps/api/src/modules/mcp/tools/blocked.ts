import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';

const BLOCKED_TOOLS = [
  { name: 'delete_candidate', desc: 'Supprimer un candidat' },
  { name: 'delete_client', desc: 'Supprimer un client' },
  { name: 'delete_mandate', desc: 'Supprimer un mandat' },
  { name: 'delete_company', desc: 'Supprimer une entreprise' },
  { name: 'export_database', desc: "Exporter la base de donnees" },
  { name: 'modify_settings', desc: 'Modifier les parametres systeme' },
];

export function registerBlockedTools(server: McpServer) {
  for (const tool of BLOCKED_TOOLS) {
    server.tool(
      tool.name,
      `[INTERDIT] ${tool.desc} — Cette action est bloquee via MCP pour des raisons de securite. L'utilisateur doit effectuer cette action directement dans l'interface web.`,
      { reason: z.string().optional() },
      wrapTool(tool.name, async () => {
        return { error: `Action interdite : ${tool.desc}. Veuillez utiliser l'interface web de HumanUp pour cette operation.` };
      }),
    );
  }
}
