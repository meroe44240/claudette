import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import prisma from '../../../lib/db.js';

/**
 * Chiffres de pilotage pour les agents : page Analytics, RDV pris / effectués /
 * no-show, CV envoyés aux clients, RDV à confirmer. Résultats en anglais.
 * Non-admins : leurs propres chiffres ; admins et comptes agents : toute l'équipe.
 */

const PERIOD = z.enum(['this_week', 'this_month', 'this_quarter']).optional().default('this_month')
  .describe('this_week, this_month or this_quarter (Europe/Paris calendar). Ignored if from/to are given.');

const toRdvPeriod = (p: string) => (p === 'this_week' ? 'week' : p === 'this_quarter' ? 'quarter' : 'month') as 'week' | 'month' | 'quarter';
const KIND_EN = { RDV_CLIENT: 'client_meetings', PRESENTATION: 'presentations', INTERVIEW: 'candidate_interviews' } as const;

async function seesTeam(user: { userId: string; userRole: string; estAgent?: boolean }) {
  return user.estAgent || user.userRole === 'ADMIN' || user.userRole === 'MANAGER';
}

/** Personne visée : id, email ou nom ; null = toute l'équipe (admins / agents) ou soi-même. */
async function resolveUser(args: Record<string, unknown>): Promise<{ id: string; name: string } | null | 'not_found'> {
  const ref = (args.user_id || args.user_email || args.user_name) as string | undefined;
  if (!ref) return null;
  const u = await prisma.user.findFirst({
    where: args.user_id
      ? { id: ref }
      : args.user_email
        ? { email: { equals: ref, mode: 'insensitive' } }
        : { OR: [{ prenom: { contains: ref, mode: 'insensitive' } }, { nom: { contains: ref, mode: 'insensitive' } }] },
    select: { id: true, prenom: true, nom: true },
  });
  return u ? { id: u.id, name: `${u.prenom ?? ''} ${u.nom}`.trim() } : 'not_found';
}

const USER_ARGS = {
  user_id: z.string().optional().describe('Team member UUID'),
  user_email: z.string().optional().describe('Team member email'),
  user_name: z.string().optional().describe('Team member first or last name'),
};

function serialise(c: any) {
  const shows = c.effectues + c.noShow;
  return {
    meetings_booked: c.pris,
    meetings_booked_by_type: Object.fromEntries(Object.entries(KIND_EN).map(([k, en]) => [en, c.prisParType[k]])),
    meetings_held: c.effectues,
    meetings_held_by_type: Object.fromEntries(Object.entries(KIND_EN).map(([k, en]) => [en, c.effectuesParType[k]])),
    no_shows: c.noShow,
    show_up_rate_pct: shows ? Math.round((c.effectues / shows) * 100) : null,
    meetings_to_confirm: c.aConfirmer,
    meetings_cancelled: c.annules,
    meetings_upcoming: c.aVenir,
    cvs_sent_to_clients: c.cvSoumis,
  };
}

export function registerMeetingStatsTools(server: McpServer) {
  // ─── get_meeting_cv_stats ─────────────────────────────
  server.tool(
    'get_meeting_cv_stats',
    "Meetings booked, meetings held (an Allo call of 5+ minutes with the contact around the meeting time, Google Meet attendance, or confirmed by hand), no-shows, cancelled, to confirm, upcoming, and CVs sent to clients, per team member and team total. A meeting counts as booked on the day it was created in Google Calendar, and as held on the day it took place. Meeting types: client meetings, presentations (candidate shown to a client), candidate interviews. Admins and agent accounts see the whole team; others see themselves.",
    {
      period: PERIOD,
      from: z.string().optional().describe('Start date YYYY-MM-DD (inclusive, Paris time). Use with to.'),
      to: z.string().optional().describe('End date YYYY-MM-DD (inclusive, Paris time).'),
      ...USER_ARGS,
    },
    wrapTool('get_meeting_cv_stats', async (args, user) => {
      const { rdvCounters, periodBounds } = await import('../../stats/rdv-stats.service.js');
      const { zonedToUtc } = await import('../../../lib/timezone.js');
      let start: Date;
      let end: Date;
      if (args.from && args.to) {
        const [fy, fm, fd] = String(args.from).split('-').map(Number);
        const [ty, tm, td] = String(args.to).split('-').map(Number);
        start = new Date(zonedToUtc(fy, fm, fd, 0, 0, 'Europe/Paris'));
        end = new Date(zonedToUtc(ty, tm, td + 1, 0, 0, 'Europe/Paris'));
      } else {
        ({ start, end } = periodBounds(toRdvPeriod(String(args.period || 'this_month'))));
      }

      const target = await resolveUser(args);
      if (target === 'not_found') return { error: 'Team member not found.' };
      const team = await seesTeam(user);
      if (target && !team && target.id !== user.userId) return { error: 'You can only see your own numbers.' };

      const people = target
        ? [{ id: target.id, prenom: null, nom: target.name }]
        : team
          ? await prisma.user.findMany({
              where: { status: 'ACTIVE', excludeFromTeamStats: false, estAgent: false, NOT: { nom: 'Testeur' } } as any,
              select: { id: true, prenom: true, nom: true },
              orderBy: { prenom: 'asc' },
            })
          : await prisma.user.findMany({ where: { id: user.userId }, select: { id: true, prenom: true, nom: true } });

      const counters = await rdvCounters(people.map((p) => p.id), start, end);
      const rows = people.map((p) => ({ name: `${p.prenom ?? ''} ${p.nom}`.trim(), user_id: p.id, ...serialise(counters.get(p.id)) }));
      const total = rows.reduce((acc: Record<string, number>, r: any) => {
        for (const k of ['meetings_booked', 'meetings_held', 'no_shows', 'meetings_to_confirm', 'meetings_cancelled', 'meetings_upcoming', 'cvs_sent_to_clients']) acc[k] = (acc[k] || 0) + r[k];
        return acc;
      }, {});
      return {
        from: start.toISOString(),
        to: end.toISOString(),
        team_total: rows.length > 1 ? total : undefined,
        people: rows,
      };
    }),
  );

  // ─── get_analytics ────────────────────────────────────
  server.tool(
    'get_analytics',
    "Everything on the Analytics page for one team member (default: you) over a period: calls, meetings, candidates, mandates, won revenue and presentation rate with trend vs previous period, meetings by type, pipeline funnel by stage, revenue billed per month; plus the team leaderboard (placements, won revenue, presentations, calls, emails, meetings, active applications) for admins and agents.",
    {
      period: z.enum(['this_week', 'this_month', 'this_quarter', 'this_year']).optional().default('this_month'),
      ...USER_ARGS,
    },
    wrapTool('get_analytics', async (args, user) => {
      const p = String(args.period || 'this_month').replace('this_', '') as 'week' | 'month' | 'quarter' | 'year';
      const target = await resolveUser(args);
      if (target === 'not_found') return { error: 'Team member not found.' };
      const team = await seesTeam(user);
      if (target && !team && target.id !== user.userId) return { error: 'You can only see your own numbers.' };
      const subject = target ? target.id : user.userId;

      const { getStatsData } = await import('../../stats/stats.service.js');
      const stats: any = await getStatsData(subject, p, subject);
      const { stageEn } = await import('../labels.js');
      const leaderboard = team ? (await (await import('../../stats/leaderboard.service.js')).getLeaderboard(p)).leaderboard : undefined;

      return {
        period: args.period,
        person: target ? target.name : 'you',
        scorecards: {
          calls: stats.scorecards?.appels,
          meetings: stats.scorecards?.rdv,
          candidates: stats.scorecards?.candidats,
          mandates: stats.scorecards?.mandats,
          won_revenue_eur: stats.scorecards?.ca,
          presentation_rate: stats.scorecards?.tauxPresentation,
          note: 'value = current period, trend = % change vs previous period',
        },
        activity_by_type: (stats.rdvByType || []).map((r: any) => ({ type: r.type, count: r.count })),
        pipeline_funnel: (stats.funnel || []).map((f: any) => ({ stage: f.stage, stage_label: stageEn(f.stage), count: f.count })),
        revenue_by_month: (stats.revenueByMonth || []).map((m: any) => ({ month: m.month, billed_eur: m.facture, collected_eur: m.encaisse })),
        leaderboard: leaderboard?.map((e: any) => ({
          name: `${e.prenom ?? ''} ${e.nom}`.trim(),
          role: e.fonction,
          placements: e.stats.placements,
          won_revenue_eur: e.stats.revenue,
          presentations: e.stats.presentations,
          calls: e.stats.calls,
          emails: e.stats.emails,
          meetings: e.stats.meetings,
          active_applications: e.stats.activeCandidatures,
        })),
      };
    }),
  );

  // ─── list_meetings_to_confirm ─────────────────────────
  server.tool(
    'list_meetings_to_confirm',
    'Finished meetings with no Allo call with the contact and no readable Google Meet attendance (client-created Meet link, no Meet link, nobody joined, or Meet access not yet granted). Each one needs a held / no-show / cancelled answer (use set_meeting_status). Default: your own; admins and agents can pass a team member.',
    { ...USER_ARGS },
    wrapTool('list_meetings_to_confirm', async (args, user) => {
      const target = await resolveUser(args);
      if (target === 'not_found') return { error: 'Team member not found.' };
      if (target && !(await seesTeam(user)) && target.id !== user.userId) return { error: 'You can only see your own meetings.' };
      const { listAConfirmer } = await import('../../meetings/meeting.service.js');
      const rows = await listAConfirmer(target ? target.id : user.userId);
      const REASON: Record<string, string> = {
        not_organizer: 'Meet link created by the client',
        no_meet: 'No Google Meet link',
        no_record: 'Nobody joined the Meet',
        no_access: 'Google Meet access not granted',
      };
      return {
        count: rows.length,
        meetings: rows.map((m: any) => ({
          meeting_id: m.id,
          title: m.titre,
          kind: m.kind,
          start: m.startTime,
          guests: m.attendees.map((a: any) => a.name || a.email),
          reason: m.raison ? REASON[m.raison] ?? m.raison : 'Attendance not checked yet',
        })),
      };
    }),
  );

  // ─── set_meeting_status ───────────────────────────────
  server.tool(
    'set_meeting_status',
    'Record whether a meeting took place: HELD, NO_SHOW or CANCELLED. Updates the meetings held / no-show counters.',
    {
      meeting_id: z.string().describe('Meeting id (from list_meetings_to_confirm)'),
      status: z.enum(['HELD', 'NO_SHOW', 'CANCELLED']),
    },
    wrapTool('set_meeting_status', async (args, user) => {
      const map = { HELD: 'EFFECTUE', NO_SHOW: 'NO_SHOW', CANCELLED: 'ANNULE' } as const;
      const { setRdvStatutManuel } = await import('../../meetings/meet-attendance.service.js');
      await setRdvStatutManuel(String(args.meeting_id), user.userId, map[args.status as keyof typeof map], { anyOwner: !!user.estAgent });
      return { ok: true, meeting_id: args.meeting_id, status: args.status };
    }),
  );
}
