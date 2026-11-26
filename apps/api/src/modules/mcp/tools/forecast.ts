import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as forecast from '../../forecast/forecast.service.js';

/**
 * Forecast « Pipe partagé » : pipe pondéré par poste, récaps recruteur / sales avec split, deals perdus.
 * Accès : admin ; agents financiers en lecture seule (voir FINANCE_TOOLS dans mcp.permissions.ts).
 */
export function registerForecastTools(server: McpServer) {
  server.tool(
    'get_forecast',
    'Weighted pipeline ("shared pipe"): one line per open position (a mandate with 3 openings gives 3 lines), with the lead candidate, step, probability (computed, or forced by a person: proba_overridden), fee in EUR, weighted fee, expected placements, planned billing month and cash schedule. ' +
      'Also returns totals (including the rate of forced probabilities), recaps by recruiter and by sales with the mandate split applied (by_person combines both), lost deals since a date with fee and reason, and the mandates whose interview process is missing. ' +
      'Admins and finance agents only. Example: {"person":"<user id>","billing_to":"2026-12"}',
    {
      person: z.string().uuid().optional().describe('Only deals where this user is the sales or the recruiter'),
      source: z.string().optional().describe('Deal source: PARAFORM, or DIRECT for deals without a source'),
      billing_from: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Planned billing month from (YYYY-MM)'),
      billing_to: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Planned billing month to (YYYY-MM)'),
      lost_since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Lost deals since this date (YYYY-MM-DD). Default: first day of the current month'),
    },
    wrapTool('get_forecast', async (a) => forecast.getForecast({
      personId: a.person as string | undefined,
      source: a.source as string | undefined,
      billingFrom: a.billing_from as string | undefined,
      billingTo: a.billing_to as string | undefined,
      lostSince: a.lost_since as string | undefined,
    })),
  );

  server.tool(
    'override_deal',
    '[CONFIRMATION REQUIRED] Forces the probability, the fee (EUR) or the planned billing month of the position led by a candidature (lead_candidature_id in get_forecast). The computed value is kept and the line is shown as forced. Pass null to go back to the computed value. Admins only. ' +
      'Example: {"candidature_id":"…","proba":50,"billing_month":"2026-12"} → {"success":true}',
    {
      candidature_id: z.string().uuid().describe('Candidature leading the position (lead_candidature_id)'),
      proba: z.number().min(0).max(100).nullable().optional().describe('Probability in % (0-100), null = computed value'),
      fee_eur: z.number().nonnegative().nullable().optional().describe('Fee in EUR, null = computed value'),
      billing_month: z.string().regex(/^\d{4}-\d{2}$/).nullable().optional().describe('Planned billing month YYYY-MM, null = estimated from the stage'),
    },
    wrapTool('override_deal', async (a, user) => {
      await forecast.overrideDeal(a.candidature_id as string, {
        ...(a.proba !== undefined && { proba: a.proba as number | null }),
        ...(a.fee_eur !== undefined && { feeEur: a.fee_eur as number | null }),
        ...(a.billing_month !== undefined && { billingMonth: a.billing_month as string | null }),
      }, user.userId);
      return { success: true, message: 'Deal override saved' };
    }),
  );

  server.tool(
    'set_mandate_interview_process',
    '[CONFIRMATION REQUIRED] Sets the client interview process of a mandate: the ordered list of interview steps at the client (free labels). Replaces the previous list; candidates beyond the new last step are moved to the last step. ' +
      'Example: {"mandate_id":"…","steps":["Recruiter screen","Technical interview with Engineering Lead","Product interview with PM","Final panel"]} → {"success":true,"steps":[{"step":1,"label":"Recruiter screen"},…]}',
    {
      mandate_id: z.string().uuid(),
      steps: z.array(z.string().min(1).max(200)).max(20).describe('Ordered step labels; [] clears the process'),
    },
    wrapTool('set_mandate_interview_process', async (a) => {
      const steps = await forecast.setInterviewProcess(a.mandate_id as string, a.steps as string[]);
      return { success: true, steps: steps.map((s, i) => ({ step: i + 1, label: s.label })) };
    }),
  );

  server.tool(
    'set_candidate_process_step',
    '[CONFIRMATION REQUIRED] Sets where a candidate is in the client interview process of the mandate (step k of n), the next interview date and the waiting status ("waiting for feedback since"). The global stage (Client interview, Process…) does not change: use move_candidate_stage for that. Pass null to clear a field. ' +
      'Example: {"candidature_id":"…","step":3,"next_interview_at":"2026-11-27T15:00:00","waiting_since":null}',
    {
      candidature_id: z.string().uuid(),
      step: z.number().int().min(1).nullable().optional().describe('Step k (1..n) in the mandate interview process'),
      next_interview_at: z.string().nullable().optional().describe('Next interview date and time (ISO 8601), null = none'),
      waiting_since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe('Waiting for feedback since (YYYY-MM-DD), null = not waiting'),
    },
    wrapTool('set_candidate_process_step', async (a) => {
      const r = await forecast.setCandidateProcessStep(a.candidature_id as string, {
        ...(a.step !== undefined && { step: a.step as number | null }),
        ...(a.next_interview_at !== undefined && { nextInterviewAt: a.next_interview_at ? new Date(a.next_interview_at as string).toISOString() : null }),
        ...(a.waiting_since !== undefined && { waitingSince: a.waiting_since as string | null }),
      });
      const n = r.process_steps.length;
      return {
        success: true,
        client_process_step: r.processEtape ? { step: r.processEtape, of: n, label: r.process_steps[r.processEtape - 1]?.label } : null,
        next_interview_at: r.dateProchainEntretien,
        waiting_since: r.retourAttenteDepuis,
      };
    }),
  );
}
