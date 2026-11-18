import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import prisma from '../../../lib/db.js';
import * as mandatService from '../../mandats/mandat.service.js';
import * as portalService from '../../portal/portal.service.js';

const PORTAL_BASE = process.env.PORTAL_BASE_URL || 'https://ats.propium.co';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MandatRef = { id: string; titrePoste: string; entreprise: string; client: { id: string; nom: string; prenom: string | null; email: string | null } | null };

/**
 * Resout un mandat par UUID ou par nom. Sur un nom ambigu on renvoie les candidats
 * plutot que de prendre le premier : un acces portail ouvert sur le mauvais mandat
 * montrerait des profils au mauvais client.
 */
async function resolveMandat(args: Record<string, unknown>): Promise<MandatRef | { error: string; message: string; candidates?: unknown[] }> {
  const select = { id: true, titrePoste: true, entreprise: { select: { nom: true } }, client: { select: { id: true, nom: true, prenom: true, email: true } } } as const;
  const shape = (m: { id: string; titrePoste: string; entreprise: { nom: string }; client: MandatRef['client'] }): MandatRef =>
    ({ id: m.id, titrePoste: m.titrePoste, entreprise: m.entreprise.nom, client: m.client });

  if (typeof args.mandate_id === 'string' && args.mandate_id) {
    if (!UUID_RE.test(args.mandate_id)) return { error: 'mandate_not_found', message: `"${args.mandate_id}" is not a mandate UUID. Use mandate_name or search_mandates.` };
    const m = await prisma.mandat.findUnique({ where: { id: args.mandate_id }, select });
    return m ? shape(m) : { error: 'mandate_not_found', message: `No mandate with UUID ${args.mandate_id}.` };
  }
  if (typeof args.mandate_name === 'string' && args.mandate_name.trim()) {
    const found = await mandatService.list({ page: 1, perPage: 6 }, args.mandate_name.trim());
    const rows = found.data as Array<{ id: string; titrePoste: string; statut: string; entreprise: { nom: string } }>;
    if (rows.length === 0) return { error: 'mandate_not_found', message: `No mandate matches "${args.mandate_name}". Use search_mandates.` };
    if (rows.length > 1) {
      return {
        error: 'mandate_ambiguous',
        message: `Several mandates match "${args.mandate_name}". Ask the user which one, then call again with mandate_id.`,
        candidates: rows.map((r) => ({ id: r.id, titre: r.titrePoste, entreprise: r.entreprise.nom, statut: r.statut })),
      };
    }
    const m = await prisma.mandat.findUnique({ where: { id: rows[0].id }, select });
    if (m) return shape(m);
  }
  return { error: 'mandate_not_found', message: 'Mandate not found. Provide mandate_id or mandate_name.' };
}

const fullName = (c: { nom: string; prenom: string | null } | null) => (c ? `${c.prenom || ''} ${c.nom}`.trim() : null);

export function registerPortalTools(server: McpServer) {
  server.tool(
    'list_portal_accesses',
    "Lists the client portal accesses of a mandate: who can log in, last login, revoked accesses. " +
      "Use when asked 'does the client have portal access', 'who can access the portal for this mandate', or before granting or revoking an access.",
    {
      mandate_id: z.string().optional().describe('Mandate UUID'),
      mandate_name: z.string().optional().describe("Mandate title if no UUID"),
    },
    wrapTool('list_portal_accesses', async (args) => {
      const mandat = await resolveMandat(args);
      if ('error' in mandat) return mandat;
      const accesses = await portalService.listAccessesForMandat(mandat.id);
      return {
        mandate_id: mandat.id,
        mandate: mandat.titrePoste,
        company: mandat.entreprise,
        client: fullName(mandat.client),
        client_email: mandat.client?.email ?? null,
        portal_link: `${PORTAL_BASE}/portail/login?m=${mandat.id}`,
        active: accesses.filter((a) => !a.revokedAt).length,
        accesses: accesses.map((a) => ({
          access_id: a.id,
          email: a.email,
          name: a.name || fullName(a.client),
          status: a.revokedAt ? 'revoked' : 'active',
          last_login: a.lastLoginAt,
          created_at: a.createdAt,
        })),
      };
    }),
  );

  server.tool(
    'grant_portal_access',
    "[CONFIRMATION REQUIRED] Grants (or reactivates) a client contact's access to the client portal of a mandate. " +
      "By default the email is the mandate client's, and an invitation is emailed with the link and login details. " +
      "The password is never returned here: it goes in the invitation email; without an invitation, the contact gets one through 'forgot password' on the login page. " +
      "If the contact already has access to another job at the same company, they keep their password. " +
      "You MUST confirm the mandate, the recipient email and whether to send the invitation with the user before calling this tool.",
    {
      mandate_id: z.string().optional().describe('Mandate UUID'),
      mandate_name: z.string().optional().describe("Mandate title if no UUID"),
      email: z.string().optional().describe("Email of the contact to invite. Default: the mandate client's email"),
      contact_name: z.string().optional().describe('Invited contact name (shown in the portal). Default: the mandate client'),
      send_invite: z.boolean().optional().default(true).describe("Send the invitation email with the link and login details (default: true)"),
    },
    wrapTool('grant_portal_access', async (args) => {
      const mandat = await resolveMandat(args);
      if ('error' in mandat) return mandat;
      if (!mandat.client) {
        return { error: 'no_client', message: `The mandate "${mandat.titrePoste}" has no client attached, so no portal access can be granted. Attach a client to the mandate first.` };
      }

      const email = (typeof args.email === 'string' && args.email.trim() ? args.email : mandat.client.email || '').toLowerCase().trim();
      if (!email) {
        return { error: 'no_email', message: `The client ${fullName(mandat.client)} has no email on their record. Ask the user for the email and call again with the email parameter.` };
      }
      if (!EMAIL_RE.test(email)) return { error: 'invalid_email', message: `"${email}" is not a valid email.` };

      const isMainClient = email === (mandat.client.email || '').toLowerCase().trim();
      const contactName = (typeof args.contact_name === 'string' && args.contact_name.trim()) || (isMainClient ? fullName(mandat.client) : null) || undefined;
      const sendInvite = args.send_invite !== false;

      const access = await portalService.createAccess({
        mandatId: mandat.id,
        clientId: mandat.client.id,
        email,
        password: randomBytes(9).toString('base64url'),
        sendInvite,
        contactName,
      });

      const link = `${PORTAL_BASE}/portail/login?m=${mandat.id}`;
      const suite = sendInvite
        ? `An invitation was sent to ${email} with the link and login details.`
        : `No email sent: share the link with ${email}, who will get a password through 'forgot password'.`;
      return {
        success: true,
        access_id: access.id,
        mandate_id: mandat.id,
        mandate: mandat.titrePoste,
        company: mandat.entreprise,
        email,
        portal_link: link,
        invite_sent: sendInvite,
        reused_credentials: access.reusedCredentials,
        message: `Portal access granted to ${contactName || email} on "${mandat.titrePoste}" (${mandat.entreprise}). ${suite}` +
          (access.reusedCredentials ? ' This contact already had access: their password stays the same.' : ''),
      };
    }),
  );

  server.tool(
    'revoke_portal_access',
    "[CONFIRMATION REQUIRED] Revokes a contact's access to the client portal of a mandate (admins only). " +
      "The contact can no longer log in to this mandate; access can be granted again later with grant_portal_access. You MUST ask for confirmation.",
    {
      access_id: z.string().optional().describe("Access UUID (see list_portal_accesses)"),
      mandate_id: z.string().optional().describe("Mandate UUID, if no access_id"),
      mandate_name: z.string().optional().describe("Mandate title, if no access_id"),
      email: z.string().optional().describe("Contact email, to give with the mandate if no access_id"),
    },
    wrapTool('revoke_portal_access', async (args) => {
      let accessId = typeof args.access_id === 'string' ? args.access_id : '';
      if (!accessId) {
        const mandat = await resolveMandat(args);
        if ('error' in mandat) return mandat;
        const email = typeof args.email === 'string' ? args.email.toLowerCase().trim() : '';
        const actifs = (await portalService.listAccessesForMandat(mandat.id)).filter((a) => !a.revokedAt);
        const cible = email ? actifs.filter((a) => a.email === email) : actifs;
        if (cible.length !== 1) {
          return {
            error: cible.length ? 'access_ambiguous' : 'access_not_found',
            message: cible.length
              ? `Several active accesses on "${mandat.titrePoste}". Specify the email or access_id.`
              : `No active access${email ? ` for ${email}` : ''} on "${mandat.titrePoste}".`,
            candidates: actifs.map((a) => ({ access_id: a.id, email: a.email, name: a.name })),
          };
        }
        accessId = cible[0].id;
      }
      if (!UUID_RE.test(accessId)) return { error: 'access_not_found', message: `"${accessId}" is not an access UUID. Use list_portal_accesses.` };
      const existing = await prisma.portalAccess.findUnique({ where: { id: accessId }, select: { email: true, revokedAt: true, mandat: { select: { titrePoste: true } } } });
      if (!existing) return { error: 'access_not_found', message: `No portal access with UUID ${accessId}.` };
      if (existing.revokedAt) return { success: true, access_id: accessId, message: `The access of ${existing.email} on "${existing.mandat.titrePoste}" was already revoked.` };
      await portalService.revokeAccess(accessId);
      return { success: true, access_id: accessId, message: `Portal access revoked for ${existing.email} on "${existing.mandat.titrePoste}".` };
    }),
  );
}
