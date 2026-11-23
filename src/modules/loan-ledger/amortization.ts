import type {
  EventImpact,
  Loan,
  LoanComputation,
  LoanTotals,
  PartPayment,
  RateChange,
  ScheduleRow,
} from './types';
import { addMonths, todayIso } from './dates';
import { round2 } from './money';

export const MAX_INSTALLMENTS = 480;
const EPS = 0.05;

export function monthlyRate(annualPercent: number): number {
  return annualPercent / 12 / 100;
}

export function calculateEmi(principal: number, annualPercent: number, months: number): number {
  if (months <= 0 || principal <= 0) return 0;
  const r = monthlyRate(annualPercent);
  if (Math.abs(r) < 1e-12) return round2(principal / months);
  const pow = (1 + r) ** months;
  return round2((principal * r * pow) / (pow - 1));
}

export function calculateTenureMonths(principal: number, annualPercent: number, emi: number): number {
  if (principal <= 0) return 0;
  if (emi <= 0) return Number.POSITIVE_INFINITY;
  const r = monthlyRate(annualPercent);
  if (Math.abs(r) < 1e-12) return Math.ceil(principal / emi);
  if (emi <= principal * r + 0.01) return Number.POSITIVE_INFINITY;
  const n = Math.log(emi / (emi - principal * r)) / Math.log(1 + r);
  return Math.max(1, Math.ceil(n - 1e-9));
}

export function loanPrincipal(loan: Loan): number {
  return round2(loan.disbursements.reduce((sum, item) => sum + (item.amount || 0), 0));
}

type TimedEvent =
  | { at: string; order: number; type: 'disbursement'; amount: number; id: string }
  | { at: string; order: number; type: 'rate-change'; change: RateChange }
  | { at: string; order: number; type: 'pre-emi' }
  | { at: string; order: number; type: 'emi' }
  | { at: string; order: number; type: 'part-payment'; payment: PartPayment };

function emptyTotals(principal = 0, originalEmi = 0, rate = 0): LoanTotals {
  return {
    principal,
    totalInterest: 0,
    totalPayment: 0,
    totalPartPayments: 0,
    endOutstanding: 0,
    remainingPrincipal: 0,
    remainingTenureMonths: 0,
    remainingEmiAmount: 0,
    remainingInterest: 0,
    currentEmi: originalEmi,
    currentRate: rate,
    originalEmi,
    paidOff: principal <= 0,
    tenureMonths: 0,
  };
}

function applyImpact(
  impact: 'tenure' | 'emi',
  outstanding: number,
  rate: number,
  emi: number,
  remainingN: number,
  fallbackPrincipal: number,
): { emi: number; remainingN: number } {
  const principal = outstanding > EPS ? outstanding : fallbackPrincipal;
  if (principal <= EPS) return { emi, remainingN };
  if (impact === 'emi') {
    return {
      emi: calculateEmi(principal, rate, Math.max(remainingN, 1)),
      remainingN: Math.max(remainingN, 1),
    };
  }
  const nextN = calculateTenureMonths(principal, rate, emi);
  if (!Number.isFinite(nextN)) return { emi, remainingN };
  return { emi, remainingN: Math.max(1, nextN) };
}

interface SimulateOptions {
  asOf: string;
  ignoreRateChanges?: boolean;
  ignorePartPayments?: boolean;
}

function simulate(
  loan: Loan,
  options: SimulateOptions,
): {
  schedule: ScheduleRow[];
  totals: LoanTotals;
} {
  const disbursements = [...loan.disbursements]
    .filter((item) => item.amount > 0 && item.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const rateChanges = options.ignoreRateChanges
    ? []
    : [...loan.rateChanges].sort((a, b) => a.date.localeCompare(b.date));
  const partPayments = options.ignorePartPayments
    ? []
    : [...loan.partPayments].sort((a, b) => a.date.localeCompare(b.date));

  const principal = round2(disbursements.reduce((sum, item) => sum + item.amount, 0));
  const originalEmi = calculateEmi(principal, loan.initialAnnualRatePercent, loan.originalTenureMonths);

  if (principal <= 0 || loan.originalTenureMonths <= 0) {
    return { schedule: [], totals: emptyTotals(principal, originalEmi, loan.initialAnnualRatePercent) };
  }

  const firstDate = disbursements[0]?.date ?? loan.emiStartDate;
  let rate = loan.initialAnnualRatePercent;
  let remainingN = loan.originalTenureMonths;
  let emi = originalEmi;
  let outstanding = 0;
  let installment = 0;
  let paidOff = false;
  const schedule: ScheduleRow[] = [];

  const events: TimedEvent[] = [];
  for (const item of disbursements) {
    events.push({ at: item.date, order: 0, type: 'disbursement', amount: item.amount, id: item.id });
  }
  for (const change of rateChanges) {
    events.push({ at: change.date, order: 1, type: 'rate-change', change });
  }
  if (firstDate < loan.emiStartDate) {
    for (let i = -1; i >= -120; i -= 1) {
      const date = addMonths(loan.emiStartDate, i);
      if (date <= firstDate) break;
      events.push({ at: date, order: 2, type: 'pre-emi' });
    }
  }
  for (let i = 0; i < MAX_INSTALLMENTS; i += 1) {
    events.push({ at: addMonths(loan.emiStartDate, i), order: 3, type: 'emi' });
  }
  for (const payment of partPayments) {
    events.push({ at: payment.date, order: 4, type: 'part-payment', payment });
  }
  events.sort((a, b) => a.at.localeCompare(b.at) || a.order - b.order);

  let currentEmiAsOf = emi;
  let currentRateAsOf = rate;
  let remainingPrincipalAsOf = 0;
  const asOf = options.asOf;

  const snapshotAsOf = (date: string) => {
    if (date <= asOf) {
      currentEmiAsOf = paidOff ? 0 : emi;
      currentRateAsOf = rate;
      remainingPrincipalAsOf = outstanding;
    }
  };

  const pushRow = (row: Omit<ScheduleRow, 'currentEmi'>): void => {
    schedule.push({ ...row, currentEmi: emi });
  };

  for (const event of events) {
    if (event.type === 'disbursement') {
      outstanding = round2(outstanding + event.amount);
      paidOff = false;
      if (event.at >= loan.emiStartDate && remainingN > 0 && outstanding > EPS) {
        emi = calculateEmi(outstanding, rate, remainingN);
      }
      pushRow({
        id: `disb-${event.id}`,
        date: event.at,
        kind: 'disbursement',
        installment: null,
        disbursed: event.amount,
        principalPaid: 0,
        interestPaid: 0,
        extraPaid: 0,
        payment: 0,
        outstanding,
        annualRatePercent: rate,
        note: 'Disbursement',
      });
      snapshotAsOf(event.at);
      continue;
    }

    if (paidOff) {
      const laterDisbursement = disbursements.some((item) => item.date > event.at);
      if (!laterDisbursement) break;
      continue;
    }

    if (event.type === 'rate-change') {
      const previous = rate;
      rate = event.change.annualRatePercent;
      const next = applyImpact(event.change.impact, outstanding, rate, emi, remainingN, principal);
      emi = next.emi;
      remainingN = next.remainingN;
      pushRow({
        id: `rate-${event.change.id}`,
        date: event.at,
        kind: 'rate-change',
        installment: null,
        disbursed: 0,
        principalPaid: 0,
        interestPaid: 0,
        extraPaid: 0,
        payment: 0,
        outstanding,
        annualRatePercent: rate,
        note: `Rate ${previous}% → ${rate}% · keep ${event.change.impact}`,
      });
      snapshotAsOf(event.at);
      continue;
    }

    if (event.type === 'pre-emi') {
      if (outstanding <= EPS || event.at >= loan.emiStartDate) continue;
      const interest = round2(outstanding * monthlyRate(rate));
      pushRow({
        id: `pre-${event.at}`,
        date: event.at,
        kind: 'pre-emi',
        installment: null,
        disbursed: 0,
        principalPaid: 0,
        interestPaid: interest,
        extraPaid: 0,
        payment: interest,
        outstanding,
        annualRatePercent: rate,
        note: 'Pre-EMI interest',
      });
      snapshotAsOf(event.at);
      continue;
    }

    if (event.type === 'emi') {
      if (event.at < loan.emiStartDate) continue;
      if (outstanding <= EPS) {
        paidOff = true;
        snapshotAsOf(event.at);
        const laterDisbursement = disbursements.some((item) => item.date > event.at);
        if (!laterDisbursement) break;
        continue;
      }
      installment += 1;
      const interest = round2(outstanding * monthlyRate(rate));
      let principalPaid: number;
      let payment: number;
      const lastOrCovered = emi >= outstanding + interest - EPS || remainingN <= 1;
      if (lastOrCovered) {
        principalPaid = outstanding;
        payment = round2(outstanding + interest);
      } else {
        payment = emi;
        principalPaid = round2(payment - interest);
        if (principalPaid < 0) principalPaid = 0;
        if (principalPaid > outstanding) {
          principalPaid = outstanding;
          payment = round2(principalPaid + interest);
        }
      }
      outstanding = round2(outstanding - principalPaid);
      remainingN = Math.max(0, remainingN - 1);
      if (outstanding <= EPS) {
        outstanding = 0;
        paidOff = true;
        remainingN = 0;
      } else if (remainingN <= 0) {
        const extra = calculateTenureMonths(outstanding, rate, emi);
        remainingN = Number.isFinite(extra) ? Math.max(1, extra) : 1;
      }
      pushRow({
        id: `emi-${installment}-${event.at}`,
        date: event.at,
        kind: 'emi',
        installment,
        disbursed: 0,
        principalPaid,
        interestPaid: interest,
        extraPaid: 0,
        payment,
        outstanding,
        annualRatePercent: rate,
        note: paidOff ? 'Final EMI' : 'EMI',
      });
      snapshotAsOf(event.at);
      if (paidOff) {
        const laterDisbursement = disbursements.some((item) => item.date > event.at);
        if (!laterDisbursement) break;
      }
      continue;
    }

    const extra = round2(Math.min(event.payment.amount, outstanding));
    if (extra <= 0) continue;
    outstanding = round2(outstanding - extra);
    if (outstanding <= EPS) {
      outstanding = 0;
      paidOff = true;
      remainingN = 0;
      emi = 0;
    } else {
      const next = applyImpact(event.payment.impact, outstanding, rate, emi, Math.max(remainingN, 1), principal);
      emi = next.emi;
      remainingN = next.remainingN;
    }
    pushRow({
      id: `pp-${event.payment.id}`,
      date: event.at,
      kind: 'part-payment',
      installment: null,
      disbursed: 0,
      principalPaid: 0,
      interestPaid: 0,
      extraPaid: extra,
      payment: extra,
      outstanding,
      annualRatePercent: rate,
      note: `Part payment · keep ${event.payment.impact}`,
    });
    snapshotAsOf(event.at);
  }

  const emiRows = schedule.filter((row) => row.kind === 'emi');
  const totalInterest = round2(schedule.reduce((sum, row) => sum + row.interestPaid, 0));
  const totalPayment = round2(schedule.reduce((sum, row) => sum + row.payment, 0));
  const totalPartPayments = round2(schedule.reduce((sum, row) => sum + row.extraPaid, 0));
  const tenureMonths = emiRows.length;
  const forcedClosed = loan.status === 'closed';
  const futureEmis = emiRows.filter((row) => row.date > asOf);
  const futureInterest = round2(
    schedule
      .filter((row) => row.date > asOf && (row.kind === 'emi' || row.kind === 'pre-emi'))
      .reduce((sum, row) => sum + row.interestPaid, 0),
  );
  const futureEmiAmount = round2(futureEmis.reduce((sum, row) => sum + row.payment, 0));
  const futureDisbursement = disbursements.some((item) => item.date > asOf);
  const settledAsOf = remainingPrincipalAsOf <= EPS && !futureDisbursement;
  const hasPastActivity = schedule.some((row) => row.date <= asOf);

  const totals: LoanTotals = {
    principal,
    totalInterest,
    totalPayment,
    totalPartPayments,
    endOutstanding: outstanding,
    remainingPrincipal: forcedClosed ? 0 : remainingPrincipalAsOf,
    remainingTenureMonths: forcedClosed ? 0 : futureEmis.length,
    remainingEmiAmount: forcedClosed ? 0 : futureEmiAmount,
    remainingInterest: forcedClosed ? 0 : futureInterest,
    currentEmi: forcedClosed || (hasPastActivity && settledAsOf) ? 0 : currentEmiAsOf,
    currentRate: currentRateAsOf,
    originalEmi,
    paidOff: forcedClosed || (hasPastActivity && settledAsOf),
    tenureMonths,
  };

  return { schedule, totals };
}

function toImpact(
  kind: EventImpact['kind'],
  id: string,
  date: string,
  label: string,
  withEvent: { totals: LoanTotals },
  withoutEvent: { totals: LoanTotals },
  amount?: number,
): EventImpact {
  return {
    id,
    kind,
    date,
    label,
    amount,
    interestDelta: round2(withEvent.totals.totalInterest - withoutEvent.totals.totalInterest),
    tenureDeltaMonths: withEvent.totals.tenureMonths - withoutEvent.totals.tenureMonths,
    emiDelta: round2(withEvent.totals.currentEmi - withoutEvent.totals.currentEmi),
    totalPaymentDelta: round2(withEvent.totals.totalPayment - withoutEvent.totals.totalPayment),
  };
}

export function computeLoan(loan: Loan, asOf: string = todayIso()): LoanComputation {
  const actual = simulate(loan, { asOf });
  const original = simulate(loan, {
    asOf,
    ignoreRateChanges: true,
    ignorePartPayments: true,
  });

  const rateChangeImpacts = loan.rateChanges.map((change) => {
    const without = simulate(
      { ...loan, rateChanges: loan.rateChanges.filter((item) => item.id !== change.id) },
      { asOf },
    );
    return toImpact(
      'rate-change',
      change.id,
      change.date,
      `Rate → ${change.annualRatePercent}% (${change.impact})`,
      actual,
      without,
    );
  });

  const partPaymentImpacts = loan.partPayments.map((payment) => {
    const without = simulate(
      { ...loan, partPayments: loan.partPayments.filter((item) => item.id !== payment.id) },
      { asOf },
    );
    return toImpact(
      'part-payment',
      payment.id,
      payment.date,
      `Part payment (${payment.impact})`,
      actual,
      without,
      payment.amount,
    );
  });

  return {
    schedule: actual.schedule,
    originalSchedule: original.schedule,
    totals: actual.totals,
    originalTotals: original.totals,
    vsOriginal: {
      interestDelta: round2(actual.totals.totalInterest - original.totals.totalInterest),
      tenureDeltaMonths: actual.totals.tenureMonths - original.totals.tenureMonths,
      emiDelta: round2(actual.totals.currentEmi - original.totals.originalEmi),
      totalPaymentDelta: round2(actual.totals.totalPayment - original.totals.totalPayment),
    },
    rateChangeImpacts,
    partPaymentImpacts,
  };
}
