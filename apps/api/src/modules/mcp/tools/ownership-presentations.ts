import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as ownership from '../../ownership/ownership.service.js';
import * as presentations from '../../presentations/presentation.service.js';
import { NotFoundError, ValidationError } from '../../../lib/errors.js';

/**
 * Propriété (qui a la main sur une société, un lead, un contact), présentations de candidats
 * aux sociétés et statut de push d'un candidat.
 */

const entityType = z.string().describe('company, lead or client');

/** Erreurs métier prévues → { error } lisible, comme les autres outils. */
async function guarded<T>(fn: () => Promise<T>) {
  try { return await fn(); } catch (err) {
    if (err instanceof ValidationError || err instanceof NotFoundError) return { error: err.message };
    throw err;
  }
}

export function registerOwnershipPresentationTools(server: McpServer) {
  // ═══ Propriété ═══
  server.tool(
    'claim_owner',
    `Takes ownership of a company, a lead or a client contact, so other agents and people know it is yours. If someone else already owns it, nothing changes and you get the current owner back (conflict: true): talk to them, do not work the account. Claiming what you already own extends the period. Default period ${ownership.DEFAULT_DAYS} days, then it is released automatically. ` +
      'Example: {"entity":"company","id":"…","reason":"Outbound campaign Q4 fintech"} → {"claimed":true,"owner":{"name":"Tom (agent)","is_agent":true},"since":"…","expires_at":"…"} ; conflict → {"claimed":false,"conflict":true,"current":{"owner":{"name":"Léa Martin","is_agent":false},"since":"…","reason":"…"}}',
    {
      entity: entityType,
      id: z.string().uuid(),
      reason: z.string().max(500).optional().describe('Why you take it (shown to the team)'),
      duration_days: z.number().int().min(1).max(365).optional().describe(`Default ${ownership.DEFAULT_DAYS}`),
      owner_id: z.string().uuid().optional().describe('Admins only: give it to someone else'),
      force: z.boolean().optional().describe('Admins only: take it over from the current owner'),
    },
    wrapTool('claim_owner', async (a, user) => guarded(() => ownership.claim(a.entity as string, a.id as string, user.userId, {
      reason: a.reason as string | undefined, days: a.duration_days as number | undefined, ownerId: a.owner_id as string | undefined,
      force: !!a.force, isAdmin: user.userRole === 'ADMIN',
    }))),
  );

  server.tool(
    'release_owner',
    'Releases your ownership of a company, lead or client contact (only the owner or an admin can). Example: {"entity":"lead","id":"…","reason":"No answer after 7 follow-ups"} → {"released":true,"previous_owner":{"name":"Tom (agent)"}}',
    { entity: entityType, id: z.string().uuid(), reason: z.string().max(500).optional() },
    wrapTool('release_owner', async (a, user) => guarded(() => ownership.release(a.entity as string, a.id as string, user.userId, { reason: a.reason as string | undefined, isAdmin: user.userRole === 'ADMIN' }))),
  );

  server.tool(
    'get_owner',
    'Who owns a company, lead or client contact right now (human or agent), since when, why, until when, plus the ownership history. Check it before working an account. Example: {"entity":"company","id":"…"} → {"owned":true,"current":{"owner":{"name":"Léa Martin","is_agent":false},"since":"…","expires_at":"…","reason":"…"},"history":[…]}',
    { entity: entityType, id: z.string().uuid() },
    wrapTool('get_owner', async (a) => guarded(() => ownership.getOwner(a.entity as string, a.id as string))),
  );

  // ═══ Présentations ═══
  const CANAL_DOC = presentations.CANAUX.join(', ');
  const STATUT_DOC = `${presentations.STATUTS.join(', ')} (sent, no answer, interested, interview, declined, hired)`;

  server.tool(
    'is_candidate_presented',
    'Has this candidate already been presented to this company? Always check before pushing a profile to a company. Pass the company id, or its exact name. Example: {"candidat_id":"…","company_name":"Acme"} → {"presented":true,"count":1,"last_presented_at":"2026-10-02T…","presentations":[{"channel":"EMAIL","status":"INTERESSE","presented_by":{"name":"Léa Martin"}}]}',
    {
      candidat_id: z.string().uuid(),
      entreprise_id: z.string().uuid().optional(),
      company_name: z.string().optional().describe('Exact company name (any case) when you do not have the id'),
    },
    wrapTool('is_candidate_presented', async (a) => guarded(() => presentations.isPresented(a.candidat_id as string, { entrepriseId: a.entreprise_id as string | undefined, name: a.company_name as string | undefined }))),
  );

  server.tool(
    'create_presentation',
    `Records that a candidate was presented (pushed) to a company. Applications moved to "Sent to client" and List Push pushes are recorded automatically, use this for the rest (LinkedIn message, call, email outside a mandate…). Channels: ${CANAL_DOC}. Statuses: ${STATUT_DOC}. ` +
      'Tells you if the candidate had already been presented to this company. Example: {"candidat_id":"…","entreprise_id":"…","channel":"LINKEDIN","candidate_consent":true,"anonymous":true} → {"id":"…","status":"ENVOYEE","already_presented_before":0}',
    {
      candidat_id: z.string().uuid(),
      entreprise_id: z.string().uuid(),
      client_id: z.string().uuid().optional().describe('Contact the profile was sent to'),
      mandat_id: z.string().uuid().optional(),
      lead_id: z.string().uuid().optional(),
      channel: z.string().optional().describe(`Default EMAIL. ${CANAL_DOC}`),
      status: z.string().optional().describe(`Default ENVOYEE. ${STATUT_DOC}`),
      candidate_consent: z.boolean().optional().describe('The candidate agreed to be presented to this company'),
      anonymous: z.boolean().optional().describe('Anonymized profile sent (default true)'),
      cv_url: z.string().max(1000).optional().describe('Link to the document sent'),
      note: z.string().optional(),
      presented_at: z.string().optional().describe('ISO date, default now'),
    },
    wrapTool('create_presentation', async (a, user) => guarded(async () => {
      const before = await presentations.isPresented(a.candidat_id as string, { entrepriseId: a.entreprise_id as string });
      const p = await presentations.create({
        candidatId: a.candidat_id as string, entrepriseId: a.entreprise_id as string,
        clientId: a.client_id as string | undefined, mandatId: a.mandat_id as string | undefined, leadId: a.lead_id as string | undefined,
        canal: a.channel as string | undefined, statut: a.status as string | undefined, accordCandidat: a.candidate_consent as boolean | undefined,
        anonyme: a.anonymous as boolean | undefined, cvUrl: a.cv_url as string | undefined, note: a.note as string | undefined, presentedAt: a.presented_at as string | undefined,
      }, user.userId, 'MANUEL');
      return { ...p, already_presented_before: before.count };
    })),
  );

  server.tool(
    'update_presentation',
    `Updates a presentation: status (${STATUT_DOC}), channel, candidate consent, anonymous, cv_url, note, contact. Example: {"id":"…","status":"INTERESSE","note":"Wants to meet next week"} → {"id":"…","status":"INTERESSE"}`,
    {
      id: z.string().uuid(),
      status: z.string().optional(), channel: z.string().optional(), candidate_consent: z.boolean().optional(),
      anonymous: z.boolean().optional(), cv_url: z.string().max(1000).nullable().optional(), note: z.string().nullable().optional(),
      client_id: z.string().uuid().nullable().optional(),
    },
    wrapTool('update_presentation', async (a) => guarded(() => presentations.update(a.id as string, {
      statut: a.status as string | undefined, canal: a.channel as string | undefined, accordCandidat: a.candidate_consent as boolean | undefined,
      anonyme: a.anonymous as boolean | undefined, cvUrl: a.cv_url as string | null | undefined, note: a.note as string | null | undefined, clientId: a.client_id as string | null | undefined,
    }))),
  );

  server.tool(
    'list_presentations',
    'Lists presentations, newest first, filtered by candidate, company, lead, mandate, status or date. Example: {"entreprise_id":"…"} → {"total":3,"data":[{"candidate":{"name":"Léa Martin"},"channel":"EMAIL","status":"ENTRETIEN","presented_at":"…"}]}',
    {
      candidat_id: z.string().uuid().optional(), entreprise_id: z.string().uuid().optional(), lead_id: z.string().uuid().optional(),
      mandat_id: z.string().uuid().optional(), status: z.string().optional(), since: z.string().optional().describe('ISO date'),
      limit: z.number().int().min(1).max(500).optional().describe('Default 100'),
    },
    wrapTool('list_presentations', async (a) => guarded(() => presentations.list({
      candidatId: a.candidat_id as string | undefined, entrepriseId: a.entreprise_id as string | undefined, leadId: a.lead_id as string | undefined,
      mandatId: a.mandat_id as string | undefined, statut: a.status as string | undefined, since: a.since as string | undefined, limit: a.limit as number | undefined,
    }))),
  );

  server.tool(
    'get_candidate_push_status',
    'Can this candidate be pushed, and where was he or she already pushed? status: not_ready (missing CV or CV consent, see missing), ready (never presented), pushed (presented at least once), placed. Gives the link to the anonymized one-pager to send. ' +
      'Example: {"candidat_id":"…"} → {"status":"pushed","missing":[],"anonymized_cv_url":"https://ats.propium.co/outils?outil=cv&candidat=…","presentations":{"count":2,"by_status":{"ENVOYEE":1,"INTERESSE":1},"companies":[{"name":"Acme"}]}}',
    { candidat_id: z.string().uuid() },
    wrapTool('get_candidate_push_status', async (a) => guarded(() => presentations.pushStatus(a.candidat_id as string))),
  );
}
