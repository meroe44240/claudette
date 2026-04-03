import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';

export function registerAutoPushTools(server: McpServer) {
  // ─── auto_push_prepare ───────────────────────────────
  server.tool(
    'auto_push_prepare',
    `Prepare un plan de push CV automatique. A partir d'un candidat, l'IA :
1. Analyse le profil (secteur, poste-cible, geo)
2. Cherche les clients froids/leads dans la base qui matchent
3. Detecte des prospects via recherche web (entreprises qui recrutent)
4. Enrichit les contacts (trouve les emails via FullEnrich)
5. Genere un message personnalise par prospect

Appeler quand le recruteur dit "pushe ce candidat aux boites qui matchent", "trouve des prospects pour ce profil", "auto-push", "lance une campagne push".

Retourne une PROPOSITION que le recruteur doit valider avant execution. Ne PAS executer directement.`,
    {
      candidate_id: z.string().describe('UUID du candidat a pusher'),
      max_prospects: z.number().optional().default(8).describe('Nombre max de prospects a trouver (defaut: 8)'),
      sectors: z.array(z.string()).optional().describe('Secteurs cibles (optionnel, sinon IA detecte)'),
      locations: z.array(z.string()).optional().describe('Villes cibles (optionnel)'),
      include_internal: z.boolean().optional().default(true).describe('Chercher dans les clients froids de la base'),
      include_web: z.boolean().optional().default(true).describe('Chercher de nouveaux prospects via web'),
      enrich_contacts: z.boolean().optional().default(true).describe('Enrichir les contacts sans email (1 credit/contact)'),
    },
    wrapTool('auto_push_prepare', async (args, user) => {
      const { prepareAutoPush } = await import('../../pushes/auto-push.service.js');

      const proposal = await prepareAutoPush(
        args.candidate_id as string,
        user.userId,
        {
          max_prospects: args.max_prospects as number,
          sectors: args.sectors as string[] | undefined,
          locations: args.locations as string[] | undefined,
          include_internal: args.include_internal as boolean,
          include_web: args.include_web as boolean,
          enrich_contacts: args.enrich_contacts as boolean,
        },
      );

      return {
        status: 'proposal_ready',
        candidate: {
          id: proposal.candidate.id,
          name: proposal.candidate.name,
          title: proposal.candidate.title,
          company: proposal.candidate.company,
        },
        profile: proposal.profile,
        prospects_found: proposal.prospects.length,
        prospects: proposal.prospects.map((p, i) => ({
          index: i + 1,
          source: p.source,
          company: p.company_name,
          sector: p.company_sector || 'N/A',
          city: p.company_city || 'N/A',
          contact: p.contact_name || 'A trouver',
          email: p.contact_email || 'Non trouve',
          title: p.contact_title || 'N/A',
          signal: p.signal || 'N/A',
          approach_angle: p.approach_angle || 'N/A',
          relevance: p.relevance_score || 'N/A',
          message_preview: p.suggested_message
            ? p.suggested_message.substring(0, 150) + (p.suggested_message.length > 150 ? '...' : '')
            : 'N/A',
          client_id: p.client_id || null,
        })),
        credits: {
          needed: proposal.credits_needed,
          available: proposal.credits_available,
        },
        instructions_for_claude: `IMPORTANT : Affiche cette proposition au recruteur de maniere claire :
1. Resume du profil candidat
2. Liste des ${proposal.prospects.length} prospects trouves (sources internes ♻️ et web 🌐)
3. Pour chaque prospect : entreprise, contact, email, signal, apercu du message
4. Credits FullEnrich utilises/disponibles
5. Demande CONFIRMATION : "Quels prospects veux-tu garder ? (tous / numeros / aucun)"
6. Apres validation → appeler auto_push_execute avec les prospects selectionnes`,
      };
    }),
  );

  // ─── auto_push_execute ───────────────────────────────
  server.tool(
    'auto_push_execute',
    `[CONFIRMATION REQUISE] Execute les pushes CV vers les prospects valides par le recruteur. Cree un push + lance la sequence Persistance Client pour CHAQUE prospect selectionne.

IMPORTANT : Ce tool ne doit etre appele QU'APRES que le recruteur a valide la proposition de auto_push_prepare. Tu DOIS avoir la confirmation explicite du recruteur.`,
    {
      candidate_id: z.string().describe('UUID du candidat'),
      prospects: z.array(z.object({
        company_name: z.string(),
        contact_name: z.string().optional(),
        contact_email: z.string().optional(),
        message: z.string(),
        client_id: z.string().optional(),
        canal: z.enum(['EMAIL', 'LINKEDIN']).optional().default('EMAIL'),
      })).describe('Liste des prospects valides avec messages'),
    },
    wrapTool('auto_push_execute', async (args, user) => {
      const { executeAutoPush } = await import('../../pushes/auto-push.service.js');

      const result = await executeAutoPush(
        args.candidate_id as string,
        user.userId,
        (args.prospects as any[]).map(p => ({
          company_name: p.company_name,
          contact_name: p.contact_name,
          contact_email: p.contact_email,
          message: p.message,
          client_id: p.client_id,
          canal: p.canal || 'EMAIL',
        })),
      );

      return {
        success: true,
        ...result,
        message: `${result.pushes_created} push(es) cree(s), ${result.sequences_started} sequence(s) Persistance Client lancee(s), ${result.prospects_created} nouveau(x) prospect(s) cree(s) dans l'ATS.`,
        summary: result.details.map(d =>
          `✅ ${d.company} (${d.contact}) → push ${d.push_id.slice(0, 8)}${d.sequence_run_id ? ' + sequence' : ''}`
        ),
      };
    }),
  );
}
