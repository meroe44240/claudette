import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as entrepriseService from '../../entreprises/entreprise.service.js';

export function registerCompanyTools(server: McpServer) {
  server.tool(
    'search_companies',
    "Recherche des entreprises dans l'ATS par nom, secteur, ville, taille.",
    {
      query: z.string().describe('Recherche libre : nom, secteur'),
      city: z.string().optional().describe('Filtrer par ville'),
      sector: z.string().optional().describe('Filtrer par secteur'),
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
    "Recupere la fiche complete d'une entreprise avec ses contacts et mandats.",
    {
      company_id: z.string().optional().describe("UUID de l'entreprise"),
      company_name: z.string().optional().describe("Nom de l'entreprise si pas d'UUID"),
    },
    wrapTool('get_company', async (args) => {
      let company: any;
      if (args.company_id) {
        company = await entrepriseService.getById(args.company_id as string);
      } else if (args.company_name) {
        const results = await entrepriseService.list({ page: 1, perPage: 1 }, args.company_name as string);
        company = results.data[0];
      }
      if (!company) return { error: 'Entreprise non trouvee' };

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
    "[CONFIRMATION REQUISE] Cree une nouvelle entreprise. Tu DOIS demander confirmation.",
    {
      nom: z.string().describe("Nom de l'entreprise"),
      secteur: z.string().optional(),
      localisation: z.string().optional(),
      siteWeb: z.string().optional(),
      taille: z.string().optional().describe('STARTUP, PME, ETI, GRAND_GROUPE'),
      linkedinUrl: z.string().optional(),
    },
    wrapTool('create_company', async (args, user) => {
      const company = await entrepriseService.create(args as any, user.userId);
      return { success: true, company_id: company.id, message: `Entreprise ${args.nom} creee` };
    }),
  );

  server.tool(
    'update_company',
    "[CONFIRMATION REQUISE] Met a jour les informations d'une entreprise. Tu DOIS demander confirmation.",
    {
      company_id: z.string().describe("UUID de l'entreprise"),
      nom: z.string().optional().describe("Nom de l'entreprise (correction)"),
      secteur: z.string().optional().describe('Secteur'),
      localisation: z.string().optional().describe('Ville'),
      siteWeb: z.string().optional().describe('Site web'),
      linkedinUrl: z.string().optional().describe('URL LinkedIn'),
      taille: z.string().optional().describe('STARTUP, PME, ETI, GRAND_GROUPE'),
      notes: z.string().optional().describe('Notes'),
    },
    wrapTool('update_company', async (args) => {
      const updates: Record<string, unknown> = {};
      for (const key of ['nom', 'secteur', 'localisation', 'siteWeb', 'linkedinUrl', 'taille', 'notes']) {
        if (args[key] !== undefined) updates[key] = args[key];
      }
      if (Object.keys(updates).length === 0) return { error: 'Aucune mise a jour fournie' };

      const company = await entrepriseService.update(args.company_id as string, updates as any);
      return { success: true, message: `Entreprise ${company.nom} mise a jour`, fields_updated: Object.keys(updates) };
    }),
  );
}
