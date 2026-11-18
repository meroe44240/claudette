import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as clientService from '../../clients/client.service.js';
import { resolvePersonPhoto } from '../../../lib/photo.js';

export function registerClientTools(server: McpServer) {
  server.tool(
    'search_clients',
    'Searches clients (company contacts) in the ATS by name, email, company or status. Use when the recruiter is looking for a client.',
    {
      query: z.string().describe('Free-text search: name, email, company'),
      statut: z.string().optional().describe('Filter by status: LEAD, PREMIER_CONTACT (first contact), BESOIN_QUALIFIE (need qualified), PROPOSITION_ENVOYEE (proposal sent), MANDAT_SIGNE (mandate signed), RECURRENT (recurring), INACTIF (inactive)'),
      limit: z.number().optional().default(10).describe('Maximum number of results'),
    },
    wrapTool('search_clients', async (args, user) => {
      const result = await clientService.list(
        { page: 1, perPage: (args.limit as number) || 10 },
        args.query as string,
        undefined,                                // entrepriseId
        args.statut as string | undefined,        // statutClient (single string, service handles it)
      );
      return {
        total: result.meta.total,
        clients: result.data.map((c: any) => ({
          id: c.id,
          name: `${c.prenom || ''} ${c.nom}`.trim(),
          title: c.poste,
          email: c.email,
          phone: c.telephone,
          company: c.entreprise?.nom,
          status: c.statutClient,
          type: c.typeClient,
        })),
      };
    }),
  );

  server.tool(
    'get_client',
    "Gets a client's full record with their mandates and latest activity.",
    {
      client_id: z.string().optional().describe('Client UUID'),
      client_name: z.string().optional().describe('Client name if no UUID'),
    },
    wrapTool('get_client', async (args) => {
      let client: any;
      if (args.client_id) {
        client = await clientService.getById(args.client_id as string);
      } else if (args.client_name) {
        const results = await clientService.list({ page: 1, perPage: 1 }, args.client_name as string);
        client = results.data[0];
      }
      if (!client) return { error: 'Client not found' };

      return {
        id: client.id,
        name: `${client.prenom || ''} ${client.nom}`.trim(),
        title: client.poste,
        email: client.email,
        phone: client.telephone,
        company: client.entreprise?.nom,
        company_id: client.entrepriseId,
        status: client.statutClient,
        type: client.typeClient,
        role: client.roleContact,
        linkedin_url: client.linkedinUrl,
        notes: client.notes,
        mandates: client.mandats?.map((m: any) => ({
          id: m.id,
          title: m.titrePoste,
          status: m.statut,
          fee: m.feePourcentage,
        })),
        created_at: client.createdAt,
      };
    }),
  );

  server.tool(
    'create_client',
    "[CONFIRMATION REQUIRED] Creates a new client (company contact) in the ATS. You MUST ask for confirmation before creating.",
    {
      nom: z.string().describe('Last name'),
      prenom: z.string().optional().describe('First name'),
      email: z.string().optional().describe('Email'),
      telephone: z.string().optional().describe('Phone'),
      titre: z.string().optional().describe('Contact job title'),
      entrepriseId: z.string().optional().describe("Company UUID"),
      linkedinUrl: z.string().optional().describe('LinkedIn profile URL'),
      photo_url: z.string().optional().describe('Contact photo URL (e.g. LinkedIn photo). If missing, looked up on Gravatar when an email is known.'),
      roleContact: z.string().optional().describe('Role: HIRING_MANAGER, DRH (HR director), PROCUREMENT, CEO, AUTRE (other)'),
      statutClient: z.string().optional().describe('Status: LEAD, PREMIER_CONTACT, BESOIN_QUALIFIE, etc.'),
    },
    wrapTool('create_client', async (args, user) => {
      if (!args.entrepriseId) {
        return { error: 'entrepriseId is required. Find the company first with search_companies or create it with create_company.' };
      }
      if (args.email) {
        const dup = await clientService.checkDuplicate(args.email as string);
        if (dup.exists && dup.match) return { warning: 'Duplicate found', existing: { id: dup.match.id, name: `${dup.match.prenom} ${dup.match.nom}` } };
      }
      // Map 'titre' → 'poste' (Prisma field name) ; résout la photo (URL fournie ou Gravatar)
      const { titre, photo_url, ...rest } = args as any;
      const photoUrl = await resolvePersonPhoto({ photoUrl: photo_url, email: args.email as string });
      const createData = { ...rest, poste: titre, photoUrl: photoUrl ?? undefined };
      const client = await clientService.create(createData, user.userId);
      return { success: true, client_id: client.id, message: `Client ${args.prenom || ''} ${args.nom} created` };
    }),
  );

  server.tool(
    'update_client',
    "[CONFIRMATION REQUIRED] Updates a client's details. You MUST ask for confirmation.",
    {
      client_id: z.string().describe('Client UUID'),
      nom: z.string().optional().describe('Last name (correction)'),
      prenom: z.string().optional().describe('First name (correction)'),
      email: z.string().optional().describe('Email'),
      telephone: z.string().optional().describe('Phone'),
      titre: z.string().optional().describe('Contact job title'),
      linkedinUrl: z.string().optional().describe('LinkedIn URL'),
      statutClient: z.string().optional().describe('LEAD, PREMIER_CONTACT, BESOIN_QUALIFIE, PROPOSITION_ENVOYEE, MANDAT_SIGNE, RECURRENT, INACTIF'),
      roleContact: z.string().optional().describe('HIRING_MANAGER, DRH, PROCUREMENT, CEO, AUTRE'),
      notes: z.string().optional(),
    },
    wrapTool('update_client', async (args) => {
      const updates: Record<string, unknown> = {};
      for (const key of ['nom', 'prenom', 'email', 'telephone', 'linkedinUrl', 'statutClient', 'roleContact', 'notes']) {
        if (args[key] !== undefined) updates[key] = args[key];
      }
      // Map 'titre' → 'poste' (Prisma field name)
      if (args.titre !== undefined) updates.poste = args.titre;
      const client = await clientService.update(args.client_id as string, updates as any);
      return { success: true, message: `Client ${client.prenom || ''} ${client.nom} updated` };
    }),
  );
}
