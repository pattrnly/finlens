export type Impact = 'tenure' | 'emi';
export type LoanStatus = 'open' | 'closed';

export interface Disbursement {
  id: string;
  amount: number;
  date: string;
}

export interface RateChange {
  id: string;
  date: string;
  annualRatePercent: number;
  impact: Impact;
}

export interface PartPayment {
  id: string;
  amount: number;
  date: string;
  impact: Impact;
}

export interface Loan {
  id: string;
  name: string;
  emiStartDate: string;
  disbursements: Disbursement[];
  initialAnnualRatePercent: number;
  originalTenureMonths: number;
  status: LoanStatus;
  rateChanges: RateChange[];
  partPayments: PartPayment[];
  createdAt: string;
  updatedAt: string;
}

export type ScheduleKind =
  | 'disbursement'
  | 'pre-emi'
  | 'emi'
  | 'part-payment'
  | 'rate-change';

export interface ScheduleRow {
  id: string;
  date: string;
  kind: ScheduleKind;
  installment: number | null;
  disbursed: number;
  principalPaid: number;
  interestPaid: number;
  extraPaid: number;
  payment: number;
  outstanding: number;
  annualRatePercent: number;
  currentEmi: number;
  note: string;
}

export interface LoanTotals {
  principal: number;
  totalInterest: number;
  totalPayment: number;
  totalPartPayments: number;
  endOutstanding: number;
  remainingPrincipal: number;
  remainingTenureMonths: number;
  remainingEmiAmount: number;
  remainingInterest: number;
  currentEmi: number;
  currentRate: number;
  originalEmi: number;
  paidOff: boolean;
  tenureMonths: number;
}

export interface EventImpact {
  id: string;
  kind: 'rate-change' | 'part-payment';
  date: string;
  interestDelta: number;
  tenureDeltaMonths: number;
  emiDelta: number;
  totalPaymentDelta: number;
  amount?: number;
  label: string;
}

export interface LoanComputation {
  schedule: ScheduleRow[];
  originalSchedule: ScheduleRow[];
  totals: LoanTotals;
  originalTotals: LoanTotals;
  vsOriginal: {
    interestDelta: number;
    tenureDeltaMonths: number;
    emiDelta: number;
    totalPaymentDelta: number;
  };
  rateChangeImpacts: EventImpact[];
  partPaymentImpacts: EventImpact[];
}
