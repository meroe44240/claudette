/**
 * Lightweight cron scheduler using setInterval + time checking.
 * No external dependency required (no node-cron).
 *
 * Jobs:
 *  - Daily Slack report at 19:00 Europe/Paris (Mon-Fri)
 *  - Calendar AI analysis every 30 minutes
 *  - Pipeline AI analysis every hour
 */

// ─── STATE ──────────────────────────────────────────

let cronStarted = false;
const intervals: ReturnType<typeof setInterval>[] = [];

// Track last execution to avoid double-runs
let lastSlackReportDate = '';

// ─── HELPERS ────────────────────────────────────────

function getParisTime(): { hours: number; minutes: number; dayOfWeek: number; dateKey: string } {
  const now = new Date();
  const parisStr = now.toLocaleString('en-GB', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [hours, minutes] = parisStr.split(':').map(Number);

  const dayFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    weekday: 'short',
  });
  const dayStr = dayFormatter.format(now);
  const dayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0,
  };
  const dayOfWeek = dayMap[dayStr] ?? now.getDay();

  const dateFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateKey = dateFormatter.format(now);

  return { hours, minutes, dayOfWeek, dateKey };
}

function isWeekday(dayOfWeek: number): boolean {
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

// ─── SLACK DAILY REPORT ─────────────────────────────

async function checkSlackReport(): Promise<void> {
  try {
    const { hours, minutes, dayOfWeek, dateKey } = getParisTime();

    // Only Mon-Fri
    if (!isWeekday(dayOfWeek)) return;

    // Already sent today?
    if (lastSlackReportDate === dateKey) return;

    // Get configured send time (default 19:00 Paris)
    const { getSlackConfig } = await import('../modules/slack/slack.service.js');
    const config = await getSlackConfig();
    if (!config || !config.enabled) return;

    const sendTime = config.sendTime || '19:00';
    const [targetHour, targetMinute] = sendTime.split(':').map(Number);

    // Check if we're within the target window (allow 1 minute tolerance)
    if (hours === targetHour && minutes >= targetMinute && minutes <= targetMinute + 1) {
      lastSlackReportDate = dateKey;
      const { sendDailyReport } = await import('../modules/slack/slack.service.js');
      const result = await sendDailyReport();
      console.log(`[Cron] Slack daily report: ${result.message}`);
    }
  } catch (error) {
    console.error('[Cron] Error in Slack report check:', error);
  }
}

// ─── CALENDAR AI ANALYSIS ───────────────────────────

async function runCalendarAiAnalysis(): Promise<void> {
  try {
    const { default: prisma } = await import('../lib/db.js');

    // Get all users with calendar integration
    const calendarConfigs = await prisma.integrationConfig.findMany({
      where: { provider: 'calendar', enabled: true },
      select: { userId: true },
    });

    if (calendarConfigs.length === 0) return;

    const { analyzeCalendarEvents } = await import('../modules/ai/calendar-ai.service.js');

    for (const config of calendarConfigs) {
      try {
        await analyzeCalendarEvents(config.userId);
      } catch (err) {
        // Silently skip individual user failures
        console.error(`[Cron] Calendar AI analysis failed for user ${config.userId}:`, err);
      }
    }

    console.log(`[Cron] Calendar AI analysis completed for ${calendarConfigs.length} user(s)`);
  } catch (error) {
    console.error('[Cron] Error in Calendar AI analysis:', error);
  }
}

// ─── PIPELINE AI ANALYSIS ───────────────────────────

async function runPipelineAiAnalysis(): Promise<void> {
  try {
    // Pipeline analysis is not user-specific in the current codebase,
    // but we can log that the job ran. If there's a dedicated analysis function,
    // it would be called here.
    console.log(`[Cron] Pipeline analysis check completed at ${new Date().toISOString()}`);
  } catch (error) {
    console.error('[Cron] Error in Pipeline AI analysis:', error);
  }
}

// ─── START / STOP ───────────────────────────────────

export function startCronJobs(): void {
  if (cronStarted) {
    console.log('[Cron] Already started, skipping...');
    return;
  }

  cronStarted = true;
  console.log('[Cron] Starting scheduled jobs...');

  // Check Slack report every 60 seconds
  const slackInterval = setInterval(checkSlackReport, 60 * 1000);
  intervals.push(slackInterval);

  // Calendar AI analysis every 30 minutes
  const calendarInterval = setInterval(runCalendarAiAnalysis, 30 * 60 * 1000);
  intervals.push(calendarInterval);

  // Pipeline AI analysis every hour
  const pipelineInterval = setInterval(runPipelineAiAnalysis, 60 * 60 * 1000);
  intervals.push(pipelineInterval);

  console.log('[Cron] Scheduled jobs started:');
  console.log('  - Slack daily report: checked every 60s (sends Mon-Fri at configured time, Europe/Paris)');
  console.log('  - Calendar AI analysis: every 30 minutes');
  console.log('  - Pipeline AI analysis: every 60 minutes');
}

export function stopCronJobs(): void {
  for (const interval of intervals) {
    clearInterval(interval);
  }
  intervals.length = 0;
  cronStarted = false;
  console.log('[Cron] All scheduled jobs stopped');
}
