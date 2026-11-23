import { parseIndianAmount } from '../../../common/money';
import { extractUpiRrn } from '../../../common/fingerprint';
import { parseBankDate } from '../../../common/dates';
import type { ExtractedHeader, ExtractedRow, ParseResult } from './types';

const DATE_LINE =
  /^(\d{2}-[A-Za-z]{3}-\d{4})\s+(\d{2}-[A-Za-z]{3}-\d{4})\s+(.*)$/;
const AMOUNT_LINE = /^(?:[\d,]+\.\d{2})(?:\s+[\d,]+\.\d{2})+$/;
const SKIP =
  /REGISTERED OFFICE|Page \d+ of|STATEMENT OF ACCOUNT|CUSTOMER ID|ACCOUNT NO|STATEMENT PERIOD|CUSTOMER NAME|COMMUNICATION|ADDRESS|EMAIL ID|PHONE NO|CKYC|NOMINATION|ACCOUNT BRANCH|BRANCH ADDRESS|IFSC|MICR|ACCOUNT OPENING|ACCOUNT STATUS|ACCOUNT TYPE|CURRENCY|Opening Balance Total|Transaction\s*$|Date Value Date|Particulars|Cheque|IMPORTANT MESSAGE|IMPORTANT SAFETY|CONTACT US|GRIEVANCE|COMMONLY USED|End of the statement|This is a system generated|Unless the constituent|-- PAGE BREAK --/i;

export function parseIdfcFirst(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = parseHeader(lines);
  const rows: ExtractedRow[] = [];
  let current: { txnDate: string; valueDate: string; parts: string[] } | null = null;
  let pendingAmounts: number[] | null = null;
  let prevBalance = header.openingBalancePaise;
  let started = false;

  const flush = () => {
    if (!current || !pendingAmounts || pendingAmounts.length < 2) {
      current = null;
      pendingAmounts = null;
      return;
    }
    const balance = pendingAmounts[pendingAmounts.length - 1];
    const printed = pendingAmounts[0];
    const delta = balance - prevBalance;
    let debit = 0;
    let credit = 0;
    if (delta < 0) debit = Math.abs(delta) || printed;
    else if (delta > 0) credit = delta || printed;
    else if (printed) debit = printed;
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
        upiRef: extractUpiRrn(narration),
      });
      prevBalance = balance;
    }
    current = null;
    pendingAmounts = null;
  };

  for (const line of lines) {
    if (SKIP.test(line) && !DATE_LINE.test(line)) continue;
    const dm = line.match(DATE_LINE);
    if (dm) {
      started = true;
      flush();
      const split = splitTrailingAmounts(dm[3]);
      current = { txnDate: dm[1], valueDate: dm[2], parts: [split.narration] };
      pendingAmounts = split.amounts.length >= 2 ? split.amounts : null;
      continue;
    }
    if (!started) continue;
    if (/^Opening Balance\b/i.test(line) && !DATE_LINE.test(line)) continue;
    if (AMOUNT_LINE.test(line) && current) {
      const amounts = line.split(/\s+/).map(parseIndianAmount);
      if (amounts.length >= 4) continue;
      if (amounts.length >= 2) pendingAmounts = amounts;
      continue;
    }
    if (current) current.parts.push(line);
  }
  flush();

  return { header, rows, method: 'idfc_first_builtin' };
}

function splitTrailingAmounts(rest: string): { narration: string; amounts: number[] } {
  const tokens = rest.trim().split(/\s+/).filter(Boolean);
  const amounts: number[] = [];
  while (tokens.length) {
    const last = tokens[tokens.length - 1];
    if (/^[\d,]+\.\d{2}$/.test(last)) {
      amounts.unshift(parseIndianAmount(tokens.pop() as string));
    } else {
      break;
    }
  }
  return { narration: tokens.join(' '), amounts };
}

function parseHeader(lines: string[]): ExtractedHeader {
  const blob = lines.join('\n');
  const acct = blob.match(/ACCOUNT NO\s*:\s*(\d+)/i);
  const ifsc = blob.match(/IFSC\s*:\s*([A-Z0-9]+)/i);
  const period = blob.match(
    /STATEMENT PERIOD\s*:\s*(\d{4}-\d{2}-\d{2})\s+TO\s+(\d{4}-\d{2}-\d{2})/i,
  );
  let opening = 0;
  let debit = 0;
  let credit = 0;
  let closing = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/Opening Balance Total Debit Total Credit Closing Balance/i.test(lines[i])) {
      const nums = (lines[i + 1] ?? '').split(/\s+/).map(parseIndianAmount);
      if (nums.length >= 4) {
        opening = nums[0];
        debit = nums[1];
        credit = nums[2];
        closing = nums[3];
      }
      break;
    }
  }
  return {
    bankCode: 'idfc_first',
    bankName: 'IDFC First Bank',
    accountLast4: acct?.[1]?.slice(-4),
    ifsc: ifsc?.[1],
    periodFrom: period?.[1] ? new Date(`${period[1]}T00:00:00+05:30`) : undefined,
    periodTo: period?.[2] ? new Date(`${period[2]}T23:59:59+05:30`) : undefined,
    openingBalancePaise: opening,
    closingBalancePaise: closing,
    totalDebitPaise: debit,
    totalCreditPaise: credit,
  };
}
