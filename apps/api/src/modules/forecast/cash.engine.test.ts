import { describe, it, expect } from 'vitest';
import {
  scenarios, monthlyTable, billedYearToDate, receivables, invoiceExpectedCash, daysLate, defaultEntity, balanceOf,
  type CashInputs, type InvoiceInput,
} from './cash.engine.js';
import type { DealLine } from './forecast.engine.js';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

function inv(p: Partial<InvoiceInput> & { id: string; amountEur: number }): InvoiceInput {
  return {
    number: null, label: p.id, status: 'EMISE', paidEur: 0, plannedBillingMonth: null, issuedAt: null, dueAt: null,
    paidAt: null, plannedCashMonth: null, atRisk: false, paymentDelayDays: 30, ...p,
  };
}

function deal(p: Partial<DealLine> & { deal_id: string }): DealLine {
  return {
    mandate_id: 'm', mandate_title: 'Poste', company: p.deal_id, position_index: 1, positions_total: 1,
    lead_candidature_id: null, lead_candidate: null, step_label: '', next_interview_at: null, waiting_since: null,
    other_candidates: 0, proba_computed: 0, proba: 0, proba_overridden: false, fee_eur: 0, fee_base: 'unknown',
    fee_overridden: false, weighted_eur: 0, expected_placements: 0, billing_month: '2026-12', billing_month_overridden: false,
    cash: [], source: null, sales: null, recruiter: null, split_sales_pct: 50, process_missing: false,
    ...p,
  } as DealLine;
}

/** Onglet Trésorerie du Sheet au 25/11/2026. */
function sheet(): CashInputs {
  return {
    today: d('2026-11-25'),
    accounts: [
      { id: 'hk', name: 'HK', balanceEur: 60000, balanceDate: d('2026-11-20'), active: true },
      { id: 'ldn', name: 'Londres', balanceEur: 70000, balanceDate: d('2026-11-20'), active: true },
      { id: 'ca', name: 'Canada', balanceEur: 5000, balanceDate: d('2026-11-20'), active: true },
    ],
    invoices: [
      inv({ id: 'cooper', label: 'Cooper', number: 'INV-021', amountEur: 36800, issuedAt: d('2026-09-22') }),
      inv({ id: 'cns', label: 'CNS Communication', number: 'INV-025', amountEur: 19360, issuedAt: d('2026-11-20'), dueAt: d('2026-11-27') }),
      inv({ id: 'chabe', label: 'Chabe', amountEur: 14608, issuedAt: d('2026-11-10'), dueAt: d('2026-11-30'), atRisk: true }),
      inv({ id: 'reglab', label: 'Reg Lab', status: 'A_FACTURER', amountEur: 14000, plannedBillingMonth: d('2026-11-01'), plannedCashMonth: d('2026-12-01') }),
    ],
    recurring: [
      { id: 'ag', label: 'Mission Alexandre Garnier', monthlyEur: 6000, start: d('2026-06-01'), end: d('2027-01-01') },
      { id: 'int', label: 'Intérim', monthlyEur: 3700, start: d('2026-09-01'), end: d('2027-01-01') },
    ],
    expenses: [
      { id: 'team', label: 'Équipe', category: 'contractors', monthlyEur: 9600, start: d('2026-01-01'), end: null },
      { id: 'tools', label: 'Outils', category: 'outils', monthlyEur: 2500, start: d('2026-01-01'), end: null },
      { id: 'office', label: 'Bureau', category: 'bureau', monthlyEur: 700, start: d('2026-01-01'), end: null },
    ],
    ownerDraws: [{ id: 'p', label: 'Maison, Airbnb, vêtements', amountEur: 5500, month: d('2026-12-01') }],
    deals: [
      deal({ deal_id: 'dhts', company: 'DHTS', fee_eur: 40000, weighted_eur: 100000, billing_month: '2026-12', cash: [{ month: '2027-01', amountEur: 40000 }] }),
      deal({ deal_id: 'senef', company: 'Senef', fee_eur: 20000, weighted_eur: 65790, billing_month: '2026-12', cash: [{ month: '2026-12', amountEur: 20000 }] }),
    ],
    annualBilledTarget: 600000,
  };
}

describe('cash scenarios (Sheet reconciliation)', () => {
  it('normal end of December = 220 868 € like the Sheet', () => {
    const s = scenarios(sheet(), { targetMonth: d('2026-12-01') });
    expect(s.find((x) => x.key === 'normal')!.cash_eur).toBe(220868);
  });

  it('Cooper paying late only changes cash: 184 068 €', () => {
    const s = scenarios(sheet(), { targetMonth: d('2026-12-01'), delayInvoiceIds: ['cooper'] });
    const late = s.find((x) => x.key === 'late_payment')!;
    expect(late.cash_eur).toBe(184068);
    expect(late.gap_to_normal_eur).toBe(-36800);
  });

  it('at-risk invoices get their own scenario', () => {
    const s = scenarios(sheet(), { targetMonth: d('2026-12-01') });
    expect(s.find((x) => x.key === 'at_risk_excluded')!.cash_eur).toBe(220868 - 14608);
  });

  it('a forced deal counts in billed if billed before the target, in cash only if paid before', () => {
    const s = scenarios(sheet(), { targetMonth: d('2026-12-01'), forceDealIds: ['dhts', 'senef'] });
    const w = s.find((x) => x.key === 'with_deals')!;
    expect(w.billed_added_eur).toBe(60000);
    expect(w.cash_eur).toBe(220868 + 20000);
  });

  it('objective shows the gap to normal', () => {
    const s = scenarios(sheet(), { targetMonth: d('2026-12-01'), objectiveEur: 234868 });
    expect(s.find((x) => x.key === 'objective')!.gap_to_normal_eur).toBe(14000);
  });

  it('horizon M+1 = normal + next month recurring + weighted pipe - next month expenses', () => {
    const s = scenarios(sheet(), { targetMonth: d('2026-12-01') });
    expect(s.find((x) => x.key === 'horizon')!.cash_eur).toBe(220868 + 9700 + 165790 - 12800);
  });

  it('"counted" line lists what is in the scenario', () => {
    const n = scenarios(sheet(), { targetMonth: d('2026-12-01') })[0];
    expect(n.counted).toContain('Cooper (INV-021)');
    expect(n.counted).toContain('moins les charges');
    expect(n.counted).toContain('prélèvements dirigeant');
  });
});

describe('invoice cash timing', () => {
  const today = d('2026-11-25');
  const bal = d('2026-11-20');
  it('late invoice is expected this month', () => {
    const c = invoiceExpectedCash(inv({ id: 'a', amountEur: 100, issuedAt: d('2026-09-22') }), bal, today);
    expect(c[0].month.toISOString().slice(0, 7)).toBe('2026-11');
    expect(c[0].late).toBe(true);
  });
  it('to-bill invoice: end of billing month + delay', () => {
    const c = invoiceExpectedCash(inv({ id: 'a', status: 'A_FACTURER', amountEur: 100, plannedBillingMonth: d('2026-12-01'), paymentDelayDays: 45 }), bal, today);
    expect(c[0].month.toISOString().slice(0, 7)).toBe('2027-02');
  });
  it('paid before the balance date is already in the balance', () => {
    const c = invoiceExpectedCash(inv({ id: 'a', status: 'PAYEE', amountEur: 100, paidEur: 100, paidAt: d('2026-11-10') }), bal, today);
    expect(c).toHaveLength(1);
    expect(c[0].alreadyInBalance).toBe(true);
  });
  it('partial payment leaves the remainder expected', () => {
    const c = invoiceExpectedCash(inv({ id: 'a', status: 'PAYEE_PARTIEL', amountEur: 100, paidEur: 40, paidAt: d('2026-11-22'), dueAt: d('2026-12-15') }), bal, today);
    expect(c.map((x) => [x.amountEur, x.alreadyInBalance])).toEqual([[40, false], [60, false]]);
  });
  it('cancelled invoice counts nowhere', () => {
    expect(invoiceExpectedCash(inv({ id: 'a', status: 'ANNULEE', amountEur: 100 }), bal, today)).toEqual([]);
  });
  it('days late from the due date, or issue date + delay', () => {
    expect(daysLate(inv({ id: 'a', amountEur: 1, dueAt: d('2026-11-15') }), today)).toBe(10);
    expect(daysLate(inv({ id: 'a', amountEur: 1, issuedAt: d('2026-10-01') }), today)).toBe(25);
    expect(daysLate(inv({ id: 'a', status: 'PAYEE', amountEur: 1, dueAt: d('2026-01-01') }), today)).toBe(0);
  });
});

describe('billed vs cashed', () => {
  it('billed year to date separates issued, to bill and recurring', () => {
    const b = billedYearToDate(sheet(), d('2026-12-01'));
    expect(b.issued_eur).toBe(36800 + 19360 + 14608);
    expect(b.to_bill_eur).toBe(14000);
    expect(b.recurring_eur).toBe(7 * 6000 + 4 * 3700);
    expect(b.gap_to_target_eur).toBe(600000 - b.total_eur);
  });
  it('monthly table keeps billed and cash apart, charges of the balance month already paid', () => {
    const rows = monthlyTable(sheet(), d('2026-11-01'), d('2026-12-01'));
    const nov = rows[0], dec = rows[1];
    expect(nov.expenses_eur).toBe(0);
    expect(dec.expenses_eur).toBe(12800);
    expect(nov.billed_invoices_eur).toBe(19360 + 14608 + 14000);
    expect(nov.cash_in_eur).toBe(36800 + 19360 + 14608 + 9700);
    expect(dec.cash_in_eur).toBe(14000 + 9700);
  });
  it('balance uses the most recent date of active accounts', () => {
    const b = balanceOf([
      { id: 'a', name: 'a', balanceEur: 10, balanceDate: d('2026-11-01'), active: true },
      { id: 'b', name: 'b', balanceEur: 5, balanceDate: d('2026-11-20'), active: true },
      { id: 'c', name: 'c', balanceEur: 99, balanceDate: d('2026-11-25'), active: false },
    ], d('2026-11-25'));
    expect(b).toEqual({ totalEur: 15, date: d('2026-11-20') });
  });
});

describe('receivables', () => {
  it('lists overdue first and computes the real average payment delay per client', () => {
    const today = d('2026-11-25');
    const r = receivables([
      { ...inv({ id: 'x1', label: 'Cooper', amountEur: 100, issuedAt: d('2026-09-22') }), clientKey: 'cooper' },
      { ...inv({ id: 'x2', label: 'Cooper', status: 'PAYEE', amountEur: 50, paidEur: 50, issuedAt: d('2026-06-01'), paidAt: d('2026-07-21') }), clientKey: 'cooper' },
      { ...inv({ id: 'y', label: 'CNS', amountEur: 80, issuedAt: d('2026-11-20'), dueAt: d('2026-11-27') }), clientKey: 'cns' },
    ], today);
    expect(r.open_invoices[0].invoice_id).toBe('x1');
    expect(r.open_invoices[0].days_late).toBe(34);
    expect(r.totals).toEqual({ open_eur: 180, overdue_eur: 100, overdue_count: 1 });
    expect(r.by_client[0]).toMatchObject({ client: 'Cooper', avg_payment_days: 50, overdue_eur: 100 });
  });
});

describe('default billing entity', () => {
  it('Europe and Paraform → London, rest → Courtside, client setting wins', () => {
    expect(defaultEntity({ localisation: 'Paris, France' })).toBe('HUMANUP_LONDON');
    expect(defaultEntity({ localisation: 'San Francisco, USA' }, 'PARAFORM')).toBe('HUMANUP_LONDON');
    expect(defaultEntity({ localisation: 'Riyadh, Saudi Arabia' })).toBe('COURTSIDE_CAPITAL_HK');
    expect(defaultEntity({ localisation: 'Paris', entiteFacturation: 'HUMANUP_VIET' })).toBe('HUMANUP_VIET');
  });
});
