import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as entrepriseService from '../../entreprises/entreprise.service.js';

export function registerCompanyTools(server: McpServer) {
  server.tool(
    'search_companies',
    "Searches companies in the ATS by name, sector, city or size.",
    {
      query: z.string().describe('Free-text search: name, sector'),
      city: z.string().optional().describe('Filter by city'),
      sector: z.string().optional().describe('Filter by sector'),
      limit: z.number().optional().default(10),
    },
    wrapTool('search_companies', async (args) => {
      const result = await entrepriseService.list(
        { page: 1, perPage: (args.limit as number) || 10 },
        args.query as string,
        args.sector ? [args.sector as string] : undefined,
        args.city ? [args.city as string] : undefined,
      );
      return {
        total: result.meta.total,
        companies: result.data.map((e: any) => ({
          id: e.id,
          name: e.nom,
          sector: e.secteur,
          city: e.localisation,
          size: e.taille,
          website: e.siteWeb,
          clients_count: e._count?.clients,
          mandates_count: e._count?.mandats,
        })),
      };
    }),
  );

  server.tool(
    'get_company',
    "Gets a company's full record with its contacts and mandates.",
    {
      company_id: z.string().optional().describe("Company UUID"),
      company_name: z.string().optional().describe("Company name if no UUID"),
    },
    wrapTool('get_company', async (args) => {
      let company: any;
      if (args.company_id) {
        company = await entrepriseService.getById(args.company_id as string);
      } else if (args.company_name) {
        const results = await entrepriseService.list({ page: 1, perPage: 1 }, args.company_name as string);
        company = results.data[0];
      }
      if (!company) return { error: 'Company not found' };

      return {
        id: company.id,
        name: company.nom,
        sector: company.secteur,
        city: company.localisation,
        size: company.taille,
        website: company.siteWeb,
        linkedin_url: company.linkedinUrl,
        siren: company.siren,
        effectif: company.effectif,
        chiffre_affaires: company.chiffreAffaires,
        notes: company.notes,
        clients: company.clients?.map((c: any) => ({
          id: c.id,
          name: `${c.prenom || ''} ${c.nom}`.trim(),
          title: c.titre,
          status: c.statutClient,
        })),
        mandates: company.mandats?.map((m: any) => ({
          id: m.id,
          title: m.titrePoste,
          status: m.statut,
        })),
      };
    }),
  );

  server.tool(
    'create_company',
    "[CONFIRMATION REQUIRED] Creates a new company. You MUST ask for confirmation.",
    {
      nom: z.string().describe("Company name"),
      secteur: z.string().optional(),
      localisation: z.string().optional(),
      siteWeb: z.string().optional(),
      taille: z.string().optional().describe('STARTUP, PME (SME), ETI (mid-cap), GRAND_GROUPE (large group)'),
      linkedinUrl: z.string().optional(),
    },
    wrapTool('create_company', async (args, user) => {
      const company = await entrepriseService.create(args as any, user.userId);
      return { success: true, company_id: company.id, message: `Company ${args.nom} created` };
    }),
  );

  server.tool(
    'update_company',
    "[CONFIRMATION REQUIRED] Updates a company's details. You MUST ask for confirmation.",
    {
      company_id: z.string().describe("Company UUID"),
      nom: z.string().optional().describe("Company name (correction)"),
      secteur: z.string().optional().describe('Sector'),
      localisation: z.string().optional().describe('City'),
      siteWeb: z.string().optional().describe('Website'),
      linkedinUrl: z.string().optional().describe('LinkedIn URL'),
      taille: z.string().optional().describe('STARTUP, PME (SME), ETI (mid-cap), GRAND_GROUPE (large group)'),
      notes: z.string().optional().describe('Notes'),
    },
    wrapTool('update_company', async (args) => {
      const updates: Record<string, unknown> = {};
      for (const key of ['nom', 'secteur', 'localisation', 'siteWeb', 'linkedinUrl', 'taille', 'notes']) {
        if (args[key] !== undefined) updates[key] = args[key];
      }
      if (Object.keys(updates).length === 0) return { error: 'No update provided' };

      const company = await entrepriseService.update(args.company_id as string, updates as any);
      return { success: true, message: `Company ${company.nom} updated`, fields_updated: Object.keys(updates) };
    }),
  );
}
