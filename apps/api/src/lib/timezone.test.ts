import { describe, it, expect } from 'vitest';
import { validTimeZone, zonedDate, zonedToUtc } from './timezone.js';

const iso = (ms: number) => new Date(ms).toISOString();

describe('timezone utilities', () => {
  it('converts a Saigon wall time to UTC (UTC+7, no DST)', () => {
    expect(iso(zonedToUtc(2026, 10, 5, 14, 0, 'Asia/Ho_Chi_Minh'))).toBe('2026-10-05T07:00:00.000Z');
    expect(iso(zonedToUtc(2026, 1, 12, 9, 30, 'Asia/Ho_Chi_Minh'))).toBe('2026-01-12T02:30:00.000Z');
  });

  it('follows Paris daylight saving time', () => {
    expect(iso(zonedToUtc(2026, 10, 23, 9, 0, 'Europe/Paris'))).toBe('2026-10-23T07:00:00.000Z'); // CEST
    expect(iso(zonedToUtc(2026, 10, 26, 9, 0, 'Europe/Paris'))).toBe('2026-10-26T08:00:00.000Z'); // CET
    expect(iso(zonedToUtc(2026, 3, 29, 9, 0, 'Europe/Paris'))).toBe('2026-03-29T07:00:00.000Z'); // jour du passage à l'heure d'été
    expect(iso(zonedToUtc(2026, 10, 25, 9, 0, 'Europe/Paris'))).toBe('2026-10-25T08:00:00.000Z'); // jour du retour à l'heure d'hiver
  });

  it('gives the calendar date of an instant in a time zone', () => {
    const t = Date.UTC(2026, 9, 4, 18, 30); // 01:30 le 5 à Saigon, 20:30 le 4 à Paris
    expect(zonedDate(t, 'Asia/Ho_Chi_Minh')).toEqual({ y: 2026, m: 10, d: 5 });
    expect(zonedDate(t, 'Europe/Paris')).toEqual({ y: 2026, m: 10, d: 4 });
  });

  it('falls back to Europe/Paris on an unknown time zone', () => {
    expect(validTimeZone('Asia/Ho_Chi_Minh')).toBe('Asia/Ho_Chi_Minh');
    expect(validTimeZone('Nowhere/Land')).toBe('Europe/Paris');
    expect(validTimeZone(undefined)).toBe('Europe/Paris');
  });
});
