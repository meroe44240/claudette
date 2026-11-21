import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import prisma from '../../../lib/db.js';
import { resolveMandat } from './portal.js';
import { generateContract, approvalExceptions, BOUNDS } from '../../contracts/contract-generate.service.js';
import { requestContractExceptions, approve, reject } from '../../contracts/contract.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveCompany(args: Record<string, unknown>): Promise<{ id: string; nom: string } | { error: string; message: string; candidates?: unknown[] }> {
  if (typeof args.company_id === 'string' && args.company_id) {
    if (!UUID_RE.test(args.company_id)) return { error: 'company_not_found', message: `"${args.company_id}" is not a company UUID. Use company_name or search_companies.` };
    const e = await prisma.entreprise.findUnique({ where: { id: args.company_id }, select: { id: true, nom: true } });
    return e ?? { error: 'company_not_found', message: `No company with UUID ${args.company_id}.` };
  }
  const name = typeof args.company_name === 'string' ? args.company_name.trim() : '';
  if (!name) return { error: 'missing_target', message: 'Provide mandate_id, mandate_name, company_id or company_name.' };
  const rows = await prisma.entreprise.findMany({
    where: { nom: { contains: name, mode: 'insensitive' } },
    select: { id: true, nom: true, _count: { select: { mandats: true } } },
    take: 6,
  });
  const exact = rows.filter((r) => r.nom.toLowerCase() === name.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) return { error: 'company_not_found', message: `No company matches "${name}". Use search_companies, or create it with create_company.` };
  return {
    error: 'company_ambiguous',
    message: `Several companies match "${name}". Ask the user which one, then call again with company_id.`,
    candidates: rows.map((r) => ({ id: r.id, name: r.nom, mandates: r._count.mandats })),
  };
}

const RULES =
  `All 19 articles are locked: none can be removed or reworded. Only these values change, within the standard limits: ` +
  `fee >= ${BOUNDS.feeMin}%, replacement guarantee ${BOUNDS.guaranteeMin} to ${BOUNDS.guaranteeMax} months, candidate ownership ${BOUNDS.ownershipMin} to ${BOUNDS.ownershipMax} months, ` +
  `payment within ${BOUNDS.paymentMaxDays} days. Anything outside these limits, and any special conditions clause (free text, added as Article 19), needs an admin approval of exactly those values.`;

export function registerContractTools(server: McpServer) {
  server.tool(
    'generate_contract',
    'Generates the HumanUp recruitment services agreement (success-fee contract) as a PDF and returns a download link. ' +
      'Prefilled from the mandate: company legal name, registration number, address, signatory (the mandate client), job title, fee, payment terms and governing law. ' +
      'Use when asked for a contract / agreement / T&C with a client. Target a mandate (mandate_id or mandate_name) when there is one; otherwise a company. ' +
      RULES + ' ' +
      'WORKFLOW: 1) call with preview=true and show the user what will be in the contract (client, signatory, fee, guarantee, ownership, payment, governing law, language, special conditions, missing fields, approval needed or not); ' +
      '2) once the user agrees, call again with the same values and preview=false to get the PDF. ' +
      'If the user asks to remove or change an article, explain that the articles are locked and only the values above (or a special conditions clause, with admin approval) can change. ' +
      'If admin approval is needed, ask the user why and call again with exception_reason: the request goes to the admins on Slack; the contract can be generated once an admin approves exactly these values. ' +
      'Nothing is sent to the client and the contract status does not change.',
    {
      mandate_id: z.string().optional().describe('Mandate UUID'),
      mandate_name: z.string().optional().describe('Mandate title if no UUID'),
      company_id: z.string().optional().describe('Company UUID, when there is no mandate'),
      company_name: z.string().optional().describe('Company name, when there is no mandate'),
      preview: z.boolean().optional().describe('true: return what would go in the contract without generating anything (do this first)'),
      language: z.enum(['fr', 'en']).optional().describe('Contract language (default fr)'),
      fee_percent: z.number().optional().describe(`Success fee in % of the annual gross package (default: mandate fee, else 20). Below ${BOUNDS.feeMin}% needs admin approval`),
      payment_terms: z.string().optional().describe(`Payment terms: code (reception, signature, 30j, 45j_fdm, 60j) or free text (default: mandate terms, else 30 days). Over ${BOUNDS.paymentMaxDays} days or unclear needs admin approval`),
      country: z.string().optional().describe('Governing law: ISO code (FR, GB, HK, BE, CH…) or country name (default: mandate country, else France)'),
      guarantee_months: z.number().int().optional().describe(`Replacement guarantee in months (default 3; ${BOUNDS.guaranteeMin} to ${BOUNDS.guaranteeMax} without approval)`),
      ownership_months: z.number().int().optional().describe(`Candidate ownership period in months (default 12; ${BOUNDS.ownershipMin} to ${BOUNDS.ownershipMax} without approval)`),
      signatory_name: z.string().optional().describe('Client signatory full name (default: mandate client)'),
      signatory_email: z.string().optional().describe('Client signatory email (default: mandate client email)'),
      address: z.string().optional().describe('Client registered address (default: company address)'),
      registration: z.string().optional().describe('Client SIRET / company registration number (default: company SIRET)'),
      job_title: z.string().optional().describe('Role shown in the contract header (default: mandate title)'),
      special_conditions: z.string().optional().describe('Special conditions clause, free text added as Article 19 (e.g. exclusivity). Always needs admin approval of the exact text'),
      exception_reason: z.string().optional().describe('Why the non-standard terms are needed. When approval is required, passing it sends the request to the admins'),
      discount_reason: z.string().optional().describe('Deprecated alias of exception_reason'),
    },
    wrapTool('generate_contract', async (args, user) => {
      let mandatId: string | undefined;
      let entrepriseId: string | undefined;

      if (args.mandate_id || args.mandate_name) {
        const m = await resolveMandat(args);
        if ('error' in m) return m;
        mandatId = m.id;
      } else {
        const c = await resolveCompany(args);
        if ('error' in c) return c;
        entrepriseId = c.id;
      }

      const str = (k: string) => (typeof args[k] === 'string' && (args[k] as string).trim() ? (args[k] as string).trim() : undefined);
      const num = (k: string) => (typeof args[k] === 'number' ? (args[k] as number) : undefined);

      const result = await generateContract({
        mandatId,
        entrepriseId,
        lang: args.language === 'en' ? 'en' : 'fr',
        feePct: num('fee_percent'),
        paymentTerms: str('payment_terms'),
        country: str('country'),
        guaranteeMonths: num('guarantee_months'),
        ownershipMonths: num('ownership_months'),
        signatoryName: str('signatory_name'),
        signatoryEmail: str('signatory_email'),
        address: str('address'),
        registration: str('registration'),
        jobTitle: str('job_title'),
        customClause: str('special_conditions'),
        preview: args.preview === true,
      }, user.userId);

      if (!result.ok) {
        const reason = str('exception_reason') ?? str('discount_reason');
        if (result.error === 'needs_admin_approval' && mandatId && reason && result.approvalStatus === 'NONE' && result.exceptions) {
          const t = await prisma.mandat.findUnique({ where: { id: mandatId }, select: { feePourcentage: true } });
          const fee = num('fee_percent') ?? Number(t?.feePourcentage ?? 20);
          const { approval } = await requestContractExceptions(
            { mandatId, fee, exceptions: result.exceptions, exceptionLabels: result.exceptionLabels ?? [], reason },
            user.userId,
          );
          return {
            error: 'needs_admin_approval',
            approval_requested: true,
            approval_id: approval.id,
            non_standard_terms: result.exceptionLabels,
            message: 'The approval request was sent to the admins. Once an admin approves it, call generate_contract again with exactly the same values to get the PDF.',
          };
        }
        return {
          error: result.error,
          message: result.message,
          ...(result.exceptionLabels ? { non_standard_terms: result.exceptionLabels, approval_status: result.approvalStatus } : {}),
        };
      }

      const t = result.terms;
      const content = {
        client: t.client,
        registration: t.siret || null,
        address: t.adresse || null,
        signatory: t.rep || null,
        signatory_email: t.email || null,
        job_title: t.poste || null,
        language: result.lang,
        fee_percent: Number(t.feePct),
        payment_terms: t.paiement,
        governing_law: t.pays,
        guarantee_months: Number(t.garantieMois),
        ownership_months: Number(t.proprieteMois),
        special_conditions: result.customClause,
      };
      const approvalNote =
        result.approval === 'not_needed' ? 'Standard terms: no approval needed.'
          : result.approval === 'approved' ? 'Non-standard terms already approved by an admin.'
            : result.approval === 'pending' ? 'Non-standard terms: an approval request is pending, the contract cannot be generated yet.'
              : 'Non-standard terms: admin approval needed before generating. Ask the user for the reason and call with exception_reason.';

      if (result.preview) {
        return {
          preview: true,
          mandate_id: result.mandatId,
          company_id: result.entrepriseId,
          content,
          articles: result.articles,
          non_standard_terms: result.exceptionLabels,
          approval: result.approval,
          missing: result.missing,
          message: `Nothing generated yet. Show this to the user and confirm before generating. ${approvalNote}` +
            (result.missing.length ? ` Missing fields: ${result.missing.join(', ')}.` : ''),
        };
      }

      return {
        success: true,
        pdf_url: result.url,
        filename: result.filename,
        mandate_id: result.mandatId,
        company_id: result.entrepriseId,
        content,
        non_standard_terms: result.exceptionLabels,
        missing: result.missing,
        message: `Contract generated for ${t.client} (${t.feePct}% fee).` +
          (result.exceptionLabels.length ? ' It includes non-standard terms approved by an admin.' : '') +
          (result.missing.length ? ` Missing in the contract: ${result.missing.join(', ')}. Ask the user for them and call again to get a complete version.` : '') +
          ' Nothing was sent to the client.',
      };
    }),
  );

  server.tool(
    'list_contract_approvals',
    'Admins only. Lists the pending requests for non-standard contract terms (fee below the floor, guarantee, ownership, payment terms, special conditions clause), with the mandate, who asked, why, and the exact values requested. ' +
      "Use when an admin asks 'what contract requests are pending' or after a Slack contract approval notification.",
    {},
    wrapTool('list_contract_approvals', async () => {
      const rows = await prisma.contractApproval.findMany({
        where: { status: 'PENDING' },
        include: { mandat: { select: { id: true, titrePoste: true, feePourcentage: true, entreprise: { select: { nom: true } } } } },
        orderBy: { createdAt: 'asc' },
      });
      const users = await prisma.user.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.requestedById))] } },
        select: { id: true, prenom: true, nom: true },
      });
      const name = (id: string) => { const u = users.find((x) => x.id === id); return u ? `${u.prenom ?? ''} ${u.nom}`.trim() : null; };
      return {
        pending: rows.length,
        requests: rows.map((r) => ({
          approval_id: r.id,
          mandate_id: r.mandat.id,
          mandate: r.mandat.titrePoste,
          company: r.mandat.entreprise.nom,
          requested_by: name(r.requestedById),
          requested_at: r.createdAt,
          reason: r.reason,
          requested_terms: approvalExceptions(r),
        })),
      };
    }),
  );

  server.tool(
    'review_contract_approval',
    '[CONFIRMATION REQUIRED] Admins only. Approves or rejects a request for non-standard contract terms. ' +
      'Approving allows generate_contract to produce the contract with exactly the requested values (and sets the mandate fee to the requested fee). ' +
      'Show the admin the requested terms (list_contract_approvals) and get an explicit decision before calling.',
    {
      approval_id: z.string().describe('Approval request UUID (from list_contract_approvals)'),
      decision: z.enum(['approve', 'reject']).describe('approve or reject'),
      note: z.string().optional().describe('Optional note, kept with a rejection'),
    },
    wrapTool('review_contract_approval', async (args, user) => {
      const id = String(args.approval_id || '');
      if (!UUID_RE.test(id)) return { error: 'approval_not_found', message: `"${id}" is not an approval UUID. Use list_contract_approvals.` };
      const res = args.decision === 'approve'
        ? await approve(id, user.userId, user.userRole)
        : await reject(id, user.userId, user.userRole, typeof args.note === 'string' ? args.note : undefined);
      return {
        success: true,
        approval_id: res.id,
        status: res.status,
        message: res.status === 'APPROVED'
          ? 'Approved. The requester can now generate the contract with exactly these values.'
          : 'Rejected. The contract cannot be generated with these values.',
      };
    }),
  );
}
