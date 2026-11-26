import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as cash from '../../forecast/cash.service.js';

const MONTH = /^\d{4}-\d{2}$/;
const DAY_OR_MONTH = /^\d{4}-\d{2}(-\d{2})?$/;
const ENTITY = z.enum(['COURTSIDE_CAPITAL_HK', 'HUMANUP_LONDON', 'HUMANUP_VIET']);
const STATUS = z.enum(['A_FACTURER', 'EMISE', 'PAYEE_PARTIEL', 'PAYEE', 'ANNULEE']);
const KIND = z.enum(['recurring_revenue', 'cash_account', 'expense', 'owner_draw']);
const ownerDrawsForbidden = (estAgent: boolean | undefined, kind: unknown) => !!estAgent && kind === 'owner_draw';

/**
 * Trésorerie (forecast lot b) : factures suivies (Propium n'émet pas les factures), récurrent, comptes, charges,
 * prélèvements dirigeant (admin seul : les agents n'en voient que le total), projection et créances.
 * Accès : admin ; agents financiers en lecture seule (voir FINANCE_TOOLS dans mcp.permissions.ts).
 */
export function registerCashTools(server: McpServer) {
  server.tool(
    'get_cashflow_projection',
    'Cash and billed projection for a target month (end of that month). Billed (the yearly target is measured in billed) and cashed are always separate. ' +
      'Returns the cash balance (sum of the accounts at the latest balance date), billed year to date (issued, to bill, recurring) against the yearly target, a month-by-month table (billed vs cash in, expenses, owner draws), ' +
      'and the scenarios with what each one counts: normal, late payment (delay_invoices leave the cash, not the billed), without at-risk invoices, with deals signed (force_deals: deal_id from get_forecast, counted at 100%), objective (gap to normal) and the M+1 horizon (normal + next month recurring + weighted pipe - next month expenses). ' +
      'Owner draws only appear as a total for agents. Example: {"target_month":"2026-12","delay_invoices":["<invoice id>"],"force_deals":["<mandate id>#1"]}',
    {
      target_month: z.string().regex(MONTH).optional().describe('YYYY-MM. Default: December of the current year'),
      delay_invoices: z.array(z.string().uuid()).optional().describe('Invoices paid after the target month (cash only)'),
      force_deals: z.array(z.string()).optional().describe('deal_id values from get_forecast to count as signed (100%)'),
      objective_eur: z.number().nonnegative().nullable().optional().describe('Target cash for the "Objective" scenario; default: the admin setting'),
    },
    wrapTool('get_cashflow_projection', async (a, user) => cash.getCashflowProjection({
      targetMonth: a.target_month as string | undefined,
      delayInvoiceIds: a.delay_invoices as string[] | undefined,
      forceDealIds: a.force_deals as string[] | undefined,
      objectiveEur: a.objective_eur as number | null | undefined,
      hideOwnerDrawDetails: !!user.estAgent,
    })),
  );

  server.tool(
    'get_receivables',
    'Receivables: issued invoices not fully paid, overdue first, with days late and the remaining amount, totals (open, overdue) and, per client, the real average payment delay (issue to payment, on paid invoices). Read-only, meant for the invoice reminder agent. ' +
      'Example: {"overdue_only":true}',
    {
      company_id: z.string().uuid().optional(),
      overdue_only: z.boolean().optional(),
    },
    wrapTool('get_receivables', async (a) => cash.getReceivables({ companyId: a.company_id as string | undefined, overdueOnly: a.overdue_only as boolean | undefined })),
  );

  server.tool(
    'list_invoices',
    'Invoices tracked in Propium (Propium does not issue them: the number comes from the accounting tool). Statuses: A_FACTURER (to bill), EMISE (issued), PAYEE_PARTIEL (partly paid), PAYEE (paid), ANNULEE (cancelled). ' +
      'Also returns the placements (Won) that have no invoice yet in billing_suggestions. Example: {"status":"EMISE","from":"2026-01","to":"2026-12"}',
    {
      status: STATUS.optional(),
      company_id: z.string().uuid().optional(),
      mandate_id: z.string().uuid().optional(),
      from: z.string().regex(MONTH).optional().describe('Billing month from (issue month, or planned month when to bill)'),
      to: z.string().regex(MONTH).optional(),
    },
    wrapTool('list_invoices', async (a) => {
      const [invoices, suggestions] = await Promise.all([
        cash.listInvoices({ status: a.status as string | undefined, companyId: a.company_id as string | undefined, mandateId: a.mandate_id as string | undefined, from: a.from as string | undefined, to: a.to as string | undefined }),
        cash.billingSuggestions(),
      ]);
      return { count: invoices.length, total_eur: invoices.reduce((s, i) => s + (i.status === 'ANNULEE' ? 0 : i.amount_eur), 0), invoices, billing_suggestions: suggestions };
    }),
  );

  server.tool(
    'upsert_invoice',
    '[CONFIRMATION REQUIRED] Creates or updates a tracked invoice (pass invoice_id to update; only the fields given change). The number is entered, never generated. ' +
      'The EUR amount uses the rate of the issue date unless amount_eur is given (e.g. the rate actually obtained). The billing entity defaults from the client (Europe and Paraform: Humanup Executive Search Ltd London, otherwise Courtside Capital). ' +
      'from_candidature_id creates the "to bill" invoice of a placement with the fee and planned month of the deal. ' +
      'Example: {"number":"INV-021","company_id":"…","status":"EMISE","amount":42800,"currency":"USD","amount_eur":36800,"issued_at":"2026-09-22"}',
    {
      invoice_id: z.string().uuid().optional(),
      from_candidature_id: z.string().uuid().optional().describe('Create the invoice of this placement'),
      number: z.string().max(50).nullable().optional(),
      label: z.string().max(255).nullable().optional().describe('Free label when the client is not in Propium'),
      company_id: z.string().uuid().nullable().optional(),
      mandate_id: z.string().uuid().nullable().optional(),
      candidature_id: z.string().uuid().nullable().optional(),
      entity: ENTITY.nullable().optional(),
      status: STATUS.optional(),
      amount: z.number().nonnegative().optional().describe('Amount in the invoice currency'),
      currency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
      amount_eur: z.number().nonnegative().nullable().optional(),
      paid_eur: z.number().nonnegative().nullable().optional(),
      planned_billing_month: z.string().regex(MONTH).nullable().optional(),
      issued_at: z.string().regex(DAY_OR_MONTH).nullable().optional(),
      due_at: z.string().regex(DAY_OR_MONTH).nullable().optional(),
      paid_at: z.string().regex(DAY_OR_MONTH).nullable().optional(),
      planned_cash_month: z.string().regex(MONTH).nullable().optional().describe('Force the month the cash is expected'),
      at_risk: z.boolean().optional(),
      notes: z.string().max(5000).nullable().optional(),
    },
    wrapTool('upsert_invoice', async (a, user) => {
      const map: Record<string, keyof cash.InvoiceInputData> = {
        number: 'numero', label: 'libelle', company_id: 'entrepriseId', mandate_id: 'mandatId', candidature_id: 'candidatureId',
        entity: 'entite', status: 'statut', amount: 'montant', currency: 'devise', amount_eur: 'montantEur', paid_eur: 'montantPayeEur',
        planned_billing_month: 'moisFacturationPrevu', issued_at: 'dateEmission', due_at: 'dateEcheance', paid_at: 'datePaiement',
        planned_cash_month: 'moisEncaissementPrevu', at_risk: 'aRisque', notes: 'notes',
      };
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(map)) if (a[k] !== undefined) data[v] = a[k];
      const invoice = a.from_candidature_id
        ? await cash.createInvoiceFromCandidature(a.from_candidature_id as string, user.userId, data as cash.InvoiceInputData)
        : await cash.upsertInvoice((a.invoice_id as string | undefined) ?? null, data as cash.InvoiceInputData, user.userId);
      return { success: true, invoice };
    }),
  );

  server.tool(
    'delete_invoice',
    '[CONFIRMATION REQUIRED] Deletes a tracked invoice. Prefer the status ANNULEE to keep the history. Example: {"invoice_id":"…"}',
    { invoice_id: z.string().uuid() },
    wrapTool('delete_invoice', async (a) => { await cash.deleteInvoice(a.invoice_id as string); return { success: true }; }),
  );

  server.tool(
    'list_finance_items',
    'Lists the cash projection inputs of one kind: recurring_revenue (monthly amount, start and last month), cash_account (balance in EUR and its date), expense (monthly business expenses), owner_draw (admins only). ' +
      'Example: {"kind":"expense"}',
    { kind: KIND },
    wrapTool('list_finance_items', async (a, user) => {
      if (ownerDrawsForbidden(user.estAgent, a.kind)) return { error: 'Owner draws are only visible to admins (agents see the total in get_cashflow_projection).' };
      const items = await cash.listFinanceItems(a.kind as cash.FinanceKind);
      return { kind: a.kind, count: items.length, items };
    }),
  );

  server.tool(
    'upsert_finance_item',
    '[CONFIRMATION REQUIRED] Creates or updates a cash projection input (pass id to update). Fields by kind: recurring_revenue {label, monthly_eur, start_month, end_month (last month included), entity}; ' +
      'cash_account {name, balance_eur, balance_date (default today), entity, active}; expense {label, category, monthly_eur, start_month, end_month}; owner_draw {label, amount_eur, month} (admins only). All amounts in EUR. ' +
      'Example: {"kind":"cash_account","name":"Londres","balance_eur":70000,"balance_date":"2026-11-20"}',
    {
      kind: KIND,
      id: z.string().uuid().optional(),
      label: z.string().min(1).max(255).optional(),
      name: z.string().min(1).max(100).optional(),
      category: z.string().max(50).nullable().optional(),
      entity: ENTITY.nullable().optional(),
      active: z.boolean().optional(),
      monthly_eur: z.number().optional(),
      amount_eur: z.number().optional(),
      balance_eur: z.number().optional(),
      start_month: z.string().regex(MONTH).optional(),
      end_month: z.string().regex(MONTH).nullable().optional(),
      month: z.string().regex(MONTH).optional(),
      balance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      notes: z.string().max(5000).nullable().optional(),
    },
    wrapTool('upsert_finance_item', async (a, user) => {
      if (ownerDrawsForbidden(user.estAgent, a.kind)) return { error: 'Owner draws are only available to admins.' };
      const { kind, id, ...fields } = a as Record<string, any>;
      const item = await cash.upsertFinanceItem(kind, id ?? null, fields);
      return { success: true, kind, item };
    }),
  );

  server.tool(
    'delete_finance_item',
    '[CONFIRMATION REQUIRED] Deletes a cash projection input. Example: {"kind":"expense","id":"…"}',
    { kind: KIND, id: z.string().uuid() },
    wrapTool('delete_finance_item', async (a, user) => {
      if (ownerDrawsForbidden(user.estAgent, a.kind)) return { error: 'Owner draws are only available to admins.' };
      await cash.deleteFinanceItem(a.kind as cash.FinanceKind, a.id as string);
      return { success: true };
    }),
  );
}
