import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as kalent from '../../integrations/kalent.service.js';

export function registerKalentTools(server: McpServer) {
  // ─── search_talents_kalent ────────────────────────
  server.tool(
    'search_talents_kalent',
    "Recherche des profils dans la base Kalent (+200M profils). Utilise la cle API partagee de l'equipe. Construis les filtres a partir de la description du recruteur (job title, localisation, skills, entreprise, seniorite...). Un filtre LOCATION accepte un rayon en km (defaut 30).",
    {
      job_title: z.string().optional().describe("Intitule de poste recherche (ex: 'Software Engineer', 'Directeur commercial')"),
      location: z.string().optional().describe("Ville, region ou pays (ex: 'Paris', 'Lyon', 'France')"),
      location_radius_km: z.number().optional().default(30).describe("Rayon autour de la localisation en km (defaut 30). Si le recruteur mentionne des miles, convertir en km avant."),
      skills: z.array(z.string()).optional().describe("Competences requises (ex: ['Python', 'AWS'])"),
      companies: z.array(z.string()).optional().describe("Entreprises actuelles/passees (ex: ['OpenAI', 'Google'])"),
      excluded_companies: z.array(z.string()).optional().describe("Entreprises a exclure"),
      seniority: z.array(z.string()).optional().describe("Niveaux de seniorite (ex: ['Senior', 'Lead', 'Director'])"),
      industries: z.array(z.string()).optional().describe("Secteurs d'activite"),
      languages: z.array(z.string()).optional().describe("Langues parlees"),
      raw_filters: z
        .array(
          z.object({
            filterType: z.string().describe("Type de filtre Kalent (ex: JOB_TITLE, LOCATION, SKILL, COMPANY, SENIORITY, INDUSTRY, LANGUAGE, EDUCATION)"),
            value: z.string(),
            isRequired: z.boolean().optional(),
            isExcluded: z.boolean().optional(),
            isExactMatch: z.boolean().optional(),
            radius: z.number().optional(),
          }),
        )
        .optional()
        .describe("Filtres bruts Kalent si besoin d'un type non couvert par les champs ci-dessus"),
    },
    wrapTool('search_talents_kalent', async (args) => {
      if (!kalent.isConfigured()) {
        return { error: 'Integration Kalent non configuree. Contacter un administrateur.' };
      }

      const filters: kalent.KalentFilter[] = [];

      if (args.job_title) {
        filters.push({ filterType: 'JOB_TITLE', value: args.job_title as string, isRequired: true });
      }
      if (args.location) {
        filters.push({
          filterType: 'LOCATION',
          value: args.location as string,
          isRequired: true,
          radius: (args.location_radius_km as number) ?? 30,
        });
      }
      for (const skill of (args.skills as string[] | undefined) ?? []) {
        filters.push({ filterType: 'SKILL', value: skill, isRequired: true });
      }
      for (const company of (args.companies as string[] | undefined) ?? []) {
        filters.push({ filterType: 'COMPANY', value: company, isRequired: false });
      }
      for (const company of (args.excluded_companies as string[] | undefined) ?? []) {
        filters.push({ filterType: 'COMPANY', value: company, isExcluded: true });
      }
      for (const s of (args.seniority as string[] | undefined) ?? []) {
        filters.push({ filterType: 'SENIORITY', value: s, isRequired: false });
      }
      for (const i of (args.industries as string[] | undefined) ?? []) {
        filters.push({ filterType: 'INDUSTRY', value: i, isRequired: false });
      }
      for (const l of (args.languages as string[] | undefined) ?? []) {
        filters.push({ filterType: 'LANGUAGE', value: l, isRequired: false });
      }
      for (const raw of (args.raw_filters as kalent.KalentFilter[] | undefined) ?? []) {
        filters.push(raw);
      }

      if (!filters.length) {
        return { error: 'Au moins un critere de recherche est requis (job_title, location, skills, ...)' };
      }

      const result = await kalent.searchTalents(filters);
      return result;
    }),
  );
}
