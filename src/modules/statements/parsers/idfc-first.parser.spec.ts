import { parseIdfcFirst } from './idfc-first.parser';

const SAMPLE = `
STATEMENT OF ACCOUNT
ACCOUNT NO : 10232255995
STATEMENT PERIOD : 2026-11-01 TO 2026-11-21
IFSC : IDFB0040332
Opening Balance Total Debit Total Credit Closing Balance
13,359.36 9,962.77 17,379.86 20,776.45
Transaction Date Value Date Particulars Cheque No Debit Credit Balance
Opening Balance 13,359.36
02-Nov-2026 02-Nov-2026 UPI/DR/318220321198/GUJARAT
/ICIC/gsrtc11/Sent using Paytm
UPI
286.00 13,073.36
02-Nov-2026 02-Nov-2026 UPI/CR/104386272205/RELIANCE/H
DFC/ajio1pa/REFUND
279.79 13,353.15
REGISTERED OFFICE: IDFC FIRST BANK LIMITED
Page 1 of 2
`;

const INLINE = `
STATEMENT OF ACCOUNT
ACCOUNT NO : 10232255995
STATEMENT PERIOD : 2026-11-01 TO 2026-11-21
IFSC : IDFB0040332
Opening Balance Total Debit Total Credit Closing Balance
13,359.36 9,962.77 17,379.86 20,776.45
Transaction Value Date Particulars Cheque Debit Credit Balance
Date No
Opening Balance 13,359.36
02-Nov-2026 02-Nov-2026 UPI/DR/318220321198/GUJARAT 286.00 13,073.36
/ICIC/gsrtc11/Sent using Paytm
UPI
02-Nov-2026 02-Nov-2026 UPI/DR/318227803787/Mr 55.00 13,018.36
DEEPA/CBIN/jd28355/Sent using
Paytm UPI
02-Nov-2026 02-Nov-2026 UPI/CR/104386272205/RELIANCE/H 279.79 13,298.15
DFC/ajio1pa/REFUND
`;

describe('parseIdfcFirst', () => {
  it('reads header totals and wrapped UPI rows', () => {
    const r = parseIdfcFirst(SAMPLE);
    expect(r.header.accountLast4).toBe('5995');
    expect(r.header.openingBalancePaise).toBe(1335936);
    expect(r.header.closingBalancePaise).toBe(2077645);
    expect(r.rows.length).toBeGreaterThanOrEqual(2);
    expect(r.rows[0].debitPaise).toBe(28600);
    expect(r.rows[1].creditPaise).toBe(27979);
  });

  it('reads amounts that sit on the same line as the dates', () => {
    const r = parseIdfcFirst(INLINE);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0].debitPaise).toBe(28600);
    expect(r.rows[1].debitPaise).toBe(5500);
    expect(r.rows[2].creditPaise).toBe(27979);
    expect(r.rows[2].narration).toMatch(/REFUND/i);
  });
});
