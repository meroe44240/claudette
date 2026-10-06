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
    if (!UUID_RE.test(args.mandate_id)) return { error: 'mandate_not_found', message: `"${args.mandate_id}" n'est pas un UUID de mandat. Utilise mandate_name ou search_mandates.` };
    const m = await prisma.mandat.findUnique({ where: { id: args.mandate_id }, select });
    return m ? shape(m) : { error: 'mandate_not_found', message: `Aucun mandat avec l'UUID ${args.mandate_id}.` };
  }
  if (typeof args.mandate_name === 'string' && args.mandate_name.trim()) {
    const found = await mandatService.list({ page: 1, perPage: 6 }, args.mandate_name.trim());
    const rows = found.data as Array<{ id: string; titrePoste: string; statut: string; entreprise: { nom: string } }>;
    if (rows.length === 0) return { error: 'mandate_not_found', message: `Aucun mandat ne correspond a "${args.mandate_name}". Utilise search_mandates.` };
    if (rows.length > 1) {
      return {
        error: 'mandate_ambiguous',
        message: `Plusieurs mandats correspondent a "${args.mandate_name}". Demande a l'utilisateur lequel, puis rappelle avec mandate_id.`,
        candidates: rows.map((r) => ({ id: r.id, titre: r.titrePoste, entreprise: r.entreprise.nom, statut: r.statut })),
      };
    }
    const m = await prisma.mandat.findUnique({ where: { id: rows[0].id }, select });
    if (m) return shape(m);
  }
  return { error: 'mandate_not_found', message: 'Mandat introuvable. Precise mandate_id ou mandate_name.' };
}

const fullName = (c: { nom: string; prenom: string | null } | null) => (c ? `${c.prenom || ''} ${c.nom}`.trim() : null);

export function registerPortalTools(server: McpServer) {
  server.tool(
    'list_portal_accesses',
    "Liste les acces au portail client d'un mandat : qui peut se connecter, derniere connexion, acces revoques. " +
      "Utiliser quand on demande 'le client a-t-il acces au portail', 'qui a acces au portail de tel mandat', ou avant d'ouvrir/retirer un acces.",
    {
      mandate_id: z.string().optional().describe('UUID du mandat'),
      mandate_name: z.string().optional().describe("Titre du mandat si pas d'UUID"),
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
          status: a.revokedAt ? 'revoque' : 'actif',
          last_login: a.lastLoginAt,
          created_at: a.createdAt,
        })),
      };
    }),
  );

  server.tool(
    'grant_portal_access',
    "[CONFIRMATION REQUISE] Ouvre (ou reactive) l'acces d'un contact client au portail client d'un mandat. " +
      "Par defaut l'email est celui du client du mandat et une invitation lui est envoyee par email avec le lien et ses identifiants. " +
      "Le mot de passe n'est jamais renvoye ici : il part dans l'email d'invitation ; sans invitation, le contact en recoit un via « mot de passe oublie » sur la page de connexion. " +
      "Si le contact a deja un acces sur une autre offre de la meme entreprise, il garde son mot de passe. " +
      "Tu DOIS confirmer avec l'utilisateur le mandat, l'email destinataire et l'envoi de l'invitation avant d'appeler cet outil.",
    {
      mandate_id: z.string().optional().describe('UUID du mandat'),
      mandate_name: z.string().optional().describe("Titre du mandat si pas d'UUID"),
      email: z.string().optional().describe("Email du contact a inviter. Par defaut : l'email du client du mandat"),
      contact_name: z.string().optional().describe('Nom du contact invite (affiche dans le portail). Par defaut : le client du mandat'),
      send_invite: z.boolean().optional().default(true).describe("Envoyer l'email d'invitation avec le lien et les identifiants (defaut : true)"),
    },
    wrapTool('grant_portal_access', async (args) => {
      const mandat = await resolveMandat(args);
      if ('error' in mandat) return mandat;
      if (!mandat.client) {
        return { error: 'no_client', message: `Le mandat "${mandat.titrePoste}" n'a pas de client rattache : impossible d'ouvrir un acces portail. Rattache d'abord un client au mandat.` };
      }

      const email = (typeof args.email === 'string' && args.email.trim() ? args.email : mandat.client.email || '').toLowerCase().trim();
      if (!email) {
        return { error: 'no_email', message: `Le client ${fullName(mandat.client)} n'a pas d'email sur sa fiche. Demande l'email a l'utilisateur et rappelle avec le parametre email.` };
      }
      if (!EMAIL_RE.test(email)) return { error: 'invalid_email', message: `"${email}" n'est pas un email valide.` };

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
        ? `Une invitation a ete envoyee a ${email} avec le lien et ses identifiants.`
        : `Aucun email envoye : transmets le lien a ${email}, qui recevra son mot de passe via « mot de passe oublie ».`;
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
        message: `Acces portail ouvert pour ${contactName || email} sur "${mandat.titrePoste}" (${mandat.entreprise}). ${suite}` +
          (access.reusedCredentials ? ' Ce contact avait deja un acces : son mot de passe reste le meme.' : ''),
      };
    }),
  );

  server.tool(
    'revoke_portal_access',
    "[CONFIRMATION REQUISE] Retire l'acces d'un contact au portail client d'un mandat (reserve aux admins). " +
      "Le contact ne peut plus se connecter a ce mandat ; l'acces peut etre rouvert ensuite avec grant_portal_access. Tu DOIS demander confirmation.",
    {
      access_id: z.string().optional().describe("UUID de l'acces (voir list_portal_accesses)"),
      mandate_id: z.string().optional().describe("UUID du mandat, si pas d'access_id"),
      mandate_name: z.string().optional().describe("Titre du mandat, si pas d'access_id"),
      email: z.string().optional().describe("Email du contact, a fournir avec le mandat si pas d'access_id"),
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
              ? `Plusieurs acces actifs sur "${mandat.titrePoste}". Precise l'email ou l'access_id.`
              : `Aucun acces actif${email ? ` pour ${email}` : ''} sur "${mandat.titrePoste}".`,
            candidates: actifs.map((a) => ({ access_id: a.id, email: a.email, name: a.name })),
          };
        }
        accessId = cible[0].id;
      }
      if (!UUID_RE.test(accessId)) return { error: 'access_not_found', message: `"${accessId}" n'est pas un UUID d'acces. Utilise list_portal_accesses.` };
      const existing = await prisma.portalAccess.findUnique({ where: { id: accessId }, select: { email: true, revokedAt: true, mandat: { select: { titrePoste: true } } } });
      if (!existing) return { error: 'access_not_found', message: `Aucun acces portail avec l'UUID ${accessId}.` };
      if (existing.revokedAt) return { success: true, access_id: accessId, message: `L'acces de ${existing.email} sur "${existing.mandat.titrePoste}" etait deja revoque.` };
      await portalService.revokeAccess(accessId);
      return { success: true, access_id: accessId, message: `Acces portail retire pour ${existing.email} sur "${existing.mandat.titrePoste}".` };
    }),
  );
}
