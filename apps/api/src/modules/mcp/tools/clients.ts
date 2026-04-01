import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as clientService from '../../clients/client.service.js';

export function registerClientTools(server: McpServer) {
  server.tool(
    'search_clients',
    'Recherche des clients (contacts entreprise) dans l\'ATS par nom, email, entreprise, statut. Utiliser quand le recruteur cherche un client.',
    {
      query: z.string().describe('Recherche libre : nom, email, entreprise'),
      statut: z.string().optional().describe('Filtrer par statut : LEAD, PREMIER_CONTACT, BESOIN_QUALIFIE, PROPOSITION_ENVOYEE, MANDAT_SIGNE, RECURRENT, INACTIF'),
      limit: z.number().optional().default(10).describe('Nombre max de resultats'),
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
          title: c.titre,
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
    "Recupere la fiche complete d'un client avec ses mandats et dernieres activites.",
    {
      client_id: z.string().optional().describe('UUID du client'),
      client_name: z.string().optional().describe('Nom du client si pas d\'UUID'),
    },
    wrapTool('get_client', async (args) => {
      let client: any;
      if (args.client_id) {
        client = await clientService.getById(args.client_id as string);
      } else if (args.client_name) {
        const results = await clientService.list({ page: 1, perPage: 1 }, args.client_name as string);
        client = results.data[0];
      }
      if (!client) return { error: 'Client non trouve' };

      return {
        id: client.id,
        name: `${client.prenom || ''} ${client.nom}`.trim(),
        title: client.titre,
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
    "[CONFIRMATION REQUISE] Cree un nouveau client (contact entreprise) dans l'ATS. Tu DOIS demander confirmation avant de creer.",
    {
      nom: z.string().describe('Nom de famille'),
      prenom: z.string().optional().describe('Prenom'),
      email: z.string().optional().describe('Email'),
      telephone: z.string().optional().describe('Telephone'),
      titre: z.string().optional().describe('Titre/poste'),
      entrepriseId: z.string().optional().describe("UUID de l'entreprise"),
      roleContact: z.string().optional().describe('Role : HIRING_MANAGER, DRH, PROCUREMENT, CEO, AUTRE'),
      statutClient: z.string().optional().describe('Statut : LEAD, PREMIER_CONTACT, BESOIN_QUALIFIE, etc.'),
    },
    wrapTool('create_client', async (args, user) => {
      if (!args.entrepriseId) {
        return { error: 'entrepriseId est requis. Cherche d\'abord l\'entreprise avec search_companies ou cree-la avec create_company.' };
      }
      if (args.email) {
        const dup = await clientService.checkDuplicate(args.email as string);
        if (dup.exists && dup.match) return { warning: 'Doublon detecte', existing: { id: dup.match.id, name: `${dup.match.prenom} ${dup.match.nom}` } };
      }
      const client = await clientService.create(args as any, user.userId);
      return { success: true, client_id: client.id, message: `Client ${args.prenom || ''} ${args.nom} cree` };
    }),
  );

  server.tool(
    'update_client',
    "[CONFIRMATION REQUISE] Met a jour les informations d'un client. Tu DOIS demander confirmation.",
    {
      client_id: z.string().describe('UUID du client'),
      titre: z.string().optional(),
      telephone: z.string().optional(),
      statutClient: z.string().optional().describe('LEAD, PREMIER_CONTACT, BESOIN_QUALIFIE, PROPOSITION_ENVOYEE, MANDAT_SIGNE, RECURRENT, INACTIF'),
      notes: z.string().optional(),
    },
    wrapTool('update_client', async (args) => {
      const updates: Record<string, unknown> = {};
      for (const key of ['titre', 'telephone', 'statutClient', 'notes']) {
        if (args[key] !== undefined) updates[key] = args[key];
      }
      const client = await clientService.update(args.client_id as string, updates as any);
      return { success: true, message: `Client ${client.prenom || ''} ${client.nom} mis a jour` };
    }),
  );
}
