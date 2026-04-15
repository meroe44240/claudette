import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import prisma from '../../../lib/db.js';
import * as fullenrich from '../../integrations/fullenrich.service.js';
import { logActivity } from '../../../lib/activity-logger.js';

export function registerEnrichTools(server: McpServer) {
  // ─── enrich_contact ───────────────────────────────
  server.tool(
    'enrich_contact',
    "[CONFIRMATION REQUISE] Enrichit un candidat ou client via FullEnrich. IMPORTANT : tu DOIS d'abord demander au recruteur s'il veut recuperer un EMAIL, un NUMERO DE TELEPHONE, ou LES DEUX avant d'appeler cet outil. Couts : email = 1 credit, telephone = 10 credits, les deux = 11 credits.",
    {
      enrich_type: z.enum(['email', 'phone', 'both']).describe("Que chercher : 'email' (1 credit), 'phone' (10 credits), ou 'both' (11 credits). Tu DOIS demander au recruteur avant de choisir."),
      candidate_id: z.string().optional().describe("UUID du candidat a enrichir (remplit auto nom/prenom/entreprise depuis la fiche)"),
      client_id: z.string().optional().describe("UUID du client a enrichir"),
      linkedin_url: z.string().optional().describe('URL LinkedIn du contact (methode la plus fiable)'),
      first_name: z.string().optional().describe('Prenom (si pas de candidate_id/client_id)'),
      last_name: z.string().optional().describe('Nom (si pas de candidate_id/client_id)'),
      company_name: z.string().optional().describe("Nom de l'entreprise actuelle"),
      company_domain: z.string().optional().describe("Domaine de l'entreprise (ex: google.com)"),
      auto_update: z.boolean().optional().default(true).describe("Mettre a jour la fiche ATS avec les resultats (defaut: oui)"),
    },
    wrapTool('enrich_contact', async (args, user) => {
      // Build enrichment input from ATS entity or manual params
      let input: fullenrich.EnrichInput = {};
      let entityType: 'candidat' | 'client' | null = null;
      let entityId: string | null = null;

      if (args.candidate_id) {
        const candidat = await prisma.candidat.findUnique({ where: { id: args.candidate_id as string } });
        if (!candidat) return { error: 'Candidat non trouve' };
        input = {
          first_name: candidat.prenom || undefined,
          last_name: candidat.nom || undefined,
          linkedin_url: candidat.linkedinUrl || undefined,
          company_name: candidat.entrepriseActuelle || undefined,
        };
        entityType = 'candidat';
        entityId = candidat.id;
      } else if (args.client_id) {
        const client = await prisma.client.findUnique({
          where: { id: args.client_id as string },
          include: { entreprise: { select: { nom: true, siteWeb: true } } },
        });
        if (!client) return { error: 'Client non trouve' };
        input = {
          first_name: client.prenom || undefined,
          last_name: client.nom || undefined,
          linkedin_url: client.linkedinUrl || undefined,
          company_name: client.entreprise?.nom || undefined,
          domain: client.entreprise?.siteWeb?.replace(/^https?:\/\//, '').replace(/\/$/, '') || undefined,
        };
        entityType = 'client';
        entityId = client.id;
      }

      // Override with explicit params
      if (args.linkedin_url) input.linkedin_url = args.linkedin_url as string;
      if (args.first_name) input.first_name = args.first_name as string;
      if (args.last_name) input.last_name = args.last_name as string;
      if (args.company_name) input.company_name = args.company_name as string;
      if (args.company_domain) input.domain = args.company_domain as string;

      // Validate we have enough info
      if (!input.linkedin_url && !(input.first_name && input.last_name && (input.company_name || input.domain))) {
        return { error: "Pas assez d'informations. Fournir un URL LinkedIn OU nom+prenom+entreprise." };
      }

      // Build enrich_fields based on enrich_type
      const enrichType = args.enrich_type as string;
      const enrichFields: string[] = [];
      if (enrichType === 'email' || enrichType === 'both') {
        enrichFields.push('contact.emails', 'contact.personal_emails');
      }
      if (enrichType === 'phone' || enrichType === 'both') {
        enrichFields.push('contact.phones');
      }

      // Run enrichment
      const result = await fullenrich.enrichContact(input, enrichFields);
      if (!result) return { error: "Aucun resultat d'enrichissement" };

      const ci = result.contact_info;
      const profile = result.profile;

      // Auto-update ATS entity if requested
      const updatedFields: string[] = [];
      if (args.auto_update !== false && entityType && entityId) {
        const updates: Record<string, string> = {};

        // Email
        const bestEmail = ci.most_probable_work_email?.email || ci.most_probable_personal_email?.email;
        if (bestEmail) {
          if (entityType === 'candidat') {
            const current = await prisma.candidat.findUnique({ where: { id: entityId }, select: { email: true } });
            if (!current?.email) { updates.email = bestEmail; updatedFields.push(`email → ${bestEmail}`); }
          } else {
            const current = await prisma.client.findUnique({ where: { id: entityId }, select: { email: true } });
            if (!current?.email) { updates.email = bestEmail; updatedFields.push(`email → ${bestEmail}`); }
          }
        }

        // Phone
        const bestPhone = ci.most_probable_phone?.number;
        if (bestPhone) {
          if (entityType === 'candidat') {
            const current = await prisma.candidat.findUnique({ where: { id: entityId }, select: { telephone: true } });
            if (!current?.telephone) { updates.telephone = bestPhone; updatedFields.push(`telephone → ${bestPhone}`); }
          } else {
            const current = await prisma.client.findUnique({ where: { id: entityId }, select: { telephone: true } });
            if (!current?.telephone) { updates.telephone = bestPhone; updatedFields.push(`telephone → ${bestPhone}`); }
          }
        }

        // LinkedIn URL
        if (input.linkedin_url && entityType === 'candidat') {
          const current = await prisma.candidat.findUnique({ where: { id: entityId }, select: { linkedinUrl: true } });
          if (!current?.linkedinUrl) { updates.linkedinUrl = input.linkedin_url; updatedFields.push(`linkedinUrl → ${input.linkedin_url}`); }
        }

        if (Object.keys(updates).length > 0) {
          if (entityType === 'candidat') {
            await prisma.candidat.update({ where: { id: entityId }, data: updates as any });
          } else {
            await prisma.client.update({ where: { id: entityId }, data: updates as any });
          }
        }
      }

      // Fire-and-forget: log enrichment activity
      if (entityType && entityId) {
        const enrichedParts: string[] = [];
        if (ci.most_probable_work_email?.email || ci.most_probable_personal_email?.email) enrichedParts.push('email');
        if (ci.most_probable_phone?.number) enrichedParts.push('téléphone');
        const enrichLabel = enrichedParts.length > 0 ? enrichedParts.join(' + ') : 'données';

        logActivity({
          type: 'NOTE',
          entiteType: entityType === 'candidat' ? 'CANDIDAT' : 'CLIENT',
          entiteId: entityId,
          userId: user.userId,
          titre: `${enrichLabel.charAt(0).toUpperCase() + enrichLabel.slice(1)} enrichi(e) via FullEnrich`,
          contenu: updatedFields.length > 0 ? `Champs mis à jour : ${updatedFields.join(', ')}` : undefined,
          source: 'SYSTEME',
          metadata: { fullEnrich: true, enrichType: String(args.enrich_type), updatedFields },
        }).catch(() => {});
      }

      return {
        enrichment: {
          work_email: ci.most_probable_work_email,
          personal_email: ci.most_probable_personal_email,
          phone: ci.most_probable_phone,
          all_emails: [...(ci.work_emails || []), ...(ci.personal_emails || [])],
          all_phones: ci.phones || [],
        },
        profile: profile ? {
          name: profile.full_name,
          location: profile.location,
          current_role: profile.employment?.current?.title,
          current_company: profile.employment?.current?.company?.name,
          industry: profile.employment?.current?.company?.industry,
          skills: profile.skills?.slice(0, 15),
        } : null,
        auto_updated: updatedFields.length > 0 ? updatedFields : null,
        message: updatedFields.length > 0
          ? `Enrichissement termine. ${updatedFields.length} champ(s) mis a jour dans la fiche.`
          : 'Enrichissement termine. Aucun champ mis a jour (deja remplis ou pas de donnees).',
      };
    }),
  );

  // ─── search_people_external ───────────────────────
  server.tool(
    'search_people_external',
    "Recherche des contacts EXTERNES (hors ATS) via FullEnrich. Trouve des profils par titre, entreprise, ville, competences. Utile pour du sourcing ou de la prospection. Coute 0.25 credit par resultat.",
    {
      job_titles: z.array(z.string()).optional().describe('Titres de poste (ex: ["Product Manager", "CTO"])'),
      company_names: z.array(z.string()).optional().describe('Noms d\'entreprises (ex: ["Google", "Doctolib"])'),
      company_domains: z.array(z.string()).optional().describe('Domaines (ex: ["google.com"])'),
      locations: z.array(z.string()).optional().describe('Villes/pays (ex: ["Paris", "France"])'),
      skills: z.array(z.string()).optional().describe('Competences (ex: ["React", "Python"])'),
      seniority: z.array(z.string()).optional().describe('Niveaux de seniorite : Entry level, Mid-level, Senior, Director, VP, C-level'),
      limit: z.number().optional().default(10).describe('Nombre max de resultats (max 100)'),
    },
    wrapTool('search_people_external', async (args) => {
      if (!args.job_titles && !args.company_names && !args.company_domains && !args.locations && !args.skills) {
        return { error: 'Au moins un critere de recherche requis (titre, entreprise, ville ou competences).' };
      }

      const result = await fullenrich.searchPeople({
        job_titles: args.job_titles as string[] | undefined,
        company_names: args.company_names as string[] | undefined,
        company_domains: args.company_domains as string[] | undefined,
        locations: args.locations as string[] | undefined,
        skills: args.skills as string[] | undefined,
        seniority: args.seniority as string[] | undefined,
        limit: Math.min((args.limit as number) || 10, 100),
      });

      return {
        total: result.metadata?.total || 0,
        credits_used: result.metadata?.credits || 0,
        people: (result.people || []).map((p: any) => ({
          name: p.full_name,
          title: p.current_position_title,
          company: p.current_company_name,
          location: p.location,
          linkedin_url: p.linkedin_url,
          skills: p.skills?.slice(0, 10),
        })),
      };
    }),
  );

  // ─── get_enrich_credits ───────────────────────────
  server.tool(
    'get_enrich_credits',
    "Verifie le solde de credits FullEnrich restants.",
    {},
    wrapTool('get_enrich_credits', async () => {
      const balance = await fullenrich.getCredits();
      return { credits_remaining: balance };
    }),
  );
}
