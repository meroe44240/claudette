import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as tacheService from '../../taches/tache.service.js';

export function registerTaskTools(server: McpServer) {
  server.tool(
    'get_my_tasks',
    "Gets the user's tasks: overdue, today, this week, by priority.",
    {
      status: z.enum(['todo', 'overdue', 'done', 'all']).optional().default('todo').describe('Filter: todo, overdue, done, all'),
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
    "[CONFIRMATION REQUIRED] Creates a new task. You MUST ask for confirmation.",
    {
      titre: z.string().describe('Task title'),
      contenu: z.string().optional().describe('Detailed description'),
      entiteType: z.string().optional().describe('CANDIDAT, CLIENT, ENTREPRISE, MANDAT'),
      entiteId: z.string().optional().describe('UUID of the linked record'),
      tacheDueDate: z.string().optional().describe('Due date (ISO 8601)'),
      tachePriority: z.string().optional().describe('HAUTE (high), NORMALE (normal), BASSE (low)'),
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
      return { success: true, task_id: task.id, message: `Task "${args.titre}" created` };
    }),
  );

  server.tool(
    'complete_task',
    "[CONFIRMATION REQUIRED] Marks a task as done. You MUST ask for confirmation.",
    {
      task_id: z.string().describe('UUID of the task'),
    },
    wrapTool('complete_task', async (args) => {
      await tacheService.complete(args.task_id as string);
      return { success: true, message: 'Task marked as done' };
    }),
  );
}
