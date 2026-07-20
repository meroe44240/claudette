/**
 * Tests des helpers window + logique cron ICT.
 */

import { PrismaClient } from '@prisma/client';
import {
  alreadySentToday,
  getDefaultWindow,
  ictDateStrToDate,
  ictWeekday,
  isRecapDay,
  toIctDateStr,
} from '../src/modules/recap/recap.window.js';

const prisma = new PrismaClient();

const errs: string[] = [];
const check = (name: string, cond: boolean, detail?: string) => {
  console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? ` (${detail})` : ''}`);
  if (!cond) errs.push(name);
};

async function main() {
  console.log('─── ICT weekday / date str ───');
  // 2026-07-20 = lundi
  const mondayNoon = new Date('2026-07-20T05:00:00Z'); // 12:00 ICT
  check('20/07/2026 12:00 ICT est un lundi', ictWeekday(mondayNoon) === 1);
  check('isRecapDay(lundi) = true', isRecapDay(mondayNoon));

  const fridayMorning = new Date('2026-07-24T02:00:00Z'); // 09:00 ICT
  check('24/07/2026 09:00 ICT est un vendredi', ictWeekday(fridayMorning) === 5);
  check('isRecapDay(vendredi) = true', isRecapDay(fridayMorning));

  const sundayMorning = new Date('2026-07-19T02:00:00Z'); // 09:00 ICT
  check('19/07/2026 est un dimanche', ictWeekday(sundayMorning) === 0);
  check('isRecapDay(dimanche) = false', !isRecapDay(sundayMorning));

  // Passage de jour : minuit UTC (=07:00 ICT) le 20 = deja le lundi 20 en ICT
  const midnightUtc = new Date('2026-07-20T00:00:00Z');
  check('toIctDateStr(00:00 UTC le 20) = 20/07', toIctDateStr(midnightUtc) === '2026-07-20', toIctDateStr(midnightUtc));

  // 23:00 UTC le 19 = 06:00 ICT le 20
  const before8Ict = new Date('2026-07-19T23:00:00Z');
  check('toIctDateStr(23:00 UTC le 19) = 20/07', toIctDateStr(before8Ict) === '2026-07-20', toIctDateStr(before8Ict));

  // Reciproque
  const back = ictDateStrToDate('2026-07-20');
  check('ictDateStrToDate("2026-07-20") = 17:00 UTC 19', back.toISOString() === '2026-07-19T17:00:00.000Z', back.toISOString());

  console.log('\n─── DB : idempotence + getDefaultWindow ───');
  await prisma.recapRun.deleteMany();

  const noRun = await alreadySentToday();
  check('alreadySentToday() sans run = false', !noRun);

  const win1 = await getDefaultWindow();
  const now = Date.now();
  const drift = Math.abs(win1.end.getTime() - now);
  check('getDefaultWindow.end ~= now', drift < 5000, `${drift}ms`);
  const days = (win1.end.getTime() - win1.start.getTime()) / (1000 * 60 * 60 * 24);
  check('getDefaultWindow fallback = 7j', Math.abs(days - 7) < 0.01, `${days}j`);

  // Simuler un envoi
  await prisma.recapRun.create({
    data: {
      sentAt: new Date(),
      windowStart: new Date(now - 3 * 24 * 3600 * 1000),
      windowEnd: new Date(now),
      status: 'SENT',
    },
  });

  const yesRun = await alreadySentToday();
  check('alreadySentToday() apres un SENT du jour = true', yesRun);

  const win2 = await getDefaultWindow();
  const daysWin2 = (win2.end.getTime() - win2.start.getTime()) / (1000 * 60 * 60 * 24);
  check('getDefaultWindow apres SENT = fenetre <7j', daysWin2 < 1, `${daysWin2}j`);

  // Un SENT vieux de 2 jours -> alreadySentToday = false, window = 2j
  await prisma.recapRun.deleteMany();
  await prisma.recapRun.create({
    data: {
      sentAt: new Date(now - 2 * 24 * 3600 * 1000),
      windowStart: new Date(now - 5 * 24 * 3600 * 1000),
      windowEnd: new Date(now - 2 * 24 * 3600 * 1000),
      status: 'SENT',
    },
  });
  const noRun2 = await alreadySentToday();
  check('alreadySentToday() avec SENT vieux de 2j = false', !noRun2);
  const win3 = await getDefaultWindow();
  const daysWin3 = (win3.end.getTime() - win3.start.getTime()) / (1000 * 60 * 60 * 24);
  check('getDefaultWindow depuis SENT-2j = ~2j', Math.abs(daysWin3 - 2) < 0.1, `${daysWin3.toFixed(2)}j`);

  // Un FAILED n'est pas considere comme "sent"
  await prisma.recapRun.deleteMany();
  await prisma.recapRun.create({
    data: {
      sentAt: new Date(),
      windowStart: new Date(now - 7 * 24 * 3600 * 1000),
      windowEnd: new Date(),
      status: 'FAILED',
      error: 'test',
    },
  });
  const noRun3 = await alreadySentToday();
  check('alreadySentToday() avec FAILED du jour = false', !noRun3);

  await prisma.recapRun.deleteMany();

  console.log('\n─── RESULT ───');
  if (errs.length === 0) console.log('  ✅ All window/cron checks pass');
  else {
    console.log(`  ❌ ${errs.length} failure(s)`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
