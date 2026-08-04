import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as leadService from '../../leads/lead.service.js';

const STAGES = 'nouveau, contacte, r1, r2, r3, r4, r5, r6, r7 (relances), rdv (RDV obtenu), gagne, perdu';

export function registerLeadTools(server: McpServer) {
  server.tool(
    'list_leads',
    "Liste les leads de prospection (pipeline commercial des relances). Utiliser quand le sales demande 'ou en sont mes leads', 'mes relances a faire', etc.",
    {
      stage: z.string().optional().describe(`Filtrer par etape : ${STAGES}`),
      query: z.string().optional().describe('Recherche libre (societe, contact)'),
      limit: z.number().optional().default(30),
    },
    wrapTool('list_leads', async (args) => {
      const all = (await leadService.listLeads()) as any[];
      let leads = all;
      if (args.stage) leads = leads.filter((l) => l.stage === args.stage);
      if (args.query) {
        const q = String(args.query).toLowerCase();
        leads = leads.filter((l) => `${l.company || ''} ${l.contact || ''} ${l.role || ''}`.toLowerCase().includes(q));
      }
      return {
        total: leads.length,
        leads: leads.slice(0, (args.limit as number) || 30).map((l) => ({
          id: l.id,
          company: l.company,
          contact: l.contact,
          role: l.role,
          city: l.city,
          stage: l.stage,
          source: l.source,
          last_contact_at: l.lastContactAt,
        })),
      };
    }),
  );

  server.tool(
    'create_lead',
    "[CONFIRMATION REQUISE] Cree un lead de prospection (societe a demarcher). Tu DOIS demander confirmation.",
    {
      company: z.string().describe('Nom de la societe'),
      contact: z.string().describe('Nom du contact / decideur'),
      role: z.string().optional().describe('Poste du contact'),
      city: z.string().optional(),
      source: z.string().optional().describe('Source du lead (LinkedIn, Cold call, Salon, Cooptation...)'),
      stage: z.string().optional().describe(`Etape initiale (defaut: nouveau). ${STAGES}`),
    },
    wrapTool('create_lead', async (args, user) => {
      const lead = await leadService.createLead(
        {
          company: args.company as string,
          contact: args.contact as string,
          role: (args.role as string) ?? null,
          city: (args.city as string) ?? null,
          source: (args.source as string) ?? null,
          stage: (args.stage as string) ?? 'nouveau',
        } as any,
        user.userId,
      );
      return { success: true, lead_id: (lead as any).id, message: `Lead "${args.company}" cree.` };
    }),
  );

  server.tool(
    'move_lead_stage',
    "[CONFIRMATION REQUISE] Fait avancer un lead dans le pipeline de relances (nouveau -> contacte -> r1..r7 -> rdv). Pour marquer PERDU utiliser lose_lead ; pour GAGNE (converti en client) utiliser convert_lead. Tu DOIS demander confirmation.",
    {
      lead_id: z.string().describe('UUID du lead'),
      stage: z.string().describe(`Nouvelle etape : ${STAGES}`),
    },
    wrapTool('move_lead_stage', async (args) => {
      if (args.stage === 'perdu') return { error: 'use_lose_lead', message: 'Pour marquer un lead perdu, utilise lose_lead (motif requis).' };
      if (args.stage === 'gagne') return { error: 'use_convert_lead', message: 'Pour gagner un lead, utilise convert_lead (cree le client + la societe).' };
      await leadService.updateLead(args.lead_id as string, { stage: args.stage as string });
      return { success: true, message: `Lead deplace vers "${args.stage}".` };
    }),
  );

  server.tool(
    'add_lead_interaction',
    "[CONFIRMATION REQUISE] Enregistre une interaction/relance sur un lead (appel, email, note) — met a jour la date de dernier contact. Tu DOIS demander confirmation.",
    {
      lead_id: z.string().describe('UUID du lead'),
      text: z.string().describe("Contenu de l'interaction (ce qui a ete dit/fait)"),
      type: z.string().optional().describe('Type : appel, email, linkedin, note...'),
    },
    wrapTool('add_lead_interaction', async (args, user) => {
      await leadService.addInteraction(args.lead_id as string, (args.type as string) ?? null, args.text as string, user.userId);
      return { success: true, message: 'Interaction enregistree (dernier contact mis a jour).' };
    }),
  );

  server.tool(
    'lose_lead',
    "[CONFIRMATION REQUISE] Marque un lead comme PERDU avec un motif. Tu DOIS demander confirmation.",
    {
      lead_id: z.string().describe('UUID du lead'),
      motif: z.string().describe('Motif de perte (pas interesse, budget, timing, concurrent, injoignable, autre)'),
      note: z.string().optional().describe('Detail libre optionnel'),
    },
    wrapTool('lose_lead', async (args) => {
      await leadService.loseLead(args.lead_id as string, args.motif as string, args.note as string | undefined);
      return { success: true, message: `Lead marque perdu (${args.motif}).` };
    }),
  );

  server.tool(
    'convert_lead',
    "[CONFIRMATION REQUISE] Convertit un lead gagne en CLIENT (+ societe). A utiliser quand un RDV a abouti / le prospect devient client. Tu DOIS demander confirmation.",
    {
      lead_id: z.string().describe('UUID du lead'),
    },
    wrapTool('convert_lead', async (args, user) => {
      const result = (await leadService.convertLead(args.lead_id as string, user.userId)) as any;
      if (result?.alreadyConverted) return { success: true, message: 'Ce lead etait deja converti.', client_id: result.client?.id };
      return { success: true, client_id: result?.client?.id, message: 'Lead converti en client (+ societe).' };
    }),
  );
}
