import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as tacheService from '../../taches/tache.service.js';

export function registerTaskTools(server: McpServer) {
  server.tool(
    'get_my_tasks',
    "Recupere les taches du recruteur : en retard, aujourd'hui, cette semaine, par priorite.",
    {
      status: z.enum(['todo', 'overdue', 'done', 'all']).optional().default('todo').describe('Filtre : todo, overdue, done, all'),
    },
    wrapTool('get_my_tasks', async (args, user) => {
      const result = await tacheService.list(
        { page: 1, perPage: 50 },
        { status: (args.status as 'todo' | 'overdue' | 'done' | 'all') || 'todo', userId: user.userId },
      );
      return {
        total: result.meta.total,
        tasks: result.data.map((t: any) => ({
          id: t.id,
          title: t.titre,
          content: t.contenu,
          priority: t.tachePriority,
          due_date: t.tacheDueDate,
          entity_type: t.entiteType,
          entity_id: t.entiteId,
          is_completed: t.tacheCompletedAt !== null,
          completed_at: t.tacheCompletedAt,
        })),
      };
    }),
  );

  server.tool(
    'create_task',
    "[CONFIRMATION REQUISE] Cree une nouvelle tache. Tu DOIS demander confirmation.",
    {
      titre: z.string().describe('Titre de la tache'),
      contenu: z.string().optional().describe('Description detaillee'),
      entiteType: z.string().optional().describe('CANDIDAT, CLIENT, ENTREPRISE, MANDAT'),
      entiteId: z.string().optional().describe("UUID de l'entite liee"),
      tacheDueDate: z.string().optional().describe('Date d\'echeance (ISO 8601)'),
      tachePriority: z.string().optional().describe('HAUTE, NORMALE, BASSE'),
    },
    wrapTool('create_task', async (args, user) => {
      const createData: any = {
        titre: args.titre as string,
        contenu: (args.contenu as string) || '',
        tacheDueDate: args.tacheDueDate as string | undefined,
        tachePriority: (args.tachePriority as any) || 'MOYENNE',
        userId: user.userId,
      };
      // Only include entity fields if both are provided
      if (args.entiteType && args.entiteId) {
        createData.entiteType = args.entiteType as string;
        createData.entiteId = args.entiteId as string;
      }
      const task = await tacheService.create(createData);
      return { success: true, task_id: task.id, message: `Tache "${args.titre}" creee` };
    }),
  );

  server.tool(
    'complete_task',
    "[CONFIRMATION REQUISE] Marque une tache comme terminee. Tu DOIS demander confirmation.",
    {
      task_id: z.string().describe('UUID de la tache'),
    },
    wrapTool('complete_task', async (args) => {
      await tacheService.complete(args.task_id as string);
      return { success: true, message: 'Tache marquee comme terminee' };
    }),
  );
}
