import { parseIndianAmount } from '../../../common/money';
import { extractUpiRrn } from '../../../common/fingerprint';
import { parseBankDate } from '../../../common/dates';
import type { ExtractedHeader, ExtractedRow, ParseResult } from './types';

const DATE_LINE =
  /^(\d{2}[/-]\d{2}[/-]\d{4})\s+(\d{2}[/-]\d{2}[/-]\d{4})\s+(.*)$/;
const TYPE_LINE =
  /^(DEP|WDL|DEBIT|CREDIT|CASH|CHQ|BY TRANSFER|TO TRANSFER|ATM|POS|ECS|NACH|IMPS|INTEREST)\b/i;
const END_TXNS =
  /Statement Summary|Brought Forward|Please do not share|Power of Attorney|computer generated statement/i;
const SKIP =
  /Welcome:|^As on\b|Account Summary|STATEMENT OF ACCOUNT|State Bank of India|Branch Code|Branch Name|Date of Statement|Branch Email|Branch Phone|Clear Balance|Uncleared Amount|CIF Number|Account Number|\+MOD Bal|^Product\b|^Lien\b|IFSC Code|^Limit\b|^Currency\b|Monthly Avg Balance|Account Status|Interest Rate|CKYCR|Drawing Power|MICR Code|Nominee Name|Account open Date|Statement From|^Balance$|^XXXXX$|Page no\.|-- PAGE BREAK --/i;
const AMOUNT = /^[\d,]+\.\d{2}$/;

export function parseSbi(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = parseHeader(lines);
  const rows: ExtractedRow[] = [];
  let current: {
    txnDate: string;
    valueDate: string;
    type: string;
    parts: string[];
    debit: number;
    credit: number;
    balance: number;
  } | null = null;
  let pendingType = '';
  let prevBalance = header.openingBalancePaise;

  const flush = () => {
    if (!current) return;
    const narration = [current.type, ...current.parts]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const { debit, credit } = direction(
      current.debit,
      current.credit,
      current.balance,
      prevBalance,
    );
    const date = parseBankDate(current.txnDate);
    if (date && (debit || credit)) {
      rows.push({
        date,
        valueDate: parseBankDate(current.valueDate) ?? date,
        narration,
        debitPaise: debit,
        creditPaise: credit,
        balanceAfterPaise: current.balance,
        upiRef: extractUpiRrn(narration),
      });
      prevBalance = current.balance;
    }
    current = null;
  };

  for (const line of lines) {
    if (END_TXNS.test(line)) {
      flush();
      continue;
    }
    if (DATE_LINE.test(line)) {
      flush();
      const dm = line.match(DATE_LINE)!;
      const split = splitTrail(dm[3]);
      current = {
        txnDate: dm[1],
        valueDate: dm[2],
        type: pendingType,
        parts: split.narration ? [split.narration] : [],
        debit: split.debit,
        credit: split.credit,
        balance: split.balance,
      };
      pendingType = '';
      continue;
    }
    if (TYPE_LINE.test(line)) {
      flush();
      pendingType = line;
      continue;
    }
    if (SKIP.test(line)) continue;
    if (current) current.parts.push(line);
  }
  flush();

  if (!header.totalDebitPaise) {
    header.totalDebitPaise = rows.reduce((s, r) => s + r.debitPaise, 0);
  }
  if (!header.totalCreditPaise) {
    header.totalCreditPaise = rows.reduce((s, r) => s + r.creditPaise, 0);
  }
  if (!header.closingBalancePaise && rows.length) {
    header.closingBalancePaise = rows[rows.length - 1].balanceAfterPaise ?? 0;
  }
  if (!header.openingBalancePaise && rows[0]?.balanceAfterPaise != null) {
    header.openingBalancePaise =
      rows[0].balanceAfterPaise - rows[0].creditPaise + rows[0].debitPaise;
  }

  return { header, rows, method: 'sbi_builtin' };
}

function direction(printedDebit: number, printedCredit: number, balance: number, prev: number) {
  if (printedDebit && !printedCredit) return { debit: printedDebit, credit: 0 };
  if (printedCredit && !printedDebit) return { debit: 0, credit: printedCredit };
  const delta = balance - prev;
  if (delta > 0) return { debit: 0, credit: delta };
  if (delta < 0) return { debit: Math.abs(delta), credit: 0 };
  return { debit: printedDebit, credit: printedCredit };
}

function splitTrail(rest: string): {
  narration: string;
  debit: number;
  credit: number;
  balance: number;
} {
  const tokens = rest.trim().split(/\s+/).filter(Boolean);
  const isDash = (t: string) => t === '-';
  const isAmtOrDash = (t: string) => AMOUNT.test(t) || isDash(t);
  if (!tokens.length || !AMOUNT.test(tokens[tokens.length - 1])) {
    return { narration: rest.trim(), debit: 0, credit: 0, balance: 0 };
  }
  const balance = parseIndianAmount(tokens.pop() as string);
  let credit = 0;
  let debit = 0;
  if (tokens.length && isAmtOrDash(tokens[tokens.length - 1])) {
    const t = tokens.pop() as string;
    credit = isDash(t) ? 0 : parseIndianAmount(t);
  }
  if (tokens.length && isAmtOrDash(tokens[tokens.length - 1])) {
    const t = tokens.pop() as string;
    debit = isDash(t) ? 0 : parseIndianAmount(t);
  }
  if (tokens.length && (isDash(tokens[tokens.length - 1]) || /^\d{5,8}$/.test(tokens[tokens.length - 1]))) {
    tokens.pop();
  }
  return { narration: tokens.join(' '), debit, credit, balance };
}

function parseSignedAmount(raw: string | undefined): number {
  if (!raw) return 0;
  const neg = /DR\s*$/i.test(raw);
  const n = parseIndianAmount(raw.replace(/\s*(CR|DR)\s*$/i, ''));
  return neg ? -n : n;
}

function parseHeader(lines: string[]): ExtractedHeader {
  const blob = lines.join('\n');
  const acct = blob.match(/Account Number\s*:\s*(\d+)/i);
  const ifsc = blob.match(/IFSC(?:\s*Code)?\s*:?\s*(SBIN\d{4,})/i);
  const period =
    blob.match(/Statement From\s*:\s*(\d{2}[/-]\d{2}[/-]\d{4})\s+to\s+(\d{2}[/-]\d{2}[/-]\d{4})/i) ??
    blob.match(/Statement Summary\s*:\s*(\d{2}[/-]\d{2}[/-]\d{4})\s+To\s+(\d{2}[/-]\d{2}[/-]\d{4})/i);
  const summary = blob.match(
    /([\d,]+\.\d{2}\s*(?:CR|DR)?)\s+\d+\s+\d+\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2}\s*(?:CR|DR)?)/i,
  );
  const opening = summary ? parseSignedAmount(summary[1]) : 0;
  const totalDebit = summary ? parseIndianAmount(summary[2]) : 0;
  const totalCredit = summary ? parseIndianAmount(summary[3]) : 0;
  let closing = summary ? parseSignedAmount(summary[4]) : 0;
  if (!closing) {
    const clear = blob.match(/([\d,]+\.\d{2}\s*(?:CR|DR)?)\s+Branch Phone[\s\S]{0,40}Clear Balance/i);
    closing = parseSignedAmount(clear?.[1]);
  }
  return {
    bankCode: 'sbi',
    bankName: 'State Bank of India',
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
