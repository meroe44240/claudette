import { AsyncLocalStorage } from 'async_hooks';
import type { Role } from '@prisma/client';

export interface McpUserContext {
  userId: string;
  userEmail: string;
  userRole: Role;
}

const mcpUserStore = new AsyncLocalStorage<McpUserContext>();

export function runWithMcpUser<T>(ctx: McpUserContext, fn: () => T): T {
  return mcpUserStore.run(ctx, fn);
}

export function getMcpUser(): McpUserContext {
  const ctx = mcpUserStore.getStore();
  if (!ctx) throw new Error('MCP user context not available');
  return ctx;
}
