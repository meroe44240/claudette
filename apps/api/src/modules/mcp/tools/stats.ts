import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import prisma from '../../../lib/db.js';
import { getPushStatsForUsers } from '../../pushes/push.service.js';
import * as calendarService from '../../integrations/calendar.service.js';
import * as clientService from '../../clients/client.service.js';

function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfQuarter(date: Date = new Date()): Date {
  const q = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), q, 1);
}

/** Count weekdays (Mon-Fri) between two Dates, inclusive. */
function countWeekdays(start: Date, end: Date): number {
  if (end < start) return 0;
  let count = 0;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const stop = new Date(end);
  stop.setHours(23, 59, 59, 999);
  while (d <= stop) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count += 1;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export function registerStatsTools(server: McpServer) {
  // ─── get_daily_brief ──────────────────────────────────
  server.tool(
    'get_daily_brief',
    "Recupere le brief quotidien du recruteur : stats, RDV du jour, taches urgentes, alertes, objectifs. Appeler quand le recruteur dit bonjour, demande son programme, ou veut savoir quoi faire.",
    {
      date: z.string().optional().describe('Date au format YYYY-MM-DD. Defaut: aujourd\'hui.'),
    },
    wrapTool('get_daily_brief', async (args, user) => {
      const today = args.date ? new Date(args.date as string) : new Date();
      const dayStart = startOfDay(today);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const weekStart = startOfWeek(today);
      const monthStart = startOfMonth(today);
      const quarterStart = startOfQuarter(today);

      // Parallel data fetching
      const [
        callsToday, callsWeek,
        tasksOverdue, tasksToday,
        mandatsActifs, candidaturesActives,
        placementsQuarter, caMonth,
        objectives,
      ] = await Promise.all([
        // Calls today
        prisma.activite.count({ where: { userId: user.userId, type: 'APPEL', createdAt: { gte: dayStart, lt: dayEnd } } }),
        // Calls this week
        prisma.activite.count({ where: { userId: user.userId, type: 'APPEL', createdAt: { gte: weekStart } } }),
        // Overdue tasks
        prisma.activite.findMany({
          where: { userId: user.userId, isTache: true, tacheCompleted: false, tacheDueDate: { lt: dayStart } },
          select: { id: true, titre: true, tacheDueDate: true, metadata: true, entiteType: true },
          take: 10,
          orderBy: { tacheDueDate: 'asc' },
        }),
        // Today tasks
        prisma.activite.findMany({
          where: { userId: user.userId, isTache: true, tacheCompleted: false, tacheDueDate: { gte: dayStart, lt: dayEnd } },
          select: { id: true, titre: true, tacheDueDate: true, metadata: true, entiteType: true },
          take: 10,
        }),
        // Active mandates
        prisma.mandat.count({ where: { assignedToId: user.userId, statut: { in: ['OUVERT', 'EN_COURS'] } } }),
        // Active candidatures
        prisma.candidature.count({ where: { createdById: user.userId, stage: { notIn: ['REFUSE', 'PLACE'] } } }),
        // Placements this quarter
        prisma.candidature.count({ where: { createdById: user.userId, stage: 'PLACE', updatedAt: { gte: quarterStart } } }),
        // CA this month (from fees)
        prisma.mandat.aggregate({
          where: { assignedToId: user.userId, feeStatut: { in: ['FACTURE', 'PAYE'] }, updatedAt: { gte: monthStart } },
          _sum: { feeMontantFacture: true },
        }),
        // Objectives
        prisma.recruiterObjective.findMany({ where: { userId: user.userId } }),
      ]);

      // Format objectives
      const objMap = new Map(objectives.map(o => [`${o.period}_${o.metric}`, o.target]));
      const dailyObj = {
        calls: { actual: callsToday, target: objMap.get('daily_calls') || 30 },
        rdv: { actual: 0, target: objMap.get('daily_rdv') || 1 },
      };

      const user_ = await prisma.user.findUnique({ where: { id: user.userId }, select: { prenom: true, nom: true } });

      return {
        greeting: `Bonjour ${user_?.prenom || ''} !`,
        date: today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        stats: {
          calls_today: callsToday,
          calls_week: callsWeek,
          mandats_actifs: mandatsActifs,
          candidatures_actives: candidaturesActives,
          placements_quarter: placementsQuarter,
          ca_month: caMonth._sum?.feeMontantFacture || 0,
        },
        daily_objectives: dailyObj,
        tasks: {
          overdue: tasksOverdue.map(t => ({ id: t.id, title: t.titre, due: t.tacheDueDate, priority: (t.metadata as any)?.priority })),
          today: tasksToday.map(t => ({ id: t.id, title: t.titre, due: t.tacheDueDate, priority: (t.metadata as any)?.priority })),
        },
        instructions_for_claude: `Affiche le brief de maniere structuree:
1. Salutation + date
2. Objectifs du jour (appels, RDV) avec progression
3. Taches en retard (si existantes, en rouge)
4. Taches du jour
5. Stats cles (mandats actifs, CA, placements)
6. Suggestions proactives basees sur les donnees`,
      };
    }),
  );

  // ─── get_my_stats ─────────────────────────────────────
  server.tool(
    'get_my_stats',
    "Recupere les statistiques du recruteur pour une periode donnee : appels, RDV, candidats, mandats, CA.",
    {
      period: z.string().optional().default('this_week').describe('today, this_week, this_month, this_quarter, this_year'),
    },
    wrapTool('get_my_stats', async (args, user) => {
      const period = (args.period as string) || 'this_week';
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case 'today': startDate = startOfDay(); break;
        case 'this_week': startDate = startOfWeek(); break;
        case 'this_month': startDate = startOfMonth(); break;
        case 'this_quarter': startDate = startOfQuarter(); break;
        case 'this_year': startDate = new Date(now.getFullYear(), 0, 1); break;
        default: startDate = startOfWeek();
      }

      const [calls, emails, meetings, candidatesCreated, mandatesCreated, placements] = await Promise.all([
        prisma.activite.count({ where: { userId: user.userId, type: 'APPEL', createdAt: { gte: startDate } } }),
        prisma.activite.count({ where: { userId: user.userId, type: 'EMAIL', direction: 'SORTANT', createdAt: { gte: startDate } } }),
        prisma.activite.count({ where: { userId: user.userId, type: 'MEETING', createdAt: { gte: startDate } } }),
        prisma.candidat.count({ where: { createdById: user.userId, createdAt: { gte: startDate } } }),
        prisma.mandat.count({ where: { createdById: user.userId, createdAt: { gte: startDate } } }),
        prisma.candidature.count({ where: { createdById: user.userId, stage: 'PLACE', updatedAt: { gte: startDate } } }),
      ]);

      return {
        period,
        start_date: startDate.toISOString(),
        stats: { calls, emails_sent: emails, meetings, candidates_created: candidatesCreated, mandates_created: mandatesCreated, placements },
      };
    }),
  );

  // ─── get_my_calendar ──────────────────────────────────
  server.tool(
    'get_my_calendar',
    "Recupere les evenements du calendrier du recruteur pour aujourd'hui ou une date donnee.",
    {
      date: z.string().optional().describe('Date au format YYYY-MM-DD'),
    },
    wrapTool('get_my_calendar', async (args, user) => {
      const date = args.date ? new Date(args.date as string) : new Date();
      const dayStart = startOfDay(date);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const [meetings, bookings] = await Promise.all([
        prisma.activite.findMany({
          where: { userId: user.userId, type: 'MEETING', createdAt: { gte: dayStart, lt: dayEnd } },
          select: { id: true, titre: true, contenu: true, createdAt: true, entiteType: true, entiteId: true },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.booking.findMany({
          where: { userId: user.userId, bookingDate: { gte: dayStart, lt: dayEnd }, status: 'confirmed' },
          select: { id: true, firstName: true, lastName: true, bookingDate: true, bookingTime: true, durationMinutes: true, entityType: true, candidatId: true, clientId: true },
          orderBy: { bookingTime: 'asc' },
        }),
      ]);

      return {
        date: date.toLocaleDateString('fr-FR'),
        events: [
          ...meetings.map(m => ({ type: 'meeting', title: m.titre, time: m.createdAt })),
          ...bookings.map(b => ({ type: 'booking', title: `${b.firstName} ${b.lastName}`, date: b.bookingDate, time: b.bookingTime, duration: b.durationMinutes })),
        ],
      };
    }),
  );

  // ─── create_rdv ──────────────────────────────────────
  server.tool(
    'create_rdv',
    "[CONFIRMATION REQUISE] Cree un rendez-vous client. Cree l'evenement dans Google Calendar (si connecte) + une activite MEETING dans l'ATS. Tu DOIS demander confirmation avant de creer.",
    {
      titre: z.string().describe("Titre du RDV (ex: 'RDV Ponant - Poste Account Executive')"),
      date: z.string().describe('Date et heure de debut au format ISO (ex: 2026-04-16T14:00:00)'),
      duree: z.number().optional().default(60).describe('Duree en minutes (defaut: 60)'),
      client_id: z.string().optional().describe('UUID du client. Si fourni, lie le RDV au client.'),
      client_name: z.string().optional().describe('Nom du client si pas d\'UUID — recherche automatique.'),
      description: z.string().optional().describe('Description / notes du RDV'),
      lieu: z.string().optional().describe('Lieu (adresse, lien visio, etc.)'),
      attendees: z.array(z.string()).optional().describe('Emails des participants pour invitation Calendar'),
    },
    wrapTool('create_rdv', async (args, user) => {
      // Resolve client
      let entiteId: string | undefined;
      if (args.client_id) {
        entiteId = args.client_id as string;
      } else if (args.client_name) {
        const results = await clientService.list({ page: 1, perPage: 1 }, args.client_name as string);
        if (results.data[0]) {
          entiteId = results.data[0].id;
        }
      }

      const startTime = new Date(args.date as string);
      const dureeMin = (args.duree as number) || 60;
      const endTime = new Date(startTime.getTime() + dureeMin * 60 * 1000);

      // Try to create via Google Calendar (will also create Activite)
      try {
        const result = await calendarService.createEvent(user.userId, {
          summary: args.titre as string,
          description: args.description as string | undefined,
          location: args.lieu as string | undefined,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          attendees: args.attendees as string[] | undefined,
          entiteType: 'CLIENT',
          entiteId: entiteId,
        });
        return {
          success: true,
          calendar: result.success,
          activite_id: result.activiteId,
          google_event_id: result.googleEventId,
          message: result.success
            ? `RDV "${args.titre}" cree dans Calendar + ATS`
            : `RDV "${args.titre}" cree dans l'ATS (Calendar non connecte)`,
        };
      } catch {
        // Calendar not connected — create Activite only
        const activite = await prisma.activite.create({
          data: {
            type: 'MEETING',
            entiteType: 'CLIENT',
            entiteId: entiteId || undefined,
            userId: user.userId,
            titre: args.titre as string,
            contenu: args.description as string || `RDV planifie: ${args.titre}`,
            source: 'MANUEL',
            metadata: {
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              location: (args.lieu as string) || null,
              attendees: (args.attendees as string[]) || [],
              dureeMinutes: dureeMin,
            },
          },
        });
        return {
          success: true,
          calendar: false,
          activite_id: activite.id,
          message: `RDV "${args.titre}" cree dans l'ATS (Google Calendar non connecte)`,
        };
      }
    }),
  );

  // ─── get_my_booking_links ─────────────────────────────
  server.tool(
    'get_my_booking_links',
    "Recupere les liens de booking du recruteur (Calendly-like).",
    {},
    wrapTool('get_my_booking_links', async (_args, user) => {
      const setting = await prisma.bookingSetting.findUnique({
        where: { userId: user.userId },
        include: { bookingTypes: true },
      });
      if (!setting) return { message: 'Aucun booking configure' };

      const baseUrl = process.env.APP_URL || 'https://ats.propium.co';
      return {
        links: setting.bookingTypes.map(bt => ({
          name: bt.label,
          duration: bt.durationMinutes,
          target_type: bt.targetType,
          url: `${baseUrl}/booking/${setting.slug}/${bt.slug}`,
        })),
      };
    }),
  );

  // ─── get_team_stats (admin only) ──────────────────────
  server.tool(
    'get_team_stats',
    "[ADMIN UNIQUEMENT] Recupere les statistiques de toute l'equipe.",
    {
      period: z.string().optional().default('this_week'),
    },
    wrapTool('get_team_stats', async (args) => {
      const period = (args.period as string) || 'this_week';
      const now = new Date();
      let startDate: Date;
      switch (period) {
        case 'today': startDate = startOfDay(); break;
        case 'this_week': startDate = startOfWeek(); break;
        case 'this_month': startDate = startOfMonth(); break;
        case 'this_quarter': startDate = startOfQuarter(); break;
        default: startDate = startOfWeek();
      }

      const users = await prisma.user.findMany({
        where: { role: { in: ['RECRUTEUR', 'ADMIN', 'MANAGER'] } },
        select: { id: true, nom: true, prenom: true },
      });

      const userIds = users.map(u => u.id);
      const [teamStatsRaw, pushStats] = await Promise.all([
        Promise.all(users.map(async (u) => {
          const [calls, emails, placements] = await Promise.all([
            prisma.activite.count({ where: { userId: u.id, type: 'APPEL', createdAt: { gte: startDate } } }),
            prisma.activite.count({ where: { userId: u.id, type: 'EMAIL', direction: 'SORTANT', createdAt: { gte: startDate } } }),
            prisma.candidature.count({ where: { createdById: u.id, stage: 'PLACE', updatedAt: { gte: startDate } } }),
          ]);
          return { id: u.id, name: `${u.prenom || ''} ${u.nom}`.trim(), calls, emails_sent: emails, placements };
        })),
        getPushStatsForUsers(userIds, startDate),
      ]);

      const teamStats = teamStatsRaw.map(u => {
        const ps = pushStats.get(u.id) || { cv_pushed: 0, push_taux_reponse: 0, push_convertis: 0 };
        return { name: u.name, calls: u.calls, emails_sent: u.emails_sent, placements: u.placements, ...ps };
      });

      return { period, team: teamStats };
    }),
  );

  // ─── get_team_brief (admin only) ──────────────────────
  server.tool(
    'get_team_brief',
    "[ADMIN UNIQUEMENT] Brief complet de l'equipe pour la journee/semaine.",
    {
      period: z.string().optional().default('today'),
    },
    wrapTool('get_team_brief', async (args) => {
      // Reuse get_team_stats logic
      const period = (args.period as string) || 'today';
      const now = new Date();
      let startDate: Date;
      switch (period) {
        case 'today': startDate = startOfDay(); break;
        case 'this_week': startDate = startOfWeek(); break;
        default: startDate = startOfDay();
      }

      const users = await prisma.user.findMany({
        where: { role: { in: ['RECRUTEUR', 'ADMIN', 'MANAGER'] } },
        select: { id: true, nom: true, prenom: true },
      });

      const teamData = await Promise.all(users.map(async (u) => {
        const [calls, meetings, mandatsActifs] = await Promise.all([
          prisma.activite.count({ where: { userId: u.id, type: 'APPEL', createdAt: { gte: startDate } } }),
          prisma.activite.count({ where: { userId: u.id, type: 'MEETING', createdAt: { gte: startDate } } }),
          prisma.mandat.count({ where: { assignedToId: u.id, statut: { in: ['OUVERT', 'EN_COURS'] } } }),
        ]);
        return { name: `${u.prenom || ''} ${u.nom}`.trim(), calls, meetings, mandats_actifs: mandatsActifs };
      }));

      // Dormant mandates
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const dormant = await prisma.mandat.findMany({
        where: { statut: { in: ['OUVERT', 'EN_COURS'] }, updatedAt: { lt: sevenDaysAgo } },
        select: { id: true, titrePoste: true, updatedAt: true, entreprise: { select: { nom: true } } },
      });

      return {
        period,
        team: teamData,
        dormant_mandates: dormant.map(m => ({
          title: m.titrePoste,
          company: m.entreprise?.nom,
          days_inactive: Math.floor((Date.now() - m.updatedAt.getTime()) / 86400000),
        })),
        instructions_for_claude: 'Presente un tableau recapitulatif par recruteur avec un classement. Signale les mandats dormants comme alertes.',
      };
    }),
  );

  // ─── get_recruiter_stats (admin only) ─────────────────
  server.tool(
    'get_recruiter_stats',
    "[ADMIN UNIQUEMENT] Stats d'un recruteur specifique pour une periode : appels (total + moyenne/jour ouvre), nouvelles opportunites, mandats clotures, presentations candidat, deals closes. Identifie le recruteur par email, id, ou nom.",
    {
      user_email: z.string().optional().describe("Email du recruteur (ex: valentin@humanup.io)"),
      user_id: z.string().optional().describe('UUID du recruteur'),
      user_name: z.string().optional().describe('Nom ou prenom du recruteur (recherche insensitive)'),
      period: z.string().optional().default('this_quarter').describe('today, this_week, this_month, this_quarter, this_year'),
    },
    wrapTool('get_recruiter_stats', async (args) => {
      // Resolve target user
      let target: { id: string; email: string; nom: string; prenom: string | null } | null = null;
      if (args.user_id) {
        target = await prisma.user.findUnique({
          where: { id: args.user_id as string },
          select: { id: true, email: true, nom: true, prenom: true },
        });
      } else if (args.user_email) {
        target = await prisma.user.findUnique({
          where: { email: args.user_email as string },
          select: { id: true, email: true, nom: true, prenom: true },
        });
      } else if (args.user_name) {
        const q = args.user_name as string;
        target = await prisma.user.findFirst({
          where: {
            OR: [
              { prenom: { contains: q, mode: 'insensitive' } },
              { nom: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, email: true, nom: true, prenom: true },
        });
      }
      if (!target) {
        return { error: 'Recruteur introuvable. Fournis user_email, user_id ou user_name.' };
      }

      // Period bounds
      const now = new Date();
      const period = (args.period as string) || 'this_quarter';
      let startDate: Date;
      let endDate: Date;
      switch (period) {
        case 'today':
          startDate = startOfDay();
          endDate = new Date(startDate);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'this_week':
          startDate = startOfWeek();
          endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
          break;
        case 'this_month':
          startDate = startOfMonth();
          endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59, 999);
          break;
        case 'this_quarter':
          startDate = startOfQuarter();
          endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 3, 0, 23, 59, 59, 999);
          break;
        case 'this_year':
          startDate = new Date(now.getFullYear(), 0, 1);
          endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
          break;
        default:
          startDate = startOfQuarter();
          endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 3, 0, 23, 59, 59, 999);
      }
      // Cap the effective end at "now" for computing per-day averages.
      const effectiveEnd = now < endDate ? now : endDate;
      const workingDays = countWeekdays(startDate, effectiveEnd);

      const userId = target.id;

      const [callsTotal, newOpportunities, mandatsClosed, presentations, dealsClosed] = await Promise.all([
        // 1. Calls (total on period)
        prisma.activite.count({
          where: {
            userId,
            type: 'APPEL',
            createdAt: { gte: startDate, lte: endDate },
          },
        }),
        // 2. Nouvelles opportunites: mandats crees dans la periode ou l'user est owner/sourceur/createur
        prisma.mandat.count({
          where: {
            createdAt: { gte: startDate, lte: endDate },
            OR: [
              { assignedToId: userId },
              { sourceurId: userId },
              { createdById: userId },
            ],
          },
        }),
        // 3. Mandats clotures dans la periode (GAGNE/PERDU/CLOTURE/ANNULE)
        prisma.mandat.count({
          where: {
            statut: { in: ['GAGNE', 'PERDU', 'CLOTURE', 'ANNULE'] },
            dateCloture: { gte: startDate, lte: endDate },
            OR: [
              { assignedToId: userId },
              { sourceurId: userId },
            ],
          },
        }),
        // 4. Presentations candidat (stage -> ENTRETIEN_CLIENT)
        prisma.stageHistory.count({
          where: {
            toStage: 'ENTRETIEN_CLIENT',
            changedAt: { gte: startDate, lte: endDate },
            OR: [
              { changedById: userId },
              { candidature: { mandat: { assignedToId: userId } } },
              { candidature: { mandat: { sourceurId: userId } } },
            ],
          },
        }),
        // 5. Deals closes (stage -> PLACE)
        prisma.stageHistory.count({
          where: {
            toStage: 'PLACE',
            changedAt: { gte: startDate, lte: endDate },
            OR: [
              { changedById: userId },
              { candidature: { mandat: { assignedToId: userId } } },
              { candidature: { mandat: { sourceurId: userId } } },
            ],
          },
        }),
      ]);

      const callsPerDayAvg = workingDays > 0 ? Math.round((callsTotal / workingDays) * 10) / 10 : 0;

      return {
        user: {
          id: target.id,
          name: `${target.prenom || ''} ${target.nom}`.trim(),
          email: target.email,
        },
        period,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        working_days: workingDays,
        stats: {
          calls_total: callsTotal,
          calls_per_day_avg: callsPerDayAvg,
          new_opportunities: newOpportunities,
          mandats_closed: mandatsClosed,
          presentations_candidat: presentations,
          deals_closed: dealsClosed,
        },
        instructions_for_claude: 'Presente les 5 metriques (avec la moyenne calls/jour) dans un tableau clair. Le champ working_days te dit sur combien de jours ouvres la periode etait effectivement mesuree.',
      };
    }),
  );
}
