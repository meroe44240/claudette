// ── Heure locale d'un fuseau <-> instant UTC (sans dépendance) ──
export function validTimeZone(tz: unknown): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: String(tz) });
    return String(tz);
  } catch {
    return 'Europe/Paris';
  }
}
function zonedParts(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const p: Record<string, number> = {};
  for (const x of parts) if (x.type !== 'literal') p[x.type] = Number(x.value);
  return p;
}
/** Date calendaire (année, mois 1-12, jour) d'un instant dans un fuseau. */
export function zonedDate(utcMs: number, timeZone: string): { y: number; m: number; d: number } {
  const p = zonedParts(utcMs, timeZone);
  return { y: p.year, m: p.month, d: p.day };
}
/** Instant UTC (ms) correspondant à une heure murale dans un fuseau. */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, timeZone: string): number {
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (utcMs: number) => {
    const p = zonedParts(utcMs, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
  };
  // Deux passes : la seconde corrige le décalage autour d'un changement d'heure.
  const first = wall - offsetAt(wall);
  return wall - offsetAt(first);
}
