import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as sequenceService from '../../sequences/sequence.service.js';

export function registerSequenceTools(server: McpServer) {
  server.tool(
    'get_my_sequences',
    'Recupere les sequences actives du recruteur avec statut et prochaines actions.',
    {},
    wrapTool('get_my_sequences', async (_args, user) => {
      const sequences = await sequenceService.list(user.userId);
      return {
        sequences: sequences.map((s: any) => ({
          id: s.id,
          name: s.nom,
          description: s.description,
          target_type: s.targetType,
          steps_count: s.steps?.length || 0,
          active_runs: s.runs?.filter((r: any) => r.status === 'running').length || 0,
          total_runs: s.runs?.length || 0,
        })),
      };
    }),
  );

  server.tool(
    'start_sequence',
    "[CONFIRMATION REQUISE] Lance une sequence multicanal sur un candidat ou un client. Tu DOIS demander confirmation en montrant le nom de la sequence et les etapes.",
    {
      sequence_id: z.string().describe('UUID de la sequence'),
      target_id: z.string().describe('UUID du candidat ou client'),
      target_type: z.string().describe('candidate ou client'),
      mandate_id: z.string().optional().describe('UUID du mandat lie'),
    },
    wrapTool('start_sequence', async (args, user) => {
      const run = await sequenceService.startRun({
        sequenceId: args.sequence_id as string,
        targetId: args.target_id as string,
        targetType: args.target_type as string,
        mandatId: args.mandate_id as string | undefined,
        assignedToId: user.userId,
      });
      return { success: true, run_id: run.id, message: 'Sequence lancee' };
    }),
  );

  server.tool(
    'pause_sequence',
    "[CONFIRMATION REQUISE] Met en pause une sequence en cours. Tu DOIS demander confirmation.",
    {
      run_id: z.string().describe('UUID du run de sequence'),
    },
    wrapTool('pause_sequence', async (args) => {
      await sequenceService.pauseRun(args.run_id as string);
      return { success: true, message: 'Sequence mise en pause' };
    }),
  );

  server.tool(
    'get_sequence_details',
    "Recupere le detail complet d'une sequence run : etapes passees avec resultats, etape actuelle avec contenu pre-genere, etapes futures avec dates prevues. Utilise pour voir ou en est une sequence de persistance client.",
    {
      run_id: z.string().describe('UUID du run de sequence'),
    },
    wrapTool('get_sequence_details', async (args) => {
      const run = await sequenceService.getRunDetails(args.run_id as string);
      return run;
    }),
  );
}
