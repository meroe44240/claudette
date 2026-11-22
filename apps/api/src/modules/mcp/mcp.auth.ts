import { AsyncLocalStorage } from 'async_hooks';
import type { Role } from '@prisma/client';
import { runWithContext } from '../../lib/request-context.js';

export interface McpUserContext {
  userId: string;
  userEmail: string;
  userRole: Role;
  /** Compte agent IA : accès total aux données métier, sans confirmation. */
  estAgent?: boolean;
}

const mcpUserStore = new AsyncLocalStorage<McpUserContext>();

export function runWithMcpUser<T>(ctx: McpUserContext, fn: () => T): T {
  return mcpUserStore.run(ctx, () => runWithContext({ source: 'MCP', userId: ctx.userId }, fn));
}

export function getMcpUser(): McpUserContext {
  const ctx = mcpUserStore.getStore();
  if (!ctx) throw new Error('MCP user context not available');
  return ctx;
}
