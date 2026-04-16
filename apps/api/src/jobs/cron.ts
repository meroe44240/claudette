/**
 * Lightweight cron scheduler using setInterval + time checking.
 * No external dependency required (no node-cron).
 *
 * Jobs:
 *  - Daily Slack report at 09:00 Europe/Paris (Mon-Fri)
 *  - Calendar AI analysis every 30 minutes
 *  - Pipeline AI analysis every hour
 *  - Booking reminders: every 60 seconds (day-before + 1h-before emails)
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

// ─── BOOKING REMINDERS ─────────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

async function getValidAccessTokenForCron(userId: string, prismaClient: any): Promise<string | null> {
  let config = await prismaClient.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: 'calendar' } },
  });

  if (!config || !config.accessToken) {
    config = await prismaClient.integrationConfig.findUnique({
      where: { userId_provider: { userId, provider: 'gmail' } },
    });
  }

  if (!config || !config.enabled || !config.accessToken) return null;

  // Refresh expired token
  if (config.tokenExpiry && config.tokenExpiry.getTime() < Date.now() + 5 * 60 * 1000) {
    if (!config.refreshToken) return null;

    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: config.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      const tokens = await response.json() as any;
      if (tokens.error) return null;

      const newExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
      await prismaClient.integrationConfig.update({
        where: { id: config.id },
        data: { accessToken: tokens.access_token, tokenExpiry: newExpiry },
      });

      return tokens.access_token as string;
    } catch {
      return null;
    }
  }

  return config.accessToken;
}

function createReminderMimeMessage(
  from: string,
  to: string,
  subject: string,
  htmlBody: string,
): string {
  const boundary = `boundary_${Date.now()}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    htmlBody.replace(/<[^>]+>/g, ''),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ];

  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64url');
}

async function processBookingReminders(): Promise<void> {
  try {
    const { default: prisma } = await import('../lib/db.js');

    // Find all pending reminders whose scheduledAt has passed
    const pendingReminders = await prisma.bookingReminder.findMany({
      where: {
        status: 'pending',
        scheduledAt: { lte: new Date() },
      },
      include: {
        booking: {
          include: {
            user: { select: { id: true, nom: true, prenom: true, email: true } },
          },
        },
      },
      take: 50, // Process max 50 reminders per cycle
    });

    if (pendingReminders.length === 0) return;

    let sentCount = 0;
    let failedCount = 0;

    for (const reminder of pendingReminders) {
      const { booking } = reminder;

      // Skip if booking is no longer confirmed
      if (booking.status !== 'confirmed') {
        await prisma.bookingReminder.update({
          where: { id: reminder.id },
          data: { status: 'cancelled' },
        });
        continue;
      }

      // Get access token to send email via Gmail API
      const accessToken = await getValidAccessTokenForCron(booking.userId, prisma);
      if (!accessToken) {
        await prisma.bookingReminder.update({
          where: { id: reminder.id },
          data: {
            status: 'failed',
            errorMessage: 'Impossible d\'obtenir un token Gmail valide',
            sentAt: new Date(),
          },
        });
        failedCount++;
        continue;
      }

      const recruiterName = `${booking.user.prenom || ''} ${booking.user.nom}`.trim();
      const bookingDateStr = booking.bookingDate.toISOString().substring(0, 10);
      const formattedDate = new Date(bookingDateStr).toLocaleDateString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const cancelUrl = `${APP_URL}/book/cancel/${booking.id}?token=${booking.cancelToken}`;

      let subject: string;
      let htmlBody: string;

      if (reminder.type === 'email_day_before') {
        subject = `Rappel : votre RDV demain avec ${recruiterName}`;
        htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Rappel de votre RDV demain</h2>
            <p>Bonjour ${booking.firstName},</p>
            <p>Nous vous rappelons votre rendez-vous prevu <strong>demain</strong> avec <strong>${recruiterName}</strong>.</p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Date :</strong> ${formattedDate}</p>
              <p style="margin: 4px 0;"><strong>Heure :</strong> ${booking.bookingTime}</p>
              <p style="margin: 4px 0;"><strong>Duree :</strong> ${booking.durationMinutes} minutes</p>
            </div>
            <p>Si vous devez annuler ou reporter, <a href="${cancelUrl}" style="color: #2563eb;">cliquez ici</a>.</p>
            <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">Cet email a ete envoye automatiquement depuis la plateforme HumanUp.</p>
          </div>
        `;
      } else {
        // email_1h_before
        subject = `Votre RDV avec ${recruiterName} dans 1 heure`;
        htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Votre RDV commence bientot</h2>
            <p>Bonjour ${booking.firstName},</p>
            <p>Votre rendez-vous avec <strong>${recruiterName}</strong> commence dans <strong>1 heure</strong>.</p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 4px 0;"><strong>Date :</strong> ${formattedDate}</p>
              <p style="margin: 4px 0;"><strong>Heure :</strong> ${booking.bookingTime}</p>
              <p style="margin: 4px 0;"><strong>Duree :</strong> ${booking.durationMinutes} minutes</p>
            </div>
            <p>A tout de suite !</p>
            <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">Cet email a ete envoye automatiquement depuis la plateforme HumanUp.</p>
          </div>
        `;
      }

      try {
        const rawMessage = createReminderMimeMessage(
          booking.user.email,
          booking.email,
          subject,
          htmlBody,
        );

        const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: rawMessage }),
        });

        if (gmailResponse.ok) {
          await prisma.bookingReminder.update({
            where: { id: reminder.id },
            data: { status: 'sent', sentAt: new Date() },
          });
          sentCount++;
        } else {
          const gmailError = await gmailResponse.json() as any;
          await prisma.bookingReminder.update({
            where: { id: reminder.id },
            data: {
              status: 'failed',
              sentAt: new Date(),
              errorMessage: gmailError?.error?.message || `Gmail API error: ${gmailResponse.status}`,
            },
          });
          failedCount++;
        }
      } catch (err: any) {
        await prisma.bookingReminder.update({
          where: { id: reminder.id },
          data: {
            status: 'failed',
            sentAt: new Date(),
            errorMessage: err.message || 'Unknown error sending reminder',
          },
        });
        failedCount++;
      }
    }

    if (sentCount > 0 || failedCount > 0) {
      console.log(`[Cron] Booking reminders: ${sentCount} sent, ${failedCount} failed`);
    }
  } catch (error) {
    console.error('[Cron] Error processing booking reminders:', error);
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

// ─── PUSH CV AUTO-DETECT ──────────────────────────

async function runPushDetect(): Promise<void> {
  try {
    const { detectAllPushes } = await import(
      '../modules/pushes/push-detect.service.js'
    );
    await detectAllPushes();
  } catch (error) {
    console.error('[Cron] Error in Push CV detection:', error);
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

// ─── SEQUENCE DUE RUNS ────────────────────────────

async function runSequenceDueSteps(): Promise<void> {
  try {
    const { processDueRuns } = await import(
      '../modules/sequences/sequence.service.js'
    );
    const results = await processDueRuns();
    if (results.length > 0) {
      console.log(`[Cron] Sequence due runs: ${results.length} step(s) processed`);
    }
  } catch (error) {
    console.error('[Cron] Error in Sequence due runs:', error);
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

  // Booking reminders every 60 seconds
  const bookingReminderInterval = setInterval(processBookingReminders, 60 * 1000);
  intervals.push(bookingReminderInterval);

  // Email auto-create every 15 minutes
  const emailAutoCreateInterval = setInterval(runEmailAutoCreate, 15 * 60 * 1000);
  intervals.push(emailAutoCreateInterval);

  // Drive transcript scan every 15 minutes
  const driveTranscriptInterval = setInterval(runDriveTranscriptScan, 15 * 60 * 1000);
  intervals.push(driveTranscriptInterval);

  // Allo auto-sync every 10 minutes
  const alloSyncInterval = setInterval(runAlloSync, 10 * 60 * 1000);
  intervals.push(alloSyncInterval);

  // Push CV auto-detect every 15 minutes
  const pushDetectInterval = setInterval(runPushDetect, 15 * 60 * 1000);
  intervals.push(pushDetectInterval);

  // Sequence due steps every 5 minutes
  const sequenceDueInterval = setInterval(runSequenceDueSteps, 5 * 60 * 1000);
  intervals.push(sequenceDueInterval);

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
  console.log('  - Booking reminders: checked every 60s (day-before + 1h-before emails)');
  console.log('  - Email auto-create: every 15 minutes (perso → candidat, pro → client)');
  console.log('  - Drive transcript scan: every 15 minutes (new transcripts/CR)');
  console.log('  - Allo auto-sync: every 10 minutes (calls + transcripts)');
  console.log('  - Push CV auto-detect: every 15 minutes (sent emails → push detection)');
  console.log('  - Sequence due steps: every 5 minutes (execute next steps for due runs)');
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
