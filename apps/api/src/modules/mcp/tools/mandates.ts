import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as mandatService from '../../mandats/mandat.service.js';
import * as candidatureService from '../../candidatures/candidature.service.js';
import * as settingsService from '../../settings/settings.service.js';
import { STAGE_LABEL_EN, STAGES_DOC, stageEn } from '../labels.js';

const MOTIFS_DOC = 'SALAIRE (salary), PROFIL_PAS_ALIGNE (profile not aligned), CANDIDAT_DECLINE (candidate declined), CLIENT_REFUSE (client rejected), TIMING, POSTE_POURVU (position filled), AUTRE (other)';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resout une reference de personne (UUID ou nom libre) vers un userId.
 * - UUID : verifie l'existence dans l'equipe.
 * - Nom : match insensible a la casse sur "prenom nom" / nom / prenom.
 * Retourne { userId, label } si 1 seul match, sinon { error, candidates }.
 */
async function resolvePerson(
  ref: string,
): Promise<{ userId: string; label: string } | { error: string; message: string; candidates: { id: string; name: string }[] }> {
  const team = (await settingsService.listTeamMembers()) as { id: string; nom: string | null; prenom: string | null }[];
  const roster = team.map((u) => ({ id: u.id, name: `${u.prenom || ''} ${u.nom || ''}`.trim() }));

  if (UUID_RE.test(ref)) {
    const hit = roster.find((u) => u.id === ref.toLowerCase());
    if (hit) return { userId: hit.id, label: hit.name };
    return { error: 'user_not_found', message: `No team member with UUID ${ref}.`, candidates: roster };
  }

  const needle = ref.trim().toLowerCase();
  const matches = roster.filter((u) => u.name.toLowerCase().includes(needle));
  if (matches.length === 1) return { userId: matches[0].id, label: matches[0].name };
  if (matches.length === 0) {
    return { error: 'user_not_found', message: `No team member matches "${ref}". Use list_team to see the exact names.`, candidates: roster };
  }
  return {
    error: 'user_ambiguous',
    message: `Several team members match "${ref}". Ask the user which one, then call again with the UUID or the full name.`,
    candidates: matches,
  };
}

export function registerMandateTools(server: McpServer) {
  server.tool(
    'list_team',
    "Lists the team members who can be assigned to a mandate (sales or recruiter), with their UUID. Use before assign_mandate to resolve a name, or when asked who is on the team.",
    {},
    wrapTool('list_team', async () => {
      const team = (await settingsService.listTeamMembers()) as { id: string; nom: string | null; prenom: string | null }[];
      return {
        total: team.length,
        members: team.map((u) => ({ id: u.id, name: `${u.prenom || ''} ${u.nom || ''}`.trim() })),
      };
    }),
  );

  server.tool(
    'assign_mandate',
    "[CONFIRMATION REQUIRED] Assigns the pair working a mandate: the SALES (owns the client side) and/or the RECRUITER (sources candidates). " +
      "Accepts a name OR a UUID for each role. Provide at least one. To remove an assignment, pass clear_sales=true or clear_recruteur=true. " +
      "If a name is ambiguous or not found, the tool returns the member list: ask the user to clarify. You MUST ask for confirmation.",
    {
      mandate_id: z.string().optional().describe('Mandate UUID'),
      mandate_name: z.string().optional().describe('Mandate name/title if no UUID'),
      sales: z.string().optional().describe('Person to assign as SALES (name or UUID)'),
      recruteur: z.string().optional().describe('Person to assign as RECRUITER (name or UUID)'),
      clear_sales: z.boolean().optional().describe('true to remove the sales from the mandate'),
      clear_recruteur: z.boolean().optional().describe('true to remove the recruiter from the mandate'),
    },
    wrapTool('assign_mandate', async (args) => {
      // ── Resolution du mandat ──
      let mandate: any;
      if (args.mandate_id) {
        mandate = await mandatService.getById(args.mandate_id as string);
      } else if (args.mandate_name) {
        const results = await mandatService.list({ page: 1, perPage: 1 }, args.mandate_name as string);
        mandate = results.data[0];
      }
      if (!mandate) return { error: 'mandate_not_found', message: 'Mandate not found. Give the mandate_id or a more precise mandate_name.' };

      const hasSales = typeof args.sales === 'string' && (args.sales as string).trim() !== '';
      const hasRecruteur = typeof args.recruteur === 'string' && (args.recruteur as string).trim() !== '';
      if (!hasSales && !hasRecruteur && !args.clear_sales && !args.clear_recruteur) {
        return { error: 'no_assignment', message: 'Provide at least one role: sales, recruteur, clear_sales or clear_recruteur.' };
      }

      const updates: Record<string, unknown> = {};
      const applied: string[] = [];

      if (hasSales) {
        const r = await resolvePerson(args.sales as string);
        if ('error' in r) return r;
        updates.salesId = r.userId;
        applied.push(`Sales: ${r.label}`);
      } else if (args.clear_sales) {
        updates.salesId = null;
        applied.push('Sales removed');
      }

      if (hasRecruteur) {
        const r = await resolvePerson(args.recruteur as string);
        if ('error' in r) return r;
        updates.recruteurId = r.userId;
        applied.push(`Recruiter: ${r.label}`);
      } else if (args.clear_recruteur) {
        updates.recruteurId = null;
        applied.push('Recruiter removed');
      }

      await mandatService.update(mandate.id, updates as any);
      return {
        success: true,
        mandate_id: mandate.id,
        mandate: mandate.titrePoste,
        message: `Mandate "${mandate.titrePoste}": ${applied.join(', ')}.`,
      };
    }),
  );

  server.tool(
    'search_mandates',
    "Searches mandates by title, company, client or status. Use when the recruiter asks where mandate X stands or how many mandates are active.",
    {
      query: z.string().optional().describe('Free-text search'),
      status: z.string().optional().describe('Filter by status: OUVERT (open), EN_COURS (in progress), GAGNE (won), PERDU (lost), ANNULE (cancelled), CLOTURE (closed)'),
      limit: z.number().optional().default(10),
    },
    wrapTool('search_mandates', async (args, user) => {
      const result = await mandatService.list(
        { page: 1, perPage: (args.limit as number) || 10 },
        args.query as string | undefined,
        args.status as string | undefined,
        undefined,
        undefined,
        undefined, // assignedToId — tous les recruteurs voient tous les mandats
      );
      return {
        total: result.meta.total,
        mandates: result.data.map((m: any) => ({
          id: m.id,
          title: m.titrePoste,
          company: m.entreprise?.nom,
          client: m.client ? `${m.client.prenom || ''} ${m.client.nom}`.trim() : null,
          status: m.statut,
          priority: m.priorite,
          fee_percentage: m.feePourcentage,
          fee_estimated: m.feeMontantEstime,
          candidates_count: m._count?.candidatures || m.candidatures?.length,
          created_at: m.createdAt,
        })),
      };
    }),
  );

  server.tool(
    'get_mandate',
    "Gets the full mandate record with pipeline, stats, client and fees.",
    {
      mandate_id: z.string().optional().describe('Mandate UUID'),
      mandate_name: z.string().optional().describe('Mandate name if no UUID'),
    },
    wrapTool('get_mandate', async (args) => {
      let mandate: any;
      if (args.mandate_id) {
        mandate = await mandatService.getById(args.mandate_id as string);
      } else if (args.mandate_name) {
        const results = await mandatService.list({ page: 1, perPage: 1 }, args.mandate_name as string);
        mandate = results.data[0];
        if (mandate) mandate = await mandatService.getById(mandate.id);
      }
      if (!mandate) return { error: 'Mandate not found' };

      return {
        id: mandate.id,
        title: mandate.titrePoste,
        description: mandate.description?.substring(0, 500),
        company: mandate.entreprise?.nom,
        client: mandate.client ? `${mandate.client.prenom || ''} ${mandate.client.nom}`.trim() : null,
        status: mandate.statut,
        priority: mandate.priorite,
        location: mandate.localisation,
        salary_range: `${mandate.salaireMin || '?'} - ${mandate.salaireMax || '?'}`,
        fee_percentage: mandate.feePourcentage,
        fee_estimated: mandate.feeMontantEstime,
        fee_billed: mandate.montantFacture,
        fee_status: mandate.feeStatut,
        candidates: mandate.candidatures?.map((ca: any) => ({
          id: ca.candidat?.id,
          candidature_id: ca.id,
          name: ca.candidat ? `${ca.candidat.prenom || ''} ${ca.candidat.nom}`.trim() : null,
          stage: ca.stage ?? ca.stade,
          stage_label: stageEn(ca.stage ?? ca.stade),
          title: ca.candidat?.posteActuel,
        })),
        created_at: mandate.createdAt,
      };
    }),
  );

  server.tool(
    'get_mandate_pipeline',
    "Gets the full pipeline of a mandate: candidates grouped by stage (keys are stage codes, see stage_labels for the English names). Use when the recruiter asks to see the pipeline of mandate X.",
    {
      mandate_id: z.string().describe('Mandate UUID'),
    },
    wrapTool('get_mandate_pipeline', async (args) => {
      const kanban = await mandatService.getKanban(args.mandate_id as string);
      return { stage_labels: STAGE_LABEL_EN, ...kanban };
    }),
  );

  server.tool(
    'create_mandate',
    "[CONFIRMATION REQUIRED] [ADMIN ONLY] Creates a new mandate. You MUST ask for confirmation.",
    {
      titrePoste: z.string().describe('Job title'),
      entrepriseId: z.string().describe('Company UUID'),
      clientId: z.string().optional().describe('Client contact UUID'),
      description: z.string().optional(),
      localisation: z.string().optional(),
      salaireMin: z.number().optional(),
      salaireMax: z.number().optional(),
      feePourcentage: z.number().optional().describe('Fee as a percentage (e.g. 20)'),
      priorite: z.string().optional().describe('BASSE (low), NORMALE (normal), HAUTE (high), URGENTE (urgent)'),
    },
    wrapTool('create_mandate', async (args, user) => {
      const mandate = await mandatService.create(args as any, user.userId);
      return { success: true, mandate_id: mandate.id, message: `Mandate "${args.titrePoste}" created` };
    }),
  );

  server.tool(
    'move_candidate_stage',
    "[CONFIRMATION REQUIRED] Moves a candidate to another stage in a mandate pipeline. Always talk to the user with the English stage names: " + STAGES_DOC + ". " +
      "Some stages REQUIRE extra input (same as the forms in the web app) and the tool REFUSES the move if it is missing: " +
      "PLACE (Won) needs fee_montant_facture + date_demarrage + source_placement + source_lead. " +
      "ENTRETIEN_CLIENT (Client interview) needs date_entretien_client, the date and time of the interview with the client. " +
      "REFUSE (Lost) needs motif_refus (closed list). " +
      "Always ask the recruiter or sales for these values before calling, then call again with all params. You MUST ask for confirmation.",
    {
      candidature_id: z.string().describe('Candidature UUID'),
      new_stage: z.string().describe('New stage code: ' + STAGES_DOC),
      motif_refus: z.string().optional().describe('REQUIRED for REFUSE (Lost): ' + MOTIFS_DOC),
      motif_refus_detail: z.string().optional().describe('Optional for REFUSE: free-text detail of the reason.'),
      date_entretien_client: z.string().optional().describe('REQUIRED for ENTRETIEN_CLIENT (Client interview): date and time of the interview with the client (ISO 8601, e.g. 2026-08-05T14:30:00). Saved as dateEntretienClient.'),
      brief_client: z.string().optional().describe('Recommended for ENVOYE_CLIENT (Sent to client): candidate brief sent to the client (text). Saved as a note.'),
      fee_montant_facture: z.number().int().nonnegative().optional().describe('REQUIRED for PLACE (Won): invoice amount in euros (integer). Writes feeMontantFacture + feeStatut=FACTURE on the mandate.'),
      date_demarrage: z.string().optional().describe('REQUIRED for PLACE (Won): candidate start date (YYYY-MM-DD or ISO 8601).'),
      source_placement: z.string().optional().describe('REQUIRED for PLACE (Won): source of the placed profile, one of: LinkedIn Recruiter, Indeed, Cooptation, Approche directe, Database interne, CVTech, LinkedIn (organique), Autre.'),
      source_lead: z.string().optional().describe('REQUIRED for PLACE (Won): source of the lead/mandate, one of: Cold call, Cooptation, LinkedIn, Inbound, Email outbound, Salon, Partenariat, Autre. Writes sourceLead on the mandate.'),
    },
    wrapTool('move_candidate_stage', async (args, user) => {
      // ── Gates de saisie obligatoire (equivalent des modales de l'UI) ──
      if (args.new_stage === 'PLACE') {
        const missing: string[] = [];
        if (args.fee_montant_facture === undefined) missing.push('fee_montant_facture');
        if (args.date_demarrage === undefined) missing.push('date_demarrage');
        if (args.source_placement === undefined) missing.push('source_placement');
        if (args.source_lead === undefined) missing.push('source_lead');
        if (missing.length > 0) {
          return {
            error: 'placement_payload_required',
            missing_fields: missing,
            message: `Moving a candidate to Won (PLACE) requires: ${missing.join(', ')}. Ask the recruiter for these values, then call the tool again with all params. Never call move_candidate_stage with new_stage=PLACE without these 4 fields.`,
          };
        }
      }
      if (args.new_stage === 'ENTRETIEN_CLIENT' && !args.date_entretien_client) {
        return {
          error: 'entretien_client_date_required',
          missing_fields: ['date_entretien_client'],
          message: 'The Client interview stage needs the date and time of the interview with the client (same rule as in the web app). ' +
            'Ask the user for it (ISO 8601, e.g. 2026-08-05T14:30:00) and call again with date_entretien_client. ' +
            'If the interview is not scheduled yet, offer two options: leave the candidate at the current stage, or move them to Sent to client (ENVOYE_CLIENT) for now, which needs no date.',
        };
      }
      if (args.new_stage === 'REFUSE' && !args.motif_refus) {
        return {
          error: 'motif_refus_required',
          missing_fields: ['motif_refus'],
          message: `Moving a candidate to Lost (REFUSE) requires a reason, from this closed list: ${MOTIFS_DOC}. Ask the recruiter, then call again with motif_refus.`,
        };
      }

      const updates: Record<string, unknown> = {
        stage: args.new_stage,
        motifRefus: args.motif_refus,
        motifRefusDetail: args.motif_refus_detail,
      };

      if (args.new_stage === 'ENTRETIEN_CLIENT') {
        const raw = String(args.date_entretien_client);
        updates.dateEntretienClient = raw.includes('T') ? raw : new Date(`${raw}T09:00:00`).toISOString();
      }

      if (args.new_stage === 'PLACE') {
        updates.feeMontantFacture = args.fee_montant_facture;
        const raw = String(args.date_demarrage);
        const iso = raw.includes('T') ? raw : new Date(`${raw}T00:00:00`).toISOString();
        updates.dateDemarrage = iso;
        updates.sourcePlacement = args.source_placement;
        updates.sourceLead = args.source_lead;
      }

      await candidatureService.update(args.candidature_id as string, updates as any, user.userId);

      const feeMsg =
        args.new_stage === 'PLACE'
          ? ` (mandate fee: €${args.fee_montant_facture}, status FACTURE)`
          : '';
      return {
        success: true,
        stage: args.new_stage,
        stage_label: stageEn(args.new_stage as string),
        message: `Candidate moved to ${stageEn(args.new_stage as string)}${feeMsg}`,
      };
    }),
  );

  server.tool(
    'add_candidate_to_mandate',
    "[CONFIRMATION REQUIRED] Adds a candidate to a mandate pipeline. You MUST ask for confirmation.",
    {
      candidate_id: z.string().describe('Candidate UUID'),
      mandate_id: z.string().describe('Mandate UUID'),
      stage: z.string().optional().default('SOURCING').describe('Initial stage code (default SOURCING). Codes: ' + STAGES_DOC),
    },
    wrapTool('add_candidate_to_mandate', async (args, user) => {
      const result = await candidatureService.create({
        candidatId: args.candidate_id as string,
        mandatId: args.mandate_id as string,
        stage: ((args.stage as string) || 'SOURCING') as any,
      } as any, user.userId);
      return { success: true, candidature_id: result.id, stage: result.stage, stage_label: stageEn(result.stage), message: `Candidate added to the mandate at ${stageEn(result.stage)}` };
    }),
  );

  server.tool(
    'remove_candidate_from_mandate',
    "[CONFIRMATION REQUIRED] Removes a candidate from a mandate pipeline by moving them to Lost (REFUSE). You MUST ask for confirmation.",
    {
      candidature_id: z.string().describe('Candidature UUID'),
      reason: z.string().optional().describe('Reason: ' + MOTIFS_DOC),
    },
    wrapTool('remove_candidate_from_mandate', async (args, user) => {
      await candidatureService.update(
        args.candidature_id as string,
        { stage: 'REFUSE' as any, motifRefus: (args.reason || 'AUTRE') as any },
        user.userId,
      );
      return { success: true, message: 'Candidate removed from the pipeline (moved to Lost)' };
    }),
  );
}
