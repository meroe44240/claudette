import { describe, expect, it } from 'vitest';
import { extractMeetingLink, meetingKey } from './notes.detect.js';
import { startOfLocalDay } from './notes.scheduler.js';
import { mdToHtml } from './notes.emails.js';

describe('extractMeetingLink', () => {
  it('lit le lien Meet de hangoutLink', () => {
    expect(extractMeetingLink({ hangoutLink: 'https://meet.google.com/abc-defg-hij' })).toEqual({ url: 'https://meet.google.com/abc-defg-hij', platform: 'MEET' });
  });

  it('trouve un lien Teams dans la description HTML d’une invitation client', () => {
    const description = 'Réunion Microsoft Teams<br><a href="https://teams.microsoft.com/l/meetup-join/19%3ameeting_ABC%40thread.v2/0?context=%7b%22Tid%22%3a%22x%22%7d&amp;btype=a">Rejoindre</a>';
    const link = extractMeetingLink({ description });
    expect(link?.platform).toBe('TEAMS');
    expect(link?.url).toContain('https://teams.microsoft.com/l/meetup-join/19%3ameeting_ABC%40thread.v2/0');
    expect(link?.url).not.toContain('&amp;');
  });

  it('préfère Teams quand l’invitation Google contient aussi un Meet ajouté par défaut', () => {
    const link = extractMeetingLink({ hangoutLink: 'https://meet.google.com/abc-defg-hij', location: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_X%40thread.v2/0' });
    expect(link?.platform).toBe('TEAMS');
  });

  it('renvoie null sans visio', () => {
    expect(extractMeetingLink({ location: 'Bureau, 12 rue de Paris' })).toBeNull();
  });
});

describe('meetingKey', () => {
  it('donne la même clé pour deux membres invités au même call', () => {
    const start = new Date('2026-11-17T09:00:00Z');
    const a = meetingKey({ url: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_X%40thread.v2/0?context=a', platform: 'TEAMS' }, start);
    const b = meetingKey({ url: 'https://teams.microsoft.com/l/meetup-join/19%3Ameeting_X%40thread.v2/0?context=b', platform: 'TEAMS' }, start);
    expect(a).toBe(b);
  });

  it('distingue deux occurrences du même lien à des heures différentes', () => {
    const link = { url: 'https://meet.google.com/abc-defg-hij', platform: 'MEET' as const };
    expect(meetingKey(link, new Date('2026-11-17T09:00:00Z'))).not.toBe(meetingKey(link, new Date('2026-11-18T09:00:00Z')));
  });
});

describe('startOfLocalDay', () => {
  it('Paris en hiver (UTC+1)', () => {
    expect(startOfLocalDay('2026-11-16', 'Europe/Paris').toISOString()).toBe('2026-11-15T23:00:00.000Z');
  });
  it('Hô Chi Minh (UTC+7)', () => {
    expect(startOfLocalDay('2026-11-16', 'Asia/Ho_Chi_Minh').toISOString()).toBe('2026-11-15T17:00:00.000Z');
  });
  it('Paris en été (UTC+2)', () => {
    expect(startOfLocalDay('2026-07-01', 'Europe/Paris').toISOString()).toBe('2026-06-30T22:00:00.000Z');
  });
});

describe('mdToHtml', () => {
  it('rend titres, puces et gras en échappant le HTML', () => {
    const html = mdToHtml('# Titre\n## Résumé\n- **Salaire** 55 k€ <script>');
    expect(html).not.toContain('Titre');
    expect(html).toContain('<h3');
    expect(html).toContain('<strong>Salaire</strong>');
    expect(html).toContain('&lt;script&gt;');
  });
});
