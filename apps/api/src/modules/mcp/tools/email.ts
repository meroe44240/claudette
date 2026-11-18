import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import prisma from '../../../lib/db.js';

export function registerEmailTools(server: McpServer) {
  server.tool(
    'get_my_emails',
    'Gets the latest emails sent or received that are linked to ATS contacts.',
    {
      limit: z.number().optional().default(10),
    },
    wrapTool('get_my_emails', async (args, user) => {
      const emails = await prisma.activite.findMany({
        where: {
          userId: user.userId,
          type: 'EMAIL',
        },
        orderBy: { createdAt: 'desc' },
        take: (args.limit as number) || 10,
        select: {
          id: true,
          titre: true,
          contenu: true,
          direction: true,
          entiteType: true,
          entiteId: true,
          createdAt: true,
        },
      });
      return {
        emails: emails.map(e => ({
          id: e.id,
          subject: e.titre,
          preview: e.contenu?.substring(0, 200),
          direction: e.direction,
          entity_type: e.entiteType,
          entity_id: e.entiteId,
          date: e.createdAt,
        })),
      };
    }),
  );

  server.tool(
    'send_email',
    "[CONFIRMATION REQUIRED] Sends an email through Gmail from the user's account. You MUST ALWAYS show the user the full email and get their confirmation BEFORE sending.",
    {
      to_email: z.string().describe('Recipient email address'),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Email body, plain text or simple HTML'),
      entity_type: z.string().optional().describe('CANDIDAT, CLIENT'),
      entity_id: z.string().optional().describe('UUID of the linked record'),
      mandate_id: z.string().optional().describe('UUID of the linked mandate'),
    },
    wrapTool('send_email', async (args, user) => {
      // Import Gmail service dynamically to avoid circular deps
      const { sendEmail: sendGmail } = await import('../../integrations/gmail.service.js');

      await sendGmail(user.userId, {
        to: args.to_email as string,
        subject: args.subject as string,
        body: args.body as string,
      });

      // Log activity
      await prisma.activite.create({
        data: {
          type: 'EMAIL',
          titre: args.subject as string,
          contenu: (args.body as string).substring(0, 1000),
          direction: 'SORTANT',
          source: 'AGENT_IA',
          entiteType: args.entity_type as any,
          entiteId: args.entity_id as string,
          userId: user.userId,
        },
      });

      return { success: true, message: `Email sent to ${args.to_email}` };
    }),
  );
}
