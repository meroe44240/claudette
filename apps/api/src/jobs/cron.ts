/**
 * Lightweight cron scheduler using setInterval + time checking.
 * No external dependency required (no node-cron).
 *
 * Jobs:
 *  - Webhook retries every 60s (failed deliveries: 1 min, 5 min, 30 min, 2 h, 12 h)
 *  - Calendar AI analysis: replaced by attendee reading in the Calendar watcher
 *  - Pipeline AI analysis every hour
 */

// ─── STATE ──────────────────────────────────────────

let cronStarted = false;
const intervals: ReturnType<typeof setInterval>[] = [];

// Track last execution to avoid double-runs
let lastBatchEnrichDate = '';
let lastRecapDate = '';
let lastStandupDate = '';

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

let emailAutoCreateRunning = false;
async function runEmailAutoCreate(): Promise<void> {
  if (emailAutoCreateRunning) return;
  emailAutoCreateRunning = true;
  try {
    await runEmailAutoCreateInner();
  } finally {
    emailAutoCreateRunning = false;
  }
}

async function runEmailAutoCreateInner(): Promise<void> {
  try {
    const { processAllIncomingEmails } = await import(
      '../modules/integrations/email-auto-create.service.js'
    );
    await processAllIncomingEmails();
  } catch (error) {
    console.error('[Cron] Error in Email Auto-Create:', error);
  }
  // Détection des pushs CV (emails envoyés avec pièce jointe → maj candidature/client).
  try {
    const { detectAllPushes } = await import(
      '../modules/integrations/push-detect.service.js'
    );
    await detectAllPushes();
  } catch (error) {
    console.error('[Cron] Error in Push Detection:', error);
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

// Un passage long (rattrapage de 30 jours) ne doit pas chevaucher le suivant.
let calendarWatcherRunning = false;
async function runCalendarWatcherJob(): Promise<void> {
  if (calendarWatcherRunning) return;
  calendarWatcherRunning = true;
  try {
    const { runCalendarWatcher } = await import(
      '../modules/integrations/calendar.service.js'
    );
    await runCalendarWatcher();
  } catch (error) {
    console.error('[Cron] Error in Calendar Watcher:', error);
  } finally {
    calendarWatcherRunning = false;
  }
}

// ─── PRÉSENCE GOOGLE MEET (RDV effectué / no-show) ──

let meetAttendanceRunning = false;
async function runMeetAttendanceJob(): Promise<void> {
  if (meetAttendanceRunning) return;
  meetAttendanceRunning = true;
  try {
    const { runMeetAttendanceCheck } = await import('../modules/meetings/meet-attendance.service.js');
    await runMeetAttendanceCheck();
  } catch (error) {
    console.error('[Cron] Error in Meet attendance:', error);
  } finally {
    meetAttendanceRunning = false;
  }
}

// ─── RECAP BI-HEBDO (Monday & Friday 08:00 ICT) ─────

async function checkRecap(): Promise<void> {
  try {
    const now = new Date();

    // Time & weekday in Asia/Ho_Chi_Minh (ICT, UTC+7)
    const ictHm = now.toLocaleString('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const [ictHours, ictMinutes] = ictHm.split(':').map(Number);

    const ictWeekdayStr = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      weekday: 'short',
    }).format(now);
    const ictDate = now
      .toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
      .slice(0, 10);

    // Only Mon (1) or Fri (5)
    const isRecapDay = ictWeekdayStr === 'Mon' || ictWeekdayStr === 'Fri';
    if (!isRecapDay) return;

    // Idempotence (this cron instance)
    if (lastRecapDate === ictDate) return;

    // Window: 08:00–08:01 ICT
    if (ictHours !== 8 || ictMinutes > 1) return;

    lastRecapDate = ictDate;
    console.log(`[Cron] Recap trigger — ${ictWeekdayStr} ${ictDate} 08:00 ICT`);

    const { runRecap } = await import('../modules/recap/recap.job.js');
    const result = await runRecap();
    console.log(`[Cron] Recap: ${result.message}`);
  } catch (err) {
    console.error('[Cron] Error in Recap check:', err);
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

// ─── STANDUP 7h30 (rapport d'activité quotidien par personne) ──
async function checkStandupReport(): Promise<void> {
  try {
    const { hours, minutes, dayOfWeek, dateKey } = getParisTime();
    if (!isWeekday(dayOfWeek)) return;      // Mon-Fri
    if (lastStandupDate === dateKey) return; // une fois/jour
    if (hours !== 7 || minutes < 30 || minutes > 40) return; // ~07:30 Paris
    lastStandupDate = dateKey;
    const { runStandupReport } = await import('../modules/reports/standup.job.js');
    const res = await runStandupReport();
    console.log(`[Cron] Standup envoyé (${res.date}) à ${res.recipients} destinataire(s), ${res.rows} lignes`);
  } catch (err) {
    console.error('[Cron] Standup report failed:', (err as Error).message);
  }
}

// ─── QUALITÉ DES DONNÉES (HEBDO, lundi ~7h Paris) ──
let lastDataQualityDate = '';
async function checkDataQualityWeekly(): Promise<void> {
  try {
    const { hours, minutes, dayOfWeek, dateKey } = getParisTime();
    if (dayOfWeek !== 1 || lastDataQualityDate === dateKey) return;
    if (hours !== 7 || minutes > 10) return;
    lastDataQualityDate = dateKey;
    const { runDataQualityWeekly } = await import('./data-quality-weekly.js');
    const res = await runDataQualityWeekly();
    console.log(`[Cron] Data quality check sent to ${res.recipients} admin(s)`);
  } catch (err) {
    console.error('[Cron] Data quality check failed:', (err as Error).message);
  }
}

export function startCronJobs(): void {
  if (cronStarted) {
    console.log('[Cron] Already started, skipping...');
    return;
  }

  cronStarted = true;
  console.log('[Cron] Starting scheduled jobs...');

  // Corbeille : purge de ce qui a plus de 30 jours, toutes les 6 heures
  const trashPurgeInterval = setInterval(async () => {
    try {
      const { purgeExpired } = await import('../modules/trash/trash.service.js');
      const n = await purgeExpired();
      if (n) console.log(`[Cron] Corbeille : ${n} entrées purgées`);
      // Propriétés arrivées à échéance : libérées.
      const { expireOwnerships } = await import('../modules/ownership/ownership.service.js');
      const exp = await expireOwnerships();
      if (exp) console.log(`[Cron] Propriété : ${exp} échéance(s) libérée(s)`);
      // Clés d'idempotence MCP : gardées 7 jours.
      const { default: prisma } = await import('../lib/db.js');
      await prisma.mcpIdempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } } });
    } catch (err) {
      console.error('[Cron] Purge corbeille :', (err as Error).message);
    }
  }, 6 * 60 * 60 * 1000);
  intervals.push(trashPurgeInterval);

  // Webhooks : reprise des envois en échec (1 min, 5 min, 30 min, 2 h, 12 h)
  const webhookRetryInterval = setInterval(async () => {
    try {
      const { retryDueDeliveries } = await import('../modules/webhooks/webhook.service.js');
      await retryDueDeliveries();
    } catch (err) {
      console.error('[Cron] Webhook retries:', (err as Error).message);
    }
  }, 60 * 1000);
  intervals.push(webhookRetryInterval);

  // Calendar AI analysis : remplacée par la lecture IA des invités dans le Calendar watcher
  // (chaque événement n'est lu qu'une fois). runCalendarAiAnalysis reste pour mémoire.
  void runCalendarAiAnalysis;

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

  // Calendar watcher every 15 minutes, 7 days a week (reads everything changed since last run)
  const calendarWatcherInterval = setInterval(runCalendarWatcherJob, 15 * 60 * 1000);
  intervals.push(calendarWatcherInterval);

  // Google Meet attendance every 15 minutes (RDV effectué / no-show)
  const meetAttendanceInterval = setInterval(runMeetAttendanceJob, 15 * 60 * 1000);
  intervals.push(meetAttendanceInterval);

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

  // Recap bi-hebdo check every 60 seconds (runs Mon/Fri 08:00 ICT only)
  const standupInterval = setInterval(checkStandupReport, 60 * 1000);
  intervals.push(standupInterval);

  // Contrôle qualité des données, lundi matin
  const dataQualityInterval = setInterval(checkDataQualityWeekly, 60 * 1000);
  intervals.push(dataQualityInterval);

  const recapInterval = setInterval(checkRecap, 60 * 1000);
  intervals.push(recapInterval);

  // Humanup Notes : agendas, bots Recall, cochage live, récap de 19h
  import('../modules/notes/notes.scheduler.js')
    .then(({ startNotesJobs }) => startNotesJobs())
    .catch((err) => console.error('[Cron] Humanup Notes jobs failed to start:', err));

  console.log('[Cron] Scheduled jobs started:');
  console.log('  - Webhook retries: every 60s');
  console.log('  - Calendar watcher + attendee reading (AI): every 15 minutes');
  console.log('  - Pipeline AI analysis: every 60 minutes');
  console.log('  - Email auto-create: every 15 minutes (perso → candidat, pro → client)');
  console.log('  - Drive transcript scan: every 15 minutes (new transcripts/CR)');
  console.log('  - Allo auto-sync: every 10 minutes (calls + transcripts)');
  console.log('  - Calendar watcher: every 15 minutes (Mon-Fri 8h-19h Paris, classify events)');
  console.log('  - Calendar push notifications: registered at startup, renewed every 6h');
  console.log('  - Batch enrichment: checked every 60s (runs Sunday 02:00 UTC — Pappers + CV re-parse)');
  console.log('  - Recap bi-hebdo: checked every 60s (runs Mon/Fri 08:00 Asia/Ho_Chi_Minh)');
}

export function stopCronJobs(): void {
  for (const interval of intervals) {
    clearInterval(interval);
  }
  intervals.length = 0;
  cronStarted = false;
  console.log('[Cron] All scheduled jobs stopped');
}
