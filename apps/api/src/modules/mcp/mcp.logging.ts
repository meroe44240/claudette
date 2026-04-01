import prisma from '../../lib/db.js';
import type { PermissionLevel } from './mcp.permissions.js';

export async function logMcpAction(params: {
  userId: string;
  toolName: string;
  level: PermissionLevel;
  input?: unknown;
  output?: unknown;
  success?: boolean;
  error?: string;
  durationMs?: number;
}) {
  try {
    await prisma.mcpActionLog.create({
      data: {
        userId: params.userId,
        toolName: params.toolName,
        level: params.level,
        input: params.input as any,
        output: params.output ? JSON.stringify(params.output).substring(0, 10000) as any : undefined,
        success: params.success ?? true,
        error: params.error,
        durationMs: params.durationMs,
      },
    });
  } catch (err) {
    console.error('[MCP] Failed to log action:', err);
  }
}
