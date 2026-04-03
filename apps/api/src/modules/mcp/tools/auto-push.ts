import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';

export function registerAutoPushTools(server: McpServer) {
  // ─── STEP 1: auto_push_scan (FREE — 0 credits) ───
  server.tool(
    'auto_push_scan',
    `Scanne les prospects potentiels pour un push CV automatique. AUCUN credit consomme.

L'IA :
1. Analyse le profil candidat (secteur, poste-cible, geo)
2. Cherche les clients froids/leads/inactifs dans la base qui matchent
3. Detecte des prospects via recherche web (entreprises qui recrutent)

Le recruteur peut fournir des criteres de recherche (secteurs, villes, tailles, roles cibles) pour affiner les resultats. Sinon l'IA detecte automatiquement.

Appeler quand le recruteur dit "pushe ce candidat", "trouve des prospects", "auto-push", "lance une campagne push", "cherche des boites pour ce profil".

Retourne une PROPOSITION que le recruteur doit valider. Etape suivante : auto_push_enrich pour enrichir les contacts selectionnes.`,
    {
      candidate_id: z.string().describe('UUID du candidat a pusher'),
      max_prospects: z.number().optional().default(10).describe('Nombre max de prospects a trouver (defaut: 10)'),
      sectors: z.array(z.string()).optional().describe('Secteurs cibles fournis par le recruteur (ex: ["SaaS", "Fintech"])'),
      locations: z.array(z.string()).optional().describe('Villes cibles (ex: ["Paris", "Lyon"])'),
      company_sizes: z.array(z.string()).optional().describe('Tailles d\'entreprise (ex: ["STARTUP", "PME", "ETI", "GRAND_GROUPE"])'),
      target_roles: z.array(z.string()).optional().describe('Roles cibles dans les entreprises (ex: ["DRH", "Head of Sales"])'),
      include_internal: z.boolean().optional().default(true).describe('Chercher dans les clients froids/leads de la base'),
      include_web: z.boolean().optional().default(true).describe('Chercher de nouveaux prospects via web'),
    },
    wrapTool('auto_push_scan', async (args, _user) => {
      const { scanProspects } = await import('../../pushes/auto-push.service.js');

      const result = await scanProspects(
        args.candidate_id as string,
        _user.userId,
        {
          max_prospects: args.max_prospects as number,
          sectors: args.sectors as string[] | undefined,
          locations: args.locations as string[] | undefined,
          company_sizes: args.company_sizes as string[] | undefined,
          target_roles: args.target_roles as string[] | undefined,
          include_internal: args.include_internal as boolean,
          include_web: args.include_web as boolean,
        },
      );

      return {
        status: 'scan_complete',
        candidate: {
          id: result.candidate.id,
          name: result.candidate.name,
          title: result.candidate.title,
          company: result.candidate.company,
        },
        profile: result.profile,
        summary: result.summary,
        credits_available: result.credits_available,
        prospects: result.prospects.map(p => ({
          index: p.index,
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
          needs_enrich: p.needs_enrich,
          enrich_cost: p.enrich_cost,
          client_id: p.client_id || null,
        })),
        instructions_for_claude: `IMPORTANT : Affiche cette proposition au recruteur de maniere claire :

1. 📋 Resume du profil candidat et criteres de recherche utilises
2. 📊 Bilan : ${result.summary.total_found} prospects trouves (${result.summary.internal_count} internes ♻️, ${result.summary.web_count} web 🌐)
3. 📋 Liste des prospects :
   - Pour chaque : numero, source (♻️/🌐), entreprise, secteur, ville, contact, email (ou "a enrichir"), signal
4. 💳 Credits : ${result.summary.need_enrich} contacts a enrichir = ${result.summary.enrich_cost_total} credit(s) FullEnrich | Solde : ${result.credits_available} credits

5. Demande au recruteur :
   "Quels prospects veux-tu garder pour l'enrichissement ? (tous / numeros / aucun)"
   "Ca coutera X credit(s) FullEnrich pour trouver les emails."

6. Apres selection → appeler auto_push_enrich avec les prospects choisis`,
      };
    }),
  );

  // ─── STEP 2: auto_push_enrich (CONFIRM — coute des credits) ───
  server.tool(
    'auto_push_enrich',
    `[CONFIRMATION REQUISE — COUTE DES CREDITS] Enrichit les prospects selectionnes par le recruteur via FullEnrich (1 credit/contact) et genere des messages personnalises.

Ce tool ne doit etre appele QU'APRES :
1. auto_push_scan a ete execute
2. Le recruteur a CHOISI quels prospects garder
3. Le recruteur a APPROUVE le cout en credits

Retourne les prospects enrichis avec messages pour validation finale avant envoi.`,
    {
      candidate_id: z.string().describe('UUID du candidat'),
      selected_prospects: z.array(z.object({
        index: z.number().describe('Index du prospect (de auto_push_scan)'),
        company_name: z.string(),
        contact_name: z.string().optional(),
        contact_email: z.string().optional(),
        contact_title: z.string().optional(),
        company_sector: z.string().optional(),
        company_city: z.string().optional(),
        signal: z.string().optional(),
        approach_angle: z.string().optional(),
        relevance_score: z.number().optional(),
        needs_enrich: z.boolean(),
        enrich_cost: z.number(),
        client_id: z.string().optional(),
        linkedin_url: z.string().optional(),
        source: z.enum(['internal', 'web_detection']),
      })).describe('Prospects selectionnes par le recruteur'),
    },
    wrapTool('auto_push_enrich', async (args, _user) => {
      const { enrichSelectedProspects } = await import('../../pushes/auto-push.service.js');

      const prospects = (args.selected_prospects as any[]).map(p => ({
        index: p.index,
        source: p.source as 'internal' | 'web_detection',
        company_name: p.company_name,
        company_sector: p.company_sector,
        company_city: p.company_city,
        contact_name: p.contact_name,
        contact_email: p.contact_email,
        contact_title: p.contact_title,
        signal: p.signal,
        approach_angle: p.approach_angle,
        relevance_score: p.relevance_score,
        needs_enrich: p.needs_enrich,
        enrich_cost: p.enrich_cost,
        client_id: p.client_id,
        linkedin_url: p.linkedin_url,
      }));

      const result = await enrichSelectedProspects(
        args.candidate_id as string,
        prospects,
        _user.userId,
      );

      return {
        status: 'enrichment_complete',
        credits_used: result.credits_used,
        credits_remaining: result.credits_remaining,
        enriched_count: result.enriched_count,
        email_found_count: result.email_found_count,
        prospects: result.prospects.map((p, i) => ({
          index: p.index || i + 1,
          company: p.company_name,
          contact: p.contact_name || 'N/A',
          email: p.contact_email || 'Non trouve',
          title: p.contact_title || 'N/A',
          signal: p.signal || 'N/A',
          source: p.source,
          message_preview: p.suggested_message
            ? p.suggested_message.substring(0, 200) + (p.suggested_message.length > 200 ? '...' : '')
            : 'N/A',
          full_message: p.suggested_message || null,
          client_id: p.client_id || null,
          can_send: !!p.contact_email,
        })),
        instructions_for_claude: `IMPORTANT : Affiche les resultats de l'enrichissement :

1. 💳 Credits utilises : ${result.credits_used} | Emails trouves : ${result.email_found_count}/${result.enriched_count} | Solde restant : ${result.credits_remaining}
2. Pour chaque prospect enrichi :
   - Entreprise, contact, email (✅ trouve / ❌ non trouve)
   - Apercu du message personnalise genere
3. Indique les prospects ou l'email n'a pas ete trouve (push impossible par email)

4. Demande CONFIRMATION FINALE :
   "Voici les messages prets a envoyer. Tu veux lancer les pushes vers ces prospects ? (oui / modifier / annuler)"
   "Tu peux aussi modifier un message avant envoi."

5. Apres validation → appeler auto_push_execute avec les prospects confirmes et messages`,
      };
    }),
  );

  // ─── STEP 3: auto_push_execute (CONFIRM — 0 credits) ───
  server.tool(
    'auto_push_execute',
    `[CONFIRMATION REQUISE] Execute les pushes CV vers les prospects valides par le recruteur. Cree un push + lance la sequence Persistance Client pour CHAQUE prospect selectionne.

IMPORTANT : Ce tool ne doit etre appele QU'APRES :
1. auto_push_scan → selection des prospects
2. auto_push_enrich → enrichissement + messages generes
3. Le recruteur a CONFIRME l'envoi des pushes`,
    {
      candidate_id: z.string().describe('UUID du candidat'),
      prospects: z.array(z.object({
        company_name: z.string(),
        contact_name: z.string().optional(),
        contact_email: z.string().optional(),
        message: z.string(),
        client_id: z.string().optional(),
        canal: z.enum(['EMAIL', 'LINKEDIN']).optional().default('EMAIL'),
      })).describe('Liste des prospects valides avec messages finaux'),
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
