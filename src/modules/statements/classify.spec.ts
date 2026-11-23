import { classifyRow, looksLikeEmi, looksLikePartPayment } from './classify';

describe('EMI classification', () => {
  it('tags HDFC loan ACH and EHDF debits as EMI, not expense', () => {
    expect(looksLikeEmi('ACH D- HDFC BANK LTD-482548842', false)).toBe(true);
    expect(looksLikeEmi('EHDF8D321R7C18/HDFC LTD', false)).toBe(true);
    expect(looksLikeEmi('ACH D- HDFC BANK LTD-482548842', true)).toBe(false);

    const row = classifyRow(
      {
        date: new Date('2026-11-05'),
        narration: 'ACH D- HDFC BANK LTD-482548842',
        debitPaise: 5589700,
        creditPaise: 0,
      },
      [],
      [],
    );
    expect(row.type).toBe('emi');
    expect(row.categorySlug).toBe('emi');
  });

  it('tags loan part payment separately from expense and EMI', () => {
    expect(looksLikePartPayment('NEFT PART PAYMENT HOME LOAN', false)).toBe(true);
    expect(looksLikePartPayment('LOAN PREPAYMENT HDFC', false)).toBe(true);
    expect(looksLikePartPayment('ACH D- HDFC BANK LTD-482548842', false)).toBe(false);
    expect(looksLikePartPayment('PART PAYMENT', true)).toBe(false);

    const row = classifyRow(
      {
        date: new Date('2026-11-05'),
        narration: 'NEFT PART PAYMENT HOME LOAN',
        debitPaise: 10000000,
        creditPaise: 0,
      },
      [],
      [],
    );
    expect(row.type).toBe('part_payment');
    expect(row.categorySlug).toBe('part-payment');
  });

  it('keeps SBI NEFT credits as income even if the beneficiary matches family', () => {
    const row = classifyRow(
      {
        date: new Date('2026-11-01'),
        narration: 'DEP TFR NEFT*SURY0BK0000*SURYN2630 5556954*VORA SEFALI ASH',
        debitPaise: 0,
        creditPaise: 2152200,
      },
      [],
      [],
      [{ name: 'Sefali', aliases: ['Vora'] }],
    );
    expect(row.type).toBe('income');
    expect(row.creditPaise).toBe(2152200);
  });

  it('still tags family UPI credits as transfers', () => {
    const row = classifyRow(
      {
        date: new Date('2026-11-07'),
        narration: 'DEP TFR UPI/CR/667777936784/UTSAV KA/PPIW/7567368068/UPI',
        debitPaise: 0,
        creditPaise: 5000,
      },
      [],
      [],
      [{ name: 'Utsav' }],
    );
    expect(row.type).toBe('transfer');
    expect(row.creditPaise).toBe(5000);
  });

  it('applies bank and amount classify rules', () => {
    const row = classifyRow(
      {
        date: new Date('2026-11-05'),
        narration: 'NEFT SALARY CREDIT',
        debitPaise: 0,
        creditPaise: 25000000,
      },
      [],
      [],
      [],
      [{ pattern: '', direction: 'credit', amountOp: 'gte', amountPaise: 20000000, bank: 'HDFC', type: 'investment' }],
      { bank: 'HDFC' },
    );
    expect(row.type).toBe('investment');
    expect(
      classifyRow(
        {
          date: new Date('2026-11-05'),
          narration: 'NEFT SALARY CREDIT',
          debitPaise: 0,
          creditPaise: 25000000,
        },
        [],
        [],
        [],
        [{ pattern: '', direction: 'credit', amountOp: 'gte', amountPaise: 20000000, bank: 'HDFC', type: 'investment' }],
        { bank: 'SBI' },
      ).type,
    ).toBe('income');
  });
});
