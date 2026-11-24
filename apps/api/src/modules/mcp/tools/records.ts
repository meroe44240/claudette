import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import { ENTITIES, RecordError } from '../records/registry.js';
import * as engine from '../records/engine.js';
import { undoBatch } from '../records/undo.js';
import { exportCsv, importCsv, MAX_EXPORT } from '../records/csv.js';
import { searchAll, SEARCH_TYPES } from '../records/search.js';
import * as mandatService from '../../mandats/mandat.service.js';
import { updateMandatSchema } from '../../mandats/mandat.schema.js';
import * as candidatureService from '../../candidatures/candidature.service.js';
import * as confirmationService from '../../confirmation/confirmation.service.js';
import { sendSms } from '../../integrations/allo.service.js';
import prisma from '../../../lib/db.js';
import { STAGES_DOC, stageEn } from '../labels.js';

/**
 * Outils génériques (toutes les entités) et outils nommés qui manquaient pour les cinq
 * entités principales. Chaque écriture renvoie un batch_id : undo {"batch_id"} l'annule.
 */

const ENTITY_DOC = ENTITIES.map((e) => `${e.name} (${e.description}${e.readOnly ? ', read only' : ''})`).join('; ');
const entity = z.string().describe(`Entity name: ${ENTITIES.map((e) => e.name).join(', ')}`);
const where = z.record(z.string(), z.any()).optional().describe(engine.FILTER_DOC);
const fields = z.array(z.string()).optional().describe('Fields to return (Prisma field names). Default: the main fields. id is always returned.');
const include = z.array(z.string()).optional().describe('Related data to embed, e.g. ["experiences","applications","activities"] on candidate. The error lists what is available.');
const dryRun = z.boolean().optional().describe('true = check and show what would happen, change nothing');
const stopOnError = z.boolean().optional().describe('Stop at the first failed item (default false: process all and report each line)');

/** Les erreurs prévues remontent en { error } (avec détails), comme les autres outils. */
async function guarded<T>(fn: () => Promise<T>) {
  try { return await fn(); } catch (err) {
    if (err instanceof RecordError) return { error: err.message, ...(err.details ?? {}) };
    throw err;
  }
}

export function registerRecordTools(server: McpServer) {
  // ═══ Lecture ═══
  server.tool(
    'list_records',
    `Lists records of any entity with filters, sort, cursor pagination, field selection and related data. Entities: ${ENTITY_DOC}. ` +
      'Example: {"entity":"candidate","where":{"tier":"A","localisation":{"contains":"Paris"}},"sort":"-updatedAt","fields":["prenom","nom","posteActuel"],"limit":50} ' +
      '→ {"entity":"candidate","total":132,"data":[{"id":"…","prenom":"Léa","nom":"Martin","posteActuel":"CSM"}],"next_cursor":"eyJpZCI6Ii4uLiJ9"}. Pass next_cursor back as cursor for the next page (null = last page).',
    {
      entity, where,
      q: z.string().optional().describe('Free text on the main text fields (name, email, title…)'),
      sort: z.string().optional().describe('Comma-separated fields, "-" for descending, e.g. "-updatedAt" or "nom,-createdAt". Default -updatedAt'),
      fields, include,
      cursor: z.string().optional().describe('next_cursor from the previous page'),
      limit: z.number().int().min(1).max(engine.MAX_LIMIT).optional().describe(`Default 25, max ${engine.MAX_LIMIT}`),
    },
    wrapTool('list_records', async (a) => guarded(() => engine.listRecords(a as any))),
  );

  server.tool(
    'get_record',
    'Gets one record with all its fields, plus related data with include. Example: {"entity":"mandate","id":"…","include":["applications","company"]} → {"id":"…","titrePoste":"Head of Sales","company":{"nom":"Acme"},"applications":[{"id":"…","stage":"ENTRETIEN_CLIENT","candidat":{"prenom":"Léa","nom":"Martin"}}]}',
    { entity, id: z.string().uuid(), fields, include },
    wrapTool('get_record', async (a) => guarded(() => engine.getRecord(a.entity as string, a.id as string, a.fields as string[] | undefined, a.include as string[] | undefined))),
  );

  server.tool(
    'search_all',
    `Global search across ${SEARCH_TYPES.join(', ')}, like the search bar of the web app. Example: {"q":"acme"} → {"results":{"company":{"total":1,"results":[{"id":"…","label":"Acme","detail":"SaaS · Paris"}]},"candidate":{"total":0,"results":[]}}}`,
    {
      q: z.string().min(1).describe('Words to search'),
      types: z.array(z.string()).optional().describe(`Limit to some types: ${SEARCH_TYPES.join(', ')}`),
      limit: z.number().int().min(1).max(25).optional().describe('Results per type, default 5'),
    },
    wrapTool('search_all', async (a) => guarded(() => searchAll(a.q as string, a.types as string[] | undefined, a.limit as number | undefined))),
  );

  // ═══ Écriture unitaire ═══
  server.tool(
    'create_record',
    'Creates a record of any entity (field names as in list_records). For business actions prefer the named tools (create_candidate, add_candidate_to_mandate, create_task…): they also send notifications and fill computed fields. ' +
      'Use idempotency_key to make a retry safe. Example: {"entity":"candidate_experience","data":{"candidatId":"…","titre":"Account Executive","entreprise":"Acme","anneeDebut":2022}} → {"id":"…","titre":"Account Executive",…,"batch_id":"…"}',
    { entity, data: z.record(z.string(), z.any()).describe('Field values'), dry_run: dryRun },
    wrapTool('create_record', async (a, user) => guarded(() => engine.createRecord(a.entity as string, a.data as Record<string, unknown>, user.userId, !!a.dry_run))),
  );

  server.tool(
    'update_record',
    'Partial update of any record: only the fields you pass change. Returns the old and new value of each changed field. Example: {"entity":"company","id":"…","data":{"secteur":"Fintech"}} → {"id":"…","changes":{"secteur":{"old":null,"new":"Fintech"}},"batch_id":"…"}. Undo with undo {"batch_id"}.',
    { entity, id: z.string().uuid(), data: z.record(z.string(), z.any()).describe('Fields to change; null empties a field'), dry_run: dryRun },
    wrapTool('update_record', async (a) => guarded(() => engine.updateRecord(a.entity as string, a.id as string, a.data as Record<string, unknown>, !!a.dry_run))),
  );

  server.tool(
    'delete_record',
    'Deletes a record. It goes to the trash with everything removed with it and can be restored for 30 days (restore_record or undo). Use dry_run first to see what would be removed. Example: {"entity":"lead","id":"…","dry_run":true} → {"dry_run":true,"would_delete":{"entity":"lead","id":"…"},"also_removed":{"LeadInteraction":3}}',
    { entity, id: z.string().uuid(), dry_run: dryRun },
    wrapTool('delete_record', async (a) => guarded(() => engine.deleteRecord(a.entity as string, a.id as string, !!a.dry_run))),
  );

  // ═══ Masse ═══
  server.tool(
    'bulk_create_records',
    `Creates up to ${engine.MAX_BULK} records in one call, with a line-by-line report. One call = one batch: undo {"batch_id"} removes them all. Example: {"entity":"lead","rows":[{"company":"Acme","contact":"Jean Dupont"},{"company":"Beta"}],"dry_run":true} → {"dry_run":true,"summary":{"total":2,"succeeded":1,"failed":1},"items":[{"index":0,"ok":true},{"index":1,"ok":false,"error":"Missing required field(s) for lead: contact."}]}`,
    { entity, rows: z.array(z.record(z.string(), z.any())).describe('One object of field values per record'), dry_run: dryRun, stop_on_error: stopOnError },
    wrapTool('bulk_create_records', async (a, user) => guarded(() => engine.bulkCreate(a.entity as string, a.rows as any[], user.userId, !!a.dry_run, !!a.stop_on_error))),
  );

  server.tool(
    'bulk_update_records',
    `Updates up to ${engine.MAX_BULK} records: either "items" (one id + data each) or "ids" / "where" with one "data" for all. Line-by-line report with old and new values. Example: {"entity":"candidate","where":{"source":"kalent","tier":{"is_null":true}},"data":{"tier":"C"},"dry_run":true}`,
    {
      entity,
      items: z.array(z.object({ id: z.string().uuid(), data: z.record(z.string(), z.any()) })).optional(),
      ids: z.array(z.string().uuid()).optional(),
      where, q: z.string().optional(),
      data: z.record(z.string(), z.any()).optional().describe('Same changes for every record (with ids or where)'),
      dry_run: dryRun, stop_on_error: stopOnError,
    },
    wrapTool('bulk_update_records', async (a) => guarded(async () => {
      let items = a.items as Array<{ id: string; data: Record<string, unknown> }> | undefined;
      if (!items) {
        if (!a.data) throw new RecordError('Pass items, or ids / where together with data.');
        const ids = (a.ids as string[] | undefined) ?? await engine.idsMatching(a.entity as string, a.where as any, a.q as string | undefined);
        items = ids.map((id) => ({ id, data: a.data as Record<string, unknown> }));
      }
      return engine.bulkUpdate(a.entity as string, items, !!a.dry_run, !!a.stop_on_error);
    })),
  );

  server.tool(
    'bulk_delete_records',
    `Deletes up to ${engine.MAX_BULK} records (by ids or by filter). Everything goes to the trash for 30 days; undo {"batch_id"} restores them all. dry_run shows the count and what would be removed with them.`,
    { entity, ids: z.array(z.string().uuid()).optional(), where, q: z.string().optional(), dry_run: dryRun, stop_on_error: stopOnError },
    wrapTool('bulk_delete_records', async (a) => guarded(async () => {
      const ids = (a.ids as string[] | undefined) ?? await engine.idsMatching(a.entity as string, a.where as any, a.q as string | undefined);
      return engine.bulkDelete(a.entity as string, ids, !!a.dry_run, !!a.stop_on_error);
    })),
  );

  // ═══ Annulation ═══
  server.tool(
    'undo',
    'Undoes everything one tool call did, using the batch_id returned by that call (also visible in get_record_history and on the Journal page): updates go back to their old values, creations are deleted (to the trash), deletions are restored. ' +
      'A field changed again since by someone else is kept and reported. External actions (email, SMS, call) cannot be undone. You can only undo your own calls unless you are an admin. ' +
      'Example: {"batch_id":"…"} → {"summary":{"reverted":2,"skipped":0},"reverted":[{"action":"UPDATE","entity":"Entreprise","label":"Acme","detail":{"fields":["secteur"]}}],"skipped":[]}',
    { batch_id: z.string().uuid() },
    wrapTool('undo', async (a, user) => guarded(() => undoBatch(a.batch_id as string, user.userId, user.userRole === 'ADMIN'))),
  );

  // ═══ CSV ═══
  server.tool(
    'export_records_csv',
    `Exports a filtered view of one entity as CSV text (comma separated, header = field names), up to ${MAX_EXPORT} rows. Same where / q / sort / fields as list_records. Example: {"entity":"lead","where":{"stage":"rdv"},"fields":["company","contact","email","phone"]} → {"rows":12,"total":12,"truncated":false,"csv":"company,contact,email,phone\\nAcme,Jean Dupont,…"}`,
    { entity, where, q: z.string().optional(), sort: z.string().optional(), fields, limit: z.number().int().min(1).max(MAX_EXPORT).optional() },
    wrapTool('export_records_csv', async (a) => guarded(() => exportCsv(a as any))),
  );

  server.tool(
    'import_records_csv',
    `Imports up to ${engine.MAX_BULK} rows from CSV text (comma, semicolon or tab separated; first row = headers). Headers are field names (any case), or map them with mapping {"Header":"field"} ("" ignores a column). ` +
      'Without an id column rows are created; with an id column (or match_on, e.g. "email") matching records are updated. Always run with dry_run first. ' +
      'Example: {"entity":"candidate","csv":"prenom;nom;email\\nLéa;Martin;lea@x.fr","dry_run":true} → {"mode":"create","dry_run":true,"summary":{"total":1,"succeeded":1,"failed":0},"items":[{"row":2,"ok":true}]}',
    {
      entity, csv: z.string().min(1).describe('CSV text'),
      mapping: z.record(z.string(), z.string()).optional(),
      match_on: z.string().optional().describe('Field used to find existing records to update (default: id column if present)'),
      dry_run: dryRun, stop_on_error: stopOnError,
    },
    wrapTool('import_records_csv', async (a, user) => guarded(() => importCsv({ ...(a as any), userId: user.userId }))),
  );

  // ═══ Outils nommés manquants ═══
  for (const [tool, ent, label] of [['delete_client', 'client', 'client contact'], ['delete_mandate', 'mandate', 'mandate'], ['delete_company', 'company', 'company'], ['delete_lead', 'lead', 'lead']] as const) {
    server.tool(
      tool,
      `Deletes a ${label}. It goes to the trash with what is removed with it (applications, activities…) and can be restored for 30 days with restore_record or undo. Use dry_run to see what would be removed. A company that still has contacts cannot be deleted: delete or move the contacts first.`,
      { id: z.string().uuid().describe(`${label} id`), dry_run: dryRun },
      wrapTool(tool, async (a) => guarded(() => engine.deleteRecord(ent, a.id as string, !!a.dry_run))),
    );
  }

  server.tool(
    'get_lead',
    'Gets a lead with its interactions (calls, emails, notes). Example: {"id":"…"} → {"id":"…","company":"Acme","contact":"Jean Dupont","stage":"r2","interactions":[{"type":"appel","text":"…","createdAt":"…"}]}',
    { id: z.string().uuid() },
    wrapTool('get_lead', async (a) => guarded(() => engine.getRecord('lead', a.id as string, undefined, ['interactions']))),
  );

  server.tool(
    'update_lead',
    'Partial update of a lead (company, contact, role, email, phone, city, sector, headcount, source, ownerId, entrepriseId…). The stage changes with move_lead_stage, lose_lead or convert_lead. Example: {"id":"…","data":{"phone":"+33612345678","ownerId":"<user id>"}} → {"id":"…","changes":{"phone":{"old":null,"new":"+33612345678"}}}',
    { id: z.string().uuid(), data: z.record(z.string(), z.any()), dry_run: dryRun },
    wrapTool('update_lead', async (a) => guarded(() => engine.updateRecord('lead', a.id as string, a.data as Record<string, unknown>, !!a.dry_run))),
  );

  server.tool(
    'update_mandate',
    'Updates a mandate like the edit form of the web app: title, status (OUVERT, EN_COURS, GAGNE, PERDU, ANNULE, CLOTURE), priority, salary range (the estimated fee is recalculated), fee %, description, job description (ficheDePoste), team (assignedToId, recruteurId, salesId, sourceurId)… ' +
      'Won (GAGNE) needs a placed candidate first. Closing without a placement (PERDU, ANNULE, CLOTURE) needs raisonPerte (why the deal was lost): it is recorded in the lost deals with the fee of each open position. ' +
      'Forecast fields: nbPostes (openings), feeType (POURCENTAGE_PACKAGE, POURCENTAGE_FIXE, MONTANT_FIXE), feeMontantFixe, devise (EUR, USD, GBP…), sourceDeal (PARAFORM or null), paraformNbVersements, splitSalesPct (sales share, recruiter gets the rest), paymentTerms. Example: {"id":"…","data":{"priorite":"HAUTE","salaireMax":90000}} → {"id":"…","changes":{"priorite":{"old":"NORMALE","new":"HAUTE"},"salaireMax":{"old":80000,"new":90000},"feeMontantEstime":{"old":16000,"new":18000}}}',
    { id: z.string().uuid(), data: z.record(z.string(), z.any()).describe('Fields: ' + Object.keys(updateMandatSchema.shape).join(', ')) },
    wrapTool('update_mandate', async (a) => guarded(async () => {
      const parsed = updateMandatSchema.strict().safeParse(a.data);
      if (!parsed.success) throw new RecordError(`Invalid data: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'data'}: ${i.message}`).join('; ')}`);
      const before: any = await prisma.mandat.findUnique({ where: { id: a.id as string } });
      if (!before) throw new RecordError(`No mandate with id ${a.id}.`);
      const st = parsed.data.statut;
      if (st && ['PERDU', 'ANNULE', 'CLOTURE'].includes(st) && st !== before.statut && !parsed.data.raisonPerte?.trim()) {
        throw new RecordError('Closing a mandate without a placement needs raisonPerte: ask the user why the deal was lost, then call again with data.raisonPerte.');
      }
      const after: any = await mandatService.update(a.id as string, parsed.data);
      const changes: Record<string, { old: unknown; new: unknown }> = {};
      for (const k of Object.keys(before)) {
        if (k === 'updatedAt') continue;
        if (JSON.stringify(before[k]) !== JSON.stringify(after?.[k])) changes[k] = { old: before[k], new: after?.[k] };
      }
      return { id: a.id, changes };
    })),
  );

  server.tool(
    'duplicate_mandate',
    'Duplicates a mandate (same company, contact, salary, fee, description) as a new open mandate titled "<title> (copie)", without its candidates. Example: {"id":"…"} → {"id":"<new id>","titrePoste":"Head of Sales (copie)"}',
    { id: z.string().uuid() },
    wrapTool('duplicate_mandate', async (a) => guarded(async () => {
      const m: any = await mandatService.clone(a.id as string);
      return { id: m.id, titrePoste: m.titrePoste, statut: m.statut };
    })),
  );

  server.tool(
    'bulk_move_candidate_stage',
    `Moves several applications to the same stage in one call (like the multi-select move of the pipeline): history and notifications as with move_candidate_stage. Stages: ${STAGES_DOC}. Lost (REFUSE) needs motif_refus. Won (PLACE) is not allowed in bulk: use move_candidate_stage for each placement.`,
    {
      candidature_ids: z.array(z.string().uuid()).min(1).max(engine.MAX_BULK),
      new_stage: z.string(),
      motif_refus: z.string().optional(),
      motif_refus_detail: z.string().optional(),
    },
    wrapTool('bulk_move_candidate_stage', async (a, user) => guarded(async () => {
      const ids = a.candidature_ids as string[];
      const before = await prisma.candidature.findMany({ where: { id: { in: ids } }, select: { id: true, stage: true } });
      const moved: any[] = ((await candidatureService.bulkUpdateStage(ids, a.new_stage as string, user.userId, a.motif_refus as string | undefined, a.motif_refus_detail as string | undefined)) as any).results ?? [];
      const movedIds = new Set(moved.map((m) => m.id));
      return {
        stage: a.new_stage, stage_label: stageEn(a.new_stage as string),
        summary: { total: ids.length, moved: movedIds.size, unchanged: ids.length - movedIds.size },
        items: ids.map((id) => {
          const b = before.find((x) => x.id === id);
          if (!b) return { id, ok: false, error: 'Application not found.' };
          return movedIds.has(id) ? { id, ok: true, from: b.stage } : { id, ok: true, unchanged: true, reason: 'Already at this stage.' };
        }),
      };
    })),
  );

  server.tool(
    'list_tasks',
    'Lists tasks of the whole team (get_my_tasks only shows yours), with filters. Example: {"status":"overdue","assignee_id":"<user id>"} → {"total":3,"data":[{"id":"…","titre":"Relancer Acme","tacheDueDate":"…","userId":"…","entiteType":"CLIENT","entiteId":"…"}],"next_cursor":null}',
    {
      status: z.enum(['todo', 'overdue', 'done', 'all']).optional().describe('Default todo (open tasks, due today or later, or without date)'),
      assignee_id: z.string().uuid().optional().describe('Only tasks of this user'),
      entite_type: z.enum(['CANDIDAT', 'CLIENT', 'ENTREPRISE', 'MANDAT']).optional(),
      entite_id: z.string().uuid().optional(),
      cursor: z.string().optional(), limit: z.number().int().min(1).max(engine.MAX_LIMIT).optional(),
    },
    wrapTool('list_tasks', async (a) => guarded(() => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const w: Record<string, unknown> = { isTache: true };
      const status = (a.status as string | undefined) ?? 'todo';
      if (status === 'done') w.tacheCompleted = true;
      if (status === 'todo') w.tacheCompleted = false;
      if (status === 'overdue') { w.tacheCompleted = false; w.tacheDueDate = { lt: today.toISOString() }; }
      if (a.assignee_id) w.userId = a.assignee_id;
      if (a.entite_type) w.entiteType = a.entite_type;
      if (a.entite_id) w.entiteId = a.entite_id;
      return engine.listRecords({
        entity: 'activity', where: w, sort: status === 'done' ? '-updatedAt' : 'tacheDueDate', cursor: a.cursor as string | undefined, limit: a.limit as number | undefined,
        fields: ['titre', 'contenu', 'tacheDueDate', 'tacheCompleted', 'userId', 'entiteType', 'entiteId', 'metadata', 'createdAt'],
      });
    })),
  );

  server.tool(
    'update_task',
    'Changes a task: title, content, due date, assignee (userId), done / not done. Example: {"id":"…","data":{"tacheDueDate":"2026-11-28","userId":"<user id>"}} → {"id":"…","changes":{"tacheDueDate":{"old":"2026-11-24T00:00:00.000Z","new":"2026-11-28T00:00:00.000Z"}}}',
    { id: z.string().uuid(), data: z.record(z.string(), z.any()).describe('Fields: titre, contenu, tacheDueDate, tacheCompleted, userId'), dry_run: dryRun },
    wrapTool('update_task', async (a) => guarded(async () => {
      const allowed = new Set(['titre', 'contenu', 'tacheDueDate', 'tacheCompleted', 'userId']);
      const bad = Object.keys(a.data as object).filter((k) => !allowed.has(k));
      if (bad.length) throw new RecordError(`Fields not allowed on a task: ${bad.join(', ')}. Allowed: ${[...allowed].join(', ')}.`);
      const t = await prisma.activite.findUnique({ where: { id: a.id as string }, select: { isTache: true } });
      if (!t?.isTache) throw new RecordError(`No task with id ${a.id}.`);
      return engine.updateRecord('activity', a.id as string, a.data as Record<string, unknown>, !!a.dry_run);
    })),
  );

  server.tool(
    'send_sms',
    '[EXTERNAL] Sends an SMS from your Allo line to a candidate or client, and logs it in their Messages thread. Cannot be undone. Use idempotency_key so a retry never sends twice. Example: {"to_phone":"+33612345678","message":"Bonjour Léa…","entite_type":"CANDIDAT","entite_id":"…"} → {"success":true}',
    {
      to_phone: z.string().describe('E.164 phone number, e.g. +33612345678'),
      message: z.string().min(1).max(1500),
      entite_type: z.enum(['CANDIDAT', 'CLIENT']).optional(),
      entite_id: z.string().uuid().optional(),
    },
    wrapTool('send_sms', async (a, user) => {
      const r = await sendSms(user.userId, a.to_phone as string, a.message as string, { entiteType: a.entite_type as string | undefined, entiteId: a.entite_id as string | undefined });
      return r.success ? r : { error: r.error ?? 'SMS not sent' };
    }),
  );

  server.tool(
    'request_candidate_confirmation',
    '[EXTERNAL] Emails the candidate to confirm their interest and consent to send their CV to the client (same as the "Ask for confirmation" button). The answer updates the application. Example: {"candidat_id":"…"} → {"sent":true,…}',
    { candidat_id: z.string().uuid() },
    wrapTool('request_candidate_confirmation', async (a) => confirmationService.requestConfirmation(a.candidat_id as string)),
  );
}
