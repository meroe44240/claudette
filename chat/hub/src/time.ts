// Time helpers in the team's time zone, and a small 5-field cron matcher ("0 11 * * 1-5").

export function localParts(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, dow, date: `${p.year}-${p.month}-${p.day}` };
}

/** The instant of a wall-clock time in a time zone. */
export function zonedTime(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = localParts(new Date(guess), tz);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  return new Date(guess - (asUtc - guess));
}

function field(spec: string, value: number, min: number, max: number): boolean {
  return spec.split(',').some((part) => {
    const [range, stepS] = part.split('/');
    const step = stepS ? Number(stepS) : 1;
    let lo = min, hi = max;
    if (range !== '*') {
      const [a, b] = range.split('-').map(Number);
      lo = a;
      hi = b ?? (stepS ? max : a);
    }
    return value >= lo && value <= hi && (value - lo) % step === 0;
  });
}

export function cronMatches(cron: string, p: { mi: number; h: number; d: number; mo: number; dow: number }): boolean {
  const [mi, h, d, mo, dow] = cron.trim().split(/\s+/);
  return field(mi, p.mi, 0, 59) && field(h, p.h, 0, 23) && field(d, p.d, 1, 31) && field(mo, p.mo, 1, 12)
    && (field(dow, p.dow, 0, 7) || (p.dow === 0 && field(dow, 7, 0, 7)));
}

/** First time today (in tz) the cron fires, or null. */
export function cronToday(cron: string, now: Date, tz: string): Date | null {
  const t = localParts(now, tz);
  for (let m = 0; m < 1440; m++) {
    const p = { mi: m % 60, h: Math.floor(m / 60), d: t.d, mo: t.mo, dow: t.dow };
    if (cronMatches(cron, p)) return zonedTime(t.y, t.mo, t.d, p.h, p.mi, tz);
  }
  return null;
}

/** "24h", "90m", "2d" → milliseconds. */
export function duration(s: string | undefined, fallbackMs: number): number {
  const m = String(s ?? '').match(/^(\d+(?:\.\d+)?)\s*([mhd])$/i);
  if (!m) return fallbackMs;
  return Number(m[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2].toLowerCase() as 'm' | 'h' | 'd'];
}
