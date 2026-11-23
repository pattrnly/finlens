import { detectBank } from './detect-bank';

describe('detectBank', () => {
  it('keeps SBI even when a debit names HDFC BANK LTD', () => {
    const text = `
STATEMENT OF ACCOUNT
State Bank of India
Account Number : 39843639256
IFSC Code : SBIN0017900
Branch Email ID : sbi.17900@sbi.co.in
Statement From : 01-06-2026 to 23-11-2026
09/07/2026 09/07/2026 3 HDFC LTD HDFC BANK LT 461957 2,25,317.00 - 40,411.86
`;
    expect(detectBank(text).code).toBe('sbi');
  });

  it('still detects HDFC from a real HDFC letterhead', () => {
    const text = `
Page No .: 1
Account Branch : NIKOL
Address : HDFC BANK LTD,
Cust ID : 123456789
Account No : 50100431292541
RTGS/NEFT IFSC: HDFC0009394 MICR : 380240094
Withdrawal Amt. Deposit Amt. Closing Balance
`;
    expect(detectBank(text).code).toBe('hdfc');
  });
});
