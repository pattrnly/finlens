import { matchClassifyRule, patternHits, ruleResult } from './classify-rule';

const growwCredit = 'UPI/CR/1044/GROWW INVEST/HDFC/groww/UPI';
const growwDebit = 'UPI/DR/1044/GROWW INVEST/HDFC/groww/UPI';

describe('classify rules', () => {
  it('contains GROWW INVEST on credit only', () => {
    const rule = { pattern: 'GROWW INVEST', match: 'contains', direction: 'credit', type: 'investment' };
    expect(matchClassifyRule(growwCredit, true, [rule])?.type).toBe('investment');
    expect(matchClassifyRule(growwDebit, false, [rule])).toBeUndefined();
  });

  it('exact matches a UPI payee field, not a partial token', () => {
    expect(patternHits(growwCredit, 'GROWW INVEST', 'exact')).toBe(true);
    expect(patternHits(growwCredit, 'GROWW MF', 'exact')).toBe(false);
    expect(patternHits('GROWW INVEST', 'GROWW INVEST', 'exact')).toBe(true);
  });

  it('starts with and ends with work on payee tokens', () => {
    expect(patternHits(growwCredit, 'GROWW', 'starts_with')).toBe(true);
    expect(patternHits(growwCredit, 'INVEST', 'ends_with')).toBe(true);
    expect(patternHits(growwCredit, 'XYZ', 'starts_with')).toBe(false);
  });

  it('all words match even when split', () => {
    expect(patternHits('UPI/CR/1/GROWW  MF INVEST/HDFC/x/UPI', 'GROWW INVEST', 'words')).toBe(true);
    expect(patternHits('UPI/CR/1/GROWW/HDFC/x/UPI', 'GROWW INVEST', 'words')).toBe(false);
  });

  it('regex match is case insensitive', () => {
    expect(patternHits(growwCredit, 'groww\\s+invest', 'regex')).toBe(true);
    expect(patternHits(growwCredit, '(invalid', 'regex')).toBe(false);
  });

  it('maps removed fee type to expense', () => {
    expect(ruleResult({ pattern: 'GST', type: 'fee' }).type).toBe('expense');
  });

  it('maps loan part payment to its own type and category', () => {
    expect(ruleResult({ pattern: 'PART PAY', type: 'part_payment' })).toEqual({
      type: 'part_payment',
      categorySlug: 'part-payment',
      merchant: undefined,
    });
  });

  it('matches amount greater than / less than / equal to', () => {
    const gt = { pattern: '', amountOp: 'gt', amountPaise: 5000000, type: 'emi' };
    const eq = { pattern: '', amountOp: 'eq', amountPaise: 100000, type: 'expense' };
    const lt = { pattern: '', amountOp: 'lt', amountPaise: 10000, type: 'interest' };
    expect(matchClassifyRule('ACH', { isCredit: false, amountPaise: 5000001 }, [gt])?.type).toBe('emi');
    expect(matchClassifyRule('ACH', { isCredit: false, amountPaise: 5000000 }, [gt])).toBeUndefined();
    expect(matchClassifyRule('FEE', { isCredit: false, amountPaise: 100000 }, [eq])?.type).toBe('expense');
    expect(matchClassifyRule('FEE', { isCredit: false, amountPaise: 99999 }, [eq])).toBeUndefined();
    expect(matchClassifyRule('INT', { isCredit: true, amountPaise: 9999 }, [lt])?.type).toBe('interest');
    expect(matchClassifyRule('INT', { isCredit: true, amountPaise: 10000 }, [lt])).toBeUndefined();
  });

  it('matches bank name or specific account', () => {
    const hdfc = { pattern: '', bank: 'HDFC', type: 'emi', direction: 'debit' };
    const acct = { pattern: '', accountId: 'acc1', type: 'investment' };
    expect(matchClassifyRule('X', { isCredit: false, bank: 'HDFC Bank' }, [hdfc])?.type).toBe('emi');
    expect(matchClassifyRule('X', { isCredit: false, bank: 'IDFC' }, [hdfc])).toBeUndefined();
    expect(matchClassifyRule('X', { isCredit: true, accountId: 'acc1', bank: 'HDFC' }, [acct])?.type).toBe(
      'investment',
    );
    expect(matchClassifyRule('X', { isCredit: true, accountId: 'acc2', bank: 'HDFC' }, [acct])).toBeUndefined();
  });

  it('combines pattern, bank and amount', () => {
    const rule = {
      pattern: 'HDFC LTD',
      match: 'contains',
      direction: 'debit',
      bank: 'HDFC',
      amountOp: 'gte',
      amountPaise: 10000000,
      type: 'emi',
    };
    expect(
      matchClassifyRule('EHDF/HDFC LTD', { isCredit: false, amountPaise: 10010400, bank: 'HDFC' }, [rule])?.type,
    ).toBe('emi');
    expect(
      matchClassifyRule('EHDF/HDFC LTD', { isCredit: false, amountPaise: 10010400, bank: 'SBI' }, [rule]),
    ).toBeUndefined();
    expect(
      matchClassifyRule('EHDF/HDFC LTD', { isCredit: false, amountPaise: 5000000, bank: 'HDFC' }, [rule]),
    ).toBeUndefined();
  });
});
