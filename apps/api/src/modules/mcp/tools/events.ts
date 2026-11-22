import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import { EVENT_TYPES } from '../../../lib/events.js';
import { getEvents } from '../../events/event.service.js';
import * as webhooks from '../../webhooks/webhook.service.js';
import { describeSchema } from '../records/schema.js';
import { RecordError } from '../records/registry.js';
import { NotFoundError, ValidationError } from '../../../lib/errors.js';

/** Événements, webhooks et description du schéma. */

const TYPES_DOC = Object.entries(EVENT_TYPES).map(([k, v]) => `${k} (${v})`).join('; ');

async function guarded<T>(fn: () => Promise<T> | T) {
  try { return await fn(); } catch (err) {
    if (err instanceof RecordError || err instanceof ValidationError || err instanceof NotFoundError) return { error: err.message };
    throw err;
  }
}

export function registerEventTools(server: McpServer) {
  server.tool(
    'get_events',
    `Events since a date, oldest first, so you can react without re-reading everything. Each event has a type, the record it is about, who did it (person, agent or null for automations) and when. Types: ${TYPES_DOC}. ` +
      'First call with since, then keep calling with the next_cursor you get back (it is always returned, even when there is nothing new). ' +
      'Example: {"since":"2026-11-22T08:00:00Z","types":["stage.changed","lead.created"]} → {"events":[{"id":"…","type":"stage.changed","at":"…","entity":{"type":"application","id":"…","label":null},"by":{"name":"Tom (agent)","is_agent":true},"details":{"from":"ENVOYE_CLIENT","to":"ENTRETIEN_CLIENT","to_label":"Client interview"}}],"next_cursor":"…","has_more":false}',
    {
      since: z.string().optional().describe('ISO date. Required on the first call (ignored when cursor is given)'),
      cursor: z.string().optional().describe('next_cursor from the previous call'),
      types: z.array(z.string()).optional().describe('Only these event types (default: all)'),
      entity_id: z.string().uuid().optional().describe('Only events about this record'),
      limit: z.number().int().min(1).max(500).optional().describe('Default 100'),
    },
    wrapTool('get_events', async (a) => guarded(() => getEvents(a as any))),
  );

  server.tool(
    'describe_schema',
    'Describes the data model: without entity, the list of entities, business codes (pipeline stages with English names, lead stages, presentation channels and statuses, event types); with entity, every field with its type, whether it is required, its possible values, what it links to, and whether you can write it (and with which tool if not). ' +
      'Example: {"entity":"lead"} → {"name":"lead","fields":[{"name":"stage","type":"string","values":["nouveau","contacte","r1",…],"writable":false,"how_to_change":"Use move_lead_stage…"}],"computed":[{"name":"valeurOpportunite"}],"includes":[{"name":"interactions"}]}',
    { entity: z.string().optional().describe('Entity name, e.g. candidate, company, lead') },
    wrapTool('describe_schema', async (a) => guarded(() => describeSchema(a.entity as string | undefined))),
  );

  // ═══ Webhooks ═══
  server.tool(
    'list_webhooks',
    'Lists the outgoing webhooks (URL, subscribed event types, last delivery status). Example: {} → {"data":[{"id":"…","url":"https://bot.example.com/propium","event_types":["lead.created"],"active":true,"last_status":200}]}',
    {},
    wrapTool('list_webhooks', async () => guarded(() => webhooks.list())),
  );

  server.tool(
    'create_webhook',
    `Subscribes a URL to events: Propium POSTs each event as JSON (same shape as get_events) with the headers X-Propium-Event and X-Propium-Signature: sha256=<HMAC of the raw body with the secret>. The secret is returned only now: store it. Empty event_types = all events. Types: ${Object.keys(EVENT_TYPES).join(', ')}. ` +
      'Example: {"url":"https://bot.example.com/propium","event_types":["lead.created","stage.changed"],"description":"Grok sales bot"} → {"id":"…","secret":"whsec_…","active":true}',
    {
      url: z.string().url().describe('https URL that receives the events'),
      event_types: z.array(z.string()).optional(),
      description: z.string().max(255).optional(),
    },
    wrapTool('create_webhook', async (a, user) => guarded(() => webhooks.create({ url: a.url as string, eventTypes: a.event_types as string[] | undefined, description: a.description as string | undefined }, user.userId))),
  );

  server.tool(
    'update_webhook',
    'Changes a webhook: URL, event types, description, or active (false pauses it; true resumes it and resets the failure counter). A webhook is paused automatically after 20 failed deliveries in a row.',
    { id: z.string().uuid(), url: z.string().url().optional(), event_types: z.array(z.string()).optional(), description: z.string().max(255).nullable().optional(), active: z.boolean().optional() },
    wrapTool('update_webhook', async (a) => guarded(() => webhooks.update(a.id as string, { url: a.url as string | undefined, eventTypes: a.event_types as string[] | undefined, description: a.description as string | null | undefined, active: a.active as boolean | undefined }))),
  );

  server.tool(
    'delete_webhook',
    'Deletes a webhook (no more deliveries).',
    { id: z.string().uuid() },
    wrapTool('delete_webhook', async (a) => guarded(() => webhooks.remove(a.id as string))),
  );

  server.tool(
    'test_webhook',
    'Sends a test event (type webhook.test) to a webhook right now and returns the HTTP status, to check the URL and your signature verification. Example: {"id":"…"} → {"delivered":true,"status":200,"error":null}',
    { id: z.string().uuid() },
    wrapTool('test_webhook', async (a) => guarded(() => webhooks.test(a.id as string))),
  );
}
