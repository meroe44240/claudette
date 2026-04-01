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
}
