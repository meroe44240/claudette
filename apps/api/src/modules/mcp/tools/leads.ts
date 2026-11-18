import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as leadService from '../../leads/lead.service.js';

const STAGES = 'nouveau (new), contacte (contacted), r1, r2, r3, r4, r5, r6, r7 (follow-ups), rdv (meeting booked), gagne (won), perdu (lost)';

export function registerLeadTools(server: McpServer) {
  server.tool(
    'list_leads',
    "Lists prospecting leads (the sales follow-up pipeline). Use when a salesperson asks 'where are my leads', 'my follow-ups to do', etc.",
    {
      stage: z.string().optional().describe(`Filter by stage: ${STAGES}`),
      query: z.string().optional().describe('Free-text search (company, contact)'),
      limit: z.number().optional().default(30),
    },
    wrapTool('list_leads', async (args) => {
      const all = (await leadService.listLeads()) as any[];
      let leads = all;
      if (args.stage) leads = leads.filter((l) => l.stage === args.stage);
      if (args.query) {
        const q = String(args.query).toLowerCase();
        leads = leads.filter((l) => `${l.company || ''} ${l.contact || ''} ${l.role || ''}`.toLowerCase().includes(q));
      }
      return {
        total: leads.length,
        leads: leads.slice(0, (args.limit as number) || 30).map((l) => ({
          id: l.id,
          company: l.company,
          contact: l.contact,
          role: l.role,
          city: l.city,
          stage: l.stage,
          source: l.source,
          last_contact_at: l.lastContactAt,
        })),
      };
    }),
  );

  server.tool(
    'create_lead',
    "[CONFIRMATION REQUIRED] Creates a prospecting lead (a company to approach). You MUST ask for confirmation.",
    {
      company: z.string().describe('Company name'),
      contact: z.string().describe('Contact or decision-maker name'),
      role: z.string().optional().describe('Contact job title'),
      city: z.string().optional(),
      source: z.string().optional().describe('Lead source (LinkedIn, cold call, trade show, referral...)'),
      stage: z.string().optional().describe(`Initial stage (default: nouveau). ${STAGES}`),
    },
    wrapTool('create_lead', async (args, user) => {
      const lead = await leadService.createLead(
        {
          company: args.company as string,
          contact: args.contact as string,
          role: (args.role as string) ?? null,
          city: (args.city as string) ?? null,
          source: (args.source as string) ?? null,
          stage: (args.stage as string) ?? 'nouveau',
        } as any,
        user.userId,
      );
      return { success: true, lead_id: (lead as any).id, message: `Lead "${args.company}" created.` };
    }),
  );

  server.tool(
    'move_lead_stage',
    "[CONFIRMATION REQUIRED] Moves a lead forward in the follow-up pipeline (nouveau -> contacte -> r1..r7 -> rdv). To mark it LOST use lose_lead; to mark it WON (converted to a client) use convert_lead. You MUST ask for confirmation.",
    {
      lead_id: z.string().describe('Lead UUID'),
      stage: z.string().describe(`New stage: ${STAGES}`),
    },
    wrapTool('move_lead_stage', async (args) => {
      if (args.stage === 'perdu') return { error: 'use_lose_lead', message: 'To mark a lead as lost, use lose_lead (reason required).' };
      if (args.stage === 'gagne') return { error: 'use_convert_lead', message: 'To win a lead, use convert_lead (creates the client and the company).' };
      await leadService.updateLead(args.lead_id as string, { stage: args.stage as string });
      return { success: true, message: `Lead moved to "${args.stage}".` };
    }),
  );

  server.tool(
    'add_lead_interaction',
    "[CONFIRMATION REQUIRED] Logs an interaction or follow-up on a lead (call, email, note) and updates the last contact date. You MUST ask for confirmation.",
    {
      lead_id: z.string().describe('Lead UUID'),
      text: z.string().describe("Interaction content (what was said or done)"),
      type: z.string().optional().describe('Type: appel (call), email, linkedin, note...'),
    },
    wrapTool('add_lead_interaction', async (args, user) => {
      await leadService.addInteraction(args.lead_id as string, (args.type as string) ?? null, args.text as string, user.userId);
      return { success: true, message: 'Interaction logged (last contact updated).' };
    }),
  );

  server.tool(
    'lose_lead',
    "[CONFIRMATION REQUIRED] Marks a lead as LOST with a reason. You MUST ask for confirmation.",
    {
      lead_id: z.string().describe('Lead UUID'),
      motif: z.string().describe('Loss reason (not interested, budget, timing, competitor, unreachable, other)'),
      note: z.string().optional().describe('Optional free-text detail'),
    },
    wrapTool('lose_lead', async (args) => {
      await leadService.loseLead(args.lead_id as string, args.motif as string, args.note as string | undefined);
      return { success: true, message: `Lead marked as lost (${args.motif}).` };
    }),
  );

  server.tool(
    'convert_lead',
    "[CONFIRMATION REQUIRED] Converts a won lead into a CLIENT (plus company). Use when a meeting worked out and the prospect becomes a client. You MUST ask for confirmation.",
    {
      lead_id: z.string().describe('Lead UUID'),
    },
    wrapTool('convert_lead', async (args, user) => {
      const result = (await leadService.convertLead(args.lead_id as string, user.userId)) as any;
      if (result?.alreadyConverted) return { success: true, message: 'This lead was already converted.', client_id: result.client?.id };
      return { success: true, client_id: result?.client?.id, message: 'Lead converted into a client (plus company).' };
    }),
  );
}
