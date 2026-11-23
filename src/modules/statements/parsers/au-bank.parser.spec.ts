import { parseAuBank } from './au-bank.parser';

const SAMPLE = `
Account Name : Test User
Account Number : XXXXXXXXXXXX0803
IFSC : AUBL0002552
Statement Period : 22 Oct 2026 to 21 Nov 2026
Opening Balance(₹) : 14,697.70
Closing Balance(₹) : 41,024.78
Transaction Date Value Date Description/ Narration Cheque/ Reference No. Debit (₹) Credit (₹) Balance (₹)
20 Nov 2026 20 Nov 2026 UPI/DR/669091760614/Utsav Kanubhai Hi
rpara/IDFB/10232255995/UPI
669091760614 10,000.00 - 41,024.78
08 Nov 2026 08 Nov 2026 UPI/DR/104435718817/GROWW INVEST T
ECH PVT LTD/HDFC/57500000403944/P
aid Via Elements
104435718817 5,000.00 - 14,529.70
01 Nov 2026 31 Oct 2026 MONTHLY INTEREST PAYOUT CHBATCH250125527307
0803C261031
- 32.00 14,729.70
Total 15,000.00 32.00
ACCOUNT STATEMENT
This is an auto generated statement and requires no signature Page 1 of 1
`;

const INLINE = `
Account Name : Test User Account Number : XXXXXXXXXXXX0803
IFSC : AUBL0002552
Statement Period : 22 Oct 2026 to 21 Nov 2026
Opening Balance(₹) : 14,697.70
Closing Balance(₹) : 41,024.78
Transaction Date Value Date Description/ Narration Cheque/ Reference No. Debit (₹) Credit (₹) Balance (₹)
20 Nov 2026 20 Nov 2026 UPI/DR/669091760614/Utsav Kanubhai Hi669091760614 10,000.00 - 41,024.78
rpara/IDFB/10232255995/UPI
08 Nov 2026 08 Nov 2026 UPI/DR/104435718817/GROWW INVEST T 104435718817 5,000.00 - 14,529.70
ECH PVT LTD/HDFC/57500000403944/P
aid Via Elements
03 Nov 2026 03 Nov 2026 UPI/CR/630776684077/CHOVATIYA BHU 630776684077 - 14,500.00 24,529.70
PAT B/HDFC/16771140035165/UPI
01 Nov 2026 31 Oct 2026 MONTHLY INTEREST PAYOUT CHBATCH250125527307 - 32.00 14,729.70
0803C261031
Total 15,000.00 14,532.00
`;

describe('parseAuBank', () => {
  it('reverses newest-first rows and reads debit/credit dashes', () => {
    const r = parseAuBank(SAMPLE);
    expect(r.header.accountLast4).toBe('0803');
    expect(r.header.openingBalancePaise).toBe(1469770);
    expect(r.rows[0].creditPaise).toBe(3200);
    expect(r.rows.some((x) => /GROWW/i.test(x.narration) && x.debitPaise === 500000)).toBe(true);
  });

  it('reads amounts glued onto the date line', () => {
    const r = parseAuBank(INLINE);
    expect(r.rows.length).toBe(4);
    expect(r.rows[0].creditPaise).toBe(3200);
    expect(r.rows.some((x) => x.debitPaise === 1000000)).toBe(true);
    expect(r.rows.some((x) => x.creditPaise === 1450000)).toBe(true);
    expect(r.rows.some((x) => /GROWW/i.test(x.narration) && x.debitPaise === 500000)).toBe(true);
  });
});
