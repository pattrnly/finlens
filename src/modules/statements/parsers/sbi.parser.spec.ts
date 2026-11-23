import { isoDate } from '../../../common/dates';
import { reconcile } from '../classify';
import { detectBank } from './detect-bank';
import { parseSbi } from './sbi.parser';

const SAMPLE = `
Welcome:
As on 23-11-2026
Ms. TEST USER
Account Summary
STATEMENT OF ACCOUNT
State Bank of India
test.user@example.com
Branch Code : 17900
Branch Name : NIKOL CHAR RASTA
Date of Statement : 23-11-2026
Branch Email ID : sbi.17900@sbi.co.in
: 1,05,023.67CR Branch Phone : 0000000000
Clear Balance
Uncleared Amount : 0.00 CIF Number : 00000000000
Account Number : 39843639256
+MOD Bal : 0.00
Product : SB CSP DMND
Lien : 0.0
IFSC Code : SBIN0017900
Limit : 0.00
Currency : INR
Account Status : OPEN
Statement From : 01-11-2026 to 23-11-2026
Balance
DEP TFR
01/11/2026 01/11/2026 NEFT*SURY0BK0000*SURYN2630 - - 21,522.00 1,30,170.17
5556954*TEST USER
0099509044300 AT 17900 NIKOL
CHAR RASTA
WDL TFR
01/11/2026 01/11/2026 UPI/DR/132192247808/Suryoday/ - 22,500.00 - 1,07,670.17
YESB/suryodaysf/UPI
0097696162090 AT 17900 NIKOL
CHAR RASTA
DEP TFR
02/11/2026 02/11/2026 NEFT*ICIC0099999*IN226306125 - - 107.00 1,07,777.17
59232*IIFL FINANCE LT
0099509044300 AT 17900 NIKOL
CHAR RASTA
Page no. 1

-- PAGE BREAK --

Balance
DEP TFR
02/11/2026 02/11/2026 NEFT*RBIS0GOGJEP*RBISH00980 - - 41,100.00 1,48,877.17
257677*District Treasu
0099509044300 AT 17900 NIKOL
CHAR RASTA
DEBIT ACHDr
03/11/2026 03/11/2026 YESB00709000028661 GROWW - 1,000.00 - 1,47,877.17
INVEST T
DEBIT ACHDr
03/11/2026 03/11/2026 YESB00709000028661 GROWW - 1,000.00 - 1,46,877.17
INVEST T
DEP TFR
03/11/2026 03/11/2026 NEFT*PUNB0494800*PUNBZ2630 - - 852.00 1,47,729.17
7459853*CHAIRMAN ROGI K
0099509044300 AT 17900 NIKOL
CHAR RASTA
WDL TFR
03/11/2026 03/11/2026 UPI/DR/667338788885/SHIVALIK/ - 2,000.00 - 1,45,729.17
YESB/shivalik.u/Auto
0097691162095 AT 17900 NIKOL
CHAR RASTA
DEBIT ACHDr
05/11/2026 05/11/2026 YESB00709000028661 GROWW - 1,000.00 - 1,44,729.17
INVEST T
DEBIT ACHDr
05/11/2026 05/11/2026 YESB00709000028661 GROWW - 1,000.00 - 1,43,729.17
INVEST T
DEBIT ACHDr
05/11/2026 05/11/2026 YESB00709000028661 GROWW - 500.00 - 1,43,229.17
INVEST T
DEBIT ACHDr
05/11/2026 05/11/2026 YESB00709000028661 GROWW - 1,000.00 - 1,42,229.17
INVEST T
DEBIT ACHDr
05/11/2026 05/11/2026 YESB00709000028661 GROWW - 1,000.00 - 1,41,229.17
INVEST T
DEBIT ACHDr
05/11/2026 05/11/2026 YESB00709000028661 GROWW - 1,000.00 - 1,40,229.17
INVEST T
DEBIT ACHDr
05/11/2026 05/11/2026 YESB00709000028661 GROWW - 1,000.00 - 1,39,229.17
INVEST T
DEBIT ACHDr
05/11/2026 05/11/2026 YESB00709000028661 GROWW - 1,000.00 - 1,38,229.17
INVEST T
WDL TFR
05/11/2026 05/11/2026 UPI/DR/630975578760/UTSAV - 27,300.00 - 1,10,929.17
KA/HDFC/utsavhirpa/UPI
0097693162093 AT 17900 NIKOL
CHAR RASTA
DEBIT ACHDr
06/11/2026 06/11/2026 YESB00709000028661 GROWW - 1,000.00 - 1,09,929.17
INVEST T
DEP TFR
07/11/2026 07/11/2026 UPI/CR/667777936784/UTSAV - - 50.00 1,09,979.17
KA/PPIW/7567368068/UPI
0097737162096 AT 17900 NIKOL
CHAR RASTA
DEP TFR
09/11/2026 09/11/2026 NEFT*ICIC0099999*IN226313238 - - 80.26 1,10,059.43
08324*SHARE INDIA SEC
0099509044300 AT 17900 NIKOL
CHAR RASTA
Page no. 2

-- PAGE BREAK --

Balance
WDL TFR
14/11/2026 14/11/2026 UPI/DR/668415784628/THUMMAR - 4,784.00 - 1,05,275.43
/UBIN/7041150810/dudh
0097695162091 AT 17900 NIKOL
CHAR RASTA
DEP TFR
15/11/2026 15/11/2026 CMPIFT/1511260004358/VEN109 - - 234.17 1,05,509.60
77 0098435042668 AT 17900
NIKOL CHAR RASTA
WDL TFR
16/11/2026 16/11/2026 UPI/DR/142909416711/Zepto - 74.00 - 1,05,435.60
Ma/YESB/zeptomarke/In A
0097690162095 AT 17900 NIKOL
CHAR RASTA
DEP TFR
16/11/2026 16/11/2026 NEFT*IDFB0040101*IDFB6320M8 - - 74.70 1,05,510.30
245265*UGRO CAPITAL LI
0099509044300 AT 17900 NIKOL
CHAR RASTA
WDL TFR
19/11/2026 19/11/2026 UPI/DR/632381191549/Flipkart/YE - 278.00 - 1,05,232.30
SB/flipkart.h/UPIP
0097693162093 AT 17900 NIKOL
CHAR RASTA
DEP TFR
19/11/2026 19/11/2026 NEFT*ICIC0099999*IN226323326 - - 1.00 1,05,233.30
94849*IIFL SAMASTA FI
0099509044300 AT 17900 NIKOL
CHAR RASTA
WDL TFR
20/11/2026 20/11/2026 UPI/DR/669023686385/Bhakti - 320.00 - 1,04,913.30
P/YESB/paytmqr65p/UPI
0097694162092 AT 17900 NIKOL
CHAR RASTA
WDL TFR
21/11/2026 21/11/2026 UPI/DR/669146959208/Narayan - 50.00 - 1,04,863.30
/SBIN/6378252711/UPI
0097695162091 AT 17900 NIKOL
CHAR RASTA
DEP TFR
23/11/2026 23/11/2026 NEFT*ICIC0099999*IN226327344 - - 160.37 1,05,023.67
18671*IIFL SAMASTA FI
0099509044300 AT 17900 NIKOL
CHAR RASTA
Statement Summary : 01-11-2026 To 23-11-2026
Brought Forward ( ) Dr Count Cr Count Total Debits ( ) Total Credits ( ) Closing Balance ( )
1,08,648.17CR 19 10 67,806.00 64,181.50 1,05,023.67CR
Please do not share your ATM, Debit/Credit Card number, PIN (Personal Identification number ), OTP (One-Time Password), Username or Password with
anyone via email, SMS, phone call, or any other medium. Bank never asks for such information.
If your account is operated by a Power of Attorney holder, please review the transactions with extra care.
This is a computer generated statement and does not require a signature.
Page no. 3
`;

describe('parseSbi', () => {
  it('detects SBI from Yono statement text', () => {
    expect(detectBank(SAMPLE).code).toBe('sbi');
  });

  it('reads header, wrapped NEFT/UPI/ACH rows, and reconciles the statement', () => {
    const r = parseSbi(SAMPLE);
    expect(r.method).toBe('sbi_builtin');
    expect(r.header.accountLast4).toBe('9256');
    expect(r.header.ifsc).toBe('SBIN0017900');
    expect(isoDate(r.header.periodFrom!)).toBe('2026-11-01');
    expect(isoDate(r.header.periodTo!)).toBe('2026-11-23');
    expect(r.header.openingBalancePaise).toBe(10864817);
    expect(r.header.closingBalancePaise).toBe(10502367);
    expect(r.header.totalDebitPaise).toBe(6780600);
    expect(r.header.totalCreditPaise).toBe(6418150);
    expect(r.rows).toHaveLength(29);
    expect(r.rows.filter((x) => x.debitPaise > 0)).toHaveLength(19);
    expect(r.rows.filter((x) => x.creditPaise > 0)).toHaveLength(10);

    expect(r.rows[0].creditPaise).toBe(2152200);
    expect(r.rows[0].debitPaise).toBe(0);
    expect(r.rows[0].balanceAfterPaise).toBe(13017017);
    expect(r.rows[0].narration).toMatch(/DEP TFR/);
    expect(r.rows[0].narration).toMatch(/NEFT\*SURY0BK0000/);
    expect(r.rows[0].narration).toMatch(/TEST USER/);
    expect(r.rows[0].narration).not.toMatch(/Please do not share|computer generated|Page no/);

    const upiOut = r.rows.find((x) => x.upiRef === '132192247808');
    expect(upiOut?.debitPaise).toBe(2250000);
    expect(upiOut?.narration).toMatch(/Suryoday/);
    expect(upiOut?.narration).toMatch(/suryodaysf/);

    expect(r.rows.some((x) => /GROWW/.test(x.narration) && /INVEST T/.test(x.narration) && x.debitPaise === 100000)).toBe(
      true,
    );
    expect(r.rows.filter((x) => /GROWW/.test(x.narration))).toHaveLength(11);

    const upiIn = r.rows.find((x) => x.upiRef === '667777936784');
    expect(upiIn?.creditPaise).toBe(5000);
    expect(upiIn?.narration).toMatch(/UPI\/CR/);

    const wrapped = r.rows.find((x) => /CMPIFT/.test(x.narration));
    expect(wrapped?.creditPaise).toBe(23417);
    expect(wrapped?.narration).toMatch(/VEN109/);
    expect(wrapped?.narration).toMatch(/77 /);

    expect(r.rows.at(-1)?.creditPaise).toBe(16037);
    expect(r.rows.at(-1)?.balanceAfterPaise).toBe(10502367);
    expect(r.rows.at(-1)?.narration).toMatch(/IIFL SAMASTA/);

    const recon = reconcile(r.header.openingBalancePaise, r.rows, r.header.closingBalancePaise);
    expect(recon.matched).toBe(true);
    expect(recon.delta).toBe(0);
    expect(r.rows.reduce((s, x) => s + x.debitPaise, 0)).toBe(r.header.totalDebitPaise);
    expect(r.rows.reduce((s, x) => s + x.creditPaise, 0)).toBe(r.header.totalCreditPaise);
  });
});
