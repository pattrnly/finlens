import { format, parse, endOfMonth } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export const IST = 'Asia/Kolkata';

const IDFC_DATE = 'dd-MMM-yyyy';
const AU_DATE = 'd MMM yyyy';

export function parseBankDate(raw: string): Date | null {
  const s = raw.trim();
  for (const fmt of [
    IDFC_DATE,
    'd-MMM-yyyy',
    AU_DATE,
    'dd MMM yyyy',
    'dd-MM-yyyy',
    'dd/MM/yy',
    'dd/MM/yyyy',
  ]) {
    const d = parse(s, fmt, new Date());
    const year = d.getFullYear();
    if (!Number.isNaN(d.getTime()) && year >= 1990 && year <= 2100) {
      return fromZonedTime(
        `${format(d, 'yyyy-MM-dd')} 12:00:00`,
        IST,
      );
    }
  }
  return null;
}

export function isoDate(d: Date): string {
  return format(toZonedTime(d, IST), 'yyyy-MM-dd');
}

export function statementMonthLabel(
  from?: Date | null,
  to?: Date | null,
  fallback?: Date | null,
): string | undefined {
  const start = validIst(from);
  const end = validIst(to);
  if (start && end) {
    const left = format(start, 'MMM yyyy');
    const right = format(end, 'MMM yyyy');
    return left === right ? format(start, 'MMMM yyyy') : `${left} – ${right}`;
  }
  const only = start ?? validIst(fallback);
  return only ? format(only, 'MMMM yyyy') : undefined;
}

function validIst(d?: Date | null) {
  if (!d) return undefined;
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return undefined;
  return toZonedTime(date, IST);
}

export function istNoon(iso: string): Date {
  return fromZonedTime(`${iso.slice(0, 10)} 12:00:00`, IST);
}

export function indianFy(d = new Date()): { from: Date; to: Date; label: string } {
  const z = toZonedTime(d, IST);
  const year = z.getMonth() + 1 >= 4 ? z.getFullYear() : z.getFullYear() - 1;
  const from = fromZonedTime(`${year}-04-01 00:00:00`, IST);
  const to = fromZonedTime(`${year + 1}-03-31 23:59:59`, IST);
  return { from, to, label: `FY ${year}-${String(year + 1).slice(2)}` };
}

export function monthRange(d = new Date()): { from: Date; to: Date } {
  const z = toZonedTime(d, IST);
  const y = z.getFullYear();
  const m = String(z.getMonth() + 1).padStart(2, '0');
  const last = endOfMonth(z).getDate();
  return {
    from: fromZonedTime(`${y}-${m}-01 00:00:00`, IST),
    to: fromZonedTime(`${y}-${m}-${String(last).padStart(2, '0')} 23:59:59.999`, IST),
  };
}

export function quarterRange(d = new Date()): { from: Date; to: Date } {
  const z = toZonedTime(d, IST);
  const q = Math.floor(z.getMonth() / 3);
  const startMonth = q * 3 + 1;
  const endMonth = startMonth + 2;
  const y = z.getFullYear();
  const start = fromZonedTime(`${y}-${String(startMonth).padStart(2, '0')}-01 00:00:00`, IST);
  const endZ = new Date(y, endMonth, 0);
  const last = endZ.getDate();
  const end = fromZonedTime(
    `${y}-${String(endMonth).padStart(2, '0')}-${String(last).padStart(2, '0')} 23:59:59.999`,
    IST,
  );
  return { from: start, to: end };
}

export function startOfIstDay(iso: string): Date {
  return fromZonedTime(`${iso.slice(0, 10)} 00:00:00`, IST);
}

export function endOfIstDay(iso: string): Date {
  return fromZonedTime(`${iso.slice(0, 10)} 23:59:59.999`, IST);
}
