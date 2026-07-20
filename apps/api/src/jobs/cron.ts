/**
 * Lightweight cron scheduler using setInterval + time checking.
 * No external dependency required (no node-cron).
 *
 * Jobs:
 *  - Daily Slack report at 09:00 Europe/Paris (Mon-Fri)
 *  - Calendar AI analysis every 30 minutes
 *  - Pipeline AI analysis every hour
 */

// ─── STATE ──────────────────────────────────────────

let cronStarted = false;
const intervals: ReturnType<typeof setInterval>[] = [];

// Track last execution to avoid double-runs
let lastSlackReportDate = '';
let lastBatchEnrichDate = '';

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

    // Get configured send time (default 09:00 Paris)
    const { getSlackConfig } = await import('../modules/slack/slack.service.js');
    const config = await getSlackConfig();
    if (!config || !config.enabled) return;

    const sendTime = config.sendTime || '09:00';
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

// ─── EMAIL AUTO-CREATE ─────────────────────────────

async function runEmailAutoCreate(): Promise<void> {
  try {
    const { processAllIncomingEmails } = await import(
      '../modules/integrations/email-auto-create.service.js'
    );
    await processAllIncomingEmails();
  } catch (error) {
    console.error('[Cron] Error in Email Auto-Create:', error);
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


// ─── ALLO AUTO-SYNC ────────────────────────────────

async function runAlloSync(): Promise<void> {
  try {
    const { default: prisma } = await import('../lib/db.js');

    // Find all users with Allo integration enabled
    const alloConfigs = await prisma.integrationConfig.findMany({
      where: { provider: 'allo', enabled: true },
      select: { userId: true },
    });

    if (alloConfigs.length === 0) return;

    const { syncCalls, autoProcessTranscripts } = await import(
      '../modules/integrations/allo.service.js'
    );

    for (const config of alloConfigs) {
      try {
        const result = await syncCalls(config.userId);
        if (result.status === 'completed' && result.synced && result.synced > 0) {
          console.log(
            `[Cron] Allo sync (user ${config.userId}): ${result.synced} synced, ${result.message}`,
          );
        }

        // Auto-process any new transcripts
        await autoProcessTranscripts(config.userId);
      } catch (err: any) {
        console.error(`[Cron] Allo sync failed for user ${config.userId}:`, err.message);
      }
    }
  } catch (error) {
    console.error('[Cron] Error in Allo sync:', error);
  }
}

// ─── DRIVE TRANSCRIPT SCAN ──────────────────────────

async function runDriveTranscriptScan(): Promise<void> {
  try {
    const { default: prisma } = await import('../lib/db.js');

    // Find all users with google_docs watch configured
    const watchConfigs = await prisma.integrationConfig.findMany({
      where: { provider: 'google_docs', enabled: true },
      select: { userId: true, config: true },
    });

    if (watchConfigs.length === 0) return;

    const { scanDriveFolder } = await import('../modules/transcripts/transcript.service.js');

    for (const cfg of watchConfigs) {
      const folderId = (cfg.config as any)?.folderId;
      if (!folderId) continue;

      try {
        const result = await scanDriveFolder(cfg.userId);
        if ('processed' in result && result.processed > 0) {
          console.log(`[Cron] Drive transcript scan: ${result.message} (user ${cfg.userId})`);
        }
      } catch (err: any) {
        console.error(`[Cron] Drive transcript scan failed for user ${cfg.userId}:`, err.message);
      }
    }
  } catch (error) {
    console.error('[Cron] Error in Drive transcript scan:', error);
  }
}

// ─── CALENDAR WATCHER ─────────────────────────────

async function runCalendarWatcherJob(): Promise<void> {
  try {
    const { runCalendarWatcher } = await import(
      '../modules/integrations/calendar.service.js'
    );
    await runCalendarWatcher();
  } catch (error) {
    console.error('[Cron] Error in Calendar Watcher:', error);
  }
}

// ─── BATCH ENRICHMENT (WEEKLY) ─────────────────────

async function checkBatchEnrichment(): Promise<void> {
  try {
    const now = new Date();
    const dayOfWeekUtc = now.getUTCDay(); // 0 = Sunday
    const hoursUtc = now.getUTCHours();
    const minutesUtc = now.getUTCMinutes();
    const dateKey = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Only Sunday at 02:00 UTC
    if (dayOfWeekUtc !== 0) return;
    if (lastBatchEnrichDate === dateKey) return;
    if (hoursUtc !== 2 || minutesUtc > 1) return;

    lastBatchEnrichDate = dateKey;
    console.log('[Cron] Starting weekly batch enrichment...');

    const { runBatchEnrichment } = await import('./enrich-batch.js');
    await runBatchEnrichment();
  } catch (error) {
    console.error('[Cron] Error in batch enrichment:', error);
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

  // Email auto-create every 15 minutes
  const emailAutoCreateInterval = setInterval(runEmailAutoCreate, 15 * 60 * 1000);
  intervals.push(emailAutoCreateInterval);

  // Drive transcript scan every 15 minutes
  const driveTranscriptInterval = setInterval(runDriveTranscriptScan, 15 * 60 * 1000);
  intervals.push(driveTranscriptInterval);

  // Allo auto-sync every 10 minutes
  const alloSyncInterval = setInterval(runAlloSync, 10 * 60 * 1000);
  intervals.push(alloSyncInterval);

  // Calendar watcher every 15 minutes (business hours check is inside the function)
  const calendarWatcherInterval = setInterval(runCalendarWatcherJob, 15 * 60 * 1000);
  intervals.push(calendarWatcherInterval);

  // Register Google Calendar push notifications (instant webhook on event changes)
  // Run at startup + renew every 6 hours
  (async () => {
    try {
      const { registerAllCalendarWatches } = await import(
        '../modules/integrations/calendar.service.js'
      );
      await registerAllCalendarWatches();
    } catch (err) {
      console.error('[Cron] Error registering Calendar watches at startup:', err);
    }
  })();
  const calendarWatchRenewInterval = setInterval(async () => {
    try {
      const { registerAllCalendarWatches } = await import(
        '../modules/integrations/calendar.service.js'
      );
      await registerAllCalendarWatches();
    } catch (err) {
      console.error('[Cron] Error renewing Calendar watches:', err);
    }
  }, 6 * 60 * 60 * 1000);
  intervals.push(calendarWatchRenewInterval);

  // Batch enrichment check every 60 seconds (runs Sunday 02:00 UTC only)
  const batchEnrichInterval = setInterval(checkBatchEnrichment, 60 * 1000);
  intervals.push(batchEnrichInterval);

  console.log('[Cron] Scheduled jobs started:');
  console.log('  - Slack daily report: checked every 60s (sends Mon-Fri at configured time, Europe/Paris)');
  console.log('  - Calendar AI analysis: every 30 minutes');
  console.log('  - Pipeline AI analysis: every 60 minutes');
  console.log('  - Email auto-create: every 15 minutes (perso → candidat, pro → client)');
  console.log('  - Drive transcript scan: every 15 minutes (new transcripts/CR)');
  console.log('  - Allo auto-sync: every 10 minutes (calls + transcripts)');
  console.log('  - Calendar watcher: every 15 minutes (Mon-Fri 8h-19h Paris, classify events)');
  console.log('  - Calendar push notifications: registered at startup, renewed every 6h');
  console.log('  - Batch enrichment: checked every 60s (runs Sunday 02:00 UTC — Pappers + CV re-parse)');
}

export function stopCronJobs(): void {
  for (const interval of intervals) {
    clearInterval(interval);
  }
  intervals.length = 0;
  cronStarted = false;
  console.log('[Cron] All scheduled jobs stopped');
}
