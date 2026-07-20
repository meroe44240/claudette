/**
 * Utilitaires de fenetre pour le recap bi-hebdo.
 *
 * Reference horaire : Asia/Ho_Chi_Minh (ICT, UTC+7). Envoi 08:00 ICT
 * les lundi et vendredi.
 *
 * Fenetre par defaut = du sentAt du dernier `RecapRun` SENT jusqu'a
 * maintenant. Si aucun run precedent, fallback = 7 jours en arriere.
 */

import prisma from '../../lib/db.js';

export const RECAP_TZ = 'Asia/Ho_Chi_Minh';
export const RECAP_HOUR_ICT = 8; // 08:00 ICT = 01:00 UTC

export interface Window {
  start: Date;
  end: Date;
}

/**
 * Fenetre par defaut : depuis le dernier envoi SENT, jusqu'a maintenant.
 * Fallback = -7 jours si aucun envoi precedent.
 */
export async function getDefaultWindow(now: Date = new Date()): Promise<Window> {
  const lastSent = await prisma.recapRun.findFirst({
    where: { status: 'SENT' },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true },
  });

  const start = lastSent
    ? lastSent.sentAt
    : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return { start, end: now };
}

/**
 * Verifie si un run SENT existe deja pour la meme journee ICT (idempotence).
 */
export async function alreadySentToday(now: Date = new Date()): Promise<boolean> {
  const dayIct = toIctDateStr(now);
  const startOfDayIct = ictDateStrToDate(dayIct);
  const endOfDayIct = new Date(startOfDayIct.getTime() + 24 * 60 * 60 * 1000);

  const existing = await prisma.recapRun.findFirst({
    where: {
      status: 'SENT',
      sentAt: { gte: startOfDayIct, lt: endOfDayIct },
    },
    select: { id: true },
  });
  return !!existing;
}

/**
 * "YYYY-MM-DD" du jour civil d'une date en heure ICT.
 */
export function toIctDateStr(d: Date): string {
  return d.toLocaleString('sv-SE', { timeZone: RECAP_TZ }).slice(0, 10);
}

/**
 * Reciproque : convertit "YYYY-MM-DD" ICT en Date UTC (00:00 ICT).
 */
export function ictDateStrToDate(dateStr: string): Date {
  // 00:00 ICT (UTC+7) = 17:00 UTC la veille
  return new Date(`${dateStr}T00:00:00+07:00`);
}

/**
 * Vrai si `now` (en ICT) est un jour d'envoi : lundi (1) ou vendredi (5).
 */
export function isRecapDay(now: Date = new Date()): boolean {
  const wd = ictWeekday(now);
  return wd === 1 || wd === 5;
}

/**
 * Jour de la semaine en ICT : 0=Dim, 1=Lun, ..., 6=Sam.
 */
export function ictWeekday(d: Date): number {
  const local = new Date(d.toLocaleString('en-US', { timeZone: RECAP_TZ }));
  return local.getDay();
}
