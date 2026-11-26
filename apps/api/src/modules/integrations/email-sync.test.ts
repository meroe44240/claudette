import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/db.js', () => ({ default: {} }));

const { parseAddressList } = await import('./email-auto-create.service.js');
const { meetCodeOf } = await import('./calendar.service.js');
const { periodBounds } = await import('../stats/rdv-stats.service.js');

describe('parseAddressList', () => {
  it('lit noms, adresses seules et virgules dans les noms entre guillemets', () => {
    const list = parseAddressList('Jean Dupont <Jean.Dupont@Acme.fr>, "Martin, Paul" <paul@b.io>, solo@c.com');
    expect(list).toEqual([
      { name: 'Jean Dupont', email: 'jean.dupont@acme.fr' },
      { name: 'Martin, Paul', email: 'paul@b.io' },
      { name: null, email: 'solo@c.com' },
    ]);
  });

  it('renvoie une liste vide sans en-tête', () => {
    expect(parseAddressList(undefined)).toEqual([]);
  });
});

describe('meetCodeOf', () => {
  it('prend le code de conferenceData Google Meet', () => {
    expect(meetCodeOf({ conferenceData: { conferenceId: 'abc-defg-hij', conferenceSolution: { key: { type: 'hangoutsMeet' } } } })).toBe('abc-defg-hij');
  });
  it('retombe sur le lien hangoutLink', () => {
    expect(meetCodeOf({ hangoutLink: 'https://meet.google.com/xyz-abcd-efg' })).toBe('xyz-abcd-efg');
  });
  it('trouve un lien Meet collé dans le lieu ou la description', () => {
    expect(meetCodeOf({ location: 'https://meet.google.com/kla-mnop-qrs' })).toBe('kla-mnop-qrs');
    expect(meetCodeOf({ description: 'Rejoindre : https://meet.google.com/aaa-bbbb-ccc ...' })).toBe('aaa-bbbb-ccc');
  });
  it('ignore les visios qui ne sont pas Google Meet', () => {
    expect(meetCodeOf({ conferenceData: { conferenceSolution: { key: { type: 'addOn' } }, entryPoints: [{ entryPointType: 'video', uri: 'https://zoom.us/j/1' }] } })).toBeNull();
  });
});

describe('periodBounds (heure de Paris)', () => {
  it('semaine du lundi 0 h au lundi suivant', () => {
    const { start, end } = periodBounds('week', new Date('2026-11-26T10:00:00Z')); // jeudi
    expect(start.toISOString()).toBe('2026-11-22T23:00:00.000Z'); // lundi 23/11 0 h Paris
    expect(end.toISOString()).toBe('2026-11-29T23:00:00.000Z');
  });
  it('mois et trimestre', () => {
    const now = new Date('2026-11-26T10:00:00Z');
    expect(periodBounds('month', now).start.toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(periodBounds('quarter', now).start.toISOString()).toBe('2026-09-30T22:00:00.000Z');
    expect(periodBounds('quarter', now).end.toISOString()).toBe('2026-12-31T23:00:00.000Z');
  });
});
