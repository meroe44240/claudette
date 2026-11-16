import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import prisma from '../../../lib/db.js';

export function registerNoteTools(server: McpServer) {
  server.tool(
    'add_note',
    "[CONFIRMATION REQUISE] Ajoute une note sur la fiche d'un candidat, client, entreprise ou mandat. Tu DOIS demander confirmation.",
    {
      entity_type: z.string().describe('CANDIDAT, CLIENT, ENTREPRISE, MANDAT'),
      entity_id: z.string().describe("UUID de l'entite"),
      note: z.string().describe('Contenu de la note'),
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
      return { success: true, note_id: activity.id, message: 'Note ajoutee' };
    }),
  );

  // ─── Humanup Notes : calls visio enregistrés par le bot ───
  // Un membre voit ses calls (organisateur ou présent), un admin voit tous les calls.
  const visibleTo = (user: { userId: string; userRole: string }) =>
    user.userRole === 'ADMIN' ? {} : { OR: [{ userId: user.userId }, { memberIds: { has: user.userId } }] };

  server.tool(
    'list_call_notes',
    'Liste les calls visio (Google Meet / Teams) suivis par Humanup Notes : type, statut, participants, liens Propium. Filtrable par periode, type, candidat, client ou mandat.',
    {
      from: z.string().optional().describe('Date de debut ISO (defaut : il y a 30 jours)'),
      to: z.string().optional().describe('Date de fin ISO (defaut : dans 7 jours)'),
      call_type: z.string().optional().describe('QUALIF, INTAKE, PROSPECT ou INTERNE'),
      status: z.string().optional().describe('SCHEDULED, IN_CALL, DONE, FAILED, CANCELLED…'),
      candidat_id: z.string().optional(),
      client_id: z.string().optional(),
      mandat_id: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional().describe('Defaut 50'),
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
    "Detail d'un call Humanup Notes : notes redigees apres le call, questions et reponses, alertes, liens Propium crees ou mis a jour. include_transcript=true ajoute le transcript complet (supprime apres 6 mois).",
    {
      call_id: z.string().describe('UUID du call (voir list_call_notes)'),
      include_transcript: z.boolean().optional(),
    },
    wrapTool('get_call_notes', async (args, user) => {
      const call = await prisma.noteCall.findFirst({
        where: { id: args.call_id as string, ...visibleTo(user) },
      });
      if (!call) return { error: 'Call introuvable ou non accessible' };
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
