import { parseIndusind } from './indusind.parser';
import { detectBank } from './detect-bank';
import { classifyRow } from '../classify';

const SAMPLE = `
IndusInd Bank Statement Of Account
Generation Date : 22-Nov-2026
HIRAPRA KANAIYALAL
Period : 01-05-2026 To 22-11-2026
Customer Id : 83041101
Account No : 156355806797
Account Type : SAVINGS ACCOUNT-NORMAL
Currency : INR
Available Balance : 1,506.82
Date Particulars Chq./Ref.No Withdrawal Deposit Balance
29-Jun-2026 Brought Forward 1,000.27
30-Jun-2026 156355806797:Int.Pd:0 S13682450 6.00 1,006.27
1-04-2026 to
30-06-2026
17-Aug-2026 UPI/128060301101/CR/ S67027738 15,000.00 16,006.27
KANA/UBIN/a676@okh
dfcbank/UPI
19-Aug-2026 UPI/659761920023/DR/ S96148198 675.00 15,331.27
Hirp/AUBL/irpara3-
3@oksbi
27-Aug-2026 UPI/623975295517/CR/ S28005762 2,490.00 17,821.27
KANA/GSCB/ra676-
1@okicici/UPI
31-Aug-2026 UPI/624395090213/DR/ S81583342 11,570.00 4,673.27
INDU/YESB/-
79028330@ptybl
28-Sep-2026 UPI/627121315339/CR/ S39340789 13,400.00 15,073.27
Hirp/AUBL/irpara3-
3@oksbi/UPI
30-Sep-2026 156355806797:Int.Pd:0 S84588343 25.00 15,098.27
1-07-2026 to
30-09-2026
The limits and effective available balance as on generated date 22-Nov-2026 20:48 Page : 1 / 2
Registered Office : INDUSIND BANK LTD, 2401, General Thimmayya Road (Cantonment), Maharashtra Pune-411001.

-- PAGE BREAK --

IndusInd Bank Statement Of Account
HIRAPRA KANAIYALAL Account No : 156355806797
07-Oct-2026 UPI/664646400534/DR/ S2167698 7,400.00 7,698.27
UTSA/HDFC/para3-
4@okicici
27-Oct-2026 UPI/111013845579/DR/ S32725414 13,428.00 1,270.27
Jio /ICIC/.bti@validicici
29-Oct-2026 N/AXNH263020091915 S70778556 16,236.55 17,506.82
/UTIB0000052/GR0WW
INVEST TECH P
03-Nov-2026 UPI/630712515148/DR/ S64250728 16,000.00 1,506.82
UTSA/HDFC/para3-
4@okicici
03-Nov-2026 1,506.82
The limits and effective available balance as on generated date 22-Nov-2026 20:48 Page : 2 / 2
reachus@indusind.com
`;

describe('parseIndusind', () => {
  it('detects IndusInd from statement text', () => {
    expect(detectBank(SAMPLE).code).toBe('indusind');
  });

  it('reads header, skips brought-forward, and splits CR/DR plus Groww credit', () => {
    const r = parseIndusind(SAMPLE);
    expect(r.header.accountLast4).toBe('6797');
    expect(r.header.openingBalancePaise).toBe(100027);
    expect(r.header.closingBalancePaise).toBe(150682);
    expect(r.rows).toHaveLength(11);
    expect(r.rows[0].creditPaise).toBe(600);
    expect(r.rows[0].narration).toMatch(/Int\.Pd/);
    expect(r.rows.some((x) => x.creditPaise === 1500000 && /UPI\/128060301101\/CR/.test(x.narration))).toBe(
      true,
    );
    expect(r.rows.some((x) => x.debitPaise === 1157000)).toBe(true);
    expect(r.rows.some((x) => /GR0WW/i.test(x.narration) && x.creditPaise === 1623655)).toBe(true);
    expect(r.rows.at(-1)?.debitPaise).toBe(1600000);
    expect(r.rows.at(-1)?.balanceAfterPaise).toBe(150682);
    expect(r.rows.some((x) => /Brought Forward|1,506\.82$/.test(x.narration))).toBe(false);
    expect(r.rows[1].upiRef).toBe('128060301101');
  });

  it('classifies interest and Groww OCR spelling', () => {
    const r = parseIndusind(SAMPLE);
    const interest = classifyRow(r.rows[0], [], []);
    expect(interest.type).toBe('interest');
    const groww = classifyRow(r.rows.find((x) => /GR0WW/i.test(x.narration))!, [], []);
    expect(groww.type).toBe('investment');
    expect(groww.merchant).toBe('Groww');
  });
});
