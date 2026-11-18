import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import prisma from '../../../lib/db.js';

export function registerNoteTools(server: McpServer) {
  server.tool(
    'add_note',
    "[CONFIRMATION REQUIRED] Adds a note to a candidate, client contact, company or mandate record. You MUST ask for confirmation.",
    {
      entity_type: z.string().describe('CANDIDAT, CLIENT, ENTREPRISE, MANDAT'),
      entity_id: z.string().describe('UUID of the record'),
      note: z.string().describe('Note content'),
    },
    wrapTool('add_note', async (args, user) => {
      const activity = await prisma.activite.create({
        data: {
          type: 'NOTE',
          titre: 'Note',
          contenu: args.note as string,
          source: 'AGENT_IA',
          entiteType: args.entity_type as any,
          entiteId: args.entity_id as string,
          userId: user.userId,
        },
      });
      return { success: true, note_id: activity.id, message: 'Note added' };
    }),
  );

  // ─── Humanup Notes : calls visio enregistrés par le bot ───
  // Un membre voit ses calls (organisateur ou présent), un admin voit tous les calls.
  const visibleTo = (user: { userId: string; userRole: string }) =>
    user.userRole === 'ADMIN' ? {} : { OR: [{ userId: user.userId }, { memberIds: { has: user.userId } }] };

  server.tool(
    'list_call_notes',
    'Lists the video calls (Google Meet / Teams) recorded by Humanup Notes: type, status, attendees, Propium links. Can be filtered by period, type, candidate, client or mandate.',
    {
      from: z.string().optional().describe('ISO start date (default: 30 days ago)'),
      to: z.string().optional().describe('ISO end date (default: 7 days from now)'),
      call_type: z.string().optional().describe('QUALIF (candidate qualification), INTAKE (client intake), PROSPECT or INTERNE (internal)'),
      status: z.string().optional().describe('SCHEDULED, IN_CALL, DONE, FAILED, CANCELLED…'),
      candidat_id: z.string().optional(),
      client_id: z.string().optional(),
      mandat_id: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional().describe('Default 50'),
    },
    wrapTool('list_call_notes', async (args, user) => {
      const from = args.from ? new Date(args.from as string) : new Date(Date.now() - 30 * 86400_000);
      const to = args.to ? new Date(args.to as string) : new Date(Date.now() + 7 * 86400_000);
      const calls = await prisma.noteCall.findMany({
        where: {
          ...visibleTo(user),
          startAt: { gte: from, lte: to },
          ...(args.call_type ? { callType: String(args.call_type).toUpperCase() } : {}),
          ...(args.status ? { status: String(args.status).toUpperCase() } : {}),
          ...(args.candidat_id ? { candidatId: args.candidat_id as string } : {}),
          ...(args.client_id ? { clientId: args.client_id as string } : {}),
          ...(args.mandat_id ? { mandatId: args.mandat_id as string } : {}),
        },
        orderBy: { startAt: 'desc' },
        take: (args.limit as number) || 50,
        select: {
          id: true, titre: true, startAt: true, endAt: true, platform: true, callType: true, status: true,
          attendees: true, candidatId: true, clientId: true, mandatId: true, leadId: true,
          notesMarkdown: true, userId: true, memberIds: true,
        },
      });
      const owners = await prisma.user.findMany({ where: { id: { in: [...new Set(calls.map((c) => c.userId))] } }, select: { id: true, email: true } });
      const ownerEmail = new Map(owners.map((o) => [o.id, o.email]));
      return {
        count: calls.length,
        calls: calls.map(({ notesMarkdown, ...c }) => ({ ...c, owner: ownerEmail.get(c.userId) ?? null, has_notes: !!notesMarkdown })),
      };
    }),
  );

  server.tool(
    'get_call_notes',
    'Details of a Humanup Notes call: notes written after the call, questions and answers, alerts, Propium records created or updated. include_transcript=true adds the full transcript (deleted after 6 months).',
    {
      call_id: z.string().describe('UUID of the call (see list_call_notes)'),
      include_transcript: z.boolean().optional(),
    },
    wrapTool('get_call_notes', async (args, user) => {
      const call = await prisma.noteCall.findFirst({
        where: { id: args.call_id as string, ...visibleTo(user) },
      });
      if (!call) return { error: 'Call not found or not accessible' };
      const { webhookSecret, recallBotId, transcript, brief, ...rest } = call;
      const owner = await prisma.user.findUnique({ where: { id: call.userId }, select: { email: true } });
      return {
        ...rest,
        owner: owner?.email ?? null,
        brief_excerpt: brief ? brief.slice(0, 2000) : null,
        ...(args.include_transcript ? { transcript } : { transcript_segments: Array.isArray(transcript) ? transcript.length : 0 }),
      };
    }),
  );
}
