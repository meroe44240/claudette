import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as trash from '../../trash/trash.service.js';
import * as audit from '../../audit/audit.service.js';

// Corbeille et journal : toute suppression est restaurable pendant 30 jours,
// toute écriture a son historique (qui, quand, quel outil, avant / après).

const ENTITIES = 'CANDIDAT, CLIENT, ENTREPRISE (company), MANDAT, CANDIDATURE, ACTIVITE (notes, calls, tasks, emails), LEAD, LEADINTERACTION, JOBOFFER, PROFILRECHERCHE, NOTECALL, POSTLINKEDIN, BOOKING';

export function registerTrashAuditTools(server: McpServer) {
  server.tool(
    'list_trash',
    'Lists what was deleted in the last 30 days, newest first, one row per deletion (a deletion can remove several linked records at once, e.g. a candidate with its applications). Use the batch_id with restore_record. Example: {"q":"Martin"} → {"data":[{"batch_id":"…","deleted_at":"2026-11-22T10:12:00Z","deleted_by":{"name":"Tom (agent)","is_agent":true},"items":[{"entity":"Candidat","id":"…","label":"Léa Martin"}],"also_removed":{"Candidature":2}}]}',
    {
      entity: z.string().optional().describe('Model name of the deleted record, e.g. "Candidat", "Client", "Entreprise", "Mandat", "Lead"'),
      q: z.string().optional().describe('Text search on the deleted record label'),
      page: z.number().int().min(1).optional(),
      limit: z.number().int().min(1).max(100).optional().describe('Default 25'),
    },
    wrapTool('list_trash', async (args) => trash.listTrash({ model: args.entity as string | undefined, q: args.q as string | undefined, page: args.page as number | undefined, limit: args.limit as number | undefined })),
  );

  server.tool(
    'restore_record',
    'Restores a deletion from the trash: the record and everything removed with it come back with their original ids. Pass the batch_id from list_trash, or simply the id of the deleted record. Fails with a clear reason if another record now uses the same unique value (e.g. same email). Example: {"id":"<candidate id>"} → {"batch_id":"…","restored":[{"model":"Candidat","id":"…","label":"Léa Martin"},{"model":"Candidature","id":"…"}],"skipped":[]}',
    { id: z.string().uuid().describe('batch_id from list_trash, or the id of the deleted record') },
    wrapTool('restore_record', async (args) => trash.restore(args.id as string)),
  );

  server.tool(
    'get_record_history',
    `Change history of one record, newest first: who changed what, when, from which tool, with old and new values. Entities: ${ENTITIES}. Example: {"entity":"CANDIDAT","id":"…"} → {"data":[{"at":"…","action":"UPDATE","by":{"name":"Tom (agent)","is_agent":true},"tool":"update_candidate","changes":{"tier":{"old":"B","new":"A"}}}]}`,
    {
      entity: z.string().describe('Entity type, e.g. CANDIDAT, CLIENT, ENTREPRISE, MANDAT, LEAD'),
      id: z.string().uuid().describe('Record id'),
      limit: z.number().int().min(1).max(200).optional().describe('Default 100'),
    },
    wrapTool('get_record_history', async (args) => {
      const r = await audit.history(args.entity as string, args.id as string, (args.limit as number | undefined) ?? 100);
      // Réponse compacte : pas de copie complète avant / après, seulement les changements.
      return { data: r.data.map(({ before: _b, after: _a, ...e }) => e), meta: r.meta };
    }),
  );
}
