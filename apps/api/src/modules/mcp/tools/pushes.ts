import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as pushService from '../../pushes/push.service.js';
import prisma from '../../../lib/db.js';

export function registerPushTools(server: McpServer) {
  // ─── create_push ──────────────────────────────────────
  server.tool(
    'create_push',
    "[CONFIRMATION REQUISE] Cree un push CV vers un prospect et lance automatiquement la sequence Persistance Client (10 relances sur 28 jours). Appeler quand le recruteur dit 'pushe le CV de X a Y' ou 'envoie le profil de X a la societe Z'. Tu DOIS demander confirmation en montrant le candidat, le prospect et le message.",
    {
      candidate_id: z.string().describe('UUID du candidat'),
      prospect_company: z.string().describe("Nom de l'entreprise prospect"),
      prospect_contact: z.string().optional().describe('Nom du contact'),
      prospect_email: z.string().optional().describe('Email du contact'),
      prospect_id: z.string().optional().describe('UUID du prospect si deja existant'),
      canal: z.enum(['EMAIL', 'LINKEDIN']).describe('Canal du push'),
      message: z.string().describe('Corps du message envoye'),
    },
    wrapTool('create_push', async (args, user) => {
      const result = await pushService.createPush({
        candidatId: args.candidate_id as string,
        prospect: {
          id: args.prospect_id as string | undefined,
          companyName: args.prospect_company as string,
          contactName: args.prospect_contact as string | undefined,
          contactEmail: args.prospect_email as string | undefined,
        },
        canal: args.canal as 'EMAIL' | 'LINKEDIN',
        message: args.message as string,
        recruiterId: user.userId,
      });
      return {
        success: true,
        ...result,
        message: `Push CV cree. ${result.tasks_created} taches de suivi planifiees (relance J+3 et J+7).`,
      };
    }),
  );

  // ─── list_pushes ──────────────────────────────────────
  server.tool(
    'list_pushes',
    "Liste les pushes CV d'un recruteur ou de toute l'equipe. Appeler quand on demande 'combien de CVs pushes', 'mes pushes de la semaine', 'vision push equipe'.",
    {
      period: z.enum(['today', 'this_week', 'this_month', 'this_quarter']).optional().describe('Periode'),
      status: z.enum(['ENVOYE', 'OUVERT', 'REPONDU', 'RDV_BOOK', 'CONVERTI_MANDAT', 'SANS_SUITE']).optional().describe('Filtrer par statut'),
      team: z.boolean().optional().describe("true pour voir toute l'equipe (admin)"),
    },
    wrapTool('list_pushes', async (args, user) => {
      const result = await pushService.listPushes({
        recruiterId: user.userId,
        period: args.period as string | undefined,
        status: args.status as any,
        team: (args.team as boolean) || user.userRole === 'ADMIN',
      });
      return result;
    }),
  );

  // ─── update_push_status ───────────────────────────────
  server.tool(
    'update_push_status',
    "[CONFIRMATION REQUISE] Met a jour le statut d'un push. Appeler quand un prospect repond, qu'un RDV est booke, ou qu'un mandat est ouvert suite a un push. Tu DOIS demander confirmation.",
    {
      push_id: z.string().describe('UUID du push'),
      status: z.enum(['OUVERT', 'REPONDU', 'RDV_BOOK', 'CONVERTI_MANDAT', 'SANS_SUITE']).describe('Nouveau statut'),
    },
    wrapTool('update_push_status', async (args) => {
      const result = await pushService.updatePushStatus(
        args.push_id as string,
        args.status as any,
      );
      return {
        success: true,
        ...result,
        message: result.tasks_created.length > 0
          ? `Statut mis a jour: ${result.status}. Taches creees: ${result.tasks_created.join(', ')}`
          : `Statut mis a jour: ${result.status}`,
      };
    }),
  );

  // ─── get_push_gmail_status ─────────────────────────────
  server.tool(
    'get_push_gmail_status',
    "Verifie si l'email d'un push a bien ete envoye depuis Gmail et retourne le timestamp reel d'envoi et le thread Gmail.",
    {
      push_id: z.string().describe('UUID du push'),
    },
    wrapTool('get_push_gmail_status', async (args) => {
      const push = await prisma.push.findUnique({
        where: { id: args.push_id as string },
        include: {
          candidat: { select: { nom: true, prenom: true } },
          prospect: { select: { companyName: true, contactName: true, contactEmail: true } },
        },
      });
      if (!push) return { error: 'Push non trouve' };

      return {
        push_id: push.id,
        candidat: `${push.candidat.prenom || ''} ${push.candidat.nom}`.trim(),
        prospect: push.prospect.contactName || push.prospect.companyName,
        prospect_email: push.prospect.contactEmail,
        canal: push.canal,
        status: push.status,
        created_at: push.sentAt,
        gmail_sent_at: push.gmailSentAt,
        gmail_thread_id: push.gmailThreadId,
        gmail_message_id: push.gmailMessageId,
        email_confirmed: !!push.gmailSentAt,
      };
    }),
  );

  // ─── get_push_stats ───────────────────────────────────
  server.tool(
    'get_push_stats',
    "[ADMIN] Statistiques push de toute l'equipe : volume, taux de reponse, conversions en mandat.",
    {
      period: z.enum(['this_week', 'this_month', 'this_quarter', 'this_year']).optional().default('this_month').describe('Periode'),
    },
    wrapTool('get_push_stats', async (args) => {
      return pushService.getTeamPushStats(args.period as string);
    }),
  );
}
