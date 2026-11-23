// HTTP: agent REST API, MCP server, registry, and the endpoints Mattermost calls.

import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import formbody from '@fastify/formbody';
import { timingSafeEqual } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { env } from './env.js';
import { one, q } from './db.js';
import { type Agent, ToolError, audit } from './core.js';
import { setPaused, sentToday } from './guard.js';
import { buildPolicy } from './policy.js';
import { onApprovalDialog } from './approvals.js';
import { runScheduler } from './scheduler.js';
import { humanByMmId } from './core.js';
import { sha256 } from './sync.js';
import { tools, runTool } from './tools.js';
import { queryRegistry, toCsv } from './registry.js';
import { handleAction, handleCommand } from './mm-integration.js';

function bearer(req: FastifyRequest) {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : (req.headers['x-api-key'] as string | undefined) ?? '';
}

async function agentFromRequest(req: FastifyRequest): Promise<Agent | null> {
  const key = bearer(req);
  if (!key.startsWith('hub_')) return null;
  return one<Agent>('select * from agents where api_key_sha256=$1', [sha256(key)]);
}

const isAdmin = (req: FastifyRequest) => {
  const a = Buffer.from(bearer(req));
  const b = Buffer.from(env.ADMIN_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
};

function sendError(reply: FastifyReply, e: unknown) {
  if (e instanceof ToolError) return reply.code(e.status).send({ error: e.message });
  console.error(e);
  return reply.code(500).send({ error: 'Internal error' });
}

export async function buildServer() {
  const app = Fastify({ logger: { level: env.LOG_LEVEL === 'debug' ? 'info' : 'warn' }, bodyLimit: 1_000_000 });
  await app.register(formbody);

  app.get('/healthz', async () => ({ ok: true }));

  // ── Agent REST API ─────────────────────────────────────────────────────────
  app.get('/v1/agents/me', async (req, reply) => {
    const agent = await agentFromRequest(req);
    if (!agent) return reply.code(401).send({ error: 'Invalid agent key' });
    return { key: agent.key, name: agent.name, title: agent.title, scope: agent.scope, delivery_mode: agent.delivery_mode,
      rules: agent.rules, status: agent.status, tools: tools.map((t) => t.name) };
  });

  app.get('/v1/agents/me/pending', async (req, reply) => {
    const agent = await agentFromRequest(req);
    if (!agent) return reply.code(401).send({ error: 'Invalid agent key' });
    try {
      return await runTool(agent, 'get_pending_messages', {});
    } catch (e) {
      return sendError(reply, e);
    }
  });

  app.post<{ Params: { name: string } }>('/v1/tools/:name', async (req, reply) => {
    const agent = await agentFromRequest(req);
    if (!agent) return reply.code(401).send({ error: 'Invalid agent key' });
    try {
      return await runTool(agent, req.params.name, req.body ?? {});
    } catch (e) {
      return sendError(reply, e);
    }
  });

  // ── Registry (Méroë via admin token, readers like Inès via their agent key) ─
  app.get<{ Querystring: Record<string, string> }>('/v1/registry', async (req, reply) => {
    const admin = isAdmin(req);
    const agent = admin ? null : await agentFromRequest(req);
    if (!admin && !agent?.rules?.registry_reader) return reply.code(403).send({ error: 'Not allowed' });
    const { agent: ag, human, status, since, until, format } = req.query;
    const rows = await queryRegistry({ agent: ag, human, status, since, until, includeConfidential: admin });
    if (format === 'csv') {
      return reply.header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="humanup-chat-registry.csv"').send(toCsv(rows));
    }
    return { questions: rows };
  });

  app.get<{ Querystring: Record<string, string> }>('/v1/admin/audit', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Not allowed' });
    const rows = await q(`select * from audit_log where ($1::timestamptz is null or ts >= $1) order by ts desc limit 10000`,
      [req.query.since ?? null]);
    if (req.query.format === 'csv') return reply.header('Content-Type', 'text/csv; charset=utf-8').send(toCsv(rows));
    return { entries: rows };
  });

  // ── MCP (stateless Streamable HTTP, same tools as REST) ────────────────────
  app.post('/mcp', async (req, reply) => {
    const agent = await agentFromRequest(req);
    if (!agent) return reply.code(401).send({ jsonrpc: '2.0', error: { code: -32001, message: 'Invalid agent key' }, id: null });
    const server = new Server({ name: 'humanup-chat', version: '1.0.0' }, { capabilities: { tools: {} } });
    const visible = tools.filter((t) => t.name !== 'query_registry' || agent.rules.registry_reader);
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: visible.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema as any })),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (r) => {
      try {
        const out = await runTool(agent, r.params.name, r.params.arguments ?? {});
        return { content: [{ type: 'text', text: JSON.stringify(out) }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: e instanceof ToolError ? e.message : 'Internal error' }], isError: true };
      }
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.on('close', () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
  app.get('/mcp', async (_req, reply) => reply.code(405).send({ error: 'Use POST' }));
  app.delete('/mcp', async (_req, reply) => reply.code(405).send({ error: 'Stateless server' }));

  // ── Admin: agents, counters, kill switch ───────────────────────────────────
  app.get('/v1/admin/agents', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Not allowed' });
    const rows = await q<any>(
      `select a.key, a.name, a.title, a.status, a.paused_at, a.paused_by, a.delivery_mode, a.provider,
              coalesce((a.rules->>'daily_message_budget')::int, 200) as budget,
              (select count(*)::int from questions qq where qq.agent_key=a.key and qq.status='open') as open_questions,
              (select count(*)::int from events e where e.agent_key=a.key and e.status='pending') as pending_events
         from agents a order by a.name`);
    for (const r of rows) r.sent_today = await sentToday(r.key);
    return { agents: rows };
  });
  app.post<{ Params: { key: string; action: string } }>('/v1/admin/agents/:key/:action', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Not allowed' });
    const { key, action } = req.params;
    if (action !== 'pause' && action !== 'resume') return reply.code(404).send({ error: 'pause or resume' });
    const done = await setPaused(key === 'all' ? 'all' : [key], action === 'pause', 'admin-api');
    if (!done.length) return reply.code(404).send({ error: 'Unknown agent' });
    return { [action === 'pause' ? 'paused' : 'resumed']: done.map((d) => d.key) };
  });

  // Runs the scheduler now (reminders, escalations, reports, scheduled messages). ?now= to simulate a time (tests).
  app.post<{ Querystring: { now?: string } }>('/v1/admin/tick', async (req, reply) => {
    if (!isAdmin(req)) return reply.code(403).send({ error: 'Not allowed' });
    const now = req.query.now ? new Date(req.query.now) : new Date();
    if (Number.isNaN(now.getTime())) return reply.code(400).send({ error: 'Bad now' });
    return runScheduler(now);
  });

  // ── Called by the Mattermost plugin (internal network only; Caddy blocks /hub/mm/*) ──
  const isPlugin = (req: FastifyRequest) => {
    const a = Buffer.from(bearer(req));
    const b = Buffer.from(env.PLUGIN_SECRET);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  app.get('/mm/policy', async (req, reply) => {
    if (!isPlugin(req)) return reply.code(401).send({ error: 'Unauthorized' });
    return buildPolicy();
  });
  app.post('/mm/audit', async (req, reply) => {
    if (!isPlugin(req)) return reply.code(401).send({ error: 'Unauthorized' });
    const b = (req.body ?? {}) as Record<string, string>;
    const who = await one<{ key: string; type: string }>(
      `select key, 'agent' as type from agents where mm_user_id=$1 union all select key, 'human' from humans where mm_user_id=$1`, [b.user_id]);
    await audit((who?.type as 'agent' | 'human') ?? 'hub', who?.key ?? b.user_id ?? 'unknown', `plugin.${b.reason ?? 'blocked'}`,
      b.channel_id, { channel_id: b.channel_id });
    return { ok: true };
  });

  // ── Called by Mattermost ───────────────────────────────────────────────────
  app.post('/mm/actions', async (req) => handleAction(req.body));
  app.post('/mm/dialog', async (req) => {
    const body: any = req.body ?? {};
    return onApprovalDialog(body, body.user_id ? await humanByMmId(body.user_id) : null);
  });
  app.post('/mm/command', async (req, reply) => {
    const r = await handleCommand(req.body as Record<string, string>);
    return reply.code(r.status).send(r.body);
  });

  return app;
}
