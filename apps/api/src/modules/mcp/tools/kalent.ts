import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as kalent from '../../integrations/kalent.service.js';

export function registerKalentTools(server: McpServer) {
  // ─── search_talents_kalent ────────────────────────
  server.tool(
    'search_talents_kalent',
    "Searches profiles in the Kalent database (200M+ profiles) with the team's shared API key. Build the filters from the recruiter's description (job title, location, skills, company, seniority...). A LOCATION filter accepts a radius in km (default 30).",
    {
      job_title: z.string().optional().describe("Target job title (e.g. 'Software Engineer', 'Sales Director')"),
      location: z.string().optional().describe("City, region or country (e.g. 'Paris', 'Lyon', 'France')"),
      location_radius_km: z.number().optional().default(30).describe("Radius around the location in km (default 30). If the recruiter gives miles, convert to km first."),
      skills: z.array(z.string()).optional().describe("Required skills (e.g. ['Python', 'AWS'])"),
      companies: z.array(z.string()).optional().describe("Current or past companies (e.g. ['OpenAI', 'Google'])"),
      excluded_companies: z.array(z.string()).optional().describe("Companies to exclude"),
      seniority: z.array(z.string()).optional().describe("Seniority levels (e.g. ['Senior', 'Lead', 'Director'])"),
      industries: z.array(z.string()).optional().describe("Industries"),
      languages: z.array(z.string()).optional().describe("Spoken languages"),
      raw_filters: z
        .array(
          z.object({
            filterType: z.string().describe("Kalent filter type (e.g. JOB_TITLE, LOCATION, SKILL, COMPANY, SENIORITY, INDUSTRY, LANGUAGE, EDUCATION)"),
            value: z.string(),
            isRequired: z.boolean().optional(),
            isExcluded: z.boolean().optional(),
            isExactMatch: z.boolean().optional(),
            radius: z.number().optional(),
          }),
        )
        .optional()
        .describe("Raw Kalent filters, for a type not covered by the fields above"),
    },
    wrapTool('search_talents_kalent', async (args) => {
      if (!kalent.isConfigured()) {
        return { error: 'Kalent integration is not configured. Contact an administrator.' };
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
        return { error: 'At least one search criterion is required (job_title, location, skills...)' };
      }

      const result = await kalent.searchTalents(filters);
      return result;
    }),
  );
}
