import { parseIndianAmount } from '../../../common/money';
import { extractUpiRrn } from '../../../common/fingerprint';
import { parseBankDate } from '../../../common/dates';
import type { ExtractedHeader, ExtractedRow, ParseResult } from './types';

const DATE_LINE =
  /^(\d{1,2} [A-Za-z]{3} \d{4})\s+(\d{1,2} [A-Za-z]{3} \d{4})\s+(.*)$/;
const SKIP =
  /This is an auto generated|Please review|Call us at|Website|www\.au\.bank|Email|customercare|Write to us|Registered Office|Follow us|Facebook|ACCOUNT STATEMENT|Customer ID|Customer Type|Address|Statement Date|Account Type|Branch|Nominee|-- PAGE BREAK --/i;

type AmountParts = {
  ref?: string;
  debit: number;
  credit: number;
  balance: number;
};

export function parseAuBank(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = parseHeader(lines);
  const rows: ExtractedRow[] = [];
  let current: { txnDate: string; valueDate: string; parts: string[] } | null = null;
  let pending: AmountParts | null = null;

  const flush = () => {
    if (!current || !pending) {
      current = null;
      pending = null;
      return;
    }
    const narration = current.parts.join(' ').replace(/\s+/g, ' ').trim();
    const date = parseBankDate(current.txnDate);
    if (date && (pending.debit || pending.credit)) {
      rows.push({
        date,
        valueDate: parseBankDate(current.valueDate) ?? date,
        narration,
        debitPaise: pending.debit,
        creditPaise: pending.credit,
        balanceAfterPaise: pending.balance,
        upiRef: extractUpiRrn(narration) ?? pending.ref,
      });
    }
    current = null;
    pending = null;
  };

  for (const line of lines) {
    if (/^Total\b/i.test(line)) continue;
    if (SKIP.test(line) && !DATE_LINE.test(line)) continue;
    const dm = line.match(DATE_LINE);
    if (dm) {
      flush();
      const split = splitInlineAmounts(dm[3]);
      current = { txnDate: dm[1], valueDate: dm[2], parts: [split.narration] };
      pending = split.parsed;
      continue;
    }
    if (current) {
      const asLine = parseAmountLine(line);
      if (asLine) {
        pending = asLine;
        continue;
      }
      const split = splitInlineAmounts(line);
      if (split.parsed) {
        current.parts.push(split.narration);
        pending = split.parsed;
        continue;
      }
      current.parts.push(line);
    }
  }
  flush();

  rows.reverse();
  return { header, rows, method: 'au_bank_builtin' };
}

function splitInlineAmounts(rest: string): { narration: string; parsed: AmountParts | null } {
  const credit = rest.match(
    /^(.*?)\s+(?:(\d{6,})\s+)?-\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/,
  );
  if (credit) {
    return {
      narration: credit[1].trim(),
      parsed: {
        ref: credit[2],
        debit: 0,
        credit: parseIndianAmount(credit[3]),
        balance: parseIndianAmount(credit[4]),
      },
    };
  }
  const debit = rest.match(
    /^(.*?)\s+(?:(\d{6,})\s+)?([\d,]+\.\d{2})\s+-\s+([\d,]+\.\d{2})$/,
  );
  if (debit) {
    return {
      narration: debit[1].trim(),
      parsed: {
        ref: debit[2],
        debit: parseIndianAmount(debit[3]),
        credit: 0,
        balance: parseIndianAmount(debit[4]),
      },
    };
  }
  return { narration: rest, parsed: parseAmountLine(rest) };
}

function parseAmountLine(line: string): AmountParts | null {
  if (DATE_LINE.test(line)) return null;
  if (!/[\d,]+\.\d{2}/.test(line) && line !== '-') return null;
  if (/Account Name|Opening Balance|Closing Balance|Statement Period/i.test(line)) {
    return null;
  }
  const tokens = line.trim().split(/\s+/);
  let ref: string | undefined;
  const parts: Array<{ kind: 'dash' | 'money'; value?: number }> = [];
  for (const t of tokens) {
    if (t === '-') parts.push({ kind: 'dash' });
    else if (/^[\d,]+\.\d{2}$/.test(t)) parts.push({ kind: 'money', value: parseIndianAmount(t) });
    else if (/^\d{6,}$/.test(t)) ref = t;
    else return null;
  }
  const money = parts.filter((p) => p.kind === 'money');
  if (money.length < 2) return null;
  const dashIdx = parts.findIndex((p) => p.kind === 'dash');
  if (dashIdx === -1) return null;
  const before = parts.slice(0, dashIdx).filter((p) => p.kind === 'money');
  const after = parts.slice(dashIdx + 1).filter((p) => p.kind === 'money');
  if (before.length && after.length === 1) {
    return { ref, debit: before[0].value ?? 0, credit: 0, balance: after[0].value ?? 0 };
  }
  if (!before.length && after.length >= 2) {
    return {
      ref,
      debit: 0,
      credit: after[0].value ?? 0,
      balance: after[after.length - 1].value ?? 0,
    };
  }
  if (before.length && after.length >= 2) {
    return {
      ref,
      debit: before[0].value ?? 0,
      credit: after[0].value ?? 0,
      balance: after[after.length - 1].value ?? 0,
    };
  }
  return null;
}

function parseHeader(lines: string[]): ExtractedHeader {
  const blob = lines.join('\n');
  const last4 = blob.match(/Account Number\s*:\s*[X]*(\d{4})/i)?.[1];
  const ifsc = blob.match(/IFSC\s*:\s*([A-Z0-9]+)/i)?.[1];
  const opening = parseIndianAmount(
    blob.match(/Opening Balance[^\d-]*([\d,]+\.\d{2})/i)?.[1] ?? '0',
  );
  const closing = parseIndianAmount(
    blob.match(/Closing Balance[^\d-]*([\d,]+\.\d{2})/i)?.[1] ?? '0',
  );
  const period = blob.match(
    /Statement Period\s*:\s*(\d{1,2} [A-Za-z]{3} \d{4})\s+to\s+(\d{1,2} [A-Za-z]{3} \d{4})/i,
  );
  const totalLine = lines.find((l) => /^Total\b/i.test(l));
  const totals = totalLine?.match(/([\d,]+\.\d{2})/g)?.map(parseIndianAmount) ?? [];
  return {
    bankCode: 'au_bank',
    bankName: 'AU Small Finance Bank',
    accountLast4: last4,
    ifsc,
    periodFrom: period?.[1] ? parseBankDate(period[1]) ?? undefined : undefined,
    periodTo: period?.[2] ? parseBankDate(period[2]) ?? undefined : undefined,
    openingBalancePaise: opening,
    closingBalancePaise: closing,
    totalDebitPaise: totals[0] ?? 0,
    totalCreditPaise: totals[1] ?? 0,
  };
}
