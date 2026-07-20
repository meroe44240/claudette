/**
 * Job d'envoi du recap bi-hebdo.
 *
 * Appelable par le cron (`checkRecap` dans jobs/cron.ts) ou par une
 * commande admin. Idempotent : verifie `alreadySentToday()` avant envoi.
 *
 * Destinataires : `RECAP_RECIPIENTS` (env, csv d'emails). Fallback = tous
 * les users avec un email valide. Vide -> log warn + skip (pas d'erreur).
 */

import prisma from '../../lib/db.js';
import { sendEmail } from '../../lib/mailer.js';
import { buildRecap } from './recap.service.js';
import {
  renderRecapHtml,
  renderRecapSubject,
  renderRecapText,
} from './recap.template.js';
import { alreadySentToday, getDefaultWindow } from './recap.window.js';

interface RunResult {
  status: 'sent' | 'skipped' | 'failed';
  message: string;
  runId?: string;
}

export async function runRecap(): Promise<RunResult> {
  if (await alreadySentToday()) {
    return { status: 'skipped', message: 'Deja envoye aujourd\'hui (ICT).' };
  }

  const recipients = await getRecipients();
  if (recipients.length === 0) {
    console.warn('[Recap] Aucun destinataire configure — skip.');
    return { status: 'skipped', message: 'Aucun destinataire.' };
  }

  const window = await getDefaultWindow();
  const to = recipients.join(',');

  try {
    const payload = await buildRecap(window.start, window.end);
    const html = renderRecapHtml(payload);
    const text = renderRecapText(payload);
    const subject = renderRecapSubject(payload);

    await sendEmail(to, subject, html, text);

    const run = await prisma.recapRun.create({
      data: {
        sentAt: new Date(),
        windowStart: window.start,
        windowEnd: window.end,
        status: 'SENT',
      },
    });
    return {
      status: 'sent',
      message: `Envoye a ${recipients.length} destinataire(s) [${subject}]`,
      runId: run.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.recapRun.create({
      data: {
        sentAt: new Date(),
        windowStart: window.start,
        windowEnd: window.end,
        status: 'FAILED',
        error: message.slice(0, 5000),
      },
    });
    console.error('[Recap] Envoi echoue:', message);
    return { status: 'failed', message };
  }
}

async function getRecipients(): Promise<string[]> {
  const envList = process.env.RECAP_RECIPIENTS;
  if (envList && envList.trim()) {
    return envList
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.includes('@'));
  }

  // Fallback : tous les users. Bruyant, mais dev/staging on veut voir passer.
  const users = await prisma.user.findMany({
    select: { email: true },
  });
  return users.map((u) => u.email).filter((e) => e.includes('@'));
}
