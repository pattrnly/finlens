import type { Loan } from './types';

export const LOANLENS_IMPORT_KEY = 'loanlens-state-v1';

/** Snapshot imported from LoanLens `state (3).json`. */
export const LOANLENS_IMPORTED_LOANS: Omit<Loan, 'id'>[] = [
  {
    name: 'Oscar Luxuria',
    emiStartDate: '2026-04-06',
    initialAnnualRatePercent: 7.35,
    originalTenureMonths: 204,
    status: 'open',
    disbursements: [
      {
        id: '38de7038-14dd-4e6b-8837-a0a87a965184',
        amount: 6500000,
        date: '2026-04-06',
      },
    ],
    rateChanges: [
      {
        id: '5c42c07e-0e9a-4ffa-a0ac-0ba5bc8b35fc',
        date: '2026-11-01',
        annualRatePercent: 7.6,
        impact: 'emi',
      },
    ],
    partPayments: [
      {
        id: 'bb64915a-bee8-47ce-8594-03f240f959ad',
        date: '2026-05-02',
        amount: 300000,
        impact: 'tenure',
      },
      {
        id: 'f664a1eb-a606-43d8-8f04-6d569485919b',
        date: '2026-06-02',
        amount: 225000,
        impact: 'tenure',
      },
      {
        id: '67cf6330-b0ec-477f-bbb3-fadf32c73438',
        date: '2026-07-10',
        amount: 225000,
        impact: 'tenure',
      },
      {
        id: '78dab2f0-40fc-4735-8929-809b549c794e',
        date: '2026-08-08',
        amount: 300000,
        impact: 'tenure',
      },
      {
        id: '0996eeae-6a21-417d-b8a2-6097b65cf33e',
        date: '2026-11-10',
        amount: 100000,
        impact: 'tenure',
      },
      {
        id: 'e1be7407-6c35-41fa-aa28-9cbc6ac2fbe4',
        date: '2026-10-07',
        amount: 55897,
        impact: 'tenure',
      },
      {
        id: 'd7baec26-2a61-420d-995d-c3e490d807ac',
        date: '2026-12-08',
        amount: 100000,
        impact: 'tenure',
      },
    ],
    createdAt: '2026-10-20T12:14:36.448Z',
    updatedAt: '2026-11-08T17:17:08.974Z',
  },
];
