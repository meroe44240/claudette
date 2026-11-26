import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
vi.mock('../../lib/db.js', () => ({ default: { mandat: { findMany: (...a: unknown[]) => findMany(...a) } } }));

const { entrepriseSousContrat, nameFromAddress, AiBudget, AiBudgetExhausted } = await import('./contact-resolver.service.js');

describe('entrepriseSousContrat (client si contrat, sinon Lead)', () => {
  beforeEach(() => findMany.mockReset());

  it('contrat signé : client', async () => {
    findMany.mockResolvedValue([{ statut: 'PERDU', contractStatus: 'SIGNED', etapeCycle: null }]);
    expect(await entrepriseSousContrat('e')).toBe(true);
  });
  it('mandat en cours hors prospection : client', async () => {
    findMany.mockResolvedValue([{ statut: 'EN_COURS', contractStatus: 'DRAFT', etapeCycle: 'Sourcing' }]);
    expect(await entrepriseSousContrat('e')).toBe(true);
  });
  it('mandat encore en prospection ou premier rendez-vous : Lead', async () => {
    findMany.mockResolvedValue([
      { statut: 'OUVERT', contractStatus: 'DRAFT', etapeCycle: 'Prospection' },
      { statut: 'OUVERT', contractStatus: 'SENT', etapeCycle: '1er rendez-vous' },
    ]);
    expect(await entrepriseSousContrat('e')).toBe(false);
  });
  it('seulement des mandats perdus ou annulés : Lead', async () => {
    findMany.mockResolvedValue([{ statut: 'ANNULE', contractStatus: 'DRAFT', etapeCycle: null }]);
    expect(await entrepriseSousContrat('e')).toBe(false);
  });
});

describe('nameFromAddress', () => {
  it('prénom et nom du nom affiché', () => {
    expect(nameFromAddress({ name: 'Jean Dupont', email: 'x@y.fr' })).toEqual({ prenom: 'Jean', nom: 'Dupont' });
  });
  it('à défaut, depuis prenom.nom de l\'adresse', () => {
    expect(nameFromAddress({ name: null, email: 'marie.durand@acme.fr' })).toEqual({ prenom: 'Marie', nom: 'Durand' });
  });
});

describe('AiBudget', () => {
  it('s\'arrête au plafond', () => {
    const b = new AiBudget(1, true);
    b.take();
    expect(() => b.take()).toThrow(AiBudgetExhausted);
  });
});
