import { describe, it, expect } from 'vitest';
import { formatDateTime, formatTime, normalizeLang, normalizeTimeZone, promptLanguageLine, zoneLabel } from './locale.js';

const max = { lang: 'en' as const, timezone: 'Asia/Ho_Chi_Minh' };

describe('formatDateTime', () => {
  it('renders a UTC instant in Ho Chi Minh time with the zone', () => {
    expect(formatDateTime(new Date('2026-11-20T12:30:00Z'), max)).toBe('Fri 20 Nov, 19:30 (ICT)');
    expect(formatTime('2026-11-20T12:30:00Z', max)).toBe('19:30 (ICT)');
  });

  it('follows Paris daylight saving time', () => {
    expect(formatDateTime('2026-11-20T12:30:00Z', { lang: 'en', timezone: 'Europe/Paris' })).toBe('Fri 20 Nov, 13:30 (CET)');
    expect(formatDateTime('2026-07-20T12:30:00Z', { lang: 'en', timezone: 'Europe/Paris' })).toBe('Mon 20 Jul, 14:30 (CEST)');
  });

  it('writes French for a French member', () => {
    expect(formatDateTime('2026-11-20T12:30:00Z', { lang: 'fr', timezone: 'Europe/Paris' })).toMatch(/^ven\.? 20 nov\.?, 13:30 \(CET\)$/);
  });

  it('falls back to a GMT offset for zones without a known abbreviation', () => {
    expect(zoneLabel(new Date('2026-11-20T12:30:00Z'), 'Asia/Kathmandu')).toBe('GMT+5:45');
    expect(zoneLabel(new Date('2026-11-20T12:30:00Z'), 'America/Sao_Paulo')).toBe('GMT-3');
  });
});

describe('normalizers', () => {
  it('accepts only fr / en', () => {
    expect(normalizeLang('EN')).toBe('en');
    expect(normalizeLang('fr-FR')).toBe('fr');
    expect(normalizeLang('de')).toBeNull();
  });

  it('accepts only real IANA zones', () => {
    expect(normalizeTimeZone('Asia/Ho_Chi_Minh')).toBe('Asia/Ho_Chi_Minh');
    expect(normalizeTimeZone('Mars/Base')).toBeNull();
    expect(normalizeTimeZone('')).toBeNull();
  });
});

describe('promptLanguageLine', () => {
  it('names the target language', () => {
    expect(promptLanguageLine('en')).toContain('anglais');
    expect(promptLanguageLine('fr', 'le brief')).toContain('le brief en français');
  });
});
