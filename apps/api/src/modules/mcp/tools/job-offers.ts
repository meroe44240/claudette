import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as jobOfferService from '../../job-offers/job-offer.service.js';

export function registerJobOfferTools(server: McpServer) {
  server.tool(
    'list_job_offers',
    "Liste les offres du job board (publiees et brouillons). Utiliser quand le recruteur/sales demande 'montre-moi mes offres', 'quelles offres sont en ligne', etc.",
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
    "[CONFIRMATION REQUISE] Cree une offre pour le job board (consommee par la landing via l'API publique). Tu DOIS demander confirmation. Par defaut l'offre est un brouillon (non publiee) : mets published=true pour la publier directement.",
    {
      titre: z.string().describe("Intitule du poste"),
      description: z.string().describe("Description : missions, profil recherche"),
      entreprise_nom: z.string().optional().describe("Nom de l'entreprise affiche publiquement (vide = confidentiel)"),
      localisation: z.string().optional().describe("Ex : Paris (75)"),
      contract_type: z.string().optional().describe("CDI, CDD, FREELANCE, ALTERNANCE, STAGE"),
      remote: z.string().optional().describe("ONSITE, HYBRID, REMOTE"),
      salaire_min: z.number().int().optional().describe("Salaire min en euros/an"),
      salaire_max: z.number().int().optional().describe("Salaire max en euros/an"),
      secteur: z.string().optional().describe("Secteur d'activite"),
      tags: z.array(z.string()).optional().describe("Competences / mots-cles"),
      published: z.boolean().optional().describe("true = publier tout de suite sur le job board. Defaut false (brouillon)."),
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
      return { success: true, id: offer.id, slug: offer.slug, published: offer.published, message: offer.published ? 'Offre creee et publiee sur le job board' : 'Offre creee en brouillon' };
    }),
  );

  server.tool(
    'publish_job_offer',
    "[CONFIRMATION REQUISE] Publie ou depublie une offre du job board. Tu DOIS demander confirmation.",
    {
      offer_id: z.string().describe("UUID de l'offre"),
      published: z.boolean().describe("true = publier, false = depublier"),
    },
    wrapTool('publish_job_offer', async (args) => {
      const offer = await jobOfferService.setPublished(args.offer_id as string, args.published as boolean);
      return { success: true, id: offer.id, published: offer.published, message: offer.published ? 'Offre publiee sur le job board' : 'Offre depubliee' };
    }),
  );
}
