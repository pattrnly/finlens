import { parseHdfc } from './hdfc.parser';
import { detectBank } from './detect-bank';

const SAMPLE = `
Page No .: 1
Account Branch : NIKOL
Address : HDFC BANK LTD,
MR TEST USER
Cust ID : 123456789
Account No : 50100431292541 VRM POTENTIAL
RTGS/NEFT IFSC: HDFC0009394 MICR : 380240094
From : 01/11/2026 To : 22/11/2026 Statement of account
Date Narration Chq./Ref.No. Value Dt Withdrawal Amt. Deposit Amt. Closing Balance
02/11/26 A2AINT01 - SUNFLOWER LAB TECHNOLOGIES P 0000012061994731 02/11/26 142,298.00 142,317.98
VT LTD - SALARY - OCT PAYROLL
02/11/26 UPI-HIRPARA 0000630609469889 02/11/26 4,700.00 147,017.98
SONALBEN-***********A3-5@OKA
XIS-AUBL0002552-630609469889-UPI
03/11/26 UPI-HIRAPRA KANAIYALAL-***********A3-4@O 0000630712515148 03/11/26 16,000.00 163,017.98
KAXIS-INDB0000706-630712515148-UPI
05/11/26 ACH D- HDFC BANK LTD-482548842 0000008855215309 05/11/26 55,897.00 107,120.98
05/11/26 ACH D- HDFC BANK LTD-482405836 0000008755078309 05/11/26 51,850.00 55,270.98
05/11/26 CASH DEPOSIT-XXXXXXXXXX2541-ODHAV 0000000000008942 05/11/26 17,500.00 72,770.98
NIKOL
05/11/26 UPI-VORA SEFALI ASHOKBHA-************99- 0000630975578760 05/11/26 27,300.00 100,070.98
1@OKAXIS-SBIN0060434-630975578760-UPI
05/11/26 UPI-UTSAV KANUBHAI HIRPA-***********A3-6 0000630952102615 05/11/26 100.00 100,170.98
@OKICICI-IDFB0040101-630952102615-UPI
05/11/26 EHDF8D321R7C18/HDFC LTD 0002607730900171 05/11/26 100,104.00 66.98
06/11/26 UPI-BROKENTUSK 0000631091823782 06/11/26 0.01 66.99
TECHNOLOG-***************
STATEMENT SUMMARY :-
Opening Balance Dr Count Cr Count Debits Credits Closing Bal
19.98 3 7 207,851.00 207,898.01 66.99
HDFC BANK LIMITED
-- PAGE BREAK --
Page No .: 2
THE EDGE, 11-16, GROUND FLOOR
MR TEST USER
this statement.
`;

describe('parseHdfc', () => {
  it('detects HDFC from statement text', () => {
    expect(detectBank(SAMPLE).code).toBe('hdfc');
  });

  it('reads header, salary credit, EMI debit, and wrapped UPI narration', () => {
    const r = parseHdfc(SAMPLE);
    expect(r.header.accountLast4).toBe('2541');
    expect(r.header.ifsc).toBe('HDFC0009394');
    expect(r.header.openingBalancePaise).toBe(1998);
    expect(r.header.closingBalancePaise).toBe(6699);
    expect(r.rows).toHaveLength(10);
    expect(r.rows[0].creditPaise).toBe(14229800);
    expect(r.rows[0].narration).toMatch(/SALARY/);
    expect(r.rows.some((x) => /ACH D- HDFC BANK LTD-482548842/.test(x.narration) && x.debitPaise === 5589700)).toBe(
      true,
    );
    expect(r.rows.some((x) => /CASH DEPOSIT/.test(x.narration) && x.creditPaise === 1750000)).toBe(true);
    expect(r.rows.some((x) => /EHDF8D321R7C18/.test(x.narration) && x.debitPaise === 10010400)).toBe(true);
    expect(r.rows.at(-1)?.creditPaise).toBe(1);
    expect(r.rows.at(-1)?.balanceAfterPaise).toBe(6699);
    expect(r.rows.at(-1)?.narration).toMatch(/BROKENTUSK/);
    expect(r.rows.at(-1)?.narration).not.toMatch(/THE EDGE|19\.98|TEST USER/);
  });
});
