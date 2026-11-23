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
  if (
    /IndusInd/i.test(text) ||
    /reachus@indusind/i.test(t) ||
    /www\.indusind\.com/i.test(t) ||
    /IFSC\s*:?\s*INDB\d{4,}/i.test(text)
  ) {
    return { code: 'indusind', name: 'IndusInd Bank' };
  }
  if (/IDFC\s*FIRST/i.test(text) || /idfcfirstbank/i.test(t) || /IFSC\s*:?\s*IDFB\d{4,}/i.test(text)) {
    return { code: 'idfc_first', name: 'IDFC First Bank' };
  }
  if (
    /AU Small Finance/i.test(t) ||
    /au\.bank\.in/i.test(t) ||
    /customercare@aubank/i.test(t) ||
    /IFSC\s*:?\s*AUBL\d{4,}/i.test(text)
  ) {
    return { code: 'au_bank', name: 'AU Small Finance Bank' };
  }
  if (
    /\bHDFC\s+BANK\b/i.test(text) ||
    /RTGS\/NEFT IFSC:?\s*HDFC/i.test(text) ||
    /Withdrawal Amt\.\s+Deposit Amt\.\s+Closing Balance/i.test(text)
  ) {
    return { code: 'hdfc', name: 'HDFC Bank' };
  }
  if (/ICICI\s*BANK/i.test(text) || /IFSC\s*:?\s*ICIC\d{4,}/i.test(text)) {
    return { code: 'icici', name: 'ICICI Bank' };
  }
  if (
    /STATE BANK OF INDIA/i.test(text) ||
    /IFSC(?:\s*Code)?\s*:?\s*SBIN\d{4,}/i.test(text) ||
    /@sbi\.co\.in/i.test(t)
  ) {
    return { code: 'sbi', name: 'State Bank of India' };
  }
  if (/AXIS\s*BANK/i.test(text) || /IFSC\s*:?\s*UTIB\d{4,}/i.test(text)) {
    return { code: 'axis', name: 'Axis Bank' };
  }
  if (/\bKOTAK\b/i.test(text) || /IFSC\s*:?\s*KKBK\d{4,}/i.test(text)) {
    return { code: 'kotak', name: 'Kotak Mahindra Bank' };
  }
  return { code: 'unknown', name: 'Unknown bank' };
}
