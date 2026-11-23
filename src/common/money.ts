/** Store money as integer paise. Never use JS floats as source of truth. */

const AMOUNT_RE = /₹?\s*(-?\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|-?\d+(?:\.\d{1,2})?)/;

export function parseIndianAmount(raw: string | undefined | null): number {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s || s === '-' || s === '—' || s.toLowerCase() === 'nil') return 0;
  const cleaned = s.replace(/[₹,\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function extractAmounts(line: string): number[] {
  const matches = line.match(new RegExp(AMOUNT_RE.source, 'g')) ?? [];
  return matches.map((m) => parseIndianAmount(m));
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function formatInr(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}₹${rupees.toLocaleString('en-IN')}.${frac}`;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}
