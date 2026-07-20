import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import prisma from '../../../lib/db.js';
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
    "Brief matinal du recruteur : 5 KPIs (calls, prez, RDV, placements, CA), agenda du jour, kanban actif par mandat, relances a faire (>7j sans activite), taches. Appeler quand le recruteur dit bonjour, 'ma journee', 'brief du jour'.",
    {
      date: z.string().optional().describe('Date au format YYYY-MM-DD. Defaut: aujourd\'hui.'),
      relances_threshold_days: z.number().optional().default(7).describe('Nombre de jours sans activite au-dela duquel on suggere une relance. Defaut 7.'),
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

      // Relances TODO: candidats en pipeline actif sans activité depuis threshold
      const relancesCandidates = await prisma.candidature.findMany({
        where: {
          mandat: {
            OR: [{ assignedToId: user.userId }, { sourceurId: user.userId }],
            statut: { in: ['OUVERT', 'EN_COURS'] },
          },
          stage: { notIn: ['REFUSE', 'PLACE', 'SOURCING'] },
          candidat: {
            activites: { none: { createdAt: { gte: relancesThreshold } } },
          },
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
          for (const c of m.candidatures) {
            byStage[c.stage] = (byStage[c.stage] || 0) + 1;
          }
          return {
            titre: m.titrePoste,
            entreprise: m.entreprise?.nom,
            total_actifs: m.candidatures.length,
            par_stage: byStage,
          };
        })
        .filter((m) => m.total_actifs > 0)
        .sort((a, b) => b.total_actifs - a.total_actifs)
        .slice(0, 10);

      return {
        greeting: `Bonjour ${user_?.prenom || ''} !`,
        date: today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
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
          'Presente le brief dans cet ordre :',
          '1. Salutation courte + date',
          '2. 📊 KPIs du mois en une ligne (calls / prez / RDV / placements / CA)',
          '3. 📅 Agenda du jour (heures + participants) si non vide',
          '4. 🎯 Pipeline actif : top mandats + nombre de candidats par stage',
          '5. 🔔 Relances à faire (bloc `relances_todo` — candidats sans activité depuis N jours)',
          '6. ✅ Tâches en retard puis tâches du jour',
          '7. Termine par UNE proposition de blocs horaires pour la journée (deep work + calls + relances + admin).',
          'Sois concis, utilise des emojis, pas de bullshit motivational.',
        ].join('\n'),
      };
    }),
  );

  // ─── list_relances_todo ────────────────────────────────
  server.tool(
    'list_relances_todo',
    "Liste les candidats du recruteur sans activite depuis N jours (default 7), triés du plus urgent au moins urgent. Le recruteur ou Claude peut appeler pour construire une session de relance ciblee.",
    {
      days_since_last_activity: z.number().optional().default(7).describe('Seuil en jours au-dela duquel on considere une relance necessaire.'),
      limit: z.number().optional().default(30).describe('Nombre max de resultats. Defaut 30.'),
      entity_type: z.enum(['candidat', 'client', 'both']).optional().default('candidat').describe('Type de relance à retourner.'),
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
            candidat: { activites: { none: { createdAt: { gte: threshold } } } },
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
            activites: { none: { createdAt: { gte: threshold } } },
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
    "Propose une organisation de journee en blocs horaires (deep work / calls / relances / admin) en tenant compte de l'agenda du recruteur, des taches urgentes et des relances a faire. Retourne les blocs proposes SANS les creer dans Google Calendar — le recruteur doit ensuite valider et Claude appellera create_rdv si besoin.",
    {
      date: z.string().optional().describe('Date au format YYYY-MM-DD. Defaut: aujourd\'hui.'),
      start_hour: z.number().optional().default(9).describe("Heure de debut de journee (defaut 9)"),
      end_hour: z.number().optional().default(18).describe("Heure de fin de journee (defaut 18)"),
      lunch_start_hour: z.number().optional().default(12).describe("Debut pause dej (defaut 12)"),
      lunch_duration_min: z.number().optional().default(60).describe("Duree pause dej en min (defaut 60)"),
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
            candidat: { activites: { none: { createdAt: { gte: relancesThreshold } } } },
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
          title: 'Deep work / prépa RDV du jour',
          start_iso: dayStartWork.toISOString(),
          end_iso: morningEnd.toISOString(),
          fixed: false,
        });
      }

      // Lunch
      softBlocks.push({
        type: 'lunch',
        title: 'Pause déjeuner',
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
          title: `Session relances (${relances} candidats en attente)`,
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
        date: targetDate.toLocaleDateString('fr-FR'),
        context: {
          meetings_count: meetings.length,
          overdue_tasks: overdueTasks,
          today_tasks: todayTasks,
          relances_pending: relances,
        },
        proposed_blocks: allBlocks,
        instructions_for_claude: [
          'Presente les blocs proposes sous forme de tableau horaire.',
          'Distingue les blocs fixes (meetings deja confirmes) des blocs souples (prep, relances, admin).',
          'Demande au recruteur s\'il veut ajuster (deplacer un bloc, en ajouter, en retirer) ou tout valider.',
          'Si validation → appelle create_rdv pour les blocs qu\'il souhaite materialiser dans Google Calendar.',
          'Ne cree RIEN sans confirmation explicite.',
        ].join('\n'),
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

      const meetings = await prisma.activite.findMany({
        where: { userId: user.userId, type: 'MEETING', createdAt: { gte: dayStart, lt: dayEnd } },
        select: { id: true, titre: true, contenu: true, createdAt: true, entiteType: true, entiteId: true },
        orderBy: { createdAt: 'asc' },
      });

      return {
        date: date.toLocaleDateString('fr-FR'),
        events: meetings.map(m => ({ type: 'meeting', title: m.titre, time: m.createdAt })),
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
