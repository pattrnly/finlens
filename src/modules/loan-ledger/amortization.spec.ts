import { calculateEmi, calculateTenureMonths, computeLoan, loanPrincipal } from './amortization';
import { round2 } from './money';
import { LOANLENS_IMPORTED_LOANS } from './loan-ledger.seed';
import type { Loan } from './types';

function loan(partial: Partial<Loan> & Pick<Loan, 'disbursements' | 'emiStartDate'>): Loan {
  return {
    id: 'loan-1',
    name: 'Test loan',
    initialAnnualRatePercent: 12,
    originalTenureMonths: 12,
    status: 'open',
    rateChanges: [],
    partPayments: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('calculateEmi', () => {
  it('matches the standard 12% / 12 month fixture', () => {
    expect(calculateEmi(100_000, 12, 12)).toBe(8884.88);
  });

  it('splits principal evenly when the rate is zero', () => {
    expect(calculateEmi(120_000, 0, 12)).toBe(10_000);
  });
});

describe('calculateTenureMonths', () => {
  it('recovers the original tenure from EMI', () => {
    const emi = calculateEmi(100_000, 12, 12);
    expect(calculateTenureMonths(100_000, 12, emi)).toBe(12);
  });

  it('returns infinity when EMI does not cover interest', () => {
    expect(calculateTenureMonths(100_000, 12, 100)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('computeLoan — baseline schedule', () => {
  const fixture = loan({
    emiStartDate: '2024-01-01',
    disbursements: [{ id: 'd1', amount: 100_000, date: '2024-01-01' }],
  });

  it('pays off principal and ends at zero outstanding', () => {
    const result = computeLoan(fixture, '2025-01-01');
    const principalPaid = round2(
      result.schedule.reduce((sum, row) => sum + row.principalPaid + row.extraPaid, 0),
    );
    expect(principalPaid).toBe(100_000);
    expect(result.totals.endOutstanding).toBe(0);
    expect(result.totals.tenureMonths).toBe(12);
    expect(result.totals.originalEmi).toBe(8884.88);
    expect(result.totals.paidOff).toBe(true);
    expect(loanPrincipal(fixture)).toBe(100_000);
  });

  it('reports remaining figures as of an early as-of date', () => {
    const result = computeLoan(fixture, '2024-01-01');
    expect(result.totals.remainingTenureMonths).toBe(11);
    expect(result.totals.remainingPrincipal).toBeGreaterThan(0);
    expect(result.totals.remainingInterest).toBeGreaterThan(0);
    expect(result.totals.remainingEmiAmount).toBeGreaterThan(result.totals.remainingPrincipal);
  });
});

describe('computeLoan — multi-disbursement', () => {
  it('charges pre-EMI and starts EMI on the full outstanding', () => {
    const fixture = loan({
      emiStartDate: '2024-04-01',
      originalTenureMonths: 12,
      disbursements: [
        { id: 'd1', amount: 40_000, date: '2024-01-15' },
        { id: 'd2', amount: 60_000, date: '2024-03-01' },
      ],
    });
    const result = computeLoan(fixture, '2026-01-01');
    const preEmi = result.schedule.filter((row) => row.kind === 'pre-emi');
    expect(preEmi.length).toBeGreaterThan(0);
    expect(result.totals.principal).toBe(100_000);
    expect(result.totals.endOutstanding).toBe(0);
    const principalPaid = round2(
      result.schedule.reduce((sum, row) => sum + row.principalPaid + row.extraPaid, 0),
    );
    expect(principalPaid).toBe(100_000);
  });
});

describe('computeLoan — part payments', () => {
  const base = loan({
    emiStartDate: '2024-01-01',
    disbursements: [{ id: 'd1', amount: 100_000, date: '2024-01-01' }],
  });

  it('shortens tenure when impact is tenure', () => {
    const withPayment = {
      ...base,
      partPayments: [
        {
          id: 'p1',
          amount: 20_000,
          date: '2024-03-01',
          impact: 'tenure' as const,
        },
      ],
    };
    const original = computeLoan(base, '2026-01-01');
    const actual = computeLoan(withPayment, '2026-01-01');
    expect(actual.totals.tenureMonths).toBeLessThan(original.totals.tenureMonths);
    expect(actual.totals.totalInterest).toBeLessThan(original.totals.totalInterest);
    expect(actual.vsOriginal.interestDelta).toBeLessThan(0);
    expect(actual.partPaymentImpacts[0]?.interestDelta).toBeLessThan(0);
    expect(actual.partPaymentImpacts[0]?.amount).toBe(20_000);
  });

  it('reduces EMI when impact is emi', () => {
    const withPayment = {
      ...base,
      partPayments: [
        {
          id: 'p1',
          amount: 20_000,
          date: '2024-03-01',
          impact: 'emi' as const,
        },
      ],
    };
    const original = computeLoan(base, '2026-01-01');
    const actual = computeLoan(withPayment, '2026-01-01');
    expect(actual.totals.currentEmi).toBe(0);
    const emiAfterPayment = actual.schedule.find((row) => row.kind === 'part-payment')?.currentEmi;
    const originalEmi = original.totals.originalEmi;
    expect(emiAfterPayment).toBeLessThan(originalEmi);
    expect(actual.totals.tenureMonths).toBeGreaterThanOrEqual(original.totals.tenureMonths - 1);
    expect(actual.totals.totalInterest).toBeLessThan(original.totals.totalInterest);
  });
});

describe('computeLoan — rate changes', () => {
  const base = loan({
    emiStartDate: '2024-01-01',
    disbursements: [{ id: 'd1', amount: 100_000, date: '2024-01-01' }],
  });

  it('extends tenure when the rate rises and impact is tenure', () => {
    const changed = {
      ...base,
      rateChanges: [
        {
          id: 'r1',
          date: '2024-04-01',
          annualRatePercent: 18,
          impact: 'tenure' as const,
        },
      ],
    };
    const original = computeLoan(base, '2027-01-01');
    const actual = computeLoan(changed, '2027-01-01');
    expect(actual.totals.tenureMonths).toBeGreaterThan(original.totals.tenureMonths);
    expect(actual.totals.totalInterest).toBeGreaterThan(original.totals.totalInterest);
    expect(actual.rateChangeImpacts[0]?.tenureDeltaMonths).toBeGreaterThan(0);
  });

  it('raises EMI when the rate rises and impact is emi', () => {
    const changed = {
      ...base,
      rateChanges: [
        {
          id: 'r1',
          date: '2024-04-01',
          annualRatePercent: 18,
          impact: 'emi' as const,
        },
      ],
    };
    const original = computeLoan(base, '2026-01-01');
    const actual = computeLoan(changed, '2026-01-01');
    const row = actual.schedule.find((item) => item.kind === 'rate-change');
    expect(row?.currentEmi).toBeGreaterThan(original.totals.originalEmi);
    expect(actual.totals.tenureMonths).toBe(original.totals.tenureMonths);
    expect(actual.totals.totalInterest).toBeGreaterThan(original.totals.totalInterest);
  });
});

describe('computeLoan — closed loan', () => {
  it('zeroes remaining totals when marked closed', () => {
    const fixture = loan({
      status: 'closed',
      emiStartDate: '2024-01-01',
      disbursements: [{ id: 'd1', amount: 100_000, date: '2024-01-01' }],
    });
    const result = computeLoan(fixture, '2024-01-01');
    expect(result.totals.remainingPrincipal).toBe(0);
    expect(result.totals.remainingTenureMonths).toBe(0);
    expect(result.totals.remainingEmiAmount).toBe(0);
    expect(result.totals.remainingInterest).toBe(0);
    expect(result.totals.currentEmi).toBe(0);
  });
});

describe('computeLoan — Oscar Luxuria import', () => {
  const fixture: Loan = {
    id: 'dc1653b7-b631-4092-9d61-44d76fe031fd',
    ...LOANLENS_IMPORTED_LOANS[0],
  };

  it('keeps the imported principal and event counts', () => {
    expect(loanPrincipal(fixture)).toBe(6_500_000);
    expect(fixture.rateChanges).toHaveLength(1);
    expect(fixture.partPayments).toHaveLength(7);
  });

  it('matches LoanLens remaining figures as of 23 Nov 2026', () => {
    const result = computeLoan(fixture, '2026-11-23');
    expect(result.totals.principal).toBe(6_500_000);
    expect(result.totals.originalEmi).toBe(calculateEmi(6_500_000, 7.35, 204));
    expect(result.totals.paidOff).toBe(false);
    expect(result.totals.currentRate).toBe(7.6);
    expect(result.totals.totalPartPayments).toBe(1_305_897);
    expect(result.totals.remainingPrincipal).toBeGreaterThan(0);
    expect(result.totals.remainingTenureMonths).toBeGreaterThan(0);
    expect(result.vsOriginal.interestDelta).toBeLessThan(0);
    expect(result.vsOriginal.tenureDeltaMonths).toBeLessThan(0);
  });
});
