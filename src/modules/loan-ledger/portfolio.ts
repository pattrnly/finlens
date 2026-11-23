import type { Loan, LoanComputation } from './types';
import { computeLoan, loanPrincipal } from './amortization';
import { round2 } from './money';

export interface LoanView {
  loan: Loan;
  computation: LoanComputation;
  isActive: boolean;
}

export interface PortfolioSummary {
  views: LoanView[];
  active: LoanView[];
  loanCount: number;
  activeCount: number;
  principal: number;
  outstanding: number;
  remainingPrincipal: number;
  remainingTenureMonths: number;
  remainingEmiAmount: number;
  remainingInterest: number;
}

export function summarizePortfolio(loans: Loan[], asOf: string): PortfolioSummary {
  const views = loans
    .map((loan) => {
      const computation = computeLoan(loan, asOf);
      const isActive = loan.status === 'open' && !computation.totals.paidOff;
      return { loan, computation, isActive };
    })
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.loan.name.localeCompare(b.loan.name);
    });
  const active = views.filter((view) => view.isActive);
  return {
    views,
    active,
    loanCount: views.length,
    activeCount: active.length,
    principal: round2(views.reduce((sum, view) => sum + loanPrincipal(view.loan), 0)),
    outstanding: round2(views.reduce((sum, view) => sum + view.computation.totals.remainingPrincipal, 0)),
    remainingPrincipal: round2(
      views.reduce((sum, view) => sum + view.computation.totals.remainingPrincipal, 0),
    ),
    remainingTenureMonths: active.reduce((sum, view) => sum + view.computation.totals.remainingTenureMonths, 0),
    remainingEmiAmount: round2(
      views.reduce((sum, view) => sum + view.computation.totals.remainingEmiAmount, 0),
    ),
    remainingInterest: round2(
      views.reduce((sum, view) => sum + view.computation.totals.remainingInterest, 0),
    ),
  };
}

export function stripSchedules(computation: LoanComputation): Omit<
  LoanComputation,
  'schedule' | 'originalSchedule'
> {
  return {
    totals: computation.totals,
    originalTotals: computation.originalTotals,
    vsOriginal: computation.vsOriginal,
    rateChangeImpacts: computation.rateChangeImpacts,
    partPaymentImpacts: computation.partPaymentImpacts,
  };
}
