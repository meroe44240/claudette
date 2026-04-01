import type { FastifyInstance } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { verifyAccessToken } from '../../lib/jwt.js';
import prisma from '../../lib/db.js';
import { runWithMcpUser } from './mcp.auth.js';
import { registerAllTools } from './mcp.tools.js';
import type { Role } from '@prisma/client';

export default async function mcpPlugin(fastify: FastifyInstance) {
  // Create the MCP server
  const mcpServer = new McpServer({
    name: 'humanup-ats',
    version: '1.0.0',
  });

  // Register all tools
  registerAllTools(mcpServer);

  // Session tracking
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  // Cleanup stale sessions every 5 minutes
  const cleanupInterval = setInterval(() => {
    // StreamableHTTPServerTransport doesn't expose lastAccess, so we just limit total sessions
    if (sessions.size > 100) {
      const toDelete = Array.from(sessions.keys()).slice(0, sessions.size - 50);
      for (const key of toDelete) {
        const transport = sessions.get(key);
        transport?.close();
        sessions.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  fastify.addHook('onClose', () => {
    clearInterval(cleanupInterval);
    for (const transport of sessions.values()) {
      transport.close();
    }
    sessions.clear();
  });

  // ─── Helper: extract and verify user from auth header ───
  async function authenticateMcpRequest(request: any): Promise<{ userId: string; userEmail: string; userRole: Role } | null> {
    const authHeader = request.headers.authorization as string | undefined;
    if (!authHeader?.startsWith('Bearer ')) return null;
    try {
      const payload = await verifyAccessToken(authHeader.slice(7));
      return { userId: payload.sub, userEmail: payload.email, userRole: payload.role as Role };
    } catch {
      return null;
    }
  }

  // ─── POST /mcp — Main JSON-RPC endpoint ───────────────
  fastify.post('/', async (request, reply) => {
    const user = await authenticateMcpRequest(request);

    const sessionId = request.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      // Existing session
      const transport = sessions.get(sessionId)!;
      reply.hijack();
      if (user) {
        await runWithMcpUser(user, () => transport.handleRequest(request.raw, reply.raw, request.body));
      } else {
        await transport.handleRequest(request.raw, reply.raw, request.body);
      }
      return;
    }

    // New session — auth required for initialization
    if (!sessionId) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        onsessioninitialized: (newSessionId) => {
          sessions.set(newSessionId, transport);
        },
      });

      transport.onclose = () => {
        const sid = Array.from(sessions.entries()).find(([, t]) => t === transport)?.[0];
        if (sid) sessions.delete(sid);
      };

      await mcpServer.connect(transport);

      reply.hijack();
      if (user) {
        await runWithMcpUser(user, () => transport.handleRequest(request.raw, reply.raw, request.body));
      } else {
        await transport.handleRequest(request.raw, reply.raw, request.body);
      }
      return;
    }

    // Session not found
    return reply.status(400).send({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Session not found. Omit Mcp-Session-Id to start a new session.' },
      id: null,
    });
  });

  // ─── GET /mcp — SSE stream for notifications ──────────
  fastify.get('/', async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      return reply.status(400).send({ error: 'Invalid or missing session ID' });
    }
    const transport = sessions.get(sessionId)!;
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw);
  });

  // ─── DELETE /mcp — Session termination ────────────────
  fastify.delete('/', async (request, reply) => {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId)!;
      transport.close();
      sessions.delete(sessionId);
    }
    return reply.status(200).send({ ok: true });
  });
}
