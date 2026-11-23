import { parseIndianAmount } from '../../../common/money';
import { extractUpiRrn } from '../../../common/fingerprint';
import { parseBankDate } from '../../../common/dates';
import type { ExtractedHeader, ExtractedRow, ParseResult } from './types';

const DATE_LINE = /^(\d{1,2}-[A-Za-z]{3}-\d{4})(?:\s+(.*))?$/;
const SKIP =
  /IndusInd Bank Statement|Generation Date|^Period\s*:|Customer Id|Account Type|^Currency\s*:|Available Balance|Date Particulars|^HIRAPRA\b|Account No\s*:|The limits and effective|For any queries|Phone Banking|reachus@indusind|www\.indusind|Service Tax Registration|Any discrepancies|computer generated|Registered Office|Corporate Identify|INDUSIND BANK LTD|-- PAGE BREAK --|^Page\s*:/i;

export function parseIndusind(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = parseHeader(lines);
  const rows: ExtractedRow[] = [];
  let current: { txnDate: string; parts: string[]; amounts: number[]; ref?: string } | null = null;
  let prevBalance = header.openingBalancePaise;

  const flush = () => {
    if (!current) return;
    const narration = current.parts.join(' ').replace(/\s+/g, ' ').trim();
    if (/brought\s+forward/i.test(narration)) {
      if (current.amounts.length) {
        prevBalance = current.amounts[current.amounts.length - 1];
        header.openingBalancePaise = prevBalance;
      }
      current = null;
      return;
    }
    if (!narration || current.amounts.length < 1) {
      current = null;
      return;
    }
    const balance =
      current.amounts.length >= 2 ? current.amounts[current.amounts.length - 1] : prevBalance;
    const printed = current.amounts[0];
    const { debit, credit } = direction(narration, printed, balance, prevBalance);
    const date = parseBankDate(current.txnDate);
    if (date && (debit || credit)) {
      rows.push({
        date,
        valueDate: date,
        narration,
        debitPaise: debit,
        creditPaise: credit,
        balanceAfterPaise: balance,
        upiRef: extractUpiRrn(narration) ?? current.ref,
      });
      prevBalance = balance;
    }
    current = null;
  };

  for (const line of lines) {
    const dm = line.match(DATE_LINE);
    if (dm) {
      flush();
      const split = splitTrail(dm[2] ?? '');
      current = {
        txnDate: dm[1],
        parts: split.narration ? [split.narration] : [],
        amounts: split.amounts,
        ref: split.ref,
      };
      continue;
    }
    if (SKIP.test(line)) {
      flush();
      continue;
    }
    if (current) current.parts.push(line);
  }
  flush();

  header.totalDebitPaise = rows.reduce((s, r) => s + r.debitPaise, 0);
  header.totalCreditPaise = rows.reduce((s, r) => s + r.creditPaise, 0);
  if (rows.length && !header.closingBalancePaise) {
    header.closingBalancePaise = rows[rows.length - 1].balanceAfterPaise ?? 0;
  }

  return { header, rows, method: 'indusind_builtin' };
}

function direction(narration: string, printed: number, balance: number, prev: number) {
  if (/\/CR\//i.test(narration) || /:Int\.Pd/i.test(narration)) {
    return { debit: 0, credit: printed };
  }
  if (/\/DR\//i.test(narration)) {
    return { debit: printed, credit: 0 };
  }
  const delta = balance - prev;
  if (delta > 0) return { debit: 0, credit: delta || printed };
  if (delta < 0) return { debit: Math.abs(delta) || printed, credit: 0 };
  return { debit: printed, credit: 0 };
}

function splitTrail(rest: string): { narration: string; amounts: number[]; ref?: string } {
  const tokens = rest.trim().split(/\s+/).filter(Boolean);
  const amounts: number[] = [];
  while (tokens.length) {
    const last = tokens[tokens.length - 1];
    if (/^[\d,]+\.\d{2}$/.test(last)) amounts.unshift(parseIndianAmount(tokens.pop() as string));
    else break;
  }
  let ref: string | undefined;
  if (tokens.length && /^[A-Z]\d{5,}$/i.test(tokens[tokens.length - 1])) {
    ref = tokens.pop();
  }
  return { narration: tokens.join(' '), amounts, ref };
}

function parseHeader(lines: string[]): ExtractedHeader {
  const blob = lines.join('\n');
  const acct = blob.match(/Account No\s*:\s*(\d+)/i);
  const period = blob.match(/Period\s*:\s*(\d{2}-\d{2}-\d{4})\s+To\s+(\d{2}-\d{2}-\d{4})/i);
  const opening = parseIndianAmount(blob.match(/Brought Forward\s+([\d,]+\.\d{2})/i)?.[1] ?? '0');
  const closing = parseIndianAmount(blob.match(/Available Balance\s*:\s*([\d,]+\.\d{2})/i)?.[1] ?? '0');
  return {
    bankCode: 'indusind',
    bankName: 'IndusInd Bank',
    accountLast4: acct?.[1]?.slice(-4),
    periodFrom: period?.[1] ? parseBankDate(period[1]) ?? undefined : undefined,
    periodTo: period?.[2] ? parseBankDate(period[2]) ?? undefined : undefined,
    openingBalancePaise: opening,
    closingBalancePaise: closing,
    totalDebitPaise: 0,
    totalCreditPaise: 0,
  };
}
