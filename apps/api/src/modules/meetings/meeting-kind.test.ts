import { describe, it, expect } from 'vitest';
import { meetingKindOf, compteCommeRdvClient, dateComptage, hasInterlocuteurs } from './meeting-kind.js';

const CLIENT_ID = '3f0e7a52-1111-4222-8333-444455556666';
const start = '2026-10-02T14:00:00.000Z';

describe('meetingKindOf', () => {
  it('lit le type stocké', () => {
    expect(meetingKindOf({ entiteType: 'CANDIDAT', metadata: { calendarEventType: 'PRESENTATION' } })).toBe('PRESENTATION');
  });
  it("traite l'ancien AMBIGU comme à classer", () => {
    expect(meetingKindOf({ entiteType: 'CLIENT', metadata: { calendarEventType: 'AMBIGU' } })).toBe('A_CLASSER');
  });
  it("déduit de l'entité quand le type est absent", () => {
    expect(meetingKindOf({ entiteType: 'CLIENT', metadata: {} })).toBe('RDV_CLIENT');
    expect(meetingKindOf({ entiteType: 'CANDIDAT', metadata: {} })).toBe('INTERVIEW');
  });
});

describe('compteCommeRdvClient', () => {
  it('compte un RDV client daté avec un client lié', () => {
    expect(compteCommeRdvClient({ entiteType: 'CLIENT', entiteId: CLIENT_ID, metadata: { startTime: start } })).toBe(true);
  });
  it('ne compte pas sans date', () => {
    expect(compteCommeRdvClient({ entiteType: 'CLIENT', entiteId: CLIENT_ID, metadata: {} })).toBe(false);
  });
  it('ne compte pas sans interlocuteur', () => {
    expect(compteCommeRdvClient({ entiteType: 'CLIENT', entiteId: null, metadata: { startTime: start, calendarEventType: 'RDV_CLIENT' } })).toBe(false);
  });
  it('ne compte pas un événement à classer', () => {
    expect(compteCommeRdvClient({ entiteType: 'CLIENT', entiteId: CLIENT_ID, metadata: { startTime: start, calendarEventType: 'A_CLASSER' } })).toBe(false);
  });
  it('accepte des interlocuteurs saisis ou des invités externes', () => {
    expect(hasInterlocuteurs({ entiteType: 'CLIENT', entiteId: null, metadata: { interlocuteurs: 'Joost Tulkens' } })).toBe(true);
    expect(hasInterlocuteurs({ entiteType: 'CANDIDAT', metadata: { attendees: ['a@humanup.io', 'b@client.fr'] } })).toBe(true);
    expect(hasInterlocuteurs({ entiteType: 'CANDIDAT', metadata: { attendees: ['a@humanup.io'] } })).toBe(false);
  });
});

describe('dateComptage', () => {
  it('prend la date de validation quand le meeting a été classé après coup', () => {
    const createdAt = new Date('2026-09-28T08:00:00Z');
    expect(dateComptage({ createdAt, metadata: {} })).toEqual(createdAt);
    expect(dateComptage({ createdAt, metadata: { classification: { at: '2026-09-30T10:00:00Z' } } })).toEqual(new Date('2026-09-30T10:00:00Z'));
  });
});
