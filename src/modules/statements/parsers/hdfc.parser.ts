import { parseIndianAmount } from '../../../common/money';
import { extractUpiRrn } from '../../../common/fingerprint';
import { parseBankDate } from '../../../common/dates';
import type { ExtractedHeader, ExtractedRow, ParseResult } from './types';

const ROW =
  /^(\d{2}\/\d{2}\/\d{2})\s+(.+?)\s+(\d{6,18})\s+(\d{2}\/\d{2}\/\d{2})\s+(.+)$/;
const AMOUNT = /[\d,]+\.\d{2}/g;
const END_TXNS =
  /STATEMENT SUMMARY|Page No|-- PAGE BREAK --|Generated On|HDFC BANK LIMITED|This is a computer generated/i;
const SKIP =
  /Page No|Account Branch|^Address\b|^City\b|^State\b|Phone no|OD Limit|^Currency\b|^Email\b|Cust ID|Account No|A\/C Open Date|JOINT HOLDERS|Account Status|RTGS\/NEFT|MICR :|Branch Code|Nomination|Account Type|^From :|Date Narration|STATEMENT SUMMARY|Opening Balance Dr Count|^[\d,.]+\s+\d+\s+\d+\s+[\d,.]+\s+[\d,.]+\s+[\d,.]+$|Generated On|HDFC BANK LIMITED|Closing balance includes|Contents of this statement|Registered Office|GSTN|GSTIN|This is a computer generated|-- PAGE BREAK --|^this statement\.?$|not require signature|THE EDGE|OPP MALABAR|^MR |PRIMARY HEALTH/i;

export function parseHdfc(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = parseHeader(lines);
  const rows: ExtractedRow[] = [];
  let current: { txnDate: string; valueDate: string; ref: string; parts: string[]; amounts: string } | null =
    null;
  let prevBalance = header.openingBalancePaise;

  const flush = () => {
    if (!current) return;
    const nums = current.amounts.match(AMOUNT) ?? [];
    const paise = nums.map(parseIndianAmount);
    if (paise.length < 2) {
      current = null;
      return;
    }
    let debit = 0;
    let credit = 0;
    let balance = paise[paise.length - 1];
    if (paise.length >= 3) {
      debit = paise[0];
      credit = paise[1];
    } else {
      const printed = paise[0];
      const delta = balance - prevBalance;
      if (delta > 0) credit = delta || printed;
      else if (delta < 0) debit = Math.abs(delta) || printed;
      else if (printed) debit = printed;
    }
    const narration = current.parts.join(' ').replace(/\s+/g, ' ').trim();
    const date = parseBankDate(current.txnDate);
    if (date && (debit || credit)) {
      rows.push({
        date,
        valueDate: parseBankDate(current.valueDate) ?? date,
        narration,
        debitPaise: debit,
        creditPaise: credit,
        balanceAfterPaise: balance,
        upiRef: extractUpiRrn(narration) ?? (current.ref.length >= 12 ? current.ref.replace(/^0+/, '') : undefined),
      });
      prevBalance = balance;
    }
    current = null;
  };

  for (const line of lines) {
    const dm = line.match(ROW);
    if (dm) {
      flush();
      current = { txnDate: dm[1], parts: [dm[2]], ref: dm[3], valueDate: dm[4], amounts: dm[5] };
      continue;
    }
    if (END_TXNS.test(line) || SKIP.test(line)) {
      if (END_TXNS.test(line)) flush();
      continue;
    }
    if (current) current.parts.push(line);
  }
  flush();

  return { header, rows, method: 'hdfc_builtin' };
}

function parseHeader(lines: string[]): ExtractedHeader {
  const blob = lines.join('\n');
  const acct = blob.match(/Account No\s*:\s*(\d+)/i);
  const ifsc = blob.match(/IFSC:?\s*(HDFC\d{4,})/i);
  const period = blob.match(/From\s*:\s*(\d{2}\/\d{2}\/\d{4})\s+To\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
  let opening = 0;
  let closing = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!/Opening Balance\s+Dr Count/i.test(lines[i])) continue;
    const nums = lines[i + 1]?.match(AMOUNT) ?? [];
    if (nums.length >= 6) {
      opening = parseIndianAmount(nums[0]);
      totalDebit = parseIndianAmount(nums[3]);
      totalCredit = parseIndianAmount(nums[4]);
      closing = parseIndianAmount(nums[5]);
    } else if (nums.length >= 2) {
      opening = parseIndianAmount(nums[0]);
      closing = parseIndianAmount(nums[nums.length - 1]);
    }
    break;
  }
  return {
    bankCode: 'hdfc',
    bankName: 'HDFC Bank',
    accountLast4: acct?.[1]?.slice(-4),
    ifsc: ifsc?.[1],
    periodFrom: period?.[1] ? parseBankDate(period[1]) ?? undefined : undefined,
    periodTo: period?.[2] ? parseBankDate(period[2]) ?? undefined : undefined,
    openingBalancePaise: opening,
    closingBalancePaise: closing,
    totalDebitPaise: totalDebit,
    totalCreditPaise: totalCredit,
  };
}
