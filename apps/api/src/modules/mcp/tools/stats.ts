import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import prisma from '../../../lib/db.js';
import * as calendarService from '../../integrations/calendar.service.js';
import * as clientService from '../../clients/client.service.js';
import { stageEn } from '../labels.js';

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
    "User's morning brief: 5 KPIs (calls, presentations, meetings, placements, revenue), today's agenda, active pipeline per mandate, follow-ups to do (no activity for more than 7 days), tasks. Call it when the user says hello, 'my day', 'daily brief'.",
    {
      date: z.string().optional().describe('Date as YYYY-MM-DD. Default: today.'),
      relances_threshold_days: z.number().optional().default(7).describe('Number of days without activity after which a follow-up is suggested. Default 7.'),
    },
    wrapTool('get_daily_brief', async (args, user) => {
      const today = args.date ? new Date(args.date as string) : new Date();
      const dayStart = startOfDay(today);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const yesterdayStart = new Date(dayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const weekStart = startOfWeek(today);
      const monthStart = startOfMonth(today);
      const quarterStart = startOfQuarter(today);
      const relancesThreshold = new Date(dayStart);
      relancesThreshold.setDate(relancesThreshold.getDate() - ((args.relances_threshold_days as number) || 7));

      const [
        // KPIs cockpit
        callsToday, callsYesterday, callsMonth,
        presentationsToday, presentationsMonth,
        rdvToday, rdvMonth,
        placementsToday, placementsMonth, placementsQuarter,
        caMonth, caQuarter,
        // Agenda + tasks
        meetingsToday, tasksOverdue, tasksToday,
        // Pipeline actif
        activeMandates,
        // Alertes
        objectives,
      ] = await Promise.all([
        // Calls
        prisma.activite.count({ where: { userId: user.userId, type: 'APPEL', createdAt: { gte: dayStart, lt: dayEnd } } }),
        prisma.activite.count({ where: { userId: user.userId, type: 'APPEL', createdAt: { gte: yesterdayStart, lt: dayStart } } }),
        prisma.activite.count({ where: { userId: user.userId, type: 'APPEL', createdAt: { gte: monthStart } } }),
        // Presentations (stage transitions to ENTRETIEN_CLIENT)
        prisma.stageHistory.count({
          where: {
            toStage: 'ENTRETIEN_CLIENT',
            changedAt: { gte: dayStart, lt: dayEnd },
            OR: [
              { changedById: user.userId },
              { candidature: { mandat: { OR: [{ assignedToId: user.userId }, { sourceurId: user.userId }] } } },
            ],
          },
        }),
        prisma.stageHistory.count({
          where: {
            toStage: 'ENTRETIEN_CLIENT',
            changedAt: { gte: monthStart },
            OR: [
              { changedById: user.userId },
              { candidature: { mandat: { OR: [{ assignedToId: user.userId }, { sourceurId: user.userId }] } } },
            ],
          },
        }),
        // RDV (meetings type)
        prisma.activite.count({ where: { userId: user.userId, type: 'MEETING', createdAt: { gte: dayStart, lt: dayEnd } } }),
        prisma.activite.count({ where: { userId: user.userId, type: 'MEETING', createdAt: { gte: monthStart } } }),
        // Placements (stage transitions to PLACE)
        prisma.stageHistory.count({
          where: {
            toStage: 'PLACE',
            changedAt: { gte: dayStart, lt: dayEnd },
            OR: [
              { changedById: user.userId },
              { candidature: { mandat: { OR: [{ assignedToId: user.userId }, { sourceurId: user.userId }] } } },
            ],
          },
        }),
        prisma.stageHistory.count({
          where: {
            toStage: 'PLACE',
            changedAt: { gte: monthStart },
            OR: [
              { changedById: user.userId },
              { candidature: { mandat: { OR: [{ assignedToId: user.userId }, { sourceurId: user.userId }] } } },
            ],
          },
        }),
        prisma.stageHistory.count({
          where: {
            toStage: 'PLACE',
            changedAt: { gte: quarterStart },
            OR: [
              { changedById: user.userId },
              { candidature: { mandat: { OR: [{ assignedToId: user.userId }, { sourceurId: user.userId }] } } },
            ],
          },
        }),
        // CA (fees invoiced/paid)
        prisma.mandat.aggregate({
          where: {
            OR: [{ assignedToId: user.userId }, { sourceurId: user.userId }],
            feeStatut: { in: ['FACTURE', 'PAYE'] },
            updatedAt: { gte: monthStart },
          },
          _sum: { feeMontantFacture: true },
        }),
        prisma.mandat.aggregate({
          where: {
            OR: [{ assignedToId: user.userId }, { sourceurId: user.userId }],
            feeStatut: { in: ['FACTURE', 'PAYE'] },
            updatedAt: { gte: quarterStart },
          },
          _sum: { feeMontantFacture: true },
        }),
        // Meetings today (agenda)
        prisma.activite.findMany({
          where: { userId: user.userId, type: 'MEETING', createdAt: { gte: dayStart, lt: dayEnd } },
          select: { id: true, titre: true, createdAt: true, entiteType: true, entiteId: true, metadata: true },
          orderBy: { createdAt: 'asc' },
        }),
        // Overdue tasks
        prisma.activite.findMany({
          where: { userId: user.userId, isTache: true, tacheCompleted: false, tacheDueDate: { lt: dayStart } },
          select: { id: true, titre: true, tacheDueDate: true, metadata: true, entiteType: true, entiteId: true },
          take: 15,
          orderBy: { tacheDueDate: 'asc' },
        }),
        // Today tasks
        prisma.activite.findMany({
          where: { userId: user.userId, isTache: true, tacheCompleted: false, tacheDueDate: { gte: dayStart, lt: dayEnd } },
          select: { id: true, titre: true, tacheDueDate: true, metadata: true, entiteType: true, entiteId: true },
          take: 15,
        }),
        // Active mandates with candidature counts by stage
        prisma.mandat.findMany({
          where: {
            OR: [{ assignedToId: user.userId }, { sourceurId: user.userId }],
            statut: { in: ['OUVERT', 'EN_COURS'] },
          },
          select: {
            id: true,
            titrePoste: true,
            entreprise: { select: { nom: true } },
            candidatures: {
              where: { stage: { notIn: ['REFUSE', 'PLACE'] } },
              select: { stage: true },
            },
          },
        }),
        // Objectives
        prisma.recruiterObjective.findMany({ where: { userId: user.userId } }),
      ]);

      // Relances TODO: candidats en pipeline actif dont la candidature n'a pas
      // bouge depuis threshold. On utilise updatedAt de la Candidature comme
      // proxy (les activites sont polymorphes via entiteType/entiteId, donc
      // pas de relation directe Candidat.activites cote Prisma).
      const relancesCandidates = await prisma.candidature.findMany({
        where: {
          mandat: {
            OR: [{ assignedToId: user.userId }, { sourceurId: user.userId }],
            statut: { in: ['OUVERT', 'EN_COURS'] },
          },
          stage: { notIn: ['REFUSE', 'PLACE', 'SOURCING'] },
          updatedAt: { lt: relancesThreshold },
        },
        select: {
          id: true,
          stage: true,
          updatedAt: true,
          candidat: { select: { id: true, nom: true, prenom: true } },
          mandat: { select: { titrePoste: true, entreprise: { select: { nom: true } } } },
        },
        orderBy: { updatedAt: 'asc' },
        take: 20,
      });

      const user_ = await prisma.user.findUnique({ where: { id: user.userId }, select: { prenom: true, nom: true } });
      const objMap = new Map(objectives.map((o) => [`${o.period}_${o.metric}`, o.target]));

      // Pipeline kanban compact
      const pipeline = activeMandates
        .map((m) => {
          const byStage: Record<string, number> = {};
          const byStageLabel: Record<string, number> = {};
          for (const c of m.candidatures) {
            byStage[c.stage] = (byStage[c.stage] || 0) + 1;
            byStageLabel[stageEn(c.stage)] = (byStageLabel[stageEn(c.stage)] || 0) + 1;
          }
          return {
            titre: m.titrePoste,
            entreprise: m.entreprise?.nom,
            total_actifs: m.candidatures.length,
            par_stage: byStage,
            by_stage_label: byStageLabel,
          };
        })
        .filter((m) => m.total_actifs > 0)
        .sort((a, b) => b.total_actifs - a.total_actifs)
        .slice(0, 10);

      return {
        greeting: `Hello ${user_?.prenom || ''}!`,
        date: today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        kpis: {
          calls: { today: callsToday, yesterday: callsYesterday, month: callsMonth, target_daily: objMap.get('daily_calls') || 30 },
          presentations: { today: presentationsToday, month: presentationsMonth },
          rdv: { today: rdvToday, month: rdvMonth, target_daily: objMap.get('daily_rdv') || 1 },
          placements: { today: placementsToday, month: placementsMonth, quarter: placementsQuarter },
          ca: { month_eur: caMonth._sum?.feeMontantFacture || 0, quarter_eur: caQuarter._sum?.feeMontantFacture || 0 },
        },
        agenda_today: meetingsToday.map((m) => ({
          id: m.id,
          title: m.titre,
          time: m.createdAt,
          entity_type: m.entiteType,
          entity_id: m.entiteId,
          location: (m.metadata as any)?.location || null,
        })),
        relances_todo: relancesCandidates.map((c) => ({
          candidature_id: c.id,
          stage: c.stage,
          stage_label: stageEn(c.stage),
          candidat: `${c.candidat.prenom || ''} ${c.candidat.nom}`.trim(),
          candidat_id: c.candidat.id,
          mandat: c.mandat.titrePoste,
          entreprise: c.mandat.entreprise?.nom,
          days_since_update: Math.floor((Date.now() - c.updatedAt.getTime()) / 86_400_000),
        })),
        pipeline_actif: pipeline,
        tasks: {
          overdue: tasksOverdue.map((t) => ({ id: t.id, title: t.titre, due: t.tacheDueDate, entity_type: t.entiteType, entity_id: t.entiteId })),
          today: tasksToday.map((t) => ({ id: t.id, title: t.titre, due: t.tacheDueDate, entity_type: t.entiteType, entity_id: t.entiteId })),
        },
        instructions_for_claude: [
          'Present the brief in this order:',
          '1. Short greeting + date',
          '2. 📊 Month KPIs on one line (calls / presentations / meetings / placements / revenue)',
          '3. 📅 Today agenda (times + attendees) if not empty',
          '4. 🎯 Active pipeline: top mandates + number of candidates per stage (use the English stage labels)',
          '5. 🔔 Follow-ups to do (`relances_todo` block: candidates with no activity for N days)',
          '6. ✅ Overdue tasks, then today tasks',
          '7. End with ONE proposed time-block plan for the day (deep work + calls + follow-ups + admin).',
          'Be concise, use emojis, no motivational fluff.',
        ].join('\n'),
      };
    }),
  );

  // ─── list_relances_todo ────────────────────────────────
  server.tool(
    'list_relances_todo',
    "Lists the user's candidates with no activity for N days (default 7), most urgent first. Use it to build a targeted follow-up session.",
    {
      days_since_last_activity: z.number().optional().default(7).describe('Threshold in days after which a follow-up is needed.'),
      limit: z.number().optional().default(30).describe('Max number of results. Default 30.'),
      entity_type: z.enum(['candidat', 'client', 'both']).optional().default('candidat').describe('Which follow-ups to return: candidat (candidates), client (client contacts) or both.'),
    },
    wrapTool('list_relances_todo', async (args, user) => {
      const days = (args.days_since_last_activity as number) || 7;
      const limit = (args.limit as number) || 30;
      const entityType = (args.entity_type as string) || 'candidat';
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - days);

      const result: any = { threshold_date: threshold.toISOString(), days_since_last_activity: days };

      if (entityType === 'candidat' || entityType === 'both') {
        const candidatures = await prisma.candidature.findMany({
          where: {
            mandat: {
              OR: [{ assignedToId: user.userId }, { sourceurId: user.userId }],
              statut: { in: ['OUVERT', 'EN_COURS'] },
            },
            stage: { notIn: ['REFUSE', 'PLACE', 'SOURCING'] },
            updatedAt: { lt: threshold },
          },
          select: {
            id: true,
            stage: true,
            updatedAt: true,
            candidat: { select: { id: true, nom: true, prenom: true, telephone: true, email: true } },
            mandat: { select: { id: true, titrePoste: true, entreprise: { select: { nom: true } } } },
          },
          orderBy: { updatedAt: 'asc' },
          take: limit,
        });
        result.candidates = candidatures.map((c) => ({
          candidature_id: c.id,
          candidat_id: c.candidat.id,
          candidat: `${c.candidat.prenom || ''} ${c.candidat.nom}`.trim(),
          telephone: c.candidat.telephone,
          email: c.candidat.email,
          stage: c.stage,
          stage_label: stageEn(c.stage),
          mandat: c.mandat.titrePoste,
          entreprise: c.mandat.entreprise?.nom,
          mandat_id: c.mandat.id,
          days_since_last_activity: Math.floor((Date.now() - c.updatedAt.getTime()) / 86_400_000),
          suggested_channel: c.candidat.telephone ? 'call' : 'email',
        }));
      }

      if (entityType === 'client' || entityType === 'both') {
        const clients = await prisma.client.findMany({
          where: {
            OR: [{ assignedToId: user.userId }, { createdById: user.userId }],
            statutClient: { notIn: ['INACTIF'] },
            updatedAt: { lt: threshold },
          },
          select: {
            id: true,
            nom: true,
            prenom: true,
            telephone: true,
            email: true,
            entreprise: { select: { nom: true } },
            updatedAt: true,
          },
          orderBy: { updatedAt: 'asc' },
          take: limit,
        });
        result.clients = clients.map((c) => ({
          client_id: c.id,
          nom: `${c.prenom || ''} ${c.nom}`.trim(),
          telephone: c.telephone,
          email: c.email,
          entreprise: c.entreprise?.nom,
          days_since_last_activity: Math.floor((Date.now() - c.updatedAt.getTime()) / 86_400_000),
          suggested_channel: c.telephone ? 'call' : 'email',
        }));
      }

      return result;
    }),
  );

  // ─── plan_my_day ──────────────────────────────────────
  server.tool(
    'plan_my_day',
    "Proposes a plan for the day in time blocks (deep work / calls / follow-ups / admin) based on the user's agenda, urgent tasks and pending follow-ups. Returns the proposed blocks WITHOUT creating them in Google Calendar: the user validates first, then create_rdv can be called if needed.",
    {
      date: z.string().optional().describe('Date as YYYY-MM-DD. Default: today.'),
      start_hour: z.number().optional().default(9).describe('Start hour of the working day (default 9)'),
      end_hour: z.number().optional().default(18).describe('End hour of the working day (default 18)'),
      lunch_start_hour: z.number().optional().default(12).describe('Lunch break start hour (default 12)'),
      lunch_duration_min: z.number().optional().default(60).describe('Lunch break length in minutes (default 60)'),
    },
    wrapTool('plan_my_day', async (args, user) => {
      const targetDate = args.date ? new Date(args.date as string) : new Date();
      const dayStart = startOfDay(targetDate);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const startHour = (args.start_hour as number) || 9;
      const endHour = (args.end_hour as number) || 18;
      const lunchStart = (args.lunch_start_hour as number) || 12;
      const lunchDurationMin = (args.lunch_duration_min as number) || 60;

      const relancesThreshold = new Date(dayStart);
      relancesThreshold.setDate(relancesThreshold.getDate() - 7);

      const [meetings, overdueTasks, todayTasks, relances] = await Promise.all([
        prisma.activite.findMany({
          where: { userId: user.userId, type: 'MEETING', createdAt: { gte: dayStart, lt: dayEnd } },
          select: { id: true, titre: true, createdAt: true, metadata: true },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.activite.count({ where: { userId: user.userId, isTache: true, tacheCompleted: false, tacheDueDate: { lt: dayStart } } }),
        prisma.activite.count({ where: { userId: user.userId, isTache: true, tacheCompleted: false, tacheDueDate: { gte: dayStart, lt: dayEnd } } }),
        prisma.candidature.count({
          where: {
            mandat: {
              OR: [{ assignedToId: user.userId }, { sourceurId: user.userId }],
              statut: { in: ['OUVERT', 'EN_COURS'] },
            },
            stage: { notIn: ['REFUSE', 'PLACE', 'SOURCING'] },
            updatedAt: { lt: relancesThreshold },
          },
        }),
      ]);

      // Convert meetings to blocks (fixed) then fill the gaps.
      const meetingBlocks = meetings.map((m) => {
        const start = new Date(m.createdAt);
        const duration = (m.metadata as any)?.dureeMinutes || 60;
        const end = new Date(start.getTime() + duration * 60_000);
        return {
          type: 'meeting' as const,
          title: m.titre,
          start_iso: start.toISOString(),
          end_iso: end.toISOString(),
          fixed: true,
        };
      });

      // Build free-time slots between meetings within work hours.
      const dayStartWork = new Date(dayStart);
      dayStartWork.setHours(startHour, 0, 0, 0);
      const dayEndWork = new Date(dayStart);
      dayEndWork.setHours(endHour, 0, 0, 0);
      const lunchStartTime = new Date(dayStart);
      lunchStartTime.setHours(lunchStart, 0, 0, 0);
      const lunchEndTime = new Date(lunchStartTime.getTime() + lunchDurationMin * 60_000);

      // Compose a suggested schedule (soft blocks) around meetings + lunch.
      const softBlocks: Array<{ type: string; title: string; start_iso: string; end_iso: string; fixed: boolean }> = [];

      // Morning deep work / callback prep (first free slot after startHour)
      const firstMeetingStart = meetings[0]?.createdAt || dayEndWork;
      if (firstMeetingStart > dayStartWork) {
        const morningEnd = new Date(Math.min(firstMeetingStart.getTime(), lunchStartTime.getTime()));
        softBlocks.push({
          type: 'prep',
          title: 'Deep work / prep for today meetings',
          start_iso: dayStartWork.toISOString(),
          end_iso: morningEnd.toISOString(),
          fixed: false,
        });
      }

      // Lunch
      softBlocks.push({
        type: 'lunch',
        title: 'Lunch break',
        start_iso: lunchStartTime.toISOString(),
        end_iso: lunchEndTime.toISOString(),
        fixed: false,
      });

      // Afternoon: relances + admin
      if (relances > 0) {
        const afterLunchStart = new Date(lunchEndTime);
        const afterLunchEnd = new Date(afterLunchStart.getTime() + 60 * 60_000);
        softBlocks.push({
          type: 'relances',
          title: `Follow-up session (${relances} candidates waiting)`,
          start_iso: afterLunchStart.toISOString(),
          end_iso: afterLunchEnd.toISOString(),
          fixed: false,
        });
      }

      const adminBlockStart = new Date(dayEndWork.getTime() - 45 * 60_000);
      softBlocks.push({
        type: 'admin',
        title: 'Admin, notes, ATS',
        start_iso: adminBlockStart.toISOString(),
        end_iso: dayEndWork.toISOString(),
        fixed: false,
      });

      const allBlocks = [...meetingBlocks, ...softBlocks].sort((a, b) => a.start_iso.localeCompare(b.start_iso));

      return {
        date: targetDate.toLocaleDateString('en-GB'),
        context: {
          meetings_count: meetings.length,
          overdue_tasks: overdueTasks,
          today_tasks: todayTasks,
          relances_pending: relances,
        },
        proposed_blocks: allBlocks,
        instructions_for_claude: [
          'Present the proposed blocks as a timetable.',
          'Separate fixed blocks (confirmed meetings) from flexible ones (prep, follow-ups, admin).',
          'Ask the user whether they want to adjust (move, add or remove a block) or validate everything.',
          'Once validated, call create_rdv for the blocks they want in Google Calendar.',
          'Create NOTHING without explicit confirmation.',
        ].join('\n'),
      };
    }),
  );

  // ─── get_my_stats ─────────────────────────────────────
  server.tool(
    'get_my_stats',
    "Gets the user's stats for a period: calls, meetings, candidates, mandates, placements.",
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
    "Gets the user's calendar events for today or a given date.",
    {
      date: z.string().optional().describe('Date as YYYY-MM-DD'),
    },
    wrapTool('get_my_calendar', async (args, user) => {
      const date = args.date ? new Date(args.date as string) : new Date();
      const dayStart = startOfDay(date);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const meetings = await prisma.activite.findMany({
        where: { userId: user.userId, type: 'MEETING', createdAt: { gte: dayStart, lt: dayEnd } },
        select: { id: true, titre: true, contenu: true, createdAt: true, entiteType: true, entiteId: true },
        orderBy: { createdAt: 'asc' },
      });

      return {
        date: date.toLocaleDateString('en-GB'),
        events: meetings.map(m => ({ type: 'meeting', title: m.titre, time: m.createdAt })),
      };
    }),
  );

  // ─── create_rdv ──────────────────────────────────────
  server.tool(
    'create_rdv',
    "[CONFIRMATION REQUIRED] Creates a client meeting: the event in Google Calendar (if connected) plus a MEETING activity in the ATS. You MUST ask for confirmation before creating it.",
    {
      titre: z.string().describe("Meeting title (e.g. 'Ponant meeting · Account Executive role')"),
      date: z.string().describe('Start date and time in ISO format (e.g. 2026-04-16T14:00:00)'),
      duree: z.number().optional().default(60).describe('Length in minutes (default: 60)'),
      client_id: z.string().optional().describe('UUID of the client contact. If given, the meeting is linked to them.'),
      client_name: z.string().optional().describe('Client contact name if no UUID: searched automatically.'),
      description: z.string().optional().describe('Meeting description or notes'),
      lieu: z.string().optional().describe('Location (address, video link, etc.)'),
      attendees: z.array(z.string()).optional().describe('Attendee emails for the Calendar invite'),
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

      const invites = ((args.attendees as string[] | undefined) || []).filter(Boolean);
      if (!entiteId && invites.length === 0) {
        return {
          success: false,
          message: "A client meeting needs a date and at least one contact: give the client (client_id or client_name) or the attendee emails.",
        };
      }

      const startTime = new Date(args.date as string);
      if (Number.isNaN(startTime.getTime())) {
        return { success: false, message: 'Invalid meeting date: ISO format expected (e.g. 2026-04-16T14:00:00).' };
      }
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
          kind: 'RDV_CLIENT',
        });
        return {
          success: true,
          calendar: result.success,
          activite_id: result.activiteId,
          google_event_id: result.googleEventId,
          message: result.success
            ? `Meeting "${args.titre}" created in Calendar and the ATS`
            : `Meeting "${args.titre}" created in the ATS (Calendar not connected)`,
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
            contenu: args.description as string || `Meeting scheduled: ${args.titre}`,
            source: 'MANUEL',
            metadata: {
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              location: (args.lieu as string) || null,
              attendees: (args.attendees as string[]) || [],
              dureeMinutes: dureeMin,
              calendarEventType: 'RDV_CLIENT',
            },
          },
        });
        return {
          success: true,
          calendar: false,
          activite_id: activite.id,
          message: `Meeting "${args.titre}" created in the ATS (Google Calendar not connected)`,
        };
      }
    }),
  );


  // ─── get_team_stats (admin only) ──────────────────────
  server.tool(
    'get_team_stats',
    "[ADMIN ONLY] Gets stats for the whole team.",
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
        where: { role: { in: ['RECRUTEUR', 'ADMIN', 'MANAGER'] }, status: 'ACTIVE' } as any,
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

  // ─── get_team_daily_report (admin only) ───────────────
  server.tool(
    'get_team_daily_report',
    "[ADMIN] Daily activity report per person (standup): business overview (active and dormant mandates, candidates in process, open offers, presentations this week, placements and revenue this month), yesterday's events (offers and presentations with candidate, mandate, recruiter, contact), and activity per person (calls, meetings, pushes, presentations, screenings, new items). Window = previous working day (Europe/Paris; on Monday, Friday).",
    {
      date: z.string().optional().describe('Report day YYYY-MM-DD. Default: previous working day.'),
    },
    wrapTool('get_team_daily_report', async (args) => {
      const { getTeamDailyReport } = await import('../../reports/team-daily-report.service.js');
      return getTeamDailyReport(args.date as string | undefined);
    }),
  );

  // ─── get_team_brief (admin only) ──────────────────────
  server.tool(
    'get_team_brief',
    "[ADMIN ONLY] Full team brief for the day or week.",
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
        where: { role: { in: ['RECRUTEUR', 'ADMIN', 'MANAGER'] }, status: 'ACTIVE' } as any,
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
        instructions_for_claude: 'Present a summary table per recruiter with a ranking. Flag dormant mandates as alerts.',
      };
    }),
  );

  // ─── get_recruiter_stats (admin only) ─────────────────
  server.tool(
    'get_recruiter_stats',
    "[ADMIN ONLY] Stats for one recruiter over a period: calls (total and average per working day), new opportunities, closed mandates, candidate presentations, closed deals. Identify the recruiter by email, id or name.",
    {
      user_email: z.string().optional().describe('Recruiter email (e.g. valentin@humanup.io)'),
      user_id: z.string().optional().describe('UUID of the recruiter'),
      user_name: z.string().optional().describe('Recruiter first or last name (case-insensitive search)'),
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
        return { error: 'Recruiter not found. Give user_email, user_id or user_name.' };
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
        instructions_for_claude: 'Present the 5 metrics (with the calls per day average) in a clear table. working_days tells you how many working days the period actually covers.',
      };
    }),
  );
}
