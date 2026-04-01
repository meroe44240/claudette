import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import prisma from '../../../lib/db.js';

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

      const teamStats = await Promise.all(users.map(async (u) => {
        const [calls, emails, placements] = await Promise.all([
          prisma.activite.count({ where: { userId: u.id, type: 'APPEL', createdAt: { gte: startDate } } }),
          prisma.activite.count({ where: { userId: u.id, type: 'EMAIL', direction: 'SORTANT', createdAt: { gte: startDate } } }),
          prisma.candidature.count({ where: { createdById: u.id, stage: 'PLACE', updatedAt: { gte: startDate } } }),
        ]);
        return { name: `${u.prenom || ''} ${u.nom}`.trim(), calls, emails_sent: emails, placements };
      }));

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
}
