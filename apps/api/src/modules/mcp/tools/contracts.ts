import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import prisma from '../../../lib/db.js';
import { resolveMandat } from './portal.js';
import { generateContract, FEE_FLOOR } from '../../contracts/contract-generate.service.js';
import { requestApproval } from '../../contracts/contract.service.js';

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

export function registerContractTools(server: McpServer) {
  server.tool(
    'generate_contract',
    'Generates the HumanUp recruitment services agreement (success-fee contract, 19 articles) as a PDF and returns a download link. ' +
      'Prefilled from the mandate: company legal name, registration number, address, signatory (the mandate client), job title, fee, payment terms and governing law. ' +
      'Use when asked for a contract / agreement / T&C with a client ("generate the contract for Acme", "contrat pour le mandat Sales Manager chez X"). ' +
      'Target a mandate (mandate_id or mandate_name) when there is one; otherwise a company (company_id or company_name). ' +
      'Any parameter overrides the mandate value. Defaults: French, 20% fee (or the mandate fee), 30 days from invoice, 3-month guarantee, 12-month candidate ownership, French law. ' +
      `Fees below ${FEE_FLOOR}% need an admin approval on the mandate first: without one the tool refuses, and if you pass discount_reason it sends the approval request to the admins. ` +
      'The PDF is saved on the mandate (activity "Contract generated"). Nothing is sent to the client and the contract status does not change. ' +
      'Give the user the link and list any fields reported in "missing" so they can complete them (call again with the values).',
    {
      mandate_id: z.string().optional().describe('Mandate UUID'),
      mandate_name: z.string().optional().describe('Mandate title if no UUID'),
      company_id: z.string().optional().describe('Company UUID, when there is no mandate'),
      company_name: z.string().optional().describe('Company name, when there is no mandate'),
      language: z.enum(['fr', 'en']).optional().describe('Contract language (default fr)'),
      fee_percent: z.number().optional().describe('Success fee in % of the annual gross package (default: mandate fee, else 20)'),
      payment_terms: z.string().optional().describe('Payment terms: code (reception, signature, 30j, 45j_fdm, 60j) or free text (default: mandate terms, else 30 days from invoice)'),
      country: z.string().optional().describe('Governing law: ISO code (FR, GB, HK, BE, CH…) or country name (default: mandate country, else France)'),
      guarantee_months: z.number().int().optional().describe('Replacement guarantee in months (default 3)'),
      ownership_months: z.number().int().optional().describe('Candidate ownership period in months (default 12)'),
      signatory_name: z.string().optional().describe('Client signatory full name (default: mandate client)'),
      signatory_email: z.string().optional().describe('Client signatory email (default: mandate client email)'),
      address: z.string().optional().describe('Client registered address (default: company address)'),
      registration: z.string().optional().describe('Client SIRET / company registration number (default: company SIRET)'),
      job_title: z.string().optional().describe('Role shown in the contract header (default: mandate title)'),
      discount_reason: z.string().optional().describe(`Only for a fee below ${FEE_FLOOR}%: why the discount, sent to the admins with the approval request`),
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
      }, user.userId);

      if (!result.ok) {
        const reason = str('discount_reason');
        if (result.error === 'needs_admin_approval' && mandatId && reason && result.approvalStatus === 'NONE') {
          const fee = num('fee_percent')!;
          const approval = await requestApproval({ mandatId, feeRequested: fee, reason }, user.userId);
          return {
            error: 'needs_admin_approval',
            approval_requested: true,
            approval_id: approval.id,
            message: `A ${fee}% fee is below the ${FEE_FLOOR}% floor. The approval request was sent to the admins. Once an admin approves it, call generate_contract again with the same fee.`,
          };
        }
        return { error: result.error, message: result.message };
      }

      const t = result.terms;
      return {
        success: true,
        pdf_url: result.url,
        filename: result.filename,
        language: result.lang,
        mandate_id: result.mandatId,
        company_id: result.entrepriseId,
        terms: {
          client: t.client,
          registration: t.siret || null,
          address: t.adresse || null,
          signatory: t.rep || null,
          signatory_email: t.email || null,
          job_title: t.poste || null,
          fee_percent: Number(t.feePct),
          payment_terms: t.paiement,
          governing_law: t.pays,
          guarantee_months: Number(t.garantieMois),
          ownership_months: Number(t.proprieteMois),
        },
        missing: result.missing,
        message: `Contract generated for ${t.client} (${t.feePct}% fee).` +
          (result.missing.length ? ` Missing in the contract: ${result.missing.join(', ')}. Ask the user for them and call again to get a complete version.` : '') +
          ' Nothing was sent to the client.',
      };
    }),
  );
}
