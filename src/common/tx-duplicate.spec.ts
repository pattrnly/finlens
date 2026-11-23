import { istNoon } from './dates';
import {
  collectPaymentRefs,
  findDuplicateMatch,
  isSameLedgerEntry,
  narrationsLikelySame,
  type LedgerIdentity,
} from './tx-duplicate';

function row(partial: Partial<LedgerIdentity> & Pick<LedgerIdentity, 'amountPaise'>): LedgerIdentity {
  return {
    date: istNoon('2026-08-17'),
    isCredit: true,
    ...partial,
  };
}

describe('collectPaymentRefs', () => {
  it('pulls IndusInd-style UPI RRNs and explicit upiRef', () => {
    const refs = collectPaymentRefs('UPI/128060301101/CR/ KANA/UBIN/a676@okhdfcbank/UPI', undefined);
    expect(refs.has('128060301101')).toBe(true);
  });

  it('pulls NEFT/IMPS tokens and cheque numbers', () => {
    const refs = collectPaymentRefs('NEFT SBIN425610123456 / CHQ 123456');
    expect([...refs].some((r) => r.includes('SBIN425610123456') || r === 'SBIN425610123456')).toBe(
      true,
    );
    expect(refs.has('CHQ123456')).toBe(true);
  });
});

describe('isSameLedgerEntry', () => {
  it('treats overlapped statement wraps with the same UPI as duplicates', () => {
    const booked = row({
      id: 't1',
      amountPaise: 1500000,
      narration: 'UPI/128060301101/CR/ KANA/UBIN/a676@okh',
      upiRef: '128060301101',
      balanceAfterPaise: 1600627,
    });
    const overlap = row({
      amountPaise: 1500000,
      narration: 'UPI/128060301101/CR/ KANA/UBIN/a676@okhdfcbank/UPI',
      upiRef: '128060301101',
      balanceAfterPaise: 1600627,
    });
    expect(isSameLedgerEntry(overlap, booked)).toBe(true);
  });

  it('matches same-day same-amount rows by running balance when refs are missing', () => {
    const booked = row({
      id: 't1',
      amountPaise: 600,
      isCredit: true,
      narration: '156355806797:Int.Pd:0 S13682450',
      balanceAfterPaise: 100627,
    });
    const overlap = row({
      amountPaise: 600,
      isCredit: true,
      narration: '156355806797:Int.Pd:01-04-2026 to 30-06-2026 S13682450',
      balanceAfterPaise: 100627,
    });
    expect(isSameLedgerEntry(overlap, booked)).toBe(true);
  });

  it('keeps same-day same-amount ACH rows unique when balances differ', () => {
    const first = row({
      id: 'g1',
      amountPaise: 100000,
      isCredit: false,
      narration: 'DEBIT ACHDr YESB00709000028661 GROWW INVEST T',
      balanceAfterPaise: 14472917,
    });
    const second = row({
      id: 'g2',
      amountPaise: 100000,
      isCredit: false,
      narration: 'DEBIT ACHDr YESB00709000028661 GROWW INVEST T',
      balanceAfterPaise: 14372917,
    });
    expect(isSameLedgerEntry(first, second)).toBe(false);
  });

  it('still matches wrapped particulars when upiRef was not stored', () => {
    const booked = row({
      id: 't1',
      amountPaise: 1500000,
      narration: 'UPI/128060301101/CR/ KANA/UBIN/a676@okh',
      balanceAfterPaise: 1600627,
    });
    const overlap = row({
      amountPaise: 1500000,
      narration: 'UPI/128060301101/CR/ KANA/UBIN/a676@okhdfcbank/UPI',
      balanceAfterPaise: 1600627,
    });
    expect(isSameLedgerEntry(overlap, booked)).toBe(true);
  });

  it('does not treat a later missing month as a duplicate of an earlier booking', () => {
    const august = row({
      id: 'aug',
      date: istNoon('2026-08-17'),
      amountPaise: 1500000,
      upiRef: '128060301101',
      narration: 'UPI/128060301101/CR/ KANA',
    });
    const september = row({
      date: istNoon('2026-09-28'),
      amountPaise: 1340000,
      upiRef: '627121315339',
      narration: 'UPI/627121315339/CR/ Hirp',
    });
    expect(isSameLedgerEntry(september, august)).toBe(false);
  });

  it('does not collapse two UPI payments of the same amount with different RRNs', () => {
    const a = row({
      id: 'u1',
      amountPaise: 67500,
      isCredit: false,
      narration: 'UPI/659761920023/DR/ Hirp/AUBL/irpara3-3@oksbi',
      upiRef: '659761920023',
      balanceAfterPaise: 1533127,
    });
    const b = row({
      amountPaise: 67500,
      isCredit: false,
      narration: 'UPI/659761920099/DR/ Hirp/AUBL/irpara3-3@oksbi',
      upiRef: '659761920099',
      balanceAfterPaise: 1526377,
    });
    expect(isSameLedgerEntry(a, b)).toBe(false);
  });

  it('matches on fingerprint even if narration wrapping changed', () => {
    expect(
      isSameLedgerEntry(
        row({ fingerprint: 'abc', amountPaise: 100, narration: 'foo' }),
        row({ fingerprint: 'abc', amountPaise: 100, narration: 'foo extra wrap' }),
      ),
    ).toBe(true);
  });

  it('rejects opposite directions even with similar narration', () => {
    expect(
      isSameLedgerEntry(
        row({
          amountPaise: 1500000,
          isCredit: true,
          upiRef: '128060301101',
          narration: 'UPI/128060301101/CR/',
        }),
        row({
          amountPaise: 1500000,
          isCredit: false,
          upiRef: '128060301101',
          narration: 'UPI/128060301101/DR/',
        }),
      ),
    ).toBe(false);
  });
});

describe('findDuplicateMatch', () => {
  it('claims at most one existing row per incoming line', () => {
    const existing = [
      row({
        id: 'a',
        amountPaise: 1500000,
        upiRef: '128060301101',
        narration: 'UPI/128060301101/CR/ KANA',
        balanceAfterPaise: 1600627,
      }),
    ];
    const claimed = new Set<string>();
    const first = findDuplicateMatch(
      row({
        amountPaise: 1500000,
        upiRef: '128060301101',
        narration: 'UPI/128060301101/CR/ KANA/UBIN',
      }),
      existing,
      claimed,
    );
    expect(first?.id).toBe('a');
    claimed.add(first!.id!);
    const second = findDuplicateMatch(
      row({
        amountPaise: 1500000,
        upiRef: '128060301101',
        narration: 'UPI/128060301101/CR/ KANA/UBIN extra',
      }),
      existing,
      claimed,
    );
    expect(second).toBeUndefined();
  });
});

describe('narrationsLikelySame', () => {
  it('treats wrapped UPI particular as the same payee line', () => {
    expect(
      narrationsLikelySame(
        'UPI/128060301101/CR/ KANA/UBIN/a676@okh',
        'UPI/128060301101/CR/ KANA/UBIN/a676@okhdfcbank/UPI',
      ),
    ).toBe(true);
  });

  it('does not treat unrelated merchants as the same', () => {
    expect(narrationsLikelySame('UPI/1/DR/AMAZON PAY', 'UPI/2/DR/FLIPKART ORDERS')).toBe(false);
  });
});
