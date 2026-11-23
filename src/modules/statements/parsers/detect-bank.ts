export type BankCode =
  | 'idfc_first'
  | 'au_bank'
  | 'hdfc'
  | 'indusind'
  | 'icici'
  | 'sbi'
  | 'axis'
  | 'kotak'
  | 'unknown';

export function detectBank(text: string): { code: BankCode; name: string } {
  const t = text.replace(/\s+/g, ' ');
  const head = t.slice(0, 3500);

  if (
    /STATE BANK OF INDIA/i.test(head) ||
    accountIfsc(text, 'SBIN') ||
    /@sbi\.co\.in/i.test(head)
  ) {
    return { code: 'sbi', name: 'State Bank of India' };
  }
  if (
    /IndusInd Bank/i.test(head) ||
    /reachus@indusind/i.test(t) ||
    /www\.indusind\.com/i.test(t) ||
    accountIfsc(text, 'INDB')
  ) {
    return { code: 'indusind', name: 'IndusInd Bank' };
  }
  if (/IDFC\s*FIRST/i.test(head) || /idfcfirstbank/i.test(t) || accountIfsc(text, 'IDFB')) {
    return { code: 'idfc_first', name: 'IDFC First Bank' };
  }
  if (
    /AU Small Finance/i.test(head) ||
    /au\.bank\.in/i.test(t) ||
    /customercare@aubank/i.test(t) ||
    accountIfsc(text, 'AUBL')
  ) {
    return { code: 'au_bank', name: 'AU Small Finance Bank' };
  }
  if (
    /HDFC BANK LIMITED/i.test(text) ||
    /Withdrawal Amt\.\s+Deposit Amt\.\s+Closing Balance/i.test(text) ||
    /RTGS\/NEFT IFSC:?\s*HDFC\d/i.test(text) ||
    (/\bHDFC\s+BANK\b/i.test(head) && /Cust ID/i.test(head))
  ) {
    return { code: 'hdfc', name: 'HDFC Bank' };
  }
  if (/ICICI\s*BANK/i.test(head) || accountIfsc(text, 'ICIC')) {
    return { code: 'icici', name: 'ICICI Bank' };
  }
  if (/AXIS\s*BANK/i.test(head) || accountIfsc(text, 'UTIB')) {
    return { code: 'axis', name: 'Axis Bank' };
  }
  if (/\bKOTAK\b/i.test(head) || accountIfsc(text, 'KKBK')) {
    return { code: 'kotak', name: 'Kotak Mahindra Bank' };
  }
  return { code: 'unknown', name: 'Unknown bank' };
}

function accountIfsc(text: string, code: string) {
  return new RegExp(`IFSC(?:\\s*Code)?\\s*:?\\s*${code}\\d{4,}`, 'i').test(text);
}
