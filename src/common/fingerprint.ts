import { createHash } from 'crypto';

export function fingerprint(parts: {
  userId: string;
  accountLast4: string;
  date: string;
  amountPaise: number;
  ref: string;
  balanceAfterPaise?: number;
}): string {
  const raw = [
    parts.userId,
    parts.accountLast4,
    parts.date,
    String(parts.amountPaise),
    normalizeNarration(parts.ref),
    ...(parts.balanceAfterPaise != null ? [String(parts.balanceAfterPaise)] : []),
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

export function normalizeNarration(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 80);
}

export function extractUpiRrn(narration: string): string | undefined {
  const classic = narration.match(/UPI\/(?:DR|CR|REF)\/(\d{10,})/i);
  if (classic) return classic[1];
  return narration.match(/UPI\/(\d{10,})\/(?:DR|CR)/i)?.[1];
}
