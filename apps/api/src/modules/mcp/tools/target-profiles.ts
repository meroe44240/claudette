import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as service from '../../profils-recherches/profil-recherche.service.js';

// Profils recherchés : ce que chaque société recrute (photo à la date d'analyse,
// déduite de ses offres). Écriture sans confirmation pour les admins et les
// comptes agents ; lecture pour tous. Séparé des mandats, du job board et des stats.

const offre = z.object({
  titre: z.string().describe('Job ad title'),
  url: z.string().optional().describe('Job ad URL'),
  date_vue: z.string().optional().describe('Date the ad was seen (YYYY-MM-DD)'),
  source: z.string().optional().describe('Where the ad was found (LinkedIn, company site, partner platform...)'),
});

export function registerTargetProfileTools(server: McpServer) {
  server.tool(
    'upsert_target_profile',
    "Creates or replaces a target profile (the kind of person a company is hiring, deduced from its job ads). Same company + same function + same intitule_type = the same profile: a new analysis fully replaces the previous one. Leave any field you did not find in the ads empty, never guess. Engineering fields: technos, perimetre, projets. Sales fields: segments, secteurs, acheteur_type, cycle_de_vente, panier_moyen_acv, motion, territoire, quota, outils_methodo. Returns the profile id. Admins and agent accounts only, no confirmation needed.",
    {
      company_id: z.string().describe('Company UUID (required)'),
      fonction: z.enum(service.FONCTIONS).describe('ENGINEERING or SALES'),
      intitule_type: z.string().describe('Short profile label, e.g. "Backend senior Go", "AE mid-market"'),
      seniorite: z.enum(service.SENIORITES).optional(),
      pays: z.string().optional(),
      ville: z.string().optional(),
      remote: z.enum(service.REMOTES).optional().describe('ONSITE, HYBRID or REMOTE'),
      langues: z.array(z.string()).optional(),
      salaire_min: z.number().int().optional().describe('Yearly base, min'),
      salaire_max: z.number().int().optional().describe('Yearly base, max'),
      devise: z.string().optional().describe('ISO currency, e.g. EUR, USD, GBP'),
      ote: z.string().optional().describe('On-target earnings, free text'),
      equity: z.string().optional(),
      marche: z.enum(service.MARCHES).optional(),
      offres_sources: z.array(offre).optional().describe('Job ads the profile was deduced from'),
      date_analyse: z.string().optional().describe('Analysis date (ISO). Defaults to now'),
      analyse_par: z.string().optional().describe('Name of the agent or person who did the analysis, e.g. "Yanis"'),
      mandat_lie_id: z.string().optional().describe('Optional related mandate UUID'),
      type_lien: z.enum(service.LIENS).optional().describe('How the company relates to that mandate'),
      experience_attendue: z.string().optional(),
      technos: z.array(z.string()).optional().describe('ENGINEERING: languages, frameworks, data, cloud, tools'),
      perimetre: z.string().optional().describe('ENGINEERING: what the person builds, team, reporting line'),
      projets: z.string().optional().describe('ENGINEERING: new product, migration, scale, team creation'),
      segments: z.array(z.enum(service.SEGMENTS)).optional().describe('SALES: client segments'),
      secteurs: z.array(z.string()).optional().describe('SALES: client industries'),
      acheteur_type: z.string().optional().describe('SALES: who signs on the client side (CIO, CFO, Head of Ops...)'),
      cycle_de_vente: z.string().optional().describe('SALES: e.g. "3 to 6 months"'),
      panier_moyen_acv: z.string().optional(),
      motion: z.array(z.enum(service.MOTIONS)).optional(),
      territoire: z.string().optional(),
      quota: z.string().optional(),
      outils_methodo: z.array(z.string()).optional().describe('SALES: CRM, MEDDIC, etc.'),
    },
    wrapTool('upsert_target_profile', async (args, user) => {
      const r = await service.upsert(args, user);
      return { success: true, id: r.id, replaced: r.replaced };
    }),
  );

  server.tool(
    'get_company_target_profiles',
    "Lists a company's target profiles (Engineering and Sales) with its profiles summary.",
    { company_id: z.string().describe('Company UUID') },
    wrapTool('get_company_target_profiles', async (args) => service.getByCompany(args.company_id as string)),
  );

  server.tool(
    'search_target_profiles',
    'Searches target profiles across all companies. Same filters as the "Profils recherchés" page.',
    {
      q: z.string().optional().describe('Free-text search'),
      fonction: z.enum(service.FONCTIONS).optional(),
      seniorite: z.array(z.enum(service.SENIORITES)).optional(),
      technos: z.array(z.string()).optional().describe('Matches profiles with at least one of these technos'),
      segments: z.array(z.enum(service.SEGMENTS)).optional(),
      secteurs: z.array(z.string()).optional(),
      motion: z.array(z.enum(service.MOTIONS)).optional(),
      cycle_de_vente: z.string().optional().describe('Text contained in the sales cycle'),
      marche: z.array(z.enum(service.MARCHES)).optional(),
      pays: z.string().optional(),
      remote: z.array(z.enum(service.REMOTES)).optional(),
      date_from: z.string().optional().describe('Analysis date from (YYYY-MM-DD)'),
      date_to: z.string().optional().describe('Analysis date to (YYYY-MM-DD)'),
      company_id: z.string().optional(),
      mandat_lie_id: z.string().optional(),
      page: z.number().int().optional(),
      per_page: z.number().int().optional().describe('Default 50, max 1000'),
    },
    wrapTool('search_target_profiles', async (args) => service.search(args)),
  );

  server.tool(
    'set_company_profiles_summary',
    'Sets the 2-3 line summary of what a company is hiring ("Cherche : ... / Pour : ..."). The date is set automatically. Admins and agent accounts only, no confirmation needed.',
    {
      company_id: z.string().describe('Company UUID'),
      resume_profils: z.string().describe('2 or 3 lines'),
    },
    wrapTool('set_company_profiles_summary', async (args, user) => service.setSummary(args.company_id as string, args.resume_profils as string, user)),
  );

  server.tool(
    'match_candidate_to_profiles',
    'For an S-Tier, A-tier or A-Player candidate, lists the target profiles that fit, with the reasons (Engineering: shared technos, seniority, location/remote; Sales: client type, buyer, cycle, motion).',
    { candidate_id: z.string().describe('Candidate UUID') },
    wrapTool('match_candidate_to_profiles', async (args) => {
      const r = await service.matchCandidate(args.candidate_id as string);
      return { ...r, matches: r.matches.map((m) => ({ score: m.score, reasons: m.reasons.map(service.reasonText), profile: m.profile })) };
    }),
  );
}
