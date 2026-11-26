import { describe, it, expect } from 'vitest';
import {
  candidateProba, computeMandatDeals, computeFee, estimateBillingMonth, cashSchedule,
  paymentDelay, recaps, totals, toEur, monthKey, DEFAULT_SETTINGS,
  type MandatInput, type CandidatureInput,
} from './forecast.engine.js';

const TODAY = new Date('2026-11-24T10:00:00Z');
const FX = { USD: 0.92, GBP: 1.17, CAD: 0.66 };

function cand(over: Partial<CandidatureInput> = {}): CandidatureInput {
  return {
    id: over.id ?? 'c1', candidatNom: over.candidatNom ?? 'Alice', stage: 'ENTRETIEN_CLIENT',
    processEtape: null, dateProchainEntretien: null, retourAttenteDepuis: null,
    packageFixe: null, packageVariable: null, salaireCandidat: null, dateDemarrage: null,
    probaOverride: null, feeOverrideEur: null, moisFacturationOverride: null, ...over,
  };
}

function mandat(over: Partial<MandatInput> = {}): MandatInput {
  return {
    id: 'm1', titrePoste: 'Head of Finance', entrepriseNom: 'DHTS', nbPostes: 1,
    feeType: 'POURCENTAGE_PACKAGE', feePourcentage: 20, feeMontantFixe: null, feeMontantEstime: null,
    devise: 'EUR', salaireMin: 90000, salaireMax: 110000, sourceDeal: null, paraformNbVersements: 1,
    splitSalesPct: 50, processEtapes: ['HR screen', 'Technical', 'PM', 'Team', 'Final panel'],
    paymentTerms: null, delaiPaiementClientJours: 30,
    sales: { id: 'u-max', nom: 'Max' }, recruteur: { id: 'u-lea', nom: 'Léa' },
    candidatures: [], ...over,
  };
}

describe('candidateProba — interpolation', () => {
  it('follows the default scale', () => {
    expect(candidateProba('ENVOYE_CLIENT', null, 5)).toBe(10);
    expect(candidateProba('OFFRE', null, 5)).toBe(85);
    expect(candidateProba('PLACE', null, 5)).toBe(100);
    expect(candidateProba('REFUSE', 3, 5)).toBe(0);
    expect(candidateProba('SOURCING', null, 5)).toBe(0);
  });
  it('interpolates linearly from 15 % (first step) to 60 % (last step)', () => {
    expect(candidateProba('ENTRETIEN_CLIENT', 1, 5)).toBe(15);
    expect(candidateProba('PROCESS', 2, 5)).toBe(26.25);
    expect(candidateProba('PROCESS', 3, 5)).toBe(37.5);
    expect(candidateProba('PROCESS', 5, 5)).toBe(60);
    expect(candidateProba('PROCESS', 2, 3)).toBe(37.5);
  });
  it('clamps the step and handles single-step and missing processes', () => {
    expect(candidateProba('PROCESS', 9, 5)).toBe(60);
    expect(candidateProba('PROCESS', null, 5)).toBe(15);
    expect(candidateProba('ENTRETIEN_CLIENT', 1, 1)).toBe(60);
    expect(candidateProba('ENTRETIEN_CLIENT', null, 0)).toBe(15);
  });
  it('uses the admin settings', () => {
    const s = { ...DEFAULT_SETTINGS, probaPremiereEtape: 20, probaDerniereEtape: 70 };
    expect(candidateProba('PROCESS', 3, 5, s)).toBe(45);
  });
});

describe('computeMandatDeals — grouping by position and caps', () => {
  it('lists a position with no active candidate as « Sans candidat » at 0', () => {
    const [d] = computeMandatDeals(mandat(), FX, TODAY);
    expect(d.step_label).toBe('Sans candidat');
    expect(d.proba).toBe(0);
    expect(d.weighted_eur).toBe(0);
    expect(d.fee_eur).toBe(20000); // 20 % × milieu 100 k
  });

  it('distinguishes positions with only internal candidates', () => {
    const [d] = computeMandatDeals(mandat({ candidatures: [cand({ stage: 'CONTACTE' })] }), FX, TODAY);
    expect(d.step_label).toBe('Pas encore présenté');
    expect(d.proba).toBe(0);
  });

  it('takes the most advanced candidate plus 10 % of each other client-side candidate', () => {
    const deals = computeMandatDeals(mandat({
      candidatures: [
        cand({ id: 'a', stage: 'PROCESS', processEtape: 3 }),        // 37.5
        cand({ id: 'b', stage: 'ENTRETIEN_CLIENT', processEtape: 1 }), // 15
        cand({ id: 'c', stage: 'ENVOYE_CLIENT' }),                    // 10
        cand({ id: 'd', stage: 'SOURCING' }),                         // ignoré (pas côté client)
      ],
    }), FX, TODAY);
    expect(deals).toHaveLength(1);
    expect(deals[0].lead_candidature_id).toBe('a');
    expect(deals[0].proba).toBe(40); // 37.5 + 1.5 + 1
    expect(deals[0].other_candidates).toBe(2);
    expect(deals[0].step_label).toBe('PM (3/5)');
  });

  it('caps at the Offer proba unless the lead is really in Offer', () => {
    const many = Array.from({ length: 10 }, (_, i) => cand({ id: `x${i}`, stage: 'PROCESS', processEtape: 5 }));
    const [capped] = computeMandatDeals(mandat({ candidatures: many }), FX, TODAY);
    expect(capped.proba).toBe(85); // 60 + 9 × 6 = 114 → 85

    const [offer] = computeMandatDeals(mandat({ candidatures: [cand({ id: 'o', stage: 'OFFRE' }), ...many] }), FX, TODAY);
    expect(offer.proba).toBe(100); // 85 + bonus, plafonné à 100
  });

  it('splits several positions by order of progress and gives the bonus to the least covered one', () => {
    const deals = computeMandatDeals(mandat({
      nbPostes: 2,
      candidatures: [
        cand({ id: 'a', stage: 'PROCESS', processEtape: 5 }),         // 60 → poste 1
        cand({ id: 'b', stage: 'ENTRETIEN_CLIENT', processEtape: 1 }), // 15 → poste 2
        cand({ id: 'c', stage: 'ENVOYE_CLIENT' }),                    // 10 → bonus au poste 2
      ],
    }), FX, TODAY);
    expect(deals.map((d) => d.lead_candidature_id)).toEqual(['a', 'b']);
    expect(deals[0].proba).toBe(60);
    expect(deals[1].proba).toBe(16);
    const t = totals(deals);
    expect(t.expected_placements).toBe(0.76);
    expect(t.positions).toBe(2);
  });

  it('never weights more positions than openings', () => {
    const deals = computeMandatDeals(mandat({
      nbPostes: 3,
      candidatures: [cand({ id: 'a', stage: 'OFFRE' }), cand({ id: 'b', stage: 'OFFRE' }), cand({ id: 'c', stage: 'OFFRE' }), cand({ id: 'd', stage: 'OFFRE' })],
    }), FX, TODAY);
    expect(deals).toHaveLength(3);
    expect(totals(deals).expected_placements).toBeLessThanOrEqual(3);
  });

  it('drops positions already filled', () => {
    const deals = computeMandatDeals(mandat({
      nbPostes: 2,
      candidatures: [cand({ id: 'p', stage: 'PLACE' }), cand({ id: 'a', stage: 'ENVOYE_CLIENT' })],
    }), FX, TODAY);
    expect(deals).toHaveLength(1);
    expect(deals[0].lead_candidature_id).toBe('a');
    expect(computeMandatDeals(mandat({ candidatures: [cand({ stage: 'PLACE' })] }), FX, TODAY)).toEqual([]);
  });

  it('uses the override and flags it, keeping the computed value', () => {
    const [d] = computeMandatDeals(mandat({
      candidatures: [cand({ stage: 'PROCESS', processEtape: 3, probaOverride: 50 })],
    }), FX, TODAY);
    expect(d.proba).toBe(50);
    expect(d.proba_computed).toBe(37.5);
    expect(d.proba_overridden).toBe(true);
    expect(totals([d]).forced_probas_rate).toBe(100);
  });

  it('uses the fixed no-process proba and flags « process à saisir »', () => {
    const [d] = computeMandatDeals(mandat({ processEtapes: [], candidatures: [cand({ stage: 'ENTRETIEN_CLIENT' })] }), FX, TODAY);
    expect(d.proba).toBe(15);
    expect(d.process_missing).toBe(true);
  });
});

describe('computeFee — fee types and currencies', () => {
  it('converts with the rate of the currency', () => {
    expect(toEur(100, 'USD', FX)).toBeCloseTo(92);
    expect(toEur(100, 'eur', FX)).toBe(100);
    expect(() => toEur(100, 'SAR', FX)).toThrow(/SAR/);
  });
  it('applies the % to the package, then the salary, then the middle of the range', () => {
    const m = mandat({ devise: 'USD' });
    expect(computeFee(m, cand({ packageFixe: 150000, packageVariable: 50000 }), FX)).toEqual({ feeEur: 36800, base: 'candidate_package' });
    expect(computeFee(m, cand({ salaireCandidat: 120000 }), FX)).toEqual({ feeEur: 22080, base: 'candidate_salary' });
    expect(computeFee(m, null, FX)).toEqual({ feeEur: 18400, base: 'salary_range_mid' });
  });
  it('uses only the fixed part for « % du fixe »', () => {
    const m = mandat({ feeType: 'POURCENTAGE_FIXE' });
    expect(computeFee(m, cand({ packageFixe: 100000, packageVariable: 40000 }), FX).feeEur).toBe(20000);
  });
  it('handles fixed amounts, overrides and estimates', () => {
    expect(computeFee(mandat({ feeType: 'MONTANT_FIXE', feeMontantFixe: 10000, devise: 'GBP' }), null, FX).feeEur).toBe(11700);
    expect(computeFee(mandat(), cand({ feeOverrideEur: 29000 }), FX)).toEqual({ feeEur: 29000, base: 'override' });
    expect(computeFee(mandat({ salaireMin: null, salaireMax: null, feeMontantEstime: 14000 }), null, FX).base).toBe('mandate_estimate');
  });
});

describe('billing and cash months', () => {
  it('estimates the billing month from the stage', () => {
    const k = (c: CandidatureInput | null, n = 5) => monthKey(estimateBillingMonth(c, n, TODAY));
    expect(k(cand({ stage: 'OFFRE' }))).toBe('2026-11');
    expect(k(cand({ stage: 'PROCESS', processEtape: 5 }))).toBe('2026-12');
    expect(k(cand({ stage: 'PROCESS', processEtape: 3 }))).toBe('2026-12');
    expect(k(cand({ stage: 'ENTRETIEN_CLIENT', processEtape: 1 }))).toBe('2027-01');
    expect(k(cand({ stage: 'ENVOYE_CLIENT' }))).toBe('2027-01');
    expect(k(cand({ stage: 'PROCESS', moisFacturationOverride: new Date('2027-03-15') }))).toBe('2027-03');
  });
  it('reads payment terms with the mandate first, then the client default', () => {
    expect(paymentDelay('45j_fdm', 30)).toEqual({ days: 45, endOfMonth: true });
    expect(paymentDelay('reception', 30)).toEqual({ days: 0, endOfMonth: false });
    expect(paymentDelay(null, 60)).toEqual({ days: 60, endOfMonth: false });
  });
  it('schedules cash after the payment delay', () => {
    const m = mandat();
    expect(cashSchedule(m, 10000, new Date(Date.UTC(2026, 11, 1)), null)).toEqual([{ month: '2027-01', amountEur: 10000 }]);
    expect(cashSchedule({ ...m, paymentTerms: 'reception' }, 10000, new Date(Date.UTC(2026, 11, 1)), null)[0].month).toBe('2026-12');
  });
  it('splits Paraform deals into equal installments from 30 days after the start date', () => {
    const m = mandat({ sourceDeal: 'PARAFORM', paraformNbVersements: 3 });
    expect(cashSchedule(m, 30000, new Date(Date.UTC(2026, 11, 1)), new Date('2027-01-05'))).toEqual([
      { month: '2027-02', amountEur: 10000 },
      { month: '2027-03', amountEur: 10000 },
      { month: '2027-04', amountEur: 10000 },
    ]);
  });
});

describe('recaps — recruiter/sales split', () => {
  const deal = (sales: string, rec: string, split: number) => computeMandatDeals(mandat({
    splitSalesPct: split,
    sales: { id: sales, nom: sales }, recruteur: { id: rec, nom: rec },
    candidatures: [cand({ stage: 'PROCESS', processEtape: 5, feeOverrideEur: 10000 })],
  }), FX, TODAY)[0];

  it('applies the split in both views and keeps the total', () => {
    const r = recaps([deal('Max', 'Léa', 50), deal('Max', 'Vicky', 70)]);
    expect(r.by_sales).toEqual([{ person_id: 'Max', person: 'Max', fee_eur: 12000, weighted_eur: 7200, expected_placements: 0.72 }]);
    expect(r.by_recruiter.find((x) => x.person === 'Léa')?.fee_eur).toBe(5000);
    expect(r.by_recruiter.find((x) => x.person === 'Vicky')?.fee_eur).toBe(3000);
    const sum = (rows: { fee_eur: number }[]) => rows.reduce((a, x) => a + x.fee_eur, 0);
    expect(sum(r.by_sales) + sum(r.by_recruiter)).toBe(20000);
    expect(sum(r.by_person)).toBe(20000);
  });
  it('gives 100 % to a person holding both roles in the combined view', () => {
    const r = recaps([deal('Méroë', 'Méroë', 50)]);
    expect(r.by_person).toEqual([{ person_id: 'Méroë', person: 'Méroë', fee_eur: 10000, weighted_eur: 6000, expected_placements: 0.6 }]);
  });
});
