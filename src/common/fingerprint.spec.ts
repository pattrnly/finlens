import { fingerprint } from './fingerprint';

describe('fingerprint', () => {
  it('keeps same-day same-amount rows unique when balances differ', () => {
    const base = {
      userId: 'u1',
      accountLast4: '9256',
      date: '2026-11-05',
      amountPaise: 100000,
      ref: 'DEBIT ACHDr YESB00709000028661 GROWW INVEST T',
    };
    expect(fingerprint({ ...base, balanceAfterPaise: 14472917 })).not.toBe(
      fingerprint({ ...base, balanceAfterPaise: 14372917 }),
    );
  });
});
