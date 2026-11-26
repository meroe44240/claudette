import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls = vi.fn();
vi.mock('../../lib/db.js', () => ({
  default: {
    candidat: { findMany: async (q: any) => (q.where.email ? [] : [{ telephone: '+33 6 12 34 56 78' }]) },
    client: { findMany: async () => [] },
    activite: { findMany: (...a: unknown[]) => calls(...a) },
  },
}));

const { alloCallFor } = await import('./meet-attendance.service.js');

const start = new Date('2026-11-25T14:00:00Z');
const end = new Date('2026-11-25T14:30:00Z');
const rdv = { userId: 'u1', entiteType: 'CANDIDAT', entiteId: 'c1', metadata: { attendees: [] } };

describe('alloCallFor (RDV confirmé par un appel Allo)', () => {
  beforeEach(() => calls.mockReset());

  it('appel de 5 min ou plus sur la fiche du contact : effectué', async () => {
    calls.mockResolvedValue([{ entiteId: 'c1', metadata: { duration: 640 }, createdAt: new Date('2026-11-25T14:02:00Z') }]);
    expect(await alloCallFor(rdv, start, end)).toMatchObject({ minutes: 11 });
  });

  it('appel non rattaché mais vers le numéro du contact : effectué', async () => {
    calls.mockResolvedValue([{ entiteId: null, metadata: { duration: 400, to: '0612345678' }, createdAt: start }]);
    expect(await alloCallFor(rdv, start, end)).not.toBeNull();
  });

  it('appel trop court ou avec quelqu’un d’autre : pas de confirmation', async () => {
    calls.mockResolvedValue([
      { entiteId: 'c1', metadata: { duration: 90 }, createdAt: start },
      { entiteId: 'autre', metadata: { duration: 900, to: '0699999999' }, createdAt: start },
    ]);
    expect(await alloCallFor(rdv, start, end)).toBeNull();
  });

  it('cherche les appels de 20 min avant le début à 30 min après la fin', async () => {
    calls.mockResolvedValue([]);
    await alloCallFor(rdv, start, end);
    const where = calls.mock.calls[0][0].where;
    expect(where.createdAt.gte.toISOString()).toBe('2026-11-25T13:40:00.000Z');
    expect(where.createdAt.lte.toISOString()).toBe('2026-11-25T15:00:00.000Z');
  });

  it('RDV sans fiche mais avec le numéro du formulaire : appel vers ce numéro = effectué', async () => {
    calls.mockResolvedValue([{ entiteId: null, metadata: { duration: 420, to: '+33631453807' }, createdAt: start }]);
    const r = await alloCallFor({ userId: 'u1', entiteType: 'CANDIDAT', entiteId: '00000000-0000-0000-0000-000000000000', metadata: { phones: ['631453807'], attendees: [] } }, start, end);
    expect(r).not.toBeNull();
  });

  it('RDV sans contact identifié : rien à chercher', async () => {
    expect(await alloCallFor({ userId: 'u1', entiteType: 'CANDIDAT', entiteId: '00000000-0000-0000-0000-000000000000', metadata: {} }, start, end)).toBeNull();
    expect(calls).not.toHaveBeenCalled();
  });
});
