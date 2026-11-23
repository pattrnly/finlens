import { isoDate } from './dates';
import { extractUpiRrn, normalizeNarration } from './fingerprint';

const CREDIT_TYPES = new Set(['income', 'refund', 'reversal', 'interest']);
const DEBIT_TYPES = new Set(['expense', 'emi', 'investment', 'part_payment']);
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export type LedgerIdentity = {
  id?: string;
  fingerprint?: string;
  date: Date | string;
  amountPaise: number;
  isCredit?: boolean;
  narration?: string;
  upiRef?: string;
  balanceAfterPaise?: number;
};

export function identityFromStatementRow(row: {
  _id?: unknown;
  fingerprint?: string;
  date: Date | string;
  debitPaise?: number;
  creditPaise?: number;
  narration?: string;
  upiRef?: string;
  balanceAfterPaise?: number;
}): LedgerIdentity {
  const isCredit = (row.creditPaise ?? 0) > 0;
  return {
    id: row._id != null ? String(row._id) : undefined,
    fingerprint: row.fingerprint,
    date: row.date,
    amountPaise: isCredit ? (row.creditPaise ?? 0) : (row.debitPaise ?? 0),
    isCredit,
    narration: row.narration,
    upiRef: row.upiRef,
    balanceAfterPaise: row.balanceAfterPaise,
  };
}

export function identityFromTransaction(tx: {
  _id?: unknown;
  id?: string;
  fingerprint?: string;
  date: Date | string;
  amountPaise: number;
  isCredit?: boolean;
  type?: string;
  narration?: string;
  upiRef?: string;
  balanceAfterPaise?: number;
}): LedgerIdentity {
  let isCredit = tx.isCredit;
  if (isCredit === undefined && tx.type) {
    if (CREDIT_TYPES.has(tx.type)) isCredit = true;
    else if (DEBIT_TYPES.has(tx.type)) isCredit = false;
  }
  return {
    id: tx._id != null ? String(tx._id) : tx.id,
    fingerprint: tx.fingerprint,
    date: tx.date,
    amountPaise: tx.amountPaise,
    isCredit,
    narration: tx.narration,
    upiRef: tx.upiRef,
    balanceAfterPaise: tx.balanceAfterPaise,
  };
}

export function collectPaymentRefs(narration?: string, upiRef?: string): Set<string> {
  const refs = new Set<string>();
  addRef(refs, upiRef);
  addRef(refs, extractUpiRrn(narration ?? ''));
  const n = narration ?? '';
  for (const m of n.matchAll(/UPI[\/\s-]*(?:DR|CR|REF)?[\/\s-]*(\d{10,18})/gi)) {
    addRef(refs, m[1]);
  }
  for (const m of n.matchAll(
    /\b(?:IMPS|NEFT|RTGS|NACH)[\/\s:_-]*([A-Z]{0,6}\d[A-Z0-9]{7,21})/gi,
  )) {
    addRef(refs, m[1]);
  }
  for (const m of n.matchAll(/\bUTR[:\/\s-]*([A-Z0-9]{12,22})/gi)) {
    addRef(refs, m[1]);
  }
  for (const m of n.matchAll(/\b(?:CHQ|CHEQUE|CLG)[\/\s:_-]*(\d{5,10})\b/gi)) {
    addRef(refs, `CHQ${m[1]}`);
  }
  return refs;
}

export function narrationsLikelySame(a?: string, b?: string): boolean {
  const na = normalizeNarration(a ?? '');
  const nb = normalizeNarration(b ?? '');
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (longer.includes(shorter) && shorter.length >= 16) return true;
  const lcp = longestCommonPrefix(na, nb);
  if (lcp >= 24) return true;
  if (lcp / Math.max(na.length, nb.length) >= 0.78) return true;
  return diceCoefficient(na, nb) >= 0.82;
}

export function isSameLedgerEntry(a: LedgerIdentity, b: LedgerIdentity): boolean {
  if (a.fingerprint && b.fingerprint && a.fingerprint === b.fingerprint) return true;
  if ((a.amountPaise ?? 0) !== (b.amountPaise ?? 0) || !a.amountPaise) return false;
  if (isoDate(asDate(a.date)) !== isoDate(asDate(b.date))) return false;
  if (a.isCredit !== undefined && b.isCredit !== undefined && a.isCredit !== b.isCredit) {
    return false;
  }

  const refsA = collectPaymentRefs(a.narration, a.upiRef);
  const refsB = collectPaymentRefs(b.narration, b.upiRef);
  if (setsIntersect(refsA, refsB)) return true;
  if (refsA.size && refsB.size) return false;

  const bothBalances = a.balanceAfterPaise != null && b.balanceAfterPaise != null;
  if (bothBalances) return a.balanceAfterPaise === b.balanceAfterPaise;

  return narrationsLikelySame(a.narration, b.narration);
}

export function findDuplicateMatch(
  incoming: LedgerIdentity,
  existing: LedgerIdentity[],
  claimed: Set<string>,
): LedgerIdentity | undefined {
  return existing.find((tx) => {
    if (tx.id && claimed.has(tx.id)) return false;
    return isSameLedgerEntry(incoming, tx);
  });
}

function addRef(refs: Set<string>, raw?: string) {
  if (!raw) return;
  const v = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (v.length < 8 || IFSC.test(v)) return;
  refs.add(v);
}

function setsIntersect(a: Set<string>, b: Set<string>): boolean {
  for (const v of a) if (b.has(v)) return true;
  return false;
}

function longestCommonPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  return i;
}

function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const n = counts.get(g) ?? 0;
    if (n > 0) {
      overlap += 1;
      counts.set(g, n - 1);
    }
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
