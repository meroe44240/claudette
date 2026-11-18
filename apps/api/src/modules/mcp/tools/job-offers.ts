import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as jobOfferService from '../../job-offers/job-offer.service.js';

export function registerJobOfferTools(server: McpServer) {
  server.tool(
    'list_job_offers',
    "Lists job board offers (published and drafts). Use when a recruiter or salesperson asks 'show me my job offers', 'which offers are live', etc.",
    {},
    wrapTool('list_job_offers', async () => {
      const offers = await jobOfferService.list();
      return {
        total: offers.length,
        published: offers.filter((o) => o.published).length,
        offers: offers.map((o) => ({
          id: o.id, slug: o.slug, titre: o.titre, published: o.published,
          entreprise: o.entrepriseNom, localisation: o.localisation, contractType: o.contractType,
          salaire_min: o.salaireMin, salaire_max: o.salaireMax, tags: o.tags,
        })),
      };
    }),
  );

  server.tool(
    'create_job_offer',
    "[CONFIRMATION REQUIRED] Creates a job board offer (read by the website through the public API). You MUST ask for confirmation. The offer is a draft (unpublished) by default: set published=true to publish it right away.",
    {
      titre: z.string().describe("Job title"),
      description: z.string().describe("Description: responsibilities, profile sought"),
      entreprise_nom: z.string().optional().describe("Company name shown publicly (empty = confidential)"),
      localisation: z.string().optional().describe("E.g. Paris (75)"),
      contract_type: z.string().optional().describe("CDI, CDD, FREELANCE, ALTERNANCE, STAGE"),
      remote: z.string().optional().describe("ONSITE, HYBRID, REMOTE"),
      salaire_min: z.number().int().optional().describe("Minimum salary in euros per year"),
      salaire_max: z.number().int().optional().describe("Maximum salary in euros per year"),
      secteur: z.string().optional().describe("Industry"),
      tags: z.array(z.string()).optional().describe("Skills or keywords"),
      published: z.boolean().optional().describe("true = publish on the job board right away. Default false (draft)."),
    },
    wrapTool('create_job_offer', async (args, user) => {
      const offer = await jobOfferService.create({
        titre: args.titre as string,
        description: args.description as string,
        entrepriseNom: (args.entreprise_nom as string) ?? null,
        localisation: (args.localisation as string) ?? null,
        contractType: (args.contract_type as string) ?? null,
        remote: (args.remote as string) ?? null,
        salaireMin: (args.salaire_min as number) ?? null,
        salaireMax: (args.salaire_max as number) ?? null,
        secteur: (args.secteur as string) ?? null,
        tags: (args.tags as string[]) ?? [],
        published: (args.published as boolean) ?? false,
      }, user.userId);
      return { success: true, id: offer.id, slug: offer.slug, published: offer.published, message: offer.published ? 'Offer created and published on the job board' : 'Offer created as a draft' };
    }),
  );

  server.tool(
    'publish_job_offer',
    "[CONFIRMATION REQUIRED] Publishes or unpublishes a job board offer. You MUST ask for confirmation.",
    {
      offer_id: z.string().describe("Offer UUID"),
      published: z.boolean().describe("true = publish, false = unpublish"),
    },
    wrapTool('publish_job_offer', async (args) => {
      const offer = await jobOfferService.setPublished(args.offer_id as string, args.published as boolean);
      return { success: true, id: offer.id, published: offer.published, message: offer.published ? 'Offer published on the job board' : 'Offer unpublished' };
    }),
  );
}
