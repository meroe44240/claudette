import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as mandatService from '../../mandats/mandat.service.js';
import * as candidatureService from '../../candidatures/candidature.service.js';

export function registerMandateTools(server: McpServer) {
  server.tool(
    'search_mandates',
    "Recherche des mandats par titre, entreprise, client, ou statut. Utiliser quand le recruteur demande 'ou en est le mandat X' ou 'combien de mandats actifs'.",
    {
      query: z.string().optional().describe('Recherche libre'),
      status: z.string().optional().describe('Filtrer par statut : OUVERT, EN_COURS, GAGNE, PERDU, ANNULE, CLOTURE'),
      limit: z.number().optional().default(10),
    },
    wrapTool('search_mandates', async (args, user) => {
      const result = await mandatService.list(
        { page: 1, perPage: (args.limit as number) || 10 },
        args.query as string | undefined,
        args.status as string | undefined,
        undefined,
        undefined,
        user.userRole !== 'ADMIN' ? user.userId : undefined,
      );
      return {
        total: result.meta.total,
        mandates: result.data.map((m: any) => ({
          id: m.id,
          title: m.titrePoste,
          company: m.entreprise?.nom,
          client: m.client ? `${m.client.prenom || ''} ${m.client.nom}`.trim() : null,
          status: m.statut,
          priority: m.priorite,
          fee_percentage: m.feePourcentage,
          fee_estimated: m.feeMontantEstime,
          candidates_count: m._count?.candidatures || m.candidatures?.length,
          created_at: m.createdAt,
        })),
      };
    }),
  );

  server.tool(
    'get_mandate',
    "Recupere la fiche complete du mandat avec pipeline, stats, client, fees.",
    {
      mandate_id: z.string().optional().describe('UUID du mandat'),
      mandate_name: z.string().optional().describe('Nom du mandat si pas d\'UUID'),
    },
    wrapTool('get_mandate', async (args) => {
      let mandate: any;
      if (args.mandate_id) {
        mandate = await mandatService.getById(args.mandate_id as string);
      } else if (args.mandate_name) {
        const results = await mandatService.list({ page: 1, perPage: 1 }, args.mandate_name as string);
        mandate = results.data[0];
        if (mandate) mandate = await mandatService.getById(mandate.id);
      }
      if (!mandate) return { error: 'Mandat non trouve' };

      return {
        id: mandate.id,
        title: mandate.titrePoste,
        description: mandate.description?.substring(0, 500),
        company: mandate.entreprise?.nom,
        client: mandate.client ? `${mandate.client.prenom || ''} ${mandate.client.nom}`.trim() : null,
        status: mandate.statut,
        priority: mandate.priorite,
        location: mandate.localisation,
        salary_range: `${mandate.salaireMin || '?'} - ${mandate.salaireMax || '?'}`,
        fee_percentage: mandate.feePourcentage,
        fee_estimated: mandate.feeMontantEstime,
        fee_billed: mandate.montantFacture,
        fee_status: mandate.feeStatut,
        candidates: mandate.candidatures?.map((ca: any) => ({
          id: ca.candidat?.id,
          name: ca.candidat ? `${ca.candidat.prenom || ''} ${ca.candidat.nom}`.trim() : null,
          stage: ca.stade,
          title: ca.candidat?.posteActuel,
        })),
        created_at: mandate.createdAt,
      };
    }),
  );

  server.tool(
    'get_mandate_pipeline',
    "Recupere le pipeline complet d'un mandat : candidats groupes par etape. Utiliser quand le recruteur demande 'montre-moi le pipe du mandat X'.",
    {
      mandate_id: z.string().describe('UUID du mandat'),
    },
    wrapTool('get_mandate_pipeline', async (args) => {
      const kanban = await mandatService.getKanban(args.mandate_id as string);
      return kanban;
    }),
  );

  server.tool(
    'create_mandate',
    "[CONFIRMATION REQUISE] [ADMIN UNIQUEMENT] Cree un nouveau mandat. Tu DOIS demander confirmation.",
    {
      titrePoste: z.string().describe('Titre du poste'),
      entrepriseId: z.string().describe("UUID de l'entreprise"),
      clientId: z.string().optional().describe('UUID du client'),
      description: z.string().optional(),
      localisation: z.string().optional(),
      salaireMin: z.number().optional(),
      salaireMax: z.number().optional(),
      feePourcentage: z.number().optional().describe('Fee en pourcentage (ex: 20)'),
      priorite: z.string().optional().describe('BASSE, NORMALE, HAUTE, URGENTE'),
    },
    wrapTool('create_mandate', async (args, user) => {
      const mandate = await mandatService.create(args as any, user.userId);
      return { success: true, mandate_id: mandate.id, message: `Mandat "${args.titrePoste}" cree` };
    }),
  );

  server.tool(
    'move_candidate_stage',
    "[CONFIRMATION REQUISE] Deplace un candidat d'une etape a une autre dans le pipeline d'un mandat. Tu DOIS demander confirmation.",
    {
      candidature_id: z.string().describe('UUID de la candidature'),
      new_stage: z.string().describe('Nouvelle etape : SOURCING, CONTACTE, ENTRETIEN_1, ENTRETIEN_CLIENT, OFFRE, PLACE, REFUSE'),
      motif_refus: z.string().optional().describe('Si refuse : SALAIRE, PROFIL_PAS_ALIGNE, CANDIDAT_DECLINE, CLIENT_REFUSE, TIMING, POSTE_POURVU, AUTRE'),
    },
    wrapTool('move_candidate_stage', async (args, user) => {
      const result = await candidatureService.update(
        args.candidature_id as string,
        {
          stage: args.new_stage as any,
          motifRefus: args.motif_refus as any,
        },
        user.userId,
      );
      return { success: true, message: `Candidature deplacee vers ${args.new_stage}` };
    }),
  );

  server.tool(
    'add_candidate_to_mandate',
    "[CONFIRMATION REQUISE] Ajoute un candidat au pipeline d'un mandat. Tu DOIS demander confirmation.",
    {
      candidate_id: z.string().describe('UUID du candidat'),
      mandate_id: z.string().describe('UUID du mandat'),
      stage: z.string().optional().default('SOURCING').describe('Etape initiale (defaut: SOURCING)'),
    },
    wrapTool('add_candidate_to_mandate', async (args, user) => {
      const result = await candidatureService.create({
        candidatId: args.candidate_id as string,
        mandatId: args.mandate_id as string,
        stage: ((args.stage as string) || 'SOURCING') as any,
      } as any, user.userId);
      return { success: true, candidature_id: result.id, message: 'Candidat ajoute au mandat' };
    }),
  );

  server.tool(
    'remove_candidate_from_mandate',
    "[CONFIRMATION REQUISE] Retire un candidat du pipeline d'un mandat en le passant a REFUSE. Tu DOIS demander confirmation.",
    {
      candidature_id: z.string().describe('UUID de la candidature'),
      reason: z.string().optional().describe('Raison : SALAIRE, PROFIL_PAS_ALIGNE, CANDIDAT_DECLINE, CLIENT_REFUSE, TIMING, POSTE_POURVU, AUTRE'),
    },
    wrapTool('remove_candidate_from_mandate', async (args, user) => {
      await candidatureService.update(
        args.candidature_id as string,
        { stage: 'REFUSE' as any, motifRefus: (args.reason || 'AUTRE') as any },
        user.userId,
      );
      return { success: true, message: 'Candidat retire du pipeline (passe a REFUSE)' };
    }),
  );
}
